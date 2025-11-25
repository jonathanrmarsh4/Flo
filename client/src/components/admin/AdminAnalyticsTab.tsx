import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  UserPlus, Users, UserCheck, RefreshCw, TrendingUp, TrendingDown,
  MessageSquare, Sparkles, ClipboardList, FileText, Activity, Heart
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface AnalyticsData {
  signups: { 
    count: number; 
    trend: number; 
    daily: { date: string; count: number }[] 
  };
  dauMau: { 
    dau: number; 
    mau: number; 
    ratio: number; 
    trend: { date: string; dau: number; mau: number }[] 
  };
  activation: { 
    rate: number; 
    trend: number; 
    funnel: { label: string; count: number; percent: number }[] 
  };
  retention: { 
    day7: number; 
    trend: number; 
    cohorts: { month: string; d0: number; d1: number; d7: number; d14: number; d30: number }[] 
  };
  featureUsage: { feature: string; count: number; uniqueUsers: number }[];
}

type Period = 'today' | '7d' | '30d' | '90d' | 'all';

const periodLabels: Record<Period, string> = {
  'today': 'Today',
  '7d': '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
  'all': 'All Time',
};

export function AdminAnalyticsTab() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d');

  const { data: analyticsData, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['/api/admin/analytics/comprehensive', selectedPeriod],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/admin/analytics/comprehensive?period=${selectedPeriod}`);
      return res.json();
    },
    refetchInterval: 60000,
    retry: 2,
  });

  const generateMiniChartPath = (data: { date: string; count: number }[], maxHeight: number = 40) => {
    if (!data || data.length === 0) {
      return 'M 0,40 L 200,40';
    }
    const maxValue = Math.max(...data.map(d => d.count), 1);
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * 200;
      const y = maxHeight - (d.count / maxValue) * (maxHeight - 10);
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    });
    return points.join(' ');
  };

  const generateAreaPath = (linePath: string) => {
    return `${linePath} L 200,50 L 0,50 Z`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2">
          {Object.entries(periodLabels).map(([key, label]) => (
            <div key={key} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 animate-pulse w-20 h-9" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl p-6 border bg-white/5 border-white/10 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl p-8 border bg-red-500/10 border-red-500/30 text-center">
        <div className="text-red-400 mb-2">Failed to load analytics data</div>
        <div className="text-white/50 text-sm">Please try refreshing the page or check your connection</div>
      </div>
    );
  }

  const signups = analyticsData?.signups || { count: 0, trend: 0, daily: [] };
  const dauMau = analyticsData?.dauMau || { dau: 0, mau: 0, ratio: 0, trend: [] };
  const activation = analyticsData?.activation || { rate: 0, trend: 0, funnel: [] };
  const retention = analyticsData?.retention || { day7: 0, trend: 0, cohorts: [] };
  const featureUsage = analyticsData?.featureUsage || [];

  const signupsPath = generateMiniChartPath(signups.daily);
  const signupsAreaPath = generateAreaPath(signupsPath);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {(Object.entries(periodLabels) as [Period, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedPeriod(key)}
            className={`px-4 py-2 rounded-xl text-xs transition-all ${
              key === selectedPeriod
                ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50'
                : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
            }`}
            data-testid={`button-period-${key}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10" data-testid="metric-signups">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 rounded-xl bg-green-500/20">
              <UserPlus className="w-5 h-5 text-green-400" />
            </div>
            {signups.trend >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className="text-3xl mb-1 text-white" data-testid="text-signups-count">
            {signups.count}
          </div>
          <div className="text-sm mb-3 text-white/60">
            New Signups
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-xs px-2 py-1 rounded-lg ${
              signups.trend >= 0 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {signups.trend >= 0 ? '+' : ''}{signups.trend}%
            </div>
            <span className="text-xs text-white/40">vs last period</span>
          </div>
          <div className="mt-4 h-12">
            <svg width="100%" height="100%" viewBox="0 0 200 50" preserveAspectRatio="none">
              <path d={signupsPath} fill="none" stroke="#4ade80" strokeWidth="2" />
              <path d={signupsAreaPath} fill="rgba(74, 222, 128, 0.1)" />
            </svg>
          </div>
        </div>

        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10" data-testid="metric-dau-mau">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 rounded-xl bg-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl mb-1 text-white" data-testid="text-dau-mau-ratio">
            {dauMau.ratio}%
          </div>
          <div className="text-sm mb-3 text-white/60">DAU / MAU Ratio</div>
          <div className="space-y-1 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50">DAU</span>
              <span className="text-blue-400" data-testid="text-dau">{dauMau.dau}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50">MAU</span>
              <span className="text-blue-400" data-testid="text-mau">{dauMau.mau}</span>
            </div>
          </div>
          <div className="mt-4 h-12">
            <svg width="100%" height="100%" viewBox="0 0 200 50" preserveAspectRatio="none">
              <path
                d={generateMiniChartPath(dauMau.trend.map(t => ({ date: t.date, count: t.dau })))}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10" data-testid="metric-activation">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 rounded-xl bg-purple-500/20">
              <UserCheck className="w-5 h-5 text-purple-400" />
            </div>
            {activation.trend >= 0 ? (
              <TrendingUp className="w-4 h-4 text-purple-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className="text-3xl mb-1 text-white" data-testid="text-activation-rate">
            {activation.rate}%
          </div>
          <div className="text-sm mb-3 text-white/60">Activation Rate</div>
          <div className="text-xs mb-3 text-white/40">
            Completed onboarding + data source
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-xs px-2 py-1 rounded-lg ${
              activation.trend >= 0 
                ? 'bg-purple-500/20 text-purple-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {activation.trend >= 0 ? '+' : ''}{activation.trend}%
            </div>
            <span className="text-xs text-white/40">vs last period</span>
          </div>
          <div className="mt-4 flex justify-center">
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="6"
              />
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke="#c084fc"
                strokeWidth="6"
                strokeDasharray={`${(activation.rate / 100) * 157} 157`}
                strokeDashoffset="0"
                transform="rotate(-90 30 30)"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10" data-testid="metric-retention">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 rounded-xl bg-cyan-500/20">
              <RefreshCw className="w-5 h-5 text-cyan-400" />
            </div>
            {retention.trend >= 0 ? (
              <TrendingUp className="w-4 h-4 text-cyan-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className="text-3xl mb-1 text-white" data-testid="text-retention-rate">
            {retention.day7}%
          </div>
          <div className="text-sm mb-3 text-white/60">Day-7 Retention</div>
          <div className="text-xs mb-3 text-white/40">Users returning after 7 days</div>
          <div className="flex items-center gap-2">
            <div className={`text-xs px-2 py-1 rounded-lg ${
              retention.trend >= 0 
                ? 'bg-cyan-500/20 text-cyan-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {retention.trend >= 0 ? '+' : ''}{retention.trend}%
            </div>
            <span className="text-xs text-white/40">vs last period</span>
          </div>
          <div className="mt-4 h-12">
            <svg width="100%" height="100%" viewBox="0 0 200 50" preserveAspectRatio="none">
              <path
                d="M 0,35 L 25,33 L 50,30 L 75,32 L 100,28 L 125,25 L 150,23 L 175,20 L 200,18"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2"
              />
              <path
                d="M 0,35 L 25,33 L 50,30 L 75,32 L 100,28 L 125,25 L 150,23 L 175,20 L 200,18 L 200,50 L 0,50 Z"
                fill="rgba(6, 182, 212, 0.1)"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg mb-1 text-white">New Signups Trend</h3>
              <p className="text-xs text-white/50">
                Daily user registrations over the selected period
              </p>
            </div>
          </div>
          <div className="h-64">
            <svg width="100%" height="100%" viewBox="0 0 600 250" preserveAspectRatio="xMidYMid meet">
              {[0, 1, 2, 3, 4].map((i) => {
                const maxCount = Math.max(...signups.daily.map(d => d.count), 1);
                const gridValue = Math.round(maxCount - (i * maxCount / 4));
                return (
                  <g key={i}>
                    <line
                      x1="40"
                      y1={20 + i * 52.5}
                      x2="580"
                      y2={20 + i * 52.5}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="1"
                    />
                    <text
                      x="35"
                      y={24 + i * 52.5}
                      textAnchor="end"
                      className="text-[10px] fill-white/40"
                    >
                      {gridValue}
                    </text>
                  </g>
                );
              })}
              {signups.daily.map((d, i) => {
                const maxCount = Math.max(...signups.daily.map(x => x.count), 1);
                const barWidth = Math.max(8, Math.min(15, 500 / signups.daily.length - 2));
                const x = 50 + (i * (540 / signups.daily.length));
                const height = (d.count / maxCount) * 180;
                return (
                  <rect
                    key={i}
                    x={x}
                    y={230 - height}
                    width={barWidth}
                    height={height}
                    fill="#4ade80"
                    opacity="0.8"
                    rx="2"
                  />
                );
              })}
              {signups.daily.length > 0 && [0, Math.floor(signups.daily.length / 2), signups.daily.length - 1].map((idx) => {
                if (idx >= signups.daily.length) return null;
                const d = signups.daily[idx];
                const x = 50 + (idx * (540 / signups.daily.length));
                return (
                  <text
                    key={idx}
                    x={x + 5}
                    y="245"
                    textAnchor="middle"
                    className="text-[9px] fill-white/40"
                  >
                    {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg mb-1 text-white">Active Users Trend</h3>
              <p className="text-xs text-white/50">Daily and monthly active users comparison</p>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                <span className="text-white/60">DAU</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-purple-400"></div>
                <span className="text-white/60">MAU</span>
              </div>
            </div>
          </div>
          <div className="h-64">
            <svg width="100%" height="100%" viewBox="0 0 600 250" preserveAspectRatio="xMidYMid meet">
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1="40"
                  y1={20 + i * 52.5}
                  x2="580"
                  y2={20 + i * 52.5}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
              ))}
              {dauMau.trend.length > 1 && (
                <>
                  <path
                    d={dauMau.trend.map((t, i) => {
                      const x = 50 + (i * (530 / (dauMau.trend.length - 1)));
                      const maxDau = Math.max(...dauMau.trend.map(x => x.dau), 1);
                      const y = 200 - ((t.dau / maxDau) * 160);
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="3"
                  />
                  {dauMau.trend.filter((_, i) => i % 5 === 0).map((t, idx) => {
                    const i = idx * 5;
                    const x = 50 + (i * (530 / (dauMau.trend.length - 1)));
                    const maxDau = Math.max(...dauMau.trend.map(x => x.dau), 1);
                    const y = 200 - ((t.dau / maxDau) * 160);
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="4"
                        fill="#60a5fa"
                      />
                    );
                  })}
                </>
              )}
            </svg>
          </div>
        </div>

        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10">
          <div className="mb-6">
            <h3 className="text-lg mb-1 text-white">Activation Funnel</h3>
            <p className="text-xs text-white/50">User journey from signup to activation</p>
          </div>
          <div className="space-y-4">
            {activation.funnel.map((step, index) => {
              const colors = ['blue', 'cyan', 'teal', 'green', 'emerald'];
              const color = colors[index % colors.length];
              const colorClasses: Record<string, string> = {
                'blue': 'bg-blue-500',
                'cyan': 'bg-cyan-500',
                'teal': 'bg-teal-500',
                'green': 'bg-green-500',
                'emerald': 'bg-emerald-500',
              };
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/80">{step.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/60">{step.count}</span>
                      <span className="text-xs text-white/40">({step.percent}%)</span>
                    </div>
                  </div>
                  <div className="h-8 rounded-xl overflow-hidden bg-white/5">
                    <div
                      className={`h-full rounded-xl transition-all duration-1000 ${colorClasses[color]}`}
                      style={{ width: `${step.percent}%` }}
                    />
                  </div>
                  {index < activation.funnel.length - 1 && (
                    <div className="flex justify-center my-1">
                      <div className="text-xs text-red-400">
                        ↓ -{100 - step.percent}%
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10">
          <div className="mb-6">
            <h3 className="text-lg mb-1 text-white">Retention Cohort Analysis</h3>
            <p className="text-xs text-white/50">User retention by cohort over time</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/60">
                  <th className="text-left pb-2">Cohort</th>
                  <th className="text-center pb-2 px-2">Day 0</th>
                  <th className="text-center pb-2 px-2">Day 1</th>
                  <th className="text-center pb-2 px-2">Day 7</th>
                  <th className="text-center pb-2 px-2">Day 14</th>
                  <th className="text-center pb-2 px-2">Day 30</th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                {retention.cohorts.map((row) => (
                  <tr key={row.month} className="text-white/80">
                    <td className="py-2">{row.month}</td>
                    <td className="text-center px-2">
                      <div className="inline-block px-2 py-1 rounded bg-green-500/30">
                        {row.d0}%
                      </div>
                    </td>
                    <td className="text-center px-2">
                      <div className="inline-block px-2 py-1 rounded bg-green-500/25">
                        {row.d1}%
                      </div>
                    </td>
                    <td className="text-center px-2">
                      <div className="inline-block px-2 py-1 rounded bg-cyan-500/25">
                        {row.d7}%
                      </div>
                    </td>
                    <td className="text-center px-2">
                      <div className="inline-block px-2 py-1 rounded bg-blue-500/25">
                        {row.d14}%
                      </div>
                    </td>
                    <td className="text-center px-2">
                      <div className="inline-block px-2 py-1 rounded bg-purple-500/25">
                        {row.d30}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-6 border backdrop-blur-xl bg-white/5 border-white/10">
        <div className="mb-6">
          <h3 className="text-lg mb-1 text-white">Feature Usage</h3>
          <p className="text-xs text-white/50">Usage metrics for key features</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {featureUsage.map((feature) => {
            const icons: Record<string, typeof MessageSquare> = {
              'HealthKit Syncs': Heart,
              'Oracle Chat': MessageSquare,
              'AI Insights': Sparkles,
              'Action Plans': ClipboardList,
              'Lab Uploads': FileText,
              'Flomentum': Activity,
            };
            const Icon = icons[feature.feature] || Activity;
            const colors: Record<string, string> = {
              'HealthKit Syncs': 'bg-red-500/20 text-red-400',
              'Oracle Chat': 'bg-purple-500/20 text-purple-400',
              'AI Insights': 'bg-cyan-500/20 text-cyan-400',
              'Action Plans': 'bg-green-500/20 text-green-400',
              'Lab Uploads': 'bg-blue-500/20 text-blue-400',
              'Flomentum': 'bg-pink-500/20 text-pink-400',
            };
            const colorClass = colors[feature.feature] || 'bg-gray-500/20 text-gray-400';
            
            return (
              <div 
                key={feature.feature}
                className="p-4 rounded-xl border bg-white/5 border-white/10"
                data-testid={`feature-usage-${feature.feature.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className={`p-2 rounded-lg w-fit mb-3 ${colorClass.split(' ')[0]}`}>
                  <Icon className={`w-5 h-5 ${colorClass.split(' ')[1]}`} />
                </div>
                <div className="text-sm text-white/80 mb-1">{feature.feature}</div>
                <div className="text-2xl text-white mb-1">{feature.count.toLocaleString()}</div>
                <div className="text-xs text-white/50">{feature.uniqueUsers} unique users</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
