import * as cron from 'node-cron';
import { getSupabaseClient } from './supabaseClient';
import { apnsService } from './apnsService';
import { logger } from '../logger';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { TZDate } from '@date-fns/tz';

let deliveryCronTask: ReturnType<typeof cron.schedule> | null = null;
let surveyCronTask: ReturnType<typeof cron.schedule> | null = null;

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
        const result = await apnsService.sendToUser(
          reminder.user_id,
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

async function processThreePMSurveyNotifications() {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    const activeUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        reminderTimezone: users.reminderTimezone,
      })
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          isNotNull(users.reminderTimezone)
        )
      );

    if (activeUsers.length === 0) {
      return;
    }

    const supabase = getSupabaseClient();
    const eligibleUsers: typeof activeUsers = [];
    
    for (const user of activeUsers) {
      try {
        const timezone = user.reminderTimezone || 'UTC';
        const userNow = new TZDate(now, timezone);
        const userHour = userNow.getHours();
        const userMinute = userNow.getMinutes();
        
        if (userHour === 15 && userMinute >= 0 && userMinute < 5) {
          const userToday = userNow.toISOString().split('T')[0];
          
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
            eligibleUsers.push(user);
          }
        }
      } catch (error) {
        logger.warn(`[3PMSurvey] Error checking user ${user.id}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (eligibleUsers.length === 0) {
      return;
    }

    logger.info(`[3PMSurvey] Sending 3PM survey notifications to ${eligibleUsers.length} users`);

    for (const user of eligibleUsers) {
      try {
        const result = await apnsService.sendToUser(
          user.id,
          {
            title: '3PM Check-In',
            body: `${user.firstName ? `Hey ${user.firstName}! ` : ''}Quick 30-second wellbeing check - how are you feeling?`,
            data: {
              type: 'survey_3pm',
              deepLink: 'flo://survey/3pm',
            }
          }
        );

        if (result.success && result.devicesReached && result.devicesReached > 0) {
          logger.info(`[3PMSurvey] Sent notification to ${user.firstName || user.id}`);
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

  logger.info('[ReminderDelivery] Reminder delivery service initialized (checks every minute)');
  logger.info('[3PMSurvey] 3PM survey notification service initialized (checks every 5 minutes)');
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
}

export async function triggerManualDelivery() {
  logger.info('[ReminderDelivery] Manual delivery triggered');
  await deliverQueuedReminders();
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

    const result = await apnsService.sendToUser(
      userId,
      {
        title: '3PM Check-In',
        body: `${user[0].firstName ? `Hey ${user[0].firstName}! ` : ''}Quick 30-second wellbeing check - how are you feeling?`,
        data: {
          type: 'survey_3pm',
          deepLink: 'flo://survey/3pm',
        }
      }
    );

    logger.info(`[3PMSurvey] Manual notification sent to user ${userId}:`, result);
    return result;
  } catch (error) {
    logger.error(`[3PMSurvey] Manual notification failed for user ${userId}`, { error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: String(error) };
  }
}
