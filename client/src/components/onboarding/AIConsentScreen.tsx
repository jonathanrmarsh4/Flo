import { useState } from 'react';
import { Sparkles, Shield, Database, Eye, ChevronRight, Check } from 'lucide-react';
import { getAuthHeaders } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AIConsentScreenProps {
  isDark: boolean;
  onComplete: (consented: boolean) => void;
}

const AI_CONSENT_VERSION = '1.0';

const aiVendors = [
  { name: 'Google AI (Gemini)', purpose: 'Health insights, voice assistant, pattern analysis' },
  { name: 'OpenAI', purpose: 'Blood work extraction, document processing' },
  { name: 'ElevenLabs', purpose: 'Voice synthesis for Flō Oracle' },
];

const privacyPoints = [
  {
    icon: Shield,
    title: 'Your data is anonymized',
    description: 'We remove your name, email, and identifying information before sending any health data to AI providers.',
  },
  {
    icon: Database,
    title: 'Stored separately',
    description: 'Your health data is stored in a separate database from your identity, linked only by an anonymous ID.',
  },
  {
    icon: Eye,
    title: 'You stay in control',
    description: 'You can enable or disable AI features anytime in Settings. Your data, your choice.',
  },
];

export function AIConsentScreen({ isDark, onComplete }: AIConsentScreenProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleConsent = async (consented: boolean) => {
    setIsSubmitting(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/user/ai-consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          consented,
          version: AI_CONSENT_VERSION,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save consent preference');
      }

      if (consented) {
        toast({
          title: 'AI Features Enabled',
          description: 'You can now use Flō Oracle, insights, and other AI-powered features.',
        });
      }

      onComplete(consented);
    } catch (error) {
      console.error('Failed to save AI consent:', error);
      toast({
        title: 'Error',
        description: 'Failed to save your preference. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col h-full overflow-y-auto pb-8 pt-[env(safe-area-inset-top)] ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      <div className="flex-1 px-6 py-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${
            isDark 
              ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-500/30' 
              : 'bg-gradient-to-br from-purple-100 to-pink-100 border border-purple-200'
          }`}>
            <Sparkles className={`w-10 h-10 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          </div>
          
          <h1 className={`text-2xl font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Power Up with AI
          </h1>
          
          <p className={`text-base leading-relaxed max-w-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            Flō uses advanced AI to analyze your health data and provide personalized insights, 
            recommendations, and coaching.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {privacyPoints.map((point, index) => (
            <div 
              key={index}
              className={`flex gap-4 p-4 rounded-2xl ${
                isDark ? 'bg-white/5 border border-white/10' : 'bg-white/80 border border-gray-200'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isDark ? 'bg-green-500/20' : 'bg-green-100'
              }`}>
                <point.icon className={`w-6 h-6 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <div className="flex-1 text-left">
                <h3 className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {point.title}
                </h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`w-full flex items-center justify-between p-4 rounded-2xl mb-4 transition-all ${
            isDark 
              ? 'bg-white/5 border border-white/10 hover:bg-white/10' 
              : 'bg-white/80 border border-gray-200 hover:bg-white'
          }`}
          data-testid="button-toggle-ai-vendors"
        >
          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            AI Providers We Use
          </span>
          <ChevronRight className={`w-5 h-5 transition-transform ${showDetails ? 'rotate-90' : ''} ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`} />
        </button>

        {showDetails && (
          <div className={`rounded-2xl p-4 mb-6 space-y-3 ${
            isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'
          }`}>
            {aiVendors.map((vendor, index) => (
              <div key={index} className="flex justify-between items-start">
                <div>
                  <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {vendor.name}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {vendor.purpose}
                  </p>
                </div>
              </div>
            ))}
            <p className={`text-xs pt-2 border-t ${
              isDark ? 'text-white/40 border-white/10' : 'text-gray-400 border-gray-200'
            }`}>
              All data sent is anonymized and cannot be linked back to your identity.
            </p>
          </div>
        )}
      </div>

      <div className="px-6 space-y-3 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => handleConsent(true)}
          disabled={isSubmitting}
          className={`w-full py-4 rounded-2xl font-medium text-base flex items-center justify-center gap-2 transition-all ${
            isSubmitting ? 'opacity-60' : ''
          } ${
            isDark 
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600' 
              : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
          }`}
          data-testid="button-enable-ai-features"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-5 h-5" />
              Enable AI Features
            </>
          )}
        </button>

        <button
          onClick={() => handleConsent(false)}
          disabled={isSubmitting}
          className={`w-full py-4 rounded-2xl font-medium text-base transition-all ${
            isDark 
              ? 'text-white/60 hover:text-white hover:bg-white/5' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          data-testid="button-skip-ai-features"
        >
          Continue Without AI
        </button>

        <p className={`text-xs text-center px-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
          You can change this anytime in Settings → Privacy
        </p>
      </div>
    </div>
  );
}
