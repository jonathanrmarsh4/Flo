import { Zap, Heart, Moon, TrendingUp, Activity, AlertCircle, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface ReadinessTileProps {
  isDark: boolean;
}

interface ReadinessData {
  readinessScore: number;
  readinessBucket: 'recover' | 'ok' | 'ready';
  sleepScore: number | null;
  recoveryScore: number | null;
  loadScore: number | null;
  trendScore: number | null;
  isCalibrating: boolean;
  explanations: {
    summary: string;
    sleep: string;
    recovery: string;
    load: string;
    trend: string;
  };
  metrics?: {
    avgSleepHours?: number;
    avgHRV?: number;
    stepCount?: number;
    yesterdayActiveKcal?: number;
    activityBaseline?: number;
  };
  keyFactors?: string[];
  timestamp?: string;
}

export function ReadinessTile({ isDark }: ReadinessTileProps) {
  const { data: readinessData, isLoading, error } = useQuery<ReadinessData>({
    queryKey: ['/api/readiness/today'],
    // PERFORMANCE FIX: Cache data to reduce cold-start fetch load
    staleTime: 2 * 60 * 1000, // 2 minutes - use cached on navigation
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for quick resume
  });

  // Loading state
  if (isLoading) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
            : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
        }`}
        data-testid="tile-readiness"
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className={`w-5 h-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Daily Readiness
          </h3>
        </div>
        <div className="text-center py-6">
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Loading readiness...
          </div>
        </div>
      </div>
    );
  }

  // Error or no data state
  if (error || !readinessData) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
            : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
        }`}
        data-testid="tile-readiness"
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className={`w-5 h-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Daily Readiness
          </h3>
        </div>
        <div className="text-center py-6">
          <div className="flex justify-center gap-3 mb-4">
            <Moon className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
            <Heart className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
            <Zap className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
          </div>
          <h4 className={`text-base mb-2 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
            No Data Yet
          </h4>
          <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Sync your Apple Health data to see readiness
          </p>
        </div>
      </div>
    );
  }

  const { 
    readinessScore, 
    readinessBucket, 
    sleepScore, 
    recoveryScore, 
    loadScore, 
    trendScore, 
    isCalibrating, 
    explanations,
    metrics = {},
    keyFactors = [],
    timestamp
  } = readinessData;

  // Determine colors based on bucket
  const bucketColors = {
    ready: { 
      bg: isDark ? 'from-green-900/30 via-emerald-900/30 to-teal-900/30' : 'from-green-50 via-emerald-50 to-teal-50',
      text: isDark ? 'text-green-400' : 'text-green-600',
      icon: isDark ? 'text-green-400' : 'text-green-600',
      border: isDark ? 'border-green-500/20' : 'border-green-500/30',
      barBg: isDark ? 'bg-green-500/20' : 'bg-green-200',
      barFill: isDark ? 'bg-green-400' : 'bg-green-600',
    },
    ok: { 
      bg: isDark ? 'from-yellow-900/30 via-amber-900/30 to-orange-900/30' : 'from-yellow-50 via-amber-50 to-orange-50',
      text: isDark ? 'text-yellow-400' : 'text-yellow-600',
      icon: isDark ? 'text-yellow-400' : 'text-yellow-600',
      border: isDark ? 'border-yellow-500/20' : 'border-yellow-500/30',
      barBg: isDark ? 'bg-yellow-500/20' : 'bg-yellow-200',
      barFill: isDark ? 'bg-yellow-400' : 'bg-yellow-600',
    },
    recover: { 
      bg: isDark ? 'from-red-900/30 via-rose-900/30 to-pink-900/30' : 'from-red-50 via-rose-50 to-pink-50',
      text: isDark ? 'text-red-400' : 'text-red-600',
      icon: isDark ? 'text-red-400' : 'text-red-600',
      border: isDark ? 'border-red-500/20' : 'border-red-500/30',
      barBg: isDark ? 'bg-red-500/20' : 'bg-red-200',
      barFill: isDark ? 'bg-red-400' : 'bg-red-600',
    },
  };

  const colors = bucketColors[readinessBucket];

  // Determine trend badge text
  const trendBadge = trendScore !== null && trendScore >= 80 ? 'Stable' : 
                     trendScore !== null && trendScore >= 60 ? 'Improving' : 
                     trendScore !== null && trendScore >= 40 ? 'Variable' : 'Declining';

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      data-testid="tile-readiness"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className={`w-5 h-5 ${colors.icon}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Daily Readiness
          </h3>
        </div>
        {isCalibrating && (
          <div className={`flex items-center gap-1 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            <AlertCircle className="w-3 h-3" />
            <span>Calibrating</span>
          </div>
        )}
      </div>

      {/* Main Score Display */}
      <div className="flex items-center gap-5 mb-5">
        {/* Circular Progress Indicator */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-20 h-20 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="40"
              cy="40"
              r="34"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              className={isDark ? 'text-white/10' : 'text-gray-300'}
            />
            {/* Progress circle */}
            <circle
              cx="40"
              cy="40"
              r="34"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - readinessScore / 100)}`}
              className={colors.text}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className={`text-2xl font-semibold ${colors.text}`}>
                {readinessScore}
              </div>
            </div>
          </div>
        </div>

        {/* Status & Trend Badge */}
        <div className="flex-1">
          <div className={`text-base font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {readinessBucket === 'ready' && 'Ready'}
            {readinessBucket === 'ok' && 'Proceed with Caution'}
            {readinessBucket === 'recover' && 'Prioritize Recovery'}
          </div>
          <Badge 
            variant="secondary" 
            className={`text-xs ${isDark ? 'bg-white/10' : 'bg-black/10'}`}
            data-testid="badge-trend"
          >
            {trendBadge}
          </Badge>
        </div>
      </div>

      {/* Components Section */}
      <div className="space-y-3 mb-4">
        <h4 className={`text-xs font-medium tracking-wide ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
          COMPONENTS
        </h4>
        
        {/* Sleep Bar */}
        {sleepScore !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Moon className={`w-3 h-3 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={isDark ? 'text-white/80' : 'text-gray-700'}>Sleep</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {sleepScore}/100
                </span>
                {metrics.avgSleepHours && (
                  <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                    {metrics.avgSleepHours.toFixed(1)} avg hrs
                  </span>
                )}
              </div>
            </div>
            <div className={`h-1.5 rounded-full ${colors.barBg} overflow-hidden`}>
              <div 
                className={`h-full ${colors.barFill} transition-all duration-500`}
                style={{ width: `${sleepScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Recovery Bar */}
        {recoveryScore !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Heart className={`w-3 h-3 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                <span className={isDark ? 'text-white/80' : 'text-gray-700'}>Recovery</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {recoveryScore}/100
                </span>
                {metrics.avgHRV && (
                  <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                    {Math.round(metrics.avgHRV)} ms avg HRV
                  </span>
                )}
              </div>
            </div>
            <div className={`h-1.5 rounded-full ${colors.barBg} overflow-hidden`}>
              <div 
                className={`h-full ${colors.barFill} transition-all duration-500`}
                style={{ width: `${recoveryScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Load Bar - shows recovery from YESTERDAY's activity */}
        {loadScore !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Activity className={`w-3 h-3 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                <span className={isDark ? 'text-white/80' : 'text-gray-700'}>Recovery</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {loadScore}/100
                </span>
                {metrics.yesterdayActiveKcal !== undefined && (
                  <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                    {Math.round(metrics.yesterdayActiveKcal)} kcal yesterday
                  </span>
                )}
              </div>
            </div>
            <div className={`h-1.5 rounded-full ${colors.barBg} overflow-hidden`}>
              <div 
                className={`h-full ${colors.barFill} transition-all duration-500`}
                style={{ width: `${loadScore}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Key Factors */}
      {keyFactors.length > 0 && (
        <div className="space-y-2 mb-4">
          <h4 className={`text-xs font-medium tracking-wide ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
            KEY FACTORS
          </h4>
          <div className="flex flex-wrap gap-2">
            {keyFactors.map((factor, index) => (
              <Badge 
                key={index}
                variant="outline"
                className={`text-xs ${isDark ? 'border-white/20 text-white/80' : 'border-gray-300 text-gray-700'}`}
                data-testid={`badge-factor-${index}`}
              >
                {factor}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Footer Timestamp */}
      <div className={`flex items-center gap-1.5 text-xs pt-3 border-t ${
        isDark ? 'border-white/10 text-white/50' : 'border-gray-200 text-gray-500'
      }`}>
        <Clock className="w-3 h-3" />
        <span>
          {timestamp ? format(new Date(timestamp), "EEEE, h:mm a") : format(new Date(), "EEEE, h:mm a")}
        </span>
      </div>
    </div>
  );
}
