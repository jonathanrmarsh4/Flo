import { X, Sparkles, MessageCircle, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface WhyInsightResponse {
  tileType: string;
  score: number | string | null;
  explanation: string;
  keyInsights: string[];
  generatedAt: string;
}

interface WhyModalProps {
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
  onFloChat: () => void;
  tileType: string;
  isLoading?: boolean;
  data?: WhyInsightResponse | null;
  error?: string | null;
}

const TILE_TITLES: Record<string, string> = {
  flo_overview: "Understanding Your Flō Overview",
  flomentum: "Understanding Your Flōmentum Score",
  sleep_index: "Understanding Your Sleep Index",
  daily_readiness: "Understanding Your Readiness Score",
};

export function WhyModal({ 
  isOpen,
  isDark, 
  onClose, 
  onFloChat,
  tileType,
  isLoading = false,
  data,
  error,
}: WhyModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => setIsVisible(true), 50);
    } else {
      setIsVisible(false);
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const title = TILE_TITLES[tileType] || "Understanding Your Score";
  const overallScore = data?.score;
  const aiExplanation = data?.explanation || '';
  const keyInsights = data?.keyInsights || [];

  return (
    <>
      {/* Full Screen Dimmed Backdrop */}
      <div 
        className={`fixed inset-0 z-[200] transition-all duration-500 ${
          isVisible ? 'bg-black/70 backdrop-blur-lg' : 'bg-black/0'
        }`}
        onClick={onClose}
        data-testid="why-modal-backdrop"
      />

      {/* Centered Modal */}
      <div 
        className="fixed inset-0 z-[201] flex items-center justify-center p-6 pointer-events-none"
        onClick={onClose}
      >
        <div 
          className={`w-full max-w-xl pointer-events-auto backdrop-blur-3xl rounded-[32px] border shadow-2xl transform transition-all duration-500 ${
            isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'
          } ${
            isDark 
              ? 'bg-gradient-to-br from-slate-900/98 via-blue-950/98 to-purple-950/98 border-white/20' 
              : 'bg-gradient-to-br from-white/98 via-blue-50/98 to-purple-50/98 border-black/10'
          }`}
          onClick={(e) => e.stopPropagation()}
          data-testid="why-modal"
          style={{
            maxHeight: '90vh',
            boxShadow: isDark 
              ? '0 30px 60px -15px rgba(0, 0, 0, 0.8), 0 0 120px -10px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
              : '0 30px 60px -15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
          }}
        >
          {/* Header */}
          <div className={`p-8 pb-6 border-b ${isDark ? 'border-white/10' : 'border-black/5'}`}>
            <div className="flex items-start justify-between mb-5">
              <div className={`p-4 rounded-3xl bg-gradient-to-br shadow-lg ${
                isDark 
                  ? 'from-teal-500/20 via-cyan-500/20 to-blue-500/20 shadow-teal-500/20' 
                  : 'from-teal-400/20 via-cyan-400/20 to-blue-400/20 shadow-teal-400/10'
              }`}>
                <Sparkles className={`w-8 h-8 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
              </div>
              <button
                onClick={onClose}
                className={`p-2.5 rounded-2xl transition-all hover:scale-110 active:scale-95 ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-why-modal-close"
              >
                <X className={`w-6 h-6 ${isDark ? 'text-white/70 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`} />
              </button>
            </div>

            <div>
              <h2 className={`text-2xl mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {title}
              </h2>
              {overallScore && (
                <div className="flex items-baseline gap-3 mb-4">
                  <span className={`text-5xl font-bold bg-gradient-to-br bg-clip-text text-transparent ${
                    isDark 
                      ? 'from-teal-400 via-cyan-400 to-blue-400' 
                      : 'from-teal-600 via-cyan-600 to-blue-600'
                  }`}>
                    {overallScore}
                  </span>
                  <span className={`text-lg ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {tileType}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* AI-Generated Explanation */}
          <div className="p-8 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 350px)' }}>
            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className={`w-10 h-10 animate-spin mb-4 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Analyzing your health data...
                </p>
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className={`rounded-2xl p-6 border ${
                isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'
              }`}>
                <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  {error}
                </p>
              </div>
            )}

            {/* Content (only show when loaded) */}
            {!isLoading && !error && data && (
              <>
                {/* Flō Avatar Badge */}
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg ${
                    isDark 
                      ? 'from-teal-500 via-cyan-500 to-blue-500 shadow-teal-500/30' 
                      : 'from-teal-400 via-cyan-400 to-blue-400 shadow-teal-400/20'
                  }`}>
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm mb-2 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                      Flō's Insight
                    </div>
                    <div className={`text-[15px] leading-relaxed ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                      {aiExplanation}
                    </div>
                  </div>
                </div>

                {/* Key Insights Section */}
                {keyInsights.length > 0 && (
                  <div className={`rounded-3xl border p-6 ${
                    isDark 
                      ? 'bg-white/5 border-white/10' 
                      : 'bg-white/60 border-black/5'
                  }`}>
                    <h3 className={`text-sm uppercase tracking-wider mb-4 flex items-center gap-2 ${
                      isDark ? 'text-white/50' : 'text-gray-500'
                    }`}>
                      <span className="text-base">✨</span>
                      Key Factors
                    </h3>
                    <div className="space-y-3">
                      {keyInsights.map((insight, index) => (
                        <div 
                          key={index}
                          className={`flex items-start gap-3 transition-all duration-300`}
                          style={{ transitionDelay: `${index * 100}ms` }}
                        >
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            isDark 
                              ? 'bg-teal-500/20 text-teal-400' 
                              : 'bg-teal-100 text-teal-700'
                          }`}>
                            {index + 1}
                          </div>
                          <p className={`text-sm leading-relaxed pt-0.5 ${
                            isDark ? 'text-white/80' : 'text-gray-700'
                          }`}>
                            {insight}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contextual Tip */}
                <div className={`rounded-2xl p-5 border-l-4 ${
                  isDark 
                    ? 'bg-blue-500/10 border-blue-400' 
                    : 'bg-blue-50 border-blue-500'
                }`}>
                  <div className={`text-xs uppercase tracking-wider mb-2 ${
                    isDark ? 'text-blue-400' : 'text-blue-600'
                  }`}>
                    💡 Quick Tip
                  </div>
                  <p className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                    Want to understand more about what's driving your scores? Ask Flō below for personalized recommendations and deeper insights.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer with Flō Chat Button - show when not loading */}
          {!isLoading && (
            <div className={`p-8 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] border-t ${isDark ? 'border-white/10' : 'border-black/5'}`}>
              <button
                onClick={() => {
                  onFloChat();
                }}
                className={`w-full py-5 rounded-[20px] font-medium transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-xl ${
                  isDark
                    ? 'bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/50'
                    : 'bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 text-white shadow-blue-400/30 hover:shadow-2xl hover:shadow-blue-400/40'
                }`}
                data-testid="button-ask-flo-details"
              >
                <div className="flex items-center justify-center gap-3">
                  <MessageCircle className="w-5 h-5" />
                  <span className="text-base">{error ? 'Talk to Flō Instead' : 'Ask Flō for More Details'}</span>
                  <ChevronRight className="w-5 h-5" />
                </div>
              </button>

              <p className={`text-center text-xs mt-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                {error ? 'Get help from Flō directly' : 'Get personalized insights, recommendations, and action steps'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
