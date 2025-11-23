/**
 * Daily Insights Engine v2.0 - Timezone-Aware Scheduler
 * 
 * Runs insights generation at 06:00 local time for each user.
 * 
 * Implementation:
 * - Checks every hour which users should get insights now
 * - Uses users.timezone column to determine local time
 * - Generates insights using the full 4-layer analytical system
 * - Logs all generated insights to daily_insights table
 */

import cron from 'node-cron';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { logger } from '../logger';
import { formatInTimeZone } from 'date-fns-tz';
import { generateDailyInsights } from './insightsEngineV2';

let cronTask: ReturnType<typeof cron.schedule> | null = null;
const runningGenerations = new Set<number>(); // Track running insight generations for idempotency

/**
 * Determine if it's 06:00 in the user's timezone
 * 
 * @param timezone - User's IANA timezone (e.g., 'America/Los_Angeles')
 * @param currentTime - Current UTC time
 * @returns true if it's 06:00 local time
 */
function is6AMInTimezone(timezone: string, currentTime: Date = new Date()): boolean {
  try {
    const localTime = formatInTimeZone(currentTime, timezone, 'HH:mm');
    return localTime === '06:00';
  } catch (error) {
    logger.error(`[InsightsV2Scheduler] Invalid timezone: ${timezone}`, error);
    return false;
  }
}

/**
 * Process insights generation for all eligible users
 * 
 * Runs at the top of every hour to check which users need insights
 */
async function processInsightsGeneration() {
  const startTime = Date.now();
  logger.info('[InsightsV2Scheduler] Starting hourly check for users needing insights');
  
  try {
    // Get all active users with timezone data
    const allUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        timezone: users.timezone,
      })
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          isNotNull(users.timezone)
        )
      );
    
    logger.info(`[InsightsV2Scheduler] Checking ${allUsers.length} users for 06:00 local time`);
    
    // Filter to users where it's currently 06:00 local time
    const now = new Date();
    const eligibleUsers = allUsers.filter(user => 
      user.timezone && is6AMInTimezone(user.timezone, now)
    );
    
    logger.info(`[InsightsV2Scheduler] Found ${eligibleUsers.length} users at 06:00 local time`);
    
    if (eligibleUsers.length === 0) {
      const elapsed = Date.now() - startTime;
      logger.info(`[InsightsV2Scheduler] No users eligible, check complete (${elapsed}ms)`);
      return;
    }
    
    // Generate insights for eligible users
    for (const user of eligibleUsers) {
      const userId = parseInt(user.id, 10);
      
      // Check if already running for this user (idempotency lock)
      if (runningGenerations.has(userId)) {
        logger.info(`[InsightsV2Scheduler] Insights already generating for user ${userId}, skipping`);
        continue;
      }
      
      logger.info(`[InsightsV2Scheduler] Generating insights for user ${user.id} (${user.firstName || 'Unknown'}) in timezone ${user.timezone}`);
      
      // Add to running set (idempotency lock)
      runningGenerations.add(userId);
      
      try {
        // Call full insights generation pipeline
        const insights = await generateDailyInsights(userId, false);
        
        if (insights.length > 0) {
          logger.info(`[InsightsV2Scheduler] Successfully generated ${insights.length} insights for user ${userId}`);
        } else {
          logger.info(`[InsightsV2Scheduler] No new insights generated for user ${userId} (may have already run today)`);
        }
      } catch (error: any) {
        logger.error(`[InsightsV2Scheduler] Error generating insights for user ${userId}:`, error);
      } finally {
        // Remove from running set
        runningGenerations.delete(userId);
      }
    }
    
    const elapsed = Date.now() - startTime;
    logger.info(`[InsightsV2Scheduler] Insights generation check complete (${elapsed}ms)`);
    
  } catch (error: any) {
    logger.error('[InsightsV2Scheduler] Fatal error in insights generation check:', error);
  }
}

/**
 * Start the timezone-aware insights scheduler
 * 
 * Runs at the top of every hour (e.g., 00:00, 01:00, 02:00, etc.)
 */
export function startInsightsSchedulerV2() {
  if (cronTask) {
    logger.warn('[InsightsV2Scheduler] Scheduler already running');
    return;
  }
  
  // Run at the top of every hour
  cronTask = cron.schedule('0 * * * *', processInsightsGeneration);
  
  logger.info('[InsightsV2Scheduler] Timezone-aware insights scheduler initialized (runs hourly)');
}

/**
 * Stop the scheduler
 */
export function stopInsightsSchedulerV2() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[InsightsV2Scheduler] Scheduler stopped');
  }
}

/**
 * Manually trigger insights generation check (for testing)
 */
export async function triggerInsightsGenerationCheck() {
  logger.info('[InsightsV2Scheduler] Manual trigger requested');
  await processInsightsGeneration();
}
