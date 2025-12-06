import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

const supabase = getSupabaseClient();

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

export interface FeedbackOutcome {
  feedbackId: string;
  anomalyId?: string;
  wasConfirmed: boolean;
  userFeeling?: number;
  additionalContext?: string;
}

export class SupabaseBaselineEngine {
  async calculateBaselines(healthId: string, windowDays: number = 7): Promise<BaselineResult[]> {
    if (!healthId) {
      logger.warn('[SupabaseBaseline] Cannot calculate baselines: healthId is null/undefined');
      return [];
    }

    try {
      const windowDate = new Date();
      windowDate.setDate(windowDate.getDate() - windowDays);
      const windowDateStr = windowDate.toISOString().split('T')[0];

      const { data: metrics, error } = await supabase
        .from('user_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .gte('date', windowDateStr)
        .order('date', { ascending: false });

      if (error) {
        logger.error('[SupabaseBaseline] Error fetching metrics:', error);
        throw error;
      }

      if (!metrics || metrics.length === 0) {
        logger.debug(`[SupabaseBaseline] No metrics found for ${healthId} in ${windowDays}d window`);
        return [];
      }

      const metricGroups: Record<string, number[]> = {};
      const metricMappings: Record<string, string> = {
        hrv_avg: 'hrv',
        resting_hr: 'resting_heart_rate',
        steps: 'steps',
        active_kcal: 'active_energy',
        sleep_minutes: 'sleep_duration',
        deep_sleep_minutes: 'deep_sleep',
        rem_sleep_minutes: 'rem_sleep',
        respiratory_rate_avg: 'respiratory_rate',
        oxygen_saturation_avg: 'oxygen_saturation',
        wrist_temp_deviation: 'wrist_temperature_deviation',
      };

      for (const row of metrics) {
        for (const [dbField, metricType] of Object.entries(metricMappings)) {
          const value = row[dbField];
          if (value !== null && value !== undefined && !isNaN(value)) {
            if (!metricGroups[metricType]) {
              metricGroups[metricType] = [];
            }
            metricGroups[metricType].push(Number(value));
          }
        }
      }

      const results: BaselineResult[] = [];

      for (const [metricType, values] of Object.entries(metricGroups)) {
        if (values.length < 3) continue;

        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const p25Index = Math.floor(sorted.length * 0.25);
        const p75Index = Math.floor(sorted.length * 0.75);

        results.push({
          metricType,
          windowDays,
          meanValue: mean,
          stdDev: stdDev > 0 ? stdDev : null,
          minValue: sorted[0],
          maxValue: sorted[sorted.length - 1],
          sampleCount: values.length,
          percentile25: sorted[p25Index],
          percentile75: sorted[p75Index],
        });
      }

      if (results.length > 0) {
        await this.storeBaselines(healthId, results);
      }

      logger.info(`[SupabaseBaseline] Calculated ${results.length} baselines for ${healthId} (${windowDays}d window)`);
      return results;
    } catch (error) {
      logger.error('[SupabaseBaseline] Failed to calculate baselines', { healthId, error });
      throw error;
    }
  }

  private async storeBaselines(healthId: string, baselines: BaselineResult[]): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const { error: deleteError } = await supabase
      .from('metric_baselines')
      .delete()
      .eq('health_id', healthId)
      .eq('baseline_date', today);

    if (deleteError) {
      logger.debug('[SupabaseBaseline] Delete existing baselines error (may not exist):', deleteError);
    }

    const rows = baselines.map(b => ({
      health_id: healthId,
      metric_type: b.metricType,
      baseline_date: today,
      window_days: b.windowDays,
      mean_value: b.meanValue,
      std_dev: b.stdDev,
      min_value: b.minValue,
      max_value: b.maxValue,
      sample_count: b.sampleCount,
      percentile_25: b.percentile25,
      percentile_75: b.percentile75,
      calculated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('metric_baselines')
      .insert(rows);

    if (error) {
      logger.error('[SupabaseBaseline] Error storing baselines:', error);
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
      logger.warn('[SupabaseBaseline] Cannot detect anomalies: healthId is null/undefined');
      return [];
    }

    try {
      const baselines = await this.calculateBaselines(healthId, windowDays);
      const baselineMap = new Map(baselines.map(b => [b.metricType, b]));

      const lookbackDate = new Date();
      lookbackDate.setHours(lookbackDate.getHours() - lookbackHours);
      const lookbackDateStr = lookbackDate.toISOString().split('T')[0];

      const { data: recentMetrics, error } = await supabase
        .from('user_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .gte('date', lookbackDateStr)
        .order('date', { ascending: false })
        .limit(3);

      if (error) {
        logger.error('[SupabaseBaseline] Error fetching recent metrics:', error);
        throw error;
      }

      if (!recentMetrics || recentMetrics.length === 0) {
        return [];
      }

      const currentValues: Record<string, number[]> = {};
      const metricMappings: Record<string, string> = {
        hrv_avg: 'hrv',
        resting_hr: 'resting_heart_rate',
        steps: 'steps',
        active_kcal: 'active_energy',
        sleep_minutes: 'sleep_duration',
        deep_sleep_minutes: 'deep_sleep',
        respiratory_rate_avg: 'respiratory_rate',
        oxygen_saturation_avg: 'oxygen_saturation',
        wrist_temp_deviation: 'wrist_temperature_deviation',
      };

      for (const row of recentMetrics) {
        for (const [dbField, metricType] of Object.entries(metricMappings)) {
          const value = row[dbField];
          if (value !== null && value !== undefined && !isNaN(value)) {
            if (!currentValues[metricType]) {
              currentValues[metricType] = [];
            }
            currentValues[metricType].push(Number(value));
          }
        }
      }

      const anomalies: AnomalyResult[] = [];

      for (const [metricType, values] of Object.entries(currentValues)) {
        const baseline = baselineMap.get(metricType);
        if (!baseline || baseline.sampleCount < 3) continue;

        const threshold = METRIC_THRESHOLDS[metricType];
        if (!threshold) continue;

        const currentValue = values.reduce((a, b) => a + b, 0) / values.length;
        const deviation = currentValue - baseline.meanValue;
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
        if (metricType === 'wrist_temperature_deviation') {
          const absValue = Math.abs(currentValue);
          if (absValue >= threshold.severity.high) severity = 'high';
          else if (absValue >= threshold.severity.moderate) severity = 'moderate';
        } else {
          if (absDeviationPct >= threshold.severity.high) severity = 'high';
          else if (absDeviationPct >= threshold.severity.moderate) severity = 'moderate';
        }

        const anomalyId = randomUUID();
        anomalies.push({
          anomalyId,
          metricType,
          currentValue,
          baselineValue: baseline.meanValue,
          deviationPct,
          zScore,
          direction,
          severity,
          patternFingerprint: null,
          relatedMetrics: null,
        });
      }

      const patternedAnomalies = this.detectMultiMetricPatterns(anomalies);

      if (patternedAnomalies.length > 0) {
        await this.storeAnomalies(healthId, patternedAnomalies);
      }

      logger.info(`[SupabaseBaseline] Detected ${patternedAnomalies.length} anomalies for ${healthId}`);
      return patternedAnomalies;
    } catch (error) {
      logger.error('[SupabaseBaseline] Failed to detect anomalies', { healthId, error });
      throw error;
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
      related_metrics: a.relatedMetrics,
      resolved_at: null,
      outcome: null,
    }));

    const { error } = await supabase
      .from('detected_anomalies')
      .insert(rows);

    if (error) {
      logger.error('[SupabaseBaseline] Error storing anomalies:', error);
    }
  }

  async getActiveAnomalies(healthId: string, hoursBack: number = 72): Promise<AnomalyResult[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    const { data, error } = await supabase
      .from('detected_anomalies')
      .select('*')
      .eq('health_id', healthId)
      .gte('detected_at', cutoffDate.toISOString())
      .is('resolved_at', null)
      .order('detected_at', { ascending: false });

    if (error) {
      logger.error('[SupabaseBaseline] Error fetching active anomalies:', error);
      return [];
    }

    return (data || []).map(a => ({
      anomalyId: a.anomaly_id,
      metricType: a.metric_type,
      currentValue: a.current_value,
      baselineValue: a.baseline_value,
      deviationPct: a.deviation_pct,
      zScore: a.z_score,
      direction: a.direction as 'above' | 'below',
      severity: a.severity as 'low' | 'moderate' | 'high',
      patternFingerprint: a.pattern_fingerprint,
      relatedMetrics: a.related_metrics,
    }));
  }

  async resolveAnomaly(
    anomalyId: string,
    outcome: 'confirmed' | 'false_positive' | 'unknown'
  ): Promise<void> {
    const { error } = await supabase
      .from('detected_anomalies')
      .update({
        resolved_at: new Date().toISOString(),
        outcome,
      })
      .eq('anomaly_id', anomalyId);

    if (error) {
      logger.error('[SupabaseBaseline] Error resolving anomaly:', error);
      throw error;
    }

    logger.info(`[SupabaseBaseline] Resolved anomaly ${anomalyId} as ${outcome}`);
  }

  async recordFeedbackOutcome(feedback: FeedbackOutcome): Promise<void> {
    const { error } = await supabase
      .from('correlation_feedback')
      .insert({
        feedback_id: feedback.feedbackId,
        anomaly_id: feedback.anomalyId || null,
        was_confirmed: feedback.wasConfirmed,
        user_feeling: feedback.userFeeling || null,
        additional_context: feedback.additionalContext || null,
        recorded_at: new Date().toISOString(),
      });

    if (error) {
      logger.error('[SupabaseBaseline] Error recording feedback outcome:', error);
      throw error;
    }

    if (feedback.anomalyId) {
      await this.resolveAnomaly(
        feedback.anomalyId,
        feedback.wasConfirmed ? 'confirmed' : 'false_positive'
      );
    }

    logger.info(`[SupabaseBaseline] Recorded feedback outcome for ${feedback.feedbackId}`);
  }

  async getHistoricalAccuracy(healthId: string, patternType?: string): Promise<{
    totalPredictions: number;
    confirmedCount: number;
    falsePositiveCount: number;
    accuracyRate: number;
    patternBreakdown: Record<string, { total: number; confirmed: number; accuracy: number }>;
  }> {
    let query = supabase
      .from('detected_anomalies')
      .select('*')
      .eq('health_id', healthId)
      .not('outcome', 'is', null);

    if (patternType) {
      query = query.eq('pattern_fingerprint', patternType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[SupabaseBaseline] Error fetching historical accuracy:', error);
      return {
        totalPredictions: 0,
        confirmedCount: 0,
        falsePositiveCount: 0,
        accuracyRate: 0,
        patternBreakdown: {},
      };
    }

    const anomalies = data || [];
    const totalPredictions = anomalies.length;
    const confirmedCount = anomalies.filter(a => a.outcome === 'confirmed').length;
    const falsePositiveCount = anomalies.filter(a => a.outcome === 'false_positive').length;
    const accuracyRate = totalPredictions > 0 ? confirmedCount / totalPredictions : 0;

    const patternBreakdown: Record<string, { total: number; confirmed: number; accuracy: number }> = {};
    for (const a of anomalies) {
      const pattern = a.pattern_fingerprint || 'single_metric';
      if (!patternBreakdown[pattern]) {
        patternBreakdown[pattern] = { total: 0, confirmed: 0, accuracy: 0 };
      }
      patternBreakdown[pattern].total++;
      if (a.outcome === 'confirmed') {
        patternBreakdown[pattern].confirmed++;
      }
    }

    for (const pattern of Object.keys(patternBreakdown)) {
      const p = patternBreakdown[pattern];
      p.accuracy = p.total > 0 ? p.confirmed / p.total : 0;
    }

    return {
      totalPredictions,
      confirmedCount,
      falsePositiveCount,
      accuracyRate,
      patternBreakdown,
    };
  }

  async getLearningContext(healthId: string): Promise<string> {
    const accuracy = await this.getHistoricalAccuracy(healthId);

    if (accuracy.totalPredictions === 0) {
      return 'No historical prediction data available for this user yet.';
    }

    let context = `PREDICTION ACCURACY HISTORY:\n`;
    context += `- Total predictions made: ${accuracy.totalPredictions}\n`;
    context += `- Confirmed correct: ${accuracy.confirmedCount} (${Math.round(accuracy.accuracyRate * 100)}%)\n`;
    context += `- False positives: ${accuracy.falsePositiveCount}\n\n`;

    context += `PATTERN-SPECIFIC ACCURACY:\n`;
    for (const [pattern, stats] of Object.entries(accuracy.patternBreakdown)) {
      context += `- ${pattern}: ${stats.confirmed}/${stats.total} confirmed (${Math.round(stats.accuracy * 100)}%)\n`;
    }

    if (accuracy.accuracyRate < 0.5) {
      context += `\nNOTE: Historical accuracy is low. Consider being more conservative with alerts.`;
    } else if (accuracy.accuracyRate > 0.8) {
      context += `\nNOTE: Historical accuracy is high. Predictions for this user are typically reliable.`;
    }

    return context;
  }
}

export const supabaseBaselineEngine = new SupabaseBaselineEngine();
