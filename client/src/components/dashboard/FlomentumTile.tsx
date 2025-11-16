import { Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

interface FlomentumTileProps {
  isDark: boolean;
  onClick?: () => void;
}

interface FlomentumData {
  date: string;
  score: number;
  zone: 'BUILDING' | 'MAINTAINING' | 'DRAINING';
  factors: any[];
  dailyFocus: {
    title: string;
    body: string;
    componentKey: string;
  };
  quickSnapshot: {
    date: string;
    score: number;
  }[];
}

export function FlomentumTile({ isDark, onClick }: FlomentumTileProps) {
  const { data: flomentumData, isLoading, error } = useQuery<FlomentumData>({
    queryKey: ['/api/flomentum/today'],
    retry: false,
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
        data-testid="tile-flomentum"
      >
        <div className="flex items-center gap-2 mb-4">
          <Flame className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`text-xs tracking-wide ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`}>
            FLŌMENTUM
          </h3>
        </div>
        <div className="text-center py-6">
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Loading momentum...
          </div>
        </div>
      </div>
    );
  }

  // Error or no data state
  if (error || !flomentumData) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
            : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
        }`}
        data-testid="tile-flomentum"
      >
        <div className="flex items-center gap-2 mb-4">
          <Flame className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`text-xs tracking-wide ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`}>
            FLŌMENTUM
          </h3>
        </div>
        <div className="text-center py-6">
          <div className="flex justify-center mb-4">
            <Flame className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
          </div>
          <h4 className={`text-base mb-2 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
            No Data Yet
          </h4>
          <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Sync your Apple Health data to see momentum
          </p>
        </div>
      </div>
    );
  }

  const { score, zone, dailyFocus, quickSnapshot } = flomentumData;

  // Calculate trend from quickSnapshot
  let trendDirection: 'up' | 'down' | 'stable' = 'stable';
  if (quickSnapshot && quickSnapshot.length >= 2) {
    const todayScore = quickSnapshot[0]?.score || 0;
    const yesterdayScore = quickSnapshot[1]?.score || 0;
    if (todayScore > yesterdayScore + 5) trendDirection = 'up';
    else if (todayScore < yesterdayScore - 5) trendDirection = 'down';
  }

  // Zone colors
  const zoneColors = {
    BUILDING: {
      gauge: isDark ? 'stroke-green-400' : 'stroke-green-600',
      text: isDark ? 'text-green-400' : 'text-green-600',
      badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    },
    MAINTAINING: {
      gauge: isDark ? 'stroke-blue-400' : 'stroke-blue-600',
      text: isDark ? 'text-blue-400' : 'text-blue-600',
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    },
    DRAINING: {
      gauge: isDark ? 'stroke-orange-400' : 'stroke-orange-600',
      text: isDark ? 'text-orange-400' : 'text-orange-600',
      badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    },
  };

  const colors = zoneColors[zone];
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover-elevate ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      onClick={onClick}
      data-testid="tile-flomentum"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`text-xs tracking-wide ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`}>
            FLŌMENTUM
          </h3>
        </div>
        {trendDirection !== 'stable' && (
          <div className={`flex items-center gap-1 text-xs ${
            trendDirection === 'up' 
              ? isDark ? 'text-green-400' : 'text-green-600'
              : isDark ? 'text-red-400' : 'text-red-600'
          }`}>
            {trendDirection === 'up' ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
          </div>
        )}
      </div>

      {/* Circular Gauge and Score */}
      <div className="flex items-center justify-between mb-4">
        {/* Circular gauge */}
        <div className="relative w-24 h-24">
          <svg className="transform -rotate-90" width="96" height="96">
            {/* Background circle */}
            <circle
              cx="48"
              cy="48"
              r="45"
              fill="none"
              className={isDark ? 'stroke-white/10' : 'stroke-black/10'}
              strokeWidth="6"
            />
            {/* Progress circle */}
            <circle
              cx="48"
              cy="48"
              r="45"
              fill="none"
              className={colors.gauge}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          {/* Score in center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-3xl font-bold ${colors.text}`}>
              {score}
            </span>
          </div>
        </div>

        {/* Zone and Daily Focus */}
        <div className="flex-1 ml-4">
          <Badge 
            variant="outline" 
            className={`mb-2 ${colors.badge}`}
            data-testid="badge-zone"
          >
            {zone.replace('_', ' ')}
          </Badge>
          <p className={`text-xs leading-relaxed ${
            isDark ? 'text-white/70' : 'text-gray-600'
          }`}>
            {dailyFocus.title}
          </p>
        </div>
      </div>

      {/* Quick Snapshot */}
      {quickSnapshot && quickSnapshot.length > 0 && (
        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center justify-between">
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Recent scores
            </span>
            <div className="flex gap-2">
              {quickSnapshot.slice(0, 3).map((day, idx) => (
                <div 
                  key={idx}
                  className={`h-8 w-1.5 rounded-full ${
                    day.score >= 75 
                      ? isDark ? 'bg-green-400/50' : 'bg-green-500'
                      : day.score >= 60
                      ? isDark ? 'bg-blue-400/50' : 'bg-blue-500'
                      : isDark ? 'bg-orange-400/50' : 'bg-orange-500'
                  }`}
                  style={{ height: `${(day.score / 100) * 32}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
