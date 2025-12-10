import { useState } from 'react';
import { X, MessageCircle, ThermometerSnowflake, HeartPulse, Moon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedbackQuestion {
  questionText: string;
  questionType: 'scale_1_10' | 'yes_no' | 'multiple_choice' | 'open_ended';
  options?: string[];
  triggerPattern: string;
  triggerMetrics: Record<string, { value: number; deviation: number }>;
  urgency: 'low' | 'medium' | 'high';
}

interface CausalContext {
  insightText?: string | null;
  likelyCauses?: string[] | null;
  whatsWorking?: string[] | null;
  patternConfidence?: number | null;
  isRecurringPattern?: boolean;
  historicalMatchCount?: number | null;
}

interface FeedbackSurveyModalProps {
  feedbackId: string;
  question: FeedbackQuestion;
  isDark: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  causalContext?: CausalContext;
}

const PATTERN_ICONS: Record<string, any> = {
  illness_precursor: ThermometerSnowflake,
  recovery_deficit: Moon,
  elevated_rhr: HeartPulse,
  default: AlertTriangle,
};

const PATTERN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  illness_precursor: { bg: 'from-orange-500/20 to-red-500/20', text: 'text-orange-400', border: 'border-orange-400/30' },
  recovery_deficit: { bg: 'from-purple-500/20 to-blue-500/20', text: 'text-purple-400', border: 'border-purple-400/30' },
  elevated_rhr: { bg: 'from-red-500/20 to-pink-500/20', text: 'text-red-400', border: 'border-red-400/30' },
  default: { bg: 'from-blue-500/20 to-cyan-500/20', text: 'text-blue-400', border: 'border-blue-400/30' },
};

interface TypedResponse {
  responseValue?: number;
  responseBoolean?: boolean;
  responseOptionIndex?: number;
  responseText?: string;
}

export function FeedbackSurveyModal({ feedbackId, question, isDark, onClose, onSubmit, causalContext }: FeedbackSurveyModalProps) {
  const [scaleValue, setScaleValue] = useState<number | null>(null);
  const [booleanValue, setBooleanValue] = useState<boolean | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [textResponse, setTextResponse] = useState('');
  const queryClient = useQueryClient();

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: TypedResponse) => {
      return apiRequest('POST', '/api/correlation/feedback', {
        feedbackId,
        ...data,
        channel: 'in_app',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/correlation/feedback', feedbackId] });
      onSubmit?.();
      onClose();
    },
  });

  const isSubmitEnabled = () => {
    switch (question.questionType) {
      case 'scale_1_10':
        return scaleValue !== null;
      case 'yes_no':
        return booleanValue !== null;
      case 'multiple_choice':
        return selectedOptionIndex !== null;
      case 'open_ended':
        return textResponse.trim().length > 0;
      default:
        return false;
    }
  };

  const handleSubmit = () => {
    if (!isSubmitEnabled()) return;

    const response: TypedResponse = {};

    switch (question.questionType) {
      case 'scale_1_10':
        response.responseValue = scaleValue!;
        if (textResponse.trim()) response.responseText = textResponse.trim();
        break;
      case 'yes_no':
        response.responseBoolean = booleanValue!;
        if (textResponse.trim()) response.responseText = textResponse.trim();
        break;
      case 'multiple_choice':
        response.responseOptionIndex = selectedOptionIndex!;
        if (textResponse.trim()) response.responseText = textResponse.trim();
        break;
      case 'open_ended':
        response.responseText = textResponse.trim();
        break;
    }

    submitFeedbackMutation.mutate(response);
  };

  const Icon = PATTERN_ICONS[question.triggerPattern] || PATTERN_ICONS.default;
  const colors = PATTERN_COLORS[question.triggerPattern] || PATTERN_COLORS.default;

  const renderScaleButtons = () => (
    <div className="grid grid-cols-5 gap-2 mb-4">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
        <button
          key={num}
          onClick={() => setScaleValue(num)}
          className={`py-3 rounded-xl text-sm font-medium transition-all ${
            scaleValue === num
              ? isDark
                ? 'bg-blue-500 text-white'
                : 'bg-blue-600 text-white'
              : isDark
                ? 'bg-white/10 text-white/80 hover:bg-white/20'
                : 'bg-black/5 text-gray-700 hover:bg-black/10'
          }`}
          data-testid={`feedback-scale-${num}`}
        >
          {num}
        </button>
      ))}
    </div>
  );

  const renderYesNoButtons = () => (
    <div className="flex gap-3 mb-4">
      <button
        onClick={() => setBooleanValue(true)}
        className={`flex-1 py-4 rounded-xl text-base font-medium transition-all ${
          booleanValue === true
            ? 'bg-green-500 text-white'
            : isDark
              ? 'bg-white/10 text-white/80 hover:bg-white/20'
              : 'bg-black/5 text-gray-700 hover:bg-black/10'
        }`}
        data-testid="feedback-yes"
      >
        Yes
      </button>
      <button
        onClick={() => setBooleanValue(false)}
        className={`flex-1 py-4 rounded-xl text-base font-medium transition-all ${
          booleanValue === false
            ? 'bg-red-500 text-white'
            : isDark
              ? 'bg-white/10 text-white/80 hover:bg-white/20'
              : 'bg-black/5 text-gray-700 hover:bg-black/10'
        }`}
        data-testid="feedback-no"
      >
        No
      </button>
    </div>
  );

  const renderMultipleChoice = () => (
    <div className="space-y-2 mb-4">
      {question.options?.map((option, idx) => (
        <button
          key={idx}
          onClick={() => setSelectedOptionIndex(idx)}
          className={`w-full py-3 px-4 rounded-xl text-left text-sm font-medium transition-all ${
            selectedOptionIndex === idx
              ? isDark
                ? 'bg-blue-500 text-white'
                : 'bg-blue-600 text-white'
              : isDark
                ? 'bg-white/10 text-white/80 hover:bg-white/20'
                : 'bg-black/5 text-gray-700 hover:bg-black/10'
          }`}
          data-testid={`feedback-option-${idx}`}
        >
          {option}
        </button>
      ))}
    </div>
  );

  const renderOpenEnded = () => (
    <textarea
      value={textResponse}
      onChange={(e) => setTextResponse(e.target.value)}
      placeholder="Share your thoughts..."
      className={`w-full p-3 rounded-xl text-sm resize-none mb-4 ${
        isDark
          ? 'bg-white/5 text-white placeholder:text-white/30 border border-white/10'
          : 'bg-gray-50 text-gray-800 placeholder:text-gray-400 border border-gray-200'
      }`}
      rows={4}
      data-testid="feedback-open-ended-input"
    />
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-md rounded-3xl overflow-hidden ${
            isDark
              ? `bg-gradient-to-br ${colors.bg} backdrop-blur-xl border ${colors.border}`
              : 'bg-white border border-gray-200 shadow-2xl'
          }`}
          data-testid="feedback-survey-modal"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-black/5'}`}>
                  <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div>
                  <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Quick Check-in
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Help Flō learn your patterns
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-full transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="feedback-close"
              >
                <X className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-500'}`} />
              </button>
            </div>

            {/* Causal context section - shows insight, likely causes, and confidence */}
            {causalContext?.insightText && (
              <div className={`mb-4 p-4 rounded-2xl ${isDark ? 'bg-white/10' : 'bg-blue-50'}`}>
                {/* Confidence badge and recurring pattern indicator */}
                <div className="flex items-center gap-2 mb-2">
                  {causalContext.patternConfidence != null && causalContext.patternConfidence > 0.3 && (
                    <span 
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        causalContext.patternConfidence >= 0.7
                          ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                          : causalContext.patternConfidence >= 0.4
                            ? isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
                            : isDark ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-100 text-gray-600'
                      }`}
                      data-testid="confidence-badge"
                    >
                      {Math.round(causalContext.patternConfidence * 100)}% confidence
                    </span>
                  )}
                  {causalContext.isRecurringPattern && (
                    <span 
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'
                      }`}
                      data-testid="recurring-pattern-badge"
                    >
                      Recurring pattern
                      {causalContext.historicalMatchCount ? ` (${causalContext.historicalMatchCount}x)` : ''}
                    </span>
                  )}
                </div>
                <p className={`text-sm leading-relaxed mb-3 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  {causalContext.insightText}
                </p>
                {/* Likely causes as individual badges */}
                {causalContext.likelyCauses && causalContext.likelyCauses.length > 0 && (
                  <div className="mb-2">
                    <span className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Likely causes:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {causalContext.likelyCauses.map((cause, idx) => (
                        <span 
                          key={idx}
                          className={`text-xs px-2 py-1 rounded-lg ${
                            isDark ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'
                          }`}
                          data-testid={`cause-badge-${idx}`}
                        >
                          {cause}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* What's working as individual badges */}
                {causalContext.whatsWorking && causalContext.whatsWorking.length > 0 && (
                  <div>
                    <span className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      What's working:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {causalContext.whatsWorking.map((item, idx) => (
                        <span 
                          key={idx}
                          className={`text-xs px-2 py-1 rounded-lg ${
                            isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700'
                          }`}
                          data-testid={`working-badge-${idx}`}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className={`mb-6 p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-start gap-3">
                <MessageCircle className={`w-5 h-5 mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <p className={`text-base leading-relaxed ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  {question.questionText}
                </p>
              </div>
            </div>

            {question.questionType === 'scale_1_10' && renderScaleButtons()}
            {question.questionType === 'yes_no' && renderYesNoButtons()}
            {question.questionType === 'multiple_choice' && renderMultipleChoice()}
            {question.questionType === 'open_ended' && renderOpenEnded()}

            {question.questionType === 'scale_1_10' && (
              <div className={`flex justify-between text-xs mb-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                <span>Not at all</span>
                <span>Extremely</span>
              </div>
            )}

            {question.questionType !== 'open_ended' && (
              <textarea
                value={textResponse}
                onChange={(e) => setTextResponse(e.target.value)}
                placeholder="Add any details (optional)..."
                className={`w-full p-3 rounded-xl text-sm resize-none mb-4 ${
                  isDark
                    ? 'bg-white/5 text-white placeholder:text-white/30 border border-white/10'
                    : 'bg-gray-50 text-gray-800 placeholder:text-gray-400 border border-gray-200'
                }`}
                rows={2}
                data-testid="feedback-text-input"
              />
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={onClose}
                className={`flex-1 ${isDark ? 'text-white/60 hover:text-white' : ''}`}
                data-testid="feedback-skip"
              >
                Skip
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isSubmitEnabled() || submitFeedbackMutation.isPending}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                data-testid="feedback-submit"
              >
                {submitFeedbackMutation.isPending ? 'Sending...' : 'Submit'}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
