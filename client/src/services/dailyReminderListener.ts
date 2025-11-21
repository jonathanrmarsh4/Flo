import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * Supabase Realtime Listener for Daily Reminders
 * 
 * Subscribes to the daily_reminders table in Supabase
 * When a new reminder is inserted, schedules a local notification on the device
 * Uses notification ID range 9000-9999 for daily reminders
 */

const DAILY_REMINDER_NOTIFICATION_ID_BASE = 9000;

let realtimeChannel: RealtimeChannel | null = null;
let supabaseClient: ReturnType<typeof createClient> | null = null;

/**
 * Initialize Supabase client for realtime subscriptions
 * Uses anonymous (public) key for client-side access
 */
function getSupabaseRealtimeClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured');
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return supabaseClient;
}

/**
 * Schedule local notification from Supabase reminder payload
 * Cancels previous daily reminder before scheduling new one
 */
async function scheduleReminderNotification(reminder: {
  id: string;
  title: string;
  body: string;
  schedule_at_ms: number;
}) {
  if (!Capacitor.isNativePlatform()) {
    console.log('[DailyReminder] Web platform - notifications not supported');
    return;
  }

  try {
    // Step 1: Cancel any existing daily reminders (ID range 9000-9999)
    const existingNotifications = await LocalNotifications.getPending();
    const dailyReminderIds = existingNotifications.notifications
      .filter(n => n.id >= DAILY_REMINDER_NOTIFICATION_ID_BASE && n.id < DAILY_REMINDER_NOTIFICATION_ID_BASE + 1000)
      .map(n => n.id);

    if (dailyReminderIds.length > 0) {
      await LocalNotifications.cancel({ notifications: dailyReminderIds.map(id => ({ id })) });
      console.log(`[DailyReminder] Cancelled ${dailyReminderIds.length} previous daily reminders`);
    }

    // Step 2: Schedule the new reminder
    const scheduleDate = new Date(reminder.schedule_at_ms);
    
    await LocalNotifications.schedule({
      notifications: [{
        id: DAILY_REMINDER_NOTIFICATION_ID_BASE,
        title: reminder.title,
        body: reminder.body,
        schedule: {
          at: scheduleDate,
        },
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
      }]
    });

    console.log(`[DailyReminder] Scheduled notification for ${scheduleDate.toLocaleString()}: "${reminder.body}"`);

    // Note: We don't update the 'delivered' field because RLS requires service_role
    // The field is for internal tracking only and doesn't affect functionality

  } catch (error: any) {
    console.error('[DailyReminder] Failed to schedule notification:', error);
  }
}

/**
 * Initialize the Supabase Realtime listener for daily reminders
 * Call this once when the app starts (after user is authenticated)
 */
export async function initializeDailyReminderListener(userId: string) {
  // Only run on native platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('[DailyReminder] Web platform - realtime listener disabled');
    return;
  }

  // Clean up existing subscription
  if (realtimeChannel) {
    await realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }

  try {
    const client = getSupabaseRealtimeClient();

    // Subscribe to INSERT events on daily_reminders table for this user
    realtimeChannel = client
      .channel(`daily_reminders:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'daily_reminders',
          filter: `user_id=eq.${userId}`,
        },
        async (payload: any) => {
          console.log('[DailyReminder] Received new reminder from Supabase:', payload);
          
          if (payload.new) {
            await scheduleReminderNotification({
              id: payload.new.id,
              title: payload.new.title,
              body: payload.new.body,
              schedule_at_ms: payload.new.schedule_at_ms,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`[DailyReminder] Realtime subscription status: ${status}`);
      });

    console.log(`[DailyReminder] Realtime listener initialized for user ${userId}`);
  } catch (error: any) {
    console.error('[DailyReminder] Failed to initialize realtime listener:', error);
  }
}

/**
 * Stop the daily reminder listener
 * Call this when user logs out
 */
export async function stopDailyReminderListener() {
  if (realtimeChannel) {
    await realtimeChannel.unsubscribe();
    realtimeChannel = null;
    console.log('[DailyReminder] Realtime listener stopped');
  }
}

/**
 * Request notification permissions on app startup
 * Required for scheduling local notifications
 */
export async function requestDailyReminderPermissions() {
  if (!Capacitor.isNativePlatform()) {
    return { granted: false };
  }

  try {
    // Check current permission status
    const permStatus = await LocalNotifications.checkPermissions();
    
    if (permStatus.display === 'granted') {
      console.log('[DailyReminder] Notification permissions already granted');
      return { granted: true };
    }

    // Request permissions
    const result = await LocalNotifications.requestPermissions();
    
    if (result.display === 'granted') {
      console.log('[DailyReminder] Notification permissions granted');
      return { granted: true };
    } else {
      console.warn('[DailyReminder] Notification permissions denied');
      return { granted: false };
    }
  } catch (error: any) {
    console.error('[DailyReminder] Failed to request notification permissions:', error);
    return { granted: false };
  }
}
