import { FloOverviewTile } from './dashboard/FloOverviewTile';
import { HeartMetabolicTile } from './dashboard/HeartMetabolicTile';
import { BodyCompositionTile } from './dashboard/BodyCompositionTile';
import { ReadinessTile } from './dashboard/ReadinessTile';
import { FloLogo } from './FloLogo';
import { Bell, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface DashboardScreenProps {
  isDark: boolean;
  onSettingsClick?: () => void;
}

export function DashboardScreen({ isDark, onSettingsClick }: DashboardScreenProps) {
  const { data: dashboardData, isLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/overview'],
  });

  const { data: bioAgeData } = useQuery<any>({
    queryKey: ['/api/biological-age'],
  });

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FloLogo size={32} />
              <div>
                <h1 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Dashboard
                </h1>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Your health at a glance
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-notifications"
              >
                <Bell className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
              <button 
                onClick={onSettingsClick}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-settings"
              >
                <Settings className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="px-4 py-6 space-y-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Loading dashboard...
            </div>
          </div>
        ) : (
          <>
            {/* Hero Tile - Flō Overview */}
            <FloOverviewTile 
              isDark={isDark}
              bioAge={bioAgeData?.biologicalAge}
              calendarAge={bioAgeData?.chronologicalAge}
              bioAgeDelta={bioAgeData?.ageDifference}
              floScore={dashboardData?.floScore}
              cardiometabolic={dashboardData?.componentScores?.cardiometabolic}
              bodyComposition={dashboardData?.componentScores?.bodyComposition}
              readiness={dashboardData?.componentScores?.readiness}
              inflammation={dashboardData?.componentScores?.inflammation}
              lastCheckin={dashboardData?.lastUpdated}
            />

            {/* Two Column Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <HeartMetabolicTile 
                isDark={isDark}
                score={dashboardData?.componentScores?.cardiometabolic}
              />
              <BodyCompositionTile 
                isDark={isDark}
                score={dashboardData?.componentScores?.bodyComposition}
              />
            </div>

            {/* Full Width - Daily Readiness */}
            <ReadinessTile isDark={isDark} />

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 gap-4">
              <QuickStatCard
                label="Data Points"
                value="247"
                trend="+12 this week"
                isDark={isDark}
              />
              <QuickStatCard
                label="Streak"
                value="28d"
                trend="Personal best!"
                isDark={isDark}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

interface QuickStatCardProps {
  label: string;
  value: string;
  trend: string;
  isDark: boolean;
}

function QuickStatCard({ label, value, trend, isDark }: QuickStatCardProps) {
  return (
    <div className={`backdrop-blur-xl rounded-2xl border p-4 transition-all ${
      isDark 
        ? 'bg-white/5 border-white/10' 
        : 'bg-white/60 border-black/10'
    }`}>
      <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-2xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
        {trend}
      </div>
    </div>
  );
}
