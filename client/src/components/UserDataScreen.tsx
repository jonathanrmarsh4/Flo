import { ChevronLeft, Database, RefreshCw, Watch, Activity, Moon, Heart, Loader2, Thermometer, Droplets, Brain, Wind, Footprints, Scale, Apple, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface UserDataScreenProps {
  isDark: boolean;
  onClose: () => void;
}

interface UserDataMetric {
  category: string;
  name: string;
  displayName: string;
  value: number | string;
  unit: string;
  source: string;
  lastUpdated: string;
}

const sourceIcons: Record<string, typeof Watch> = {
  'Apple Watch': Watch,
  'Oura Ring': Activity,
  'Dexcom': Activity,
  'Manual': Database,
};

const sourceColors: Record<string, { light: string; dark: string }> = {
  'Apple Watch': { light: 'text-pink-600 bg-pink-100', dark: 'text-pink-400 bg-pink-900/30' },
  'Oura Ring': { light: 'text-cyan-600 bg-cyan-100', dark: 'text-cyan-400 bg-cyan-900/30' },
  'Dexcom': { light: 'text-green-600 bg-green-100', dark: 'text-green-400 bg-green-900/30' },
  'Manual': { light: 'text-gray-600 bg-gray-100', dark: 'text-gray-400 bg-gray-800/50' },
};

const categoryIcons: Record<string, typeof Moon> = {
  'Sleep': Moon,
  'Recovery': Heart,
  'Heart': Heart,
  'Activity': Activity,
  'Fitness': Zap,
  'Body': Scale,
  'Mobility': Footprints,
  'Respiratory': Wind,
  'Vitals': Thermometer,
  'Glucose': Droplets,
  'Nutrition': Apple,
  'Mindfulness': Brain,
  'Stress': Brain,
};

export function UserDataScreen({ isDark, onClose }: UserDataScreenProps) {
  const { data, isLoading, refetch, isRefetching } = useQuery<{ metrics: UserDataMetric[] }>({
    queryKey: ['/api/user/data-metrics'],
    staleTime: 60 * 1000,
  });

  const metrics = data?.metrics || [];

  const groupedMetrics = metrics.reduce((acc, metric) => {
    if (!acc[metric.category]) {
      acc[metric.category] = [];
    }
    acc[metric.category].push(metric);
    return acc;
  }, {} as Record<string, UserDataMetric[]>);

  const formatLastUpdated = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Unknown';
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const getSourceStyle = (source: string) => {
    const colors = sourceColors[source] || sourceColors['Manual'];
    return isDark ? colors.dark : colors.light;
  };

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      <div className={`flex-shrink-0 backdrop-blur-xl border-b pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onClose}
              className={`flex items-center gap-2 text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-back-user-data"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <Database className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h1 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>User Data</h1>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className={`p-2 rounded-lg ${isDark ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'}`}
              data-testid="button-refresh-user-data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
          <p className={`text-sm mb-6 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
            Latest values from your connected devices and data sources.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            </div>
          ) : metrics.length === 0 ? (
            <div className={`backdrop-blur-xl rounded-2xl border p-8 text-center ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200'
            }`}>
              <Database className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-white/30' : 'text-gray-300'}`} />
              <p className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                No data yet
              </p>
              <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                Connect your devices in Integrations to start seeing your health data here.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedMetrics).map(([category, categoryMetrics]) => {
                const CategoryIcon = categoryIcons[category] || Activity;
                return (
                  <div key={category} className={`backdrop-blur-xl rounded-2xl border overflow-hidden ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-gray-200'
                  }`}>
                    <div className={`px-4 py-3 border-b ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        <CategoryIcon className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                        <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {category}
                        </h2>
                      </div>
                    </div>
                    <div className="divide-y divide-white/5">
                      {categoryMetrics.map((metric, idx) => (
                        <div 
                          key={`${metric.name}-${idx}`}
                          className={`px-4 py-3 ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}
                          data-testid={`metric-row-${metric.name}`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {metric.displayName}
                              </p>
                              <p className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                                {formatLastUpdated(metric.lastUpdated)}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {metric.value}
                                </span>
                                {metric.unit && (
                                  <span className={`text-xs ml-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                                    {metric.unit}
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getSourceStyle(metric.source)}`}>
                                {metric.source}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
