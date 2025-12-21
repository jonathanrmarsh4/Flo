/**
 * Notification Eligibility Service
 * 
 * Centralized gate for ALL push notifications to prevent:
 * 1. Notification flooding for new users (require 14+ days baseline)
 * 2. Historical backfill notifications (require data within 24h)
 * 3. Notifications to logged-out users
 * 
 * This is the SINGLE choke-point that every notification must pass through.
 */

import { db } from '../db';
import { users, deviceTokens, notificationQueue, notificationLogs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger';
import { getHealthId } from './supabaseHealthStorage';
import { getSupabaseClient } from './supabaseClient';

const MIN_BASELINE_DAYS = 14;
const MIN_DATA_POINTS = 42; // At least 3 data points per day on average
const RECENCY_HOURS = 24; // Data must be from within the last 24 hours

// In-memory cache for baseline eligibility (avoids repeated DB calls)
const baselineCache = new Map<string, { eligible: boolean; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface EligibilityCheck {
  eligible: boolean;
  reason?: string;
  daysOfData?: number;
  dataPoints?: number;
}

interface NotificationOptions {
  sourceTimestamp?: Date | string;
  skipBaselineCheck?: boolean; // For critical system notifications only
  notificationType?: string;
}

/**
 * Check if a user is eligible to receive push notifications
 * 
 * Returns eligible: false if:
 * - User doesn't have 14+ days of baseline data
 * - User has no active device tokens
 * - Source data is older than 24 hours (historical backfill)
 */
export async function checkNotificationEligibility(
  userId: string,
  options: NotificationOptions = {}
): Promise<EligibilityCheck> {
  const { sourceTimestamp, skipBaselineCheck = false, notificationType } = options;

  try {
    // 1. Check if source data is recent (not historical backfill)
    if (sourceTimestamp) {
      const sourceDate = typeof sourceTimestamp === 'string' 
        ? new Date(sourceTimestamp) 
        : sourceTimestamp;
      const hoursOld = (Date.now() - sourceDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursOld > RECENCY_HOURS) {
        logger.debug(`[NotificationEligibility] BLOCKED: Historical backfill for user ${userId}`, {
          sourceTimestamp: sourceDate.toISOString(),
          hoursOld: Math.round(hoursOld),
          notificationType,
        });
        return {
          eligible: false,
          reason: `Data is ${Math.round(hoursOld)}h old (max ${RECENCY_HOURS}h)`,
        };
      }
    }

    // 2. Check if user has active device tokens (they might have logged out)
    const activeTokens = await db
      .select({ id: deviceTokens.id })
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.userId, String(userId)),
          eq(deviceTokens.isActive, true)
        )
      )
      .limit(1);

    if (activeTokens.length === 0) {
      logger.debug(`[NotificationEligibility] BLOCKED: No active device tokens for user ${userId}`);
      return {
        eligible: false,
        reason: 'No active device tokens',
      };
    }

    // 3. Skip baseline check if explicitly requested (for critical system notifications)
    if (skipBaselineCheck) {
      return { eligible: true };
    }

    // 4. Check baseline eligibility (cached)
    const cacheKey = `baseline:${userId}`;
    const cached = baselineCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      if (!cached.eligible) {
        logger.debug(`[NotificationEligibility] BLOCKED (cached): Insufficient baseline for user ${userId}`);
        return {
          eligible: false,
          reason: 'Insufficient baseline data (cached)',
        };
      }
      return { eligible: true };
    }

    // 5. Check baseline from ClickHouse/Supabase
    const baselineResult = await checkBaselineEstablished(userId);
    
    // Cache the result
    baselineCache.set(cacheKey, {
      eligible: baselineResult.isEstablished,
      timestamp: now,
    });

    if (!baselineResult.isEstablished) {
      logger.info(`[NotificationEligibility] BLOCKED: New user ${userId} lacks baseline`, {
        daysOfData: baselineResult.daysOfData,
        dataPoints: baselineResult.dataPoints,
        requiredDays: MIN_BASELINE_DAYS,
        requiredPoints: MIN_DATA_POINTS,
        notificationType,
      });
      return {
        eligible: false,
        reason: `Only ${baselineResult.daysOfData} days of data (need ${MIN_BASELINE_DAYS})`,
        daysOfData: baselineResult.daysOfData,
        dataPoints: baselineResult.dataPoints,
      };
    }

    return { eligible: true, daysOfData: baselineResult.daysOfData, dataPoints: baselineResult.dataPoints };
  } catch (error) {
    // CRITICAL: Fail CLOSED to prevent notification flooding during outages
    // The flood incident happened precisely when data checks failed
    logger.error(`[NotificationEligibility] Error checking eligibility for user ${userId} - BLOCKING notification:`, error);
    return { eligible: false, reason: 'Error checking eligibility (fail-closed for safety)' };
  }
}

/**
 * Check if user has established baseline data (14+ days, 42+ data points)
 * This is extracted from correlationInsightService for shared use.
 */
async function checkBaselineEstablished(userId: string): Promise<{
  isEstablished: boolean;
  daysOfData: number;
  dataPoints: number;
}> {
  try {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return { isEstablished: false, daysOfData: 0, dataPoints: 0 };
    }

    const supabase = getSupabaseClient();
    
    // Check daily_metrics for data coverage
    const { data: metrics, error } = await supabase
      .from('user_daily_metrics')
      .select('local_date')
      .eq('health_id', healthId)
      .order('local_date', { ascending: false })
      .limit(100);

    if (error || !metrics || metrics.length === 0) {
      return { isEstablished: false, daysOfData: 0, dataPoints: 0 };
    }

    // Count unique days
    const uniqueDays = new Set(metrics.map((m: { local_date: string }) => m.local_date)).size;
    const dataPoints = metrics.length;

    return {
      isEstablished: uniqueDays >= MIN_BASELINE_DAYS && dataPoints >= MIN_DATA_POINTS,
      daysOfData: uniqueDays,
      dataPoints,
    };
  } catch (error) {
    logger.error('[NotificationEligibility] Error checking baseline:', error);
    return { isEstablished: false, daysOfData: 0, dataPoints: 0 };
  }
}

/**
 * Clear baseline cache for a user (call when user syncs significant new data)
 */
export function clearBaselineCache(userId: string): void {
  baselineCache.delete(`baseline:${userId}`);
}

/**
 * Clear all baseline caches (for admin/testing)
 */
export function clearAllBaselineCaches(): void {
  baselineCache.clear();
  logger.info('[NotificationEligibility] All baseline caches cleared');
}

/**
 * Flush ALL pending notifications for a user (call on logout)
 * This removes queued notifications from ALL tables to prevent post-logout flooding
 */
export async function flushPendingNotifications(userId: string): Promise<{ flushed: number }> {
  let flushed = 0;
  
  try {
    const supabase = getSupabaseClient();
    const healthId = await getHealthId(userId);
    
    // 1. Flush daily_reminders (Supabase) - keyed by health_id
    if (healthId) {
      const { data: reminderData } = await supabase
        .from('daily_reminders')
        .update({ delivered: true })
        .eq('user_id', healthId)
        .eq('delivered', false)
        .select('id');
      
      if (reminderData) {
        flushed += reminderData.length;
        logger.info(`[NotificationEligibility] Flushed ${reminderData.length} daily_reminders for user ${userId}`);
      }
      
      // 2. Flush pending_correlation_feedback (Supabase)
      const { data: feedbackData } = await supabase
        .from('pending_correlation_feedback')
        .delete()
        .eq('health_id', healthId)
        .eq('is_visible', false)
        .select('id');
      
      if (feedbackData) {
        flushed += feedbackData.length;
        logger.info(`[NotificationEligibility] Flushed ${feedbackData.length} pending_correlation_feedback for user ${userId}`);
      }
    }
    
    // 3. Flush notification_queue (Neon) - keyed by userId
    const queueResult = await db
      .delete(notificationQueue)
      .where(
        and(
          eq(notificationQueue.userId, String(userId)),
          eq(notificationQueue.status, 'scheduled')
        )
      )
      .returning({ id: notificationQueue.id });
    
    if (queueResult) {
      flushed += queueResult.length;
      logger.info(`[NotificationEligibility] Flushed ${queueResult.length} notification_queue entries for user ${userId}`);
    }
    
    // 4. Mark notification_logs as cancelled (Neon)
    const logsResult = await db
      .update(notificationLogs)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(notificationLogs.userId, String(userId)),
          eq(notificationLogs.status, 'pending')
        )
      )
      .returning({ id: notificationLogs.id });
    
    if (logsResult) {
      flushed += logsResult.length;
      logger.info(`[NotificationEligibility] Cancelled ${logsResult.length} notification_logs for user ${userId}`);
    }
    
    logger.info(`[NotificationEligibility] Total flushed: ${flushed} notifications for user ${userId}`);
  } catch (error) {
    logger.error('[NotificationEligibility] Error flushing pending notifications:', error);
  }
  
  return { flushed };
}

export default {
  checkNotificationEligibility,
  clearBaselineCache,
  clearAllBaselineCaches,
  flushPendingNotifications,
};
