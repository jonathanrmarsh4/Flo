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
 * 
 * Note: On Android 13+, requires SCHEDULE_EXACT_ALARM permission
 * If permission is denied, the notification may not fire at the exact time
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
    // Step 0: Verify permissions are granted
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      console.error('[DailyReminder] Cannot schedule notification - permissions not granted');
      console.error('[DailyReminder] Call requestDailyReminderPermissions() first');
      return;
    }

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

    console.log(`[DailyReminder] ✓ Scheduled notification for ${scheduleDate.toLocaleString()}`);
    console.log(`[DailyReminder]   Title: "${reminder.title}"`);
    console.log(`[DailyReminder]   Body: "${reminder.body}"`);

    // Note: We don't update the 'delivered' field because RLS requires service_role
    // The field is for internal tracking only and doesn't affect functionality

  } catch (error: any) {
    console.error('[DailyReminder] ✗ Failed to schedule notification:', error);
    
    // Check if it's an Android permission error
    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      console.error('[DailyReminder] On Android 13+, ensure:');
      console.error('[DailyReminder] 1. Notification permission is granted');
      console.error('[DailyReminder] 2. "Alarms & reminders" is enabled in system settings');
      console.error('[DailyReminder] 3. SCHEDULE_EXACT_ALARM is declared in AndroidManifest.xml');
    }
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
 * IMPORTANT LIMITATION: SCHEDULE_EXACT_ALARM Permission on Android 13+
 * 
 * On Android 13+ (API 33+), apps need SCHEDULE_EXACT_ALARM permission to schedule exact alarms.
 * This permission MUST be declared in AndroidManifest.xml and enabled by the user in system settings.
 * 
 * Unfortunately, Capacitor's LocalNotifications plugin does not provide an API to:
 * 1. Check if SCHEDULE_EXACT_ALARM permission is granted
 * 2. Request SCHEDULE_EXACT_ALARM permission programmatically
 * 
 * Therefore, this function CANNOT accurately detect the permission status.
 * It will return 'unknown' for Android platforms to indicate the limitation.
 * 
 * Developers must:
 * 1. Add SCHEDULE_EXACT_ALARM to AndroidManifest.xml (see docs/android-notification-permissions.md)
 * 2. Instruct users to enable "Alarms & reminders" in system settings
 * 3. Handle scheduling errors gracefully when permission is missing
 * 
 * @returns 'granted' for iOS, 'unknown' for Android, 'not_applicable' for web
 */
async function checkExactAlarmCapability(): Promise<'granted' | 'unknown' | 'not_applicable'> {
  if (!Capacitor.isNativePlatform()) {
    return 'not_applicable';
  }

  const platform = Capacitor.getPlatform();
  
  if (platform === 'ios') {
    // iOS doesn't need SCHEDULE_EXACT_ALARM
    return 'granted';
  }
  
  if (platform === 'android') {
    // Cannot programmatically check SCHEDULE_EXACT_ALARM status with Capacitor
    // Return 'unknown' to indicate we cannot verify
    console.log('[DailyReminder] Android detected - SCHEDULE_EXACT_ALARM status cannot be verified programmatically');
    console.log('[DailyReminder] Ensure AndroidManifest.xml includes SCHEDULE_EXACT_ALARM permission');
    console.log('[DailyReminder] User must enable "Alarms & reminders" in Settings → Apps → Flō');
    return 'unknown';
  }
  
  return 'not_applicable';
}

/**
 * Request notification permissions on app startup
 * Required for scheduling local notifications
 * 
 * For iOS: Requests standard notification permissions
 * For Android 13+: Also requires SCHEDULE_EXACT_ALARM permission (see notes below)
 * 
 * ANDROID 13+ LIMITATION:
 * This function can only request POST_NOTIFICATIONS permission.
 * SCHEDULE_EXACT_ALARM must be:
 * 1. Declared in AndroidManifest.xml
 * 2. Manually enabled by user in Settings → Apps → Flō → Alarms & reminders
 * 
 * We cannot programmatically check or request SCHEDULE_EXACT_ALARM with Capacitor.
 * 
 * @returns Object with granted status and exact alarm capability info
 */
export async function requestDailyReminderPermissions(): Promise<{ 
  granted: boolean; 
  exactAlarmCapability?: 'granted' | 'unknown' | 'not_applicable';
  requiresManualSetup?: boolean;
}> {
  if (!Capacitor.isNativePlatform()) {
    return { granted: false };
  }

  const platform = Capacitor.getPlatform();

  try {
    // Step 1: Check current notification permission status
    const permStatus = await LocalNotifications.checkPermissions();
    
    if (permStatus.display === 'granted') {
      console.log('[DailyReminder] ✓ Notification permissions already granted');
      
      // Check exact alarm capability (returns 'unknown' for Android)
      const exactAlarmCapability = await checkExactAlarmCapability();
      
      return { 
        granted: true, 
        exactAlarmCapability,
        requiresManualSetup: platform === 'android' && exactAlarmCapability === 'unknown'
      };
    }

    // Step 2: Request notification permissions
    console.log('[DailyReminder] Requesting notification permissions...');
    const result = await LocalNotifications.requestPermissions();
    
    if (result.display === 'granted') {
      console.log('[DailyReminder] ✓ Notification permissions granted');
      
      // Check exact alarm capability (returns 'unknown' for Android)
      const exactAlarmCapability = await checkExactAlarmCapability();
      
      if (platform === 'android' && exactAlarmCapability === 'unknown') {
        console.warn('[DailyReminder] ⚠ Android detected - SCHEDULE_EXACT_ALARM cannot be verified');
        console.warn('[DailyReminder] ⚠ User must manually enable:');
        console.warn('[DailyReminder]   Settings → Apps → Flō → Alarms & reminders');
      }
      
      return { 
        granted: true, 
        exactAlarmCapability,
        requiresManualSetup: platform === 'android' && exactAlarmCapability === 'unknown'
      };
    } else {
      console.warn('[DailyReminder] ✗ Notification permissions denied');
      return { granted: false };
    }
  } catch (error: any) {
    console.error('[DailyReminder] ✗ Failed to request notification permissions:', error);
    
    // Log helpful Android 13+ guidance
    if (platform === 'android') {
      console.error('[DailyReminder] On Android 13+, ensure the following:');
      console.error('[DailyReminder] 1. POST_NOTIFICATIONS permission is granted (requested above)');
      console.error('[DailyReminder] 2. SCHEDULE_EXACT_ALARM declared in AndroidManifest.xml');
      console.error('[DailyReminder] 3. User enabled "Alarms & reminders" in Settings');
      console.error('[DailyReminder] See: docs/android-notification-permissions.md');
    }
    
    return { granted: false };
  }
}
