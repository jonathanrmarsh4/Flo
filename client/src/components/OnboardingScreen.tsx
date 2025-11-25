import { useState } from 'react';
import { ChevronRight, X, Check } from 'lucide-react';
import { FeatureShowcase } from './onboarding/FeatureShowcase';
import { SetupSteps } from './onboarding/SetupSteps';

interface OnboardingScreenProps {
  isDark: boolean;
  onComplete: () => void;
  onSkip?: () => void;
}

export function OnboardingScreen({ isDark, onComplete, onSkip }: OnboardingScreenProps) {
  const [currentPhase, setCurrentPhase] = useState<'showcase' | 'setup'>('showcase');

  const handleShowcaseComplete = () => {
    setCurrentPhase('setup');
  };

  const handleSetupComplete = () => {
    onComplete();
  };

  return (
    <div className={`fixed inset-0 z-50 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Skip button - only show during showcase */}
      {currentPhase === 'showcase' && onSkip && (
        <button
          onClick={onSkip}
          className={`absolute top-6 right-6 z-10 px-4 py-2 rounded-xl text-sm transition-all ${
            isDark 
              ? 'text-white/60 hover:text-white hover:bg-white/10' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-black/5'
          }`}
        >
          Skip
        </button>
      )}

      {/* Content */}
      {currentPhase === 'showcase' ? (
        <FeatureShowcase 
          isDark={isDark} 
          onComplete={handleShowcaseComplete}
        />
      ) : (
        <SetupSteps 
          isDark={isDark} 
          onComplete={handleSetupComplete}
        />
      )}
    </div>
  );
}
