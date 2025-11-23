/**
 * Dose-Response & Timing Analyzer (Layer C) - Daily Insights Engine v2.0
 * 
 * Analyzes relationships where timing or dosage matters:
 * - Auto-segments doses into tertiles (low/medium/high)
 * - Tests temporal windows: 0-48h (acute), 3-10d (sub-acute), cumulative
 * - Detects dose-dependent vs. threshold effects
 * - Identifies optimal timing (e.g., morning vs. evening)
 * 
 * Evidence tier: 4 (Bayesian analysis of personal data)
 */

import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import { calculateSpearmanRho, calculateCliffsDelta } from './bayesianCorrelationEngine';

// ============================================================================
// Temporal Windows
// ============================================================================

export const TEMPORAL_WINDOWS = {
  ACUTE: { min: 0, max: 2, name: '0-48h' },           // Immediate effects
  SUB_ACUTE: { min: 3, max: 10, name: '3-10d' },      // Short-term effects
  CUMULATIVE: { min: 11, max: 90, name: 'cumulative' }, // Long-term effects
} as const;

export type TemporalWindow = keyof typeof TEMPORAL_WINDOWS;

// ============================================================================
// Dose Segmentation
// ============================================================================

export interface DosageEvent {
  date: string; // YYYY-MM-DD
  amount: number;
  timing?: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface OutcomeDataPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/**
 * Segment dosages into tertiles (low/medium/high)
 * 
 * @param dosages - Array of dosage amounts
 * @returns Tertile thresholds { low: <33rd, medium: 33-66th, high: >66th }
 */
export function calculateDoseTertiles(dosages: number[]): {
  lowThreshold: number;
  mediumThreshold: number;
  highThreshold: number;
} {
  if (dosages.length < 3) {
    throw new Error('Need at least 3 dosage events to calculate tertiles');
  }
  
  const sorted = [...dosages].sort((a, b) => a - b);
  const n = sorted.length;
  
  // 33rd and 66th percentiles
  const lowIdx = Math.floor(n / 3);
  const highIdx = Math.floor((2 * n) / 3);
  
  return {
    lowThreshold: sorted[lowIdx],
    mediumThreshold: sorted[highIdx],
    highThreshold: sorted[sorted.length - 1],
  };
}

/**
 * Classify a dose as low/medium/high based on tertiles
 * 
 * @param dose - Dose amount
 * @param tertiles - Tertile thresholds
 * @returns 'low', 'medium', or 'high'
 */
export function classifyDose(
  dose: number,
  tertiles: ReturnType<typeof calculateDoseTertiles>
): 'low' | 'medium' | 'high' {
  if (dose < tertiles.lowThreshold) return 'low';
  if (dose < tertiles.mediumThreshold) return 'medium';
  return 'high';
}

// ============================================================================
// Temporal Relationship Analysis
// ============================================================================

/**
 * Extract outcome values within a temporal window after each dosage event
 * 
 * @param dosageEvents - Dosage events with dates
 * @param outcomeData - Outcome measurements with dates
 * @param window - Temporal window to analyze
 * @returns Paired dosage-outcome values within the window (includes timing metadata)
 */
export function extractTemporalPairs(
  dosageEvents: DosageEvent[],
  outcomeData: OutcomeDataPoint[],
  window: TemporalWindow
): Array<{ dose: number; outcome: number; lagDays: number; timing?: string; dosageDate: string }> {
  const pairs: Array<{ dose: number; outcome: number; lagDays: number; timing?: string; dosageDate: string }> = [];
  const windowConfig = TEMPORAL_WINDOWS[window];
  
  for (const dosageEvent of dosageEvents) {
    const dosageDate = startOfDay(parseISO(dosageEvent.date));
    
    // Find outcomes within the temporal window
    for (const outcome of outcomeData) {
      const outcomeDate = startOfDay(parseISO(outcome.date));
      const lagDays = differenceInDays(outcomeDate, dosageDate);
      
      // Check if outcome falls within window
      if (lagDays >= windowConfig.min && lagDays <= windowConfig.max) {
        pairs.push({
          dose: dosageEvent.amount,
          outcome: outcome.value,
          lagDays,
          timing: dosageEvent.timing,
          dosageDate: dosageEvent.date,
        });
      }
    }
  }
  
  return pairs;
}

// ============================================================================
// Dose-Response Analysis
// ============================================================================

export interface DoseResponseResult {
  independent: string;
  dependent: string;
  window: TemporalWindow;
  effectType: 'dose_dependent' | 'threshold' | 'none';
  effectSize: number; // Spearman ρ for dose-dependent, Cliff's δ for threshold
  direction: 'positive' | 'negative';
  tertiles: {
    low: { avgDose: number; avgOutcome: number; n: number };
    medium: { avgDose: number; avgOutcome: number; n: number };
    high: { avgDose: number; avgOutcome: number; n: number };
  };
  optimalDose?: 'low' | 'medium' | 'high';
  evidenceTier: '4';
}

/**
 * Analyze dose-response relationship in a temporal window
 * 
 * Tests two patterns:
 * 1. Dose-dependent: Linear/monotonic relationship (use Spearman ρ)
 * 2. Threshold: Binary effect (low vs. high doses, use Cliff's δ)
 * 
 * @param dosageEvents - Dosage events
 * @param outcomeData - Outcome measurements
 * @param independentName - Name of dosage variable
 * @param dependentName - Name of outcome variable
 * @param window - Temporal window to analyze
 * @returns Dose-response result or null if no significant effect
 */
export function analyzeDoseResponse(
  dosageEvents: DosageEvent[],
  outcomeData: OutcomeDataPoint[],
  independentName: string,
  dependentName: string,
  window: TemporalWindow
): DoseResponseResult | null {
  // Extract temporal pairs
  const pairs = extractTemporalPairs(dosageEvents, outcomeData, window);
  
  if (pairs.length < 5) {
    return null; // Need at least 5 data points
  }
  
  // Calculate dose tertiles
  const doses = pairs.map(p => p.dose);
  const tertiles = calculateDoseTertiles(doses);
  
  // Segment pairs by dose tertile
  const lowDosePairs = pairs.filter(p => classifyDose(p.dose, tertiles) === 'low');
  const mediumDosePairs = pairs.filter(p => classifyDose(p.dose, tertiles) === 'medium');
  const highDosePairs = pairs.filter(p => classifyDose(p.dose, tertiles) === 'high');
  
  // Calculate statistics per tertile
  const tertileStats = {
    low: {
      avgDose: average(lowDosePairs.map(p => p.dose)),
      avgOutcome: average(lowDosePairs.map(p => p.outcome)),
      n: lowDosePairs.length,
    },
    medium: {
      avgDose: average(mediumDosePairs.map(p => p.dose)),
      avgOutcome: average(mediumDosePairs.map(p => p.outcome)),
      n: mediumDosePairs.length,
    },
    high: {
      avgDose: average(highDosePairs.map(p => p.dose)),
      avgOutcome: average(highDosePairs.map(p => p.outcome)),
      n: highDosePairs.length,
    },
  };
  
  // Test 1: Dose-dependent (linear/monotonic) relationship
  const outcomes = pairs.map(p => p.outcome);
  let rho = 0;
  try {
    rho = calculateSpearmanRho(doses, outcomes);
  } catch (e) {
    return null; // Not enough variance
  }
  
  const isDoseDependentSignificant = Math.abs(rho) >= 0.35;
  
  // Test 2: Threshold effect (low vs. high doses)
  let cliffsDelta = 0;
  if (lowDosePairs.length > 0 && highDosePairs.length > 0) {
    const lowOutcomes = lowDosePairs.map(p => p.outcome);
    const highOutcomes = highDosePairs.map(p => p.outcome);
    cliffsDelta = calculateCliffsDelta(highOutcomes, lowOutcomes);
  }
  
  const isThresholdSignificant = Math.abs(cliffsDelta) >= 0.35;
  
  // Determine effect type
  let effectType: 'dose_dependent' | 'threshold' | 'none';
  let effectSize: number;
  
  if (isDoseDependentSignificant && isThresholdSignificant) {
    // Both significant: prefer dose-dependent (more informative)
    effectType = 'dose_dependent';
    effectSize = Math.abs(rho);
  } else if (isDoseDependentSignificant) {
    effectType = 'dose_dependent';
    effectSize = Math.abs(rho);
  } else if (isThresholdSignificant) {
    effectType = 'threshold';
    effectSize = Math.abs(cliffsDelta);
  } else {
    return null; // No significant effect
  }
  
  // Determine direction
  const direction = (effectType === 'dose_dependent' ? rho : cliffsDelta) > 0 ? 'positive' : 'negative';
  
  // Determine optimal dose (tertile with best outcome)
  let optimalDose: 'low' | 'medium' | 'high' | undefined;
  
  if (direction === 'positive') {
    // Higher outcome is better → prefer high dose
    if (tertileStats.high.avgOutcome > tertileStats.medium.avgOutcome &&
        tertileStats.high.avgOutcome > tertileStats.low.avgOutcome) {
      optimalDose = 'high';
    } else if (tertileStats.medium.avgOutcome > tertileStats.low.avgOutcome) {
      optimalDose = 'medium';
    } else {
      optimalDose = 'low';
    }
  } else {
    // Lower outcome is better (e.g., reducing blood glucose) → prefer low dose
    if (tertileStats.low.avgOutcome < tertileStats.medium.avgOutcome &&
        tertileStats.low.avgOutcome < tertileStats.high.avgOutcome) {
      optimalDose = 'low';
    } else if (tertileStats.medium.avgOutcome < tertileStats.high.avgOutcome) {
      optimalDose = 'medium';
    } else {
      optimalDose = 'high';
    }
  }
  
  return {
    independent: independentName,
    dependent: dependentName,
    window,
    effectType,
    effectSize,
    direction,
    tertiles: tertileStats,
    optimalDose,
    evidenceTier: '4',
  };
}

// ============================================================================
// Timing Analysis
// ============================================================================

export interface TimingAnalysisResult {
  independent: string;
  dependent: string;
  window: TemporalWindow;
  optimalTiming: 'morning' | 'afternoon' | 'evening' | 'night' | undefined;
  timingStats: {
    morning?: { avgOutcome: number; n: number };
    afternoon?: { avgOutcome: number; n: number };
    evening?: { avgOutcome: number; n: number };
    night?: { avgOutcome: number; n: number };
  };
  effectSize: number; // Cliff's δ comparing best vs. worst timing
  direction: 'positive' | 'negative';
  evidenceTier: '4';
}

/**
 * Analyze optimal timing for an intervention
 * 
 * Compares outcomes when intervention occurs at different times of day
 * 
 * @param dosageEvents - Dosage events with timing info
 * @param outcomeData - Outcome measurements
 * @param independentName - Name of intervention variable
 * @param dependentName - Name of outcome variable
 * @param window - Temporal window to analyze
 * @returns Timing analysis result or null if insufficient data
 */
export function analyzeOptimalTiming(
  dosageEvents: DosageEvent[],
  outcomeData: OutcomeDataPoint[],
  independentName: string,
  dependentName: string,
  window: TemporalWindow
): TimingAnalysisResult | null {
  // Extract temporal pairs (includes timing metadata from dosage events)
  const pairs = extractTemporalPairs(dosageEvents, outcomeData, window);
  
  if (pairs.length < 5) {
    return null;
  }
  
  // Group by timing (using timing from each pair)
  const timingGroups: Record<string, number[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };
  
  for (const pair of pairs) {
    if (pair.timing && timingGroups[pair.timing]) {
      timingGroups[pair.timing].push(pair.outcome);
    }
  }
  
  // Calculate stats per timing
  const timingStats: TimingAnalysisResult['timingStats'] = {};
  for (const [timing, outcomes] of Object.entries(timingGroups)) {
    if (outcomes.length > 0) {
      timingStats[timing as keyof typeof timingStats] = {
        avgOutcome: average(outcomes),
        n: outcomes.length,
      };
    }
  }
  
  // Need at least 2 timing groups with data
  const timingsWithData = Object.keys(timingStats);
  if (timingsWithData.length < 2) {
    return null;
  }
  
  // Find best and worst timing
  const timingAvgs = Object.entries(timingStats).map(([timing, stats]) => ({
    timing: timing as 'morning' | 'afternoon' | 'evening' | 'night',
    avgOutcome: stats!.avgOutcome,
  }));
  
  timingAvgs.sort((a, b) => b.avgOutcome - a.avgOutcome);
  
  const bestTiming = timingAvgs[0].timing;
  const worstTiming = timingAvgs[timingAvgs.length - 1].timing;
  
  // Calculate effect size (Cliff's δ between best and worst)
  const bestOutcomes = timingGroups[bestTiming];
  const worstOutcomes = timingGroups[worstTiming];
  
  const cliffsDelta = calculateCliffsDelta(bestOutcomes, worstOutcomes);
  
  // Check significance
  if (Math.abs(cliffsDelta) < 0.35) {
    return null; // No significant timing effect
  }
  
  return {
    independent: independentName,
    dependent: dependentName,
    window,
    optimalTiming: bestTiming,
    timingStats,
    effectSize: Math.abs(cliffsDelta),
    direction: cliffsDelta > 0 ? 'positive' : 'negative',
    evidenceTier: '4',
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
