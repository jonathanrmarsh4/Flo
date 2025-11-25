import { AlertTriangle } from 'lucide-react';

interface DeleteDataConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteDataConfirmation({ isOpen, onClose, onConfirm, isDeleting }: DeleteDataConfirmationProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 1px rgba(255, 255, 255, 0.5) inset'
        }}
      >
        {/* Warning Header */}
        <div className="flex flex-col items-center pt-8 pb-6 px-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          
          <h2 className="text-center text-slate-900 text-lg font-medium mb-2">
            Delete All Data?
          </h2>
          
          <p className="text-center text-slate-600 text-sm">
            This action cannot be undone. All your biomarker data, test results, and history will be permanently deleted.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-0 border-t border-slate-200/50">
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full py-4 text-red-600 hover:bg-red-50/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="button-confirm-delete"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete All Data'
            )}
          </button>
          
          <div className="h-px bg-slate-200/50" />
          
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="w-full py-4 text-slate-900 hover:bg-slate-50/50 transition-colors disabled:opacity-50"
            data-testid="button-cancel-delete"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
