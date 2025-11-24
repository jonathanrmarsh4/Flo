import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, CheckCircle2, Target } from "lucide-react";
import type { ActionPlanItem } from "@shared/schema";

interface ReportTileProps {
  totalActive: number;
  totalCompleted: number;
  recentCompletions?: ActionPlanItem[];
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

export function ReportTile({ totalActive, totalCompleted, recentCompletions = [] }: ReportTileProps) {
  const completionRate = totalActive + totalCompleted > 0
    ? Math.round((totalCompleted / (totalActive + totalCompleted)) * 100)
    : 0;

  return (
    <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20" data-testid="tile-report">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Progress Report</h2>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* Active Actions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">ACTIVE</span>
            </div>
            <div className="text-3xl font-bold text-foreground" data-testid="text-active-count">
              {totalActive}
            </div>
          </div>

          {/* Completed Actions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-xs text-muted-foreground font-medium">COMPLETED</span>
            </div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="text-completed-count">
              {totalCompleted}
            </div>
          </div>

          {/* Completion Rate */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">RATE</span>
            </div>
            <div className="text-3xl font-bold text-primary" data-testid="text-completion-rate">
              {completionRate}%
            </div>
          </div>
        </div>

        {/* Recent Completions */}
        {recentCompletions.length > 0 && (
          <div className="flex flex-col gap-3 pt-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground font-medium">
              RECENT COMPLETIONS
            </div>
            <div className="flex flex-col gap-2">
              {recentCompletions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 p-2 rounded-md bg-background/50"
                  data-testid={`recent-completion-${item.id}`}
                >
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`${getCategoryColor(item.category)} text-xs`}>
                        {getCategoryLabel(item.category)}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground line-clamp-1">
                      {item.snapshotTitle}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Completed {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : 'recently'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalActive === 0 && totalCompleted === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              No actions yet. Add insights from AI Insights to get started!
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
