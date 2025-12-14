/**
 * Centralized Notification Service
 * 
 * A reliable, timezone-aware notification scheduler with:
 * - Proper timezone handling using date-fns-tz
 * - Queue-based processing with atomic status updates
 * - Exponential backoff retry logic
 * - Per-user schedule management
 * - Admin visibility into queue state
 */

import * as cron from 'node-cron';
import { db } from '../db';
import {
  notificationQueue,
  notificationDeliveryLog,
  userNotificationSchedules,
  scheduledNotificationTemplates,
  users,
  deviceTokens,
  type NotificationQueueItem,
  type UserNotificationSchedule,
  type ScheduledNotificationTemplate,
} from '@shared/schema';
import { eq, and, lte, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addMinutes, addDays, startOfDay, parseISO, isValid, differenceInMilliseconds } from 'date-fns';
import { apnsService } from './apnsService';
import { logger } from '../logger';

// =====================================================
// TYPES
// =====================================================

type NotificationType = 'daily_brief' | 'survey_3pm' | 'supplement_reminder' | 'weekly_summary' | 'custom';
type DeliveryStatus = 'scheduled' | 'processing' | 'delivered' | 'failed' | 'skipped';

interface QueuedNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  scheduledForUtc: Date;
  localDateKey: string;
  scheduleId?: string;
  payload?: Record<string, any>;
}

interface DeliveryResult {
  success: boolean;
  devicesReached: number;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
}

// =====================================================
// CONSTANTS
// =====================================================

const RETRY_DELAYS_MS = [
  1 * 60 * 1000,    // 1 minute
  5 * 60 * 1000,    // 5 minutes
  15 * 60 * 1000,   // 15 minutes
];

const MAX_QUEUE_BATCH_SIZE = 100;
const QUEUE_PROCESS_INTERVAL_MS = 30 * 1000; // 30 seconds

// =====================================================
// SERVICE CLASS
// =====================================================

class CentralizedNotificationService {
  private queueProcessor: NodeJS.Timeout | null = null;
  private schedulerCron: ReturnType<typeof cron.schedule> | null = null;
  private isProcessing = false;
  private isRunning = false;

  /**
   * Check if service is currently running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Start the notification service (idempotent - safe to call multiple times)
   */
  async start(): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      logger.info('[NotificationService] Service already running, ignoring start request');
      return { success: true, message: 'Service already running' };
    }

    logger.info('[NotificationService] Starting centralized notification service...');

    // Start queue processor (runs every 30 seconds)
    this.queueProcessor = setInterval(() => {
      this.processQueue().catch((err) => {
        logger.error('[NotificationService] Queue processing error:', err);
      });
    }, QUEUE_PROCESS_INTERVAL_MS);

    // Start scheduler cron (runs every minute to populate queue)
    this.schedulerCron = cron.schedule('* * * * *', async () => {
      try {
        await this.populateQueue();
      } catch (err) {
        logger.error('[NotificationService] Queue population error:', err);
      }
    });

    // Initial queue population
    await this.populateQueue();

    this.isRunning = true;
    logger.info('[NotificationService] Service started successfully');
    return { success: true, message: 'Service started' };
  }

  /**
   * Stop the notification service (idempotent - safe to call multiple times)
   */
  stop(): { success: boolean; message: string } {
    if (!this.isRunning) {
      logger.info('[NotificationService] Service already stopped, ignoring stop request');
      return { success: true, message: 'Service already stopped' };
    }

    logger.info('[NotificationService] Stopping notification service...');

    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
      this.queueProcessor = null;
    }

    if (this.schedulerCron) {
      this.schedulerCron.stop();
      this.schedulerCron = null;
    }

    this.isRunning = false;
    logger.info('[NotificationService] Service stopped');
    return { success: true, message: 'Service stopped' };
  }

  // =====================================================
  // QUEUE POPULATION
  // =====================================================

  /**
   * Populate the notification queue for upcoming notifications
   * Runs every minute to check for notifications that should fire within the next 5 minutes
   */
  async populateQueue(): Promise<void> {
    const now = new Date();
    const fiveMinutesFromNow = addMinutes(now, 5);

    try {
      // Get all active user schedules
      const activeSchedules = await db
        .select()
        .from(userNotificationSchedules)
        .where(eq(userNotificationSchedules.isEnabled, true));

      if (activeSchedules.length === 0) {
        return;
      }

      // Get templates for active notification types
      const templates = await db
        .select()
        .from(scheduledNotificationTemplates)
        .where(eq(scheduledNotificationTemplates.isActive, true));

      const templateMap = new Map(templates.map(t => [t.type, t]));

      for (const schedule of activeSchedules) {
        try {
          await this.queueNotificationIfDue(schedule, templateMap, now, fiveMinutesFromNow);
        } catch (err) {
          logger.error(`[NotificationService] Error queuing notification for user ${schedule.userId}:`, err);
        }
      }
    } catch (err) {
      logger.error('[NotificationService] Error in populateQueue:', err);
    }
  }

  /**
   * Check if a notification should be queued and add it if needed
   */
  private async queueNotificationIfDue(
    schedule: UserNotificationSchedule,
    templateMap: Map<string, ScheduledNotificationTemplate>,
    now: Date,
    windowEnd: Date
  ): Promise<void> {
    const template = templateMap.get(schedule.type);
    if (!template) {
      return; // No template for this notification type
    }

    // Parse local time (HH:MM) and calculate UTC fire time
    const [hours, minutes] = schedule.localTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      logger.warn(`[NotificationService] Invalid local time format for schedule ${schedule.id}: ${schedule.localTime}`);
      return;
    }

    // Get today's date in user's timezone
    const nowInUserTz = toZonedTime(now, schedule.timezone);
    const todayLocalKey = formatInTimeZone(now, schedule.timezone, 'yyyy-MM-dd');
    
    // Create today's fire time in user's timezone
    const todayFireLocal = startOfDay(nowInUserTz);
    todayFireLocal.setHours(hours, minutes, 0, 0);
    
    // Convert to UTC
    const todayFireUtc = fromZonedTime(todayFireLocal, schedule.timezone);

    // Check if within the processing window
    // Allow missed notifications from today (up to 30 min late) to still be queued
    const missedWindowMs = 30 * 60 * 1000; // 30 minutes grace period for missed notifications
    const earliestFireTime = new Date(now.getTime() - missedWindowMs);
    
    if (todayFireUtc > windowEnd) {
      return; // Not due yet
    }
    
    if (todayFireUtc < earliestFireTime) {
      return; // Too old - missed window
    }

    // Check day of week filter
    const dayOfWeek = nowInUserTz.getDay();
    const allowedDays = (schedule.daysOfWeek as number[]) || [0, 1, 2, 3, 4, 5, 6];
    if (!allowedDays.includes(dayOfWeek)) {
      return; // Not scheduled for today
    }

    // Check if already queued for today (using unique constraint)
    const existingQueue = await db
      .select({ id: notificationQueue.id })
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.userId, schedule.userId),
          eq(notificationQueue.type, schedule.type),
          eq(notificationQueue.localDateKey, todayLocalKey)
        )
      )
      .limit(1);

    if (existingQueue.length > 0) {
      return; // Already queued
    }

    // Queue the notification
    await this.enqueue({
      userId: schedule.userId,
      type: schedule.type as NotificationType,
      title: template.title,
      body: template.body,
      scheduledForUtc: todayFireUtc,
      localDateKey: todayLocalKey,
      scheduleId: schedule.id,
      payload: template.metadata as Record<string, any> | undefined,
    });

    logger.info(`[NotificationService] Queued ${schedule.type} for user ${schedule.userId} at ${todayFireUtc.toISOString()}`);
  }

  /**
   * Add a notification to the queue
   */
  async enqueue(notification: QueuedNotification): Promise<string> {
    const [result] = await db
      .insert(notificationQueue)
      .values({
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        scheduledForUtc: notification.scheduledForUtc,
        localDateKey: notification.localDateKey,
        scheduleId: notification.scheduleId,
        payload: notification.payload,
        status: 'scheduled',
        attempts: 0,
        maxAttempts: 3,
      })
      .returning({ id: notificationQueue.id });

    return result.id;
  }

  // =====================================================
  // QUEUE PROCESSING
  // =====================================================

  /**
   * Process pending notifications in the queue
   * Uses atomic claim-then-process pattern to prevent duplicate sends
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('[NotificationService] Queue already being processed, skipping');
      return;
    }

    this.isProcessing = true;
    const now = new Date();

    try {
      // First, handle dead-letter items (max attempts exceeded)
      await this.handleDeadLetterItems(now);

      // Atomically claim items one at a time using UPDATE ... RETURNING
      // This prevents race conditions between workers
      let processedCount = 0;
      
      while (processedCount < MAX_QUEUE_BATCH_SIZE) {
        const claimedItem = await this.claimNextQueueItem(now);
        
        if (!claimedItem) {
          // No more items to process
          break;
        }
        
        try {
          await this.processClaimedItem(claimedItem);
          processedCount++;
        } catch (err) {
          logger.error(`[NotificationService] Error processing queue item ${claimedItem.id}:`, err);
        }
      }
      
      if (processedCount > 0) {
        logger.info(`[NotificationService] Processed ${processedCount} notifications`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handle items that have exceeded max attempts (dead-letter)
   */
  private async handleDeadLetterItems(now: Date): Promise<void> {
    // Find and mark expired items as failed
    const expiredItems = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          inArray(notificationQueue.status, ['scheduled', 'processing']),
          sql`${notificationQueue.attempts} >= ${notificationQueue.maxAttempts}`
        )
      )
      .limit(50);

    for (const item of expiredItems) {
      await db
        .update(notificationQueue)
        .set({
          status: 'failed',
          failureReason: `Max attempts (${item.maxAttempts}) exceeded`,
          updatedAt: now,
        })
        .where(
          and(
            eq(notificationQueue.id, item.id),
            inArray(notificationQueue.status, ['scheduled', 'processing'])
          )
        );
      
      await db.insert(notificationDeliveryLog).values({
        queueId: item.id,
        userId: item.userId,
        type: item.type,
        title: item.title,
        body: item.body,
        success: false,
        devicesReached: 0,
        errorCode: 'DEAD_LETTER',
        errorMessage: `Max attempts (${item.maxAttempts}) exceeded`,
        scheduledForUtc: item.scheduledForUtc,
      });
      
      logger.warn(`[NotificationService] Dead-lettered ${item.type} for user ${item.userId}: max attempts exceeded`);
    }
  }

  /**
   * Atomically claim the next available queue item
   * Uses UPDATE ... RETURNING for atomic claim without race conditions
   */
  private async claimNextQueueItem(now: Date): Promise<NotificationQueueItem | null> {
    // Atomic claim: Update a single 'scheduled' item that's due
    // The WHERE clause ensures only unclaimed items are grabbed
    const [claimed] = await db
      .update(notificationQueue)
      .set({
        status: 'processing',
        attempts: sql`${notificationQueue.attempts} + 1`,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationQueue.status, 'scheduled'),
          lte(notificationQueue.scheduledForUtc, now),
          sql`${notificationQueue.attempts} < ${notificationQueue.maxAttempts}`
        )
      )
      .returning();

    if (claimed) {
      return claimed as NotificationQueueItem;
    }

    // Also check for items in 'processing' state that are ready for retry
    const [retryItem] = await db
      .update(notificationQueue)
      .set({
        status: 'processing',
        attempts: sql`${notificationQueue.attempts} + 1`,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationQueue.status, 'processing'),
          lte(notificationQueue.nextRetryAt, now),
          sql`${notificationQueue.attempts} < ${notificationQueue.maxAttempts}`
        )
      )
      .returning();

    return retryItem ? (retryItem as NotificationQueueItem) : null;
  }

  /**
   * Process an already-claimed queue item
   */
  private async processClaimedItem(item: NotificationQueueItem): Promise<void> {
    const startTime = Date.now();

    // Check if user has active device tokens
    const activeTokens = await db
      .select({ id: deviceTokens.id })
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.userId, item.userId),
          eq(deviceTokens.isActive, true)
        )
      )
      .limit(1);

    if (activeTokens.length === 0) {
      // Skip - no devices registered
      await this.markSkipped(item, 'no_active_devices');
      return;
    }

    // Send notification
    const result = await apnsService.sendToUser(item.userId, {
      title: item.title,
      body: item.body,
      data: {
        type: item.type,
        queueId: item.id,
        ...((item.payload as Record<string, any>) || {}),
      },
      interruptionLevel: 'time-sensitive',
    });

    const latencyMs = Date.now() - startTime;

    if (result.success && result.devicesReached > 0) {
      await this.markDelivered(item, result.devicesReached, latencyMs);
    } else {
      await this.handleFailure(item, result.error || 'Unknown error', latencyMs);
    }
  }

  /**
   * Mark a queue item as delivered
   */
  private async markDelivered(item: NotificationQueueItem, devicesReached: number, latencyMs: number): Promise<void> {
    const now = new Date();

    // Update queue item
    await db
      .update(notificationQueue)
      .set({
        status: 'delivered',
        deliveredAt: now,
        devicesReached,
        updatedAt: now,
      })
      .where(eq(notificationQueue.id, item.id));

    // Log delivery
    await db.insert(notificationDeliveryLog).values({
      queueId: item.id,
      userId: item.userId,
      type: item.type,
      title: item.title,
      body: item.body,
      success: true,
      devicesReached,
      scheduledForUtc: item.scheduledForUtc,
      latencyMs,
      deviceTokensAttempted: devicesReached,
    });

    logger.info(`[NotificationService] Delivered ${item.type} to user ${item.userId} (${devicesReached} devices, ${latencyMs}ms)`);
  }

  /**
   * Mark a queue item as skipped
   */
  private async markSkipped(item: NotificationQueueItem, reason: string): Promise<void> {
    const now = new Date();

    await db
      .update(notificationQueue)
      .set({
        status: 'skipped',
        failureReason: reason,
        updatedAt: now,
      })
      .where(eq(notificationQueue.id, item.id));

    // Log the skip
    await db.insert(notificationDeliveryLog).values({
      queueId: item.id,
      userId: item.userId,
      type: item.type,
      title: item.title,
      body: item.body,
      success: false,
      devicesReached: 0,
      errorCode: 'SKIPPED',
      errorMessage: reason,
      scheduledForUtc: item.scheduledForUtc,
    });

    logger.info(`[NotificationService] Skipped ${item.type} for user ${item.userId}: ${reason}`);
  }

  /**
   * Handle a failed delivery with retry logic
   */
  private async handleFailure(item: NotificationQueueItem, error: string, latencyMs: number): Promise<void> {
    const now = new Date();
    const attempts = item.attempts + 1;

    if (attempts >= item.maxAttempts) {
      // Max retries exceeded - mark as failed
      await db
        .update(notificationQueue)
        .set({
          status: 'failed',
          failureReason: error,
          updatedAt: now,
        })
        .where(eq(notificationQueue.id, item.id));

      // Log final failure
      await db.insert(notificationDeliveryLog).values({
        queueId: item.id,
        userId: item.userId,
        type: item.type,
        title: item.title,
        body: item.body,
        success: false,
        devicesReached: 0,
        errorCode: 'MAX_RETRIES',
        errorMessage: error,
        scheduledForUtc: item.scheduledForUtc,
        latencyMs,
      });

      logger.warn(`[NotificationService] Max retries exceeded for ${item.type} to user ${item.userId}: ${error}`);
    } else {
      // Schedule retry with exponential backoff
      const delayMs = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
      const nextRetry = new Date(now.getTime() + delayMs);

      await db
        .update(notificationQueue)
        .set({
          status: 'processing', // Keep as processing for retry
          nextRetryAt: nextRetry,
          failureReason: error,
          updatedAt: now,
        })
        .where(eq(notificationQueue.id, item.id));

      logger.info(`[NotificationService] Retry ${attempts}/${item.maxAttempts} for ${item.type} to user ${item.userId} at ${nextRetry.toISOString()}`);
    }
  }

  // =====================================================
  // USER SCHEDULE MANAGEMENT
  // =====================================================

  /**
   * Create or update a user's notification schedule
   */
  async upsertUserSchedule(
    userId: string,
    type: NotificationType,
    localTime: string,
    timezone: string,
    options?: {
      isEnabled?: boolean;
      daysOfWeek?: number[];
    }
  ): Promise<UserNotificationSchedule> {
    const values = {
      userId,
      type,
      localTime,
      timezone,
      isEnabled: options?.isEnabled ?? true,
      daysOfWeek: options?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    };

    const [result] = await db
      .insert(userNotificationSchedules)
      .values(values)
      .onConflictDoUpdate({
        target: [userNotificationSchedules.userId, userNotificationSchedules.type],
        set: {
          localTime: values.localTime,
          timezone: values.timezone,
          isEnabled: values.isEnabled,
          daysOfWeek: values.daysOfWeek,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  }

  /**
   * Get a user's notification schedules
   */
  async getUserSchedules(userId: string): Promise<UserNotificationSchedule[]> {
    return db
      .select()
      .from(userNotificationSchedules)
      .where(eq(userNotificationSchedules.userId, userId));
  }

  /**
   * Disable a user's notification schedule
   */
  async disableUserSchedule(userId: string, type: NotificationType): Promise<void> {
    await db
      .update(userNotificationSchedules)
      .set({ isEnabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(userNotificationSchedules.userId, userId),
          eq(userNotificationSchedules.type, type)
        )
      );
  }

  // =====================================================
  // ADMIN OPERATIONS
  // =====================================================

  /**
   * Get queue statistics for admin dashboard
   */
  async getQueueStats(): Promise<{
    scheduled: number;
    processing: number;
    delivered: number;
    failed: number;
    skipped: number;
  }> {
    const stats = await db
      .select({
        status: notificationQueue.status,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationQueue)
      .groupBy(notificationQueue.status);

    const result = {
      scheduled: 0,
      processing: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
    };

    for (const row of stats) {
      if (row.status in result) {
        result[row.status as keyof typeof result] = row.count;
      }
    }

    return result;
  }

  /**
   * Get delivery success rate for the past N hours
   */
  async getDeliveryStats(hoursBack: number = 24): Promise<{
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgLatencyMs: number;
  }> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where success = true)::int`,
        failed: sql<number>`count(*) filter (where success = false)::int`,
        avgLatency: sql<number>`avg(latency_ms)::int`,
      })
      .from(notificationDeliveryLog)
      .where(gt(notificationDeliveryLog.attemptedAt, since));

    return {
      total: stats?.total ?? 0,
      successful: stats?.successful ?? 0,
      failed: stats?.failed ?? 0,
      successRate: stats?.total ? (stats.successful / stats.total) * 100 : 0,
      avgLatencyMs: stats?.avgLatency ?? 0,
    };
  }

  /**
   * Manually trigger a notification for a user (admin/testing)
   */
  async sendManualNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string
  ): Promise<{ queueId: string }> {
    const now = new Date();
    const queueId = await this.enqueue({
      userId,
      type,
      title,
      body,
      scheduledForUtc: now,
      localDateKey: now.toISOString().split('T')[0] + '-manual',
    });

    return { queueId };
  }

  /**
   * Retry all failed notifications (admin operation)
   * Only retries items that have been failed for less than 24 hours
   * to prevent infinite retry loops
   */
  async retryAllFailed(): Promise<number> {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const result = await db
      .update(notificationQueue)
      .set({
        status: 'scheduled',
        attempts: 0,
        maxAttempts: 3, // Reset max attempts for fresh retry
        nextRetryAt: null,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationQueue.status, 'failed'),
          gt(notificationQueue.updatedAt, cutoffTime)
        )
      )
      .returning({ id: notificationQueue.id });

    logger.info(`[NotificationService] Reset ${result.length} failed notifications for retry`);
    return result.length;
  }
}

// Export singleton instance
export const centralizedNotificationService = new CentralizedNotificationService();
