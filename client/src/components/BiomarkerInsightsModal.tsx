import { X, Activity, TrendingUp, Pill, Stethoscope } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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
  const { data: insightsResponse, isLoading, error } = useQuery<any>({
    queryKey: ['/api/biomarkers', biomarkerId, 'insights'],
    queryFn: async () => {
      return await apiRequest('POST', `/api/biomarkers/${biomarkerId}/insights`, {});
    },
    enabled: isOpen && !!biomarkerId,
    retry: 1,
  });

  const insights = insightsResponse?.insights as BiomarkerInsight | undefined;

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
