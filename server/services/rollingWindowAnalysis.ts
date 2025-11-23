/**
 * Rolling Window Analysis - Daily Insights Engine v2.0
 * 
 * Detects temporal patterns across different time windows:
 * - Short-term (2-14 days): Acute effects (e.g., caffeine → sleep tonight)
 * - Medium-term (15-90 days): Adaptive effects (e.g., exercise → recovery over weeks)
 * - Long-term (90+ days): Chronic effects (e.g., vitamin D → inflammation over months)
 * 
 * This helps differentiate between:
 * 1. Immediate/acute relationships (respond quickly)
 * 2. Delayed/adaptive relationships (take time to develop)
 * 3. Cumulative/chronic relationships (build up over months)
 * 
 * Used by correlation and dose-response engines to understand temporal dynamics.
 */

import { differenceInDays } from 'date-fns';

// ============================================================================
// Time Window Definitions
// ============================================================================

export type TimeWindow = 'short' | 'medium' | 'long';

export interface TimeWindowDefinition {
  name: TimeWindow;
  minDays: number;
  maxDays: number;
  description: string;
}

export const TIME_WINDOWS: TimeWindowDefinition[] = [
  {
    name: 'short',
    minDays: 2,
    maxDays: 14,
    description: 'Short-term (2-14 days) - Acute effects',
  },
  {
    name: 'medium',
    minDays: 15,
    maxDays: 89,
    description: 'Medium-term (15-90 days) - Adaptive effects',
  },
  {
    name: 'long',
    minDays: 90, // Changed from 91 to include 90-day data
    maxDays: 365,
    description: 'Long-term (90+ days) - Chronic effects',
  },
];

// ============================================================================
// Data Windowing
// ============================================================================

export interface DataPoint {
  date: Date;
  value: number;
}

export interface WindowedData {
  window: TimeWindow;
  dataPoints: DataPoint[];
  startDate: Date;
  endDate: Date;
  sampleSize: number;
}

/**
 * Create rolling windows from a dataset
 * 
 * @param data - Array of data points with dates and values
 * @param currentDate - Current date (end of analysis window)
 * @param windows - Which windows to create (default: all)
 * @returns Array of windowed datasets
 */
export function createRollingWindows(
  data: DataPoint[],
  currentDate: Date = new Date(),
  windows: TimeWindow[] = ['short', 'medium', 'long']
): WindowedData[] {
  const windowedData: WindowedData[] = [];
  
  for (const windowType of windows) {
    const windowDef = TIME_WINDOWS.find(w => w.name === windowType);
    if (!windowDef) continue;
    
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - windowDef.maxDays);
    
    const endDate = new Date(currentDate);
    endDate.setDate(endDate.getDate() - windowDef.minDays);
    
    const dataPoints = data.filter(dp => {
      const dpDate = new Date(dp.date);
      return dpDate >= startDate && dpDate <= endDate;
    });
    
    windowedData.push({
      window: windowType,
      dataPoints,
      startDate,
      endDate,
      sampleSize: dataPoints.length,
    });
  }
  
  return windowedData;
}

// ============================================================================
// Window-Specific Correlation Analysis
// ============================================================================

export interface WindowCorrelation {
  window: TimeWindow;
  correlation: number;
  sampleSize: number;
  pValue?: number;
  isSignificant: boolean; // |correlation| >= 0.35 and sampleSize >= minSampleSize
}

/**
 * Minimum sample sizes for each window type
 */
const MIN_SAMPLE_SIZES: Record<TimeWindow, number> = {
  short: 5,   // At least 5 days in 2-14 day window
  medium: 10, // At least 10 days in 15-90 day window
  long: 20,   // At least 20 days in 90+ day window
};

/**
 * Calculate correlation for each time window
 * 
 * This allows detecting if a relationship is:
 * - Only present in short-term (acute)
 * - Only present in medium/long-term (adaptive/chronic)
 * - Present across all windows (persistent)
 * 
 * @param xData - Independent variable data points
 * @param yData - Dependent variable data points
 * @param currentDate - Current date for window calculation
 * @returns Correlations for each time window
 */
export function analyzeWindowCorrelations(
  xData: DataPoint[],
  yData: DataPoint[],
  currentDate: Date = new Date()
): WindowCorrelation[] {
  const correlations: WindowCorrelation[] = [];
  
  for (const windowType of ['short', 'medium', 'long'] as TimeWindow[]) {
    const windowDef = TIME_WINDOWS.find(w => w.name === windowType);
    if (!windowDef) continue;
    
    // Create window
    const xWindowed = createRollingWindows(xData, currentDate, [windowType])[0];
    const yWindowed = createRollingWindows(yData, currentDate, [windowType])[0];
    
    // Match data points by date
    const pairs: Array<{ x: number; y: number }> = [];
    for (const xPoint of xWindowed.dataPoints) {
      const yPoint = yWindowed.dataPoints.find(
        yp => differenceInDays(new Date(yp.date), new Date(xPoint.date)) === 0
      );
      if (yPoint) {
        pairs.push({ x: xPoint.value, y: yPoint.value });
      }
    }
    
    const sampleSize = pairs.length;
    const minSampleSize = MIN_SAMPLE_SIZES[windowType];
    
    // Calculate correlation if sufficient data
    let correlation = 0;
    if (sampleSize >= minSampleSize) {
      correlation = calculateSpearmanCorrelation(
        pairs.map(p => p.x),
        pairs.map(p => p.y)
      );
    }
    
    const isSignificant = 
      Math.abs(correlation) >= 0.35 && sampleSize >= minSampleSize;
    
    correlations.push({
      window: windowType,
      correlation,
      sampleSize,
      isSignificant,
    });
  }
  
  return correlations;
}

/**
 * Simple Spearman rank correlation calculation
 * 
 * @param x - X values
 * @param y - Y values
 * @returns Spearman correlation coefficient (-1 to 1)
 */
function calculateSpearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return 0;
  }
  
  // Rank both arrays
  const xRanks = rankArray(x);
  const yRanks = rankArray(y);
  
  // Calculate Pearson correlation on ranks
  const n = x.length;
  const meanXRank = xRanks.reduce((a, b) => a + b, 0) / n;
  const meanYRank = yRanks.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const xDiff = xRanks[i] - meanXRank;
    const yDiff = yRanks[i] - meanYRank;
    numerator += xDiff * yDiff;
    denomX += xDiff * xDiff;
    denomY += yDiff * yDiff;
  }
  
  if (denomX === 0 || denomY === 0) {
    return 0;
  }
  
  return numerator / Math.sqrt(denomX * denomY);
}

/**
 * Rank an array of values (ties get average rank)
 * 
 * @param values - Values to rank
 * @returns Array of ranks
 */
function rankArray(values: number[]): number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  
  const ranks = new Array(values.length).fill(0);
  
  for (let i = 0; i < sorted.length; i++) {
    let tieCount = 1;
    let tieSum = i + 1;
    
    // Handle ties
    while (
      i + tieCount < sorted.length &&
      sorted[i + tieCount].value === sorted[i].value
    ) {
      tieSum += i + tieCount + 1;
      tieCount++;
    }
    
    const avgRank = tieSum / tieCount;
    
    for (let j = 0; j < tieCount; j++) {
      ranks[sorted[i + j].index] = avgRank;
    }
    
    i += tieCount - 1;
  }
  
  return ranks;
}

// ============================================================================
// Window Pattern Classification
// ============================================================================

export type WindowPattern = 
  | 'acute_only'        // Only significant in short-term (insufficient data to assess tolerance)
  | 'fading'            // Significant in short-term but not medium/long despite adequate data (tolerance/adaptation)
  | 'adaptive_only'     // Only significant in medium-term
  | 'chronic_only'      // Only significant in long-term
  | 'persistent'        // Significant across all windows
  | 'developing'        // Significant in medium + long but not short (cumulative)
  | 'none';             // Not significant in any window

export interface WindowPatternResult {
  pattern: WindowPattern;
  description: string;
  correlations: WindowCorrelation[];
  recommendation: string;
}

/**
 * Classify the temporal pattern based on window correlations
 * 
 * @param correlations - Correlations for each window
 * @returns Pattern classification with recommendations
 */
export function classifyWindowPattern(
  correlations: WindowCorrelation[]
): WindowPatternResult {
  const short = correlations.find(c => c.window === 'short');
  const medium = correlations.find(c => c.window === 'medium');
  const long = correlations.find(c => c.window === 'long');
  
  const shortSig = short?.isSignificant || false;
  const mediumSig = medium?.isSignificant || false;
  const longSig = long?.isSignificant || false;
  
  let pattern: WindowPattern;
  let description: string;
  let recommendation: string;
  
  if (shortSig && mediumSig && longSig) {
    pattern = 'persistent';
    description = 'This relationship holds across all time windows (short, medium, and long-term).';
    recommendation = 'High confidence pattern. Optimize this variable consistently.';
  } else if (shortSig && !mediumSig && !longSig) {
    // Distinguish between acute_only vs. fading based on sample sizes
    // If medium/long windows have adequate data but aren't significant → fading (tolerance)
    // If medium/long windows lack data → acute_only (insufficient data to assess)
    const mediumHasData = (medium?.sampleSize || 0) >= MIN_SAMPLE_SIZES.medium;
    const longHasData = (long?.sampleSize || 0) >= MIN_SAMPLE_SIZES.long;
    
    if (mediumHasData || longHasData) {
      // Adequate data exists but effect isn't significant → suggests tolerance/adaptation
      pattern = 'fading';
      description = 'This relationship fades over time - significant only in the short-term despite adequate long-term data.';
      recommendation = '⚠️ Tolerance/adaptation signal. Effect may diminish with continued use. Consider cycling or breaks.';
    } else {
      // Not enough data in medium/long windows to assess tolerance
      pattern = 'acute_only';
      description = 'This relationship is only significant in the short-term (2-14 days).';
      recommendation = 'Acute effect. Benefits appear quickly. More data needed to assess long-term sustainability.';
    }
  } else if (!shortSig && mediumSig && !longSig) {
    pattern = 'adaptive_only';
    description = 'This relationship is only significant in the medium-term (15-90 days).';
    recommendation = 'Adaptive effect. Benefits take 2-3 weeks to develop.';
  } else if (!shortSig && !mediumSig && longSig) {
    pattern = 'chronic_only';
    description = 'This relationship is only significant in the long-term (90+ days).';
    recommendation = 'Chronic effect. Benefits build slowly over months. Requires sustained intervention.';
  } else if (!shortSig && mediumSig && longSig) {
    pattern = 'developing';
    description = 'This relationship strengthens over time (medium and long-term).';
    recommendation = 'Cumulative effect. Stick with it - benefits compound over weeks to months.';
  } else {
    pattern = 'none';
    description = 'No significant relationship detected in any time window.';
    recommendation = 'Insufficient evidence for this relationship in your data.';
  }
  
  return {
    pattern,
    description,
    correlations,
    recommendation,
  };
}
