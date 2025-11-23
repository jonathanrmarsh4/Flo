/**
 * Insight Ranking & Selection Algorithm - Daily Insights Engine v2.0
 * 
 * Scores and ranks insights from all 4 analytical layers using:
 * Rank Score = Confidence × Impact × Actionability × Freshness
 * 
 * Then selects top 5 insights with domain diversity constraints:
 * - Max 2 insights per health domain (sleep, recovery, metabolic, hormonal, inflammatory)
 * - Ensures breadth across different health areas
 * - Highest-ranked insights within each domain are prioritized
 * 
 * Scoring Components:
 * - Confidence: Based on evidence tier + statistical strength (0.0-1.0)
 * - Impact: Clinical/health significance (0.0-1.0)
 * - Actionability: How easily the user can act on this (0.0-1.0)
 * - Freshness: Recency of data used (0.0-1.0)
 */

import { EvidenceTier, getEvidenceConfidenceMultiplier } from './evidenceHierarchy';

// ============================================================================
// Health Domains for Diversity
// ============================================================================

export type HealthDomain = 
  | 'sleep'
  | 'recovery' 
  | 'metabolic'
  | 'hormonal'
  | 'inflammatory'
  | 'performance'
  | 'lifestyle';

/**
 * Maximum insights allowed per domain
 */
const MAX_INSIGHTS_PER_DOMAIN = 2;

/**
 * Total maximum insights to return
 */
const MAX_TOTAL_INSIGHTS = 5;

// ============================================================================
// Insight Interface
// ============================================================================

export interface RankedInsight {
  id: string;
  title: string;
  description: string;
  evidenceTier: EvidenceTier;
  healthDomain: HealthDomain;
  layer: 'A' | 'B' | 'C' | 'D'; // Which analytical layer generated this
  
  // Scoring components
  confidenceScore: number; // 0.0-1.0
  impactScore: number; // 0.0-1.0
  actionabilityScore: number; // 0.0-1.0
  freshnessScore: number; // 0.0-1.0
  
  // Final rank score
  rankScore: number; // confidence × impact × actionability × freshness
  
  // Additional metadata
  createdAt: Date;
  variables: string[]; // Metrics involved in this insight
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Calculate confidence score from evidence tier and statistical strength
 * 
 * Confidence = Base Tier Multiplier × Statistical Adjustment
 * 
 * Statistical adjustments:
 * - Layer A (Pathways): No adjustment (1.0) - pure science
 * - Layer B (Correlations): Based on effect size and PD
 * - Layer C (Dose-response): Based on effect size
 * - Layer D (Anomalies): Based on match count/confidence
 * 
 * @param evidenceTier - Tier 1-5
 * @param layer - Which analytical layer (A/B/C/D)
 * @param statisticalStrength - Layer-specific strength metric (0.0-1.0)
 * @returns Confidence score (0.0-1.0)
 */
export function calculateConfidenceScore(
  evidenceTier: EvidenceTier,
  layer: 'A' | 'B' | 'C' | 'D',
  statisticalStrength: number = 1.0
): number {
  const baseMultiplier = getEvidenceConfidenceMultiplier(evidenceTier);
  
  // Layer A (physiological pathways) uses base multiplier only
  if (layer === 'A') {
    return baseMultiplier;
  }
  
  // Other layers combine base multiplier with statistical strength
  const confidence = baseMultiplier * statisticalStrength;
  
  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

// ============================================================================
// Impact Scoring
// ============================================================================

/**
 * Clinical significance thresholds for impact scoring
 */
export const IMPACT_THRESHOLDS = {
  // Effect sizes (Cliff's delta, correlation coefficients)
  LARGE_EFFECT: 0.60, // ≥0.60 = high impact
  MEDIUM_EFFECT: 0.35, // 0.35-0.59 = medium impact
  SMALL_EFFECT: 0.20, // 0.20-0.34 = low impact
  
  // Deviation from baseline (%)
  LARGE_DEVIATION: 0.40, // ≥40% = high impact
  MEDIUM_DEVIATION: 0.20, // 20-39% = medium impact
  SMALL_DEVIATION: 0.10, // 10-19% = low impact
};

/**
 * Calculate impact score based on clinical/health significance
 * 
 * Impact is determined by:
 * - Effect size magnitude (correlations, dose-response)
 * - Deviation magnitude (anomalies)
 * - Clinical importance of variables involved
 * 
 * @param layer - Which analytical layer (A/B/C/D)
 * @param effectSize - Effect size (correlations, Cliff's δ) or null
 * @param deviationPercent - Deviation from baseline (%) or null
 * @param variables - Variables involved in this insight
 * @returns Impact score (0.0-1.0)
 */
export function calculateImpactScore(
  layer: 'A' | 'B' | 'C' | 'D',
  effectSize: number | null = null,
  deviationPercent: number | null = null,
  variables: string[] = []
): number {
  let baseImpact = 0.5; // Default medium impact
  
  // Layer A (pathways): Use clinical importance of variables
  if (layer === 'A') {
    // High-impact variables (critical health markers)
    const highImpactVars = [
      'testosterone_total', 'cortisol_am', 'glucose_fasting', 'hs_crp',
      'hrv_sdnn_ms', 'sleep_total_minutes', 'sleep_deep_minutes'
    ];
    
    const hasHighImpactVar = variables.some(v => highImpactVars.includes(v));
    baseImpact = hasHighImpactVar ? 0.8 : 0.6;
  }
  
  // Layer B/C (correlations, dose-response): Use effect size
  if ((layer === 'B' || layer === 'C') && effectSize !== null) {
    const absEffect = Math.abs(effectSize);
    
    if (absEffect >= IMPACT_THRESHOLDS.LARGE_EFFECT) {
      baseImpact = 0.9; // High impact
    } else if (absEffect >= IMPACT_THRESHOLDS.MEDIUM_EFFECT) {
      baseImpact = 0.7; // Medium impact
    } else if (absEffect >= IMPACT_THRESHOLDS.SMALL_EFFECT) {
      baseImpact = 0.5; // Low impact
    } else {
      baseImpact = 0.3; // Very small
    }
  }
  
  // Layer D (anomalies): Use deviation magnitude
  if (layer === 'D' && deviationPercent !== null) {
    const absDeviation = Math.abs(deviationPercent);
    
    if (absDeviation >= IMPACT_THRESHOLDS.LARGE_DEVIATION) {
      baseImpact = 0.9; // High impact
    } else if (absDeviation >= IMPACT_THRESHOLDS.MEDIUM_DEVIATION) {
      baseImpact = 0.7; // Medium impact
    } else if (absDeviation >= IMPACT_THRESHOLDS.SMALL_DEVIATION) {
      baseImpact = 0.5; // Low impact
    } else {
      baseImpact = 0.3; // Very small
    }
  }
  
  return baseImpact;
}

// ============================================================================
// Actionability Scoring
// ============================================================================

/**
 * Calculate actionability score based on how easily the user can act
 * 
 * Actionability is determined by:
 * - Is it a behavior/lifestyle factor? (high)
 * - Is it a dosage/timing adjustment? (high)
 * - Is it a slow-moving biomarker recheck? (medium)
 * - Is it a correlation insight? (low - harder to act on)
 * 
 * @param layer - Which analytical layer (A/B/C/D)
 * @param variables - Variables involved in this insight
 * @returns Actionability score (0.0-1.0)
 */
export function calculateActionabilityScore(
  layer: 'A' | 'B' | 'C' | 'D',
  variables: string[]
): number {
  // Lifestyle/behavioral variables (highly actionable)
  const lifestyleVars = [
    'alcohol', 'ice_bath', 'sauna', 'caffeine', 'stress', 'exercise',
    'late_meal', 'supplement', 'workout_duration', 'workout_intensity'
  ];
  
  // Slow-moving biomarkers (medium actionable - requires recheck)
  const slowMovingBiomarkers = [
    'testosterone_total', 'ferritin', 'vitamin_d_25_oh', 'hs_crp',
    'glucose_fasting', 'hba1c', 'triglycerides', 'ldl'
  ];
  
  const hasLifestyleVar = variables.some(v => lifestyleVars.includes(v));
  const hasBiomarkerVar = variables.some(v => slowMovingBiomarkers.includes(v));
  
  // Layer C (dose-response & timing): Highly actionable (adjust dose/timing)
  if (layer === 'C') {
    return 0.9;
  }
  
  // Layer D (stale-lab warnings): Medium actionable (recheck biomarker)
  if (layer === 'D' && hasBiomarkerVar) {
    return 0.7;
  }
  
  // Layer A/B with lifestyle variables: Highly actionable
  if (hasLifestyleVar) {
    return 0.85;
  }
  
  // Layer A/B with only HealthKit metrics: Medium actionable
  if (!hasBiomarkerVar) {
    return 0.6;
  }
  
  // Default: Moderate actionability
  return 0.5;
}

// ============================================================================
// Freshness Scoring
// ============================================================================

/**
 * Calculate freshness score based on recency of data
 * 
 * Freshness decays exponentially with time:
 * - Data from today: 1.0
 * - Data from 7 days ago: ~0.7
 * - Data from 30 days ago: ~0.3
 * - Data from 90 days ago: ~0.1
 * 
 * @param dataDate - Date of most recent data used in insight
 * @param currentDate - Current date (defaults to now)
 * @returns Freshness score (0.0-1.0)
 */
export function calculateFreshnessScore(
  dataDate: Date,
  currentDate: Date = new Date()
): number {
  const daysSinceData = Math.floor(
    (currentDate.getTime() - dataDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // Exponential decay with λ = 0.03 (half-life ~23 days)
  const freshness = Math.exp(-0.03 * daysSinceData);
  
  return Math.max(0, Math.min(1, freshness));
}

// ============================================================================
// Rank Score Calculation
// ============================================================================

/**
 * Calculate final rank score for an insight
 * 
 * Rank Score = Confidence × Impact × Actionability × Freshness
 * 
 * @param insight - Insight with scoring components
 * @returns Rank score (0.0-1.0)
 */
export function calculateRankScore(insight: RankedInsight): number {
  return (
    insight.confidenceScore *
    insight.impactScore *
    insight.actionabilityScore *
    insight.freshnessScore
  );
}

// ============================================================================
// Top-N Selection with Domain Diversity
// ============================================================================

/**
 * Select top N insights with domain diversity constraints
 * 
 * Algorithm:
 * 1. Sort all insights by rank score (descending)
 * 2. Iterate through sorted list
 * 3. Add insight if domain count < MAX_INSIGHTS_PER_DOMAIN
 * 4. Stop when total count reaches MAX_TOTAL_INSIGHTS
 * 
 * This ensures we don't get 5 sleep insights or 5 metabolic insights.
 * Instead, we get a diverse set covering multiple health domains.
 * 
 * @param insights - All candidate insights
 * @param maxTotal - Maximum total insights to return (default: 5)
 * @param maxPerDomain - Maximum insights per domain (default: 2)
 * @returns Top N insights with domain diversity
 */
export function selectTopInsights(
  insights: RankedInsight[],
  maxTotal: number = MAX_TOTAL_INSIGHTS,
  maxPerDomain: number = MAX_INSIGHTS_PER_DOMAIN
): RankedInsight[] {
  // Sort by rank score (descending)
  const sortedInsights = [...insights].sort((a, b) => b.rankScore - a.rankScore);
  
  const selected: RankedInsight[] = [];
  const domainCounts: Map<HealthDomain, number> = new Map();
  
  for (const insight of sortedInsights) {
    // Check if we've reached max total
    if (selected.length >= maxTotal) {
      break;
    }
    
    // Check if domain has room
    const currentCount = domainCounts.get(insight.healthDomain) || 0;
    if (currentCount >= maxPerDomain) {
      continue; // Skip this insight, domain is full
    }
    
    // Add insight
    selected.push(insight);
    domainCounts.set(insight.healthDomain, currentCount + 1);
  }
  
  return selected;
}

/**
 * Determine health domain from variables
 * 
 * Uses heuristics to classify insights into health domains
 * based on the variables involved.
 * 
 * @param variables - Variables involved in the insight
 * @returns Health domain classification
 */
export function determineHealthDomain(variables: string[]): HealthDomain {
  const varSet = new Set(variables);
  
  // Sleep domain
  const sleepVars = ['sleep_total_minutes', 'sleep_deep_minutes', 'sleep_rem_minutes', 
                     'sleep_latency_minutes', 'sleep_awakenings'];
  if (variables.some(v => sleepVars.includes(v))) {
    return 'sleep';
  }
  
  // Recovery domain
  const recoveryVars = ['hrv_sdnn_ms', 'hrv_rmssd_ms', 'resting_hr', 'recovery_score'];
  if (variables.some(v => recoveryVars.includes(v))) {
    return 'recovery';
  }
  
  // Metabolic domain
  const metabolicVars = ['glucose_fasting', 'hba1c', 'triglycerides', 'ldl', 
                         'hdl', 'insulin_fasting', 'weight', 'body_fat_pct'];
  if (variables.some(v => metabolicVars.includes(v))) {
    return 'metabolic';
  }
  
  // Hormonal domain
  const hormonalVars = ['testosterone_total', 'cortisol_am', 'cortisol_pm', 
                        'vitamin_d_25_oh', 'estradiol'];
  if (variables.some(v => hormonalVars.includes(v))) {
    return 'hormonal';
  }
  
  // Inflammatory domain
  const inflammatoryVars = ['hs_crp', 'ferritin', 'white_blood_cells'];
  if (variables.some(v => inflammatoryVars.includes(v))) {
    return 'inflammatory';
  }
  
  // Performance domain
  const performanceVars = ['active_energy', 'steps', 'workout_duration', 
                          'workout_intensity', 'vo2_max'];
  if (variables.some(v => performanceVars.includes(v))) {
    return 'performance';
  }
  
  // Lifestyle domain (default)
  return 'lifestyle';
}
