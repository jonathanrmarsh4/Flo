/**
 * Oura Background Sync Scheduler
 * 
 * Handles periodic syncing of Oura data for all connected users.
 * Respects rate limits: 5000 requests per 5 minutes
 */

import * as cron from 'node-cron';
import { db } from '../db';
import { userIntegrations } from '@shared/schema';
import { eq, and, lt, or, isNull } from 'drizzle-orm';
import { syncOuraData } from './ouraApiClient';
import { getHealthId } from './supabaseHealthStorage';
import { syncSleepMetricsToClickHouse } from './clickhouseHealthSync';
import { updateSyncStatus } from './integrationsService';

// Rate limiting: 5000 requests per 5 minutes = ~16 requests/second max
// Being conservative: 1 user sync = ~3 API calls (sleep, readiness, heart_rate)
// Target: ~2 users/second to stay well under limits
const MIN_SYNC_INTERVAL_MS = 500; // 2 syncs per second max
const MAX_CONCURRENT_SYNCS = 2;

// Track active syncs and in-flight users
let activeSyncs = 0;
let syncQueue: string[] = [];
const inFlightUsers = new Set<string>(); // Prevent re-enqueue during sync
let processingInterval: NodeJS.Timeout | null = null;

/**
 * Get all users with connected Oura integrations that need syncing
 */
async function getUsersNeedingSync(): Promise<Array<{ userId: string; lastSyncAt: Date | null }>> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const integrations = await db.query.userIntegrations.findMany({
    where: and(
      eq(userIntegrations.provider, 'oura'),
      eq(userIntegrations.status, 'connected'),
      eq(userIntegrations.enabled, true),
      or(
        isNull(userIntegrations.lastSyncAt),
        lt(userIntegrations.lastSyncAt, oneHourAgo)
      )
    ),
    columns: {
      userId: true,
      lastSyncAt: true,
    },
    orderBy: (fields, { asc }) => [asc(fields.lastSyncAt)],
  });
  
  return integrations;
}

/**
 * Sync Oura data for a single user
 * syncOuraData already handles Supabase storage, we just need to sync to ClickHouse
 */
async function syncUserOuraData(userId: string): Promise<void> {
  // Mark as in-flight to prevent re-enqueue
  inFlightUsers.add(userId);
  
  try {
    console.log(`[OuraSyncScheduler] Starting sync for user ${userId}`);
    
    const healthId = await getHealthId(userId);
    if (!healthId) {
      console.warn(`[OuraSyncScheduler] No healthId for user ${userId}, skipping`);
      // Still update lastSyncAt to prevent re-queue
      await updateSyncStatus(userId, 'oura', true);
      return;
    }
    
    // Sync last 3 days for background sync (7 days for manual sync)
    // syncOuraData handles Supabase storage and updates sync status
    const result = await syncOuraData(userId, healthId, 3);
    
    if (result.success) {
      // Sync to ClickHouse for ML analysis
      for (const night of result.sleepNights) {
        try {
          await syncSleepMetricsToClickHouse(healthId, night, 'oura');
        } catch (err) {
          console.error(`[OuraSyncScheduler] Failed to sync to ClickHouse:`, err);
        }
      }
      
      console.log(`[OuraSyncScheduler] Synced ${result.sleepNights.length} nights for user ${userId}`);
    } else {
      console.warn(`[OuraSyncScheduler] Sync failed for user ${userId}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[OuraSyncScheduler] Error syncing user ${userId}:`, error);
    // Update status to error to prevent endless retries
    await updateSyncStatus(userId, 'oura', false, String(error));
  } finally {
    // Always remove from in-flight set
    inFlightUsers.delete(userId);
  }
}

/**
 * Start continuous queue processing with rate limiting
 */
function startQueueProcessing(): void {
  if (processingInterval) return; // Already running
  
  processingInterval = setInterval(() => {
    // Check if we can start another sync
    if (syncQueue.length === 0 || activeSyncs >= MAX_CONCURRENT_SYNCS) {
      // Stop interval if queue is empty
      if (syncQueue.length === 0 && activeSyncs === 0 && processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
        console.log('[OuraSyncScheduler] Queue empty, stopping processor');
      }
      return;
    }
    
    const userId = syncQueue.shift();
    if (!userId) return;
    
    activeSyncs++;
    
    // Fire off sync (don't await - runs in background)
    syncUserOuraData(userId)
      .finally(() => {
        activeSyncs--;
      });
  }, MIN_SYNC_INTERVAL_MS);
  
  console.log(`[OuraSyncScheduler] Queue processor started (${MIN_SYNC_INTERVAL_MS}ms interval)`);
}

/**
 * Add users to queue and start processing
 * Skips users that are already in queue or currently in-flight
 */
function enqueueUsers(userIds: string[]): void {
  let added = 0;
  for (const userId of userIds) {
    // Skip if already queued or currently syncing
    if (syncQueue.includes(userId) || inFlightUsers.has(userId)) {
      continue;
    }
    syncQueue.push(userId);
    added++;
  }
  
  if (added > 0) {
    console.log(`[OuraSyncScheduler] Enqueued ${added} users (${userIds.length - added} skipped)`);
    // Start processing if not already running
    startQueueProcessing();
  }
}

/**
 * Run a sync cycle for all users needing sync
 */
async function runSyncCycle(): Promise<void> {
  console.log('[OuraSyncScheduler] Starting sync cycle');
  
  try {
    const users = await getUsersNeedingSync();
    console.log(`[OuraSyncScheduler] Found ${users.length} users needing sync`);
    
    if (users.length === 0) {
      return;
    }
    
    // Enqueue users and start processing
    enqueueUsers(users.map(u => u.userId));
  } catch (error) {
    console.error('[OuraSyncScheduler] Error in sync cycle:', error);
  }
}

/**
 * Schedule periodic sync
 * Runs every hour by default
 */
let scheduledTask: cron.ScheduledTask | null = null;

export function startOuraSyncScheduler(cronExpression: string = '0 * * * *'): void {
  if (scheduledTask) {
    console.warn('[OuraSyncScheduler] Scheduler already running');
    return;
  }
  
  console.log(`[OuraSyncScheduler] Starting scheduler with cron: ${cronExpression}`);
  
  scheduledTask = cron.schedule(cronExpression, () => {
    runSyncCycle();
  });
  
  // Run initial sync after 30 seconds
  setTimeout(() => {
    console.log('[OuraSyncScheduler] Running initial sync cycle');
    runSyncCycle();
  }, 30000);
}

export function stopOuraSyncScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[OuraSyncScheduler] Scheduler stopped');
  }
}

/**
 * Manually trigger sync for a specific user (for testing/admin)
 */
export async function triggerUserSync(userId: string): Promise<void> {
  // Skip if already queued or in-flight
  if (syncQueue.includes(userId) || inFlightUsers.has(userId)) {
    console.log(`[OuraSyncScheduler] User ${userId} already in queue or syncing`);
    return;
  }
  syncQueue.unshift(userId); // Add to front of queue
  startQueueProcessing();
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean;
  queueLength: number;
  activeSyncs: number;
} {
  return {
    running: scheduledTask !== null,
    queueLength: syncQueue.length,
    activeSyncs,
  };
}
