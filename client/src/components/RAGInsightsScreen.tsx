import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Settings, RefreshCw, Activity, Heart, Moon, Droplets, Sparkles, Search } from 'lucide-react';
import { InsightCard } from './InsightCard';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { InsightCard as InsightCardType } from '@shared/schema';

// Extended type that includes action field from dailyInsights table
type InsightWithAction = InsightCardType & {
  action?: string | null;
};

interface RAGInsightsScreenProps {
  isDark: boolean;
  onClose: () => void;
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Sleep', value: 'sleep_quality' },
  { label: 'Activity', value: 'activity_sleep' },
  { label: 'Biomarkers', value: 'biomarkers' },
  { label: 'Recovery', value: 'recovery_hrv' },
];

const CATEGORY_ICON_MAP = {
  activity_sleep: Activity,
  recovery_hrv: Heart,
  sleep_quality: Moon,
  biomarkers: Droplets,
  general: Sparkles,
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  activity_sleep: 'ACTIVITY',
  recovery_hrv: 'RECOVERY',
  sleep_quality: 'SLEEP',
  biomarkers: 'BIOMARKERS',
  general: 'GENERAL',
};

export function RAGInsightsScreen({ isDark, onClose }: RAGInsightsScreenProps) {
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Fetch daily insights (v2.0 engine)
  const { data: insightsResponse, isLoading } = useQuery<{ date: string; count: number; insights: InsightWithAction[] }>({
    queryKey: ['/api/daily-insights'],
  });
  
  const insights = insightsResponse?.insights || [];

  // Refresh insights mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/daily-insights/generate', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-insights'] });
      console.log('[Insights] Successfully generated insights');
    },
    onError: (error: any) => {
      console.error('[Insights] Failed to generate insights:', error);
      console.error('[Insights] Error details:', {
        status: error?.status,
        message: error?.message,
        response: error?.response,
      });
    },
  });

  const filteredInsights = selectedFilter === 'all' 
    ? insights 
    : insights.filter(insight => insight.category === selectedFilter);

  const handleRefresh = () => {
    console.log('[Insights] Refresh button clicked - starting mutation');
    refreshMutation.mutate();
  };

  // Feedback mutation for thumbs up/down
  const feedbackMutation = useMutation({
    mutationFn: async ({ insightId, isHelpful }: { insightId: string; isHelpful: boolean }) => {
      const insight = insights.find(i => i.id === insightId);
      const patternSignature = `${insight?.category || 'general'}_${insight?.pattern?.slice(0, 50) || insightId}`;
      return apiRequest('POST', '/api/daily-insights/feedback', {
        insightId,
        patternSignature,
        isHelpful,
        isAccurate: isHelpful,
      });
    },
    onSuccess: () => {
      console.log('[Insights] Feedback submitted successfully - ML thresholds updated');
    },
    onError: (error: any) => {
      console.error('[Insights] Failed to submit feedback:', error);
      throw error;
    },
  });

  const handleInsightFeedback = async (insightId: string, isHelpful: boolean): Promise<void> => {
    await feedbackMutation.mutateAsync({ insightId, isHelpful });
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 z-50">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-10 pt-[env(safe-area-inset-top)] backdrop-blur-xl border-b border-white/10 bg-gradient-to-br from-slate-900/80 via-blue-950/80 to-slate-900/80">
        <div className="h-16 px-5 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
            data-testid="button-close-insights"
          >
            <ArrowLeft className="w-5 h-5 text-white/90" />
          </button>
          <h1 className="text-sm tracking-wide text-white/90 font-medium">
            INSIGHTS
          </h1>
          <button 
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className="p-2 -mr-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            data-testid="button-refresh-insights-header"
          >
            <RefreshCw className={`w-5 h-5 text-white/60 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="fixed left-0 right-0 z-10 backdrop-blur-xl border-b border-white/10 bg-gradient-to-br from-slate-900/80 via-blue-950/80 to-slate-900/80" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex gap-2 overflow-x-auto px-5 py-3 scrollbar-hide">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSelectedFilter(tab.value)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
                selectedFilter === tab.value
                  ? 'bg-teal-500/30 text-teal-400'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
              data-testid={`button-filter-${tab.value}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area - accounts for header (4rem) + safe area + filter tabs (~3.5rem) */}
      <div className="pb-32 px-5 overflow-y-auto h-full" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        {isLoading ? (
          <InsightsLoadingSkeleton />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedFilter}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {filteredInsights.length > 0 ? (
                filteredInsights.map((insight, index) => {
                  const IconComponent = CATEGORY_ICON_MAP[insight.category as keyof typeof CATEGORY_ICON_MAP] || Sparkles;
                  return (
                    <InsightCard
                      key={insight.id}
                      IconComponent={IconComponent}
                      category={CATEGORY_DISPLAY_NAMES[insight.category] || insight.category.replace(/_/g, ' ').toUpperCase()}
                      pattern={insight.pattern}
                      confidence={insight.confidence}
                      supportingData={insight.supportingData || ''}
                      action={insight.action}
                      details={insight.details as any}
                      isNew={insight.isNew}
                      delay={index * 0.1}
                      insightId={insight.id}
                      onFeedback={handleInsightFeedback}
                    />
                  );
                })
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16"
                >
                  <Search className="w-16 h-16 text-white/40 mb-4" />
                  <h3 className="text-lg font-medium text-white/90 mb-2">
                    No insights yet
                  </h3>
                  <p className="text-sm text-white/60 text-center max-w-xs">
                    {insights.length === 0 
                      ? "We're analyzing your health data to find patterns. Check back in 24 hours!"
                      : "No patterns found in this category yet. Keep tracking your health data!"}
                  </p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Footer - Refresh Button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent pt-8 pb-8 px-5 pointer-events-none">
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className="bg-teal-500/20 text-teal-400 px-6 py-3 rounded-full mx-auto block flex items-center gap-2 hover:bg-teal-500/30 transition-colors disabled:opacity-50 pointer-events-auto"
          data-testid="button-refresh-insights"
        >
          <RefreshCw 
            className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} 
          />
          {refreshMutation.isPending ? 'Refreshing...' : 'Refresh insights'}
        </button>
      </div>
    </div>
  );
}

function InsightsLoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse bg-white/5 h-32 rounded-2xl"
        />
      ))}
    </div>
  );
}
