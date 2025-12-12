import { useState } from 'react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { startAuthentication } from '@simplewebauthn/browser';
import { Mail, Lock, Eye, EyeOff, User, ArrowRight, ArrowLeft, CheckCircle, Fingerprint, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FloLogo } from '@/components/FloLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, setCachedAuthToken, clearCachedAuthToken } from '@/lib/queryClient';
import { emailRegisterSchema, emailLoginSchema, passwordResetRequestSchema } from '@shared/schema';
import { logger } from '@/lib/logger';

type LoginFormData = z.infer<typeof emailLoginSchema>;
type RegisterFormData = z.infer<typeof emailRegisterSchema>;
type ForgotPasswordFormData = z.infer<typeof passwordResetRequestSchema>;

export default function MobileAuth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<'main' | 'email-login' | 'register' | 'forgot-password'>('main');
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // Login form (for fallback email login)
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
        
        // CRITICAL: Clear ALL cached data from any previous user session
        queryClient.clear();
        
        // CRITICAL: Store JWT token - ALWAYS use localStorage for iOS WebView reliability
        if (data.token) {
          console.log('[AppleSignIn] Received token, storing...');
          localStorage.setItem('auth_token', data.token);
          setCachedAuthToken(data.token);
          console.log('[AppleSignIn] Token stored in localStorage and cache updated');
          
          try {
            const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
            await SecureStoragePlugin.set({
              key: 'auth_token',
              value: data.token,
            });
            console.log('[AppleSignIn] Also stored in SecureStorage');
          } catch (error) {
            console.log('[AppleSignIn] SecureStorage not available:', error);
          }
        } else {
          console.error('[AppleSignIn] No token received from server!');
        }
        
        toast({
          title: "Welcome!",
          description: "Successfully signed in with Apple",
        });
        
        // Force full page reload to properly initialize auth state
        window.location.href = '/';
      }
    } catch (error: any) {
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

  // Face ID / Passkey login handler
  const handlePasskeyLogin = async () => {
    setGeneralError(null);
    setIsPasskeyLoading(true);
    
    try {
      logger.debug('Passkey login: Getting authentication options');
      const optionsRes = await fetch('/api/mobile/auth/passkey/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (!optionsRes.ok) {
        const errData = await optionsRes.json();
        throw new Error(errData.error || 'Failed to get authentication options');
      }
      
      const options = await optionsRes.json();
      logger.debug('Passkey login: Options received, starting authentication');
      
      const credential = await startAuthentication({ optionsJSON: options });
      logger.debug('Passkey login: Credential obtained, verifying');
      
      const verifyRes = await fetch('/api/mobile/auth/passkey/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          response: credential,
          challenge: options.challenge,
        }),
      });
      
      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || 'Passkey authentication failed');
      }
      
      const data = await verifyRes.json();
      logger.info('Passkey login: Authentication successful');
      
      // Clear previous session data
      queryClient.clear();
      
      // CRITICAL: Store JWT token - ALWAYS use localStorage for iOS WebView reliability
      // SecureStorage has issues when frontend is loaded from web URL
      if (data.token) {
        console.log('[Passkey] Received token, storing...');
        // Always store in localStorage first (guaranteed to work)
        localStorage.setItem('auth_token', data.token);
        // Update in-memory cache
        setCachedAuthToken(data.token);
        console.log('[Passkey] Token stored in localStorage and cache updated');
        
        // Also try SecureStorage as backup (may or may not work depending on environment)
        try {
          const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
          await SecureStoragePlugin.set({
            key: 'auth_token',
            value: data.token,
          });
          console.log('[Passkey] Also stored in SecureStorage');
        } catch (error) {
          console.log('[Passkey] SecureStorage not available (expected for web):', error);
        }
      } else {
        console.error('[Passkey] No token received from server!');
      }
      
      toast({
        title: "Welcome Back!",
        description: "Signed in with Face ID",
      });
      
      // Force full page reload to properly initialize auth state
      window.location.href = '/';
    } catch (err: any) {
      const errorName = err?.name || 'UnknownError';
      const errorMessage = err?.message || '';
      
      logger.error('Passkey login error:', { name: errorName, message: errorMessage });
      
      if (errorName === 'NotAllowedError') {
        // User cancelled - don't show error
      } else if (errorMessage?.includes('No passkeys found')) {
        setGeneralError('No Face ID credentials found. Use email login or sign up to create an account.');
      } else {
        setGeneralError(errorMessage || 'Face ID authentication failed');
      }
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  // Email login handler (fallback for users without Face ID set up)
  const handleEmailLogin = async (data: LoginFormData) => {
    setIsLoginLoading(true);
    setGeneralError(null);

    try {
      const response = await apiRequest('POST', '/api/mobile/auth/login', data);
      
      if (response.ok) {
        const responseData = await response.json();
        
        // CRITICAL: Clear ALL cached data from any previous user session
        queryClient.clear();
        
        // CRITICAL: Store JWT token - ALWAYS use localStorage for iOS WebView reliability
        if (responseData.token) {
          console.log('[EmailLogin] Received token, storing...');
          localStorage.setItem('auth_token', responseData.token);
          setCachedAuthToken(responseData.token);
          console.log('[EmailLogin] Token stored in localStorage and cache updated');
          
          try {
            const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
            await SecureStoragePlugin.set({
              key: 'auth_token',
              value: responseData.token,
            });
            console.log('[EmailLogin] Also stored in SecureStorage');
          } catch (error) {
            console.log('[EmailLogin] SecureStorage not available:', error);
          }
        } else {
          console.error('[EmailLogin] No token received from server!');
        }
        
        toast({
          title: "Welcome Back!",
          description: "Successfully signed in",
        });
        
        // Force full page reload to properly initialize auth state
        window.location.href = '/';
        return;
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
        
        // Check if account needs email verification
        if (responseData.status === 'pending_approval') {
          toast({
            title: "Account Created!",
            description: "Please check your email to verify your account, then you can sign in.",
          });
          // Go back to main login screen
          setMode('main');
          return;
        }
        
        // CRITICAL: Clear ALL cached data from any previous user session
        queryClient.clear();
        
        // CRITICAL: Store JWT token - ALWAYS use localStorage for iOS WebView reliability
        if (responseData.token) {
          console.log('[Register] Received token, storing...');
          localStorage.setItem('auth_token', responseData.token);
          setCachedAuthToken(responseData.token);
          console.log('[Register] Token stored in localStorage and cache updated');
          
          try {
            const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
            await SecureStoragePlugin.set({
              key: 'auth_token',
              value: responseData.token,
            });
            console.log('[Register] Also stored in SecureStorage');
          } catch (error) {
            console.log('[Register] SecureStorage not available:', error);
          }
        }
        
        toast({
          title: "Account Created!",
          description: "Please check your email to verify your account.",
        });
        
        // Go back to main screen after registration
        setMode('main');
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

  // Back to main screen
  const handleBackToMain = () => {
    setMode('main');
    setGeneralError(null);
    setForgotPasswordSent(false);
    loginForm.reset();
    registerForm.reset();
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
          <h1 className="text-3xl font-light mb-1 text-white">Flo</h1>
          <p className="text-sm text-white/60">Track. Improve. Evolve.</p>
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-sm backdrop-blur-xl rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          
          {/* Main Login Screen - 3 primary buttons */}
          {mode === 'main' && (
            <>
              <div className="text-center mb-4">
                <h2 className="text-xl text-white mb-1">Welcome to Flo</h2>
                <p className="text-sm text-white/60">Sign in to start your evolution</p>
              </div>

              {/* General Error Message */}
              {generalError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-testid="text-error-message">
                  <p className="text-sm text-red-400">{generalError}</p>
                </div>
              )}

              {/* Continue with Apple */}
              <div className="space-y-2">
                <Button
                  onClick={handleAppleSignIn}
                  disabled={isAppleLoading || isPasskeyLoading}
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
                <p className="text-xs text-center text-white/40">
                  For new users or those with Apple ID linked
                </p>
              </div>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-transparent text-white/50">or</span>
                </div>
              </div>

              {/* Sign in with Face ID */}
              <div className="space-y-2">
                <Button
                  onClick={handlePasskeyLogin}
                  disabled={isPasskeyLoading || isAppleLoading}
                  variant="outline"
                  className="w-full h-12 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 flex items-center justify-center gap-2"
                  data-testid="button-passkey-login"
                >
                  {isPasskeyLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-5 h-5" />
                      <span>Sign in with Face ID</span>
                    </>
                  )}
                </Button>
                <p className="text-xs text-center text-white/40">
                  For existing Flo accounts with Face ID set up
                </p>
              </div>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-transparent text-white/50">new here?</span>
                </div>
              </div>

              {/* Sign Up Button */}
              <div className="space-y-2">
                <Button
                  onClick={() => setMode('register')}
                  variant="outline"
                  className="w-full h-12 border-white/20 text-white/80 hover:bg-white/5 flex items-center justify-center gap-2"
                  data-testid="button-signup"
                >
                  <User className="w-5 h-5" />
                  <span>Sign Up</span>
                </Button>
                <p className="text-xs text-center text-white/40">
                  Create a new account with email
                </p>
              </div>

              {/* Fallback links for existing users without Face ID */}
              <div className="pt-4 border-t border-white/10 mt-4">
                <p className="text-xs text-center text-white/40 mb-2">
                  Already have an account without Face ID?
                </p>
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => setMode('email-login')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    data-testid="link-email-login"
                  >
                    Use email instead
                  </button>
                  <span className="text-white/20">|</span>
                  <button
                    onClick={() => setMode('forgot-password')}
                    className="text-xs text-white/50 hover:text-white/70 transition-colors"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Email Login Form (fallback) */}
          {mode === 'email-login' && (
            <>
              <div className="text-center mb-4 relative">
                <button
                  onClick={handleBackToMain}
                  className="absolute left-0 top-0 text-white/60 hover:text-white/80 transition-colors flex items-center gap-1"
                  data-testid="button-back-to-main"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-xl text-white mb-1">Sign In</h2>
                <p className="text-sm text-white/60">Use your email and password</p>
              </div>

              {/* General Error Message */}
              {generalError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-testid="text-error-message">
                  <p className="text-sm text-red-400">{generalError}</p>
                </div>
              )}

              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleEmailLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/80 text-sm">Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                            <Input
                              {...field}
                              type="email"
                              inputMode="email"
                              autoComplete="email"
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              enterKeyHint="next"
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
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                            <Input
                              {...field}
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="current-password"
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              enterKeyHint="done"
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

                  <Button
                    type="submit"
                    disabled={isLoginLoading}
                    className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30"
                    data-testid="button-submit-login"
                  >
                    {isLoginLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <div className="text-center pt-2">
                <button
                  onClick={() => setMode('forgot-password')}
                  className="text-xs text-white/50 hover:text-white/70 transition-colors"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>

              <p className="text-xs text-center text-white/40 mt-4">
                After signing in, set up Face ID in your profile for faster access next time.
              </p>
            </>
          )}

          {/* Register Form */}
          {mode === 'register' && (
            <>
              <div className="text-center mb-4 relative">
                <button
                  onClick={handleBackToMain}
                  className="absolute left-0 top-0 text-white/60 hover:text-white/80 transition-colors flex items-center gap-1"
                  data-testid="button-back-to-main"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-xl text-white mb-1">Create Account</h2>
                <p className="text-sm text-white/60">Start your evolution</p>
              </div>

              {/* General Error Message */}
              {generalError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-testid="text-error-message">
                  <p className="text-sm text-red-400">{generalError}</p>
                </div>
              )}

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
                              inputMode="text"
                              autoComplete="given-name"
                              autoCapitalize="words"
                              autoCorrect="off"
                              spellCheck={false}
                              enterKeyHint="next"
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
                              inputMode="text"
                              autoComplete="family-name"
                              autoCapitalize="words"
                              autoCorrect="off"
                              spellCheck={false}
                              enterKeyHint="next"
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
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                            <Input
                              {...field}
                              type="email"
                              inputMode="email"
                              autoComplete="email"
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              enterKeyHint="next"
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
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                            <Input
                              {...field}
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              enterKeyHint="done"
                              className="h-11 pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                              placeholder="Create a strong password"
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
                    className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30"
                    data-testid="button-submit-register"
                  >
                    {isRegisterLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Account</span>
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <p className="text-xs text-center text-white/40 mt-4">
                After signing up, you'll verify your email then set up Face ID for quick, secure access.
              </p>
            </>
          )}

          {/* Forgot Password Form */}
          {mode === 'forgot-password' && (
            <>
              <div className="text-center mb-4 relative">
                <button
                  onClick={handleBackToMain}
                  className="absolute left-0 top-0 text-white/60 hover:text-white/80 transition-colors flex items-center gap-1"
                  data-testid="button-back-to-main"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-xl text-white mb-1">Reset Password</h2>
                <p className="text-sm text-white/60">Enter your email to reset</p>
              </div>

              {/* General Error Message */}
              {generalError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3" data-testid="text-error-message">
                  <p className="text-sm text-red-400">{generalError}</p>
                </div>
              )}

              {forgotPasswordSent ? (
                <div className="text-center space-y-4">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
                  <p className="text-white/80">Check your email for reset instructions.</p>
                  <Button
                    onClick={handleBackToMain}
                    variant="outline"
                    className="border-white/20 text-white/80 hover:bg-white/5"
                    data-testid="button-back-to-signin"
                  >
                    Back to Sign In
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
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                              <Input
                                {...field}
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                enterKeyHint="done"
                                className="h-11 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                                placeholder="you@example.com"
                                disabled={isForgotPasswordLoading}
                                data-testid="input-email"
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
                      className="w-full h-12 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30"
                      data-testid="button-submit-reset"
                    >
                      {isForgotPasswordLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <span>Send Reset Link</span>
                      )}
                    </Button>
                  </form>
                </Form>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-xs text-center text-white/40 mt-6 max-w-xs leading-relaxed">
          By continuing, you agree to our Terms of Service and Privacy Policy. 
          Flo is not a substitute for medical advice.
        </p>
      </div>

      {/* Floating animation keyframes */}
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
