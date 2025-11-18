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
 * - App foreground sync: Runs when app comes back to foreground
 * - Periodic sync: Runs every 15 minutes while app is active
 */
export function useHealthKitAutoSync() {
  const hasRun = useRef(false);
  const periodicIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    // Only run on native platforms
    if (!isNative) {
      return;
    }
    
    // Initial sync logic - run once per mount
    const shouldRunInitialSync = !hasRun.current;
    
    if (!shouldRunInitialSync) {
      return;
    }

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
          queryKey.startsWith('/api/labs') ||
          queryKey.startsWith('/api/healthkit')
        );
      }
      
      return false;
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
          
          // Wait for backend upload to complete before invalidating cache
          // The Swift plugin returns immediately but uploads data asynchronously
          console.log('⏳ [AutoSync] Waiting 4s for backend upload to complete...');
          await new Promise(resolve => setTimeout(resolve, 4000));
          
          // Explicitly refetch critical dashboard queries
          // Don't await invalidateQueries - it can hang on network issues in iOS sandbox
          console.log('🔄 [AutoSync] Refetching dashboard queries...');
          try {
            // Fire-and-forget invalidation
            queryClient.invalidateQueries({ 
              predicate: isHealthQuery,
              refetchType: 'active'
            });
            
            // Explicitly refetch the most important queries
            await Promise.allSettled([
              queryClient.refetchQueries({ queryKey: ['/api/dashboard', 'overview'] }),
              queryClient.refetchQueries({ queryKey: ['/api/dashboard', 'biomarkers'] }),
              queryClient.refetchQueries({ queryKey: ['/api/flomentum', 'daily'] }),
              queryClient.refetchQueries({ queryKey: ['/api/biological-age'] }),
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
                queryClient.invalidateQueries({ 
                  predicate: isHealthQuery,
                  refetchType: 'active'
                });
                
                // Explicitly refetch sleep-related queries
                await Promise.allSettled([
                  queryClient.refetchQueries({ queryKey: ['/api/sleep'] }),
                  queryClient.refetchQueries({ queryKey: ['/api/dashboard', 'overview'] }),
                ]);
                logger.info('✅ Sleep data refetched - UI updated');
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

  // Separate effect for app foreground/visibility listener (always active)
  useEffect(() => {
    if (!isNative) {
      return;
    }

    logger.info('🎯 [AutoSync] Setting up app visibility listener...');
    
    // Track when app was last synced to avoid duplicate syncs
    let lastSyncTime = Date.now();
    
    // Use Page Visibility API which works on both web and native
    const handleVisibilityChange = async () => {
      // Only sync when page becomes visible (app comes to foreground)
      if (document.hidden) {
        logger.debug('[Visibility] App went to background');
        return;
      }
      
      // App came to foreground
      const timeSinceLastSync = Date.now() - lastSyncTime;
      const minimumSyncInterval = 60 * 1000; // 1 minute minimum between syncs
      
      if (timeSinceLastSync < minimumSyncInterval) {
        logger.debug(`[Visibility] Skipping foreground sync - last sync was ${Math.round(timeSinceLastSync / 1000)}s ago`);
        return;
      }
      
      logger.info('🚀 [Visibility] App came to foreground - triggering HealthKit sync...');
      lastSyncTime = Date.now();
      
      try {
        // Sync last 7 days to catch any data user added while app was closed
        const syncResult = await Readiness.syncReadinessData({ days: 7 });
        
        if (syncResult.success) {
          logger.info('[Visibility] Foreground sync completed successfully');
          
          // Wait for backend upload
          await new Promise(resolve => setTimeout(resolve, 4000));
          
          // Refetch dashboard queries (silent, no notification)
          try {
            const isHealthQuery = (query: any): boolean => {
              const queryKey = query.queryKey;
              if (Array.isArray(queryKey)) {
                return queryKey.some(key => {
                  if (typeof key !== 'string') return false;
                  return (
                    key.startsWith('/api/dashboard') ||
                    key.startsWith('/api/flomentum') ||
                    key.startsWith('/api/biological-age') ||
                    key.startsWith('/api/sleep') ||
                    key.startsWith('/api/labs') ||
                    key.startsWith('/api/healthkit')
                  );
                });
              }
              if (typeof queryKey === 'string') {
                return (
                  queryKey.startsWith('/api/dashboard') ||
                  queryKey.startsWith('/api/flomentum') ||
                  queryKey.startsWith('/api/biological-age') ||
                  queryKey.startsWith('/api/sleep') ||
                  queryKey.startsWith('/api/labs') ||
                  queryKey.startsWith('/api/healthkit')
                );
              }
              return false;
            };
            
            queryClient.invalidateQueries({ 
              predicate: isHealthQuery,
              refetchType: 'active'
            });
            
            await Promise.allSettled([
              queryClient.refetchQueries({ queryKey: ['/api/dashboard', 'overview'] }),
              queryClient.refetchQueries({ queryKey: ['/api/flomentum', 'daily'] }),
            ]);
            
            logger.info('✅ [Visibility] Dashboard refreshed after foreground sync');
          } catch (err) {
            logger.error('[Visibility] Failed to refresh dashboard', err);
          }
        }
      } catch (error) {
        logger.debug('[Visibility] Foreground sync failed - likely no permissions or network issue');
      }
    };
    
    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup listener on unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isNative]);
}
