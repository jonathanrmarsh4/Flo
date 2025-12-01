/**
 * useHealthKitAutoPermission Hook
 * 
 * Automatically requests HealthKit permissions on app launch for iOS devices.
 * Only prompts once - stores result in localStorage to avoid repeated prompts.
 * 
 * Uses HealthSyncPlugin.requestAuthorization() instead of @healthpilot/healthkit
 * because the framework has a bug where authorization can hang indefinitely.
 */

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { logger } from '@/lib/logger';
import Readiness from '@/plugins/readiness';
import { HealthSyncPlugin } from '@/plugins/healthSync';

const HEALTHKIT_PERMISSION_KEY = 'healthkit_permission_requested';

export function useHealthKitAutoPermission() {
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  useEffect(() => {
    const requestHealthKitPermissions = async () => {
      // Only run on iOS native platform
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      // Check if we've already requested permissions
      const alreadyRequested = localStorage.getItem(HEALTHKIT_PERMISSION_KEY);
      if (alreadyRequested === 'true') {
        setHasRequested(true);
        return;
      }

      try {
        setIsRequesting(true);

        logger.info('🔐 [AutoPermission] Auto-requesting HealthKit permissions on app launch');

        // Use HealthSyncPlugin for authorization - it requests all 74+ types
        // and doesn't hang like the @healthpilot/healthkit framework
        const result = await HealthSyncPlugin.requestAuthorization();

        if (result && result.success) {
          logger.info('✅ [AutoPermission] HealthKit permissions granted', {
            readAuthorized: result.readAuthorized?.length || 0,
          });
          
          // Trigger a re-sync after permissions are granted (to capture sleep data)
          logger.info('🔄 [AutoPermission] Re-syncing after permissions granted...');
          setTimeout(async () => {
            try {
              await Readiness.syncReadinessData({ days: 7, waitForAuth: true });
              logger.info('✅ [AutoPermission] Re-sync completed successfully');
            } catch (err) {
              logger.error('[AutoPermission] Re-sync failed', err);
            }
          }, 1000); // 1 second delay to ensure permissions are fully processed
        } else {
          logger.info('⚠️ [AutoPermission] HealthKit permissions result', {
            success: result?.success,
            readAuthorized: result?.readAuthorized?.length || 0,
          });
        }

        // Mark as requested so we don't prompt again
        localStorage.setItem(HEALTHKIT_PERMISSION_KEY, 'true');
        setHasRequested(true);
      } catch (error) {
        logger.error('❌ [AutoPermission] Error auto-requesting HealthKit permissions', error);
        // Still mark as requested to avoid repeated errors
        localStorage.setItem(HEALTHKIT_PERMISSION_KEY, 'true');
        setHasRequested(true);
      } finally {
        setIsRequesting(false);
      }
    };

    requestHealthKitPermissions();
  }, []);

  return { isRequesting, hasRequested };
}
