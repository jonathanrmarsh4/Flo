/**
 * useHealthKitAutoPermission Hook
 * 
 * Automatically requests HealthKit permissions on app launch for iOS devices.
 * Only prompts once - stores result in localStorage to avoid repeated prompts.
 */

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { HealthKitService } from '@/services/healthkit';
import { logger } from '@/lib/logger';
import type { HealthDataType } from '@/types/healthkit';
import Readiness from '@/plugins/readiness';

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

        // Check if HealthKit is available
        const available = await HealthKitService.isAvailable();
        if (!available) {
          logger.info('HealthKit not available on this device');
          localStorage.setItem(HEALTHKIT_PERMISSION_KEY, 'true');
          setHasRequested(true);
          return;
        }

        // Define all 26 data types we want to read
        const allDataTypes: HealthDataType[] = [
          // Daily Readiness (6)
          'heartRateVariability',
          'restingHeartRate',
          'respiratoryRate',
          'oxygenSaturation',
          'sleepAnalysis',
          'bodyTemperature',
          
          // Body Composition (6)
          'weight',
          'height',
          'bmi',
          'bodyFatPercentage',
          'leanBodyMass',
          'waistCircumference',
          
          // Cardiometabolic (6)
          'heartRate',
          'bloodPressureSystolic',
          'bloodPressureDiastolic',
          'bloodGlucose',
          'vo2Max',
          'walkingHeartRateAverage',
          
          // Activity (7)
          'steps',
          'distance',
          'calories',
          'basalEnergyBurned',
          'flightsClimbed',
          'appleExerciseTime',
          'appleStandTime',
          
          // Additional
          'dietaryWater',
        ];

        // Remove duplicates
        const uniqueDataTypes = Array.from(new Set(allDataTypes));

        logger.info('Auto-requesting HealthKit permissions on app launch', {
          dataTypes: uniqueDataTypes.length,
        });

        // Request authorization (this shows the iOS native permission dialog)
        const result = await HealthKitService.requestAuthorization({
          read: uniqueDataTypes,
          write: [], // Only request read permissions
        });

        if (result) {
          logger.info('HealthKit permissions granted', {
            readAuthorized: result.readAuthorized?.length || 0,
          });
          
          // Trigger a re-sync after permissions are granted (to capture sleep data)
          logger.info('🔄 [AutoPermission] Re-syncing after permissions granted...');
          setTimeout(async () => {
            try {
              await Readiness.syncReadinessData({ days: 7 });
              logger.info('✅ [AutoPermission] Re-sync completed successfully');
            } catch (err) {
              logger.error('[AutoPermission] Re-sync failed', err);
            }
          }, 1000); // 1 second delay to ensure permissions are fully processed
        }

        // Mark as requested so we don't prompt again
        localStorage.setItem(HEALTHKIT_PERMISSION_KEY, 'true');
        setHasRequested(true);
      } catch (error) {
        logger.error('Error auto-requesting HealthKit permissions', error);
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
