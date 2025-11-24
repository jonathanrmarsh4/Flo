import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FloBottomNav } from "@/components/FloBottomNav";
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
    case 'nutrition':
      return 'Nutrition';
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
  const isDark = document.documentElement.classList.contains('dark');

  return (
    <>
      {/* Background Gradient */}
      <div className={`fixed inset-0 ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900'
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`} />

      <div className="relative min-h-screen pb-24">
        <div className="flex flex-col gap-6 p-4 max-w-4xl mx-auto">
          {/* Sticky Header */}
          <div className={`sticky top-0 z-10 backdrop-blur-xl border-b transition-colors ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
          }`}>
            <div className="flex items-center gap-3 p-4">
              <Sparkles className="w-6 h-6 text-teal-400" />
              <div>
                <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="heading-insights">
                  AI Insights
                </h1>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Personalized health insights powered by your data
                </p>
              </div>
            </div>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-400"></div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && insights.length === 0 && (
            <div className={`backdrop-blur-xl rounded-2xl border p-12 ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
            }`}>
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <Sparkles className={`w-16 h-16 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
                <div>
                  <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    No Insights Available
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Check back tomorrow for personalized AI insights based on your health data.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Insights list */}
          {!isLoading && insights.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                {insights.length} insight{insights.length !== 1 ? 's' : ''} available
              </div>

              {insights.map((insight) => {
                const isAdded = addedInsights.has(insight.id);
                const isAdding = addToActionPlanMutation.isPending && 
                  addToActionPlanMutation.variables?.id === insight.id;

                return (
                  <div
                    key={insight.id}
                    className={`backdrop-blur-xl rounded-2xl border transition-all p-6 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                    }`}
                    data-testid={`card-insight-${insight.id}`}
                  >
                    <div className="flex flex-col gap-4">
                      {/* Header with category and new badge */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${getCategoryColor(insight.category)}`}
                          data-testid={`badge-category-${insight.id}`}
                        >
                          {getCategoryLabel(insight.category)}
                        </span>
                        {insight.isNew && (
                          <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-xs text-white font-medium">
                            new
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3
                        className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                        data-testid={`text-pattern-${insight.id}`}
                      >
                        {insight.pattern}
                      </h3>

                      {/* Supporting data */}
                      <p
                        className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}
                        data-testid={`text-supporting-${insight.id}`}
                      >
                        {insight.supportingData}
                      </p>

                      {/* Action recommendation */}
                      <div className={`p-3 rounded-xl border ${
                        isDark ? 'bg-teal-500/5 border-teal-500/20' : 'bg-teal-50 border-teal-200'
                      }`}>
                        <div className="flex items-start gap-2">
                          <TrendingUp className="w-4 h-4 mt-0.5 text-teal-400 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-xs font-medium text-teal-400 mb-1">
                              RECOMMENDED ACTION
                            </div>
                            <p
                              className={`text-sm font-medium ${isDark ? 'text-white/80' : 'text-gray-700'}`}
                              data-testid={`text-action-${insight.id}`}
                            >
                              {insight.action}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Add to Action Plan button */}
                      <div className="flex items-center gap-2 pt-2">
                        {isAdded ? (
                          <button
                            className={`w-full p-2 rounded-lg transition-all border ${
                              isDark ? 'bg-white/10 border-white/20' : 'bg-gray-100 border-gray-300'
                            }`}
                            disabled
                            data-testid={`button-added-${insight.id}`}
                          >
                            <div className="flex items-center justify-center gap-2">
                              <Check className="w-4 h-4" />
                              <span className="text-sm">Added to Action Plan</span>
                            </div>
                          </button>
                        ) : (
                          <button
                            className={`w-full p-2 rounded-lg transition-all ${
                              isDark
                                ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30'
                                : 'bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-400 text-white shadow-lg hover:shadow-xl'
                            }`}
                            onClick={() => addToActionPlanMutation.mutate(insight)}
                            disabled={isAdding}
                            data-testid={`button-add-${insight.id}`}
                          >
                            <div className="flex items-center justify-center gap-2">
                              {isAdding ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                              <span className="text-sm font-medium">
                                {isAdding ? 'Adding...' : 'Add to Action Plan'}
                              </span>
                            </div>
                          </button>
                        )}
                      </div>

                      {/* Confidence score */}
                      <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        Confidence: {Math.round(insight.confidence * 100)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <FloBottomNav />
      </div>
    </>
  );
}
