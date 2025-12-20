import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, TrendingUp, ChevronDown, ChevronUp, Target, TrendingDown } from "lucide-react";
import type { ActionPlanItem } from "@shared/schema";
import { BiomarkerProgressChart } from "./BiomarkerProgressChart";
import { useTheme } from "@/components/theme-provider";

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

export function ActionCard({ item, onComplete, onDismiss, onRemove }: ActionCardProps) {
  const isActive = item.status === 'active';
  const isCompleted = item.status === 'completed';
  const [isExpanded, setIsExpanded] = useState(false);
  const [timePeriod, setTimePeriod] = useState<'3M' | '6M' | '9M' | '12M'>('3M');
  const { isDark } = useTheme();

  // Calculate days since added
  const daysSinceAdded = Math.floor((Date.now() - new Date(item.addedAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div
      className={`rounded-2xl border p-5 ${
        isDark ? 'bg-slate-800/40 border-white/10' : 'bg-white/80 border-gray-200'
      } ${isCompleted ? 'opacity-75' : ''}`}
      data-testid={`card-action-${item.id}`}
    >
      <div className="flex flex-col gap-3">
        {/* Collapsed Header - Always Visible */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {/* Title */}
            <h3
              className={`text-base font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}
              data-testid={`text-title-${item.id}`}
            >
              {item.snapshotTitle}
            </h3>

            {/* Timestamp */}
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
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
              className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid={`button-toggle-${item.id}`}
            >
              {isExpanded ? (
                <ChevronUp className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-500'}`} />
              ) : (
                <ChevronDown className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-500'}`} />
              )}
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className={`flex flex-col gap-4 pt-4 border-t ${isDark ? 'border-white/20' : 'border-gray-200'}`}>
            {/* Insight Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-4 h-4 ${isDark ? 'text-white/60' : 'text-gray-500'}`} />
                <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                  Insight
                </h4>
              </div>
              <p
                className={`text-sm leading-relaxed ${isDark ? 'text-white/80' : 'text-gray-700'}`}
                data-testid={`text-insight-${item.id}`}
              >
                {item.snapshotInsight}
              </p>
            </div>

            {/* Action Recommendation Section */}
            <div className={`flex flex-col gap-3 p-4 rounded-xl border ${
              isDark ? 'bg-teal-500/10 border-teal-400/30' : 'bg-teal-50 border-teal-200'
            }`}>
              <div className="flex items-center gap-2">
                <Target className={`w-4 h-4 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
                <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                  Recommended Action
                </h4>
              </div>
              <p
                className={`text-sm leading-relaxed ${isDark ? 'text-white/90' : 'text-gray-800'}`}
                data-testid={`text-action-${item.id}`}
              >
                {item.snapshotAction}
              </p>
            </div>

            {/* Progress tracking for biomarkers - only show when we have actual numeric values */}
            {(() => {
              const hasProgressData = item.targetBiomarker && 
                typeof item.currentValue === 'number' && 
                typeof item.targetValue === 'number';
              return hasProgressData;
            })() && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Progress Tracking
                  </h4>
                  {/* Time Period Selector */}
                  <select 
                    value={timePeriod}
                    onChange={(e) => setTimePeriod(e.target.value as typeof timePeriod)}
                    className={`px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                      isDark 
                        ? 'bg-slate-800/60 border-white/10 text-white' 
                        : 'bg-white border-gray-200 text-gray-900'
                    }`}
                    data-testid={`select-period-${item.id}`}
                  >
                    <option value="3M">3 months</option>
                    <option value="6M">6 months</option>
                    <option value="9M">9 months</option>
                    <option value="12M">12 months</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Current Value */}
                  <div className={`p-4 rounded-xl border ${
                    isDark ? 'bg-slate-800/60 border-white/10' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Current
                    </div>
                    <div className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {item.currentValue} <span className={`text-sm font-normal ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{item.unit}</span>
                    </div>
                  </div>
                  {/* Target Value */}
                  <div className={`p-4 rounded-xl border ${
                    isDark ? 'bg-teal-500/20 border-teal-400/30' : 'bg-teal-50 border-teal-200'
                  }`}>
                    <div className={`text-xs mb-2 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                      Target
                    </div>
                    <div className={`text-3xl font-bold ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                      {item.targetValue} <span className={`text-sm font-normal ${isDark ? 'text-teal-400/70' : 'text-teal-500'}`}>{item.unit}</span>
                    </div>
                  </div>
                </div>

                {/* Progress Chart - values are guaranteed non-null by parent condition */}
                <BiomarkerProgressChart
                  actionItemId={item.id}
                  addedAt={item.addedAt}
                  currentValue={item.currentValue!}
                  targetValue={item.targetValue!}
                  unit={item.unit || ''}
                  timePeriod={timePeriod}
                />
              </div>
            )}

            {/* Action buttons */}
            {isActive && (
              <div className="flex items-center gap-3 pt-2">
                {onComplete && (
                  <button
                    onClick={() => onComplete(item.id)}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                    data-testid={`button-complete-${item.id}`}
                  >
                    <Check className="w-4 h-4" />
                    Mark Complete
                  </button>
                )}
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(item.id)}
                    className="px-6 py-3 rounded-xl bg-transparent border border-white/20 text-white/60 hover:text-white hover:border-white/30 transition-all flex items-center gap-2"
                    data-testid={`button-dismiss-${item.id}`}
                  >
                    <X className="w-4 h-4" />
                    Dismiss
                  </button>
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
