import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * Notification utility for in-app notifications
 * Uses Capacitor Local Notifications for native iOS alerts
 */

let notificationsEnabled = false;
let notificationId = 1;
let listenersRegistered = false;

/**
 * Initialize notification system and request permissions
 * Call this once when app starts
 */
export async function initializeNotifications() {
  // Only run on native platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('[Notifications] Web platform - notifications disabled');
    return;
  }

  try {
    // Check current permission status
    const permStatus = await LocalNotifications.checkPermissions();
    
    if (permStatus.display === 'granted') {
      notificationsEnabled = true;
      setupListeners();
      return;
    }

    // Request permissions if not granted
    const result = await LocalNotifications.requestPermissions();
    if (result.display === 'granted') {
      notificationsEnabled = true;
      setupListeners();
      console.log('[Notifications] Permissions granted');
    } else {
      console.log('[Notifications] Permissions denied');
    }
  } catch (error) {
    console.error('[Notifications] Failed to initialize', error);
  }
}

/**
 * Set up notification event listeners (only once)
 */
function setupListeners() {
  // Prevent duplicate listener registration
  if (listenersRegistered) {
    return;
  }
  
  listenersRegistered = true;

  // Handle notifications when app is in foreground
  LocalNotifications.addListener('localNotificationReceived', (notification) => {
    console.log('[Notifications] Received in foreground:', notification);
    // The notification will show in system tray automatically
    // You can add custom in-app UI here if desired
  });

  // Handle notification taps
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    console.log('[Notifications] User tapped notification:', action.notification);
    // Add navigation logic here if needed
  });
}

/**
 * Send a notification immediately
 * Auto-initializes if not already enabled
 */
export async function sendNotification(title: string, body: string, extra?: any) {
  // Only run on native platforms
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Auto-initialize if needed
  if (!notificationsEnabled) {
    await initializeNotifications();
  }

  // Double-check after initialization attempt
  if (!notificationsEnabled) {
    console.log('[Notifications] Disabled - skipping notification');
    return;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [{
        title,
        body,
        id: notificationId++,
        schedule: { at: new Date(Date.now() + 100) }, // Fire almost immediately
        extra: extra || {},
        sound: undefined, // Use default system sound
        attachments: undefined,
        actionTypeId: '',
        smallIcon: 'ic_stat_icon_config_sample'
      }]
    });
    console.log(`[Notifications] Sent: ${title}`);
  } catch (error) {
    console.error('[Notifications] Failed to send', error);
  }
}

/**
 * Schedule a notification for later
 */
export async function scheduleNotification(
  title: string, 
  body: string, 
  scheduleAt: Date,
  extra?: any
) {
  if (!notificationsEnabled) {
    console.log('[Notifications] Disabled - skipping scheduled notification');
    return;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [{
        title,
        body,
        id: notificationId++,
        schedule: { at: scheduleAt },
        extra: extra || {},
        sound: undefined,
        attachments: undefined,
        actionTypeId: '',
        smallIcon: 'ic_stat_icon_config_sample'
      }]
    });
    console.log(`[Notifications] Scheduled: ${title} for ${scheduleAt}`);
  } catch (error) {
    console.error('[Notifications] Failed to schedule', error);
  }
}

/**
 * Clear all delivered notifications from system tray
 */
export async function clearAllNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    await LocalNotifications.removeAllDeliveredNotifications();
    console.log('[Notifications] Cleared all delivered notifications');
  } catch (error) {
    console.error('[Notifications] Failed to clear notifications', error);
  }
}

/**
 * Check if notifications are enabled
 */
export function areNotificationsEnabled(): boolean {
  return notificationsEnabled;
}
