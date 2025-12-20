import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FloBottomNav } from "@/components/FloBottomNav";
import { useTheme } from "@/components/theme-provider";
import { Sparkles, TrendingUp, Plus, Check, Loader2, Filter, RefreshCw, AlertTriangle, X, Heart, Trash2 } from "lucide-react";

interface DailyInsight {
  id: string;
  category: string;
  pattern: string;
  supportingData: string;
  action: string;
  confidence: number;
  isNew: boolean;
  targetBiomarker?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
}

interface CorrelationInsight {
  id: string;
  text: string;
  tags: string[];
  importance: number;
  createdAt: string;
}

const getCategoryColor = (category: string, isDark: boolean) => {
  const categoryColors = {
    sleep_quality: isDark 
      ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
      : 'bg-indigo-100 text-indigo-700 border-indigo-200',
    activity_sleep: isDark 
      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      : 'bg-orange-100 text-orange-700 border-orange-200',
    biomarkers: isDark 
      ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
      : 'bg-teal-100 text-teal-700 border-teal-200',
    recovery_hrv: isDark 
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-green-100 text-green-700 border-green-200',
    nutrition: isDark 
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-amber-100 text-amber-700 border-amber-200'
  };
  return categoryColors[category as keyof typeof categoryColors] 
    || (isDark ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' : 'bg-gray-100 text-gray-700 border-gray-200');
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
    case 'nutrition':
      return 'Nutrition';
    default:
      return category;
  }
};

type CategoryFilter = 'deep_insights' | 'all' | 'sleep_quality' | 'activity_sleep' | 'biomarkers' | 'recovery_hrv' | 'nutrition';

export default function InsightsScreen() {
  const { toast } = useToast();
  const { isDark } = useTheme();
  const [addedInsights, setAddedInsights] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

  const { data, isLoading } = useQuery<{ insights: DailyInsight[]; count: number }>({
    queryKey: ['/api/daily-insights'],
  });

  const addToActionPlanMutation = useMutation({
    mutationFn: async (insight: DailyInsight) => {
      // Log what we're sending to debug progress tracking
      console.log('[ActionPlan] Adding insight to action plan:', {
        id: insight.id,
        title: insight.pattern,
        targetBiomarker: insight.targetBiomarker,
        currentValue: insight.currentValue,
        targetValue: insight.targetValue,
        unit: insight.unit,
        category: insight.category
      });
      
      return apiRequest('POST', '/api/action-plan', {
        dailyInsightId: insight.id,
        snapshotTitle: insight.pattern,
        snapshotInsight: insight.supportingData,
        snapshotAction: insight.action,
        category: insight.category,
        targetBiomarker: insight.targetBiomarker,
        currentValue: insight.currentValue,
        targetValue: insight.targetValue,
        unit: insight.unit,
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
  
  // Fetch correlation insights (ML-detected patterns with user responses)
  const { data: correlationData } = useQuery<{ insights: CorrelationInsight[] }>({
    queryKey: ['/api/correlation/insights'],
  });
  const correlationInsights = correlationData?.insights || [];

  // Delete correlation insight mutation
  const deleteCorrelationMutation = useMutation({
    mutationFn: async (insightId: string) => {
      return apiRequest('DELETE', `/api/correlation/insights/${insightId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/correlation/insights'] });
      toast({
        title: "Insight removed",
        description: "The health pattern has been removed from your history.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove insight",
        variant: "destructive",
      });
    },
  });
  
  // Filter insights based on selected category
  // Deep Insights shows only ML patterns, not daily insights
  const filteredInsights = selectedCategory === 'deep_insights'
    ? [] // No daily insights for deep insights view
    : selectedCategory === 'all' 
      ? insights 
      : insights.filter(insight => insight.category === selectedCategory);

  const categoryFilterOptions = [
    { value: 'deep_insights' as CategoryFilter, label: 'Deep Insights' },
    { value: 'all' as CategoryFilter, label: 'All' },
    { value: 'sleep_quality' as CategoryFilter, label: 'Sleep' },
    { value: 'activity_sleep' as CategoryFilter, label: 'Activity' },
    { value: 'biomarkers' as CategoryFilter, label: 'Biomarkers' },
    { value: 'recovery_hrv' as CategoryFilter, label: 'Recovery' },
    { value: 'nutrition' as CategoryFilter, label: 'Nutrition' },
  ];

  return (
    <div className={`relative h-full flex flex-col overflow-hidden ${
      isDark 
        ? 'bg-gradient-to-br from-purple-900 via-slate-900 to-slate-800' 
        : 'bg-gradient-to-br from-slate-50 via-white to-gray-100'
    }`}>
      <div className="flex flex-col h-full">
        {/* Header with iOS safe area padding */}
        <div className={`flex-shrink-0 px-6 py-6 pt-[env(safe-area-inset-top)] border-b ${
          isDark ? 'border-white/10' : 'border-gray-200'
        }`}>
          <div className="mb-4 mt-4">
            <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="heading-insights">
              {selectedCategory === 'deep_insights' ? 'Deep Insights' : 'AI Insights'}
            </h1>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              {selectedCategory === 'deep_insights' 
                ? `${correlationInsights.length} ML-detected pattern${correlationInsights.length !== 1 ? 's' : ''}`
                : `${filteredInsights.length} personalized recommendation${filteredInsights.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            <Filter className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            {categoryFilterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedCategory(option.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  selectedCategory === option.value
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg'
                    : isDark 
                      ? 'bg-white/10 text-white/70 hover:bg-white/20' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                data-testid={`filter-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${isDark ? 'border-purple-400' : 'border-purple-600'}`}></div>
            </div>
          )}

          {/* Empty state - different for Deep Insights vs regular */}
          {!isLoading && selectedCategory === 'deep_insights' && correlationInsights.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center gap-4 py-12">
              <AlertTriangle className={`w-16 h-16 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
              <div>
                <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>No Deep Insights Yet</h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                  Our ML engine is analyzing your health data. Deep insights will appear here when patterns are detected.
                </p>
              </div>
            </div>
          )}
          
          {!isLoading && selectedCategory !== 'deep_insights' && filteredInsights.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center gap-4 py-12">
              <Sparkles className={`w-16 h-16 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
              <div>
                <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {selectedCategory === 'all' ? 'No Insights Available' : `No ${categoryFilterOptions.find(o => o.value === selectedCategory)?.label} Insights`}
                </h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                  {selectedCategory === 'all' 
                    ? 'Check back tomorrow for personalized AI insights based on your health data.'
                    : 'Try selecting a different category to see more insights.'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Deep Insights View - ML Patterns prominently displayed */}
          {!isLoading && selectedCategory === 'deep_insights' && correlationInsights.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Machine learning detected patterns</span>
              </div>
              {correlationInsights.map((insight) => {
                const patternType = insight.tags.find(t => t !== 'ml_anomaly') || 'pattern';
                const isIllness = patternType === 'illness_precursor';
                const isRecovery = patternType === 'recovery_deficit';
                
                return (
                  <div
                    key={insight.id}
                    className={`rounded-2xl border p-5 ${
                      isIllness 
                        ? isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
                        : isRecovery 
                          ? isDark ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'
                          : isDark ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200'
                    }`}
                    data-testid={`card-deep-insight-${insight.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl ${
                        isIllness 
                          ? isDark ? 'bg-amber-500/20' : 'bg-amber-100'
                          : isRecovery 
                            ? isDark ? 'bg-rose-500/20' : 'bg-rose-100'
                            : isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'
                      }`}>
                        {isIllness ? (
                          <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-amber-500' : 'text-amber-600'}`} />
                        ) : isRecovery ? (
                          <Heart className={`w-5 h-5 ${isDark ? 'text-rose-500' : 'text-rose-600'}`} />
                        ) : (
                          <TrendingUp className={`w-5 h-5 ${isDark ? 'text-cyan-500' : 'text-cyan-600'}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                            isIllness 
                              ? isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                              : isRecovery 
                                ? isDark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-100 text-rose-700'
                                : isDark ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'
                          }`}>
                            {isIllness 
                              ? 'ILLNESS PATTERN' 
                              : isRecovery 
                                ? 'RECOVERY CONCERN'
                                : 'HEALTH PATTERN'}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            insight.importance >= 4 
                              ? isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                              : insight.importance >= 3
                                ? isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                                : isDark ? 'bg-white/10 text-white/50' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {insight.importance >= 4 ? 'High Priority' : insight.importance >= 3 ? 'Medium' : 'Low'}
                          </span>
                        </div>
                        <p className={`text-base leading-relaxed mb-3 ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                          {insight.text}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                            Detected {new Date(insight.createdAt).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          <button
                            onClick={() => deleteCorrelationMutation.mutate(insight.id)}
                            disabled={deleteCorrelationMutation.isPending}
                            className={`p-2 rounded-lg transition-colors ${
                              isDark 
                                ? 'hover:bg-white/10 text-white/50 hover:text-white/80' 
                                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                            }`}
                            data-testid={`button-delete-deep-${insight.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Insights list - only show when not in Deep Insights view */}
          {!isLoading && selectedCategory !== 'deep_insights' && filteredInsights.length > 0 && (
            <div className="flex flex-col gap-4">
              {filteredInsights.map((insight) => {
                const isAdded = addedInsights.has(insight.id);
                const isAdding = addToActionPlanMutation.isPending && 
                  addToActionPlanMutation.variables?.id === insight.id;

                return (
                  <div
                    key={insight.id}
                    className={`rounded-2xl border p-6 ${
                      isDark 
                        ? 'border-white/10 bg-slate-800/40' 
                        : 'border-gray-200 bg-white shadow-sm'
                    }`}
                    data-testid={`card-insight-${insight.id}`}
                  >
                    {/* Header with icon, title and category */}
                    <div className="flex gap-4 mb-4">
                      {/* Icon */}
                      <div className="flex-shrink-0">
                        <div className={`p-3 rounded-xl ${isDark ? 'bg-teal-500/20' : 'bg-teal-100'}`}>
                          <Sparkles className={`w-5 h-5 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
                        </div>
                      </div>

                      {/* Title and category */}
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3
                            className={`text-lg font-semibold flex-1 ${isDark ? 'text-white' : 'text-gray-900'}`}
                            data-testid={`text-pattern-${insight.id}`}
                          >
                            {insight.pattern}
                          </h3>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(insight.category, isDark)} flex-shrink-0`}
                            data-testid={`badge-category-${insight.id}`}
                          >
                            {getCategoryLabel(insight.category)}
                          </span>
                        </div>

                        {/* Target label (if applicable) */}
                        {insight.targetBiomarker && (
                          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                            Target: {insight.targetBiomarker}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dialogue boxes - aligned with left margin */}
                    <div className="flex flex-col gap-4">
                      {/* Insight Section */}
                      <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-700/40' : 'bg-gray-50'}`}>
                        <div className={`text-xs font-medium mb-2 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>Insight</div>
                        <p
                          className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}
                          data-testid={`text-supporting-${insight.id}`}
                        >
                          {insight.supportingData}
                        </p>
                      </div>

                      {/* Recommended Action Section */}
                      <div className={`p-4 rounded-xl border ${
                        isDark 
                          ? 'bg-teal-500/10 border-teal-500/20' 
                          : 'bg-teal-50 border-teal-200'
                      }`}>
                        <div className={`text-xs font-medium mb-2 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>Recommended Action</div>
                        <p
                          className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}
                          data-testid={`text-action-${insight.id}`}
                        >
                          {insight.action}
                        </p>
                      </div>

                      {/* Current/Target Values (if applicable) */}
                      {insight.targetBiomarker && insight.currentValue !== null && insight.targetValue !== null && (
                        <div className="grid grid-cols-2 gap-3">
                          {/* Current Value */}
                          <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-700/60' : 'bg-gray-100'}`}>
                            <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              Current
                            </div>
                            <div className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {insight.currentValue} <span className={`text-sm font-normal ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{insight.unit}</span>
                            </div>
                          </div>
                          {/* Target Value */}
                          <div className={`p-4 rounded-xl border ${
                            isDark 
                              ? 'bg-teal-500/20 border-teal-400/30' 
                              : 'bg-teal-50 border-teal-200'
                          }`}>
                            <div className={`text-xs mb-2 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                              Target
                            </div>
                            <div className={`text-3xl font-bold ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                              {insight.targetValue} <span className={`text-sm font-normal ${isDark ? 'text-teal-400/70' : 'text-teal-500'}`}>{insight.unit}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Add to Action Plan button */}
                      <button
                        className="w-full px-6 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-cyan-500/50 flex items-center justify-center gap-2"
                        onClick={() => addToActionPlanMutation.mutate(insight)}
                        disabled={isAdding || isAdded}
                        data-testid={`button-add-${insight.id}`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Added to Action Plan</span>
                          </>
                        ) : isAdding ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Add to Action Plan</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ML Detected Patterns Section - only show at bottom when NOT in Deep Insights view */}
          {selectedCategory !== 'deep_insights' && correlationInsights.length > 0 && (
            <div className={`mt-8 pt-6 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>ML Detected Patterns</h2>
                <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>({correlationInsights.length})</span>
              </div>
              <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                Health patterns detected by our machine learning engine based on your data.
              </p>
              <div className="flex flex-col gap-3">
                {correlationInsights.map((insight) => {
                  const patternType = insight.tags.find(t => t !== 'ml_anomaly') || 'pattern';
                  const isIllness = patternType === 'illness_precursor';
                  const isRecovery = patternType === 'recovery_deficit';
                  
                  return (
                    <div
                      key={insight.id}
                      className={`rounded-xl border p-4 ${
                        isIllness 
                          ? isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
                          : isRecovery 
                            ? isDark ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'
                            : isDark ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200'
                      }`}
                      data-testid={`card-correlation-${insight.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          isIllness 
                            ? isDark ? 'bg-amber-500/20' : 'bg-amber-100'
                            : isRecovery 
                              ? isDark ? 'bg-rose-500/20' : 'bg-rose-100'
                              : isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'
                        }`}>
                          {isIllness ? (
                            <AlertTriangle className={`w-4 h-4 ${isDark ? 'text-amber-500' : 'text-amber-600'}`} />
                          ) : isRecovery ? (
                            <Heart className={`w-4 h-4 ${isDark ? 'text-rose-500' : 'text-rose-600'}`} />
                          ) : (
                            <TrendingUp className={`w-4 h-4 ${isDark ? 'text-cyan-500' : 'text-cyan-600'}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              {isIllness 
                                ? 'ILLNESS PATTERN' 
                                : isRecovery 
                                  ? 'RECOVERY CONCERN'
                                  : 'HEALTH PATTERN'}
                            </span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              insight.importance >= 4 
                                ? isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                                : insight.importance >= 3
                                  ? isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                                  : isDark ? 'bg-white/10 text-white/50' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {insight.importance >= 4 ? 'High' : insight.importance >= 3 ? 'Medium' : 'Low'}
                            </span>
                          </div>
                          <p className={`text-sm leading-relaxed ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                            {insight.text}
                          </p>
                          <div className="flex items-center justify-between mt-3">
                            <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                              {new Date(insight.createdAt).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                            <button
                              onClick={() => deleteCorrelationMutation.mutate(insight.id)}
                              disabled={deleteCorrelationMutation.isPending}
                              className={`p-2 rounded-lg transition-colors ${
                                isDark 
                                  ? 'hover:bg-white/10 text-white/50 hover:text-white/80' 
                                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                              }`}
                              data-testid={`button-delete-correlation-${insight.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
