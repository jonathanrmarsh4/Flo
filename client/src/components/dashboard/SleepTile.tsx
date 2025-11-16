import { Moon, TrendingUp, TrendingDown, Minus, Sunrise, Sunset, Lightbulb } from 'lucide-react';

interface SleepTileProps {
  isDark: boolean;
  data?: {
    nightflo_score: number;
    score_label: string;
    score_delta_vs_baseline: number;
    trend_direction: 'up' | 'down' | 'flat';
    total_sleep_duration: string;
    time_in_bed: string;
    sleep_efficiency_pct: number;
    deep_sleep_pct: number;
    rem_sleep_pct: number;
    bedtime_local: string;
    waketime_local: string;
    headline_insight: string;
  };
}

const DEFAULT_DATA = {
  nightflo_score: 82,
  score_label: 'Good',
  score_delta_vs_baseline: 6,
  trend_direction: 'up' as const,
  total_sleep_duration: '7h 32m',
  time_in_bed: '8h 05m',
  sleep_efficiency_pct: 92,
  deep_sleep_pct: 18,
  rem_sleep_pct: 22,
  bedtime_local: '10:47 pm',
  waketime_local: '6:19 am',
  headline_insight: 'Solid recovery, but a bit light on deep sleep tonight.'
};

export function SleepTile({ isDark, data = DEFAULT_DATA }: SleepTileProps) {
  // Styled to match Flō Overview tile

  const getScoreColors = () => {
    if (data.nightflo_score >= 80) {
      return {
        ringGradient: { start: '#10b981', end: '#059669' },
        textColor: isDark ? 'text-green-400' : 'text-green-600',
        badgeBg: isDark ? 'bg-green-500/20' : 'bg-green-100',
        badgeText: isDark ? 'text-green-400' : 'text-green-700'
      };
    } else if (data.nightflo_score >= 60) {
      return {
        ringGradient: { start: '#3b82f6', end: '#0891b2' },
        textColor: isDark ? 'text-blue-400' : 'text-blue-600',
        badgeBg: isDark ? 'bg-blue-500/20' : 'bg-blue-100',
        badgeText: isDark ? 'text-blue-400' : 'text-blue-700'
      };
    } else if (data.nightflo_score >= 40) {
      return {
        ringGradient: { start: '#f59e0b', end: '#ea580c' },
        textColor: isDark ? 'text-amber-400' : 'text-amber-600',
        badgeBg: isDark ? 'bg-amber-500/20' : 'bg-amber-100',
        badgeText: isDark ? 'text-amber-400' : 'text-amber-700'
      };
    } else {
      return {
        ringGradient: { start: '#ef4444', end: '#dc2626' },
        textColor: isDark ? 'text-red-400' : 'text-red-600',
        badgeBg: isDark ? 'bg-red-500/20' : 'bg-red-100',
        badgeText: isDark ? 'text-red-400' : 'text-red-700'
      };
    }
  };

  const colors = getScoreColors();

  const getTrendIcon = () => {
    if (data.trend_direction === 'up') {
      return <TrendingUp className={`w-3.5 h-3.5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />;
    } else if (data.trend_direction === 'down') {
      return <TrendingDown className={`w-3.5 h-3.5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />;
    } else {
      return <Minus className={`w-3.5 h-3.5 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />;
    }
  };

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover-elevate active-elevate-2 ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      data-testid="tile-sleep"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Moon className={`w-5 h-5 ${colors.textColor}`} data-testid="icon-sleep" />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep-title">
            Flō Sleep Index
          </h3>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs ${colors.badgeBg} ${colors.badgeText}`} data-testid="badge-sleep-label">
          {data.score_label}
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="url(#sleepScoreGradient)"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(data.nightflo_score / 100) * 251.2} 251.2`}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="sleepScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={colors.ringGradient.start} />
                  <stop offset="100%" stopColor={colors.ringGradient.end} />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep-score">
                {data.nightflo_score}
              </span>
            </div>
          </div>

          <div className="flex-1">
            <div className="space-y-2">
              <div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Total Sleep
                </div>
                <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep-duration">
                  {data.total_sleep_duration}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5" data-testid="container-sleep-trend">
                  {getTrendIcon()}
                  <span className={`text-xs ${
                    data.trend_direction === 'up' 
                      ? isDark ? 'text-green-400' : 'text-green-600'
                      : data.trend_direction === 'down'
                      ? isDark ? 'text-orange-400' : 'text-orange-600'
                      : isDark ? 'text-white/60' : 'text-gray-600'
                  }`} data-testid="text-sleep-delta">
                    {data.score_delta_vs_baseline > 0 ? '+' : ''}{data.score_delta_vs_baseline}
                  </span>
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`} data-testid="text-sleep-efficiency">
                  • {data.sleep_efficiency_pct}% efficiency
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <div className={`text-xs mb-3 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          Sleep Stages
        </div>
        <div className="space-y-2.5">
          <SleepStageBar 
            label="Deep Sleep"
            percentage={data.deep_sleep_pct}
            color="indigo"
            isDark={isDark}
          />
          <SleepStageBar 
            label="REM Sleep"
            percentage={data.rem_sleep_pct}
            color="purple"
            isDark={isDark}
          />
          <SleepStageBar 
            label="Light Sleep"
            percentage={100 - data.deep_sleep_pct - data.rem_sleep_pct}
            color="blue"
            isDark={isDark}
          />
        </div>
      </div>

      <div className="mb-5">
        <div className={`text-xs mb-3 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          Schedule
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
              <Sunset className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
            </div>
            <div>
              <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Bedtime
              </div>
              <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-bedtime">
                {data.bedtime_local}
              </div>
            </div>
          </div>

          <div className={`flex-1 mx-4 h-px ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
            <div className="relative">
              <div className={`absolute top-1/2 left-0 right-0 h-0.5 ${isDark ? 'bg-purple-500/30' : 'bg-purple-300'}`}></div>
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${isDark ? 'bg-purple-400' : 'bg-purple-600'}`}></div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
              <Sunrise className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
            </div>
            <div>
              <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Wake
              </div>
              <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-waketime">
                {data.waketime_local}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`rounded-2xl p-4 ${
        isDark ? 'bg-white/5 border border-white/10' : 'bg-blue-50/50 border border-blue-200/50'
      }`}>
        <div className="flex items-start gap-3">
          <Lightbulb className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <p className={`text-xs leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-700'}`} data-testid="text-sleep-insight">
            {data.headline_insight}
          </p>
        </div>
      </div>
    </div>
  );
}

interface SleepStageBarProps {
  label: string;
  percentage: number;
  color: 'indigo' | 'purple' | 'blue';
  isDark: boolean;
}

function SleepStageBar({ label, percentage, color, isDark }: SleepStageBarProps) {
  const getColorClasses = () => {
    switch (color) {
      case 'indigo':
        return isDark ? 'bg-indigo-500' : 'bg-indigo-600';
      case 'purple':
        return isDark ? 'bg-purple-500' : 'bg-purple-600';
      case 'blue':
        return isDark ? 'bg-blue-400' : 'bg-blue-500';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`text-[10px] w-20 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
        {label}
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className={`h-2 flex-1 rounded-full overflow-hidden ${
          isDark ? 'bg-white/10' : 'bg-gray-200'
        }`}>
          <div 
            className={`h-full ${getColorClasses()} transition-all duration-1000 ease-out`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <div className={`text-xs w-10 text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
          {percentage}%
        </div>
      </div>
    </div>
  );
}
