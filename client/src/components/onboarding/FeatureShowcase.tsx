import { useState } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, Target, TrendingUp, Activity, Brain } from 'lucide-react';
import floLogo from '@assets/Flo Clear_1764063194603.png';

interface FeatureShowcaseProps {
  isDark: boolean;
  onComplete: () => void;
}

const features = [
  {
    id: 'welcome',
    icon: null, // Uses logo image instead
    title: 'Welcome to Flō',
    subtitle: 'Your Journey to Optimal Health',
    description: 'Track biomarkers, get AI-powered insights, and optimize your health naturally through balanced, minimal interventions.',
    gradient: 'from-cyan-500 via-blue-500 to-purple-500',
    accentColor: 'cyan',
    useLogo: true,
  },
  {
    id: 'biomarkers',
    icon: Activity,
    title: 'Blood Marker Insights',
    subtitle: 'Track & Understand Your Biomarkers',
    description: 'Monitor 90+ biomarkers across 10 categories. Visualize trends, track reference ranges, and understand what your results mean for your health.',
    gradient: 'from-teal-500 via-emerald-500 to-green-500',
    accentColor: 'teal',
    features: [
      '90+ biomarkers tracked',
      'Trend analysis & charts',
      'Reference range visualization',
      'Retest recommendations'
    ]
  },
  {
    id: 'ai-oracle',
    icon: Sparkles,
    title: 'Flō',
    subtitle: 'AI-Powered Health Coaching',
    description: 'Get personalized insights powered by advanced AI. Discover correlations between biomarkers, lifestyle factors, and receive actionable recommendations.',
    gradient: 'from-purple-500 via-pink-500 to-rose-500',
    accentColor: 'purple',
    features: [
      'AI health correlation engine',
      'Voice chat interface',
      'Personalized recommendations',
      'Clinical-grade insights'
    ]
  },
  {
    id: 'action-plan',
    icon: Target,
    title: 'Action Plan',
    subtitle: 'Save Insights & Track Goals',
    description: 'Convert insights into action. Save recommendations, track progress toward health goals, and export professional reports for your healthcare team.',
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    accentColor: 'orange',
    features: [
      'Save AI insights as actions',
      'Track health goals',
      'Progress monitoring',
      'Export health reports'
    ]
  }
];

export function FeatureShowcase({ isDark, onComplete }: FeatureShowcaseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentFeature = features[currentIndex];

  const handleNext = () => {
    if (currentIndex < features.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const Icon = currentFeature.icon;
  const useLogo = 'useLogo' in currentFeature && currentFeature.useLogo;

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-12">
      {/* Main Content Card */}
      <div 
        className="w-full max-w-md mb-8"
        key={currentFeature.id}
        style={{
          animation: 'fadeSlideIn 0.5s ease-out'
        }}
      >
        <div className={`backdrop-blur-xl rounded-3xl border p-8 ${
          isDark 
            ? 'bg-white/5 border-white/10' 
            : 'bg-white/60 border-black/10'
        }`}>
          {/* Icon or Logo */}
          <div className="flex justify-center mb-6">
            {useLogo ? (
              <div 
                className="w-28 h-28 rounded-3xl overflow-hidden shadow-2xl"
                style={{
                  animation: 'floatPulse 3s ease-in-out infinite'
                }}
              >
                <img 
                  src={floLogo} 
                  alt="Flō" 
                  className="w-full h-full object-cover"
                />
              </div>
            ) : Icon && (
              <div className={`p-6 rounded-3xl bg-gradient-to-br ${currentFeature.gradient} shadow-2xl`}
                style={{
                  animation: 'floatPulse 3s ease-in-out infinite'
                }}
              >
                <Icon className="w-12 h-12 text-white" />
              </div>
            )}
          </div>

          {/* Title & Subtitle */}
          <div className="text-center mb-6">
            <h1 className={`text-2xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {currentFeature.title}
            </h1>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              {currentFeature.subtitle}
            </p>
          </div>

          {/* Description */}
          <p className={`text-center mb-6 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
            {currentFeature.description}
          </p>

          {/* Feature List (if available) */}
          {currentFeature.features && (
            <div className="space-y-2.5 mb-6">
              {currentFeature.features.map((feature, index) => (
                <div 
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    isDark ? 'bg-white/5' : 'bg-white/60'
                  }`}
                  style={{
                    animation: `fadeSlideIn 0.5s ease-out ${index * 0.1 + 0.2}s both`
                  }}
                >
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${currentFeature.gradient} flex items-center justify-center flex-shrink-0`}>
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                  <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Progress Dots */}
      <div className="flex items-center gap-2 mb-8">
        {features.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`h-2 rounded-full transition-all ${
              index === currentIndex 
                ? 'w-8' 
                : 'w-2'
            } ${
              index === currentIndex
                ? `bg-gradient-to-r ${currentFeature.gradient}`
                : isDark 
                  ? 'bg-white/20' 
                  : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-4 w-full max-w-md">
        {/* Back Button */}
        {currentIndex > 0 && (
          <button
            onClick={handlePrev}
            className={`p-3 rounded-xl transition-all ${
              isDark 
                ? 'bg-white/10 hover:bg-white/20 text-white' 
                : 'bg-black/5 hover:bg-black/10 text-gray-900'
            }`}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Next/Get Started Button */}
        <button
          onClick={handleNext}
          className={`flex-1 py-4 px-6 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl bg-gradient-to-r ${currentFeature.gradient} text-white`}
        >
          <div className="flex items-center justify-center gap-2">
            <span>
              {currentIndex === features.length - 1 ? "Let's Get Started" : 'Next'}
            </span>
            <ChevronRight className="w-5 h-5" />
          </div>
        </button>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes floatPulse {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-10px) scale(1.05);
          }
        }
      `}</style>
    </div>
  );
}
