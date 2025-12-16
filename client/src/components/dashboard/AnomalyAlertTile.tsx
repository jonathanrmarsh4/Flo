import { AlertTriangle, TrendingUp, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/lib/utils";

interface AnomalyAlertTileProps {
  isDark: boolean;
}

interface AnomalyAlert {
  feedbackId: string;
  questionText: string;
  questionType: 'scale_1_10' | 'yes_no' | 'multiple_choice' | 'open_ended';
  options?: string[];
  triggerPattern: string;
  triggerMetrics: Record<string, { value: number; deviation: number }>;
  urgency: 'low' | 'medium' | 'high';
  createdAt: string;
  expiresAt: string;
}

interface PendingAlertsResponse {
  alerts: AnomalyAlert[];
}

export function AnomalyAlertTile({ isDark }: AnomalyAlertTileProps) {
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [selectedBoolean, setSelectedBoolean] = useState<boolean | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [textResponse, setTextResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const { data: alertsData, isLoading } = useQuery<PendingAlertsResponse>({
    queryKey: ['/api/anomaly-alerts/pending'],
    refetchInterval: 60000,
  });

  const submitFeedback = useMutation({
    mutationFn: async ({ 
      feedbackId, 
      responseValue, 
      responseBoolean, 
      responseOptionIndex, 
      responseText 
    }: { 
      feedbackId: string; 
      responseValue?: number; 
      responseBoolean?: boolean; 
      responseOptionIndex?: number; 
      responseText?: string;
    }) => {
      return await apiRequest('POST', '/api/correlation/feedback', {
        feedbackId,
        responseValue,
        responseBoolean,
        responseOptionIndex,
        responseText,
        channel: 'in_app',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anomaly-alerts/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/insights'] });
      toast({
        title: "Response saved",
        description: "Your feedback helps improve health pattern detection.",
      });
      setSelectedValue(null);
      setSelectedBoolean(null);
      setSelectedOptionIndex(null);
      setTextResponse('');
      setIsSubmitting(false);
    },
    onError: (err: Error) => {
      const parsed = parseApiError(err);
      toast({
        title: "Couldn't Submit",
        description: (
          <div>
            <p>{parsed.message}</p>
            <p className="text-xs opacity-60 mt-1">Error: {parsed.code}</p>
          </div>
        ),
        variant: "destructive",
      });
      setIsSubmitting(false);
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const currentAlert = alertsData?.alerts?.[0];
  const currentFeedbackId = currentAlert?.feedbackId;

  useEffect(() => {
    setSelectedValue(null);
    setSelectedBoolean(null);
    setSelectedOptionIndex(null);
    setTextResponse('');
    setIsSubmitting(false);
  }, [currentFeedbackId]);

  if (isLoading || !currentAlert) {
    return null;
  }

  const getPatternInfo = (pattern: string) => {
    if (pattern === 'illness_precursor') {
      return {
        icon: AlertTriangle,
        label: 'Possible illness pattern',
        bgColor: isDark ? 'bg-amber-500/10' : 'bg-amber-50',
        borderColor: isDark ? 'border-amber-500/30' : 'border-amber-200',
        iconColor: 'text-amber-500',
        accentColor: 'amber',
      };
    }
    if (pattern === 'recovery_deficit') {
      return {
        icon: Heart,
        label: 'Recovery concern',
        bgColor: isDark ? 'bg-rose-500/10' : 'bg-rose-50',
        borderColor: isDark ? 'border-rose-500/30' : 'border-rose-200',
        iconColor: 'text-rose-500',
        accentColor: 'rose',
      };
    }
    return {
      icon: TrendingUp,
      label: 'Health pattern detected',
      bgColor: isDark ? 'bg-cyan-500/10' : 'bg-cyan-50',
      borderColor: isDark ? 'border-cyan-500/30' : 'border-cyan-200',
      iconColor: 'text-cyan-500',
      accentColor: 'cyan',
    };
  };

  const patternInfo = getPatternInfo(currentAlert.triggerPattern);
  const Icon = patternInfo.icon;

  const handleSubmit = () => {
    setIsSubmitting(true);
    const params: {
      feedbackId: string;
      responseValue?: number;
      responseBoolean?: boolean;
      responseOptionIndex?: number;
      responseText?: string;
    } = { feedbackId: currentAlert.feedbackId };

    if (currentAlert.questionType === 'scale_1_10' && selectedValue !== null) {
      params.responseValue = selectedValue;
    } else if (currentAlert.questionType === 'yes_no' && selectedBoolean !== null) {
      params.responseBoolean = selectedBoolean;
    } else if (currentAlert.questionType === 'multiple_choice' && selectedOptionIndex !== null) {
      params.responseOptionIndex = selectedOptionIndex;
    } else if (currentAlert.questionType === 'open_ended' && textResponse.trim()) {
      params.responseText = textResponse.trim();
    } else {
      setIsSubmitting(false);
      return;
    }

    submitFeedback.mutate(params);
  };

  const isSubmitDisabled = () => {
    if (isSubmitting) return true;
    if (currentAlert.questionType === 'scale_1_10') return selectedValue === null;
    if (currentAlert.questionType === 'yes_no') return selectedBoolean === null;
    if (currentAlert.questionType === 'multiple_choice') return selectedOptionIndex === null;
    if (currentAlert.questionType === 'open_ended') return !textResponse.trim();
    return true;
  };

  const getUrgencyBadge = (urgency: string) => {
    if (urgency === 'high') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/20 text-red-500">
          Urgent
        </span>
      );
    }
    if (urgency === 'medium') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-500">
          Check-in
        </span>
      );
    }
    return null;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        transition={{ duration: 0.3 }}
        className={`rounded-2xl border p-4 mb-4 ${patternInfo.bgColor} ${patternInfo.borderColor}`}
        data-testid="tile-anomaly-alert"
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl ${isDark ? 'bg-white/10' : 'bg-white/80'}`}>
            <Icon className={`w-5 h-5 ${patternInfo.iconColor}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-medium tracking-wide ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                {patternInfo.label.toUpperCase()}
              </span>
              {getUrgencyBadge(currentAlert.urgency)}
            </div>
            
            <p className={`text-sm leading-relaxed mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {currentAlert.questionText}
            </p>

            {currentAlert.questionType === 'scale_1_10' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                      key={num}
                      onClick={() => setSelectedValue(num)}
                      disabled={isSubmitting}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                        selectedValue === num
                          ? isDark
                            ? 'bg-cyan-500 text-white'
                            : 'bg-cyan-600 text-white'
                          : isDark
                            ? 'bg-white/10 text-white/70 hover:bg-white/20'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                      } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      data-testid={`button-scale-${num}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs">
                  <span className={isDark ? 'text-white/40' : 'text-gray-400'}>Terrible</span>
                  <span className={isDark ? 'text-white/40' : 'text-gray-400'}>Fantastic</span>
                </div>
                
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled()}
                  className="w-full"
                  size="sm"
                  data-testid="button-submit-response"
                >
                  {isSubmitting ? 'Saving...' : 'Submit Response'}
                </Button>
              </div>
            )}

            {currentAlert.questionType === 'yes_no' && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedBoolean(true)}
                    disabled={isSubmitting}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                      selectedBoolean === true
                        ? isDark
                          ? 'bg-green-500 text-white'
                          : 'bg-green-600 text-white'
                        : isDark
                          ? 'bg-white/10 text-white/70 hover:bg-white/20'
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    data-testid="button-yes"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setSelectedBoolean(false)}
                    disabled={isSubmitting}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                      selectedBoolean === false
                        ? isDark
                          ? 'bg-rose-500 text-white'
                          : 'bg-rose-600 text-white'
                        : isDark
                          ? 'bg-white/10 text-white/70 hover:bg-white/20'
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    data-testid="button-no"
                  >
                    No
                  </button>
                </div>
                
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled()}
                  className="w-full"
                  size="sm"
                  data-testid="button-submit-response"
                >
                  {isSubmitting ? 'Saving...' : 'Submit Response'}
                </Button>
              </div>
            )}

            {currentAlert.questionType === 'multiple_choice' && currentAlert.options && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2">
                  {currentAlert.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedOptionIndex(index)}
                      disabled={isSubmitting}
                      className={`py-3 px-4 rounded-xl text-sm font-medium text-left transition-all ${
                        selectedOptionIndex === index
                          ? isDark
                            ? 'bg-cyan-500 text-white'
                            : 'bg-cyan-600 text-white'
                          : isDark
                            ? 'bg-white/10 text-white/70 hover:bg-white/20'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                      } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      data-testid={`button-option-${index}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled()}
                  className="w-full"
                  size="sm"
                  data-testid="button-submit-response"
                >
                  {isSubmitting ? 'Saving...' : 'Submit Response'}
                </Button>
              </div>
            )}

            {currentAlert.questionType === 'open_ended' && (
              <div className="space-y-3">
                <Textarea
                  value={textResponse}
                  onChange={(e) => setTextResponse(e.target.value)}
                  placeholder="Share your thoughts..."
                  disabled={isSubmitting}
                  className={`min-h-[80px] resize-none ${
                    isDark
                      ? 'bg-white/10 border-white/20 text-white placeholder:text-white/40'
                      : 'bg-white border-gray-200'
                  }`}
                  data-testid="input-open-ended"
                />
                
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled()}
                  className="w-full"
                  size="sm"
                  data-testid="button-submit-response"
                >
                  {isSubmitting ? 'Saving...' : 'Submit Response'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
