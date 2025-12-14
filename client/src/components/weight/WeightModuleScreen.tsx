import { useState, useMemo } from 'react';
import { X, Plus, Scale, Activity, Zap, Calendar, Target, Moon, Footprints, Drumstick, ChevronRight, AlertCircle, Loader2, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ManualWeighInSheet } from './ManualWeighInSheet';
import { BodyCompSheet } from './BodyCompSheet';
import { GoalSetupFlow } from './GoalSetupFlow';

interface WeightOverviewResponse {
  summary: {
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
  };
  series: {
    actual_weight_daily: Array<{ local_date_key: string; value_kg: number | null }>;
    trend_weight_daily: Array<{ local_date_key: string; value_kg: number | null }>;
    forecast_band: Array<{ local_date_key: string; low_kg: number | null; mid_kg: number | null; high_kg: number | null }>;
  };
  drivers: Array<{
    rank: number;
    driver_id: string;
    title: string;
    subtitle: string | null;
    confidence_level: string;
    deeplink: string;
  }>;
  simulator: {
    levers: Array<{ lever_id: string; title: string; effort: string }>;
    results: Array<{
      lever_id: string;
      lever_title: string;
      effort: string;
      forecast_low_kg_at_horizon: number | null;
      forecast_high_kg_at_horizon: number | null;
      eta_weeks: number | null;
      confidence_level: string;
    }>;
  };
  data_quality: {
    weighins_per_week_14d: number | null;
    staleness_days: number | null;
    nutrition_days_14d: number | null;
    cgm_days_14d: number | null;
  };
}

interface WeightModuleScreenProps {
  isDark: boolean;
  onClose: () => void;
}

type Tab = 'overview' | 'history' | 'setup';

export function WeightModuleScreen({ isDark, onClose }: WeightModuleScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showWeighInSheet, setShowWeighInSheet] = useState(false);
  const [showBodyCompSheet, setShowBodyCompSheet] = useState(false);
  const [showGoalSetup, setShowGoalSetup] = useState(false);
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180'>('30');

  const rangeParam = timeRange === '30' ? '30d' : timeRange === '90' ? '90d' : '6m';
  
  const { data, isLoading, error } = useQuery<WeightOverviewResponse>({
    queryKey: [`/v1/weight/overview?range=${rangeParam}`],
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getStatusChipText = (status: string) => {
    switch (status) {
      case 'ON_TRACK': return 'On track';
      case 'AHEAD': return 'Ahead';
      case 'BEHIND': return 'Behind';
      case 'STALE': return 'Stale data';
      default: return status.replace('_', ' ');
    }
  };

  const getStatusChipColor = (status: string) => {
    switch (status) {
      case 'ON_TRACK': return isDark ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-green-100 text-green-700 border-green-200';
      case 'AHEAD': return isDark ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-blue-100 text-blue-700 border-blue-200';
      case 'BEHIND': return isDark ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-orange-100 text-orange-700 border-orange-200';
      case 'STALE': return isDark ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return isDark ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' : 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'HIGH': return isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700';
      case 'MEDIUM': return isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700';
      default: return isDark ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-100 text-gray-600';
    }
  };

  const weightChartData = useMemo(() => {
    if (!data) return [];
    
    const dateMap = new Map<string, {
      date: string;
      rawDate: string;
      actualWeight: number | null;
      trendWeight: number | null;
      forecastLow: number | null;
      forecastMid: number | null;
      forecastHigh: number | null;
      forecastRange: number | null;
      goal: number | null;
    }>();

    data.series.actual_weight_daily.forEach((d) => {
      dateMap.set(d.local_date_key, {
        date: formatDate(d.local_date_key),
        rawDate: d.local_date_key,
        actualWeight: d.value_kg,
        trendWeight: null,
        forecastLow: null,
        forecastMid: null,
        forecastHigh: null,
        forecastRange: null,
        goal: data.summary.goal.target_weight_kg,
      });
    });

    data.series.trend_weight_daily.forEach(d => {
      const existing = dateMap.get(d.local_date_key);
      if (existing) {
        existing.trendWeight = d.value_kg;
      } else {
        dateMap.set(d.local_date_key, {
          date: formatDate(d.local_date_key),
          rawDate: d.local_date_key,
          actualWeight: null,
          trendWeight: d.value_kg,
          forecastLow: null,
          forecastMid: null,
          forecastHigh: null,
          forecastRange: null,
          goal: data.summary.goal.target_weight_kg,
        });
      }
    });

    data.series.forecast_band.forEach(d => {
      const existing = dateMap.get(d.local_date_key);
      if (existing) {
        existing.forecastLow = d.low_kg;
        existing.forecastMid = d.mid_kg;
        existing.forecastHigh = d.high_kg;
        existing.forecastRange = d.low_kg !== null && d.high_kg !== null ? d.high_kg - d.low_kg : null;
      } else {
        dateMap.set(d.local_date_key, {
          date: formatDate(d.local_date_key),
          rawDate: d.local_date_key,
          actualWeight: null,
          trendWeight: null,
          forecastLow: d.low_kg,
          forecastMid: d.mid_kg,
          forecastHigh: d.high_kg,
          forecastRange: d.low_kg !== null && d.high_kg !== null ? d.high_kg - d.low_kg : null,
          goal: data.summary.goal.target_weight_kg,
        });
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [data]);

  const historyData = useMemo(() => {
    if (!data) return [];
    return data.series.actual_weight_daily
      .filter(d => d.value_kg !== null)
      .sort((a, b) => b.local_date_key.localeCompare(a.local_date_key))
      .map((d, idx) => ({
        id: `weight-${d.local_date_key}-${idx}`,
        date: d.local_date_key,
        weight: d.value_kg,
        source: data.summary.source.label || 'Unknown',
        editable: false,
      }));
  }, [data]);

  const currentWeight = data?.summary.current_weight_kg;
  const goalWeight = data?.summary.goal.target_weight_kg;
  const bodyFatPct = data?.summary.body_fat_pct;
  const leanMassKg = data?.summary.lean_mass_kg;

  const weightYDomain = useMemo(() => {
    if (!currentWeight) return ['auto', 'auto'];
    const goalWeight = data?.summary.goal.target_weight_kg;
    if (goalWeight) {
      const minVal = Math.min(currentWeight, goalWeight) - 5;
      const maxVal = Math.max(currentWeight, goalWeight) + 5;
      return [Math.floor(minVal), Math.ceil(maxVal)];
    }
    return [currentWeight - 25, currentWeight + 25];
  }, [currentWeight, data?.summary.goal.target_weight_kg]);

  const getDriverIcon = (driverId: string) => {
    if (driverId.includes('sleep')) return Moon;
    if (driverId.includes('step') || driverId.includes('activity')) return Footprints;
    return Drumstick;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" data-testid="screen-weight-module">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`absolute inset-0 ${
          isDark 
            ? 'bg-gradient-to-b from-slate-900 to-black' 
            : 'bg-gradient-to-b from-white to-gray-50'
        }`}
      >
        <div className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
          isDark ? 'bg-slate-900/90 border-white/10' : 'bg-white/90 border-black/10'
        }`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                isDark ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20' : 'bg-gradient-to-br from-purple-100 to-blue-100'
              }`}>
                <Scale className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
              <h1 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Weight & Composition
              </h1>
            </div>
            
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all hover:scale-110 ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-weight-module"
            >
              <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </button>
          </div>

          <div className="px-6 pb-2">
            <div className={`flex gap-2 p-1 rounded-xl ${
              isDark ? 'bg-white/5' : 'bg-gray-100'
            }`}>
              {[
                { id: 'overview' as const, label: 'Overview' },
                { id: 'history' as const, label: 'History' },
                { id: 'setup' as const, label: 'Setup' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm transition-all ${
                    activeTab === tab.id
                      ? isDark
                        ? 'bg-white text-black'
                        : 'bg-white text-gray-900 shadow-sm'
                      : isDark
                        ? 'text-white/70 hover:text-white'
                        : 'text-gray-600 hover:text-gray-900'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-6 space-y-6" style={{ height: 'calc(100vh - 140px - env(safe-area-inset-top) - env(safe-area-inset-bottom))', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            </div>
          ) : error ? (
            <div className={`text-center py-20 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Unable to load weight data</p>
              <p className="text-sm mt-1 opacity-70">Please try again later</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <>
                  <div className={`rounded-2xl p-6 ${
                    isDark ? 'bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/10' : 'bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200'
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className={`text-sm mb-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Current weight</p>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-5xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-current-weight">
                            {currentWeight?.toFixed(1) ?? '--'}
                          </span>
                          <span className={`text-2xl ${isDark ? 'text-white/50' : 'text-gray-500'}`}>kg</span>
                        </div>
                        <p className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {data?.summary.source.last_sync_relative ? `Last weigh-in: ${data.summary.source.last_sync_relative}` : 'No recent data'}
                        </p>
                      </div>
                      
                      {data?.summary.status_chip && (
                        <div className={`px-3 py-1.5 rounded-full text-xs border ${getStatusChipColor(data.summary.status_chip)}`}>
                          {getStatusChipText(data.summary.status_chip)}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowWeighInSheet(true)}
                        className={`flex-1 py-3 rounded-xl text-sm transition-all active:scale-95 ${
                          isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-gray-900 text-white hover:bg-gray-800'
                        }`}
                        data-testid="button-log-weighin"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <Plus className="w-4 h-4" />
                          Log weigh-in
                        </span>
                      </button>
                      
                      <button
                        onClick={() => setShowGoalSetup(true)}
                        className={`flex-1 py-3 rounded-xl text-sm border transition-all active:scale-95 ${
                          isDark ? 'border-white/20 text-white hover:bg-white/5' : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                        }`}
                        data-testid="button-edit-goal"
                      >
                        Edit goal
                      </button>
                    </div>
                  </div>

                  {weightChartData.length > 0 && (
                    <div className={`rounded-2xl p-6 ${
                      isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>Trajectory</h3>
                        
                        <div className={`flex gap-1 p-1 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} data-testid="container-time-range-chips">
                          {(['30', '90', '180'] as const).map((range) => (
                            <button
                              key={range}
                              onClick={() => setTimeRange(range)}
                              className={`px-3 py-1 rounded text-xs transition-all ${
                                timeRange === range
                                  ? isDark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'
                                  : isDark ? 'text-white/50' : 'text-gray-500'
                              }`}
                              data-testid={`button-range-${range}d`}
                            >
                              {range}d
                            </button>
                          ))}
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={weightChartData}>
                          <defs>
                            <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="projectionGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#ffffff20' : '#00000010'} />
                          <XAxis 
                            dataKey="date" 
                            stroke={isDark ? '#ffffff40' : '#00000040'}
                            style={{ fontSize: '11px' }}
                            interval={timeRange === '30' ? 6 : timeRange === '90' ? 13 : 29}
                            tickMargin={5}
                          />
                          <YAxis 
                            stroke={isDark ? '#ffffff40' : '#00000040'}
                            style={{ fontSize: '12px' }}
                            domain={weightYDomain as [number, number]}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDark ? '#1e293b' : '#ffffff',
                              border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                              borderRadius: '8px',
                              color: isDark ? '#ffffff' : '#000000'
                            }}
                          />
                          {goalWeight && (
                            <ReferenceLine y={goalWeight} stroke="#8b5cf6" strokeDasharray="5 5" label="Goal" />
                          )}
                          
                          <Area
                            type="monotone"
                            dataKey="actualWeight"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#weightGradient)"
                            connectNulls
                          />
                          
                          <Area
                            type="monotone"
                            dataKey="forecastLow"
                            stroke="none"
                            fill="transparent"
                            stackId="1"
                          />
                          <Area
                            type="monotone"
                            dataKey="forecastRange"
                            stroke="none"
                            fill="url(#projectionGradient)"
                            stackId="1"
                          />
                          
                          <Line
                            type="monotone"
                            dataKey="trendWeight"
                            stroke={isDark ? '#60a5fa' : '#3b82f6'}
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={false}
                            connectNulls
                            name="Trend"
                          />
                          <Line
                            type="monotone"
                            dataKey="forecastMid"
                            stroke={isDark ? '#a78bfa' : '#8b5cf6'}
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            connectNulls
                            name="Forecast"
                          />
                          <Line
                            type="monotone"
                            dataKey="forecastLow"
                            stroke={isDark ? '#94a3b8' : '#64748b'}
                            strokeWidth={1}
                            strokeDasharray="4 4"
                            dot={false}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="forecastHigh"
                            stroke={isDark ? '#94a3b8' : '#64748b'}
                            strokeWidth={1}
                            strokeDasharray="4 4"
                            dot={false}
                            connectNulls
                          />
                        </AreaChart>
                      </ResponsiveContainer>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {data?.summary.forecast.weight_low_kg_at_horizon && data?.summary.forecast.weight_high_kg_at_horizon && (
                          <div className={`px-3 py-1.5 rounded-lg text-xs ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                            <span className={isDark ? 'text-white/70' : 'text-gray-700'}>Forecast ({data.summary.forecast.horizon_days}d): </span>
                            <span className={isDark ? 'text-white' : 'text-gray-900'}>
                              {data.summary.forecast.weight_low_kg_at_horizon.toFixed(1)}–{data.summary.forecast.weight_high_kg_at_horizon.toFixed(1)} kg
                            </span>
                          </div>
                        )}
                        {data?.summary.forecast.eta_weeks && (
                          <div className={`px-3 py-1.5 rounded-lg text-xs ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                            <span className={isDark ? 'text-white/70' : 'text-gray-700'}>ETA: </span>
                            <span className={isDark ? 'text-white' : 'text-gray-900'}>
                              ~{data.summary.forecast.eta_weeks} weeks
                              {data.summary.forecast.eta_uncertainty_weeks && ` (±${data.summary.forecast.eta_uncertainty_weeks})`}
                            </span>
                          </div>
                        )}
                        {data?.summary.confidence_level && (
                          <div className={`px-3 py-1.5 rounded-lg text-xs ${getConfidenceColor(data.summary.confidence_level)}`}>
                            {data.summary.confidence_level === 'HIGH' ? 'High' : data.summary.confidence_level === 'MEDIUM' ? 'Medium' : 'Low'} confidence
                          </div>
                        )}
                      </div>

                      <p className={`text-xs mt-3 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                        Ranges widen when weigh-ins are infrequent. More weigh-ins improves accuracy.
                      </p>
                    </div>
                  )}

                  {data?.summary.goal.configured && (
                    <div className={`rounded-2xl p-5 ${
                      isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                    }`}>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Goal</h3>
                          <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                            {data.summary.goal.goal_type === 'LOSE' ? 'Reach' : data.summary.goal.goal_type === 'GAIN' ? 'Gain to' : 'Maintain'} {goalWeight} kg
                            {data.summary.goal.target_date_local && ` by ${formatDate(data.summary.goal.target_date_local)}`}
                          </p>
                        </div>
                        <Target className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                      </div>

                      {data.summary.progress_percent !== null && (
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-xs">
                            <span className={isDark ? 'text-white/50' : 'text-gray-500'}>Progress</span>
                            <span className={isDark ? 'text-white/80' : 'text-gray-700'}>{Math.round(data.summary.progress_percent)}%</span>
                          </div>
                          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                            <div 
                              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, data.summary.progress_percent))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(bodyFatPct !== null || leanMassKg !== null) && (
                    <div className={`rounded-2xl p-5 ${
                      isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                    }`}>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Body Composition</h3>
                          <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                            {data?.summary.source.last_sync_relative ? `Last updated: ${data.summary.source.last_sync_relative}` : 'No data'}
                          </p>
                        </div>
                        <Activity className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                      </div>

                      {bodyFatPct !== null && bodyFatPct !== undefined && currentWeight && (
                        <div className="mb-4">
                          <div className="h-6 rounded-full overflow-hidden flex" data-testid="chart-body-composition-bar">
                            <div 
                              className="h-full bg-gradient-to-r from-orange-400 to-orange-500 flex items-center justify-center"
                              style={{ width: `${bodyFatPct}%` }}
                            >
                              {bodyFatPct >= 15 && (
                                <span className="text-xs text-white font-medium">{bodyFatPct}%</span>
                              )}
                            </div>
                            <div 
                              className="h-full bg-gradient-to-r from-blue-400 to-blue-500 flex items-center justify-center"
                              style={{ width: `${100 - bodyFatPct}%` }}
                            >
                              {(100 - bodyFatPct) >= 15 && (
                                <span className="text-xs text-white font-medium">{(100 - bodyFatPct).toFixed(0)}%</span>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-between mt-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-orange-400 to-orange-500" />
                              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Fat</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-400 to-blue-500" />
                              <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Lean</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className={`p-3 rounded-xl ${isDark ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
                          <p className={`text-xs mb-1 ${isDark ? 'text-orange-300/70' : 'text-orange-700'}`}>Body fat</p>
                          <p className={`text-xl font-medium ${isDark ? 'text-orange-300' : 'text-orange-700'}`} data-testid="text-body-fat">
                            {bodyFatPct !== null ? `${bodyFatPct}%` : '--'}
                          </p>
                          {bodyFatPct !== null && bodyFatPct !== undefined && currentWeight && (
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-orange-300/50' : 'text-orange-600/70'}`}>
                              {(currentWeight * bodyFatPct / 100).toFixed(1)} kg
                            </p>
                          )}
                        </div>
                        <div className={`p-3 rounded-xl ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                          <p className={`text-xs mb-1 ${isDark ? 'text-blue-300/70' : 'text-blue-700'}`}>Lean mass</p>
                          <p className={`text-xl font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`} data-testid="text-lean-mass">
                            {leanMassKg !== null && leanMassKg !== undefined ? `${leanMassKg.toFixed(1)} kg` : '--'}
                          </p>
                          {leanMassKg !== null && leanMassKg !== undefined && currentWeight && (
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-blue-300/50' : 'text-blue-600/70'}`}>
                              {((leanMassKg / currentWeight) * 100).toFixed(0)}% of total
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setShowBodyCompSheet(true)}
                        className={`w-full mt-4 py-2.5 rounded-xl text-sm border transition-all ${
                          isDark ? 'border-white/20 text-white hover:bg-white/5' : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                        }`}
                        data-testid="button-update-composition"
                      >
                        Update composition
                      </button>
                    </div>
                  )}

                  {/* Key Drivers Section - always visible with fallback */}
                  <div className={`rounded-2xl p-5 ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                  }`}>
                    <h3 className={`mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Key Drivers</h3>
                    
                    {data && data.drivers.length > 0 ? (
                      <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-gray-200'}`} data-testid="table-key-drivers">
                        <div className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 text-xs ${
                          isDark ? 'bg-white/5 text-white/50' : 'bg-gray-50 text-gray-500'
                        }`}>
                          <span>Driver</span>
                          <span className="text-center">Trend</span>
                          <span className="text-center">Confidence</span>
                          <span></span>
                        </div>
                        
                        {data.drivers.slice(0, 5).map((driver, idx) => {
                          const IconComponent = getDriverIcon(driver.driver_id);
                          const hasTrendUp = driver.subtitle?.includes('+') || driver.subtitle?.toLowerCase().includes('increase');
                          const hasTrendDown = driver.subtitle?.includes('-') || driver.subtitle?.toLowerCase().includes('decrease');
                          
                          return (
                            <button
                              key={driver.driver_id}
                              onClick={() => {
                                if (driver.deeplink) {
                                  window.location.href = driver.deeplink;
                                }
                              }}
                              className={`w-full grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 transition-all text-left ${
                                idx !== data.drivers.slice(0, 5).length - 1 ? (isDark ? 'border-b border-white/5' : 'border-b border-gray-100') : ''
                              } ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                              data-testid={`row-driver-${driver.driver_id}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`p-1.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-100'}`}>
                                  <IconComponent className={`w-4 h-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {driver.title}
                                  </p>
                                  {driver.subtitle && (
                                    <p className={`text-xs truncate ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                                      {driver.subtitle}
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex justify-center">
                                {hasTrendUp && (
                                  <div className={`p-1 rounded ${isDark ? 'bg-green-500/20' : 'bg-green-100'}`}>
                                    <TrendingUp className={`w-3.5 h-3.5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                                  </div>
                                )}
                                {hasTrendDown && (
                                  <div className={`p-1 rounded ${isDark ? 'bg-red-500/20' : 'bg-red-100'}`}>
                                    <TrendingDown className={`w-3.5 h-3.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                                  </div>
                                )}
                                {!hasTrendUp && !hasTrendDown && (
                                  <div className={`p-1 rounded ${isDark ? 'bg-gray-500/20' : 'bg-gray-100'}`}>
                                    <Minus className={`w-3.5 h-3.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                                  </div>
                                )}
                              </div>
                              
                              <div className={`px-2 py-0.5 rounded text-xs text-center ${
                                driver.confidence_level === 'HIGH'
                                  ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                                  : driver.confidence_level === 'MEDIUM'
                                    ? isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
                                    : isDark ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {driver.confidence_level.charAt(0) + driver.confidence_level.slice(1).toLowerCase()}
                              </div>
                              
                              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`text-center py-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`} data-testid="empty-key-drivers">
                        <Activity className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
                        <p className="text-sm mb-1">Building your driver analysis</p>
                        <p className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                          Continue tracking to discover what impacts your weight
                        </p>
                      </div>
                    )}
                  </div>

                  {/* What-If Simulator Section - always visible with fallback */}
                  <div className={`rounded-2xl p-5 ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>What if...</h3>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Explore different scenarios
                        </p>
                      </div>
                      <Zap className={`w-5 h-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
                    </div>

                    {data?.simulator?.results && data.simulator.results.length > 0 ? (
                      <>
                        <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-gray-200'}`} data-testid="table-what-if-simulator">
                          <div className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 text-xs ${
                            isDark ? 'bg-white/5 text-white/50' : 'bg-gray-50 text-gray-500'
                          }`}>
                            <span>Scenario</span>
                            <span className="text-center">Effort</span>
                            <span className="text-center">Delta</span>
                            <span className="text-center">ETA</span>
                          </div>
                          
                          {data.simulator.results.slice(0, 5).map((result, idx) => {
                            const baselineWeight = data.summary.forecast.weight_low_kg_at_horizon && data.summary.forecast.weight_high_kg_at_horizon
                              ? (data.summary.forecast.weight_low_kg_at_horizon + data.summary.forecast.weight_high_kg_at_horizon) / 2
                              : currentWeight;
                            
                            const deltaLow = result.forecast_low_kg_at_horizon != null && baselineWeight != null
                              ? result.forecast_low_kg_at_horizon - baselineWeight 
                              : null;
                            const deltaHigh = result.forecast_high_kg_at_horizon != null && baselineWeight != null
                              ? result.forecast_high_kg_at_horizon - baselineWeight 
                              : null;
                            
                            return (
                              <div
                                key={`${result.lever_id}-${result.effort}`}
                                className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 ${
                                  idx !== data.simulator.results.slice(0, 5).length - 1 ? (isDark ? 'border-b border-white/5' : 'border-b border-gray-100') : ''
                                } ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-all cursor-pointer`}
                                data-testid={`row-simulator-${result.lever_id}`}
                              >
                                <div className="min-w-0">
                                  <p className={`text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {result.lever_title}
                                  </p>
                                </div>
                                
                                <div className={`px-2 py-0.5 rounded text-xs text-center ${
                                  result.effort === 'low' || result.effort === 'LOW'
                                    ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                                    : result.effort === 'medium' || result.effort === 'MEDIUM'
                                      ? isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
                                      : isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {result.effort.charAt(0).toUpperCase() + result.effort.slice(1).toLowerCase()}
                                </div>
                                
                                <div className="text-center">
                                  {deltaLow !== null && deltaHigh !== null ? (
                                    <span className={`text-xs ${
                                      deltaLow < 0 
                                        ? isDark ? 'text-green-400' : 'text-green-600'
                                        : isDark ? 'text-orange-400' : 'text-orange-600'
                                    }`}>
                                      {deltaLow < 0 ? '' : '+'}{deltaLow.toFixed(1)} to {deltaHigh < 0 ? '' : '+'}{deltaHigh.toFixed(1)} kg
                                    </span>
                                  ) : (
                                    <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>--</span>
                                  )}
                                </div>
                                
                                <div className="flex items-center justify-center gap-1">
                                  <Clock className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
                                  <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                                    {result.eta_weeks ? `${result.eta_weeks}w` : '--'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        <p className={`text-xs mt-3 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                          Estimates based on your current trends and behavior patterns
                        </p>
                      </>
                    ) : (
                      <div className={`text-center py-6 ${isDark ? 'text-white/50' : 'text-gray-500'}`} data-testid="empty-what-if-simulator">
                        <Target className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
                        <p className="text-sm mb-1">Scenarios coming soon</p>
                        <p className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                          More data is needed to model what-if scenarios
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'history' && (
                <>
                  <div className={`rounded-2xl p-5 ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Weigh-ins</h3>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Review imported and manual entries
                        </p>
                      </div>
                      
                      <button
                        onClick={() => setShowWeighInSheet(true)}
                        className={`px-4 py-2 rounded-xl text-sm transition-all ${
                          isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-gray-900 text-white hover:bg-gray-800'
                        }`}
                        data-testid="button-log-weighin-history"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          Log weigh-in
                        </span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {historyData.length === 0 ? (
                        <p className={`text-center py-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          No weight entries yet
                        </p>
                      ) : (
                        historyData.slice(0, 20).map((entry) => (
                          <div
                            key={entry.id}
                            className={`p-4 rounded-xl border ${
                              isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                            }`}
                            data-testid={`history-row-${entry.id}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {entry.weight?.toFixed(1)} kg
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                                    {formatDate(entry.date)}
                                  </span>
                                  <span className={isDark ? 'text-white/30' : 'text-gray-400'}>|</span>
                                  <span className={`px-2 py-0.5 rounded ${
                                    isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {entry.source}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'setup' && (
                <>
                  <div className={`rounded-2xl p-5 ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Goal</h3>
                        <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          {data?.summary.goal.configured 
                            ? `${data.summary.goal.goal_type === 'LOSE' ? 'Lose weight to' : data.summary.goal.goal_type === 'GAIN' ? 'Gain weight to' : 'Maintain'} ${goalWeight} kg`
                            : 'No goal configured'}
                        </p>
                      </div>
                      <Target className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                    </div>
                    
                    <button
                      onClick={() => setShowGoalSetup(true)}
                      className={`w-full py-3 rounded-xl text-sm border transition-all ${
                        isDark ? 'border-white/20 text-white hover:bg-white/5' : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                      }`}
                      data-testid="button-edit-goal-setup"
                    >
                      {data?.summary.goal.configured ? 'Edit goal' : 'Set goal'}
                    </button>
                  </div>

                  <div className={`rounded-2xl p-5 ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Apple Health</h3>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            data?.summary.source.label ? (isDark ? 'bg-green-400' : 'bg-green-500') : (isDark ? 'bg-gray-400' : 'bg-gray-500')
                          }`} />
                          <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                            {data?.summary.source.label ? 'Connected' : 'Not connected'}
                          </p>
                        </div>
                      </div>
                      <Activity className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                    </div>
                    
                    {data?.summary.source.last_sync_relative && (
                      <p className={`text-sm mb-4 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        Last synced: {data.summary.source.last_sync_relative}
                      </p>
                    )}

                    <button
                      className={`w-full py-3 rounded-xl text-sm border transition-all ${
                        isDark ? 'border-white/20 text-white hover:bg-white/5' : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                      }`}
                      data-testid="button-manage-permissions"
                    >
                      Manage permissions
                    </button>
                  </div>

                  <div className={`rounded-2xl p-5 ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                  }`}>
                    <div className="flex items-center gap-3 mb-4">
                      <Calendar className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                      <div>
                        <h3 className={`mb-0.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>Check-in cadence</h3>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          More weigh-ins improves accuracy
                        </p>
                      </div>
                    </div>

                    <div className={`flex gap-2 p-1 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} data-testid="container-cadence-options">
                      {['Daily', '3x/week', 'Weekly'].map((cadence, idx) => (
                        <button
                          key={cadence}
                          className={`flex-1 py-2 rounded text-sm transition-all ${
                            idx === 1
                              ? isDark ? 'bg-white text-black' : 'bg-white text-gray-900 shadow-sm'
                              : isDark ? 'text-white/70' : 'text-gray-600'
                          }`}
                          data-testid={`button-cadence-${cadence.toLowerCase().replace('/', '-')}`}
                        >
                          {cadence}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </motion.div>

      <ManualWeighInSheet
        open={showWeighInSheet}
        onOpenChange={setShowWeighInSheet}
        isDark={isDark}
        currentWeight={currentWeight}
      />
      
      <BodyCompSheet
        open={showBodyCompSheet}
        onOpenChange={setShowBodyCompSheet}
        isDark={isDark}
        currentBodyFat={bodyFatPct}
        currentLeanMass={leanMassKg}
      />

      <GoalSetupFlow
        open={showGoalSetup}
        onOpenChange={setShowGoalSetup}
        isDark={isDark}
        currentWeight={currentWeight}
        existingGoal={data?.summary.goal}
      />
    </div>
  );
}
