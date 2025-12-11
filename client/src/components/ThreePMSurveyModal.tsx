import { useState, useEffect, useMemo } from 'react';
import { X, Zap, Brain, Heart, ChevronRight, Clock, Sparkles, Loader2, Pill, Moon, Activity, Frown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
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

interface ActiveExperiment {
  id: string;
  product_name: string;
  supplement_type_id: string;
  dosage_timing?: string;
  status: string;
}

interface SupplementRatings {
  [experimentId: string]: {
    'Sleep Quality'?: number;
    'Recovery'?: number;
    'Stress Level'?: number;
  };
}

const SUPPLEMENT_QUESTIONS = [
  {
    id: 'Sleep Quality',
    icon: Moon,
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/20',
    gradient: 'from-indigo-500/20 to-purple-500/20',
    title: 'Sleep Quality',
    prompt: 'How would you rate your sleep quality last night?',
    lowAnchor: 'Terrible, restless sleep',
    highAnchor: 'Deep, restorative sleep',
  },
  {
    id: 'Recovery',
    icon: Activity,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/20',
    gradient: 'from-emerald-500/20 to-green-500/20',
    title: 'Recovery',
    prompt: 'How recovered do you feel today?',
    lowAnchor: 'Completely drained',
    highAnchor: 'Fully recharged',
  },
  {
    id: 'Stress Level',
    icon: Frown,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/20',
    gradient: 'from-amber-500/20 to-orange-500/20',
    title: 'Stress Level',
    prompt: 'How stressed are you feeling?',
    lowAnchor: 'Very calm and relaxed',
    highAnchor: 'Extremely stressed',
    inverted: true,
  },
];

export function ThreePMSurveyModal({ isOpen, onClose, isDark, onComplete }: ThreePMSurveyModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [surveyData, setSurveyData] = useState<SurveyData>({
    energy: null,
    clarity: null,
    mood: null
  });
  const [supplementRatings, setSupplementRatings] = useState<SupplementRatings>({});
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const [phase, setPhase] = useState<'daily' | 'supplements'>('daily');
  const [supplementStep, setSupplementStep] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const { data: experimentsData } = useQuery<{ experiments: ActiveExperiment[] }>({
    queryKey: ['/api/n1/experiments/needing-checkin'],
    enabled: isOpen,
  });
  
  const activeExperiments = experimentsData?.experiments || [];
  const hasActiveExperiments = activeExperiments.length > 0;
  
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setPhase('daily');
      setSupplementStep(0);
      setSurveyData({ energy: null, clarity: null, mood: null });
      setSupplementRatings({});
    }
  }, [isOpen]);
  
  const submitDailySurveyMutation = useMutation({
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
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit survey',
        variant: 'destructive',
      });
    }
  });

  const submitSupplementCheckinMutation = useMutation({
    mutationFn: async ({ experimentId, ratings }: { experimentId: string; ratings: Record<string, number> }) => {
      const res = await apiRequest('POST', `/api/n1/experiments/${experimentId}/checkin`, {
        ratings,
        source: 'dashboard_popup',
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments', variables.experimentId, 'checkins'] });
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments/needing-checkin'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit supplement check-in',
        variant: 'destructive',
      });
    }
  });

  const dailyQuestions = [
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
    }
  ];

  const supplementQuestionSteps = useMemo(() => {
    if (!activeExperiments || activeExperiments.length === 0) {
      return [];
    }
    const steps: { experiment: ActiveExperiment; question: typeof SUPPLEMENT_QUESTIONS[0] }[] = [];
    for (const exp of activeExperiments) {
      for (const q of SUPPLEMENT_QUESTIONS) {
        steps.push({ experiment: exp, question: q });
      }
    }
    return steps;
  }, [activeExperiments]);

  const totalSteps = dailyQuestions.length + (hasActiveExperiments ? supplementQuestionSteps.length : 0);
  const currentOverallStep = phase === 'daily' ? currentStep : dailyQuestions.length + supplementStep;

  const getCurrentQuestion = () => {
    if (phase === 'daily') {
      return dailyQuestions[currentStep];
    } else {
      const step = supplementQuestionSteps[supplementStep];
      return {
        ...step.question,
        iconColor: isDark ? step.question.iconColor : step.question.iconColor.replace('-400', '-600'),
        iconBg: isDark ? step.question.iconBg : step.question.iconBg.replace('/20', '-100').replace('bg-', 'bg-'),
        supplementName: step.experiment.product_name,
        experimentId: step.experiment.id,
      };
    }
  };

  const currentQuestion = getCurrentQuestion();

  const getCurrentValue = (): number | null => {
    if (phase === 'daily') {
      return surveyData[dailyQuestions[currentStep].id as keyof SurveyData];
    } else {
      const step = supplementQuestionSteps[supplementStep];
      return supplementRatings[step.experiment.id]?.[step.question.id as keyof SupplementRatings[string]] || null;
    }
  };

  const currentValue = getCurrentValue();

  const handleValueSelect = async (value: number) => {
    if (phase === 'daily') {
      const questionId = dailyQuestions[currentStep].id;
      const newSurveyData = { ...surveyData, [questionId]: value };
      setSurveyData(newSurveyData);

      setTimeout(async () => {
        if (currentStep < dailyQuestions.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          try {
            await submitDailySurveyMutation.mutateAsync({
              energy: newSurveyData.energy!,
              clarity: newSurveyData.clarity!,
              mood: newSurveyData.mood!,
            });
            
            if (hasActiveExperiments && activeExperiments.length > 0) {
              setPhase('supplements');
              setSupplementStep(0);
            } else {
              handleComplete();
            }
          } catch (error) {
            // Error already shown via mutation onError
          }
        }
      }, 300);
    } else {
      const step = supplementQuestionSteps[supplementStep];
      const experimentId = step.experiment.id;
      const questionId = step.question.id;
      
      const newRatings = {
        ...supplementRatings[experimentId],
        [questionId]: value,
      };
      
      setSupplementRatings(prev => ({
        ...prev,
        [experimentId]: newRatings,
      }));

      setTimeout(async () => {
        const isLastQuestionForExperiment = (supplementStep + 1) % SUPPLEMENT_QUESTIONS.length === 0;
        
        try {
          if (isLastQuestionForExperiment) {
            await submitSupplementCheckinMutation.mutateAsync({ experimentId, ratings: newRatings });
          }
          
          if (supplementStep < supplementQuestionSteps.length - 1) {
            setSupplementStep(supplementStep + 1);
          } else {
            handleComplete();
          }
        } catch (error) {
          // Error already shown via mutation onError, don't advance
        }
      }, 300);
    }
  };

  const handleComplete = () => {
    toast({
      title: 'Check-in complete',
      description: hasActiveExperiments 
        ? 'Your daily survey and supplement check-ins have been recorded.'
        : 'Your responses have been recorded.',
    });
    onComplete?.();
    onClose();
  };

  const getScaleColor = (value: number, inverted?: boolean) => {
    const effectiveValue = inverted ? 11 - value : value;
    if (effectiveValue <= 3) return isDark ? 'bg-red-500' : 'bg-red-400';
    if (effectiveValue <= 5) return isDark ? 'bg-orange-500' : 'bg-orange-400';
    if (effectiveValue <= 7) return isDark ? 'bg-yellow-500' : 'bg-yellow-400';
    return isDark ? 'bg-green-500' : 'bg-green-400';
  };

  const getScaleColorRing = (value: number, inverted?: boolean) => {
    const effectiveValue = inverted ? 11 - value : value;
    if (effectiveValue <= 3) return isDark ? 'ring-red-400/50' : 'ring-red-500/50';
    if (effectiveValue <= 5) return isDark ? 'ring-orange-400/50' : 'ring-orange-500/50';
    if (effectiveValue <= 7) return isDark ? 'ring-yellow-400/50' : 'ring-yellow-500/50';
    return isDark ? 'ring-green-400/50' : 'ring-green-500/50';
  };

  const handleBack = () => {
    if (phase === 'daily') {
      if (currentStep > 0) {
        setCurrentStep(currentStep - 1);
      }
    } else {
      if (supplementStep > 0) {
        setSupplementStep(supplementStep - 1);
      } else {
        setPhase('daily');
        setCurrentStep(dailyQuestions.length - 1);
      }
    }
  };

  if (!isOpen) return null;

  const isInverted = phase === 'supplements' && 'inverted' in currentQuestion && currentQuestion.inverted;
  const IconComponent = currentQuestion.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`absolute inset-0 ${isDark ? 'bg-black/60' : 'bg-black/40'} backdrop-blur-sm`}
        onClick={onClose}
      />

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
        <div className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${currentQuestion.gradient} opacity-50 blur-2xl`}></div>

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
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2.5 rounded-xl ${phase === 'supplements' ? 'bg-purple-500/20' : currentQuestion.iconBg}`}>
              {phase === 'supplements' ? (
                <Pill className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              ) : (
                <Clock className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              )}
            </div>
            <div>
              <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                {phase === 'supplements' 
                  ? `${(currentQuestion as any).supplementName} Check-In`
                  : '3PM Check-In'
                }
              </div>
              <div className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                {hasActiveExperiments 
                  ? `${currentOverallStep + 1} of ${totalSteps} questions`
                  : 'Takes 30 seconds'
                }
              </div>
            </div>
          </div>

          <div className={`flex gap-1 mb-6 mt-4`}>
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  index <= currentOverallStep
                    ? index < dailyQuestions.length
                      ? isDark ? 'bg-cyan-500' : 'bg-cyan-600'
                      : isDark ? 'bg-purple-500' : 'bg-purple-600'
                    : isDark ? 'bg-white/10' : 'bg-black/10'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${phase}-${phase === 'daily' ? currentStep : supplementStep}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-2xl ${currentQuestion.iconBg}`}>
                  <IconComponent className={`w-6 h-6 ${currentQuestion.iconColor}`} />
                </div>
                <div>
                  <h3 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {currentQuestion.title}
                  </h3>
                  <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {phase === 'supplements' 
                      ? `For ${(currentQuestion as any).supplementName}`
                      : `Question ${currentStep + 1} of ${dailyQuestions.length}`
                    }
                  </div>
                </div>
              </div>

              <p className={`mb-6 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                {currentQuestion.prompt}
              </p>

              <div className="mb-6">
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
                            ? `${getScaleColor(value, isInverted)} ring-4 ${getScaleColorRing(value, isInverted)} scale-110`
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

                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className={`text-xs ${isInverted ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                      1 = {currentQuestion.lowAnchor}
                    </div>
                  </div>
                  <div className="flex-1 text-right">
                    <div className={`text-xs ${isInverted ? (isDark ? 'text-red-400' : 'text-red-600') : (isDark ? 'text-green-400' : 'text-green-600')}`}>
                      10 = {currentQuestion.highAnchor}
                    </div>
                  </div>
                </div>
              </div>

              {currentValue && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl p-4 text-center ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-black/5 border border-black/10'
                  }`}
                >
                  <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    You selected <span className={`${isDark ? 'text-white' : 'text-gray-900'}`}>{currentValue}/10</span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-3 mt-6">
            {(currentStep > 0 || (phase === 'supplements' && supplementStep >= 0)) && (
              <button
                onClick={handleBack}
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
              onClick={() => currentValue && handleValueSelect(currentValue)}
              disabled={!currentValue || submitDailySurveyMutation.isPending || submitSupplementCheckinMutation.isPending}
              data-testid="button-next"
              className={`flex-1 px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                currentValue && !submitDailySurveyMutation.isPending && !submitSupplementCheckinMutation.isPending
                  ? phase === 'supplements'
                    ? isDark
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                    : isDark
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white'
                      : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white'
                  : isDark
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : 'bg-black/5 text-gray-400 cursor-not-allowed'
              }`}
            >
              {(submitDailySurveyMutation.isPending || submitSupplementCheckinMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : phase === 'daily' && currentStep < dailyQuestions.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : phase === 'daily' && hasActiveExperiments ? (
                <>
                  Continue to Supplement Check-In
                  <Pill className="w-4 h-4" />
                </>
              ) : supplementStep < supplementQuestionSteps.length - 1 ? (
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
