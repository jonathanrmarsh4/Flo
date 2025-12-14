/**
 * ClickHouse Orchestration Jobs for Weight & Body Composition Forecasting Engine
 * 
 * Implements scheduled jobs for:
 * - job_010: Build daily weight features (hourly)
 * - job_020: Build daily features snapshot (hourly)
 * - job_030: Compute weight trend and quality (hourly)
 * - job_040: Enqueue recompute for recent changes (every 10 minutes)
 */

import { getClickHouseClient, isClickHouseEnabled } from '../clickhouseService';
import { createLogger } from '../../utils/logger';

const logger = createLogger('WeightForecastJobs');

export interface JobResult {
  jobId: string;
  success: boolean;
  rowsAffected?: number;
  durationMs: number;
  error?: string;
}

export interface OrchestrationStats {
  lastHourlyRun?: Date;
  lastRecomputeRun?: Date;
  hourlyJobResults: JobResult[];
  recomputeJobResults: JobResult[];
}

let orchestrationStats: OrchestrationStats = {
  hourlyJobResults: [],
  recomputeJobResults: [],
};

let hourlyInterval: NodeJS.Timeout | null = null;
let recomputeInterval: NodeJS.Timeout | null = null;

/**
 * Job 010: Build daily weight features
 * Derives one representative weight per user per local day + daily stats for smoothing
 */
async function runJob010BuildDailyWeightFeatures(): Promise<JobResult> {
  const startTime = Date.now();
  const jobId = 'job_010_build_daily_weight_features';

  if (!isClickHouseEnabled()) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse not enabled' };
  }

  const client = getClickHouseClient();
  if (!client) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse client not available' };
  }

  try {
    // Note: ClickHouse's toTimeZone() requires a constant timezone string, not a column.
    // We use the pre-computed local_date_key from raw_weight_events and calculate local_hour
    // using timezone offset mapping via multiIf() for common timezones.
    const sql = `
      INSERT INTO flo_ml.daily_weight_features
      WITH
        now64() AS v_utc
      SELECT
        user_id,
        local_date_key,
        any(user_timezone) AS user_timezone,
        if(
          countIf(local_hour >= 4 AND local_hour <= 10) > 0,
          argMinIf(weight_kg, timestamp_utc, local_hour >= 4 AND local_hour <= 10),
          quantileExact(0.5)(weight_kg)
        ) AS weight_daily_kg,
        if(
          countIf(local_hour >= 4 AND local_hour <= 10) > 0,
          'MORNING_PREFERRED',
          'MEDIAN_FALLBACK'
        ) AS weight_daily_source,
        if(
          countIf(local_hour >= 4 AND local_hour <= 10) > 0,
          argMinIf(timestamp_utc, timestamp_utc, local_hour >= 4 AND local_hour <= 10),
          argMax(timestamp_utc, timestamp_utc)
        ) AS weight_daily_timestamp_utc,
        if(countIf(local_hour >= 4 AND local_hour <= 10) > 0, 1, 0) AS weight_daily_is_morning,
        quantileExact(0.5)(weight_kg) AS weight_daily_median_kg,
        min(weight_kg) AS weight_daily_min_kg,
        max(weight_kg) AS weight_daily_max_kg,
        v_utc AS version_utc
      FROM (
        SELECT 
          user_id, 
          event_id, 
          timestamp_utc, 
          user_timezone, 
          weight_kg,
          local_date_key,
          -- Calculate local hour using timezone offset mapping
          -- Note: Adding 24 before modulo ensures positive result for negative offsets
          -- Offsets are approximate (ignoring DST) but sufficient for morning-window heuristic
          ((toHour(timestamp_utc) + multiIf(
            user_timezone = 'Australia/Perth', 8,
            user_timezone = 'Australia/Sydney', 11,
            user_timezone = 'Australia/Melbourne', 11,
            user_timezone = 'Australia/Brisbane', 10,
            user_timezone = 'Australia/Adelaide', 10,  -- Actually 9.5, rounded
            user_timezone = 'Australia/Darwin', 10,    -- Actually 9.5, rounded
            user_timezone = 'America/New_York', -5,
            user_timezone = 'America/Chicago', -6,
            user_timezone = 'America/Denver', -7,
            user_timezone = 'America/Los_Angeles', -8,
            user_timezone = 'America/Phoenix', -7,
            user_timezone = 'America/Anchorage', -9,
            user_timezone = 'America/Toronto', -5,
            user_timezone = 'America/Vancouver', -8,
            user_timezone = 'Europe/London', 0,
            user_timezone = 'Europe/Paris', 1,
            user_timezone = 'Europe/Berlin', 1,
            user_timezone = 'Europe/Amsterdam', 1,
            user_timezone = 'Europe/Rome', 1,
            user_timezone = 'Europe/Madrid', 1,
            user_timezone = 'Europe/Moscow', 3,
            user_timezone = 'Asia/Tokyo', 9,
            user_timezone = 'Asia/Singapore', 8,
            user_timezone = 'Asia/Hong_Kong', 8,
            user_timezone = 'Asia/Shanghai', 8,
            user_timezone = 'Asia/Seoul', 9,
            user_timezone = 'Asia/Kolkata', 6,         -- Actually 5.5, rounded
            user_timezone = 'Asia/Mumbai', 6,          -- Actually 5.5, rounded
            user_timezone = 'Asia/Dubai', 4,
            user_timezone = 'Pacific/Auckland', 13,
            user_timezone = 'Pacific/Honolulu', -10,
            user_timezone = 'UTC', 0,
            8  -- Default to Australia/Perth offset
          ) + 24) % 24) AS local_hour
        FROM flo_ml.raw_weight_events
        WHERE timestamp_utc >= now() - INTERVAL 120 DAY
      )
      GROUP BY user_id, local_date_key
    `;

    await client.command({ query: sql });

    const durationMs = Date.now() - startTime;
    logger.info(`[WeightForecastJobs] ${jobId} completed in ${durationMs}ms`);

    return { jobId, success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[WeightForecastJobs] ${jobId} failed:`, error);
    return { jobId, success: false, durationMs, error: errorMsg };
  }
}

/**
 * Job 020: Build daily features snapshot
 * Joins daily rollups into a single daily_features snapshot table (the model input)
 */
async function runJob020BuildDailyFeaturesSnapshot(): Promise<JobResult> {
  const startTime = Date.now();
  const jobId = 'job_020_build_daily_features_snapshot';

  if (!isClickHouseEnabled()) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse not enabled' };
  }

  const client = getClickHouseClient();
  if (!client) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse client not available' };
  }

  try {
    const sql = `
      INSERT INTO flo_ml.daily_features
      WITH
        now64() AS v_utc,
        w AS (
          SELECT user_id, local_date_key, any(user_timezone) AS user_timezone, any(weight_daily_kg) AS weight_kg, any(weight_daily_timestamp_utc) AS weight_daily_timestamp_utc 
          FROM flo_ml.daily_weight_features FINAL 
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        a AS (
          SELECT user_id, local_date_key, any(steps) AS steps, any(active_energy_kcal) AS active_energy_kcal, any(workout_minutes) AS workout_minutes, any(strength_sessions) AS strength_sessions 
          FROM flo_ml.raw_activity_daily 
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        s AS (
          SELECT user_id, local_date_key, any(sleep_duration_min) AS sleep_duration_min, any(sleep_score) AS sleep_score 
          FROM flo_ml.raw_sleep_daily 
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        c AS (
          SELECT user_id, local_date_key, any(rhr) AS rhr, any(hrv) AS hrv 
          FROM flo_ml.raw_cardio_daily 
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        n AS (
          SELECT user_id, local_date_key, any(calories_kcal) AS calories_kcal, any(protein_g) AS protein_g, any(carbs_g) AS carbs_g, any(fat_g) AS fat_g, any(nutrition_coverage_pct) AS nutrition_coverage_pct 
          FROM flo_ml.raw_nutrition_daily 
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        g AS (
          SELECT user_id, local_date_key, any(mean_glucose_mgdl) AS mean_glucose_mgdl, any(tir_pct) AS tir_pct, any(glucose_cv_pct) AS glucose_cv_pct, any(late_spike_flag) AS late_spike_flag, any(cgm_coverage_pct) AS cgm_coverage_pct 
          FROM flo_ml.raw_cgm_daily 
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        bc AS (
          SELECT
            user_id,
            local_date_key,
            argMax(body_fat_pct, timestamp_utc) AS body_fat_pct,
            argMax(lean_mass_kg, timestamp_utc) AS lean_mass_kg,
            argMax(estimated, timestamp_utc) AS body_comp_is_estimated
          FROM flo_ml.raw_body_comp_events
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        u AS (
          SELECT user_id, local_date_key FROM w
          UNION DISTINCT SELECT user_id, local_date_key FROM a
          UNION DISTINCT SELECT user_id, local_date_key FROM s
          UNION DISTINCT SELECT user_id, local_date_key FROM c
          UNION DISTINCT SELECT user_id, local_date_key FROM n
          UNION DISTINCT SELECT user_id, local_date_key FROM g
          UNION DISTINCT SELECT user_id, local_date_key FROM bc
        )
      SELECT
        u.user_id,
        u.local_date_key,
        coalesce(any(w.user_timezone), 'UTC') AS user_timezone,
        w.weight_kg AS weight_kg,
        NULL AS weight_trend_kg,
        NULL AS weight_trend_slope_kg_per_day,
        NULL AS water_volatility_score,
        a.steps,
        a.active_energy_kcal,
        a.workout_minutes,
        a.strength_sessions,
        s.sleep_duration_min,
        s.sleep_score,
        c.rhr,
        c.hrv,
        n.calories_kcal,
        n.protein_g,
        n.carbs_g,
        n.fat_g,
        n.nutrition_coverage_pct,
        g.mean_glucose_mgdl,
        g.tir_pct,
        g.glucose_cv_pct,
        g.late_spike_flag,
        g.cgm_coverage_pct,
        bc.body_fat_pct,
        bc.lean_mass_kg,
        bc.body_comp_is_estimated,
        NULL AS data_quality_weighins_per_week_14d,
        NULL AS data_quality_staleness_days,
        NULL AS data_quality_nutrition_days_14d,
        NULL AS data_quality_cgm_days_14d,
        v_utc AS version_utc
      FROM u
      LEFT JOIN w ON u.user_id = w.user_id AND u.local_date_key = w.local_date_key
      LEFT JOIN a ON u.user_id = a.user_id AND u.local_date_key = a.local_date_key
      LEFT JOIN s ON u.user_id = s.user_id AND u.local_date_key = s.local_date_key
      LEFT JOIN c ON u.user_id = c.user_id AND u.local_date_key = c.local_date_key
      LEFT JOIN n ON u.user_id = n.user_id AND u.local_date_key = n.local_date_key
      LEFT JOIN g ON u.user_id = g.user_id AND u.local_date_key = g.local_date_key
      LEFT JOIN bc ON u.user_id = bc.user_id AND u.local_date_key = bc.local_date_key
      GROUP BY u.user_id, u.local_date_key, w.weight_kg, a.steps, a.active_energy_kcal, a.workout_minutes, a.strength_sessions, s.sleep_duration_min, s.sleep_score, c.rhr, c.hrv, n.calories_kcal, n.protein_g, n.carbs_g, n.fat_g, n.nutrition_coverage_pct, g.mean_glucose_mgdl, g.tir_pct, g.glucose_cv_pct, g.late_spike_flag, g.cgm_coverage_pct, bc.body_fat_pct, bc.lean_mass_kg, bc.body_comp_is_estimated
    `;

    await client.command({ query: sql });

    const durationMs = Date.now() - startTime;
    logger.info(`[WeightForecastJobs] ${jobId} completed in ${durationMs}ms`);

    return { jobId, success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[WeightForecastJobs] ${jobId} failed:`, error);
    return { jobId, success: false, durationMs, error: errorMsg };
  }
}

/**
 * Job 030: Compute weight trend and quality
 * Computes smoothed trend, slope, water volatility, and data quality fields
 */
async function runJob030ComputeWeightTrendAndQuality(): Promise<JobResult> {
  const startTime = Date.now();
  const jobId = 'job_030_compute_weight_trend_and_quality';

  if (!isClickHouseEnabled()) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse not enabled' };
  }

  const client = getClickHouseClient();
  if (!client) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse client not available' };
  }

  try {
    const sql = `
      INSERT INTO flo_ml.daily_features
      WITH
        now64() AS v_utc,
        base AS (
          SELECT
            user_id,
            local_date_key,
            any(user_timezone) AS user_timezone,
            any(weight_kg) AS weight_kg,
            any(steps) AS steps, any(active_energy_kcal) AS active_energy_kcal, any(workout_minutes) AS workout_minutes, any(strength_sessions) AS strength_sessions,
            any(sleep_duration_min) AS sleep_duration_min, any(sleep_score) AS sleep_score,
            any(rhr) AS rhr, any(hrv) AS hrv,
            any(calories_kcal) AS calories_kcal, any(protein_g) AS protein_g, any(carbs_g) AS carbs_g, any(fat_g) AS fat_g, any(nutrition_coverage_pct) AS nutrition_coverage_pct,
            any(mean_glucose_mgdl) AS mean_glucose_mgdl, any(tir_pct) AS tir_pct, any(glucose_cv_pct) AS glucose_cv_pct, any(late_spike_flag) AS late_spike_flag, any(cgm_coverage_pct) AS cgm_coverage_pct,
            any(body_fat_pct) AS body_fat_pct, any(lean_mass_kg) AS lean_mass_kg, any(body_comp_is_estimated) AS body_comp_is_estimated
          FROM flo_ml.daily_features FINAL
          WHERE local_date_key >= today() - 120
          GROUP BY user_id, local_date_key
        ),
        w_series AS (
          SELECT
            user_id,
            local_date_key,
            weight_kg,
            avg(weight_kg) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS trend_7d,
            (avg(weight_kg) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 13 PRECEDING AND 7 PRECEDING) - avg(weight_kg) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)) / 7.0 AS slope_kg_per_day_proxy,
            stddevPop(weight_kg) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS volatility_7d
          FROM base
          WHERE weight_kg IS NOT NULL
        ),
        quality AS (
          SELECT
            user_id,
            local_date_key,
            countIf(weight_kg IS NOT NULL) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS weigh_days_14d,
            (countIf(weight_kg IS NOT NULL) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)) / 2.0 AS weighins_per_week_14d,
            dateDiff('day', maxIf(local_date_key, weight_kg IS NOT NULL) OVER (PARTITION BY user_id), local_date_key) AS staleness_days,
            countIf(calories_kcal IS NOT NULL OR protein_g IS NOT NULL) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS nutrition_days_14d,
            countIf(mean_glucose_mgdl IS NOT NULL) OVER (PARTITION BY user_id ORDER BY local_date_key ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS cgm_days_14d
          FROM base
        )
      SELECT
        b.user_id,
        b.local_date_key,
        b.user_timezone,
        b.weight_kg,
        ws.trend_7d AS weight_trend_kg,
        (-ws.slope_kg_per_day_proxy) AS weight_trend_slope_kg_per_day,
        least(greatest(ws.volatility_7d / 1.0, 0.0), 2.0) AS water_volatility_score,
        b.steps, b.active_energy_kcal, b.workout_minutes, b.strength_sessions,
        b.sleep_duration_min, b.sleep_score,
        b.rhr, b.hrv,
        b.calories_kcal, b.protein_g, b.carbs_g, b.fat_g, b.nutrition_coverage_pct,
        b.mean_glucose_mgdl, b.tir_pct, b.glucose_cv_pct, b.late_spike_flag, b.cgm_coverage_pct,
        b.body_fat_pct, b.lean_mass_kg, b.body_comp_is_estimated,
        q.weighins_per_week_14d AS data_quality_weighins_per_week_14d,
        toUInt16(ifNull(q.staleness_days, 999)) AS data_quality_staleness_days,
        toUInt8(ifNull(q.nutrition_days_14d, 0)) AS data_quality_nutrition_days_14d,
        toUInt8(ifNull(q.cgm_days_14d, 0)) AS data_quality_cgm_days_14d,
        v_utc AS version_utc
      FROM base b
      LEFT JOIN w_series ws ON b.user_id = ws.user_id AND b.local_date_key = ws.local_date_key
      LEFT JOIN quality q ON b.user_id = q.user_id AND b.local_date_key = q.local_date_key
    `;

    await client.command({ query: sql });

    const durationMs = Date.now() - startTime;
    logger.info(`[WeightForecastJobs] ${jobId} completed in ${durationMs}ms`);

    return { jobId, success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[WeightForecastJobs] ${jobId} failed:`, error);
    return { jobId, success: false, durationMs, error: errorMsg };
  }
}

/**
 * Job 040: Enqueue recompute for recent changes
 * Detects users with new data in last 10 minutes and enqueues recompute events
 */
async function runJob040EnqueueRecomputeForRecentChanges(): Promise<JobResult> {
  const startTime = Date.now();
  const jobId = 'job_040_enqueue_recompute_for_recent_changes';

  if (!isClickHouseEnabled()) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse not enabled' };
  }

  const client = getClickHouseClient();
  if (!client) {
    return { jobId, success: false, durationMs: 0, error: 'ClickHouse client not available' };
  }

  try {
    const sql = `
      INSERT INTO flo_ml.recompute_queue
      SELECT
        concat('auto_', toString(now64()), '_', user_id) AS event_id,
        user_id,
        'DATA_CHANGED' AS reason,
        5 AS priority,
        now64() AS queued_at_utc,
        NULL AS requested_local_date_key_optional
      FROM (
        SELECT DISTINCT user_id FROM flo_ml.raw_weight_events WHERE created_at_utc >= now() - INTERVAL 10 MINUTE
        UNION DISTINCT
        SELECT DISTINCT user_id FROM flo_ml.raw_body_comp_events WHERE created_at_utc >= now() - INTERVAL 10 MINUTE
        UNION DISTINCT
        SELECT DISTINCT user_id FROM flo_ml.raw_nutrition_daily WHERE created_at_utc >= now() - INTERVAL 10 MINUTE
        UNION DISTINCT
        SELECT DISTINCT user_id FROM flo_ml.raw_cgm_daily WHERE created_at_utc >= now() - INTERVAL 10 MINUTE
      )
    `;

    await client.command({ query: sql });

    const durationMs = Date.now() - startTime;
    logger.info(`[WeightForecastJobs] ${jobId} completed in ${durationMs}ms`);

    return { jobId, success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[WeightForecastJobs] ${jobId} failed:`, error);
    return { jobId, success: false, durationMs, error: errorMsg };
  }
}

/**
 * Run all hourly jobs in sequence
 */
export async function runHourlyJobs(): Promise<JobResult[]> {
  logger.info('[WeightForecastJobs] Starting hourly job run');

  const results: JobResult[] = [];

  // Run jobs in sequence as they depend on each other
  results.push(await runJob010BuildDailyWeightFeatures());
  results.push(await runJob020BuildDailyFeaturesSnapshot());
  results.push(await runJob030ComputeWeightTrendAndQuality());

  orchestrationStats.lastHourlyRun = new Date();
  orchestrationStats.hourlyJobResults = results;

  const successCount = results.filter(r => r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  logger.info(`[WeightForecastJobs] Hourly jobs complete: ${successCount}/${results.length} succeeded in ${totalDuration}ms`);

  return results;
}

/**
 * Run recompute queue job
 */
export async function runRecomputeQueueJob(): Promise<JobResult> {
  const result = await runJob040EnqueueRecomputeForRecentChanges();

  orchestrationStats.lastRecomputeRun = new Date();
  orchestrationStats.recomputeJobResults = [result];

  return result;
}

/**
 * Start the weight forecast orchestration scheduler
 */
export function startWeightForecastOrchestrator(): void {
  if (!isClickHouseEnabled()) {
    logger.info('[WeightForecastJobs] ClickHouse not enabled - skipping orchestrator start');
    return;
  }

  if (hourlyInterval || recomputeInterval) {
    logger.warn('[WeightForecastJobs] Orchestrator already running');
    return;
  }

  logger.info('[WeightForecastJobs] Starting weight forecast orchestrator');

  // Run hourly jobs every hour
  const HOURLY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  hourlyInterval = setInterval(async () => {
    try {
      await runHourlyJobs();
    } catch (error) {
      logger.error('[WeightForecastJobs] Error in hourly job run:', error);
    }
  }, HOURLY_INTERVAL_MS);

  // Run recompute queue job every 10 minutes
  const RECOMPUTE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  recomputeInterval = setInterval(async () => {
    try {
      await runRecomputeQueueJob();
    } catch (error) {
      logger.error('[WeightForecastJobs] Error in recompute job run:', error);
    }
  }, RECOMPUTE_INTERVAL_MS);

  // Run initial hourly jobs after a short delay to let schema initialize
  setTimeout(async () => {
    try {
      logger.info('[WeightForecastJobs] Running initial hourly jobs');
      await runHourlyJobs();
    } catch (error) {
      logger.error('[WeightForecastJobs] Error in initial hourly job run:', error);
    }
  }, 30000); // 30 seconds delay

  logger.info('[WeightForecastJobs] Orchestrator started - hourly jobs every 60min, recompute queue every 10min');
}

/**
 * Stop the weight forecast orchestration scheduler
 */
export function stopWeightForecastOrchestrator(): void {
  if (hourlyInterval) {
    clearInterval(hourlyInterval);
    hourlyInterval = null;
  }
  if (recomputeInterval) {
    clearInterval(recomputeInterval);
    recomputeInterval = null;
  }
  logger.info('[WeightForecastJobs] Orchestrator stopped');
}

/**
 * Get current orchestration stats
 */
export function getOrchestrationStats(): OrchestrationStats {
  return { ...orchestrationStats };
}

/**
 * Manually trigger hourly jobs (for admin/debugging)
 */
export async function triggerHourlyJobs(): Promise<JobResult[]> {
  logger.info('[WeightForecastJobs] Manual hourly job trigger');
  return runHourlyJobs();
}

/**
 * Manually trigger recompute queue job (for admin/debugging)
 */
export async function triggerRecomputeQueueJob(): Promise<JobResult> {
  logger.info('[WeightForecastJobs] Manual recompute queue job trigger');
  return runRecomputeQueueJob();
}
