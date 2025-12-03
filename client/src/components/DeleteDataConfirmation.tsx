import { AlertTriangle, Loader2, Info } from 'lucide-react';

interface DeleteDataConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteDataConfirmation({ isOpen, onClose, onConfirm, isDeleting }: DeleteDataConfirmationProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div 
        className="relative w-full max-w-[320px] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Warning Icon and Content */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          {/* Circular warning icon with pink background */}
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-5">
            <AlertTriangle className="w-7 h-7 text-red-500" strokeWidth={2} />
          </div>
          
          <h2 className="text-center text-slate-900 text-[17px] font-semibold mb-2">
            Delete All Data?
          </h2>
          
          <p className="text-center text-slate-500 text-[13px] leading-[1.4]">
            This action cannot be undone. All your biomarker data, test results, and history will be permanently deleted.
          </p>
        </div>
        
        {/* HealthKit Note */}
        <div className="mx-4 mb-4 p-3 bg-blue-50 rounded-xl">
          <div className="flex gap-2">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 leading-[1.4]">
              If you have Apple Health connected, your data will sync again automatically. To prevent this, turn off sync in Privacy Settings before deleting.
            </p>
          </div>
        </div>

        {/* Action Buttons - iOS style */}
        <div className="flex flex-col border-t border-slate-200">
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full py-3.5 text-[17px] font-normal text-red-500 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="button-confirm-delete"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete All Data'
            )}
          </button>
          
          <div className="h-px bg-slate-200" />
          
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="w-full py-3.5 text-[17px] font-normal text-slate-900 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
            data-testid="button-cancel-delete"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
