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
  actionPlanItems
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { logger } from '../logger';

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
  };
  flomentumCurrent: {
    score: number | null;
    zone: string | null;
    dailyFocus: string | null;
  };
  bodyCompositionExplanation: string | null;
}

// Import age calculation utility that uses mid-year (July 1st) assumption for ±6 month accuracy
import { calculateAgeFromBirthYear } from "@shared/utils/ageCalculation";

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
      },
      flomentumCurrent: {
        score: null,
        zone: null,
        dailyFocus: null,
      },
      bodyCompositionExplanation: null,
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
    
    const [userProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (userProfile) {
      context.age = calculateAgeFromBirthYear(userProfile.birthYear);
      context.sex = userProfile.sex || 'unknown';
      context.primaryGoals = Array.isArray(userProfile.goals) ? userProfile.goals : [];
    }

    // Fetch ALL blood panels from the last 12 months (for historical context)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const allSessions = await db
      .select()
      .from(biomarkerTestSessions)
      .where(
        and(
          eq(biomarkerTestSessions.userId, userId),
          gte(biomarkerTestSessions.testDate, twelveMonthsAgo)
        )
      )
      .orderBy(desc(biomarkerTestSessions.testDate));

    const bloodPanelHistory: BloodPanelHistory[] = [];

    if (allSessions.length > 0) {
      // Process latest panel for backward compatibility
      const latestSession = allSessions[0];
      context.latestBloodPanel.date = formatDateInTimezone(latestSession.testDate, userTimezone);
      
      // Fetch biomarkers for ALL sessions
      for (const session of allSessions) {
        const measurements = await db
          .select({
            biomarkerName: biomarkers.name,
            value: biomarkerMeasurements.valueDisplay,
          })
          .from(biomarkerMeasurements)
          .innerJoin(biomarkers, eq(biomarkerMeasurements.biomarkerId, biomarkers.id))
          .where(eq(biomarkerMeasurements.sessionId, session.id));

        const biomarkerMap: Record<string, string> = {};
        measurements.forEach((m) => {
          biomarkerMap[m.biomarkerName] = m.value;
        });
        
        // Store this panel in history
        if (Object.keys(biomarkerMap).length > 0) {
          bloodPanelHistory.push({
            date: formatDateInTimezone(session.testDate, userTimezone),
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
      }
    }

    const latestCAC = await db
      .select()
      .from(diagnosticsStudies)
      .where(
        and(
          eq(diagnosticsStudies.userId, userId),
          eq(diagnosticsStudies.type, 'coronary_calcium_score')
        )
      )
      .orderBy(desc(diagnosticsStudies.studyDate))
      .limit(1);

    if (latestCAC.length > 0) {
      const cac = latestCAC[0];
      const payload = cac.aiPayload as Record<string, any> || {};
      context.latestCAC.score = cac.totalScoreNumeric ?? payload.cacScore ?? null;
      context.latestCAC.percentile = cac.agePercentile?.toString() ?? payload.percentile ?? null;
      context.latestCAC.date = formatDateInTimezone(cac.studyDate, userTimezone);
    }

    const latestDEXA = await db
      .select()
      .from(diagnosticsStudies)
      .where(
        and(
          eq(diagnosticsStudies.userId, userId),
          eq(diagnosticsStudies.type, 'dexa_scan')
        )
      )
      .orderBy(desc(diagnosticsStudies.studyDate))
      .limit(1);

    if (latestDEXA.length > 0) {
      const dexa = latestDEXA[0];
      const payload = dexa.aiPayload as Record<string, any> || {};
      context.latestDEXA.visceralFat = payload.visceralFatMass ?? null;
      context.latestDEXA.leanMass = payload.totalLeanMass ?? null;
      context.latestDEXA.bodyFat = payload.totalBodyFat ?? null;
      context.latestDEXA.date = formatDateInTimezone(dexa.studyDate, userTimezone);
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = formatDateInTimezone(sevenDaysAgo, userTimezone);

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

    const sleepData = await db
      .select({
        avgSleep: sql<number>`AVG(${sleepNights.totalSleepMin})`,
      })
      .from(sleepNights)
      .where(
        and(
          eq(sleepNights.userId, userId),
          gte(sleepNights.sleepDate, sevenDaysAgoStr)
        )
      );

    if (sleepData.length > 0 && sleepData[0]?.avgSleep) {
      const hours = Math.floor(sleepData[0].avgSleep / 60);
      const mins = Math.round(sleepData[0].avgSleep % 60);
      context.wearableAvg7Days.sleep = `${hours}h${mins}m`;
    }

    // Fetch all additional HealthKit metrics from healthkitSamples table (last 7 days)
    const sevenDaysAgoTimestamp = new Date();
    sevenDaysAgoTimestamp.setDate(sevenDaysAgoTimestamp.getDate() - 7);

    // Helper function to get average value for a metric type
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

    // Helper function to get latest value for point-in-time metrics (weight, height, etc.)
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

    // Fetch all additional HealthKit metrics
    const [
      weight,
      height,
      bmi,
      bodyFatPct,
      leanBodyMass,
      distance,
      basalEnergy,
      flightsClimbed,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      oxygenSaturation,
      respiratoryRate,
      bloodGlucose,
      bodyTemp,
      vo2Max,
      walkingHR,
      waistCircumference,
      dietaryWater,
      exerciseTime,
      standTime
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

    context.healthkitMetrics = {
      weight: weight ? Math.round(weight * 10) / 10 : null,
      height: height ? Math.round(height) : null,
      bmi: bmi ? Math.round(bmi * 10) / 10 : null,
      bodyFatPct: bodyFatPct ? Math.round(bodyFatPct * 10) / 10 : null,
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
    };
    
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
        const parts: string[] = [];
        if (mostRecentWeight?.weightKg) parts.push(`Weight: ${mostRecentWeight.weightKg.toFixed(1)} kg`);
        if (mostRecentBodyFat?.bodyFatPercent) parts.push(`Body fat: ${mostRecentBodyFat.bodyFatPercent.toFixed(1)}%`);
        if (mostRecentLeanMass?.leanBodyMassKg) parts.push(`Lean mass: ${mostRecentLeanMass.leanBodyMassKg.toFixed(1)} kg`);
        context.bodyCompositionExplanation = `HealthKit data: ${parts.join(', ')}`;
      } else {
        context.bodyCompositionExplanation = null;
      }
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch body composition data');
      context.bodyCompositionExplanation = null;
    }

    const contextString = buildContextString(context, bloodPanelHistory, workoutHistory);
    logger.info(`[FloOracle] Context built successfully (${contextString.length} chars)`);
    
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

function buildContextString(context: UserHealthContext, bloodPanelHistory: BloodPanelHistory[] = [], workoutHistory: any[] = []): string {
  const lines: string[] = ['USER CONTEXT (never shared with user):'];
  
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
  
  if (context.flomentumCurrent.score !== null) {
    lines.push(`Flōmentum score: ${context.flomentumCurrent.score}/100 (${context.flomentumCurrent.zone || 'calculating'}) | Daily focus: ${context.flomentumCurrent.dailyFocus || 'building baseline'}`);
  }
  
  // Add body composition explanation (DEXA vs HealthKit nuances)
  if (context.bodyCompositionExplanation) {
    lines.push('');
    lines.push('BODY COMPOSITION DATA SOURCES:');
    lines.push(context.bodyCompositionExplanation);
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
 */
export async function getRelevantInsights(userId: string, limit: number = 5): Promise<string> {
  try {
    const insights = await db
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

    if (insights.length === 0) {
      return '';
    }

    const lines = [
      '',
      'DISCOVERED PATTERNS (use these insights naturally in conversation):',
    ];

    insights.forEach((insight, index) => {
      const confidencePercent = Math.round(insight.confidence * 100);
      lines.push(`${index + 1}. ${insight.pattern} (${confidencePercent}% confidence, ${insight.supportingData})`);
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
 */
export async function getRecentLifeEvents(userId: string, days: number = 14): Promise<string> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const events = await db
      .select({
        eventType: lifeEvents.eventType,
        details: lifeEvents.details,
        notes: lifeEvents.notes,
        happenedAt: lifeEvents.happenedAt,
      })
      .from(lifeEvents)
      .where(
        and(
          eq(lifeEvents.userId, userId),
          gte(lifeEvents.happenedAt, cutoffDate)
        )
      )
      .orderBy(desc(lifeEvents.happenedAt))
      .limit(10);

    if (events.length === 0) {
      return '';
    }

    const lines = [
      '',
      'RECENT LOGGED BEHAVIORS (reference these naturally when relevant):',
    ];

    events.forEach((event) => {
      const date = new Date(event.happenedAt);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const timeRef = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
      
      let eventDesc = event.eventType.replace(/_/g, ' ');
      if (event.details && typeof event.details === 'object') {
        const details = event.details as Record<string, any>;
        if (details.duration_min) eventDesc += ` (${details.duration_min} min)`;
        if (details.drinks) eventDesc += ` (${details.drinks} drinks)`;
        if (details.names) eventDesc += ` (${details.names.join(', ')})`;
      }
      
      lines.push(`• ${timeRef}: ${eventDesc}`);
    });

    logger.info(`[FloOracle] Retrieved ${events.length} life events for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving life events:', error);
    return '';
  }
}

/**
 * Get user's active action plan items
 * Returns personalized health goals and actions the user is working on
 */
export async function getActiveActionPlanItems(userId: string): Promise<string> {
  try {
    const items = await db
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
