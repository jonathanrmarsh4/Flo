/**
 * Data Classification System - Daily Insights Engine v2.0
 * 
 * Separates fast-moving vs. slow-moving health data and calculates
 * freshness scores using exponential decay for biomarker staleness tracking.
 * 
 * Fast-moving data: HealthKit metrics, life events (daily granularity)
 * Slow-moving data: Blood biomarkers (weeks/months between measurements)
 * 
 * Freshness decay: Score = e^(-λt) where λ = 0.15/month
 * Categories: Green (≥0.8), Yellow (0.5-0.8), Red (<0.5)
 */

import { differenceInDays } from 'date-fns';

// ============================================================================
// Data Movement Classification
// ============================================================================

/**
 * Fast-moving metrics update daily or more frequently
 * These are primarily from HealthKit and life event logging
 */
export const FAST_MOVING_METRICS = new Set([
  // HealthKit - Sleep
  'sleep_total_minutes',
  'sleep_deep_minutes',
  'sleep_rem_minutes',
  'sleep_awakenings',
  'sleep_latency_minutes',
  
  // HealthKit - Activity
  'steps',
  'active_energy',
  'exercise_minutes',
  'stand_hours',
  'flights_climbed',
  'distance_walking_running',
  'distance_cycling',
  
  // HealthKit - Heart
  'resting_hr',
  'hrv_sdnn_ms',
  'hrv_rmssd_ms',
  'vo2_max',
  
  // HealthKit - Body
  'weight_lbs',
  'body_fat_pct',
  
  // HealthKit - Respiratory
  'respiratory_rate',
  
  // Life Events
  'stress_events',
  'alcohol_intake',
  'caffeine_intake',
  'late_meal_events',
  'sauna_events',
  'ice_bath_events',
  'trt_dose_events',
  'supplement_events',
  'breathwork_events',
]);

/**
 * Slow-moving biomarkers change on weeks/months timescale
 * These are primarily from blood work and DEXA scans
 */
export const SLOW_MOVING_BIOMARKERS = new Set([
  // Metabolic
  'glucose_fasting',
  'glucose_a1c',
  'insulin_fasting',
  
  // Lipids
  'cholesterol_total',
  'cholesterol_ldl',
  'cholesterol_hdl',
  'triglycerides',
  'apob',
  
  // Inflammatory
  'hs_crp',
  'esr',
  
  // Hormones
  'testosterone_total',
  'testosterone_free',
  'estradiol_e2',
  'shbg',
  'dhea_s',
  'cortisol_am',
  
  // Thyroid
  'tsh',
  't4_free',
  't3_free',
  't3_reverse',
  
  // Hematology
  'wbc',
  'rbc',
  'hemoglobin',
  'hematocrit',
  'platelets',
  'neutrophils_abs',
  'lymphocytes_abs',
  
  // Vitamins & Minerals
  'vitamin_d_25_oh',
  'vitamin_b12',
  'folate',
  'ferritin',
  'iron_serum',
  
  // Kidney
  'creatinine',
  'egfr',
  'bun',
  'bun_creatinine_ratio',
  
  // Liver
  'alt',
  'ast',
  'alp',
  'bilirubin_total',
  'albumin',
  'protein_total',
  
  // Electrolytes
  'sodium',
  'potassium',
  'chloride',
  'co2',
  'calcium',
  'magnesium',
  
  // Cardiac
  'nt_probnp',
  'troponin',
  
  // Other
  'uric_acid',
  'homocysteine',
  'lp_a',
]);

/**
 * Expected update frequencies for slow-moving biomarkers
 * Used to calculate freshness decay rates and ideal recalculation intervals
 * 
 * Quarterly (90d): Metabolic/lipid panels, hematology, liver/kidney function
 * Semi-annual (180d): Hormones, vitamins, thyroid, inflammatory markers
 */
export const BIOMARKER_UPDATE_FREQUENCIES: Record<string, number> = {
  // Quarterly (3 months) - Routine metabolic panel
  glucose_fasting: 90,
  glucose_a1c: 90,
  insulin_fasting: 90,
  
  // Quarterly (3 months) - Lipid panel
  cholesterol_total: 90,
  cholesterol_ldl: 90,
  cholesterol_hdl: 90,
  triglycerides: 90,
  apob: 90,
  lp_a: 180, // Semi-annual - doesn't change much
  
  // Semi-annual (6 months) - Inflammatory markers
  hs_crp: 180,
  esr: 180,
  
  // Semi-annual (6 months) - Hormones (sex hormones)
  testosterone_total: 180,
  testosterone_free: 180,
  estradiol_e2: 180,
  shbg: 180,
  dhea_s: 180,
  
  // Semi-annual (6 months) - Hormones (adrenal)
  cortisol_am: 180,
  
  // Semi-annual (6 months) - Thyroid panel
  tsh: 180,
  t4_free: 180,
  t3_free: 180,
  t3_reverse: 180,
  
  // Quarterly (3 months) - Hematology (CBC)
  wbc: 90,
  rbc: 90,
  hemoglobin: 90,
  hematocrit: 90,
  platelets: 90,
  neutrophils_abs: 90,
  lymphocytes_abs: 90,
  
  // Semi-annual (6 months) - Vitamins
  vitamin_d_25_oh: 180,
  vitamin_b12: 180,
  folate: 180,
  
  // Semi-annual (6 months) - Minerals
  ferritin: 180,
  iron_serum: 180,
  magnesium: 180,
  calcium: 180,
  
  // Quarterly (3 months) - Kidney function
  creatinine: 90,
  egfr: 90,
  bun: 90,
  bun_creatinine_ratio: 90,
  
  // Quarterly (3 months) - Liver function
  alt: 90,
  ast: 90,
  alp: 90,
  bilirubin_total: 90,
  albumin: 90,
  protein_total: 90,
  
  // Quarterly (3 months) - Electrolytes
  sodium: 90,
  potassium: 90,
  chloride: 90,
  co2: 90,
  
  // Semi-annual (6 months) - Cardiac biomarkers
  nt_probnp: 180,
  troponin: 180,
  
  // Semi-annual (6 months) - Other specialty markers
  uric_acid: 180,
  homocysteine: 180,
};

// ============================================================================
// Freshness Scoring
// ============================================================================

/**
 * Exponential decay rate for biomarker freshness
 * λ = 0.15/month means score drops to ~86% after 1 month, ~74% after 2 months
 */
const DECAY_LAMBDA = 0.15; // per month

/**
 * Freshness thresholds (aligned with v2.0 spec)
 * 
 * Spec requirement: "green: ≤3 months, yellow: 3–9 months, red: ≥9 months"
 * 
 * Using exponential decay formula Score = e^(-0.15t) where t = months:
 * - 3 months: e^(-0.15 * 3) = 0.6376
 * - 9 months: e^(-0.15 * 9) = 0.2592
 * 
 * Green: Data is current and reliable (≤3 months old)
 * Yellow: Data is aging, consider rechecking (3-9 months old)
 * Red: Data is stale, insights may be outdated (≥9 months old)
 */
export const FRESHNESS_THRESHOLDS = {
  GREEN: 0.64,  // ≥64% fresh = ≤3 months old (spec-compliant)
  YELLOW: 0.26, // 26-64% fresh = 3-9 months old (spec-compliant)
  // <26% is RED = ≥9 months old (spec-compliant)
} as const;

export type FreshnessCategory = 'green' | 'yellow' | 'red';

/**
 * Calculate freshness score using exponential decay
 * 
 * Formula: Score = e^(-λt) where:
 * - λ = 0.15/month (decay rate)
 * - t = age in months
 * 
 * Example scores (updated to match v2.0 spec):
 * - 0 months: 1.00 (100% fresh) - GREEN
 * - 1 month:  0.86 (86% fresh) - GREEN
 * - 2 months: 0.74 (74% fresh) - GREEN
 * - 3 months: 0.64 (64% fresh) - GREEN (threshold)
 * - 6 months: 0.41 (41% fresh) - YELLOW
 * - 9 months: 0.26 (26% fresh) - YELLOW (threshold)
 * - 12 months: 0.17 (17% fresh) - RED
 * 
 * @param lastMeasuredDate - Date of most recent measurement
 * @param currentDate - Current date (defaults to now)
 * @returns Freshness score between 0.0 and 1.0
 */
export function calculateFreshnessScore(
  lastMeasuredDate: Date,
  currentDate: Date = new Date()
): number {
  const daysSinceLastMeasurement = differenceInDays(currentDate, lastMeasuredDate);
  const monthsSinceLastMeasurement = daysSinceLastMeasurement / 30.44; // Average month length
  
  // Exponential decay: e^(-λt)
  const score = Math.exp(-DECAY_LAMBDA * monthsSinceLastMeasurement);
  
  // Clamp to [0, 1] range
  return Math.max(0, Math.min(1, score));
}

/**
 * Categorize freshness score into green/yellow/red zones
 * 
 * @param score - Freshness score from calculateFreshnessScore
 * @returns Category: 'green', 'yellow', or 'red'
 */
export function categorizeFreshness(score: number): FreshnessCategory {
  if (score >= FRESHNESS_THRESHOLDS.GREEN) {
    return 'green';
  } else if (score >= FRESHNESS_THRESHOLDS.YELLOW) {
    return 'yellow';
  } else {
    return 'red';
  }
}

/**
 * Get freshness category directly from date
 * 
 * @param lastMeasuredDate - Date of most recent measurement
 * @param currentDate - Current date (defaults to now)
 * @returns Category: 'green', 'yellow', or 'red'
 */
export function getFreshnessCategory(
  lastMeasuredDate: Date,
  currentDate: Date = new Date()
): FreshnessCategory {
  const score = calculateFreshnessScore(lastMeasuredDate, currentDate);
  return categorizeFreshness(score);
}

/**
 * Determine if a biomarker is fast-moving or slow-moving
 * 
 * @param variable - Variable name (e.g., 'hrv_sdnn_ms', 'glucose_fasting')
 * @returns 'fast' or 'slow'
 */
export function classifyDataMovement(variable: string): 'fast' | 'slow' {
  if (FAST_MOVING_METRICS.has(variable)) {
    return 'fast';
  } else if (SLOW_MOVING_BIOMARKERS.has(variable)) {
    return 'slow';
  }
  
  // Default: treat unknowns as slow-moving (conservative approach)
  return 'slow';
}

/**
 * Get expected update frequency (in days) for a biomarker
 * 
 * @param biomarker - Biomarker name
 * @returns Expected update frequency in days, or null if not defined
 */
export function getExpectedUpdateFrequency(biomarker: string): number | null {
  return BIOMARKER_UPDATE_FREQUENCIES[biomarker] ?? null;
}

/**
 * Calculate when a biomarker should ideally be rechecked
 * 
 * @param biomarker - Biomarker name
 * @param lastMeasuredDate - Date of most recent measurement
 * @returns Recommended recheck date, or null if frequency not defined
 */
export function getRecommendedRecheckDate(
  biomarker: string,
  lastMeasuredDate: Date
): Date | null {
  const frequency = getExpectedUpdateFrequency(biomarker);
  if (!frequency) return null;
  
  const recheckDate = new Date(lastMeasuredDate);
  recheckDate.setDate(recheckDate.getDate() + frequency);
  return recheckDate;
}

/**
 * Check if a biomarker is overdue for rechecking
 * 
 * @param biomarker - Biomarker name
 * @param lastMeasuredDate - Date of most recent measurement
 * @param currentDate - Current date (defaults to now)
 * @returns True if overdue (past recommended recheck date)
 */
export function isBiomarkerOverdue(
  biomarker: string,
  lastMeasuredDate: Date,
  currentDate: Date = new Date()
): boolean {
  const recheckDate = getRecommendedRecheckDate(biomarker, lastMeasuredDate);
  if (!recheckDate) return false; // Can't determine if no frequency defined
  
  return currentDate >= recheckDate;
}

// ============================================================================
// Batch Operations for Freshness Tracking
// ============================================================================

export interface BiomarkerFreshnessInfo {
  biomarker: string;
  lastMeasuredDate: Date;
  freshnessScore: number;
  freshnessCategory: FreshnessCategory;
  recommendedRecheckDate: Date | null;
  isOverdue: boolean;
  daysSinceLastMeasurement: number;
}

/**
 * Calculate freshness info for multiple biomarkers at once
 * 
 * @param biomarkerDates - Map of biomarker names to their last measurement dates
 * @param currentDate - Current date (defaults to now)
 * @returns Array of freshness info for each biomarker
 */
export function calculateBatchFreshness(
  biomarkerDates: Map<string, Date>,
  currentDate: Date = new Date()
): BiomarkerFreshnessInfo[] {
  const results: BiomarkerFreshnessInfo[] = [];
  
  for (const [biomarker, lastMeasuredDate] of Array.from(biomarkerDates.entries())) {
    const freshnessScore = calculateFreshnessScore(lastMeasuredDate, currentDate);
    const freshnessCategory = categorizeFreshness(freshnessScore);
    const recommendedRecheckDate = getRecommendedRecheckDate(biomarker, lastMeasuredDate);
    const isOverdue = isBiomarkerOverdue(biomarker, lastMeasuredDate, currentDate);
    const daysSinceLastMeasurement = differenceInDays(currentDate, lastMeasuredDate);
    
    results.push({
      biomarker,
      lastMeasuredDate,
      freshnessScore,
      freshnessCategory,
      recommendedRecheckDate,
      isOverdue,
      daysSinceLastMeasurement,
    });
  }
  
  // Sort by freshness score (least fresh first)
  return results.sort((a, b) => a.freshnessScore - b.freshnessScore);
}

/**
 * Get all biomarkers that are in yellow or red freshness zones
 * 
 * @param biomarkerDates - Map of biomarker names to their last measurement dates
 * @param currentDate - Current date (defaults to now)
 * @returns Array of stale biomarkers (yellow/red only)
 */
export function getStaleBiomarkers(
  biomarkerDates: Map<string, Date>,
  currentDate: Date = new Date()
): BiomarkerFreshnessInfo[] {
  const allFreshness = calculateBatchFreshness(biomarkerDates, currentDate);
  return allFreshness.filter(
    info => info.freshnessCategory === 'yellow' || info.freshnessCategory === 'red'
  );
}

/**
 * Get all biomarkers that are overdue for rechecking
 * 
 * @param biomarkerDates - Map of biomarker names to their last measurement dates
 * @param currentDate - Current date (defaults to now)
 * @returns Array of overdue biomarkers
 */
export function getOverdueBiomarkers(
  biomarkerDates: Map<string, Date>,
  currentDate: Date = new Date()
): BiomarkerFreshnessInfo[] {
  const allFreshness = calculateBatchFreshness(biomarkerDates, currentDate);
  return allFreshness.filter(info => info.isOverdue);
}
