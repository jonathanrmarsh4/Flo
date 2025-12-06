import { BigQuery, Table } from '@google-cloud/bigquery';
import { logger } from '../utils/logger';

const DATASET_ID = 'flo_analytics';

function initializeBigQueryClient(): BigQuery | null {
  const serviceAccountJson = process.env.BIGQUERY_SERVICE_ACCOUNT_JSON;
  
  if (!serviceAccountJson) {
    logger.warn('[BigQuery] BIGQUERY_SERVICE_ACCOUNT_JSON not set - BigQuery features will be disabled');
    logger.info('[BigQuery] To enable BigQuery, add a service account JSON key as the BIGQUERY_SERVICE_ACCOUNT_JSON secret');
    return null;
  }

  try {
    const credentials = JSON.parse(serviceAccountJson);
    const projectId = credentials.project_id;

    if (!projectId) {
      logger.error('[BigQuery] Service account JSON missing project_id field');
      return null;
    }

    logger.info(`[BigQuery] Initializing with service account for project: ${projectId}`);
    
    return new BigQuery({
      credentials,
      projectId,
    });
  } catch (error) {
    logger.error('[BigQuery] Failed to parse BIGQUERY_SERVICE_ACCOUNT_JSON', { error });
    return null;
  }
}

export const bigQueryClient = initializeBigQueryClient();

export const TABLE_SCHEMAS = {
  health_metrics: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'metric_type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'value', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'unit', type: 'STRING', mode: 'NULLABLE' },
    { name: 'recorded_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'local_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'source', type: 'STRING', mode: 'NULLABLE' },
    { name: 'metadata', type: 'JSON', mode: 'NULLABLE' },
    { name: 'ingested_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ],

  biomarkers: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'biomarker_name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'value', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'unit', type: 'STRING', mode: 'NULLABLE' },
    { name: 'reference_low', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'reference_high', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'test_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'source_report', type: 'STRING', mode: 'NULLABLE' },
    { name: 'ingested_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ],

  life_events: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'event_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'event_type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'category', type: 'STRING', mode: 'NULLABLE' },
    { name: 'description', type: 'STRING', mode: 'NULLABLE' },
    { name: 'severity', type: 'INT64', mode: 'NULLABLE' },
    { name: 'occurred_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'metadata', type: 'JSON', mode: 'NULLABLE' },
    { name: 'ingested_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ],

  user_feedback: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'feedback_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'question_type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'question_text', type: 'STRING', mode: 'REQUIRED' },
    { name: 'response_value', type: 'INT64', mode: 'NULLABLE' },
    { name: 'response_boolean', type: 'BOOL', mode: 'NULLABLE' },
    { name: 'response_option', type: 'STRING', mode: 'NULLABLE' },
    { name: 'response_text', type: 'STRING', mode: 'NULLABLE' },
    { name: 'trigger_pattern', type: 'STRING', mode: 'NULLABLE' },
    { name: 'trigger_metrics', type: 'JSON', mode: 'NULLABLE' },
    { name: 'collected_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'collection_channel', type: 'STRING', mode: 'NULLABLE' },
  ],

  environmental_data: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'recorded_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'local_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'temperature_c', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'humidity_pct', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'aqi', type: 'INT64', mode: 'NULLABLE' },
    { name: 'uv_index', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'weather_condition', type: 'STRING', mode: 'NULLABLE' },
    { name: 'location_lat', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'location_lng', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'ingested_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ],

  cgm_readings: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'glucose_mg_dl', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'recorded_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'local_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'trend_direction', type: 'STRING', mode: 'NULLABLE' },
    { name: 'trend_rate', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'device_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'ingested_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ],

  baselines: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'metric_type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'baseline_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'window_days', type: 'INT64', mode: 'REQUIRED' },
    { name: 'mean_value', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'std_dev', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'min_value', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'max_value', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'sample_count', type: 'INT64', mode: 'REQUIRED' },
    { name: 'percentile_25', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'percentile_75', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'calculated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ],

  detected_anomalies: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'anomaly_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'detected_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'metric_type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'current_value', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'baseline_value', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'deviation_pct', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'z_score', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'direction', type: 'STRING', mode: 'REQUIRED' },
    { name: 'severity', type: 'STRING', mode: 'REQUIRED' },
    { name: 'pattern_fingerprint', type: 'STRING', mode: 'NULLABLE' },
    { name: 'related_metrics', type: 'JSON', mode: 'NULLABLE' },
    { name: 'resolved_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'outcome', type: 'STRING', mode: 'NULLABLE' },
  ],

  correlation_insights: [
    { name: 'health_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'insight_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'insight_type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'title', type: 'STRING', mode: 'REQUIRED' },
    { name: 'description', type: 'STRING', mode: 'REQUIRED' },
    { name: 'confidence', type: 'FLOAT64', mode: 'REQUIRED' },
    { name: 'metrics_involved', type: 'JSON', mode: 'NULLABLE' },
    { name: 'time_range_start', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'time_range_end', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'attribution', type: 'STRING', mode: 'NULLABLE' },
    { name: 'action_taken', type: 'STRING', mode: 'NULLABLE' },
    { name: 'user_feedback_id', type: 'STRING', mode: 'NULLABLE' },
  ],
};

export type TableName = keyof typeof TABLE_SCHEMAS;

class BigQueryService {
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private disabled = !bigQueryClient;

  isEnabled(): boolean {
    return !this.disabled;
  }

  async ensureInitialized(): Promise<void> {
    if (this.disabled || !bigQueryClient) {
      this.disabled = true;
      this.initialized = true;
      logger.debug('[BigQuery] Service disabled - skipping initialization');
      return;
    }
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.initialize().catch(error => {
      logger.error('[BigQuery] Initialization failed, disabling service', { error });
      this.disabled = true;
      this.initialized = true;
    });
    await this.initializationPromise;
  }

  private async initialize(): Promise<void> {
    if (!bigQueryClient) {
      this.disabled = true;
      this.initialized = true;
      logger.debug('[BigQuery] No BigQuery client available - service disabled');
      return;
    }

    try {
      logger.info('[BigQuery] Initializing BigQuery service...');

      const dataset = bigQueryClient.dataset(DATASET_ID);
      const [datasetExists] = await dataset.exists();

      if (!datasetExists) {
        logger.info(`[BigQuery] Creating dataset ${DATASET_ID}...`);
        await bigQueryClient.createDataset(DATASET_ID, {
          location: 'US',
        });
        logger.info(`[BigQuery] Dataset ${DATASET_ID} created`);
      }

      for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
        const table = dataset.table(tableName);
        const [tableExists] = await table.exists();

        if (!tableExists) {
          logger.info(`[BigQuery] Creating table ${tableName}...`);
          
          const options: any = {
            schema,
          };

          if (['health_metrics', 'cgm_readings', 'environmental_data'].includes(tableName)) {
            options.timePartitioning = {
              type: 'DAY',
              field: 'local_date',
            };
            options.clustering = {
              fields: ['health_id', 'metric_type'].filter(f => 
                schema.some((s: any) => s.name === f)
              ),
            };
          } else if (['baselines', 'detected_anomalies'].includes(tableName)) {
            options.timePartitioning = {
              type: 'DAY',
              field: tableName === 'baselines' ? 'baseline_date' : 'detected_at',
            };
            options.clustering = {
              fields: ['health_id'],
            };
          }

          await dataset.createTable(tableName, options);
          logger.info(`[BigQuery] Table ${tableName} created`);
        }
      }

      this.initialized = true;
      logger.info('[BigQuery] BigQuery service initialized successfully');
    } catch (error) {
      logger.error('[BigQuery] Failed to initialize BigQuery service', { error });
      throw error;
    }
  }

  async insertRows(tableName: TableName, rows: Record<string, any>[]): Promise<void> {
    await this.ensureInitialized();
    if (this.disabled || !bigQueryClient) {
      logger.debug(`[BigQuery] Skipping insert to ${tableName} (disabled)`);
      return;
    }

    try {
      const table = bigQueryClient.dataset(DATASET_ID).table(tableName);
      await table.insert(rows);
      logger.debug(`[BigQuery] Inserted ${rows.length} rows into ${tableName}`);
    } catch (error: any) {
      if (error.name === 'PartialFailureError') {
        logger.error('[BigQuery] Partial insert failure', {
          tableName,
          errors: error.errors?.slice(0, 5),
        });
      }
      throw error;
    }
  }

  async query<T = any>(sql: string, params?: Record<string, any>): Promise<T[]> {
    await this.ensureInitialized();
    if (this.disabled || !bigQueryClient) {
      logger.debug('[BigQuery] Skipping query (disabled)');
      return [];
    }

    try {
      const options: any = {
        query: sql,
        location: 'US',
      };

      if (params) {
        options.params = params;
      }

      const [rows] = await bigQueryClient.query(options);
      return rows as T[];
    } catch (error) {
      logger.error('[BigQuery] Query failed', { sql: sql.substring(0, 200), error });
      throw error;
    }
  }

  async getLatestBaseline(
    healthId: string,
    metricType: string,
    windowDays: number = 7
  ): Promise<{
    meanValue: number;
    stdDev: number | null;
    sampleCount: number;
  } | null> {
    const sql = `
      SELECT mean_value, std_dev, sample_count
      FROM \`${DATASET_ID}.baselines\`
      WHERE health_id = @healthId
        AND metric_type = @metricType
        AND window_days = @windowDays
      ORDER BY baseline_date DESC
      LIMIT 1
    `;

    const rows = await this.query<{
      mean_value: number;
      std_dev: number | null;
      sample_count: number;
    }>(sql, { healthId, metricType, windowDays });

    if (rows.length === 0) return null;

    return {
      meanValue: rows[0].mean_value,
      stdDev: rows[0].std_dev,
      sampleCount: rows[0].sample_count,
    };
  }

  async getRecentMetrics(
    healthId: string,
    metricType: string,
    hours: number = 48
  ): Promise<{ value: number; recordedAt: Date }[]> {
    const sql = `
      SELECT value, recorded_at
      FROM \`${DATASET_ID}.health_metrics\`
      WHERE health_id = @healthId
        AND metric_type = @metricType
        AND recorded_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours HOUR)
      ORDER BY recorded_at DESC
    `;

    const rows = await this.query<{
      value: number;
      recorded_at: { value: string };
    }>(sql, { healthId, metricType, hours });

    return rows.map(r => ({
      value: r.value,
      recordedAt: new Date(r.recorded_at.value),
    }));
  }

  async getDetectedAnomalies(
    healthId: string,
    since?: Date
  ): Promise<{
    anomalyId: string;
    metricType: string;
    deviationPct: number;
    severity: string;
    detectedAt: Date;
  }[]> {
    let sql = `
      SELECT anomaly_id, metric_type, deviation_pct, severity, detected_at
      FROM \`${DATASET_ID}.detected_anomalies\`
      WHERE health_id = @healthId
        AND resolved_at IS NULL
    `;

    const params: Record<string, any> = { healthId };

    if (since) {
      sql += ` AND detected_at >= @since`;
      params.since = since.toISOString();
    }

    sql += ` ORDER BY detected_at DESC LIMIT 50`;

    const rows = await this.query<{
      anomaly_id: string;
      metric_type: string;
      deviation_pct: number;
      severity: string;
      detected_at: { value: string };
    }>(sql, params);

    return rows.map(r => ({
      anomalyId: r.anomaly_id,
      metricType: r.metric_type,
      deviationPct: r.deviation_pct,
      severity: r.severity,
      detectedAt: new Date(r.detected_at.value),
    }));
  }

  async getCorrelationInsights(
    healthId: string,
    limit: number = 10
  ): Promise<{
    insightId: string;
    insightType: string;
    title: string;
    description: string;
    confidence: number;
    createdAt: Date;
  }[]> {
    const sql = `
      SELECT insight_id, insight_type, title, description, confidence, created_at
      FROM \`${DATASET_ID}.correlation_insights\`
      WHERE health_id = @healthId
      ORDER BY created_at DESC
      LIMIT @limit
    `;

    const rows = await this.query<{
      insight_id: string;
      insight_type: string;
      title: string;
      description: string;
      confidence: number;
      created_at: { value: string };
    }>(sql, { healthId, limit });

    return rows.map(r => ({
      insightId: r.insight_id,
      insightType: r.insight_type,
      title: r.title,
      description: r.description,
      confidence: r.confidence,
      createdAt: new Date(r.created_at.value),
    }));
  }

  async recordFeedback(
    healthId: string,
    feedbackId: string,
    data: {
      questionType: string;
      questionText: string;
      responseValue?: number;
      responseBoolean?: boolean;
      responseOption?: string;
      responseText?: string;
      triggerPattern?: string;
      triggerMetrics?: Record<string, any>;
      collectionChannel: 'voice' | 'push' | 'in_app';
    }
  ): Promise<void> {
    await this.insertRows('user_feedback', [{
      health_id: healthId,
      feedback_id: feedbackId,
      question_type: data.questionType,
      question_text: data.questionText,
      response_value: data.responseValue ?? null,
      response_boolean: data.responseBoolean ?? null,
      response_option: data.responseOption ?? null,
      response_text: data.responseText ?? null,
      trigger_pattern: data.triggerPattern ?? null,
      trigger_metrics: data.triggerMetrics ? JSON.stringify(data.triggerMetrics) : null,
      collected_at: new Date().toISOString(),
      collection_channel: data.collectionChannel,
    }]);
  }

  getDatasetId(): string {
    return DATASET_ID;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const bigQueryService = new BigQueryService();
