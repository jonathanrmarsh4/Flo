import { Scale, GripVertical, TrendingDown, TrendingUp, Minus, Target } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataSourceBadge } from '@/components/DataSourceBadge';
import { Badge } from '@/components/ui/badge';
import { WeightModuleScreen } from '@/components/weight/WeightModuleScreen';

interface WeightTileResponse {
  user_id: string;
  generated_at_utc: string | null;
  status_chip: string;
  confidence_level: string;
  current_weight_kg: number | null;
  delta_vs_7d_avg_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  goal: {
    configured: boolean;
    goal_type: string | null;
    target_weight_kg: number | null;
    target_date_local: string | null;
  };
  progress_percent: number | null;
  forecast: {
    horizon_days: number;
    weight_low_kg_at_horizon: number | null;
    weight_high_kg_at_horizon: number | null;
    eta_weeks: number | null;
    eta_uncertainty_weeks: number | null;
  };
  source: {
    label: string | null;
    last_sync_relative: string | null;
    staleness_days: number | null;
  };
}

interface BodyCompositionTileProps {
  isDark: boolean;
}

export function BodyCompositionTile({ isDark }: BodyCompositionTileProps) {
  const [showModule, setShowModule] = useState(false);

  const { data, isLoading, error } = useQuery<WeightTileResponse>({
    queryKey: ['/v1/weight/tile'],
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-2xl border p-4 animate-pulse ${
          isDark 
            ? 'bg-white/5 border-white/10' 
            : 'bg-white/60 border-black/10'
        }`}
        data-testid="tile-body-composition-loading"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-4 h-4 rounded ${isDark ? 'bg-white/20' : 'bg-gray-300'}`} />
          <div className={`h-4 w-24 rounded ${isDark ? 'bg-white/20' : 'bg-gray-300'}`} />
        </div>
        <div className={`h-10 w-20 rounded ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const getStatusVariant = (): { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string } => {
    switch (data.status_chip) {
      case 'ON_TRACK': return { 
        variant: 'outline', 
        className: isDark ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-green-600/40 text-green-700 bg-green-50' 
      };
      case 'AHEAD': return { 
        variant: 'outline', 
        className: isDark ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' : 'border-blue-600/40 text-blue-700 bg-blue-50' 
      };
      case 'BEHIND': return { 
        variant: 'outline', 
        className: isDark ? 'border-orange-500/40 text-orange-400 bg-orange-500/10' : 'border-orange-600/40 text-orange-700 bg-orange-50' 
      };
      case 'STALE': return { 
        variant: 'outline', 
        className: isDark ? 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10' : 'border-yellow-600/40 text-yellow-700 bg-yellow-50' 
      };
      default: return { 
        variant: 'secondary', 
        className: '' 
      };
    }
  };

  const getDeltaIcon = () => {
    if (data.delta_vs_7d_avg_kg === null) return null;
    if (data.delta_vs_7d_avg_kg > 0.1) return <TrendingUp className="w-4 h-4" />;
    if (data.delta_vs_7d_avg_kg < -0.1) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getDeltaColor = () => {
    if (data.delta_vs_7d_avg_kg === null) return '';
    if (data.delta_vs_7d_avg_kg > 0) return isDark ? 'text-orange-400' : 'text-orange-600';
    if (data.delta_vs_7d_avg_kg < 0) return isDark ? 'text-green-400' : 'text-green-600';
    return isDark ? 'text-white/50' : 'text-gray-500';
  };

  const bodyFatPct = data.body_fat_pct ?? 0;
  const leanMassKg = data.lean_mass_kg ?? 0;
  const hasBodyComp = data.body_fat_pct !== null;

  const fatAngle = hasBodyComp ? (bodyFatPct / 100) * 360 : 0;
  const leanAngle = hasBodyComp && data.lean_mass_kg !== null && data.current_weight_kg !== null
    ? ((data.lean_mass_kg / data.current_weight_kg) * 100 / 100) * 360
    : 0;

  return (
    <>
      <div 
        onClick={() => setShowModule(true)}
        className={`backdrop-blur-xl rounded-2xl border p-4 transition-all cursor-pointer hover:scale-[1.02] ${
          isDark 
            ? 'bg-white/5 border-white/10 hover:bg-white/10' 
            : 'bg-white/60 border-black/10 hover:bg-white/90'
        }`}
        data-testid="tile-body-composition"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Weight
            </h3>
            {data.source.label && (
              <DataSourceBadge source={data.source.label.toLowerCase().includes('health') ? 'healthkit' : 'manual'} size="sm" />
            )}
          </div>
          <GripVertical className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-300'}`} data-testid="drag-handle-body-composition" />
        </div>

        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-current-weight">
                {data.current_weight_kg !== null ? data.current_weight_kg.toFixed(1) : '--'}
              </span>
              <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                kg
              </span>
            </div>
            {data.delta_vs_7d_avg_kg !== null && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${getDeltaColor()}`}>
                {getDeltaIcon()}
                <span>{data.delta_vs_7d_avg_kg > 0 ? '+' : ''}{data.delta_vs_7d_avg_kg.toFixed(1)} vs 7d</span>
              </div>
            )}
          </div>
          
          {data.status_chip && data.status_chip !== 'NEEDS_DATA' && (
            <Badge variant={getStatusVariant().variant} className={`text-[10px] ${getStatusVariant().className}`}>
              {data.status_chip.replace('_', ' ')}
            </Badge>
          )}
        </div>

        {data.goal.configured && data.goal.target_weight_kg && (
          <div className={`flex items-center gap-2 mb-3 p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
            <Target className={`w-3 h-3 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
              Goal: {data.goal.target_weight_kg} kg
            </span>
            {data.progress_percent !== null && (
              <div className="flex-1 ml-2">
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, data.progress_percent))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {hasBodyComp && (
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke={isDark ? '#fb923c' : '#f97316'}
                  strokeWidth="6"
                  strokeDasharray={`${(fatAngle / 360) * 126} 126`}
                  strokeDashoffset="0"
                />
                {leanAngle > 0 && (
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke={isDark ? '#60a5fa' : '#3b82f6'}
                    strokeWidth="6"
                    strokeDasharray={`${(leanAngle / 360) * 126} 126`}
                    strokeDashoffset={`-${(fatAngle / 360) * 126}`}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-[10px] font-medium ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  {bodyFatPct.toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-orange-500' : 'bg-orange-600'}`} />
                <span className={`text-[10px] ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Fat</span>
                <span className={`text-[10px] ml-auto ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{bodyFatPct.toFixed(1)}%</span>
              </div>
              {leanMassKg > 0 && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-blue-500' : 'bg-blue-600'}`} />
                  <span className={`text-[10px] ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Lean</span>
                  <span className={`text-[10px] ml-auto ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{leanMassKg.toFixed(1)} kg</span>
                </div>
              )}
            </div>
          </div>
        )}

        {data.forecast.eta_weeks !== null && (
          <div className={`text-[10px] mt-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            ETA to goal: ~{data.forecast.eta_weeks} weeks
          </div>
        )}
      </div>

      {showModule && (
        <WeightModuleScreen 
          isDark={isDark}
          onClose={() => setShowModule(false)}
        />
      )}
    </>
  );
}
