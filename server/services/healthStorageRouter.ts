import { db } from "../db";
import { users, profiles, biomarkerTestSessions, biomarkerMeasurements } from "@shared/schema";
import { eq } from "drizzle-orm";
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

export async function getSleepNights(userId: string, days = 7) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getSleepNights(userId, days);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getSleepNights failed:", error);
      return [];
    }
  }
  return [];
}

export async function upsertSleepNight(userId: string, sleep: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertSleepNight(userId, sleep);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertSleepNight failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
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

export async function getHealthkitSamples(userId: string, dataType: string, startDate: Date, endDate: Date) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getHealthkitSamples(userId, dataType, startDate, endDate);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getHealthkitSamples failed:", error);
      return [];
    }
  }
  return [];
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

export async function getLifeEvents(userId: string, limit = 50) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getLifeEvents(userId, limit);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getLifeEvents failed:", error);
      return [];
    }
  }
  return [];
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

export async function getFlomentumDaily(userId: string, days = 7) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getFlomentumDaily(userId, days);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getFlomentumDaily failed:", error);
      return [];
    }
  }
  return [];
}

export async function upsertFlomentumDaily(userId: string, score: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertFlomentumDaily(userId, score);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertFlomentumDaily failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function getDiagnosticsStudies(userId: string, type?: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getDiagnosticsStudies(userId, type);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getDiagnosticsStudies failed:", error);
      return [];
    }
  }
  return [];
}

export async function createDiagnosticsStudy(userId: string, study: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createDiagnosticsStudy(userId, study);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createDiagnosticsStudy failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
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

logger.info(`Health storage router initialized (Supabase enabled: ${isSupabaseHealthEnabled()})`);
