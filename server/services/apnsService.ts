import { ApnsClient, Notification, SilentNotification, Errors } from 'apns2';
import { db } from '../db';
import { apnsConfiguration, deviceTokens, notificationLogs, type DeviceToken } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger';

interface PushNotificationPayload {
  title: string;
  body: string;
  badge?: number;
  sound?: string;
  data?: Record<string, any>;
}

class ApnsService {
  private client: ApnsClient | null = null;
  private config: any = null;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the APNs client with configuration from database
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('[APNs] Initializing APNs client...');

      // Get active APNs configuration
      const configs = await db
        .select()
        .from(apnsConfiguration)
        .where(eq(apnsConfiguration.isActive, true))
        .limit(1);

      if (configs.length === 0) {
        logger.warn('[APNs] No active APNs configuration found. Push notifications disabled.');
        return;
      }

      this.config = configs[0];

      // Determine host based on environment
      const host = this.config.environment === 'production'
        ? 'api.push.apple.com'
        : 'api.sandbox.push.apple.com';

      // Initialize APNs client with token-based authentication
      this.client = new ApnsClient({
        team: this.config.teamId,
        keyId: this.config.keyId,
        signingKey: Buffer.from(this.config.signingKey, 'utf-8'),
        defaultTopic: this.config.bundleId,
        requestTimeout: 10000, // 10 second timeout
        keepAlive: true,
        host,
      });

      logger.info(`[APNs] Client initialized successfully (${this.config.environment} environment)`);
    } catch (error) {
      logger.error('[APNs] Failed to initialize APNs client:', error);
      this.client = null;
      this.config = null;
    }
  }

  /**
   * Ensure APNs client is initialized (singleton pattern)
   */
  private async ensureInitialized(): Promise<boolean> {
    if (this.client) {
      return true;
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }

    await this.initializationPromise;
    return this.client !== null;
  }

  /**
   * Send a push notification to a specific device
   */
  async sendNotification(
    deviceToken: string,
    payload: PushNotificationPayload,
    notificationLogId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const isReady = await this.ensureInitialized();
      if (!isReady || !this.client) {
        logger.warn('[APNs] APNs client not available. Cannot send notification.');
        return { success: false, error: 'APNs client not configured' };
      }

      // Create notification
      const notification = new Notification(deviceToken, {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        badge: payload.badge,
        sound: payload.sound || 'default',
        ...payload.data,
      });

      // Send notification
      logger.info(`[APNs] Sending notification to device: ${deviceToken.substring(0, 10)}...`);
      await this.client.send(notification);

      // Update notification log status if provided
      if (notificationLogId) {
        await db
          .update(notificationLogs)
          .set({
            status: 'sent',
            sentAt: new Date(),
          })
          .where(eq(notificationLogs.id, notificationLogId));
      }

      logger.info('[APNs] Notification sent successfully');
      return { success: true };
    } catch (error: any) {
      logger.error('[APNs] Failed to send notification:', error);

      // Handle specific APNs errors
      let errorMessage = 'Unknown error';
      if (error.reason) {
        errorMessage = error.reason;

        // Handle bad device token (remove from database)
        if (error.reason === 'BadDeviceToken' || error.reason === 'Unregistered') {
          logger.warn(`[APNs] Invalid device token detected: ${deviceToken.substring(0, 10)}...`);
          await this.deactivateDeviceToken(deviceToken);
        }
      }

      // Update notification log status if provided
      if (notificationLogId) {
        await db
          .update(notificationLogs)
          .set({
            status: 'failed',
            failureReason: errorMessage,
          })
          .where(eq(notificationLogs.id, notificationLogId));
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send notifications to multiple devices (batch)
   */
  async sendBatchNotifications(
    deviceTokens: string[],
    payload: PushNotificationPayload
  ): Promise<{ 
    successful: number; 
    failed: number;
    results: Array<{ token: string; success: boolean; error?: string }>;
  }> {
    const results = await Promise.all(
      deviceTokens.map(async (token) => {
        const result = await this.sendNotification(token, payload);
        return { token, ...result };
      })
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(`[APNs] Batch send complete: ${successful} successful, ${failed} failed`);

    return { successful, failed, results };
  }

  /**
   * Send notification to all active devices for a user
   */
  async sendToUser(
    userId: string,
    payload: PushNotificationPayload,
    notificationLogId?: string
  ): Promise<{ success: boolean; devicesReached: number; error?: string }> {
    try {
      // Get all active device tokens for user
      const tokens = await db
        .select()
        .from(deviceTokens)
        .where(
          and(
            eq(deviceTokens.userId, userId),
            eq(deviceTokens.isActive, true)
          )
        );

      if (tokens.length === 0) {
        logger.warn(`[APNs] No active device tokens found for user ${userId}`);
        return { success: false, devicesReached: 0, error: 'No active devices' };
      }

      logger.info(`[APNs] Sending notification to ${tokens.length} device(s) for user ${userId}`);

      // Send to all devices
      const results = await this.sendBatchNotifications(
        tokens.map((t) => t.deviceToken),
        payload
      );

      // If at least one succeeded, consider it a success
      const success = results.successful > 0;

      return {
        success,
        devicesReached: results.successful,
        error: success ? undefined : 'All devices failed',
      };
    } catch (error) {
      logger.error('[APNs] Failed to send notification to user:', error);
      return { success: false, devicesReached: 0, error: 'Internal error' };
    }
  }

  /**
   * Send a silent notification (background update)
   */
  async sendSilentNotification(
    deviceToken: string,
    data: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const isReady = await this.ensureInitialized();
      if (!isReady || !this.client) {
        return { success: false, error: 'APNs client not configured' };
      }

      const notification = new SilentNotification(deviceToken, data);
      await this.client.send(notification);

      logger.info('[APNs] Silent notification sent successfully');
      return { success: true };
    } catch (error: any) {
      logger.error('[APNs] Failed to send silent notification:', error);
      return { success: false, error: error.reason || 'Unknown error' };
    }
  }

  /**
   * Deactivate a device token (mark as inactive)
   */
  private async deactivateDeviceToken(token: string): Promise<void> {
    try {
      await db
        .update(deviceTokens)
        .set({ isActive: false })
        .where(eq(deviceTokens.deviceToken, token));

      logger.info(`[APNs] Device token deactivated: ${token.substring(0, 10)}...`);
    } catch (error) {
      logger.error('[APNs] Failed to deactivate device token:', error);
    }
  }

  /**
   * Reset the APNs client (force reinitialization)
   */
  async reset(): Promise<void> {
    this.client = null;
    this.config = null;
    this.initializationPromise = null;
    logger.info('[APNs] Client reset. Will reinitialize on next send.');
  }
}

// Export singleton instance
export const apnsService = new ApnsService();
