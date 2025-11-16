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
        logger.info('App launched - triggering automatic HealthKit background sync...');
        
        // Trigger background sync (non-blocking)
        const syncResult = await Readiness.syncReadinessData({ days: 7 });
        
        if (syncResult.success) {
          logger.info('Background HealthKit sync completed successfully on app launch', {
            days: syncResult.days,
          });
        }
      } catch (error) {
        // Silently fail - don't block app launch or show errors
        // User might not have granted permissions yet
        logger.debug('Background HealthKit sync skipped or failed');
      }
    };

    // Mark as run before executing to prevent duplicate calls
    hasRun.current = true;

    // Run sync after a small delay to not block initial app render
    setTimeout(syncHealthData, 2000);
  }, [isNative]);
}
