import { useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2, CloudOff, RefreshCw, RotateCw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { queryClient } from '@/lib/queryClient';

interface SyncStatusResponse {
  healthkitSyncing: boolean;
  clickhouseSyncing: boolean;
  isReady: boolean;
  healthkitRecords: number;
  clickhouseRecords: number;
  message: string;
}

interface SyncProgressIndicatorProps {
  isDark: boolean;
  hasDashboardData?: boolean; // If true, user already has established data - skip sync indicator
}

export function SyncProgressIndicator({ isDark, hasDashboardData }: SyncProgressIndicatorProps) {
  const { data: syncStatus, isLoading, error } = useQuery<SyncStatusResponse>({
    queryKey: ['/api/dashboard/sync-status'],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      if (data.isReady) return false;
      return 3000;
    },
    staleTime: 2000,
  });

  // If user already has dashboard data (floScore, readiness, etc.), they're an established user
  // Don't show sync progress even if backend metadata is stale
  if (hasDashboardData) {
    return null;
  }

  if (isLoading) {
    return null;
  }

  if (error || !syncStatus) {
    return null;
  }

  // Only hide when BOTH systems have data (isReady is derived from this on backend)
  // This prevents hiding while ClickHouse is still empty due to race condition
  if (syncStatus.isReady && syncStatus.healthkitRecords > 0 && syncStatus.clickhouseRecords > 0) {
    return null;
  }

  const isSyncing = syncStatus.healthkitSyncing || syncStatus.clickhouseSyncing;
  
  // Calculate progress based on actual record counts for more accurate display
  let progressValue = 0;
  if (syncStatus.healthkitRecords === 0) {
    progressValue = 0;
  } else if (syncStatus.healthkitSyncing) {
    progressValue = 20;
  } else if (syncStatus.clickhouseRecords === 0) {
    // HealthKit has data but ClickHouse doesn't - still processing
    progressValue = 50;
  } else if (syncStatus.clickhouseRecords < syncStatus.healthkitRecords) {
    // ClickHouse has some data but not all
    const ratio = syncStatus.clickhouseRecords / syncStatus.healthkitRecords;
    progressValue = 50 + Math.round(ratio * 40); // 50-90%
  } else {
    progressValue = 100;
  }

  return (
    <div 
      className={`mx-4 mb-4 p-4 rounded-xl border ${
        isDark 
          ? 'bg-gray-900/60 border-gray-800' 
          : 'bg-white border-gray-200'
      }`}
      data-testid="sync-progress-indicator"
    >
      <div className="flex items-center gap-3">
        {isSyncing ? (
          <div className={`p-2 rounded-full ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
            <Loader2 
              className={`w-5 h-5 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} 
            />
          </div>
        ) : syncStatus.healthkitRecords === 0 ? (
          <div className={`p-2 rounded-full ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
            <CloudOff 
              className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} 
            />
          </div>
        ) : (
          <div className={`p-2 rounded-full ${isDark ? 'bg-green-500/20' : 'bg-green-100'}`}>
            <CheckCircle2 
              className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} 
            />
          </div>
        )}
        
        <div className="flex-1">
          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {syncStatus.message}
          </p>
          
          {isSyncing && (
            <div className="mt-2">
              <Progress 
                value={progressValue} 
                className={`h-1.5 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}
              />
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {syncStatus.healthkitRecords > 0 && (
                  <>
                    {syncStatus.healthkitRecords.toLocaleString()} health records
                    {syncStatus.clickhouseRecords > 0 && ` • ${syncStatus.clickhouseRecords.toLocaleString()} processed`}
                  </>
                )}
              </p>
            </div>
          )}
          
          {syncStatus.healthkitRecords === 0 && !isSyncing && (
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Your iPhone will sync health data automatically when the app is open.
            </p>
          )}
        </div>
        
        {isSyncing ? (
          <RefreshCw className={`w-4 h-4 animate-spin ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/dashboard/sync-status'] });
            }}
            data-testid="button-refresh-sync"
          >
            <RotateCw className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </Button>
        )}
      </div>
    </div>
  );
}
