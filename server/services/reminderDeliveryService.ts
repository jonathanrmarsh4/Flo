import * as cron from 'node-cron';
import { getSupabaseClient } from './supabaseClient';
import { apnsService } from './apnsService';
import { logger } from '../logger';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';

let deliveryCronTask: ReturnType<typeof cron.schedule> | null = null;
let surveyCronTask: ReturnType<typeof cron.schedule> | null = null;
let experimentReminderCronTask: ReturnType<typeof cron.schedule> | null = null;

// Durable notification tracking using Supabase to survive restarts and work across instances
// Uses the notification_sends table with columns: health_id, local_date, notification_type, sent_at

async function wasNotificationSentToday(localDate: string, healthId: string, type: '3pm_survey' | 'experiment_reminder'): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('notification_sends')
      .select('id')
      .eq('health_id', healthId)
      .eq('local_date', localDate)
      .eq('notification_type', type)
      .limit(1);
    
    if (error) {
      // If table doesn't exist, log and allow notification (fail-open)
      logger.warn(`[NotificationTracker] Error checking notification status, allowing send: ${error.message}`);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    logger.warn(`[NotificationTracker] Exception checking notification status, allowing send`, { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function markNotificationSent(localDate: string, healthId: string, type: '3pm_survey' | 'experiment_reminder'): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('notification_sends')
      .upsert({
        health_id: healthId,
        local_date: localDate,
        notification_type: type,
        sent_at: new Date().toISOString(),
      }, {
        onConflict: 'health_id,local_date,notification_type',
        ignoreDuplicates: true,
      });
    
    if (error) {
      logger.warn(`[NotificationTracker] Error recording notification send: ${error.message}`);
    }
  } catch (error) {
    logger.warn(`[NotificationTracker] Exception recording notification send`, { error: error instanceof Error ? error.message : String(error) });
  }
}

interface QueuedReminder {
  id: string;
  user_id: string;
  title: string;
  body: string;
  schedule_at_ms: number;
  delivered: boolean;
}

async function deliverQueuedReminders() {
  const supabase = getSupabaseClient();
  const now = Date.now();
  
  try {
    const { data: pendingReminders, error } = await supabase
      .from('daily_reminders')
      .select('*')
      .eq('delivered', false)
      .lte('schedule_at_ms', now)
      .order('schedule_at_ms', { ascending: true })
      .limit(50);

    if (error) {
      logger.error('[ReminderDelivery] Failed to fetch pending reminders:', error);
      return;
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      return;
    }

    logger.info(`[ReminderDelivery] Found ${pendingReminders.length} reminders ready for delivery`);

    for (const reminder of pendingReminders as QueuedReminder[]) {
      try {
        // Map health_id to internal user_id for device token lookup
        // reminder.user_id contains health_id, but device_tokens are stored by internal user_id
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('health_id', reminder.user_id)
          .single();
        
        const internalUserId = userProfile?.user_id || reminder.user_id;
        
        if (!userProfile) {
          logger.warn(`[ReminderDelivery] No user_profile found for health_id ${reminder.user_id}, using as-is`);
        } else {
          logger.debug(`[ReminderDelivery] Mapped health_id ${reminder.user_id} -> internal user_id ${internalUserId}`);
        }
        
        const result = await apnsService.sendToUser(
          internalUserId,
          {
            title: reminder.title,
            body: reminder.body,
            data: {
              type: 'daily_insight',
              reminderId: reminder.id,
            }
          }
        );

        if (result.success && result.devicesReached && result.devicesReached > 0) {
          const { error: updateError } = await supabase
            .from('daily_reminders')
            .update({ delivered: true })
            .eq('id', reminder.id);

          if (updateError) {
            logger.error(`[ReminderDelivery] Failed to mark reminder ${reminder.id} as delivered:`, updateError);
          } else {
            logger.info(`[ReminderDelivery] Delivered reminder ${reminder.id} to user ${reminder.user_id} (${result.devicesReached} devices)`);
          }
        } else {
          logger.warn(`[ReminderDelivery] No devices reached for user ${reminder.user_id}`, { error: result.error });
          
          const scheduledAt = new Date(reminder.schedule_at_ms);
          const hoursOld = (now - reminder.schedule_at_ms) / (1000 * 60 * 60);
          if (hoursOld > 24) {
            await supabase
              .from('daily_reminders')
              .update({ delivered: true })
              .eq('id', reminder.id);
            logger.info(`[ReminderDelivery] Expired reminder ${reminder.id} (24h+ old, no devices)`);
          }
        }
      } catch (error) {
        logger.error(`[ReminderDelivery] Error delivering reminder ${reminder.id}:`, error);
      }
    }
  } catch (error) {
    logger.error('[ReminderDelivery] Fatal error in delivery job:', error);
  }
}

async function getActiveSupplementExperiments(healthId: string): Promise<{ id: string; product_name: string }[]> {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];
  
  const { data: experiments } = await supabase
    .from('n1_experiments')
    .select('id, product_name')
    .eq('health_id', healthId)
    .in('status', ['active', 'baseline']);
  
  if (!experiments || experiments.length === 0) {
    return [];
  }
  
  const experimentsNeedingCheckin: { id: string; product_name: string }[] = [];
  
  for (const exp of experiments) {
    const { data: checkins } = await supabase
      .from('n1_daily_checkins')
      .select('id')
      .eq('experiment_id', exp.id)
      .eq('checkin_date', today)
      .limit(1);
    
    if (!checkins || checkins.length === 0) {
      experimentsNeedingCheckin.push(exp);
    }
  }
  
  return experimentsNeedingCheckin;
}

/**
 * Evening Experiment Check-in Reminder (8PM local time)
 * Sends reminder to users with active experiments who haven't completed today's check-in
 */
async function processEveningExperimentReminders() {
  try {
    const now = new Date();
    
    const activeUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        timezone: users.timezone,
        reminderTimezone: users.reminderTimezone,
      })
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          isNotNull(users.timezone)
        )
      );

    if (activeUsers.length === 0) {
      return;
    }

    const supabase = getSupabaseClient();
    const eligibleUsers: (typeof activeUsers[0] & { healthId: string; experiments: { id: string; product_name: string }[]; isCatchUp: boolean })[] = [];
    
    for (const user of activeUsers) {
      try {
        const timezone = user.timezone || (user.reminderTimezone !== 'UTC' ? user.reminderTimezone : null) || 'UTC';
        // Use formatInTimeZone for reliable timezone conversion
        const userHour = parseInt(formatInTimeZone(now, timezone, 'HH'), 10);
        const userMinute = parseInt(formatInTimeZone(now, timezone, 'mm'), 10);
        const userToday = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
        
        // Determine notification eligibility:
        // - Primary window: 20:00-20:15 (widened from 5 to 15 minutes for scheduler reliability)
        // - Catch-up window: 20:15-22:00 (sends if notification wasn't sent yet today, inclusive of 22:00)
        const inPrimaryWindow = userHour === 20 && userMinute >= 0 && userMinute < 15;
        const inCatchUpWindow = (userHour === 20 && userMinute >= 15) || userHour === 21 || (userHour === 22 && userMinute === 0);
        const isEligibleTimeWindow = inPrimaryWindow || inCatchUpWindow;
        
        if (isEligibleTimeWindow) {
          const healthIdResult = await supabase
            .from('user_profiles')
            .select('health_id')
            .eq('user_id', user.id)
            .single();

          if (healthIdResult.error || !healthIdResult.data) {
            continue;
          }

          // Skip if notification was already sent today (prevents duplicates during catch-up window)
          if (await wasNotificationSentToday(userToday, healthIdResult.data.health_id, 'experiment_reminder')) {
            continue;
          }

          // Check for experiments needing check-in
          const experimentsNeedingCheckin = await getActiveSupplementExperiments(healthIdResult.data.health_id);
          
          if (experimentsNeedingCheckin.length > 0) {
            eligibleUsers.push({ 
              ...user, 
              healthId: healthIdResult.data.health_id,
              experiments: experimentsNeedingCheckin,
              isCatchUp: inCatchUpWindow && !inPrimaryWindow,
            });
          }
        }
      } catch (error) {
        logger.warn(`[ExperimentReminder] Error checking user ${user.id}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (eligibleUsers.length === 0) {
      return;
    }

    const scheduledCount = eligibleUsers.filter(u => !u.isCatchUp).length;
    const catchUpCount = eligibleUsers.filter(u => u.isCatchUp).length;
    logger.info(`[ExperimentReminder] Sending evening experiment reminders to ${eligibleUsers.length} users (${scheduledCount} scheduled, ${catchUpCount} catch-up)`);

    for (const user of eligibleUsers) {
      try {
        const timezone = user.timezone || 'UTC';
        const userToday = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
        const experimentCount = user.experiments.length;
        const supplementNames = user.experiments.map(e => e.product_name).slice(0, 2).join(', ');
        const suffix = experimentCount > 2 ? ` +${experimentCount - 2} more` : '';
        
        const title = 'Log Your Supplement Check-in';
        const body = `${user.firstName ? `Hey ${user.firstName}! ` : ''}Don't forget to log how you're feeling with ${supplementNames}${suffix} today.`;
        
        // Look up internal user_id from user_profiles (device tokens are stored by internal user_id, not Replit Auth ID)
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('health_id', user.healthId)
          .single();
        
        const internalUserId = userProfile?.user_id || user.id;
        if (userProfile?.user_id) {
          logger.debug(`[ExperimentReminder] Mapped Replit ID ${user.id} -> internal user_id ${internalUserId} via health_id ${user.healthId}`);
        }
        
        const result = await apnsService.sendToUser(
          internalUserId,
          {
            title,
            body,
            data: {
              type: 'experiment_checkin',
              deepLink: `flo://experiments/${user.experiments[0].id}`,
              experimentId: user.experiments[0].id,
              experimentCount,
            }
          }
        );

        if (result.success && result.devicesReached && result.devicesReached > 0) {
          // Mark notification as sent to prevent duplicates during catch-up window
          markNotificationSent(userToday, user.healthId, 'experiment_reminder');
          const sendType = user.isCatchUp ? 'CATCH-UP' : 'SCHEDULED';
          logger.info(`[ExperimentReminder] ${sendType} reminder sent to ${user.firstName || user.id} (internal: ${internalUserId}) for ${experimentCount} experiment(s)`);
        }
      } catch (error) {
        logger.warn(`[ExperimentReminder] Failed to send notification to user ${user.id}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    logger.error('[ExperimentReminder] Fatal error in evening reminder job', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * SIMPLE 3PM SURVEY NOTIFICATION - COMPLETE REWRITE
 * 
 * Previous implementation had timezone bugs after ~20 fix attempts.
 * This version uses a dead-simple approach:
 * 
 * 1. Calculate what 3PM is in the user's timezone, converted to UTC
 * 2. Check if current UTC time is past that 3PM-in-UTC AND before 6PM-in-UTC (catch-up window)
 * 3. Check if notification already sent today (using user's local date)
 * 4. Send notification
 * 
 * Key insight: Instead of comparing hours in user's timezone (which is error-prone),
 * we convert 3PM local to a UTC timestamp and compare UTC to UTC.
 */
async function processThreePMSurveyNotifications() {
  try {
    const nowUTC = new Date();
    
    // Only log once per hour to reduce noise
    if (nowUTC.getMinutes() === 0) {
      logger.info(`[3PMSurvey] Hourly check at ${nowUTC.toISOString()}`);
    }
    
    const activeUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        timezone: users.timezone,
        reminderTimezone: users.reminderTimezone,
      })
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          isNotNull(users.timezone)
        )
      );

    if (activeUsers.length === 0) {
      return;
    }

    const supabase = getSupabaseClient();
    
    for (const user of activeUsers) {
      try {
        // Get user's timezone - prefer auto-synced timezone over manual reminderTimezone
        const userTimezone = user.timezone || (user.reminderTimezone !== 'UTC' ? user.reminderTimezone : null) || 'UTC';
        
        // Get user's local date and time using formatInTimeZone
        const userLocalDate = formatInTimeZone(nowUTC, userTimezone, 'yyyy-MM-dd');
        const userLocalHour = parseInt(formatInTimeZone(nowUTC, userTimezone, 'HH'), 10);
        const userLocalMinute = parseInt(formatInTimeZone(nowUTC, userTimezone, 'mm'), 10);
        
        // Simple check: Is it between 3PM and 6PM in the user's timezone?
        // Primary window: 15:00-15:14 (exactly at 3PM)
        // Catch-up window: 15:15-17:59 (if missed, send before 6PM)
        const isPastThreePM = userLocalHour >= 15;
        const isBeforeSixPM = userLocalHour < 18;
        
        if (!isPastThreePM || !isBeforeSixPM) {
          continue; // Not in the 3PM-6PM window for this user
        }
        
        // Get user's health_id for tracking
        const healthIdResult = await supabase
          .from('user_profiles')
          .select('health_id')
          .eq('user_id', user.id)
          .single();

        if (healthIdResult.error || !healthIdResult.data) {
          continue; // No health profile, skip
        }
        
        const healthId = healthIdResult.data.health_id;

        // Check if notification was already sent today (CRITICAL: prevents duplicates)
        if (await wasNotificationSentToday(userLocalDate, healthId, '3pm_survey')) {
          continue; // Already sent today
        }

        // Check if survey was already completed today (don't nag if done)
        const { data: existingSurvey } = await supabase
          .from('daily_subjective_surveys')
          .select('id')
          .eq('health_id', healthId)
          .eq('local_date', userLocalDate)
          .limit(1);

        if (existingSurvey && existingSurvey.length > 0) {
          continue; // Survey already completed, skip notification
        }

        // Get active supplements for enhanced notification
        const activeSupplements = await getActiveSupplementExperiments(healthId);
        
        // Build notification content
        let title = '3PM Check-In';
        let body = `${user.firstName ? `Hey ${user.firstName}! ` : ''}Quick 30-second wellbeing check - how are you feeling?`;
        
        if (activeSupplements.length > 0) {
          const supplementNames = activeSupplements.map(s => s.product_name).join(', ');
          title = 'Daily Check-In';
          body = `${user.firstName ? `Hey ${user.firstName}! ` : ''}Time to log your wellbeing + track your ${supplementNames} progress.`;
        }
        
        // Get internal user_id for device token lookup
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('health_id', healthId)
          .single();
        
        const internalUserId = userProfile?.user_id || user.id;
        
        // Send the notification
        const result = await apnsService.sendToUser(
          internalUserId,
          {
            title,
            body,
            data: {
              type: 'survey_3pm',
              deepLink: 'flo://survey/3pm',
              hasSupplementCheckins: activeSupplements.length > 0,
              supplementCount: activeSupplements.length,
            }
          }
        );

        if (result.success && result.devicesReached && result.devicesReached > 0) {
          // Mark notification as sent to prevent duplicates
          await markNotificationSent(userLocalDate, healthId, '3pm_survey');
          
          const localTimeStr = `${userLocalHour.toString().padStart(2, '0')}:${userLocalMinute.toString().padStart(2, '0')}`;
          logger.info(`[3PMSurvey] ✓ Sent to ${user.firstName || user.id} (${userTimezone} ${localTimeStr} local, ${activeSupplements.length} supplements)`);
        }
      } catch (error) {
        logger.warn(`[3PMSurvey] Error processing user ${user.id}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    logger.error('[3PMSurvey] Fatal error in survey notification job', { error: error instanceof Error ? error.message : String(error) });
  }
}

export function initializeReminderDeliveryService() {
  const enableService = process.env.ENABLE_DAILY_REMINDERS === 'true' || process.env.NODE_ENV === 'production';
  
  if (!enableService) {
    logger.info('[ReminderDelivery] Reminder delivery service disabled (set ENABLE_DAILY_REMINDERS=true to enable)');
    return;
  }

  if (deliveryCronTask) {
    logger.warn('[ReminderDelivery] Service already initialized');
    return;
  }

  deliveryCronTask = cron.schedule('* * * * *', async () => {
    await deliverQueuedReminders();
  }, {
    timezone: 'UTC',
  });

  surveyCronTask = cron.schedule('*/5 * * * *', async () => {
    await processThreePMSurveyNotifications();
  }, {
    timezone: 'UTC',
  });

  // Evening experiment reminder (runs every 5 minutes to catch 8PM in each timezone)
  experimentReminderCronTask = cron.schedule('*/5 * * * *', async () => {
    await processEveningExperimentReminders();
  }, {
    timezone: 'UTC',
  });

  logger.info('[ReminderDelivery] Reminder delivery service initialized (checks every minute)');
  logger.info('[3PMSurvey] 3PM survey notification service initialized (checks every 5 minutes)');
  logger.info('[ExperimentReminder] Evening experiment reminder initialized (checks every 5 minutes at 8PM local)');
}

export function stopReminderDeliveryService() {
  if (deliveryCronTask) {
    deliveryCronTask.stop();
    deliveryCronTask = null;
    logger.info('[ReminderDelivery] Delivery service stopped');
  }
  if (surveyCronTask) {
    surveyCronTask.stop();
    surveyCronTask = null;
    logger.info('[3PMSurvey] Survey notification service stopped');
  }
  if (experimentReminderCronTask) {
    experimentReminderCronTask.stop();
    experimentReminderCronTask = null;
    logger.info('[ExperimentReminder] Experiment reminder service stopped');
  }
}

export async function triggerManualDelivery() {
  logger.info('[ReminderDelivery] Manual delivery triggered');
  await deliverQueuedReminders();
}

/**
 * Clean up test reminders from development/testing
 * Removes undelivered reminders for known test user IDs
 */
export async function cleanupTestReminders(): Promise<{ deleted: number; testIds: string[] }> {
  const supabase = getSupabaseClient();
  
  // Known test health_ids from logs
  const testHealthIds = [
    'test-persist-v2',
    'backend-test-final',
    'e2e-upload-test',
    'upload-fix-test',
    'quick-test-v2',
    'pdf-test-v3',
    'final-test',
    'test-user-upload-history',
    'success-test',
    'test-user-123',
    'test_user_calcium_exp',
    't3QGZd',
    'e2e-winner',
    '444abc7b-fa12-47ef-8085-bd7c40d27420',
    'test-user-comprehensive-report-123',
    'K8aFip',
  ];
  
  try {
    // Delete reminders for test users
    const { data, error } = await supabase
      .from('daily_reminders')
      .delete()
      .in('user_id', testHealthIds)
      .select('id');
    
    if (error) {
      logger.error('[ReminderDelivery] Failed to cleanup test reminders:', error);
      throw error;
    }
    
    const deletedCount = data?.length || 0;
    logger.info(`[ReminderDelivery] Cleaned up ${deletedCount} test reminders for ${testHealthIds.length} test user IDs`);
    
    return { deleted: deletedCount, testIds: testHealthIds };
  } catch (error) {
    logger.error('[ReminderDelivery] Error during test cleanup:', error);
    throw error;
  }
}

export async function triggerManualSurveyNotification(userId: string) {
  try {
    const user = await db
      .select({
        id: users.id,
        firstName: users.firstName,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return { success: false, error: 'User not found' };
    }

    const supabase = getSupabaseClient();
    const healthIdResult = await supabase
      .from('user_profiles')
      .select('health_id, user_id')
      .eq('user_id', userId)
      .single();

    let activeSupplements: { id: string; product_name: string }[] = [];
    if (healthIdResult.data?.health_id) {
      activeSupplements = await getActiveSupplementExperiments(healthIdResult.data.health_id);
    }

    let title = '3PM Check-In';
    let body = `${user[0].firstName ? `Hey ${user[0].firstName}! ` : ''}Quick 30-second wellbeing check - how are you feeling?`;
    
    if (activeSupplements.length > 0) {
      const supplementNames = activeSupplements.map(s => s.product_name).join(', ');
      title = 'Daily Check-In';
      body = `${user[0].firstName ? `Hey ${user[0].firstName}! ` : ''}Time to log your wellbeing + track your ${supplementNames} progress.`;
    }

    // Use internal user_id from user_profiles if available (device tokens are stored by internal user_id)
    const internalUserId = healthIdResult.data?.user_id || userId;
    if (healthIdResult.data?.user_id && healthIdResult.data.user_id !== userId) {
      logger.info(`[3PMSurvey] Manual notification: Using internal user_id ${internalUserId} (input: ${userId})`);
    }

    const result = await apnsService.sendToUser(
      internalUserId,
      {
        title,
        body,
        data: {
          type: 'survey_3pm',
          deepLink: 'flo://survey/3pm',
          hasSupplementCheckins: activeSupplements.length > 0,
          supplementCount: activeSupplements.length,
        }
      }
    );

    logger.info(`[3PMSurvey] Manual notification sent to user ${userId} (internal: ${internalUserId}, ${activeSupplements.length} supplements):`, result);
    return result;
  } catch (error) {
    logger.error(`[3PMSurvey] Manual notification failed for user ${userId}`, { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: String(error) };
  }
}
