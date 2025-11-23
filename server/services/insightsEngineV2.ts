/**
 * Daily Insights Engine v2.0 - Unified Orchestrator
 * 
 * Integrates all 4 analytical layers into a cohesive pipeline:
 * Layer A: Physiological Pathways
 * Layer B: Bayesian Correlations
 * Layer C: Dose-Response Analysis
 * Layer D: Anomaly Detection
 * 
 * Then ranks insights and generates natural language.
 */

import { db } from '../db';
import { users, dailyInsights } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { PHYSIOLOGICAL_PATHWAYS } from './physiologicalPathways';
import { determineHealthDomain, type RankedInsight, type HealthDomain, selectTopInsights, calculateRankScore, calculateConfidenceScore, calculateImpactScore, calculateActionabilityScore, calculateFreshnessScore } from './insightRanking';
import { generateInsight, type GeneratedInsight } from './insightLanguageGenerator';
import { type EvidenceTier } from './evidenceHierarchy';
import { differenceInDays } from 'date-fns';

// ============================================================================
// Shared Interface for Insight Candidates
// ============================================================================

/**
 * Unified interface for insights from all layers
 * This is the common data contract that all layers must produce
 */
export interface InsightCandidate {
  layer: 'A' | 'B' | 'C' | 'D';
  evidenceTier: EvidenceTier;
  independent: string;
  dependent: string;
  direction: 'positive' | 'negative';
  effectSize?: number;
  deviationPercent?: number;
  mostRecentDataDate: Date;
  variables: string[];
  rawMetadata?: any; // Layer-specific metadata
}

// ============================================================================
// Layer A: Physiological Pathways Adapter
// ============================================================================

/**
 * Convert physiological pathways into insight candidates
 * 
 * For MVP: Use all pathways as candidates (they're all science-backed)
 * In production: Filter to pathways with recent data supporting them
 */
export function generateLayerAInsights(
  userId: number,
  healthData: any // TODO: Type this properly based on available data
): InsightCandidate[] {
  const insights: InsightCandidate[] = [];
  
  for (const pathway of PHYSIOLOGICAL_PATHWAYS) {
    // Skip bidirectional pathways for now (need special handling)
    if (pathway.direction === 'bidirectional') {
      continue;
    }
    
    insights.push({
      layer: 'A',
      evidenceTier: pathway.tier,
      independent: pathway.independent,
      dependent: pathway.dependent,
      direction: pathway.direction,
      effectSize: (pathway.effectSizeRange.min + pathway.effectSizeRange.max) / 2,
      mostRecentDataDate: new Date(), // TODO: Get actual most recent data date
      variables: [pathway.independent, pathway.dependent],
      rawMetadata: {
        mechanism: pathway.mechanism,
        references: pathway.references,
        doseDependent: pathway.doseDependent,
        timingDependent: pathway.timingDependent,
      },
    });
  }
  
  return insights;
}

// ============================================================================
// Layer B: Bayesian Correlations Adapter
// ============================================================================

/**
 * Run Bayesian correlation analysis and convert to insight candidates
 * 
 * TODO: Implement full Bayesian correlation engine integration
 */
export function generateLayerBInsights(
  userId: number,
  healthData: any
): InsightCandidate[] {
  // TODO: Implement Bayesian correlation analysis
  // 1. Get all metric pairs from healthData
  // 2. Run Spearman correlation with Bayesian inference
  // 3. Filter by effect size ≥ 0.35 and PD ≥ 95%
  // 4. Check for replication (distinct windows/users)
  // 5. Convert to InsightCandidate[]
  
  return [];
}

// ============================================================================
// Layer C: Dose-Response Adapter
// ============================================================================

/**
 * Run dose-response analysis and convert to insight candidates
 * 
 * TODO: Implement full dose-response engine integration
 */
export function generateLayerCInsights(
  userId: number,
  healthData: any
): InsightCandidate[] {
  // TODO: Implement dose-response analysis
  // 1. Get all life events with dosages
  // 2. Segment into tertiles
  // 3. Extract temporal windows (0-48h, 3-10d, cumulative)
  // 4. Analyze dose-response relationships
  // 5. Detect optimal timing
  // 6. Convert to InsightCandidate[]
  
  return [];
}

// ============================================================================
// Layer D: Anomaly Detection Adapter
// ============================================================================

/**
 * Run anomaly detection and convert to insight candidates
 * 
 * TODO: Implement full anomaly detection engine integration
 */
export function generateLayerDInsights(
  userId: number,
  healthData: any
): InsightCandidate[] {
  // TODO: Implement anomaly detection
  // 1. Get fast-moving metrics (HealthKit, life events)
  // 2. Detect deviations from baseline (≥20%)
  // 3. Get stale biomarkers (yellow/red freshness)
  // 4. Check for ≥3 matching deviations
  // 5. Generate stale-lab warnings
  // 6. Convert to InsightCandidate[]
  
  return [];
}

// ============================================================================
// Insight Candidate → Ranked Insight Conversion
// ============================================================================

/**
 * Convert InsightCandidate to RankedInsight with full scoring
 */
export function convertToRankedInsight(candidate: InsightCandidate): RankedInsight {
  const daysSinceData = differenceInDays(new Date(), candidate.mostRecentDataDate);
  
  // Calculate scoring components
  const confidenceScore = calculateConfidenceScore(
    candidate.evidenceTier,
    candidate.layer,
    candidate.effectSize ? Math.abs(candidate.effectSize) : 1.0
  );
  
  const impactScore = calculateImpactScore(
    candidate.layer,
    candidate.effectSize,
    candidate.deviationPercent,
    candidate.variables
  );
  
  const actionabilityScore = calculateActionabilityScore(
    candidate.layer,
    candidate.variables
  );
  
  const freshnessScore = calculateFreshnessScore(
    candidate.mostRecentDataDate
  );
  
  const healthDomain = determineHealthDomain(candidate.variables);
  
  // Create RankedInsight
  const rankedInsight: RankedInsight = {
    id: `${candidate.layer}-${candidate.independent}-${candidate.dependent}-${Date.now()}`,
    title: `${candidate.independent} → ${candidate.dependent}`,
    description: '', // Will be filled by NLG
    evidenceTier: candidate.evidenceTier,
    healthDomain,
    layer: candidate.layer,
    confidenceScore,
    impactScore,
    actionabilityScore,
    freshnessScore,
    rankScore: 0, // Will be calculated
    createdAt: new Date(),
    variables: candidate.variables,
  };
  
  // Calculate rank score
  rankedInsight.rankScore = calculateRankScore(rankedInsight);
  
  return rankedInsight;
}

// ============================================================================
// Ranked Insight → Natural Language Generation
// ============================================================================

/**
 * Generate natural language for a ranked insight
 */
export function generateInsightNarrative(
  rankedInsight: RankedInsight,
  candidate: InsightCandidate
): GeneratedInsight {
  const daysSinceData = differenceInDays(new Date(), candidate.mostRecentDataDate);
  
  return generateInsight({
    layer: candidate.layer,
    evidenceTier: candidate.evidenceTier,
    independent: candidate.independent,
    dependent: candidate.dependent,
    direction: candidate.direction,
    effectSize: candidate.effectSize,
    deviationPercent: candidate.deviationPercent,
    daysSinceData,
    includeExperiment: candidate.layer !== 'D', // No experiments for anomaly warnings
  });
}

// ============================================================================
// Full Pipeline Orchestration
// ============================================================================

/**
 * Generate daily insights for a user
 * 
 * Full pipeline:
 * 1. Fetch user's health data
 * 2. Run all 4 analytical layers
 * 3. Rank insights
 * 4. Select top 5
 * 5. Generate natural language
 * 6. Store in database
 * 
 * @param userId - User ID
 * @returns Array of generated insights
 */
export async function generateDailyInsights(userId: number): Promise<GeneratedInsight[]> {
  console.log(`[InsightsEngineV2] Generating insights for user ${userId}`);
  
  try {
    // TODO: Fetch user's health data
    // This should include:
    // - HealthKit metrics (HRV, sleep, activity, etc.)
    // - Blood work (biomarkers)
    // - Life events (dosages, behaviors)
    const healthData = {}; // Placeholder
    
    // Step 1: Run all 4 analytical layers
    console.log('[InsightsEngineV2] Running Layer A (Physiological Pathways)');
    const layerAInsights = generateLayerAInsights(userId, healthData);
    
    console.log('[InsightsEngineV2] Running Layer B (Bayesian Correlations)');
    const layerBInsights = generateLayerBInsights(userId, healthData);
    
    console.log('[InsightsEngineV2] Running Layer C (Dose-Response)');
    const layerCInsights = generateLayerCInsights(userId, healthData);
    
    console.log('[InsightsEngineV2] Running Layer D (Anomaly Detection)');
    const layerDInsights = generateLayerDInsights(userId, healthData);
    
    // Combine all candidates
    const allCandidates = [
      ...layerAInsights,
      ...layerBInsights,
      ...layerCInsights,
      ...layerDInsights,
    ];
    
    console.log(`[InsightsEngineV2] Generated ${allCandidates.length} insight candidates`);
    
    // Step 2: Convert to ranked insights
    const rankedInsights = allCandidates.map(convertToRankedInsight);
    
    // Step 3: Select top 5 with domain diversity
    const topInsights = selectTopInsights(rankedInsights, 5, 2);
    
    console.log(`[InsightsEngineV2] Selected ${topInsights.length} top insights`);
    
    // Step 4: Generate natural language
    const generatedInsights: GeneratedInsight[] = [];
    
    for (let index = 0; index < topInsights.length; index++) {
      const rankedInsight = topInsights[index];
      const candidate = allCandidates.find(
        c => c.layer === rankedInsight.layer &&
             c.independent === rankedInsight.variables[0] &&
             c.dependent === rankedInsight.variables[1]
      );
      
      if (!candidate) continue;
      
      const narrative = generateInsightNarrative(rankedInsight, candidate);
      generatedInsights.push(narrative);
      
      // TODO: Store in daily_insights table
      console.log(`[InsightsEngineV2] Insight ${index + 1}: ${narrative.title}`);
    }
    
    return generatedInsights;
    
  } catch (error: any) {
    console.error(`[InsightsEngineV2] Error generating insights for user ${userId}:`, error);
    throw error;
  }
}
