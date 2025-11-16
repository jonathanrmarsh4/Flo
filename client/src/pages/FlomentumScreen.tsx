import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Flame, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';

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
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');
  const [isDark] = useState(true); // Match dashboard default

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

  const zoneColors = {
    BUILDING: {
      bg: 'from-green-900/20 via-emerald-900/20 to-teal-900/20',
      text: 'text-green-400',
      badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    },
    MAINTAINING: {
      bg: 'from-blue-900/20 via-indigo-900/20 to-cyan-900/20',
      text: 'text-blue-400',
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    },
    DRAINING: {
      bg: 'from-orange-900/20 via-red-900/20 to-pink-900/20',
      text: 'text-orange-400',
      badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    },
  };

  return (
    <div className={`min-h-screen pb-24 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              data-testid="button-back"
            >
              <ChevronLeft className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </Button>
            <div className="flex items-center gap-2">
              <Flame className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
              <h1 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Flōmentum
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'daily' | 'weekly')} className="px-4 pt-4">
        <TabsList className="w-full grid grid-cols-2 mb-6" data-testid="tabs-flomentum">
          <TabsTrigger value="daily" data-testid="tab-daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly</TabsTrigger>
        </TabsList>

        {/* Daily Tab */}
        <TabsContent value="daily" className="space-y-6">
          {isDailyLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading today's momentum...
            </div>
          ) : !dailyData ? (
            <div className="text-center py-12">
              <Flame className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">No Flōmentum data available yet</p>
              <p className="text-sm text-muted-foreground/70 mt-2">
                Sync your Apple Health data to see your momentum score
              </p>
            </div>
          ) : (
            <>
              {/* Hero Score */}
              <div className={`rounded-3xl p-8 bg-gradient-to-br ${zoneColors[dailyData.zone].bg} border border-white/10`}>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <span className="text-sm text-white/60 uppercase tracking-wide">Today's Score</span>
                  </div>
                  <div className={`text-7xl font-bold mb-3 ${zoneColors[dailyData.zone].text}`}>
                    {dailyData.score}
                  </div>
                  <Badge variant="outline" className={zoneColors[dailyData.zone].badge} data-testid="badge-zone-daily">
                    {dailyData.zone.replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              {/* Daily Focus */}
              <div className="rounded-2xl p-6 bg-card border border-border">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Flame className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{dailyData.dailyFocus.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {dailyData.dailyFocus.body}
                    </p>
                  </div>
                </div>
              </div>

              {/* Factors */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  What's Driving Your Score
                </h3>
                <div className="space-y-2">
                  {dailyData.factors
                    .sort((a, b) => Math.abs(b.pointsContribution) - Math.abs(a.pointsContribution))
                    .map((factor, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl p-4 bg-card border border-border flex items-start gap-3"
                        data-testid={`factor-${idx}`}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {factor.status === 'positive' ? (
                            <div className="p-1.5 rounded-full bg-green-500/20">
                              <TrendingUp className="w-4 h-4 text-green-400" />
                            </div>
                          ) : factor.status === 'negative' ? (
                            <div className="p-1.5 rounded-full bg-red-500/20">
                              <TrendingDown className="w-4 h-4 text-red-400" />
                            </div>
                          ) : (
                            <div className="p-1.5 rounded-full bg-gray-500/20">
                              <div className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="font-medium text-sm">{factor.title}</h4>
                            <span className={`text-sm font-semibold ${
                              factor.pointsContribution > 0 ? 'text-green-400' : 
                              factor.pointsContribution < 0 ? 'text-red-400' : 
                              'text-gray-400'
                            }`}>
                              {factor.pointsContribution > 0 ? '+' : ''}{factor.pointsContribution}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{factor.detail}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Weekly Tab */}
        <TabsContent value="weekly" className="space-y-6">
          {isWeeklyLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading weekly insights...
            </div>
          ) : !weeklyData ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">No weekly insights yet</p>
              <p className="text-sm text-muted-foreground/70 mt-2">
                Weekly insights are generated every Monday
              </p>
            </div>
          ) : (
            <>
              {/* Weekly Average */}
              <div className="rounded-3xl p-8 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-teal-900/20 border border-white/10">
                <div className="text-center">
                  <div className="text-sm text-white/60 uppercase tracking-wide mb-3">
                    Week Average
                  </div>
                  <div className="text-6xl font-bold text-blue-400 mb-2">
                    {weeklyData.averageScore}
                  </div>
                  <p className="text-xs text-white/50">
                    Week of {new Date(weeklyData.weekStartDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Daily Scores Sparkline */}
              <div className="rounded-2xl p-6 bg-card border border-border">
                <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">
                  This Week
                </h3>
                <div className="flex items-end justify-between gap-2 h-32">
                  {weeklyData.dailyScores.map((day, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                      <div className="flex-1 flex items-end w-full">
                        <div
                          className={`w-full rounded-t-lg transition-all ${
                            day.score >= 75
                              ? 'bg-green-400'
                              : day.score >= 60
                              ? 'bg-blue-400'
                              : 'bg-orange-400'
                          }`}
                          style={{ height: `${Math.max((day.score / 100) * 100, 10)}%` }}
                          data-testid={`bar-${idx}`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* What Helped */}
              {weeklyData.whatHelped.length > 0 && (
                <div className="rounded-2xl p-6 bg-card border border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-full bg-green-500/20">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    </div>
                    <h3 className="font-semibold">What Helped This Week</h3>
                  </div>
                  <ul className="space-y-2">
                    {weeklyData.whatHelped.map((item, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What Held Back */}
              {weeklyData.whatHeldBack.length > 0 && (
                <div className="rounded-2xl p-6 bg-card border border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-full bg-orange-500/20">
                      <TrendingDown className="w-4 h-4 text-orange-400" />
                    </div>
                    <h3 className="font-semibold">What Held You Back</h3>
                  </div>
                  <ul className="space-y-2">
                    {weeklyData.whatHeldBack.map((item, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-orange-400 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Focus Next Week */}
              <div className="rounded-2xl p-6 bg-card border border-border">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Flame className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Focus for Next Week</h3>
                    <p className="text-sm text-muted-foreground">
                      {weeklyData.focusNextWeek}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <BottomNav isDark={isDark} />
    </div>
  );
}
