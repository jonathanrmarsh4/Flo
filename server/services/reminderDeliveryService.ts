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
    const eligibleUsers: (typeof activeUsers[0] & { healthId: string; experiments: { id: string; product_name: string }[] })[] = [];
    
    for (const user of activeUsers) {
      try {
        const timezone = user.timezone || (user.reminderTimezone !== 'UTC' ? user.reminderTimezone : null) || 'UTC';
        // Use formatInTimeZone for reliable timezone conversion
        const userHour = parseInt(formatInTimeZone(now, timezone, 'HH'), 10);
        const userMinute = parseInt(formatInTimeZone(now, timezone, 'mm'), 10);
        
        // Check if it's 8PM local time (20:00 - 20:04)
        if (userHour === 20 && userMinute >= 0 && userMinute < 5) {
          const healthIdResult = await supabase
            .from('user_profiles')
            .select('health_id')
            .eq('user_id', user.id)
            .single();

          if (healthIdResult.error || !healthIdResult.data) {
            continue;
          }

          // Check for experiments needing check-in
          const experimentsNeedingCheckin = await getActiveSupplementExperiments(healthIdResult.data.health_id);
          
          if (experimentsNeedingCheckin.length > 0) {
            eligibleUsers.push({ 
              ...user, 
              healthId: healthIdResult.data.health_id,
              experiments: experimentsNeedingCheckin,
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

    logger.info(`[ExperimentReminder] Sending evening experiment reminders to ${eligibleUsers.length} users`);

    for (const user of eligibleUsers) {
      try {
        const experimentCount = user.experiments.length;
        const supplementNames = user.experiments.map(e => e.product_name).slice(0, 2).join(', ');
        const suffix = experimentCount > 2 ? ` +${experimentCount - 2} more` : '';
        
        const title = 'Log Your Supplement Check-in';
        const body = `${user.firstName ? `Hey ${user.firstName}! ` : ''}Don't forget to log how you're feeling with ${supplementNames}${suffix} today.`;
        
        const result = await apnsService.sendToUser(
          user.id,
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
          logger.info(`[ExperimentReminder] Sent evening reminder to ${user.firstName || user.id} for ${experimentCount} experiment(s)`);
        }
      } catch (error) {
        logger.warn(`[ExperimentReminder] Failed to send notification to user ${user.id}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    logger.error('[ExperimentReminder] Fatal error in evening reminder job', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function processThreePMSurveyNotifications() {
  try {
    const now = new Date();
    const nowUTC = now.toISOString();
    
    // Log at debug level for every run to track timing
    logger.debug(`[3PMSurvey] Checking at ${nowUTC}`);
    
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
    const eligibleUsers: (typeof activeUsers[0] & { healthId: string; activeSupplements: { id: string; product_name: string }[] })[] = [];
    
    // Group users by timezone for logging
    const timezoneGroups = new Map<string, { count: number; localTime: string }>();
    
    for (const user of activeUsers) {
      try {
        // Use user.timezone (from device auto-sync) as primary source
        // Only use reminderTimezone if explicitly set (not the default 'UTC')
        const timezone = user.timezone || (user.reminderTimezone !== 'UTC' ? user.reminderTimezone : null) || 'UTC';
        // Use formatInTimeZone for reliable timezone conversion (same as insightsSchedulerV2)
        const userHour = parseInt(formatInTimeZone(now, timezone, 'HH'), 10);
        const userMinute = parseInt(formatInTimeZone(now, timezone, 'mm'), 10);
        const userToday = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
        
        // Track timezone info for debugging
        const localTimeStr = `${userHour.toString().padStart(2, '0')}:${userMinute.toString().padStart(2, '0')}`;
        if (!timezoneGroups.has(timezone)) {
          timezoneGroups.set(timezone, { count: 0, localTime: localTimeStr });
        }
        timezoneGroups.get(timezone)!.count++;
        
        // Detailed logging for Australia/Perth user to debug timezone issue
        if (timezone === 'Australia/Perth') {
          const is3pm = userHour === 15 && userMinute >= 0 && userMinute < 5;
          logger.info(`[3PMSurvey] Perth user ${user.firstName || user.id}: UTC=${now.toISOString()}, Local=${localTimeStr}, Hour=${userHour}, Min=${userMinute}, Is3PM=${is3pm}, LocalDate=${userToday}`);
        }
        
        if (userHour === 15 && userMinute >= 0 && userMinute < 5) {
          
          const healthIdResult = await supabase
            .from('user_profiles')
            .select('health_id')
            .eq('user_id', user.id)
            .single();

          if (healthIdResult.error || !healthIdResult.data) {
            continue;
          }

          const { data: existingSurvey } = await supabase
            .from('daily_subjective_surveys')
            .select('id')
            .eq('health_id', healthIdResult.data.health_id)
            .eq('local_date', userToday)
            .limit(1);

          if (!existingSurvey || existingSurvey.length === 0) {
            const activeSupplements = await getActiveSupplementExperiments(healthIdResult.data.health_id);
            eligibleUsers.push({ 
              ...user, 
              healthId: healthIdResult.data.health_id,
              activeSupplements,
            });
          }
        }
      } catch (error) {
        logger.warn(`[3PMSurvey] Error checking user ${user.id}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Log timezone summary for debugging (only when there are interesting users like non-LA timezones)
    const nonDefaultTimezones = Array.from(timezoneGroups.entries())
      .filter(([tz]) => tz !== 'America/Los_Angeles' && tz !== 'UTC')
      .map(([tz, info]) => `${tz}: ${info.localTime} (${info.count} users)`);
    
    if (nonDefaultTimezones.length > 0) {
      logger.info(`[3PMSurvey] Non-default timezone check: ${nonDefaultTimezones.join(', ')} | UTC: ${nowUTC}`);
    }
    
    if (eligibleUsers.length === 0) {
      return;
    }

    logger.info(`[3PMSurvey] Sending 3PM survey notifications to ${eligibleUsers.length} users (timezones: ${Array.from(new Set(eligibleUsers.map(u => u.timezone))).join(', ')})`);

    for (const user of eligibleUsers) {
      try {
        let title = '3PM Check-In';
        let body = `${user.firstName ? `Hey ${user.firstName}! ` : ''}Quick 30-second wellbeing check - how are you feeling?`;
        
        if (user.activeSupplements.length > 0) {
          const supplementNames = user.activeSupplements.map(s => s.product_name).join(', ');
          title = 'Daily Check-In';
          body = `${user.firstName ? `Hey ${user.firstName}! ` : ''}Time to log your wellbeing + track your ${supplementNames} progress.`;
        }
        
        const result = await apnsService.sendToUser(
          user.id,
          {
            title,
            body,
            data: {
              type: 'survey_3pm',
              deepLink: 'flo://survey/3pm',
              hasSupplementCheckins: user.activeSupplements.length > 0,
              supplementCount: user.activeSupplements.length,
            }
          }
        );

        if (result.success && result.devicesReached && result.devicesReached > 0) {
          logger.info(`[3PMSurvey] Sent notification to ${user.firstName || user.id} (${user.activeSupplements.length} supplements)`);
        }
      } catch (error) {
        logger.warn(`[3PMSurvey] Failed to send notification to user ${user.id}`, { error: error instanceof Error ? error.message : String(error) });
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
      .select('health_id')
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

    const result = await apnsService.sendToUser(
      userId,
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

    logger.info(`[3PMSurvey] Manual notification sent to user ${userId} (${activeSupplements.length} supplements):`, result);
    return result;
  } catch (error) {
    logger.error(`[3PMSurvey] Manual notification failed for user ${userId}`, { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: String(error) };
  }
}
