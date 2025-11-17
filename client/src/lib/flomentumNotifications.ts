import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * Flōmentum-specific notification scheduling and management
 * Handles daily scores, weekly summaries, and reminders
 */

export interface FlomentumNotificationConfig {
  dailyScoreEnabled: boolean;
  weeklySummaryEnabled: boolean;
  syncReminderEnabled: boolean;
  actionRemindersEnabled: boolean; // NEW: Morning check, evening wind-down, midday movement
  dailyScoreTime: string; // HH:MM format (24hr)
  syncReminderTime: string; // HH:MM format (24hr)
}

const DEFAULT_CONFIG: FlomentumNotificationConfig = {
  dailyScoreEnabled: true,
  weeklySummaryEnabled: true,
  syncReminderEnabled: true,
  actionRemindersEnabled: true, // Enable by default
  dailyScoreTime: '20:00', // 8 PM
  syncReminderTime: '09:00', // 9 AM
};

/**
 * Schedule daily Flōmentum score notification
 * Triggers at configured time each day
 */
export async function scheduleDailyScoreNotification(config: FlomentumNotificationConfig = DEFAULT_CONFIG) {
  if (!Capacitor.isNativePlatform() || !config.dailyScoreEnabled) {
    return;
  }

  try {
    const [hours, minutes] = config.dailyScoreTime.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: 100, // Unique ID for daily score notification
        title: 'Your Flōmentum Score is Ready',
        body: 'See how your health momentum is tracking today',
        schedule: {
          at: scheduledTime,
          every: 'day',
        },
        extra: { type: 'daily_score' },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log(`[Flōmentum Notifications] Daily score scheduled for ${config.dailyScoreTime}`);
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to schedule daily score', error);
  }
}

/**
 * Schedule sync reminder notification
 * Triggers at configured time each day
 */
export async function scheduleSyncReminder(config: FlomentumNotificationConfig = DEFAULT_CONFIG) {
  if (!Capacitor.isNativePlatform() || !config.syncReminderEnabled) {
    return;
  }

  try {
    const [hours, minutes] = config.syncReminderTime.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: 101, // Unique ID for sync reminder
        title: 'Sync Your Health Data',
        body: 'Keep your Flōmentum score up to date',
        schedule: {
          at: scheduledTime,
          every: 'day',
        },
        extra: { type: 'sync_reminder' },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log(`[Flōmentum Notifications] Sync reminder scheduled for ${config.syncReminderTime}`);
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to schedule sync reminder', error);
  }
}

/**
 * Schedule weekly summary notification
 * Triggers every Monday at 8 AM
 */
export async function scheduleWeeklySummary(config: FlomentumNotificationConfig = DEFAULT_CONFIG) {
  if (!Capacitor.isNativePlatform() || !config.weeklySummaryEnabled) {
    return;
  }

  try {
    const now = new Date();
    const nextMonday = new Date();
    
    // Calculate next Monday at 8 AM
    const daysUntilMonday = (1 + 7 - now.getDay()) % 7 || 7;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(8, 0, 0, 0);

    // If it's Monday and before 8 AM, schedule for today
    if (now.getDay() === 1 && now.getHours() < 8) {
      nextMonday.setDate(now.getDate());
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: 102, // Unique ID for weekly summary
        title: 'Your Weekly Flōmentum Summary',
        body: 'See how your health momentum trended this week',
        schedule: {
          at: nextMonday,
          every: 'week',
        },
        extra: { type: 'weekly_summary' },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log(`[Flōmentum Notifications] Weekly summary scheduled for Mondays at 8 AM`);
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to schedule weekly summary', error);
  }
}

/**
 * Send immediate milestone notification
 */
export async function sendMilestoneNotification(
  title: string,
  body: string,
  milestoneData: any
) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now(), // Unique ID based on timestamp
        title,
        body,
        schedule: { at: new Date(Date.now() + 100) }, // Fire immediately
        extra: {
          type: 'milestone',
          data: milestoneData,
        },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log(`[Flōmentum Notifications] Milestone sent: ${title}`);
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to send milestone', error);
  }
}

/**
 * Send immediate score update notification
 * Use this when score is calculated immediately (not scheduled)
 */
export async function sendScoreUpdateNotification(
  score: number,
  zone: string,
  dailyFocus: string
) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const zoneEmoji = zone === 'BUILDING' ? '📈' : zone === 'MAINTAINING' ? '⚡' : '⚠️';
    
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now(),
        title: `${zoneEmoji} Flōmentum Score: ${score}`,
        body: dailyFocus || 'Your health momentum has been updated',
        schedule: { at: new Date(Date.now() + 100) },
        extra: {
          type: 'score_update',
          score,
          zone,
        },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log(`[Flōmentum Notifications] Score update sent: ${score} (${zone})`);
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to send score update', error);
  }
}

/**
 * Send actionable reminder based on current health state
 * These help users take specific actions toward milestones
 */
export async function sendActionableReminder(
  reminderType: 'recovery' | 'activity' | 'sleep' | 'consistency' | 'goal_progress',
  title: string,
  body: string,
  actionData?: any
) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now(),
        title,
        body,
        schedule: { at: new Date(Date.now() + 100) },
        extra: {
          type: 'actionable_reminder',
          reminderType,
          actionData,
        },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log(`[Flōmentum Notifications] Actionable reminder sent: ${reminderType}`);
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to send actionable reminder', error);
  }
}

/**
 * Schedule daily actionable reminders
 * These fire at specific times to encourage action
 */
export async function scheduleDailyActionReminders(config: FlomentumNotificationConfig = DEFAULT_CONFIG) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const now = new Date();
    
    // Morning Readiness Check (7 AM)
    const morningTime = new Date();
    morningTime.setHours(7, 0, 0, 0);
    if (morningTime < now) {
      morningTime.setDate(morningTime.getDate() + 1);
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: 103,
        title: 'Good Morning! 🌅',
        body: 'Check your Flōmentum score to plan your day',
        schedule: {
          at: morningTime,
          every: 'day',
        },
        extra: { type: 'morning_check' },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    // Evening Wind-Down Reminder (9 PM)
    const eveningTime = new Date();
    eveningTime.setHours(21, 0, 0, 0);
    if (eveningTime < now) {
      eveningTime.setDate(eveningTime.getDate() + 1);
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: 104,
        title: 'Wind Down for Better Sleep 🌙',
        body: 'Quality sleep fuels tomorrow\'s momentum',
        schedule: {
          at: eveningTime,
          every: 'day',
        },
        extra: { type: 'sleep_reminder' },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    // Midday Movement Check (2 PM)
    const middayTime = new Date();
    middayTime.setHours(14, 0, 0, 0);
    if (middayTime < now) {
      middayTime.setDate(middayTime.getDate() + 1);
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: 105,
        title: 'Time to Move! 🚶',
        body: 'A quick walk can boost your daily momentum',
        schedule: {
          at: middayTime,
          every: 'day',
        },
        extra: { type: 'activity_reminder' },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log('[Flōmentum Notifications] Daily action reminders scheduled');
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to schedule action reminders', error);
  }
}

/**
 * Cancel all Flōmentum scheduled notifications
 */
export async function cancelAllFlomentumNotifications() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Cancel scheduled notifications by ID
    await LocalNotifications.cancel({
      notifications: [
        { id: 100 }, // Daily score
        { id: 101 }, // Sync reminder
        { id: 102 }, // Weekly summary
        { id: 103 }, // Morning check
        { id: 104 }, // Evening wind-down
        { id: 105 }, // Midday movement
      ]
    });
    console.log('[Flōmentum Notifications] All scheduled notifications cancelled');
  } catch (error) {
    console.error('[Flōmentum Notifications] Failed to cancel notifications', error);
  }
}

/**
 * Initialize all Flōmentum notifications based on user config
 */
export async function initializeFlomentumNotifications(config: FlomentumNotificationConfig = DEFAULT_CONFIG) {
  if (!Capacitor.isNativePlatform()) {
    console.log('[Flōmentum Notifications] Web platform - notifications disabled');
    return;
  }

  try {
    // Cancel existing scheduled notifications first
    await cancelAllFlomentumNotifications();

    // Schedule new notifications based on config
    if (config.dailyScoreEnabled) {
      await scheduleDailyScoreNotification(config);
    }
    
    if (config.syncReminderEnabled) {
      await scheduleSyncReminder(config);
    }
    
    if (config.weeklySummaryEnabled) {
      await scheduleWeeklySummary(config);
    }

    if (config.actionRemindersEnabled) {
      await scheduleDailyActionReminders(config);
    }

    console.log('[Flōmentum Notifications] Initialization complete');
  } catch (error) {
    console.error('[Flōmentum Notifications] Initialization failed', error);
  }
}

/**
 * Get current notification configuration from localStorage
 */
export function getNotificationConfig(): FlomentumNotificationConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG;
  }

  const saved = localStorage.getItem('flomentum_notification_config');
  if (!saved) {
    return DEFAULT_CONFIG;
  }

  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Save notification configuration to localStorage
 */
export function saveNotificationConfig(config: FlomentumNotificationConfig) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem('flomentum_notification_config', JSON.stringify(config));
  console.log('[Flōmentum Notifications] Configuration saved');
}
