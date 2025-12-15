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
import { syncOuraData, fetchDailySpO2 } from './ouraApiClient';
import { getHealthId, upsertSleepNight, upsertOuraSpo2 } from './supabaseHealthStorage';
import { syncSleepMetricsToClickHouse, syncOuraSpO2ToClickHouse } from './clickhouseHealthSync';
import { updateSyncStatus } from './integrationsService';

// Rate limiting: 5000 requests per 5 minutes = ~16 requests/second max
// Being conservative: 1 user sync = ~4 API calls (sleep, readiness, heart_rate, spo2)
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
 * Stores to Supabase sleep_nights and oura_daily_spo2 tables
 * Also syncs to ClickHouse for ML analysis
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
    const result = await syncOuraData(userId, healthId, 3);
    
    if (result.success) {
      for (const night of result.sleepNights) {
        try {
          // Store to Supabase sleep_nights table (for User Data dashboard)
          // Calculate percentages from durations
          const deepPct = night.totalSleepMin && night.deepSleepMin ? (night.deepSleepMin / night.totalSleepMin) * 100 : null;
          const remPct = night.totalSleepMin && night.remSleepMin ? (night.remSleepMin / night.totalSleepMin) * 100 : null;
          const corePct = night.totalSleepMin && night.coreSleepMin ? (night.coreSleepMin / night.totalSleepMin) * 100 : null;
          
          await upsertSleepNight(userId, {
            sleep_date: night.sleepDate,
            timezone: night.timezone,
            total_sleep_min: night.totalSleepMin,
            time_in_bed_min: night.timeInBedMin,
            sleep_latency_min: night.sleepLatencyMin,
            sleep_efficiency_pct: night.sleepEfficiencyPct,
            deep_sleep_min: night.deepSleepMin,
            rem_sleep_min: night.remSleepMin,
            core_sleep_min: night.coreSleepMin,
            waso_min: night.wasoMin,
            num_awakenings: night.numAwakenings,
            deep_pct: deepPct,
            rem_pct: remPct,
            core_pct: corePct,
            hrv_ms: night.hrvMs,
            resting_hr_bpm: night.restingHrBpm,
            respiratory_rate: night.respiratoryRate,
            wrist_temperature: night.skinTempDeviation,
            bedtime_local: night.nightStart?.toISOString() ?? null,
            waketime_local: night.finalWake?.toISOString() ?? null,
            source: 'oura',
            oura_session_id: night.ouraSessionId,
          });
          
          // Sync to ClickHouse for ML analysis
          await syncSleepMetricsToClickHouse(healthId, night, 'oura');
        } catch (err) {
          console.error(`[OuraSyncScheduler] Failed to store sleep night:`, err);
        }
      }
      
      console.log(`[OuraSyncScheduler] Synced ${result.sleepNights.length} nights for user ${userId}`);
      
      // Sync SpO2 data (Blood Oxygen) - available for Gen 3 Oura Ring
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 3);
        
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];
        
        const spo2Data = await fetchDailySpO2(userId, startStr, endStr);
        
        if (spo2Data && spo2Data.length > 0) {
          for (const spo2 of spo2Data) {
            // Store to Supabase oura_daily_spo2 table
            await upsertOuraSpo2(userId, {
              day: spo2.day,
              oura_id: spo2.id,
              spo2_average: spo2.spo2_percentage?.average ?? null,
              breathing_disturbance_index: spo2.breathing_disturbance_index ?? null,
            });
          }
          
          // Sync to ClickHouse for ML analysis
          await syncOuraSpO2ToClickHouse(healthId, spo2Data);
          
          console.log(`[OuraSyncScheduler] Synced ${spo2Data.length} SpO2 records for user ${userId}`);
        }
      } catch (spo2Error) {
        // SpO2 requires Gen 3 Oura Ring - log but don't fail the entire sync
        console.warn(`[OuraSyncScheduler] SpO2 sync skipped for user ${userId}:`, spo2Error);
      }
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
