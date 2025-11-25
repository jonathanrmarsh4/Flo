import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, TrendingUp, TrendingDown, CheckCircle, AlertCircle, Info, Target } from 'lucide-react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface FlomentumFactor {
  status: 'positive' | 'neutral' | 'negative';
  title: string;
  detail: string;
  componentKey: string;
  pointsContribution: number;
}

interface FlomentumDailyData {
  date: string;
  score: number;
  zone: 'BUILDING' | 'MAINTAINING' | 'DRAINING';
  factors: FlomentumFactor[];
  dailyFocus: {
    title: string;
    body: string;
    componentKey: string;
  };
  quickSnapshot: {
    date: string;
    score: number;
  }[];
}

interface FlomentumWeeklyData {
  weekStartDate: string;
  averageScore: number;
  dailyScores: {
    date: string;
    label: string;
    score: number;
    zone: string;
  }[];
  whatHelped: string[];
  whatHeldBack: string[];
  focusNextWeek: string;
}

export default function FlomentumScreen() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'today' | 'weekly'>('today');
  const [isDark] = useState(true);

  const { data: dailyData, isLoading: isDailyLoading } = useQuery<FlomentumDailyData>({
    queryKey: ['/api/flomentum/today'],
    retry: false,
    refetchOnMount: 'always',
  });

  const { data: weeklyData, isLoading: isWeeklyLoading } = useQuery<FlomentumWeeklyData>({
    queryKey: ['/api/flomentum/weekly'],
    retry: false,
    refetchOnMount: 'always',
  });

  const getZoneColors = (zone: 'BUILDING' | 'MAINTAINING' | 'DRAINING') => {
    if (zone === 'BUILDING') {
      return {
        gradient: { start: '#14b8a6', end: '#10b981' },
        textColor: isDark ? 'text-teal-400' : 'text-teal-600',
        badgeBg: isDark ? 'bg-teal-500/20' : 'bg-teal-100',
        badgeText: isDark ? 'text-teal-400' : 'text-teal-700'
      };
    } else if (zone === 'MAINTAINING') {
      return {
        gradient: { start: '#3b82f6', end: '#6366f1' },
        textColor: isDark ? 'text-blue-400' : 'text-blue-600',
        badgeBg: isDark ? 'bg-blue-500/20' : 'bg-blue-100',
        badgeText: isDark ? 'text-blue-400' : 'text-blue-700'
      };
    } else {
      return {
        gradient: { start: '#f59e0b', end: '#ef4444' },
        textColor: isDark ? 'text-amber-400' : 'text-amber-600',
        badgeBg: isDark ? 'bg-amber-500/20' : 'bg-amber-100',
        badgeText: isDark ? 'text-amber-400' : 'text-amber-700'
      };
    }
  };

  const colors = dailyData ? getZoneColors(dailyData.zone) : getZoneColors('MAINTAINING');

  return (
    <div className={`min-h-screen overflow-y-auto transition-colors pb-24 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className={`flex items-center gap-2 text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-back"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
            <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-page-title">
              Flōmentum
            </h1>
            <div className="w-16"></div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'today' | 'weekly')} className="w-full">
            <TabsList className={`w-full grid grid-cols-2 p-1 h-auto rounded-2xl ${
              isDark ? 'bg-white/5' : 'bg-gray-100'
            }`} data-testid="tabs-flomentum">
              <TabsTrigger 
                value="today"
                className={`py-2 px-4 rounded-xl text-sm data-[state=active]:${
                  isDark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'
                } ${isDark ? 'text-white/50' : 'text-gray-500'}`}
                data-testid="tab-daily"
              >
                Today
              </TabsTrigger>
              <TabsTrigger 
                value="weekly"
                className={`py-2 px-4 rounded-xl text-sm data-[state=active]:${
                  isDark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'
                } ${isDark ? 'text-white/50' : 'text-gray-500'}`}
                data-testid="tab-weekly"
              >
                Weekly
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'today' | 'weekly')} className="px-4 py-6">
        <TabsContent value="today" className="space-y-4 pb-8 mt-0">
            {isDailyLoading ? (
              <div className={`text-center py-12 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Loading today's momentum...
              </div>
            ) : !dailyData ? (
              <div className="text-center py-12">
                <p className={isDark ? 'text-white/50' : 'text-gray-500'}>No Flōmentum data available yet</p>
                <p className={`text-sm mt-2 ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                  Sync your Apple Health data to see your momentum score
                </p>
              </div>
            ) : (
              <>
                {/* Hero Score Card */}
                <Card 
                  className={`backdrop-blur-xl rounded-3xl border p-8 relative overflow-hidden ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                  }`}
                >
                  {/* Ambient glow */}
                  <div className="absolute inset-0 opacity-30">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-teal-500 via-cyan-500 to-green-500 rounded-full blur-3xl"></div>
                  </div>

                  <div className="relative z-10">
                    <div className="text-center mb-6">
                      <h2 className={`text-2xl mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-hero-title">
                        Flōmentum Today
                      </h2>
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${colors.badgeBg} border ${
                        isDark ? 'border-white/10' : 'border-black/10'
                      }`} data-testid="badge-zone-daily">
                        <span className={`text-xs uppercase tracking-wide ${colors.badgeText}`}>
                          {dailyData.zone.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Large Score Display */}
                    <div className="flex justify-center mb-6">
                      <div className="relative" style={{ width: 200, height: 200 }}>
                        <svg className="w-full h-full transform -rotate-90">
                          {/* Background ring */}
                          <circle
                            cx="100"
                            cy="100"
                            r="85"
                            stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                            strokeWidth="14"
                            fill="none"
                          />
                          {/* Progress ring */}
                          <circle
                            cx="100"
                            cy="100"
                            r="85"
                            stroke="url(#dailyScoreGradient)"
                            strokeWidth="14"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${(dailyData.score / 100) * 534.07} 534.07`}
                            className="transition-all duration-1000 ease-out"
                            style={{ filter: 'drop-shadow(0 0 10px rgba(20, 184, 166, 0.6))' }}
                          />
                          <defs>
                            <linearGradient id="dailyScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor={colors.gradient.start} />
                              <stop offset="100%" stopColor={colors.gradient.end} />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-6xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-score-daily">
                            {dailyData.score}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Why This Score */}
                <Card 
                  className={`backdrop-blur-xl rounded-3xl border p-6 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                  }`}
                >
                  <h3 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-why-score">
                    Why this score?
                  </h3>
                  <div className="space-y-3">
                    {dailyData.factors
                      .sort((a, b) => Math.abs(b.pointsContribution) - Math.abs(a.pointsContribution))
                      .map((factor, index) => {
                        const IconComponent = 
                          factor.status === 'positive' ? CheckCircle :
                          factor.status === 'negative' ? AlertCircle : Info;
                        
                        const iconColor = 
                          factor.status === 'positive' 
                            ? isDark ? 'text-green-400' : 'text-green-600'
                            : factor.status === 'negative'
                              ? isDark ? 'text-red-400' : 'text-red-600'
                              : isDark ? 'text-amber-400' : 'text-amber-600';

                        return (
                          <div 
                            key={index}
                            className={`p-4 rounded-2xl border ${
                              isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
                            }`}
                            data-testid={`factor-${index}`}
                          >
                            <div className="flex items-start gap-3">
                              <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} data-testid={`icon-factor-${index}`} />
                              <div className="flex-1">
                                <div className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid={`text-factor-title-${index}`}>
                                  {factor.title}
                                </div>
                                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`} data-testid={`text-factor-detail-${index}`}>
                                  {factor.detail}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </Card>

                {/* Today's Focus */}
                <Card 
                  className={`backdrop-blur-xl rounded-3xl border p-6 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Target className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} data-testid="icon-focus" />
                    <h3 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-focus-title">
                      Today's focus
                    </h3>
                  </div>
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-700'}`} data-testid="text-focus-body">
                    {dailyData.dailyFocus.body}
                  </p>
                </Card>

                {/* Footer */}
                <div className={`text-center text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`} data-testid="text-footer">
                  Flōmentum updates daily from Apple Health.
                </div>
              </>
            )}
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4 pb-8 mt-0">
            {isWeeklyLoading ? (
              <div className={`text-center py-12 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Loading weekly insights...
              </div>
            ) : !weeklyData ? (
              <div className="text-center py-12">
                <p className={isDark ? 'text-white/50' : 'text-gray-500'}>No weekly insights yet</p>
                <p className={`text-sm mt-2 ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                  Weekly insights are generated every Monday
                </p>
              </div>
            ) : (
              <>
                {/* Hero Weekly Score Card */}
                <Card 
                  className={`backdrop-blur-xl rounded-3xl border p-8 relative overflow-hidden ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                  }`}
                >
                  {/* Ambient glow */}
                  <div className="absolute inset-0 opacity-30">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-full blur-3xl"></div>
                  </div>

                  <div className="relative z-10">
                    <div className="text-center mb-6">
                      <h2 className={`text-2xl mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-weekly-title">
                        Flōmentum Weekly
                      </h2>
                      <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${
                        isDark ? 'bg-blue-500/20 border border-white/10' : 'bg-blue-100 border border-black/10'
                      }`} data-testid="badge-week-date">
                        <span className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                          Week of {new Date(weeklyData.weekStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Large Score Display with Ring */}
                    <div className="flex justify-center mb-6">
                      <div className="relative" style={{ width: 180, height: 180 }}>
                        {(() => {
                          const circumference = 2 * Math.PI * 75;
                          const progress = (weeklyData.averageScore / 100) * circumference;
                          return (
                            <svg className="w-full h-full transform -rotate-90">
                              {/* Background ring */}
                              <circle
                                cx="90"
                                cy="90"
                                r="75"
                                stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                                strokeWidth="12"
                                fill="none"
                              />
                              {/* Progress ring */}
                              <circle
                                cx="90"
                                cy="90"
                                r="75"
                                stroke="url(#weeklyScoreGradient)"
                                strokeWidth="12"
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference - progress}
                                className="transition-all duration-1000 ease-out"
                                style={{ filter: 'drop-shadow(0 0 10px rgba(99, 102, 241, 0.6))' }}
                              />
                              <defs>
                                <linearGradient id="weeklyScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#6366f1" />
                                  <stop offset="100%" stopColor="#a855f7" />
                                </linearGradient>
                              </defs>
                            </svg>
                          );
                        })()}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-5xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-score-weekly">
                            {weeklyData.averageScore}
                          </span>
                          <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>avg score</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Daily Breakdown Card */}
                <Card 
                  className={`backdrop-blur-xl rounded-3xl border p-6 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                  }`}
                >
                  <h3 className={`text-lg mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-daily-breakdown-title">
                    Daily Breakdown
                  </h3>
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                    <div className="flex items-end justify-between gap-2">
                      {weeklyData.dailyScores.map((day, index) => {
                        const isToday = index === weeklyData.dailyScores.length - 1;
                        const maxValue = Math.max(...weeklyData.dailyScores.map(d => d.score), 1);
                        const height = Math.max((day.score / maxValue) * 100, 5);
                        const zoneColor = day.zone === 'BUILDING' 
                          ? 'from-teal-500 to-green-500' 
                          : day.zone === 'MAINTAINING' 
                            ? 'from-blue-500 to-indigo-500' 
                            : 'from-amber-500 to-orange-500';
                        
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center gap-2">
                            <div className={`text-xs font-medium ${
                              isToday 
                                ? isDark ? 'text-purple-400' : 'text-purple-600'
                                : isDark ? 'text-white/60' : 'text-gray-600'
                            }`} data-testid={`text-day-score-${index}`}>
                              {day.score}
                            </div>
                            <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                              <div 
                                className={`w-full max-w-8 rounded-lg transition-all bg-gradient-to-t ${zoneColor} ${
                                  isToday ? 'ring-2 ring-purple-400/50' : ''
                                }`}
                                style={{ 
                                  height: `${height}%`,
                                  boxShadow: isToday ? '0 0 12px rgba(168, 85, 247, 0.4)' : undefined
                                }}
                                data-testid={`bar-day-${index}`}
                              ></div>
                            </div>
                            <div className={`text-[10px] font-medium ${
                              isToday 
                                ? isDark ? 'text-purple-400' : 'text-purple-600'
                                : isDark ? 'text-white/50' : 'text-gray-500'
                            }`} data-testid={`text-day-label-${index}`}>
                              {day.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                {/* What Helped */}
                {weeklyData.whatHelped.length > 0 && (
                  <Card 
                    className={`backdrop-blur-xl rounded-3xl border p-6 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className={`p-2 rounded-xl ${isDark ? 'bg-green-500/20' : 'bg-green-100'}`}>
                        <CheckCircle className={`w-4 h-4 ${isDark ? 'text-green-400' : 'text-green-600'}`} data-testid="icon-helped" />
                      </div>
                      <h3 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-helped-title">
                        What helped
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {weeklyData.whatHelped.map((item, index) => (
                        <div 
                          key={index}
                          className={`p-3 rounded-xl ${isDark ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}
                          data-testid={`text-helped-${index}`}
                        >
                          <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* What Held You Back */}
                {weeklyData.whatHeldBack.length > 0 && (
                  <Card 
                    className={`backdrop-blur-xl rounded-3xl border p-6 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className={`p-2 rounded-xl ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
                        <AlertCircle className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} data-testid="icon-held-back" />
                      </div>
                      <h3 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-held-back-title">
                        What held you back
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {weeklyData.whatHeldBack.map((item, index) => (
                        <div 
                          key={index}
                          className={`p-3 rounded-xl ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}
                          data-testid={`text-held-back-${index}`}
                        >
                          <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Focus for Next Week */}
                <Card 
                  className={`backdrop-blur-xl rounded-3xl border p-6 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                      <Target className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} data-testid="icon-next-week-focus" />
                    </div>
                    <h3 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-next-week-focus-title">
                      One focus for next week
                    </h3>
                  </div>
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-700'}`} data-testid="text-next-week-focus-body">
                    {weeklyData.focusNextWeek}
                  </p>
                </Card>

                {/* Footer */}
                <div className={`text-center text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`} data-testid="text-footer-weekly">
                  Weekly insights generated from your Flōmentum data.
                </div>
              </>
            )}
        </TabsContent>
      </Tabs>

      <BottomNav isDark={isDark} />
    </div>
  );
}
