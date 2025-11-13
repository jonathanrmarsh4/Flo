import { ArrowRight, Sparkles } from 'lucide-react';
import { FloLogo } from './FloLogo';

interface LoginScreenProps {
  onLogin: () => void;
  isDark: boolean;
}

export function LoginScreen({ onLogin, isDark }: LoginScreenProps) {
  const handleLogin = () => {
    // Redirect to Replit Auth - provides Google, Apple, GitHub, X, and email/password
    window.location.href = '/api/login';
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
              Track biomarkers, optimize health
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
              Sign in to track your health journey
            </p>
          </div>

          {/* Sign In Button */}
          <button
            onClick={handleLogin}
            className={`w-full py-3.5 rounded-xl text-white flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] text-sm ${
              isDark
                ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30'
                : 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30'
            }`}
            data-testid="button-login-replit"
          >
            <Sparkles className="w-4 h-4" />
            <span>Continue to Flō</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className={`text-xs text-center mt-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Supports Google, Apple, GitHub, X, and Email
          </p>
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
