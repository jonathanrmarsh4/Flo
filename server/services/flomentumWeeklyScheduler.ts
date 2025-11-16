import { db } from "../db";
import { users, userSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import { aggregateWeeklyFlomentum, getMondayOfWeek } from "./flomentumWeeklyAggregator";

let schedulerInterval: NodeJS.Timeout | null = null;

export function startFlomentumWeeklyScheduler() {
  if (schedulerInterval) {
    logger.warn("[FlomentumWeeklyScheduler] Scheduler already running");
    return;
  }

  logger.info("[FlomentumWeeklyScheduler] Starting weekly Flōmentum aggregation scheduler");

  const now = new Date();
  const nextMonday = getNextMonday(now);

  const msUntilNextMonday = nextMonday.getTime() - now.getTime();

  setTimeout(() => {
    runWeeklyAggregation();
    
    schedulerInterval = setInterval(() => {
      runWeeklyAggregation();
    }, 7 * 24 * 60 * 60 * 1000); // 7 days
  }, msUntilNextMonday);

  logger.info(`[FlomentumWeeklyScheduler] Next aggregation scheduled for ${nextMonday.toISOString()}`);
}

export function stopFlomentumWeeklyScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("[FlomentumWeeklyScheduler] Scheduler stopped");
  }
}

async function runWeeklyAggregation() {
  logger.info("[FlomentumWeeklyScheduler] Starting weekly Flōmentum aggregation");
  const startTime = Date.now();

  try {
    const usersWithFlomentum = await db
      .select({ 
        userId: userSettings.userId,
      })
      .from(userSettings)
      .innerJoin(users, eq(users.id, userSettings.userId))
      .where(
        and(
          eq(userSettings.flomentumEnabled, true),
          eq(users.status, "active")
        )
      );

    logger.info(`[FlomentumWeeklyScheduler] Aggregating for ${usersWithFlomentum.length} users with Flōmentum enabled`);

    let successCount = 0;
    let errorCount = 0;

    const lastWeekMonday = getMondayOfWeek(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    for (const { userId } of usersWithFlomentum) {
      try {
        await aggregateWeeklyFlomentum(userId, lastWeekMonday);
        successCount++;
      } catch (error) {
        logger.error(`[FlomentumWeeklyScheduler] Error aggregating for user ${userId}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[FlomentumWeeklyScheduler] Weekly aggregation complete in ${duration}ms. Success: ${successCount}, Errors: ${errorCount}`
    );
  } catch (error) {
    logger.error("[FlomentumWeeklyScheduler] Fatal error during weekly aggregation:", error);
  }
}

export async function triggerManualWeeklyAggregation(): Promise<{ success: boolean; message: string }> {
  logger.info("[FlomentumWeeklyScheduler] Manual weekly aggregation triggered");
  
  try {
    await runWeeklyAggregation();
    return { success: true, message: "Weekly aggregation completed successfully" };
  } catch (error: any) {
    logger.error("[FlomentumWeeklyScheduler] Manual aggregation failed:", error);
    return { success: false, message: error.message };
  }
}

function getNextMonday(from: Date = new Date()): Date {
  const nextMonday = new Date(from);
  const day = from.getDay();
  
  if (day === 1) {
    if (from.getHours() >= 3) {
      nextMonday.setDate(from.getDate() + 7);
    }
  } else if (day === 0) {
    nextMonday.setDate(from.getDate() + 1);
  } else {
    nextMonday.setDate(from.getDate() + (8 - day));
  }
  
  nextMonday.setHours(3, 0, 0, 0);
  
  return nextMonday;
}
