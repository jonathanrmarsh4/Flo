/**
 * ClickHouse Baseline Engine - STUB
 *
 * ClickHouse has been removed from the Flō stack. Baselines are now computed
 * directly from Supabase data via the AI insights pipeline.
 * This stub preserves the TypeScript interface so that callers compile without
 * changes. All methods return sensible empty/null results.
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('ClickHouseBaselineEngineStub');

// ─── Exported Types ─────────────────────────────────────────────────────────

export interface AnomalyResult {
  anomalyId: string;
  anomalyDate: string;
  metricType: string;
  currentValue: number;
  baselineValue: number;
  zScore: number;
  deviationPct: number;
  direction: 'above' | 'below';
  severity: 'low' | 'medium' | 'high';
  patternFingerprint: string | null;
}

export interface MetricBaseline {
  metricType: string;
  mean: number;
  stdDev: number;
  sampleCount: number;
  windowDays: number;
}

export interface MetricsAnalysisResult {
  metrics: MetricBaseline[];
  anomalies: AnomalyResult[];
  patterns: { name: string; confidence: number; metrics: string[] }[];
  generatedAt: string;
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

export class ClickHouseBaselineEngine {
  // Track sync attempts so callers that guard on hasRecentSyncAttempt still work
  private syncAttempts = new Map<string, { timestamp: number; count: number }>();

  async ensureInitialized(): Promise<boolean> {
    logger.debug('[ClickHouseBaselineEngineStub] ensureInitialized() – stub');
    return false;
  }

  async calculateBaselines(
    _healthId: string,
    _windowDays: number
  ): Promise<MetricBaseline[]> {
    logger.debug('[ClickHouseBaselineEngineStub] calculateBaselines() – returning []');
    return [];
  }

  async getMetricsForAnalysis(
    _healthId: string,
    _options?: { windowDays?: number; lookbackHours?: number }
  ): Promise<MetricsAnalysisResult> {
    logger.debug('[ClickHouseBaselineEngineStub] getMetricsForAnalysis() – returning empty result');
    return {
      metrics: [],
      anomalies: [],
      patterns: [],
      generatedAt: new Date().toISOString(),
    };
  }

  async syncAllHealthData(
    _healthId: string,
    _daysBack: number | null
  ): Promise<{ total: number; [key: string]: number }> {
    logger.debug('[ClickHouseBaselineEngineStub] syncAllHealthData() – no-op');
    return { total: 0 };
  }

  async syncBiomarkerData(_healthId: string, _daysBack: number): Promise<number> {
    logger.debug('[ClickHouseBaselineEngineStub] syncBiomarkerData() – no-op');
    return 0;
  }

  async syncLifeEvents(_healthId: string, _daysBack: number): Promise<number> {
    logger.debug('[ClickHouseBaselineEngineStub] syncLifeEvents() – no-op');
    return 0;
  }

  async storeFeedbackResponse(
    _healthId: string,
    _feedbackId: string,
    _data: Record<string, unknown>
  ): Promise<void> {
    logger.debug('[ClickHouseBaselineEngineStub] storeFeedbackResponse() – no-op');
  }

  hasRecentSyncAttempt(healthId: string): boolean {
    const attempt = this.syncAttempts.get(healthId);
    if (!attempt) return false;
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() - attempt.timestamp < fiveMinutes;
  }

  recordSyncAttempt(healthId: string, count: number): void {
    this.syncAttempts.set(healthId, { timestamp: Date.now(), count });
  }
}

// Singleton export used by most services
export const clickhouseBaselineEngine = new ClickHouseBaselineEngine();
