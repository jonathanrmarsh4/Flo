/**
 * CGM Sync Scheduler
 * 
 * Periodically syncs glucose data from connected CGM devices (Dexcom).
 * Runs every 5 minutes to fetch new EGV readings for all connected users.
 */

import * as cron from 'node-cron';
import { getSupabaseClient } from './supabaseClient';
import { getUserIdFromHealthId } from './supabaseHealthStorage';
import { dexcomService } from './dexcomService';
import { logger } from '../utils/logger';

const supabase = getSupabaseClient();

interface SyncResult {
  healthId: string;
  success: boolean;
  recordsCount: number;
  error?: string;
}

async function syncAllConnectedUsers(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  
  try {
    const { data: connections, error } = await supabase
      .from('cgm_connections')
      .select('health_id, provider, sync_status')
      .eq('provider', 'dexcom')
      .in('sync_status', ['active', 'error']);

    if (error) {
      logger.error('[CGMSync] Failed to fetch connections:', error);
      return results;
    }

    if (!connections || connections.length === 0) {
      logger.debug('[CGMSync] No active Dexcom connections to sync');
      return results;
    }

    logger.info(`[CGMSync] Starting sync for ${connections.length} connections`);

    for (const connection of connections) {
      try {
        const userId = await getUserIdFromHealthId(connection.health_id);
        
        if (!userId) {
          logger.warn(`[CGMSync] No user found for health_id ${connection.health_id}`);
          results.push({
            healthId: connection.health_id,
            success: false,
            recordsCount: 0,
            error: 'User not found',
          });
          continue;
        }

        const result = await dexcomService.syncUserData(userId);
        
        results.push({
          healthId: connection.health_id,
          success: result.success,
          recordsCount: result.recordsCount,
        });

        if (result.recordsCount > 0) {
          logger.info(`[CGMSync] Synced ${result.recordsCount} readings for health_id ${connection.health_id}`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        logger.error(`[CGMSync] Error syncing health_id ${connection.health_id}:`, error);
        results.push({
          healthId: connection.health_id,
          success: false,
          recordsCount: 0,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalRecords = results.reduce((sum, r) => sum + r.recordsCount, 0);
    
    logger.info(`[CGMSync] Sync complete: ${successCount}/${results.length} successful, ${totalRecords} total readings`);
    
  } catch (error) {
    logger.error('[CGMSync] Scheduler error:', error);
  }

  return results;
}

let isInitialized = false;

export function startCGMSyncScheduler(): void {
  if (isInitialized) {
    logger.warn('[CGMSync] Scheduler already initialized');
    return;
  }

  cron.schedule('*/5 * * * *', async () => {
    logger.debug('[CGMSync] Running scheduled sync');
    await syncAllConnectedUsers();
  });

  isInitialized = true;
  logger.info('[CGMSync] CGM sync scheduler initialized (runs every 5 minutes)');

  setTimeout(async () => {
    logger.info('[CGMSync] Running initial sync check');
    await syncAllConnectedUsers();
  }, 30000);
}

export async function manualSync(userId: string): Promise<{ success: boolean; recordsCount: number }> {
  return dexcomService.syncUserData(userId);
}

export async function getSyncStatus(): Promise<{
  totalConnections: number;
  activeConnections: number;
  errorConnections: number;
  lastSyncStats: SyncResult[];
}> {
  const { data: connections, error } = await supabase
    .from('cgm_connections')
    .select('health_id, sync_status, last_sync_at, error_message')
    .eq('provider', 'dexcom');

  if (error || !connections) {
    return {
      totalConnections: 0,
      activeConnections: 0,
      errorConnections: 0,
      lastSyncStats: [],
    };
  }

  return {
    totalConnections: connections.length,
    activeConnections: connections.filter(c => c.sync_status === 'active').length,
    errorConnections: connections.filter(c => c.sync_status === 'error').length,
    lastSyncStats: connections.map(c => ({
      healthId: c.health_id,
      success: c.sync_status === 'active',
      recordsCount: 0,
      error: c.error_message || undefined,
    })),
  };
}
