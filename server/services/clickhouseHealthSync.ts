/**
 * ClickHouse Health Data Sync
 * 
 * Syncs health metrics from multiple sources to ClickHouse for ML analysis.
 * Ensures source field is properly populated for segregation.
 */

import { clickhouse } from './clickhouseService';
import type { DataSource } from '@shared/dataSource';
import type { FloSleepNight, OuraDailyStress, OuraDailyResilience, OuraDailySpO2 } from './ouraApiClient';

// Resilience level to numeric score mapping for ML analysis
const RESILIENCE_LEVEL_SCORES: Record<string, number> = {
  'limited': 1,
  'adequate': 2,
  'solid': 3,
  'strong': 4,
  'exceptional': 5,
};

// Stress day summary to numeric score mapping
const STRESS_SUMMARY_SCORES: Record<string, number> = {
  'stressful': 1,
  'normal': 2,
  'restored': 3,
};

interface HealthMetricRow {
  health_id: string;
  metric_type: string;
  value: number;
  recorded_at: string; // ISO timestamp
  local_date: string; // YYYY-MM-DD
  source: DataSource;
}

/**
 * Sync sleep metrics to ClickHouse
 */
export async function syncSleepMetricsToClickHouse(
  healthId: string,
  sleepNight: FloSleepNight,
  source: DataSource
): Promise<void> {
  if (!clickhouse.isEnabled()) {
    return;
  }
  
  const rows: HealthMetricRow[] = [];
  const recordedAt = sleepNight.nightStart?.toISOString() || new Date().toISOString();
  const localDate = sleepNight.sleepDate;
  
  // Add each metric if present
  if (sleepNight.totalSleepMin !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'sleep_duration_min',
      value: sleepNight.totalSleepMin,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.deepSleepMin !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'deep_sleep_min',
      value: sleepNight.deepSleepMin,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.remSleepMin !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'rem_sleep_min',
      value: sleepNight.remSleepMin,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.coreSleepMin !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'core_sleep_min',
      value: sleepNight.coreSleepMin,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.sleepEfficiencyPct !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'sleep_efficiency_pct',
      value: sleepNight.sleepEfficiencyPct,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.sleepLatencyMin !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'sleep_latency_min',
      value: sleepNight.sleepLatencyMin,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.hrvMs !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'hrv_ms',
      value: sleepNight.hrvMs,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.restingHrBpm !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'resting_heart_rate_bpm',
      value: sleepNight.restingHrBpm,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.respiratoryRate !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'respiratory_rate_bpm',
      value: sleepNight.respiratoryRate,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.numAwakenings !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'sleep_awakenings',
      value: sleepNight.numAwakenings,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.wasoMin !== null) {
    rows.push({
      health_id: healthId,
      metric_type: 'waso_min',
      value: sleepNight.wasoMin,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  // Skin temperature metrics (Oura-specific)
  if (sleepNight.skinTempDeviation !== null && sleepNight.skinTempDeviation !== undefined) {
    rows.push({
      health_id: healthId,
      metric_type: 'skin_temp_deviation_c',
      value: sleepNight.skinTempDeviation,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (sleepNight.skinTempTrendDeviation !== null && sleepNight.skinTempTrendDeviation !== undefined) {
    rows.push({
      health_id: healthId,
      metric_type: 'skin_temp_trend_deviation_c',
      value: sleepNight.skinTempTrendDeviation,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (rows.length > 0) {
    try {
      await clickhouse.insert('health_metrics', rows as unknown as Record<string, unknown>[]);
      console.log(`[ClickHouseHealthSync] Synced ${rows.length} metrics for ${source} sleep data`);
    } catch (error) {
      console.error('[ClickHouseHealthSync] Failed to sync to ClickHouse:', error);
    }
  }
}

/**
 * Sync a batch of generic health metrics to ClickHouse
 */
export async function syncHealthMetricsBatch(
  healthId: string,
  metrics: Array<{
    metricType: string;
    value: number;
    recordedAt: Date;
    localDate: string;
  }>,
  source: DataSource
): Promise<void> {
  if (!clickhouse.isEnabled() || metrics.length === 0) {
    return;
  }
  
  const rows: HealthMetricRow[] = metrics.map(m => ({
    health_id: healthId,
    metric_type: m.metricType,
    value: m.value,
    recorded_at: m.recordedAt.toISOString(),
    local_date: m.localDate,
    source,
  }));
  
  try {
    await clickhouse.insert('health_metrics', rows as unknown as Record<string, unknown>[]);
    console.log(`[ClickHouseHealthSync] Synced ${rows.length} metrics from ${source}`);
  } catch (error) {
    console.error('[ClickHouseHealthSync] Failed to sync batch:', error);
  }
}

/**
 * Query metrics by source for analysis
 */
export async function queryMetricsBySource(
  healthId: string,
  metricType: string,
  source: DataSource,
  daysBack: number = 30
): Promise<Array<{ value: number; recorded_at: string; local_date: string }>> {
  if (!clickhouse.isEnabled()) {
    return [];
  }
  
  try {
    // NOTE: Do not use FINAL - SharedMergeTree doesn't support it
    const results = await clickhouse.query<{ value: number; recorded_at: string; local_date: string }>(
      `SELECT value, recorded_at, local_date
       FROM flo_health.health_metrics
       WHERE health_id = {healthId:String}
         AND metric_type = {metricType:String}
         AND source = {source:String}
         AND local_date >= today() - {daysBack:UInt32}
       ORDER BY recorded_at DESC`,
      { healthId, metricType, source, daysBack }
    );
    return results;
  } catch (error) {
    console.error('[ClickHouseHealthSync] Failed to query metrics:', error);
    return [];
  }
}

/**
 * Get available sources for a metric
 */
export async function getAvailableSourcesForMetric(
  healthId: string,
  metricType: string,
  daysBack: number = 7
): Promise<DataSource[]> {
  if (!clickhouse.isEnabled()) {
    return [];
  }
  
  try {
    // NOTE: Do not use FINAL - SharedMergeTree doesn't support it
    const results = await clickhouse.query<{ source: string }>(
      `SELECT DISTINCT source
       FROM flo_health.health_metrics
       WHERE health_id = {healthId:String}
         AND metric_type = {metricType:String}
         AND local_date >= today() - {daysBack:UInt32}`,
      { healthId, metricType, daysBack }
    );
    return results.map(r => r.source as DataSource);
  } catch (error) {
    console.error('[ClickHouseHealthSync] Failed to get sources:', error);
    return [];
  }
}

// ============================================================================
// OURA EXTENDED METRICS SYNC
// ============================================================================

/**
 * Sync Oura daily stress metrics to ClickHouse
 * Converts stress levels and recovery time to numeric values for ML analysis
 */
export async function syncOuraStressToClickHouse(
  healthId: string,
  stressData: OuraDailyStress[]
): Promise<void> {
  if (!clickhouse.isEnabled() || stressData.length === 0) {
    return;
  }
  
  const rows: HealthMetricRow[] = [];
  const source: DataSource = 'oura';
  
  for (const stress of stressData) {
    const recordedAt = `${stress.day}T12:00:00Z`; // Daily metrics recorded at noon
    
    // High stress seconds
    if (stress.stress_high !== null && stress.stress_high !== undefined) {
      rows.push({
        health_id: healthId,
        metric_type: 'stress_high_seconds',
        value: stress.stress_high,
        recorded_at: recordedAt,
        local_date: stress.day,
        source,
      });
    }
    
    // High recovery seconds
    if (stress.recovery_high !== null && stress.recovery_high !== undefined) {
      rows.push({
        health_id: healthId,
        metric_type: 'recovery_high_seconds',
        value: stress.recovery_high,
        recorded_at: recordedAt,
        local_date: stress.day,
        source,
      });
    }
    
    // Day summary as numeric score (1=stressful, 2=normal, 3=restored)
    if (stress.day_summary && STRESS_SUMMARY_SCORES[stress.day_summary]) {
      rows.push({
        health_id: healthId,
        metric_type: 'stress_day_summary_score',
        value: STRESS_SUMMARY_SCORES[stress.day_summary],
        recorded_at: recordedAt,
        local_date: stress.day,
        source,
      });
    }
  }
  
  if (rows.length > 0) {
    try {
      await clickhouse.insert('health_metrics', rows as unknown as Record<string, unknown>[]);
      console.log(`[ClickHouseHealthSync] Synced ${rows.length} Oura stress metrics`);
    } catch (error) {
      console.error('[ClickHouseHealthSync] Failed to sync Oura stress:', error);
    }
  }
}

/**
 * Sync Oura daily resilience metrics to ClickHouse
 * Converts resilience levels and contributors to numeric values for ML analysis
 */
export async function syncOuraResilienceToClickHouse(
  healthId: string,
  resilienceData: OuraDailyResilience[]
): Promise<void> {
  if (!clickhouse.isEnabled() || resilienceData.length === 0) {
    return;
  }
  
  const rows: HealthMetricRow[] = [];
  const source: DataSource = 'oura';
  
  for (const resilience of resilienceData) {
    const recordedAt = `${resilience.day}T12:00:00Z`;
    
    // Overall resilience level as numeric score (1-5)
    if (resilience.level && RESILIENCE_LEVEL_SCORES[resilience.level]) {
      rows.push({
        health_id: healthId,
        metric_type: 'resilience_level_score',
        value: RESILIENCE_LEVEL_SCORES[resilience.level],
        recorded_at: recordedAt,
        local_date: resilience.day,
        source,
      });
    }
    
    // Individual contributors
    if (resilience.contributors) {
      if (resilience.contributors.sleep_recovery !== null && resilience.contributors.sleep_recovery !== undefined) {
        rows.push({
          health_id: healthId,
          metric_type: 'resilience_sleep_recovery',
          value: resilience.contributors.sleep_recovery,
          recorded_at: recordedAt,
          local_date: resilience.day,
          source,
        });
      }
      
      if (resilience.contributors.daytime_recovery !== null && resilience.contributors.daytime_recovery !== undefined) {
        rows.push({
          health_id: healthId,
          metric_type: 'resilience_daytime_recovery',
          value: resilience.contributors.daytime_recovery,
          recorded_at: recordedAt,
          local_date: resilience.day,
          source,
        });
      }
      
      if (resilience.contributors.stress !== null && resilience.contributors.stress !== undefined) {
        rows.push({
          health_id: healthId,
          metric_type: 'resilience_stress_contributor',
          value: resilience.contributors.stress,
          recorded_at: recordedAt,
          local_date: resilience.day,
          source,
        });
      }
    }
  }
  
  if (rows.length > 0) {
    try {
      await clickhouse.insert('health_metrics', rows as unknown as Record<string, unknown>[]);
      console.log(`[ClickHouseHealthSync] Synced ${rows.length} Oura resilience metrics`);
    } catch (error) {
      console.error('[ClickHouseHealthSync] Failed to sync Oura resilience:', error);
    }
  }
}

/**
 * Sync Oura SpO2 (blood oxygen) metrics to ClickHouse
 * Only available for Gen 3+ Oura Ring users
 */
export async function syncOuraSpO2ToClickHouse(
  healthId: string,
  spo2Data: OuraDailySpO2[]
): Promise<void> {
  if (!clickhouse.isEnabled() || spo2Data.length === 0) {
    return;
  }
  
  const rows: HealthMetricRow[] = [];
  const source: DataSource = 'oura';
  
  for (const spo2 of spo2Data) {
    const recordedAt = `${spo2.day}T12:00:00Z`;
    
    // Average SpO2 percentage
    if (spo2.spo2_percentage?.average !== null && spo2.spo2_percentage?.average !== undefined) {
      rows.push({
        health_id: healthId,
        metric_type: 'spo2_average_pct',
        value: spo2.spo2_percentage.average,
        recorded_at: recordedAt,
        local_date: spo2.day,
        source,
      });
    }
    
    // Breathing disturbance index
    if (spo2.breathing_disturbance_index !== null && spo2.breathing_disturbance_index !== undefined) {
      rows.push({
        health_id: healthId,
        metric_type: 'breathing_disturbance_index',
        value: spo2.breathing_disturbance_index,
        recorded_at: recordedAt,
        local_date: spo2.day,
        source,
      });
    }
  }
  
  if (rows.length > 0) {
    try {
      await clickhouse.insert('health_metrics', rows as unknown as Record<string, unknown>[]);
      console.log(`[ClickHouseHealthSync] Synced ${rows.length} Oura SpO2 metrics`);
    } catch (error) {
      console.error('[ClickHouseHealthSync] Failed to sync Oura SpO2:', error);
    }
  }
}

/**
 * Sync all extended Oura metrics to ClickHouse
 * Convenience function that syncs stress, resilience, and SpO2 in parallel
 */
export async function syncOuraExtendedMetricsToClickHouse(
  healthId: string,
  data: {
    stress?: OuraDailyStress[];
    resilience?: OuraDailyResilience[];
    spo2?: OuraDailySpO2[];
  }
): Promise<void> {
  const syncTasks: Promise<void>[] = [];
  
  if (data.stress && data.stress.length > 0) {
    syncTasks.push(syncOuraStressToClickHouse(healthId, data.stress));
  }
  
  if (data.resilience && data.resilience.length > 0) {
    syncTasks.push(syncOuraResilienceToClickHouse(healthId, data.resilience));
  }
  
  if (data.spo2 && data.spo2.length > 0) {
    syncTasks.push(syncOuraSpO2ToClickHouse(healthId, data.spo2));
  }
  
  if (syncTasks.length > 0) {
    await Promise.all(syncTasks);
    console.log(`[ClickHouseHealthSync] Completed sync of ${syncTasks.length} Oura extended metric types`);
  }
}

/**
 * Sync recovery session (sauna/ice bath) to ClickHouse
 * Tracks thermal recovery metrics for ML analysis
 */
export interface RecoverySessionSync {
  sessionType: 'sauna' | 'icebath';
  sessionDate: string; // YYYY-MM-DD
  durationMinutes: number;
  durationSeconds?: number | null;
  temperatureCelsius?: number | null;
  caloriesBurned?: number | null;
  recoveryScore?: number | null;
  feeling?: number | null;
}

export async function syncRecoverySessionToClickHouse(
  healthId: string,
  session: RecoverySessionSync
): Promise<void> {
  if (!clickhouse.isEnabled()) {
    return;
  }
  
  const rows: HealthMetricRow[] = [];
  const source: DataSource = 'manual';
  const recordedAt = `${session.sessionDate}T12:00:00Z`;
  const localDate = session.sessionDate;
  
  // Duration metrics
  if (session.sessionType === 'sauna') {
    rows.push({
      health_id: healthId,
      metric_type: 'sauna_duration_min',
      value: session.durationMinutes,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  } else {
    const totalSeconds = (session.durationMinutes * 60) + (session.durationSeconds || 0);
    rows.push({
      health_id: healthId,
      metric_type: 'icebath_duration_sec',
      value: totalSeconds,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  // Temperature (in Celsius for consistency)
  if (session.temperatureCelsius !== null && session.temperatureCelsius !== undefined) {
    const metricType = session.sessionType === 'sauna' ? 'sauna_temp_celsius' : 'icebath_temp_celsius';
    rows.push({
      health_id: healthId,
      metric_type: metricType,
      value: session.temperatureCelsius,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  // Calories burned
  if (session.caloriesBurned !== null && session.caloriesBurned !== undefined) {
    const metricType = session.sessionType === 'sauna' ? 'sauna_calories' : 'icebath_calories';
    rows.push({
      health_id: healthId,
      metric_type: metricType,
      value: session.caloriesBurned,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  // Recovery score
  if (session.recoveryScore !== null && session.recoveryScore !== undefined) {
    const metricType = session.sessionType === 'sauna' ? 'sauna_recovery_score' : 'icebath_recovery_score';
    rows.push({
      health_id: healthId,
      metric_type: metricType,
      value: session.recoveryScore,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  // Subjective feeling (1-5 scale)
  if (session.feeling !== null && session.feeling !== undefined) {
    const metricType = session.sessionType === 'sauna' ? 'sauna_feeling' : 'icebath_feeling';
    rows.push({
      health_id: healthId,
      metric_type: metricType,
      value: session.feeling,
      recorded_at: recordedAt,
      local_date: localDate,
      source,
    });
  }
  
  if (rows.length > 0) {
    try {
      await clickhouse.insert('health_metrics', rows as unknown as Record<string, unknown>[]);
      console.log(`[ClickHouseHealthSync] Synced ${rows.length} ${session.sessionType} recovery metrics`);
    } catch (error) {
      console.error('[ClickHouseHealthSync] Failed to sync recovery session:', error);
    }
  }
}
