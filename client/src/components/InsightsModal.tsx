import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import InsightsScreen from "@/pages/InsightsScreen";

interface InsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InsightsModal({ isOpen, onClose }: InsightsModalProps) {
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

  // Render modal at document body level using portal
  return createPortal(modalContent, document.body);
}
