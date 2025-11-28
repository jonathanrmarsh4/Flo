/**
 * Daily Insights Engine v2.0 - Timezone-Aware Scheduler
 * 
 * Runs insights generation at 06:00 local time for each user.
 * 
 * Implementation:
 * - Checks every hour which users should get insights now
 * - Uses users.timezone column to determine local time
 * - CATCH-UP MODE: Also generates for users who haven't had insights today and it's past 6 AM
 * - Generates insights using the full 4-layer analytical system
 * - Logs all generated insights to daily_insights table
 */

import cron from 'node-cron';
import { db } from '../db';
import { users, dailyInsights, userDailyMetrics } from '../../shared/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { logger } from '../logger';
import { formatInTimeZone, format } from 'date-fns-tz';
import { generateDailyInsights } from './insightsEngineV2';

let cronTask: ReturnType<typeof cron.schedule> | null = null;
const runningGenerations = new Set<string>(); // Track running insight generations for idempotency

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
 * Determine if it's past 06:00 in the user's timezone (for catch-up mode)
 */
function isPast6AMInTimezone(timezone: string, currentTime: Date = new Date()): boolean {
  try {
    const localHour = parseInt(formatInTimeZone(currentTime, timezone, 'HH'));
    return localHour >= 6;
  } catch (error) {
    logger.error(`[InsightsV2Scheduler] Invalid timezone for catch-up: ${timezone}`, error);
    return false;
  }
}

/**
 * Get today's date in user's local timezone (YYYY-MM-DD format)
 */
function getTodayInTimezone(timezone: string, currentTime: Date = new Date()): string {
  try {
    return formatInTimeZone(currentTime, timezone, 'yyyy-MM-dd');
  } catch (error) {
    logger.error(`[InsightsV2Scheduler] Invalid timezone for date: ${timezone}`, error);
    return format(currentTime, 'yyyy-MM-dd');
  }
}

/**
 * Process insights generation for all eligible users
 * 
 * Runs at the top of every hour to check which users need insights
 * Includes CATCH-UP mode for users who missed their 6 AM generation
 */
async function processInsightsGeneration(catchUpMode: boolean = false) {
  const startTime = Date.now();
  logger.info(`[InsightsV2Scheduler] Starting hourly check for users needing insights (catchUp: ${catchUpMode})`);
  
  try {
    // Get all active users with timezone data who have health data
    const usersWithData = await db
      .selectDistinct({ userId: userDailyMetrics.userId })
      .from(userDailyMetrics);
    
    const userIdsWithData = new Set(usersWithData.map(u => u.userId));
    
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
    
    // Filter to users who actually have health data
    const usersWithHealthData = allUsers.filter(u => userIdsWithData.has(u.id));
    
    logger.info(`[InsightsV2Scheduler] Found ${allUsers.length} active users, ${usersWithHealthData.length} have health data`);
    
    const now = new Date();
    let eligibleUsers: typeof usersWithHealthData = [];
    
    if (catchUpMode) {
      // CATCH-UP MODE: Find users who haven't had insights today and it's past 6 AM for them
      for (const user of usersWithHealthData) {
        if (!user.timezone) continue;
        
        // Check if it's past 6 AM in their timezone
        if (!isPast6AMInTimezone(user.timezone, now)) continue;
        
        // Check if they already have insights for today (in their local timezone)
        const todayLocal = getTodayInTimezone(user.timezone, now);
        const existingInsights = await db
          .select({ id: dailyInsights.id })
          .from(dailyInsights)
          .where(
            and(
              eq(dailyInsights.userId, user.id),
              eq(dailyInsights.generatedDate, todayLocal)
            )
          )
          .limit(1);
        
        if (existingInsights.length === 0) {
          eligibleUsers.push(user);
          logger.info(`[InsightsV2Scheduler] CATCH-UP: User ${user.id} (${user.firstName || 'Unknown'}) missing insights for ${todayLocal}`);
        }
      }
      
      logger.info(`[InsightsV2Scheduler] CATCH-UP mode found ${eligibleUsers.length} users needing insights`);
    } else {
      // NORMAL MODE: Check for exact 06:00 local time match
      eligibleUsers = usersWithHealthData.filter(user => 
        user.timezone && is6AMInTimezone(user.timezone, now)
      );
      
      logger.info(`[InsightsV2Scheduler] Found ${eligibleUsers.length} users at exactly 06:00 local time`);
    }
    
    if (eligibleUsers.length === 0) {
      const elapsed = Date.now() - startTime;
      logger.info(`[InsightsV2Scheduler] No users eligible, check complete (${elapsed}ms)`);
      return;
    }
    
    // Generate insights for eligible users
    for (const user of eligibleUsers) {
      const userId = user.id;
      
      // Check if already running for this user (idempotency lock)
      if (runningGenerations.has(userId)) {
        logger.info(`[InsightsV2Scheduler] Insights already generating for user ${userId}, skipping`);
        continue;
      }
      
      logger.info(`[InsightsV2Scheduler] Generating insights for user ${user.id} (${user.firstName || 'Unknown'}) in timezone ${user.timezone}`);
      
      // Add to running set within try/finally to ensure cleanup happens
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
        // Always remove from running set, even if errors occur
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
 * Also runs catch-up mode on startup to generate missing insights
 */
export function startInsightsSchedulerV2() {
  if (cronTask) {
    logger.warn('[InsightsV2Scheduler] Scheduler already running');
    return;
  }
  
  // Run at the top of every hour (normal 6 AM check)
  cronTask = cron.schedule('0 * * * *', () => processInsightsGeneration(false));
  
  logger.info('[InsightsV2Scheduler] Timezone-aware insights scheduler initialized (runs hourly)');
  
  // Run catch-up mode on startup after a short delay (give server time to initialize)
  setTimeout(() => {
    logger.info('[InsightsV2Scheduler] Running startup catch-up check for missed insights');
    processInsightsGeneration(true).catch(error => {
      logger.error('[InsightsV2Scheduler] Startup catch-up failed:', error);
    });
  }, 10000); // 10 second delay after startup
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
 * @param catchUp - If true, generates for all users missing today's insights
 */
export async function triggerInsightsGenerationCheck(catchUp: boolean = false) {
  logger.info(`[InsightsV2Scheduler] Manual trigger requested (catchUp: ${catchUp})`);
  await processInsightsGeneration(catchUp);
}

/**
 * Trigger catch-up mode to generate insights for users who missed their 6 AM generation
 */
export async function triggerCatchUpGeneration() {
  logger.info('[InsightsV2Scheduler] Catch-up generation triggered');
  await processInsightsGeneration(true);
}
