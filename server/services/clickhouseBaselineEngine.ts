import { clickhouse, isClickHouseEnabled, initializeClickHouse } from './clickhouseService';
import { getHealthId } from './supabaseHealthStorage';
import { createLogger } from '../utils/logger';
import { randomUUID } from 'crypto';

const logger = createLogger('ClickHouseML');

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
  percentile10: number | null;
  percentile25: number | null;
  percentile75: number | null;
  percentile90: number | null;
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
  modelConfidence: number;
}

export interface MLModelStats {
  modelId: string;
  healthId: string;
  modelType: string;
  trainedAt: Date;
  sampleCount: number;
  accuracy: number;
  precision: number;
  recall: number;
}

export class ClickHouseBaselineEngine {
  private initialized = false;

  async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;
    if (!isClickHouseEnabled()) {
      logger.warn('[ClickHouseML] ClickHouse not enabled');
      return false;
    }

    try {
      const success = await initializeClickHouse();
      this.initialized = success;
      return success;
    } catch (error) {
      logger.error('[ClickHouseML] Initialization failed:', error);
      return false;
    }
  }

  async syncHealthDataFromSupabase(healthId: string, daysBack: number = 30): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const startDateStr = startDate.toISOString().split('T')[0];

      const { data: metrics, error } = await supabase
        .from('user_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .gte('local_date', startDateStr)
        .order('local_date', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching from Supabase:', error);
        return 0;
      }

      if (!metrics || metrics.length === 0) {
        logger.debug(`[ClickHouseML] No metrics to sync for ${healthId}`);
        return 0;
      }

      const metricMappings: Record<string, string> = {
        hrv_ms: 'hrv',
        resting_hr_bpm: 'resting_heart_rate',
        steps_normalized: 'steps',
        active_energy_kcal: 'active_energy',
        sleep_hours: 'sleep_duration',
        exercise_minutes: 'exercise',
        weight_kg: 'weight',
        bmi: 'bmi',
      };

      const rows: any[] = [];

      for (const row of metrics) {
        for (const [dbField, metricType] of Object.entries(metricMappings)) {
          const value = row[dbField];
          if (value !== null && value !== undefined && !isNaN(value)) {
            rows.push({
              health_id: healthId,
              metric_type: metricType,
              value: Number(value),
              recorded_at: new Date(row.local_date + 'T12:00:00Z').toISOString(),
              local_date: row.local_date,
              source: 'healthkit',
            });
          }
        }
      }

      if (rows.length > 0) {
        await clickhouse.insert('health_metrics', rows);
        logger.info(`[ClickHouseML] Synced ${rows.length} metrics for ${healthId}`);
      }

      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Sync error:', error);
      return 0;
    }
  }

  async calculateBaselines(healthId: string, windowDays: number = 7): Promise<BaselineResult[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      const sql = `
        SELECT
          metric_type,
          avg(value) as mean_value,
          stddevPop(value) as std_dev,
          min(value) as min_value,
          max(value) as max_value,
          count() as sample_count,
          quantile(0.10)(value) as percentile_10,
          quantile(0.25)(value) as percentile_25,
          quantile(0.75)(value) as percentile_75,
          quantile(0.90)(value) as percentile_90
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL {windowDays:UInt8} DAY
        GROUP BY metric_type
        HAVING count() >= 3
      `;

      const rows = await clickhouse.query<{
        metric_type: string;
        mean_value: number;
        std_dev: number;
        min_value: number;
        max_value: number;
        sample_count: number;
        percentile_10: number;
        percentile_25: number;
        percentile_75: number;
        percentile_90: number;
      }>(sql, { healthId, windowDays });

      const results: BaselineResult[] = rows.map(r => ({
        metricType: r.metric_type,
        windowDays,
        meanValue: r.mean_value,
        stdDev: r.std_dev > 0 ? r.std_dev : null,
        minValue: r.min_value,
        maxValue: r.max_value,
        sampleCount: Number(r.sample_count),
        percentile10: r.percentile_10,
        percentile25: r.percentile_25,
        percentile75: r.percentile_75,
        percentile90: r.percentile_90,
      }));

      if (results.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const baselineRows = results.map(r => ({
          health_id: healthId,
          metric_type: r.metricType,
          baseline_date: today,
          window_days: windowDays,
          mean_value: r.meanValue,
          std_dev: r.stdDev || 0,
          min_value: r.minValue || 0,
          max_value: r.maxValue || 0,
          sample_count: r.sampleCount,
          percentile_10: r.percentile10 || 0,
          percentile_25: r.percentile25 || 0,
          percentile_75: r.percentile75 || 0,
          percentile_90: r.percentile90 || 0,
        }));

        await clickhouse.insert('metric_baselines', baselineRows);
      }

      logger.info(`[ClickHouseML] Calculated ${results.length} baselines for ${healthId}`);
      return results;
    } catch (error) {
      logger.error('[ClickHouseML] Baseline calculation error:', error);
      return [];
    }
  }

  async detectAnomalies(
    healthId: string,
    options: { windowDays?: number; lookbackHours?: number } = {}
  ): Promise<AnomalyResult[]> {
    const { windowDays = 7, lookbackHours = 48 } = options;

    if (!await this.ensureInitialized()) return [];

    try {
      const baselines = await this.calculateBaselines(healthId, windowDays);
      const baselineMap = new Map(baselines.map(b => [b.metricType, b]));

      const sql = `
        SELECT
          metric_type,
          avg(value) as current_value,
          count() as sample_count
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL {lookbackHours:UInt32} HOUR
        GROUP BY metric_type
        HAVING count() >= 1
      `;

      const recentMetrics = await clickhouse.query<{
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

        const historicalAccuracy = await this.getPatternAccuracy(healthId, null);
        const modelConfidence = Math.min(0.95, 0.5 + (historicalAccuracy * 0.4));

        anomalies.push({
          anomalyId: randomUUID(),
          metricType: metric.metric_type,
          currentValue: metric.current_value,
          baselineValue: baseline.meanValue,
          deviationPct,
          zScore,
          direction,
          severity,
          patternFingerprint: null,
          relatedMetrics: null,
          modelConfidence,
        });
      }

      const patternedAnomalies = this.detectMultiMetricPatterns(anomalies);

      if (patternedAnomalies.length > 0) {
        await this.storeAnomalies(healthId, patternedAnomalies);
      }

      logger.info(`[ClickHouseML] Detected ${patternedAnomalies.length} anomalies for ${healthId}`);
      return patternedAnomalies;
    } catch (error) {
      logger.error('[ClickHouseML] Anomaly detection error:', error);
      return [];
    }
  }

  private detectMultiMetricPatterns(anomalies: AnomalyResult[]): AnomalyResult[] {
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
              modelConfidence: Math.min(0.95, a.modelConfidence + 0.15),
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

  private async storeAnomalies(healthId: string, anomalies: AnomalyResult[]): Promise<void> {
    const rows = anomalies.map(a => ({
      anomaly_id: a.anomalyId,
      health_id: healthId,
      metric_type: a.metricType,
      current_value: a.currentValue,
      baseline_value: a.baselineValue,
      deviation_pct: a.deviationPct,
      z_score: a.zScore,
      direction: a.direction,
      severity: a.severity,
      pattern_fingerprint: a.patternFingerprint,
      related_metrics: a.relatedMetrics ? JSON.stringify(a.relatedMetrics) : null,
      model_confidence: a.modelConfidence,
    }));

    await clickhouse.insert('detected_anomalies', rows);
  }

  async recordFeedbackOutcome(
    healthId: string,
    anomalyId: string,
    userFeeling: number,
    wasConfirmed: boolean,
    feedbackText?: string
  ): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const outcome = wasConfirmed ? 'confirmed' : 'false_positive';

      await clickhouse.command(`
        ALTER TABLE flo_health.detected_anomalies
        UPDATE 
          resolved_at = now64(3),
          outcome = '${outcome}',
          user_feeling = ${userFeeling},
          feedback_text = ${feedbackText ? `'${feedbackText.replace(/'/g, "''")}'` : 'NULL'}
        WHERE anomaly_id = '${anomalyId}' AND health_id = '${healthId}'
      `);

      await this.updateMLTrainingData(healthId, anomalyId, wasConfirmed);

      logger.info(`[ClickHouseML] Recorded feedback for anomaly ${anomalyId}:`, { wasConfirmed, userFeeling });
    } catch (error) {
      logger.error('[ClickHouseML] Error recording feedback:', error);
    }
  }

  private async updateMLTrainingData(healthId: string, anomalyId: string, wasConfirmed: boolean): Promise<void> {
    try {
      const anomalyData = await clickhouse.query<{
        pattern_fingerprint: string | null;
        detected_at: string;
      }>(`
        SELECT pattern_fingerprint, detected_at
        FROM flo_health.detected_anomalies
        WHERE anomaly_id = {anomalyId:String} AND health_id = {healthId:String}
        LIMIT 1
      `, { anomalyId, healthId });

      if (anomalyData.length === 0) return;

      const pattern = anomalyData[0].pattern_fingerprint;
      const detectedDate = new Date(anomalyData[0].detected_at).toISOString().split('T')[0];

      const featureData = await clickhouse.query<{
        hrv_avg: number | null;
        rhr_avg: number | null;
        sleep_avg: number | null;
      }>(`
        SELECT
          avgIf(value, metric_type = 'hrv') as hrv_avg,
          avgIf(value, metric_type = 'resting_heart_rate') as rhr_avg,
          avgIf(value, metric_type = 'sleep_duration') as sleep_avg
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND local_date = {detectedDate:String}
      `, { healthId, detectedDate });

      if (featureData.length === 0) return;

      const label_illness = pattern === 'illness_precursor' && wasConfirmed ? 1 : 0;
      const label_recovery = pattern === 'recovery_deficit' && wasConfirmed ? 1 : 0;

      await clickhouse.insert('ml_training_data', [{
        health_id: healthId,
        feature_date: detectedDate,
        hrv_avg: featureData[0].hrv_avg,
        rhr_avg: featureData[0].rhr_avg,
        sleep_duration_avg: featureData[0].sleep_avg,
        label_illness,
        label_recovery_deficit: label_recovery,
      }]);

      logger.info(`[ClickHouseML] Updated training data for ${healthId}`);
    } catch (error) {
      logger.error('[ClickHouseML] Error updating training data:', error);
    }
  }

  async getPatternAccuracy(healthId: string, pattern: string | null): Promise<number> {
    if (!await this.ensureInitialized()) return 0.5;

    try {
      let sql = `
        SELECT
          countIf(outcome = 'confirmed') as confirmed,
          countIf(outcome = 'false_positive') as false_positive,
          count() as total
        FROM flo_health.detected_anomalies
        WHERE health_id = {healthId:String}
          AND outcome IS NOT NULL
      `;

      if (pattern) {
        sql += ` AND pattern_fingerprint = {pattern:String}`;
      }

      const result = await clickhouse.query<{
        confirmed: number;
        false_positive: number;
        total: number;
      }>(sql, { healthId, pattern });

      if (result.length === 0 || result[0].total === 0) {
        return 0.5;
      }

      return Number(result[0].confirmed) / Number(result[0].total);
    } catch (error) {
      logger.error('[ClickHouseML] Error getting pattern accuracy:', error);
      return 0.5;
    }
  }

  async getMLInsights(healthId: string): Promise<{
    totalPredictions: number;
    confirmedCount: number;
    falsePositiveCount: number;
    accuracyRate: number;
    patternBreakdown: Record<string, { total: number; confirmed: number; accuracy: number }>;
    recentAnomalies: AnomalyResult[];
  }> {
    if (!await this.ensureInitialized()) {
      return {
        totalPredictions: 0,
        confirmedCount: 0,
        falsePositiveCount: 0,
        accuracyRate: 0,
        patternBreakdown: {},
        recentAnomalies: [],
      };
    }

    try {
      const statsResult = await clickhouse.query<{
        pattern: string;
        total: number;
        confirmed: number;
      }>(`
        SELECT
          coalesce(pattern_fingerprint, 'single_metric') as pattern,
          count() as total,
          countIf(outcome = 'confirmed') as confirmed
        FROM flo_health.detected_anomalies
        WHERE health_id = {healthId:String}
          AND outcome IS NOT NULL
        GROUP BY pattern
      `, { healthId });

      const patternBreakdown: Record<string, { total: number; confirmed: number; accuracy: number }> = {};
      let totalPredictions = 0;
      let confirmedCount = 0;

      for (const row of statsResult) {
        const total = Number(row.total);
        const confirmed = Number(row.confirmed);
        totalPredictions += total;
        confirmedCount += confirmed;
        patternBreakdown[row.pattern] = {
          total,
          confirmed,
          accuracy: total > 0 ? confirmed / total : 0,
        };
      }

      const recentResult = await clickhouse.query<{
        anomaly_id: string;
        metric_type: string;
        current_value: number;
        baseline_value: number;
        deviation_pct: number;
        z_score: number | null;
        direction: string;
        severity: string;
        pattern_fingerprint: string | null;
        model_confidence: number;
      }>(`
        SELECT *
        FROM flo_health.detected_anomalies
        WHERE health_id = {healthId:String}
        ORDER BY detected_at DESC
        LIMIT 10
      `, { healthId });

      const recentAnomalies: AnomalyResult[] = recentResult.map(r => ({
        anomalyId: r.anomaly_id,
        metricType: r.metric_type,
        currentValue: r.current_value,
        baselineValue: r.baseline_value,
        deviationPct: r.deviation_pct,
        zScore: r.z_score,
        direction: r.direction as 'above' | 'below',
        severity: r.severity as 'low' | 'moderate' | 'high',
        patternFingerprint: r.pattern_fingerprint,
        relatedMetrics: null,
        modelConfidence: r.model_confidence,
      }));

      return {
        totalPredictions,
        confirmedCount,
        falsePositiveCount: totalPredictions - confirmedCount,
        accuracyRate: totalPredictions > 0 ? confirmedCount / totalPredictions : 0,
        patternBreakdown,
        recentAnomalies,
      };
    } catch (error) {
      logger.error('[ClickHouseML] Error getting ML insights:', error);
      return {
        totalPredictions: 0,
        confirmedCount: 0,
        falsePositiveCount: 0,
        accuracyRate: 0,
        patternBreakdown: {},
        recentAnomalies: [],
      };
    }
  }

  async getLearningContext(healthId: string): Promise<string> {
    const insights = await this.getMLInsights(healthId);

    if (insights.totalPredictions === 0) {
      return 'No historical prediction data available for this user yet. Using default thresholds.';
    }

    let context = `ML PREDICTION ACCURACY (ClickHouse):\n`;
    context += `- Total predictions: ${insights.totalPredictions}\n`;
    context += `- Confirmed correct: ${insights.confirmedCount} (${Math.round(insights.accuracyRate * 100)}%)\n`;
    context += `- False positives: ${insights.falsePositiveCount}\n\n`;

    context += `PATTERN-SPECIFIC ACCURACY:\n`;
    for (const [pattern, stats] of Object.entries(insights.patternBreakdown)) {
      context += `- ${pattern}: ${stats.confirmed}/${stats.total} (${Math.round(stats.accuracy * 100)}% accuracy)\n`;
    }

    if (insights.accuracyRate < 0.5) {
      context += `\n⚠️ Model accuracy is low for this user. Consider being more conservative with alerts.`;
    } else if (insights.accuracyRate > 0.8) {
      context += `\n✓ Model accuracy is high. Predictions for this user are typically reliable.`;
    }

    return context;
  }

  async simulateAnomaly(
    healthId: string,
    scenario: 'illness' | 'recovery' | 'single_metric'
  ): Promise<AnomalyResult[]> {
    let anomalies: AnomalyResult[];

    switch (scenario) {
      case 'illness':
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'wrist_temperature_deviation',
            currentValue: 0.6,
            baselineValue: 0.1,
            deviationPct: 500,
            zScore: 3.2,
            direction: 'above',
            severity: 'high',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: {
              wrist_temperature_deviation: { value: 0.6, deviation: 500 },
              respiratory_rate: { value: 18, deviation: 20 },
            },
            modelConfidence: 0.85,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'respiratory_rate',
            currentValue: 18,
            baselineValue: 15,
            deviationPct: 20,
            zScore: 2.1,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: null,
            modelConfidence: 0.75,
          },
        ];
        break;

      case 'recovery':
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'hrv',
            currentValue: 35,
            baselineValue: 55,
            deviationPct: -36,
            zScore: -2.5,
            direction: 'below',
            severity: 'high',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: {
              hrv: { value: 35, deviation: -36 },
              deep_sleep: { value: 30, deviation: -40 },
            },
            modelConfidence: 0.82,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'deep_sleep',
            currentValue: 30,
            baselineValue: 50,
            deviationPct: -40,
            zScore: -2.2,
            direction: 'below',
            severity: 'moderate',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: null,
            modelConfidence: 0.78,
          },
        ];
        break;

      case 'single_metric':
      default:
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'resting_heart_rate',
            currentValue: 72,
            baselineValue: 60,
            deviationPct: 20,
            zScore: 2.0,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: null,
            relatedMetrics: null,
            modelConfidence: 0.65,
          },
        ];
    }

    if (await this.ensureInitialized()) {
      await this.storeAnomalies(healthId, anomalies);
    }

    return anomalies;
  }
}

export const clickhouseBaselineEngine = new ClickHouseBaselineEngine();
