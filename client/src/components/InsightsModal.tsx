import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw } from "lucide-react";
import InsightsScreen from "@/pages/InsightsScreen";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InsightsModal({ isOpen, onClose }: InsightsModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Refresh insights mutation
  const refreshInsightsMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/daily-insights/refresh'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-insights'] });
      toast({
        title: "Insights Refreshed",
        description: "Your AI insights have been updated with the latest data.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh insights",
        variant: "destructive",
      });
    },
  });

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="modal-backdrop"
      />

      {/* Modal Content */}
      <div className="relative w-full h-full max-w-2xl mx-auto flex flex-col bg-gradient-to-br from-slate-900 to-slate-800">
        {/* Header Buttons - with iOS safe area padding */}
        <div className="absolute right-4 z-10 flex items-center gap-2" style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          {/* Refresh Button */}
          <button
            onClick={() => refreshInsightsMutation.mutate()}
            disabled={refreshInsightsMutation.isPending}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
            data-testid="button-refresh-insights"
            aria-label="Refresh insights"
          >
            <RefreshCw 
              className={`w-5 h-5 text-white ${refreshInsightsMutation.isPending ? 'animate-spin' : ''}`} 
            />
          </button>
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            data-testid="button-close-modal"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Insights Screen Content */}
        <div className="flex-1 overflow-hidden">
          <InsightsScreen />
        </div>
      </div>
    </div>
  );

  // Render modal at document body level using portal
  return createPortal(modalContent, document.body);
}
