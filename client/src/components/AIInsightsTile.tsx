import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ChevronRight, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface DailyInsight {
  id: string;
  category: string;
  pattern: string;
  supportingData: string;
  action: string;
  confidence: number;
  isNew: boolean;
}

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'sleep_quality':
      return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
    case 'recovery_hrv':
      return 'bg-green-500/10 text-green-700 dark:text-green-400';
    case 'performance_activity':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    case 'biomarkers':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    default:
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
  }
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
  const { data, isLoading } = useQuery<{ insights: DailyInsight[]; count: number }>({
    queryKey: ['/api/daily-insights'],
  });

  const insights = data?.insights || [];
  const newCount = insights.filter(i => i.isNew).length;

  return (
    <Card className="p-6" data-testid="tile-ai-insights">
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
                className="p-3 rounded-md bg-muted/50 hover-elevate active-elevate-2 transition-all cursor-pointer"
                data-testid={`preview-insight-${insight.id}`}
              >
                <Link href="/insights">
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
                </Link>
              </div>
            ))}

            {/* View all button */}
            <Link href="/insights">
              <Button
                variant="outline"
                className="w-full mt-2"
                data-testid="button-view-all-insights"
              >
                View All {insights.length} Insights
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
