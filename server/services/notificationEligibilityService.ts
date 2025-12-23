/**
 * Notification Eligibility Service
 * 
 * Centralized gate for ALL push notifications to prevent:
 * 1. Notification flooding for new users (require 14+ days baseline)
 * 2. Historical backfill notifications (require data within 24h)
 * 3. Notifications to logged-out users
 * 4. Notifications during HealthKit backfill (require backfill complete + 24h elapsed)
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
const BACKFILL_COOLDOWN_HOURS = 24; // Must wait 24h after backfill completes before ML notifications

// In-memory cache for baseline eligibility (avoids repeated DB calls)
const baselineCache = new Map<string, { eligible: boolean; timestamp: number }>();
// In-memory cache for backfill status (avoids repeated DB calls)
// Stores full backfill state so we can recalculate hoursElapsed on cache hits
interface BackfillCacheEntry {
  timestamp: number;
  // If isComplete is true, we need backfillDate to recalculate hoursElapsed
  isComplete: boolean;
  backfillDate: Date | null;  // When backfill was marked complete
  noHealthId?: boolean;       // True if user has no health profile yet
  profileError?: boolean;     // True if we couldn't fetch profile
}
const backfillCache = new Map<string, BackfillCacheEntry>();
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
 * - HealthKit backfill is not complete OR less than 24h since backfill completed
 */
export async function checkNotificationEligibility(
  userId: string,
  options: NotificationOptions = {}
): Promise<EligibilityCheck> {
  const { sourceTimestamp, skipBaselineCheck = false, notificationType } = options;

  try {
    // 1. CRITICAL: Check if HealthKit backfill is complete + 24h has elapsed
    // This is the PRIMARY gate to prevent notification flooding for new users
    const backfillStatus = await checkBackfillComplete(userId);
    if (!backfillStatus.isReady) {
      logger.info(`[NotificationEligibility] BLOCKED: Backfill not ready for user ${userId}`, {
        backfillComplete: backfillStatus.isComplete,
        hoursElapsed: backfillStatus.hoursElapsed,
        requiredHours: BACKFILL_COOLDOWN_HOURS,
        notificationType,
      });
      return {
        eligible: false,
        reason: backfillStatus.reason,
      };
    }

    // 2. Check if source data is recent (not historical backfill)
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

    // 3. Check if user has active device tokens (they might have logged out)
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

    // 4. Skip baseline check if explicitly requested (for critical system notifications)
    if (skipBaselineCheck) {
      return { eligible: true };
    }

    // 5. Check baseline eligibility (cached)
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

    // 6. Check baseline from ClickHouse/Supabase
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
 * CRITICAL: Check if HealthKit backfill is complete AND 24 hours have elapsed.
 * This is the primary gate to prevent notification flooding for new users during backfill.
 * 
 * Returns isReady: true only if:
 * 1. clickhouse_backfill_complete is true in profiles table
 * 2. At least 24 hours have passed since clickhouse_backfill_date
 * 
 * Uses caching to reduce database load. IMPORTANT: Cache stores the backfillDate so we
 * can RECALCULATE hoursElapsed on cache hits - this ensures users become eligible once
 * 24h passes without waiting for cache to expire.
 */
async function checkBackfillComplete(userId: string): Promise<{
  isReady: boolean;
  isComplete: boolean;
  hoursElapsed: number;
  reason: string;
}> {
  const now = Date.now();
  const cacheKey = `backfill:${userId}`;
  const cached = backfillCache.get(cacheKey);
  
  // Use cached result if fresh
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    // Handle permanent blocking cases (no health ID, profile error, backfill not started)
    if (cached.noHealthId) {
      return { isReady: false, isComplete: false, hoursElapsed: 0, reason: 'Cached: No health profile exists yet' };
    }
    if (cached.profileError) {
      return { isReady: false, isComplete: false, hoursElapsed: 0, reason: 'Cached: Profile error (fail-closed)' };
    }
    if (!cached.isComplete) {
      return { isReady: false, isComplete: false, hoursElapsed: 0, reason: 'Cached: HealthKit backfill in progress' };
    }
    
    // Backfill is complete - RECALCULATE hoursElapsed to allow transition to ready
    if (!cached.backfillDate) {
      return { isReady: false, isComplete: true, hoursElapsed: 0, reason: 'Cached: Backfill just completed - waiting 24h' };
    }
    
    const hoursElapsed = (Date.now() - cached.backfillDate.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed >= BACKFILL_COOLDOWN_HOURS) {
      // User is NOW ready - update cache to reflect this
      backfillCache.set(cacheKey, { ...cached, timestamp: now });
      return { isReady: true, isComplete: true, hoursElapsed: Math.round(hoursElapsed), reason: 'Cached: Ready for ML notifications' };
    }
    return { 
      isReady: false, 
      isComplete: true, 
      hoursElapsed: Math.round(hoursElapsed), 
      reason: `Cached: Backfill completed ${Math.round(hoursElapsed)}h ago - need ${BACKFILL_COOLDOWN_HOURS}h` 
    };
  }
  
  try {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      // No health ID yet = brand new user, definitely not ready
      backfillCache.set(cacheKey, { timestamp: now, isComplete: false, backfillDate: null, noHealthId: true });
      return {
        isReady: false,
        isComplete: false,
        hoursElapsed: 0,
        reason: 'No health profile exists yet',
      };
    }
    
    const supabase = getSupabaseClient();
    
    // Query the profiles table for backfill status
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('clickhouse_backfill_complete, clickhouse_backfill_date')
      .eq('health_id', healthId)
      .single();
    
    if (error || !profile) {
      // Profile doesn't exist or error - fail closed
      backfillCache.set(cacheKey, { timestamp: now, isComplete: false, backfillDate: null, profileError: true });
      return {
        isReady: false,
        isComplete: false,
        hoursElapsed: 0,
        reason: 'Profile not found or error checking backfill status',
      };
    }
    
    // Check if backfill is marked complete
    if (!profile.clickhouse_backfill_complete) {
      backfillCache.set(cacheKey, { timestamp: now, isComplete: false, backfillDate: null });
      return {
        isReady: false,
        isComplete: false,
        hoursElapsed: 0,
        reason: 'HealthKit backfill in progress - no notifications until complete',
      };
    }
    
    // Check if 24 hours have elapsed since backfill completed
    const backfillDate = profile.clickhouse_backfill_date 
      ? new Date(profile.clickhouse_backfill_date)
      : null;
    
    if (!backfillDate) {
      // Backfill complete but no date - assume just completed, block notifications
      backfillCache.set(cacheKey, { timestamp: now, isComplete: true, backfillDate: null });
      return {
        isReady: false,
        isComplete: true,
        hoursElapsed: 0,
        reason: 'Backfill just completed - waiting 24h before ML notifications',
      };
    }
    
    const hoursElapsed = (Date.now() - backfillDate.getTime()) / (1000 * 60 * 60);
    
    // Cache the state with the backfillDate so we can recalculate on cache hits
    backfillCache.set(cacheKey, { timestamp: now, isComplete: true, backfillDate });
    
    if (hoursElapsed < BACKFILL_COOLDOWN_HOURS) {
      return {
        isReady: false,
        isComplete: true,
        hoursElapsed: Math.round(hoursElapsed),
        reason: `Backfill completed ${Math.round(hoursElapsed)}h ago - need ${BACKFILL_COOLDOWN_HOURS}h before ML notifications`,
      };
    }
    
    // All checks passed - user is ready for ML notifications
    return {
      isReady: true,
      isComplete: true,
      hoursElapsed: Math.round(hoursElapsed),
      reason: 'Ready for ML notifications',
    };
  } catch (error) {
    // CRITICAL: Fail closed on errors to prevent notification flooding
    logger.error(`[NotificationEligibility] Error checking backfill status for user ${userId}:`, error);
    backfillCache.set(cacheKey, { timestamp: now, isComplete: false, backfillDate: null, profileError: true });
    return {
      isReady: false,
      isComplete: false,
      hoursElapsed: 0,
      reason: 'Error checking backfill status (fail-closed for safety)',
    };
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
 * Clear baseline and backfill caches for a user (call when user syncs significant new data or logs out)
 */
export function clearBaselineCache(userId: string): void {
  baselineCache.delete(`baseline:${userId}`);
  backfillCache.delete(`backfill:${userId}`);
}

/**
 * Clear all baseline and backfill caches (for admin/testing)
 */
export function clearAllBaselineCaches(): void {
  baselineCache.clear();
  backfillCache.clear();
  logger.info('[NotificationEligibility] All baseline and backfill caches cleared');
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
