/**
 * Bayesian Correlation Engine (Layer B) - Daily Insights Engine v2.0
 * 
 * Open discovery system that finds statistically significant correlations
 * not covered by hard-coded physiological pathways (Layer A).
 * 
 * Requirements:
 * - Effect size ≥0.35 (Spearman ρ or Cliff's delta)
 * - Probability of direction (PD) ≥95%
 * - Replication across multiple time windows OR multiple users
 * - Excludes pathways already in Layer A
 * 
 * Uses Bayesian statistics to estimate confidence and avoid false discoveries
 * from multiple comparisons.
 */

import { PHYSIOLOGICAL_PATHWAYS } from './physiologicalPathways';

// ============================================================================
// Statistical Thresholds
// ============================================================================

export const CORRELATION_THRESHOLDS = {
  MIN_EFFECT_SIZE: 0.35,           // Spearman ρ or Cliff's delta
  MIN_PROBABILITY_DIRECTION: 0.95,  // 95% Bayesian confidence
  MIN_SAMPLE_SIZE: 5,               // Minimum data points for correlation
  MIN_REPLICATIONS: 2,              // Must replicate in at least 2 windows
} as const;

// ============================================================================
// Data Structures
// ============================================================================

export interface CorrelationResult {
  independent: string;
  dependent: string;
  effectSize: number;           // Spearman ρ or Cliff's delta
  probabilityDirection: number; // Bayesian PD (0.0-1.0)
  direction: 'positive' | 'negative';
  nSamples: number;
  windowType: 'short_term' | 'medium_term' | 'long_term';
  dateRange: {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
  };
}

export interface ReplicatedCorrelation {
  independent: string;
  dependent: string;
  direction: 'positive' | 'negative';
  replications: CorrelationResult[];
  avgEffectSize: number;
  avgProbabilityDirection: number;
  evidenceTier: '4'; // Layer B discoveries are Tier 4 (Bayesian analysis)
  isNovel: boolean; // True if not in Layer A pathways
}

// ============================================================================
// Spearman Rank Correlation
// ============================================================================

/**
 * Calculate Spearman's rank correlation coefficient (ρ)
 * 
 * Non-parametric measure of monotonic association that doesn't assume
 * linearity or normality. Robust to outliers.
 * 
 * Implementation: Compute Pearson correlation on rank-transformed arrays.
 * This handles ties correctly (the simplified formula only works without ties).
 * 
 * @param x - Independent variable values
 * @param y - Dependent variable values
 * @returns Spearman ρ coefficient (-1.0 to 1.0)
 */
export function calculateSpearmanRho(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) {
    throw new Error('Spearman correlation requires equal-length arrays with n ≥ 3');
  }
  
  // Rank the x and y values (handles ties with average rank method)
  const xRanks = getRanks(x);
  const yRanks = getRanks(y);
  
  // Compute Pearson correlation on ranks (handles ties correctly)
  const rho = calculatePearsonCorrelation(xRanks, yRanks);
  
  return rho;
}

/**
 * Calculate Pearson correlation coefficient (r)
 * 
 * Standard parametric correlation measure.
 * Used internally for Spearman (on ranked data) to handle ties correctly.
 * 
 * Formula: r = Σ((x - x̄)(y - ȳ)) / √(Σ(x - x̄)² * Σ(y - ȳ)²)
 * 
 * @param x - First variable values
 * @param y - Second variable values
 * @returns Pearson r coefficient (-1.0 to 1.0)
 */
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  
  // Calculate means
  const xMean = x.reduce((sum, val) => sum + val, 0) / n;
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
  
  // Calculate covariance and standard deviations
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  
  for (let i = 0; i < n; i++) {
    const xDev = x[i] - xMean;
    const yDev = y[i] - yMean;
    covariance += xDev * yDev;
    xVariance += xDev * xDev;
    yVariance += yDev * yDev;
  }
  
  // Pearson correlation
  if (xVariance === 0 || yVariance === 0) {
    return 0; // No variance = no correlation
  }
  
  const r = covariance / Math.sqrt(xVariance * yVariance);
  
  return r;
}

/**
 * Convert values to ranks (handling ties with average rank method)
 * 
 * @param values - Array of numeric values
 * @returns Array of ranks (1-indexed)
 */
function getRanks(values: number[]): number[] {
  const n = values.length;
  
  // Create array of [value, originalIndex] pairs
  const indexed = values.map((value, index) => ({ value, index }));
  
  // Sort by value
  indexed.sort((a, b) => a.value - b.value);
  
  // Assign ranks (handling ties)
  const ranks = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    // Find all values equal to current value (ties)
    let j = i;
    while (j < n && indexed[j].value === indexed[i].value) {
      j++;
    }
    
    // Average rank for tied values
    const avgRank = (i + j + 1) / 2; // Convert to 1-indexed
    
    // Assign average rank to all tied values
    for (let k = i; k < j; k++) {
      ranks[indexed[k].index] = avgRank;
    }
    
    i = j;
  }
  
  return ranks;
}

// ============================================================================
// Cliff's Delta (Effect Size for Ordinal Data)
// ============================================================================

/**
 * Calculate Cliff's Delta effect size
 * 
 * Non-parametric effect size measure that quantifies how often values in
 * one group are larger than values in another group.
 * 
 * Used when comparing groups (e.g., days with vs. without an event)
 * rather than continuous correlations.
 * 
 * Formula: δ = (# pairs where x1 > x2) - (# pairs where x1 < x2) / (n1 * n2)
 * 
 * Interpretation:
 * - |δ| < 0.15: negligible
 * - 0.15 ≤ |δ| < 0.33: small
 * - 0.33 ≤ |δ| < 0.47: medium  ← Our threshold (0.35)
 * - |δ| ≥ 0.47: large
 * 
 * @param group1 - Values for group 1 (e.g., days with event)
 * @param group2 - Values for group 2 (e.g., days without event)
 * @returns Cliff's Delta (-1.0 to 1.0)
 */
export function calculateCliffsDelta(group1: number[], group2: number[]): number {
  if (group1.length === 0 || group2.length === 0) {
    throw new Error('Cliff\'s Delta requires non-empty groups');
  }
  
  let greaterCount = 0;
  let lessCount = 0;
  
  // Count pairs where group1[i] > group2[j] or group1[i] < group2[j]
  for (const val1 of group1) {
    for (const val2 of group2) {
      if (val1 > val2) greaterCount++;
      else if (val1 < val2) lessCount++;
      // Ties don't count
    }
  }
  
  const totalPairs = group1.length * group2.length;
  const delta = (greaterCount - lessCount) / totalPairs;
  
  return delta;
}

// ============================================================================
// Bayesian Probability of Direction
// ============================================================================

/**
 * Calculate Bayesian probability of direction (PD)
 * 
 * Estimates the probability that the true effect has the same sign as
 * the observed effect (i.e., probability that correlation is truly
 * positive/negative and not due to noise).
 * 
 * Uses bootstrap resampling to estimate posterior distribution, then
 * calculates proportion of bootstrap samples with same sign as original.
 * 
 * PD ≥ 95% means we're 95% confident the relationship exists in the
 * observed direction (not just noise).
 * 
 * @param x - Independent variable values
 * @param y - Dependent variable values
 * @param observedRho - Observed Spearman ρ
 * @param nBootstrap - Number of bootstrap samples (default: 1000)
 * @returns Probability of direction (0.0 to 1.0)
 */
export function calculateProbabilityOfDirection(
  x: number[],
  y: number[],
  observedRho: number,
  nBootstrap: number = 1000
): number {
  if (x.length !== y.length || x.length < 5) {
    return 0; // Not enough data for reliable bootstrap
  }
  
  const n = x.length;
  const observedSign = Math.sign(observedRho);
  let sameSignCount = 0;
  
  // Bootstrap resampling
  for (let b = 0; b < nBootstrap; b++) {
    // Resample with replacement
    const xBootstrap: number[] = [];
    const yBootstrap: number[] = [];
    
    for (let i = 0; i < n; i++) {
      const randomIndex = Math.floor(Math.random() * n);
      xBootstrap.push(x[randomIndex]);
      yBootstrap.push(y[randomIndex]);
    }
    
    // Calculate Spearman ρ for bootstrap sample
    const bootstrapRho = calculateSpearmanRho(xBootstrap, yBootstrap);
    
    // Count if same sign as observed
    if (Math.sign(bootstrapRho) === observedSign) {
      sameSignCount++;
    }
  }
  
  return sameSignCount / nBootstrap;
}

// ============================================================================
// Pathway Exclusion (Avoid duplicating Layer A)
// ============================================================================

/**
 * Check if a correlation is already covered by Layer A pathways
 * 
 * @param independent - Independent variable
 * @param dependent - Dependent variable
 * @returns True if this pathway exists in Layer A
 */
export function isPathwayInLayerA(independent: string, dependent: string): boolean {
  return PHYSIOLOGICAL_PATHWAYS.some(
    p => p.independent === independent && p.dependent === dependent
  );
}

// ============================================================================
// Replication Detection
// ============================================================================

/**
 * Group correlations by variable pair and check for replication
 * 
 * A correlation is considered "replicated" if it appears in ≥2 DISTINCT time windows
 * with consistent direction and effect size ≥0.35 in each window.
 * 
 * This prevents counting duplicate inserts from the same window as "replications".
 * 
 * @param correlations - All detected correlations across windows
 * @returns Replicated correlations with averaged effect sizes
 */
export function detectReplicatedCorrelations(
  correlations: CorrelationResult[]
): ReplicatedCorrelation[] {
  // Group by variable pair
  const pairMap = new Map<string, CorrelationResult[]>();
  
  for (const corr of correlations) {
    const pairKey = `${corr.independent}→${corr.dependent}`;
    
    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, []);
    }
    pairMap.get(pairKey)!.push(corr);
  }
  
  // Filter for replicated pairs
  const replicated: ReplicatedCorrelation[] = [];
  
  for (const [pairKey, results] of Array.from(pairMap.entries())) {
    // De-duplicate by window (keep only one result per unique window)
    // Group by windowType + dateRange to identify distinct windows
    const windowMap = new Map<string, CorrelationResult>();
    
    for (const result of results) {
      const windowKey = `${result.windowType}:${result.dateRange.start}-${result.dateRange.end}`;
      
      // Keep the result with highest effect size for this window
      const existing = windowMap.get(windowKey);
      if (!existing || result.effectSize > existing.effectSize) {
        windowMap.set(windowKey, result);
      }
    }
    
    const distinctWindowResults = Array.from(windowMap.values());
    
    // Must have ≥2 replications in DISTINCT windows
    if (distinctWindowResults.length < CORRELATION_THRESHOLDS.MIN_REPLICATIONS) {
      continue;
    }
    
    // Must have consistent direction across all windows
    const firstDirection = distinctWindowResults[0].direction;
    const allSameDirection = distinctWindowResults.every(r => r.direction === firstDirection);
    if (!allSameDirection) {
      continue;
    }
    
    // Calculate average effect size and PD across distinct windows
    const avgEffectSize = distinctWindowResults.reduce((sum, r) => sum + r.effectSize, 0) / distinctWindowResults.length;
    const avgPD = distinctWindowResults.reduce((sum, r) => sum + r.probabilityDirection, 0) / distinctWindowResults.length;
    
    // Check if novel (not in Layer A)
    const independent = distinctWindowResults[0].independent;
    const dependent = distinctWindowResults[0].dependent;
    const isNovel = !isPathwayInLayerA(independent, dependent);
    
    replicated.push({
      independent,
      dependent,
      direction: firstDirection,
      replications: distinctWindowResults,
      avgEffectSize,
      avgProbabilityDirection: avgPD,
      evidenceTier: '4', // Bayesian analysis = Tier 4
      isNovel,
    });
  }
  
  // Sort by average effect size (descending)
  return replicated.sort((a, b) => b.avgEffectSize - a.avgEffectSize);
}

// ============================================================================
// Correlation Analysis Workflow
// ============================================================================

/**
 * Analyze correlation between two variables in a time window
 * 
 * @param independent - Independent variable values
 * @param dependent - Dependent variable values
 * @param independentName - Name of independent variable
 * @param dependentName - Name of dependent variable
 * @param windowType - Time window type
 * @param dateRange - Date range of the window
 * @returns Correlation result if significant, null otherwise
 */
export function analyzeCorrelation(
  independent: number[],
  dependent: number[],
  independentName: string,
  dependentName: string,
  windowType: 'short_term' | 'medium_term' | 'long_term',
  dateRange: { start: string; end: string }
): CorrelationResult | null {
  // Check minimum sample size
  if (independent.length < CORRELATION_THRESHOLDS.MIN_SAMPLE_SIZE) {
    return null;
  }
  
  // Calculate Spearman correlation
  const rho = calculateSpearmanRho(independent, dependent);
  const effectSize = Math.abs(rho);
  
  // Check effect size threshold
  if (effectSize < CORRELATION_THRESHOLDS.MIN_EFFECT_SIZE) {
    return null;
  }
  
  // Calculate Bayesian probability of direction
  const pd = calculateProbabilityOfDirection(independent, dependent, rho);
  
  // Check PD threshold
  if (pd < CORRELATION_THRESHOLDS.MIN_PROBABILITY_DIRECTION) {
    return null;
  }
  
  return {
    independent: independentName,
    dependent: dependentName,
    effectSize,
    probabilityDirection: pd,
    direction: rho > 0 ? 'positive' : 'negative',
    nSamples: independent.length,
    windowType,
    dateRange,
  };
}

/**
 * Filter correlations to only include novel discoveries (not in Layer A)
 * 
 * @param correlations - All correlations
 * @returns Only novel correlations
 */
export function filterNovelCorrelations(
  correlations: ReplicatedCorrelation[]
): ReplicatedCorrelation[] {
  return correlations.filter(c => c.isNovel);
}
