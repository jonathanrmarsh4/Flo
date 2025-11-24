import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Sparkles, TrendingUp, Plus, Check, Loader2 } from "lucide-react";

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
      return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
    case 'recovery_hrv':
      return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
    case 'performance_activity':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
    case 'biomarkers':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    default:
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20';
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

export default function InsightsScreen() {
  const { toast } = useToast();
  const [addedInsights, setAddedInsights] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ insights: DailyInsight[]; count: number }>({
    queryKey: ['/api/daily-insights'],
  });

  const addToActionPlanMutation = useMutation({
    mutationFn: async (insight: DailyInsight) => {
      return apiRequest('POST', '/api/action-plan', {
        dailyInsightId: insight.id,
        snapshotTitle: insight.pattern,
        snapshotInsight: insight.supportingData,
        snapshotAction: insight.action,
        category: insight.category,
      });
    },
    onSuccess: (_, insight) => {
      setAddedInsights(prev => new Set(prev).add(insight.id));
      // Invalidate both action plan and daily insights to update badges/counts
      queryClient.invalidateQueries({ queryKey: ['/api/action-plan'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-insights'] });
      toast({
        title: "Added to Action Plan",
        description: "This insight has been added to your action plan.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add insight to action plan",
        variant: "destructive",
      });
    },
  });

  const insights = data?.insights || [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-insights">
            AI Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalized health insights powered by your data
          </p>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && insights.length === 0 && (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center gap-4">
            <Sparkles className="w-16 h-16 text-muted-foreground/20" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No Insights Available
              </h3>
              <p className="text-sm text-muted-foreground">
                Check back tomorrow for personalized AI insights based on your health data.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Insights list */}
      {!isLoading && insights.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="text-sm text-muted-foreground">
            {insights.length} insight{insights.length !== 1 ? 's' : ''} available
          </div>

          {insights.map((insight) => {
            const isAdded = addedInsights.has(insight.id);
            const isAdding = addToActionPlanMutation.isPending && 
              addToActionPlanMutation.variables?.id === insight.id;

            return (
              <Card
                key={insight.id}
                className="p-6"
                data-testid={`card-insight-${insight.id}`}
              >
                <div className="flex flex-col gap-4">
                  {/* Header with category and new badge */}
                  <div className="flex items-center gap-2">
                    <Badge
                      className={getCategoryColor(insight.category)}
                      data-testid={`badge-category-${insight.id}`}
                    >
                      {getCategoryLabel(insight.category)}
                    </Badge>
                    {insight.isNew && (
                      <Badge variant="default" className="bg-primary">
                        New
                      </Badge>
                    )}
                  </div>

                  {/* Title */}
                  <h3
                    className="text-lg font-semibold text-foreground"
                    data-testid={`text-pattern-${insight.id}`}
                  >
                    {insight.pattern}
                  </h3>

                  {/* Supporting data */}
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid={`text-supporting-${insight.id}`}
                  >
                    {insight.supportingData}
                  </p>

                  {/* Action recommendation */}
                  <div className="flex items-start gap-2 p-4 rounded-md bg-primary/5 border border-primary/10">
                    <TrendingUp className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        RECOMMENDED ACTION
                      </div>
                      <p
                        className="text-sm font-medium text-foreground"
                        data-testid={`text-action-${insight.id}`}
                      >
                        {insight.action}
                      </p>
                    </div>
                  </div>

                  {/* Add to Action Plan button */}
                  <div className="flex items-center gap-2 pt-2">
                    {isAdded ? (
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled
                        data-testid={`button-added-${insight.id}`}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Added to Action Plan
                      </Button>
                    ) : (
                      <Button
                        className="flex-1"
                        onClick={() => addToActionPlanMutation.mutate(insight)}
                        disabled={isAdding}
                        data-testid={`button-add-${insight.id}`}
                      >
                        {isAdding ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4 mr-2" />
                        )}
                        {isAdding ? 'Adding...' : 'Add to Action Plan'}
                      </Button>
                    )}
                  </div>

                  {/* Confidence score */}
                  <div className="text-xs text-muted-foreground">
                    Confidence: {Math.round(insight.confidence * 100)}%
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
