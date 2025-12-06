import { bigQueryService, TableName } from './bigQueryService';
import { getSupabaseClient } from './supabaseClient';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

const supabase = getSupabaseClient();

interface SyncResult {
  table: string;
  rowsSynced: number;
  success: boolean;
  error?: string;
}

export class BigQuerySyncService {
  async syncHealthMetrics(healthId: string, metrics: {
    metricType: string;
    value: number;
    unit?: string;
    recordedAt: Date;
    localDate: string;
    source?: string;
    metadata?: Record<string, any>;
  }[]): Promise<SyncResult> {
    try {
      if (!healthId) {
        logger.debug('[BigQuerySync] Skipping health metrics sync: no healthId provided');
        return { table: 'health_metrics', rowsSynced: 0, success: true };
      }
      if (metrics.length === 0) {
        return { table: 'health_metrics', rowsSynced: 0, success: true };
      }

      const rows = metrics.map(m => ({
        health_id: healthId,
        metric_type: m.metricType,
        value: m.value,
        unit: m.unit ?? null,
        recorded_at: m.recordedAt.toISOString(),
        local_date: m.localDate,
        source: m.source ?? 'healthkit',
        metadata: m.metadata ? JSON.stringify(m.metadata) : null,
        ingested_at: new Date().toISOString(),
      }));

      await bigQueryService.insertRows('health_metrics', rows);

      logger.info(`[BigQuerySync] Synced ${rows.length} health metrics for ${healthId}`);
      return { table: 'health_metrics', rowsSynced: rows.length, success: true };
    } catch (error: any) {
      logger.error('[BigQuerySync] Failed to sync health metrics', { healthId, error });
      return { table: 'health_metrics', rowsSynced: 0, success: false, error: error.message };
    }
  }

  async syncBiomarkers(healthId: string, biomarkers: {
    biomarkerName: string;
    value: number;
    unit?: string;
    referenceLow?: number;
    referenceHigh?: number;
    testDate: string;
    sourceReport?: string;
  }[]): Promise<SyncResult> {
    try {
      if (!healthId) {
        logger.debug('[BigQuerySync] Skipping biomarkers sync: no healthId provided');
        return { table: 'biomarkers', rowsSynced: 0, success: true };
      }
      if (biomarkers.length === 0) {
        return { table: 'biomarkers', rowsSynced: 0, success: true };
      }

      const rows = biomarkers.map(b => ({
        health_id: healthId,
        biomarker_name: b.biomarkerName,
        value: b.value,
        unit: b.unit ?? null,
        reference_low: b.referenceLow ?? null,
        reference_high: b.referenceHigh ?? null,
        test_date: b.testDate,
        source_report: b.sourceReport ?? null,
        ingested_at: new Date().toISOString(),
      }));

      await bigQueryService.insertRows('biomarkers', rows);

      logger.info(`[BigQuerySync] Synced ${rows.length} biomarkers for ${healthId}`);
      return { table: 'biomarkers', rowsSynced: rows.length, success: true };
    } catch (error: any) {
      logger.error('[BigQuerySync] Failed to sync biomarkers', { healthId, error });
      return { table: 'biomarkers', rowsSynced: 0, success: false, error: error.message };
    }
  }

  async syncLifeEvents(healthId: string, events: {
    eventId: string;
    eventType: string;
    category?: string;
    description?: string;
    severity?: number;
    occurredAt: Date;
    metadata?: Record<string, any>;
  }[]): Promise<SyncResult> {
    try {
      if (!healthId) {
        logger.debug('[BigQuerySync] Skipping life events sync: no healthId provided');
        return { table: 'life_events', rowsSynced: 0, success: true };
      }
      if (events.length === 0) {
        return { table: 'life_events', rowsSynced: 0, success: true };
      }

      const rows = events.map(e => ({
        health_id: healthId,
        event_id: e.eventId,
        event_type: e.eventType,
        category: e.category ?? null,
        description: e.description ?? null,
        severity: e.severity ?? null,
        occurred_at: e.occurredAt.toISOString(),
        metadata: e.metadata ? JSON.stringify(e.metadata) : null,
        ingested_at: new Date().toISOString(),
      }));

      await bigQueryService.insertRows('life_events', rows);

      logger.info(`[BigQuerySync] Synced ${rows.length} life events for ${healthId}`);
      return { table: 'life_events', rowsSynced: rows.length, success: true };
    } catch (error: any) {
      logger.error('[BigQuerySync] Failed to sync life events', { healthId, error });
      return { table: 'life_events', rowsSynced: 0, success: false, error: error.message };
    }
  }

  async syncEnvironmentalData(healthId: string, data: {
    recordedAt: Date;
    localDate: string;
    temperatureC?: number;
    humidityPct?: number;
    aqi?: number;
    uvIndex?: number;
    weatherCondition?: string;
    locationLat?: number;
    locationLng?: number;
  }[]): Promise<SyncResult> {
    try {
      if (!healthId) {
        logger.debug('[BigQuerySync] Skipping environmental data sync: no healthId provided');
        return { table: 'environmental_data', rowsSynced: 0, success: true };
      }
      if (data.length === 0) {
        return { table: 'environmental_data', rowsSynced: 0, success: true };
      }

      const rows = data.map(d => ({
        health_id: healthId,
        recorded_at: d.recordedAt.toISOString(),
        local_date: d.localDate,
        temperature_c: d.temperatureC ?? null,
        humidity_pct: d.humidityPct ?? null,
        aqi: d.aqi ?? null,
        uv_index: d.uvIndex ?? null,
        weather_condition: d.weatherCondition ?? null,
        location_lat: d.locationLat ?? null,
        location_lng: d.locationLng ?? null,
        ingested_at: new Date().toISOString(),
      }));

      await bigQueryService.insertRows('environmental_data', rows);

      logger.info(`[BigQuerySync] Synced ${rows.length} environmental records for ${healthId}`);
      return { table: 'environmental_data', rowsSynced: rows.length, success: true };
    } catch (error: any) {
      logger.error('[BigQuerySync] Failed to sync environmental data', { healthId, error });
      return { table: 'environmental_data', rowsSynced: 0, success: false, error: error.message };
    }
  }

  async syncCGMReadings(healthId: string, readings: {
    glucoseMgDl: number;
    recordedAt: Date;
    localDate: string;
    trendDirection?: string;
    trendRate?: number;
    deviceId?: string;
  }[]): Promise<SyncResult> {
    try {
      if (!healthId) {
        logger.debug('[BigQuerySync] Skipping CGM readings sync: no healthId provided');
        return { table: 'cgm_readings', rowsSynced: 0, success: true };
      }
      if (readings.length === 0) {
        return { table: 'cgm_readings', rowsSynced: 0, success: true };
      }

      const rows = readings.map(r => ({
        health_id: healthId,
        glucose_mg_dl: r.glucoseMgDl,
        recorded_at: r.recordedAt.toISOString(),
        local_date: r.localDate,
        trend_direction: r.trendDirection ?? null,
        trend_rate: r.trendRate ?? null,
        device_id: r.deviceId ?? null,
        ingested_at: new Date().toISOString(),
      }));

      await bigQueryService.insertRows('cgm_readings', rows);

      logger.info(`[BigQuerySync] Synced ${rows.length} CGM readings for ${healthId}`);
      return { table: 'cgm_readings', rowsSynced: rows.length, success: true };
    } catch (error: any) {
      logger.error('[BigQuerySync] Failed to sync CGM readings', { healthId, error });
      return { table: 'cgm_readings', rowsSynced: 0, success: false, error: error.message };
    }
  }

  async backfillUserFromSupabase(healthId: string): Promise<{
    results: SyncResult[];
    totalRows: number;
  }> {
    const results: SyncResult[] = [];
    let totalRows = 0;

    if (!healthId) {
      logger.warn('[BigQuerySync] Cannot backfill: no healthId provided');
      return { results, totalRows };
    }

    try {
      logger.info(`[BigQuerySync] Starting backfill for user ${healthId}`);

      const { data: dailyMetrics } = await supabase
        .from('user_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .order('local_date', { ascending: false });

      if (dailyMetrics && dailyMetrics.length > 0) {
        const healthMetrics: any[] = [];

        for (const day of dailyMetrics) {
          const date = day.local_date;
          const recordedAt = new Date(`${date}T12:00:00Z`);

          if (day.hrv_normalized) {
            healthMetrics.push({
              metricType: 'hrv',
              value: day.hrv_normalized,
              unit: 'ms',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (day.rhr_normalized) {
            healthMetrics.push({
              metricType: 'resting_heart_rate',
              value: day.rhr_normalized,
              unit: 'bpm',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (day.steps_normalized) {
            healthMetrics.push({
              metricType: 'steps',
              value: day.steps_normalized,
              unit: 'count',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (day.active_kcal_normalized) {
            healthMetrics.push({
              metricType: 'active_energy',
              value: day.active_kcal_normalized,
              unit: 'kcal',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (day.respiratory_rate) {
            healthMetrics.push({
              metricType: 'respiratory_rate',
              value: day.respiratory_rate,
              unit: 'breaths/min',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (day.oxygen_saturation) {
            healthMetrics.push({
              metricType: 'oxygen_saturation',
              value: day.oxygen_saturation,
              unit: '%',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (day.wrist_temp_deviation_celsius) {
            healthMetrics.push({
              metricType: 'wrist_temperature_deviation',
              value: day.wrist_temp_deviation_celsius,
              unit: 'celsius',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
        }

        const metricsResult = await this.syncHealthMetrics(healthId, healthMetrics);
        results.push(metricsResult);
        totalRows += metricsResult.rowsSynced;
      }

      const { data: sleepNights } = await supabase
        .from('sleep_nights')
        .select('*')
        .eq('health_id', healthId)
        .order('sleep_date', { ascending: false });

      if (sleepNights && sleepNights.length > 0) {
        const sleepMetrics = sleepNights.flatMap(night => {
          const metrics: any[] = [];
          const date = night.sleep_date;
          const recordedAt = new Date(`${date}T08:00:00Z`);

          if (night.total_sleep_min) {
            metrics.push({
              metricType: 'sleep_duration',
              value: night.total_sleep_min,
              unit: 'minutes',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (night.deep_sleep_min) {
            metrics.push({
              metricType: 'deep_sleep',
              value: night.deep_sleep_min,
              unit: 'minutes',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }
          if (night.rem_sleep_min) {
            metrics.push({
              metricType: 'rem_sleep',
              value: night.rem_sleep_min,
              unit: 'minutes',
              recordedAt,
              localDate: date,
              source: 'backfill',
            });
          }

          return metrics;
        });

        const sleepResult = await this.syncHealthMetrics(healthId, sleepMetrics);
        results.push({ ...sleepResult, table: 'health_metrics (sleep)' });
        totalRows += sleepResult.rowsSynced;
      }

      const { data: biomarkers } = await supabase
        .from('biomarker_results')
        .select('*')
        .eq('health_id', healthId)
        .order('test_date', { ascending: false });

      if (biomarkers && biomarkers.length > 0) {
        const biomarkerData = biomarkers.map(b => ({
          biomarkerName: b.biomarker_name,
          value: b.value,
          unit: b.unit,
          referenceLow: b.reference_low,
          referenceHigh: b.reference_high,
          testDate: b.test_date,
          sourceReport: b.source_report_id,
        }));

        const bioResult = await this.syncBiomarkers(healthId, biomarkerData);
        results.push(bioResult);
        totalRows += bioResult.rowsSynced;
      }

      const { data: lifeEvents } = await supabase
        .from('life_events')
        .select('*')
        .eq('health_id', healthId)
        .order('occurred_at', { ascending: false });

      if (lifeEvents && lifeEvents.length > 0) {
        const eventData = lifeEvents.map(e => ({
          eventId: e.id,
          eventType: e.event_type || 'unknown',
          category: e.category,
          description: e.description,
          severity: e.severity,
          occurredAt: new Date(e.occurred_at),
          metadata: e.metadata,
        }));

        const eventsResult = await this.syncLifeEvents(healthId, eventData);
        results.push(eventsResult);
        totalRows += eventsResult.rowsSynced;
      }

      const { data: weather } = await supabase
        .from('weather_daily_cache')
        .select('*')
        .eq('health_id', healthId)
        .order('date', { ascending: false });

      if (weather && weather.length > 0) {
        const envData = weather.map(w => ({
          recordedAt: new Date(`${w.date}T12:00:00Z`),
          localDate: w.date,
          temperatureC: w.temperature_celsius,
          humidityPct: w.humidity_percent,
          aqi: w.aqi,
          uvIndex: w.uv_index,
          weatherCondition: w.weather_condition,
          locationLat: w.latitude,
          locationLng: w.longitude,
        }));

        const envResult = await this.syncEnvironmentalData(healthId, envData);
        results.push(envResult);
        totalRows += envResult.rowsSynced;
      }

      logger.info(`[BigQuerySync] Backfill complete for ${healthId}: ${totalRows} total rows`);
      return { results, totalRows };
    } catch (error: any) {
      logger.error('[BigQuerySync] Backfill failed', { healthId, error });
      throw error;
    }
  }

  async syncOnHealthKitIngestion(
    healthId: string,
    ingestedData: {
      dailyMetrics?: Record<string, any>;
      sleepNight?: Record<string, any>;
      workoutSession?: Record<string, any>;
      nutritionData?: Record<string, any>;
    }
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    try {
      const { dailyMetrics, sleepNight } = ingestedData;

      if (dailyMetrics) {
        const date = dailyMetrics.local_date || new Date().toISOString().split('T')[0];
        const recordedAt = new Date();
        const metrics: any[] = [];

        const metricMappings = [
          { key: 'hrv', type: 'hrv', unit: 'ms' },
          { key: 'rhr', type: 'resting_heart_rate', unit: 'bpm' },
          { key: 'steps', type: 'steps', unit: 'count' },
          { key: 'active_kcal', type: 'active_energy', unit: 'kcal' },
          { key: 'respiratory_rate', type: 'respiratory_rate', unit: 'breaths/min' },
          { key: 'oxygen_saturation', type: 'oxygen_saturation', unit: '%' },
          { key: 'wrist_temp_deviation', type: 'wrist_temperature_deviation', unit: 'celsius' },
          { key: 'walking_heart_rate_avg', type: 'walking_heart_rate', unit: 'bpm' },
        ];

        for (const mapping of metricMappings) {
          const value = dailyMetrics[mapping.key] ?? dailyMetrics[`${mapping.key}_normalized`];
          if (value !== null && value !== undefined) {
            metrics.push({
              metricType: mapping.type,
              value,
              unit: mapping.unit,
              recordedAt,
              localDate: date,
              source: 'healthkit_sync',
            });
          }
        }

        if (metrics.length > 0) {
          const result = await this.syncHealthMetrics(healthId, metrics);
          results.push(result);
        }
      }

      if (sleepNight) {
        const date = sleepNight.sleep_date || new Date().toISOString().split('T')[0];
        const recordedAt = new Date();
        const metrics: any[] = [];

        if (sleepNight.total_sleep_min) {
          metrics.push({
            metricType: 'sleep_duration',
            value: sleepNight.total_sleep_min,
            unit: 'minutes',
            recordedAt,
            localDate: date,
            source: 'healthkit_sync',
          });
        }
        if (sleepNight.deep_sleep_min) {
          metrics.push({
            metricType: 'deep_sleep',
            value: sleepNight.deep_sleep_min,
            unit: 'minutes',
            recordedAt,
            localDate: date,
            source: 'healthkit_sync',
          });
        }
        if (sleepNight.rem_sleep_min) {
          metrics.push({
            metricType: 'rem_sleep',
            value: sleepNight.rem_sleep_min,
            unit: 'minutes',
            recordedAt,
            localDate: date,
            source: 'healthkit_sync',
          });
        }

        if (metrics.length > 0) {
          const result = await this.syncHealthMetrics(healthId, metrics);
          results.push({ ...result, table: 'health_metrics (sleep)' });
        }
      }

      return results;
    } catch (error: any) {
      logger.error('[BigQuerySync] Failed to sync on HealthKit ingestion', { healthId, error });
      return results;
    }
  }
}

export const bigQuerySyncService = new BigQuerySyncService();
