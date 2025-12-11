/**
 * ClickHouse Health Data Sync
 * 
 * Syncs health metrics from multiple sources to ClickHouse for ML analysis.
 * Ensures source field is properly populated for segregation.
 */

import { clickhouse } from './clickhouseService';
import type { DataSource } from '@shared/dataSource';
import type { FloSleepNight } from './ouraApiClient';

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
    const results = await clickhouse.query<{ value: number; recorded_at: string; local_date: string }>(
      `SELECT value, recorded_at, local_date
       FROM flo_health.health_metrics FINAL
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
    const results = await clickhouse.query<{ source: string }>(
      `SELECT DISTINCT source
       FROM flo_health.health_metrics FINAL
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
