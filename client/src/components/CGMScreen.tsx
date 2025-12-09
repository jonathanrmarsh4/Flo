import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Settings,
  Droplet,
  Activity,
  TrendingUp,
  AlertTriangle,
  Check,
  X,
  ChevronLeft,
  Link2,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
  ReferenceArea,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface CGMScreenProps {
  isDark: boolean;
  onBack: () => void;
}

interface CGMStatus {
  connected: boolean;
  isSandbox?: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
  syncStatus?: 'active' | 'error' | 'disconnected';
  errorMessage?: string;
}

interface CGMReading {
  value: number;
  valueMmol: number;
  trend: string;
  trendRate: number;
  recordedAt: string;
  source: string;
}

interface CGMData {
  currentReading: CGMReading | null;
  readings: Array<{
    valueMmol: number;
    timestamp: string;
    timeLabel: string;
  }>;
  stats: {
    avgGlucose: number;
    minGlucose: number;
    maxGlucose: number;
    timeInRange: number;
    estimatedA1c: number;
    lowAlerts: number;
  };
  targetRange: {
    low: number;
    high: number;
  };
}

export function CGMScreen({ isDark, onBack }: CGMScreenProps) {
  const [trendRange, setTrendRange] = useState<'3h' | '6h' | '24h'>('6h');
  const [showSettings, setShowSettings] = useState(false);

  const { data: cgmStatus, isLoading: statusLoading } = useQuery<CGMStatus>({
    queryKey: ['/api/dexcom/status'],
    staleTime: 60 * 1000,
  });

  const { data: cgmData, isLoading: dataLoading } = useQuery<CGMData>({
    queryKey: ['/api/cgm/data', { range: trendRange }],
    enabled: cgmStatus?.connected === true,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', '/api/dexcom/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dexcom/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cgm/data'] });
    },
  });

  const handleConnectCGM = () => {
    window.location.href = '/api/auth/dexcom/connect';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'risingFast':
      case 'doubleUp':
        return <ArrowUp className="w-10 h-10" />;
      case 'rising':
      case 'singleUp':
      case 'fortyFiveUp':
        return <ArrowUpRight className="w-10 h-10" />;
      case 'stable':
      case 'flat':
        return <Minus className="w-10 h-10" />;
      case 'falling':
      case 'singleDown':
      case 'fortyFiveDown':
        return <ArrowDownRight className="w-10 h-10" />;
      case 'fallingFast':
      case 'doubleDown':
        return <ArrowDown className="w-10 h-10" />;
      default:
        return <Minus className="w-10 h-10" />;
    }
  };

  const getTrendLabel = (trend: string) => {
    switch (trend) {
      case 'risingFast':
      case 'doubleUp':
        return 'Rising fast';
      case 'rising':
      case 'singleUp':
      case 'fortyFiveUp':
        return 'Rising';
      case 'stable':
      case 'flat':
        return 'Stable';
      case 'falling':
      case 'singleDown':
      case 'fortyFiveDown':
        return 'Falling';
      case 'fallingFast':
      case 'doubleDown':
        return 'Dropping quickly';
      default:
        return 'Unknown';
    }
  };

  // Loading state
  if (statusLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'}`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-white/60' : 'text-gray-400'}`} />
      </div>
    );
  }

  // Not connected - show connection card
  if (!cgmStatus?.connected) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'} pb-24`}>
        {/* Header */}
        <div
          className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
            isDark
              ? 'bg-black/80 border-white/10'
              : 'bg-white/80 border-gray-200'
          }`}
        >
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={onBack}
                className={`p-2 rounded-xl transition-all ${
                  isDark
                    ? 'hover:bg-white/10 text-white'
                    : 'hover:bg-gray-100 text-gray-900'
                }`}
                data-testid="button-cgm-back"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            </div>
            <h1 className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Glucose
            </h1>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Continuous glucose monitoring
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="px-3 py-1 rounded-full text-xs flex items-center gap-1.5 bg-gray-500/20 text-gray-400">
                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                Not connected
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-3xl border backdrop-blur-xl ${
              isDark
                ? 'bg-white/5 border-white/10'
                : 'bg-white/60 border-gray-200'
            }`}
          >
            <div className="text-center py-8">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Activity className="w-10 h-10 text-white" />
                </div>
              </div>
              <h4 className={`text-2xl mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Connect Your CGM
              </h4>
              <p className={`text-sm mb-8 max-w-sm mx-auto ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                Link your Dexcom to see real-time glucose data, trends, time-in-range analysis, and AI-powered insights.
              </p>
              <Button 
                onClick={handleConnectCGM}
                className="gap-2 px-8 py-3"
                data-testid="button-connect-dexcom"
              >
                <Link2 className="w-4 h-4" />
                Connect Dexcom
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Connected - show full CGM screen
  const currentReading = cgmData?.currentReading;
  const readings = cgmData?.readings ?? [];
  const stats = cgmData?.stats ?? {
    avgGlucose: 0,
    minGlucose: 0,
    maxGlucose: 0,
    timeInRange: 0,
    estimatedA1c: 0,
    lowAlerts: 0,
  };
  const targetRange = cgmData?.targetRange ?? { low: 3.9, high: 7.8 };

  const currentGlucose = currentReading?.valueMmol ?? 0;
  const currentTrend = currentReading?.trend ?? 'stable';
  const trendDelta = currentReading?.trendRate ?? 0;
  const lastUpdated = currentReading?.recordedAt 
    ? Math.round((Date.now() - new Date(currentReading.recordedAt).getTime()) / 60000)
    : 0;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'} pb-24`}>
      {/* Header */}
      <div
        className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
          isDark
            ? 'bg-black/80 border-white/10'
            : 'bg-white/80 border-gray-200'
        }`}
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={onBack}
              className={`p-2 rounded-xl transition-all ${
                isDark
                  ? 'hover:bg-white/10 text-white'
                  : 'hover:bg-gray-100 text-gray-900'
              }`}
              data-testid="button-cgm-back"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-xl transition-all ${
                isDark
                  ? 'hover:bg-white/10 text-white'
                  : 'hover:bg-gray-100 text-gray-900'
              }`}
              data-testid="button-cgm-settings"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>
          <h1 className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Glucose
          </h1>
          <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Continuous glucose monitoring
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-full text-xs flex items-center gap-1.5 ${
                cgmStatus?.isSandbox
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-green-500/20 text-green-400'
              }`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
              Connected • Dexcom{cgmStatus?.isSandbox ? ' (Sandbox)' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Current Glucose Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-6 rounded-3xl border backdrop-blur-xl ${
            isDark
              ? 'bg-white/5 border-white/10'
              : 'bg-white/60 border-gray-200'
          }`}
        >
          {dataLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-white/60' : 'text-gray-400'}`} />
            </div>
          ) : currentReading ? (
            <>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className={`text-6xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {currentGlucose.toFixed(1)}
                    <span className="text-3xl ml-2 opacity-60">mmol/L</span>
                  </div>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Current glucose
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className={`mb-2 ${
                      isDark ? 'text-cyan-400' : 'text-cyan-600'
                    }`}
                  >
                    {getTrendIcon(currentTrend)}
                  </div>
                  <p className={`text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {getTrendLabel(currentTrend)}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {trendDelta > 0 ? '+' : ''}
                    {trendDelta.toFixed(1)} mmol/L in 5 min
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Updated {lastUpdated} min ago
                </p>
                <div
                  className={`px-2 py-1 rounded-lg text-xs ${
                    isDark
                      ? 'bg-white/10 text-white/70'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Source: Dexcom
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                No glucose readings yet. Data will appear once your CGM syncs.
              </p>
            </div>
          )}
        </motion.div>

        {/* Trend Chart */}
        {readings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`p-6 rounded-3xl border backdrop-blur-xl ${
              isDark
                ? 'bg-white/5 border-white/10'
                : 'bg-white/60 border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Trend
              </h2>
              <div className="flex gap-1 p-1 rounded-xl bg-black/20">
                {(['3h', '6h', '24h'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTrendRange(range)}
                    className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
                      trendRange === range
                        ? isDark
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-gray-900'
                        : isDark
                        ? 'text-white/60 hover:text-white/80'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    data-testid={`button-trend-${range}`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-64" style={{ minWidth: 0, minHeight: '16rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={readings}>
                  <defs>
                    <linearGradient id="glucoseGradientInRange" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={isDark ? '#06b6d4' : '#0891b2'}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={isDark ? '#06b6d4' : '#0891b2'}
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient id="glucoseGradientOutOfRange" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={isDark ? '#ef4444' : '#dc2626'}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={isDark ? '#ef4444' : '#dc2626'}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                  />
                  <XAxis
                    dataKey="timeLabel"
                    stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    tick={{ fontSize: 11 }}
                    interval={Math.floor(readings.length / 6)}
                  />
                  <YAxis
                    domain={[3, 11]}
                    stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)',
                      border: 'none',
                      borderRadius: '12px',
                      color: isDark ? 'white' : 'black',
                    }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isInRange = data.valueMmol >= targetRange.low && data.valueMmol <= targetRange.high;
                        return (
                          <div className={`p-3 rounded-xl ${isDark ? 'bg-black/90' : 'bg-white/90'}`}>
                            <p className={`text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {data.timeLabel}
                            </p>
                            <p className={`text-lg ${isInRange ? (isDark ? 'text-cyan-400' : 'text-cyan-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                              {data.valueMmol} mmol/L
                            </p>
                            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              {isInRange ? 'In range' : data.valueMmol > targetRange.high ? 'Above range' : 'Below range'}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceArea
                    y1={targetRange.low}
                    y2={targetRange.high}
                    fill={isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)'}
                    fillOpacity={1}
                  />
                  <ReferenceLine
                    y={targetRange.low}
                    stroke={isDark ? 'rgba(34,197,94,0.6)' : 'rgba(34,197,94,0.7)'}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    label={{
                      value: `Target: ${targetRange.low}`,
                      position: 'insideBottomLeft',
                      fill: isDark ? 'rgba(34,197,94,0.8)' : 'rgba(34,197,94,0.9)',
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine
                    y={targetRange.high}
                    stroke={isDark ? 'rgba(34,197,94,0.6)' : 'rgba(34,197,94,0.7)'}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    label={{
                      value: `Target: ${targetRange.high}`,
                      position: 'insideTopLeft',
                      fill: isDark ? 'rgba(34,197,94,0.8)' : 'rgba(34,197,94,0.9)',
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="valueMmol"
                    stroke={isDark ? '#06b6d4' : '#0891b2'}
                    strokeWidth={2.5}
                    fill="url(#glucoseGradientInRange)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              <div
                className={`px-3 py-1.5 rounded-lg text-xs ${
                  isDark ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Avg: {stats.avgGlucose.toFixed(1)} mmol/L
              </div>
              <div
                className={`px-3 py-1.5 rounded-lg text-xs ${
                  isDark ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Min: {stats.minGlucose.toFixed(1)}
              </div>
              <div
                className={`px-3 py-1.5 rounded-lg text-xs ${
                  isDark ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Max: {stats.maxGlucose.toFixed(1)}
              </div>
            </div>
          </motion.div>
        )}

        {/* Control Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2
            className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}
          >
            Control Summary
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div
              className={`p-6 rounded-3xl border backdrop-blur-xl ${
                isDark
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white/60 border-gray-200'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4">
                <Check className="w-6 h-6 text-white" />
              </div>
              <div className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {stats.timeInRange.toFixed(0)}%
              </div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Time in range
              </p>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Last 14 days ({targetRange.low}–{targetRange.high} mmol/L)
              </p>
            </div>

            <div
              className={`p-6 rounded-3xl border backdrop-blur-xl ${
                isDark
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white/60 border-gray-200'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {stats.avgGlucose.toFixed(1)}
              </div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Average glucose
              </p>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Last 14 days
              </p>
            </div>

            <div
              className={`p-6 rounded-3xl border backdrop-blur-xl ${
                isDark
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white/60 border-gray-200'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {stats.estimatedA1c.toFixed(1)}%
              </div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Estimated A1c
              </p>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Approximation
              </p>
            </div>

            <div
              className={`p-6 rounded-3xl border backdrop-blur-xl ${
                isDark
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white/60 border-gray-200'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {stats.lowAlerts}
              </div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Low alerts
              </p>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Last 30 days
              </p>
            </div>
          </div>
        </motion.div>

        {/* Insights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2
            className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}
          >
            Insights
          </h2>
          <div className="space-y-3">
            <div
              className={`p-6 rounded-3xl border backdrop-blur-xl ${
                isDark
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white/60 border-gray-200'
              }`}
            >
              <h3 className={`text-lg mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Glucose control analysis
              </h3>
              <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                {stats.timeInRange >= 70 
                  ? `Excellent control! You're spending ${stats.timeInRange.toFixed(0)}% of your time in range, which is above the recommended 70% target.`
                  : stats.timeInRange >= 50
                  ? `Your time in range is ${stats.timeInRange.toFixed(0)}%. Focus on reducing glucose variability to reach the 70% target.`
                  : `Your time in range is ${stats.timeInRange.toFixed(0)}%. Consider reviewing your diet and activity patterns with your healthcare provider.`
                }
              </p>
              <div className="flex items-center justify-between">
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Based on recent readings
                </p>
              </div>
            </div>

            {stats.lowAlerts > 0 && (
              <div
                className={`p-6 rounded-3xl border backdrop-blur-xl ${
                  isDark
                    ? 'bg-white/5 border-white/10'
                    : 'bg-white/60 border-gray-200'
                }`}
              >
                <h3 className={`text-lg mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Low glucose events detected
                </h3>
                <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  We've detected {stats.lowAlerts} readings below 3.0 mmol/L in the selected time period. 
                  Consider keeping fast-acting glucose nearby and reviewing patterns with your care team.
                </p>
                <div className="flex items-center justify-between">
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Confidence: High
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Data Source Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={`p-6 rounded-3xl border backdrop-blur-xl ${
            isDark
              ? 'bg-white/5 border-white/10'
              : 'bg-white/60 border-gray-200'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
              <Droplet className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Dexcom CGM
              </h3>
              <p className={`text-sm mb-3 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                {cgmStatus?.isSandbox ? 'Sandbox mode - test data only' : 'Real-time glucose monitoring connected'}
              </p>
              <div className="flex items-center gap-4 text-xs">
                <div className={isDark ? 'text-white/50' : 'text-gray-500'}>
                  Connected: {cgmStatus?.connectedAt ? new Date(cgmStatus.connectedAt).toLocaleDateString() : 'Unknown'}
                </div>
                <div className={isDark ? 'text-white/50' : 'text-gray-500'}>
                  Last sync: {cgmStatus?.lastSyncAt ? new Date(cgmStatus.lastSyncAt).toLocaleTimeString() : 'Never'}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className={`text-sm ${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-500'} transition-colors`}
              data-testid="button-disconnect-dexcom"
            >
              {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect Dexcom'}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
          >
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`relative w-full max-w-lg rounded-t-3xl p-6 ${
                isDark ? 'bg-slate-900' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  CGM Settings
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className={`p-2 rounded-xl ${
                    isDark ? 'hover:bg-white/10 text-white' : 'hover:bg-gray-100 text-gray-900'
                  }`}
                  data-testid="button-close-settings"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <h3 className={`text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Data Source
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Currently connected to Dexcom{cgmStatus?.isSandbox ? ' (Sandbox)' : ''}
                  </p>
                </div>

                <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <h3 className={`text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Target Range
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    {targetRange.low} – {targetRange.high} mmol/L
                  </p>
                </div>

                <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <h3 className={`text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Sync Status
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    {cgmStatus?.syncStatus === 'active' ? 'Active - syncing every 5 minutes' : 
                     cgmStatus?.syncStatus === 'error' ? `Error: ${cgmStatus.errorMessage}` : 
                     'Disconnected'}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
