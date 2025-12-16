import { X, Activity, TrendingUp, Pill, Stethoscope, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { parseApiError } from '@/lib/utils';

interface BiomarkerInsight {
  lifestyleActions: string[];
  nutrition: string[];
  supplementation: string[];
  medicalReferral: string | null;
  medicalUrgency?: 'routine' | 'priority';
}

// Helper function to extract key terms from recommendation text
const extractKeywords = (text: string, category: 'supplement' | 'nutrition' | 'lifestyle'): string[] => {
  const keywords: string[] = [];
  
  if (category === 'supplement') {
    // Extract supplement names (text before dosage or dash)
    const supplementPatterns = [
      /^([A-Za-z0-9\s\-]+?)(?:\s*\(|\s*-)/,  // Name before parenthesis or dash
      /([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*)\s*\(/,  // Capitalized words before parenthesis
    ];
    
    for (const pattern of supplementPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const keyword = match[1].trim();
        if (keyword.length > 2 && !keywords.includes(keyword)) {
          keywords.push(keyword);
          break;
        }
      }
    }
  } else if (category === 'nutrition') {
    // Extract food items and nutrients
    const foodPatterns = [
      /omega-3/gi,
      /fatty fish/gi,
      /salmon/gi,
      /mackerel/gi,
      /sardines/gi,
      /whole grains/gi,
      /legumes/gi,
      /fiber/gi,
      /protein/gi,
      /vegetables/gi,
      /fruits/gi,
      /nuts/gi,
      /seeds/gi,
      /beans/gi,
      /oats/gi,
      /flaxseeds/gi,
      /walnuts/gi,
      /plant sterols/gi,
      /egg yolks/gi,
      /mushrooms/gi,
      /red meat/gi,
      /organ meats/gi,
      /shellfish/gi,
    ];
    
    for (const pattern of foodPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const keyword = match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
          if (!keywords.includes(keyword)) {
            keywords.push(keyword);
          }
        });
      }
    }
  } else if (category === 'lifestyle') {
    // Extract lifestyle actions
    const actionPatterns = [
      /exercise/gi,
      /yoga/gi,
      /meditation/gi,
      /sleep/gi,
      /walking/gi,
      /running/gi,
      /swimming/gi,
      /aerobic/gi,
      /cardio/gi,
      /strength training/gi,
      /sun exposure/gi,
      /hydration/gi,
      /stress reduction/gi,
      /quit smoking/gi,
      /weight loss/gi,
      /movement/gi,
    ];
    
    for (const pattern of actionPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const keyword = match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
          if (!keywords.includes(keyword)) {
            keywords.push(keyword);
          }
        });
      }
    }
  }
  
  return keywords.slice(0, 3); // Limit to 3 keywords max
};

interface BiomarkerInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  biomarkerId: string;
  biomarkerName: string;
  latestValue: number;
  unit: string;
  status: 'optimal' | 'low' | 'high';
}

export function BiomarkerInsightsModal({
  isOpen,
  onClose,
  biomarkerId,
  biomarkerName,
  latestValue,
  unit,
  status,
}: BiomarkerInsightsModalProps) {
  const { toast } = useToast();
  
  const { data: insightsData, isLoading, error } = useQuery<any>({
    queryKey: ['/api/biomarkers', biomarkerId, 'insights'],
    queryFn: async () => {
      const response = await apiRequest('POST', `/api/biomarkers/${biomarkerId}/insights`, {
        forceRefresh: false,
      });
      return response.json();
    },
    enabled: isOpen && !!biomarkerId,
    retry: 1,
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes (will refetch in background)
    gcTime: 24 * 60 * 60 * 1000, // Keep cached for 24 hours
  });

  useEffect(() => {
    if (error && isOpen) {
      const parsed = parseApiError(error);
      toast({
        title: "Couldn't Load Insights",
        description: (
          <div>
            <p>{parsed.message}</p>
            <p className="text-xs opacity-60 mt-1">Error: {parsed.code}</p>
          </div>
        ),
        variant: "destructive",
      });
    }
  }, [error, isOpen, toast]);

  const insights = insightsData?.insights as BiomarkerInsight | undefined;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-[#0a0f1e] border-white/10 text-white p-0 overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0a0f1e]/95 backdrop-blur-xl border-b border-white/10 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-xl font-semibold" data-testid="text-insights-title">
                {biomarkerName} Insights
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              data-testid="button-close-insights"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 pb-5" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Failed to Load Insights</h3>
              <p className="text-white/60 text-sm max-w-sm">
                Unable to generate AI insights for this biomarker. This may be because no measurements are available or the AI service is temporarily unavailable.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
                data-testid="button-close-error"
              >
                Close
              </button>
            </div>
          ) : insights ? (
            <div className="space-y-4 mt-4">
              {/* Lifestyle Actions */}
              {insights.lifestyleActions && insights.lifestyleActions.length > 0 && (
                <div
                  className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-5"
                  data-testid="section-lifestyle-actions"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-blue-300">Lifestyle Actions</h3>
                  </div>
                  <ul className="space-y-3">
                    {insights.lifestyleActions.map((action, index) => {
                      const keywords = extractKeywords(action, 'lifestyle');
                      return (
                        <li
                          key={index}
                          className="flex flex-col gap-1.5"
                          data-testid={`lifestyle-action-${index}`}
                        >
                          {keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {keywords.map((keyword, i) => (
                                <span 
                                  key={i}
                                  className="px-2 py-0.5 rounded-full text-[10px] bg-blue-400/20 text-blue-300 border border-blue-400/30"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                          <span className="text-sm text-white/90 leading-relaxed flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5">•</span>
                            <span>{action}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Nutrition */}
              {insights.nutrition && insights.nutrition.length > 0 && (
                <div
                  className="rounded-2xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 p-5"
                  data-testid="section-nutrition"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    <h3 className="text-lg font-semibold text-green-300">Nutrition</h3>
                  </div>
                  <ul className="space-y-3">
                    {insights.nutrition.map((item, index) => {
                      const keywords = extractKeywords(item, 'nutrition');
                      return (
                        <li
                          key={index}
                          className="flex flex-col gap-1.5"
                          data-testid={`nutrition-item-${index}`}
                        >
                          {keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {keywords.map((keyword, i) => (
                                <span 
                                  key={i}
                                  className="px-2 py-0.5 rounded-full text-[10px] bg-green-400/20 text-green-300 border border-green-400/30"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                          <span className="text-sm text-white/90 leading-relaxed flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">•</span>
                            <span>{item}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Supplementation */}
              {insights.supplementation && insights.supplementation.length > 0 && (
                <div
                  className="rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 p-5"
                  data-testid="section-supplementation"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Pill className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-semibold text-purple-300">Supplementation</h3>
                  </div>
                  <ul className="space-y-3">
                    {insights.supplementation.map((item, index) => {
                      const keywords = extractKeywords(item, 'supplement');
                      return (
                        <li
                          key={index}
                          className="flex flex-col gap-1.5"
                          data-testid={`supplementation-item-${index}`}
                        >
                          {keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {keywords.map((keyword, i) => (
                                <span 
                                  key={i}
                                  className="px-2 py-0.5 rounded-full text-[10px] bg-purple-400/20 text-purple-300 border border-purple-400/30"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                          <span className="text-sm text-white/90 leading-relaxed flex items-start gap-2">
                            <span className="text-purple-400 mt-0.5">•</span>
                            <span>{item}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Medical Referral */}
              {insights.medicalReferral && (
                <div
                  className="rounded-2xl bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 p-5"
                  data-testid="section-medical-referral"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Stethoscope className="w-5 h-5 text-red-400" />
                    <h3 className="text-lg font-semibold text-red-300">Medical Referral</h3>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed" data-testid="text-medical-referral">
                    {insights.medicalReferral}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-white/50">
              <p>No insights available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
