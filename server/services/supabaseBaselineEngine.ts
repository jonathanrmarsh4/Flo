/**
 * Supabase Baseline Engine
 *
 * Replaces the former ClickHouse ML baseline engine with direct Supabase queries.
 * Calculates rolling window statistics (mean, stdDev, percentiles) over health data
 * stored in user_daily_metrics and sleep_nights tables.
 *
 * Architecture: All health data lives in Supabase. We compute baselines on-demand
 * by querying the last N days of data and running statistical aggregations in-process.
 * Results are lightweight and fast enough to not require a separate OLAP database.
 */

import { getDailyMetricsFlexible, getSleepNights } from './supabaseHealthStorage';
import { logger } from '../logger';

// ============================================================================
// Types
// ============================================================================

export interface BaselineMetric {
  metricType: string;
  meanValue: number;
  stdDev: number | null;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  windowDays: number;
}

export interface AnomalyResult {
  metricType: string;
  currentValue: number;
  baselineValue: number;
  deviationPercent: number;
  severity: 'mild' | 'moderate' | 'severe';
  direction: 'above' | 'below';
  label?: string;
  detectedAt?: string;
  modelConfidence: number;
  patternFingerprint?: string;
}

export interface MetricsAnalysisResult {
  metrics: BaselineMetric[];
  anomalies: AnomalyResult[];
  patterns: string[];
}

// ============================================================================
// Math helpers
// ============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg?: number): number | null {
  if (values.length < 3) return null;
  const m = avg ?? mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function deviationPercent(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

function anomalySeverity(deviationPct: number): 'mild' | 'moderate' | 'severe' {
  const abs = Math.abs(deviationPct);
  if (abs >= 30) return 'severe';
  if (abs >= 15) return 'moderate';
  return 'mild';
}

// ============================================================================
// Core engine
// ============================================================================

export class SupabaseBaselineEngine {

  /**
   * Calculate rolling baselines for all tracked metrics over a window of days.
   * Uses user_daily_metrics and sleep_nights tables.
   */
  async calculateBaselines(userId: string, windowDays: number = 90): Promise<BaselineMetric[]> {
    try {
      const [dailyMetrics, sleepNights] = await Promise.all([
        getDailyMetricsFlexible(userId, { limit: windowDays }),
        getSleepNights(userId, windowDays),
      ]);

      const baselines: BaselineMetric[] = [];

      // --- Activity metrics from user_daily_metrics ---
      const extractAndBaseline = (
        label: string,
        values: (number | null | undefined)[]
      ) => {
        const clean = values.filter((v): v is number => v != null && v > 0);
        if (clean.length < 3) return;
        const m = mean(clean);
        const sd = stdDev(clean, m);
        baselines.push({
          metricType: label,
          meanValue: Math.round(m * 100) / 100,
          stdDev: sd !== null ? Math.round(sd * 100) / 100 : null,
          minValue: Math.min(...clean),
          maxValue: Math.max(...clean),
          sampleCount: clean.length,
          windowDays,
        });
      };

      extractAndBaseline('steps', dailyMetrics.map(m => m.steps));
      extractAndBaseline('active_energy_kcal', dailyMetrics.map(m => m.active_energy_burned));
      extractAndBaseline('exercise_minutes', dailyMetrics.map(m => m.exercise_minutes));
      extractAndBaseline('weight_kg', dailyMetrics.map(m => m.weight_kg));
      extractAndBaseline('body_fat_pct', dailyMetrics.map(m => m.body_fat_percent));

      // --- Sleep metrics from sleep_nights ---
      extractAndBaseline('sleep_duration_min', sleepNights.map(n => n.total_sleep_minutes));
      extractAndBaseline('deep_sleep_min', sleepNights.map(n => n.deep_sleep_minutes));
      extractAndBaseline('rem_sleep_min', sleepNights.map(n => n.rem_sleep_minutes));
      extractAndBaseline('sleep_efficiency_pct', sleepNights.map(n => n.sleep_efficiency));
      extractAndBaseline('hrv_ms', sleepNights.map(n => n.hrv_ms));
      extractAndBaseline('resting_hr_bpm', sleepNights.map(n => n.resting_hr_bpm));
      extractAndBaseline('respiratory_rate', sleepNights.map(n => n.respiratory_rate));

      logger.debug(`[SupabaseBaseline] Calculated ${baselines.length} baselines for user ${userId} over ${windowDays} days`);
      return baselines;
    } catch (error) {
      logger.error('[SupabaseBaseline] Error calculating baselines:', error);
      return [];
    }
  }

  /**
   * Detect anomalies by comparing the most recent value for each metric
   * against its rolling baseline.
   */
  async detectAnomalies(userId: string, windowDays: number = 90): Promise<AnomalyResult[]> {
    try {
      const [baselines, recentMetrics, recentSleep] = await Promise.all([
        this.calculateBaselines(userId, windowDays),
        getDailyMetricsFlexible(userId, { limit: 3 }),
        getSleepNights(userId, 3),
      ]);

      const anomalies: AnomalyResult[] = [];
      const baselineMap = new Map(baselines.map(b => [b.metricType, b]));

      const checkAnomaly = (
        metricType: string,
        currentValue: number | null | undefined,
        label: string
      ) => {
        if (currentValue == null || currentValue <= 0) return;
        const baseline = baselineMap.get(metricType);
        if (!baseline || baseline.sampleCount < 7) return;

        const devPct = deviationPercent(currentValue, baseline.meanValue);
        if (Math.abs(devPct) < 10) return; // below noise threshold

        const sd = baseline.stdDev;
        const zScore = sd && sd > 0 ? Math.abs(currentValue - baseline.meanValue) / sd : 0;
        if (zScore < 1.5) return; // not statistically notable

        anomalies.push({
          metricType,
          currentValue,
          baselineValue: baseline.meanValue,
          deviationPercent: Math.round(devPct * 10) / 10,
          severity: anomalySeverity(devPct),
          direction: devPct > 0 ? 'above' : 'below',
          label,
          detectedAt: new Date().toISOString(),
          modelConfidence: Math.min(0.95, 0.5 + zScore * 0.1),
        });
      };

      // Latest daily metric
      const latest = recentMetrics[0];
      if (latest) {
        checkAnomaly('steps', latest.steps, 'Steps');
        checkAnomaly('active_energy_kcal', latest.active_energy_burned, 'Active Energy');
        checkAnomaly('weight_kg', latest.weight_kg, 'Weight');
      }

      // Latest sleep night
      const latestSleep = recentSleep[0];
      if (latestSleep) {
        checkAnomaly('sleep_duration_min', latestSleep.total_sleep_minutes, 'Sleep Duration');
        checkAnomaly('deep_sleep_min', latestSleep.deep_sleep_minutes, 'Deep Sleep');
        checkAnomaly('rem_sleep_min', latestSleep.rem_sleep_minutes, 'REM Sleep');
        checkAnomaly('hrv_ms', latestSleep.hrv_ms, 'HRV');
        checkAnomaly('resting_hr_bpm', latestSleep.resting_hr_bpm, 'Resting Heart Rate');
        checkAnomaly('sleep_efficiency_pct', latestSleep.sleep_efficiency, 'Sleep Efficiency');
      }

      // Sort by severity and deviation magnitude
      anomalies.sort((a, b) => {
        const severityOrder = { severe: 3, moderate: 2, mild: 1 };
        const sDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (sDiff !== 0) return sDiff;
        return Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent);
      });

      logger.debug(`[SupabaseBaseline] Detected ${anomalies.length} anomalies for user ${userId}`);
      return anomalies;
    } catch (error) {
      logger.error('[SupabaseBaseline] Error detecting anomalies:', error);
      return [];
    }
  }

  /**
   * Full metrics analysis — baselines + anomalies + simple patterns.
   * Drop-in replacement for the former clickhouseBaselineEngine.getMetricsForAnalysis().
   */
  async getMetricsForAnalysis(
    userId: string,
    options: { windowDays?: number } = {}
  ): Promise<MetricsAnalysisResult> {
    const windowDays = options.windowDays ?? 90;
    const [metrics, anomalies] = await Promise.all([
      this.calculateBaselines(userId, windowDays),
      this.detectAnomalies(userId, windowDays),
    ]);

    // Simple pattern detection based on anomaly combinations
    const patterns: string[] = [];
    const anomalyTypes = new Set(anomalies.map(a => a.metricType));

    if (anomalyTypes.has('hrv_ms') && anomalyTypes.has('resting_hr_bpm')) {
      const hrvAnomaly = anomalies.find(a => a.metricType === 'hrv_ms');
      const rhrAnomaly = anomalies.find(a => a.metricType === 'resting_hr_bpm');
      if (hrvAnomaly?.direction === 'below' && rhrAnomaly?.direction === 'above') {
        patterns.push('Recovery stress pattern: low HRV + elevated RHR');
      }
    }

    if (anomalyTypes.has('sleep_duration_min') && anomalyTypes.has('deep_sleep_min')) {
      const sleepAnomaly = anomalies.find(a => a.metricType === 'sleep_duration_min');
      if (sleepAnomaly?.direction === 'below') {
        patterns.push('Sleep deficit pattern: shortened total and deep sleep');
      }
    }

    if (anomalyTypes.has('steps') && anomalyTypes.has('active_energy_kcal')) {
      const stepsAnomaly = anomalies.find(a => a.metricType === 'steps');
      if (stepsAnomaly?.direction === 'above') {
        patterns.push('High activity day: elevated steps and active energy');
      }
    }

    return { metrics, anomalies, patterns };
  }

  /**
   * Get structured baselines for the Oracle context builder (sleep + activity).
   * Mirrors the shape previously used as clickhouseBaselines in floOracleContextBuilder.
   */
  async getOracleBaselines(userId: string, windowDays: number = 90) {
    const baselines = await this.calculateBaselines(userId, windowDays);
    const map = new Map(baselines.map(b => [b.metricType, b]));

    const toBaseline = (metricType: string) => {
      const b = map.get(metricType);
      if (!b) return { baseline: null, stdDev: null };
      return { baseline: b.meanValue, stdDev: b.stdDev };
    };

    return {
      sleepDuration: toBaseline('sleep_duration_min'),
      deepSleep: toBaseline('deep_sleep_min'),
      remSleep: toBaseline('rem_sleep_min'),
      hrv: toBaseline('hrv_ms'),
      rhr: toBaseline('resting_hr_bpm'),
      steps: toBaseline('steps'),
      activeEnergy: toBaseline('active_energy_kcal'),
    };
  }
}

export const supabaseBaselineEngine = new SupabaseBaselineEngine();
