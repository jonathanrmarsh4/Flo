import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { updateAllBaselines } from "./baselineCalculator";

/**
 * Baseline Update Scheduler
 * Runs daily to recalculate rolling 30-day baselines for all active users
 */

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the baseline update scheduler
 * Runs every 24 hours at 3:00 AM (configurable)
 */
export function startBaselineScheduler() {
  if (schedulerInterval) {
    logger.warn("[BaselineScheduler] Scheduler already running");
    return;
  }

  logger.info("[BaselineScheduler] Starting daily baseline update scheduler");

  // Calculate time until next 3:00 AM
  const now = new Date();
  const next3AM = new Date();
  next3AM.setHours(3, 0, 0, 0);
  
  if (now.getHours() >= 3) {
    // If it's already past 3 AM today, schedule for tomorrow
    next3AM.setDate(next3AM.getDate() + 1);
  }

  const msUntil3AM = next3AM.getTime() - now.getTime();

  // Schedule first run
  setTimeout(() => {
    runBaselineUpdate();
    
    // Then run every 24 hours
    schedulerInterval = setInterval(() => {
      runBaselineUpdate();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, msUntil3AM);

  logger.info(`[BaselineScheduler] Next update scheduled for ${next3AM.toISOString()}`);
}

/**
 * Stop the baseline update scheduler
 */
export function stopBaselineScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("[BaselineScheduler] Scheduler stopped");
  }
}

/**
 * Run baseline update for all active users
 */
async function runBaselineUpdate() {
  logger.info("[BaselineScheduler] Starting daily baseline update");
  const startTime = Date.now();

  try {
    // Get all active users
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.status, "active"));

    logger.info(`[BaselineScheduler] Updating baselines for ${activeUsers.length} active users`);

    let successCount = 0;
    let errorCount = 0;

    // Update baselines for each user
    for (const user of activeUsers) {
      try {
        await updateAllBaselines(user.id);
        successCount++;
      } catch (error) {
        logger.error(`[BaselineScheduler] Error updating baselines for user ${user.id}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[BaselineScheduler] Baseline update complete in ${duration}ms. Success: ${successCount}, Errors: ${errorCount}`
    );
  } catch (error) {
    logger.error("[BaselineScheduler] Fatal error during baseline update:", error);
  }
}

/**
 * Manually trigger a baseline update (for testing or admin purposes)
 */
export async function triggerManualBaselineUpdate(): Promise<{ success: boolean; message: string }> {
  logger.info("[BaselineScheduler] Manual baseline update triggered");
  
  try {
    await runBaselineUpdate();
    return { success: true, message: "Baseline update completed successfully" };
  } catch (error: any) {
    logger.error("[BaselineScheduler] Manual baseline update failed:", error);
    return { success: false, message: error.message };
  }
}
