import { Capacitor } from '@capacitor/core';
import { apiRequest, getAuthToken } from '@/lib/queryClient';
import { triggerOpen3PMSurvey } from '@/lib/surveyEvents';

class PushNotificationService {
  private isInitialized = false;
  private deviceToken: string | null = null;
  private PushNotificationsModule: any = null;
  private registrationAttempts = 0;

  async initialize(): Promise<void> {
    console.log('[PushNotifications] ===== INITIALIZATION STARTED =====');
    console.log('[PushNotifications] isNativePlatform:', Capacitor.isNativePlatform());
    console.log('[PushNotifications] getPlatform:', Capacitor.getPlatform());
    console.log('[PushNotifications] isInitialized:', this.isInitialized);
    
    if (this.isInitialized) {
      console.log('[PushNotifications] Already initialized, skipping');
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      console.log('[PushNotifications] Not a native platform (web browser), skipping APNs registration');
      return;
    }

    try {
      console.log('[PushNotifications] Loading @capacitor/push-notifications module...');
      // Dynamic import to avoid build issues - only loads on native platforms
      const module = await import('@capacitor/push-notifications');
      this.PushNotificationsModule = module.PushNotifications;
      const PushNotifications = this.PushNotificationsModule;
      console.log('[PushNotifications] Module loaded successfully');

      const permStatus = await PushNotifications.checkPermissions();
      console.log('[PushNotifications] Current permission status:', JSON.stringify(permStatus));

      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        console.log('[PushNotifications] Requesting permission from user...');
        const result = await PushNotifications.requestPermissions();
        console.log('[PushNotifications] Permission request result:', JSON.stringify(result));
        
        if (result.receive !== 'granted') {
          console.log('[PushNotifications] Permission denied by user - cannot register for push');
          return;
        }
      } else if (permStatus.receive !== 'granted') {
        console.log('[PushNotifications] Permission not granted (status:', permStatus.receive, ') - cannot register for push');
        return;
      }

      console.log('[PushNotifications] Permission granted, setting up listeners...');
      await this.setupListeners(PushNotifications);
      
      console.log('[PushNotifications] Calling PushNotifications.register() to get APNs token...');
      await PushNotifications.register();
      
      this.isInitialized = true;
      console.log('[PushNotifications] ===== INITIALIZATION COMPLETE =====');
      console.log('[PushNotifications] Waiting for APNs registration callback (registration event)...');
    } catch (error: any) {
      console.error('[PushNotifications] ===== INITIALIZATION FAILED =====');
      console.error('[PushNotifications] Error:', error?.message || error);
      console.error('[PushNotifications] Stack:', error?.stack);
    }
  }

  private async setupListeners(PushNotifications: any): Promise<void> {
    console.log('[PushNotifications] Setting up APNs event listeners...');
    
    // CRITICAL: Must await each addListener to ensure they're registered 
    // before calling register() - otherwise we miss the callback!
    
    console.log('[PushNotifications] Adding registration listener...');
    await PushNotifications.addListener('registration', async (token: { value: string }) => {
      console.log('[PushNotifications] ===== APNs REGISTRATION CALLBACK RECEIVED =====');
      console.log('[PushNotifications] Token received from APNs (first 20 chars):', token.value.substring(0, 20) + '...');
      console.log('[PushNotifications] Full token length:', token.value.length);
      this.deviceToken = token.value;
      this.registrationAttempts++;
      console.log('[PushNotifications] Registration attempt #', this.registrationAttempts);
      await this.registerTokenWithBackend(token.value);
    });
    console.log('[PushNotifications] Registration listener added');

    console.log('[PushNotifications] Adding registrationError listener...');
    await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('[PushNotifications] ===== APNs REGISTRATION ERROR =====');
      console.error('[PushNotifications] Error object:', JSON.stringify(error));
      console.error('[PushNotifications] This means APNs could not provide a device token');
    });
    console.log('[PushNotifications] RegistrationError listener added');

    console.log('[PushNotifications] Adding pushNotificationReceived listener...');
    await PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
      console.log('[PushNotifications] Notification received in foreground:', JSON.stringify(notification));
    });
    console.log('[PushNotifications] PushNotificationReceived listener added');

    console.log('[PushNotifications] Adding pushNotificationActionPerformed listener...');
    await PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      console.log('[PushNotifications] Notification tapped:', JSON.stringify(action));
      
      // Check if this is a 3PM survey notification
      const notificationType = action?.notification?.data?.type || action?.notification?.extra?.type;
      console.log('[PushNotifications] Notification type:', notificationType);
      
      if (notificationType === 'survey_3pm' || notificationType === '3pm_checkin') {
        console.log('[PushNotifications] 3PM Survey notification tapped - triggering modal');
        triggerOpen3PMSurvey();
      }
    });
    console.log('[PushNotifications] PushNotificationActionPerformed listener added');
    
    console.log('[PushNotifications] ===== ALL LISTENERS REGISTERED =====');
  }

  private async registerTokenWithBackend(token: string): Promise<void> {
    console.log('[PushNotifications] ===== BACKEND REGISTRATION STARTING =====');
    
    try {
      // Check authentication status first
      const authToken = await getAuthToken();
      console.log('[PushNotifications] Auth token available:', authToken ? 'YES (length: ' + authToken.length + ')' : 'NO');
      
      console.log('[PushNotifications] Sending POST /api/device-tokens...');
      console.log('[PushNotifications] Payload: { deviceToken: (', token.length, 'chars), platform: ios }');
      
      const response = await apiRequest('POST', '/api/device-tokens', {
        deviceToken: token,
        platform: 'ios',
      });

      const responseData = await response.json().catch(() => null);
      console.log('[PushNotifications] ===== BACKEND REGISTRATION SUCCESS =====');
      console.log('[PushNotifications] Response status:', response.status);
      console.log('[PushNotifications] Response data:', JSON.stringify(responseData));
    } catch (error: any) {
      console.error('[PushNotifications] ===== BACKEND REGISTRATION FAILED =====');
      console.error('[PushNotifications] Error message:', error?.message || error);
      console.error('[PushNotifications] This could be: 1) No auth token, 2) Network error, 3) Server error');
      
      // Store for retry later
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pendingPushToken', token);
        console.log('[PushNotifications] Token stored locally for retry');
      }
    }
  }

  async unregister(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.PushNotificationsModule) {
      return;
    }

    try {
      if (this.deviceToken) {
        await apiRequest('DELETE', `/api/device-tokens/${encodeURIComponent(this.deviceToken)}`);
        console.log('[PushNotifications] Token unregistered from backend');
      }

      await this.PushNotificationsModule.removeAllListeners();
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
