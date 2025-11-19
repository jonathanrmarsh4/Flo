import { db } from "../db";
import { users, userSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import { syncBloodWorkEmbeddings, syncHealthKitEmbeddings } from "./embeddingService";
import { detectCorrelations } from "./correlationEngine";

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the nightly insights scheduler
 * Runs at 3:00 AM UTC daily to:
 * 1. Sync embeddings for new health data
 * 2. Detect correlations and generate insights
 */
export function startInsightsScheduler() {
  if (schedulerInterval) {
    logger.warn("[InsightsScheduler] Scheduler already running");
    return;
  }

  logger.info("[InsightsScheduler] Starting nightly insights generation scheduler");

  const now = new Date();
  const next3AM = getNext3AM(now);

  const msUntilNext3AM = next3AM.getTime() - now.getTime();

  // Schedule first run at next 3 AM, then repeat daily
  setTimeout(() => {
    runInsightsGeneration();
    
    schedulerInterval = setInterval(() => {
      runInsightsGeneration();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, msUntilNext3AM);

  logger.info(`[InsightsScheduler] Next insights generation scheduled for ${next3AM.toISOString()}`);
}

export function stopInsightsScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("[InsightsScheduler] Scheduler stopped");
  }
}

/**
 * Calculate next 3 AM UTC
 */
function getNext3AM(from: Date): Date {
  const next = new Date(from);
  next.setUTCHours(3, 0, 0, 0);

  // If 3 AM already passed today, schedule for tomorrow
  if (next <= from) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

/**
 * Run nightly insights generation for all active users
 */
async function runInsightsGeneration() {
  logger.info("[InsightsScheduler] Starting nightly insights generation");
  const startTime = Date.now();

  try {
    // Get all active users
    const activeUsers = await db
      .select({ 
        userId: users.id,
      })
      .from(users)
      .where(eq(users.status, "active"));

    logger.info(`[InsightsScheduler] Processing ${activeUsers.length} active users`);

    let successCount = 0;
    let errorCount = 0;
    let totalEmbeddings = 0;
    let totalInsights = 0;

    for (const { userId } of activeUsers) {
      try {
        // Step 1: Sync embeddings for new health data
        // Note: This is lightweight - only processes new/changed data
        const embeddingCount = await syncUserEmbeddings(userId);
        totalEmbeddings += embeddingCount;

        // Step 2: Detect correlations and generate insights
        const insights = await detectCorrelations(userId);
        totalInsights += insights.length;

        logger.info(`[InsightsScheduler] User ${userId}: ${embeddingCount} embeddings, ${insights.length} insights`);
        successCount++;
      } catch (error) {
        logger.error(`[InsightsScheduler] Error processing user ${userId}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[InsightsScheduler] Completed in ${duration}ms: ${successCount} users processed, ` +
      `${totalEmbeddings} embeddings synced, ${totalInsights} insights generated, ${errorCount} errors`
    );
  } catch (error) {
    logger.error("[InsightsScheduler] Fatal error during insights generation:", error);
  }
}

/**
 * Sync embeddings for a single user
 * Returns count of new embeddings created
 */
async function syncUserEmbeddings(userId: string): Promise<number> {
  try {
    // Get recent blood work and HealthKit data
    // The embedding service is idempotent - it only processes new data
    const { bloodWorkRecords, analysisResults } = await import("@shared/schema");
    const { desc, eq, sql } = await import("drizzle-orm");

    // Get blood work with analysis
    const bloodWorkData = await db
      .select({
        id: bloodWorkRecords.id,
        uploadedAt: bloodWorkRecords.uploadedAt,
        analysis: sql`${sql.raw('analysis_results')}.*`,
      })
      .from(bloodWorkRecords)
      .leftJoin(sql.raw('analysis_results'), sql`${bloodWorkRecords.id} = analysis_results.record_id`)
      .where(eq(bloodWorkRecords.userId, userId))
      .orderBy(desc(bloodWorkRecords.uploadedAt))
      .limit(10);

    // Get recent HealthKit metrics
    const { userDailyMetrics } = await import("@shared/schema");
    const { gte } = await import("drizzle-orm");
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const healthKitData = await db
      .select()
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          gte(userDailyMetrics.utcDayStart, thirtyDaysAgo)
        )
      )
      .orderBy(desc(userDailyMetrics.localDate));

    let count = 0;

    if (bloodWorkData.length > 0) {
      count += await syncBloodWorkEmbeddings(userId, bloodWorkData as any);
    }

    if (healthKitData.length > 0) {
      count += await syncHealthKitEmbeddings(userId, healthKitData);
    }

    return count;
  } catch (error) {
    logger.error(`[InsightsScheduler] Error syncing embeddings for user ${userId}:`, error);
    return 0;
  }
}
