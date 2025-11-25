import { useState } from 'react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { Mail, Lock, Eye, EyeOff, User, ArrowRight, Sparkles, ArrowLeft, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FloLogo } from '@/components/FloLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { emailRegisterSchema, emailLoginSchema, passwordResetRequestSchema } from '@shared/schema';
import { logger } from '@/lib/logger';

type LoginFormData = z.infer<typeof emailLoginSchema>;
type RegisterFormData = z.infer<typeof emailRegisterSchema>;
type ForgotPasswordFormData = z.infer<typeof passwordResetRequestSchema>;

export default function MobileAuth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // Design Decision: Names are optional in registration to match OAuth provider behavior
  // (Apple/Google don't always provide names). Users can update names later in profile settings.

  // Google Sign-In will be added via web OAuth flow when Capacitor-compatible SDK is available.
  // Backend endpoint /api/mobile/auth/google is ready but native SDK is incompatible with Capacitor 7.
  // Removed from UI to prevent user confusion about disabled button.

  // Login form
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Registration form
  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(emailRegisterSchema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
    },
  });

  // Forgot password form
  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: {
      email: '',
    },
  });

  // Apple Sign-In handler
  const handleAppleSignIn = async () => {
    if (!isNative) {
      toast({
        title: "Not Available",
        description: "Apple Sign-In is only available on iOS devices",
        variant: "destructive",
      });
      return;
    }

    setIsAppleLoading(true);
    setGeneralError(null);
    try {
      logger.debug('Apple Sign-In: Starting authorization');
      const result = await SignInWithApple.authorize({
        clientId: 'com.flo.healthapp',
        redirectURI: '',
        scopes: 'email name',
        state: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
      });

      logger.debug('Apple Sign-In: Authorization successful, sending to backend', {
        userId: result.response.user,
        hasToken: !!result.response.identityToken
      });

      // Send to backend
      const response = await apiRequest('POST', '/api/mobile/auth/apple', {
        identityToken: result.response.identityToken,
        authorizationCode: result.response.authorizationCode,
        email: result.response.email,
        givenName: result.response.givenName,
        familyName: result.response.familyName,
        user: result.response.user,
      });

      logger.debug('Apple Sign-In: Backend response received', { status: response.status });

      if (response.ok) {
        const data = await response.json();
        logger.debug('Apple Sign-In: Response data received', { 
          hasToken: !!data.token, 
          hasUser: !!data.user 
        });
        
        // Store JWT token in secure encrypted storage (always native for Apple Sign-In)
        if (data.token) {
          try {
            const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
            await SecureStoragePlugin.set({
              key: 'auth_token',
              value: data.token,
            });
            logger.info('Apple Sign-In: Token stored securely');
          } catch (error) {
            logger.error('Apple Sign-In: Failed to store token securely', error);
          }
        }
        
        // Refetch user data and wait for it to complete
        await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        await queryClient.refetchQueries({ queryKey: ['/api/auth/user'] });
        
        toast({
          title: "Welcome!",
          description: "Successfully signed in with Apple",
        });
        
        // Navigate to home (which will redirect to dashboard for authenticated users)
        setLocation('/');
      }
    } catch (error: any) {
      // Log full error details for debugging
      logger.error('Apple Sign-In: Error occurred', error, {
        errorName: error?.name,
        errorMessage: error?.message
      });
      
      const errorMessage = error?.message || "Failed to sign in with Apple. Please try again.";
      setGeneralError(errorMessage);
      toast({
        title: "Sign-In Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAppleLoading(false);
    }
  };

  // Login handler
  const handleLogin = async (data: LoginFormData) => {
    setIsLoginLoading(true);
    setGeneralError(null);

    try {
      const response = await apiRequest('POST', '/api/mobile/auth/login', data);
      
      if (response.ok) {
        const responseData = await response.json();
        
        // Store JWT token in secure encrypted storage (mobile only)
        if (responseData.token && isNative) {
          try {
            const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
            await SecureStoragePlugin.set({
              key: 'auth_token',
              value: responseData.token,
            });
          } catch (error) {
            logger.error('Login: Failed to store token securely', error);
          }
        }
        
        await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        toast({
          title: "Welcome Back!",
          description: "Successfully signed in",
        });
        setLocation('/dashboard');
      }
    } catch (error: any) {
      logger.error('Login error', error);
      const errorMessage = error.message || "Authentication failed";
      setGeneralError(errorMessage);
      
      toast({
        title: "Sign-In Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoginLoading(false);
    }
  };

  // Registration handler
  const handleRegister = async (data: RegisterFormData) => {
    setIsRegisterLoading(true);
    setGeneralError(null);

    try {
      const response = await apiRequest('POST', '/api/mobile/auth/register', data);
      
      if (response.ok) {
        const responseData = await response.json();
        
        // Store JWT token in secure encrypted storage (mobile only)
        if (responseData.token && isNative) {
          try {
            const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
            await SecureStoragePlugin.set({
              key: 'auth_token',
              value: responseData.token,
            });
          } catch (error) {
            logger.error('Register: Failed to store token securely', error);
          }
        }
        
        await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        toast({
          title: "Account Created!",
          description: "Welcome to Flō",
        });
        setLocation('/dashboard');
      }
    } catch (error: any) {
      logger.error('Registration error', error);
      const errorMessage = error.message || "Registration failed";
      setGeneralError(errorMessage);
      
      toast({
        title: "Registration Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRegisterLoading(false);
    }
  };

  // Forgot password handler
  const handleForgotPassword = async (data: ForgotPasswordFormData) => {
    setIsForgotPasswordLoading(true);
    setGeneralError(null);

    try {
      const response = await apiRequest('POST', '/api/mobile/auth/request-reset', data);
      
      if (response.ok) {
        setForgotPasswordSent(true);
        toast({
          title: "Check Your Email",
          description: "If an account exists, you'll receive password reset instructions.",
        });
      }
    } catch (error: any) {
      logger.error('Forgot password error', error);
      const errorMessage = error.message || "Failed to send reset email";
      setGeneralError(errorMessage);
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  // Toggle between login and register
  const handleToggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setGeneralError(null);
    setForgotPasswordSent(false);
    loginForm.reset();
    registerForm.reset();
    forgotPasswordForm.reset();
  };

  // Go to forgot password
  const handleGoToForgotPassword = () => {
    setMode('forgot-password');
    setGeneralError(null);
    setForgotPasswordSent(false);
    forgotPasswordForm.reset();
  };

  // Back to login from forgot password
  const handleBackToLogin = () => {
    setMode('login');
    setGeneralError(null);
    setForgotPasswordSent(false);
    forgotPasswordForm.reset();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-cyan-500" 
             style={{ animation: 'float 20s ease-in-out infinite' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 bg-purple-500" 
             style={{ animation: 'float 25s ease-in-out infinite reverse' }} />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
        {/* Logo and Welcome */}
        <div className="text-center mb-6">
          <FloLogo size={60} showText={false} className="mb-3 justify-center" />
          <h1 className="text-3xl font-light mb-1 text-white">Flō</h1>
          <p className="text-sm text-white/60">Track. Improve. Evolve.</p>
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-sm backdrop-blur-xl rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="text-center mb-4">
            {mode === 'forgot-password' && (
              <button
                onClick={handleBackToLogin}
                className="absolute left-6 top-6 text-white/60 hover:text-white/80 transition-colors flex items-center gap-1"
                data-testid="button-back-to-login"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back</span>
              </button>
            )}
            <h2 className="text-xl text-white mb-1">
              {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Account' : 'Reset Password'}
            </h2>
            <p className="text-sm text-white/60">
              {mode === 'login' ? 'Sign in to continue' : mode === 'register' ? 'Start your evolution' : 'Enter your email to reset'}
            </p>
          </div>

          {/* Social Auth Buttons (iOS only) - only show on login/register */}
          {isNative && mode !== 'forgot-password' && (
            <div className="space-y-3">
              <Button
                onClick={handleAppleSignIn}
                disabled={isAppleLoading}
                className="w-full h-12 bg-white text-black hover:bg-gray-100 flex items-center justify-center gap-2"
                data-testid="button-apple-signin"
              >
                {isAppleLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    <span>Continue with Apple</span>
                  </>
                )}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-transparent text-white/50">or</span>
                </div>
              </div>
            </div>
          )}

          {/* General Error Message */}
          {generalError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-testid="text-error-message">
              <p className="text-sm text-red-400">{generalError}</p>
            </div>
          )}

          {/* Loading State */}
          {(isAppleLoading || isLoginLoading || isRegisterLoading) && (
            <div className="text-center" data-testid="text-loading">
              <p className="text-sm text-white/60">Please wait...</p>
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                          <Input
                            {...field}
                            type="email"
                            className="h-11 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            placeholder="you@example.com"
                            disabled={isLoginLoading}
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                          <Input
                            {...field}
                            type={showPassword ? 'text' : 'password'}
                            className="h-11 pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            placeholder="Enter password"
                            disabled={isLoginLoading}
                            data-testid="input-password"
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

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleGoToForgotPassword}
                    className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                    data-testid="button-forgot-password"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isLoginLoading}
                  className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 text-white flex items-center justify-center gap-2"
                  data-testid="button-submit-login"
                >
                  {isLoginLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}

          {/* Forgot Password Form */}
          {mode === 'forgot-password' && (
            <>
              {forgotPasswordSent ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-teal-500/20 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-lg text-white mb-2">Check Your Email</h3>
                    <p className="text-sm text-white/60">
                      If an account exists with that email, we've sent password reset instructions.
                    </p>
                  </div>
                  <Button
                    onClick={handleBackToLogin}
                    className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 text-white flex items-center justify-center gap-2"
                    data-testid="button-back-to-signin"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Sign In</span>
                  </Button>
                </div>
              ) : (
                <Form {...forgotPasswordForm}>
                  <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                    <FormField
                      control={forgotPasswordForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/80 text-sm">Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                              <Input
                                {...field}
                                type="email"
                                className="h-11 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                                placeholder="you@example.com"
                                disabled={isForgotPasswordLoading}
                                data-testid="input-reset-email"
                              />
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={isForgotPasswordLoading}
                      className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 text-white flex items-center justify-center gap-2"
                      data-testid="button-submit-reset"
                    >
                      {isForgotPasswordLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4" />
                          <span>Send Reset Link</span>
                        </>
                      )}
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={handleBackToLogin}
                        className="text-sm text-white/60 hover:text-white/80 transition-colors"
                        data-testid="button-cancel-reset"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </Form>
              )}
            </>
          )}

          {/* Registration Form */}
          {mode === 'register' && (
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={registerForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80 text-sm">First Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            placeholder="John"
                            disabled={isRegisterLoading}
                            data-testid="input-firstname"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80 text-sm">Last Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            placeholder="Doe"
                            disabled={isRegisterLoading}
                            data-testid="input-lastname"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                          <Input
                            {...field}
                            type="email"
                            className="h-11 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            placeholder="you@example.com"
                            disabled={isRegisterLoading}
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                          <Input
                            {...field}
                            type={showPassword ? 'text' : 'password'}
                            className="h-11 pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            placeholder="Min. 8 characters"
                            disabled={isRegisterLoading}
                            data-testid="input-password"
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
                  disabled={isRegisterLoading}
                  className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 text-white flex items-center justify-center gap-2"
                  data-testid="button-submit-register"
                >
                  {isRegisterLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Creating account...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Create Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}

          {/* Toggle Mode - only show on login/register */}
          {mode !== 'forgot-password' && (
            <div className="text-center pt-2">
              <button
                onClick={handleToggleMode}
                className="text-sm text-white/60 hover:text-white/80 transition-colors"
                data-testid="button-toggle-register"
              >
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <span className="text-cyan-400 font-medium">
                  {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-center mt-6 max-w-md leading-relaxed text-white/40">
          By continuing, you agree to our{' '}
          <button className="text-[9px] underline text-white/60">Terms</button>
          {' & '}
          <button className="text-[9px] underline text-white/60">Privacy Policy</button>
          . Not a substitute for medical advice.
        </p>
      </div>

      {/* Floating animation */}
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
