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
          dateOfBirth: profile.date_of_birth ? new Date(profile.date_of_birth) : null,
          weight: profile.weight,
          weightUnit: profile.weight_unit as "kg" | "lbs" | null,
          height: profile.height,
          heightUnit: profile.height_unit as "cm" | "inches" | null,
          goals: profile.goals,
          healthBaseline: profile.health_baseline,
          aiPersonalization: profile.ai_personalization,
          reminderType: profile.reminder_type as "morning" | "evening" | null,
          reminderTime: profile.reminder_time,
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
      const supabaseData: supabaseHealth.HealthProfile = {
        health_id: await getHealthId(userId),
        sex: data.sex,
        date_of_birth: data.dateOfBirth?.toISOString?.() || data.dateOfBirth,
        weight: data.weight,
        weight_unit: data.weightUnit,
        height: data.height,
        height_unit: data.heightUnit,
        goals: data.goals,
        health_baseline: data.healthBaseline,
        ai_personalization: data.aiPersonalization,
        reminder_type: data.reminderType,
        reminder_time: data.reminderTime,
      };
      
      const result = await supabaseHealth.upsertProfile(userId, supabaseData);
      
      return {
        id: result.id,
        userId: userId,
        sex: result.sex as "Male" | "Female" | "Other" | null,
        dateOfBirth: result.date_of_birth ? new Date(result.date_of_birth) : null,
        weight: result.weight,
        weightUnit: result.weight_unit as "kg" | "lbs" | null,
        height: result.height,
        heightUnit: result.height_unit as "cm" | "inches" | null,
        goals: result.goals,
        healthBaseline: result.health_baseline,
        aiPersonalization: result.ai_personalization,
        reminderType: result.reminder_type as "morning" | "evening" | null,
        reminderTime: result.reminder_time,
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

export async function upsertDailyMetric(userId: string, metric: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertDailyMetric(userId, metric);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertDailyMetric failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function getHealthKitSamples(userId: string, dataType?: string, limit = 100) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getHealthKitSamples(userId, dataType, limit);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getHealthKitSamples failed:", error);
      return [];
    }
  }
  return [];
}

export async function upsertHealthKitSample(userId: string, sample: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertHealthKitSample(userId, sample);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertHealthKitSample failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function getHealthKitWorkouts(userId: string, limit = 50) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getHealthKitWorkouts(userId, limit);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getHealthKitWorkouts failed:", error);
      return [];
    }
  }
  return [];
}

export async function upsertHealthKitWorkout(userId: string, workout: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertHealthKitWorkout(userId, workout);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertHealthKitWorkout failed:", error);
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

export async function getFlomentumScores(userId: string, days = 7) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getFlomentumScores(userId, days);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getFlomentumScores failed:", error);
      return [];
    }
  }
  return [];
}

export async function upsertFlomentumScore(userId: string, score: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.upsertFlomentumScore(userId, score);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase upsertFlomentumScore failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function getDiagnosticStudies(userId: string, type?: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getDiagnosticStudies(userId, type);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getDiagnosticStudies failed:", error);
      return [];
    }
  }
  return [];
}

export async function createDiagnosticStudy(userId: string, study: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.createDiagnosticStudy(userId, study);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase createDiagnosticStudy failed:", error);
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

export async function updateActionPlanItem(userId: string, itemId: string, updates: any) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.updateActionPlanItem(userId, itemId, updates);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase updateActionPlanItem failed:", error);
      throw error;
    }
  }
  throw new Error("Supabase health storage not enabled");
}

export async function deleteActionPlanItem(userId: string, itemId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.deleteActionPlanItem(userId, itemId);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase deleteActionPlanItem failed:", error);
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

export async function getBiomarkerMeasurements(sessionId: string) {
  if (isSupabaseHealthEnabled()) {
    try {
      return await supabaseHealth.getBiomarkerMeasurements(sessionId);
    } catch (error) {
      logger.error("[HealthStorageRouter] Supabase getBiomarkerMeasurements failed, falling back to Neon:", error);
    }
  }
  
  return await db
    .select()
    .from(biomarkerMeasurements)
    .where(eq(biomarkerMeasurements.sessionId, sessionId));
}

logger.info(`Health storage router initialized (Supabase enabled: ${isSupabaseHealthEnabled()})`);
