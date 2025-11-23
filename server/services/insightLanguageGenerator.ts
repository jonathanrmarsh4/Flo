/**
 * Natural Language Generation for Insights - Daily Insights Engine v2.0
 * 
 * Converts structured insights into natural, actionable language with:
 * - Magnitude descriptions (small, medium, large effects)
 * - Evidence tier explanations (study-backed, replicated, personal)
 * - Freshness hedging (recent vs. older data)
 * - N-of-1 experiment suggestions (actionable next steps)
 * 
 * Writing principles:
 * - Use everyday language (avoid jargon)
 * - Be specific with numbers when helpful
 * - Hedge appropriately based on evidence tier and freshness
 * - Provide clear, actionable recommendations
 */

import { EvidenceTier, formatEvidenceTier } from './evidenceHierarchy';
import { FreshnessCategory } from './dataClassification';

// ============================================================================
// Magnitude Descriptions
// ============================================================================

/**
 * Convert effect size to natural language magnitude
 * 
 * @param effectSize - Absolute effect size (0-1)
 * @returns Natural language description
 */
export function describeEffectMagnitude(effectSize: number): string {
  const absEffect = Math.abs(effectSize);
  
  if (absEffect >= 0.60) {
    return 'strong';
  } else if (absEffect >= 0.45) {
    return 'moderate to strong';
  } else if (absEffect >= 0.35) {
    return 'moderate';
  } else if (absEffect >= 0.25) {
    return 'small to moderate';
  } else {
    return 'small';
  }
}

/**
 * Convert deviation percentage to natural language
 * 
 * @param deviationPercent - Percentage deviation from baseline
 * @returns Natural language description
 */
export function describeDeviation(deviationPercent: number): string {
  const absDeviation = Math.abs(deviationPercent);
  
  if (absDeviation >= 0.40) {
    return 'sharply';
  } else if (absDeviation >= 0.25) {
    return 'notably';
  } else if (absDeviation >= 0.15) {
    return 'moderately';
  } else {
    return 'slightly';
  }
}

/**
 * Convert direction to natural language
 * 
 * @param direction - positive (↑) or negative (↓)
 * @param metric - Metric name
 * @returns Natural language description
 */
export function describeDirection(
  direction: 'positive' | 'negative' | 'increase' | 'decrease',
  metric: string
): string {
  // Metrics where "increase" is good
  const positiveMetrics = ['hrv', 'sleep_deep', 'energy', 'testosterone', 'vitamin_d'];
  const isPositiveMetric = positiveMetrics.some(pm => metric.includes(pm));
  
  // Metrics where "decrease" is good
  const negativeMetrics = ['cortisol', 'crp', 'glucose', 'rhr', 'latency', 'awakenings'];
  const isNegativeMetric = negativeMetrics.some(nm => metric.includes(nm));
  
  if (direction === 'positive' || direction === 'increase') {
    if (isNegativeMetric) {
      return 'increased (⚠️ warning sign)';
    }
    return 'increased';
  } else {
    if (isPositiveMetric) {
      return 'decreased (⚠️ warning sign)';
    }
    return 'decreased';
  }
}

// ============================================================================
// Evidence Tier Explanations
// ============================================================================

/**
 * Generate evidence tier explanation for insight
 * 
 * @param tier - Evidence tier (1-5)
 * @param includeDetails - Include detailed explanation
 * @returns Natural language explanation
 */
export function explainEvidenceTier(
  tier: EvidenceTier,
  includeDetails: boolean = false
): string {
  const explanations: Record<EvidenceTier, string> = {
    '1': 'backed by meta-analyses and randomized controlled trials',
    '2': 'supported by large cohort studies (UK Biobank, NHANES)',
    '3': 'supported by mechanistic research and multiple smaller studies',
    '4': 'emerging pattern replicated in longevity and performance cohorts',
    '5': 'replicated in your personal data ≥2 times',
  };
  
  const baseExplanation = explanations[tier];
  
  if (!includeDetails) {
    return baseExplanation;
  }
  
  // Add tier number and description
  return `${formatEvidenceTier(tier, true)} — ${baseExplanation}`;
}

/**
 * Get confidence qualifier based on evidence tier
 * 
 * @param tier - Evidence tier (1-5)
 * @returns Qualifier word/phrase
 */
export function getConfidenceQualifier(tier: EvidenceTier): string {
  const qualifiers: Record<EvidenceTier, string> = {
    '1': 'well-established',
    '2': 'well-documented',
    '3': 'supported',
    '4': 'emerging',
    '5': 'personally validated',
  };
  
  return qualifiers[tier];
}

// ============================================================================
// Freshness Hedging
// ============================================================================

/**
 * Generate freshness qualifier for data recency
 * 
 * @param daysSinceData - Days since most recent data
 * @param freshnessCategory - green/yellow/red classification
 * @returns Natural language qualifier
 */
export function getFreshnessQualifier(
  daysSinceData: number,
  freshnessCategory?: FreshnessCategory
): string {
  if (daysSinceData <= 1) {
    return 'based on today\'s data';
  } else if (daysSinceData <= 7) {
    return 'based on recent data';
  } else if (daysSinceData <= 14) {
    return 'based on data from the past two weeks';
  } else if (daysSinceData <= 30) {
    return 'based on data from the past month';
  } else if (daysSinceData <= 90) {
    return 'based on data from the past 3 months';
  } else {
    return `based on data from ${Math.floor(daysSinceData / 30)} months ago`;
  }
}

/**
 * Add freshness-based hedging to insight statement
 * 
 * @param statement - Base insight statement
 * @param daysSinceData - Days since most recent data
 * @returns Hedged statement if data is stale
 */
export function hedgeByFreshness(
  statement: string,
  daysSinceData: number
): string {
  if (daysSinceData <= 14) {
    // Fresh data, no hedging needed
    return statement;
  } else if (daysSinceData <= 90) {
    // Yellow zone: mild hedging
    return `${statement} (Note: Consider rechecking to confirm this pattern still holds.)`;
  } else {
    // Red zone: strong hedging
    return `${statement} (⚠️ Data is ${Math.floor(daysSinceData / 30)} months old. Recheck recommended.)`;
  }
}

// ============================================================================
// Variable Name Formatting
// ============================================================================

/**
 * Convert variable name to human-readable format
 * 
 * @param variable - Variable name (e.g., 'sleep_deep_minutes')
 * @returns Human-readable name (e.g., 'deep sleep')
 */
export function formatVariableName(variable: string): string {
  const nameMap: Record<string, string> = {
    // Sleep
    sleep_total_minutes: 'total sleep',
    sleep_deep_minutes: 'deep sleep',
    sleep_rem_minutes: 'REM sleep',
    sleep_latency_minutes: 'sleep latency',
    sleep_awakenings: 'nighttime awakenings',
    
    // HRV & Recovery
    hrv_sdnn_ms: 'HRV (SDNN)',
    hrv_rmssd_ms: 'HRV (RMSSD)',
    resting_hr: 'resting heart rate',
    recovery_score: 'recovery score',
    
    // Activity
    active_energy: 'active energy expenditure',
    steps: 'step count',
    workout_duration: 'workout duration',
    workout_intensity: 'workout intensity',
    
    // Biomarkers
    testosterone_total: 'testosterone',
    cortisol_am: 'morning cortisol',
    cortisol_pm: 'evening cortisol',
    glucose_fasting: 'fasting glucose',
    hs_crp: 'hs-CRP',
    ferritin: 'ferritin',
    vitamin_d_25_oh: 'vitamin D',
    hba1c: 'HbA1c',
    
    // Lifestyle
    alcohol: 'alcohol intake',
    caffeine: 'caffeine intake',
    ice_bath: 'cold exposure (ice bath)',
    sauna: 'sauna use',
    stress: 'stress level',
  };
  
  return nameMap[variable] || variable.replace(/_/g, ' ');
}

// ============================================================================
// N-of-1 Experiment Suggestions
// ============================================================================

export interface ExperimentSuggestion {
  hypothesis: string;
  protocol: string;
  duration: string;
  measurables: string[];
  expectedOutcome: string;
}

/**
 * Generate N-of-1 experiment suggestion for actionable insights
 * 
 * @param independent - Independent variable (what to change)
 * @param dependent - Dependent variable (what to measure)
 * @param direction - Expected direction of effect
 * @param effectSize - Expected effect size
 * @returns Experiment suggestion
 */
export function generateExperimentSuggestion(
  independent: string,
  dependent: string,
  direction: 'positive' | 'negative',
  effectSize: number
): ExperimentSuggestion {
  const indepReadable = formatVariableName(independent);
  const depReadable = formatVariableName(dependent);
  const magnitude = describeEffectMagnitude(effectSize);
  
  // Determine intervention direction
  let intervention: string;
  if (direction === 'positive') {
    intervention = `increase ${indepReadable}`;
  } else {
    intervention = `reduce ${indepReadable}`;
  }
  
  // Generate hypothesis
  const hypothesis = 
    `Based on the ${magnitude} correlation, ${intervention} may improve ${depReadable}.`;
  
  // Generate protocol (specific to variable type)
  let protocol: string;
  let duration: string;
  
  if (independent.includes('alcohol')) {
    protocol = 'Reduce alcohol intake to ≤1 drink/day (or abstain completely) for 2 weeks.';
    duration = '14 days';
  } else if (independent.includes('caffeine')) {
    protocol = 'Limit caffeine to before 2pm only for 2 weeks.';
    duration = '14 days';
  } else if (independent.includes('ice_bath') || independent.includes('sauna')) {
    protocol = `Increase ${indepReadable} frequency to 3-4x/week for 2 weeks.`;
    duration = '14 days';
  } else if (independent.includes('sleep')) {
    protocol = 'Aim for 7.5-8.5 hours of sleep per night for 2 weeks.';
    duration = '14 days';
  } else if (independent.includes('workout')) {
    protocol = 'Adjust workout intensity/duration based on recovery signals for 2 weeks.';
    duration = '14 days';
  } else {
    protocol = `Track and optimize ${indepReadable} for 2 weeks.`;
    duration = '14 days';
  }
  
  // Measurables
  const measurables = [depReadable, indepReadable, 'subjective well-being'];
  
  // Expected outcome
  const expectedOutcome = 
    `If the pattern holds, you should see ${dependent.includes('latency') || dependent.includes('cortisol') || dependent.includes('crp') ? 'reduced' : 'improved'} ${depReadable} within 1-2 weeks.`;
  
  return {
    hypothesis,
    protocol,
    duration,
    measurables,
    expectedOutcome,
  };
}

// ============================================================================
// Complete Insight Generation
// ============================================================================

export interface GeneratedInsight {
  title: string;
  summary: string; // 1-2 sentence overview
  details: string; // Detailed explanation with evidence
  actionable: string; // Specific recommendation
  experiment?: ExperimentSuggestion; // N-of-1 experiment (if applicable)
}

/**
 * Generate complete natural language insight
 * 
 * @param params - Insight parameters
 * @returns Generated insight text
 */
export function generateInsight(params: {
  layer: 'A' | 'B' | 'C' | 'D';
  evidenceTier: EvidenceTier;
  independent: string;
  dependent: string;
  direction: 'positive' | 'negative';
  effectSize?: number;
  deviationPercent?: number;
  daysSinceData: number;
  includeExperiment?: boolean;
}): GeneratedInsight {
  const {
    layer,
    evidenceTier,
    independent,
    dependent,
    direction,
    effectSize = 0.35,
    deviationPercent,
    daysSinceData,
    includeExperiment = false,
  } = params;
  
  const indepReadable = formatVariableName(independent);
  const depReadable = formatVariableName(dependent);
  const magnitude = effectSize ? describeEffectMagnitude(effectSize) : 'moderate';
  const confidenceQual = getConfidenceQualifier(evidenceTier);
  const freshnessQual = getFreshnessQualifier(daysSinceData);
  const evidenceExpl = explainEvidenceTier(evidenceTier);
  
  // Generate title
  let title: string;
  if (layer === 'A') {
    title = `${indepReadable.charAt(0).toUpperCase() + indepReadable.slice(1)} affects ${depReadable}`;
  } else if (layer === 'B') {
    title = `${indepReadable.charAt(0).toUpperCase() + indepReadable.slice(1)} correlates with ${depReadable}`;
  } else if (layer === 'C') {
    title = `Dose-response: ${indepReadable} impacts ${depReadable}`;
  } else {
    // Layer D: Check if it's an out-of-range biomarker vs stale-lab warning
    if (depReadable.includes('health') || depReadable === 'health optimization') {
      // Out-of-range biomarker
      title = `⚠️ ${indepReadable.charAt(0).toUpperCase() + indepReadable.slice(1)} is out of range`;
    } else {
      // Stale-lab warning  
      title = `⚠️ ${depReadable.charAt(0).toUpperCase() + depReadable.slice(1)} pattern detected`;
    }
  }
  
  // Generate summary
  let summary: string;
  if (layer === 'D') {
    // Layer D: Out-of-range biomarker vs stale-lab warning
    if (depReadable.includes('health') || depReadable === 'health optimization') {
      // Out-of-range biomarker - direct flag from lab
      summary = 
        `Your latest ${indepReadable} result is outside the normal reference range. ` +
        `This biomarker should be reviewed with your healthcare provider.`;
    } else {
      // Stale-lab warning - multiple metric deviations
      const devMag = deviationPercent ? describeDeviation(deviationPercent) : 'notably';
      summary = 
        `Your ${depReadable} has ${devMag} ${direction === 'positive' ? 'increased' : 'decreased'}, ` +
        `which may be explained by a stale ${indepReadable} measurement.`;
    }
  } else {
    // Correlation/pathway/dose-response
    const relationVerb = layer === 'A' ? 'influences' : 'is associated with';
    
    // For positive correlations: higher X → better Y
    // For negative correlations: higher X → worse Y (so we want LOWER X)
    let description: string;
    if (direction === 'positive') {
      description = `higher ${indepReadable} ${relationVerb} better ${depReadable}`;
    } else {
      description = `higher ${indepReadable} ${relationVerb} worse ${depReadable}`;
    }
    
    summary = 
      `${confidenceQual.charAt(0).toUpperCase() + confidenceQual.slice(1)} pattern: ${description}.`;
  }
  
  // Generate details
  let details: string;
  if (layer === 'A') {
    details = 
      `This physiological pathway is ${evidenceExpl}. ` +
      `The ${magnitude} relationship suggests that optimizing ${indepReadable} ` +
      `could meaningfully impact ${depReadable}. ${freshnessQual.charAt(0).toUpperCase() + freshnessQual.slice(1)}.`;
  } else if (layer === 'B') {
    details = 
      `A ${magnitude} correlation (${evidenceExpl}) shows that changes in ${indepReadable} ` +
      `track with changes in ${depReadable}. This pattern ${freshnessQual}.`;
  } else if (layer === 'C') {
    details = 
      `Dose-response analysis reveals a ${magnitude} effect: ` +
      `different doses/timing of ${indepReadable} produce measurably different ${depReadable} outcomes. ` +
      `This suggests an optimal window exists. ${freshnessQual.charAt(0).toUpperCase() + freshnessQual.slice(1)}.`;
  } else {
    details = 
      `Multiple health metrics have deviated in a pattern consistent with ${indepReadable} changes. ` +
      `This ${evidenceExpl}. ${freshnessQual.charAt(0).toUpperCase() + freshnessQual.slice(1)}.`;
  }
  
  // Apply freshness hedging
  details = hedgeByFreshness(details, daysSinceData);
  
  // Generate actionable recommendation
  let actionable: string;
  if (layer === 'D') {
    actionable = 
      `Recheck ${indepReadable} to see if it's still suboptimal. ` +
      `If confirmed, address the root cause rather than just symptoms.`;
  } else if (direction === 'positive') {
    // Positive correlation: higher X → better Y, so INCREASE X
    actionable = `Consider increasing ${indepReadable} to improve ${depReadable}.`;
  } else {
    // Negative correlation: higher X → worse Y, so DECREASE X
    actionable = `Consider reducing ${indepReadable} to improve ${depReadable}.`;
  }
  
  // Generate experiment suggestion (if requested and applicable)
  let experiment: ExperimentSuggestion | undefined;
  if (includeExperiment && layer !== 'D') {
    experiment = generateExperimentSuggestion(
      independent,
      dependent,
      direction,
      effectSize
    );
  }
  
  return {
    title,
    summary,
    details,
    actionable,
    experiment,
  };
}
