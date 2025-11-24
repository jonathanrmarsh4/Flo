import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, TrendingUp } from "lucide-react";
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

  return (
    <div
      className={`backdrop-blur-xl rounded-2xl border p-4 bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10 ${
        isCompleted ? 'opacity-75' : ''
      }`}
      data-testid={`card-action-${item.id}`}
    >
      <div className="flex flex-col gap-3">
        {/* Header with category badge and status */}
        <div className="flex items-start justify-between gap-2">
          <Badge
            className={getCategoryColor(item.category)}
            data-testid={`badge-category-${item.id}`}
          >
            {getCategoryLabel(item.category)}
          </Badge>
          
          {isCompleted && (
            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
              <Check className="w-3 h-3 mr-1" />
              Completed
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3
          className="text-base font-semibold text-foreground"
          data-testid={`text-title-${item.id}`}
        >
          {item.snapshotTitle}
        </h3>

        {/* Insight text */}
        <p
          className="text-sm text-muted-foreground"
          data-testid={`text-insight-${item.id}`}
        >
          {item.snapshotInsight}
        </p>

        {/* Action recommendation */}
        <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
          <TrendingUp className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
          <p
            className="text-sm font-medium text-foreground"
            data-testid={`text-action-${item.id}`}
          >
            {item.snapshotAction}
          </p>
        </div>

        {/* Progress tracking for biomarkers */}
        {item.targetBiomarker && item.currentValue !== null && item.targetValue !== null && (
          <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">
                {item.targetBiomarker}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {item.currentValue} {item.unit}
                </span>
                <span className="text-xs text-muted-foreground">→</span>
                <span className="text-sm font-semibold text-primary">
                  {item.targetValue} {item.unit}
                </span>
              </div>
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

        {/* Added date */}
        <div className="text-xs text-muted-foreground pt-1">
          Added {new Date(item.addedAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
