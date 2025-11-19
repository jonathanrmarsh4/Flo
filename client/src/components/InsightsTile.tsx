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
  const { data: insights } = useQuery<InsightCard[]>({
    queryKey: ['/api/insights'],
  });

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
      className="w-full text-left rounded-3xl backdrop-blur-xl border border-white/20 p-5 bg-gradient-to-br from-purple-900/40 via-indigo-900/40 to-teal-900/40 shadow-xl"
      data-testid="tile-insights"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span className="text-xs tracking-wide text-white/60">INSIGHTS</span>
        </div>
        {newCount > 0 && (
          <span className="text-[10px] bg-teal-500/30 text-teal-400 px-2 py-0.5 rounded-full">
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
          <Search className="w-10 h-10 text-white/40 mx-auto mb-2" />
          <p className="text-xs text-white/60">
            Building your insights...
          </p>
        </div>
      )}

      {/* Footer CTA */}
      {topInsights.length > 0 && (
        <div className="text-center mt-4">
          <span className="text-xs text-teal-400">See all insights →</span>
        </div>
      )}
    </motion.button>
  );
}
