/**
 * ClickHouse Schema for Weight & Body Composition Forecasting Engine
 * 
 * Creates the flo_ml database and all required tables for:
 * - Raw event ingestion (weight, body comp, activity, sleep, cardio, nutrition, CGM)
 * - Daily feature rollups
 * - Forecast outputs (summary, series, drivers, simulator results)
 * - Model state persistence
 * - Recompute queue for near-realtime processing
 */

import { getClickHouseClient, isClickHouseEnabled } from '../clickhouseService';
import { createLogger } from '../../utils/logger';

const logger = createLogger('WeightForecastSchema');

/**
 * Initialize the flo_ml database and all weight forecasting tables
 */
export async function initializeWeightForecastSchema(): Promise<boolean> {
  if (!isClickHouseEnabled()) {
    logger.info('[WeightForecastSchema] ClickHouse not enabled - skipping schema initialization');
    return false;
  }

  const client = getClickHouseClient();
  if (!client) {
    logger.warn('[WeightForecastSchema] ClickHouse client not available');
    return false;
  }

  try {
    // Create flo_ml database
    await client.command({
      query: `CREATE DATABASE IF NOT EXISTS flo_ml`,
    });
    logger.info('[WeightForecastSchema] Created flo_ml database');

    // Create all tables
    await createRawWeightEventsTable(client);
    await createRawBodyCompEventsTable(client);
    await createRawActivityDailyTable(client);
    await createRawSleepDailyTable(client);
    await createRawCardioDailyTable(client);
    await createRawNutritionDailyTable(client);
    await createRawCgmDailyTable(client);
    await createDailyWeightFeaturesTable(client);
    await createDailyFeaturesTable(client);
    await createModelStateTable(client);
    await createForecastSummaryTable(client);
    await createForecastSeriesTable(client);
    await createForecastDriversTable(client);
    await createSimulatorResultsTable(client);
    await createRecomputeQueueTable(client);
    await createLatestWeightView(client);

    logger.info('[WeightForecastSchema] All weight forecast tables created successfully');
    return true;
  } catch (error) {
    logger.error('[WeightForecastSchema] Failed to initialize schema:', error);
    return false;
  }
}

async function createRawWeightEventsTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.raw_weight_events (
        user_id String,
        event_id String,
        timestamp_utc DateTime64(3, 'UTC'),
        user_timezone String,
        local_date_key Date,
        weight_kg Float32,
        source_type LowCardinality(String),
        source_device_name Nullable(String),
        imported UInt8 DEFAULT 0,
        editable UInt8 DEFAULT 1,
        created_at_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp_utc)
      ORDER BY (user_id, timestamp_utc)
      PRIMARY KEY (user_id, timestamp_utc)
      TTL timestamp_utc + INTERVAL 5 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created raw_weight_events table');
}

async function createRawBodyCompEventsTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.raw_body_comp_events (
        user_id String,
        event_id String,
        timestamp_utc DateTime64(3, 'UTC'),
        user_timezone String,
        local_date_key Date,
        body_fat_pct Nullable(Float32),
        lean_mass_kg Nullable(Float32),
        source_type LowCardinality(String),
        source_device_name Nullable(String),
        estimated UInt8 DEFAULT 0,
        imported UInt8 DEFAULT 0,
        editable UInt8 DEFAULT 1,
        created_at_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp_utc)
      ORDER BY (user_id, timestamp_utc)
      PRIMARY KEY (user_id, timestamp_utc)
      TTL timestamp_utc + INTERVAL 5 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created raw_body_comp_events table');
}

async function createRawActivityDailyTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.raw_activity_daily (
        user_id String,
        local_date_key Date,
        user_timezone String,
        steps Nullable(UInt32),
        active_energy_kcal Nullable(Float32),
        workout_minutes Nullable(UInt32),
        strength_sessions Nullable(UInt8),
        created_at_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
      TTL local_date_key + INTERVAL 5 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created raw_activity_daily table');
}

async function createRawSleepDailyTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.raw_sleep_daily (
        user_id String,
        local_date_key Date,
        user_timezone String,
        sleep_duration_min Nullable(UInt32),
        sleep_score Nullable(Float32),
        created_at_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
      TTL local_date_key + INTERVAL 5 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created raw_sleep_daily table');
}

async function createRawCardioDailyTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.raw_cardio_daily (
        user_id String,
        local_date_key Date,
        user_timezone String,
        rhr Nullable(Float32),
        hrv Nullable(Float32),
        created_at_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
      TTL local_date_key + INTERVAL 5 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created raw_cardio_daily table');
}

async function createRawNutritionDailyTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.raw_nutrition_daily (
        user_id String,
        local_date_key Date,
        user_timezone String,
        calories_kcal Nullable(Float32),
        protein_g Nullable(Float32),
        carbs_g Nullable(Float32),
        fat_g Nullable(Float32),
        nutrition_coverage_pct Nullable(Float32),
        created_at_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
      TTL local_date_key + INTERVAL 5 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created raw_nutrition_daily table');
}

async function createRawCgmDailyTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.raw_cgm_daily (
        user_id String,
        local_date_key Date,
        user_timezone String,
        mean_glucose_mgdl Nullable(Float32),
        tir_pct Nullable(Float32),
        glucose_cv_pct Nullable(Float32),
        late_spike_flag Nullable(UInt8),
        cgm_coverage_pct Nullable(Float32),
        created_at_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
      TTL local_date_key + INTERVAL 5 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created raw_cgm_daily table');
}

async function createDailyWeightFeaturesTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.daily_weight_features (
        user_id String,
        local_date_key Date,
        user_timezone String,
        weight_daily_kg Nullable(Float32),
        weight_daily_source LowCardinality(String),
        weight_daily_timestamp_utc Nullable(DateTime64(3, 'UTC')),
        weight_daily_is_morning Nullable(UInt8),
        weight_daily_median_kg Nullable(Float32),
        weight_daily_min_kg Nullable(Float32),
        weight_daily_max_kg Nullable(Float32),
        version_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(version_utc)
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
    `,
  });
  logger.info('[WeightForecastSchema] Created daily_weight_features table');
}

async function createDailyFeaturesTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.daily_features (
        user_id String,
        local_date_key Date,
        user_timezone String,
        weight_kg Nullable(Float32),
        weight_trend_kg Nullable(Float32),
        weight_trend_slope_kg_per_day Nullable(Float32),
        water_volatility_score Nullable(Float32),
        steps Nullable(UInt32),
        active_energy_kcal Nullable(Float32),
        workout_minutes Nullable(UInt32),
        strength_sessions Nullable(UInt8),
        sleep_duration_min Nullable(UInt32),
        sleep_score Nullable(Float32),
        rhr Nullable(Float32),
        hrv Nullable(Float32),
        calories_kcal Nullable(Float32),
        protein_g Nullable(Float32),
        carbs_g Nullable(Float32),
        fat_g Nullable(Float32),
        nutrition_coverage_pct Nullable(Float32),
        mean_glucose_mgdl Nullable(Float32),
        tir_pct Nullable(Float32),
        glucose_cv_pct Nullable(Float32),
        late_spike_flag Nullable(UInt8),
        cgm_coverage_pct Nullable(Float32),
        body_fat_pct Nullable(Float32),
        lean_mass_kg Nullable(Float32),
        body_comp_is_estimated Nullable(UInt8),
        data_quality_weighins_per_week_14d Nullable(Float32),
        data_quality_staleness_days Nullable(UInt16),
        data_quality_nutrition_days_14d Nullable(UInt8),
        data_quality_cgm_days_14d Nullable(UInt8),
        version_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(version_utc)
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
    `,
  });
  logger.info('[WeightForecastSchema] Created daily_features table');
}

async function createModelStateTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.model_state (
        user_id String,
        k_user_response Float32 DEFAULT 1.0,
        energy_balance_effective_kcal_per_day Float32 DEFAULT 0.0,
        water_noise_sigma Float32 DEFAULT 0.35,
        baseline_weight_trend_slope Float32 DEFAULT 0.0,
        last_trained_local_date_key Date,
        version_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(version_utc)
      ORDER BY (user_id)
      PRIMARY KEY (user_id)
    `,
  });
  logger.info('[WeightForecastSchema] Created model_state table');
}

async function createForecastSummaryTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.forecast_summary (
        user_id String,
        generated_at_utc DateTime64(3, 'UTC'),
        horizon_days UInt16,
        confidence_level LowCardinality(String),
        status_chip LowCardinality(String),
        current_weight_kg Nullable(Float32),
        delta_vs_7d_avg_kg Nullable(Float32),
        goal_target_weight_kg Nullable(Float32),
        goal_target_date_local Nullable(Date),
        progress_percent Nullable(Float32),
        forecast_weight_low_kg_at_horizon Nullable(Float32),
        forecast_weight_high_kg_at_horizon Nullable(Float32),
        eta_weeks Nullable(Float32),
        eta_uncertainty_weeks Nullable(Float32),
        source_label Nullable(String),
        last_sync_relative Nullable(String),
        staleness_days Nullable(UInt16),
        version_utc DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(version_utc)
      ORDER BY (user_id)
      PRIMARY KEY (user_id)
    `,
  });
  logger.info('[WeightForecastSchema] Created forecast_summary table');
}

async function createForecastSeriesTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.forecast_series (
        user_id String,
        generated_at_utc DateTime64(3, 'UTC'),
        local_date_key Date,
        weight_mid_kg Nullable(Float32),
        weight_low_kg Nullable(Float32),
        weight_high_kg Nullable(Float32),
        confidence_level LowCardinality(String)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(local_date_key)
      ORDER BY (user_id, local_date_key)
      PRIMARY KEY (user_id, local_date_key)
      TTL local_date_key + INTERVAL 2 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created forecast_series table');
}

async function createForecastDriversTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.forecast_drivers (
        user_id String,
        generated_at_utc DateTime64(3, 'UTC'),
        rank UInt8,
        driver_id LowCardinality(String),
        title String,
        subtitle Nullable(String),
        confidence_level LowCardinality(String),
        deeplink String
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(generated_at_utc)
      ORDER BY (user_id, generated_at_utc, rank)
      PRIMARY KEY (user_id, generated_at_utc, rank)
      TTL generated_at_utc + INTERVAL 2 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created forecast_drivers table');
}

async function createSimulatorResultsTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.simulator_results (
        user_id String,
        generated_at_utc DateTime64(3, 'UTC'),
        lever_id LowCardinality(String),
        lever_title String,
        effort LowCardinality(String),
        forecast_low_kg_at_horizon Nullable(Float32),
        forecast_high_kg_at_horizon Nullable(Float32),
        eta_weeks Nullable(Float32),
        confidence_level LowCardinality(String)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(generated_at_utc)
      ORDER BY (user_id, generated_at_utc, lever_id)
      PRIMARY KEY (user_id, generated_at_utc, lever_id)
      TTL generated_at_utc + INTERVAL 2 YEAR
    `,
  });
  logger.info('[WeightForecastSchema] Created simulator_results table');
}

async function createRecomputeQueueTable(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS flo_ml.recompute_queue (
        event_id String,
        user_id String,
        reason LowCardinality(String),
        priority UInt8 DEFAULT 5,
        queued_at_utc DateTime64(3, 'UTC') DEFAULT now64(3),
        requested_local_date_key_optional Nullable(Date)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(queued_at_utc)
      ORDER BY (queued_at_utc)
      PRIMARY KEY (queued_at_utc)
      TTL queued_at_utc + INTERVAL 14 DAY
    `,
  });
  logger.info('[WeightForecastSchema] Created recompute_queue table');
}

async function createLatestWeightView(client: any): Promise<void> {
  await client.command({
    query: `
      CREATE OR REPLACE VIEW flo_ml.vw_latest_weight_per_user AS
      SELECT 
        user_id,
        argMax(weight_kg, timestamp_utc) AS weight_kg,
        max(timestamp_utc) AS timestamp_utc
      FROM flo_ml.raw_weight_events
      GROUP BY user_id
    `,
  });
  logger.info('[WeightForecastSchema] Created vw_latest_weight_per_user view');
}

/**
 * Queue a user for forecast recompute
 */
export async function queueForecastRecompute(
  userId: string,
  reason: 'new_weigh_in' | 'goal_change' | 'data_sync' | 'manual' | 'scheduled',
  priority: number = 5,
  localDateKey?: string
): Promise<boolean> {
  if (!isClickHouseEnabled()) return false;

  const client = getClickHouseClient();
  if (!client) return false;

  try {
    const eventId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await client.insert({
      table: 'flo_ml.recompute_queue',
      values: [{
        event_id: eventId,
        user_id: userId,
        reason,
        priority,
        queued_at_utc: new Date().toISOString(),
        requested_local_date_key_optional: localDateKey || null,
      }],
      format: 'JSONEachRow',
    });

    logger.info(`[WeightForecastSchema] Queued recompute for user ${userId}, reason: ${reason}`);
    return true;
  } catch (error) {
    logger.error('[WeightForecastSchema] Failed to queue recompute:', error);
    return false;
  }
}
