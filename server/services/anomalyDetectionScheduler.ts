import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../utils/logger";
import { correlationInsightService } from "./correlationInsightService";
import { getHealthId } from "./supabaseHealthStorage";

const logger = createLogger('AnomalyDetectionScheduler');

let schedulerInterval: NodeJS.Timeout | null = null;

export function startAnomalyDetectionScheduler() {
  if (schedulerInterval) {
    logger.warn("[AnomalyDetectionScheduler] Scheduler already running");
    return;
  }

  logger.info("[AnomalyDetectionScheduler] Starting daily anomaly detection scheduler");

  const now = new Date();
  const next5AM = new Date();
  next5AM.setHours(5, 0, 0, 0);
  
  if (now.getHours() >= 5) {
    next5AM.setDate(next5AM.getDate() + 1);
  }

  const msUntil5AM = next5AM.getTime() - now.getTime();

  setTimeout(() => {
    runAnomalyDetection();
    
    schedulerInterval = setInterval(() => {
      runAnomalyDetection();
    }, 24 * 60 * 60 * 1000);
  }, msUntil5AM);

  logger.info(`[AnomalyDetectionScheduler] Next detection scheduled for ${next5AM.toISOString()}`);
}

export function stopAnomalyDetectionScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("[AnomalyDetectionScheduler] Scheduler stopped");
  }
}

async function runAnomalyDetection() {
  logger.info("[AnomalyDetectionScheduler] Starting daily anomaly detection");
  const startTime = Date.now();

  try {
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.status, "active"));

    logger.info(`[AnomalyDetectionScheduler] Running detection for ${activeUsers.length} active users`);

    let successCount = 0;
    let errorCount = 0;
    let anomalyCount = 0;
    let questionCount = 0;
    let skippedCount = 0;

    for (const user of activeUsers) {
      try {
        const healthId = await getHealthId(user.id);
        if (!healthId) {
          skippedCount++;
          continue;
        }

        const result = await correlationInsightService.runFullAnalysis(user.id);
        successCount++;
        anomalyCount += result.anomalies.length;
        if (result.feedbackQuestion) {
          questionCount++;
        }
      } catch (error) {
        logger.error(`[AnomalyDetectionScheduler] Error for user ${user.id}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[AnomalyDetectionScheduler] Complete in ${duration}ms. Success: ${successCount}, Errors: ${errorCount}, Skipped: ${skippedCount}, Anomalies: ${anomalyCount}, Questions: ${questionCount}`
    );
  } catch (error) {
    logger.error("[AnomalyDetectionScheduler] Fatal error:", error);
  }
}

export async function triggerManualAnomalyDetection(): Promise<{
  success: boolean;
  message: string;
  stats?: {
    usersProcessed: number;
    anomaliesDetected: number;
    questionsGenerated: number;
  };
}> {
  logger.info("[AnomalyDetectionScheduler] Manual detection triggered");
  
  try {
    const startTime = Date.now();
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.status, "active"));

    let usersProcessed = 0;
    let anomaliesDetected = 0;
    let questionsGenerated = 0;

    for (const user of activeUsers) {
      try {
        const healthId = await getHealthId(user.id);
        if (!healthId) continue;

        const result = await correlationInsightService.runFullAnalysis(user.id);
        usersProcessed++;
        anomaliesDetected += result.anomalies.length;
        if (result.feedbackQuestion) {
          questionsGenerated++;
        }
      } catch (error) {
        logger.error(`[AnomalyDetectionScheduler] Error for user ${user.id}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    return {
      success: true,
      message: `Anomaly detection completed in ${duration}ms`,
      stats: {
        usersProcessed,
        anomaliesDetected,
        questionsGenerated,
      },
    };
  } catch (error: any) {
    logger.error("[AnomalyDetectionScheduler] Manual detection failed:", error);
    return { success: false, message: error.message };
  }
}
