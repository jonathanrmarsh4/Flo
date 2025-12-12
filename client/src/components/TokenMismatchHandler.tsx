import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useToast } from '@/hooks/use-toast';
import { TOKEN_MISMATCH_EVENT } from '@/lib/queryClient';

export function TokenMismatchHandler() {
  const { toast } = useToast();
  const hasShownToast = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) return;

    const handleTokenMismatch = (event: CustomEvent<{ copySucceeded: boolean }>) => {
      const { copySucceeded } = event.detail;
      
      if (hasShownToast.current) return;
      hasShownToast.current = true;

      if (copySucceeded) {
        console.log('[TokenMismatchHandler] Token copied successfully, no user action needed');
        toast({
          title: 'Syncing authentication...',
          description: 'Your login credentials are being synchronized. If HealthKit sync still fails, try logging out and back in.',
          duration: 8000,
        });
      } else {
        console.log('[TokenMismatchHandler] Token copy failed, prompting re-authentication');
        toast({
          title: 'Authentication sync issue',
          description: 'Please log out and log back in from your Profile to fix HealthKit sync.',
          variant: 'destructive',
          duration: 15000,
        });
      }

      setTimeout(() => {
        hasShownToast.current = false;
      }, 60000);
    };

    window.addEventListener(TOKEN_MISMATCH_EVENT, handleTokenMismatch as EventListener);

    return () => {
      window.removeEventListener(TOKEN_MISMATCH_EVENT, handleTokenMismatch as EventListener);
    };
  }, [isNative, toast]);

  return null;
}
