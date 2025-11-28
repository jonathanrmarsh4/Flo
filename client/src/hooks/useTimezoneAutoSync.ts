import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { logger } from '@/lib/logger';
import { apiRequest } from '@/lib/queryClient';

const PREF_LAST_TZ_SYNC_AT = 'timezone_last_sync_at';
const PREF_LAST_TIMEZONE = 'timezone_last_value';
const THROTTLE_MS = 1 * 60 * 60 * 1000; // 1 hour throttle - short for travelers

/**
 * Hook to automatically detect and sync device timezone to the backend
 * - Syncs on app launch if timezone changed (compares to both local cache AND backend)
 * - Uses Capacitor App lifecycle events to detect timezone changes on resume
 * - Throttles updates to 1 hour to accommodate rapid travel
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

  const fetchBackendTimezone = async (): Promise<string | null> => {
    try {
      const response = await apiRequest('GET', '/api/user/timezone');
      if (response.ok) {
        const data = await response.json();
        return data.timezone;
      }
    } catch (error) {
      console.log('🌍 [Timezone] Could not fetch backend timezone:', error);
    }
    return null;
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

  const checkAndSyncTimezone = async (force = false, isInitialSync = false) => {
    if (!isMountedRef.current || !userId) return;

    const currentTz = getDeviceTimezone();
    
    const [lastSyncResult, lastTzResult] = await Promise.all([
      Preferences.get({ key: PREF_LAST_TZ_SYNC_AT }),
      Preferences.get({ key: PREF_LAST_TIMEZONE })
    ]);
    
    const lastSyncAt = lastSyncResult.value ? parseInt(lastSyncResult.value, 10) : 0;
    const cachedTz = lastTzResult.value || '';
    const now = Date.now();
    
    const cacheTimezoneChanged = currentTz !== cachedTz;
    const throttleExpired = now - lastSyncAt > THROTTLE_MS;
    
    // On initial sync, also verify against backend to handle cache clears
    if (isInitialSync && !cacheTimezoneChanged) {
      const backendTz = await fetchBackendTimezone();
      if (backendTz && backendTz !== currentTz) {
        console.log(`🌍 [Timezone] Backend mismatch detected: backend=${backendTz}, device=${currentTz}`);
        await syncTimezoneToBackend(currentTz);
        return;
      }
    }
    
    if (force || cacheTimezoneChanged || throttleExpired) {
      console.log(`🌍 [Timezone] Syncing: current=${currentTz}, cached=${cachedTz}, changed=${cacheTimezoneChanged}, throttleExpired=${throttleExpired}`);
      await syncTimezoneToBackend(currentTz);
    } else {
      console.log(`🌍 [Timezone] Skipping sync (no change, within throttle): ${currentTz}`);
    }
  };

  useEffect(() => {
    if (!userId) return;
    
    isMountedRef.current = true;
    
    if (!hasRun.current) {
      hasRun.current = true;
      // PERFORMANCE FIX: Defer timezone check to avoid competing with first navigation
      // Timezone sync is not critical for immediate UI rendering
      const scheduleCheck = (callback: () => void) => {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(callback, { timeout: 5000 });
        } else {
          setTimeout(callback, 3000);
        }
      };
      
      scheduleCheck(() => {
        if (isMountedRef.current) {
          console.log('🌍 [Timezone] Hook initialized - checking timezone on launch');
          checkAndSyncTimezone(false, true); // isInitialSync = true to verify against backend
        }
      });
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
