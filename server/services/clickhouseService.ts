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
      request_timeout: 30000,
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
          outcome Nullable(LowCardinality(String)),
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

    logger.info('[ClickHouse] All tables initialized successfully');
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
