import { createClient, ClickHouseClient } from '@clickhouse/client';
import { createLogger } from '../utils/logger';

const logger = createLogger('ClickHouse');

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient | null {
  if (client) return client;

  const host = process.env.CLICKHOUSE_HOST;
  const username = process.env.CLICKHOUSE_USER || 'default';
  const password = process.env.CLICKHOUSE_PASSWORD;

  if (!host || !password) {
    logger.warn('[ClickHouse] CLICKHOUSE_HOST and CLICKHOUSE_PASSWORD not set - ClickHouse features disabled');
    return null;
  }

  try {
    client = createClient({
      url: host.startsWith('https://') ? host : `https://${host}`,
      username,
      password,
      request_timeout: 90000,
      compression: {
        request: true,
        response: true,
      },
    });

    logger.info(`[ClickHouse] Connected to ${host}`);
    return client;
  } catch (error) {
    logger.error('[ClickHouse] Failed to create client:', error);
    return null;
  }
}

export function isClickHouseEnabled(): boolean {
  return !!process.env.CLICKHOUSE_HOST && !!process.env.CLICKHOUSE_PASSWORD;
}

export async function initializeClickHouse(): Promise<boolean> {
  const ch = getClickHouseClient();
  if (!ch) return false;

  try {
    await ch.command({
      query: `CREATE DATABASE IF NOT EXISTS flo_health`,
    });

    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.health_metrics (
          health_id String,
          metric_type LowCardinality(String),
          value Float64,
          recorded_at DateTime64(3),
          local_date Date,
          source LowCardinality(String) DEFAULT 'healthkit',
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, metric_type, recorded_at)
        TTL local_date + INTERVAL 5 YEAR
      `,
    });

    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.metric_baselines (
          health_id String,
          metric_type LowCardinality(String),
          baseline_date Date,
          window_days UInt8,
          mean_value Float64,
          std_dev Float64,
          min_value Float64,
          max_value Float64,
          sample_count UInt32,
          percentile_10 Float64,
          percentile_25 Float64,
          percentile_75 Float64,
          percentile_90 Float64,
          calculated_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(calculated_at)
        PARTITION BY toYYYYMM(baseline_date)
        ORDER BY (health_id, metric_type, baseline_date, window_days)
      `,
    });

    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.detected_anomalies (
          anomaly_id UUID DEFAULT generateUUIDv4(),
          health_id String,
          detected_at DateTime64(3) DEFAULT now64(3),
          metric_type LowCardinality(String),
          current_value Float64,
          baseline_value Float64,
          deviation_pct Float64,
          z_score Nullable(Float64),
          direction LowCardinality(String),
          severity LowCardinality(String),
          pattern_fingerprint Nullable(String),
          related_metrics Nullable(String),
          model_confidence Float64 DEFAULT 0.0,
          resolved_at Nullable(DateTime64(3)),
          outcome LowCardinality(Nullable(String)),
          user_feeling Nullable(UInt8),
          feedback_text Nullable(String)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(detected_at)
        ORDER BY (health_id, detected_at, anomaly_id)
      `,
    });

    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.correlation_insights (
          insight_id UUID DEFAULT generateUUIDv4(),
          health_id String,
          created_at DateTime64(3) DEFAULT now64(3),
          insight_type LowCardinality(String),
          title String,
          description String,
          confidence Float64,
          metrics_involved Array(String),
          time_range_start Nullable(DateTime64(3)),
          time_range_end Nullable(DateTime64(3)),
          attribution Nullable(String),
          was_helpful Nullable(Bool),
          user_feedback Nullable(String)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (health_id, created_at, insight_id)
      `,
    });

    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.user_feedback (
          feedback_id UUID DEFAULT generateUUIDv4(),
          health_id String,
          collected_at DateTime64(3) DEFAULT now64(3),
          question_type LowCardinality(String),
          question_text String,
          response_value Nullable(Int32),
          response_boolean Nullable(Bool),
          response_option Nullable(String),
          response_text Nullable(String),
          trigger_pattern Nullable(String),
          trigger_metrics Nullable(String),
          anomaly_id Nullable(UUID),
          collection_channel LowCardinality(String) DEFAULT 'in_app'
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(collected_at)
        ORDER BY (health_id, collected_at, feedback_id)
      `,
    });

    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.ml_training_data (
          health_id String,
          feature_date Date,
          hrv_avg Nullable(Float64),
          hrv_std Nullable(Float64),
          rhr_avg Nullable(Float64),
          rhr_std Nullable(Float64),
          sleep_duration_avg Nullable(Float64),
          deep_sleep_avg Nullable(Float64),
          steps_avg Nullable(Float64),
          active_kcal_avg Nullable(Float64),
          wrist_temp_avg Nullable(Float64),
          resp_rate_avg Nullable(Float64),
          o2_sat_avg Nullable(Float64),
          hrv_trend Float64 DEFAULT 0,
          rhr_trend Float64 DEFAULT 0,
          sleep_trend Float64 DEFAULT 0,
          label_illness UInt8 DEFAULT 0,
          label_recovery_deficit UInt8 DEFAULT 0,
          label_stress UInt8 DEFAULT 0,
          created_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(feature_date)
        ORDER BY (health_id, feature_date)
      `,
    });

    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.anomaly_model_state (
          model_id String,
          health_id String,
          model_type LowCardinality(String),
          trained_at DateTime64(3) DEFAULT now64(3),
          sample_count UInt32,
          accuracy Float64,
          precision_score Float64,
          recall_score Float64,
          feature_importance String,
          model_params String,
          is_active UInt8 DEFAULT 1
        )
        ENGINE = ReplacingMergeTree(trained_at)
        ORDER BY (health_id, model_type, model_id)
      `,
    });

    // Comprehensive nutrition data table
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.nutrition_metrics (
          health_id String,
          local_date Date,
          energy_kcal Nullable(Float64),
          protein_g Nullable(Float64),
          carbohydrates_g Nullable(Float64),
          fat_total_g Nullable(Float64),
          fat_saturated_g Nullable(Float64),
          fat_monounsaturated_g Nullable(Float64),
          fat_polyunsaturated_g Nullable(Float64),
          fiber_g Nullable(Float64),
          sugar_g Nullable(Float64),
          sodium_mg Nullable(Float64),
          potassium_mg Nullable(Float64),
          calcium_mg Nullable(Float64),
          iron_mg Nullable(Float64),
          magnesium_mg Nullable(Float64),
          zinc_mg Nullable(Float64),
          vitamin_a_mcg Nullable(Float64),
          vitamin_c_mg Nullable(Float64),
          vitamin_d_mcg Nullable(Float64),
          vitamin_e_mg Nullable(Float64),
          vitamin_k_mcg Nullable(Float64),
          vitamin_b6_mg Nullable(Float64),
          vitamin_b12_mcg Nullable(Float64),
          folate_mcg Nullable(Float64),
          water_ml Nullable(Float64),
          caffeine_mg Nullable(Float64),
          cholesterol_mg Nullable(Float64),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, local_date)
      `,
    });

    // Biomarker/blood work data table
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.biomarkers (
          health_id String,
          biomarker_id String,
          biomarker_name LowCardinality(String),
          value Float64,
          unit Nullable(String),
          reference_low Nullable(Float64),
          reference_high Nullable(Float64),
          test_date Date,
          session_id Nullable(String),
          source LowCardinality(String) DEFAULT 'blood_work',
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(test_date)
        ORDER BY (health_id, biomarker_name, test_date, biomarker_id)
      `,
    });

    // Life events table for behavioral context
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.life_events (
          health_id String,
          event_id String,
          event_type LowCardinality(String),
          category Nullable(String),
          description Nullable(String),
          severity Nullable(Int8),
          occurred_at DateTime64(3),
          local_date Date,
          metadata Nullable(String),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, event_type, local_date, event_id)
      `,
    });

    // Environmental data (location, weather, AQI)
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.environmental_data (
          health_id String,
          local_date Date,
          latitude Nullable(Float64),
          longitude Nullable(Float64),
          temperature_c Nullable(Float64),
          humidity_pct Nullable(Float64),
          pressure_hpa Nullable(Float64),
          uv_index Nullable(Float64),
          aqi Nullable(Int32),
          pm25 Nullable(Float64),
          pm10 Nullable(Float64),
          ozone Nullable(Float64),
          no2 Nullable(Float64),
          so2 Nullable(Float64),
          co Nullable(Float64),
          nh3 Nullable(Float64),
          weather_condition Nullable(String),
          heat_stress_score Nullable(Float64),
          air_quality_impact Nullable(Float64),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, local_date)
      `,
    });
    
    // Add new AQI columns to existing tables (safe no-op if columns already exist)
    const newAqiColumns = ['so2', 'co', 'nh3'];
    for (const col of newAqiColumns) {
      try {
        await ch.command({
          query: `ALTER TABLE flo_health.environmental_data ADD COLUMN IF NOT EXISTS ${col} Nullable(Float64)`,
        });
      } catch (e) {
        // Column may already exist, ignore
      }
    }

    // DEXA / Body composition scans
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.body_composition (
          health_id String,
          scan_id String,
          scan_date Date,
          scan_type LowCardinality(String) DEFAULT 'dexa',
          total_body_fat_pct Nullable(Float64),
          visceral_fat_mass_g Nullable(Float64),
          visceral_fat_area_cm2 Nullable(Float64),
          total_lean_mass_kg Nullable(Float64),
          appendicular_lean_mass_kg Nullable(Float64),
          bone_mineral_density Nullable(Float64),
          bone_mineral_content_g Nullable(Float64),
          android_fat_pct Nullable(Float64),
          gynoid_fat_pct Nullable(Float64),
          trunk_fat_pct Nullable(Float64),
          leg_fat_pct Nullable(Float64),
          arm_fat_pct Nullable(Float64),
          resting_metabolic_rate Nullable(Float64),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(scan_date)
        ORDER BY (health_id, scan_date, scan_id)
      `,
    });

    // User demographics / profile data
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.user_demographics (
          health_id String,
          birth_year Nullable(Int32),
          sex LowCardinality(String),
          height_cm Nullable(Float64),
          weight_kg Nullable(Float64),
          activity_level LowCardinality(String),
          timezone Nullable(String),
          updated_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (health_id)
      `,
    });

    // Daily readiness / recovery scores
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.readiness_scores (
          health_id String,
          local_date Date,
          readiness_score Int32,
          readiness_zone LowCardinality(String),
          recovery_component Nullable(Int32),
          sleep_component Nullable(Int32),
          strain_component Nullable(Int32),
          hrv_component Nullable(Int32),
          environmental_impact Nullable(Float64),
          recovery_boost Nullable(Float64),
          factors Nullable(String),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, local_date)
      `,
    });

    // CGM glucose data (future integration - schema ready)
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.cgm_glucose (
          health_id String,
          reading_id String,
          glucose_mg_dl Float64,
          reading_type LowCardinality(String),
          recorded_at DateTime64(3),
          local_date Date,
          device_name Nullable(String),
          device_manufacturer Nullable(String),
          trend_direction Nullable(String),
          is_calibration Nullable(UInt8),
          meal_context Nullable(String),
          exercise_context Nullable(String),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, local_date, recorded_at, reading_id)
      `,
    });

    // Training load / strain tracking
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.training_load (
          health_id String,
          local_date Date,
          acute_load Float64,
          chronic_load Float64,
          training_load_ratio Float64,
          strain_score Nullable(Float64),
          workout_count Int32,
          total_workout_minutes Int32,
          total_active_kcal Float64,
          zone_distribution Nullable(String),
          recovery_status LowCardinality(String),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, local_date)
      `,
    });

    // Pattern Library - stores confirmed patterns for long-term memory
    // Enables "we've seen this pattern before" recognition
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.pattern_library (
          pattern_id String,
          health_id String,
          pattern_fingerprint String,
          pattern_name String,
          pattern_description Nullable(String),
          first_observed Date,
          last_observed Date,
          occurrence_count UInt32 DEFAULT 1,
          confirmation_count UInt32 DEFAULT 0,
          false_positive_count UInt32 DEFAULT 0,
          confidence_score Float64 DEFAULT 0.5,
          typical_duration_days Nullable(Float64),
          typical_outcome Nullable(String),
          outcome_details Nullable(String),
          seasonal_pattern Nullable(String),
          metric_signature String,
          average_z_scores String,
          preceding_events Nullable(String),
          created_at DateTime64(3) DEFAULT now64(3),
          updated_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (health_id, pattern_fingerprint, pattern_id)
      `,
    });

    // Pattern Occurrences - individual instances of detected patterns
    // Links anomaly detections to pattern library entries
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.pattern_occurrences (
          occurrence_id String,
          health_id String,
          pattern_id String,
          anomaly_id String,
          detected_at DateTime64(3),
          detection_date Date,
          z_scores String,
          metric_values String,
          severity LowCardinality(String),
          outcome Nullable(String),
          outcome_recorded_at Nullable(DateTime64(3)),
          user_notes Nullable(String),
          created_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(detection_date)
        ORDER BY (health_id, pattern_id, detected_at, occurrence_id)
      `,
    });

    // CGM Learned Baselines - population baselines from synthetic CGM data
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.cgm_learned_baselines (
          baseline_id String,
          pattern_type LowCardinality(String) DEFAULT '',
          hour_of_day UInt8 DEFAULT 0,
          scenario LowCardinality(String) DEFAULT '',
          mean_glucose Float64,
          std_glucose Float64,
          p10_glucose Float64 DEFAULT 0,
          p25_glucose Float64 DEFAULT 0,
          p50_glucose Float64 DEFAULT 0,
          p75_glucose Float64 DEFAULT 0,
          p90_glucose Float64 DEFAULT 0,
          threshold_hypo Float64 DEFAULT 70,
          threshold_hyper Float64 DEFAULT 180,
          sample_count UInt32,
          trained_at DateTime64(3) DEFAULT now64(3),
          model_version String DEFAULT 'v1'
        )
        ENGINE = ReplacingMergeTree(trained_at)
        ORDER BY (pattern_type, hour_of_day, scenario, baseline_id)
      `,
    });

    // Biomarker Learned Baselines - population baselines from NHANES/medical literature
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.biomarker_learned_baselines (
          baseline_id String,
          biomarker_name LowCardinality(String),
          age_group String DEFAULT '',
          sex String DEFAULT '',
          stratification_type LowCardinality(String),
          mean_value Float64,
          std_value Float64,
          p5_value Float64,
          p10_value Float64,
          p25_value Float64,
          p50_value Float64,
          p75_value Float64,
          p90_value Float64,
          p95_value Float64,
          min_value Float64,
          max_value Float64,
          sample_count UInt32,
          unit String,
          data_source String DEFAULT 'NHANES',
          trained_at DateTime64(3) DEFAULT now64(3),
          model_version String DEFAULT 'v1'
        )
        ENGINE = ReplacingMergeTree(trained_at)
        ORDER BY (biomarker_name, stratification_type, age_group, sex, baseline_id)
      `,
    });

    // HealthKit Learned Baselines - population baselines from synthetic wearable data
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.healthkit_learned_baselines (
          baseline_id String,
          metric_type LowCardinality(String),
          hour_of_day Int8 DEFAULT -1,
          day_of_week Int8 DEFAULT -1,
          age_group String DEFAULT '',
          activity_level String DEFAULT '',
          chronotype String DEFAULT '',
          stratification_type LowCardinality(String),
          mean_value Float64,
          std_value Float64,
          p5_value Float64,
          p10_value Float64,
          p25_value Float64,
          p50_value Float64,
          p75_value Float64,
          p90_value Float64,
          p95_value Float64,
          min_value Float64,
          max_value Float64,
          sample_count UInt32,
          unit String,
          data_source String DEFAULT 'synthetic',
          trained_at DateTime64(3) DEFAULT now64(3),
          model_version String DEFAULT 'v1'
        )
        ENGINE = ReplacingMergeTree(trained_at)
        ORDER BY (metric_type, stratification_type, hour_of_day, day_of_week, baseline_id)
      `,
    });

    // Behavior Events - Timestamped behavioral tags extracted from HealthKit
    // Enables segmentation into behavioral phases for correlation analysis
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.behavior_events (
          health_id String,
          event_id String,
          local_date Date,
          event_time DateTime64(3),
          behavior_type LowCardinality(String),
          behavior_subtype Nullable(String),
          value Nullable(Float64),
          duration_minutes Nullable(Float64),
          time_of_day LowCardinality(String),
          day_of_week UInt8,
          metadata Nullable(String),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, behavior_type, local_date, event_id)
        TTL local_date + INTERVAL 5 YEAR
      `,
    });

    // Weekly Behavior Cohorts - Aggregated weekly behavioral patterns
    // Used for cohort comparison (e.g., "high workout weeks" vs "low workout weeks")
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.weekly_behavior_cohorts (
          health_id String,
          week_start Date,
          workout_count UInt32,
          workout_total_minutes Float64,
          avg_workout_time_of_day Float64,
          morning_workout_count UInt32,
          afternoon_workout_count UInt32,
          evening_workout_count UInt32,
          workout_consistency_score Float64,
          avg_caffeine_mg Nullable(Float64),
          late_caffeine_days UInt32,
          avg_calories_kcal Nullable(Float64),
          protein_target_hit_days UInt32,
          avg_sleep_duration_hours Nullable(Float64),
          avg_bedtime_hour Nullable(Float64),
          bedtime_consistency_score Nullable(Float64),
          stress_events_count UInt32,
          alcohol_days UInt32,
          travel_days UInt32,
          sick_days UInt32,
          cohort_tags Array(String),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(week_start)
        ORDER BY (health_id, week_start)
      `,
    });

    // Weekly Outcome Rollups - Aggregated weekly health outcomes
    // Paired with behavior cohorts for correlation analysis
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.weekly_outcome_rollups (
          health_id String,
          week_start Date,
          avg_hrv Nullable(Float64),
          hrv_trend Float64,
          avg_resting_hr Nullable(Float64),
          rhr_trend Float64,
          avg_sleep_duration_hours Nullable(Float64),
          avg_deep_sleep_hours Nullable(Float64),
          avg_rem_sleep_hours Nullable(Float64),
          avg_sleep_efficiency Nullable(Float64),
          sleep_quality_trend Float64,
          avg_readiness_score Nullable(Float64),
          avg_strain_score Nullable(Float64),
          avg_steps Nullable(Float64),
          avg_active_energy Nullable(Float64),
          avg_wrist_temp_deviation Nullable(Float64),
          avg_respiratory_rate Nullable(Float64),
          avg_o2_saturation Nullable(Float64),
          illness_days UInt32,
          anomaly_count UInt32,
          recovery_quality_score Nullable(Float64),
          avg_energy Nullable(Float64),
          avg_clarity Nullable(Float64),
          avg_mood Nullable(Float64),
          avg_composite_score Nullable(Float64),
          survey_response_count UInt32 DEFAULT 0,
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(week_start)
        ORDER BY (health_id, week_start)
      `,
    });

    // Long-Term Correlations - Discovered behavior-outcome correlations
    // Statistical analysis results from 6+ month data
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.long_term_correlations (
          correlation_id String,
          health_id String,
          discovered_at DateTime64(3) DEFAULT now64(3),
          behavior_type LowCardinality(String),
          behavior_description String,
          outcome_type LowCardinality(String),
          outcome_description String,
          effect_direction LowCardinality(String),
          effect_size_pct Float64,
          effect_size_absolute Nullable(Float64),
          confidence_level Float64,
          p_value Float64,
          sample_size_behavior UInt32,
          sample_size_control UInt32,
          time_range_months UInt32,
          statistical_test LowCardinality(String),
          cohort_definition String,
          control_definition String,
          confounders_controlled Array(String),
          is_actionable UInt8 DEFAULT 1,
          natural_language_insight String,
          user_acknowledged UInt8 DEFAULT 0,
          acknowledged_at Nullable(DateTime64(3)),
          user_feedback Nullable(String),
          was_helpful Nullable(UInt8)
        )
        ENGINE = ReplacingMergeTree(discovered_at)
        PARTITION BY toYYYYMM(discovered_at)
        ORDER BY (health_id, behavior_type, outcome_type, correlation_id)
      `,
    });

    // Subjective Surveys - Daily 3PM check-in surveys for ML pattern analysis
    // Captures user-reported energy, mental clarity, and mood
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.subjective_surveys (
          survey_id String,
          health_id String,
          recorded_at DateTime64(3),
          local_date Date,
          local_time String,
          timezone String,
          energy UInt8,
          clarity UInt8,
          mood UInt8,
          composite_score Float64,
          trigger_source LowCardinality(String) DEFAULT 'notification',
          response_latency_seconds Nullable(Int32),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, local_date, survey_id)
        TTL local_date + INTERVAL 5 YEAR
      `,
    });

    // AI Feedback Questions - Dynamic questions generated from anomaly patterns
    // Enables contextual follow-up questions like "How are you feeling 1-10?"
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.ai_feedback_questions (
          question_id String,
          health_id String,
          created_at DateTime64(3) DEFAULT now64(3),
          expires_at DateTime64(3),
          trigger_type LowCardinality(String),
          trigger_anomaly_ids Array(String),
          trigger_patterns Array(String),
          trigger_metrics String,
          question_text String,
          question_type LowCardinality(String),
          response_options Nullable(String),
          priority UInt8 DEFAULT 5,
          was_shown UInt8 DEFAULT 0,
          shown_at Nullable(DateTime64(3)),
          was_answered UInt8 DEFAULT 0,
          answered_at Nullable(DateTime64(3)),
          response_value Nullable(Int32),
          response_text Nullable(String),
          channel LowCardinality(String) DEFAULT 'in_app'
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (health_id, created_at, question_id)
        TTL expires_at + INTERVAL 7 DAY
      `,
    });

    // Daily user insights for morning briefing ML pipeline
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.daily_user_insights (
          health_id String,
          event_date Date,
          event_timestamp DateTime64(3) DEFAULT now64(3),
          context_type LowCardinality(String) DEFAULT 'morning_briefing',
          baselines String,
          today String,
          deviations String,
          tags Array(String),
          insight_candidates String,
          readiness_score Nullable(Float64),
          sleep_hours Nullable(Float64),
          deep_sleep_minutes Nullable(Float64),
          hrv_avg Nullable(Float64),
          rhr_avg Nullable(Float64),
          steps Nullable(Float64),
          active_energy Nullable(Float64),
          workout_minutes Nullable(Float64),
          weather_temp_c Nullable(Float64),
          weather_condition Nullable(String),
          created_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(created_at)
        PARTITION BY toYYYYMM(event_date)
        ORDER BY (health_id, event_date, context_type)
        TTL event_date + INTERVAL 2 YEAR
      `,
    });

    // Morning briefing log for tracking AI-generated briefings and user feedback
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.morning_briefing_log (
          briefing_id UUID DEFAULT generateUUIDv4(),
          health_id String,
          event_date Date,
          created_at DateTime64(3) DEFAULT now64(3),
          ai_request_payload String,
          ai_response_payload String,
          push_text Nullable(String),
          primary_focus Nullable(String),
          secondary_focus Nullable(String),
          recommended_actions Nullable(String),
          push_status LowCardinality(String) DEFAULT 'pending',
          push_sent_at Nullable(DateTime64(3)),
          push_error Nullable(String),
          opened_at Nullable(DateTime64(3)),
          clicked_through UInt8 DEFAULT 0,
          user_feedback LowCardinality(Nullable(String)),
          feedback_comment Nullable(String),
          feedback_at Nullable(DateTime64(3)),
          trigger_source LowCardinality(String) DEFAULT 'sleep_end'
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(event_date)
        ORDER BY (health_id, event_date, briefing_id)
        TTL event_date + INTERVAL 2 YEAR
      `,
    });

    // Daily Behavior Factors - Unified daily aggregation of all behavior types
    // Enables day-level attribution analysis when outcome anomalies are detected
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.daily_behavior_factors (
          health_id String,
          local_date Date,
          factor_category LowCardinality(String),
          factor_key LowCardinality(String),
          numeric_value Nullable(Float64),
          string_value Nullable(String),
          time_value Nullable(DateTime64(3)),
          deviation_from_baseline Nullable(Float64),
          baseline_value Nullable(Float64),
          is_notable UInt8 DEFAULT 0,
          source LowCardinality(String),
          metadata Nullable(String),
          ingested_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(ingested_at)
        PARTITION BY toYYYYMM(local_date)
        ORDER BY (health_id, local_date, factor_category, factor_key)
        TTL local_date + INTERVAL 5 YEAR
      `,
    });

    // Anomaly Attributions - Links detected anomalies to co-occurring behavior factors
    // Powers the "what caused this?" hypothesis generation
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.anomaly_attributions (
          attribution_id UUID DEFAULT generateUUIDv4(),
          health_id String,
          anomaly_date Date,
          outcome_metric LowCardinality(String),
          outcome_value Float64,
          outcome_deviation_pct Float64,
          attributed_factors String,
          hypothesis_text String,
          confidence_score Float64,
          supporting_stats String,
          experiment_suggested UInt8 DEFAULT 0,
          experiment_outcome Nullable(String),
          user_feedback Nullable(String),
          was_helpful Nullable(UInt8),
          created_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(anomaly_date)
        ORDER BY (health_id, anomaly_date, attribution_id)
        TTL anomaly_date + INTERVAL 3 YEAR
      `,
    });

    // User Learned Thresholds - Personalized anomaly detection thresholds based on feedback
    // Adjusts sensitivity per metric based on confirmed vs false positive feedback
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.user_learned_thresholds (
          health_id String,
          metric_type LowCardinality(String),
          z_score_threshold Float64,
          percentage_threshold Float64,
          false_positive_count UInt32 DEFAULT 0,
          confirmed_count UInt32 DEFAULT 0,
          last_feedback_at DateTime64(3) DEFAULT now64(3),
          threshold_adjustment_factor Float64 DEFAULT 1.0,
          notes Nullable(String),
          updated_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (health_id, metric_type)
        TTL updated_at + INTERVAL 5 YEAR
      `,
    });

    // User Feedback Analysis - Stores analyzed free-text feedback for ML context
    // Extracts themes and patterns from user-provided feedback text
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.user_feedback_analysis (
          feedback_id String,
          health_id String,
          feedback_source LowCardinality(String),
          original_text String,
          extracted_themes Array(String),
          sentiment LowCardinality(String),
          actionable_insight Nullable(String),
          related_metrics Array(String),
          created_at DateTime64(3) DEFAULT now64(3)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (health_id, created_at, feedback_id)
        TTL created_at + INTERVAL 3 YEAR
      `,
    });

    // Survey-Outcome Correlations - Links 3PM survey scores to preceding behavior patterns
    // Enables ML to learn what behaviors predict good/bad subjective outcomes
    await ch.command({
      query: `
        CREATE TABLE IF NOT EXISTS flo_health.survey_outcome_correlations (
          correlation_id String,
          health_id String,
          survey_date Date,
          survey_outcome LowCardinality(String),
          outcome_value Float64,
          correlated_behaviors String,
          correlation_strength Float64,
          sample_size UInt32,
          discovery_date DateTime64(3) DEFAULT now64(3),
          is_actionable UInt8 DEFAULT 1,
          user_notified UInt8 DEFAULT 0
        )
        ENGINE = ReplacingMergeTree(discovery_date)
        ORDER BY (health_id, survey_date, correlation_id)
        TTL survey_date + INTERVAL 3 YEAR
      `,
    });

    logger.info('[ClickHouse] All tables initialized successfully (including ML learned baselines, long-term correlation engine, behavior attribution, morning briefing, and adaptive thresholds)');
    return true;
  } catch (error) {
    logger.error('[ClickHouse] Failed to initialize tables:', error);
    return false;
  }
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const ch = getClickHouseClient();
  if (!ch) {
    throw new Error('ClickHouse client not initialized');
  }

  const result = await ch.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });

  return result.json<T>();
}

export async function insert(
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const ch = getClickHouseClient();
  if (!ch) {
    throw new Error('ClickHouse client not initialized');
  }

  await ch.insert({
    table: `flo_health.${table}`,
    values: rows,
    format: 'JSONEachRow',
  });
}

export async function command(sql: string): Promise<void> {
  const ch = getClickHouseClient();
  if (!ch) {
    throw new Error('ClickHouse client not initialized');
  }

  await ch.command({ query: sql });
}

export async function healthCheck(): Promise<{ connected: boolean; version?: string; error?: string }> {
  try {
    const ch = getClickHouseClient();
    if (!ch) {
      return { connected: false, error: 'Client not initialized' };
    }

    const result = await ch.query({
      query: 'SELECT version() as version',
      format: 'JSONEachRow',
    });

    const data = await result.json<{ version: string }>();
    return { connected: true, version: data[0]?.version };
  } catch (error) {
    return { connected: false, error: String(error) };
  }
}

export const clickhouse = {
  getClient: getClickHouseClient,
  isEnabled: isClickHouseEnabled,
  initialize: initializeClickHouse,
  query,
  insert,
  command,
  healthCheck,
};
