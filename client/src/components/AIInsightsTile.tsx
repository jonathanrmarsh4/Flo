import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ChevronRight, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { InsightsModal } from "./InsightsModal";

interface DailyInsight {
  id: string;
  category: string;
  pattern: string;
  supportingData: string;
  action: string;
  confidence: number;
  isNew: boolean;
}

const categoryColors = {
  sleep_quality: {
    bg: 'from-indigo-500/20 to-purple-500/20',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30'
  },
  activity_sleep: {
    bg: 'from-orange-500/20 to-red-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500/30'
  },
  biomarkers: {
    bg: 'from-teal-500/20 to-cyan-500/20',
    text: 'text-teal-400',
    border: 'border-teal-500/30'
  },
  recovery_hrv: {
    bg: 'from-green-500/20 to-emerald-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30'
  },
  nutrition: {
    bg: 'from-amber-500/20 to-yellow-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30'
  }
};

const getCategoryColor = (category: string) => {
  const colors = categoryColors[category as keyof typeof categoryColors];
  if (colors) {
    return `bg-gradient-to-r ${colors.bg} ${colors.text} ${colors.border}`;
  }
  return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
};

const getCategoryLabel = (category: string) => {
  switch (category) {
    case 'sleep_quality':
      return 'Sleep';
    case 'recovery_hrv':
      return 'Recovery';
    case 'activity_sleep':
      return 'Activity';
    case 'biomarkers':
      return 'Biomarkers';
    default:
      return category;
  }
};

export function AIInsightsTile() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data, isLoading } = useQuery<{ insights: DailyInsight[]; count: number }>({
    queryKey: ['/api/daily-insights'],
  });

  const insights = data?.insights || [];
  const newCount = insights.filter(i => i.isNew).length;

  return (
    <div className="backdrop-blur-xl rounded-3xl border p-6 bg-slate-800/40 border-white/10" data-testid="tile-ai-insights">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/20">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Insights</h2>
              <p className="text-xs text-white/50">Personalized health recommendations</p>
            </div>
          </div>
          {newCount > 0 && (
            <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0 px-3" data-testid="badge-new-count">
              {newCount} new
            </Badge>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="w-12 h-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              No new insights today. Check back tomorrow!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Show first 2 insights as preview */}
            {insights.slice(0, 2).map((insight) => (
              <div
                key={insight.id}
                onClick={() => setIsModalOpen(true)}
                className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30 hover:bg-slate-700/50 transition-all cursor-pointer"
                data-testid={`preview-insight-${insight.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-white mb-2">
                      {insight.pattern}
                    </h3>
                    <p className="text-sm text-white/60 line-clamp-2">
                      {insight.supportingData}
                    </p>
                  </div>
                  <Badge
                    className={`${getCategoryColor(insight.category)} text-xs flex-shrink-0`}
                    data-testid={`badge-category-${insight.id}`}
                  >
                    {getCategoryLabel(insight.category)}
                  </Badge>
                </div>
              </div>
            ))}

            {/* View all button */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full px-4 py-3 mt-2 rounded-xl border border-white/10 flex items-center justify-between transition-colors hover:bg-white/5 text-white/70 text-sm"
              data-testid="button-view-all-insights"
            >
              <span>View all insights</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Insights Modal */}
      <InsightsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
