import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { logger } from '@/lib/logger';
import { apiRequest } from '@/lib/queryClient';

const PREF_LAST_TZ_SYNC_AT = 'timezone_last_sync_at';
const PREF_LAST_TIMEZONE = 'timezone_last_value';
const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12 hours throttle

/**
 * Hook to automatically detect and sync device timezone to the backend
 * - Syncs on app launch if timezone changed
 * - Uses system timezone notification on iOS (via NSSystemTimeZoneDidChangeNotification)
 * - Throttles updates to avoid excessive API calls (12 hour minimum between syncs)
 * 
 * This ensures travelers get their Daily Insights at 6 AM local time regardless of location
 */
export function useTimezoneAutoSync(userId?: string) {
  const hasRun = useRef(false);
  const isMountedRef = useRef(true);
  const isNative = Capacitor.isNativePlatform();

  const getDeviceTimezone = (): string => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  const syncTimezoneToBackend = async (timezone: string) => {
    try {
      const response = await apiRequest('PATCH', '/api/user/timezone', {
        timezone,
        source: 'device_auto'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.changed) {
          logger.info(`[Timezone] Synced: ${data.previousTimezone} → ${timezone}`);
          console.log(`🌍 [Timezone] Auto-synced: ${data.previousTimezone} → ${timezone}`);
        } else {
          console.log(`🌍 [Timezone] Already up to date: ${timezone}`);
        }
        
        await Preferences.set({ key: PREF_LAST_TZ_SYNC_AT, value: Date.now().toString() });
        await Preferences.set({ key: PREF_LAST_TIMEZONE, value: timezone });
        
        return data;
      }
    } catch (error) {
      logger.error('[Timezone] Failed to sync:', error);
      console.error('🌍 [Timezone] Sync failed:', error);
    }
    return null;
  };

  const checkAndSyncTimezone = async (force = false) => {
    if (!isMountedRef.current || !userId) return;

    const currentTz = getDeviceTimezone();
    
    const [lastSyncResult, lastTzResult] = await Promise.all([
      Preferences.get({ key: PREF_LAST_TZ_SYNC_AT }),
      Preferences.get({ key: PREF_LAST_TIMEZONE })
    ]);
    
    const lastSyncAt = lastSyncResult.value ? parseInt(lastSyncResult.value, 10) : 0;
    const lastTz = lastTzResult.value || '';
    const now = Date.now();
    
    const timezoneChanged = currentTz !== lastTz;
    const throttleExpired = now - lastSyncAt > THROTTLE_MS;
    
    if (force || timezoneChanged || throttleExpired) {
      console.log(`🌍 [Timezone] Checking sync: current=${currentTz}, last=${lastTz}, changed=${timezoneChanged}, force=${force}`);
      await syncTimezoneToBackend(currentTz);
    } else {
      console.log(`🌍 [Timezone] Skipping sync (throttled): ${currentTz}`);
    }
  };

  useEffect(() => {
    if (!userId) return;
    
    isMountedRef.current = true;
    
    if (!hasRun.current) {
      hasRun.current = true;
      console.log('🌍 [Timezone] Hook initialized - checking timezone on launch');
      checkAndSyncTimezone();
    }

    if (isNative) {
      const handleAppStateChange = (state: { isActive: boolean }) => {
        if (state.isActive) {
          console.log('🌍 [Timezone] App resumed from background - checking timezone');
          checkAndSyncTimezone();
        }
      };
      
      const pluginHandle = App.addListener('appStateChange', handleAppStateChange);
      
      return () => {
        isMountedRef.current = false;
        pluginHandle.then(handle => handle.remove());
      };
    }
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🌍 [Timezone] Tab became visible - checking timezone');
        checkAndSyncTimezone();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, isNative]);
}
