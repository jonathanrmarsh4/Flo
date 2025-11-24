import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, TrendingUp, ChevronDown, ChevronUp, Target, TrendingDown } from "lucide-react";
import type { ActionPlanItem } from "@shared/schema";

interface ActionCardProps {
  item: ActionPlanItem;
  onComplete?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onRemove?: (id: string) => void;
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

export function ActionCard({ item, onComplete, onDismiss, onRemove }: ActionCardProps) {
  const isActive = item.status === 'active';
  const isCompleted = item.status === 'completed';
  const [isExpanded, setIsExpanded] = useState(false);
  const [timePeriod, setTimePeriod] = useState<'7D' | '14D' | '30D' | '90D'>('30D');

  // Calculate days since added
  const daysSinceAdded = Math.floor((Date.now() - new Date(item.addedAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div
      className={`rounded-2xl border p-5 bg-slate-800/40 border-white/10 ${
        isCompleted ? 'opacity-75' : ''
      }`}
      data-testid={`card-action-${item.id}`}
    >
      <div className="flex flex-col gap-3">
        {/* Collapsed Header - Always Visible */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {/* Title */}
            <h3
              className="text-base font-semibold text-white mb-2"
              data-testid={`text-title-${item.id}`}
            >
              {item.snapshotTitle}
            </h3>

            {/* Timestamp */}
            <p className="text-xs text-white/50">
              Added {daysSinceAdded}d ago
            </p>
          </div>

          {/* Badge and Expand Button */}
          <div className="flex items-center gap-2">
            <Badge
              className={`${getCategoryColor(item.category)} flex-shrink-0`}
              data-testid={`badge-category-${item.id}`}
            >
              {getCategoryLabel(item.category)}
            </Badge>
            
            {/* Expand/Collapse Button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              data-testid={`button-toggle-${item.id}`}
            >
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-white/60" />
              ) : (
                <ChevronDown className="w-5 h-5 text-white/60" />
              )}
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="flex flex-col gap-4 pt-3 border-t border-gray-200 dark:border-white/10">
            {/* Insight Section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-600 dark:text-white/60" />
                <h4 className="text-xs font-semibold text-gray-600 dark:text-white/60 uppercase">
                  Insight
                </h4>
              </div>
              <p
                className="text-sm text-gray-700 dark:text-white/80"
                data-testid={`text-insight-${item.id}`}
              >
                {item.snapshotInsight}
              </p>
            </div>

            {/* Action Recommendation Section */}
            <div className="flex flex-col gap-2 p-3 rounded-xl border bg-teal-50 border-teal-200 dark:bg-teal-500/5 dark:border-teal-500/20">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-teal-400" />
                <h4 className="text-xs font-semibold text-teal-400 uppercase">
                  Recommended Action
                </h4>
              </div>
              <p
                className="text-sm font-medium text-gray-700 dark:text-white/80"
                data-testid={`text-action-${item.id}`}
              >
                {item.snapshotAction}
              </p>
            </div>

            {/* Progress tracking for biomarkers */}
            {item.targetBiomarker && item.currentValue !== null && item.targetValue !== null && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-600 dark:text-white/60 uppercase">
                    Progress Tracking
                  </h4>
                  {/* Time Period Selector */}
                  <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-white/5">
                    {(['7D', '14D', '30D', '90D'] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setTimePeriod(period)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          timePeriod === period
                            ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white'
                        }`}
                        data-testid={`button-period-${period.toLowerCase()}-${item.id}`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Current Value */}
                  <div className="p-3 rounded-lg bg-gray-100 dark:bg-white/5">
                    <div className="text-xs text-gray-600 dark:text-white/50 mb-1">
                      Current
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {item.currentValue} <span className="text-sm text-gray-500 dark:text-white/50">{item.unit}</span>
                    </div>
                  </div>
                  {/* Target Value */}
                  <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-500/10">
                    <div className="text-xs text-teal-600 dark:text-teal-400 mb-1">
                      Target
                    </div>
                    <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                      {item.targetValue} <span className="text-sm text-teal-500 dark:text-teal-400/70">{item.unit}</span>
                    </div>
                  </div>
                </div>

                {/* Chart Placeholder */}
                <div 
                  className="h-48 rounded-lg border-2 border-dashed border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex flex-col items-center justify-center gap-2"
                  data-testid={`chart-placeholder-${item.id}`}
                >
                  <TrendingDown className="w-8 h-8 text-gray-400 dark:text-white/30" />
                  <p className="text-sm text-gray-500 dark:text-white/50">
                    {item.targetBiomarker} Progress Chart
                  </p>
                  <p className="text-xs text-gray-400 dark:text-white/30">
                    Showing {timePeriod} trend
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {isActive && (
              <div className="flex items-center gap-2 pt-2">
                {onComplete && (
                  <Button
                    size="sm"
                    onClick={() => onComplete(item.id)}
                    className="flex-1"
                    data-testid={`button-complete-${item.id}`}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Mark Complete
                  </Button>
                )}
                {onDismiss && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDismiss(item.id)}
                    data-testid={`button-dismiss-${item.id}`}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Dismiss
                  </Button>
                )}
              </div>
            )}

            {/* Remove button for completed/dismissed items */}
            {!isActive && onRemove && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove(item.id)}
                className="text-muted-foreground"
                data-testid={`button-remove-${item.id}`}
              >
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
