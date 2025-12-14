import { Moon, TrendingUp, TrendingDown, Minus, Sunrise, Sunset, Lightbulb, Plus, Timer, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { DataSourceBadge } from '@/components/DataSourceBadge';
import { WhyButton } from '../WhyButton';

interface HealthKitSleepData {
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
  source?: 'healthkit' | 'oura' | 'manual'; // Data source indicator
}

interface ManualSleepEntry {
  id: string;
  sleep_date: string;
  bedtime: string | null;
  wake_time: string | null;
  bedtime_local?: string | null;
  waketime_local?: string | null;
  timezone?: string;
  duration_minutes: number;
  quality_rating: number;
  nightflo_score: number;
  score_label: string;
  notes: string | null;
}

interface SleepTileProps {
  isDark: boolean;
  data?: HealthKitSleepData;
  onWhyClick?: () => void;
}

export function SleepTile({ isDark, data, onWhyClick }: SleepTileProps) {
  const [, setLocation] = useLocation();
  
  const { data: manualEntries } = useQuery<ManualSleepEntry[]>({
    queryKey: ['/api/sleep/manual'],
    enabled: !data || data.nightflo_score === null,
  });

  const todayManualEntry = manualEntries?.[0];
  
  const hasHealthKitData = data && data.nightflo_score !== null && data.nightflo_score !== undefined;
  const hasManualData = !!todayManualEntry;
  
  if (!hasHealthKitData && !hasManualData) {
    return (
      <EmptySleepTile 
        isDark={isDark} 
        onAddSleep={() => setLocation('/sleep-logger')} 
      />
    );
  }

  if (hasHealthKitData) {
    return (
      <HealthKitSleepDisplay 
        isDark={isDark} 
        data={data!} 
        onOpenDetail={() => setLocation('/sleep-logger')}
        onManualLog={() => setLocation('/sleep-logger')}
        onWhyClick={onWhyClick}
      />
    );
  }

  return (
    <ManualSleepDisplay 
      isDark={isDark} 
      entry={todayManualEntry!} 
      onEdit={() => setLocation('/sleep-logger')}
    />
  );
}

function EmptySleepTile({ isDark, onAddSleep }: { isDark: boolean; onAddSleep: () => void }) {
  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover-elevate active-elevate-2 ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      onClick={onAddSleep}
      data-testid="tile-sleep-empty"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Moon className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Flō Sleep Index
          </h3>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-8">
        <div className={`p-4 rounded-full mb-4 ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
          <Moon className={`w-10 h-10 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
        </div>
        
        <p className={`text-sm text-center mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
          No sleep data yet. Log your sleep manually or connect a wearable device.
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`${isDark ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/20' : 'border-purple-300 text-purple-700 hover:bg-purple-50'}`}
            onClick={(e) => { e.stopPropagation(); onAddSleep(); }}
            data-testid="button-start-timer"
          >
            <Timer className="w-4 h-4 mr-1" />
            Start Timer
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`${isDark ? 'border-white/20 text-white/70 hover:bg-white/5' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            onClick={(e) => { e.stopPropagation(); onAddSleep(); }}
            data-testid="button-log-manual"
          >
            <Plus className="w-4 h-4 mr-1" />
            Log Sleep
          </Button>
        </div>
      </div>
    </div>
  );
}

function ManualSleepDisplay({ isDark, entry, onEdit }: { isDark: boolean; entry: ManualSleepEntry; onEdit: () => void }) {
  const score = entry.nightflo_score ?? 0;
  
  const getScoreColors = () => {
    if (score >= 80) {
      return {
        ringGradient: { start: '#10b981', end: '#059669' },
        textColor: isDark ? 'text-green-400' : 'text-green-600',
        badgeBg: isDark ? 'bg-green-500/20' : 'bg-green-100',
        badgeText: isDark ? 'text-green-400' : 'text-green-700'
      };
    } else if (score >= 60) {
      return {
        ringGradient: { start: '#3b82f6', end: '#0891b2' },
        textColor: isDark ? 'text-blue-400' : 'text-blue-600',
        badgeBg: isDark ? 'bg-blue-500/20' : 'bg-blue-100',
        badgeText: isDark ? 'text-blue-400' : 'text-blue-700'
      };
    } else if (score >= 40) {
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
  const hours = Math.floor(entry.duration_minutes / 60);
  const mins = entry.duration_minutes % 60;
  const durationStr = `${hours}h ${mins}m`;

  const qualityLabels = ['', 'Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'];
  const qualityLabel = qualityLabels[entry.quality_rating] || 'Fair';

  const formatLocalTime = (localStr: string | null | undefined, isoFallback: string | null) => {
    // Prefer pre-formatted local time if available
    if (localStr) {
      return localStr.toUpperCase();
    }
    // Fallback to converting ISO string
    if (!isoFallback) return '--:--';
    try {
      const d = new Date(isoFallback);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '--:--';
    }
  };

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover-elevate active-elevate-2 ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      onClick={onEdit}
      data-testid="tile-sleep-manual"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Moon className={`w-5 h-5 ${colors.textColor}`} data-testid="icon-sleep" />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep-title">
            Flō Sleep Index
          </h3>
          <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-white/10 text-white/50' : 'bg-gray-100 text-gray-500'}`}>
            Manual
          </span>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs ${colors.badgeBg} ${colors.badgeText}`} data-testid="badge-sleep-label">
          {entry.score_label}
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
                stroke="url(#manualSleepScoreGradient)"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 251.2} 251.2`}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="manualSleepScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={colors.ringGradient.start} />
                  <stop offset="100%" stopColor={colors.ringGradient.end} />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep-score">
                {score}
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
                  {durationStr}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Quality: {qualityLabel}
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <div
                      key={star}
                      className={`w-2 h-2 rounded-full ${
                        star <= entry.quality_rating
                          ? isDark ? 'bg-purple-400' : 'bg-purple-600'
                          : isDark ? 'bg-white/20' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(entry.bedtime || entry.wake_time) && (
        <div className="mb-4">
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
                  {formatLocalTime(entry.bedtime_local, entry.bedtime)}
                </div>
              </div>
            </div>

            <div className={`flex-1 mx-4 h-px ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
              <div className="relative">
                <div className={`absolute top-1/2 left-0 right-0 h-0.5 ${isDark ? 'bg-purple-500/30' : 'bg-purple-300'}`}></div>
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
                  {formatLocalTime(entry.waketime_local, entry.wake_time)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center">
        <Button
          variant="ghost"
          size="sm"
          className={`${isDark ? 'text-purple-400 hover:bg-purple-500/20' : 'text-purple-600 hover:bg-purple-50'}`}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          data-testid="button-edit-sleep"
        >
          <Edit3 className="w-4 h-4 mr-1" />
          Edit Entry
        </Button>
      </div>
    </div>
  );
}

function HealthKitSleepDisplay({ isDark, data, onOpenDetail, onManualLog, onWhyClick }: { isDark: boolean; data: HealthKitSleepData; onOpenDetail: () => void; onManualLog: () => void; onWhyClick?: () => void }) {
  // Format time string to standard AM/PM format
  const formatTimeToAmPm = (timeStr: string | null | undefined): string => {
    if (!timeStr) return '--:--';
    
    // If already in AM/PM format, return as-is (uppercase)
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
      return timeStr.toUpperCase();
    }
    
    // Handle 24-hour format like "22:30" or "06:45"
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    }
    
    // Try parsing as ISO date string
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
    } catch {
      // Fall through
    }
    
    return timeStr;
  };

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
      onClick={onOpenDetail}
      data-testid="tile-sleep"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Moon className={`w-5 h-5 ${colors.textColor}`} data-testid="icon-sleep" />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep-title">
            Flō Sleep Index
          </h3>
          <DataSourceBadge source={data.source || 'healthkit'} size="sm" />
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-full text-xs ${colors.badgeBg} ${colors.badgeText}`} data-testid="badge-sleep-label">
            {data.score_label}
          </div>
          {onWhyClick && <WhyButton onClick={onWhyClick} isDark={isDark} />}
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
                  {data.sleep_efficiency_pct}% efficiency
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
                {formatTimeToAmPm(data.bedtime_local)}
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
                {formatTimeToAmPm(data.waketime_local)}
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

      <button
        onClick={(e) => { e.stopPropagation(); onManualLog(); }}
        className={`w-full text-center mt-4 text-sm ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-700'} transition-colors`}
        data-testid="link-manual-log"
      >
        + Tap to manually log sleep
      </button>
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
