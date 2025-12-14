/**
 * Comprehensive ClickHouse Backfill Service
 * 
 * Syncs ALL historical health data from Supabase to ClickHouse for ML analysis.
 * This service ensures ClickHouse is the single source of truth for all baselines
 * and anomaly detection.
 * 
 * Data types synced:
 * - Weight & body composition (from daily_metrics)
 * - Sleep metrics (from sleep_nights)
 * - Activity metrics: steps, active energy, workouts (from daily_metrics)
 * - Heart metrics: HRV, RHR (from daily_metrics and sleep_nights)
 * - Body temperature deviation (from sleep_nights)
 * - Respiratory rate (from sleep_nights)
 * - SpO2/oxygen saturation (from sleep_nights)
 */

import { getClickHouseClient, isClickHouseEnabled } from './clickhouseService';
import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('ClickHouseBackfill');

interface BackfillResult {
  success: boolean;
  metrics: {
    weight: number;
    bodyComp: number;
    sleep: number;
    activity: number;
    heartMetrics: number;
    total: number;
  };
  error?: string;
}

interface BackfillStatus {
  clickhouseBackfillComplete: boolean;
  clickhouseBackfillDate: Date | null;
}

/**
 * Check if a user has already completed ClickHouse backfill
 */
export async function getClickHouseBackfillStatus(userId: string): Promise<BackfillStatus> {
  const healthId = await getHealthId(userId);
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('clickhouse_backfill_complete, clickhouse_backfill_date')
    .eq('health_id', healthId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[ClickHouseBackfill] Error fetching backfill status:', error);
  }

  return {
    clickhouseBackfillComplete: data?.clickhouse_backfill_complete === true,
    clickhouseBackfillDate: data?.clickhouse_backfill_date ? new Date(data.clickhouse_backfill_date) : null,
  };
}

/**
 * Mark ClickHouse backfill as complete for a user
 */
async function markBackfillComplete(userId: string, metrics: BackfillResult['metrics']): Promise<void> {
  const healthId = await getHealthId(userId);
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('profiles')
    .upsert({
      health_id: healthId,
      clickhouse_backfill_complete: true,
      clickhouse_backfill_date: new Date().toISOString(),
      clickhouse_backfill_metadata: {
        weight: metrics.weight,
        bodyComp: metrics.bodyComp,
        sleep: metrics.sleep,
        activity: metrics.activity,
        heartMetrics: metrics.heartMetrics,
        total: metrics.total,
        completedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id',
    });

  if (error) {
    logger.error('[ClickHouseBackfill] Error marking backfill complete:', error);
  } else {
    logger.info(`[ClickHouseBackfill] Marked backfill complete for user ${userId}, total: ${metrics.total} records`);
  }
}

/**
 * Run comprehensive backfill for a single user
 * Syncs all historical health data from Supabase to ClickHouse
 */
export async function runFullBackfill(
  userId: string,
  options: {
    daysBack?: number;
    forceRefresh?: boolean;
    timezone?: string;
  } = {}
): Promise<BackfillResult> {
  const { daysBack = 730, forceRefresh = false, timezone = 'Australia/Perth' } = options;

  if (!isClickHouseEnabled()) {
    return {
      success: false,
      metrics: { weight: 0, bodyComp: 0, sleep: 0, activity: 0, heartMetrics: 0, total: 0 },
      error: 'ClickHouse not enabled',
    };
  }

  // Check if already backfilled (unless force refresh)
  if (!forceRefresh) {
    const status = await getClickHouseBackfillStatus(userId);
    if (status.clickhouseBackfillComplete) {
      logger.info(`[ClickHouseBackfill] User ${userId} already backfilled on ${status.clickhouseBackfillDate}`);
      return {
        success: true,
        metrics: { weight: 0, bodyComp: 0, sleep: 0, activity: 0, heartMetrics: 0, total: 0 },
      };
    }
  }

  const healthId = await getHealthId(userId);
  const client = getClickHouseClient();
  if (!client) {
    return {
      success: false,
      metrics: { weight: 0, bodyComp: 0, sleep: 0, activity: 0, heartMetrics: 0, total: 0 },
      error: 'ClickHouse client not available',
    };
  }

  const supabase = getSupabaseClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const startDateStr = startDate.toISOString().split('T')[0];

  logger.info(`[ClickHouseBackfill] Starting full backfill for user ${userId} (${daysBack} days)`);

  const metrics = {
    weight: 0,
    bodyComp: 0,
    sleep: 0,
    activity: 0,
    heartMetrics: 0,
    total: 0,
  };

  try {
    // 1. Backfill from user_daily_metrics
    const dailyMetricsResult = await backfillDailyMetrics(client, supabase, healthId, userId, startDateStr, timezone);
    metrics.weight += dailyMetricsResult.weight;
    metrics.bodyComp += dailyMetricsResult.bodyComp;
    metrics.activity += dailyMetricsResult.activity;
    metrics.heartMetrics += dailyMetricsResult.heartMetrics;

    // 2. Backfill from sleep_nights
    const sleepResult = await backfillSleepNights(client, supabase, healthId, startDateStr, timezone);
    metrics.sleep += sleepResult.sleep;
    metrics.heartMetrics += sleepResult.heartMetrics;

    metrics.total = metrics.weight + metrics.bodyComp + metrics.sleep + metrics.activity + metrics.heartMetrics;

    // Mark backfill complete
    await markBackfillComplete(userId, metrics);

    logger.info(`[ClickHouseBackfill] Completed backfill for ${userId}: ${JSON.stringify(metrics)}`);

    return { success: true, metrics };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[ClickHouseBackfill] Failed for ${userId}:`, error);
    return {
      success: false,
      metrics,
      error: errorMsg,
    };
  }
}

/**
 * Backfill daily metrics (weight, body comp, activity, HRV, RHR)
 */
async function backfillDailyMetrics(
  client: any,
  supabase: any,
  healthId: string,
  userId: string,
  startDateStr: string,
  timezone: string
): Promise<{ weight: number; bodyComp: number; activity: number; heartMetrics: number }> {
  const result = { weight: 0, bodyComp: 0, activity: 0, heartMetrics: 0 };

  const { data: dailyMetrics, error } = await supabase
    .from('user_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .gte('local_date', startDateStr)
    .order('local_date', { ascending: true });

  if (error) {
    logger.error('[ClickHouseBackfill] Error fetching daily metrics:', error);
    return result;
  }

  if (!dailyMetrics || dailyMetrics.length === 0) {
    logger.debug(`[ClickHouseBackfill] No daily metrics found for ${healthId}`);
    return result;
  }

  logger.info(`[ClickHouseBackfill] Found ${dailyMetrics.length} daily metrics records for ${healthId}`);

  // Weight events
  const weightEvents: any[] = [];
  // Body comp events
  const bodyCompEvents: any[] = [];
  // Health metrics (for flo_health.health_metrics table)
  const healthMetrics: any[] = [];

  for (const metric of dailyMetrics) {
    const localDate = metric.local_date;
    const recordedAt = `${localDate}T12:00:00Z`;

    // Weight
    if (metric.weight_kg && metric.weight_kg >= 20 && metric.weight_kg <= 300) {
      weightEvents.push({
        user_id: userId,
        event_id: `backfill_weight_${healthId}_${localDate}`,
        timestamp_utc: recordedAt,
        user_timezone: timezone,
        local_date_key: localDate,
        weight_kg: metric.weight_kg,
        source_type: 'SUPABASE_BACKFILL',
        source_device_name: null,
        imported: 1,
        editable: 0,
      });
    }

    // Body composition
    if (metric.body_fat_percent || metric.lean_body_mass_kg) {
      bodyCompEvents.push({
        user_id: userId,
        event_id: `backfill_bodycomp_${healthId}_${localDate}`,
        timestamp_utc: recordedAt,
        user_timezone: timezone,
        local_date_key: localDate,
        body_fat_pct: metric.body_fat_percent || null,
        lean_mass_kg: metric.lean_body_mass_kg || null,
        source_type: 'SUPABASE_BACKFILL',
        source_device_name: null,
        estimated: 0,
        imported: 1,
        editable: 0,
      });
    }

    // Activity metrics -> health_metrics table
    if (metric.steps) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'steps',
        value: metric.steps,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    if (metric.active_energy_kcal) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'active_energy',
        value: metric.active_energy_kcal,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    if (metric.exercise_minutes) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'exercise_minutes',
        value: metric.exercise_minutes,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    if (metric.stand_hours) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'stand_hours',
        value: metric.stand_hours,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // HRV (if stored in daily metrics)
    if (metric.hrv_ms || metric.hrv) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'hrv_ms',
        value: metric.hrv_ms || metric.hrv,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // RHR (if stored in daily metrics)
    if (metric.resting_heart_rate_bpm || metric.rhr) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'resting_heart_rate_bpm',
        value: metric.resting_heart_rate_bpm || metric.rhr,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }
  }

  // Insert weight events
  if (weightEvents.length > 0) {
    try {
      await client.insert({
        table: 'flo_ml.raw_weight_events',
        values: weightEvents,
        format: 'JSONEachRow',
      });
      result.weight = weightEvents.length;
      logger.info(`[ClickHouseBackfill] Inserted ${weightEvents.length} weight events`);
    } catch (e) {
      logger.error('[ClickHouseBackfill] Weight insert error:', e);
    }
  }

  // Insert body comp events
  if (bodyCompEvents.length > 0) {
    try {
      await client.insert({
        table: 'flo_ml.raw_body_comp_events',
        values: bodyCompEvents,
        format: 'JSONEachRow',
      });
      result.bodyComp = bodyCompEvents.length;
      logger.info(`[ClickHouseBackfill] Inserted ${bodyCompEvents.length} body comp events`);
    } catch (e) {
      logger.error('[ClickHouseBackfill] Body comp insert error:', e);
    }
  }

  // Insert health metrics
  if (healthMetrics.length > 0) {
    try {
      await client.insert({
        table: 'flo_health.health_metrics',
        values: healthMetrics,
        format: 'JSONEachRow',
      });
      result.activity = healthMetrics.filter(m => ['steps', 'active_energy', 'exercise_minutes', 'stand_hours'].includes(m.metric_type)).length;
      result.heartMetrics = healthMetrics.filter(m => ['hrv_ms', 'resting_heart_rate_bpm'].includes(m.metric_type)).length;
      logger.info(`[ClickHouseBackfill] Inserted ${healthMetrics.length} health metrics`);
    } catch (e) {
      logger.error('[ClickHouseBackfill] Health metrics insert error:', e);
    }
  }

  return result;
}

/**
 * Backfill sleep nights (sleep duration, stages, HRV, RHR, temp, respiratory, SpO2)
 */
async function backfillSleepNights(
  client: any,
  supabase: any,
  healthId: string,
  startDateStr: string,
  timezone: string
): Promise<{ sleep: number; heartMetrics: number }> {
  const result = { sleep: 0, heartMetrics: 0 };

  const { data: sleepNights, error } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .gte('sleep_date', startDateStr)
    .order('sleep_date', { ascending: true });

  if (error) {
    logger.error('[ClickHouseBackfill] Error fetching sleep nights:', error);
    return result;
  }

  if (!sleepNights || sleepNights.length === 0) {
    logger.debug(`[ClickHouseBackfill] No sleep nights found for ${healthId}`);
    return result;
  }

  logger.info(`[ClickHouseBackfill] Found ${sleepNights.length} sleep nights for ${healthId}`);

  const healthMetrics: any[] = [];

  for (const sleep of sleepNights) {
    const localDate = sleep.sleep_date;
    const recordedAt = sleep.night_start || `${localDate}T00:00:00Z`;

    // Sleep duration
    if (sleep.total_sleep_min) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'sleep_duration_min',
        value: sleep.total_sleep_min,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // Deep sleep
    if (sleep.deep_sleep_min) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'deep_sleep_min',
        value: sleep.deep_sleep_min,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // REM sleep
    if (sleep.rem_sleep_min) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'rem_sleep_min',
        value: sleep.rem_sleep_min,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // Core/light sleep
    if (sleep.core_sleep_min) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'core_sleep_min',
        value: sleep.core_sleep_min,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // Sleep efficiency
    if (sleep.sleep_efficiency_pct) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'sleep_efficiency_pct',
        value: sleep.sleep_efficiency_pct,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // HRV during sleep
    if (sleep.hrv_ms || sleep.average_hrv) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'hrv_ms',
        value: sleep.hrv_ms || sleep.average_hrv,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
      result.heartMetrics++;
    }

    // RHR during sleep
    if (sleep.resting_heart_rate_bpm || sleep.lowest_heart_rate) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'resting_heart_rate_bpm',
        value: sleep.resting_heart_rate_bpm || sleep.lowest_heart_rate,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
      result.heartMetrics++;
    }

    // Wrist temperature deviation
    if (sleep.wrist_temperature_deviation !== null && sleep.wrist_temperature_deviation !== undefined) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'wrist_temperature_deviation',
        value: sleep.wrist_temperature_deviation,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // Respiratory rate
    if (sleep.respiratory_rate_bpm) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'respiratory_rate_bpm',
        value: sleep.respiratory_rate_bpm,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }

    // Oxygen saturation
    if (sleep.oxygen_saturation_pct) {
      healthMetrics.push({
        health_id: healthId,
        metric_type: 'oxygen_saturation_pct',
        value: sleep.oxygen_saturation_pct,
        recorded_at: recordedAt,
        local_date: localDate,
        source: 'supabase_backfill',
      });
    }
  }

  // Insert all sleep metrics
  if (healthMetrics.length > 0) {
    try {
      await client.insert({
        table: 'flo_health.health_metrics',
        values: healthMetrics,
        format: 'JSONEachRow',
      });
      result.sleep = healthMetrics.length - result.heartMetrics;
      logger.info(`[ClickHouseBackfill] Inserted ${healthMetrics.length} sleep-related metrics`);
    } catch (e) {
      logger.error('[ClickHouseBackfill] Sleep metrics insert error:', e);
    }
  }

  return result;
}

/**
 * Trigger backfill for a user if needed (call from weight API or ML features)
 * This is non-blocking - runs in background
 */
export function triggerBackfillIfNeeded(userId: string): void {
  // Run in background, don't await
  setImmediate(async () => {
    try {
      const status = await getClickHouseBackfillStatus(userId);
      if (!status.clickhouseBackfillComplete) {
        logger.info(`[ClickHouseBackfill] Auto-triggering backfill for user ${userId}`);
        await runFullBackfill(userId);
      }
    } catch (error) {
      logger.error(`[ClickHouseBackfill] Auto-trigger failed for ${userId}:`, error);
    }
  });
}
