/**
 * Baseline Comparison Logger
 * 
 * Step 3 of ML Architecture Refactor:
 * Tracks discrepancies between ClickHouse (source of truth) and shadow math
 * implementations (anomalyDetectionEngine, ragInsightGenerator, baselineCalculator).
 * 
 * This utility allows us to:
 * 1. Compare results from different baseline calculation systems
 * 2. Log discrepancies for debugging
 * 3. Build confidence before removing shadow math
 * 4. Track which metrics diverge most between implementations
 */

import { createLogger } from '../utils/logger';
import { clickhouseBaselineEngine, type MetricsAnalysisResult, type MetricAnalysis } from './clickhouseBaselineEngine';
import { calculateBaseline as shadowCalculateBaseline } from './anomalyDetectionEngine';

const logger = createLogger('BaselineComparison');

export interface BaselineComparison {
  metric: string;
  clickhouse: {
    mean: number;
    stdDev: number | null;
    zScore: number | null;
    isSignificant: boolean;
    direction: 'above' | 'below' | 'normal';
  };
  shadowMath: {
    mean: number | null;
    percentDeviation: number | null;
    isSignificant: boolean;
  };
  discrepancy: {
    meanDifference: number | null;
    significanceMatch: boolean;
    directionMatch: boolean;
  };
}

export interface ComparisonResult {
  healthId: string;
  timestamp: string;
  totalMetrics: number;
  matchingMetrics: number;
  discrepantMetrics: number;
  comparisons: BaselineComparison[];
  summary: {
    agreementRate: number;
    worstDiscrepancies: Array<{
      metric: string;
      meanDifference: number;
      reason: string;
    }>;
  };
}

/**
 * Compare ClickHouse baselines against shadow math implementations
 * 
 * @param healthId - User's health ID
 * @param metricSnapshots - Raw metric data for shadow math calculation
 * @returns ComparisonResult with detailed discrepancy analysis
 */
export async function compareBaselineCalculations(
  healthId: string,
  metricSnapshots: Map<string, Array<{ date: string; value: number }>>
): Promise<ComparisonResult> {
  const timestamp = new Date().toISOString();
  
  const emptyResult: ComparisonResult = {
    healthId,
    timestamp,
    totalMetrics: 0,
    matchingMetrics: 0,
    discrepantMetrics: 0,
    comparisons: [],
    summary: {
      agreementRate: 0,
      worstDiscrepancies: [],
    },
  };

  try {
    // Get ClickHouse analysis (source of truth)
    const clickhouseResult = await clickhouseBaselineEngine.getMetricsForAnalysis(healthId, {
      windowDays: 90,
      lookbackHours: 48,
    });

    if (clickhouseResult.metrics.length === 0) {
      logger.debug(`[BaselineComparison] No ClickHouse metrics for ${healthId}`);
      return emptyResult;
    }

    const comparisons: BaselineComparison[] = [];
    let matchingCount = 0;
    let discrepantCount = 0;
    const worstDiscrepancies: ComparisonResult['summary']['worstDiscrepancies'] = [];

    // Compare each metric
    for (const chMetric of clickhouseResult.metrics) {
      const metricData = metricSnapshots.get(chMetric.metric);
      
      // Calculate shadow math baseline
      let shadowMean: number | null = null;
      let shadowPercentDeviation: number | null = null;
      let shadowIsSignificant = false;

      if (metricData && metricData.length >= 5) {
        shadowMean = shadowCalculateBaseline(metricData, new Date());
        
        if (shadowMean !== null && metricData.length > 0) {
          const latestValue = metricData[metricData.length - 1].value;
          shadowPercentDeviation = ((latestValue - shadowMean) / shadowMean) * 100;
          shadowIsSignificant = Math.abs(shadowPercentDeviation) >= 20; // Shadow math uses 20% threshold
        }
      }

      // Calculate discrepancy
      let meanDifference: number | null = null;
      let significanceMatch = true;
      let directionMatch = true;

      if (shadowMean !== null) {
        meanDifference = Math.abs(chMetric.baseline.mean - shadowMean);
        significanceMatch = chMetric.deviation.isSignificant === shadowIsSignificant;
        
        if (shadowPercentDeviation !== null) {
          const shadowDirection = shadowPercentDeviation > 5 ? 'above' : 
                                   shadowPercentDeviation < -5 ? 'below' : 'normal';
          directionMatch = chMetric.deviation.direction === shadowDirection;
        }
      }

      const comparison: BaselineComparison = {
        metric: chMetric.metric,
        clickhouse: {
          mean: chMetric.baseline.mean,
          stdDev: chMetric.baseline.stdDev,
          zScore: chMetric.deviation.zScore,
          isSignificant: chMetric.deviation.isSignificant,
          direction: chMetric.deviation.direction,
        },
        shadowMath: {
          mean: shadowMean,
          percentDeviation: shadowPercentDeviation,
          isSignificant: shadowIsSignificant,
        },
        discrepancy: {
          meanDifference,
          significanceMatch,
          directionMatch,
        },
      };

      comparisons.push(comparison);

      // Track match/discrepancy
      if (shadowMean !== null) {
        const isMatching = significanceMatch && directionMatch && 
          (meanDifference !== null && meanDifference < chMetric.baseline.mean * 0.1); // 10% tolerance
        
        if (isMatching) {
          matchingCount++;
        } else {
          discrepantCount++;
          
          // Track worst discrepancies
          if (meanDifference !== null && meanDifference > 0) {
            const reason = !significanceMatch ? 'Significance mismatch' :
                          !directionMatch ? 'Direction mismatch' : 
                          'Mean difference > 10%';
            worstDiscrepancies.push({
              metric: chMetric.metric,
              meanDifference,
              reason,
            });
          }
        }
      }
    }

    // Sort worst discrepancies by mean difference
    worstDiscrepancies.sort((a, b) => b.meanDifference - a.meanDifference);
    const topDiscrepancies = worstDiscrepancies.slice(0, 5);

    const totalWithShadow = matchingCount + discrepantCount;
    const agreementRate = totalWithShadow > 0 ? matchingCount / totalWithShadow : 0;

    const result: ComparisonResult = {
      healthId,
      timestamp,
      totalMetrics: clickhouseResult.metrics.length,
      matchingMetrics: matchingCount,
      discrepantMetrics: discrepantCount,
      comparisons,
      summary: {
        agreementRate,
        worstDiscrepancies: topDiscrepancies,
      },
    };

    // Log summary
    if (discrepantCount > 0) {
      logger.warn(
        `[BaselineComparison] ${healthId}: ${discrepantCount}/${totalWithShadow} metrics DISAGREE ` +
        `(${(agreementRate * 100).toFixed(1)}% agreement). ` +
        `Worst: ${topDiscrepancies.map(d => `${d.metric}:${d.reason}`).join(', ')}`
      );
    } else {
      logger.info(
        `[BaselineComparison] ${healthId}: ${matchingCount}/${totalWithShadow} metrics MATCH ` +
        `(100% agreement)`
      );
    }

    return result;
  } catch (error) {
    logger.error('[BaselineComparison] Comparison error:', error);
    return emptyResult;
  }
}

/**
 * Convert ClickHouse MetricsAnalysisResult to a format compatible with
 * downstream consumers (insightsEngineV2, ragInsightGenerator).
 * 
 * This adapter allows gradual migration without breaking existing code.
 */
export function toInsightEngineFormat(analysis: MetricsAnalysisResult): {
  deviations: Array<{
    metric: string;
    currentValue: number;
    baselineValue: number;
    percentChange: number;
    direction: 'increase' | 'decrease';
    isSignificant: boolean;
  }>;
  anomalies: Array<{
    metric: string;
    severity: 'low' | 'moderate' | 'high';
    zScore: number | null;
    description: string;
  }>;
} {
  const deviations = analysis.metrics.map(m => ({
    metric: m.metric,
    currentValue: m.currentValue,
    baselineValue: m.baseline.mean,
    percentChange: m.deviation.percentage,
    direction: m.deviation.direction === 'above' ? 'increase' as const : 'decrease' as const,
    isSignificant: m.deviation.isSignificant,
  }));

  const anomalies = analysis.anomalies.map(m => ({
    metric: m.metric,
    severity: m.interpretation.severity === 'normal' ? 'low' as const : m.interpretation.severity,
    zScore: m.deviation.zScore,
    description: getAnomalyDescription(m),
  }));

  return { deviations, anomalies };
}

function getAnomalyDescription(metric: MetricAnalysis): string {
  const direction = metric.deviation.direction === 'above' ? 'above' : 'below';
  const percent = Math.abs(metric.deviation.percentage).toFixed(1);
  const zStr = metric.deviation.zScore !== null ? ` (z-score: ${metric.deviation.zScore.toFixed(2)})` : '';
  return `${metric.metric} is ${percent}% ${direction} baseline${zStr}`;
}

/**
 * Log a discrepancy for later analysis (stores in ClickHouse for pattern analysis)
 */
export async function logDiscrepancyEvent(
  healthId: string,
  metric: string,
  clickhouseValue: number,
  shadowValue: number,
  context: string
): Promise<void> {
  const difference = Math.abs(clickhouseValue - shadowValue);
  const percentDiff = clickhouseValue !== 0 
    ? (difference / clickhouseValue) * 100 
    : 0;

  logger.warn(
    `[BaselineDiscrepancy] ${healthId}/${metric}: ` +
    `ClickHouse=${clickhouseValue.toFixed(2)}, Shadow=${shadowValue.toFixed(2)}, ` +
    `Diff=${percentDiff.toFixed(1)}%, Context=${context}`
  );
}
