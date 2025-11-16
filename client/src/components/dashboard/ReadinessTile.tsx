import { Zap, Heart, Moon, TrendingUp, Activity, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

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
}

export function ReadinessTile({ isDark }: ReadinessTileProps) {
  const { data: readinessData, isLoading, error } = useQuery<ReadinessData>({
    queryKey: ['/api/readiness/today'],
  });

  // Loading state
  if (isLoading) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 border-white/10' 
            : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 border-black/10'
        }`}
        data-testid="tile-readiness"
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
          <h3 className={`text-xs tracking-wide ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`}>
            DAILY READINESS
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
            ? 'bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 border-white/10' 
            : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 border-black/10'
        }`}
        data-testid="tile-readiness"
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
          <h3 className={`text-xs tracking-wide ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`}>
            DAILY READINESS
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

  const { readinessScore, readinessBucket, sleepScore, recoveryScore, loadScore, trendScore, isCalibrating, explanations } = readinessData;

  // Determine colors based on bucket
  const bucketColors = {
    ready: { 
      bg: isDark ? 'from-green-900/30 via-emerald-900/30 to-teal-900/30' : 'from-green-50 via-emerald-50 to-teal-50',
      text: isDark ? 'text-green-400' : 'text-green-600',
      icon: isDark ? 'text-green-400' : 'text-green-600',
      border: isDark ? 'border-green-500/20' : 'border-green-500/30',
    },
    ok: { 
      bg: isDark ? 'from-yellow-900/30 via-amber-900/30 to-orange-900/30' : 'from-yellow-50 via-amber-50 to-orange-50',
      text: isDark ? 'text-yellow-400' : 'text-yellow-600',
      icon: isDark ? 'text-yellow-400' : 'text-yellow-600',
      border: isDark ? 'border-yellow-500/20' : 'border-yellow-500/30',
    },
    recover: { 
      bg: isDark ? 'from-red-900/30 via-rose-900/30 to-pink-900/30' : 'from-red-50 via-rose-50 to-pink-50',
      text: isDark ? 'text-red-400' : 'text-red-600',
      icon: isDark ? 'text-red-400' : 'text-red-600',
      border: isDark ? 'border-red-500/20' : 'border-red-500/30',
    },
  };

  const colors = bucketColors[readinessBucket];

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all bg-gradient-to-br ${colors.bg} ${colors.border}`}
      data-testid="tile-readiness"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${colors.icon}`} />
          <h3 className={`text-xs tracking-wide ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`}>
            DAILY READINESS
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
      <div className="flex items-center gap-6 mb-5">
        {/* Circular Progress Indicator */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg className="w-24 h-24 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className={isDark ? 'text-white/10' : 'text-gray-300'}
            />
            {/* Progress circle */}
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - readinessScore / 100)}`}
              className={colors.text}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className={`text-2xl font-semibold ${colors.text}`}>
                {readinessScore}
              </div>
              <div className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                / 100
              </div>
            </div>
          </div>
        </div>

        {/* Status & Summary */}
        <div className="flex-1">
          <div className={`text-lg font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {readinessBucket === 'ready' && 'Ready'}
            {readinessBucket === 'ok' && 'Proceed with Caution'}
            {readinessBucket === 'recover' && 'Prioritize Recovery'}
          </div>
          <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            {explanations.summary}
          </p>
        </div>
      </div>

      {/* Component Scores */}
      <div className="grid grid-cols-2 gap-3">
        {/* Sleep Score */}
        {sleepScore !== null && (
          <div className={`rounded-2xl p-3 ${
            isDark ? 'bg-white/5' : 'bg-white/50'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Moon className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                Sleep
              </span>
            </div>
            <div className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {sleepScore}
            </div>
            <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {explanations.sleep}
            </div>
          </div>
        )}

        {/* Recovery Score */}
        {recoveryScore !== null && (
          <div className={`rounded-2xl p-3 ${
            isDark ? 'bg-white/5' : 'bg-white/50'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Heart className={`w-3.5 h-3.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                Recovery
              </span>
            </div>
            <div className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {recoveryScore}
            </div>
            <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {explanations.recovery}
            </div>
          </div>
        )}

        {/* Load Score */}
        {loadScore !== null && (
          <div className={`rounded-2xl p-3 ${
            isDark ? 'bg-white/5' : 'bg-white/50'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Activity className={`w-3.5 h-3.5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                Load
              </span>
            </div>
            <div className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {loadScore}
            </div>
            <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {explanations.load}
            </div>
          </div>
        )}

        {/* Trend Score */}
        {trendScore !== null && (
          <div className={`rounded-2xl p-3 ${
            isDark ? 'bg-white/5' : 'bg-white/50'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className={`w-3.5 h-3.5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                Trend
              </span>
            </div>
            <div className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {trendScore}
            </div>
            <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {explanations.trend}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
