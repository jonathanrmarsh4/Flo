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
  type EnvironmentalContext,
} from './healthStorageRouter';
import { getDailyMetrics as getSupabaseDailyMetrics, getActionPlanItems as getSupabaseActionPlanItems } from './supabaseHealthStorage';

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
}

// Import age calculation utility that uses mid-year (July 1st) assumption for ±6 month accuracy
import { calculateAgeFromBirthYear } from "@shared/utils/ageCalculation";
import { getMemoriesAsContext } from './userMemoryService';

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

    // Check if Supabase is enabled for routing wearable data
    const supabaseEnabled = isSupabaseHealthEnabled();
    logger.info(`[FloOracle] Supabase health enabled: ${supabaseEnabled}`);

    if (supabaseEnabled) {
      // Fetch wearable averages from Supabase user_daily_metrics
      try {
        const supabaseWearableMetrics = await getSupabaseDailyMetrics(userId, 7);
        
        if (supabaseWearableMetrics.length > 0) {
          // Calculate averages for wearable metrics
          const avgMetricWearable = (key: keyof typeof supabaseWearableMetrics[0]) => {
            const values = supabaseWearableMetrics
              .map(m => m[key] as number | null | undefined)
              .filter((v): v is number => v != null && !isNaN(v));
            return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
          };
          
          context.wearableAvg7Days.hrv = avgMetricWearable('hrv_ms') ? Math.round(avgMetricWearable('hrv_ms')!) : null;
          context.wearableAvg7Days.rhr = avgMetricWearable('resting_hr_bpm') ? Math.round(avgMetricWearable('resting_hr_bpm')!) : null;
          context.wearableAvg7Days.steps = avgMetricWearable('steps_raw_sum') ? Math.round(avgMetricWearable('steps_raw_sum')!) : null;
          context.wearableAvg7Days.activeKcal = avgMetricWearable('active_energy_kcal') ? Math.round(avgMetricWearable('active_energy_kcal')!) : null;
          
          // Also calculate sleep from Supabase
          const avgSleepHours = avgMetricWearable('sleep_hours');
          if (avgSleepHours) {
            const hours = Math.floor(avgSleepHours);
            const mins = Math.round((avgSleepHours - hours) * 60);
            context.wearableAvg7Days.sleep = `${hours}h${mins}m`;
          }
          
          logger.info(`[FloOracle] Fetched wearable averages from Supabase (${supabaseWearableMetrics.length} days) - steps: ${context.wearableAvg7Days.steps}, hrv: ${context.wearableAvg7Days.hrv}`);
        }
      } catch (error) {
        logger.error('[FloOracle] Error fetching Supabase wearable metrics, falling back to Neon:', error);
        // Fall through to Neon query below
      }
    }
    
    // If Supabase not enabled OR Supabase query didn't populate data, fall back to Neon
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

    // Fetch sleep data from sleepNights via router (routes to Supabase)
    try {
      const sleepNightsData = await getHealthRouterSleepNights(userId, 7);
      if (sleepNightsData.length > 0) {
        const totalSleepMins = sleepNightsData
          .filter(s => s.totalSleepMin != null)
          .map(s => s.totalSleepMin as number);
        if (totalSleepMins.length > 0) {
          const avgSleep = totalSleepMins.reduce((a, b) => a + b, 0) / totalSleepMins.length;
          const hours = Math.floor(avgSleep / 60);
          const mins = Math.round(avgSleep % 60);
          context.wearableAvg7Days.sleep = `${hours}h${mins}m`;
        }
      }
    } catch (error) {
      logger.error('[FloOracle] Error fetching sleep nights from Supabase:', error);
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
          
          context.healthkitMetrics = {
            weight: latest.weight_kg ? Math.round(latest.weight_kg * 10) / 10 : null,
            height: latest.height_cm ? Math.round(latest.height_cm) : null,
            bmi: latest.bmi ? Math.round(latest.bmi * 10) / 10 : null,
            bodyFatPct: latest.body_fat_percent ? Math.round(latest.body_fat_percent * 10) / 10 : null,
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
          
          logger.info(`[FloOracle] Fetched HealthKit metrics from Supabase (${supabaseMetrics.length} days)`);
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

    const contextString = buildContextString(context, bloodPanelHistory, workoutHistory) + lifeEventsContext;
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
        healthkitMetrics.weight = getField(mostRecent, 'weight_kg', 'weightKg');
        healthkitMetrics.height = getField(mostRecent, 'height_cm', 'heightCm');
        healthkitMetrics.bmi = mostRecent.bmi;
        healthkitMetrics.bodyFatPct = getField(mostRecent, 'body_fat_percent', 'bodyFatPercent');
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
