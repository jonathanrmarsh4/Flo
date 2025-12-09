/**
 * Morning Briefing Scheduler
 * 
 * Runs at 07:00 local time for each user to generate and deliver morning briefings.
 * 
 * Implementation:
 * - Checks every hour which users should get briefings now
 * - Uses users.timezone column to determine local time
 * - CATCH-UP MODE: Also generates for users who haven't had briefings today and it's past 7 AM
 * - Sends push notifications with personalized briefing content
 */

import cron from 'node-cron';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { logger } from '../logger';
import { formatInTimeZone, format } from 'date-fns-tz';
import { generateBriefingForUser, getTodaysBriefing } from './morningBriefingOrchestrator';
import { getHealthId } from './supabaseHealthStorage';

let cronTask: ReturnType<typeof cron.schedule> | null = null;
const runningGenerations = new Set<string>();

/**
 * Determine if it's 07:00 in the user's timezone
 */
function is7AMInTimezone(timezone: string, currentTime: Date = new Date()): boolean {
  try {
    const localTime = formatInTimeZone(currentTime, timezone, 'HH:mm');
    return localTime === '07:00';
  } catch (error) {
    logger.error(`[MorningBriefingScheduler] Invalid timezone: ${timezone}`, error);
    return false;
  }
}

/**
 * Determine if it's past 07:00 but before noon in the user's timezone (for catch-up mode)
 */
function isPast7AMBeforeNoon(timezone: string, currentTime: Date = new Date()): boolean {
  try {
    const localHour = parseInt(formatInTimeZone(currentTime, timezone, 'HH'));
    return localHour >= 7 && localHour < 12;
  } catch (error) {
    logger.error(`[MorningBriefingScheduler] Invalid timezone for catch-up: ${timezone}`, error);
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
    logger.error(`[MorningBriefingScheduler] Invalid timezone for date: ${timezone}`, error);
    return format(currentTime, 'yyyy-MM-dd');
  }
}

/**
 * Process morning briefing generation for all eligible users
 */
async function processBriefingGeneration(catchUpMode: boolean = false) {
  const startTime = Date.now();
  logger.info(`[MorningBriefingScheduler] Starting hourly check for users needing briefings (catchUp: ${catchUpMode})`);
  
  try {
    const now = new Date();
    
    // Get all active users with timezone and healthId
    const allUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        timezone: users.timezone,
        healthId: users.healthId,
      })
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          isNotNull(users.timezone),
          isNotNull(users.healthId)
        )
      );
    
    logger.info(`[MorningBriefingScheduler] Found ${allUsers.length} active users with timezone and healthId`);
    
    // Find users who need briefings
    const eligibleUsers: typeof allUsers = [];
    
    for (const user of allUsers) {
      if (!user.timezone || !user.healthId) continue;
      
      // Check if it's 7 AM in their timezone (exact match) or catch-up mode
      const is7AM = is7AMInTimezone(user.timezone, now);
      const isPast7AM = catchUpMode && isPast7AMBeforeNoon(user.timezone, now);
      
      if (is7AM || isPast7AM) {
        // Check if briefing already exists for today
        const existingBriefing = await getTodaysBriefing(user.id);
        
        if (!existingBriefing) {
          eligibleUsers.push(user);
          logger.debug(`[MorningBriefingScheduler] User ${user.id} eligible for briefing (7AM: ${is7AM}, catch-up: ${isPast7AM})`);
        } else {
          logger.debug(`[MorningBriefingScheduler] User ${user.id} already has briefing (7AM: ${is7AM}, catch-up: ${isPast7AM})`);
        }
      }
    }
    
    if (catchUpMode) {
      logger.info(`[MorningBriefingScheduler] CATCH-UP mode found ${eligibleUsers.length} users needing briefings`);
    }
    
    if (eligibleUsers.length === 0) {
      logger.info(`[MorningBriefingScheduler] No users eligible, check complete (${Date.now() - startTime}ms)`);
      return;
    }
    
    logger.info(`[MorningBriefingScheduler] Processing ${eligibleUsers.length} users for morning briefings`);
    
    // Process each eligible user
    let successCount = 0;
    let failCount = 0;
    
    for (const user of eligibleUsers) {
      // Skip if already processing (idempotency)
      if (runningGenerations.has(user.id)) {
        logger.warn(`[MorningBriefingScheduler] Skipping ${user.id} - already processing`);
        continue;
      }
      
      runningGenerations.add(user.id);
      
      try {
        const eventDate = getTodayInTimezone(user.timezone!, now);
        
        logger.info(`[MorningBriefingScheduler] Generating briefing for ${user.id} (${user.firstName || 'User'}) on ${eventDate}`);
        
        const briefingId = await generateBriefingForUser(user.id, eventDate, 'scheduled');
        
        if (briefingId) {
          successCount++;
          logger.info(`[MorningBriefingScheduler] Successfully generated briefing ${briefingId} for ${user.id}`);
        } else {
          failCount++;
          logger.warn(`[MorningBriefingScheduler] Failed to generate briefing for ${user.id}`);
        }
      } catch (error) {
        failCount++;
        logger.error(`[MorningBriefingScheduler] Error generating briefing for ${user.id}:`, error);
      } finally {
        runningGenerations.delete(user.id);
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`[MorningBriefingScheduler] Completed: ${successCount} success, ${failCount} failed (${duration}ms)`);
    
  } catch (error) {
    logger.error('[MorningBriefingScheduler] Error in processBriefingGeneration:', error);
  }
}

/**
 * Start the morning briefing scheduler
 */
export function startMorningBriefingScheduler(): void {
  if (cronTask) {
    logger.warn('[MorningBriefingScheduler] Scheduler already running');
    return;
  }
  
  // Run at the top of every hour
  cronTask = cron.schedule('0 * * * *', () => processBriefingGeneration(false));
  
  logger.info('[MorningBriefingScheduler] Morning briefing scheduler initialized (runs hourly at 7 AM user local time)');
  
  // Run catch-up mode on startup after a short delay
  setTimeout(() => {
    logger.info('[MorningBriefingScheduler] Running startup catch-up check for missed briefings');
    processBriefingGeneration(true).catch(error => {
      logger.error('[MorningBriefingScheduler] Startup catch-up failed:', error);
    });
  }, 15000); // 15 second delay after startup
}

/**
 * Stop the morning briefing scheduler
 */
export function stopMorningBriefingScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[MorningBriefingScheduler] Scheduler stopped');
  }
}
