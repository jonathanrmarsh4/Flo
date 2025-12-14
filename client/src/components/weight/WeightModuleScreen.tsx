import { useState } from 'react';
import { X, Scale, Target, TrendingDown, TrendingUp, Minus, ChevronRight, Plus, Activity, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, ComposedChart, ReferenceLine } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export function WeightModuleScreen({ isDark, onClose }: WeightModuleScreenProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [range, setRange] = useState<'30d' | '90d' | '6m'>('30d');
  const [showWeighInSheet, setShowWeighInSheet] = useState(false);
  const [showBodyCompSheet, setShowBodyCompSheet] = useState(false);
  const [showGoalFlow, setShowGoalFlow] = useState(false);

  const { data, isLoading, error } = useQuery<WeightOverviewResponse>({
    queryKey: [`/v1/weight/overview?range=${range}`],
  });

  const getStatusChipColor = (status: string) => {
    switch (status) {
      case 'ON_TRACK': return isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700';
      case 'AHEAD': return isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700';
      case 'BEHIND': return isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700';
      case 'STALE': return isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700';
      default: return isDark ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-100 text-gray-600';
    }
  };

  const getConfidenceLabel = (level: string) => {
    switch (level) {
      case 'HIGH': return 'High confidence';
      case 'MEDIUM': return 'Medium confidence';
      default: return 'Low confidence';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const chartData = (() => {
    if (!data) return [];
    
    const dateMap = new Map<string, {
      date: string;
      rawDate: string;
      actual: number | null;
      trend: number | null;
      forecastMid: number | null;
      forecastLow: number | null;
      forecastHigh: number | null;
      forecastBand: [number, number] | null;
    }>();
    
    const trendMap = new Map(
      data.series.trend_weight_daily.map(t => [t.local_date_key, t.value_kg])
    );
    
    data.series.actual_weight_daily.forEach((d) => {
      dateMap.set(d.local_date_key, {
        date: formatDate(d.local_date_key),
        rawDate: d.local_date_key,
        actual: d.value_kg,
        trend: trendMap.get(d.local_date_key) ?? null,
        forecastMid: null,
        forecastLow: null,
        forecastHigh: null,
        forecastBand: null,
      });
    });
    
    data.series.trend_weight_daily.forEach((d) => {
      if (!dateMap.has(d.local_date_key)) {
        dateMap.set(d.local_date_key, {
          date: formatDate(d.local_date_key),
          rawDate: d.local_date_key,
          actual: null,
          trend: d.value_kg,
          forecastMid: null,
          forecastLow: null,
          forecastHigh: null,
          forecastBand: null,
        });
      }
    });
    
    data.series.forecast_band.forEach(d => {
      const existing = dateMap.get(d.local_date_key);
      if (existing) {
        existing.forecastMid = d.mid_kg;
        existing.forecastLow = d.low_kg;
        existing.forecastHigh = d.high_kg;
        existing.forecastBand = d.low_kg !== null && d.high_kg !== null ? [d.low_kg, d.high_kg] : null;
      } else {
        dateMap.set(d.local_date_key, {
          date: formatDate(d.local_date_key),
          rawDate: d.local_date_key,
          actual: null,
          trend: null,
          forecastMid: d.mid_kg,
          forecastLow: d.low_kg,
          forecastHigh: d.high_kg,
          forecastBand: d.low_kg !== null && d.high_kg !== null ? [d.low_kg, d.high_kg] : null,
        });
      }
    });
    
    return Array.from(dateMap.values()).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  })();

  const historyData = data?.series.actual_weight_daily
    .filter(d => d.value_kg !== null)
    .sort((a, b) => b.local_date_key.localeCompare(a.local_date_key)) || [];

  const getDeltaDisplay = () => {
    const delta = data?.summary.delta_vs_7d_avg_kg;
    if (delta === null || delta === undefined) return null;
    const isPositive = delta > 0;
    const color = isPositive 
      ? (isDark ? 'text-orange-400' : 'text-orange-600')
      : (isDark ? 'text-green-400' : 'text-green-600');
    return (
      <span className={`text-sm ${color}`}>
        {isPositive ? '+' : ''}{delta.toFixed(1)} kg vs 7d avg
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" data-testid="screen-weight-module">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className={`relative w-full h-full overflow-hidden ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        <div className={`p-4 pt-[env(safe-area-inset-top)] border-b ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Scale className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <h2 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Weight & Body Composition
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-weight-module"
            >
              <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto" style={{ height: 'calc(100vh - 80px - env(safe-area-inset-top))' }}>
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={`grid w-full grid-cols-3 mb-6 ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                <TabsTrigger 
                  value="overview" 
                  className={isDark ? 'data-[state=active]:bg-white/10' : ''}
                  data-testid="tab-overview"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="history" 
                  className={isDark ? 'data-[state=active]:bg-white/10' : ''}
                  data-testid="tab-history"
                >
                  History
                </TabsTrigger>
                <TabsTrigger 
                  value="setup" 
                  className={isDark ? 'data-[state=active]:bg-white/10' : ''}
                  data-testid="tab-setup"
                >
                  Goal
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="text-center">
                  <div className={`text-5xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-current-weight">
                    {data?.summary.current_weight_kg?.toFixed(1) ?? '--'}
                    <span className={`text-lg ml-1 font-normal ${isDark ? 'text-white/60' : 'text-gray-500'}`}>kg</span>
                  </div>
                  {getDeltaDisplay()}
                  
                  {data?.summary.status_chip && (
                    <Badge className={`mt-3 ${getStatusChipColor(data.summary.status_chip)}`}>
                      {data.summary.status_chip.replace('_', ' ')}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label="Body Fat"
                    value={data?.summary.body_fat_pct !== null ? `${data?.summary.body_fat_pct}%` : '--'}
                    color="orange"
                    isDark={isDark}
                  />
                  <MetricCard
                    label="Lean Mass"
                    value={data?.summary.lean_mass_kg !== null ? `${data?.summary.lean_mass_kg?.toFixed(1)} kg` : '--'}
                    color="cyan"
                    isDark={isDark}
                  />
                </div>

                {data?.summary.goal.configured && (
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Target className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                        <span className={`text-sm font-medium ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                          Goal: {data.summary.goal.goal_type === 'LOSE' ? 'Lose' : data.summary.goal.goal_type === 'GAIN' ? 'Gain' : 'Maintain'}
                        </span>
                      </div>
                      <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {data.summary.goal.target_weight_kg} kg
                      </span>
                    </div>
                    
                    {data.summary.progress_percent !== null && (
                      <div className="space-y-2">
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

                    {data.summary.forecast.eta_weeks !== null && (
                      <div className={`mt-3 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        <Calendar className="w-3 h-3 inline mr-1" />
                        ETA: ~{data.summary.forecast.eta_weeks} weeks
                        {data.summary.forecast.eta_uncertainty_weeks && (
                          <span> (± {data.summary.forecast.eta_uncertainty_weeks} weeks)</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {chartData.length > 0 && (
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className={`text-sm font-medium ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                        Weight Trend & Forecast
                      </h3>
                      <div className="flex gap-1">
                        {(['30d', '90d', '6m'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              range === r
                                ? isDark ? 'bg-blue-500/30 text-blue-400' : 'bg-blue-100 text-blue-700'
                                : isDark ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-700'
                            }`}
                            data-testid={`button-range-${r}`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 10, fill: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis 
                            tick={{ fontSize: 10, fill: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}
                            tickLine={false}
                            axisLine={false}
                            domain={['dataMin - 2', 'dataMax + 2']}
                          />
                          <Tooltip 
                            contentStyle={{
                              backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
                              border: 'none',
                              borderRadius: '12px',
                              color: isDark ? 'white' : 'black',
                            }}
                          />
                          {data?.summary.goal.target_weight_kg && (
                            <ReferenceLine 
                              y={data.summary.goal.target_weight_kg} 
                              stroke="#a855f7" 
                              strokeDasharray="5 5" 
                              strokeOpacity={0.6}
                            />
                          )}
                          <Area 
                            type="monotone"
                            dataKey="forecastBand"
                            fill={isDark ? '#3b82f6' : '#3b82f6'}
                            fillOpacity={0.15}
                            stroke="none"
                          />
                          <Line 
                            type="monotone" 
                            dataKey="actual" 
                            stroke="#22d3ee" 
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="trend" 
                            stroke="#60a5fa" 
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                            dot={false}
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="forecastMid" 
                            stroke="#a855f7" 
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={false}
                            connectNulls
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-3 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-0.5 bg-cyan-400" />
                        <span className={isDark ? 'text-white/50' : 'text-gray-500'}>Actual</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-0.5 bg-blue-400 opacity-60" style={{ borderTop: '2px dashed' }} />
                        <span className={isDark ? 'text-white/50' : 'text-gray-500'}>Trend</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-0.5 bg-purple-500" />
                        <span className={isDark ? 'text-white/50' : 'text-gray-500'}>Forecast</span>
                      </div>
                    </div>
                  </div>
                )}

                {data && data.drivers.length > 0 && (
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
                    <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                      Key Drivers
                    </h3>
                    <div className="space-y-2">
                      {data.drivers.slice(0, 3).map((driver) => (
                        <button 
                          key={driver.driver_id}
                          onClick={() => {
                            if (driver.deeplink) {
                              window.location.href = driver.deeplink;
                            }
                          }}
                          className={`flex items-center justify-between w-full p-3 rounded-xl transition-colors ${
                            isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                          data-testid={`button-driver-${driver.driver_id}`}
                        >
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {driver.title}
                              </span>
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] px-1.5 py-0 ${
                                  driver.confidence_level === 'HIGH' 
                                    ? isDark ? 'border-green-500/50 text-green-400' : 'border-green-500 text-green-700'
                                    : driver.confidence_level === 'MEDIUM'
                                    ? isDark ? 'border-yellow-500/50 text-yellow-400' : 'border-yellow-500 text-yellow-700'
                                    : isDark ? 'border-gray-500/50 text-gray-400' : 'border-gray-400 text-gray-600'
                                }`}
                              >
                                {driver.confidence_level === 'HIGH' ? 'High' : driver.confidence_level === 'MEDIUM' ? 'Med' : 'Low'}
                              </Badge>
                            </div>
                            {driver.subtitle && (
                              <div className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                                {driver.subtitle}
                              </div>
                            )}
                          </div>
                          <ChevronRight className={`w-4 h-4 ml-2 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`text-xs text-center ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                  {data?.summary.source.label && (
                    <span>Data from {data.summary.source.label}</span>
                  )}
                  {data?.summary.source.last_sync_relative && (
                    <span> · Updated {data.summary.source.last_sync_relative}</span>
                  )}
                  {data?.summary.confidence_level && (
                    <span> · {getConfidenceLabel(data.summary.confidence_level)}</span>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
                  <h3 className={`text-sm font-medium mb-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                    Weight History
                  </h3>
                  {historyData.length === 0 ? (
                    <div className={`text-center py-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      <Scale className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No weight entries yet</p>
                      <p className="text-sm mt-1">Log your first weigh-in to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {historyData.map((entry, index) => {
                        const prevEntry = historyData[index + 1];
                        const delta = prevEntry?.value_kg 
                          ? (entry.value_kg! - prevEntry.value_kg).toFixed(1) 
                          : null;
                        return (
                          <div 
                            key={entry.local_date_key}
                            className={`flex items-center justify-between py-3 ${
                              index < historyData.length - 1 
                                ? `border-b ${isDark ? 'border-white/10' : 'border-gray-100'}` 
                                : ''
                            }`}
                          >
                            <span className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                              {new Date(entry.local_date_key).toLocaleDateString('en-US', { 
                                weekday: 'short',
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {entry.value_kg?.toFixed(1)} kg
                              </span>
                              {delta && (
                                <span className={`text-xs ${
                                  parseFloat(delta) > 0 
                                    ? isDark ? 'text-orange-400' : 'text-orange-600'
                                    : parseFloat(delta) < 0
                                    ? isDark ? 'text-green-400' : 'text-green-600'
                                    : isDark ? 'text-white/40' : 'text-gray-400'
                                }`}>
                                  {parseFloat(delta) > 0 ? '+' : ''}{delta}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {data?.data_quality && (
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
                    <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                      Data Quality
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <DataQualityItem
                        label="Weigh-ins / week"
                        value={data.data_quality.weighins_per_week_14d?.toFixed(1) ?? '--'}
                        target="7"
                        isDark={isDark}
                      />
                      <DataQualityItem
                        label="Days since last"
                        value={data.data_quality.staleness_days?.toString() ?? '--'}
                        target="< 3"
                        isDark={isDark}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="setup" className="space-y-4">
                <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
                  <h3 className={`text-sm font-medium mb-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                    Your Weight Goal
                  </h3>
                  
                  {data?.summary.goal.configured ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Goal Type</div>
                          <div className="flex items-center gap-2">
                            {data.summary.goal.goal_type === 'LOSE' && <TrendingDown className="w-4 h-4 text-orange-400" />}
                            {data.summary.goal.goal_type === 'GAIN' && <TrendingUp className="w-4 h-4 text-green-400" />}
                            {data.summary.goal.goal_type === 'MAINTAIN' && <Minus className="w-4 h-4 text-blue-400" />}
                            <span className={isDark ? 'text-white' : 'text-gray-900'}>
                              {data.summary.goal.goal_type === 'LOSE' ? 'Lose Weight' : 
                               data.summary.goal.goal_type === 'GAIN' ? 'Gain Weight' : 'Maintain'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Target</div>
                          <div className={isDark ? 'text-white' : 'text-gray-900'}>
                            {data.summary.goal.target_weight_kg} kg
                          </div>
                        </div>
                      </div>
                      
                      {data.summary.goal.target_date_local && (
                        <div>
                          <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Target Date</div>
                          <div className={isDark ? 'text-white' : 'text-gray-900'}>
                            {new Date(data.summary.goal.target_date_local).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        className={`w-full ${isDark ? 'border-white/20 text-white hover:bg-white/10' : ''}`}
                        onClick={() => setShowGoalFlow(true)}
                        data-testid="button-edit-goal"
                      >
                        Edit Goal
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <Target className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                      <p className={`mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                        Set a weight goal to get personalized forecasts and track your progress
                      </p>
                      <Button
                        onClick={() => setShowGoalFlow(true)}
                        className="w-full"
                        data-testid="button-set-goal"
                      >
                        <Target className="w-4 h-4 mr-2" />
                        Set Weight Goal
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}

          <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className={`flex gap-2 max-w-md mx-auto ${isDark ? 'bg-slate-900/90' : 'bg-white/90'} backdrop-blur-lg rounded-2xl p-2`}>
              <Button
                variant="outline"
                className={`flex-1 ${isDark ? 'border-white/20 text-white hover:bg-white/10' : ''}`}
                onClick={() => setShowWeighInSheet(true)}
                data-testid="button-log-weight"
              >
                <Plus className="w-4 h-4 mr-1" />
                Weight
              </Button>
              <Button
                variant="outline"
                className={`flex-1 ${isDark ? 'border-white/20 text-white hover:bg-white/10' : ''}`}
                onClick={() => setShowBodyCompSheet(true)}
                data-testid="button-log-body-comp"
              >
                <Activity className="w-4 h-4 mr-1" />
                Body Comp
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ManualWeighInSheet
        open={showWeighInSheet}
        onOpenChange={setShowWeighInSheet}
        isDark={isDark}
        currentWeight={data?.summary.current_weight_kg}
      />

      <BodyCompSheet
        open={showBodyCompSheet}
        onOpenChange={setShowBodyCompSheet}
        isDark={isDark}
        currentBodyFat={data?.summary.body_fat_pct}
        currentLeanMass={data?.summary.lean_mass_kg}
      />

      <GoalSetupFlow
        open={showGoalFlow}
        onOpenChange={setShowGoalFlow}
        isDark={isDark}
        currentWeight={data?.summary.current_weight_kg}
        existingGoal={data?.summary.goal}
      />
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  color: 'orange' | 'blue' | 'cyan' | 'purple';
  isDark: boolean;
}

function MetricCard({ label, value, color, isDark }: MetricCardProps) {
  const colorClasses = {
    orange: isDark ? 'text-orange-400' : 'text-orange-600',
    blue: isDark ? 'text-blue-400' : 'text-blue-600',
    cyan: isDark ? 'text-cyan-400' : 'text-cyan-600',
    purple: isDark ? 'text-purple-400' : 'text-purple-600',
  };

  return (
    <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
      <div className={`text-xs mb-1 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-xl font-semibold ${colorClasses[color]}`}>
        {value}
      </div>
    </div>
  );
}

interface DataQualityItemProps {
  label: string;
  value: string;
  target: string;
  isDark: boolean;
}

function DataQualityItem({ label, value, target, isDark }: DataQualityItemProps) {
  return (
    <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
      <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{label}</div>
      <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</div>
      <div className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>Target: {target}</div>
    </div>
  );
}
