import { db } from "../db";
import { users, profiles, biomarkerTestSessions, biomarkerMeasurements, nutritionDailyMetrics, mindfulnessSessions, mindfulnessDailyMetrics } from "@shared/schema";
import { eq, gte, lte, and, desc } from "drizzle-orm";
import * as supabaseHealth from "./supabaseHealthStorage";
import { createLogger } from "../utils/logger";

const logger = createLogger("HealthStorageRouter");

export function isSupabaseHealthEnabled(): boolean {
  return process.env.SUPABASE_HEALTH_ENABLED === "true";
}

const healthIdCache = new Map<string, string>();

export async function getHealthId(userId: string): Promise<string> {
  if (healthIdCache.has(userId)) {
    return healthIdCache.get(userId)!;
  }

  const [user] = await db.select({ healthId: users.healthId }).from(users).where(eq(users.id, userId));
  
  if (!user?.healthId) {
    throw new Error(`No health_id found for user ${userId}`);
  }

  healthIdCache.set(userId, user.healthId);
  return user.healthId;
}

export function clearHealthIdCache(userId?: string): void {
  if (userId) {
    healthIdCache.delete(userId);
  } else {
    healthIdCache.clear();
  }
}

export async function getProfile(userId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const profile = await supabaseHealth.getProfile(userId);
      if (profile) {
        return {
          id: profile.id,
          userId: userId,
          sex: profile.sex as "Male" | "Female" | "Other" | null,
          birthYear: profile.birth_year ?? null,
          weight: profile.weight,
          weightUnit: profile.weight_unit as "kg" | "lbs" | null,
          height: profile.height,
          heightUnit: profile.height_unit as "cm" | "inches" | null,
          goals: profile.goals,
          healthBaseline: profile.health_baseline,
          aiPersonalization: profile.ai_personalization,
          reminderType: null,
          reminderTime: null,
          createdAt: profile.created_at ? new Date(profile.created_at) : new Date(),
          updatedAt: profile.updated_at ? new Date(profile.updated_at) : new Date(),
        };
      }
      return undefined;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getProfile failed, falling back to Neon:", error);
    }
  }
  
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  return profile;
}

export async function upsertProfile(userId: string, data: any) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const supabaseData: Partial<supabaseHealth.HealthProfile> = {
      sex: data.sex,
      birth_year: data.birthYear,
      weight: data.weight,
      weight_unit: data.weightUnit,
      height: data.height,
      height_unit: data.heightUnit,
      goals: data.goals,
      health_baseline: data.healthBaseline,
      ai_personalization: data.aiPersonalization,
    };
    
    const result = await supabaseHealth.upsertProfile(userId, supabaseData);
    
    return {
      id: result.id,
      userId: userId,
      sex: result.sex as "Male" | "Female" | "Other" | null,
      birthYear: result.birth_year ?? null,
      weight: result.weight,
      weightUnit: result.weight_unit as "kg" | "lbs" | null,
      height: result.height,
      heightUnit: result.height_unit as "cm" | "inches" | null,
      goals: result.goals,
      healthBaseline: result.health_baseline,
      aiPersonalization: result.ai_personalization,
      reminderType: null,
      reminderTime: null,
      createdAt: result.created_at ? new Date(result.created_at) : new Date(),
      updatedAt: result.updated_at ? new Date(result.updated_at) : new Date(),
    };
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase upsertProfile failed:", error);
    throw error;
  }
}

interface GetSleepNightsOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getSleepNights(userId: string, optionsOrDays: GetSleepNightsOptions | number = 7) {
  // Normalize input: convert numeric days to options object with date range
  let options: GetSleepNightsOptions;
  if (typeof optionsOrDays === 'number') {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - optionsOrDays);
    options = { startDate, endDate, limit: optionsOrDays };
  } else {
    options = optionsOrDays;
  }
  
  if (isSupabaseHealthEnabled()) {
    try {
      // Pass normalized options to Supabase
      const results = await supabaseHealth.getSleepNights(userId, options);
      // Normalize Supabase snake_case to camelCase for API compatibility
      // Field names MUST match what upsertSleepNight stores and what routes.ts expects
      return results.map(r => ({
        id: r.id,
        userId: userId,
        sleepDate: r.sleep_date,
        timezone: r.timezone,
        nightStart: r.night_start,
        finalWake: r.final_wake,
        sleepOnset: r.sleep_onset,
        timeInBedMin: r.time_in_bed_min,
        totalSleepMin: r.total_sleep_min,
        sleepEfficiencyPct: r.sleep_efficiency_pct,
        sleepLatencyMin: r.sleep_latency_min,
        wasoMin: r.waso_min,
        numAwakenings: r.num_awakenings,
        coreSleepMin: r.core_sleep_min,
        deepSleepMin: r.deep_sleep_min,
        remSleepMin: r.rem_sleep_min,
        unspecifiedSleepMin: r.unspecified_sleep_min,
        awakeInBedMin: r.awake_in_bed_min,
        midSleepTimeLocal: r.mid_sleep_time_local,
        fragmentationIndex: r.fragmentation_index,
        deepPct: r.deep_pct,
        remPct: r.rem_pct,
        corePct: r.core_pct,
        bedtimeLocal: r.bedtime_local,
        waketimeLocal: r.waketime_local,
        restingHrBpm: r.resting_hr_bpm,
        hrvMs: r.hrv_ms,
        respiratoryRate: r.respiratory_rate,
        wristTemperature: r.wrist_temperature,
        oxygenSaturation: r.oxygen_saturation,
        createdAt: r.created_at ? new Date(r.created_at) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at) : null,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getSleepNights failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon with normalized options
  const { storage } = await import("../storage");
  return await storage.getSleepNights(userId, options);
}

export async function getSleepNightByDate(userId: string, sleepDate: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      // Use dedicated getSleepNightByDate function for efficiency
      const night = await supabaseHealth.getSleepNightByDate(userId, sleepDate);
      if (!night) return undefined;
      // Normalize Supabase snake_case to camelCase for API compatibility
      // Field names MUST match what upsertSleepNight stores and what routes.ts expects
      return {
        id: night.id,
        userId: userId,
        sleepDate: night.sleep_date,
        timezone: night.timezone,
        nightStart: night.night_start,
        finalWake: night.final_wake,
        sleepOnset: night.sleep_onset,
        timeInBedMin: night.time_in_bed_min,
        totalSleepMin: night.total_sleep_min,
        sleepEfficiencyPct: night.sleep_efficiency_pct,
        sleepLatencyMin: night.sleep_latency_min,
        wasoMin: night.waso_min,
        numAwakenings: night.num_awakenings,
        coreSleepMin: night.core_sleep_min,
        deepSleepMin: night.deep_sleep_min,
        remSleepMin: night.rem_sleep_min,
        unspecifiedSleepMin: night.unspecified_sleep_min,
        awakeInBedMin: night.awake_in_bed_min,
        midSleepTimeLocal: night.mid_sleep_time_local,
        fragmentationIndex: night.fragmentation_index,
        deepPct: night.deep_pct,
        remPct: night.rem_pct,
        corePct: night.core_pct,
        bedtimeLocal: night.bedtime_local,
        waketimeLocal: night.waketime_local,
        restingHrBpm: night.resting_hr_bpm,
        hrvMs: night.hrv_ms,
        respiratoryRate: night.respiratory_rate,
        wristTemperature: night.wrist_temperature,
        oxygenSaturation: night.oxygen_saturation,
        createdAt: night.created_at ? new Date(night.created_at) : null,
        updatedAt: night.updated_at ? new Date(night.updated_at) : null,
      };
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getSleepNightByDate failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getSleepNightByDate(userId, sleepDate);
}

export async function upsertSleepNight(userId: string, sleep: any) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    // Convert camelCase input to snake_case for Supabase
    const sleepSnakeCase = {
      sleep_date: sleep.sleepDate,
      timezone: sleep.timezone,
      night_start: sleep.nightStart ?? null,
      final_wake: sleep.finalWake ?? null,
      sleep_onset: sleep.sleepOnset ?? null,
      time_in_bed_min: sleep.timeInBedMin ?? null,
      total_sleep_min: sleep.totalSleepMin ?? null,
      sleep_efficiency_pct: sleep.sleepEfficiencyPct ?? null,
      sleep_latency_min: sleep.sleepLatencyMin ?? null,
      waso_min: sleep.wasoMin ?? null,
      num_awakenings: sleep.numAwakenings ?? null,
      core_sleep_min: sleep.coreSleepMin ?? null,
      deep_sleep_min: sleep.deepSleepMin ?? null,
      rem_sleep_min: sleep.remSleepMin ?? null,
      unspecified_sleep_min: sleep.unspecifiedSleepMin ?? null,
      awake_in_bed_min: sleep.awakeInBedMin ?? null,
      mid_sleep_time_local: sleep.midSleepTimeLocal ?? null,
      fragmentation_index: sleep.fragmentationIndex ?? null,
      deep_pct: sleep.deepPct ?? null,
      rem_pct: sleep.remPct ?? null,
      core_pct: sleep.corePct ?? null,
      bedtime_local: sleep.bedtimeLocal ?? null,
      waketime_local: sleep.waketimeLocal ?? null,
      resting_hr_bpm: sleep.restingHrBpm ?? null,
      hrv_ms: sleep.hrvMs ?? null,
      respiratory_rate: sleep.respiratoryRate ?? null,
      wrist_temperature: sleep.wristTemperature ?? null,
      oxygen_saturation: sleep.oxygenSaturation ?? null,
    };
    
    const result = await supabaseHealth.upsertSleepNight(userId, sleepSnakeCase);
    // Normalize Supabase snake_case to camelCase for API compatibility
    // Field names MUST match what getSleepNights/getSleepNightByDate return and what routes.ts expects
    return {
      id: result.id,
      userId: userId,
      sleepDate: result.sleep_date,
      timezone: result.timezone,
      nightStart: result.night_start,
      finalWake: result.final_wake,
      sleepOnset: result.sleep_onset,
      timeInBedMin: result.time_in_bed_min,
      totalSleepMin: result.total_sleep_min,
      sleepEfficiencyPct: result.sleep_efficiency_pct,
      sleepLatencyMin: result.sleep_latency_min,
      wasoMin: result.waso_min,
      numAwakenings: result.num_awakenings,
      coreSleepMin: result.core_sleep_min,
      deepSleepMin: result.deep_sleep_min,
      remSleepMin: result.rem_sleep_min,
      unspecifiedSleepMin: result.unspecified_sleep_min,
      awakeInBedMin: result.awake_in_bed_min,
      midSleepTimeLocal: result.mid_sleep_time_local,
      fragmentationIndex: result.fragmentation_index,
      deepPct: result.deep_pct,
      remPct: result.rem_pct,
      corePct: result.core_pct,
      bedtimeLocal: result.bedtime_local,
      waketimeLocal: result.waketime_local,
      restingHrBpm: result.resting_hr_bpm,
      hrvMs: result.hrv_ms,
      respiratoryRate: result.respiratory_rate,
      wristTemperature: result.wrist_temperature,
      oxygenSaturation: result.oxygen_saturation,
      createdAt: result.created_at ? new Date(result.created_at) : null,
      updatedAt: result.updated_at ? new Date(result.updated_at) : null,
    };
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase upsertSleepNight failed:", error);
    throw error;
  }
}

export async function getDailyMetrics(userId: string, days = 7) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getDailyMetrics(userId, days);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getDailyMetrics failed:", error);
      return [];
    }
  }
  return [];
}

export async function upsertDailyMetrics(userId: string, metric: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertDailyMetrics(userId, metric);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertDailyMetrics failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

interface GetUserDailyMetricsOptions {
  startDate?: Date;
  endDate?: Date;
  localDate?: string;
  limit?: number;
}

function normalizeUserDailyMetric(r: any, userId: string) {
  return {
    id: r.id,
    userId: userId,
    localDate: r.local_date,
    timezone: r.timezone,
    utcDayStart: r.utc_day_start ? new Date(r.utc_day_start) : null,
    utcDayEnd: r.utc_day_end ? new Date(r.utc_day_end) : null,
    stepsNormalized: r.steps_normalized,
    stepsRawSum: r.steps_raw_sum,
    stepsSources: r.steps_sources,
    activeEnergyKcal: r.active_energy_kcal,
    exerciseMinutes: r.exercise_minutes,
    sleepHours: r.sleep_hours,
    restingHrBpm: r.resting_hr_bpm,
    hrvMs: r.hrv_ms,
    weightKg: r.weight_kg,
    heightCm: r.height_cm,
    bmi: r.bmi,
    bodyFatPercent: r.body_fat_percent,
    leanBodyMassKg: r.lean_body_mass_kg,
    waistCircumferenceCm: r.waist_circumference_cm,
    distanceMeters: r.distance_meters,
    flightsClimbed: r.flights_climbed,
    standHours: r.stand_hours,
    avgHeartRateBpm: r.avg_heart_rate_bpm,
    systolicBp: r.systolic_bp,
    diastolicBp: r.diastolic_bp,
    bloodGlucoseMgDl: r.blood_glucose_mg_dl,
    vo2Max: r.vo2_max,
    basalEnergyKcal: r.basal_energy_kcal,
    walkingHrAvgBpm: r.walking_hr_avg_bpm,
    dietaryWaterMl: r.dietary_water_ml,
    oxygenSaturationPct: r.oxygen_saturation_pct,
    respiratoryRateBpm: r.respiratory_rate_bpm,
    bodyTempC: r.body_temp_c,
    walkingSpeedMs: r.walking_speed_ms,
    walkingStepLengthM: r.walking_step_length_m,
    walkingDoubleSupportPct: r.walking_double_support_pct,
    walkingAsymmetryPct: r.walking_asymmetry_pct,
    appleWalkingSteadiness: r.apple_walking_steadiness,
    sixMinuteWalkDistanceM: r.six_minute_walk_distance_m,
    stairAscentSpeedMs: r.stair_ascent_speed_ms,
    stairDescentSpeedMs: r.stair_descent_speed_ms,
    normalizationVersion: r.normalization_version,
    createdAt: r.created_at ? new Date(r.created_at) : null,
    updatedAt: r.updated_at ? new Date(r.updated_at) : null,
  };
}

export async function getUserDailyMetrics(userId: string, options: GetUserDailyMetricsOptions = {}) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getDailyMetricsFlexible(userId, options);
      return results.map(r => normalizeUserDailyMetric(r, userId));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getUserDailyMetrics failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getUserDailyMetrics(userId, options);
}

export async function getUserDailyMetricsByDate(userId: string, localDate: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const result = await supabaseHealth.getDailyMetricsByDate(userId, localDate);
      if (result) {
        return normalizeUserDailyMetric(result, userId);
      }
      return undefined;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getUserDailyMetricsByDate failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getUserDailyMetricsByDate(userId, localDate);
}

interface GetHealthkitSamplesOptions {
  dataTypes?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getHealthkitSamples(userId: string, options: GetHealthkitSamplesOptions = {}) {
  if (isSupabaseHealthEnabled()) {
    try {
      let results;
      // If specific dataType and date range provided, use the specific query
      if (options.dataTypes?.length === 1 && options.startDate && options.endDate) {
        results = await supabaseHealth.getHealthkitSamples(userId, options.dataTypes[0], options.startDate, options.endDate);
      } else {
        // Otherwise use flexible query
        results = await supabaseHealth.getHealthkitSamplesFlexible(userId, options);
      }
      // Normalize Supabase snake_case to camelCase for API compatibility
      return results.map(r => ({
        id: r.id,
        userId: userId,
        dataType: r.data_type,
        value: r.value,
        unit: r.unit,
        startDate: r.start_date,
        endDate: r.end_date,
        sourceName: r.source_name,
        sourceBundleId: r.source_bundle_id,
        deviceName: r.device_name,
        deviceManufacturer: r.device_manufacturer,
        deviceModel: r.device_model,
        metadata: r.metadata,
        uuid: r.uuid,
        createdAt: r.created_at,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getHealthkitSamples failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getHealthkitSamples(userId, options);
}

export async function createHealthkitSamples(userId: string, samples: any[]) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createHealthkitSamples(userId, samples);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createHealthkitSamples failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function getHealthkitWorkouts(userId: string, limit = 50) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getHealthkitWorkouts(userId, limit);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getHealthkitWorkouts failed:", error);
      return [];
    }
  }
  return [];
}

export async function createHealthkitWorkouts(userId: string, workouts: any[]) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createHealthkitWorkouts(userId, workouts);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createHealthkitWorkouts failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function getHealthkitWorkoutsByDate(userId: string, localDate: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getHealthkitWorkoutsByDate(userId, localDate);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getHealthkitWorkoutsByDate failed:", error);
      return [];
    }
  }
  return [];
}

interface GetLifeEventsOptions {
  startDate?: Date;
  limit?: number;
}

export async function getLifeEvents(userId: string, options: GetLifeEventsOptions = {}) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getLifeEventsFlexible(userId, options);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getLifeEvents failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getLifeEvents(userId, options);
}

export async function createLifeEvent(userId: string, event: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createLifeEvent(userId, event);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createLifeEvent failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function getInsightCards(userId: string, activeOnly: boolean = true) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getInsightCards(userId, activeOnly);
      // Normalize Supabase snake_case to camelCase for API compatibility
      return results.map(r => ({
        id: r.id,
        userId: userId,
        category: r.category,
        pattern: r.pattern,
        confidence: r.confidence,
        supportingData: r.supporting_data,
        details: r.details,
        isNew: r.is_new,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getInsightCards failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon - currently using direct db query
  return [];
}

interface GetFlomentumDailyOptions {
  startDate?: Date;
  limit?: number;
}

export async function getFlomentumDaily(userId: string, options: GetFlomentumDailyOptions = {}) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getFlomentumDailyFlexible(userId, options);
      if (results && results.length > 0) {
        // Normalize Supabase snake_case to camelCase for API compatibility
        return results.map(r => ({
          id: r.id,
          userId: userId,
          date: r.date,
          score: r.score,
          zone: r.zone,
          deltaVsYesterday: r.delta_vs_yesterday,
          factors: r.factors,
          dailyFocus: r.daily_focus,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      }
      // If Supabase has no data, fallback to Neon (transition period)
      logger.info("[HealthStorageRouter] Supabase getFlomentumDaily returned no data, falling back to Neon");
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getFlomentumDaily failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getFlomentumDaily(userId, options);
}

export async function upsertFlomentumDaily(userId: string, score: any) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    // Convert camelCase from routes.ts to snake_case for Supabase
    const supabaseScore = {
      date: score.date,
      score: score.score,
      zone: score.zone,
      delta_vs_yesterday: score.deltaVsYesterday ?? null,
      factors: score.factors,
      daily_focus: score.dailyFocus ?? null,
    };
    
    const result = await supabaseHealth.upsertFlomentumDaily(userId, supabaseScore);
    logger.info(`[HealthStorageRouter] Flomentum score written to Supabase for ${userId}, ${score.date}`);
    return result;
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase upsertFlomentumDaily failed:", error);
    throw error;
  }
}

export async function getFlomentumDailyByDate(userId: string, date: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const result = await supabaseHealth.getFlomentumDailyByDate(userId, date);
      if (result) {
        // Normalize Supabase snake_case to camelCase for API compatibility
        return {
          id: result.id,
          userId: userId,
          date: result.date,
          score: result.score,
          zone: result.zone,
          deltaVsYesterday: result.delta_vs_yesterday,
          factors: result.factors,
          dailyFocus: result.daily_focus,
          createdAt: result.created_at,
          updatedAt: result.updated_at,
        };
      }
      // If Supabase has no data, fallback to Neon (transition period)
      logger.info(`[HealthStorageRouter] Supabase getFlomentumDailyByDate returned no data for ${date}, falling back to Neon`);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getFlomentumDailyByDate failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getFlomentumDailyByDate(userId, date);
}

export async function getDiagnosticsStudies(userId: string, type?: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getDiagnosticsStudies(userId, type);
      // Normalize Supabase snake_case to camelCase for API compatibility
      return results.map(r => ({
        id: r.id,
        userId: userId,
        type: r.type,
        source: r.source,
        studyDate: r.study_date,
        ageAtScan: r.age_at_scan,
        totalScoreNumeric: r.total_score_numeric,
        riskCategory: r.risk_category,
        agePercentile: r.age_percentile,
        aiPayload: r.ai_payload,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getDiagnosticsStudies failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getDiagnosticsStudies(userId, type);
}

export async function createDiagnosticStudy(userId: string, study: any) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const result = await supabaseHealth.createDiagnosticsStudy(userId, study);
    // Normalize Supabase snake_case to camelCase for API compatibility
    return {
      id: result.id,
      userId: userId,
      type: result.type,
      source: result.source,
      studyDate: result.study_date,
      ageAtScan: result.age_at_scan,
      totalScoreNumeric: result.total_score_numeric,
      riskCategory: result.risk_category,
      agePercentile: result.age_percentile,
      aiPayload: result.ai_payload,
      status: result.status,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase createDiagnosticStudy failed:", error);
    throw error;
  }
}

export async function getActionPlanItems(userId: string, status?: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getActionPlanItems(userId, status);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getActionPlanItems failed:", error);
      return [];
    }
  }
  return [];
}

export async function createActionPlanItem(userId: string, item: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createActionPlanItem(userId, item);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createActionPlanItem failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function updateActionPlanItem(itemId: string, updates: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.updateActionPlanItem(itemId, updates);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase updateActionPlanItem failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function updateActionPlanItemStatus(id: string, userId: string, status: string, completedAt?: Date) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const updates: any = { status };
    if (completedAt) {
      updates.completed_at = completedAt;
    }
    const result = await supabaseHealth.updateActionPlanItem(id, updates);
    
    // Handle case where item wasn't found in Supabase
    if (!result) {
      logger.warn(`[HealthStorageRouter] Action plan item ${id} not found in Supabase`);
      return null;
    }
    
    // Normalize Supabase snake_case to camelCase for API compatibility
    return {
      id: result.id,
      userId: userId,
      title: result.title,
      description: result.description,
      category: result.category,
      status: result.status,
      priority: result.priority,
      targetValue: result.target_value,
      targetUnit: result.target_unit,
      currentValue: result.current_value,
      progressPercent: result.progress_percent,
      startDate: result.start_date,
      targetDate: result.target_date,
      completedAt: result.completed_at,
      notes: result.notes,
      source: result.source,
      metadata: result.metadata,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase updateActionPlanItemStatus failed:", error);
    throw error;
  }
}

export async function getActionPlanItem(id: string, userId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const items = await supabaseHealth.getActionPlanItems(userId);
      const item = items.find(i => i.id === id);
      if (!item) return null;
      // Normalize Supabase snake_case to camelCase for API compatibility
      return {
        id: item.id,
        userId: userId,
        title: item.title,
        description: item.description,
        category: item.category,
        status: item.status,
        priority: item.priority,
        targetValue: item.target_value,
        targetUnit: item.target_unit,
        currentValue: item.current_value,
        progressPercent: item.progress_percent,
        startDate: item.start_date,
        targetDate: item.target_date,
        completedAt: item.completed_at,
        notes: item.notes,
        source: item.source,
        metadata: item.metadata,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getActionPlanItem failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getActionPlanItem(id, userId);
}

export async function getBiomarkerSessions(userId: string, limit = 100) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getBiomarkerSessions(userId, limit);
      // Normalize Supabase snake_case to camelCase for API compatibility
      const mapped = results.map(r => ({
        id: r.id,
        userId: userId,
        source: r.source,
        testDate: r.test_date,
        notes: r.notes,
        createdAt: r.created_at ? new Date(r.created_at) : null,
      }));
      logger.info(`[HealthStorageRouter] getBiomarkerSessions returned ${mapped.length} sessions for user, sample testDate: ${mapped[0]?.testDate}`);
      return mapped;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getBiomarkerSessions failed, falling back to Neon:", error);
    }
  }
  
  return await db
    .select()
    .from(biomarkerTestSessions)
    .where(eq(biomarkerTestSessions.userId, userId));
}

export async function getTestSessionById(sessionId: string, userId?: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      if (userId) {
        const result = await supabaseHealth.getTestSessionByIdWithOwnerCheck(sessionId, userId);
        if (!result) return undefined;
        
        return {
          id: result.id,
          userId: userId,
          source: result.source,
          testDate: result.test_date ? new Date(result.test_date) : null,
          notes: result.notes,
          createdAt: result.created_at ? new Date(result.created_at) : null,
        };
      } else {
        const result = await supabaseHealth.getTestSessionById(sessionId);
        if (!result) return undefined;
        
        return {
          id: result.id,
          userId: result.health_id,
          source: result.source,
          testDate: result.test_date ? new Date(result.test_date) : null,
          notes: result.notes,
          createdAt: result.created_at ? new Date(result.created_at) : null,
        };
      }
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getTestSessionById failed, falling back to Neon:", error);
    }
  }
  
  const { storage } = await import("../storage");
  return await storage.getTestSessionById(sessionId);
}

export async function createBiomarkerSession(userId: string, session: any) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const result = await supabaseHealth.createBiomarkerSession(userId, session);
    // Normalize Supabase snake_case to camelCase for API compatibility
    return {
      id: result.id,
      userId: userId,
      source: result.source,
      testDate: result.test_date,
      notes: result.notes,
      createdAt: result.created_at ? new Date(result.created_at) : null,
    };
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase createBiomarkerSession failed:", error);
    throw error;
  }
}

export async function deleteBiomarkerSession(userId: string, sessionId: string): Promise<void> {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot delete health data");
  }
  
  try {
    await supabaseHealth.deleteBiomarkerSession(userId, sessionId);
    logger.info(`[HealthStorageRouter] Deleted biomarker session ${sessionId} for user ${userId}`);
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase deleteBiomarkerSession failed:", error);
    throw error;
  }
}

export async function findSessionByDateAndSource(
  userId: string,
  testDateUtc: string, // YYYY-MM-DD format
  source: string
) {
  if (isSupabaseHealthEnabled()) {
    try {
      const result = await supabaseHealth.findSessionByDateAndSource(userId, testDateUtc, source);
      if (result) {
        // Normalize Supabase snake_case to camelCase for API compatibility
        return {
          id: result.id,
          userId: userId,
          source: result.source,
          testDate: result.test_date,
          notes: result.notes,
          createdAt: result.created_at ? new Date(result.created_at) : null,
        };
      }
      return null;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase findSessionByDateAndSource failed:", error);
      throw error;
    }
  }
  return null;
}

export async function getMeasurementsBySession(sessionId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getMeasurementsBySession(sessionId);
      // Normalize Supabase snake_case to camelCase for API compatibility
      return results.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        biomarkerId: r.biomarker_id,
        recordId: r.record_id,
        source: r.source,
        valueRaw: r.value_raw,
        unitRaw: r.unit_raw,
        valueCanonical: r.value_canonical,
        unitCanonical: r.unit_canonical,
        valueDisplay: r.value_display,
        referenceLow: r.reference_low,
        referenceHigh: r.reference_high,
        referenceLowRaw: r.reference_low_raw,
        referenceHighRaw: r.reference_high_raw,
        referenceUnitRaw: r.reference_unit_raw,
        flags: r.flags,
        warnings: r.warnings,
        normalizationContext: r.normalization_context,
        updatedBy: r.updated_by,
        createdAt: r.created_at ? new Date(r.created_at) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at) : null,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMeasurementsBySession failed, falling back to Neon:", error);
    }
  }
  
  return await db
    .select()
    .from(biomarkerMeasurements)
    .where(eq(biomarkerMeasurements.sessionId, sessionId));
}

export async function getMeasurementHistory(userId: string, biomarkerId: string, limit: number = 5) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getMeasurementHistory(userId, biomarkerId, limit);
      return results.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        biomarkerId: r.biomarker_id,
        recordId: r.record_id,
        source: r.source,
        valueRaw: r.value_raw,
        unitRaw: r.unit_raw,
        valueCanonical: r.value_canonical,
        unitCanonical: r.unit_canonical,
        valueDisplay: r.value_display,
        referenceLow: r.reference_low,
        referenceHigh: r.reference_high,
        referenceLowRaw: r.reference_low_raw,
        referenceHighRaw: r.reference_high_raw,
        referenceUnitRaw: r.reference_unit_raw,
        flags: r.flags,
        warnings: r.warnings,
        normalizationContext: r.normalization_context,
        updatedBy: r.updated_by,
        createdAt: r.created_at ? new Date(r.created_at) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at) : null,
        testDate: r.test_date ? new Date(r.test_date) : null,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMeasurementHistory failed, falling back to Neon:", error);
    }
  }
  
  const { storage } = await import("../storage");
  return await storage.getMeasurementHistory(userId, biomarkerId, limit);
}

export async function getMeasurementByIdForUser(measurementId: string, userId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const result = await supabaseHealth.getMeasurementByIdWithOwnerCheck(measurementId, userId);
      if (!result) return undefined;
      
      return {
        id: result.id,
        sessionId: result.session_id,
        biomarkerId: result.biomarker_id,
        recordId: result.record_id,
        source: result.source,
        valueRaw: result.value_raw,
        unitRaw: result.unit_raw,
        valueCanonical: result.value_canonical,
        unitCanonical: result.unit_canonical,
        valueDisplay: result.value_display,
        referenceLow: result.reference_low,
        referenceHigh: result.reference_high,
        referenceLowRaw: result.reference_low_raw,
        referenceHighRaw: result.reference_high_raw,
        referenceUnitRaw: result.reference_unit_raw,
        flags: result.flags,
        warnings: result.warnings,
        normalizationContext: result.normalization_context,
        updatedBy: result.updated_by,
        createdAt: result.created_at ? new Date(result.created_at) : null,
        updatedAt: result.updated_at ? new Date(result.updated_at) : null,
      };
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMeasurementByIdForUser failed, falling back to Neon:", error);
    }
  }
  
  try {
    const { storage } = await import("../storage");
    const measurement = await storage.getMeasurementById(measurementId);
    if (!measurement) return undefined;
    
    const session = await storage.getTestSessionById(measurement.sessionId);
    if (!session || session.userId !== userId) return undefined;
    
    return measurement;
  } catch (error) {
    logger.error("[HealthStorageRouter] Neon getMeasurementByIdForUser failed:", error);
    return undefined;
  }
}

export async function getMeasurementById(measurementId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const result = await supabaseHealth.getMeasurementById(measurementId);
      if (!result) return undefined;
      
      return {
        id: result.id,
        sessionId: result.session_id,
        biomarkerId: result.biomarker_id,
        recordId: result.record_id,
        source: result.source,
        valueRaw: result.value_raw,
        unitRaw: result.unit_raw,
        valueCanonical: result.value_canonical,
        unitCanonical: result.unit_canonical,
        valueDisplay: result.value_display,
        referenceLow: result.reference_low,
        referenceHigh: result.reference_high,
        flags: result.flags,
        warnings: result.warnings,
        normalizationContext: result.normalization_context,
        updatedBy: result.updated_by,
        createdAt: result.created_at ? new Date(result.created_at) : null,
        updatedAt: result.updated_at ? new Date(result.updated_at) : null,
      };
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMeasurementById failed, falling back to Neon:", error);
    }
  }
  
  const { storage } = await import("../storage");
  return await storage.getMeasurementById(measurementId);
}

export interface UpdateMeasurementParams {
  biomarkerId?: string;
  valueRaw?: number;
  unitRaw?: string;
  valueCanonical?: number;
  unitCanonical?: string;
  valueDisplay?: string;
  referenceLow?: number | null;
  referenceHigh?: number | null;
  flags?: string[];
  warnings?: string[];
  normalizationContext?: Record<string, any> | null;
  source?: string;
  updatedBy?: string;
  updatedAt?: Date;
}

export async function updateMeasurement(measurementId: string, updates: UpdateMeasurementParams) {
  if (isSupabaseHealthEnabled()) {
    try {
      const supabaseUpdates: any = {};
      if (updates.biomarkerId !== undefined) supabaseUpdates.biomarker_id = updates.biomarkerId;
      if (updates.valueRaw !== undefined) supabaseUpdates.value_raw = updates.valueRaw;
      if (updates.unitRaw !== undefined) supabaseUpdates.unit_raw = updates.unitRaw;
      if (updates.valueCanonical !== undefined) supabaseUpdates.value_canonical = updates.valueCanonical;
      if (updates.unitCanonical !== undefined) supabaseUpdates.unit_canonical = updates.unitCanonical;
      if (updates.valueDisplay !== undefined) supabaseUpdates.value_display = updates.valueDisplay;
      if (updates.referenceLow !== undefined) supabaseUpdates.reference_low = updates.referenceLow;
      if (updates.referenceHigh !== undefined) supabaseUpdates.reference_high = updates.referenceHigh;
      if (updates.flags !== undefined) supabaseUpdates.flags = updates.flags;
      if (updates.warnings !== undefined) supabaseUpdates.warnings = updates.warnings;
      if (updates.normalizationContext !== undefined) supabaseUpdates.normalization_context = updates.normalizationContext;
      if (updates.source !== undefined) supabaseUpdates.source = updates.source;
      if (updates.updatedBy !== undefined) supabaseUpdates.updated_by = updates.updatedBy;
      
      const result = await supabaseHealth.updateMeasurement(measurementId, supabaseUpdates);
      
      return {
        id: result.id,
        sessionId: result.session_id,
        biomarkerId: result.biomarker_id,
        recordId: result.record_id,
        source: result.source,
        valueRaw: result.value_raw,
        unitRaw: result.unit_raw,
        valueCanonical: result.value_canonical,
        unitCanonical: result.unit_canonical,
        valueDisplay: result.value_display,
        referenceLow: result.reference_low,
        referenceHigh: result.reference_high,
        flags: result.flags,
        warnings: result.warnings,
        normalizationContext: result.normalization_context,
        updatedBy: result.updated_by,
        createdAt: result.created_at ? new Date(result.created_at) : null,
        updatedAt: result.updated_at ? new Date(result.updated_at) : null,
      };
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase updateMeasurement failed:", error);
      throw error;
    }
  }
  
  const { storage } = await import("../storage");
  return await storage.updateMeasurement(measurementId, updates);
}

export async function deleteMeasurement(measurementId: string): Promise<void> {
  if (isSupabaseHealthEnabled()) {
    try {
      await supabaseHealth.deleteMeasurement(measurementId);
      logger.info(`[HealthStorageRouter] Deleted measurement ${measurementId}`);
      return;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase deleteMeasurement failed:", error);
      throw error;
    }
  }
  
  const { storage } = await import("../storage");
  await storage.deleteMeasurement(measurementId);
}

export async function deleteTestSession(sessionId: string): Promise<void> {
  if (isSupabaseHealthEnabled()) {
    try {
      await supabaseHealth.deleteTestSession(sessionId);
      logger.info(`[HealthStorageRouter] Deleted session ${sessionId}`);
      return;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase deleteTestSession failed:", error);
      throw error;
    }
  }
  
  const { storage } = await import("../storage");
  await storage.deleteTestSession(sessionId);
}

export async function createBiomarkerMeasurement(measurement: any) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const result = await supabaseHealth.createBiomarkerMeasurement(measurement);
    // Normalize Supabase snake_case to camelCase for API compatibility
    return {
      id: result.id,
      sessionId: result.session_id,
      biomarkerId: result.biomarker_id,
      recordId: result.record_id,
      source: result.source,
      valueRaw: result.value_raw,
      unitRaw: result.unit_raw,
      valueCanonical: result.value_canonical,
      unitCanonical: result.unit_canonical,
      valueDisplay: result.value_display,
      referenceLow: result.reference_low,
      referenceHigh: result.reference_high,
      flags: result.flags,
      warnings: result.warnings,
      normalizationContext: result.normalization_context,
      updatedBy: result.updated_by,
      createdAt: result.created_at ? new Date(result.created_at) : null,
      updatedAt: result.updated_at ? new Date(result.updated_at) : null,
    };
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase createBiomarkerMeasurement failed:", error);
    throw error;
  }
}

export interface CreateMeasurementWithSessionParams {
  userId: string;
  biomarkerId: string;
  value: number;
  unit: string;
  testDate: Date;
  valueCanonical: number;
  unitCanonical: string;
  valueDisplay: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  flags: string[];
  warnings: string[];
  normalizationContext: any;
  source?: string;
}

export async function createMeasurementWithSession(params: CreateMeasurementWithSessionParams) {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const result = await supabaseHealth.createMeasurementWithSession(params);
    
    // Convert Supabase response format to Neon format for compatibility
    return {
      session: {
        id: result.session.id,
        userId: params.userId,
        source: result.session.source,
        testDate: new Date(result.session.test_date),
        notes: result.session.notes,
        createdAt: result.session.created_at ? new Date(result.session.created_at) : new Date(),
      },
      measurement: {
        id: result.measurement.id,
        sessionId: result.measurement.session_id,
        biomarkerId: result.measurement.biomarker_id,
        recordId: result.measurement.record_id,
        source: result.measurement.source,
        valueRaw: result.measurement.value_raw,
        unitRaw: result.measurement.unit_raw,
        valueCanonical: result.measurement.value_canonical,
        unitCanonical: result.measurement.unit_canonical,
        valueDisplay: result.measurement.value_display,
        referenceLow: result.measurement.reference_low,
        referenceHigh: result.measurement.reference_high,
        flags: result.measurement.flags,
        warnings: result.measurement.warnings,
        normalizationContext: result.measurement.normalization_context,
        updatedBy: result.measurement.updated_by,
        createdAt: result.measurement.created_at ? new Date(result.measurement.created_at) : new Date(),
        updatedAt: result.measurement.updated_at ? new Date(result.measurement.updated_at) : null,
      },
    };
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase createMeasurementWithSession failed:", error);
    throw error;
  }
}

// Daily Insights are stored in Neon (not health data, but AI-generated content)
// No routing needed - they stay in the primary database

// ==================== NUTRITION DAILY METRICS ====================

interface GetNutritionDailyOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getNutritionDailyMetrics(userId: string, options: GetNutritionDailyOptions = { limit: 7 }): Promise<any[]> {
  if (isSupabaseHealthEnabled()) {
    try {
      const data = await supabaseHealth.getNutritionDailyMetricsFlexible(userId, options);
      return data.map(row => ({
        id: row.id,
        userId: userId,
        localDate: row.local_date,
        timezone: row.timezone,
        energyKcal: row.energy_kcal,
        carbohydratesG: row.carbohydrates_g,
        proteinG: row.protein_g,
        fatTotalG: row.fat_total_g,
        fatSaturatedG: row.fat_saturated_g,
        fatPolyunsaturatedG: row.fat_polyunsaturated_g,
        fatMonounsaturatedG: row.fat_monounsaturated_g,
        cholesterolMg: row.cholesterol_mg,
        fiberG: row.fiber_g,
        sugarG: row.sugar_g,
        vitaminAMcg: row.vitamin_a_mcg,
        vitaminB6Mg: row.vitamin_b6_mg,
        vitaminB12Mcg: row.vitamin_b12_mcg,
        vitaminCMg: row.vitamin_c_mg,
        vitaminDMcg: row.vitamin_d_mcg,
        vitaminEMg: row.vitamin_e_mg,
        vitaminKMcg: row.vitamin_k_mcg,
        thiaminMg: row.thiamin_mg,
        riboflavinMg: row.riboflavin_mg,
        niacinMg: row.niacin_mg,
        folateMcg: row.folate_mcg,
        biotinMcg: row.biotin_mcg,
        pantothenicAcidMg: row.pantothenic_acid_mg,
        calciumMg: row.calcium_mg,
        chlorideMg: row.chloride_mg,
        chromiumMcg: row.chromium_mcg,
        copperMg: row.copper_mg,
        iodineMcg: row.iodine_mcg,
        ironMg: row.iron_mg,
        magnesiumMg: row.magnesium_mg,
        manganeseMg: row.manganese_mg,
        molybdenumMcg: row.molybdenum_mcg,
        phosphorusMg: row.phosphorus_mg,
        potassiumMg: row.potassium_mg,
        seleniumMcg: row.selenium_mcg,
        sodiumMg: row.sodium_mg,
        zincMg: row.zinc_mg,
        caffeineMg: row.caffeine_mg,
        waterMl: row.water_ml,
        mealCount: row.meal_count,
        sources: row.sources,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getNutritionDailyMetrics failed, falling back to Neon:", error);
    }
  }
  
  let query = db.select().from(nutritionDailyMetrics).where(eq(nutritionDailyMetrics.userId, userId));
  
  if (options.startDate) {
    query = query.where(gte(nutritionDailyMetrics.localDate, options.startDate.toISOString().split('T')[0]));
  }
  if (options.endDate) {
    query = query.where(lte(nutritionDailyMetrics.localDate, options.endDate.toISOString().split('T')[0]));
  }
  
  let result = await query.orderBy(desc(nutritionDailyMetrics.localDate)).limit(options.limit ?? 7);
  return result;
}

export async function getNutritionDailyByDate(userId: string, localDate: string): Promise<any | null> {
  if (isSupabaseHealthEnabled()) {
    try {
      const data = await supabaseHealth.getNutritionDailyByDate(userId, localDate);
      if (data) {
        return {
          id: data.id,
          userId: userId,
          localDate: data.local_date,
          timezone: data.timezone,
          energyKcal: data.energy_kcal,
          carbohydratesG: data.carbohydrates_g,
          proteinG: data.protein_g,
          fatTotalG: data.fat_total_g,
          fatSaturatedG: data.fat_saturated_g,
          fatPolyunsaturatedG: data.fat_polyunsaturated_g,
          fatMonounsaturatedG: data.fat_monounsaturated_g,
          cholesterolMg: data.cholesterol_mg,
          fiberG: data.fiber_g,
          sugarG: data.sugar_g,
          vitaminAMcg: data.vitamin_a_mcg,
          vitaminB6Mg: data.vitamin_b6_mg,
          vitaminB12Mcg: data.vitamin_b12_mcg,
          vitaminCMg: data.vitamin_c_mg,
          vitaminDMcg: data.vitamin_d_mcg,
          vitaminEMg: data.vitamin_e_mg,
          vitaminKMcg: data.vitamin_k_mcg,
          thiaminMg: data.thiamin_mg,
          riboflavinMg: data.riboflavin_mg,
          niacinMg: data.niacin_mg,
          folateMcg: data.folate_mcg,
          biotinMcg: data.biotin_mcg,
          pantothenicAcidMg: data.pantothenic_acid_mg,
          calciumMg: data.calcium_mg,
          chlorideMg: data.chloride_mg,
          chromiumMcg: data.chromium_mcg,
          copperMg: data.copper_mg,
          iodineMcg: data.iodine_mcg,
          ironMg: data.iron_mg,
          magnesiumMg: data.magnesium_mg,
          manganeseMg: data.manganese_mg,
          molybdenumMcg: data.molybdenum_mcg,
          phosphorusMg: data.phosphorus_mg,
          potassiumMg: data.potassium_mg,
          seleniumMcg: data.selenium_mcg,
          sodiumMg: data.sodium_mg,
          zincMg: data.zinc_mg,
          caffeineMg: data.caffeine_mg,
          waterMl: data.water_ml,
          mealCount: data.meal_count,
          sources: data.sources,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
      return null;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getNutritionDailyByDate failed, falling back to Neon:", error);
    }
  }
  
  const [result] = await db.select().from(nutritionDailyMetrics)
    .where(and(eq(nutritionDailyMetrics.userId, userId), eq(nutritionDailyMetrics.localDate, localDate)));
  return result || null;
}

export async function upsertNutritionDailyMetrics(userId: string, data: any): Promise<any> {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const supabaseData = {
      local_date: data.localDate,
      timezone: data.timezone,
      energy_kcal: data.energyKcal,
      carbohydrates_g: data.carbohydratesG,
      protein_g: data.proteinG,
      fat_total_g: data.fatTotalG,
      fat_saturated_g: data.fatSaturatedG,
      fat_polyunsaturated_g: data.fatPolyunsaturatedG,
      fat_monounsaturated_g: data.fatMonounsaturatedG,
      cholesterol_mg: data.cholesterolMg,
      fiber_g: data.fiberG,
      sugar_g: data.sugarG,
      vitamin_a_mcg: data.vitaminAMcg,
      vitamin_b6_mg: data.vitaminB6Mg,
      vitamin_b12_mcg: data.vitaminB12Mcg,
      vitamin_c_mg: data.vitaminCMg,
      vitamin_d_mcg: data.vitaminDMcg,
      vitamin_e_mg: data.vitaminEMg,
      vitamin_k_mcg: data.vitaminKMcg,
      thiamin_mg: data.thiaminMg,
      riboflavin_mg: data.riboflavinMg,
      niacin_mg: data.niacinMg,
      folate_mcg: data.folateMcg,
      biotin_mcg: data.biotinMcg,
      pantothenic_acid_mg: data.pantothenicAcidMg,
      calcium_mg: data.calciumMg,
      chloride_mg: data.chlorideMg,
      chromium_mcg: data.chromiumMcg,
      copper_mg: data.copperMg,
      iodine_mcg: data.iodineMcg,
      iron_mg: data.ironMg,
      magnesium_mg: data.magnesiumMg,
      manganese_mg: data.manganeseMg,
      molybdenum_mcg: data.molybdenumMcg,
      phosphorus_mg: data.phosphorusMg,
      potassium_mg: data.potassiumMg,
      selenium_mcg: data.seleniumMcg,
      sodium_mg: data.sodiumMg,
      zinc_mg: data.zincMg,
      caffeine_mg: data.caffeineMg,
      water_ml: data.waterMl,
      meal_count: data.mealCount,
      sources: data.sources,
    };
    return await supabaseHealth.upsertNutritionDailyMetrics(userId, supabaseData);
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase upsertNutritionDailyMetrics failed:", error);
    throw error;
  }
}

// ==================== MINDFULNESS SESSIONS ====================

interface GetMindfulnessSessionsOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getMindfulnessSessions(userId: string, options: GetMindfulnessSessionsOptions = { limit: 70 }): Promise<any[]> {
  if (isSupabaseHealthEnabled()) {
    try {
      const data = await supabaseHealth.getMindfulnessSessionsFlexible(userId, options);
      return data.map(row => ({
        id: row.id,
        userId: userId,
        sessionDate: row.session_date,
        timezone: row.timezone,
        startTime: row.start_time,
        endTime: row.end_time,
        durationMinutes: row.duration_minutes,
        sourceName: row.source_name,
        sourceId: row.source_id,
        healthkitUuid: row.healthkit_uuid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMindfulnessSessions failed, falling back to Neon:", error);
    }
  }
  
  let query = db.select().from(mindfulnessSessions).where(eq(mindfulnessSessions.userId, userId));
  
  if (options.startDate) {
    query = query.where(gte(mindfulnessSessions.sessionDate, options.startDate.toISOString().split('T')[0]));
  }
  if (options.endDate) {
    query = query.where(lte(mindfulnessSessions.sessionDate, options.endDate.toISOString().split('T')[0]));
  }
  
  let result = await query.orderBy(desc(mindfulnessSessions.startTime)).limit(options.limit ?? 70);
  return result;
}

export async function createMindfulnessSession(userId: string, data: any): Promise<any> {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const supabaseData = {
      session_date: data.sessionDate,
      timezone: data.timezone,
      start_time: data.startTime,
      end_time: data.endTime,
      duration_minutes: data.durationMinutes,
      source_name: data.sourceName,
      source_id: data.sourceId,
      healthkit_uuid: data.healthkitUuid,
    };
    return await supabaseHealth.createMindfulnessSession(userId, supabaseData);
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase createMindfulnessSession failed:", error);
    throw error;
  }
}

// ==================== MINDFULNESS DAILY METRICS ====================

interface GetMindfulnessDailyOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getMindfulnessDailyMetrics(userId: string, options: GetMindfulnessDailyOptions = { limit: 7 }): Promise<any[]> {
  if (isSupabaseHealthEnabled()) {
    try {
      const data = await supabaseHealth.getMindfulnessDailyMetricsFlexible(userId, options);
      return data.map(row => ({
        id: row.id,
        userId: userId,
        localDate: row.local_date,
        timezone: row.timezone,
        totalMinutes: row.total_minutes,
        sessionCount: row.session_count,
        avgSessionMinutes: row.avg_session_minutes,
        longestSessionMinutes: row.longest_session_minutes,
        sources: row.sources,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMindfulnessDailyMetrics failed, falling back to Neon:", error);
    }
  }
  
  let query = db.select().from(mindfulnessDailyMetrics).where(eq(mindfulnessDailyMetrics.userId, userId));
  
  if (options.startDate) {
    query = query.where(gte(mindfulnessDailyMetrics.localDate, options.startDate.toISOString().split('T')[0]));
  }
  if (options.endDate) {
    query = query.where(lte(mindfulnessDailyMetrics.localDate, options.endDate.toISOString().split('T')[0]));
  }
  
  let result = await query.orderBy(desc(mindfulnessDailyMetrics.localDate)).limit(options.limit ?? 7);
  return result;
}

export async function getMindfulnessDailyByDate(userId: string, localDate: string): Promise<any | null> {
  if (isSupabaseHealthEnabled()) {
    try {
      const data = await supabaseHealth.getMindfulnessDailyByDate(userId, localDate);
      if (data) {
        return {
          id: data.id,
          userId: userId,
          localDate: data.local_date,
          timezone: data.timezone,
          totalMinutes: data.total_minutes,
          sessionCount: data.session_count,
          avgSessionMinutes: data.avg_session_minutes,
          longestSessionMinutes: data.longest_session_minutes,
          sources: data.sources,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
      return null;
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMindfulnessDailyByDate failed, falling back to Neon:", error);
    }
  }
  
  const [result] = await db.select().from(mindfulnessDailyMetrics)
    .where(and(eq(mindfulnessDailyMetrics.userId, userId), eq(mindfulnessDailyMetrics.localDate, localDate)));
  return result || null;
}

export async function upsertMindfulnessDailyMetrics(userId: string, data: any): Promise<any> {
  // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
  if (!isSupabaseHealthEnabled()) {
    throw new Error("Supabase health storage not enabled - cannot store health data");
  }
  
  try {
    const supabaseData = {
      local_date: data.localDate,
      timezone: data.timezone,
      total_minutes: data.totalMinutes,
      session_count: data.sessionCount,
      avg_session_minutes: data.avgSessionMinutes,
      longest_session_minutes: data.longestSessionMinutes,
      sources: data.sources,
    };
    return await supabaseHealth.upsertMindfulnessDailyMetrics(userId, supabaseData);
  } catch (error) {
    logger.error("[HealthStorageRouter] Supabase upsertMindfulnessDailyMetrics failed:", error);
    throw error;
  }
}

// ==================== REMINDER CONTEXT AGGREGATIONS ====================

export type { BiomarkerTrendResult, WearableAveragesResult, BehaviorMetricsResult, TrainingLoadResult } from "./supabaseHealthStorage";

export async function getBiomarkerTrends(userId: string, minPercentChange: number = 5): Promise<supabaseHealth.BiomarkerTrendResult[]> {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getBiomarkerTrends(userId, minPercentChange);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getBiomarkerTrends failed:", error);
      return [];
    }
  }
  logger.warn("[HealthStorageRouter] getBiomarkerTrends requires Supabase - returning empty");
  return [];
}

export async function getWearableAverages(userId: string): Promise<supabaseHealth.WearableAveragesResult | null> {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getWearableAverages(userId);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getWearableAverages failed:", error);
      return null;
    }
  }
  logger.warn("[HealthStorageRouter] getWearableAverages requires Supabase - returning null");
  return null;
}

export async function getBehaviorMetrics14d(userId: string): Promise<supabaseHealth.BehaviorMetricsResult | null> {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getBehaviorMetrics14d(userId);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getBehaviorMetrics14d failed:", error);
      return null;
    }
  }
  logger.warn("[HealthStorageRouter] getBehaviorMetrics14d requires Supabase - returning null");
  return null;
}

export async function getTrainingLoad7d(userId: string): Promise<supabaseHealth.TrainingLoadResult | null> {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getTrainingLoad7d(userId);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getTrainingLoad7d failed:", error);
      return null;
    }
  }
  logger.warn("[HealthStorageRouter] getTrainingLoad7d requires Supabase - returning null");
  return null;
}

export async function getLatestDexaComparison(userId: string): Promise<{
  latestScanDate: Date;
  bodyFatPercentage?: number;
  leanMassKg?: number;
  visceralFatAreaCm2?: number;
  prevBodyFatPercentage?: number;
  prevVisceralFatAreaCm2?: number;
  prevLeanMassKg?: number;
  prevScanDate?: Date;
  visceralFatChangeCm2?: number;
} | null> {
  if (isSupabaseHealthEnabled()) {
    try {
      const studies = await supabaseHealth.getDiagnosticsStudies(userId);
      const dexaScans = studies
        .filter(s => s.type === 'dexa_scan' && s.study_date)
        .sort((a, b) => new Date(b.study_date!).getTime() - new Date(a.study_date!).getTime());
      
      if (dexaScans.length === 0) return null;
      
      const latest = dexaScans[0];
      const previous = dexaScans.length > 1 ? dexaScans[1] : null;
      
      // Extract body composition data from ai_payload
      const latestComposition = (latest.ai_payload as any)?.body_composition || {};
      const prevComposition = (previous?.ai_payload as any)?.body_composition || {};
      
      const latestBodyFat = latestComposition.fat_percent_total ?? undefined;
      const latestLeanMass = latestComposition.lean_mass_kg ?? undefined;
      const latestVisceralFat = latestComposition.vat_area_cm2 ?? undefined;
      const prevVisceralFat = prevComposition.vat_area_cm2 ?? undefined;
      
      return {
        latestScanDate: new Date(latest.study_date!),
        bodyFatPercentage: latestBodyFat,
        leanMassKg: latestLeanMass,
        visceralFatAreaCm2: latestVisceralFat,
        prevBodyFatPercentage: prevComposition.fat_percent_total ?? undefined,
        prevVisceralFatAreaCm2: prevVisceralFat,
        prevLeanMassKg: prevComposition.lean_mass_kg ?? undefined,
        prevScanDate: previous?.study_date ? new Date(previous.study_date) : undefined,
        visceralFatChangeCm2: prevVisceralFat != null && latestVisceralFat != null
          ? Math.round((latestVisceralFat - prevVisceralFat) * 10) / 10
          : undefined,
      };
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getLatestDexaComparison failed:", error);
      return null;
    }
  }
  logger.warn("[HealthStorageRouter] getLatestDexaComparison requires Supabase - returning null");
  return null;
}

export async function getReminderInsightCards(userId: string, limit: number = 3): Promise<{
  category: string;
  pattern: string;
  confidence: number;
  isNew: boolean;
}[]> {
  if (isSupabaseHealthEnabled()) {
    try {
      const cards = await supabaseHealth.getInsightCards(userId, true);
      // Sort by isNew (new first), then by confidence, and limit
      const sorted = cards
        .sort((a, b) => {
          if ((b.is_new ?? false) !== (a.is_new ?? false)) {
            return (b.is_new ?? false) ? 1 : -1;
          }
          return (b.confidence ?? 0) - (a.confidence ?? 0);
        })
        .slice(0, limit);
      return sorted.map(c => ({
        category: c.category || '',
        pattern: c.pattern || '',
        confidence: c.confidence ?? 0,
        isNew: c.is_new ?? false,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getReminderInsightCards failed:", error);
      return [];
    }
  }
  logger.warn("[HealthStorageRouter] getReminderInsightCards requires Supabase - returning empty");
  return [];
}

export async function getReminderActionPlanItems(userId: string, limit: number = 5): Promise<{
  title: string;
  action: string;
  category: string;
  targetBiomarker?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  addedAt?: Date;
}[]> {
  if (isSupabaseHealthEnabled()) {
    try {
      const items = await supabaseHealth.getActionPlanItems(userId, 'active');
      return items.slice(0, limit).map(i => ({
        title: i.snapshot_title || i.title || '',
        action: i.snapshot_action || i.description || '',
        category: i.category || '',
        targetBiomarker: (i as any).target_biomarker ?? undefined,
        currentValue: i.current_value ?? undefined,
        targetValue: i.target_value ?? undefined,
        unit: i.target_unit ?? undefined,
        addedAt: i.created_at ? new Date(i.created_at) : undefined,
      }));
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getReminderActionPlanItems failed:", error);
      return [];
    }
  }
  logger.warn("[HealthStorageRouter] getReminderActionPlanItems requires Supabase - returning empty");
  return [];
}

export async function getReminderGoals(userId: string): Promise<string[]> {
  if (isSupabaseHealthEnabled()) {
    try {
      const profile = await supabaseHealth.getProfile(userId);
      return Array.isArray(profile?.goals) ? profile.goals : [];
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getReminderGoals failed:", error);
      return [];
    }
  }
  logger.warn("[HealthStorageRouter] getReminderGoals requires Supabase - returning empty");
  return [];
}

logger.info(`Health storage router initialized (Supabase enabled: ${isSupabaseHealthEnabled()})`);
