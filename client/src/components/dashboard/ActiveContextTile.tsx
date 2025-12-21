import { Plane, Activity, Heart, Moon, Utensils, AlertCircle, X, Check, Clock } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO } from "date-fns";

interface ActiveContextTileProps {
  isDark: boolean;
}

interface ActiveLifeEvent {
  id: string;
  event_type: string;
  details: Record<string, any>;
  affected_metrics: string[];
  adjustment_type: string;
  adjustment_value: number;
  starts_at: string;
  ends_at: string | null;
  source: string;
}

const getEventIcon = (eventType: string) => {
  switch (eventType.toLowerCase()) {
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

const getEventLabel = (eventType: string): string => {
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

const getEventColor = (eventType: string, isDark: boolean) => {
  switch (eventType.toLowerCase()) {
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

export function ActiveContextTile({ isDark }: ActiveContextTileProps) {
  const { toast } = useToast();

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

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-white/5 border-white/10' 
          : 'bg-white/60 border-black/10'
      }`}
      data-testid="tile-active-context"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-context-title">
            Current Context
          </h3>
        </div>
        <span 
          className={`text-xs px-2 py-0.5 rounded-full ${
            isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
          }`}
          data-testid="badge-ml-adjusted"
        >
          ML Adjusted
        </span>
      </div>

      <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
        Sensitivity thresholds are adjusted based on your current situation.
      </p>

      <div className="space-y-3">
        {events.map((event) => {
          const Icon = getEventIcon(event.event_type);
          const colors = getEventColor(event.event_type, isDark);
          const endsAt = event.ends_at ? parseISO(event.ends_at) : null;
          const startsAt = parseISO(event.starts_at);
          
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
                      {getEventLabel(event.event_type)}
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

              {event.affected_metrics && event.affected_metrics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" data-testid={`metrics-list-${event.id}`}>
                  {event.affected_metrics.slice(0, 4).map((metric, index) => (
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
                  {event.affected_metrics.length > 4 && (
                    <span 
                      className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}
                      data-testid={`text-more-metrics-${event.id}`}
                    >
                      +{event.affected_metrics.length - 4} more
                    </span>
                  )}
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
    </div>
  );
}
