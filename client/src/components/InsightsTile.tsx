import { motion } from 'framer-motion';
import { Sparkles, Activity, Heart, Moon, Droplets, Search } from 'lucide-react';
import { MiniInsightCard } from './InsightCard';
import { useQuery } from '@tanstack/react-query';
import type { InsightCard } from '@shared/schema';

interface InsightsTileProps {
  isDark: boolean;
  onTap: () => void;
}

const CATEGORY_ICON_MAP = {
  activity_sleep: Activity,
  recovery_hrv: Heart,
  sleep_quality: Moon,
  biomarkers: Droplets,
  general: Sparkles,
};

export function InsightsTile({ isDark, onTap }: InsightsTileProps) {
  const { data: insightsResponse } = useQuery<{ date: string; count: number; insights: InsightCard[] }>({
    queryKey: ['/api/daily-insights'],
  });
  
  const insights = insightsResponse?.insights || [];

  // Handle both array response and legacy object response {insights: [], newCount: 0}
  const insightsArray = Array.isArray(insights) 
    ? insights 
    : (insights as any)?.insights || [];
  const newCount = insightsArray.filter((i: any) => i.isNew).length;
  const topInsights = insightsArray.slice(0, 2);

  return (
    <motion.button
      onClick={onTap}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left rounded-3xl backdrop-blur-xl border p-5 transition-all ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      data-testid="tile-insights"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className={`w-4 h-4 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
          <span className={`text-xs tracking-wide ${isDark ? 'text-white/60' : 'text-gray-600'}`}>INSIGHTS</span>
        </div>
        {newCount > 0 && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-teal-500/30 text-teal-400' : 'bg-teal-100 text-teal-700'}`}>
            {newCount} new
          </span>
        )}
      </div>

      {/* Mini Insight Cards */}
      {topInsights.length > 0 ? (
        <div className="space-y-3">
          {topInsights.map((insight: InsightCard) => {
            const IconComponent = CATEGORY_ICON_MAP[insight.category as keyof typeof CATEGORY_ICON_MAP] || Sparkles;
            return (
              <MiniInsightCard
                key={insight.id}
                IconComponent={IconComponent}
                pattern={insight.pattern}
                supportingData={insight.supportingData || ''}
                isNew={insight.isNew}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6">
          <Search className={`w-10 h-10 mx-auto mb-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
          <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Building your insights...
          </p>
        </div>
      )}

      {/* Footer CTA */}
      {topInsights.length > 0 && (
        <div className="text-center mt-4">
          <span className={`text-xs ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>See all insights →</span>
        </div>
      )}
    </motion.button>
  );
}
