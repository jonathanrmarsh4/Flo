import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Lock, Eye, EyeOff, CheckCircle, XCircle, ArrowRight, Sparkles } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FloLogo } from '@/components/FloLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { passwordResetSchema } from '@shared/schema';
import { logger } from '@/lib/logger';

type ResetPasswordFormData = z.infer<typeof passwordResetSchema>;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const params = new URLSearchParams(search);
  const token = params.get('token');

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      token: token || '',
      newPassword: '',
    },
  });

  useEffect(() => {
    if (token) {
      form.setValue('token', token);
    }
  }, [token, form]);

  const handleSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      setIsError(true);
      setErrorMessage('Invalid reset link. Please request a new password reset.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiRequest('POST', '/api/mobile/auth/reset', {
        token: data.token,
        newPassword: data.newPassword,
      });
      
      if (response.ok) {
        setIsSuccess(true);
        toast({
          title: "Password Reset",
          description: "Your password has been reset successfully.",
        });
      }
    } catch (error: any) {
      logger.error('Password reset error', error);
      setIsError(true);
      setErrorMessage(error.message || "Failed to reset password. The link may have expired.");
      
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToLogin = () => {
    setLocation('/mobile-auth');
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-cyan-500" 
               style={{ animation: 'float 20s ease-in-out infinite' }} />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-purple-500" 
               style={{ animation: 'float 25s ease-in-out infinite reverse' }} />
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="text-center mb-6">
            <FloLogo size={60} showText={false} className="mb-3 justify-center" />
            <h1 className="text-3xl font-light mb-1 text-white">Flō</h1>
          </div>

          <div className="w-full max-w-sm backdrop-blur-xl rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl text-white">Invalid Reset Link</h2>
            <p className="text-sm text-white/60">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <Button
              onClick={handleGoToLogin}
              className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 text-white"
              data-testid="button-go-to-login"
            >
              Back to Sign In
            </Button>
          </div>
        </div>

        <style>{`
          @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -30px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
          }
        `}</style>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-cyan-500" 
               style={{ animation: 'float 20s ease-in-out infinite' }} />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-purple-500" 
               style={{ animation: 'float 25s ease-in-out infinite reverse' }} />
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="text-center mb-6">
            <FloLogo size={60} showText={false} className="mb-3 justify-center" />
            <h1 className="text-3xl font-light mb-1 text-white">Flō</h1>
          </div>

          <div className="w-full max-w-sm backdrop-blur-xl rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-teal-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-teal-400" />
            </div>
            <h2 className="text-xl text-white">Password Reset</h2>
            <p className="text-sm text-white/60">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <Button
              onClick={handleGoToLogin}
              className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 text-white flex items-center justify-center gap-2"
              data-testid="button-go-to-login"
            >
              <Sparkles className="w-4 h-4" />
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <style>{`
          @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -30px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-cyan-500" 
             style={{ animation: 'float 20s ease-in-out infinite' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-purple-500" 
             style={{ animation: 'float 25s ease-in-out infinite reverse' }} />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="text-center mb-6">
          <FloLogo size={60} showText={false} className="mb-3 justify-center" />
          <h1 className="text-3xl font-light mb-1 text-white">Flō</h1>
          <p className="text-sm text-white/60">Track. Improve. Evolve.</p>
        </div>

        <div className="w-full max-w-sm backdrop-blur-xl rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="text-center mb-4">
            <h2 className="text-xl text-white mb-1">Create New Password</h2>
            <p className="text-sm text-white/60">Enter your new password below</p>
          </div>

          {isError && errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-testid="text-error-message">
              <p className="text-sm text-red-400">{errorMessage}</p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/80 text-sm">New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          className="h-11 pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                          placeholder="Min. 8 characters"
                          disabled={isLoading}
                          data-testid="input-new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 text-white flex items-center justify-center gap-2"
                data-testid="button-submit-reset"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Reset Password</span>
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-[10px] text-center mt-6 max-w-md leading-relaxed text-white/40">
          By continuing, you agree to our{' '}
          <button className="text-[9px] underline text-white/60">Terms</button>
          {' & '}
          <button className="text-[9px] underline text-white/60">Privacy Policy</button>
          . Not a substitute for medical advice.
        </p>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}
