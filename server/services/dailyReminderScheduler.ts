import * as cron from 'node-cron';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { generateDailyReminder } from './dailyReminderService';
import { logger } from '../logger';

/**
 * Daily Reminder Scheduler
 * 
 * Runs at 10:00 AM UTC every day
 * Processes all users with reminderEnabled=true
 * Generates Grok-powered health insights and queues them in Supabase
 */

let cronTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Process daily reminders for all eligible users
 * Rate-limited to prevent overwhelming the Grok API
 */
async function processDailyReminders() {
  logger.info('[DailyReminderScheduler] Starting daily reminder generation job');
  
  try {
    // Query all users with reminders enabled
    const eligibleUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        reminderTime: users.reminderTime,
        reminderTimezone: users.reminderTimezone,
      })
      .from(users)
      .where(
        and(
          eq(users.reminderEnabled, true),
          eq(users.status, 'active')
        )
      );

    logger.info(`[DailyReminderScheduler] Found ${eligibleUsers.length} eligible users`);

    if (eligibleUsers.length === 0) {
      logger.info('[DailyReminderScheduler] No eligible users, job complete');
      return;
    }

    // Process users sequentially with rate limiting
    // Grok API can handle ~60 requests/min, so we add small delays
    let successCount = 0;
    let failureCount = 0;

    for (const user of eligibleUsers) {
      try {
        const result = await generateDailyReminder(
          user.id,
          user.reminderTime || '08:15',
          user.reminderTimezone || 'UTC'
        );

        if (result.success) {
          successCount++;
          logger.info(`[DailyReminderScheduler] ✓ Generated reminder for user ${user.id} (${user.firstName || 'Unknown'})`);
        } else {
          failureCount++;
          logger.warn(`[DailyReminderScheduler] ✗ Failed to generate reminder for user ${user.id}: ${result.error}`);
        }

        // Rate limiting: ~1 request per second to stay well under API limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        failureCount++;
        logger.error(`[DailyReminderScheduler] Error processing user ${user.id}:`, error);
      }
    }

    logger.info(`[DailyReminderScheduler] Daily reminder job complete: ${successCount} successful, ${failureCount} failed`);
    
  } catch (error: any) {
    logger.error('[DailyReminderScheduler] Fatal error in daily reminder job:', error);
  }
}

/**
 * Initialize the daily reminder cron job
 * Call this once when the Express server starts
 */
export function initializeDailyReminderScheduler() {
  // Only run in production or if explicitly enabled
  const enableScheduler = process.env.ENABLE_DAILY_REMINDERS === 'true' || process.env.NODE_ENV === 'production';
  
  if (!enableScheduler) {
    logger.info('[DailyReminderScheduler] Daily reminder scheduler disabled (set ENABLE_DAILY_REMINDERS=true to enable)');
    return;
  }

  // Prevent duplicate initialization
  if (cronTask) {
    logger.warn('[DailyReminderScheduler] Scheduler already initialized');
    return;
  }

  // Schedule job to run at 10:00 AM UTC every day
  // Cron format: "minute hour day month day-of-week"
  cronTask = cron.schedule('0 10 * * *', async () => {
    await processDailyReminders();
  }, {
    timezone: 'UTC',
  });

  logger.info('[DailyReminderScheduler] Daily reminder scheduler initialized (runs at 10:00 AM UTC)');
}

/**
 * Stop the daily reminder scheduler
 * Useful for graceful shutdown
 */
export function stopDailyReminderScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[DailyReminderScheduler] Scheduler stopped');
  }
}

/**
 * Manually trigger reminder generation (for testing)
 * Only available in development
 */
export async function triggerManualReminderGeneration() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Manual trigger not allowed in production');
  }
  
  logger.info('[DailyReminderScheduler] Manual trigger initiated');
  await processDailyReminders();
}
