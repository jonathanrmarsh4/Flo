import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, addMonths } from "date-fns";
import { TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/theme-provider";

interface BiomarkerProgressChartProps {
  actionItemId: string;
  addedAt: string | Date;
  currentValue: number;
  targetValue: number;
  unit: string;
  timePeriod: '3M' | '6M' | '9M' | '12M';
}

interface DataPoint {
  date: string;
  value: number;
  source: string;
}

export function BiomarkerProgressChart({
  actionItemId,
  addedAt,
  currentValue,
  targetValue,
  unit,
  timePeriod,
}: BiomarkerProgressChartProps) {
  const { isDark } = useTheme();
  const { data, isLoading } = useQuery<{ dataPoints: DataPoint[] }>({
    queryKey: ['/api/action-plan', actionItemId, 'progress', timePeriod],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/action-plan/${actionItemId}/progress?timeframe=${timePeriod}`, undefined);
      return response.json();
    },
  });

  // Calculate time period in months
  const monthsMap = { '3M': 3, '6M': 6, '9M': 9, '12M': 12 };
  const months = monthsMap[timePeriod];

  // Generate forecast line data points with interpolation
  const startDate = new Date(addedAt);
  const endDate = addMonths(startDate, months);

  // Create interpolated forecast data (linear projection from current to target)
  // Generate monthly points for smoother line
  const forecastData: Array<{ date: number; value: number; displayDate: string }> = [];
  const valueRange = targetValue - currentValue;
  const monthsToTrack = months;
  
  for (let i = 0; i <= monthsToTrack; i++) {
    const intermediateDate = addMonths(startDate, i);
    const progress = i / monthsToTrack;
    const intermediateValue = currentValue + (valueRange * progress);
    
    forecastData.push({
      date: intermediateDate.getTime(),
      value: intermediateValue,
      displayDate: i === 0 ? format(startDate, 'MMM d') : i === monthsToTrack ? format(endDate, 'MMM d') : format(intermediateDate, 'MMM d'),
    });
  }

  // Transform actual data points
  const actualData = (data?.dataPoints || []).map(point => ({
    date: new Date(point.date).getTime(),
    value: point.value,
    displayDate: format(new Date(point.date), 'MMM d'),
  }));

  // Merge forecast and actual data for chart
  // We need all timestamps for proper X-axis
  const allTimestamps = Array.from(
    new Set([
      ...forecastData.map(d => d.date),
      ...actualData.map(d => d.date),
    ])
  ).sort((a, b) => a - b);

  const chartData = allTimestamps.map(timestamp => {
    const forecast = forecastData.find(d => d.date === timestamp);
    const actual = actualData.find(d => d.date === timestamp);
    
    return {
      timestamp,
      displayDate: actual?.displayDate || forecast?.displayDate || format(new Date(timestamp), 'MMM d'),
      actualValue: actual?.value,
      forecastValue: forecast?.value,
    };
  });

  // Fill forecast line between start and end
  chartData.forEach((point, idx) => {
    if (point.forecastValue === undefined && idx > 0) {
      const prevForecast = chartData[idx - 1].forecastValue;
      const nextForecastIdx = chartData.findIndex((p, i) => i > idx && p.forecastValue !== undefined);
      
      if (prevForecast !== undefined && nextForecastIdx !== -1) {
        const nextForecast = chartData[nextForecastIdx].forecastValue!;
        const totalSteps = nextForecastIdx - (idx - 1);
        const currentStep = idx - (idx - 1);
        point.forecastValue = prevForecast + ((nextForecast - prevForecast) * currentStep / totalSteps);
      }
    }
  });

  // Show loading/empty state
  if (isLoading) {
    return (
      <div className={`h-56 rounded-xl p-4 flex items-center justify-center ${
        isDark ? 'bg-slate-800/40 border border-white/10' : 'bg-gray-100/80 border border-gray-200'
      }`}>
        <div className="text-center">
          <TrendingUp className={`w-10 h-10 mx-auto mb-2 animate-pulse ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
          <p className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Loading progress data...</p>
        </div>
      </div>
    );
  }

  // Check if we have actual data points to show
  const hasActualData = data && data.dataPoints.length > 0;
  
  // For activity insights (steps, workouts), we may not have historical data
  // but we can still show the forecast line from current to target
  const hasForecastData = forecastData.length > 0 && currentValue !== undefined && targetValue !== undefined;
  
  // If we have neither actual data nor forecast data, show empty state
  if (!hasActualData && !hasForecastData) {
    return (
      <div className={`h-56 rounded-xl p-4 flex flex-col ${
        isDark ? 'bg-slate-800/40 border border-white/10' : 'bg-gray-100/80 border border-gray-200'
      }`}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <TrendingUp className={`w-10 h-10 mx-auto mb-2 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
            <p className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
              No progress data yet. Upload new lab work or sync HealthKit data to track your progress.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // Use forecast data for chart when no actual data (activity insights)
  const chartDataToUse = hasActualData ? chartData : forecastData.map(f => ({
    timestamp: f.date,
    displayDate: f.displayDate,
    actualValue: undefined,
    forecastValue: f.value,
  }));

  // Calculate Y-axis domain (with some padding)
  const minValue = Math.min(currentValue, targetValue, ...actualData.map(d => d.value));
  const maxValue = Math.max(currentValue, targetValue, ...actualData.map(d => d.value));
  const padding = (maxValue - minValue) * 0.1;
  const yMin = Math.floor(minValue - padding);
  const yMax = Math.ceil(maxValue + padding);

  // Theme-aware chart colors
  const chartColors = {
    grid: isDark ? '#334155' : '#e5e7eb',
    axis: isDark ? '#94a3b8' : '#6b7280',
    axisLine: isDark ? '#475569' : '#d1d5db',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e5e7eb',
    tooltipText: isDark ? '#f1f5f9' : '#374151',
  };

  return (
    <div className={`rounded-xl p-4 ${
      isDark ? 'bg-slate-800/40 border border-white/10' : 'bg-gray-100/80 border border-gray-200'
    }`} data-testid={`chart-${actionItemId}`}>
      {/* Chart Legend */}
      <div className="flex items-center justify-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-purple-400"></div>
          <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Actual Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-teal-400 border-dashed"></div>
          <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Forecast</span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={chartDataToUse}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.3} />
          
          <XAxis
            dataKey="displayDate"
            stroke={chartColors.axis}
            tick={{ fill: chartColors.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: chartColors.axisLine }}
          />
          
          <YAxis
            domain={[yMin, yMax]}
            stroke={chartColors.axis}
            tick={{ fill: chartColors.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: chartColors.axisLine }}
            label={{ value: unit, angle: -90, position: 'insideLeft', fill: chartColors.axis, fontSize: 10 }}
          />
          
          <Tooltip
            contentStyle={{
              backgroundColor: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: '8px',
              padding: '8px',
            }}
            labelStyle={{ color: chartColors.tooltipText, fontSize: '12px' }}
            itemStyle={{ fontSize: '12px' }}
          />
          
          {/* Forecast Line (Teal, Dashed) */}
          <Line
            type="monotone"
            dataKey="forecastValue"
            stroke="#2dd4bf"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Forecast"
            connectNulls
          />
          
          {/* Actual Progress Line (Purple, Solid) */}
          <Line
            type="monotone"
            dataKey="actualValue"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={{ fill: '#a78bfa', r: 4 }}
            name="Actual"
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
