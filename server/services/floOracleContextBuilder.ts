import { db } from '../db';
import { 
  profiles,
  users,
  biomarkerTestSessions,
  biomarkerMeasurements,
  biomarkers,
  diagnosticsStudies, 
  userDailyMetrics,
  flomentumDaily,
  sleepNights,
  insightCards,
  lifeEvents,
  healthkitSamples,
  healthkitWorkouts,
  actionPlanItems,
  floChatMessages,
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { logger } from '../logger';
import { 
  isSupabaseHealthEnabled, 
  getNutritionDailyMetrics as getHealthRouterNutritionMetrics,
  getMindfulnessDailyMetrics as getHealthRouterMindfulnessMetrics,
  getBiomarkerSessions as getHealthRouterBiomarkerSessions,
  getMeasurementsBySession as getHealthRouterMeasurementsBySession,
  getDiagnosticsStudies as getHealthRouterDiagnosticsStudies,
  getSleepNights as getHealthRouterSleepNights,
  getProfile as getHealthRouterProfile,
  getLifeEvents as getHealthRouterLifeEvents,
  getFlomentumDaily as getHealthRouterFlomentumDaily,
  getHealthkitWorkouts as getHealthRouterWorkouts,
  getInsightCards as getHealthRouterInsightCards,
  getActiveLifeContext,
  getEnvironmentalContext,
  getRecoverySessions as getHealthRouterRecoverySessions,
  getDailyThermalRecoveryScore,
  type EnvironmentalContext,
  getBodyFatCorrectionPct,
  applyBodyFatCorrection,
} from './healthStorageRouter';
import { 
  getDailyMetrics as getSupabaseDailyMetrics, 
  getActionPlanItems as getSupabaseActionPlanItems,
  getPendingBiomarkerFollowups,
  type BiomarkerFollowup,
} from './supabaseHealthStorage';
import { behaviorAttributionEngine } from './behaviorAttributionEngine';
import { supabaseBaselineEngine } from './supabaseBaselineEngine';
import { getHealthId as getSupabaseHealthId } from './supabaseHealthStorage';

// In-memory cache for user health context (5 minute TTL)
interface CachedContext {
  context: string;
  timestamp: number;
}

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Export cache clearing function for debugging
export function clearContextCache(userId?: string) {
  if (userId) {
    contextCache.delete(userId);
    logger.info(`[FloOracle] Cleared context cache for user ${userId}`);
  } else {
    contextCache.clear();
    logger.info('[FloOracle] Cleared all context cache');
  }
}

interface UserHealthContext {
  age: number | null;
  sex: string;
  primaryGoals: string[];
  latestBloodPanel: {
    date: string | null;
    apob: string;
    glucose: string;
    hba1c: string;
    hscrp: string;
    testosterone: string;
    [key: string]: string | null;
  };
  latestCAC: {
    score: number | null;
    percentile: string | null;
    date: string | null;
  };
  latestDEXA: {
    visceralFat: number | null;
    leanMass: number | null;
    bodyFat: number | null;
    date: string | null;
  };
  wearableAvg7Days: {
    hrv: number | null;
    sleep: string | null;
    rhr: number | null;
    steps: number | null;
    activeKcal: number | null;
  };
  sleepDetails7Days: {
    avgTotalSleepMin: number | null;
    avgDeepSleepMin: number | null;
    avgRemSleepMin: number | null;
    avgCoreSleepMin: number | null;
    avgEfficiencyPct: number | null;
    avgAwakenings: number | null;
    avgDeepPct: number | null;
    avgRemPct: number | null;
    avgCorePct: number | null;
    avgHrvMs: number | null;
    avgFragmentationIndex: number | null;
    daysWithData: number;
  } | null;
  recentSleepNights: Array<{
    date: string;
    deepSleepMin: number | null;
    remSleepMin: number | null;
    totalSleepMin: number | null;
    deviationFromBaseline: string | null;  // e.g., "+115%" for big jumps
  }> | null;
  recentTrends: {
    hrv: { recent: number | null; avg7d: number | null; change: number | null; direction: 'up' | 'down' | 'stable' | null };
    rhr: { recent: number | null; avg7d: number | null; change: number | null; direction: 'up' | 'down' | 'stable' | null };
    sleepMinutes: { recent: number | null; avg7d: number | null; change: number | null; direction: 'up' | 'down' | 'stable' | null };
    steps: { recent: number | null; avg7d: number | null; change: number | null; direction: 'up' | 'down' | 'stable' | null };
    activeKcal: { recent: number | null; avg7d: number | null; change: number | null; direction: 'up' | 'down' | 'stable' | null };
  } | null;
  healthkitMetrics: {
    weight: number | null;
    height: number | null;
    bmi: number | null;
    bodyFatPct: number | null;
    leanBodyMass: number | null;
    distance: number | null;
    basalEnergy: number | null;
    flightsClimbed: number | null;
    bloodPressureSystolic: number | null;
    bloodPressureDiastolic: number | null;
    oxygenSaturation: number | null;
    respiratoryRate: number | null;
    bloodGlucose: number | null;
    bodyTemp: number | null;
    vo2Max: number | null;
    walkingHR: number | null;
    waistCircumference: number | null;
    dietaryWater: number | null;
    exerciseTime: number | null;
    standTime: number | null;
    avgHeartRate: number | null;
  };
  flomentumCurrent: {
    score: number | null;
    zone: string | null;
    dailyFocus: string | null;
  };
  bodyCompositionExplanation: string | null;
  mindfulnessSummary: {
    totalMinutes: number;
    sessionCount: number;
    avgDailyMinutes: number;
    daysWithPractice: number;
  } | null;
  nutritionSummary: {
    avgDailyCalories: number | null;
    avgDailyProtein: number | null;
    avgDailyCarbs: number | null;
    avgDailyFat: number | null;
    avgDailyFiber: number | null;
    avgDailyCaffeine: number | null;
    avgDailySugar: number | null;
    avgDailySodium: number | null;
    avgDailyCholesterol: number | null;
    daysTracked: number;
  } | null;
  environmentalContext: EnvironmentalContext | null;
  // Supabase 90-day baselines for consistent comparison across all AI features
  supabaseBaselines: {
    sleepDuration: { baseline: number | null; stdDev: number | null };
    deepSleep: { baseline: number | null; stdDev: number | null };
    remSleep: { baseline: number | null; stdDev: number | null };
    hrv: { baseline: number | null; stdDev: number | null };
    rhr: { baseline: number | null; stdDev: number | null };
    steps: { baseline: number | null; stdDev: number | null };
    activeEnergy: { baseline: number | null; stdDev: number | null };
  } | null;
}

// Import age calculation utility that uses mid-year (July 1st) assumption for ±6 month accuracy
import { calculateAgeFromBirthYear } from "@shared/utils/ageCalculation";
import { getMemoriesAsContext, getSuppressedTopicsContext } from './userMemoryService';

// Format a date in the user's local timezone as YYYY-MM-DD
function formatDateInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // Returns YYYY-MM-DD format
  } catch (error) {
    // Fallback to UTC if timezone is invalid
    logger.warn(`[FloOracle] Invalid timezone "${timezone}", falling back to UTC`);
    return date.toISOString().split('T')[0];
  }
}

// Get "today", "yesterday", or day of week for recent dates in user's timezone
function getRelativeDateLabel(date: Date, timezone: string): string {
  try {
    const now = new Date();
    
    // Get today's date in the user's timezone
    const todayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = todayFormatter.format(now);
    const dateStr = todayFormatter.format(date);
    
    // Calculate days difference based on calendar dates
    const todayDate = new Date(todayStr);
    const targetDate = new Date(dateStr);
    const diffDays = Math.floor((todayDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays <= 6) {
      // Get day of week
      const dayFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
      });
      return dayFormatter.format(date);
    }
    return `${diffDays} days ago`;
  } catch (error) {
    return formatDateInTimezone(date, timezone);
  }
}

function formatBiomarkerValue(value: number | null, unit: string = ''): string {
  if (value === null || value === undefined) return 'not recorded';
  return `${value}${unit ? ' ' + unit : ''}`;
}

/**
 * Format pending biomarker follow-ups for Flō Oracle context
 * This tells the AI about scheduled appointments so it doesn't keep repeating concerns
 */
function formatBiomarkerFollowupsContext(followups: BiomarkerFollowup[]): string {
  if (!followups || followups.length === 0) return '';
  
  const lines: string[] = [
    '',
    'SCHEDULED BIOMARKER FOLLOW-UPS (do NOT repeatedly mention these concerns - user is already addressing them):',
  ];
  
  for (const followup of followups) {
    const dateStr = followup.scheduled_date 
      ? new Date(followup.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'date pending';
    
    lines.push(`• ${followup.biomarker_name}: ${followup.action_description} (${dateStr})`);
    
    if (followup.concern_description) {
      lines.push(`  Concern: ${followup.concern_description} - USER IS ALREADY AWARE AND TAKING ACTION`);
    }
  }
  
  lines.push('');
  lines.push('IMPORTANT: Instead of repeating these concerns, you can ask supportively about the upcoming appointment or how they are feeling about it.');
  
  return lines.join('\n');
}

interface BloodPanelHistory {
  date: string;
  biomarkers: Record<string, string>;
}

export async function buildUserHealthContext(userId: string, skipCache: boolean = false): Promise<string> {
  try {
    // Check cache first (unless explicitly skipped)
    if (!skipCache) {
      const cached = contextCache.get(userId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        logger.info(`[FloOracle] Using cached health context for user ${userId}`);
        return cached.context;
      }
    }

    logger.info(`[FloOracle] Building fresh health context for user ${userId}`);

    const context: UserHealthContext = {
      age: null,
      sex: 'unknown',
      primaryGoals: [],
      latestBloodPanel: {
        date: null,
        apob: 'not recorded',
        glucose: 'not recorded',
        hba1c: 'not recorded',
        hscrp: 'not recorded',
        testosterone: 'not recorded',
      },
      latestCAC: {
        score: null,
        percentile: null,
        date: null,
      },
      latestDEXA: {
        visceralFat: null,
        leanMass: null,
        bodyFat: null,
        date: null,
      },
      wearableAvg7Days: {
        hrv: null,
        sleep: null,
        rhr: null,
        steps: null,
        activeKcal: null,
      },
      sleepDetails7Days: null,
      recentSleepNights: null,
      recentTrends: null,
      healthkitMetrics: {
        weight: null,
        height: null,
        bmi: null,
        bodyFatPct: null,
        leanBodyMass: null,
        distance: null,
        basalEnergy: null,
        flightsClimbed: null,
        bloodPressureSystolic: null,
        bloodPressureDiastolic: null,
        oxygenSaturation: null,
        respiratoryRate: null,
        bloodGlucose: null,
        bodyTemp: null,
        vo2Max: null,
        walkingHR: null,
        waistCircumference: null,
        dietaryWater: null,
        exerciseTime: null,
        standTime: null,
        avgHeartRate: null,
      },
      flomentumCurrent: {
        score: null,
        zone: null,
        dailyFocus: null,
      },
      bodyCompositionExplanation: null,
      mindfulnessSummary: null,
      nutritionSummary: null,
      environmentalContext: null,
      supabaseBaselines: null,
    };

    // Fetch user's timezone from users table
    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    // Get user's timezone for proper date formatting (default to America/Los_Angeles)
    const userTimezone = user?.timezone || 'America/Los_Angeles';
    logger.info(`[FloOracle] Using timezone: ${userTimezone} for user ${userId}`);
    
    // Fetch user profile from Supabase via healthStorageRouter
    const userProfile = await getHealthRouterProfile(userId);

    if (userProfile) {
      // Handle both snake_case (Supabase) and camelCase (Neon) field names
      const birthYear = userProfile.birth_year || userProfile.birthYear;
      context.age = calculateAgeFromBirthYear(birthYear);
      context.sex = userProfile.sex || 'unknown';
      context.primaryGoals = Array.isArray(userProfile.goals) ? userProfile.goals : [];
    }

    // Fetch ALL blood panels from the last 12 months (for historical context)
    // Use healthStorageRouter to get sessions from Supabase
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    let allSessions: Array<{ id: string; testDate: Date | string | null }> = [];
    
    try {
      const rawSessions = await getHealthRouterBiomarkerSessions(userId);
      // Filter to last 12 months and sort by date descending, also filter out sessions without id
      allSessions = rawSessions
        .filter(s => {
          if (!s.id) return false;
          const testDate = s.testDate ? new Date(s.testDate) : null;
          return testDate !== null && testDate >= twelveMonthsAgo;
        })
        .map(s => ({ id: s.id!, testDate: s.testDate }))
        .sort((a, b) => {
          const dateA = a.testDate ? new Date(a.testDate).getTime() : 0;
          const dateB = b.testDate ? new Date(b.testDate).getTime() : 0;
          return dateB - dateA;
        });
      logger.info(`[FloOracle] Found ${allSessions.length} biomarker sessions in last 12 months for user ${userId}`);
    } catch (error) {
      logger.error(`[FloOracle] Error fetching biomarker sessions:`, error);
    }

    const bloodPanelHistory: BloodPanelHistory[] = [];

    if (allSessions.length > 0) {
      // Process latest panel for backward compatibility
      const latestSession = allSessions[0];
      const latestTestDate = latestSession.testDate ? new Date(latestSession.testDate) : new Date();
      context.latestBloodPanel.date = formatDateInTimezone(latestTestDate, userTimezone);
      
      // Fetch biomarkers for ALL sessions using healthStorageRouter
      for (const session of allSessions) {
        try {
          const measurements = await getHealthRouterMeasurementsBySession(session.id);
          
          // Get biomarker names from the biomarkers table (reference data in Neon)
          const biomarkerMap: Record<string, string> = {};
          for (const m of measurements) {
            if (m.biomarkerId && m.valueDisplay) {
              // Look up biomarker name from Neon reference table
              const [biomarker] = await db
                .select({ name: biomarkers.name })
                .from(biomarkers)
                .where(eq(biomarkers.id, m.biomarkerId))
                .limit(1);
              
              if (biomarker) {
                biomarkerMap[biomarker.name] = m.valueDisplay;
              }
            }
          }
          
          // Store this panel in history
          if (Object.keys(biomarkerMap).length > 0) {
            const sessionTestDate = session.testDate ? new Date(session.testDate) : new Date();
            bloodPanelHistory.push({
              date: formatDateInTimezone(sessionTestDate, userTimezone),
              biomarkers: biomarkerMap,
            });
          }
          
          // For the LATEST panel, also store in context object for backward compatibility
          if (session.id === latestSession.id) {
            Object.keys(biomarkerMap).forEach((key) => {
              context.latestBloodPanel[key] = biomarkerMap[key];
            });
            
            context.latestBloodPanel.apob = biomarkerMap['ApoB'] || 'not recorded';
            context.latestBloodPanel.glucose = biomarkerMap['Glucose'] || biomarkerMap['Fasting Glucose'] || 'not recorded';
            context.latestBloodPanel.hba1c = biomarkerMap['HbA1c'] || 'not recorded';
            context.latestBloodPanel.hscrp = biomarkerMap['hs-CRP'] || biomarkerMap['CRP'] || 'not recorded';
            context.latestBloodPanel.testosterone = biomarkerMap['Testosterone'] || biomarkerMap['Total Testosterone'] || 'not recorded';
          }
        } catch (error) {
          logger.error(`[FloOracle] Error fetching measurements for session ${session.id}:`, error);
        }
      }
    }

    // Use healthStorageRouter to fetch CAC/DEXA from Supabase
    try {
      const cacStudies = await getHealthRouterDiagnosticsStudies(userId, 'coronary_calcium_score');
      if (cacStudies.length > 0) {
        const cac = cacStudies[0];
        const payload = cac.aiPayload as Record<string, any> || {};
        context.latestCAC.score = cac.totalScoreNumeric ?? payload.cacScore ?? null;
        context.latestCAC.percentile = cac.agePercentile?.toString() ?? payload.percentile ?? null;
        context.latestCAC.date = cac.studyDate ? formatDateInTimezone(new Date(cac.studyDate), userTimezone) : null;
      }
    } catch (error) {
      logger.error('[FloOracle] Error fetching CAC from Supabase:', error);
    }

    try {
      const dexaStudies = await getHealthRouterDiagnosticsStudies(userId, 'dexa_scan');
      if (dexaStudies.length > 0) {
        const dexa = dexaStudies[0];
        const payload = dexa.aiPayload as Record<string, any> || {};
        context.latestDEXA.visceralFat = payload.visceralFatMass ?? null;
        context.latestDEXA.leanMass = payload.totalLeanMass ?? null;
        context.latestDEXA.bodyFat = payload.totalBodyFat ?? null;
        context.latestDEXA.date = dexa.studyDate ? formatDateInTimezone(new Date(dexa.studyDate), userTimezone) : null;
      }
    } catch (error) {
      logger.error('[FloOracle] Error fetching DEXA from Supabase:', error);
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = formatDateInTimezone(sevenDaysAgo, userTimezone);

    // Fetch 90-day baselines from Supabase for consistent comparison across all AI features
    try {
      const healthId = await getSupabaseHealthId(userId);
      if (healthId) {
        const { getSupabaseClient } = await import('./supabaseClient');
        const sb = getSupabaseClient();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const avg = (vals: (number | null | undefined)[]) => {
          const valid = vals.filter((v): v is number => v != null && !isNaN(v));
          return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
        };
        const std = (vals: (number | null | undefined)[], mean: number | null) => {
          if (mean == null) return null;
          const valid = vals.filter((v): v is number => v != null && !isNaN(v));
          if (valid.length < 2) return null;
          const variance = valid.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / valid.length;
          return Math.sqrt(variance);
        };

        const { data: sleepRows } = await sb.from('sleep_nights')
          .select('hrv_ms, resting_hr_bpm, total_sleep_min, deep_sleep_min, rem_sleep_min')
          .eq('health_id', healthId).gte('sleep_date', cutoffStr).gt('total_sleep_min', 180);
        const { data: actRows } = await sb.from('user_daily_metrics')
          .select('steps_raw_sum, steps_normalized, active_energy_kcal')
          .eq('health_id', healthId).gte('local_date', cutoffStr);

        const mk = (vals: (number | null | undefined)[]) => {
          const m = avg(vals);
          return { baseline: m, stdDev: std(vals, m) };
        };
        const stepsVals = (actRows ?? []).map(r =>
          r.steps_raw_sum != null && r.steps_raw_sum > 0 ? r.steps_raw_sum : r.steps_normalized
        );
        context.supabaseBaselines = {
          sleepDuration: mk((sleepRows ?? []).map(r => r.total_sleep_min)),
          deepSleep: mk((sleepRows ?? []).map(r => r.deep_sleep_min)),
          remSleep: mk((sleepRows ?? []).map(r => r.rem_sleep_min)),
          hrv: mk((sleepRows ?? []).map(r => r.hrv_ms)),
          rhr: mk((sleepRows ?? []).map(r => r.resting_hr_bpm)),
          steps: mk(stepsVals),
          activeEnergy: mk((actRows ?? []).map(r => r.active_energy_kcal)),
        };
        logger.info(`[FloOracle] Fetched 90-day Supabase baselines for ${healthId}`);
      }
    } catch (error) {
      logger.error('[FloOracle] Error fetching Supabase baselines:', error);
    }

    // Check if Supabase is enabled for routing wearable data
    const supabaseEnabled = isSupabaseHealthEnabled();
    logger.info(`[FloOracle] Supabase health enabled: ${supabaseEnabled}`);

    // Fetch sleep data from sleepNights via router (routes to Supabase) - fetch 10 days for trend analysis
    // Define extended type to include all sleep components
    interface SleepNightExtended {
      sleepDate?: string;
      totalSleepMin?: number | null;
      deepSleepMin?: number | null;
      remSleepMin?: number | null;
      coreSleepMin?: number | null;
      sleepEfficiencyPct?: number | null;
      numAwakenings?: number | null;
      deepPct?: number | null;
      remPct?: number | null;
      corePct?: number | null;
      hrvMs?: number | null;
      fragmentationIndex?: number | null;
      wasoMin?: number | null;
      sleepLatencyMin?: number | null;
      bedtimeLocal?: string | null;
      waketimeLocal?: string | null;
    }
    let sleepNightsData: SleepNightExtended[] = [];
    try {
      sleepNightsData = await getHealthRouterSleepNights(userId, 10) as SleepNightExtended[];
      if (sleepNightsData.length > 0) {
        // Calculate 7-day average for sleep (take first 7 days since data is already DESC ordered)
        const sleepFor7Days = sleepNightsData.slice(0, 7);
        const totalSleepMins = sleepFor7Days
          .filter(s => s.totalSleepMin != null)
          .map(s => s.totalSleepMin as number);
        if (totalSleepMins.length > 0) {
          const avgSleep = totalSleepMins.reduce((a, b) => a + b, 0) / totalSleepMins.length;
          const hours = Math.floor(avgSleep / 60);
          const mins = Math.round(avgSleep % 60);
          context.wearableAvg7Days.sleep = `${hours}h${mins}m`;
        }
        
        // Calculate detailed sleep component averages for AI context
        const avgSleepMetric = (key: keyof SleepNightExtended): number | null => {
          const values = sleepFor7Days
            .map(s => s[key] as number | null | undefined)
            .filter((v): v is number => v != null && !isNaN(v));
          return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
        };
        
        // Use explicit !== null checks to preserve legitimate 0 values (e.g., 0 awakenings)
        const totalSleep = avgSleepMetric('totalSleepMin');
        const deepSleep = avgSleepMetric('deepSleepMin');
        const remSleep = avgSleepMetric('remSleepMin');
        const coreSleep = avgSleepMetric('coreSleepMin');
        const efficiency = avgSleepMetric('sleepEfficiencyPct');
        const awakenings = avgSleepMetric('numAwakenings');
        const deepPct = avgSleepMetric('deepPct');
        const remPct = avgSleepMetric('remPct');
        const corePct = avgSleepMetric('corePct');
        const hrvMs = avgSleepMetric('hrvMs');
        const fragIndex = avgSleepMetric('fragmentationIndex');
        
        context.sleepDetails7Days = {
          avgTotalSleepMin: totalSleep !== null ? Math.round(totalSleep) : null,
          avgDeepSleepMin: deepSleep !== null ? Math.round(deepSleep) : null,
          avgRemSleepMin: remSleep !== null ? Math.round(remSleep) : null,
          avgCoreSleepMin: coreSleep !== null ? Math.round(coreSleep) : null,
          avgEfficiencyPct: efficiency !== null ? Math.round(efficiency * 10) / 10 : null,
          avgAwakenings: awakenings !== null ? Math.round(awakenings * 10) / 10 : null,
          avgDeepPct: deepPct !== null ? Math.round(deepPct * 10) / 10 : null,
          avgRemPct: remPct !== null ? Math.round(remPct * 10) / 10 : null,
          avgCorePct: corePct !== null ? Math.round(corePct * 10) / 10 : null,
          avgHrvMs: hrvMs !== null ? Math.round(hrvMs) : null,
          avgFragmentationIndex: fragIndex !== null ? Math.round(fragIndex * 100) / 100 : null,
          daysWithData: sleepFor7Days.filter(s => s.totalSleepMin != null).length,
        };
        
        // Build individual night breakdown for the last 5 nights (for Oracle to spot outliers)
        // IMPORTANT: Use ClickHouse 90-day baselines if available (same as Health Alerts)
        // Fall back to 7-day average only if ClickHouse baselines aren't available
        const clickhouseDeepBaseline = context.supabaseBaselines?.deepSleep?.baseline;
        const clickhouseSleepDurationBaseline = context.supabaseBaselines?.sleepDuration?.baseline;
        const avgDeepForDeviation = clickhouseDeepBaseline ?? deepSleep ?? 0;
        const avgTotalSleepForDeviation = clickhouseSleepDurationBaseline ?? totalSleep ?? 0;
        const isUsingClickhouseBaseline = clickhouseDeepBaseline != null || clickhouseSleepDurationBaseline != null;
        
        context.recentSleepNights = sleepNightsData.slice(0, 5).map(night => {
          const nightDeep = night.deepSleepMin ?? null;
          const nightTotal = night.totalSleepMin ?? null;
          let deviationStr: string | null = null;
          
          // Calculate deviation from 90-day baseline (ClickHouse) or 7-day average (fallback)
          // Prefer total sleep duration for deviation as it's more meaningful
          if (nightTotal !== null && avgTotalSleepForDeviation > 0) {
            const deviation = ((nightTotal - avgTotalSleepForDeviation) / avgTotalSleepForDeviation) * 100;
            if (Math.abs(deviation) >= 15) {
              // Flag significant deviations (±15% or more for 90-day baseline)
              const baselineLabel = isUsingClickhouseBaseline ? '90d baseline' : '7d avg';
              deviationStr = deviation > 0 ? `+${Math.round(deviation)}% vs ${baselineLabel}` : `${Math.round(deviation)}% vs ${baselineLabel}`;
            }
          } else if (nightDeep !== null && avgDeepForDeviation > 0) {
            // Fallback to deep sleep deviation if total sleep not available
            const deviation = ((nightDeep - avgDeepForDeviation) / avgDeepForDeviation) * 100;
            if (Math.abs(deviation) >= 20) {
              const baselineLabel = isUsingClickhouseBaseline ? '90d baseline' : '7d avg';
              deviationStr = deviation > 0 ? `+${Math.round(deviation)}% vs ${baselineLabel}` : `${Math.round(deviation)}% vs ${baselineLabel}`;
            }
          }
          
          return {
            date: night.sleepDate || 'unknown',
            deepSleepMin: nightDeep !== null ? Math.round(nightDeep * 10) / 10 : null,
            remSleepMin: night.remSleepMin !== null && night.remSleepMin !== undefined ? Math.round(night.remSleepMin * 10) / 10 : null,
            totalSleepMin: night.totalSleepMin !== null && night.totalSleepMin !== undefined ? Math.round(night.totalSleepMin) : null,
            deviationFromBaseline: deviationStr,
          };
        });
        
        logger.info(`[FloOracle] Fetched detailed sleep: ${context.sleepDetails7Days.daysWithData} days, deep=${context.sleepDetails7Days.avgDeepSleepMin}min, rem=${context.sleepDetails7Days.avgRemSleepMin}min, efficiency=${context.sleepDetails7Days.avgEfficiencyPct}%`);
      }
    } catch (error) {
      logger.error('[FloOracle] Error fetching sleep nights from Supabase:', error);
    }

    // Fetch 10 days of daily metrics once - reuse for both 7-day averages and trend calculation
    let extendedMetrics: Awaited<ReturnType<typeof getSupabaseDailyMetrics>> = [];
    
    if (supabaseEnabled) {
      try {
        // Data comes pre-sorted DESC (most recent first) from Supabase
        extendedMetrics = await getSupabaseDailyMetrics(userId, 10);
        
        if (extendedMetrics.length > 0) {
          // Use first 7 days for 7-day averages
          const metricsFor7Days = extendedMetrics.slice(0, 7);
          
          const avgMetricWearable = (key: keyof typeof metricsFor7Days[0]) => {
            const values = metricsFor7Days
              .map(m => m[key] as number | null | undefined)
              .filter((v): v is number => v != null && !isNaN(v));
            return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
          };
          
          context.wearableAvg7Days.hrv = avgMetricWearable('hrv_ms') ? Math.round(avgMetricWearable('hrv_ms')!) : null;
          context.wearableAvg7Days.rhr = avgMetricWearable('resting_hr_bpm') ? Math.round(avgMetricWearable('resting_hr_bpm')!) : null;
          context.wearableAvg7Days.steps = avgMetricWearable('steps_raw_sum') ? Math.round(avgMetricWearable('steps_raw_sum')!) : null;
          context.wearableAvg7Days.activeKcal = avgMetricWearable('active_energy_kcal') ? Math.round(avgMetricWearable('active_energy_kcal')!) : null;
          
          // Also calculate sleep from daily metrics if not already set
          if (!context.wearableAvg7Days.sleep) {
            const avgSleepHours = avgMetricWearable('sleep_hours');
            if (avgSleepHours) {
              const hours = Math.floor(avgSleepHours);
              const mins = Math.round((avgSleepHours - hours) * 60);
              context.wearableAvg7Days.sleep = `${hours}h${mins}m`;
            }
          }
          
          logger.info(`[FloOracle] Fetched wearable averages from Supabase (${metricsFor7Days.length} days) - steps: ${context.wearableAvg7Days.steps}, hrv: ${context.wearableAvg7Days.hrv}`);
        }
      } catch (error) {
        logger.error('[FloOracle] Error fetching Supabase wearable metrics, falling back to Neon:', error);
      }
    }
    
    // Fallback to Neon if Supabase not enabled or didn't populate data
    if (!supabaseEnabled || context.wearableAvg7Days.steps === null) {
      const wearableData = await db
        .select({
          avgHrv: sql<number>`AVG(${userDailyMetrics.hrvMs})`,
          avgRhr: sql<number>`AVG(${userDailyMetrics.restingHrBpm})`,
          avgSteps: sql<number>`AVG(${userDailyMetrics.stepsRawSum})`,
          avgActiveKcal: sql<number>`AVG(${userDailyMetrics.activeEnergyKcal})`,
        })
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            gte(userDailyMetrics.localDate, sevenDaysAgoStr)
          )
        );

      if (wearableData.length > 0 && wearableData[0]) {
        context.wearableAvg7Days.hrv = wearableData[0].avgHrv ? Math.round(wearableData[0].avgHrv) : null;
        context.wearableAvg7Days.rhr = wearableData[0].avgRhr ? Math.round(wearableData[0].avgRhr) : null;
        context.wearableAvg7Days.steps = wearableData[0].avgSteps ? Math.round(wearableData[0].avgSteps) : null;
        context.wearableAvg7Days.activeKcal = wearableData[0].avgActiveKcal ? Math.round(wearableData[0].avgActiveKcal) : null;
      }
    }
    
    // Calculate recent trends (last 48h vs 7-day baseline) for real-time feedback
    // Reuse extendedMetrics from above - data is already DESC ordered (most recent first)
    try {
      if (supabaseEnabled && extendedMetrics.length >= 3) {
        // Recent = first 2 days (most recent), baseline = days 3-9 (older 7-day window)
        const recentDays = extendedMetrics.slice(0, 2);
        const baselineDays = extendedMetrics.slice(2, 9);
        
        const calcTrend = (
          key: string,
          threshold: number = 5
        ): { recent: number | null; avg7d: number | null; change: number | null; direction: 'up' | 'down' | 'stable' | null } => {
          const recentVals = recentDays.map(d => (d as any)[key]).filter((v): v is number => v != null && !isNaN(v));
          const baselineVals = baselineDays.map(d => (d as any)[key]).filter((v): v is number => v != null && !isNaN(v));
          
          // Require at least 1 recent and 2 baseline values for meaningful trend
          if (recentVals.length === 0 || baselineVals.length < 2) {
            return { recent: null, avg7d: null, change: null, direction: null };
          }
          
          const recentAvg = recentVals.reduce((a, b) => a + b, 0) / recentVals.length;
          const baselineAvg = baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length;
          
          // Can't compute meaningful percentage when baseline is 0 or negligible
          if (baselineAvg === 0 || baselineAvg < 0.01) {
            return { recent: Math.round(recentAvg), avg7d: null, change: null, direction: null };
          }
          
          const changePercent = ((recentAvg - baselineAvg) / baselineAvg) * 100;
          
          let direction: 'up' | 'down' | 'stable' = 'stable';
          if (Math.abs(changePercent) >= threshold) {
            direction = changePercent > 0 ? 'up' : 'down';
          }
          
          return {
            recent: Math.round(recentAvg),
            avg7d: Math.round(baselineAvg),
            change: Math.round(changePercent),
            direction,
          };
        };
        
        // Calculate sleep trend from sleepNights data (already DESC ordered from Supabase)
        let sleepTrend: typeof context.recentTrends extends null ? never : typeof context.recentTrends['sleepMinutes'] = { recent: null, avg7d: null, change: null, direction: null };
        if (sleepNightsData.length >= 4) {
          // Data is already DESC ordered - slice directly
          const recentSleep = sleepNightsData.slice(0, 2).map(s => s.totalSleepMin).filter((v): v is number => v != null);
          const baselineSleep = sleepNightsData.slice(2, 9).map(s => s.totalSleepMin).filter((v): v is number => v != null);
          
          // Require at least 1 recent and 2 baseline values for meaningful trend
          if (recentSleep.length > 0 && baselineSleep.length >= 2) {
            const recentAvg = recentSleep.reduce((a, b) => a + b, 0) / recentSleep.length;
            const baselineAvg = baselineSleep.reduce((a, b) => a + b, 0) / baselineSleep.length;
            
            // Can't compute meaningful percentage when baseline is 0 or negligible
            if (baselineAvg > 0) {
              const changePercent = ((recentAvg - baselineAvg) / baselineAvg) * 100;
              
              sleepTrend = {
                recent: Math.round(recentAvg),
                avg7d: Math.round(baselineAvg),
                change: Math.round(changePercent),
                direction: Math.abs(changePercent) >= 5 ? (changePercent > 0 ? 'up' : 'down') : 'stable',
              };
            }
          }
        }
        
        context.recentTrends = {
          hrv: calcTrend('hrv_ms', 10), // 10% threshold for HRV (more volatile)
          rhr: calcTrend('resting_hr_bpm', 5),
          sleepMinutes: sleepTrend,
          steps: calcTrend('steps_raw_sum', 15), // 15% for steps (high daily variance)
          activeKcal: calcTrend('active_energy_kcal', 15),
        };
        
        logger.info(`[FloOracle] Calculated recent trends: HRV ${context.recentTrends.hrv.direction}, RHR ${context.recentTrends.rhr.direction}, Sleep ${context.recentTrends.sleepMinutes.direction}`);
      }
    } catch (error) {
      logger.error('[FloOracle] Error calculating recent trends:', error);
    }
    
    if (supabaseEnabled) {
      // Fetch from Supabase user_daily_metrics (contains blood pressure and other aggregated metrics)
      try {
        const supabaseMetrics = await getSupabaseDailyMetrics(userId, 7);
        
        if (supabaseMetrics.length > 0) {
          // Get latest values for point-in-time metrics (from most recent day)
          const latest = supabaseMetrics[0];
          
          // Calculate averages for metrics that should be averaged over 7 days
          const avgMetric = (key: keyof typeof latest) => {
            const values = supabaseMetrics
              .map(m => m[key] as number | null | undefined)
              .filter((v): v is number => v != null && !isNaN(v));
            return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
          };
          
          // Get body fat correction to apply to raw readings
          const bodyFatCorrectionPct = await getBodyFatCorrectionPct(userId);
          
          context.healthkitMetrics = {
            weight: latest.weight_kg ? Math.round(latest.weight_kg * 10) / 10 : null,
            height: latest.height_cm ? Math.round(latest.height_cm) : null,
            bmi: latest.bmi ? Math.round(latest.bmi * 10) / 10 : null,
            bodyFatPct: applyBodyFatCorrection(latest.body_fat_percent, bodyFatCorrectionPct),
            leanBodyMass: latest.lean_body_mass_kg ? Math.round(latest.lean_body_mass_kg * 10) / 10 : null,
            distance: avgMetric('distance_meters') ? Math.round(avgMetric('distance_meters')!) : null,
            basalEnergy: avgMetric('basal_energy_kcal') ? Math.round(avgMetric('basal_energy_kcal')!) : null,
            flightsClimbed: avgMetric('flights_climbed') ? Math.round(avgMetric('flights_climbed')!) : null,
            bloodPressureSystolic: avgMetric('systolic_bp') ? Math.round(avgMetric('systolic_bp')!) : null,
            bloodPressureDiastolic: avgMetric('diastolic_bp') ? Math.round(avgMetric('diastolic_bp')!) : null,
            oxygenSaturation: avgMetric('oxygen_saturation_pct') ? Math.round(avgMetric('oxygen_saturation_pct')!) : null,
            respiratoryRate: avgMetric('respiratory_rate_bpm') ? Math.round(avgMetric('respiratory_rate_bpm')! * 10) / 10 : null,
            bloodGlucose: avgMetric('blood_glucose_mg_dl') ? Math.round(avgMetric('blood_glucose_mg_dl')!) : null,
            bodyTemp: avgMetric('body_temp_c') ? Math.round(avgMetric('body_temp_c')! * 10) / 10 : null,
            vo2Max: latest.vo2_max ? Math.round(latest.vo2_max * 10) / 10 : null,
            walkingHR: avgMetric('walking_hr_avg_bpm') ? Math.round(avgMetric('walking_hr_avg_bpm')!) : null,
            waistCircumference: latest.waist_circumference_cm ? Math.round(latest.waist_circumference_cm * 10) / 10 : null,
            dietaryWater: avgMetric('dietary_water_ml') ? Math.round(avgMetric('dietary_water_ml')!) : null,
            exerciseTime: avgMetric('exercise_minutes') ? Math.round(avgMetric('exercise_minutes')!) : null,
            standTime: latest.stand_hours ? Math.round(latest.stand_hours) : null,
            avgHeartRate: avgMetric('avg_heart_rate_bpm') ? Math.round(avgMetric('avg_heart_rate_bpm')!) : null,
          };
          
          logger.info(`[FloOracle] Fetched HealthKit metrics from Supabase (${supabaseMetrics.length} days, body fat correction: ${bodyFatCorrectionPct}%)`);
        }
      } catch (error) {
        logger.error('[FloOracle] Error fetching Supabase daily metrics:', error);
      }
    } else {
      // Fallback to Neon healthkit_samples table
      const sevenDaysAgoTimestamp = new Date();
      sevenDaysAgoTimestamp.setDate(sevenDaysAgoTimestamp.getDate() - 7);

      const getMetricAvg = async (dataType: string): Promise<number | null> => {
        const result = await db
          .select({ avgValue: sql<number>`AVG(${healthkitSamples.value})` })
          .from(healthkitSamples)
          .where(
            and(
              eq(healthkitSamples.userId, userId),
              eq(healthkitSamples.dataType, dataType),
              gte(healthkitSamples.startDate, sevenDaysAgoTimestamp)
            )
          );
        return result[0]?.avgValue ?? null;
      };

      const getMetricLatest = async (dataType: string): Promise<number | null> => {
        const result = await db
          .select({ value: healthkitSamples.value })
          .from(healthkitSamples)
          .where(
            and(
              eq(healthkitSamples.userId, userId),
              eq(healthkitSamples.dataType, dataType)
            )
          )
          .orderBy(desc(healthkitSamples.startDate))
          .limit(1);
        return result[0]?.value ?? null;
      };

      const [
        weight, height, bmi, bodyFatPct, leanBodyMass, distance, basalEnergy,
        flightsClimbed, bloodPressureSystolic, bloodPressureDiastolic,
        oxygenSaturation, respiratoryRate, bloodGlucose, bodyTemp,
        vo2Max, walkingHR, waistCircumference, dietaryWater, exerciseTime, standTime
      ] = await Promise.all([
        getMetricLatest('weight'),
        getMetricLatest('height'),
        getMetricLatest('bmi'),
        getMetricLatest('bodyFatPercentage'),
        getMetricLatest('leanBodyMass'),
        getMetricAvg('distance'),
        getMetricAvg('basalEnergyBurned'),
        getMetricAvg('flightsClimbed'),
        getMetricAvg('bloodPressureSystolic'),
        getMetricAvg('bloodPressureDiastolic'),
        getMetricAvg('oxygenSaturation'),
        getMetricAvg('respiratoryRate'),
        getMetricAvg('bloodGlucose'),
        getMetricAvg('bodyTemperature'),
        getMetricLatest('vo2Max'),
        getMetricAvg('walkingHeartRateAverage'),
        getMetricLatest('waistCircumference'),
        getMetricAvg('dietaryWater'),
        getMetricAvg('appleExerciseTime'),
        getMetricAvg('appleStandTime')
      ]);

      const avgHeartRate = await getMetricAvg('heartRate');
      
      // Get body fat correction to apply to raw readings
      const bodyFatCorrectionPct = await getBodyFatCorrectionPct(userId);
      
      context.healthkitMetrics = {
        weight: weight ? Math.round(weight * 10) / 10 : null,
        height: height ? Math.round(height) : null,
        bmi: bmi ? Math.round(bmi * 10) / 10 : null,
        bodyFatPct: applyBodyFatCorrection(bodyFatPct, bodyFatCorrectionPct),
        leanBodyMass: leanBodyMass ? Math.round(leanBodyMass * 10) / 10 : null,
        distance: distance ? Math.round(distance) : null,
        basalEnergy: basalEnergy ? Math.round(basalEnergy) : null,
        flightsClimbed: flightsClimbed ? Math.round(flightsClimbed) : null,
        bloodPressureSystolic: bloodPressureSystolic ? Math.round(bloodPressureSystolic) : null,
        bloodPressureDiastolic: bloodPressureDiastolic ? Math.round(bloodPressureDiastolic) : null,
        oxygenSaturation: oxygenSaturation ? Math.round(oxygenSaturation) : null,
        respiratoryRate: respiratoryRate ? Math.round(respiratoryRate * 10) / 10 : null,
        bloodGlucose: bloodGlucose ? Math.round(bloodGlucose) : null,
        bodyTemp: bodyTemp ? Math.round(bodyTemp * 10) / 10 : null,
        vo2Max: vo2Max ? Math.round(vo2Max * 10) / 10 : null,
        walkingHR: walkingHR ? Math.round(walkingHR) : null,
        waistCircumference: waistCircumference ? Math.round(waistCircumference * 10) / 10 : null,
        dietaryWater: dietaryWater ? Math.round(dietaryWater) : null,
        exerciseTime: exerciseTime ? Math.round(exerciseTime) : null,
        standTime: standTime ? Math.round(standTime) : null,
        avgHeartRate: avgHeartRate ? Math.round(avgHeartRate) : null,
      };
    }
    
    // Log what metrics we actually found
    const nonNullMetrics = Object.entries(context.healthkitMetrics)
      .filter(([_, value]) => value !== null)
      .map(([key]) => key);
    logger.info(`[FloOracle] Fetched ${nonNullMetrics.length}/20 HealthKit metrics: ${nonNullMetrics.join(', ')}`);

    const [latestFlomentum] = await db
      .select()
      .from(flomentumDaily)
      .where(eq(flomentumDaily.userId, userId))
      .orderBy(desc(flomentumDaily.date))
      .limit(1);

    if (latestFlomentum) {
      context.flomentumCurrent.score = latestFlomentum.score;
      context.flomentumCurrent.zone = latestFlomentum.zone;
      const factors = latestFlomentum.dailyFocus as Record<string, any> || {};
      context.flomentumCurrent.dailyFocus = factors.focus || null;
    }

    // Fetch recent workout sessions from healthkitWorkouts table
    const workoutHistory: any[] = [];
    try {
      const recentWorkouts = await db
        .select({
          workoutType: healthkitWorkouts.workoutType,
          date: healthkitWorkouts.startDate,
          duration: healthkitWorkouts.duration,
          distance: healthkitWorkouts.totalDistance,
          energyBurned: healthkitWorkouts.totalEnergyBurned,
          avgHR: healthkitWorkouts.averageHeartRate,
          maxHR: healthkitWorkouts.maxHeartRate
        })
        .from(healthkitWorkouts)
        .where(
          and(
            eq(healthkitWorkouts.userId, userId),
            gte(healthkitWorkouts.startDate, sevenDaysAgo)
          )
        )
        .orderBy(desc(healthkitWorkouts.startDate))
        .limit(20);
      
      recentWorkouts.forEach(w => {
        // Use relative date labels for better AI understanding
        const dateLabel = getRelativeDateLabel(w.date, userTimezone);
        workoutHistory.push({
          type: w.workoutType,
          date: dateLabel, // e.g., "today", "yesterday", "Friday", "3 days ago"
          dateFormatted: formatDateInTimezone(w.date, userTimezone),
          duration: w.duration ? Math.round(w.duration) : null,
          distance: w.distance ? (w.distance / 1000).toFixed(1) : null, // Convert to km
          calories: w.energyBurned ? Math.round(w.energyBurned) : null,
          avgHR: w.avgHR ? Math.round(w.avgHR) : null,
          maxHR: w.maxHR ? Math.round(w.maxHR) : null
        });
      });
      
      if (workoutHistory.length > 0) {
        logger.info(`[FloOracle] Fetched ${workoutHistory.length} recent workouts for context`);
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch workout history');
    }

    // Fetch body composition data from userDailyMetrics
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoStr = formatDateInTimezone(ninetyDaysAgo, userTimezone);

      const healthData = await db
        .select()
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            gte(userDailyMetrics.localDate, ninetyDaysAgoStr)
          )
        )
        .orderBy(desc(userDailyMetrics.localDate))
        .limit(30);

      const mostRecentWeight = healthData.find(d => d.weightKg !== null);
      const mostRecentBodyFat = healthData.find(d => d.bodyFatPercent !== null);
      const mostRecentLeanMass = healthData.find(d => d.leanBodyMassKg !== null);

      if (mostRecentWeight || mostRecentBodyFat || mostRecentLeanMass) {
        // Get body fat correction to apply to raw readings
        const bodyFatCorrectionPct = await getBodyFatCorrectionPct(userId);
        
        const parts: string[] = [];
        if (mostRecentWeight?.weightKg) parts.push(`Weight: ${mostRecentWeight.weightKg.toFixed(1)} kg`);
        if (mostRecentBodyFat?.bodyFatPercent) {
          const correctedBodyFat = applyBodyFatCorrection(mostRecentBodyFat.bodyFatPercent, bodyFatCorrectionPct);
          if (correctedBodyFat != null) parts.push(`Body fat: ${correctedBodyFat.toFixed(1)}%`);
        }
        if (mostRecentLeanMass?.leanBodyMassKg) parts.push(`Lean mass: ${mostRecentLeanMass.leanBodyMassKg.toFixed(1)} kg`);
        context.bodyCompositionExplanation = `HealthKit data: ${parts.join(', ')}`;
      } else {
        context.bodyCompositionExplanation = null;
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch body composition data');
      context.bodyCompositionExplanation = null;
    }

    // Fetch mindfulness summary (last 7 days) - uses healthStorageRouter for dual-database support
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const mindfulnessRecords = await getHealthRouterMindfulnessMetrics(userId, { 
        startDate: sevenDaysAgo, 
        limit: 7 
      });

      if (mindfulnessRecords.length > 0) {
        const totalMinutes = mindfulnessRecords.reduce((sum, r) => sum + (r.totalMinutes || 0), 0);
        const sessionCount = mindfulnessRecords.reduce((sum, r) => sum + (r.sessionCount || 0), 0);
        const daysWithPractice = mindfulnessRecords.length;
        const avgDailyMinutes = Math.round((totalMinutes / 7) * 10) / 10;

        context.mindfulnessSummary = {
          totalMinutes,
          sessionCount,
          avgDailyMinutes,
          daysWithPractice,
        };
        logger.info(`[FloOracle] Fetched mindfulness: ${totalMinutes}min total, ${sessionCount} sessions`);
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch mindfulness data');
    }

    // Fetch nutrition summary (last 90 days / 3 months) - uses healthStorageRouter for dual-database support
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const nutritionRecords = await getHealthRouterNutritionMetrics(userId, { 
        startDate: ninetyDaysAgo, 
        limit: 90 
      });

      logger.info(`[FloOracle] Nutrition query returned ${nutritionRecords.length} records`);

      if (nutritionRecords.length > 0) {
        // Generic average function that works with any field name
        const avgField = (field: string) => {
          const values = nutritionRecords.map(r => r[field]).filter((v): v is number => v != null);
          if (values.length === 0) return null;
          return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
        };

        context.nutritionSummary = {
          // Macros
          avgDailyCalories: avgField('energyKcal'),
          avgDailyProtein: avgField('proteinG'),
          avgDailyCarbs: avgField('carbohydratesG'),
          avgDailyFat: avgField('fatTotalG'),
          avgDailyFiber: avgField('fiberG'),
          avgDailyCaffeine: avgField('caffeineMg'),
          avgDailySugar: avgField('sugarG'),
          avgDailySodium: avgField('sodiumMg'),
          avgDailyCholesterol: avgField('cholesterolMg'),
          // Vitamins
          avgDailyVitaminA: avgField('vitaminAMcg'),
          avgDailyVitaminB6: avgField('vitaminB6Mg'),
          avgDailyVitaminB12: avgField('vitaminB12Mcg'),
          avgDailyVitaminC: avgField('vitaminCMg'),
          avgDailyVitaminD: avgField('vitaminDMcg'),
          avgDailyVitaminE: avgField('vitaminEMg'),
          avgDailyVitaminK: avgField('vitaminKMcg'),
          avgDailyThiamin: avgField('thiaminMg'),
          avgDailyRiboflavin: avgField('riboflavinMg'),
          avgDailyNiacin: avgField('niacinMg'),
          avgDailyFolate: avgField('folateMcg'),
          avgDailyBiotin: avgField('biotinMcg'),
          avgDailyPantothenicAcid: avgField('pantothenicAcidMg'),
          // Minerals
          avgDailyPotassium: avgField('potassiumMg'),
          avgDailyCalcium: avgField('calciumMg'),
          avgDailyIron: avgField('ironMg'),
          avgDailyMagnesium: avgField('magnesiumMg'),
          avgDailyPhosphorus: avgField('phosphorusMg'),
          avgDailyZinc: avgField('zincMg'),
          avgDailyCopper: avgField('copperMg'),
          avgDailyManganese: avgField('manganeseMg'),
          avgDailySelenium: avgField('seleniumMcg'),
          avgDailyWater: avgField('waterMl'),
          daysTracked: nutritionRecords.length,
        };
        logger.info(`[FloOracle] Fetched nutrition: ${nutritionRecords.length} days tracked, avgCalories: ${context.nutritionSummary.avgDailyCalories}, vitaminD: ${context.nutritionSummary.avgDailyVitaminD}`);
      } else {
        logger.warn(`[FloOracle] No nutrition records found for user`);
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch nutrition data:', error);
    }

    // Fetch environmental context (weather, air quality) for today
    try {
      context.environmentalContext = await getEnvironmentalContext(userId);
      if (context.environmentalContext?.weather || context.environmentalContext?.airQuality) {
        logger.info(`[FloOracle] Fetched environmental context for user ${userId}: ${context.environmentalContext?.weather?.weatherDescription || 'no weather'}, AQI ${context.environmentalContext?.airQuality?.aqi || 'unknown'}`);
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch environmental context:', error);
    }

    // Fetch life events (last 30 days) - uses healthStorageRouter for Supabase access
    let lifeEventsContext = '';
    try {
      lifeEventsContext = await getRecentLifeEvents(userId, 30);
      if (lifeEventsContext) {
        logger.info(`[FloOracle] Fetched life events for user ${userId}`);
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch life events:', error);
    }

    // Fetch recovery sessions (sauna, ice bath) from the last 14 days
    let recoverySessionsContext = '';
    try {
      recoverySessionsContext = await getRecentRecoverySessions(userId, 14);
      if (recoverySessionsContext) {
        logger.info(`[FloOracle] Fetched recovery sessions for user ${userId}`);
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch recovery sessions:', error);
    }

    // Fetch pending biomarker follow-ups (scheduled appointments for concerns)
    let biomarkerFollowupsContext = '';
    try {
      const pendingFollowups = await getPendingBiomarkerFollowups(userId);
      if (pendingFollowups.length > 0) {
        biomarkerFollowupsContext = formatBiomarkerFollowupsContext(pendingFollowups);
        logger.info(`[FloOracle] Fetched ${pendingFollowups.length} pending biomarker followups for user ${userId}`);
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch biomarker followups:', error);
    }

    // Fetch BigQuery correlation insights (anomalies and patterns)
    let correlationContext = '';
    try {
      correlationContext = await getCorrelationInsightsContext(userId);
      if (correlationContext) {
        logger.info(`[FloOracle] Fetched correlation insights for user ${userId}`);
      }
    } catch (error) {
      logger.debug('[FloOracle] Correlation insights not available:', error);
    }

    const contextString = buildContextString(context, bloodPanelHistory, workoutHistory) + lifeEventsContext + recoverySessionsContext + biomarkerFollowupsContext + correlationContext;
    logger.info(`[FloOracle] Context built successfully (${contextString.length} chars, includesLifeEvents: ${lifeEventsContext.length > 0})`);
    
    // Cache the result
    contextCache.set(userId, {
      context: contextString,
      timestamp: Date.now(),
    });
    
    return contextString;
  } catch (error) {
    logger.error('[FloOracle] Failed to build user context:', error);
    return buildFallbackContext();
  }
}

// Export function to get raw health metrics for debugging
export async function getUserHealthMetrics(userId: string): Promise<{
  wearableAvg7Days: any;
  healthkitMetrics: any;
  dataSource: string;
  supabaseEnabled: boolean;
}> {
  const supabaseEnabled = isSupabaseHealthEnabled();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const wearableAvg7Days = {
    hrv: null as number | null,
    sleep: null as string | null,
    rhr: null as number | null,
    steps: null as number | null,
    activeKcal: null as number | null,
  };

  const healthkitMetrics: Record<string, number | null> = {
    weight: null,
    height: null,
    bmi: null,
    bodyFatPct: null,
    leanBodyMass: null,
    distance: null,
    basalEnergy: null,
    flightsClimbed: null,
    bloodPressureSystolic: null,
    bloodPressureDiastolic: null,
    oxygenSaturation: null,
    respiratoryRate: null,
    bloodGlucose: null,
    bodyTemp: null,
    vo2Max: null,
    walkingHR: null,
    waistCircumference: null,
    dietaryWater: null,
    exerciseTime: null,
    standTime: null,
    avgHeartRate: null,
  };

  let dataSource = 'none';
  let rawMetrics: any[] = [];

  try {
    if (supabaseEnabled) {
      logger.info('[DebugContext] Using Supabase for health metrics');
      const supabaseMetrics = await getSupabaseDailyMetrics(userId, 30);
      rawMetrics = supabaseMetrics;
      dataSource = 'supabase';
    } else {
      logger.info('[DebugContext] Using Neon for health metrics');
      rawMetrics = await db
        .select()
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            gte(userDailyMetrics.localDate, sevenDaysAgoStr)
          )
        )
        .orderBy(desc(userDailyMetrics.localDate))
        .limit(30);
      dataSource = 'neon';
    }

    if (rawMetrics.length > 0) {
      // Helper to get field value (handles both snake_case from Supabase and camelCase from Neon)
      const getField = (m: any, snakeCase: string, camelCase: string) => m[snakeCase] ?? m[camelCase];
      
      // Calculate averages for wearable data
      const hrvValues = rawMetrics.filter(m => getField(m, 'hrv_ms', 'hrvMs') != null).map(m => getField(m, 'hrv_ms', 'hrvMs'));
      const rhrValues = rawMetrics.filter(m => getField(m, 'resting_hr_bpm', 'restingHrBpm') != null).map(m => getField(m, 'resting_hr_bpm', 'restingHrBpm'));
      const stepsValues = rawMetrics.filter(m => getField(m, 'steps_raw_sum', 'stepsRawSum') != null).map(m => getField(m, 'steps_raw_sum', 'stepsRawSum'));
      const activeKcalValues = rawMetrics.filter(m => getField(m, 'active_energy_kcal', 'activeEnergyKcal') != null).map(m => getField(m, 'active_energy_kcal', 'activeEnergyKcal'));

      if (hrvValues.length > 0) wearableAvg7Days.hrv = Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
      if (rhrValues.length > 0) wearableAvg7Days.rhr = Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length);
      if (stepsValues.length > 0) wearableAvg7Days.steps = Math.round(stepsValues.reduce((a, b) => a + b, 0) / stepsValues.length);
      if (activeKcalValues.length > 0) wearableAvg7Days.activeKcal = Math.round(activeKcalValues.reduce((a, b) => a + b, 0) / activeKcalValues.length);

      // Get most recent values for extended metrics (handle both snake_case and camelCase)
      const mostRecent = rawMetrics[0];
      if (mostRecent) {
        // Get body fat correction to apply to raw readings
        const bodyFatCorrectionPct = await getBodyFatCorrectionPct(userId);
        
        healthkitMetrics.weight = getField(mostRecent, 'weight_kg', 'weightKg');
        healthkitMetrics.height = getField(mostRecent, 'height_cm', 'heightCm');
        healthkitMetrics.bmi = mostRecent.bmi;
        healthkitMetrics.bodyFatPct = applyBodyFatCorrection(getField(mostRecent, 'body_fat_percent', 'bodyFatPercent'), bodyFatCorrectionPct);
        healthkitMetrics.leanBodyMass = getField(mostRecent, 'lean_body_mass_kg', 'leanBodyMassKg');
        healthkitMetrics.distance = getField(mostRecent, 'distance_meters', 'distanceMeters');
        healthkitMetrics.basalEnergy = getField(mostRecent, 'basal_energy_kcal', 'basalEnergyKcal');
        healthkitMetrics.flightsClimbed = getField(mostRecent, 'flights_climbed', 'flightsClimbed');
        healthkitMetrics.bloodPressureSystolic = getField(mostRecent, 'systolic_bp', 'systolicBp');
        healthkitMetrics.bloodPressureDiastolic = getField(mostRecent, 'diastolic_bp', 'diastolicBp');
        healthkitMetrics.oxygenSaturation = getField(mostRecent, 'oxygen_saturation_pct', 'oxygenSaturationPct');
        healthkitMetrics.respiratoryRate = getField(mostRecent, 'respiratory_rate_bpm', 'respiratoryRateBpm');
        healthkitMetrics.bloodGlucose = getField(mostRecent, 'blood_glucose_mg_dl', 'bloodGlucoseMgDl');
        healthkitMetrics.bodyTemp = getField(mostRecent, 'body_temp_c', 'bodyTempC');
        healthkitMetrics.vo2Max = getField(mostRecent, 'vo2_max', 'vo2Max');
        healthkitMetrics.walkingHR = getField(mostRecent, 'walking_hr_avg_bpm', 'walkingHrAvgBpm');
        healthkitMetrics.waistCircumference = getField(mostRecent, 'waist_circumference_cm', 'waistCircumferenceCm');
        healthkitMetrics.dietaryWater = getField(mostRecent, 'dietary_water_ml', 'dietaryWaterMl');
        healthkitMetrics.exerciseTime = getField(mostRecent, 'exercise_minutes', 'exerciseMinutes');
        healthkitMetrics.standTime = getField(mostRecent, 'stand_hours', 'standHours');
        healthkitMetrics.avgHeartRate = getField(mostRecent, 'avg_heart_rate_bpm', 'avgHeartRateBpm');
      }
    }
  } catch (error) {
    logger.error('[DebugContext] Error fetching metrics:', error);
    dataSource = 'error';
  }

  return {
    wearableAvg7Days,
    healthkitMetrics,
    dataSource,
    supabaseEnabled,
  };
}

function buildContextString(context: UserHealthContext, bloodPanelHistory: BloodPanelHistory[] = [], workoutHistory: any[] = []): string {
  // Add timestamp so Gemini knows this is existing data, not new information
  const contextTimestamp = new Date().toISOString();
  const lines: string[] = [
    `USER HEALTH CONTEXT (snapshot as of ${contextTimestamp}):`,
    '[NOTE: This is the user\'s current health state - NOT breaking news. Check conversation history before mentioning any metric.]',
    '',
  ];
  
  lines.push(`Age: ${context.age ?? 'unknown'} | Sex: ${context.sex} | Primary goal: ${context.primaryGoals.join(', ') || 'general health'}`);
  
  // Format blood panels with historical context
  if (bloodPanelHistory.length > 0) {
    lines.push('');
    lines.push('BLOOD WORK HISTORY (most recent first):');
    
    bloodPanelHistory.forEach((panel, index) => {
      const isLatest = index === 0;
      const label = isLatest ? '📊 LATEST PANEL' : `📊 Panel`;
      lines.push(`${label} (${panel.date}):`);
      
      // Get all unique biomarkers across all panels
      const biomarkerKeys = Object.keys(panel.biomarkers).sort();
      
      if (biomarkerKeys.length > 0) {
        biomarkerKeys.forEach(key => {
          lines.push(`  • ${key}: ${panel.biomarkers[key]}`);
        });
      }
      
      // Add spacing between panels (except after last one)
      if (index < bloodPanelHistory.length - 1) {
        lines.push('');
      }
    });
  } else if (context.latestBloodPanel.date) {
    // Fallback to old format if bloodPanelHistory wasn't populated
    lines.push(`Latest blood panel: ${context.latestBloodPanel.date}`);
    
    const biomarkerKeys = Object.keys(context.latestBloodPanel)
      .filter(key => key !== 'date' && context.latestBloodPanel[key] !== 'not recorded')
      .sort();
    
    if (biomarkerKeys.length > 0) {
      biomarkerKeys.forEach(key => {
        lines.push(`  • ${key}: ${context.latestBloodPanel[key]}`);
      });
    } else {
      lines.push('  • No biomarker measurements available');
    }
  } else {
    lines.push('Latest blood panel: No blood work uploaded yet');
  }
  
  if (context.latestCAC.score !== null) {
    const percentileText = context.latestCAC.percentile ? ` (${context.latestCAC.percentile} percentile)` : '';
    lines.push(`Latest CAC (${context.latestCAC.date || 'date unknown'}): ${context.latestCAC.score}${percentileText}`);
  }
  
  if (context.latestDEXA.visceralFat !== null) {
    lines.push(`Latest DEXA (${context.latestDEXA.date || 'date unknown'}): Visceral fat ${context.latestDEXA.visceralFat}g | Lean mass ${context.latestDEXA.leanMass ?? 'unknown'}kg | Body fat ${context.latestDEXA.bodyFat ?? 'unknown'}%`);
  }
  
  const wearable = context.wearableAvg7Days;
  if (wearable.hrv || wearable.sleep || wearable.rhr) {
    const parts: string[] = [];
    if (wearable.hrv) parts.push(`HRV ${wearable.hrv} ms`);
    if (wearable.sleep) parts.push(`Sleep ${wearable.sleep}`);
    if (wearable.rhr) parts.push(`RHR ${wearable.rhr} bpm`);
    if (wearable.steps) parts.push(`Steps ${wearable.steps}`);
    if (wearable.activeKcal) parts.push(`Active kcal ${wearable.activeKcal}`);
    lines.push(`7-day wearable avg: ${parts.join(', ')}`);
  }

  // Add detailed sleep breakdown section for quality analysis
  const sleep = context.sleepDetails7Days;
  if (sleep && sleep.daysWithData > 0) {
    lines.push('');
    lines.push(`SLEEP QUALITY BREAKDOWN (${sleep.daysWithData}-day avg):`);
    
    // Total sleep time
    if (sleep.avgTotalSleepMin != null) {
      const hrs = Math.floor(sleep.avgTotalSleepMin / 60);
      const mins = Math.round(sleep.avgTotalSleepMin % 60);
      lines.push(`  Total sleep: ${hrs}h ${mins}min`);
    }
    
    // Sleep stages with percentages (critical for quality assessment)
    const stages: string[] = [];
    if (sleep.avgDeepSleepMin != null) {
      const deepHrs = sleep.avgDeepSleepMin >= 60 ? `${Math.floor(sleep.avgDeepSleepMin / 60)}h ${Math.round(sleep.avgDeepSleepMin % 60)}min` : `${Math.round(sleep.avgDeepSleepMin)} min`;
      const deepPctStr = sleep.avgDeepPct != null ? ` (${sleep.avgDeepPct}%)` : '';
      stages.push(`Deep sleep: ${deepHrs}${deepPctStr}`);
    }
    if (sleep.avgRemSleepMin != null) {
      const remHrs = sleep.avgRemSleepMin >= 60 ? `${Math.floor(sleep.avgRemSleepMin / 60)}h ${Math.round(sleep.avgRemSleepMin % 60)}min` : `${Math.round(sleep.avgRemSleepMin)} min`;
      const remPctStr = sleep.avgRemPct != null ? ` (${sleep.avgRemPct}%)` : '';
      stages.push(`REM sleep: ${remHrs}${remPctStr}`);
    }
    if (sleep.avgCoreSleepMin != null) {
      const coreHrs = sleep.avgCoreSleepMin >= 60 ? `${Math.floor(sleep.avgCoreSleepMin / 60)}h ${Math.round(sleep.avgCoreSleepMin % 60)}min` : `${Math.round(sleep.avgCoreSleepMin)} min`;
      const corePctStr = sleep.avgCorePct != null ? ` (${sleep.avgCorePct}%)` : '';
      stages.push(`Light/Core sleep: ${coreHrs}${corePctStr}`);
    }
    stages.forEach(s => lines.push(`  ${s}`));
    
    // Sleep quality metrics
    const qualityMetrics: string[] = [];
    if (sleep.avgEfficiencyPct != null) {
      qualityMetrics.push(`Efficiency: ${sleep.avgEfficiencyPct}%`);
    }
    if (sleep.avgAwakenings != null) {
      qualityMetrics.push(`Awakenings: ${sleep.avgAwakenings} per night`);
    }
    if (sleep.avgFragmentationIndex != null) {
      qualityMetrics.push(`Fragmentation: ${sleep.avgFragmentationIndex}`);
    }
    if (sleep.avgHrvMs != null) {
      qualityMetrics.push(`Sleep HRV: ${sleep.avgHrvMs} ms`);
    }
    if (qualityMetrics.length > 0) {
      lines.push(`  Quality metrics: ${qualityMetrics.join(', ')}`);
    }
    
    // Add context about ideal ranges for AI interpretation
    lines.push(`  [Reference: Ideal deep sleep 13-23%, REM 20-25%, efficiency >85%]`);
  }

  // Add Supabase 90-day baselines section (same data Health Alerts uses)
  // This ensures Flō Chat evaluates sleep/metrics consistently with other AI features
  const chBaselines = context.supabaseBaselines;
  if (chBaselines) {
    lines.push('');
    lines.push('YOUR 90-DAY PERSONAL BASELINES (same as Health Alerts - use these for comparison!):');
    
    const formatBaseline = (label: string, data: { baseline: number | null; stdDev: number | null }, unit: string, isTime: boolean = false) => {
      if (data.baseline == null) return null;
      if (isTime) {
        const hrs = Math.floor(data.baseline / 60);
        const mins = Math.round(data.baseline % 60);
        const stdHrs = data.stdDev ? Math.round(data.stdDev / 60 * 10) / 10 : null;
        return `${label}: ${hrs}h ${mins}min avg (±${stdHrs || 0}h typical variation)`;
      }
      return `${label}: ${Math.round(data.baseline)} ${unit} avg (±${Math.round(data.stdDev || 0)} ${unit} typical variation)`;
    };
    
    const sleepDurLine = formatBaseline('Sleep duration', chBaselines.sleepDuration, 'min', true);
    const deepLine = formatBaseline('Deep sleep', chBaselines.deepSleep, 'min', false);
    const remLine = formatBaseline('REM sleep', chBaselines.remSleep, 'min', false);
    const hrvLine = formatBaseline('HRV', chBaselines.hrv, 'ms', false);
    const rhrLine = formatBaseline('RHR', chBaselines.rhr, 'bpm', false);
    const stepsLine = formatBaseline('Steps', chBaselines.steps, '', false);
    
    const activeEnergyLine = formatBaseline('Active energy', chBaselines.activeEnergy, 'kcal', false);
    
    if (sleepDurLine) lines.push(`  ${sleepDurLine}`);
    if (deepLine) lines.push(`  ${deepLine}`);
    if (remLine) lines.push(`  ${remLine}`);
    if (hrvLine) lines.push(`  ${hrvLine}`);
    if (rhrLine) lines.push(`  ${rhrLine}`);
    if (stepsLine) lines.push(`  ${stepsLine}`);
    if (activeEnergyLine) lines.push(`  ${activeEnergyLine}`);
    
    lines.push('  [IMPORTANT: Compare values to these 90-day baselines, NOT just recent 7-day averages]');
    lines.push('  [A night can be "good for recent days" but "below your typical baseline" - be precise!]');
  } else {
    // Log when baselines are missing so we can debug cases where chat diverges from Health Alerts
    lines.push('');
    lines.push('[NOTE: 90-day baselines unavailable - using 7-day averages for trend comparison]');
  }

  // Add individual night breakdown so Oracle can spot specific outliers
  const recentNights = context.recentSleepNights;
  if (recentNights && recentNights.length > 0) {
    lines.push('');
    lines.push('INDIVIDUAL NIGHTS (last 5 nights - spot outliers!):');
    for (const night of recentNights) {
      const deepStr = night.deepSleepMin !== null ? `Deep: ${night.deepSleepMin} min` : '';
      const remStr = night.remSleepMin !== null ? `REM: ${night.remSleepMin} min` : '';
      const totalStr = night.totalSleepMin !== null ? `Total: ${Math.round(night.totalSleepMin / 60 * 10) / 10}h` : '';
      const parts = [totalStr, deepStr, remStr].filter(Boolean).join(', ');
      
      // Highlight significant deviations with a clear text flag (no emojis)
      const deviationFlag = night.deviationFromBaseline ? ` **NOTABLE: ${night.deviationFromBaseline}**` : '';
      lines.push(`  ${night.date}: ${parts}${deviationFlag}`);
    }
    lines.push('  [TIP: Large deviations marked **NOTABLE** are opportunities - ask what was different that day!]');
  }

  // Add recent trends section (last 48h vs 7-day baseline)
  const trends = context.recentTrends;
  if (trends) {
    const significantTrends: string[] = [];
    
    const formatTrend = (
      name: string,
      trend: { recent: number | null; avg7d: number | null; change: number | null; direction: 'up' | 'down' | 'stable' | null },
      unit: string,
      goodDirection: 'up' | 'down' | 'either' = 'either'
    ): string | null => {
      if (trend.direction === null || trend.direction === 'stable') return null;
      const arrow = trend.direction === 'up' ? '+' : '';
      const emoji = goodDirection === 'either' ? '' : 
        (trend.direction === goodDirection ? ' (good)' : ' (watch)');
      return `${name}: ${trend.recent}${unit} (${arrow}${trend.change}% vs baseline)${emoji}`;
    };
    
    const hrvTrend = formatTrend('HRV', trends.hrv, ' ms', 'up');
    const rhrTrend = formatTrend('RHR', trends.rhr, ' bpm', 'down');
    const sleepTrend = trends.sleepMinutes.direction && trends.sleepMinutes.direction !== 'stable' ? 
      `Sleep: ${Math.round((trends.sleepMinutes.recent || 0) / 60 * 10) / 10}h (${trends.sleepMinutes.change! > 0 ? '+' : ''}${trends.sleepMinutes.change}% vs baseline)${trends.sleepMinutes.direction === 'up' ? ' (good)' : ' (watch)'}` : null;
    const stepsTrend = formatTrend('Steps', trends.steps, '', 'up');
    const kcalTrend = formatTrend('Active kcal', trends.activeKcal, '', 'up');
    
    if (hrvTrend) significantTrends.push(hrvTrend);
    if (rhrTrend) significantTrends.push(rhrTrend);
    if (sleepTrend) significantTrends.push(sleepTrend);
    if (stepsTrend) significantTrends.push(stepsTrend);
    if (kcalTrend) significantTrends.push(kcalTrend);
    
    if (significantTrends.length > 0) {
      lines.push('');
      lines.push('RECENT TRENDS (last 48h vs 7-day baseline):');
      significantTrends.forEach(t => lines.push(`  ${t}`));
      logger.info(`[FloOracle] Added ${significantTrends.length} significant trends to context`);
    }
  }

  // Add all additional HealthKit metrics
  const hk = context.healthkitMetrics;
  const healthkitParts: string[] = [];
  
  // Body metrics (latest values)
  const bodyMetrics: string[] = [];
  if (hk.weight) bodyMetrics.push(`Weight ${hk.weight} kg`);
  if (hk.height) bodyMetrics.push(`Height ${hk.height} cm`);
  if (hk.bmi) bodyMetrics.push(`BMI ${hk.bmi}`);
  if (hk.bodyFatPct) bodyMetrics.push(`Body fat ${hk.bodyFatPct}%`);
  if (hk.leanBodyMass) bodyMetrics.push(`Lean mass ${hk.leanBodyMass} kg`);
  if (hk.waistCircumference) bodyMetrics.push(`Waist ${hk.waistCircumference} cm`);
  if (bodyMetrics.length > 0) {
    healthkitParts.push(`Body: ${bodyMetrics.join(', ')}`);
  }

  // Cardiovascular metrics (7-day averages)
  const cardioMetrics: string[] = [];
  if (hk.avgHeartRate) cardioMetrics.push(`Avg HR ${hk.avgHeartRate} bpm`);
  if (hk.bloodPressureSystolic && hk.bloodPressureDiastolic) {
    cardioMetrics.push(`BP ${hk.bloodPressureSystolic}/${hk.bloodPressureDiastolic} mmHg`);
  }
  if (hk.oxygenSaturation) cardioMetrics.push(`SpO2 ${hk.oxygenSaturation}%`);
  if (hk.respiratoryRate) cardioMetrics.push(`RR ${hk.respiratoryRate} br/min`);
  if (hk.walkingHR) cardioMetrics.push(`Walking HR ${hk.walkingHR} bpm`);
  if (hk.vo2Max) cardioMetrics.push(`VO2 Max ${hk.vo2Max} mL/kg/min`);
  if (cardioMetrics.length > 0) {
    healthkitParts.push(`Cardiovascular (7-day avg): ${cardioMetrics.join(', ')}`);
  }

  // Metabolic metrics (7-day averages)
  const metaMetrics: string[] = [];
  if (hk.bloodGlucose) metaMetrics.push(`Glucose ${hk.bloodGlucose} mg/dL`);
  if (hk.bodyTemp) metaMetrics.push(`Temp ${hk.bodyTemp}°C`);
  if (hk.basalEnergy) metaMetrics.push(`Basal kcal ${hk.basalEnergy}`);
  if (metaMetrics.length > 0) {
    healthkitParts.push(`Metabolic (7-day avg): ${metaMetrics.join(', ')}`);
  }

  // Activity metrics (7-day averages)
  const activityMetrics: string[] = [];
  if (hk.distance) activityMetrics.push(`Distance ${hk.distance} km`);
  if (hk.flightsClimbed) activityMetrics.push(`Flights ${hk.flightsClimbed}`);
  if (hk.exerciseTime) activityMetrics.push(`Exercise ${hk.exerciseTime} min`);
  if (hk.standTime) activityMetrics.push(`Stand ${hk.standTime} hr`);
  if (hk.dietaryWater) activityMetrics.push(`Water ${hk.dietaryWater} mL`);
  if (activityMetrics.length > 0) {
    healthkitParts.push(`Activity (7-day avg): ${activityMetrics.join(', ')}`);
  }

  if (healthkitParts.length > 0) {
    lines.push('');
    lines.push('HEALTHKIT METRICS:');
    healthkitParts.forEach(part => lines.push(`  ${part}`));
    logger.info(`[FloOracle] Added ${healthkitParts.length} HealthKit metric categories to context`);
  } else {
    logger.warn('[FloOracle] No HealthKit metrics available to add to context');
  }

  // Add workout history if available (limit to 5 most recent)
  if (workoutHistory && workoutHistory.length > 0) {
    lines.push('');
    lines.push('RECENT WORKOUTS (last 7 days):');
    const workoutsToShow = workoutHistory.slice(0, 5); // Limit to 5 most recent
    workoutsToShow.forEach(w => {
      const parts: string[] = [`${w.type.charAt(0).toUpperCase() + w.type.slice(1)}`];
      if (w.duration) parts.push(`${w.duration} min`);
      if (w.distance) parts.push(`${w.distance} km`);
      if (w.calories) parts.push(`${w.calories} kcal`);
      if (w.avgHR) parts.push(`Avg HR ${w.avgHR}`);
      if (w.maxHR) parts.push(`Max ${w.maxHR}`);
      lines.push(`  • ${w.date}: ${parts.join(', ')}`);
    });
    if (workoutHistory.length > 5) {
      lines.push(`  ... and ${workoutHistory.length - 5} more workouts`);
    }
    logger.info(`[FloOracle] Added ${Math.min(5, workoutHistory.length)} recent workouts to context`);
  }

  // Add gait/mobility metrics if available (for fall prevention insights)
  const hkMobility = context.healthkitMetrics as any;
  if (hkMobility.walkingSpeed || hkMobility.walkingSteadiness || hkMobility.stairAscentSpeed) {
    lines.push('');
    lines.push('GAIT & MOBILITY METRICS:');
    const mobilityParts: string[] = [];
    if (hkMobility.walkingSpeed) mobilityParts.push(`Walking speed ${hkMobility.walkingSpeed.toFixed(2)} m/s`);
    if (hkMobility.walkingStepLength) mobilityParts.push(`Step length ${(hkMobility.walkingStepLength * 100).toFixed(1)} cm`);
    if (hkMobility.walkingSteadiness) mobilityParts.push(`Steadiness ${hkMobility.walkingSteadiness.toFixed(0)}%`);
    if (hkMobility.walkingDoubleSupportPct) mobilityParts.push(`Double support ${hkMobility.walkingDoubleSupportPct.toFixed(1)}%`);
    if (hkMobility.walkingAsymmetryPct) mobilityParts.push(`Asymmetry ${hkMobility.walkingAsymmetryPct.toFixed(1)}%`);
    if (hkMobility.sixMinuteWalkDistance) mobilityParts.push(`6-min walk ${hkMobility.sixMinuteWalkDistance.toFixed(0)} m`);
    if (hkMobility.stairAscentSpeed) mobilityParts.push(`Stair ascent ${hkMobility.stairAscentSpeed.toFixed(2)} m/s`);
    if (hkMobility.stairDescentSpeed) mobilityParts.push(`Stair descent ${hkMobility.stairDescentSpeed.toFixed(2)} m/s`);
    lines.push(`  ${mobilityParts.join(', ')}`);
    logger.info(`[FloOracle] Added ${mobilityParts.length} mobility metrics to context`);
  }

  // Add mindfulness summary if available
  const mindfulness = context.mindfulnessSummary as any;
  if (mindfulness && mindfulness.totalMinutes > 0) {
    lines.push('');
    lines.push('MINDFULNESS (last 7 days):');
    lines.push(`  Total: ${mindfulness.totalMinutes} min | Sessions: ${mindfulness.sessionCount} | Days practiced: ${mindfulness.daysWithPractice} | Avg daily: ${mindfulness.avgDailyMinutes.toFixed(1)} min`);
    logger.info(`[FloOracle] Added mindfulness summary to context`);
  }

  // Add nutrition summary if available (90-day lookback)
  const nutrition = context.nutritionSummary as any;
  if (nutrition && nutrition.daysTracked > 0) {
    lines.push('');
    lines.push(`NUTRITION (${nutrition.daysTracked}-day averages):`);
    
    // Macros line
    const macroParts: string[] = [];
    if (nutrition.avgDailyCalories) macroParts.push(`Calories ${nutrition.avgDailyCalories.toFixed(0)} kcal`);
    if (nutrition.avgDailyProtein) macroParts.push(`Protein ${nutrition.avgDailyProtein.toFixed(0)}g`);
    if (nutrition.avgDailyCarbs) macroParts.push(`Carbs ${nutrition.avgDailyCarbs.toFixed(0)}g`);
    if (nutrition.avgDailyFat) macroParts.push(`Fat ${nutrition.avgDailyFat.toFixed(0)}g`);
    if (macroParts.length > 0) lines.push(`  Macros: ${macroParts.join(', ')}`);
    
    // Additional nutrients line
    const nutrientParts: string[] = [];
    if (nutrition.avgDailyFiber) nutrientParts.push(`Fiber ${nutrition.avgDailyFiber.toFixed(0)}g`);
    if (nutrition.avgDailySugar) nutrientParts.push(`Sugar ${nutrition.avgDailySugar.toFixed(0)}g`);
    if (nutrition.avgDailySodium) nutrientParts.push(`Sodium ${nutrition.avgDailySodium.toFixed(0)}mg`);
    if (nutrition.avgDailyCholesterol) nutrientParts.push(`Cholesterol ${nutrition.avgDailyCholesterol.toFixed(0)}mg`);
    if (nutrition.avgDailyCaffeine) nutrientParts.push(`Caffeine ${nutrition.avgDailyCaffeine.toFixed(0)}mg`);
    if (nutrientParts.length > 0) lines.push(`  Other: ${nutrientParts.join(', ')}`);
    
    // Vitamins line
    const vitaminParts: string[] = [];
    if (nutrition.avgDailyVitaminA) vitaminParts.push(`A ${nutrition.avgDailyVitaminA.toFixed(0)}mcg`);
    if (nutrition.avgDailyVitaminB6) vitaminParts.push(`B6 ${nutrition.avgDailyVitaminB6.toFixed(1)}mg`);
    if (nutrition.avgDailyVitaminB12) vitaminParts.push(`B12 ${nutrition.avgDailyVitaminB12.toFixed(1)}mcg`);
    if (nutrition.avgDailyVitaminC) vitaminParts.push(`C ${nutrition.avgDailyVitaminC.toFixed(0)}mg`);
    if (nutrition.avgDailyVitaminD) vitaminParts.push(`D ${nutrition.avgDailyVitaminD.toFixed(1)}mcg`);
    if (nutrition.avgDailyVitaminE) vitaminParts.push(`E ${nutrition.avgDailyVitaminE.toFixed(1)}mg`);
    if (nutrition.avgDailyVitaminK) vitaminParts.push(`K ${nutrition.avgDailyVitaminK.toFixed(0)}mcg`);
    if (nutrition.avgDailyFolate) vitaminParts.push(`Folate ${nutrition.avgDailyFolate.toFixed(0)}mcg`);
    if (nutrition.avgDailyThiamin) vitaminParts.push(`Thiamin ${nutrition.avgDailyThiamin.toFixed(2)}mg`);
    if (nutrition.avgDailyRiboflavin) vitaminParts.push(`Riboflavin ${nutrition.avgDailyRiboflavin.toFixed(2)}mg`);
    if (nutrition.avgDailyNiacin) vitaminParts.push(`Niacin ${nutrition.avgDailyNiacin.toFixed(1)}mg`);
    if (vitaminParts.length > 0) lines.push(`  Vitamins: ${vitaminParts.join(', ')}`);
    
    // Minerals line
    const mineralParts: string[] = [];
    if (nutrition.avgDailyCalcium) mineralParts.push(`Calcium ${nutrition.avgDailyCalcium.toFixed(0)}mg`);
    if (nutrition.avgDailyIron) mineralParts.push(`Iron ${nutrition.avgDailyIron.toFixed(1)}mg`);
    if (nutrition.avgDailyMagnesium) mineralParts.push(`Magnesium ${nutrition.avgDailyMagnesium.toFixed(0)}mg`);
    if (nutrition.avgDailyPotassium) mineralParts.push(`Potassium ${nutrition.avgDailyPotassium.toFixed(0)}mg`);
    if (nutrition.avgDailyZinc) mineralParts.push(`Zinc ${nutrition.avgDailyZinc.toFixed(1)}mg`);
    if (nutrition.avgDailyPhosphorus) mineralParts.push(`Phosphorus ${nutrition.avgDailyPhosphorus.toFixed(0)}mg`);
    if (nutrition.avgDailySelenium) mineralParts.push(`Selenium ${nutrition.avgDailySelenium.toFixed(0)}mcg`);
    if (nutrition.avgDailyCopper) mineralParts.push(`Copper ${nutrition.avgDailyCopper.toFixed(2)}mg`);
    if (nutrition.avgDailyManganese) mineralParts.push(`Manganese ${nutrition.avgDailyManganese.toFixed(2)}mg`);
    if (mineralParts.length > 0) lines.push(`  Minerals: ${mineralParts.join(', ')}`);
    
    // Water intake
    if (nutrition.avgDailyWater) lines.push(`  Water: ${(nutrition.avgDailyWater / 1000).toFixed(1)}L/day`);
    
    lines.push(`  Days tracked: ${nutrition.daysTracked}`);
    logger.info(`[FloOracle] Added nutrition summary to context (${nutrition.daysTracked} days, vitamins: ${vitaminParts.length}, minerals: ${mineralParts.length})`);
  }
  
  if (context.flomentumCurrent.score !== null) {
    lines.push(`Flōmentum score: ${context.flomentumCurrent.score}/100 (${context.flomentumCurrent.zone || 'calculating'}) | Daily focus: ${context.flomentumCurrent.dailyFocus || 'building baseline'}`);
  }
  
  // Add body composition explanation (DEXA vs HealthKit nuances)
  if (context.bodyCompositionExplanation) {
    lines.push('');
    lines.push('BODY COMPOSITION DATA SOURCES:');
    lines.push(context.bodyCompositionExplanation);
  }
  
  // Add environmental context (weather, air quality)
  if (context.environmentalContext) {
    const env = context.environmentalContext;
    lines.push('');
    lines.push('ENVIRONMENTAL CONDITIONS (today):');
    
    if (env.weather) {
      const w = env.weather;
      lines.push(`  Weather: ${w.weatherDescription}, ${Math.round(w.temperature)}°C (feels like ${Math.round(w.feelsLike)}°C)`);
      lines.push(`  Humidity: ${w.humidity}% | Wind: ${w.windSpeed.toFixed(1)} m/s | Pressure: ${w.pressure} hPa`);
      if (w.cityName) lines.push(`  Location: ${w.cityName}`);
    }
    
    if (env.airQuality) {
      const aq = env.airQuality;
      lines.push(`  Air Quality: ${aq.aqiLabel} (AQI ${aq.aqi})`);
      lines.push(`  PM2.5: ${aq.pm2_5.toFixed(1)} µg/m³ | PM10: ${aq.pm10.toFixed(1)} µg/m³ | O₃: ${aq.o3.toFixed(1)} µg/m³`);
    }
    
    if (env.stressFactors.length > 0) {
      lines.push(`  ⚠️ Environmental stress factors: ${env.stressFactors.join(', ')}`);
      lines.push('  (Consider these when interpreting HRV, sleep quality, and recovery metrics)');
    }
  }
  
  return lines.join('\n');
}

function buildFallbackContext(): string {
  return `USER CONTEXT (never shared with user):
No health data available yet. User has not uploaded blood work, diagnostic studies, or synced wearable data.
Encourage them to upload their first blood panel or sync their HealthKit data to get started.`;
}

/**
 * Retrieve relevant insight cards for RAG-enhanced context
 * Returns the top discovered patterns to inject into Flō Oracle's context
 * Reads from Supabase via healthStorageRouter
 */
export async function getRelevantInsights(userId: string, limit: number = 5): Promise<string> {
  try {
    // Use healthStorageRouter to get insight cards from Supabase
    let insights: any[] = [];
    
    if (isSupabaseHealthEnabled()) {
      try {
        const supabaseInsights = await getHealthRouterInsightCards(userId, true);
        if (supabaseInsights.length > 0) {
          insights = supabaseInsights.slice(0, limit);
          logger.info(`[FloOracle] Retrieved ${insights.length} insight cards from Supabase for user ${userId}`);
        }
      } catch (error) {
        logger.error('[FloOracle] Error fetching insight cards from Supabase, falling back to Neon:', error);
      }
    }
    
    // Fall back to Neon if Supabase returned no data (transition period)
    if (insights.length === 0) {
      const neonInsights = await db
        .select({
          category: insightCards.category,
          pattern: insightCards.pattern,
          confidence: insightCards.confidence,
          supportingData: insightCards.supportingData,
        })
        .from(insightCards)
        .where(
          and(
            eq(insightCards.userId, userId),
            eq(insightCards.isActive, true)
          )
        )
        .orderBy(desc(insightCards.confidence), desc(insightCards.createdAt))
        .limit(limit);
      
      insights = neonInsights;
      if (insights.length > 0) {
        logger.warn(`[FloOracle] Insight cards read from Neon (should be migrated to Supabase) for user ${userId}`);
      }
    }

    if (insights.length === 0) {
      return '';
    }

    const lines = [
      '',
      'DISCOVERED PATTERNS (use these insights naturally in conversation):',
    ];

    insights.forEach((insight: any, index: number) => {
      const confidence = insight.confidence || 0;
      const supportingData = insight.supportingData || insight.supporting_data || '';
      const pattern = insight.pattern || '';
      const confidencePercent = Math.round(confidence * 100);
      lines.push(`${index + 1}. ${pattern} (${confidencePercent}% confidence, ${supportingData})`);
    });

    logger.info(`[FloOracle] Retrieved ${insights.length} insight cards for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving insights:', error);
    return '';
  }
}

/**
 * Get recent life events to enhance conversational context
 * Returns user's logged behaviors from the past 14 days
 * Uses healthStorageRouter to read from Supabase
 */
export async function getRecentLifeEvents(userId: string, days: number = 14): Promise<string> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Use healthStorageRouter to fetch life events from Supabase
    const events = await getHealthRouterLifeEvents(userId, { startDate: cutoffDate, limit: 10 });

    if (events.length === 0) {
      return '';
    }

    const lines = [
      '',
      'RECENT LOGGED BEHAVIORS (reference these naturally when relevant):',
    ];

    events.forEach((event: any) => {
      const happenedAt = event.happened_at || event.happenedAt;
      const date = new Date(happenedAt);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const timeRef = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
      
      const eventType = event.event_type || event.eventType;
      let eventDesc = eventType.replace(/_/g, ' ');
      const details = event.details;
      if (details && typeof details === 'object') {
        if (details.duration_min) eventDesc += ` (${details.duration_min} min)`;
        if (details.drinks) eventDesc += ` (${details.drinks} drinks)`;
        if (details.names) eventDesc += ` (${details.names.join(', ')})`;
      }
      
      lines.push(`• ${timeRef}: ${eventDesc}`);
    });

    logger.info(`[FloOracle] Retrieved ${events.length} life events from Supabase for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving life events:', error);
    return '';
  }
}

/**
 * Get recent recovery sessions (sauna, ice bath) for AI context
 * Returns user's thermal recovery practices from the past 14 days
 * Uses healthStorageRouter to read from Supabase
 */
export async function getRecentRecoverySessions(userId: string, days: number = 14): Promise<string> {
  try {
    const sessions = await getHealthRouterRecoverySessions(userId, days);

    if (!sessions || sessions.length === 0) {
      return '';
    }

    const lines = [
      '',
      'RECOVERY SESSIONS (sauna & ice bath practices - reference when discussing recovery or stress resilience):',
    ];

    // Group sessions by type and summarize
    const saunaSessions = sessions.filter(s => s.session_type === 'sauna');
    const iceBathSessions = sessions.filter(s => s.session_type === 'icebath');

    // Calculate summary stats
    const totalSaunaMins = saunaSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const totalIceMins = iceBathSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const totalCalories = sessions.reduce((sum, s) => sum + (s.calories_burned || 0), 0);

    if (saunaSessions.length > 0) {
      const avgTemp = saunaSessions.reduce((sum, s) => sum + (s.temperature || 0), 0) / saunaSessions.length;
      lines.push(`  Sauna: ${saunaSessions.length} sessions (${totalSaunaMins} min total, avg temp ${Math.round(avgTemp)}°)`);
    }

    if (iceBathSessions.length > 0) {
      const avgTemp = iceBathSessions.reduce((sum, s) => sum + (s.temperature || 0), 0) / iceBathSessions.length;
      lines.push(`  Ice Bath: ${iceBathSessions.length} sessions (${totalIceMins} min total, avg temp ${Math.round(avgTemp)}°)`);
    }

    if (totalCalories > 0) {
      lines.push(`  Recovery calories burned: ${Math.round(totalCalories)} kcal`);
    }

    // Show recent individual sessions (last 5)
    const recentSessions = sessions.slice(0, 5);
    if (recentSessions.length > 0) {
      lines.push('  Recent sessions:');
      recentSessions.forEach(session => {
        const sessionDate = new Date(session.local_date || session.created_at);
        const daysAgo = Math.floor((Date.now() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
        const timeRef = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
        const type = session.session_type === 'sauna' ? 'Sauna' : 'Ice Bath';
        const duration = session.duration_minutes ? `${session.duration_minutes} min` : '';
        const temp = session.temperature ? `, ${session.temperature}°${session.temp_unit || 'F'}` : '';
        const feeling = session.feeling ? ` - felt ${session.feeling}` : '';
        lines.push(`    • ${timeRef}: ${type} ${duration}${temp}${feeling}`);
      });
    }

    // Add today's thermal recovery score if available
    const today = new Date().toISOString().split('T')[0];
    const thermalScore = await getDailyThermalRecoveryScore(userId, today);
    if (thermalScore !== null) {
      lines.push(`  Today's thermal recovery score: ${thermalScore}/100`);
    }

    logger.info(`[FloOracle] Retrieved ${sessions.length} recovery sessions for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving recovery sessions:', error);
    return '';
  }
}

/**
 * Get user's conversational memories (persistent personal context)
 * Returns extracted memories from past conversations: goals, moods, symptoms, habits, life events
 */
export async function getUserMemoriesContext(userId: string, limit: number = 20): Promise<string> {
  try {
    const memoriesContext = await getMemoriesAsContext(userId, limit);
    
    if (!memoriesContext) {
      return '';
    }

    logger.info(`[FloOracle] Retrieved conversational memories for user ${userId}`);
    return '\n\nCONVERSATIONAL MEMORY (things the user has told you before - use naturally):\n' + memoriesContext;
  } catch (error) {
    logger.error('[FloOracle] Error retrieving conversational memories:', error);
    return '';
  }
}

/**
 * Get the timestamp of the user's last conversation with Flō Oracle
 * Used to determine if an anomaly is NEW (detected after last conversation)
 */
async function getLastConversationTimestamp(userId: string): Promise<Date | null> {
  try {
    const lastChat = await db.select({ createdAt: floChatMessages.createdAt })
      .from(floChatMessages)
      .where(eq(floChatMessages.userId, userId))
      .orderBy(desc(floChatMessages.createdAt))
      .limit(1);
    
    if (lastChat.length > 0) {
      return lastChat[0].createdAt;
    }
    return null;
  } catch (error) {
    logger.error('[FloOracle] Error fetching last conversation timestamp:', error);
    return null;
  }
}

/**
 * Get ML correlation insights for enhanced AI context
 * Tries ClickHouse first (primary), falls back to BigQuery if unavailable
 * Returns detected anomalies and patterns from the ML engine
 * Marks anomalies as [NEW] if detected after last conversation, [PREVIOUSLY DISCUSSED] otherwise
 */
export async function getCorrelationInsightsContext(userId: string): Promise<string> {
  const { getHealthId } = await import('./supabaseHealthStorage');
  
  const healthId = await getHealthId(userId);
  if (!healthId) {
    logger.debug('[FloOracle] No healthId found for correlation insights');
    return '';
  }
  
  try {
    // Use Supabase baseline engine to detect anomalies (replaces ClickHouse ML engine)
    const anomalies = await supabaseBaselineEngine.detectAnomalies(userId, 90);
    
    if (anomalies.length === 0) return '';
    
    const lines = ['', 'HEALTH PATTERN INSIGHTS (detected from your 90-day baselines - reference when relevant):'];
    
    const lastConversation = await getLastConversationTimestamp(userId);
    const newAnomalies = anomalies.filter(a => {
      if (!a.detectedAt || !lastConversation) return true;
      return new Date(a.detectedAt) > lastConversation;
    });
    const oldAnomalies = anomalies.filter(a => !newAnomalies.includes(a));
    
    if (newAnomalies.length > 0) {
      lines.push('');
      lines.push('[NEW] PATTERNS TO PROACTIVELY DISCUSS (mention these at the START of the conversation):');
      for (const a of newAnomalies.slice(0, 5)) {
        const dir = a.direction === 'above' ? 'elevated' : 'low';
        const pct = Math.abs(Math.round(a.deviationPercent));
        lines.push(`  • [NEW] ${a.label ?? a.metricType}: ${dir} (${pct}% from your 90-day baseline) - ${a.severity} severity`);
      }
    }
    
    if (oldAnomalies.length > 0) {
      lines.push('');
      lines.push('[PREVIOUSLY DISCUSSED] Known patterns (only reference if user asks or directly relevant):');
      for (const a of oldAnomalies.slice(0, 3)) {
        const dir = a.direction === 'above' ? 'elevated' : 'low';
        const pct = Math.abs(Math.round(a.deviationPercent));
        lines.push(`  • ${a.label ?? a.metricType}: ${dir} (${pct}% from baseline) - ${a.severity} severity`);
      }
    }
    
    logger.info(`[FloOracle] Added ${newAnomalies.length} NEW and ${oldAnomalies.length} known anomalies to context`);
    return lines.join('\n');
  } catch (error) {
    logger.debug('[FloOracle] Anomaly detection unavailable for context:', error);
    return '';
  }
}
/**
 * Get user's current life context (travel, stress, disruptions, etc.)
 * Returns active situational factors that may affect their health data interpretation
 */
export async function getActiveLifeContextForOracle(userId: string): Promise<string> {
  try {
    const contexts = await getActiveLifeContext(userId);
    
    if (!contexts || contexts.length === 0) {
      return '';
    }
    
    const lines = [
      '',
      'CURRENT LIFE CONTEXT (temporary situations affecting their health - use to adjust recommendations):',
    ];
    
    for (const context of contexts) {
      const dateRange = context.end_date 
        ? `(${new Date(context.start_date).toLocaleDateString()} - ${new Date(context.end_date).toLocaleDateString()})`
        : `(since ${new Date(context.start_date).toLocaleDateString()})`;
      
      lines.push(`• ${context.category}: ${context.description} ${dateRange}`);
      
      if (context.expected_impact) {
        lines.push(`  Expected impact: ${context.expected_impact}`);
      }
    }
    
    logger.info(`[FloOracle] Retrieved ${contexts.length} active life context facts for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving life context:', error);
    return '';
  }
}

/**
 * Get user's active action plan items
 * Returns personalized health goals and actions the user is working on
 * Reads from Supabase via healthStorageRouter
 */
export async function getActiveActionPlanItems(userId: string): Promise<string> {
  try {
    // Try to get action plan items from Supabase first
    let items: any[] = [];
    
    if (isSupabaseHealthEnabled()) {
      try {
        const supabaseItems = await getSupabaseActionPlanItems(userId, 'active');
        if (supabaseItems.length > 0) {
          items = supabaseItems.map((item: any) => ({
            title: item.snapshot_title || item.title,
            insight: item.snapshot_insight || item.description,
            action: item.snapshot_action,
            category: item.category,
            targetBiomarker: item.target_biomarker,
            currentValue: item.current_value,
            targetValue: item.target_value,
            unit: item.unit || item.target_unit,
            status: item.status,
            addedAt: item.added_at || item.created_at,
          }));
          logger.info(`[FloOracle] Retrieved ${items.length} action plan items from Supabase for user ${userId}`);
        }
      } catch (error) {
        logger.error('[FloOracle] Error fetching action plan items from Supabase, falling back to Neon:', error);
      }
    }
    
    // Fall back to Neon if Supabase returned no data (for transition period)
    if (items.length === 0) {
      const neonItems = await db
        .select({
          title: actionPlanItems.snapshotTitle,
          insight: actionPlanItems.snapshotInsight,
          action: actionPlanItems.snapshotAction,
          category: actionPlanItems.category,
          targetBiomarker: actionPlanItems.targetBiomarker,
          currentValue: actionPlanItems.currentValue,
          targetValue: actionPlanItems.targetValue,
          unit: actionPlanItems.unit,
          status: actionPlanItems.status,
          addedAt: actionPlanItems.addedAt,
        })
        .from(actionPlanItems)
        .where(
          and(
            eq(actionPlanItems.userId, userId),
            eq(actionPlanItems.status, 'active')
          )
        )
        .orderBy(desc(actionPlanItems.addedAt))
        .limit(10);
      
      items = neonItems;
      if (items.length > 0) {
        logger.warn(`[FloOracle] Action plan items read from Neon (should be migrated to Supabase) for user ${userId}`);
      }
    }

    if (items.length === 0) {
      return '';
    }

    const lines = [
      '',
      'ACTION PLAN (user\'s active health goals - reference these to provide accountability and progress tracking):',
    ];

    items.forEach((item, index) => {
      const parts: string[] = [];
      
      if (item.title) {
        parts.push(`**${item.title}**`);
      }
      
      if (item.action) {
        parts.push(`Action: ${item.action}`);
      }
      
      if (item.targetBiomarker && item.currentValue !== null && item.targetValue !== null) {
        parts.push(`Target: ${item.targetBiomarker} from ${item.currentValue} → ${item.targetValue}${item.unit ? ' ' + item.unit : ''}`);
      }
      
      if (item.category) {
        parts.push(`Category: ${item.category}`);
      }
      
      const daysAgo = item.addedAt ? Math.floor((Date.now() - new Date(item.addedAt).getTime()) / (1000 * 60 * 60 * 24)) : null;
      if (daysAgo !== null) {
        const timeRef = daysAgo === 0 ? 'added today' : daysAgo === 1 ? 'added yesterday' : `added ${daysAgo} days ago`;
        parts.push(`(${timeRef})`);
      }
      
      lines.push(`${index + 1}. ${parts.join(' | ')}`);
      
      if (item.insight) {
        lines.push(`   Why: ${item.insight}`);
      }
    });

    logger.info(`[FloOracle] Retrieved ${items.length} active action plan items for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving action plan items:', error);
    return '';
  }
}

/**
 * Get recent conversation history from past Flō Oracle voice sessions
 * Returns formatted context for conversation continuity
 * Only includes voice sessions (voice_*), excludes admin sandbox (voice_admin_*)
 * Drops legacy/null sessionId records to prevent mixing unrelated content
 */
export async function getRecentChatHistory(userId: string, limit: number = 20): Promise<string> {
  try {
    const recentMessages = await db
      .select({
        id: floChatMessages.id,
        sender: floChatMessages.sender,
        message: floChatMessages.message,
        sessionId: floChatMessages.sessionId,
        createdAt: floChatMessages.createdAt,
      })
      .from(floChatMessages)
      .where(eq(floChatMessages.userId, userId))
      .orderBy(desc(floChatMessages.createdAt))
      .limit(limit * 3); // Fetch extra to filter non-voice sessions
    
    if (recentMessages.length === 0) {
      return '';
    }
    
    // Strict filtering for voice channel conversations only
    const filteredMessages = recentMessages.filter(msg => {
      // REQUIRE sessionId - drop legacy/null records to prevent mixing
      if (!msg.sessionId) {
        return false;
      }
      
      // Only include voice sessions (sessionId starts with "voice_")
      if (!msg.sessionId.startsWith('voice_')) {
        return false;
      }
      
      // Exclude admin sandbox sessions
      if (msg.sessionId.startsWith('voice_admin_')) {
        return false;
      }
      
      // Only include user and flo messages
      if (msg.sender !== 'user' && msg.sender !== 'flo') {
        return false;
      }
      
      return true;
    }).slice(0, limit);
    
    if (filteredMessages.length === 0) {
      return '';
    }
    
    // Reverse to get chronological order (oldest first)
    const chronologicalMessages = filteredMessages.reverse();
    
    // Group messages by session for context
    const sessionMessages = new Map<string, typeof chronologicalMessages>();
    for (const msg of chronologicalMessages) {
      const sessionKey = msg.sessionId!; // Guaranteed non-null by filter
      if (!sessionMessages.has(sessionKey)) {
        sessionMessages.set(sessionKey, []);
      }
      sessionMessages.get(sessionKey)!.push(msg);
    }
    
    // Create clearly delimited section with anti-repetition reminder
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════',
      'PREVIOUS VOICE CONVERSATIONS (CHECK BEFORE MENTIONING ANY HEALTH METRIC):',
      '[CRITICAL: If you see yourself already mentioned a metric below, DO NOT repeat it]',
      '═══════════════════════════════════════════════════════════',
    ];
    
    // Track global turn number across sessions
    let globalTurnNumber = 1;
    
    // Format messages, showing context of recent voice conversations with clear turn numbers
    for (const [sessionId, messages] of sessionMessages) {
      if (messages.length > 0) {
        const sessionDate = messages[0].createdAt;
        const timeAgo = formatTimeAgo(sessionDate);
        
        lines.push(`\n[Voice session from ${timeAgo}]`);
        
        for (const msg of messages) {
          const speaker = msg.sender === 'user' ? 'User' : 'Flō';
          // Truncate long messages to save context space
          const truncatedMsg = msg.message.length > 250 
            ? msg.message.substring(0, 250) + '...' 
            : msg.message;
          // Clear turn-by-turn format so Gemini can easily see what was already said
          lines.push(`  Turn ${globalTurnNumber}: ${speaker} said: "${truncatedMsg}"`);
          globalTurnNumber++;
        }
      }
    }
    
    lines.push('');
    lines.push('[END OF HISTORY - Remember: topics mentioned above are OLD NEWS]');
    lines.push('═══════════════════════════════════════════════════════════');
    
    logger.info(`[FloOracle] Retrieved ${chronologicalMessages.length} voice chat messages for user ${userId} (filtered from ${recentMessages.length})`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving chat history:', error);
    return '';
  }
}

/**
 * Get recent behavior attribution insights for the Oracle
 * Surfaces causal hypotheses linking outcomes to specific behaviors
 */
export async function getBehaviorAttributionInsights(userId: string): Promise<string> {
  try {
    // Get user's health_id from profile
    const profile = await getHealthRouterProfile(userId);
    if (!profile?.health_id) {
      return '';
    }

    const recentAttributions = await behaviorAttributionEngine.getRecentAttributions(profile.health_id, 3);
    
    if (recentAttributions.length === 0) {
      return '';
    }

    const lines = [
      '',
      'BEHAVIOR ATTRIBUTION INSIGHTS (detected patterns linking behaviors to outcomes):',
      '[Use these to provide personalized causal analysis when discussing health metrics]',
    ];

    for (const attribution of recentAttributions) {
      const direction = attribution.outcomeDeviationPct > 0 ? 'improvement' : 'decline';
      const metricLabel = attribution.outcomeMetric.replace(/_/g, ' ');
      
      lines.push(`• ${metricLabel}: ${Math.abs(Math.round(attribution.outcomeDeviationPct))}% ${direction}`);
      
      if (attribution.attributedFactors.length > 0) {
        const topFactors = attribution.attributedFactors.slice(0, 3);
        for (const factor of topFactors) {
          const changeDir = factor.deviation > 0 ? 'higher' : 'lower';
          lines.push(`  - ${factor.category} ${factor.key}: ${Math.abs(Math.round(factor.deviation))}% ${changeDir} than usual (${factor.value} vs baseline ${factor.baselineValue?.toFixed(1) || 'unknown'})`);
        }
        
        if (attribution.experimentSuggestion) {
          lines.push(`  💡 Suggestion: ${attribution.experimentSuggestion}`);
        }
      }
    }

    logger.info(`[FloOracle] Retrieved ${recentAttributions.length} behavior attribution insights for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving behavior attributions:', error);
    return '';
  }
}

/**
 * Helper function to format time ago
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) {
    return diffMins <= 1 ? 'just now' : `${diffMins} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffDays < 7) {
    return diffDays === 1 ? 'yesterday' : `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * Get user's active N-of-1 supplement experiments
 * Returns context about what supplements the user is testing, their goals, and current progress
 */
export async function getActiveSupplementExperiments(userId: string): Promise<string> {
  try {
    const { n1ExperimentService } = await import('./n1ExperimentService');
    const { getSupplementConfig } = await import('../../shared/supplementConfig');
    const { getHealthId } = await import('./supabaseHealthStorage');
    
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return '';
    }
    
    const experiments = await n1ExperimentService.getUserExperiments(userId);
    
    const activeExperiments = experiments.filter(exp => 
      ['baseline', 'active', 'pending'].includes(exp.status)
    );
    
    const recentCompletedExperiments = experiments
      .filter(exp => exp.status === 'completed')
      .slice(0, 3);
    
    if (activeExperiments.length === 0 && recentCompletedExperiments.length === 0) {
      return '';
    }
    
    const lines: string[] = [
      '',
      'SUPPLEMENT EXPERIMENTS (N-of-1 personal assessments the user is running):',
    ];
    
    for (const exp of activeExperiments) {
      const supplementConfig = getSupplementConfig(exp.supplement_type_id);
      const supplementName = supplementConfig?.name || exp.product_name;
      
      const daysElapsed = exp.experiment_start_date 
        ? Math.floor((Date.now() - new Date(exp.experiment_start_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      const totalDays = exp.experiment_days;
      const progress = totalDays > 0 ? Math.min(Math.round((daysElapsed / totalDays) * 100), 100) : 0;
      
      let statusDescription = '';
      if (exp.status === 'pending') {
        statusDescription = 'about to start';
      } else if (exp.status === 'baseline') {
        statusDescription = `collecting baseline data (day ${daysElapsed} of ${exp.baseline_days})`;
      } else if (exp.status === 'active') {
        statusDescription = `actively taking supplement (day ${daysElapsed} of ${totalDays}, ${progress}% complete)`;
      }
      
      lines.push(`• **${supplementName}** (${exp.product_name}${exp.product_brand ? ` by ${exp.product_brand}` : ''})`);
      lines.push(`  - Goal: ${exp.primary_intent.replace(/_/g, ' ')}`);
      lines.push(`  - Dosage: ${exp.dosage_amount}${exp.dosage_unit} ${exp.dosage_frequency}${exp.dosage_timing ? ` (${exp.dosage_timing})` : ''}`);
      lines.push(`  - Status: ${statusDescription}`);
      
      if (supplementConfig?.subjectiveMetrics?.length) {
        const trackingMetrics = supplementConfig.subjectiveMetrics.slice(0, 4).map(m => m.metric).join(', ');
        lines.push(`  - Tracking: ${trackingMetrics}`);
      }
    }
    
    if (recentCompletedExperiments.length > 0) {
      lines.push('');
      lines.push('Recently Completed Experiments:');
      
      for (const exp of recentCompletedExperiments) {
        const supplementConfig = getSupplementConfig(exp.supplement_type_id);
        const supplementName = supplementConfig?.name || exp.product_name;
        const completedDate = exp.completed_at 
          ? new Date(exp.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'recently';
        
        lines.push(`• ${supplementName}: Completed ${completedDate} - Goal was ${exp.primary_intent.replace(/_/g, ' ')}`);
      }
    }
    
    logger.info(`[FloOracle] Retrieved ${activeExperiments.length} active and ${recentCompletedExperiments.length} completed experiments for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving supplement experiments:', error);
    return '';
  }
}
