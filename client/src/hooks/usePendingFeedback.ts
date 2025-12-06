import { useState, useEffect, useCallback } from 'react';

export interface FeedbackQuestion {
  questionText: string;
  questionType: 'scale_1_10' | 'yes_no' | 'multiple_choice' | 'open_ended';
  options?: string[];
  triggerPattern: string;
  triggerMetrics: Record<string, { value: number; deviation: number }>;
  urgency: 'low' | 'medium' | 'high';
}

export interface PendingFeedback {
  feedbackId: string;
  question: FeedbackQuestion;
  createdAt: string;
}

const DISMISSED_FEEDBACK_KEY = 'flo-dismissed-feedback';
const FEEDBACK_COOLDOWN_KEY = 'flo-feedback-cooldown';
const COOLDOWN_HOURS = 24;

export function usePendingFeedback() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<PendingFeedback | null>(null);

  const getDismissedFeedbackIds = (): string[] => {
    try {
      const stored = localStorage.getItem(DISMISSED_FEEDBACK_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const checkCooldown = (): boolean => {
    try {
      const cooldownUntil = localStorage.getItem(FEEDBACK_COOLDOWN_KEY);
      if (cooldownUntil) {
        return new Date().getTime() < parseInt(cooldownUntil, 10);
      }
      return false;
    } catch {
      return false;
    }
  };

  const setCooldown = () => {
    const cooldownUntil = new Date().getTime() + COOLDOWN_HOURS * 60 * 60 * 1000;
    localStorage.setItem(FEEDBACK_COOLDOWN_KEY, cooldownUntil.toString());
  };

  const dismissFeedback = (feedbackId: string) => {
    try {
      const dismissed = getDismissedFeedbackIds();
      if (!dismissed.includes(feedbackId)) {
        dismissed.push(feedbackId);
        localStorage.setItem(DISMISSED_FEEDBACK_KEY, JSON.stringify(dismissed.slice(-50)));
      }
      setCooldown();
      setIsModalOpen(false);
      setCurrentFeedback(null);
    } catch {
      setIsModalOpen(false);
      setCurrentFeedback(null);
    }
  };

  const handleSubmit = () => {
    setCooldown();
    setIsModalOpen(false);
    setCurrentFeedback(null);
  };

  const showFeedbackModal = useCallback((feedback: PendingFeedback) => {
    if (checkCooldown()) return;
    
    const dismissed = getDismissedFeedbackIds();
    if (dismissed.includes(feedback.feedbackId)) return;

    setCurrentFeedback(feedback);
    setIsModalOpen(true);
  }, []);

  const closeFeedbackModal = useCallback(() => {
    if (currentFeedback) {
      dismissFeedback(currentFeedback.feedbackId);
    } else {
      setIsModalOpen(false);
    }
  }, [currentFeedback]);

  const triggerFromPushNotification = useCallback((data: {
    feedbackId: string;
    questionText: string;
    questionType: string;
    triggerPattern: string;
    options?: string[];
    urgency?: string;
  }) => {
    if (checkCooldown()) return;

    const dismissed = getDismissedFeedbackIds();
    if (dismissed.includes(data.feedbackId)) return;

    const feedback: PendingFeedback = {
      feedbackId: data.feedbackId,
      question: {
        questionText: data.questionText,
        questionType: data.questionType as FeedbackQuestion['questionType'],
        options: data.options,
        triggerPattern: data.triggerPattern,
        triggerMetrics: {},
        urgency: (data.urgency as FeedbackQuestion['urgency']) || 'medium',
      },
      createdAt: new Date().toISOString(),
    };

    setCurrentFeedback(feedback);
    setIsModalOpen(true);
  }, []);

  return {
    isModalOpen,
    currentFeedback,
    showFeedbackModal,
    closeFeedbackModal,
    handleSubmit,
    triggerFromPushNotification,
    isInCooldown: checkCooldown(),
  };
}
