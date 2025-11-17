import { Capacitor } from '@capacitor/core';
import { apiRequest } from '@/lib/queryClient';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';

interface NotificationOpenedEvent {
  notification: {
    additionalData?: {
      type?: string;
      screen?: string;
      [key: string]: any;
    };
  };
}

// Dynamic import helper for OneSignal (only available on native platforms)
// Using string concatenation to prevent Vite from resolving at build time
async function getOneSignal() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('OneSignal is only available on native platforms');
  }
  const moduleName = 'onesignal' + '-cordova' + '-plugin';
  const { default: OneSignal } = await import(/* @vite-ignore */ moduleName);
  return OneSignal;
}

export class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized = false;
  private notificationHandlers: Map<string, (data: any) => void> = new Map();

  private constructor() {}

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  async initialize(userId?: string): Promise<void> {
    // Only initialize on native platforms
    if (!Capacitor.isNativePlatform()) {
      console.log('[PushNotifications] Web platform detected, skipping OneSignal initialization');
      return;
    }

    if (this.initialized) {
      console.log('[PushNotifications] Already initialized');
      return;
    }

    if (!ONESIGNAL_APP_ID) {
      console.warn('[PushNotifications] OneSignal App ID not configured');
      return;
    }

    try {
      console.log('[PushNotifications] Initializing OneSignal...');

      // Dynamically import OneSignal (only available on native platforms)
      const OneSignal = await getOneSignal();

      // Initialize OneSignal
      OneSignal.initialize(ONESIGNAL_APP_ID);

      // Set external user ID for user-centric targeting
      if (userId) {
        OneSignal.login(userId);
        console.log('[PushNotifications] Logged in user:', userId);
      }

      // Request notification permissions
      const hasPermission = await OneSignal.Notifications.getPermissionAsync();
      
      if (!hasPermission) {
        console.log('[PushNotifications] Requesting notification permission...');
        const permitted = await OneSignal.Notifications.requestPermission(true);
        console.log('[PushNotifications] Permission granted:', permitted);
      } else {
        console.log('[PushNotifications] Already has notification permission');
      }

      // Get OneSignal device/player ID and register with backend
      OneSignal.User.pushSubscription.addEventListener('change', async (change) => {
        const playerId = change.current.id;
        if (playerId) {
          console.log('[PushNotifications] Player ID:', playerId);
          try {
            await apiRequest('/api/notifications/register-device', 'POST', { playerId });
            console.log('[PushNotifications] Device registered with backend');
          } catch (error) {
            console.error('[PushNotifications] Failed to register device with backend:', error);
          }
        }
      });

      // Handle notification clicks/opens
      OneSignal.Notifications.addEventListener('click', (event: NotificationOpenedEvent) => {
        console.log('[PushNotifications] Notification clicked:', event);
        const data = event.notification.additionalData;
        
        if (data?.type && this.notificationHandlers.has(data.type)) {
          const handler = this.notificationHandlers.get(data.type);
          handler?.(data);
        }

        // Navigate to screen if specified
        if (data?.screen) {
          this.handleNavigation(data.screen, data);
        }
      });

      this.initialized = true;
      console.log('[PushNotifications] OneSignal initialized successfully');
    } catch (error) {
      console.error('[PushNotifications] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register a handler for a specific notification type
   */
  registerHandler(type: string, handler: (data: any) => void): void {
    this.notificationHandlers.set(type, handler);
  }

  /**
   * Unregister a notification handler
   */
  unregisterHandler(type: string): void {
    this.notificationHandlers.delete(type);
  }

  /**
   * Handle navigation based on notification screen
   */
  private handleNavigation(screen: string, data: any): void {
    // This will be handled by the app-level router
    // Fire a custom event that the app can listen to
    const event = new CustomEvent('notification-navigation', {
      detail: { screen, data }
    });
    window.dispatchEvent(event);
  }

  /**
   * Get notification permission status
   */
  async getPermissionStatus(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const OneSignal = await getOneSignal();
      return await OneSignal.Notifications.getPermissionAsync();
    } catch (error) {
      console.error('[PushNotifications] Failed to get permission status:', error);
      return false;
    }
  }

  /**
   * Request notification permissions
   */
  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const OneSignal = await getOneSignal();
      return await OneSignal.Notifications.requestPermission(true);
    } catch (error) {
      console.error('[PushNotifications] Failed to request permission:', error);
      return false;
    }
  }

  /**
   * Logout user from OneSignal (removes external user ID)
   */
  async logout(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.initialized) {
      return;
    }

    try {
      const OneSignal = await getOneSignal();
      OneSignal.logout();
      console.log('[PushNotifications] User logged out');
    } catch (error) {
      console.error('[PushNotifications] Logout failed:', error);
    }
  }

  /**
   * Login user to OneSignal (sets external user ID for targeting)
   */
  async login(userId: string): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.initialized) {
      return;
    }

    try {
      const OneSignal = await getOneSignal();
      OneSignal.login(userId);
      console.log('[PushNotifications] User logged in:', userId);
    } catch (error) {
      console.error('[PushNotifications] Login failed:', error);
    }
  }
}

// Export singleton instance
export const pushNotificationService = PushNotificationService.getInstance();
