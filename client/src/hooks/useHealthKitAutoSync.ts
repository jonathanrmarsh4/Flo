import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import Readiness from '@/plugins/readiness';
import { logger } from '@/lib/logger';

/**
 * Hook to automatically sync HealthKit data when the app launches
 * Runs once per app session for authenticated users on native platforms
 */
export function useHealthKitAutoSync() {
  const hasRun = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    // Only run on native platforms
    if (!isNative) {
      return;
    }

    // Only run once per app session
    if (hasRun.current) {
      return;
    }

    const syncHealthData = async () => {
      try {
        console.log('🚀 [AutoSync] App launched - triggering automatic HealthKit background sync...');
        logger.info('App launched - triggering automatic HealthKit background sync...');
        
        // Sync last 7 days to ensure we don't miss data if user hasn't opened app
        const syncResult = await Readiness.syncReadinessData({ days: 7 });
        console.log('🚀 [AutoSync] Sync result:', syncResult);
        
        if (syncResult.success) {
          logger.info('Background HealthKit sync completed successfully on app launch', {
            days: syncResult.days,
          });
        }
        
        // SLEEP DATA FIX: Do a second sync after 2s to catch sleep data
        // (First sync might run before HealthKit permissions are fully initialized)
        setTimeout(async () => {
          try {
            logger.info('🔄 [AutoSync] Running delayed sync to capture sleep data...');
            await Readiness.syncReadinessData({ days: 7 });
            logger.info('✅ [AutoSync] Delayed sync completed');
          } catch (err) {
            logger.debug('Delayed sync failed - likely no new data');
          }
        }, 2000);
      } catch (error) {
        // Silently fail - don't block app launch or show errors
        // User might not have granted permissions yet
        logger.debug('Background HealthKit sync skipped or failed');
      }
    };

    // Mark as run before executing to prevent duplicate calls
    hasRun.current = true;

    // PERFORMANCE FIX: Reduce delay to 500ms for faster sync after first paint
    setTimeout(syncHealthData, 500);
  }, [isNative]);
}
