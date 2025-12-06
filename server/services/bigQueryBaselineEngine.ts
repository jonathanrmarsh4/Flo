import { bigQueryService } from './bigQueryService';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

const DATASET_ID = 'flo_analytics';

const METRIC_THRESHOLDS: Record<string, {
  zScoreThreshold: number;
  percentageThreshold: number;
  direction: 'both' | 'high' | 'low';
  severity: { moderate: number; high: number };
}> = {
  hrv: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  resting_heart_rate: {
    zScoreThreshold: 1.5,
    percentageThreshold: 8,
    direction: 'both',
    severity: { moderate: 8, high: 15 },
  },
  wrist_temperature_deviation: {
    zScoreThreshold: 2.0,
    percentageThreshold: 50,
    direction: 'high',
    severity: { moderate: 0.3, high: 0.5 },
  },
  respiratory_rate: {
    zScoreThreshold: 1.5,
    percentageThreshold: 10,
    direction: 'high',
    severity: { moderate: 10, high: 20 },
  },
  oxygen_saturation: {
    zScoreThreshold: 1.5,
    percentageThreshold: 2,
    direction: 'low',
    severity: { moderate: 2, high: 4 },
  },
  steps: {
    zScoreThreshold: 2.0,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  active_energy: {
    zScoreThreshold: 2.0,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  sleep_duration: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  deep_sleep: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'low',
    severity: { moderate: 20, high: 35 },
  },
  glucose: {
    zScoreThreshold: 2.0,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 30 },
  },
};

export interface BaselineResult {
  metricType: string;
  windowDays: number;
  meanValue: number;
  stdDev: number | null;
  minValue: number | null;
  maxValue: number | null;
  sampleCount: number;
  percentile25: number | null;
  percentile75: number | null;
}

export interface AnomalyResult {
  anomalyId: string;
  metricType: string;
  currentValue: number;
  baselineValue: number;
  deviationPct: number;
  zScore: number | null;
  direction: 'above' | 'below';
  severity: 'low' | 'moderate' | 'high';
  patternFingerprint: string | null;
  relatedMetrics: Record<string, any> | null;
}

export class BigQueryBaselineEngine {
  async calculateBaselines(healthId: string, windowDays: number = 7): Promise<BaselineResult[]> {
    if (!healthId) {
      logger.warn('[BaselineEngine] Cannot calculate baselines: healthId is null/undefined');
      return [];
    }

    if (!bigQueryService.isEnabled()) {
      logger.debug('[BaselineEngine] BigQuery is disabled, skipping baseline calculation');
      return [];
    }

    const sql = `
      WITH recent_metrics AS (
        SELECT
          metric_type,
          value,
          recorded_at
        FROM \`${DATASET_ID}.health_metrics\`
        WHERE health_id = @healthId
          AND recorded_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @windowDays DAY)
      )
      SELECT
        metric_type,
        AVG(value) as mean_value,
        STDDEV(value) as std_dev,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as sample_count,
        APPROX_QUANTILES(value, 4)[OFFSET(1)] as percentile_25,
        APPROX_QUANTILES(value, 4)[OFFSET(3)] as percentile_75
      FROM recent_metrics
      GROUP BY metric_type
      HAVING COUNT(*) >= 3
    `;

    try {
      const rows = await bigQueryService.query<{
        metric_type: string;
        mean_value: number;
        std_dev: number | null;
        min_value: number | null;
        max_value: number | null;
        sample_count: number;
        percentile_25: number | null;
        percentile_75: number | null;
      }>(sql, { healthId, windowDays });

      const results: BaselineResult[] = rows.map(r => ({
        metricType: r.metric_type,
        windowDays,
        meanValue: r.mean_value,
        stdDev: r.std_dev,
        minValue: r.min_value,
        maxValue: r.max_value,
        sampleCount: r.sample_count,
        percentile25: r.percentile_25,
        percentile75: r.percentile_75,
      }));

      const today = new Date().toISOString().split('T')[0];
      
      if (results.length > 0 && bigQueryService.isEnabled()) {
        try {
          const deleteSql = `
            DELETE FROM \`${DATASET_ID}.baselines\`
            WHERE health_id = @healthId 
              AND window_days = @windowDays 
              AND baseline_date = @today
          `;
          await bigQueryService.query(deleteSql, { healthId, windowDays, today });
        } catch (deleteError) {
          logger.debug('[BaselineEngine] No existing baselines to delete (or delete failed)', { deleteError });
        }

        const baselineRows = results.map(r => ({
          health_id: healthId,
          metric_type: r.metricType,
          baseline_date: today,
          window_days: windowDays,
          mean_value: r.meanValue,
          std_dev: r.stdDev,
          min_value: r.minValue,
          max_value: r.maxValue,
          sample_count: r.sampleCount,
          percentile_25: r.percentile25,
          percentile_75: r.percentile75,
          calculated_at: new Date().toISOString(),
        }));

        await bigQueryService.insertRows('baselines', baselineRows);
      }

      logger.info(`[BaselineEngine] Calculated ${results.length} baselines for ${healthId} (${windowDays}d window)`);
      return results;
    } catch (error) {
      logger.error('[BaselineEngine] Failed to calculate baselines', { healthId, error });
      throw error;
    }
  }

  async detectAnomalies(
    healthId: string,
    options: {
      windowDays?: number;
      lookbackHours?: number;
    } = {}
  ): Promise<AnomalyResult[]> {
    const { windowDays = 7, lookbackHours = 48 } = options;

    if (!healthId) {
      logger.warn('[BaselineEngine] Cannot detect anomalies: healthId is null/undefined');
      return [];
    }

    if (!bigQueryService.isEnabled()) {
      logger.debug('[BaselineEngine] BigQuery is disabled, skipping anomaly detection');
      return [];
    }

    try {
      const baselines = await this.calculateBaselines(healthId, windowDays);
      const baselineMap = new Map(baselines.map(b => [b.metricType, b]));

      const sql = `
        SELECT
          metric_type,
          AVG(value) as current_value,
          COUNT(*) as sample_count
        FROM \`${DATASET_ID}.health_metrics\`
        WHERE health_id = @healthId
          AND recorded_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookbackHours HOUR)
        GROUP BY metric_type
        HAVING COUNT(*) >= 1
      `;

      const recentMetrics = await bigQueryService.query<{
        metric_type: string;
        current_value: number;
        sample_count: number;
      }>(sql, { healthId, lookbackHours });

      const anomalies: AnomalyResult[] = [];

      for (const metric of recentMetrics) {
        const baseline = baselineMap.get(metric.metric_type);
        if (!baseline || baseline.sampleCount < 3) continue;

        const threshold = METRIC_THRESHOLDS[metric.metric_type];
        if (!threshold) continue;

        const deviation = metric.current_value - baseline.meanValue;
        const deviationPct = (deviation / baseline.meanValue) * 100;
        const zScore = baseline.stdDev && baseline.stdDev > 0
          ? deviation / baseline.stdDev
          : null;

        const absDeviationPct = Math.abs(deviationPct);
        const absZScore = zScore !== null ? Math.abs(zScore) : 0;

        const isAnomaly = absDeviationPct >= threshold.percentageThreshold ||
          (zScore !== null && absZScore >= threshold.zScoreThreshold);

        if (!isAnomaly) continue;

        const direction = deviation > 0 ? 'above' : 'below';
        if (threshold.direction === 'high' && direction === 'below') continue;
        if (threshold.direction === 'low' && direction === 'above') continue;

        let severity: 'low' | 'moderate' | 'high' = 'low';
        if (metric.metric_type === 'wrist_temperature_deviation') {
          const absValue = Math.abs(metric.current_value);
          if (absValue >= threshold.severity.high) severity = 'high';
          else if (absValue >= threshold.severity.moderate) severity = 'moderate';
        } else {
          if (absDeviationPct >= threshold.severity.high) severity = 'high';
          else if (absDeviationPct >= threshold.severity.moderate) severity = 'moderate';
        }

        const anomalyId = randomUUID();
        const anomaly: AnomalyResult = {
          anomalyId,
          metricType: metric.metric_type,
          currentValue: metric.current_value,
          baselineValue: baseline.meanValue,
          deviationPct,
          zScore,
          direction,
          severity,
          patternFingerprint: null,
          relatedMetrics: null,
        };

        anomalies.push(anomaly);
      }

      const patternedAnomalies = await this.detectMultiMetricPatterns(anomalies);

      if (patternedAnomalies.length > 0) {
        const anomalyRows = patternedAnomalies.map(a => ({
          health_id: healthId,
          anomaly_id: a.anomalyId,
          detected_at: new Date().toISOString(),
          metric_type: a.metricType,
          current_value: a.currentValue,
          baseline_value: a.baselineValue,
          deviation_pct: a.deviationPct,
          z_score: a.zScore,
          direction: a.direction,
          severity: a.severity,
          pattern_fingerprint: a.patternFingerprint,
          related_metrics: a.relatedMetrics ? JSON.stringify(a.relatedMetrics) : null,
          resolved_at: null,
          outcome: null,
        }));

        await bigQueryService.insertRows('detected_anomalies', anomalyRows);
        logger.info(`[BaselineEngine] Detected ${anomalyRows.length} anomalies for ${healthId}`);
      }

      return patternedAnomalies;
    } catch (error) {
      logger.error('[BaselineEngine] Failed to detect anomalies', { healthId, error });
      throw error;
    }
  }

  private async detectMultiMetricPatterns(anomalies: AnomalyResult[]): Promise<AnomalyResult[]> {
    if (anomalies.length < 2) return anomalies;

    const metricTypes = anomalies.map(a => a.metricType);

    const illnessIndicators = ['wrist_temperature_deviation', 'respiratory_rate', 'resting_heart_rate', 'hrv', 'oxygen_saturation'];
    const illnessMatches = metricTypes.filter(m => illnessIndicators.includes(m));

    if (illnessMatches.length >= 2) {
      const tempAnomaly = anomalies.find(a => a.metricType === 'wrist_temperature_deviation' && a.direction === 'above');
      const respAnomaly = anomalies.find(a => a.metricType === 'respiratory_rate' && a.direction === 'above');
      const rhrAnomaly = anomalies.find(a => a.metricType === 'resting_heart_rate' && a.direction === 'above');
      const hrvAnomaly = anomalies.find(a => a.metricType === 'hrv' && a.direction === 'below');
      const o2Anomaly = anomalies.find(a => a.metricType === 'oxygen_saturation' && a.direction === 'below');

      const patternMatches = [tempAnomaly, respAnomaly, rhrAnomaly, hrvAnomaly, o2Anomaly].filter(Boolean);

      if (patternMatches.length >= 2) {
        const patternFingerprint = 'illness_precursor';
        const relatedMetrics = Object.fromEntries(
          patternMatches.map(a => [a!.metricType, { value: a!.currentValue, deviation: a!.deviationPct }])
        );

        return anomalies.map(a => {
          if (patternMatches.some(p => p?.metricType === a.metricType)) {
            return {
              ...a,
              patternFingerprint,
              relatedMetrics,
              severity: 'high' as const,
            };
          }
          return a;
        });
      }
    }

    const recoveryIndicators = ['hrv', 'resting_heart_rate', 'sleep_duration', 'deep_sleep'];
    const recoveryMatches = metricTypes.filter(m => recoveryIndicators.includes(m));

    if (recoveryMatches.length >= 2) {
      const hrvLow = anomalies.find(a => a.metricType === 'hrv' && a.direction === 'below');
      const sleepLow = anomalies.find(a => ['sleep_duration', 'deep_sleep'].includes(a.metricType) && a.direction === 'below');

      if (hrvLow && sleepLow) {
        const patternFingerprint = 'recovery_deficit';
        const relatedMetrics = {
          [hrvLow.metricType]: { value: hrvLow.currentValue, deviation: hrvLow.deviationPct },
          [sleepLow.metricType]: { value: sleepLow.currentValue, deviation: sleepLow.deviationPct },
        };

        return anomalies.map(a => {
          if (a.metricType === hrvLow.metricType || a.metricType === sleepLow.metricType) {
            return { ...a, patternFingerprint, relatedMetrics };
          }
          return a;
        });
      }
    }

    return anomalies;
  }

  async getActiveAnomalies(healthId: string): Promise<AnomalyResult[]> {
    const anomalies = await bigQueryService.getDetectedAnomalies(healthId);
    return anomalies.map(a => ({
      anomalyId: a.anomalyId,
      metricType: a.metricType,
      currentValue: 0,
      baselineValue: 0,
      deviationPct: a.deviationPct,
      zScore: null,
      direction: 'above' as const,
      severity: a.severity as 'low' | 'moderate' | 'high',
      patternFingerprint: null,
      relatedMetrics: null,
    }));
  }

  async resolveAnomaly(
    anomalyId: string,
    outcome: 'confirmed' | 'false_positive' | 'unknown'
  ): Promise<void> {
    const sql = `
      UPDATE \`${DATASET_ID}.detected_anomalies\`
      SET resolved_at = CURRENT_TIMESTAMP(),
          outcome = @outcome
      WHERE anomaly_id = @anomalyId
    `;

    await bigQueryService.query(sql, { anomalyId, outcome });
    logger.info(`[BaselineEngine] Resolved anomaly ${anomalyId} as ${outcome}`);
  }
}

export const bigQueryBaselineEngine = new BigQueryBaselineEngine();
