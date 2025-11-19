import { Check, Sparkles, Lock, X } from "lucide-react";
import { PaywallModal as PaywallModalType } from "@/hooks/usePlan";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal: PaywallModalType;
  onUpgrade: () => void;
}

export function PaywallModal({ open, onOpenChange, modal, onUpgrade }: PaywallModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="dialog-paywall-modal">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md backdrop-blur-xl bg-slate-900/95 border border-white/10 rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 text-xs text-white/70" data-testid="badge-premium-required">
              <Lock className="w-3 h-3" />
              Premium Required
            </div>
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2" data-testid="text-paywall-title">
            {modal.title}
          </h2>
          <p className="text-sm text-white/70 leading-relaxed" data-testid="text-paywall-description">
            {modal.description}
          </p>
        </div>

        {/* Benefits */}
        <div className="mb-6">
          <p className="text-sm font-medium text-white mb-3">Unlock with Premium:</p>
          <div className="space-y-2.5">
            {modal.benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-start gap-2"
                data-testid={`benefit-item-${index}`}
              >
                <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-white/80">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              onUpgrade();
              onOpenChange(false);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            data-testid="button-upgrade"
          >
            <Sparkles className="w-4 h-4" />
            {modal.ctaText}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full px-4 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white/70 text-sm font-medium transition-colors"
            data-testid="button-cancel"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
