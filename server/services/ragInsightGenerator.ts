/**
 * RAG-Based Holistic Insight Generator
 * 
 * Replaces complex pathway system with AI-driven correlation discovery.
 * Uses vector search to find similar patterns in user's historical data.
 */

import { logger } from '../logger';
import { searchSimilarContent } from './embeddingService';
import { getUserContext, type UserContext } from './aiInsightGenerator';
import OpenAI from 'openai';
import { differenceInDays, format } from 'date-fns';

// Use Replit's AI Integrations service for OpenAI access
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface DataChange {
  metric: string;
  previous: number | null;
  current: number | null;
  percentChange: number | null;
  direction: 'increase' | 'decrease' | 'stable';
  unit?: string;
}

export interface RAGInsight {
  title: string;
  body: string;
  action: string;
  confidence: number;
  relatedMetrics: string[];
  // Progress tracking fields (for biomarker-related insights)
  targetBiomarker?: string | null;
  currentValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
}

/**
 * Detect significant changes in user's data
 */
export function detectDataChanges(
  biomarkers: Array<{ name: string; value: number; unit: string; testDate: Date }>,
  dailyMetrics: Array<any>
): DataChange[] {
  const changes: DataChange[] = [];
  
  // Analyze biomarker changes (compare most recent to previous)
  const biomarkersByName = new Map<string, Array<{ value: number; testDate: Date; unit: string }>>();
  
  for (const b of biomarkers) {
    if (!biomarkersByName.has(b.name)) {
      biomarkersByName.set(b.name, []);
    }
    biomarkersByName.get(b.name)!.push({ value: b.value, testDate: b.testDate, unit: b.unit });
  }
  
  // Sort and detect changes
  for (const [name, values] of Array.from(biomarkersByName.entries())) {
    const sorted = values.sort((a: any, b: any) => b.testDate.getTime() - a.testDate.getTime());
    
    if (sorted.length >= 2) {
      const current = sorted[0].value;
      const previous = sorted[1].value;
      const percentChange = previous !== 0 ? ((current - previous) / previous) * 100 : null;
      
      // Only include significant changes (>5%)
      if (percentChange !== null && Math.abs(percentChange) > 5) {
        changes.push({
          metric: name,
          previous,
          current,
          percentChange,
          direction: percentChange > 0 ? 'increase' : 'decrease',
          unit: sorted[0].unit,
        });
      }
    }
  }
  
  // Analyze HealthKit metric changes (last 7 days vs previous 7 days)
  // Relaxed requirement: allow 10+ days with up to 3 nulls per metric
  if (dailyMetrics.length >= 10) {
    const recentWeek = dailyMetrics.slice(0, 7);
    const previousWeek = dailyMetrics.slice(7, Math.min(14, dailyMetrics.length));
    
    // Map to actual database field names (from healthDailyMetrics table via fetchHealthData())
    const metricMappings = [
      { displayName: 'HRV', fieldName: 'hrvSdnnMs', unit: 'ms' },
      { displayName: 'Sleep', fieldName: 'sleepTotalMinutes', unit: 'minutes' },
      { displayName: 'Resting Heart Rate', fieldName: 'restingHr', unit: 'bpm' },
      { displayName: 'Steps', fieldName: 'steps', unit: 'steps' },
      { displayName: 'Active Energy', fieldName: 'activeKcal', unit: 'kcal' },
      { displayName: 'Exercise', fieldName: 'exerciseMinutes', unit: 'minutes' },
      { displayName: 'Body Fat', fieldName: 'bodyFatPct', unit: '%' },
      { displayName: 'Weight', fieldName: 'weightKg', unit: 'kg' },
    ];
    
    for (const mapping of metricMappings) {
      const recentValues = recentWeek.map((m: any) => m[mapping.fieldName]).filter((v: any) => v !== null && v !== undefined && !isNaN(v));
      const previousValues = previousWeek.map((m: any) => m[mapping.fieldName]).filter((v: any) => v !== null && v !== undefined && !isNaN(v));
      
      // Allow metrics with at least 4 valid data points per week (tolerates 3 nulls)
      if (recentValues.length >= 4 && previousValues.length >= 4) {
        const recentAvg = average(recentValues);
        const previousAvg = average(previousValues);
        
        if (recentAvg !== null && previousAvg !== null && previousAvg !== 0) {
          const percentChange = ((recentAvg - previousAvg) / previousAvg) * 100;
          
          // Only include significant changes (>10% for HealthKit metrics)
          if (Math.abs(percentChange) > 10) {
            changes.push({
              metric: mapping.displayName,
              previous: previousAvg,
              current: recentAvg,
              percentChange,
              direction: percentChange > 0 ? 'increase' : 'decrease',
              unit: mapping.unit,
            });
          }
        }
      }
    }
  }
  
  logger.info(`[RAG] Detected ${changes.length} significant data changes`);
  return changes;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Workout session interface
interface WorkoutSession {
  workoutType: string;
  startDate: Date;
  duration: number;
  totalDistance: number | null;
  totalEnergyBurned: number | null;
  averageHeartRate: number | null;
}

// Daily metrics interface
interface DailyMetric {
  date: string;
  steps: number | null;
  exerciseMinutes: number | null;
  activeKcal: number | null;
  standHours: number | null;
  distanceMeters: number | null;
  sleepTotalMinutes: number | null;
  hrvSdnnMs: number | null;
  restingHr: number | null;
  [key: string]: any;
}

/**
 * Computed activity baselines for post-processing insights
 */
export interface ActivityBaselines {
  steps: {
    current7DayAvg: number | null;
    baseline30Day: number | null;
    percentBelowBaseline: number | null;
    suggestedTarget: number | null;
  };
  workouts: {
    thisWeekCount: number;
    weeklyAverage: number;
    isBelowAverage: boolean;
    suggestedTarget: number | null;
  };
  exerciseMinutes: {
    weeklyTotal: number | null;
    dailyAverage: number | null;
  };
}

/**
 * Get CDC/WHO recommended daily step target based on age
 * Sources: 
 * - Adults 18-64: 8,000-10,000 steps/day (CDC recommends ~8,000 for significant health benefits)
 * - Adults 65+: 6,000-8,000 steps/day (lower targets due to mobility considerations)
 * - Children/teens: Higher activity needs but less common in this app
 */
function getDemographicStepTarget(age: number | null, sex: 'Male' | 'Female' | 'Other' | null): number {
  // Default to adult recommendation if age unknown
  if (!age || age < 18) {
    return 8000; // Default adult target
  }
  
  if (age >= 65) {
    // Seniors: 6,000-8,000 steps, target 7,000
    return 7000;
  } else if (age >= 50) {
    // Middle-aged adults: target 8,000
    return 8000;
  } else {
    // Young adults 18-49: target 10,000 (optimal)
    return 10000;
  }
}

/**
 * Compute activity baselines for progress tracking
 */
function computeActivityBaselines(
  dailyMetrics: DailyMetric[], 
  workouts: WorkoutSession[],
  userContext?: { age: number | null; sex: 'Male' | 'Female' | 'Other' | null }
): ActivityBaselines {
  const baselines: ActivityBaselines = {
    steps: {
      current7DayAvg: null,
      baseline30Day: null,
      percentBelowBaseline: null,
      suggestedTarget: null,
    },
    workouts: {
      thisWeekCount: 0,
      weeklyAverage: 0,
      isBelowAverage: false,
      suggestedTarget: null,
    },
    exerciseMinutes: {
      weeklyTotal: null,
      dailyAverage: null,
    },
  };

  // Get demographic-based step target
  const demographicTarget = getDemographicStepTarget(
    userContext?.age ?? null, 
    userContext?.sex ?? null
  );

  // Calculate step baselines
  const stepsData = dailyMetrics.filter(m => m.steps !== null).map(m => ({ date: m.date, value: m.steps! }));
  if (stepsData.length >= 7) {
    const last7Days = stepsData.slice(0, 7);
    const recentAvg = last7Days.reduce((sum, d) => sum + d.value, 0) / last7Days.length;
    baselines.steps.current7DayAvg = Math.round(recentAvg);

    const last30Days = stepsData.slice(0, Math.min(30, stepsData.length));
    const baseline30 = last30Days.reduce((sum, d) => sum + d.value, 0) / last30Days.length;
    baselines.steps.baseline30Day = Math.round(baseline30);

    // Calculate percent below baseline
    if (baseline30 > 0 && isFinite(baseline30)) {
      const percentBelow = ((baseline30 - recentAvg) / baseline30 * 100);
      if (isFinite(percentBelow)) {
        baselines.steps.percentBelowBaseline = percentBelow > 0 ? Math.round(percentBelow * 10) / 10 : 0;
      }
    }
    
    // Set target based on demographic recommendations and current performance
    // Use the higher of: demographic recommendation or user's personal baseline
    // This ensures:
    // - Users below CDC guidelines are pushed toward health recommendations
    // - High-performing users maintain their established level
    const targetBaseline = Math.max(demographicTarget, Math.round(baseline30));
    
    // Target is always the full goal (not intermediate) - shows users what they should aim for
    // The insight text will provide context about achievable steps to reach the target
    baselines.steps.suggestedTarget = targetBaseline;
    
    logger.info(`[RAG] Step target calculation: current=${Math.round(recentAvg)}, baseline30=${Math.round(baseline30)}, demographic=${demographicTarget}, suggested=${baselines.steps.suggestedTarget}`);
  }

  // Calculate workout baselines
  const now = new Date();
  const thisWeek = workouts.filter(w => {
    const daysDiff = Math.floor((now.getTime() - new Date(w.startDate).getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff < 7;
  });
  const last4Weeks = workouts.filter(w => {
    const daysDiff = Math.floor((now.getTime() - new Date(w.startDate).getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff < 28;
  });

  baselines.workouts.thisWeekCount = thisWeek.length;
  baselines.workouts.weeklyAverage = last4Weeks.length / 4;
  
  // Check if below average and always set a target for tracking
  if (baselines.workouts.weeklyAverage >= 1) {
    baselines.workouts.suggestedTarget = Math.max(1, Math.round(baselines.workouts.weeklyAverage));
    if (thisWeek.length < baselines.workouts.weeklyAverage * 0.6 && baselines.workouts.weeklyAverage >= 2) {
      baselines.workouts.isBelowAverage = true;
    }
  }

  // Calculate exercise minutes
  const exerciseData = dailyMetrics.filter(m => m.exerciseMinutes !== null).map(m => m.exerciseMinutes!);
  if (exerciseData.length >= 7) {
    const last7Days = exerciseData.slice(0, 7);
    baselines.exerciseMinutes.weeklyTotal = Math.round(last7Days.reduce((sum, v) => sum + v, 0));
    baselines.exerciseMinutes.dailyAverage = Math.round(baselines.exerciseMinutes.weeklyTotal / 7);
  }

  logger.info('[RAG] Computed activity baselines:', {
    steps: baselines.steps,
    workouts: baselines.workouts,
  });

  return baselines;
}

/**
 * Check if text contains word with word boundary (avoid partial matches like "improvement" matching "movement")
 */
function containsWord(text: string, word: string): boolean {
  const regex = new RegExp(`\\b${word}\\b`, 'i');
  return regex.test(text);
}

/**
 * Post-process activity insights to inject computed baseline values
 */
function injectActivityTrackingFields(insights: RAGInsight[], baselines: ActivityBaselines): RAGInsight[] {
  return insights.map(insight => {
    const titleLower = insight.title.toLowerCase();
    const bodyLower = insight.body.toLowerCase();
    const actionLower = insight.action.toLowerCase();
    const combined = titleLower + ' ' + bodyLower + ' ' + actionLower;
    
    // Check if this is a steps-related insight (use word boundaries to avoid false matches)
    const stepKeywords = ['step', 'steps', 'walking', 'walk', 'daily activity', '10,000', '10000'];
    const isStepsInsight = stepKeywords.some(kw => containsWord(combined, kw));
    
    // Check if this is a workout-related insight (use word boundaries)
    // Expanded list to catch common exercise terminology GPT might use
    const workoutKeywords = [
      'workout', 'workouts', 
      'exercise session', 'exercise sessions',
      'training session', 'training sessions', 'training',
      'gym', 'fitness',
      'cardio', 'cardiovascular',
      'strength training', 'strength session', 'weight training', 'weights',
      'running', 'run', 'jog', 'jogging',
      'cycling', 'bike', 'biking', 'peloton',
      'swimming', 'swim',
      'yoga', 'pilates',
      'hiit', 'crossfit',
      'aerobic', 'aerobics',
      'physical activity'
    ];
    const isWorkoutInsight = workoutKeywords.some(kw => containsWord(combined, kw));
    
    // Inject step tracking if we have data and insight is steps-related
    // Use explicit null/undefined checks to allow zero as valid value
    const hasStepBaselines = baselines.steps.current7DayAvg !== null && 
                             baselines.steps.current7DayAvg !== undefined &&
                             baselines.steps.suggestedTarget !== null && 
                             baselines.steps.suggestedTarget !== undefined;
    
    if (isStepsInsight && hasStepBaselines) {
      // Only inject if GPT didn't already provide valid numeric values
      const hasValidValues = insight.targetBiomarker && 
                             typeof insight.currentValue === 'number' && 
                             typeof insight.targetValue === 'number';
      if (!hasValidValues) {
        logger.info(`[RAG] Injecting step tracking for insight: "${insight.title}" (current: ${baselines.steps.current7DayAvg}, target: ${baselines.steps.suggestedTarget})`);
        return {
          ...insight,
          targetBiomarker: 'Daily Steps',
          currentValue: baselines.steps.current7DayAvg,
          targetValue: baselines.steps.suggestedTarget,
          unit: 'steps/day',
        };
      }
    }
    
    // Inject workout tracking if we have data and insight is workout-related
    // Use explicit null check - thisWeekCount can legitimately be 0
    const hasWorkoutBaselines = baselines.workouts.suggestedTarget !== null && 
                                baselines.workouts.suggestedTarget !== undefined;
    
    if (isWorkoutInsight && hasWorkoutBaselines) {
      const hasValidValues = insight.targetBiomarker && 
                             typeof insight.currentValue === 'number' && 
                             typeof insight.targetValue === 'number';
      if (!hasValidValues) {
        logger.info(`[RAG] Injecting workout tracking for insight: "${insight.title}" (current: ${baselines.workouts.thisWeekCount}, target: ${baselines.workouts.suggestedTarget})`);
        return {
          ...insight,
          targetBiomarker: 'Weekly Workouts',
          currentValue: baselines.workouts.thisWeekCount,
          targetValue: baselines.workouts.suggestedTarget,
          unit: 'workouts/week',
        };
      }
    }
    
    return insight;
  });
}

/**
 * Build activity summary for AI prompt
 */
function buildActivitySummary(dailyMetrics: DailyMetric[], workouts: WorkoutSession[]): string {
  if (dailyMetrics.length === 0 && workouts.length === 0) {
    return 'No activity data available';
  }
  
  const sections: string[] = [];
  
  // Calculate step statistics
  const stepsData = dailyMetrics.filter(m => m.steps !== null).map(m => ({ date: m.date, value: m.steps! }));
  if (stepsData.length >= 7) {
    const last7Days = stepsData.slice(0, 7);
    const previous7Days = stepsData.slice(7, 14);
    
    const recentAvg = last7Days.reduce((sum, d) => sum + d.value, 0) / last7Days.length;
    const prevAvg = previous7Days.length > 0 ? previous7Days.reduce((sum, d) => sum + d.value, 0) / previous7Days.length : null;
    
    // Find 30-day and 90-day baselines
    const last30Days = stepsData.slice(0, Math.min(30, stepsData.length));
    const baseline30 = last30Days.reduce((sum, d) => sum + d.value, 0) / last30Days.length;
    
    sections.push(`### Daily Steps (Last 7 Days)`);
    sections.push(`- Recent 7-day average: ${Math.round(recentAvg).toLocaleString()} steps/day`);
    if (prevAvg && prevAvg > 0) {
      const change = ((recentAvg - prevAvg) / prevAvg * 100);
      if (isFinite(change)) {
        sections.push(`- Previous 7-day average: ${Math.round(prevAvg).toLocaleString()} steps/day`);
        sections.push(`- Week-over-week change: ${change > 0 ? '+' : ''}${change.toFixed(1)}%`);
      }
    }
    sections.push(`- 30-day baseline: ${Math.round(baseline30).toLocaleString()} steps/day`);
    
    // Flag if below baseline (guard against zero baseline)
    if (baseline30 > 0) {
      const percentBelowBaseline = ((baseline30 - recentAvg) / baseline30 * 100);
      if (percentBelowBaseline > 15 && isFinite(percentBelowBaseline)) {
        sections.push(`- ⚠️ ACTIVITY DROP: Current week is ${percentBelowBaseline.toFixed(0)}% BELOW your typical baseline`);
      }
    }
    
    // Show daily breakdown
    sections.push(`\nDaily breakdown (newest first):`);
    last7Days.slice(0, 7).forEach(d => {
      // Guard against zero baseline for status calculation
      const status = baseline30 > 0 
        ? (d.value < baseline30 * 0.7 ? '🔴 Low' : d.value > baseline30 * 1.2 ? '🟢 High' : '⚪ Normal')
        : '⚪ Normal';
      sections.push(`  - ${d.date}: ${d.value.toLocaleString()} steps ${status}`);
    });
  }
  
  // Workout frequency analysis
  if (workouts.length > 0) {
    sections.push(`\n### Workout Sessions (Last 90 Days: ${workouts.length} total)`);
    
    // Group by week
    const now = new Date();
    const thisWeek = workouts.filter(w => {
      const daysDiff = Math.floor((now.getTime() - new Date(w.startDate).getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff < 7;
    });
    const lastWeek = workouts.filter(w => {
      const daysDiff = Math.floor((now.getTime() - new Date(w.startDate).getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 7 && daysDiff < 14;
    });
    const last4Weeks = workouts.filter(w => {
      const daysDiff = Math.floor((now.getTime() - new Date(w.startDate).getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff < 28;
    });
    
    // Calculate weekly average from last 4 weeks
    const weeklyAvg = last4Weeks.length / 4;
    
    sections.push(`- This week: ${thisWeek.length} workouts`);
    sections.push(`- Last week: ${lastWeek.length} workouts`);
    sections.push(`- 4-week average: ${weeklyAvg.toFixed(1)} workouts/week`);
    
    // Flag if below typical
    if (thisWeek.length < weeklyAvg * 0.6 && weeklyAvg >= 2) {
      sections.push(`- ⚠️ WORKOUT DROP: This week is below your typical ${weeklyAvg.toFixed(1)} workouts/week`);
    }
    
    // Workout type breakdown
    const typeCount = new Map<string, number>();
    workouts.forEach(w => {
      typeCount.set(w.workoutType, (typeCount.get(w.workoutType) || 0) + 1);
    });
    sections.push(`\nWorkout types (last 90 days):`);
    Array.from(typeCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([type, count]) => {
        sections.push(`  - ${type}: ${count} sessions`);
      });
    
    // Recent workouts
    sections.push(`\nRecent workouts:`);
    workouts.slice(0, 5).forEach(w => {
      const date = new Date(w.startDate).toISOString().split('T')[0];
      sections.push(`  - ${date}: ${w.workoutType} (${Math.round(w.duration)} min${w.totalEnergyBurned ? `, ${Math.round(w.totalEnergyBurned)} kcal` : ''})`);
    });
  }
  
  // Exercise minutes trend
  const exerciseData = dailyMetrics.filter(m => m.exerciseMinutes !== null).map(m => ({ date: m.date, value: m.exerciseMinutes! }));
  if (exerciseData.length >= 7) {
    const last7Days = exerciseData.slice(0, 7);
    const recentTotal = last7Days.reduce((sum, d) => sum + d.value, 0);
    sections.push(`\n### Exercise Minutes This Week: ${Math.round(recentTotal)} minutes`);
  }
  
  return sections.join('\n');
}

/**
 * Generate holistic insights using RAG (vector search + GPT-4o)
 */
export async function generateRAGInsights(
  userId: string,
  changes: DataChange[],
  biomarkers: Array<{ name: string; value: number; unit: string; testDate: Date; isAbnormal: boolean }>,
  userContext: UserContext,
  availableBiomarkers: Array<{ id: string; name: string; unitCanonical: string }> = [],
  dailyMetrics: DailyMetric[] = [],
  workouts: WorkoutSession[] = []
): Promise<RAGInsight[]> {
  
  // Even if no biomarker changes, we should still analyze activity patterns
  const hasActivityData = dailyMetrics.length > 0 || workouts.length > 0;
  
  if (changes.length === 0 && !hasActivityData) {
    logger.info('[RAG] No significant changes and no activity data, skipping insight generation');
    return [];
  }
  
  // Build summary of current changes for vector search
  const changeSummary = changes.map(c => 
    `${c.metric} ${c.direction === 'increase' ? 'increased' : 'decreased'} by ${Math.abs(c.percentChange || 0).toFixed(1)}%`
  ).join(', ');
  
  logger.info(`[RAG] Searching for similar patterns: ${changeSummary}`);
  
  // Search for similar patterns in user's historical data
  const similarPatterns = await searchSimilarContent(
    userId,
    changeSummary,
    10 // Get top 10 similar patterns
  );
  
  logger.info(`[RAG] Found ${similarPatterns.length} similar historical patterns`);
  
  // Build context from retrieved patterns
  const historicalContext = similarPatterns.length > 0
    ? similarPatterns.map(p => `- ${p.content} (${(p.similarity * 100).toFixed(0)}% similar)`).join('\n')
    : 'No similar historical patterns found';
  
  // Build current state summary
  const currentStateSummary = buildCurrentStateSummary(changes, biomarkers, userContext);
  
  // Build available biomarkers list for AI prompt
  const biomarkerNamesSection = availableBiomarkers.length > 0
    ? `## Available Biomarkers (Use EXACT Names Only)
When specifying targetBiomarker, you MUST use the exact name from this list:
${availableBiomarkers.map(b => `- "${b.name}" (canonical unit: ${b.unitCanonical})`).join('\n')}

DO NOT use abbreviations or variations. Match these names EXACTLY.`
    : '';

  // Build activity summary for AI
  const activitySummary = buildActivitySummary(dailyMetrics, workouts);
  
  // Generate insights using GPT-4o with retrieved context
  const prompt = `You are a health insights AI analyzing a user's recent health data changes.

## User Profile
${buildUserProfileSummary(userContext)}

## Recent Changes (Last 7-14 Days)
${changes.length > 0 ? changes.map(c => `- ${c.metric}: ${c.previous?.toFixed(1)}${c.unit || ''} → ${c.current?.toFixed(1)}${c.unit || ''} (${c.percentChange! > 0 ? '+' : ''}${c.percentChange?.toFixed(1)}%)`).join('\n') : 'No significant metric changes detected'}

## Historical Patterns (Vector Search Results)
${historicalContext}

## Current Biomarker Status
${biomarkers.slice(0, 10).map(b => `- ${b.name}: ${b.value} ${b.unit}${b.isAbnormal ? ' ⚠️ OUT OF RANGE' : ''}`).join('\n') || 'No biomarker data available'}

## Activity & Workout Data (IMPORTANT - Analyze This!)
${activitySummary}

${biomarkerNamesSection}

## Your Task
Generate up to 20 holistic health insights that provide comprehensive coverage across ALL categories:
1. **BIOMARKERS**: Analyze blood work patterns and lab correlations (iron, ferritin, hormones, metabolic markers, etc.)
2. **SLEEP**: Identify sleep quality patterns and trends (total duration, deep sleep %, REM %, sleep efficiency, consistency trends over time)
3. **RECOVERY**: Analyze HRV trends, resting heart rate patterns, and correlations between recovery metrics and other data
4. **ACTIVITY** (HIGH PRIORITY): Examine steps, workouts, exercise minutes, and physical performance

## ACTIVITY INSIGHTS (CRITICAL - MUST GENERATE THESE)
Look at the Activity & Workout Data section above and generate personalized activity insights:

### When Activity is BELOW User's Baseline:
- If steps are below their 30-day baseline, generate an insight with a PERSONALIZED step target
- If workout frequency is below their typical weekly average, encourage them to get back on track
- Set achievable targets based on THEIR history, not generic 10K step goals
- Example: If user averages 6,000 steps but is at 4,000 this week, target 5,500 (not 10,000)

### Workout Frequency Goals:
- If user typically does 3+ workouts/week but is behind, remind them
- Combine steps + workouts for holistic activity insights
- Example: "You've done 1 workout this week vs your usual 3. Try a 30-min session today."

### Activity Correlations:
- Link activity to other metrics (e.g., "Your HRV is 15% higher on days you hit 6K+ steps")
- Show how activity impacts sleep, recovery, energy

For each insight:
- **Compare current activity to USER'S OWN baseline** - personalized, not generic targets
- **Identify cross-domain patterns** (e.g., "low steps + poor sleep + declining HRV")
- **Look at TRENDS over time**, not just recent values
- **Provide achievable, personalized targets** based on their history
- **Explain WHY activity matters** with physiological mechanisms

IMPORTANT: Generate insights for ALL 4 categories. Prioritize:
- Activity pattern drops (⚠️ ACTIVITY DROP or ⚠️ WORKOUT DROP flags in data)
- Personalized step/workout targets when below baseline
- Sleep trends and quality patterns
- HRV correlations with activity and sleep

## CRITICAL SAFETY RULES
1. NO supplement dosages (e.g., "take 5000 IU vitamin D")
2. NO weight loss recommendations for underweight/lean users
3. NO medical diagnoses (use "patterns suggest" instead)
4. NO prescription medication recommendations
5. For abnormal labs: "Consult your doctor about this result"

## Output Format (JSON Array)
[
  {
    "title": "Short punchy headline (5-8 words)",
    "body": "2-3 sentences: What changed, why it matters physiologically, good/bad interpretation",
    "action": "Specific, safe recommendation with HOW to do it. For activity insights, include a SPECIFIC TARGET (e.g., 'Aim for 5,500 steps today' or 'Complete 2 more workouts this week')",
    "confidence": 0.85,
    "relatedMetrics": ["metric1", "metric2", "metric3"],
    "targetBiomarker": "Biomarker name (e.g., 'Vitamin D', 'Ferritin') or null if not a biomarker insight",
    "currentValue": 28.5 (numeric current value from recent data or null if not applicable),
    "targetValue": 50 (numeric age/sex-specific optimal target or null if not applicable),
    "unit": "ng/mL" (unit string or null if not applicable)
  }
]

IMPORTANT: For biomarker-related insights, ALWAYS include progress tracking:
- **targetBiomarker**: Use the EXACT name from the "Available Biomarkers" list above. Do NOT use abbreviations (e.g., use "Low Density Lipoprotein Cholesterol" not "LDL-C"). If not a biomarker insight, set to null.
- **currentValue**: Current measured value (numeric)
- **targetValue**: Age/sex-specific optimal target for this ${userContext.age || 'unknown'}yo ${userContext.sex || 'unknown'} user
- **unit**: Use the canonical unit from the "Available Biomarkers" list (e.g., "ng/mL", "g/dL", "%")

For activity insights (steps, workouts), you can set:
- **currentValue**: Current steps/workout count this week
- **targetValue**: Personalized target based on user's baseline
- **unit**: "steps" or "workouts/week"

For other non-biomarker insights (sleep, HRV patterns), set these to null.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a health insights AI. Generate personalized, evidence-based, safe recommendations in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const insights: RAGInsight[] = Array.isArray(parsed.insights) ? parsed.insights : [parsed];
    
    logger.info(`[RAG] Generated ${insights.length} holistic insights`);
    
    // Post-process activity insights to inject baseline tracking values
    // Pass userContext for demographic-based step targets
    const activityBaselines = computeActivityBaselines(dailyMetrics, workouts, {
      age: userContext.age,
      sex: userContext.sex
    });
    const enhancedInsights = injectActivityTrackingFields(insights, activityBaselines);
    
    return enhancedInsights;
    
  } catch (error: any) {
    logger.error('[RAG] Failed to generate insights:', error);
    return [];
  }
}

function buildCurrentStateSummary(changes: DataChange[], biomarkers: Array<any>, userContext: UserContext): string {
  return `Recent changes: ${changes.map(c => c.metric).join(', ')}. ${biomarkers.length} biomarkers tracked.`;
}

function buildUserProfileSummary(userContext: UserContext): string {
  const parts: string[] = [];
  
  if (userContext.age) parts.push(`${userContext.age} years old`);
  if (userContext.sex) parts.push(userContext.sex);
  if (userContext.bodyComposition.bodyFatPct) {
    parts.push(`${userContext.bodyComposition.bodyFatPct.toFixed(1)}% body fat`);
  }
  if (userContext.bodyComposition.weightKg) {
    parts.push(`${userContext.bodyComposition.weightKg.toFixed(1)}kg`);
  }
  
  let summary = parts.length > 0 ? parts.join(', ') : 'Profile incomplete';
  
  // Add health goals if available
  if (userContext.goals && userContext.goals.length > 0) {
    summary += `\n\n**Health Goals:** ${userContext.goals.join(', ')}`;
  }
  
  // Add focus areas if available
  if (userContext.focusAreas && userContext.focusAreas.length > 0) {
    summary += `\n\n**Focus Areas:** ${userContext.focusAreas.join(', ')}`;
  }
  
  // Add medical context if available
  if (userContext.medicalContext) {
    summary += `\n\n**Medical Context:** ${userContext.medicalContext}`;
  }
  
  return summary;
}
