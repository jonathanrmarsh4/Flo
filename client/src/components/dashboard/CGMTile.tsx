import { Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, Link2, Link2Off, RefreshCw } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { format, formatDistanceToNow } from 'date-fns';
import { DataSourceBadge } from '@/components/DataSourceBadge';

interface CGMTileProps {
  isDark: boolean;
}

interface CGMStatus {
  connected: boolean;
  isSandbox?: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
  syncStatus?: 'active' | 'error' | 'disconnected';
  errorMessage?: string;
}

interface CGMReading {
  id: string;
  glucose_value: number;
  glucose_unit: string;
  trend: string;
  trend_rate: number | null;
  recorded_at: string;
  display_time: string;
}

interface TimeInRange {
  inRange: number;
  low: number;
  veryLow: number;
  high: number;
  veryHigh: number;
  average: number | null;
  readingsCount: number;
}

interface CGMReadingsResponse {
  readings: CGMReading[];
  latest: CGMReading | null;
  timeInRange: TimeInRange;
  hours: number;
}

const trendIcons: Record<string, typeof TrendingUp> = {
  'rising_rapidly': TrendingUp,
  'rising': TrendingUp,
  'rising_slowly': TrendingUp,
  'stable': Minus,
  'falling_slowly': TrendingDown,
  'falling': TrendingDown,
  'falling_rapidly': TrendingDown,
  'none': Minus,
  'unknown': Minus,
};

const trendLabels: Record<string, string> = {
  'rising_rapidly': 'Rising Rapidly',
  'rising': 'Rising',
  'rising_slowly': 'Rising Slowly',
  'stable': 'Stable',
  'falling_slowly': 'Falling Slowly',
  'falling': 'Falling',
  'falling_rapidly': 'Falling Rapidly',
  'none': '',
  'unknown': '',
};

function getGlucoseColor(value: number, isDark: boolean): string {
  if (value < 54) return isDark ? 'text-red-400' : 'text-red-600';
  if (value < 70) return isDark ? 'text-orange-400' : 'text-orange-600';
  if (value <= 180) return isDark ? 'text-green-400' : 'text-green-600';
  if (value <= 250) return isDark ? 'text-yellow-400' : 'text-yellow-600';
  return isDark ? 'text-red-400' : 'text-red-600';
}

function getGlucoseStatus(value: number): string {
  if (value < 54) return 'Very Low';
  if (value < 70) return 'Low';
  if (value <= 180) return 'In Range';
  if (value <= 250) return 'High';
  return 'Very High';
}

export function CGMTile({ isDark }: CGMTileProps) {
  const { data: status, isLoading: statusLoading } = useQuery<CGMStatus>({
    queryKey: ['/api/dexcom/status'],
    staleTime: 60 * 1000,
  });

  const { data: readings, isLoading: readingsLoading } = useQuery<CGMReadingsResponse>({
    queryKey: ['/api/dexcom/readings', { hours: 24 }],
    enabled: status?.connected === true,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/dexcom/sync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dexcom/readings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dexcom/status'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/dexcom/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dexcom/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dexcom/readings'] });
    },
  });

  const handleConnect = () => {
    window.location.href = '/api/auth/dexcom/connect';
  };

  if (statusLoading) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-cyan-900/40 via-teal-900/40 to-emerald-900/40 border-white/20' 
            : 'bg-gradient-to-br from-cyan-50 via-teal-50 to-emerald-50 border-black/10'
        }`}
        data-testid="tile-cgm"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Continuous Glucose
          </h3>
        </div>
        <div className="text-center py-6">
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-cyan-900/40 via-teal-900/40 to-emerald-900/40 border-white/20' 
            : 'bg-gradient-to-br from-cyan-50 via-teal-50 to-emerald-50 border-black/10'
        }`}
        data-testid="tile-cgm"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Continuous Glucose
          </h3>
        </div>
        <div className="text-center py-6">
          <div className="flex justify-center mb-4">
            <Activity className={`w-12 h-12 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
          </div>
          <h4 className={`text-base mb-2 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
            Connect Your CGM
          </h4>
          <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Link your Dexcom to see real-time glucose data
          </p>
          <Button 
            onClick={handleConnect}
            size="sm"
            className="gap-2"
            data-testid="button-connect-dexcom"
          >
            <Link2 className="w-4 h-4" />
            Connect Dexcom
          </Button>
        </div>
      </div>
    );
  }

  if (status.syncStatus === 'error') {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-red-900/40 via-orange-900/40 to-yellow-900/40 border-white/20' 
            : 'bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 border-black/10'
        }`}
        data-testid="tile-cgm"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
            <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              Continuous Glucose
            </h3>
          </div>
          <Badge variant="destructive" className="text-xs">
            Error
          </Badge>
        </div>
        <div className="text-center py-4">
          <AlertTriangle className={`w-10 h-10 mx-auto mb-2 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <p className={`text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            {status.errorMessage || 'Sync failed'}
          </p>
          <div className="flex gap-2 justify-center">
            <Button 
              onClick={handleConnect}
              size="sm"
              variant="outline"
              className="gap-1"
              data-testid="button-reconnect-dexcom"
            >
              <Link2 className="w-3 h-3" />
              Reconnect
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const latest = readings?.latest;
  const timeInRange = readings?.timeInRange;
  const TrendIcon = latest ? trendIcons[latest.trend] || Minus : Minus;

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-gradient-to-br from-cyan-900/40 via-teal-900/40 to-emerald-900/40 border-white/20' 
          : 'bg-gradient-to-br from-cyan-50 via-teal-50 to-emerald-50 border-black/10'
      }`}
      data-testid="tile-cgm"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Continuous Glucose
          </h3>
          <DataSourceBadge source="dexcom" size="sm" />
        </div>
        <div className="flex items-center gap-2">
          {status.isSandbox && (
            <Badge variant="secondary" className="text-xs">
              Sandbox
            </Badge>
          )}
          <Button
            onClick={() => syncMutation.mutate()}
            size="icon"
            variant="ghost"
            disabled={syncMutation.isPending}
            className="h-7 w-7"
            data-testid="button-sync-cgm"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {latest ? (
        <>
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="text-center">
              <div className={`text-4xl font-bold ${getGlucoseColor(latest.glucose_value, isDark)}`}>
                {latest.glucose_value}
              </div>
              <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                {latest.glucose_unit}
              </div>
            </div>
            <div className="flex flex-col items-center">
              <TrendIcon className={`w-6 h-6 ${getGlucoseColor(latest.glucose_value, isDark)}`} />
              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                {trendLabels[latest.trend] || ''}
              </span>
            </div>
          </div>

          <div className="flex justify-center mb-3">
            <Badge 
              variant={latest.glucose_value >= 70 && latest.glucose_value <= 180 ? 'default' : 'secondary'}
              className="text-xs"
            >
              {getGlucoseStatus(latest.glucose_value)}
            </Badge>
          </div>

          {timeInRange && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isDark ? 'text-white/60' : 'text-gray-600'}>Time in Range (24h)</span>
                <span className={`font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  {timeInRange.inRange}%
                </span>
              </div>
              
              <div className="h-2 rounded-full overflow-hidden flex">
                {timeInRange.veryLow > 0 && (
                  <div 
                    className="bg-red-500" 
                    style={{ width: `${timeInRange.veryLow}%` }}
                    title={`Very Low: ${timeInRange.veryLow}%`}
                  />
                )}
                {timeInRange.low > 0 && (
                  <div 
                    className="bg-orange-500" 
                    style={{ width: `${timeInRange.low}%` }}
                    title={`Low: ${timeInRange.low}%`}
                  />
                )}
                <div 
                  className="bg-green-500" 
                  style={{ width: `${timeInRange.inRange}%` }}
                  title={`In Range: ${timeInRange.inRange}%`}
                />
                {timeInRange.high > 0 && (
                  <div 
                    className="bg-yellow-500" 
                    style={{ width: `${timeInRange.high}%` }}
                    title={`High: ${timeInRange.high}%`}
                  />
                )}
                {timeInRange.veryHigh > 0 && (
                  <div 
                    className="bg-red-500" 
                    style={{ width: `${timeInRange.veryHigh}%` }}
                    title={`Very High: ${timeInRange.veryHigh}%`}
                  />
                )}
              </div>

              <div className="flex justify-between text-xs">
                <span className={isDark ? 'text-white/40' : 'text-gray-400'}>
                  {timeInRange.average ? `Avg: ${timeInRange.average} ${latest.glucose_unit}` : ''}
                </span>
                <span className={isDark ? 'text-white/40' : 'text-gray-400'}>
                  {formatDistanceToNow(new Date(latest.recorded_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-4">
          <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            {readingsLoading ? 'Loading readings...' : 'No recent readings'}
          </p>
          {status.lastSyncAt && (
            <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
              Last sync: {formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true })}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
        <Button
          onClick={() => {
            if (confirm('Disconnect Dexcom?')) {
              disconnectMutation.mutate();
            }
          }}
          size="sm"
          variant="ghost"
          className="text-xs gap-1 opacity-60 hover:opacity-100"
          data-testid="button-disconnect-dexcom"
        >
          <Link2Off className="w-3 h-3" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}
