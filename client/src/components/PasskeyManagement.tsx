import { useState } from 'react';
import { Key, Plus, Trash2, Loader2, Fingerprint, Smartphone, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getAuthHeaders, getApiBaseUrl } from '@/lib/queryClient';
import { startRegistration } from '@simplewebauthn/browser';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Passkey {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  backedUp: boolean | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface PasskeyManagementProps {
  isDark: boolean;
}

export function PasskeyManagement({ isDark }: PasskeyManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletePasskeyId, setDeletePasskeyId] = useState<string | null>(null);

  const { data: passkeys = [], isLoading, error } = useQuery<Passkey[]>({
    queryKey: ['/api/mobile/auth/passkeys'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (passkeyId: string) => {
      return await apiRequest('DELETE', `/api/mobile/auth/passkeys/${passkeyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mobile/auth/passkeys'] });
      toast({
        title: "Passkey Removed",
        description: "The passkey has been deleted from your account.",
      });
      setDeletePasskeyId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Could not remove the passkey. Please try again.",
        variant: "destructive",
      });
      setDeletePasskeyId(null);
    },
  });

  const handleRegisterPasskey = async () => {
    setIsRegistering(true);
    try {
      const headers = await getAuthHeaders();
      const baseUrl = getApiBaseUrl();
      
      const optionsRes = await fetch(`${baseUrl}/api/mobile/auth/passkey/register-options`, {
        headers,
        credentials: 'include'
      });
      
      if (!optionsRes.ok) {
        throw new Error('Failed to get registration options');
      }
      
      const options = await optionsRes.json();
      
      console.log('[Passkey] Registration options received:', {
        rpId: options.rp?.id,
        rpName: options.rp?.name,
        challenge: options.challenge?.substring(0, 20) + '...',
        userVerification: options.authenticatorSelection?.userVerification,
        authenticatorAttachment: options.authenticatorSelection?.authenticatorAttachment,
      });
      
      const credential = await startRegistration({ optionsJSON: options });
      
      const deviceName = detectDeviceName();
      
      const verifyRes = await fetch(`${baseUrl}/api/mobile/auth/passkey/register`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          response: credential,
          deviceName,
        }),
      });
      
      if (!verifyRes.ok) {
        const error = await verifyRes.json();
        throw new Error(error.error || 'Registration failed');
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/mobile/auth/passkeys'] });
      
      toast({
        title: "Passkey Added",
        description: "You can now sign in with Face ID or Touch ID.",
      });
    } catch (error: any) {
      // WebAuthn errors don't serialize well - extract useful info
      const errorName = error?.name || 'UnknownError';
      const errorMessage = error?.message || '';
      const errorCode = error?.code;
      
      console.error('[Passkey] Registration error:', {
        name: errorName,
        message: errorMessage,
        code: errorCode,
        error: String(error),
      });
      
      if (errorName === 'NotAllowedError') {
        toast({
          title: "Cancelled",
          description: "Passkey registration was cancelled.",
        });
      } else if (errorName === 'InvalidStateError') {
        toast({
          title: "Already Registered",
          description: "This device already has a passkey for your account.",
        });
      } else if (errorName === 'NotSupportedError') {
        toast({
          title: "Not Supported",
          description: "Passkeys are not supported on this device or browser.",
          variant: "destructive",
        });
      } else if (errorName === 'SecurityError') {
        toast({
          title: "Security Error",
          description: "Domain configuration issue. Please contact support.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Registration Failed",
          description: errorMessage || `Error: ${errorName}. Please try again.`,
          variant: "destructive",
        });
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const detectDeviceName = (): string => {
    const ua = navigator.userAgent;
    
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Windows/.test(ua)) return 'Windows PC';
    
    return 'Unknown Device';
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never used';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch {
      return 'Unknown';
    }
  };

  const getDeviceIcon = (deviceType: string | null) => {
    if (deviceType === 'singleDevice') {
      return <Fingerprint className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />;
    }
    return <Smartphone className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />;
  };

  return (
    <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
      isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
    }`} data-testid="card-passkey-security">
      <div className="flex items-center gap-2 mb-4">
        <Key className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
        <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Passkeys & Security
        </h2>
      </div>

      <div className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
        Sign in quickly and securely with Face ID or Touch ID instead of your password.
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
        </div>
      ) : error ? (
        <div className={`flex items-center gap-2 p-3 rounded-xl ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>
            Failed to load passkeys
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {passkeys.length > 0 && (
            <div className="space-y-2 mb-4">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className={`flex items-center justify-between p-3 rounded-xl ${
                    isDark ? 'bg-white/5' : 'bg-gray-50'
                  }`}
                  data-testid={`passkey-item-${passkey.id}`}
                >
                  <div className="flex items-center gap-3">
                    {getDeviceIcon(passkey.deviceType)}
                    <div>
                      <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {passkey.deviceName || 'Passkey'}
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        <Clock className="w-3 h-3" />
                        {passkey.lastUsedAt ? `Last used ${formatDate(passkey.lastUsedAt)}` : `Added ${formatDate(passkey.createdAt)}`}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletePasskeyId(passkey.id)}
                    className={isDark ? 'text-white/50 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}
                    data-testid={`button-delete-passkey-${passkey.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleRegisterPasskey}
            disabled={isRegistering}
            variant="outline"
            className={`w-full justify-center gap-2 ${
              isDark 
                ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10' 
                : 'border-cyan-500/50 text-cyan-600 hover:bg-cyan-50'
            }`}
            data-testid="button-add-passkey"
          >
            {isRegistering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Registering...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Passkey
              </>
            )}
          </Button>

          {passkeys.length === 0 && (
            <div className={`text-xs text-center ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
              No passkeys registered yet
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!deletePasskeyId} onOpenChange={(open) => !open && setDeletePasskeyId(null)}>
        <AlertDialogContent className={isDark ? 'bg-gray-900 border-white/10' : ''}>
          <AlertDialogHeader>
            <AlertDialogTitle className={isDark ? 'text-white' : ''}>
              Remove Passkey?
            </AlertDialogTitle>
            <AlertDialogDescription className={isDark ? 'text-white/60' : ''}>
              This will remove the passkey from your account. You won't be able to use it to sign in anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={isDark ? 'bg-white/5 text-white border-white/10 hover:bg-white/10' : ''}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePasskeyId && deleteMutation.mutate(deletePasskeyId)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
