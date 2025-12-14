import { Scale, ChevronRight, TrendingDown, TrendingUp, Minus, Info } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

  const { data: tileData, isLoading: tileLoading } = useQuery<WeightTileResponse>({
    queryKey: ['/v1/weight/tile'],
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });

  if (tileLoading) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-2xl border p-5 animate-pulse ${
          isDark 
            ? 'bg-white/5 border-white/10' 
            : 'bg-white/60 border-black/10'
        }`}
        data-testid="tile-body-composition-loading"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
          <div className={`h-4 w-32 rounded ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
        </div>
        <div className={`h-12 w-24 rounded ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
      </div>
    );
  }

  if (!tileData) {
    return null;
  }

  const getStatusChipStyle = () => {
    switch (tileData.status_chip) {
      case 'ON_TRACK': return isDark 
        ? 'bg-green-500/20 text-green-400 border-green-500/30' 
        : 'bg-green-100 text-green-700 border-green-200';
      case 'AHEAD': return isDark 
        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
        : 'bg-blue-100 text-blue-700 border-blue-200';
      case 'BEHIND': return isDark 
        ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
        : 'bg-orange-100 text-orange-700 border-orange-200';
      case 'STALE': return isDark 
        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' 
        : 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return isDark 
        ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' 
        : 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ON_TRACK': return 'On track';
      case 'AHEAD': return 'Ahead';
      case 'BEHIND': return 'Behind';
      case 'STALE': return 'Stale';
      default: return status.replace('_', ' ');
    }
  };

  const getDeltaIcon = () => {
    if (tileData.delta_vs_7d_avg_kg === null) return null;
    if (tileData.delta_vs_7d_avg_kg < -0.1) return <TrendingDown className="w-3 h-3" />;
    if (tileData.delta_vs_7d_avg_kg > 0.1) return <TrendingUp className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getConfidenceStyle = () => {
    switch (tileData.confidence_level) {
      case 'HIGH': return isDark ? 'text-green-400' : 'text-green-600';
      case 'MEDIUM': return isDark ? 'text-yellow-400' : 'text-yellow-600';
      default: return isDark ? 'text-gray-400' : 'text-gray-500';
    }
  };

  const getConfidenceText = () => {
    switch (tileData.confidence_level) {
      case 'HIGH': return 'High confidence';
      case 'MEDIUM': return 'Medium confidence';
      default: return 'Low confidence';
    }
  };

  const forecastWeeks = tileData.forecast.horizon_days ? Math.round(tileData.forecast.horizon_days / 7) : null;

  return (
    <>
      <div 
        onClick={() => setShowModule(true)}
        className={`backdrop-blur-xl rounded-2xl border p-5 transition-all cursor-pointer hover:scale-[1.01] ${
          isDark 
            ? 'bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-white/10 hover:border-white/20' 
            : 'bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-gray-300'
        }`}
        data-testid="tile-body-composition"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              isDark ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20' : 'bg-gradient-to-br from-purple-100 to-blue-100'
            }`}>
              <Scale className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div>
              <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Weight & Composition
              </h3>
              {tileData.source.last_sync_relative && (
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  {tileData.source.last_sync_relative}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {tileData.status_chip && tileData.status_chip !== 'NEEDS_DATA' && (
              <div className={`px-3 py-1 rounded-full text-xs border ${getStatusChipStyle()}`}>
                {getStatusText(tileData.status_chip)}
              </div>
            )}
            <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
          </div>
        </div>

        <div className="flex items-end gap-3 mb-4">
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-light ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-current-weight">
              {tileData.current_weight_kg !== null ? tileData.current_weight_kg.toFixed(1) : '--'}
            </span>
            <span className={`text-lg ${isDark ? 'text-white/50' : 'text-gray-500'}`}>kg</span>
          </div>
          
          {tileData.delta_vs_7d_avg_kg !== null && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              tileData.delta_vs_7d_avg_kg < 0 
                ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                : tileData.delta_vs_7d_avg_kg > 0
                  ? isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'
                  : isDark ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-100 text-gray-600'
            }`} data-testid="badge-weight-delta">
              {getDeltaIcon()}
              <span>{Math.abs(tileData.delta_vs_7d_avg_kg).toFixed(1)} kg vs 7d avg</span>
            </div>
          )}
        </div>

        {(tileData.body_fat_pct !== null || tileData.lean_mass_kg !== null) && (
          <div className={`grid grid-cols-2 gap-3 mb-4 p-3 rounded-xl ${
            isDark ? 'bg-white/5' : 'bg-gray-50'
          }`}>
            <div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Body fat</p>
              <p className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-body-fat">
                {tileData.body_fat_pct !== null ? `${tileData.body_fat_pct.toFixed(1)}%` : '--'}
              </p>
            </div>
            <div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Lean mass</p>
              <p className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-lean-mass">
                {tileData.lean_mass_kg !== null ? `${tileData.lean_mass_kg.toFixed(1)} kg` : '--'}
              </p>
            </div>
          </div>
        )}

        {tileData.goal.configured && tileData.goal.target_weight_kg && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                Goal: {tileData.goal.target_weight_kg} kg
              </span>
              {tileData.progress_percent !== null && (
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  {Math.round(tileData.progress_percent)}%
                </span>
              )}
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, tileData.progress_percent ?? 0))}%` }}
              />
            </div>
          </div>
        )}

        {forecastWeeks && tileData.forecast.weight_low_kg_at_horizon && tileData.forecast.weight_high_kg_at_horizon && (
          <div className={`flex items-center justify-between mb-4 p-3 rounded-xl ${
            isDark ? 'bg-white/5' : 'bg-gray-50'
          }`}>
            <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Forecast ({forecastWeeks}w)
            </span>
            <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-forecast-range">
              {tileData.forecast.weight_low_kg_at_horizon.toFixed(1)}–{tileData.forecast.weight_high_kg_at_horizon.toFixed(1)} kg
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded ${isDark ? 'bg-red-500/20' : 'bg-red-100'} flex items-center justify-center`}>
              <span className="text-[8px]">♥</span>
            </div>
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {tileData.source.label || 'No source'}
            </span>
          </div>
          
          {tileData.confidence_level && (
            <div className={`flex items-center gap-1 text-xs ${getConfidenceStyle()}`}>
              <Info className="w-3 h-3" />
              <span>{getConfidenceText()}</span>
            </div>
          )}
        </div>
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
