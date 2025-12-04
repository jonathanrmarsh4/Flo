import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { syncBloodWorkEmbeddings, syncHealthKitEmbeddings } from "./embeddingService";
import { generateInsightCards } from "./correlationEngine";
import * as healthRouter from "./healthStorageRouter";

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

        // Step 2: Generate and save insight cards (detects correlations + saves to DB)
        const insights = await generateInsightCards(userId);
        totalInsights += insights.length;

        logger.info(`[InsightsScheduler] ✓ User ${userId}: ${embeddingCount} embeddings synced, ${insights.length} insights saved to DB`);
        successCount++;
      } catch (error) {
        logger.error(`[InsightsScheduler] ✗ Error processing user ${userId}:`, error);
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
 * Now uses healthStorageRouter to read from Supabase when enabled
 */
async function syncUserEmbeddings(userId: string): Promise<number> {
  try {
    // Get recent blood work sessions from Supabase via healthStorageRouter
    const biomarkerSessions = await healthRouter.getBiomarkerSessions(userId, 10);
    
    // Get measurements for each session to build blood work data for embeddings
    const bloodWorkData: any[] = [];
    for (const session of biomarkerSessions) {
      if (!session.id) continue;
      
      try {
        const measurements = await healthRouter.getMeasurementsBySession(session.id);
        if (measurements.length > 0) {
          bloodWorkData.push({
            id: session.id,
            testDate: session.testDate,
            biomarkers: measurements.map(m => ({
              name: m.biomarkerId, // Use biomarkerId as identifier
              value: m.valueCanonical,
              unit: m.unitCanonical,
            })),
          });
        }
      } catch (err: any) {
        logger.warn(`[InsightsScheduler] Failed to get measurements for session ${session.id}:`, err?.message || err);
      }
    }

    // Get recent HealthKit metrics from Supabase via healthStorageRouter
    const healthKitData = await healthRouter.getUserDailyMetrics(userId, { limit: 30 });

    let count = 0;

    if (bloodWorkData.length > 0) {
      count += await syncBloodWorkEmbeddings(userId, bloodWorkData);
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
