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
  if (isSupabaseHealthEnabled()) {
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
      logger.error("[HealthStorageRouter] Supabase upsertProfile failed, falling back to Neon:", error);
    }
  }
  
  const [profile] = await db
    .insert(profiles)
    .values({ userId, ...data })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return profile;
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
      return results.map(r => ({
        id: r.id,
        userId: userId,
        sleepDate: r.sleep_date,
        inBedAt: r.in_bed_at || null,
        asleepAt: r.asleep_at || null,
        wakeAt: r.wake_at || null,
        outOfBedAt: r.out_of_bed_at || null,
        totalMinutesInBed: r.total_minutes_in_bed,
        totalMinutesAsleep: r.total_minutes_asleep,
        awakeMinutes: r.awake_minutes,
        deepMinutes: r.deep_minutes,
        remMinutes: r.rem_minutes,
        coreMinutes: r.core_minutes,
        sleepEfficiency: r.sleep_efficiency,
        avgHeartRate: r.avg_heart_rate,
        avgHrv: r.avg_hrv,
        avgRespiratoryRate: r.avg_respiratory_rate,
        avgOxygenSaturation: r.avg_oxygen_saturation,
        source: r.source,
        rawData: r.raw_data,
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
      // Add null-safe handling for optional timestamps
      return {
        id: night.id,
        userId: userId,
        sleepDate: night.sleep_date,
        inBedAt: night.in_bed_at || null,
        asleepAt: night.asleep_at || null,
        wakeAt: night.wake_at || null,
        outOfBedAt: night.out_of_bed_at || null,
        totalMinutesInBed: night.total_minutes_in_bed,
        totalMinutesAsleep: night.total_minutes_asleep,
        awakeMinutes: night.awake_minutes,
        deepMinutes: night.deep_minutes,
        remMinutes: night.rem_minutes,
        coreMinutes: night.core_minutes,
        sleepEfficiency: night.sleep_efficiency,
        avgHeartRate: night.avg_heart_rate,
        avgHrv: night.avg_hrv,
        avgRespiratoryRate: night.avg_respiratory_rate,
        avgOxygenSaturation: night.avg_oxygen_saturation,
        source: night.source,
        rawData: night.raw_data,
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
  if (isSupabaseHealthEnabled()) {
    try {
      const result = await supabaseHealth.upsertSleepNight(userId, sleep);
      // Normalize Supabase snake_case to camelCase for API compatibility
      // Add null-safe handling for optional timestamps
      return {
        id: result.id,
        userId: userId,
        sleepDate: result.sleep_date,
        inBedAt: result.in_bed_at || null,
        asleepAt: result.asleep_at || null,
        wakeAt: result.wake_at || null,
        outOfBedAt: result.out_of_bed_at || null,
        totalMinutesInBed: result.total_minutes_in_bed,
        totalMinutesAsleep: result.total_minutes_asleep,
        awakeMinutes: result.awake_minutes,
        deepMinutes: result.deep_minutes,
        remMinutes: result.rem_minutes,
        coreMinutes: result.core_minutes,
        sleepEfficiency: result.sleep_efficiency,
        avgHeartRate: result.avg_heart_rate,
        avgHrv: result.avg_hrv,
        avgRespiratoryRate: result.avg_respiratory_rate,
        avgOxygenSaturation: result.avg_oxygen_saturation,
        source: result.source,
        rawData: result.raw_data,
        createdAt: result.created_at ? new Date(result.created_at) : null,
        updatedAt: result.updated_at ? new Date(result.updated_at) : null,
      };
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertSleepNight failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.upsertSleepNight(sleep);
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

interface GetFlomentumDailyOptions {
  startDate?: Date;
  limit?: number;
}

export async function getFlomentumDaily(userId: string, options: GetFlomentumDailyOptions = {}) {
  if (isSupabaseHealthEnabled()) {
    try {
      const results = await supabaseHealth.getFlomentumDailyFlexible(userId, options);
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
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getFlomentumDaily failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.getFlomentumDaily(userId, options);
}

export async function upsertFlomentumDaily(userId: string, score: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertFlomentumDaily(userId, score);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertFlomentumDaily failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.upsertFlomentumDaily(score);
}

export async function getFlomentumDailyByDate(userId: string, date: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      const result = await supabaseHealth.getFlomentumDailyByDate(userId, date);
      if (!result) return null;
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
  if (isSupabaseHealthEnabled()) {
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
      logger.error("[HealthStorageRouter] Supabase createDiagnosticStudy failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.createDiagnosticStudy(study);
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
  if (isSupabaseHealthEnabled()) {
    try {
      const updates: any = { status };
      if (completedAt) {
        updates.completed_at = completedAt;
      }
      const result = await supabaseHealth.updateActionPlanItem(id, updates);
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
      logger.error("[HealthStorageRouter] Supabase updateActionPlanItemStatus failed, falling back to Neon:", error);
    }
  }
  
  // Fallback to Neon
  const { storage } = await import("../storage");
  return await storage.updateActionPlanItemStatus(id, userId, status, completedAt);
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

export async function getBiomarkerSessions(userId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getBiomarkerSessions(userId);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getBiomarkerSessions failed, falling back to Neon:", error);
    }
  }
  
  return await db
    .select()
    .from(biomarkerTestSessions)
    .where(eq(biomarkerTestSessions.userId, userId));
}

export async function createBiomarkerSession(userId: string, session: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createBiomarkerSession(userId, session);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createBiomarkerSession failed, falling back to Neon:", error);
    }
  }
  
  const [created] = await db
    .insert(biomarkerTestSessions)
    .values({ userId, ...session })
    .returning();
  return created;
}

export async function getMeasurementsBySession(sessionId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getMeasurementsBySession(sessionId);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getMeasurementsBySession failed, falling back to Neon:", error);
    }
  }
  
  return await db
    .select()
    .from(biomarkerMeasurements)
    .where(eq(biomarkerMeasurements.sessionId, sessionId));
}

export async function createBiomarkerMeasurement(measurement: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createBiomarkerMeasurement(measurement);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createBiomarkerMeasurement failed, falling back to Neon:", error);
    }
  }
  
  const [created] = await db
    .insert(biomarkerMeasurements)
    .values(measurement)
    .returning();
  return created;
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
  if (isSupabaseHealthEnabled()) {
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
      logger.error("[HealthStorageRouter] Supabase createMeasurementWithSession failed, falling back to Neon:", error);
    }
  }
  
  // Fall back to Neon - import storage dynamically to avoid circular dependency
  const { storage } = await import("../storage");
  return await storage.createMeasurementWithSession(params);
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
  if (isSupabaseHealthEnabled()) {
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
      logger.error("[HealthStorageRouter] Supabase upsertNutritionDailyMetrics failed, falling back to Neon:", error);
    }
  }
  
  const { storage } = await import("../storage");
  return await storage.upsertNutritionDailyMetrics(userId, data);
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
  if (isSupabaseHealthEnabled()) {
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
      logger.error("[HealthStorageRouter] Supabase createMindfulnessSession failed, falling back to Neon:", error);
    }
  }
  
  const { storage } = await import("../storage");
  return await storage.createMindfulnessSession(userId, data);
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
  if (isSupabaseHealthEnabled()) {
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
      logger.error("[HealthStorageRouter] Supabase upsertMindfulnessDailyMetrics failed, falling back to Neon:", error);
    }
  }
  
  const { storage } = await import("../storage");
  return await storage.upsertMindfulnessDailyMetrics(userId, data);
}

logger.info(`Health storage router initialized (Supabase enabled: ${isSupabaseHealthEnabled()})`);
