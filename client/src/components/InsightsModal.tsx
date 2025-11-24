import { X } from "lucide-react";
import InsightsScreen from "@/pages/InsightsScreen";

interface InsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InsightsModal({ isOpen, onClose }: InsightsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="modal-backdrop"
      />

      {/* Modal Content */}
      <div className="relative w-full h-full max-w-2xl mx-auto flex flex-col bg-gradient-to-br from-slate-900 to-slate-800">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          data-testid="button-close-modal"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        {/* Insights Screen Content */}
        <div className="flex-1 overflow-hidden">
          <InsightsScreen />
        </div>
      </div>
    </div>
  );
}
