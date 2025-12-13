/**
 * Anomaly Detection & Stale-Lab Early Warning System (Layer D) - Daily Insights Engine v2.0
 * 
 * Detects when fast-moving metrics (HealthKit, life events) deviate in a pattern
 * that can be explained by stale slow-moving biomarkers (yellow/red freshness).
 * 
 * Core Logic:
 * 1. Identify slow-moving biomarkers in yellow/red freshness zones
 * 2. For each stale biomarker, check if ≥3 fast-moving metrics are deviating
 *    in the direction predicted by that biomarker's value
 * 3. Generate "stale lab early warning" insight suggesting recheck
 * 
 * Example: Ferritin was 15 ng/mL (low) 6 months ago (yellow zone).
 * Now HRV ↓, Energy ↓, Recovery ↓ → Suggests ferritin may still be low.
 * Recommend rechecking ferritin instead of treating symptoms.
 * 
 * Evidence tier: 3 (Mechanistic + observational data)
 */

import { differenceInDays } from 'date-fns';
import {
  calculateFreshnessScore,
  categorizeFreshness,
  SLOW_MOVING_BIOMARKERS,
  FAST_MOVING_METRICS,
  FreshnessCategory,
} from './dataClassification';
import { PHYSIOLOGICAL_PATHWAYS } from './physiologicalPathways';

// ============================================================================
// Deviation Detection
// ============================================================================

export interface MetricDeviation {
  metric: string;
  currentValue: number;
  baselineValue: number;
  percentChange: number;
  direction: 'increase' | 'decrease';
  isSignificant: boolean; // ≥20% change from baseline
}

/**
 * Deviation significance threshold
 * A metric must deviate by ≥20% from baseline to count as "significant"
 */
const DEVIATION_THRESHOLD = 0.20; // 20%

/**
 * Calculate baseline for a metric (30-day rolling average)
 * 
 * @param metricValues - Array of metric values with dates
 * @param currentDate - Current date
 * @returns Baseline value (30-day average)
 */
export function calculateBaseline(
  metricValues: Array<{ date: string; value: number }>,
  currentDate: Date
): number | null {
  // Get values from the past 30 days
  const thirtyDaysAgo = new Date(currentDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentValues = metricValues.filter(mv => {
    const mvDate = new Date(mv.date);
    return mvDate >= thirtyDaysAgo && mvDate <= currentDate;
  });
  
  if (recentValues.length < 5) {
    return null; // Not enough data for reliable baseline
  }
  
  const sum = recentValues.reduce((acc, mv) => acc + mv.value, 0);
  return sum / recentValues.length;
}

/**
 * Detect if a metric has significantly deviated from its baseline
 * 
 * CRITICAL: Only works for fast-moving metrics (HealthKit, life events)
 * Slow-moving biomarkers should not be analyzed for "deviations"
 * 
 * @param currentValue - Current metric value
 * @param baselineValue - Baseline (30-day average)
 * @param metricName - Name of the metric
 * @returns Deviation info if significant, null otherwise
 */
export function detectDeviation(
  currentValue: number,
  baselineValue: number,
  metricName: string
): MetricDeviation | null {
  // Validate that this is a fast-moving metric
  if (!FAST_MOVING_METRICS.has(metricName)) {
    return null; // Only fast-moving metrics can have "deviations"
  }
  
  const percentChange = (currentValue - baselineValue) / baselineValue;
  const isSignificant = Math.abs(percentChange) >= DEVIATION_THRESHOLD;
  
  if (!isSignificant) {
    return null;
  }
  
  return {
    metric: metricName,
    currentValue,
    baselineValue,
    percentChange,
    direction: percentChange > 0 ? 'increase' : 'decrease',
    isSignificant: true,
  };
}

// ============================================================================
// Batch Deviation Detection (Centralized)
// ============================================================================

/**
 * Detect deviations across multiple metrics from raw data
 * 
 * This is the RECOMMENDED way to populate currentDeviations - it automatically:
 * - Filters to fast-moving metrics only
 * - Calculates baselines
 * - Validates deviation significance
 * - Returns only valid deviations
 * 
 * @param metricSnapshots - Map of metric name to array of values with dates
 * @param currentDate - Current date for baseline calculation
 * @returns Array of valid metric deviations (fast-moving metrics only)
 */
export function detectMetricDeviations(
  metricSnapshots: Map<string, Array<{ date: string; value: number }>>,
  currentDate: Date = new Date()
): MetricDeviation[] {
  const deviations: MetricDeviation[] = [];
  
  for (const [metricName, values] of Array.from(metricSnapshots.entries())) {
    // Skip slow-moving biomarkers
    if (!FAST_MOVING_METRICS.has(metricName)) {
      continue;
    }
    
    // Calculate baseline
    const baseline = calculateBaseline(values, currentDate);
    if (baseline === null) {
      continue; // Not enough data for this metric
    }
    
    // Get current value (most recent)
    const sortedValues = [...values].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const currentValue = sortedValues[0]?.value;
    
    if (currentValue === undefined) {
      continue;
    }
    
    // Detect deviation
    const deviation = detectDeviation(currentValue, baseline, metricName);
    if (deviation) {
      deviations.push(deviation);
    }
  }
  
  return deviations;
}

// ============================================================================
// Stale Biomarker Analysis
// ============================================================================

export interface StaleBiomarker {
  biomarker: string;
  lastValue: number;
  lastMeasuredDate: Date;
  freshnessScore: number;
  freshnessCategory: FreshnessCategory;
  daysSinceLastMeasurement: number;
  interpretation: 'low' | 'normal' | 'high';
}

/**
 * Build StaleBiomarker object from biomarker data
 * 
 * This is the RECOMMENDED way to create StaleBiomarker objects - it automatically:
 * - Calculates freshness score
 * - Categorizes freshness (green/yellow/red)
 * - Interprets biomarker value (low/normal/high)
 * - Calculates days since last measurement
 * 
 * @param biomarkerName - Biomarker name
 * @param lastValue - Most recent biomarker value
 * @param lastMeasuredDate - Date of last measurement
 * @param currentDate - Current date (defaults to now)
 * @returns StaleBiomarker object with all metadata
 */
export function buildStaleBiomarker(
  biomarkerName: string,
  lastValue: number,
  lastMeasuredDate: Date,
  currentDate: Date = new Date()
): StaleBiomarker {
  const freshnessScore = calculateFreshnessScore(lastMeasuredDate, currentDate);
  const freshnessCategory = categorizeFreshness(freshnessScore);
  const daysSinceLastMeasurement = differenceInDays(currentDate, lastMeasuredDate);
  const interpretation = interpretBiomarkerValue(biomarkerName, lastValue);
  
  return {
    biomarker: biomarkerName,
    lastValue,
    lastMeasuredDate,
    freshnessScore,
    freshnessCategory,
    daysSinceLastMeasurement,
    interpretation,
  };
}

/**
 * Interpret biomarker value as low/normal/high based on clinical ranges
 * 
 * This is a simplified version - in production, should use detailed reference ranges
 * per biomarker, age, sex, etc.
 * 
 * @param biomarker - Biomarker name
 * @param value - Biomarker value
 * @returns 'low', 'normal', or 'high'
 */
export function interpretBiomarkerValue(
  biomarker: string,
  value: number
): 'low' | 'normal' | 'high' {
  // Simplified reference ranges (placeholder - should be comprehensive in production)
  const ranges: Record<string, { low: number; high: number }> = {
    ferritin: { low: 30, high: 200 },
    vitamin_d_25_oh: { low: 30, high: 100 },
    testosterone_total: { low: 300, high: 1000 },
    hs_crp: { low: 0, high: 3 },
    glucose_fasting: { low: 70, high: 100 },
    hematocrit: { low: 38, high: 50 },
  };
  
  const range = ranges[biomarker];
  if (!range) {
    return 'normal'; // Unknown biomarker, assume normal
  }
  
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'normal';
}

/**
 * Get expected deviations in fast-moving metrics based on a stale biomarker
 * 
 * Uses physiological pathways to predict which metrics should deviate and in what direction
 * 
 * @param staleBiomarker - Stale biomarker with interpretation
 * @returns Map of metric names to expected deviation directions
 */
export function getExpectedDeviations(
  staleBiomarker: StaleBiomarker
): Map<string, 'increase' | 'decrease'> {
  const expectedDeviations = new Map<string, 'increase' | 'decrease'>();
  
  // Find pathways where the stale biomarker is the independent variable
  const relevantPathways = PHYSIOLOGICAL_PATHWAYS.filter(
    p => p.independent === staleBiomarker.biomarker
  );
  
  for (const pathway of relevantPathways) {
    // Determine expected deviation based on biomarker interpretation and pathway direction
    let expectedDirection: 'increase' | 'decrease';
    
    if (pathway.direction === 'positive') {
      // Positive relationship: if biomarker is low, dependent should be low (decrease)
      // if biomarker is high, dependent should be high (increase)
      if (staleBiomarker.interpretation === 'low') {
        expectedDirection = 'decrease';
      } else if (staleBiomarker.interpretation === 'high') {
        expectedDirection = 'increase';
      } else {
        continue; // Normal biomarker, no expected deviation
      }
    } else {
      // Negative relationship: if biomarker is low, dependent should be high (increase)
      // if biomarker is high, dependent should be low (decrease)
      if (staleBiomarker.interpretation === 'low') {
        expectedDirection = 'increase';
      } else if (staleBiomarker.interpretation === 'high') {
        expectedDirection = 'decrease';
      } else {
        continue; // Normal biomarker, no expected deviation
      }
    }
    
    expectedDeviations.set(pathway.dependent, expectedDirection);
  }
  
  return expectedDeviations;
}

// ============================================================================
// Stale-Lab Early Warning Detection
// ============================================================================

export interface StaleLabWarning {
  staleBiomarker: StaleBiomarker;
  matchingDeviations: MetricDeviation[];
  evidenceTier: '3'; // Mechanistic + observational
  confidence: number; // 0.0-1.0 based on # of matching deviations
  recommendation: string;
}

/**
 * Detect stale-lab early warning pattern
 * 
 * Checks if ≥3 fast-moving metrics are deviating in the direction predicted
 * by a stale slow-moving biomarker.
 * 
 * @param staleBiomarker - Stale biomarker (yellow/red freshness)
 * @param currentDeviations - Currently detected metric deviations
 * @returns StaleLabWarning if pattern detected, null otherwise
 */
export function detectStaleLabWarning(
  staleBiomarker: StaleBiomarker,
  currentDeviations: MetricDeviation[]
): StaleLabWarning | null {
  // Get expected deviations based on biomarker interpretation
  const expectedDeviations = getExpectedDeviations(staleBiomarker);
  
  if (expectedDeviations.size === 0) {
    return null; // No known pathways for this biomarker
  }
  
  // Find matching deviations (actual direction matches expected direction)
  const matchingDeviations = currentDeviations.filter(deviation => {
    const expectedDirection = expectedDeviations.get(deviation.metric);
    return expectedDirection && deviation.direction === expectedDirection;
  });
  
  // Need ≥3 matching deviations to trigger warning
  if (matchingDeviations.length < 3) {
    return null;
  }
  
  // Calculate confidence based on match rate
  // More matching deviations = higher confidence
  const matchRate = matchingDeviations.length / expectedDeviations.size;
  const confidence = Math.min(1.0, 0.6 + (matchRate * 0.4)); // 60-100% confidence range
  
  // Generate recommendation
  const biomarkerName = staleBiomarker.biomarker.replace(/_/g, ' ');
  const interpretation = staleBiomarker.interpretation;
  const daysSince = staleBiomarker.daysSinceLastMeasurement;
  
  const recommendation = 
    `Your ${biomarkerName} was ${interpretation} (${staleBiomarker.lastValue}) ` +
    `${daysSince} days ago and hasn't been rechecked. ` +
    `Recent changes in ${matchingDeviations.length} health metrics ` +
    `(${matchingDeviations.map(d => d.metric).join(', ')}) ` +
    `suggest it may still be ${interpretation}. Consider rechecking ${biomarkerName}.`;
  
  return {
    staleBiomarker,
    matchingDeviations,
    evidenceTier: '3',
    confidence,
    recommendation,
  };
}

/**
 * Filter biomarkers to only include stale ones (yellow/red freshness)
 * 
 * CRITICAL: Only yellow/red biomarkers should trigger stale-lab warnings
 * Green (fresh) biomarkers are current and shouldn't generate warnings
 * 
 * @param biomarkers - All biomarkers with freshness info
 * @returns Only biomarkers in yellow or red freshness zones
 */
export function filterStaleBiomarkers(
  biomarkers: StaleBiomarker[]
): StaleBiomarker[] {
  return biomarkers.filter(
    b => b.freshnessCategory === 'yellow' || b.freshnessCategory === 'red'
  );
}

/**
 * Analyze all stale biomarkers for early warning patterns
 * 
 * CRITICAL: Requires ≥3 valid metric deviations with baselines to proceed
 * This ensures the ≥3 matching deviations rule can be satisfied
 * 
 * @param staleBiomarkers - Array of ALL biomarkers (will filter to yellow/red)
 * @param currentDeviations - Current metric deviations (already validated)
 * @returns Array of stale-lab warnings, sorted by confidence
 */
export function analyzeStaleLabWarnings(
  staleBiomarkers: StaleBiomarker[],
  currentDeviations: MetricDeviation[]
): StaleLabWarning[] {
  // Guard: Need ≥3 valid deviations for the ≥3 matching rule to work
  if (currentDeviations.length < 3) {
    return []; // Not enough data for reliable stale-lab detection
  }
  
  // Filter to only stale biomarkers (yellow/red freshness)
  const staleBiomarkersOnly = filterStaleBiomarkers(staleBiomarkers);
  
  const warnings: StaleLabWarning[] = [];
  
  for (const staleBiomarker of staleBiomarkersOnly) {
    const warning = detectStaleLabWarning(staleBiomarker, currentDeviations);
    if (warning) {
      warnings.push(warning);
    }
  }
  
  // Sort by confidence (descending)
  return warnings.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// General Anomaly Detection (Non-Biomarker)
// ============================================================================

export interface AnomalyCluster {
  metrics: MetricDeviation[];
  clusterType: 'stress_spike' | 'recovery_decline' | 'sleep_disruption' | 'performance_drop';
  evidenceTier: '4'; // Observational pattern
  confidence: number;
  description: string;
}

/**
 * Detect anomaly clusters (multiple correlated deviations)
 * 
 * Identifies common patterns like stress spikes, recovery declines, etc.
 * 
 * @param deviations - All current metric deviations
 * @returns Detected anomaly clusters
 */
export function detectAnomalyClusters(
  deviations: MetricDeviation[]
): AnomalyCluster[] {
  const clusters: AnomalyCluster[] = [];
  
  // Pattern 1: Stress spike (HRV ↓, RHR ↑, Sleep ↓)
  const hrvDown = deviations.find(d => d.metric === 'hrv_ms' && d.direction === 'decrease');
  const rhrUp = deviations.find(d => d.metric === 'resting_heart_rate_bpm' && d.direction === 'increase');
  const sleepDown = deviations.find(d => d.metric === 'sleep_duration_min' && d.direction === 'decrease');
  
  if (hrvDown && rhrUp && sleepDown) {
    clusters.push({
      metrics: [hrvDown, rhrUp, sleepDown],
      clusterType: 'stress_spike',
      evidenceTier: '4',
      confidence: 0.85,
      description: 'Stress spike detected: HRV down, resting heart rate up, sleep reduced',
    });
  }
  
  // Pattern 2: Recovery decline (Deep sleep ↓, HRV ↓, Energy ↓)
  const deepSleepDown = deviations.find(d => d.metric === 'deep_sleep_min' && d.direction === 'decrease');
  const energyDown = deviations.find(d => d.metric === 'active_energy' && d.direction === 'decrease');
  
  if (deepSleepDown && hrvDown && energyDown) {
    clusters.push({
      metrics: [deepSleepDown, hrvDown, energyDown],
      clusterType: 'recovery_decline',
      evidenceTier: '4',
      confidence: 0.80,
      description: 'Recovery decline: Deep sleep down, HRV down, energy expenditure down',
    });
  }
  
  // Pattern 3: Sleep disruption (Sleep latency ↑, Awakenings ↑, Total sleep ↓)
  const latencyUp = deviations.find(d => d.metric === 'sleep_latency_minutes' && d.direction === 'increase');
  const awakeningsUp = deviations.find(d => d.metric === 'sleep_awakenings' && d.direction === 'increase');
  
  if (latencyUp && awakeningsUp && sleepDown) {
    clusters.push({
      metrics: [latencyUp, awakeningsUp, sleepDown],
      clusterType: 'sleep_disruption',
      evidenceTier: '4',
      confidence: 0.90,
      description: 'Sleep disruption: Increased latency, more awakenings, reduced total sleep',
    });
  }
  
  return clusters;
}

// ============================================================================
// Out-of-Range Biomarker Detection
// ============================================================================

export interface OutOfRangeBiomarker {
  biomarker: string;
  currentValue: number;
  unit: string;
  testDate: Date;
  interpretation: 'low' | 'high';
  daysSinceTest: number;
}

/**
 * Detect biomarkers that are currently flagged as out of range
 * 
 * This directly uses the isAbnormal flags from lab results to identify
 * biomarkers that need attention, independent of stale-lab analysis.
 * 
 * @param biomarkers - Array of biomarker measurements with abnormal flags
 * @param currentDate - Current date for age calculation
 * @returns Array of out-of-range biomarkers with details
 */
export function detectOutOfRangeBiomarkers(
  biomarkers: Array<{
    name: string;
    value: number;
    unit: string;
    testDate: Date;
    isAbnormal: boolean;
  }>,
  currentDate: Date = new Date()
): OutOfRangeBiomarker[] {
  // Group biomarkers by name, keep most recent measurement
  const latestBiomarkers = new Map<string, typeof biomarkers[0]>();
  
  for (const biomarker of biomarkers) {
    const existing = latestBiomarkers.get(biomarker.name);
    if (!existing || biomarker.testDate > existing.testDate) {
      latestBiomarkers.set(biomarker.name, biomarker);
    }
  }
  
  // Filter to abnormal ones and determine interpretation
  const outOfRange: OutOfRangeBiomarker[] = [];
  
  for (const [name, data] of latestBiomarkers.entries()) {
    if (!data.isAbnormal) {
      continue; // Skip normal biomarkers
    }
    
    const daysSinceTest = differenceInDays(currentDate, data.testDate);
    
    // Determine if low or high based on biomarker-specific logic
    const interpretation = interpretBiomarkerValue(name, data.value);
    
    if (interpretation === 'normal') {
      // Flag says abnormal but interpretBiomarkerValue says normal
      // This means we need better reference ranges
      // Default to 'high' for now (most common for health optimization)
      outOfRange.push({
        biomarker: name,
        currentValue: data.value,
        unit: data.unit,
        testDate: data.testDate,
        interpretation: 'high',
        daysSinceTest,
      });
    } else {
      outOfRange.push({
        biomarker: name,
        currentValue: data.value,
        unit: data.unit,
        testDate: data.testDate,
        interpretation,
        daysSinceTest,
      });
    }
  }
  
  return outOfRange;
}
