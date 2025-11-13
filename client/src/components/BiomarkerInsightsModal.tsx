import { X, Activity, TrendingUp, Pill, Stethoscope, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

interface BiomarkerInsight {
  lifestyleActions: string[];
  nutrition: string[];
  supplementation: string[];
  medicalReferral: string | null;
  medicalUrgency?: 'routine' | 'priority';
}

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
      const response = await fetch(`/api/biomarkers/${biomarkerId}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh: false }),
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch insights');
      }
      return response.json();
    },
    enabled: isOpen && !!biomarkerId,
    retry: 1,
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes (will refetch in background)
    gcTime: 24 * 60 * 60 * 1000, // Keep cached for 24 hours
  });

  useEffect(() => {
    if (error && isOpen) {
      toast({
        title: "Failed to load insights",
        description: "Unable to generate AI insights for this biomarker. Please try again later.",
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
                    {insights.lifestyleActions.map((action, index) => (
                      <li
                        key={index}
                        className="text-sm text-white/90 leading-relaxed flex items-start gap-2"
                        data-testid={`lifestyle-action-${index}`}
                      >
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span>{action}</span>
                      </li>
                    ))}
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
                    {insights.nutrition.map((item, index) => (
                      <li
                        key={index}
                        className="text-sm text-white/90 leading-relaxed flex items-start gap-2"
                        data-testid={`nutrition-item-${index}`}
                      >
                        <span className="text-green-400 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
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
                    {insights.supplementation.map((item, index) => (
                      <li
                        key={index}
                        className="text-sm text-white/90 leading-relaxed flex items-start gap-2"
                        data-testid={`supplementation-item-${index}`}
                      >
                        <span className="text-purple-400 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
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
