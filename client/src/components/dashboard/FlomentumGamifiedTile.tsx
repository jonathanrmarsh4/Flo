import { Flame, Check, Sparkles, Moon, Footprints, Timer, Eye, CheckSquare, MessageCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';

interface FlomentumGamifiedTileProps {
  isDark: boolean;
  onClick?: () => void;
}

interface GamificationData {
  level: number;
  currentStreak: number;
  longestStreak: number;
  totalXP: number;
  xpToNextLevel: number;
  xpProgress: number;
  checklist: {
    insightsViewed: boolean;
    actionsChecked: boolean;
    aiChatUsed: boolean;
  };
  activity: {
    steps: { current: number; goal: number };
    activeMinutes: { current: number; goal: number };
    sleepHours: { current: number; goal: number };
  };
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
  gamification: GamificationData | null;
}

export function FlomentumGamifiedTile({ isDark, onClick }: FlomentumGamifiedTileProps) {
  const queryClient = useQueryClient();
  
  const { data: flomentumData, isLoading, error } = useQuery<FlomentumData>({
    queryKey: ['/api/flomentum/today'],
    retry: false,
    // PERFORMANCE FIX: Cache data to reduce cold-start fetch load
    staleTime: 2 * 60 * 1000, // 2 minutes - use cached on navigation
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for quick resume
  });

  const updateEngagementMutation = useMutation({
    mutationFn: async (field: 'insightsViewed' | 'actionsChecked' | 'aiChatUsed') => {
      return apiRequest('PATCH', '/api/flomentum/engagement', { field, value: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flomentum/today'] });
    },
    onError: (error) => {
      console.error('[FlomentumTile] Failed to update engagement:', error);
    },
  });

  if (isLoading) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
            : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
        }`}
        data-testid="tile-flomentum-gamified"
      >
        <div className="flex items-center gap-2 mb-4">
          <Flame className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Flōmentum
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

  if (error || !flomentumData) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
            : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
        }`}
        data-testid="tile-flomentum-gamified"
      >
        <div className="flex items-center gap-2 mb-4">
          <Flame className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Flōmentum
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

  const { score, zone, gamification } = flomentumData;
  const hasGamification = gamification !== null;

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

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const getActivityPercent = (current: number, goal: number) => {
    return Math.min(100, Math.round((current / goal) * 100));
  };

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover-elevate ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      onClick={onClick}
      data-testid="tile-flomentum-gamified"
    >
      {/* Header with Level Badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Flōmentum
          </h3>
        </div>
        {hasGamification && (
          <Badge 
            variant="outline" 
            className={`text-xs px-2 py-0.5 ${
              isDark 
                ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30' 
                : 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border-amber-300'
            }`}
            data-testid="badge-level"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Level {gamification.level}
          </Badge>
        )}
      </div>

      {/* Main Score Area */}
      <div className="flex items-center gap-4 mb-4">
        {/* Circular Gauge with Score */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="transform -rotate-90" width="80" height="80">
            <circle
              cx="40"
              cy="40"
              r="35"
              fill="none"
              className={isDark ? 'stroke-white/10' : 'stroke-black/10'}
              strokeWidth="5"
            />
            <circle
              cx="40"
              cy="40"
              r="35"
              fill="none"
              className={colors.gauge}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 35}
              strokeDashoffset={(2 * Math.PI * 35) - (score / 100) * (2 * Math.PI * 35)}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold ${colors.text}`} data-testid="text-score">
              {score}
            </span>
          </div>
        </div>

        {/* Streak and Zone */}
        <div className="flex-1">
          {hasGamification && gamification.currentStreak > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <Flame className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-500'}`} />
              <span className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-streak">
                {gamification.currentStreak} day streak
              </span>
            </div>
          )}
          <Badge 
            variant="outline" 
            className={`text-xs ${colors.badge}`}
            data-testid="badge-zone"
          >
            {zone.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* XP Progress Bar - Only show if gamification is available */}
      {hasGamification && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Level {gamification.level} Progress
            </span>
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`} data-testid="text-xp-progress">
              {Math.round(gamification.xpProgress * 100)}%
            </span>
          </div>
          <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
            <div 
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
              style={{ width: `${gamification.xpProgress * 100}%`, transition: 'width 0.5s ease' }}
              data-testid="progress-xp"
            />
          </div>
        </div>
      )}

      {/* Activity Progress Bars - Only show if gamification is available */}
      {hasGamification && gamification.activity && (
        <div className="mb-4 space-y-2">
          <div className={`text-xs font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            Today's Activity
          </div>
          
          {/* Steps */}
          <div className="flex items-center gap-2" data-testid="activity-steps">
            <Footprints className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <div className="flex-1">
              <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                <div 
                  className="h-full rounded-full bg-blue-400"
                  style={{ width: `${getActivityPercent(gamification.activity.steps.current, gamification.activity.steps.goal)}%` }}
                />
              </div>
            </div>
            <span className={`text-xs w-12 text-right ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              {formatNumber(gamification.activity.steps.current)}
            </span>
          </div>

          {/* Active Minutes */}
          <div className="flex items-center gap-2" data-testid="activity-minutes">
            <Timer className={`w-3.5 h-3.5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            <div className="flex-1">
              <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                <div 
                  className="h-full rounded-full bg-green-400"
                  style={{ width: `${getActivityPercent(gamification.activity.activeMinutes.current, gamification.activity.activeMinutes.goal)}%` }}
                />
              </div>
            </div>
            <span className={`text-xs w-12 text-right ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              {gamification.activity.activeMinutes.current}m
            </span>
          </div>

          {/* Sleep */}
          <div className="flex items-center gap-2" data-testid="activity-sleep">
            <Moon className={`w-3.5 h-3.5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            <div className="flex-1">
              <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-black/10'}`}>
                <div 
                  className="h-full rounded-full bg-purple-400"
                  style={{ width: `${getActivityPercent(gamification.activity.sleepHours.current, gamification.activity.sleepHours.goal)}%` }}
                />
              </div>
            </div>
            <span className={`text-xs w-12 text-right ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              {gamification.activity.sleepHours.current}h
            </span>
          </div>
        </div>
      )}

      {/* Daily Engagement Checklist - Only show if gamification is available */}
      {hasGamification && gamification.checklist && (
        <div className={`pt-3 border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <div className={`text-xs font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            Daily Engagement
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!gamification.checklist.insightsViewed && !updateEngagementMutation.isPending) {
                  updateEngagementMutation.mutate('insightsViewed');
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
                gamification.checklist.insightsViewed
                  ? isDark 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-green-100 text-green-700'
                  : isDark
                    ? 'bg-white/5 text-white/40 hover:bg-white/10'
                    : 'bg-black/5 text-gray-400 hover:bg-black/10'
              }`}
              disabled={gamification.checklist.insightsViewed || updateEngagementMutation.isPending}
              data-testid="button-check-insights"
            >
              {gamification.checklist.insightsViewed ? (
                <Check className="w-3 h-3" />
              ) : (
                <Eye className="w-3 h-3" />
              )}
              <span>Insights</span>
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!gamification.checklist.actionsChecked && !updateEngagementMutation.isPending) {
                  updateEngagementMutation.mutate('actionsChecked');
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
                gamification.checklist.actionsChecked
                  ? isDark 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-green-100 text-green-700'
                  : isDark
                    ? 'bg-white/5 text-white/40 hover:bg-white/10'
                    : 'bg-black/5 text-gray-400 hover:bg-black/10'
              }`}
              disabled={gamification.checklist.actionsChecked || updateEngagementMutation.isPending}
              data-testid="button-check-actions"
            >
              {gamification.checklist.actionsChecked ? (
                <Check className="w-3 h-3" />
              ) : (
                <CheckSquare className="w-3 h-3" />
              )}
              <span>Actions</span>
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!gamification.checklist.aiChatUsed && !updateEngagementMutation.isPending) {
                  updateEngagementMutation.mutate('aiChatUsed');
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
                gamification.checklist.aiChatUsed
                  ? isDark 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-green-100 text-green-700'
                  : isDark
                    ? 'bg-white/5 text-white/40 hover:bg-white/10'
                    : 'bg-black/5 text-gray-400 hover:bg-black/10'
              }`}
              disabled={gamification.checklist.aiChatUsed || updateEngagementMutation.isPending}
              data-testid="button-check-chat"
            >
              {gamification.checklist.aiChatUsed ? (
                <Check className="w-3 h-3" />
              ) : (
                <MessageCircle className="w-3 h-3" />
              )}
              <span>AI Chat</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
