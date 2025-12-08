import { useState } from 'react';
import { X, Zap, Brain, Heart, ChevronRight, Clock, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ThreePMSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  onComplete?: () => void;
}

interface SurveyData {
  energy: number | null;
  clarity: number | null;
  mood: number | null;
}

export function ThreePMSurveyModal({ isOpen, onClose, isDark, onComplete }: ThreePMSurveyModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [surveyData, setSurveyData] = useState<SurveyData>({
    energy: null,
    clarity: null,
    mood: null
  });
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const submitMutation = useMutation({
    mutationFn: async (data: { energy: number; clarity: number; mood: number }) => {
      const res = await apiRequest('POST', '/api/surveys/daily', {
        ...data,
        timezone: userTimezone,
        triggerSource: 'manual'
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/today?timezone=${encodeURIComponent(userTimezone)}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/surveys/history'] });
      toast({
        title: 'Check-in complete',
        description: 'Your responses have been recorded.',
      });
      onComplete?.();
      onClose();
      setTimeout(() => {
        setCurrentStep(0);
        setSurveyData({ energy: null, clarity: null, mood: null });
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit survey',
        variant: 'destructive',
      });
    }
  });

  const questions = [
    {
      id: 'energy',
      icon: Zap,
      iconColor: isDark ? 'text-yellow-400' : 'text-yellow-600',
      iconBg: isDark ? 'bg-yellow-500/20' : 'bg-yellow-100',
      gradient: 'from-yellow-500/20 to-orange-500/20',
      title: 'Current Energy',
      prompt: 'Right now, how is your physical energy?',
      lowAnchor: 'Completely wiped out',
      highAnchor: 'Energised and ready to go',
      emoji: '⚡'
    },
    {
      id: 'clarity',
      icon: Brain,
      iconColor: isDark ? 'text-purple-400' : 'text-purple-600',
      iconBg: isDark ? 'bg-purple-500/20' : 'bg-purple-100',
      gradient: 'from-purple-500/20 to-blue-500/20',
      title: 'Mental Clarity',
      prompt: 'How easy is it to focus and think clearly right now?',
      lowAnchor: 'Brain fog, hard to think',
      highAnchor: 'Laser focused, clear head',
      emoji: '🧠'
    },
    {
      id: 'mood',
      icon: Heart,
      iconColor: isDark ? 'text-pink-400' : 'text-pink-600',
      iconBg: isDark ? 'bg-pink-500/20' : 'bg-pink-100',
      gradient: 'from-pink-500/20 to-rose-500/20',
      title: 'Mood & Wellbeing',
      prompt: 'How is your mood right now?',
      lowAnchor: 'Very low, flat or irritable',
      highAnchor: 'Positive, calm and upbeat',
      emoji: '💗'
    }
  ];

  const currentQuestion = questions[currentStep];
  const currentValue = surveyData[currentQuestion.id as keyof SurveyData];

  const handleValueSelect = (value: number) => {
    setSurveyData(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }));

    setTimeout(() => {
      if (currentStep < questions.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        handleSubmit({ ...surveyData, [currentQuestion.id]: value });
      }
    }, 300);
  };

  const handleSubmit = (data: SurveyData) => {
    if (data.energy && data.clarity && data.mood) {
      submitMutation.mutate({
        energy: data.energy,
        clarity: data.clarity,
        mood: data.mood
      });
    }
  };

  const getScaleColor = (value: number) => {
    if (value <= 3) return isDark ? 'bg-red-500' : 'bg-red-400';
    if (value <= 5) return isDark ? 'bg-orange-500' : 'bg-orange-400';
    if (value <= 7) return isDark ? 'bg-yellow-500' : 'bg-yellow-400';
    return isDark ? 'bg-green-500' : 'bg-green-400';
  };

  const getScaleColorRing = (value: number) => {
    if (value <= 3) return isDark ? 'ring-red-400/50' : 'ring-red-500/50';
    if (value <= 5) return isDark ? 'ring-orange-400/50' : 'ring-orange-500/50';
    if (value <= 7) return isDark ? 'ring-yellow-400/50' : 'ring-yellow-500/50';
    return isDark ? 'ring-green-400/50' : 'ring-green-500/50';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`absolute inset-0 ${isDark ? 'bg-black/60' : 'bg-black/40'} backdrop-blur-sm`}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={`relative w-full max-w-md backdrop-blur-xl rounded-3xl border shadow-2xl overflow-hidden ${
          isDark
            ? 'bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 border-white/10'
            : 'bg-gradient-to-br from-white/95 to-gray-50/95 border-black/10'
        }`}
      >
        {/* Decorative gradient overlay */}
        <div className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${currentQuestion.gradient} opacity-50 blur-2xl`}></div>

        {/* Close button */}
        <button
          onClick={onClose}
          data-testid="button-close-survey"
          className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-all ${
            isDark
              ? 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white'
              : 'bg-black/5 hover:bg-black/10 text-gray-600 hover:text-gray-900'
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2.5 rounded-xl ${currentQuestion.iconBg}`}>
              <Clock className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            </div>
            <div>
              <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                3PM Check-In
              </div>
              <div className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                Takes 30 seconds
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className={`flex gap-1 mb-6 mt-4`}>
            {questions.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  index <= currentStep
                    ? isDark ? 'bg-cyan-500' : 'bg-cyan-600'
                    : isDark ? 'bg-white/10' : 'bg-black/10'
                }`}
              />
            ))}
          </div>

          {/* Question */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Icon & Title */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-2xl ${currentQuestion.iconBg}`}>
                  <currentQuestion.icon className={`w-6 h-6 ${currentQuestion.iconColor}`} />
                </div>
                <div>
                  <h3 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {currentQuestion.title}
                  </h3>
                  <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Question {currentStep + 1} of {questions.length}
                  </div>
                </div>
              </div>

              {/* Prompt */}
              <p className={`mb-6 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                {currentQuestion.prompt}
              </p>

              {/* Scale */}
              <div className="mb-6">
                {/* Number buttons */}
                <div className="grid grid-cols-10 gap-2 mb-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => {
                    const isSelected = currentValue === value;
                    const isHovered = hoveredValue === value;
                    return (
                      <button
                        key={value}
                        onClick={() => handleValueSelect(value)}
                        onMouseEnter={() => setHoveredValue(value)}
                        onMouseLeave={() => setHoveredValue(null)}
                        data-testid={`button-scale-${value}`}
                        className={`relative aspect-square rounded-xl transition-all duration-200 flex items-center justify-center ${
                          isSelected
                            ? `${getScaleColor(value)} ring-4 ${getScaleColorRing(value)} scale-110`
                            : isHovered
                            ? isDark ? 'bg-white/20 scale-105' : 'bg-black/10 scale-105'
                            : isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'
                        }`}
                      >
                        <span className={`text-sm ${
                          isSelected 
                            ? 'text-white' 
                            : isDark ? 'text-white/70' : 'text-gray-700'
                        }`}>
                          {value}
                        </span>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1 -right-1"
                          >
                            <Sparkles className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Anchors */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className={`text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                      1 = {currentQuestion.lowAnchor}
                    </div>
                  </div>
                  <div className="flex-1 text-right">
                    <div className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                      10 = {currentQuestion.highAnchor}
                    </div>
                  </div>
                </div>
              </div>

              {/* Selected value display */}
              {currentValue && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl p-4 text-center ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-black/5 border border-black/10'
                  }`}
                >
                  <div className="text-3xl mb-1">{currentQuestion.emoji}</div>
                  <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    You selected <span className={`${isDark ? 'text-white' : 'text-gray-900'}`}>{currentValue}/10</span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center gap-3 mt-6">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                data-testid="button-back"
                className={`px-4 py-2.5 rounded-xl transition-all ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10 text-white/70'
                    : 'bg-black/5 hover:bg-black/10 text-gray-600'
                }`}
              >
                Back
              </button>
            )}
            <button
              onClick={() => {
                if (currentStep < questions.length - 1) {
                  setCurrentStep(currentStep + 1);
                } else if (currentValue) {
                  handleSubmit(surveyData);
                }
              }}
              disabled={!currentValue}
              data-testid="button-next"
              className={`flex-1 px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                currentValue
                  ? isDark
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white'
                  : isDark
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : 'bg-black/5 text-gray-400 cursor-not-allowed'
              }`}
            >
              {currentStep < questions.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Complete Check-In
                  <Sparkles className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
