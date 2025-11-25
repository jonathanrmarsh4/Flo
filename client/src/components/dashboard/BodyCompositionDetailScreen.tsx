import { X, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface BodyCompositionData {
  body_composition_score: number;
  body_fat_percent: number | null;
  lean_mass_percent: number | null;
  weight_kg: number | null;
  bmi: number | null;
  last_updated: string | null;
}

interface HistoryEntry {
  date: string;
  bodyFatPercent: number | null;
  leanMassPercent: number | null;
  weightKg: number | null;
}

interface BodyCompositionDetailScreenProps {
  isDark: boolean;
  onClose: () => void;
  data: BodyCompositionData;
  history: HistoryEntry[];
}

export function BodyCompositionDetailScreen({ isDark, onClose, data, history }: BodyCompositionDetailScreenProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return isDark ? 'text-green-400' : 'text-green-600';
    if (score >= 60) return isDark ? 'text-blue-400' : 'text-blue-600';
    if (score >= 40) return isDark ? 'text-yellow-400' : 'text-yellow-600';
    return isDark ? 'text-orange-400' : 'text-orange-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Needs Improvement';
  };

  const calculateTrend = () => {
    if (history.length < 2) return null;
    const recent = history.slice(0, 7);
    const older = history.slice(7, 14);
    
    if (older.length === 0) return null;
    
    const recentAvg = recent.reduce((sum, h) => sum + (h.bodyFatPercent || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + (h.bodyFatPercent || 0), 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) < 0.5) return { direction: 'stable', value: 0 };
    return { 
      direction: diff < 0 ? 'down' : 'up', 
      value: Math.abs(diff).toFixed(1) 
    };
  };

  const trend = calculateTrend();

  const chartData = [...history]
    .reverse()
    .slice(-30)
    .map(h => ({
      date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      bodyFat: h.bodyFatPercent,
      lean: h.leanMassPercent,
      weight: h.weightKg,
    }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" data-testid="screen-body-composition-detail">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className={`relative w-full h-full overflow-hidden ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        <div className={`p-6 pt-[env(safe-area-inset-top)] border-b ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h2 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Body Composition
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-body-comp-detail"
            >
              <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto" style={{ height: 'calc(100vh - 80px - env(safe-area-inset-top))' }}>
          <div className="text-center mb-8">
            <div className={`text-6xl font-bold ${getScoreColor(data.body_composition_score)}`} data-testid="text-detail-score">
              {data.body_composition_score}
            </div>
            <div className={`text-lg mt-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Overall Score
            </div>
            <div className={`text-sm mt-1 ${getScoreColor(data.body_composition_score)}`}>
              {getScoreLabel(data.body_composition_score)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <MetricCard 
              label="Body Fat"
              value={data.body_fat_percent !== null ? `${data.body_fat_percent}%` : '--'}
              color="orange"
              isDark={isDark}
            />
            <MetricCard 
              label="Lean Mass"
              value={data.lean_mass_percent !== null ? `${data.lean_mass_percent.toFixed(1)}%` : '--'}
              color="blue"
              isDark={isDark}
            />
            <MetricCard 
              label="Weight"
              value={data.weight_kg !== null ? `${data.weight_kg} kg` : '--'}
              color="cyan"
              isDark={isDark}
            />
            <MetricCard 
              label="BMI"
              value={data.bmi !== null ? `${data.bmi}` : '--'}
              color="purple"
              isDark={isDark}
            />
          </div>

          {trend && (
            <div className={`p-4 rounded-2xl mb-6 ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
              <div className="flex items-center gap-2">
                {trend.direction === 'down' ? (
                  <TrendingDown className="w-5 h-5 text-green-500" />
                ) : trend.direction === 'up' ? (
                  <TrendingUp className="w-5 h-5 text-orange-500" />
                ) : (
                  <Minus className="w-5 h-5 text-blue-500" />
                )}
                <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                  {trend.direction === 'stable' 
                    ? 'Body fat stable over past 2 weeks'
                    : `Body fat ${trend.direction === 'down' ? 'decreased' : 'increased'} ${trend.value}% over past 2 weeks`
                  }
                </span>
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
              <h3 className={`text-sm font-medium mb-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                Body Fat Trend (Last 30 Days)
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
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
                      formatter={(value: number) => [`${value}%`, 'Body Fat']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="bodyFat" 
                      stroke="#fb923c" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className={`mt-6 p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white/80'}`}>
              <h3 className={`text-sm font-medium mb-4 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                Recent Measurements
              </h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {history.slice(0, 10).map((entry, index) => (
                  <div 
                    key={index}
                    className={`flex justify-between items-center py-2 ${
                      index < history.slice(0, 10).length - 1 
                        ? `border-b ${isDark ? 'border-white/10' : 'border-black/10'}` 
                        : ''
                    }`}
                  >
                    <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                      {new Date(entry.date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    <div className="flex gap-4 text-xs">
                      {entry.bodyFatPercent !== null && (
                        <span className={isDark ? 'text-orange-400' : 'text-orange-600'}>
                          {entry.bodyFatPercent}% fat
                        </span>
                      )}
                      {entry.weightKg !== null && (
                        <span className={isDark ? 'text-cyan-400' : 'text-cyan-600'}>
                          {entry.weightKg} kg
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.last_updated && (
            <div className={`mt-6 text-center text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
              Last updated: {new Date(data.last_updated).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
          )}
        </div>
      </div>
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
