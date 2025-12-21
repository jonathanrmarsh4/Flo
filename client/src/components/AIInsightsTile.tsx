import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ChevronRight, TrendingUp, Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { InsightsModal } from "./InsightsModal";
import { usePlan, usePaywallModals } from "@/hooks/usePlan";
import { PaywallModal } from "./PaywallModal";
import { useLocation } from "wouter";

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

interface AIInsightsTileProps {
  isDark?: boolean;
}

export function AIInsightsTile({ isDark = true }: AIInsightsTileProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [, setLocation] = useLocation();
  
  const { data: planData } = usePlan();
  const { data: modalsData } = usePaywallModals();
  
  const allowAiInsightsTile = planData?.features?.ai?.allowAiInsightsTile ?? false;
  
  const { data, isLoading } = useQuery<{ insights: DailyInsight[]; count: number }>({
    queryKey: ['/api/daily-insights'],
    enabled: allowAiInsightsTile,
  });

  const insights = data?.insights || [];
  const newCount = insights.filter(i => i.isNew).length;

  const paywallModal = modalsData?.modals?.find(m => m.id === 'upgrade_on_locked_insights_tile') || {
    id: 'upgrade_on_locked_insights_tile',
    title: 'Unlock AI Insights',
    description: 'Flō can continuously scan your labs and wearable data to surface the patterns that matter most.',
    benefits: [
      'AI-generated insights across all data',
      'Updated as new labs and data arrive',
      'Flō — human-level health coaching',
      'Unlimited voice conversations',
    ],
    ctaText: 'Unlock Insights',
    ctaAction: 'upgrade_to_premium' as const,
  };

  if (!allowAiInsightsTile) {
    return (
      <>
        <div 
          className={`backdrop-blur-xl rounded-3xl border p-6 relative overflow-hidden cursor-pointer ${
            isDark 
              ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
              : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
          }`} 
          data-testid="tile-ai-insights-locked"
          onClick={() => setShowPaywall(true)}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                  <Sparkles className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <div>
                  <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>AI Insights</h2>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Personalized health recommendations</p>
                </div>
              </div>
              <Badge className="bg-gradient-to-r from-amber-500/80 to-orange-500/80 text-white border-0 px-3 flex items-center gap-1" data-testid="badge-premium">
                <Lock className="w-3 h-3" />
                Premium
              </Badge>
            </div>
            
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className={`p-4 rounded-full mb-4 ${isDark ? 'bg-amber-500/10' : 'bg-amber-100'}`}>
                <Lock className={`w-8 h-8 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              </div>
              <p className={`text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Unlock AI-Powered Insights
              </p>
              <p className={`text-xs max-w-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Get personalized health patterns and recommendations based on your labs and wearable data.
              </p>
              <button
                className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-medium flex items-center gap-2"
                data-testid="button-unlock-insights"
              >
                <Sparkles className="w-4 h-4" />
                Unlock with Premium
              </button>
            </div>
          </div>
        </div>
        
        <PaywallModal
          open={showPaywall}
          onOpenChange={setShowPaywall}
          modal={paywallModal}
          onUpgrade={() => setLocation('/billing')}
        />
      </>
    );
  }

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`} 
      data-testid="tile-ai-insights"
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <Sparkles className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>AI Insights</h2>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Personalized health recommendations</p>
            </div>
          </div>
          {newCount > 0 && (
            <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0 px-3" data-testid="badge-new-count">
              {newCount} new
            </Badge>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className={`w-12 h-12 mb-3 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              No new insights today. Check back tomorrow!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Show first 2 insights as preview */}
            {insights.slice(0, 2).map((insight) => (
              <div
                key={insight.id}
                onClick={() => setIsModalOpen(true)}
                className={`p-4 rounded-xl transition-all cursor-pointer ${
                  isDark 
                    ? 'bg-white/5 border border-white/10 hover:bg-white/10' 
                    : 'bg-white/60 border border-black/5 hover:bg-white/80'
                }`}
                data-testid={`preview-insight-${insight.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className={`text-base font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {insight.pattern}
                    </h3>
                    <p className={`text-sm line-clamp-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      {insight.supportingData}
                    </p>
                  </div>
                  <Badge
                    className={`${getCategoryColor(insight.category)} text-xs flex-shrink-0`}
                    data-testid={`badge-category-${insight.id}`}
                  >
                    {getCategoryLabel(insight.category)}
                  </Badge>
                </div>
              </div>
            ))}

            {/* View all button */}
            <button
              onClick={() => setIsModalOpen(true)}
              className={`w-full px-4 py-3 mt-2 rounded-xl border flex items-center justify-between transition-colors text-sm ${
                isDark 
                  ? 'border-white/10 hover:bg-white/5 text-white/70' 
                  : 'border-black/10 hover:bg-black/5 text-gray-600'
              }`}
              data-testid="button-view-all-insights"
            >
              <span>View all insights</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Insights Modal */}
      <InsightsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
