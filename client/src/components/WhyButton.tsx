import { useState } from 'react';
import { HelpCircle, Lock } from 'lucide-react';
import { usePlan, usePaywallModals } from '@/hooks/usePlan';
import { PaywallModal } from './PaywallModal';
import { useLocation } from 'wouter';

interface WhyButtonProps {
  isDark: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
}

export function WhyButton({ isDark, onClick, size = 'md' }: WhyButtonProps) {
  const sizeClasses = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const [showPaywall, setShowPaywall] = useState(false);
  const [, setLocation] = useLocation();
  
  const { data: planData } = usePlan();
  const { data: modalsData } = usePaywallModals();
  
  const allowWhyExplanations = planData?.features?.ai?.allowWhyExplanations ?? false;
  
  const handleClick = () => {
    if (!allowWhyExplanations) {
      setShowPaywall(true);
      return;
    }
    onClick();
  };

  const paywallModal = modalsData?.modals?.find(m => m.id === 'upgrade_on_locked_why_insight') || {
    id: 'upgrade_on_locked_why_insight',
    title: 'Unlock AI Explanations',
    description: 'Get personalized AI explanations for why your scores are what they are, and what you can do to improve them.',
    benefits: [
      'AI-powered explanations for every tile',
      'Personalized health coaching',
      'Voice conversations with Flō',
      'Daily AI-generated insights',
    ],
    ctaText: 'Unlock AI Insights',
    ctaAction: 'upgrade_to_premium' as const,
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        className={`${sizeClasses} rounded-full backdrop-blur-xl border transition-all duration-300 flex items-center justify-center group hover:scale-110 ${
          isDark
            ? 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30'
            : 'bg-white/40 border-black/10 hover:bg-white/60 hover:border-black/20'
        }`}
        title={allowWhyExplanations ? "Why this score?" : "Premium feature"}
        data-testid="button-why"
        style={{
          boxShadow: isDark 
            ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
            : '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      >
        {allowWhyExplanations ? (
          <HelpCircle 
            className={`${iconSize} transition-all duration-300 ${
              isDark 
                ? 'text-white/60 group-hover:text-teal-400' 
                : 'text-gray-500 group-hover:text-teal-600'
            }`} 
          />
        ) : (
          <Lock 
            className={`${iconSize} transition-all duration-300 ${
              isDark 
                ? 'text-amber-400/70 group-hover:text-amber-300' 
                : 'text-amber-500 group-hover:text-amber-600'
            }`} 
          />
        )}
      </button>
      
      <PaywallModal
        open={showPaywall}
        onOpenChange={setShowPaywall}
        modal={paywallModal}
        onUpgrade={() => setLocation('/billing')}
      />
    </>
  );
}
