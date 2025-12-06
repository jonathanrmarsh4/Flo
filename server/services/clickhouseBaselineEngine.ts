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

      // Comprehensive mapping of ALL health metrics from user_daily_metrics
      const metricMappings: Record<string, string> = {
        // Core HealthKit metrics
        hrv_ms: 'hrv',
        resting_hr_bpm: 'resting_heart_rate',
        steps_normalized: 'steps',
        active_energy_kcal: 'active_energy',
        sleep_hours: 'sleep_duration',
        exercise_minutes: 'exercise',
        weight_kg: 'weight',
        bmi: 'bmi',
        // Extended vital signs
        walking_hr_avg_bpm: 'walking_heart_rate',
        oxygen_saturation_pct: 'oxygen_saturation',
        respiratory_rate_bpm: 'respiratory_rate',
        body_temp_celsius: 'body_temperature',
        basal_energy_kcal: 'basal_energy',
        dietary_water_ml: 'water_intake',
        // Wrist temperature
        wrist_temp_baseline_c: 'wrist_temperature_baseline',
        wrist_temp_deviation_c: 'wrist_temperature_deviation',
        // Sleep metrics
        deep_sleep_hours: 'deep_sleep',
        rem_sleep_hours: 'rem_sleep',
        core_sleep_hours: 'core_sleep',
        sleep_awakenings: 'sleep_awakenings',
        time_in_bed_hours: 'time_in_bed',
        sleep_latency_min: 'sleep_latency',
        // Body composition
        body_fat_pct: 'body_fat',
        lean_mass_kg: 'lean_mass',
        // Activity metrics
        stand_hours: 'stand_hours',
        flights_climbed: 'flights_climbed',
        distance_km: 'distance',
        // Mindfulness
        mindfulness_minutes: 'mindfulness',
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

  // ==================== COMPREHENSIVE DATA SYNC METHODS ====================

  async syncNutritionData(healthId: string, daysBack: number = 90): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const startDateStr = startDate.toISOString().split('T')[0];

      const { data: nutrition, error } = await supabase
        .from('nutrition_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .gte('local_date', startDateStr)
        .order('local_date', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching nutrition from Supabase:', error);
        return 0;
      }

      if (!nutrition || nutrition.length === 0) {
        logger.debug(`[ClickHouseML] No nutrition data to sync for ${healthId}`);
        return 0;
      }

      const rows = nutrition.map(n => ({
        health_id: healthId,
        local_date: n.local_date,
        energy_kcal: n.energy_kcal,
        protein_g: n.protein_g,
        carbohydrates_g: n.carbohydrates_g,
        fat_total_g: n.fat_total_g,
        fat_saturated_g: n.fat_saturated_g,
        fat_monounsaturated_g: n.fat_monounsaturated_g,
        fat_polyunsaturated_g: n.fat_polyunsaturated_g,
        fiber_g: n.fiber_g,
        sugar_g: n.sugar_g,
        sodium_mg: n.sodium_mg,
        potassium_mg: n.potassium_mg,
        calcium_mg: n.calcium_mg,
        iron_mg: n.iron_mg,
        magnesium_mg: n.magnesium_mg,
        zinc_mg: n.zinc_mg,
        vitamin_a_mcg: n.vitamin_a_mcg,
        vitamin_c_mg: n.vitamin_c_mg,
        vitamin_d_mcg: n.vitamin_d_mcg,
        vitamin_e_mg: n.vitamin_e_mg,
        vitamin_k_mcg: n.vitamin_k_mcg,
        vitamin_b6_mg: n.vitamin_b6_mg,
        vitamin_b12_mcg: n.vitamin_b12_mcg,
        folate_mcg: n.folate_mcg,
        water_ml: n.dietary_water_ml,
        caffeine_mg: n.caffeine_mg,
        cholesterol_mg: n.cholesterol_mg,
      }));

      await clickhouse.insert('nutrition_metrics', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} nutrition records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Nutrition sync error:', error);
      return 0;
    }
  }

  async syncBiomarkerData(healthId: string, daysBack: number = 365): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Get all biomarker measurements with their sessions
      const { data: measurements, error } = await supabase
        .from('biomarker_measurements')
        .select(`
          *,
          biomarker_test_sessions!inner (
            test_date,
            health_id,
            source
          )
        `)
        .eq('biomarker_test_sessions.health_id', healthId)
        .gte('biomarker_test_sessions.test_date', startDateStr)
        .order('biomarker_test_sessions(test_date)', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching biomarkers from Supabase:', error);
        return 0;
      }

      if (!measurements || measurements.length === 0) {
        logger.debug(`[ClickHouseML] No biomarker data to sync for ${healthId}`);
        return 0;
      }

      const rows = measurements.map(m => ({
        health_id: healthId,
        biomarker_id: m.id,
        biomarker_name: m.biomarker_id || 'unknown',
        value: m.value,
        unit: m.unit,
        reference_low: m.reference_low,
        reference_high: m.reference_high,
        test_date: m.biomarker_test_sessions?.test_date,
        session_id: m.session_id,
        source: m.biomarker_test_sessions?.source || 'blood_work',
      }));

      await clickhouse.insert('biomarkers', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} biomarker records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Biomarker sync error:', error);
      return 0;
    }
  }

  async syncLifeEvents(healthId: string, daysBack: number = 180): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const { data: events, error } = await supabase
        .from('life_events')
        .select('*')
        .eq('health_id', healthId)
        .gte('occurred_at', startDate.toISOString())
        .order('occurred_at', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching life events from Supabase:', error);
        return 0;
      }

      if (!events || events.length === 0) {
        logger.debug(`[ClickHouseML] No life events to sync for ${healthId}`);
        return 0;
      }

      const rows = events.map(e => ({
        health_id: healthId,
        event_id: e.id,
        event_type: e.event_type || 'unknown',
        category: e.category,
        description: e.description,
        severity: e.severity,
        occurred_at: new Date(e.occurred_at).toISOString(),
        local_date: new Date(e.occurred_at).toISOString().split('T')[0],
        metadata: e.parsed_data ? JSON.stringify(e.parsed_data) : null,
      }));

      await clickhouse.insert('life_events', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} life events for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Life events sync error:', error);
      return 0;
    }
  }

  async syncEnvironmentalData(healthId: string, daysBack: number = 90): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Get weather/environmental data
      const { data: weather, error } = await supabase
        .from('weather_daily_cache')
        .select('*')
        .eq('health_id', healthId)
        .gte('date', startDateStr)
        .order('date', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching weather from Supabase:', error);
        return 0;
      }

      if (!weather || weather.length === 0) {
        logger.debug(`[ClickHouseML] No environmental data to sync for ${healthId}`);
        return 0;
      }

      const rows = weather.map(w => ({
        health_id: healthId,
        local_date: w.date,
        latitude: w.latitude,
        longitude: w.longitude,
        temperature_c: w.temperature_celsius,
        humidity_pct: w.humidity_percent,
        pressure_hpa: w.pressure_hpa,
        uv_index: w.uv_index,
        aqi: w.aqi,
        pm25: w.pm25,
        pm10: w.pm10,
        ozone: w.ozone,
        no2: w.no2,
        weather_condition: w.condition,
        heat_stress_score: null, // Can be calculated
        air_quality_impact: w.aqi ? (w.aqi > 100 ? (w.aqi - 100) / 100 : 0) : null,
      }));

      await clickhouse.insert('environmental_data', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} environmental records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Environmental sync error:', error);
      return 0;
    }
  }

  async syncBodyCompositionData(healthId: string): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      // Get DEXA scans from diagnostics_studies
      const { data: dexaScans, error } = await supabase
        .from('diagnostics_studies')
        .select('*')
        .eq('health_id', healthId)
        .eq('type', 'dexa_scan')
        .order('study_date', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching DEXA from Supabase:', error);
        return 0;
      }

      if (!dexaScans || dexaScans.length === 0) {
        logger.debug(`[ClickHouseML] No body composition data to sync for ${healthId}`);
        return 0;
      }

      const rows = dexaScans.map(d => {
        const payload = d.ai_payload as Record<string, any> || {};
        const bodyComp = payload.body_composition || {};
        return {
          health_id: healthId,
          scan_id: d.id,
          scan_date: d.study_date,
          scan_type: 'dexa',
          total_body_fat_pct: bodyComp.total_body_fat_percent,
          visceral_fat_mass_g: bodyComp.vat_mass_g || payload.visceralFatMass,
          visceral_fat_area_cm2: bodyComp.vat_area_cm2,
          total_lean_mass_kg: bodyComp.total_lean_mass_kg || payload.totalLeanMass,
          appendicular_lean_mass_kg: bodyComp.appendicular_lean_mass_kg,
          bone_mineral_density: bodyComp.bone_mineral_density,
          bone_mineral_content_g: bodyComp.bone_mineral_content_g,
          android_fat_pct: bodyComp.android_fat_percent,
          gynoid_fat_pct: bodyComp.gynoid_fat_percent,
          trunk_fat_pct: bodyComp.trunk_fat_percent,
          leg_fat_pct: bodyComp.leg_fat_percent,
          arm_fat_pct: bodyComp.arm_fat_percent,
          resting_metabolic_rate: bodyComp.resting_metabolic_rate,
        };
      });

      await clickhouse.insert('body_composition', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} body composition records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Body composition sync error:', error);
      return 0;
    }
  }

  async syncUserDemographics(healthId: string): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('health_id', healthId)
        .single();

      if (error || !profile) {
        logger.debug(`[ClickHouseML] No user profile to sync for ${healthId}`);
        return 0;
      }

      await clickhouse.insert('user_demographics', [{
        health_id: healthId,
        birth_year: profile.birth_year,
        sex: profile.sex || 'unknown',
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
        activity_level: profile.activity_level || 'moderate',
        timezone: profile.timezone,
      }]);

      logger.info(`[ClickHouseML] Synced user demographics for ${healthId}`);
      return 1;
    } catch (error) {
      logger.error('[ClickHouseML] Demographics sync error:', error);
      return 0;
    }
  }

  async syncReadinessScores(healthId: string, daysBack: number = 90): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      // Readiness data is stored in Neon (primary DB), not Supabase
      // Need to get userId from healthId first, then query Neon
      const { getUserIdFromHealthId } = await import('./supabaseHealthStorage');
      const userId = await getUserIdFromHealthId(healthId);
      
      if (!userId) {
        logger.debug(`[ClickHouseML] No userId found for health_id ${healthId}`);
        return 0;
      }

      const { db } = await import('../db');
      const { userDailyReadiness } = await import('@shared/schema');
      const { gte, eq, and, desc } = await import('drizzle-orm');
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const startDateStr = startDate.toISOString().split('T')[0];

      const readiness = await db
        .select()
        .from(userDailyReadiness)
        .where(
          and(
            eq(userDailyReadiness.userId, userId),
            gte(userDailyReadiness.date, startDateStr)
          )
        )
        .orderBy(desc(userDailyReadiness.date));

      if (!readiness || readiness.length === 0) {
        logger.debug(`[ClickHouseML] No readiness data to sync for ${healthId}`);
        return 0;
      }

      const rows = readiness.map(r => ({
        health_id: healthId,
        local_date: r.date,
        readiness_score: r.readinessScore || 0,
        readiness_zone: r.readinessBucket || 'unknown',
        recovery_component: r.recoveryScore,
        sleep_component: r.sleepScore,
        strain_component: r.loadScore,
        hrv_component: r.trendScore,
        environmental_impact: null,
        recovery_boost: null,
        factors: r.notesJson ? JSON.stringify(r.notesJson) : null,
      }));

      await clickhouse.insert('readiness_scores', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} readiness records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Readiness sync error:', error);
      return 0;
    }
  }

  async syncTrainingLoad(healthId: string, daysBack: number = 90): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Get daily metrics with workout data
      const { data: dailyMetrics, error } = await supabase
        .from('user_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .gte('local_date', startDateStr)
        .order('local_date', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching training load from Supabase:', error);
        return 0;
      }

      if (!dailyMetrics || dailyMetrics.length === 0) {
        return 0;
      }

      // Calculate acute/chronic training load (simplified ACWR)
      const rows: any[] = [];
      const acuteWindow = 7;
      const chronicWindow = 28;

      for (let i = 0; i < dailyMetrics.length; i++) {
        const dm = dailyMetrics[i];
        const dailyLoad = (dm.active_energy_kcal || 0) + (dm.exercise_minutes || 0) * 5;

        // Calculate rolling averages
        const acuteStart = Math.max(0, i - acuteWindow + 1);
        const chronicStart = Math.max(0, i - chronicWindow + 1);

        let acuteSum = 0, acuteCount = 0;
        let chronicSum = 0, chronicCount = 0;

        for (let j = acuteStart; j <= i; j++) {
          const load = (dailyMetrics[j].active_energy_kcal || 0) + (dailyMetrics[j].exercise_minutes || 0) * 5;
          acuteSum += load;
          acuteCount++;
        }

        for (let j = chronicStart; j <= i; j++) {
          const load = (dailyMetrics[j].active_energy_kcal || 0) + (dailyMetrics[j].exercise_minutes || 0) * 5;
          chronicSum += load;
          chronicCount++;
        }

        const acuteLoad = acuteCount > 0 ? acuteSum / acuteCount : 0;
        const chronicLoad = chronicCount > 0 ? chronicSum / chronicCount : 0;
        const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

        let recoveryStatus = 'optimal';
        if (ratio < 0.8) recoveryStatus = 'undertrained';
        else if (ratio > 1.5) recoveryStatus = 'overreaching';
        else if (ratio > 1.3) recoveryStatus = 'high_strain';

        rows.push({
          health_id: healthId,
          local_date: dm.local_date,
          acute_load: acuteLoad,
          chronic_load: chronicLoad,
          training_load_ratio: ratio,
          strain_score: dailyLoad,
          workout_count: dm.workout_count || 0,
          total_workout_minutes: dm.exercise_minutes || 0,
          total_active_kcal: dm.active_energy_kcal || 0,
          zone_distribution: null,
          recovery_status: recoveryStatus,
        });
      }

      if (rows.length > 0) {
        await clickhouse.insert('training_load', rows);
        logger.info(`[ClickHouseML] Synced ${rows.length} training load records for ${healthId}`);
      }
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Training load sync error:', error);
      return 0;
    }
  }

  async syncCGMGlucoseData(healthId: string, daysBack: number = 90): Promise<number> {
    // Placeholder for future CGM integration
    // Schema is ready - will sync from HealthKit glucose samples or direct CGM API
    logger.debug(`[ClickHouseML] CGM sync not yet implemented for ${healthId}`);
    return 0;
  }

  async syncAllHealthData(healthId: string, daysBack: number = 90): Promise<{
    healthMetrics: number;
    nutrition: number;
    biomarkers: number;
    lifeEvents: number;
    environmental: number;
    bodyComposition: number;
    demographics: number;
    readiness: number;
    trainingLoad: number;
    total: number;
  }> {
    logger.info(`[ClickHouseML] Starting comprehensive data sync for ${healthId} (${daysBack} days back)`);

    const results = await Promise.all([
      this.syncHealthDataFromSupabase(healthId, daysBack),
      this.syncNutritionData(healthId, daysBack),
      this.syncBiomarkerData(healthId, 365), // Biomarkers go back further
      this.syncLifeEvents(healthId, Math.min(daysBack, 180)),
      this.syncEnvironmentalData(healthId, daysBack),
      this.syncBodyCompositionData(healthId),
      this.syncUserDemographics(healthId),
      this.syncReadinessScores(healthId, daysBack),
      this.syncTrainingLoad(healthId, daysBack),
    ]);

    const summary = {
      healthMetrics: results[0],
      nutrition: results[1],
      biomarkers: results[2],
      lifeEvents: results[3],
      environmental: results[4],
      bodyComposition: results[5],
      demographics: results[6],
      readiness: results[7],
      trainingLoad: results[8],
      total: results.reduce((a, b) => a + b, 0),
    };

    logger.info(`[ClickHouseML] Comprehensive sync complete: ${summary.total} total records`, summary);
    return summary;
  }

  async getDataCoverageSummary(healthId: string): Promise<{
    healthMetrics: { count: number; earliestDate: string | null; latestDate: string | null };
    nutrition: { count: number; earliestDate: string | null; latestDate: string | null };
    biomarkers: { count: number; earliestDate: string | null; latestDate: string | null };
    lifeEvents: { count: number; earliestDate: string | null; latestDate: string | null };
    environmental: { count: number; earliestDate: string | null; latestDate: string | null };
    bodyComposition: { count: number; earliestDate: string | null; latestDate: string | null };
    demographics: { count: number; earliestDate: string | null; latestDate: string | null };
    readiness: { count: number; earliestDate: string | null; latestDate: string | null };
    trainingLoad: { count: number; earliestDate: string | null; latestDate: string | null };
    cgmGlucose: { count: number; earliestDate: string | null; latestDate: string | null };
  }> {
    if (!await this.ensureInitialized()) {
      const empty = { count: 0, earliestDate: null, latestDate: null };
      return {
        healthMetrics: empty,
        nutrition: empty,
        biomarkers: empty,
        lifeEvents: empty,
        environmental: empty,
        bodyComposition: empty,
        demographics: empty,
        readiness: empty,
        trainingLoad: empty,
        cgmGlucose: empty,
      };
    }

    const queryTable = async (table: string, dateCol: string) => {
      try {
        const result = await clickhouse.query<{
          cnt: number;
          earliest: string | null;
          latest: string | null;
        }>(`
          SELECT
            count() as cnt,
            min(${dateCol}) as earliest,
            max(${dateCol}) as latest
          FROM flo_health.${table}
          WHERE health_id = {healthId:String}
        `, { healthId });

        if (result.length > 0) {
          return {
            count: Number(result[0].cnt),
            earliestDate: result[0].earliest,
            latestDate: result[0].latest,
          };
        }
      } catch (e) {
        logger.warn(`[ClickHouseML] Error querying ${table}: ${e instanceof Error ? e.message : String(e)}`);
      }
      return { count: 0, earliestDate: null, latestDate: null };
    };

    const [healthMetrics, nutrition, biomarkers, lifeEvents, environmental, bodyComposition, demographics, readiness, trainingLoad, cgmGlucose] = await Promise.all([
      queryTable('health_metrics', 'local_date'),
      queryTable('nutrition_metrics', 'local_date'),
      queryTable('biomarkers', 'test_date'),
      queryTable('life_events', 'local_date'),
      queryTable('environmental_data', 'local_date'),
      queryTable('body_composition', 'scan_date'),
      queryTable('user_demographics', 'updated_at'),
      queryTable('readiness_scores', 'local_date'),
      queryTable('training_load', 'local_date'),
      queryTable('cgm_glucose', 'local_date'),
    ]);

    return { healthMetrics, nutrition, biomarkers, lifeEvents, environmental, bodyComposition, demographics, readiness, trainingLoad, cgmGlucose };
  }
}

export const clickhouseBaselineEngine = new ClickHouseBaselineEngine();
