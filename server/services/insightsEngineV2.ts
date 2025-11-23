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
import { users, dailyInsights, healthkitSamples, biomarkerMeasurements, biomarkerTestSessions, biomarkers, lifeEvents, healthDailyMetrics } from '../../shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { PHYSIOLOGICAL_PATHWAYS } from './physiologicalPathways';
import { determineHealthDomain, type RankedInsight, type HealthDomain, selectTopInsights, calculateRankScore, calculateConfidenceScore, calculateImpactScore, calculateActionabilityScore, calculateFreshnessScore } from './insightRanking';
import { generateInsight, type GeneratedInsight } from './insightLanguageGenerator';
import { type EvidenceTier } from './evidenceHierarchy';
import { differenceInDays, subDays, format } from 'date-fns';
import { detectReplicatedCorrelations, type ReplicatedCorrelation, filterNovelCorrelations } from './bayesianCorrelationEngine';
import { analyzeDoseResponse, type DoseResponseResult, type DosageEvent, type OutcomeDataPoint } from './doseResponseAnalyzer';
import { detectStaleLabWarning, type StaleLabWarning, detectMetricDeviations, type MetricDeviation } from './anomalyDetectionEngine';
import { logger } from '../logger';

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
// Health Data Structures
// ============================================================================

export interface HealthDataSnapshot {
  // HealthKit metrics (past 90 days)
  healthkitSamples: Array<{
    dataType: string;
    value: number;
    unit: string;
    startDate: Date;
  }>;
  
  // Daily aggregated HealthKit metrics
  dailyMetrics: Array<{
    date: string;
    hrv: number | null;
    sleepDuration: number | null;
    deepSleep: number | null;
    remSleep: number | null;
    steps: number | null;
    restingHeartRate: number | null;
    activeEnergy: number | null;
  }>;
  
  // Blood work biomarkers
  biomarkers: Array<{
    name: string;
    value: number;
    unit: string;
    testDate: Date;
    isAbnormal: boolean;
  }>;
  
  // Life events with dosages
  lifeEvents: Array<{
    eventType: string;
    details: any;
    happenedAt: Date;
  }>;
}

/**
 * Fetch comprehensive health data for a user
 * Includes past 90 days of HealthKit, blood work, and life events
 */
export async function fetchHealthData(userId: number): Promise<HealthDataSnapshot> {
  const ninetyDaysAgo = subDays(new Date(), 90);
  
  // Fetch HealthKit samples (past 90 days)
  const rawHealthkitSamples = await db
    .select({
      dataType: healthkitSamples.dataType,
      value: healthkitSamples.value,
      unit: healthkitSamples.unit,
      startDate: healthkitSamples.startDate,
    })
    .from(healthkitSamples)
    .where(
      and(
        eq(healthkitSamples.userId, userId.toString()),
        gte(healthkitSamples.startDate, ninetyDaysAgo)
      )
    )
    .orderBy(desc(healthkitSamples.startDate));
  
  // Fetch daily aggregated metrics
  const rawDailyMetrics = await db
    .select()
    .from(healthDailyMetrics)
    .where(
      and(
        eq(healthDailyMetrics.userId, userId.toString()),
        gte(healthDailyMetrics.date, format(ninetyDaysAgo, 'yyyy-MM-dd'))
      )
    )
    .orderBy(desc(healthDailyMetrics.date));
  
  // Fetch biomarker results (all time - we need historical data)
  // Join measurements with sessions and biomarkers
  const rawBiomarkers = await db
    .select({
      name: biomarkers.name,
      value: biomarkerMeasurements.valueCanonical,
      unit: biomarkerMeasurements.unitCanonical,
      testDate: biomarkerTestSessions.testDate,
      isAbnormal: sql<boolean>`COALESCE(array_length(${biomarkerMeasurements.flags}, 1) > 0, false)`,
    })
    .from(biomarkerMeasurements)
    .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
    .innerJoin(biomarkers, eq(biomarkerMeasurements.biomarkerId, biomarkers.id))
    .where(eq(biomarkerTestSessions.userId, userId.toString()))
    .orderBy(desc(biomarkerTestSessions.testDate));
  
  // Fetch life events (past 90 days)
  const rawLifeEvents = await db
    .select({
      eventType: lifeEvents.eventType,
      details: lifeEvents.details,
      happenedAt: lifeEvents.happenedAt,
    })
    .from(lifeEvents)
    .where(
      and(
        eq(lifeEvents.userId, userId.toString()),
        gte(lifeEvents.happenedAt, ninetyDaysAgo)
      )
    )
    .orderBy(desc(lifeEvents.happenedAt));
  
  return {
    healthkitSamples: rawHealthkitSamples.map(s => ({
      ...s,
      startDate: new Date(s.startDate),
    })),
    dailyMetrics: rawDailyMetrics.map(m => ({
      date: m.date,
      hrv: m.hrv,
      sleepDuration: m.sleepDuration,
      deepSleep: m.deepSleep,
      remSleep: m.remSleep,
      steps: m.steps,
      restingHeartRate: m.restingHeartRate,
      activeEnergy: m.activeEnergy,
    })),
    biomarkers: rawBiomarkers.map(b => ({
      ...b,
      value: b.value || 0,
      testDate: new Date(b.testDate),
      isAbnormal: b.isAbnormal || false,
    })),
    lifeEvents: rawLifeEvents.map(e => ({
      ...e,
      happenedAt: new Date(e.happenedAt),
    })),
  };
}

// ============================================================================
// Layer A: Physiological Pathways Adapter
// ============================================================================

/**
 * Convert physiological pathways into insight candidates
 * 
 * Returns all hard-coded science pathways with real data timestamps
 */
export function generateLayerAInsights(
  userId: number,
  healthData: HealthDataSnapshot
): InsightCandidate[] {
  const insights: InsightCandidate[] = [];
  
  // Find most recent data date across all sources
  const mostRecentDate = new Date(Math.max(
    healthData.healthkitSamples[0]?.startDate?.getTime() || 0,
    healthData.biomarkers[0]?.testDate?.getTime() || 0,
    healthData.dailyMetrics[0] ? new Date(healthData.dailyMetrics[0].date).getTime() : 0
  ));
  
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
      mostRecentDataDate: mostRecentDate,
      variables: [pathway.independent, pathway.dependent],
      rawMetadata: {
        mechanism: pathway.mechanism,
        references: pathway.references,
        doseDependent: pathway.doseDependent,
        timingDependent: pathway.timingDependent,
      },
    });
  }
  
  logger.info(`[Layer A] Generated ${insights.length} physiological pathway insights`);
  return insights;
}

// ============================================================================
// Layer B: Bayesian Correlations Adapter
// ============================================================================

/**
 * Run Bayesian correlation analysis and convert to insight candidates
 * 
 * For MVP: Calls the real engine but will return empty since we need
 * pre-computed correlations across multiple time windows. Phase 2 will
 * add the correlation computation step.
 */
export function generateLayerBInsights(
  userId: number,
  healthData: HealthDataSnapshot
): InsightCandidate[] {
  const insights: InsightCandidate[] = [];
  
  try {
    // In production, we would:
    // 1. Compute correlations for all metric pairs in short/medium/long windows
    // 2. Store results in insight_replication_history table
    // 3. Query for replicated patterns
    //
    // For MVP, we call detectReplicatedCorrelations with empty array
    // This validates the integration without needing the full correlation pipeline
    const correlationResults: any[] = []; // TODO: Compute correlations in Phase 2
    const replicatedCorrelations = detectReplicatedCorrelations(correlationResults);
    
    // Convert to InsightCandidate format
    for (const corr of replicatedCorrelations) {
      insights.push({
        layer: 'B',
        evidenceTier: corr.evidenceTier,
        independent: corr.independent,
        dependent: corr.dependent,
        direction: corr.direction,
        effectSize: corr.avgEffectSize,
        mostRecentDataDate: new Date(), // Would come from correlation data
        variables: [corr.independent, corr.dependent],
        rawMetadata: {
          replications: corr.replications,
          avgProbabilityDirection: corr.avgProbabilityDirection,
          isNovel: corr.isNovel,
        },
      });
    }
    
    logger.info(`[Layer B] Generated ${insights.length} Bayesian correlation insights`);
    return insights;
    
  } catch (error: any) {
    logger.error('[Layer B] Error generating Bayesian correlation insights:', error);
    return [];
  }
}

// ============================================================================
// Layer C: Dose-Response Adapter
// ============================================================================

/**
 * Run dose-response analysis and convert to insight candidates
 * 
 * Analyzes life events with dosage tracking to find dose-response relationships
 */
export function generateLayerCInsights(
  userId: number,
  healthData: HealthDataSnapshot
): InsightCandidate[] {
  const insights: InsightCandidate[] = [];
  
  try {
    // Extract life events with dosage amounts
    const dosageEventsByType = new Map<string, DosageEvent[]>();
    
    for (const event of healthData.lifeEvents) {
      const details = event.details as any;
      const amount = details?.dosage_amount || details?.amount || details?.duration_min;
      
      if (typeof amount === 'number' && amount > 0) {
        if (!dosageEventsByType.has(event.eventType)) {
          dosageEventsByType.set(event.eventType, []);
        }
        
        dosageEventsByType.get(event.eventType)!.push({
          date: format(event.happenedAt, 'yyyy-MM-dd'),
          amount,
          timing: details?.timing,
        });
      }
    }
    
    // For each event type with sufficient data, analyze against HRV, sleep, etc.
    const outcomeMetrics = ['hrv', 'sleepDuration', 'restingHeartRate'];
    
    for (const [eventType, dosageEvents] of dosageEventsByType) {
      if (dosageEvents.length < 5) {
        continue; // Need at least 5 events for dose-response
      }
      
      for (const metricName of outcomeMetrics) {
        // Prepare outcome data
        const outcomeData: OutcomeDataPoint[] = healthData.dailyMetrics
          .map(m => ({
            date: m.date,
            value: m[metricName as keyof typeof m] as number,
          }))
          .filter(o => o.value !== null && !isNaN(o.value));
        
        if (outcomeData.length < 5) {
          continue;
        }
        
        // Analyze each temporal window
        for (const window of ['ACUTE', 'SUB_ACUTE', 'CUMULATIVE'] as TemporalWindow[]) {
          const result = analyzeDoseResponse(
            dosageEvents,
            outcomeData,
            eventType,
            metricName,
            window
          );
          
          if (result) {
            insights.push({
              layer: 'C',
              evidenceTier: result.evidenceTier,
              independent: eventType,
              dependent: metricName,
              direction: result.direction,
              effectSize: result.effectSize,
              mostRecentDataDate: new Date(dosageEvents[dosageEvents.length - 1].date),
              variables: [eventType, metricName],
              rawMetadata: {
                window: result.window,
                effectType: result.effectType,
                tertiles: result.tertiles,
                optimalDose: result.optimalDose,
              },
            });
          }
        }
      }
    }
    
    logger.info(`[Layer C] Generated ${insights.length} dose-response insights`);
    return insights;
    
  } catch (error: any) {
    logger.error('[Layer C] Error generating dose-response insights:', error);
    return [];
  }
}

// ============================================================================
// Layer D: Anomaly Detection Adapter
// ============================================================================

/**
 * Run anomaly detection and convert to insight candidates
 * 
 * Detects when fast-moving metrics deviate significantly (≥20%) from baseline
 * in a pattern explained by stale biomarkers (yellow/red freshness)
 */
export function generateLayerDInsights(
  userId: number,
  healthData: HealthDataSnapshot
): InsightCandidate[] {
  const insights: InsightCandidate[] = [];
  
  try {
    // Step 1: Prepare metric data in correct format (Map<string, Array<{date, value}>>)
    const metricSnapshots = new Map<string, Array<{ date: string; value: number }>>();
    
    // Convert dailyMetrics to Map format expected by detectMetricDeviations
    const metrics = ['hrv', 'sleepDuration', 'restingHeartRate', 'steps'] as const;
    for (const metricName of metrics) {
      const dataPoints: Array<{ date: string; value: number }> = [];
      
      for (const m of healthData.dailyMetrics) {
        const value = m[metricName];
        if (value !== null && !isNaN(value)) {
          dataPoints.push({
            date: m.date,
            value,
          });
        }
      }
      
      if (dataPoints.length > 0) {
        metricSnapshots.set(metricName, dataPoints);
      }
    }
    
    // Step 2: Detect deviations
    const deviations = detectMetricDeviations(metricSnapshots);
    
    if (deviations.length === 0) {
      logger.info('[Layer D] No significant metric deviations detected');
      return [];
    }
    
    // Step 3: Prepare biomarker data with freshness
    const biomarkerData = healthData.biomarkers.map(b => ({
      name: b.name,
      value: b.value,
      unit: b.unit,
      testDate: format(b.testDate, 'yyyy-MM-dd'),
      isAbnormal: b.isAbnormal,
    }));
    
    // Step 4: Detect stale-lab warnings
    const staleLabWarnings = detectStaleLabWarning(deviations, biomarkerData);
    
    if (!staleLabWarnings || staleLabWarnings.length === 0) {
      logger.info('[Layer D] No stale-lab warnings detected');
      return [];
    }
    
    // Step 5: Convert to InsightCandidate format
    for (const warning of staleLabWarnings) {
      // Find most recent date from deviating metrics
      let mostRecentDate = new Date(0);
      for (const deviation of warning.supportingDeviations) {
        const metricData = metricSnapshots.get(deviation.metric);
        if (metricData && metricData.length > 0) {
          const latestDataPoint = metricData[metricData.length - 1];
          const dataDate = new Date(latestDataPoint.date);
          if (dataDate > mostRecentDate) {
            mostRecentDate = dataDate;
          }
        }
      }
      
      insights.push({
        layer: 'D',
        evidenceTier: '3', // Mechanistic + observational
        independent: warning.biomarker.name,
        dependent: warning.supportingDeviations.map(d => d.metric).join(', '),
        direction: 'negative', // Stale labs are always concerning
        deviationPercent: Math.abs(warning.supportingDeviations[0]?.percentChange * 100),
        mostRecentDataDate: mostRecentDate,
        variables: [warning.biomarker.name, ...warning.supportingDeviations.map(d => d.metric)],
        rawMetadata: {
          biomarkerValue: warning.biomarker.value,
          biomarkerUnit: warning.biomarker.unit,
          daysSinceTest: warning.daysSinceTest,
          freshnessCategory: warning.biomarker.freshnessCategory,
          supportingDeviations: warning.supportingDeviations,
        },
      });
    }
    
    logger.info(`[Layer D] Generated ${insights.length} stale-lab warning insights`);
    return insights;
    
  } catch (error: any) {
    logger.error('[Layer D] Error generating anomaly detection insights:', error);
    return [];
  }
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
 * 1. Check if insights already generated today (idempotency)
 * 2. Fetch user's health data
 * 3. Run all 4 analytical layers
 * 4. Rank insights
 * 5. Select top 5
 * 6. Generate natural language
 * 7. Store in database
 * 
 * @param userId - User ID
 * @param forceRegenerate - Force regeneration even if insights exist for today
 * @returns Array of generated insights
 */
export async function generateDailyInsights(userId: number, forceRegenerate: boolean = false): Promise<GeneratedInsight[]> {
  logger.info(`[InsightsEngineV2] Generating insights for user ${userId}`);
  
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Step 1: Check idempotency - skip if already generated for today (unless force regenerate)
    if (!forceRegenerate) {
      const existingInsights = await db
        .select()
        .from(dailyInsights)
        .where(
          and(
            eq(dailyInsights.userId, userId.toString()),
            eq(dailyInsights.generatedDate, today)
          )
        );
      
      if (existingInsights.length > 0) {
        logger.info(`[InsightsEngineV2] Insights already generated for user ${userId} on ${today} (${existingInsights.length} insights), returning existing`);
        // Transform DB records to GeneratedInsight format for API consistency
        return existingInsights.map(insight => ({
          title: insight.title,
          body: insight.body,
          action: insight.action || undefined,
        }));
      }
    } else {
      // Force regenerate - delete existing insights for today first
      await db
        .delete(dailyInsights)
        .where(
          and(
            eq(dailyInsights.userId, userId.toString()),
            eq(dailyInsights.generatedDate, today)
          )
        );
      logger.info(`[InsightsEngineV2] Deleted existing insights for user ${userId} on ${today} (force regenerate)`);
    }
    
    // Step 2: Fetch user's comprehensive health data (90 days)
    logger.info('[InsightsEngineV2] Fetching health data');
    const healthData = await fetchHealthData(userId);
    logger.info(`[InsightsEngineV2] Data fetched - HealthKit: ${healthData.healthkitSamples.length}, Daily Metrics: ${healthData.dailyMetrics.length}, Biomarkers: ${healthData.biomarkers.length}, Life Events: ${healthData.lifeEvents.length}`);
    
    // Step 3: Run all 4 analytical layers
    logger.info('[InsightsEngineV2] Running Layer A (Physiological Pathways)');
    const layerAInsights = generateLayerAInsights(userId, healthData);
    
    logger.info('[InsightsEngineV2] Running Layer B (Bayesian Correlations)');
    const layerBInsights = generateLayerBInsights(userId, healthData);
    
    logger.info('[InsightsEngineV2] Running Layer C (Dose-Response)');
    const layerCInsights = generateLayerCInsights(userId, healthData);
    
    logger.info('[InsightsEngineV2] Running Layer D (Anomaly Detection)');
    const layerDInsights = generateLayerDInsights(userId, healthData);
    
    // Combine all candidates
    const allCandidates = [
      ...layerAInsights,
      ...layerBInsights,
      ...layerCInsights,
      ...layerDInsights,
    ];
    
    logger.info(`[InsightsEngineV2] Generated ${allCandidates.length} insight candidates (A:${layerAInsights.length}, B:${layerBInsights.length}, C:${layerCInsights.length}, D:${layerDInsights.length})`);
    
    // Step 4: Convert to ranked insights
    const rankedInsights = allCandidates.map(convertToRankedInsight);
    
    // Step 5: Select top 5 with domain diversity
    const topInsights = selectTopInsights(rankedInsights, 5, 2);
    
    logger.info(`[InsightsEngineV2] Selected ${topInsights.length} top insights`);
    
    // Step 6: Generate natural language
    const insightPairs: Array<{
      narrative: GeneratedInsight;
      ranked: RankedInsight;
      candidate: InsightCandidate;
    }> = [];
    
    for (let index = 0; index < topInsights.length; index++) {
      const rankedInsight = topInsights[index];
      
      // More robust candidate matching (handles Layer D's comma-joined dependent variables)
      const candidate = allCandidates.find(c => {
        if (c.layer !== rankedInsight.layer) return false;
        if (c.independent !== rankedInsight.variables[0]) return false;
        
        // For Layer D, dependent may be comma-joined (e.g., "hrv, sleepDuration")
        // So we check if all variables match
        const candidateVars = [c.independent, ...c.dependent.split(', ')].sort().join(',');
        const rankedVars = rankedInsight.variables.sort().join(',');
        
        return candidateVars === rankedVars;
      });
      
      if (!candidate) {
        logger.warn(`[InsightsEngineV2] No candidate found for ranked insight: ${rankedInsight.title}`);
        continue;
      }
      
      const narrative = generateInsightNarrative(rankedInsight, candidate);
      insightPairs.push({ narrative, ranked: rankedInsight, candidate });
      
      logger.info(`[InsightsEngineV2] Insight ${index + 1}: ${narrative.title}`);
    }
    
    const generatedInsights = insightPairs.map(p => p.narrative);
    
    // Step 7: Store in database
    if (insightPairs.length > 0) {
      try {
        logger.info(`[InsightsEngineV2] Storing ${insightPairs.length} insights in database`);
        
        // Map layer to database format
        const layerMap: Record<string, string> = {
          'A': 'A_physiological',
          'B': 'B_open_discovery',
          'C': 'C_dose_response',
          'D': 'D_anomaly',
        };
        
        // Map health domain to category (must match insightCategoryEnum from schema)
        // HealthDomain values: sleep, recovery, metabolic, hormonal, inflammatory, performance, lifestyle
        // insightCategoryEnum values: activity_sleep, recovery_hrv, sleep_quality, biomarkers, nutrition, stress, general
        const categoryMap: Record<string, string> = {
          'sleep': 'sleep_quality',
          'recovery': 'recovery_hrv',
          'metabolic': 'biomarkers',
          'hormonal': 'biomarkers',
          'inflammatory': 'biomarkers', // Changed from 'stress' to 'biomarkers' for better alignment
          'performance': 'activity_sleep',
          'lifestyle': 'general',
          // Legacy mappings (in case old code uses these):
          'activity': 'activity_sleep',
          'cardiovascular': 'biomarkers',
          'cognitive': 'general',
          'nutrition': 'nutrition',
          'stress': 'stress',
        };
        
        const insightsToInsert = insightPairs.map(pair => {
          // Defensive fallback: ensure category is always valid
          const category = categoryMap[pair.ranked.healthDomain];
          if (!category) {
            logger.warn(`[InsightsEngineV2] Unknown healthDomain "${pair.ranked.healthDomain}", defaulting to "general"`);
          }
          
          return {
            userId: userId.toString(),
            generatedDate: today,
            title: pair.narrative.title,
            body: pair.narrative.body,
            action: pair.narrative.action || null,
            confidenceScore: pair.ranked.confidenceScore,
            impactScore: pair.ranked.impactScore,
            actionabilityScore: pair.ranked.actionabilityScore,
            freshnessScore: pair.ranked.freshnessScore,
            overallScore: pair.ranked.rankScore,
            evidenceTier: pair.ranked.evidenceTier,
            primarySources: pair.ranked.variables,
            category: category || 'general', // Defensive fallback to 'general'
            generatingLayer: layerMap[pair.ranked.layer] || 'A_physiological',
            details: {
              variables: pair.ranked.variables,
              layer: pair.ranked.layer,
              healthDomain: pair.ranked.healthDomain,
            },
          };
        });
        
        await db.insert(dailyInsights).values(insightsToInsert);
        
        logger.info(`[InsightsEngineV2] Successfully stored ${insightsToInsert.length} insights for user ${userId}`);
      } catch (dbError: any) {
        logger.error(`[InsightsEngineV2] Database persistence failed for user ${userId}:`, dbError);
        throw dbError; // Re-throw to signal failure to scheduler
      }
    } else {
      logger.info(`[InsightsEngineV2] No insights generated for user ${userId}, skipping database storage`);
    }
    
    logger.info(`[InsightsEngineV2] Successfully generated ${generatedInsights.length} insights for user ${userId}`);
    return generatedInsights;
    
  } catch (error: any) {
    logger.error(`[InsightsEngineV2] Error generating insights for user ${userId}:`, error);
    throw error;
  }
}
