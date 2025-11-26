/**
 * Daily Insights Engine v2.0 - RAG-Based Holistic Discovery
 * 
 * Simplified architecture using AI-powered pattern discovery:
 * - RAG Layer: Holistic cross-domain insights via semantic search + GPT-4o
 * - Layer D: Out-of-range biomarker safety net
 * 
 * Replaces hard-coded pathways with intelligent pattern discovery.
 */

import { db } from '../db';
import { users, dailyInsights, healthkitSamples, biomarkerMeasurements, biomarkerTestSessions, biomarkers, lifeEvents, healthDailyMetrics, healthkitWorkouts } from '../../shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { determineHealthDomain, type RankedInsight, type HealthDomain, selectTopInsights, calculateRankScore, calculateConfidenceScore, calculateImpactScore, calculateActionabilityScore, calculateFreshnessScore } from './insightRanking';
import { generateInsight, type GeneratedInsight } from './insightLanguageGenerator';
import { type EvidenceTier, EVIDENCE_TIERS } from './evidenceHierarchy';
import { differenceInDays, subDays, format } from 'date-fns';
import { detectStaleLabWarning, type StaleLabWarning, detectMetricDeviations, type MetricDeviation, buildStaleBiomarker } from './anomalyDetectionEngine';
import { getFreshnessCategory, SLOW_MOVING_BIOMARKERS } from './dataClassification';
import { logger } from '../logger';
import { getUserContext, generateContextualInsight, type UserContext, type BaselineData } from './aiInsightGenerator';
import { detectDataChanges, generateRAGInsights, type RAGInsight } from './ragInsightGenerator';

// ============================================================================
// Shared Interface for Insight Candidates
// ============================================================================

/**
 * Unified interface for insights from remaining layers
 * Layer D only (safety net for out-of-range biomarkers)
 */
export interface InsightCandidate {
  layer: 'D';
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
  
  // Daily aggregated HealthKit metrics (ALL 20 fields)
  dailyMetrics: Array<{
    date: string;
    // Sleep
    sleepTotalMinutes: number | null;
    sleepDeepMinutes: number | null;
    sleepRemMinutes: number | null;
    // Cardiovascular
    hrvSdnnMs: number | null;
    restingHr: number | null;
    respiratoryRate: number | null;
    oxygenSaturationAvg: number | null;
    // Activity
    steps: number | null;
    distanceMeters: number | null;
    activeKcal: number | null;
    exerciseMinutes: number | null;
    standHours: number | null;
    // Body Composition
    weightKg: number | null;
    bodyFatPct: number | null;
    leanMassKg: number | null;
    bmi: number | null;
    waistCircumferenceCm: number | null;
    // Vitals
    bodyTempDeviationC: number | null;
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
  
  // Workout sessions from HealthKit
  workouts: Array<{
    workoutType: string;
    startDate: Date;
    duration: number; // minutes
    totalDistance: number | null; // meters
    totalEnergyBurned: number | null; // kcal
    averageHeartRate: number | null;
  }>;
}

/**
 * Fetch comprehensive health data for a user
 * Includes past 90 days of HealthKit, blood work, and life events
 */
export async function fetchHealthData(userId: string): Promise<HealthDataSnapshot> {
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
    );
  
  // CRITICAL FIX: Sort in-memory to guarantee newest-first ordering
  // String date comparison can fail with lexicographic sorting (e.g., "2025-2-1" > "2025-11-20")
  rawDailyMetrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
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
  
  // Fetch workout sessions (past 90 days)
  const rawWorkouts = await db
    .select({
      workoutType: healthkitWorkouts.workoutType,
      startDate: healthkitWorkouts.startDate,
      duration: healthkitWorkouts.duration,
      totalDistance: healthkitWorkouts.totalDistance,
      totalEnergyBurned: healthkitWorkouts.totalEnergyBurned,
      averageHeartRate: healthkitWorkouts.averageHeartRate,
    })
    .from(healthkitWorkouts)
    .where(
      and(
        eq(healthkitWorkouts.userId, userId.toString()),
        gte(healthkitWorkouts.startDate, ninetyDaysAgo)
      )
    )
    .orderBy(desc(healthkitWorkouts.startDate));
  
  return {
    healthkitSamples: rawHealthkitSamples.map(s => ({
      ...s,
      startDate: new Date(s.startDate),
    })),
    dailyMetrics: rawDailyMetrics.map(m => ({
      date: m.date,
      // Sleep
      sleepTotalMinutes: m.sleepTotalMinutes || null,
      sleepDeepMinutes: null, // Not in schema
      sleepRemMinutes: null, // Not in schema
      // Cardiovascular
      hrvSdnnMs: m.hrvSdnnMs || null,
      restingHr: m.restingHr || null,
      respiratoryRate: m.respiratoryRate || null,
      oxygenSaturationAvg: m.oxygenSaturationAvg || null,
      // Activity
      steps: m.steps || null,
      distanceMeters: m.distanceMeters || null,
      activeKcal: m.activeKcal || null,
      exerciseMinutes: m.exerciseMinutes || null,
      standHours: m.standHours || null,
      // Body Composition
      weightKg: m.weightKg || null,
      bodyFatPct: m.bodyFatPct || null,
      leanMassKg: m.leanMassKg || null,
      bmi: m.bmi || null,
      waistCircumferenceCm: m.waistCircumferenceCm || null,
      // Vitals
      bodyTempDeviationC: m.bodyTempDeviationC || null,
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
    workouts: rawWorkouts.map(w => ({
      workoutType: w.workoutType,
      startDate: new Date(w.startDate),
      duration: w.duration,
      totalDistance: w.totalDistance,
      totalEnergyBurned: w.totalEnergyBurned,
      averageHeartRate: w.averageHeartRate,
    })),
  };
}

// ============================================================================
// Helper: calculateUserMetrics removed (was only used by Layer A)
// ============================================================================

// ============================================================================
// Layers A, B, C removed - replaced by RAG-based holistic discovery
// ============================================================================

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
  userId: string,
  healthData: HealthDataSnapshot
): InsightCandidate[] {
  const insights: InsightCandidate[] = [];
  
  try {
    // CRITICAL PATH 1: Detect out-of-range biomarkers FIRST (flagged labs)
    // This is independent of stale-lab analysis and should always run
    const { detectOutOfRangeBiomarkers } = require('./anomalyDetectionEngine');
    const outOfRangeBiomarkers = detectOutOfRangeBiomarkers(healthData.biomarkers);
    
    for (const abnormalBiomarker of outOfRangeBiomarkers) {
      const daysSinceTest = abnormalBiomarker.daysSinceTest;
      // Convert biomarker name to canonical key for domain classification
      const canonicalKey = biomarkerNameToCanonicalKey(abnormalBiomarker.biomarker);
      
      insights.push({
        layer: 'D',
        evidenceTier: '2', // Lab data is tier 2 evidence
        independent: abnormalBiomarker.biomarker,
        dependent: 'health_optimization', // General health impact
        direction: abnormalBiomarker.interpretation === 'high' ? 'negative' : 'negative',
        mostRecentDataDate: abnormalBiomarker.testDate,
        variables: [canonicalKey],
        rawMetadata: {
          biomarkerValue: abnormalBiomarker.currentValue,
          biomarkerUnit: abnormalBiomarker.unit,
          daysSinceTest,
          interpretation: abnormalBiomarker.interpretation,
          isAbnormal: true,
        },
      });
    }
    
    logger.info(`[Layer D] Generated ${outOfRangeBiomarkers.length} out-of-range biomarker insights`);
    
    // CRITICAL PATH 2: Stale-lab warnings (old biomarkers explaining current deviations)
    // Step 1: Prepare metric data with CORRECT naming to match FAST_MOVING_METRICS
    const metricSnapshots = new Map<string, Array<{ date: string; value: number }>>();
    
    // CRITICAL: Use exact metric names that match FAST_MOVING_METRICS constant
    // Map dailyMetrics fields to FAST_MOVING_METRICS naming convention
    const metricMapping = {
      'hrv': 'hrv_sdnn_ms',
      'sleepDuration': 'sleep_total_minutes',
      'restingHeartRate': 'resting_hr',
      'steps': 'steps',
      'activeEnergy': 'active_kcal',
    } as const;
    
    for (const [fieldName, metricName] of Object.entries(metricMapping)) {
      const dataPoints: Array<{ date: string; value: number }> = [];
      
      for (const m of healthData.dailyMetrics) {
        const value = m[fieldName as keyof typeof m];
        if (value !== null && !isNaN(value as number)) {
          dataPoints.push({
            date: m.date,
            value: value as number,
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
      logger.info('[Layer D] No stale-lab warnings detected');
      // Return out-of-range biomarker insights (don't lose them!)
      return insights;
    }
    
    // Step 3: Prepare biomarker data with freshness using buildStaleBiomarker helper
    const staleBiomarkers = healthData.biomarkers
      .filter(b => {
        const daysSinceTest = differenceInDays(new Date(), b.testDate);
        return daysSinceTest > 180; // Consider biomarkers older than 6 months as stale
      })
      .map(b => buildStaleBiomarker(b.name, b.value, b.testDate));
    
    // Step 4: Detect stale-lab warnings for each stale biomarker
    const staleLabWarnings: StaleLabWarning[] = [];
    
    for (const staleBiomarker of staleBiomarkers) {
      const warning = detectStaleLabWarning(staleBiomarker, deviations);
      if (warning) {
        staleLabWarnings.push(warning);
      }
    }
    
    if (staleLabWarnings.length === 0) {
      logger.info('[Layer D] No stale-lab warnings detected');
      // Return out-of-range biomarker insights (don't lose them!)
      return insights;
    }
    
    // Step 5: Convert to InsightCandidate format
    for (const warning of staleLabWarnings) {
      // Find most recent date from deviating metrics
      let mostRecentDate = new Date(0);
      for (const deviation of warning.matchingDeviations) {
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
        independent: warning.staleBiomarker.biomarker,
        dependent: warning.matchingDeviations.map(d => d.metric).join(', '),
        direction: 'negative', // Stale labs are always concerning
        deviationPercent: Math.abs(warning.matchingDeviations[0]?.percentChange * 100),
        mostRecentDataDate: mostRecentDate,
        variables: [warning.staleBiomarker.biomarker, ...warning.matchingDeviations.map(d => d.metric)],
        rawMetadata: {
          biomarkerValue: warning.staleBiomarker.lastValue,
          biomarkerUnit: 'N/A', // Unit not stored in StaleBiomarker type
          daysSinceTest: warning.staleBiomarker.daysSinceLastMeasurement,
          freshnessCategory: warning.staleBiomarker.freshnessCategory,
          matchingDeviations: warning.matchingDeviations,
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
 * Extract baseline data for variables from health data
 * Handles both HealthKit metrics AND biomarkers
 */
function extractBaselines(variables: string[], healthData: HealthDataSnapshot): BaselineData[] {
  const baselines: BaselineData[] = [];
  
  for (const varName of variables) {
    // Try HealthKit daily metrics first
    const healthkitData = healthData.dailyMetrics
      .map(d => {
        // Map variable names to daily metrics fields
        const fieldMap: Record<string, keyof typeof d> = {
          'sleep_total_minutes': 'sleepTotalMinutes',
          'sleep_deep_minutes': 'sleepDeepMinutes',
          'sleep_rem_minutes': 'sleepRemMinutes',
          'hrv_sdnn_ms': 'hrvSdnnMs',
          'resting_hr': 'restingHr',
          'steps': 'steps',
          'active_kcal': 'activeKcal',
          'exercise_minutes': 'exerciseMinutes',
          'weight_kg': 'weightKg',
          'body_fat_pct': 'bodyFatPct',
          'lean_mass_kg': 'leanMassKg',
        };
        
        const field = fieldMap[varName];
        if (field && d[field] !== null) {
          return {
            date: d.date,
            value: d[field] as number,
          };
        }
        return null;
      })
      .filter((d): d is { date: string; value: number } => d !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // If no HealthKit data, try biomarkers
    const biomarkerMatches = healthData.biomarkers
      .filter(b => b.name && biomarkerNameToCanonicalKey(b.name) === varName);
    
    const biomarkerData = healthkitData.length === 0 
      ? biomarkerMatches
          .map(b => ({
            date: b.testDate,
            value: b.value,
            unit: b.unit, // Preserve unit for AI
          }))
          .filter(d => !isNaN(d.value))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      : [];
    
    const varData = healthkitData.length > 0 ? healthkitData : biomarkerData;
    
    if (varData.length === 0) {
      continue;
    }
    
    const current = varData[0]?.value ?? null;
    const unit = biomarkerData.length > 0 && biomarkerData[0]?.unit ? biomarkerData[0].unit : null;
    
    // For biomarkers (infrequent data), use ALL historical data as baseline
    // For HealthKit (daily data), use 7-day and 30-day windows
    const isBiomarker = biomarkerData.length > 0;
    
    if (isBiomarker) {
      // Biomarker: Calculate baseline from all previous tests (excluding most recent)
      const historicalData = varData.slice(1); // Skip current value
      const baseline = historicalData.length > 0
        ? historicalData.reduce((sum, d) => sum + d.value, 0) / historicalData.length
        : null;
      
      const percentChange = (current !== null && baseline !== null && baseline !== 0)
        ? ((current - baseline) / baseline) * 100
        : null;
      
      baselines.push({
        variable: varName,
        current,
        baseline7d: baseline, // Use historical baseline for both
        baseline30d: baseline,
        percentChange7d: percentChange,
        percentChange30d: percentChange,
        unit, // Include unit for biomarkers
      });
    } else {
      // HealthKit: Use 7-day and 30-day windows
      const last7Days = varData.slice(0, 7);
      const baseline7d = last7Days.length > 0
        ? last7Days.reduce((sum, d) => sum + d.value, 0) / last7Days.length
        : null;
      
      const last30Days = varData.slice(0, 30);
      const baseline30d = last30Days.length > 0
        ? last30Days.reduce((sum, d) => sum + d.value, 0) / last30Days.length
        : null;
      
      const percentChange7d = (current !== null && baseline7d !== null && baseline7d !== 0)
        ? ((current - baseline7d) / baseline7d) * 100
        : null;
      
      const percentChange30d = (current !== null && baseline30d !== null && baseline30d !== 0)
        ? ((current - baseline30d) / baseline30d) * 100
        : null;
      
      baselines.push({
        variable: varName,
        current,
        baseline7d,
        baseline30d,
        percentChange7d,
        percentChange30d,
        unit: null, // HealthKit metrics don't have units passed to AI
      });
    }
  }
  
  return baselines;
}

/**
 * Generate natural language for a ranked insight using AI
 * 
 * REPLACES template-based system with GPT-4o contextual generation
 */
export async function generateInsightNarrative(
  rankedInsight: RankedInsight,
  candidate: InsightCandidate,
  userContext: UserContext,
  baselines: BaselineData[]
): Promise<GeneratedInsight> {
  try {
    // Use AI to generate contextual insight
    const aiInsight = await generateContextualInsight(candidate, userContext, baselines);
    
    // DEBUG: Log what the AI generated
    logger.info(`[AI Insight Generated] ${aiInsight.title}`, {
      targetBiomarker: aiInsight.targetBiomarker,
      currentValue: aiInsight.currentValue,
      targetValue: aiInsight.targetValue,
      unit: aiInsight.unit,
    });
    
    // Convert AI insight to GeneratedInsight format
    return {
      title: aiInsight.title,
      summary: aiInsight.body,
      details: '', // AI body already includes all details
      actionable: aiInsight.action,
      primarySources: candidate.variables, // Use variables as sources
      targetBiomarker: aiInsight.targetBiomarker,
      currentValue: aiInsight.currentValue,
      targetValue: aiInsight.targetValue,
      unit: aiInsight.unit,
    };
  } catch (error) {
    logger.error('AI insight generation failed, falling back to template', { error, candidate });
    
    // Fallback to template-based generation if AI fails
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
      userMetrics: candidate.rawMetadata?.userMetrics, // Pass actual user data
      mechanism: candidate.rawMetadata?.mechanism, // Pass mechanism for Layer A
    });
  }
}

// ============================================================================
// Anti-Junk Safeguards
// ============================================================================

/**
 * Filter out insights where red-freshness biomarkers are the sole causal explanation
 * 
 * CRITICAL SPEC REQUIREMENT: "Red freshness labs must never be the sole causal 
 * explanation in an insight"
 * 
 * This function enforces algorithmic protection (not just linguistic hedging):
 * - Insights with red-freshness biomarkers as independent variable are blocked
 *   UNLESS they have supporting evidence from other variables
 * - Layer D (stale-lab warnings) is exempt - it's designed to surface stale biomarkers
 * 
 * @param candidates - Insight candidates from all layers
 * @param healthData - User health data with biomarker freshness info
 * @returns Filtered candidates with red-lab protection applied
 */
/**
 * Normalize biomarker names from database to pathway variable names.
 * SIMPLIFIED VERSION (Nov 23, 2025): Database duplicates have been cleaned up,
 * so we now use simple normalization with NO complex alias mapping.
 * 
 * Database → Normalized Examples:
 * - "hs-CRP" → "hs_crp"
 * - "Glucose" → "glucose"  
 * - "Free Testosterone" → "free_testosterone"
 * - "LDL Cholesterol" → "ldl_cholesterol"
 * - "Cortisol (AM)" → "cortisol_am"
 * 
 * Rule: Lowercase + replace special chars with underscores. That's it!
 * No mapping, no aliases, no complexity.
 */
export function biomarkerNameToCanonicalKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-,()]+/g, '_')  // Replace spaces, hyphens, commas, parens with underscore
    .replace(/_+/g, '_')          // Remove duplicate underscores
    .replace(/^_|_$/g, '');       // Trim leading/trailing underscores
}

/**
 * Metric domain mapping with weighted priorities
 * Primary domain = 2 points, Secondary domain = 1 point
 */
interface MetricDomainWeights {
  primary: string;
  secondary?: string;
}

const METRIC_DOMAIN_MAP: Record<string, MetricDomainWeights> = {
  // Sleep metrics (always primary: sleep)
  'sleep': { primary: 'sleep' },
  'sleep total minutes': { primary: 'sleep' },
  'sleep duration': { primary: 'sleep' },
  'deep sleep': { primary: 'sleep' },
  'rem sleep': { primary: 'sleep' },
  'sleep efficiency': { primary: 'sleep' },
  'sleep latency': { primary: 'sleep' },
  'awakenings': { primary: 'sleep' },
  'time in bed': { primary: 'sleep' },
  
  // Recovery metrics (always primary: recovery)
  'hrv': { primary: 'recovery', secondary: 'sleep' },
  'heart rate variability': { primary: 'recovery', secondary: 'sleep' },
  'resting heart rate': { primary: 'recovery' },
  'resting hr': { primary: 'recovery' },
  'respiratory rate': { primary: 'recovery' },
  
  // Activity/Performance metrics
  'steps': { primary: 'performance', secondary: 'recovery' },
  'active energy': { primary: 'performance' },
  'exercise': { primary: 'performance' },
  'exercise minutes': { primary: 'performance' },
  'vo2 max': { primary: 'performance', secondary: 'recovery' },
  'workout': { primary: 'performance' },
  'stand hours': { primary: 'performance' },
  'standing hours': { primary: 'performance' },
  
  // Body composition (metabolic with activity secondary)
  'body fat': { primary: 'metabolic', secondary: 'performance' },
  'weight': { primary: 'metabolic', secondary: 'performance' },
  'bmi': { primary: 'metabolic' },
  
  // Biomarkers - organized by domain
  'ferritin': { primary: 'inflammatory', secondary: 'metabolic' },
  'iron': { primary: 'inflammatory', secondary: 'metabolic' },
  'crp': { primary: 'inflammatory' },
  'c-reactive protein': { primary: 'inflammatory' },
  
  'testosterone': { primary: 'hormonal' },
  'estrogen': { primary: 'hormonal' },
  'cortisol': { primary: 'hormonal', secondary: 'recovery' },
  'thyroid': { primary: 'hormonal', secondary: 'metabolic' },
  'tsh': { primary: 'hormonal', secondary: 'metabolic' },
  
  'glucose': { primary: 'metabolic' },
  'a1c': { primary: 'metabolic' },
  'cholesterol': { primary: 'metabolic' },
  'ldl': { primary: 'metabolic' },
  'hdl': { primary: 'metabolic' },
  'triglycerides': { primary: 'metabolic' },
  'vitamin d': { primary: 'metabolic', secondary: 'inflammatory' },
};

/**
 * Classify RAG insights using weighted domain scoring to prevent category starvation
 * 
 * @param relatedMetrics - Array of metric names from RAG insight
 * @returns Insight category (biomarkers, sleep_quality, recovery_hrv, activity_sleep, or general)
 */
function classifyRAGInsight(relatedMetrics: string[]): string {
  if (!relatedMetrics || relatedMetrics.length === 0) {
    return 'general';
  }
  
  // Initialize domain scores
  const domainScores: Record<string, number> = {
    'sleep': 0,
    'recovery': 0,
    'performance': 0,
    'metabolic': 0,
    'hormonal': 0,
    'inflammatory': 0,
  };
  
  // Score each metric's contribution to different domains
  for (const metric of relatedMetrics) {
    const lowerMetric = metric.toLowerCase();
    const weights = METRIC_DOMAIN_MAP[lowerMetric];
    
    if (weights) {
      // Known metric - use weighted scoring
      domainScores[weights.primary] += 2;
      if (weights.secondary) {
        domainScores[weights.secondary] += 1;
      }
    } else {
      // Unknown metric - treat as biomarker and try to infer domain
      const canonical = biomarkerNameToCanonicalKey(metric);
      const { determineHealthDomain } = require('./insightRanking');
      const inferredDomain = determineHealthDomain([canonical]);
      
      if (inferredDomain && domainScores.hasOwnProperty(inferredDomain)) {
        domainScores[inferredDomain] += 1;
      } else {
        // Default to metabolic for unknown biomarkers
        domainScores['metabolic'] += 1;
      }
    }
  }
  
  // Find the domain with highest score
  // In case of ties, prefer sleep/recovery over biomarkers for better category diversity
  const priorityOrder = ['sleep', 'recovery', 'performance', 'inflammatory', 'hormonal', 'metabolic'];
  let maxScore = 0;
  let selectedDomain = 'metabolic';
  
  for (const domain of priorityOrder) {
    if (domainScores[domain] > maxScore) {
      maxScore = domainScores[domain];
      selectedDomain = domain;
    }
  }
  
  // Map health domain to insight category
  const domainToCategoryMap: Record<string, string> = {
    'sleep': 'sleep_quality',
    'recovery': 'recovery_hrv',
    'metabolic': 'biomarkers',
    'hormonal': 'biomarkers',
    'inflammatory': 'biomarkers',
    'performance': 'activity_sleep',
  };
  
  return domainToCategoryMap[selectedDomain] || 'general';
}

export function filterRedFreshnessInsights(
  candidates: InsightCandidate[],
  healthData: HealthDataSnapshot
): InsightCandidate[] {
  
  const filtered: InsightCandidate[] = [];
  let blockedCount = 0;
  
  for (const candidate of candidates) {
    // Layer D (stale-lab warnings) is EXEMPT - these are DESIGNED to surface stale biomarkers
    if (candidate.layer === 'D') {
      filtered.push(candidate);
      continue;
    }
    
    // CRITICAL SPEC REQUIREMENT: ANY insight referencing a red-freshness biomarker
    // must be suppressed (regardless of variable count or supporting evidence)
    // 
    // Collect ALL biomarker references from:
    // 1. candidate.variables array
    // 2. rawMetadata.staleBiomarkers (if present)
    // 3. Any other metadata fields that might contain biomarker references
    const allBiomarkerRefs = new Set<string>();
    
    // Add variables
    candidate.variables.forEach(v => allBiomarkerRefs.add(biomarkerNameToCanonicalKey(v)));
    
    // Check rawMetadata for additional biomarker references
    if (candidate.rawMetadata) {
      // Layer D warnings have staleBiomarkers array
      if (Array.isArray(candidate.rawMetadata.staleBiomarkers)) {
        candidate.rawMetadata.staleBiomarkers.forEach((b: any) => {
          if (b.biomarker) {
            allBiomarkerRefs.add(biomarkerNameToCanonicalKey(b.biomarker));
          }
        });
      }
      
      // Check for biomarker references in mechanism metadata
      if (candidate.rawMetadata.mechanismInputs && Array.isArray(candidate.rawMetadata.mechanismInputs)) {
        candidate.rawMetadata.mechanismInputs.forEach((input: any) => {
          if (typeof input === 'string') {
            allBiomarkerRefs.add(biomarkerNameToCanonicalKey(input));
          } else if (input?.name) {
            allBiomarkerRefs.add(biomarkerNameToCanonicalKey(input.name));
          }
        });
      }
    }
    
    // Check ALL biomarker references for red freshness
    let hasRedBiomarker = false;
    let redBiomarkerName = '';
    let redBiomarkerAge = 0;
    
    const biomarkerRefsArray = Array.from(allBiomarkerRefs);
    for (const biomarkerRef of biomarkerRefsArray) {
      // Find matching biomarker in health data
      const biomarkerData = healthData.biomarkers.find(b => 
        biomarkerNameToCanonicalKey(b.name) === biomarkerRef
      );
      
      if (biomarkerData) {
        const freshness = getFreshnessCategory(biomarkerData.testDate);
        
        if (freshness === 'red') {
          hasRedBiomarker = true;
          redBiomarkerName = biomarkerData.name;
          redBiomarkerAge = Math.round(differenceInDays(new Date(), biomarkerData.testDate) / 30);
          break; // Found a red biomarker - block this insight
        }
      }
    }
    
    if (hasRedBiomarker) {
      // BLOCK: Any insight with a red-freshness biomarker (except Layer D warnings)
      logger.warn(
        `[Anti-Junk] BLOCKED: Red-freshness biomarker detected - ${redBiomarkerName} in insight ${candidate.independent} → ${candidate.dependent} ` +
        `(biomarker is ${redBiomarkerAge} months old, ${candidate.variables.length} variables: [${candidate.variables.join(', ')}])`
      );
      blockedCount++;
      continue; // Skip this insight
    }
    
    // Passed red-freshness filter
    filtered.push(candidate);
  }
  
  if (blockedCount > 0) {
    logger.info(`[Anti-Junk] Total blocked: ${blockedCount} insights with red-freshness biomarkers`);
  }
  
  return filtered;
}

/**
 * Enforce first-occurrence evidence tier requirements
 * 
 * CRITICAL SPEC REQUIREMENT: "Tier 1–4 required for first-occurrence insights"
 * "Tier 5 (personal replication) only after ≥2 prior instances"
 * 
 * Since personal replication tracking is not yet implemented (Phase 2),
 * this function blocks Tier 5 insights entirely and ensures only Tier 1-4
 * insights are presented.
 * 
 * @param candidates - Insight candidates from all layers
 * @returns Filtered candidates with tier enforcement applied
 */
export function enforceEvidenceTierRequirements(
  candidates: InsightCandidate[]
): InsightCandidate[] {
  
  const filtered: InsightCandidate[] = [];
  let blockedCount = 0;
  
  for (const candidate of candidates) {
    // EXCEPTION: Layer D (stale-lab warnings) may have undefined/null tiers by design
    // These are critical safety warnings and must ALWAYS be allowed through
    if (candidate.layer === 'D') {
      filtered.push(candidate);
      continue;
    }
    
    // CRITICAL: Block Tier 5 and any undefined/unknown tiers (except Layer D above)
    // Tier 5 requires personal replication which isn't implemented yet
    if (!candidate.evidenceTier || candidate.evidenceTier === '5') {
      logger.warn(
        `[Anti-Junk] BLOCKED: Invalid or Tier 5 insight (Layer ${candidate.layer}) - ${candidate.independent} → ${candidate.dependent} ` +
        `(tier: ${candidate.evidenceTier || 'undefined'})`
      );
      blockedCount++;
      continue;
    }
    
    // Get tier configuration (safe with type check)
    const tierConfig = EVIDENCE_TIERS[candidate.evidenceTier];
    
    // If tier config doesn't exist, block it (safety default)
    if (!tierConfig) {
      logger.warn(
        `[Anti-Junk] BLOCKED: Unknown evidence tier (Layer ${candidate.layer}) - ${candidate.independent} → ${candidate.dependent} ` +
        `(tier: ${candidate.evidenceTier})`
      );
      blockedCount++;
      continue;
    }
    
    // Ensure insight can trigger first occurrence
    // Default to false if canTriggerFirstOccurrence is undefined (safety default)
    const canTrigger = tierConfig.canTriggerFirstOccurrence ?? false;
    if (!canTrigger) {
      logger.warn(
        `[Anti-Junk] BLOCKED: Tier cannot trigger first occurrence (Layer ${candidate.layer}) - ${candidate.independent} → ${candidate.dependent} ` +
        `(tier: ${candidate.evidenceTier})`
      );
      blockedCount++;
      continue;
    }
    
    // Passed tier enforcement
    filtered.push(candidate);
  }
  
  if (blockedCount > 0) {
    logger.info(`[Anti-Junk] Total tier enforcement blocks: ${blockedCount} insights`);
  }
  
  return filtered;
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
 * 4. Apply anti-junk safeguards (red-lab protection, tier enforcement)
 * 5. Rank insights
 * 6. Select top 5
 * 7. Generate natural language
 * 8. Store in database
 * 
 * @param userId - User ID
 * @param forceRegenerate - Force regeneration even if insights exist for today
 * @returns Array of generated insights
 */
export async function generateDailyInsights(userId: string, forceRegenerate: boolean = false): Promise<GeneratedInsight[]> {
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
        // Return empty - API will fetch from DB
        return [];
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
    logger.info(`[InsightsEngineV2] Data fetched - HealthKit: ${healthData.healthkitSamples.length}, Daily Metrics: ${healthData.dailyMetrics.length}, Biomarkers: ${healthData.biomarkers.length}, Life Events: ${healthData.lifeEvents.length}, Workouts: ${healthData.workouts.length}`);
    
    // Step 3: NEW RAG-BASED APPROACH - Detect data changes and use AI to find patterns
    logger.info('[InsightsEngineV2] Detecting significant data changes');
    const dataChanges = detectDataChanges(healthData.biomarkers, healthData.dailyMetrics);
    logger.info(`[InsightsEngineV2] Found ${dataChanges.length} significant changes`);
    
    // Step 4: Fetch user context for AI
    logger.info('[InsightsEngineV2] Fetching user context');
    const userContext = await getUserContext(userId.toString());
    
    // Step 5: Fetch available biomarker names for AI to use exact matches
    logger.info('[InsightsEngineV2] Fetching available biomarker names');
    const availableBiomarkers = await db
      .select({
        id: biomarkers.id,
        name: biomarkers.name,
        unitCanonical: biomarkers.canonicalUnit,
      })
      .from(biomarkers)
      .orderBy(biomarkers.name);
    logger.info(`[InsightsEngineV2] Found ${availableBiomarkers.length} available biomarkers`);
    
    // Step 6: Generate RAG-based holistic insights
    logger.info('[InsightsEngineV2] Generating RAG-based insights using vector search + GPT-4o');
    const ragInsights: RAGInsight[] = await generateRAGInsights(
      userId,
      dataChanges,
      healthData.biomarkers,
      userContext,
      availableBiomarkers,
      healthData.dailyMetrics,
      healthData.workouts
    );
    logger.info(`[InsightsEngineV2] Generated ${ragInsights.length} RAG insights`);
    
    // Step 6: Store RAG insights directly (they're already in final form)
    if (ragInsights.length > 0) {
      try {
        logger.info(`[InsightsEngineV2] Storing ${ragInsights.length} RAG insights in database`);
        
        const ragInsightsToInsert = ragInsights.map(insight => {
          // Classify RAG insight based on relatedMetrics
          const category = classifyRAGInsight(insight.relatedMetrics);
          
          return {
            userId: userId.toString(),
            generatedDate: today,
            title: insight.title,
            body: insight.body,
            action: insight.action || null,
            // Progress tracking fields (from AI generation)
            targetBiomarker: insight.targetBiomarker || null,
            currentValue: insight.currentValue || null,
            targetValue: insight.targetValue || null,
            unit: insight.unit || null,
            // Scoring
            confidenceScore: insight.confidence,
            impactScore: 0.7, // Default impact score for RAG insights
            actionabilityScore: 0.8, // RAG insights are designed to be actionable
            freshnessScore: 0.9, // RAG insights use recent data changes
            overallScore: insight.confidence * 0.85, // Weight by confidence
            evidenceTier: '1' as const, // RAG uses vector search + GPT-4o = highest tier
            primarySources: insight.relatedMetrics,
            category: category as any,
            generatingLayer: 'RAG_holistic' as any, // New layer type for RAG
            details: {
              method: 'RAG_vector_search',
              relatedMetrics: insight.relatedMetrics,
            },
          };
        });
        
        await db.insert(dailyInsights).values(ragInsightsToInsert);
        logger.info(`[InsightsEngineV2] Successfully stored ${ragInsightsToInsert.length} RAG insights`);
      } catch (dbError: any) {
        logger.error(`[InsightsEngineV2] Failed to store RAG insights:`, dbError);
        // Don't throw - continue with Layer D
      }
    }
    
    // Step 7: Keep Layer D for safety (out-of-range biomarkers)
    logger.info('[InsightsEngineV2] Running Layer D (Out-of-Range Biomarkers - Safety Net)');
    const layerDInsights = generateLayerDInsights(userId, healthData);
    
    // Combine remaining candidates (just Layer D now)
    const allCandidates = [
      ...layerDInsights,
    ];
    
    logger.info(`[InsightsEngineV2] Generated ${allCandidates.length} safety-net insight candidates (D:${layerDInsights.length})`);
    
    // Step 8: Apply anti-junk safeguards to Layer D
    logger.info('[InsightsEngineV2] Applying anti-junk safeguards');
    let filteredCandidates = filterRedFreshnessInsights(allCandidates, healthData);
    filteredCandidates = enforceEvidenceTierRequirements(filteredCandidates);
    logger.info(`[InsightsEngineV2] After filters: ${filteredCandidates.length} candidates remain (blocked ${allCandidates.length - filteredCandidates.length})`);
    
    // Step 5: Convert to ranked insights
    const rankedInsights = filteredCandidates.map(convertToRankedInsight);
    
    // Step 6: Select all insights (no daily limit - user wants to see full potential)
    const topInsights = selectTopInsights(rankedInsights, 999, 999);
    
    logger.info(`[InsightsEngineV2] Selected ${topInsights.length} top insights`);
    
    // Step 6.5: User context already fetched earlier for RAG (line 1405)
    logger.info(`[InsightsEngineV2] User context: Age ${userContext.age}, Sex ${userContext.sex}, Body fat ${userContext.bodyComposition.bodyFatPct}%`);
    
    // Step 7: Generate natural language using AI
    const insightPairs: Array<{
      narrative: GeneratedInsight;
      ranked: RankedInsight;
      candidate: InsightCandidate;
    }> = [];
    
    for (let index = 0; index < topInsights.length; index++) {
      const rankedInsight = topInsights[index];
      
      // More robust candidate matching (handles Layer D's comma-joined dependent variables)
      const candidate = filteredCandidates.find(c => {
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
      
      // Extract baseline data for involved variables (from healthData)
      const baselines: BaselineData[] = extractBaselines(candidate.variables, healthData);
      
      // Generate AI-powered insight
      const narrative = await generateInsightNarrative(rankedInsight, candidate, userContext, baselines);
      insightPairs.push({ narrative, ranked: rankedInsight, candidate });
      
      logger.info(`[InsightsEngineV2] Insight ${index + 1}: ${narrative.title}`);
    }
    
    const generatedInsights = insightPairs.map(p => p.narrative);
    
    // Step 8: Store in database
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
        
        // Helper to clamp extreme values for PostgreSQL real type (range: ~1E-37 to ~1E+37)
        const clampScore = (value: number): number => {
          // Clamp to safe range: 0.0001 to 100
          if (!isFinite(value) || value < 0.0001) return 0.0001;
          if (value > 100) return 100;
          return value;
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
            body: `${pair.narrative.summary}\n\n${pair.narrative.details}`,
            action: pair.narrative.actionable || null,
            targetBiomarker: pair.narrative.targetBiomarker || null,
            currentValue: pair.narrative.currentValue ?? null,
            targetValue: pair.narrative.targetValue ?? null,
            unit: pair.narrative.unit || null,
            confidenceScore: clampScore(pair.ranked.confidenceScore),
            impactScore: clampScore(pair.ranked.impactScore),
            actionabilityScore: clampScore(pair.ranked.actionabilityScore),
            freshnessScore: clampScore(pair.ranked.freshnessScore),
            overallScore: clampScore(pair.ranked.rankScore),
            evidenceTier: pair.ranked.evidenceTier,
            primarySources: pair.narrative.primarySources.length > 0 
              ? pair.narrative.primarySources 
              : pair.ranked.variables, // Fallback to variable names if primarySources is empty
            category: (category || 'general') as any, // Defensive fallback to 'general'
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
