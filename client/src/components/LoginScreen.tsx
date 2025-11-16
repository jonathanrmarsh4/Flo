import { useState } from 'react';
import { ArrowRight, Sparkles, Mail, Lock, AlertCircle } from 'lucide-react';
import { FloLogo } from './FloLogo';
import { useLocation } from 'wouter';
import { logger } from '@/lib/logger';

interface LoginScreenProps {
  onLogin: () => void;
  isDark: boolean;
}

export function LoginScreen({ onLogin, isDark }: LoginScreenProps) {
  const [, navigate] = useLocation();
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReplitLogin = () => {
    window.location.href = '/api/login';
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/mobile/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      // Store JWT token
      localStorage.setItem('auth_token', data.token);
      logger.info('Email login successful, redirecting to dashboard');
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err: any) {
      logger.error('Email login error:', err);
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 ${
          isDark ? 'bg-cyan-500' : 'bg-cyan-300'
        }`} style={{ animation: 'float 20s ease-in-out infinite' }} />
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 ${
          isDark ? 'bg-purple-500' : 'bg-purple-300'
        }`} style={{ animation: 'float 25s ease-in-out infinite reverse' }} />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-6">
        {/* Logo and Welcome */}
        <div className="text-center mb-8">
          <div className="mb-6">
            <FloLogo size={80} showText={false} className="mb-4 justify-center" />
            <h1 className={`text-4xl font-light mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Flō
            </h1>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Track. Improve. Evolve.
            </p>
            <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
              by Nuvitae Labs
            </p>
          </div>
        </div>

        {/* Sign In Card */}
        <div className={`w-full max-w-sm backdrop-blur-xl rounded-3xl border p-8 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="text-center mb-6">
            <h2 className={`text-xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Welcome to Flō
            </h2>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Sign in to start your evolution
            </p>
          </div>

          {!showEmailLogin ? (
            <>
              {/* Replit Auth Button */}
              <button
                onClick={handleReplitLogin}
                className={`w-full py-3.5 rounded-xl text-white flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] text-sm ${
                  isDark
                    ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30'
                    : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30'
                }`}
                data-testid="button-login-replit"
              >
                <Sparkles className="w-4 h-4" />
                <span>Continue with Replit</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className={`text-xs text-center mt-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Supports Google, Apple, GitHub, X, and Email
              </p>

              {/* Divider */}
              <div className="relative my-6">
                <div className={`absolute inset-0 flex items-center`}>
                  <div className={`w-full border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className={`px-2 ${isDark ? 'bg-white/5 text-white/50' : 'bg-white/60 text-gray-500'}`}>
                    or
                  </span>
                </div>
              </div>

              {/* Email Login Toggle */}
              <button
                onClick={() => setShowEmailLogin(true)}
                className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-sm border ${
                  isDark
                    ? 'border-white/20 text-white/70 hover:bg-white/5'
                    : 'border-black/20 text-gray-700 hover:bg-black/5'
                }`}
                data-testid="button-toggle-email-login"
              >
                <Mail className="w-4 h-4" />
                <span>Sign in with Email</span>
              </button>
            </>
          ) : (
            <>
              {/* Email Login Form */}
              <form onSubmit={handleEmailLogin} className="space-y-4">
                {error && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'
                  }`}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className={`block text-xs mb-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className={`w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all ${
                        isDark
                          ? 'bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-cyan-500/50 focus:bg-white/10'
                          : 'bg-white/80 border border-black/10 text-gray-900 placeholder:text-gray-400 focus:border-cyan-500 focus:bg-white'
                      }`}
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs mb-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Password
                  </label>
                  <div className="relative">
                    <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className={`w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all ${
                        isDark
                          ? 'bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-cyan-500/50 focus:bg-white/10'
                          : 'bg-white/80 border border-black/10 text-gray-900 placeholder:text-gray-400 focus:border-cyan-500 focus:bg-white'
                      }`}
                      data-testid="input-password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-3.5 rounded-xl text-white flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] text-sm ${
                    isLoading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30'
                  }`}
                  data-testid="button-submit-login"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Back to options */}
              <button
                onClick={() => {
                  setShowEmailLogin(false);
                  setError('');
                }}
                className={`w-full mt-4 text-xs ${isDark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'}`}
                data-testid="button-back-to-options"
              >
                ← Back to sign in options
              </button>
            </>
          )}
        </div>

        {/* Medical Disclaimer */}
        <p className={`text-[10px] text-center mt-4 max-w-md leading-relaxed ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
          By continuing, you agree to our{' '}
          <button className={`text-[9px] underline ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Terms</button>
          {' & '}
          <button className={`text-[9px] underline ${isDark ? 'text-white/60' : 'text-gray-600'}`}>Privacy Policy</button>
          . Not a substitute for medical advice.
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
