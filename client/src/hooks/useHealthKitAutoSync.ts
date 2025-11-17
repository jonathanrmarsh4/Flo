import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import Readiness from '@/plugins/readiness';
import { logger } from '@/lib/logger';
import { sendNotification } from '@/lib/notifications';
import { queryClient } from '@/lib/queryClient';

/**
 * Hook to automatically sync HealthKit data when the app launches
 * and periodically while the app is open
 * - Initial sync: Runs once per app session on launch
 * - Periodic sync: Runs every 15 minutes while app is active
 */
export function useHealthKitAutoSync() {
  const hasRun = useRef(false);
  const periodicIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    // Only run on native platforms and only once per session
    if (!isNative || hasRun.current) {
      return;
    }

    // Helper to check if query key matches health-related paths
    const isHealthQuery = (query: any): boolean => {
      const queryKey = query.queryKey;
      // Handle both string keys and array keys
      const keyStr = typeof queryKey === 'string' 
        ? queryKey 
        : (Array.isArray(queryKey) && typeof queryKey[0] === 'string')
          ? queryKey[0]
          : '';
      
      return (
        keyStr.startsWith('/api/dashboard') ||
        keyStr.startsWith('/api/flomentum') ||
        keyStr.startsWith('/api/biological-age') ||
        keyStr.startsWith('/api/sleep') ||
        keyStr.startsWith('/api/labs')
      );
    };

    const syncHealthData = async (isInitialSync = false, showNotification = true) => {
      try {
        if (isInitialSync) {
          console.log('🚀 [AutoSync] App launched - triggering initial HealthKit sync...');
          logger.info('App launched - triggering initial HealthKit sync...');
        } else {
          console.log('🔄 [AutoSync] Periodic sync - updating HealthKit data...');
          logger.info('Periodic HealthKit sync triggered');
        }
        
        // Sync last 7 days to ensure we don't miss data if user hasn't opened app
        const syncResult = await Readiness.syncReadinessData({ days: 7 });
        console.log('🚀 [AutoSync] Sync result:', syncResult);
        
        if (syncResult.success) {
          console.log('✅ [AutoSync] Sync success block entered');
          logger.info(`HealthKit sync completed successfully (${isInitialSync ? 'initial' : 'periodic'})`, {
            days: syncResult.days,
          });
          
          // Invalidate all health-related queries to refresh UI with new data
          console.log('🔄 [AutoSync] About to invalidate cache...');
          try {
            console.log('🔄 [AutoSync] Calling queryClient.invalidateQueries...');
            await queryClient.invalidateQueries({ predicate: isHealthQuery });
            console.log('✅ [AutoSync] Cache invalidation completed!');
            logger.info('✅ Cache invalidated - UI will refresh with new health data');
          } catch (err) {
            console.error('❌ [AutoSync] Cache invalidation FAILED:', err);
            logger.error('Failed to invalidate cache', err);
          }
          
          // Only notify on initial sync, not periodic syncs (to avoid notification spam)
          if (isInitialSync && showNotification) {
            sendNotification(
              'Health data synced ✓',
              'Your latest HealthKit metrics are ready'
            );
          }
        }
        
        // SLEEP DATA FIX: Do a second sync with waitForAuth=true to capture sleep data
        // This waits for HealthKit permissions to be fully initialized before syncing
        setTimeout(async () => {
          // Guard against unmounted component
          if (!isMountedRef.current) {
            logger.debug('Component unmounted, skipping delayed sync');
            return;
          }

          try {
            logger.info('🔄 [AutoSync] Running auth-aware sync to capture sleep data...');
            await Readiness.syncReadinessData({ days: 7, waitForAuth: true });
            logger.info('✅ [AutoSync] Auth-aware sync completed');
          } catch (err) {
            logger.debug('Auth-aware sync failed - likely no new data');
          } finally {
            // Invalidate cache even if sync fails to ensure UI shows any partial data
            if (isMountedRef.current) {
              try {
                await queryClient.invalidateQueries({ predicate: isHealthQuery });
                logger.info('✅ Cache invalidated after sleep sync - sleep data refreshed');
              } catch (err) {
                logger.error('Failed to invalidate cache after sleep sync', err);
              }
            }
          }
        }, 2000);
      } catch (error) {
        // Silently fail - don't block app launch or show errors
        // User might not have granted permissions yet
        logger.debug('HealthKit sync skipped or failed');
      }
    };

    // Mark as run before executing to prevent duplicate calls
    hasRun.current = true;

    // PERFORMANCE FIX: Reduce delay to 500ms for faster sync after first paint
    setTimeout(() => syncHealthData(true), 500);

    // Setup periodic sync every 15 minutes (900000ms)
    periodicIntervalRef.current = setInterval(() => {
      syncHealthData(false, false); // Periodic sync, no notification
    }, 15 * 60 * 1000); // 15 minutes

    // Cleanup interval on unmount
    return () => {
      isMountedRef.current = false;
      if (periodicIntervalRef.current) {
        clearInterval(periodicIntervalRef.current);
        periodicIntervalRef.current = null;
      }
    };
  }, [isNative]);
}
