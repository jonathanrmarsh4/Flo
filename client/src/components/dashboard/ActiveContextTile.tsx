import { useState } from "react";
import { Plane, Activity, Heart, Moon, Utensils, AlertCircle, Check, Clock, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface ActiveContextTileProps {
  isDark: boolean;
}

interface ActiveLifeEvent {
  id: string;
  eventType: string;
  details: Record<string, any>;
  affectedMetrics: string[];
  suppressionAction: string;
  thresholdMultiplier: number;
  happenedAt: string;
  endsAt: string | null;
  source: string;
  confidenceScore: number;
  confidenceFactors: string[];
}

const getEventIcon = (eventType: string | null | undefined) => {
  const type = eventType?.toLowerCase() || '';
  switch (type) {
    case 'travel':
    case 'vacation':
    case 'jet_lag':
      return Plane;
    case 'illness':
    case 'sick':
      return Heart;
    case 'rest_day':
    case 'recovery':
      return Moon;
    case 'fasting':
    case 'diet_change':
      return Utensils;
    case 'stress':
    case 'anxiety':
      return AlertCircle;
    default:
      return Activity;
  }
};

const getEventLabel = (eventType: string | null | undefined): string => {
  if (!eventType) return 'Event';
  const labels: Record<string, string> = {
    'travel': 'Traveling',
    'vacation': 'On Vacation',
    'jet_lag': 'Jet Lag',
    'illness': 'Feeling Unwell',
    'sick': 'Sick',
    'stress': 'High Stress',
    'rest_day': 'Rest Day',
    'recovery': 'Recovery Mode',
    'injury': 'Recovering from Injury',
    'fasting': 'Fasting',
    'diet_change': 'Diet Change',
    'alcohol': 'Post-Alcohol Recovery',
  };
  return labels[eventType.toLowerCase()] || eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getEventColor = (eventType: string | null | undefined, isDark: boolean) => {
  const type = eventType?.toLowerCase() || '';
  switch (type) {
    case 'travel':
    case 'vacation':
    case 'jet_lag':
      return {
        bg: isDark ? 'bg-blue-500/10' : 'bg-blue-50',
        border: isDark ? 'border-blue-500/30' : 'border-blue-200',
        text: 'text-blue-500',
        icon: isDark ? 'text-blue-400' : 'text-blue-600',
      };
    case 'illness':
    case 'sick':
      return {
        bg: isDark ? 'bg-red-500/10' : 'bg-red-50',
        border: isDark ? 'border-red-500/30' : 'border-red-200',
        text: 'text-red-500',
        icon: isDark ? 'text-red-400' : 'text-red-600',
      };
    case 'stress':
    case 'anxiety':
      return {
        bg: isDark ? 'bg-amber-500/10' : 'bg-amber-50',
        border: isDark ? 'border-amber-500/30' : 'border-amber-200',
        text: 'text-amber-500',
        icon: isDark ? 'text-amber-400' : 'text-amber-600',
      };
    default:
      return {
        bg: isDark ? 'bg-purple-500/10' : 'bg-purple-50',
        border: isDark ? 'border-purple-500/30' : 'border-purple-200',
        text: 'text-purple-500',
        icon: isDark ? 'text-purple-400' : 'text-purple-600',
      };
  }
};

// High confidence threshold - above this, the banner auto-collapses
const HIGH_CONFIDENCE_THRESHOLD = 85;

export function ActiveContextTile({ isDark }: ActiveContextTileProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: events, isLoading } = useQuery<ActiveLifeEvent[]>({
    queryKey: ['/api/life-events/active'],
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });

  const endEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return await apiRequest('POST', `/api/life-events/${eventId}/end`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/life-events/active'] });
      toast({
        title: "Context cleared",
        description: "Your normal baselines will resume.",
      });
    },
    onError: () => {
      toast({
        title: "Couldn't update",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !events || events.length === 0) {
    return null;
  }

  // Calculate average confidence across all events
  const avgConfidence = events.reduce((sum, e) => sum + (e.confidenceScore || 75), 0) / events.length;
  const isHighConfidence = avgConfidence >= HIGH_CONFIDENCE_THRESHOLD;
  
  // Get primary event for collapsed display
  const primaryEvent = events[0];
  const PrimaryIcon = getEventIcon(primaryEvent.eventType);
  const primaryColors = getEventColor(primaryEvent.eventType, isDark);

  // Collapsed Banner View
  if (!isExpanded) {
    return (
      <motion.button
        onClick={() => setIsExpanded(true)}
        className={`w-full backdrop-blur-xl rounded-2xl border px-4 py-3 transition-all hover-elevate ${
          isDark 
            ? 'bg-white/5 border-white/10' 
            : 'bg-white/60 border-black/10'
        }`}
        data-testid="tile-active-context-collapsed"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-1.5 rounded-lg ${primaryColors.bg}`}>
              <PrimaryIcon className={`w-4 h-4 ${primaryColors.icon}`} />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span 
                className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}
                data-testid="text-context-summary"
              >
                {getEventLabel(primaryEvent.eventType)}
                {events.length > 1 && (
                  <span className={`ml-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    +{events.length - 1} more
                  </span>
                )}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <span 
              className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
              }`}
              data-testid="badge-ml-adjusted"
            >
              <Sparkles className="w-3 h-3" />
              ML Adjusted
            </span>
            <ChevronDown className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
          </div>
        </div>
      </motion.button>
    );
  }

  // Expanded View
  return (
    <motion.div 
      className={`backdrop-blur-xl rounded-2xl border overflow-hidden transition-all ${
        isDark 
          ? 'bg-white/5 border-white/10' 
          : 'bg-white/60 border-black/10'
      }`}
      data-testid="tile-active-context"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      layout
    >
      {/* Header - Clickable to collapse */}
      <button
        onClick={() => setIsExpanded(false)}
        className={`w-full flex items-center justify-between p-4 transition-colors ${
          isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
        }`}
        data-testid="button-collapse-context"
      >
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-context-title">
            Current Context
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span 
            className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
            }`}
            data-testid="badge-ml-adjusted-expanded"
          >
            <Sparkles className="w-3 h-3" />
            ML Adjusted
          </span>
          <ChevronUp className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        <motion.div 
          className="px-4 pb-4"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
        >
          <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Sensitivity thresholds are adjusted based on your current situation.
          </p>

          <div className="space-y-3">
            {events.map((event) => {
              if (!event || !event.happenedAt) {
                return null;
              }
              
              const Icon = getEventIcon(event.eventType);
              const colors = getEventColor(event.eventType, isDark);
              const endsAt = event.endsAt ? parseISO(event.endsAt) : null;
              const startsAt = parseISO(event.happenedAt);
              
              return (
                <div 
                  key={event.id}
                  className={`rounded-xl p-3 border ${colors.bg} ${colors.border}`}
                  data-testid={`context-event-${event.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${colors.icon}`} />
                      <div className="flex-1 min-w-0">
                        <span 
                          className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}
                          data-testid={`text-event-label-${event.id}`}
                        >
                          {getEventLabel(event.eventType)}
                        </span>
                        {event.details?.location && (
                          <span 
                            className={`text-xs ml-1 ${isDark ? 'text-white/60' : 'text-gray-600'}`}
                            data-testid={`text-event-location-${event.id}`}
                          >
                            ({event.details.location})
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => endEventMutation.mutate(event.id)}
                      disabled={endEventMutation.isPending}
                      data-testid={`button-end-event-${event.id}`}
                    >
                      <Check className={`w-4 h-4 ${isDark ? 'text-white/70' : 'text-gray-500'}`} />
                    </Button>
                  </div>
                  
                  <div className={`flex items-center gap-3 mt-2 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span data-testid={`text-event-started-${event.id}`}>
                        Started {formatDistanceToNow(startsAt, { addSuffix: true })}
                      </span>
                    </div>
                    {endsAt && (
                      <span data-testid={`text-event-ends-${event.id}`}>
                        Ends {formatDistanceToNow(endsAt, { addSuffix: true })}
                      </span>
                    )}
                  </div>

                  {event.affectedMetrics && event.affectedMetrics.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1" data-testid={`metrics-list-${event.id}`}>
                      {event.affectedMetrics.slice(0, 4).map((metric, index) => (
                        <span 
                          key={metric}
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            isDark ? 'bg-white/10 text-white/70' : 'bg-black/5 text-gray-600'
                          }`}
                          data-testid={`badge-metric-${event.id}-${index}`}
                        >
                          {metric.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {event.affectedMetrics.length > 4 && (
                        <span 
                          className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}
                          data-testid={`text-more-metrics-${event.id}`}
                        >
                          +{event.affectedMetrics.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Confidence indicator - only show if below threshold */}
                  {event.confidenceScore < HIGH_CONFIDENCE_THRESHOLD && (
                    <div className={`mt-2 pt-2 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                          Confidence: {Math.round(event.confidenceScore)}%
                        </span>
                        <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                          {event.confidenceFactors?.[0] || ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className={`text-xs mt-4 pt-3 border-t ${
            isDark ? 'border-white/10 text-white/40' : 'border-gray-200 text-gray-400'
          }`}>
            Tap the check to mark as resolved and restore normal thresholds.
          </p>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
