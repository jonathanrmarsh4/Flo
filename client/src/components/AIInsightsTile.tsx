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
  performance_activity: {
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
    case 'performance_activity':
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
    <div className="backdrop-blur-xl rounded-2xl border p-6 bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10" data-testid="tile-ai-insights">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">AI Insights</h2>
          </div>
          {newCount > 0 && (
            <Badge variant="default" className="bg-primary" data-testid="badge-new-count">
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
                className="p-3 rounded-md bg-muted/50 hover-elevate active-elevate-2 transition-all cursor-pointer"
                data-testid={`preview-insight-${insight.id}`}
              >
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-4 h-4 mt-1 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={`${getCategoryColor(insight.category)} text-xs`}
                        data-testid={`badge-category-${insight.id}`}
                      >
                        {getCategoryLabel(insight.category)}
                      </Badge>
                      {insight.isNew && (
                        <Badge variant="default" className="bg-primary text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {insight.pattern}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            ))}

            {/* View all button */}
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => setIsModalOpen(true)}
              data-testid="button-view-all-insights"
            >
              View all insights
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>

      {/* Insights Modal */}
      <InsightsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
