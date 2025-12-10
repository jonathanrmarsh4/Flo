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

/**
 * RAG Activity Baselines comparison interface
 * Matches structure from ragInsightGenerator.computeActivityBaselines()
 */
export interface RAGActivityBaselines {
  steps: {
    current7DayAvg: number | null;
    baseline30Day: number | null;
    percentBelowBaseline: number | null;
    suggestedTarget: number | null;
  };
  workouts: {
    thisWeekCount: number;
    weeklyAverage: number;
    isBelowAverage: boolean;
    suggestedTarget: number | null;
  };
  exerciseMinutes: {
    weeklyTotal: number | null;
    dailyAverage: number | null;
  };
}

export interface RAGComparisonResult {
  healthId: string;
  timestamp: string;
  comparisons: Array<{
    field: string;
    clickhouseValue: number | null;
    ragValue: number | null;
    difference: number | null;
    percentDifference: number | null;
    matches: boolean;
  }>;
  overallAgreementRate: number;
  discrepancies: string[];
}

/**
 * Compare RAG activity baselines against ClickHouse MetricAnalysis
 * 
 * This helps validate that ClickHouse trend fields match what ragInsightGenerator calculates
 * so we can eventually replace computeActivityBaselines() with ClickHouse data.
 */
export async function compareRAGActivityBaselines(
  healthId: string,
  ragBaselines: RAGActivityBaselines
): Promise<RAGComparisonResult> {
  const timestamp = new Date().toISOString();
  const comparisons: RAGComparisonResult['comparisons'] = [];
  const discrepancies: string[] = [];
  
  try {
    // Get ClickHouse analysis for comparison
    const chResult = await clickhouseBaselineEngine.getMetricsForAnalysis(healthId, {
      windowDays: 30, // RAG uses 30-day baseline
      lookbackHours: 168, // 7 days for weekly average
    });

    // Find steps metric in ClickHouse
    const stepsMetric = chResult.metrics.find(m => m.metric === 'steps');
    
    // Compare step 7-day average
    if (stepsMetric || ragBaselines.steps.current7DayAvg !== null) {
      const chWeeklyAvg = stepsMetric?.trend?.weeklyAverage ?? null;
      const ragWeeklyAvg = ragBaselines.steps.current7DayAvg;
      const diff = chWeeklyAvg !== null && ragWeeklyAvg !== null 
        ? Math.abs(chWeeklyAvg - ragWeeklyAvg) 
        : null;
      const percentDiff = chWeeklyAvg !== null && ragWeeklyAvg !== null && chWeeklyAvg !== 0
        ? (diff! / chWeeklyAvg) * 100
        : null;
      const matches = percentDiff !== null ? percentDiff < 5 : ragWeeklyAvg === null;
      
      comparisons.push({
        field: 'steps.weeklyAverage',
        clickhouseValue: chWeeklyAvg,
        ragValue: ragWeeklyAvg,
        difference: diff,
        percentDifference: percentDiff,
        matches,
      });
      
      if (!matches && percentDiff !== null) {
        discrepancies.push(`steps.weeklyAverage: ${percentDiff.toFixed(1)}% difference`);
      }
    }

    // Compare step 30-day baseline
    if (stepsMetric || ragBaselines.steps.baseline30Day !== null) {
      const chMonthlyAvg = stepsMetric?.trend?.monthlyAverage ?? stepsMetric?.baseline?.mean ?? null;
      const ragMonthlyAvg = ragBaselines.steps.baseline30Day;
      const diff = chMonthlyAvg !== null && ragMonthlyAvg !== null 
        ? Math.abs(chMonthlyAvg - ragMonthlyAvg) 
        : null;
      const percentDiff = chMonthlyAvg !== null && ragMonthlyAvg !== null && chMonthlyAvg !== 0
        ? (diff! / chMonthlyAvg) * 100
        : null;
      const matches = percentDiff !== null ? percentDiff < 5 : ragMonthlyAvg === null;
      
      comparisons.push({
        field: 'steps.monthlyBaseline',
        clickhouseValue: chMonthlyAvg,
        ragValue: ragMonthlyAvg,
        difference: diff,
        percentDifference: percentDiff,
        matches,
      });
      
      if (!matches && percentDiff !== null) {
        discrepancies.push(`steps.monthlyBaseline: ${percentDiff.toFixed(1)}% difference`);
      }
    }

    // Compare percent below baseline
    if (stepsMetric || ragBaselines.steps.percentBelowBaseline !== null) {
      const chPercentBelow = stepsMetric?.trend?.percentBelowBaseline ?? null;
      const ragPercentBelow = ragBaselines.steps.percentBelowBaseline;
      const diff = chPercentBelow !== null && ragPercentBelow !== null 
        ? Math.abs(chPercentBelow - ragPercentBelow) 
        : null;
      // For percentage values, check absolute difference rather than percent of percent
      const matches = diff !== null ? diff < 3 : ragPercentBelow === null;
      
      comparisons.push({
        field: 'steps.percentBelowBaseline',
        clickhouseValue: chPercentBelow,
        ragValue: ragPercentBelow,
        difference: diff,
        percentDifference: null, // Not meaningful for percentages
        matches,
      });
      
      if (!matches && diff !== null) {
        discrepancies.push(`steps.percentBelowBaseline: ${diff.toFixed(1)} percentage points difference`);
      }
    }

    // Find exercise_time metric
    const exerciseMetric = chResult.metrics.find(m => 
      m.metric === 'exercise_time' || m.metric === 'apple_exercise_minutes'
    );
    
    if (exerciseMetric || ragBaselines.exerciseMinutes.dailyAverage !== null) {
      const chDailyAvg = exerciseMetric?.trend?.weeklyAverage 
        ? exerciseMetric.trend.weeklyAverage / 7 
        : null;
      const ragDailyAvg = ragBaselines.exerciseMinutes.dailyAverage;
      const diff = chDailyAvg !== null && ragDailyAvg !== null 
        ? Math.abs(chDailyAvg - ragDailyAvg) 
        : null;
      const percentDiff = chDailyAvg !== null && ragDailyAvg !== null && chDailyAvg !== 0
        ? (diff! / chDailyAvg) * 100
        : null;
      const matches = percentDiff !== null ? percentDiff < 10 : ragDailyAvg === null;
      
      comparisons.push({
        field: 'exerciseMinutes.dailyAverage',
        clickhouseValue: chDailyAvg,
        ragValue: ragDailyAvg,
        difference: diff,
        percentDifference: percentDiff,
        matches,
      });
      
      if (!matches && percentDiff !== null) {
        discrepancies.push(`exerciseMinutes.dailyAverage: ${percentDiff.toFixed(1)}% difference`);
      }
    }

    // Calculate overall agreement rate
    const matchingComparisons = comparisons.filter(c => c.matches).length;
    const overallAgreementRate = comparisons.length > 0 
      ? matchingComparisons / comparisons.length 
      : 1;

    // Log results
    if (discrepancies.length > 0) {
      logger.warn(
        `[RAGComparison] ${healthId}: ${discrepancies.length} discrepancies found ` +
        `(${(overallAgreementRate * 100).toFixed(1)}% agreement): ${discrepancies.join(', ')}`
      );
    } else {
      logger.info(
        `[RAGComparison] ${healthId}: 100% agreement on ${comparisons.length} fields`
      );
    }

    return {
      healthId,
      timestamp,
      comparisons,
      overallAgreementRate,
      discrepancies,
    };
  } catch (error) {
    logger.error('[RAGComparison] Error comparing baselines:', error);
    return {
      healthId,
      timestamp,
      comparisons: [],
      overallAgreementRate: 0,
      discrepancies: ['Error during comparison'],
    };
  }
}

/**
 * Neon baselineCalculator comparison interface
 * For comparing ClickHouse baselines vs Neon-stored rolling window stats
 */
export interface NeonBaselineStats {
  metricKey: string;
  mean: number | null;
  stdDev: number | null;
  numSamples: number;
  windowDays: number;
}

export interface NeonComparisonResult {
  healthId: string;
  timestamp: string;
  comparisons: Array<{
    metric: string;
    clickhouse: { mean: number; stdDev: number | null; sampleCount: number };
    neon: { mean: number | null; stdDev: number | null; numSamples: number };
    meanDifference: number | null;
    stdDevDifference: number | null;
    matches: boolean;
  }>;
  overallAgreementRate: number;
  discrepancies: string[];
}

/**
 * Compare Neon baselineCalculator stats against ClickHouse baselines
 * 
 * This helps validate that ClickHouse produces the same baseline stats as
 * the legacy Neon-based baselineCalculator so we can eventually remove it.
 */
export async function compareNeonBaselines(
  healthId: string,
  neonBaselines: NeonBaselineStats[]
): Promise<NeonComparisonResult> {
  const timestamp = new Date().toISOString();
  const comparisons: NeonComparisonResult['comparisons'] = [];
  const discrepancies: string[] = [];
  
  try {
    // Get ClickHouse analysis - use 30-day window to match Neon's default
    const chResult = await clickhouseBaselineEngine.getMetricsForAnalysis(healthId, {
      windowDays: 30,
      lookbackHours: 48,
    });

    const chMetricMap = new Map(chResult.metrics.map(m => [m.metric, m]));

    for (const neonBaseline of neonBaselines) {
      // Map Neon metric keys to ClickHouse metric names
      const chMetricName = mapNeonToClickhouseMetric(neonBaseline.metricKey);
      const chMetric = chMetricMap.get(chMetricName);

      const comparison: NeonComparisonResult['comparisons'][0] = {
        metric: neonBaseline.metricKey,
        clickhouse: {
          mean: chMetric?.baseline?.mean ?? 0,
          stdDev: chMetric?.baseline?.stdDev ?? null,
          sampleCount: chMetric?.baseline?.sampleCount ?? 0,
        },
        neon: {
          mean: neonBaseline.mean,
          stdDev: neonBaseline.stdDev,
          numSamples: neonBaseline.numSamples,
        },
        meanDifference: null,
        stdDevDifference: null,
        matches: false,
      };

      if (chMetric && neonBaseline.mean !== null) {
        comparison.meanDifference = Math.abs(chMetric.baseline.mean - neonBaseline.mean);
        
        if (chMetric.baseline.stdDev !== null && neonBaseline.stdDev !== null) {
          comparison.stdDevDifference = Math.abs(chMetric.baseline.stdDev - neonBaseline.stdDev);
        }

        // Check if means match within 5%
        const percentDiff = chMetric.baseline.mean !== 0
          ? (comparison.meanDifference / chMetric.baseline.mean) * 100
          : 0;
        comparison.matches = percentDiff < 5;

        if (!comparison.matches) {
          discrepancies.push(`${neonBaseline.metricKey}: mean diff ${percentDiff.toFixed(1)}%`);
        }
      } else if (neonBaseline.mean === null && !chMetric) {
        // Both have no data - considered a match
        comparison.matches = true;
      }

      comparisons.push(comparison);
    }

    const matchingCount = comparisons.filter(c => c.matches).length;
    const overallAgreementRate = comparisons.length > 0 
      ? matchingCount / comparisons.length 
      : 1;

    if (discrepancies.length > 0) {
      logger.warn(
        `[NeonComparison] ${healthId}: ${discrepancies.length}/${comparisons.length} metrics disagree ` +
        `(${(overallAgreementRate * 100).toFixed(1)}% agreement): ${discrepancies.slice(0, 3).join(', ')}`
      );
    } else {
      logger.info(
        `[NeonComparison] ${healthId}: 100% agreement on ${comparisons.length} metrics`
      );
    }

    return {
      healthId,
      timestamp,
      comparisons,
      overallAgreementRate,
      discrepancies,
    };
  } catch (error) {
    logger.error('[NeonComparison] Error comparing baselines:', error);
    return {
      healthId,
      timestamp,
      comparisons: [],
      overallAgreementRate: 0,
      discrepancies: ['Error during comparison'],
    };
  }
}

/**
 * Map Neon baselineCalculator metric keys to ClickHouse metric names
 */
function mapNeonToClickhouseMetric(neonKey: string): string {
  const mapping: Record<string, string> = {
    'sleep_hours': 'sleep_duration',
    'resting_hr': 'resting_heart_rate',
    'hrv_ms': 'hrv',
    'active_energy_kcal': 'active_energy',
    'steps': 'steps',
    'deep_sleep': 'deep_sleep',
    'rem_sleep': 'rem_sleep',
    'respiratory_rate': 'respiratory_rate',
    'oxygen_saturation': 'oxygen_saturation',
  };
  return mapping[neonKey] || neonKey;
}
