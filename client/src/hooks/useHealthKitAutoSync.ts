import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import Readiness from '@/plugins/readiness';
import WebViewCache from '@/plugins/webviewCache';
import { logger } from '@/lib/logger';
import { sendNotification } from '@/lib/notifications';
import { queryClient } from '@/lib/queryClient';

// Preferences keys for persistent storage
const PREF_LAST_BACKGROUND_AT = 'healthkit_last_background_at';
const PREF_LAST_SYNC_AT = 'healthkit_last_sync_at';

/**
 * Hook to automatically sync HealthKit data when the app launches
 * and periodically while the app is open
 * - Initial sync: Runs once per app session on launch
 * - App state change sync: Runs when app resumes from background (uses Capacitor App lifecycle)
 * - Periodic sync: Runs every 15 minutes while app is active
 * - Visibility API sync: Fallback for web-based resume detection
 * 
 * Uses Capacitor Preferences to persist sync state across app terminations
 */
export function useHealthKitAutoSync() {
  const hasRun = useRef(false);
  const periodicIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const lastResumeSync = useRef(0); // Shared timestamp to prevent duplicate resume syncs
  const isNative = Capacitor.isNativePlatform();

  // Helper to check if query key matches health-related paths
  const isHealthQuery = (query: any): boolean => {
    const queryKey = query.queryKey;
    
    // Check if any segment in the query key array matches our health paths
    if (Array.isArray(queryKey)) {
      return queryKey.some(key => {
        if (typeof key !== 'string') return false;
        return (
          key.startsWith('/api/dashboard') ||
          key.startsWith('/api/flomentum') ||
          key.startsWith('/api/biological-age') ||
          key.startsWith('/api/sleep') ||
          key.startsWith('/api/readiness') ||
          key.startsWith('/api/labs') ||
          key.startsWith('/api/healthkit')
        );
      });
    }
    
    // Handle string keys
    if (typeof queryKey === 'string') {
      return (
        queryKey.startsWith('/api/dashboard') ||
        queryKey.startsWith('/api/flomentum') ||
        queryKey.startsWith('/api/biological-age') ||
        queryKey.startsWith('/api/sleep') ||
        queryKey.startsWith('/api/readiness') ||
        queryKey.startsWith('/api/labs') ||
        queryKey.startsWith('/api/healthkit')
      );
    }
    
    return false;
  };

  // Shared sync function used by all effects
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
        
        // Persist sync time to storage
        await Preferences.set({ 
          key: PREF_LAST_SYNC_AT, 
          value: Date.now().toString() 
        });
        
        // Wait for backend upload to complete before invalidating cache
        // The Swift plugin returns immediately but uploads data asynchronously
        console.log('⏳ [AutoSync] Waiting 4s for backend upload to complete...');
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        // Explicitly refetch critical dashboard queries
        // Don't await invalidateQueries - it can hang on network issues in iOS sandbox
        console.log('🔄 [AutoSync] Refetching dashboard queries...');
        try {
          // Fire-and-forget invalidation
          // CRITICAL: Use refetchType: 'all' to refetch even inactive queries
          // iOS webview suspension causes query observers to become inactive overnight
          queryClient.invalidateQueries({ 
            predicate: isHealthQuery,
            refetchType: 'all'
          });
          
          // Explicitly refetch the most important queries
          // NOTE: Query keys must match EXACTLY what's used in components
          // CRITICAL: Use type: 'all' to force refetch even when queries are inactive
          await Promise.allSettled([
            queryClient.refetchQueries({ queryKey: ['/api/dashboard/overview'], type: 'all' }),
            queryClient.refetchQueries({ queryKey: ['/api/biological-age'], type: 'all' }),
            queryClient.refetchQueries({ queryKey: ['/api/sleep/today'], type: 'all' }),
            queryClient.refetchQueries({ queryKey: ['/api/readiness/today'], type: 'all' }),
            queryClient.refetchQueries({ queryKey: ['/api/flomentum/today'], type: 'all' }),
            queryClient.refetchQueries({ queryKey: ['/api/flomentum/weekly'], type: 'all' }),
          ]);
          console.log('✅ [AutoSync] Dashboard refresh completed!');
          logger.info('✅ Dashboard queries refetched - UI updated');
        } catch (err) {
          console.error('❌ [AutoSync] Dashboard refresh FAILED:', err);
          logger.error('Failed to refetch dashboard', err);
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
          
          // Wait for backend upload to complete
          logger.info('⏳ [AutoSync] Waiting 4s for sleep data upload...');
          await new Promise(resolve => setTimeout(resolve, 4000));
        } catch (err) {
          logger.debug('Auth-aware sync failed - likely no new data');
        } finally {
          // Refetch sleep and dashboard queries
          if (isMountedRef.current) {
            try {
              // Fire-and-forget invalidation
              // CRITICAL: Use refetchType: 'all' to refetch even inactive queries
              // iOS webview suspension causes query observers to become inactive overnight
              queryClient.invalidateQueries({ 
                predicate: isHealthQuery,
                refetchType: 'all'
              });
              
              // Explicitly refetch sleep and readiness queries
              // CRITICAL: Use type: 'all' to force refetch even when queries are inactive
              await Promise.allSettled([
                queryClient.refetchQueries({ queryKey: ['/api/sleep/today'], type: 'all' }),
                queryClient.refetchQueries({ queryKey: ['/api/readiness/today'], type: 'all' }),
                queryClient.refetchQueries({ queryKey: ['/api/dashboard/overview'], type: 'all' }),
              ]);
              logger.info('✅ Sleep and readiness data refetched - UI updated');
            } catch (err) {
              logger.error('Failed to refetch sleep data', err);
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

  // FIRST useEffect: Initial sync logic with persistent storage check
  useEffect(() => {
    // Only run on native platforms
    if (!isNative) {
      return;
    }
    
    // Check if we need to force sync based on persistent storage
    (async () => {
      try {
        const { value: lastBackgroundAtStr } = await Preferences.get({ key: PREF_LAST_BACKGROUND_AT });
        const { value: lastSyncAtStr } = await Preferences.get({ key: PREF_LAST_SYNC_AT });
        
        if (lastBackgroundAtStr) {
          const lastBackgroundAt = parseInt(lastBackgroundAtStr, 10);
          const timeSinceBackground = Date.now() - lastBackgroundAt;
          const fiveMinutes = 5 * 60 * 1000;
          
          if (timeSinceBackground > fiveMinutes) {
            logger.info(`🌅 [AutoSync] App was backgrounded for ${Math.round(timeSinceBackground / 60000)}min - forcing sync on mount`);
            hasRun.current = false; // Force sync to run
          }
        }
        
        // Also check if it's been a long time since last sync (e.g., >12 hours)
        if (lastSyncAtStr) {
          const lastSyncAt = parseInt(lastSyncAtStr, 10);
          const timeSinceSync = Date.now() - lastSyncAt;
          const twelveHours = 12 * 60 * 60 * 1000;
          
          if (timeSinceSync > twelveHours) {
            logger.info(`⏰ [AutoSync] Last sync was ${Math.round(timeSinceSync / 3600000)}hrs ago - forcing sync on mount`);
            hasRun.current = false; // Force sync to run
          }
        }
      } catch (err) {
        logger.error('Failed to check persistent sync state', err);
      }
      
      // Initial sync logic - run once per mount OR if forced by persistent storage check
      const shouldRunInitialSync = !hasRun.current;
      
      if (!shouldRunInitialSync) {
        logger.debug('[AutoSync] Skipping initial sync - already ran');
        return;
      }

      // Mark as run before executing to prevent duplicate calls
      hasRun.current = true;

      // PERFORMANCE FIX: Reduce delay to 500ms for faster sync after first paint
      setTimeout(() => syncHealthData(true), 500);

      // Setup periodic sync every 15 minutes (900000ms)
      periodicIntervalRef.current = setInterval(() => {
        syncHealthData(false, false); // Periodic sync, no notification
      }, 15 * 60 * 1000); // 15 minutes
    })();

    // Cleanup interval on unmount
    return () => {
      isMountedRef.current = false;
      if (periodicIntervalRef.current) {
        clearInterval(periodicIntervalRef.current);
        periodicIntervalRef.current = null;
      }
    };
  }, [isNative]);

  // SECOND useEffect: Page Visibility API fallback (works on both web and native)
  useEffect(() => {
    logger.info('🎯 [AutoSync] Setting up page visibility listener...');
    
    // Use Page Visibility API which works on both web and native
    const handleVisibilityChange = async () => {
      // App went to background
      if (document.hidden) {
        logger.debug('[Visibility] App went to background');
        // Persist background timestamp to storage (native only)
        if (isNative) {
          try {
            await Preferences.set({ 
              key: PREF_LAST_BACKGROUND_AT, 
              value: Date.now().toString() 
            });
            logger.info('[Visibility] Background timestamp persisted');
          } catch (err) {
            logger.error('[Visibility] Failed to persist background timestamp', err);
          }
        }
        return;
      }
      
      // App came to foreground
      logger.info('[Visibility] App came to foreground via visibility API');
      
      // Shared debouncing: prevent duplicate syncs if App lifecycle already synced recently
      const timeSinceLastResumeSync = Date.now() - lastResumeSync.current;
      const minimumResumeSyncInterval = 30 * 1000; // 30 second cooldown between resume syncs
      
      if (timeSinceLastResumeSync < minimumResumeSyncInterval) {
        logger.debug(`[Visibility] Skipping sync - App lifecycle already synced ${Math.round(timeSinceLastResumeSync / 1000)}s ago`);
        return;
      }
      
      // Check if we need to force sync after long background (native only)
      let shouldForceSync = false;
      if (isNative) {
        try {
          const { value: lastBackgroundAtStr } = await Preferences.get({ key: PREF_LAST_BACKGROUND_AT });
          
          if (lastBackgroundAtStr) {
            const lastBackgroundAt = parseInt(lastBackgroundAtStr, 10);
            const timeSinceBackground = Date.now() - lastBackgroundAt;
            const fiveMinutes = 5 * 60 * 1000;
            
            if (timeSinceBackground > fiveMinutes) {
              logger.info(`🌅 [Visibility] App woke after ${Math.round(timeSinceBackground / 60000)}min - forcing webview reload`);
              shouldForceSync = true;
            }
          }
        } catch (err) {
          logger.error('[Visibility] Failed to check background timestamp', err);
        }
      }
      
      // Reload webview if app was backgrounded for >5 minutes (iOS only)
      if (shouldForceSync && isNative) {
        logger.info('[Visibility] 🔄 Clearing WKWebView cache and reloading...');
        
        let cacheCleared = false;
        try {
          // CRITICAL FIX: Clear iOS WKWebView HTTP cache before reload
          // This prevents stale cached API responses from being served after overnight sleep
          await WebViewCache.clearCache();
          logger.info('[Visibility] ✅ WKWebView cache cleared successfully');
          cacheCleared = true;
        } catch (err) {
          logger.error('[Visibility] ❌ Failed to clear cache via clearCache()', err);
          
          // FALLBACK: Try reloadFromOrigin() which bypasses cache at native level
          try {
            logger.info('[Visibility] 🔄 Attempting fallback: reloadFromOrigin()...');
            await WebViewCache.reloadFromOrigin();
            logger.info('[Visibility] ✅ Successfully triggered reloadFromOrigin()');
            return; // reloadFromOrigin() already reloads, no need for window.location.reload()
          } catch (fallbackErr) {
            logger.error('[Visibility] ❌ CRITICAL: Both clearCache() and reloadFromOrigin() failed', fallbackErr);
            // Still attempt regular reload as last resort, but log critical error
            logger.error('[Visibility] ⚠️ Proceeding with standard reload despite cache clearing failure - stale data may persist');
          }
        }
        
        // Standard reload (only if we successfully cleared cache OR fallback failed)
        if (cacheCleared) {
          logger.info('[Visibility] 🔄 Reloading with fresh cache...');
          window.location.reload();
        } else {
          // Already tried reloadFromOrigin which failed, try standard reload as absolute last resort
          window.location.reload();
        }
        return; // Reload will trigger initial sync via first useEffect
      }
      
      // Web fallback: sync on foreground
      if (!isNative) {
        logger.info('🚀 [Visibility] Web platform - syncing on foreground...');
        lastResumeSync.current = Date.now();
        
        try {
          const syncResult = await Readiness.syncReadinessData({ days: 7 });
          if (syncResult.success) {
            logger.info('[Visibility] Web sync completed');
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Use refetchType: 'all' for consistency with native platform behavior
            queryClient.invalidateQueries({ 
              predicate: isHealthQuery,
              refetchType: 'all'
            });
          }
        } catch (error) {
          logger.debug('[Visibility] Web sync failed');
        }
      }
    };
    
    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup listener on unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isNative]);

  // THIRD useEffect: Capacitor App lifecycle listener (primary detection for iOS)
  useEffect(() => {
    if (!isNative) {
      return;
    }

    logger.info('🎯 [AutoSync] Setting up Capacitor App lifecycle listener...');
    
    let listenerHandle: any = null;
    
    // Setup listener asynchronously
    (async () => {
      listenerHandle = await App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          // App resumed from background
          logger.info('🚀 [App] App became active - checking if sync needed...');
          
          // Shared debouncing: prevent duplicate syncs if visibility API already synced recently
          const timeSinceLastResumeSync = Date.now() - lastResumeSync.current;
          const minimumResumeSyncInterval = 30 * 1000; // 30 second cooldown
          
          if (timeSinceLastResumeSync < minimumResumeSyncInterval) {
            logger.debug(`[App] Skipping sync - visibility API already synced ${Math.round(timeSinceLastResumeSync / 1000)}s ago`);
            return;
          }
          
          try {
            const { value: lastBackgroundAtStr } = await Preferences.get({ key: PREF_LAST_BACKGROUND_AT });
            
            if (lastBackgroundAtStr) {
              const lastBackgroundAt = parseInt(lastBackgroundAtStr, 10);
              const timeSinceBackground = Date.now() - lastBackgroundAt;
              const fiveMinutes = 5 * 60 * 1000;
              
              if (timeSinceBackground > fiveMinutes) {
                logger.info(`🌅 [App] App was backgrounded for ${Math.round(timeSinceBackground / 60000)}min - forcing webview reload + sync`);
                
                // CRITICAL FIX: Clear iOS WKWebView HTTP cache before reload
                // This prevents stale cached API responses from being served after overnight sleep
                logger.info('[App] 🔄 Clearing WKWebView cache and reloading...');
                
                let cacheCleared = false;
                try {
                  await WebViewCache.clearCache();
                  logger.info('[App] ✅ WKWebView cache cleared successfully');
                  cacheCleared = true;
                } catch (err) {
                  logger.error('[App] ❌ Failed to clear cache via clearCache()', err);
                  
                  // FALLBACK: Try reloadFromOrigin() which bypasses cache at native level
                  try {
                    logger.info('[App] 🔄 Attempting fallback: reloadFromOrigin()...');
                    await WebViewCache.reloadFromOrigin();
                    logger.info('[App] ✅ Successfully triggered reloadFromOrigin()');
                    return; // reloadFromOrigin() already reloads, no need for window.location.reload()
                  } catch (fallbackErr) {
                    logger.error('[App] ❌ CRITICAL: Both clearCache() and reloadFromOrigin() failed', fallbackErr);
                    // Still attempt regular reload as last resort, but log critical error
                    logger.error('[App] ⚠️ Proceeding with standard reload despite cache clearing failure - stale data may persist');
                  }
                }
                
                // Standard reload (only if we successfully cleared cache OR fallback failed)
                // iOS suspends WKWebView overnight, freezing React Query observers
                // Reload ensures hooks remount and refetch actually executes
                if (cacheCleared) {
                  logger.info('[App] 🔄 Reloading with fresh cache...');
                  window.location.reload();
                } else {
                  // Already tried reloadFromOrigin which failed, try standard reload as absolute last resort
                  window.location.reload();
                }
                
                // Note: Code below won't execute due to reload, but keeping for reference
                // After reload, the initial sync in first useEffect will trigger
                lastResumeSync.current = Date.now();
              } else {
                logger.debug(`[App] App was backgrounded for ${Math.round(timeSinceBackground / 1000)}s - no sync needed`);
              }
            } else {
              logger.debug('[App] No background timestamp found - first launch or fresh state');
            }
          } catch (err) {
            logger.error('[App] Failed to check background state', err);
          }
        } else {
          // App went to background - persist timestamp
          logger.info('⏸️ [App] App went to background - persisting timestamp...');
          
          try {
            await Preferences.set({ 
              key: PREF_LAST_BACKGROUND_AT, 
              value: Date.now().toString() 
            });
            logger.info('[App] Background timestamp persisted successfully');
          } catch (err) {
            logger.error('[App] Failed to persist background timestamp', err);
          }
        }
      });
    })();
    
    // Cleanup listener on unmount
    return () => {
      if (listenerHandle) {
        logger.info('[AutoSync] Removing Capacitor App lifecycle listener');
        listenerHandle.remove();
      }
    };
  }, [isNative]);
}
