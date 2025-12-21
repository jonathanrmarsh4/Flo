import { useState } from 'react';
import { AlertTriangle, Loader2, Info, UserX, CheckCircle } from 'lucide-react';

interface DeleteDataConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDeleteData: () => Promise<void>;
  onConfirmDeleteAccount: () => Promise<void>;
  isDeleting?: boolean;
}

type Step = 'confirm-data' | 'data-deleted' | 'confirm-account' | 'deleting-account';

export function DeleteDataConfirmation({ 
  isOpen, 
  onClose, 
  onConfirmDeleteData, 
  onConfirmDeleteAccount,
  isDeleting 
}: DeleteDataConfirmationProps) {
  const [step, setStep] = useState<Step>('confirm-data');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  if (!isOpen) return null;

  const handleDeleteData = async () => {
    try {
      await onConfirmDeleteData();
      // Only advance to success step if deletion succeeded
      setStep('data-deleted');
    } catch (error) {
      // Stay on current step - error toast is shown by parent component
      // User can retry or cancel
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setStep('deleting-account');
    try {
      await onConfirmDeleteAccount();
      // Success - user will be redirected by parent component
    } catch (error) {
      // On failure, go back to confirm step so user can retry
      setStep('confirm-account');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleClose = () => {
    setStep('confirm-data');
    onClose();
  };

  const renderContent = () => {
    switch (step) {
      case 'confirm-data':
        return (
          <>
            <div className="flex flex-col items-center pt-8 pb-4 px-6">
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
            
            <div className="mx-4 mb-4 p-3 bg-blue-50 rounded-xl">
              <div className="flex gap-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 leading-[1.4]">
                  If you have Apple Health connected, your data will sync again automatically. To prevent this, turn off sync in Privacy Settings before deleting.
                </p>
              </div>
            </div>

            <div className="flex flex-col border-t border-slate-200">
              <button
                onClick={handleDeleteData}
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
                onClick={handleClose}
                disabled={isDeleting}
                className="w-full py-3.5 text-[17px] font-normal text-slate-900 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
                data-testid="button-cancel-delete"
              >
                Cancel
              </button>
            </div>
          </>
        );

      case 'data-deleted':
        return (
          <>
            <div className="flex flex-col items-center pt-8 pb-4 px-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-5">
                <CheckCircle className="w-7 h-7 text-green-500" strokeWidth={2} />
              </div>
              
              <h2 className="text-center text-slate-900 text-[17px] font-semibold mb-2">
                Data Deleted
              </h2>
              
              <p className="text-center text-slate-500 text-[13px] leading-[1.4]">
                All your health data has been permanently deleted.
              </p>
            </div>
            
            <div className="mx-4 mb-4 p-3 bg-amber-50 rounded-xl">
              <div className="flex gap-2">
                <UserX className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 leading-[1.4]">
                  Want to completely remove your account? This will delete your login credentials and you won't be able to sign back in.
                </p>
              </div>
            </div>

            <div className="flex flex-col border-t border-slate-200">
              <button
                onClick={() => setStep('confirm-account')}
                className="w-full py-3.5 text-[17px] font-normal text-red-500 hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                data-testid="button-delete-account"
              >
                Delete My Account
              </button>
              
              <div className="h-px bg-slate-200" />
              
              <button
                onClick={handleClose}
                className="w-full py-3.5 text-[17px] font-semibold text-slate-900 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                data-testid="button-done"
              >
                Done
              </button>
            </div>
          </>
        );

      case 'confirm-account':
        return (
          <>
            <div className="flex flex-col items-center pt-8 pb-4 px-6">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-5">
                <UserX className="w-7 h-7 text-red-500" strokeWidth={2} />
              </div>
              
              <h2 className="text-center text-slate-900 text-[17px] font-semibold mb-2">
                Delete Account?
              </h2>
              
              <p className="text-center text-slate-500 text-[13px] leading-[1.4]">
                This will permanently delete your account. You will be logged out and won't be able to sign back in with this account.
              </p>
            </div>

            <div className="flex flex-col border-t border-slate-200">
              <button
                onClick={handleDeleteAccount}
                className="w-full py-3.5 text-[17px] font-normal text-red-500 hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                data-testid="button-confirm-delete-account"
              >
                Delete Account Forever
              </button>
              
              <div className="h-px bg-slate-200" />
              
              <button
                onClick={() => setStep('data-deleted')}
                className="w-full py-3.5 text-[17px] font-normal text-slate-900 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                data-testid="button-cancel-account-delete"
              >
                Go Back
              </button>
            </div>
          </>
        );

      case 'deleting-account':
        return (
          <div className="flex flex-col items-center py-12 px-6">
            <Loader2 className="w-10 h-10 text-red-500 animate-spin mb-4" />
            <h2 className="text-center text-slate-900 text-[17px] font-semibold mb-2">
              Deleting Account...
            </h2>
            <p className="text-center text-slate-500 text-[13px] leading-[1.4]">
              Please wait while we remove your account.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div 
        className="relative w-full max-w-[320px] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}
