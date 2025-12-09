import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from '@/lib/queryClient';

class PushNotificationService {
  private isInitialized = false;
  private deviceToken: string | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[PushNotifications] Already initialized');
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      console.log('[PushNotifications] Not a native platform, skipping APNs registration');
      return;
    }

    try {
      const permStatus = await PushNotifications.checkPermissions();
      console.log('[PushNotifications] Current permission status:', permStatus.receive);

      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        const result = await PushNotifications.requestPermissions();
        console.log('[PushNotifications] Permission request result:', result.receive);
        
        if (result.receive !== 'granted') {
          console.log('[PushNotifications] Permission denied');
          return;
        }
      } else if (permStatus.receive !== 'granted') {
        console.log('[PushNotifications] Permission not granted:', permStatus.receive);
        return;
      }

      await this.setupListeners();
      await PushNotifications.register();
      
      this.isInitialized = true;
      console.log('[PushNotifications] Initialization complete');
    } catch (error) {
      console.error('[PushNotifications] Initialization error:', error);
    }
  }

  private async setupListeners(): Promise<void> {
    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[PushNotifications] APNs registration successful, token:', token.value.substring(0, 20) + '...');
      this.deviceToken = token.value;
      await this.registerTokenWithBackend(token.value);
    });

    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('[PushNotifications] Registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('[PushNotifications] Notification received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('[PushNotifications] Notification action performed:', action);
    });
  }

  private async registerTokenWithBackend(token: string): Promise<void> {
    try {
      console.log('[PushNotifications] Registering token with backend...');
      
      const response = await apiRequest('POST', '/api/device-tokens', {
        deviceToken: token,
        platform: 'ios',
      });

      console.log('[PushNotifications] Token registered successfully:', response);
    } catch (error) {
      console.error('[PushNotifications] Failed to register token with backend:', error);
    }
  }

  async unregister(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      if (this.deviceToken) {
        await apiRequest('DELETE', `/api/device-tokens/${encodeURIComponent(this.deviceToken)}`);
        console.log('[PushNotifications] Token unregistered from backend');
      }

      await PushNotifications.removeAllListeners();
      this.isInitialized = false;
      this.deviceToken = null;
      console.log('[PushNotifications] Unregistered');
    } catch (error) {
      console.error('[PushNotifications] Unregister error:', error);
    }
  }

  getDeviceToken(): string | null {
    return this.deviceToken;
  }

  isRegistered(): boolean {
    return this.isInitialized && this.deviceToken !== null;
  }
}

export const pushNotificationService = new PushNotificationService();
