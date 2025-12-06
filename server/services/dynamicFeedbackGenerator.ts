import { GoogleGenAI } from '@google/genai';
import { AnomalyResult } from './clickhouseBaselineEngine';
import { logger } from '../utils/logger';

const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

export interface GeneratedQuestion {
  questionText: string;
  questionType: 'scale_1_10' | 'yes_no' | 'multiple_choice' | 'open_ended';
  options?: string[];
  triggerPattern: string;
  triggerMetrics: Record<string, { value: number; deviation: number }>;
  urgency: 'low' | 'medium' | 'high';
  suggestedChannel: 'push' | 'in_app' | 'voice';
  focusMetric?: string;
  deliveryWindow?: 'morning' | 'midday' | 'evening';
}

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  hrv: 'heart rate variability',
  resting_heart_rate: 'resting heart rate',
  wrist_temperature_deviation: 'overnight wrist temperature',
  respiratory_rate: 'breathing rate',
  oxygen_saturation: 'blood oxygen',
  steps: 'daily steps',
  active_energy: 'active calories',
  sleep_duration: 'sleep duration',
  deep_sleep: 'deep sleep',
  rem_sleep: 'REM sleep',
  glucose: 'blood glucose',
};

export class DynamicFeedbackGenerator {
  async generateQuestion(
    anomalies: AnomalyResult[],
    userContext?: {
      recentLifeEvents?: string[];
      lastFeedbackHoursAgo?: number;
      preferredName?: string;
    }
  ): Promise<GeneratedQuestion | null> {
    if (anomalies.length === 0) {
      return null;
    }

    const hasPattern = anomalies.some(a => a.patternFingerprint);
    const maxSeverity = anomalies.reduce((max, a) => {
      const severityOrder = { low: 0, moderate: 1, high: 2 };
      return severityOrder[a.severity] > severityOrder[max] ? a.severity : max;
    }, 'low' as 'low' | 'moderate' | 'high');

    const metricsDescription = anomalies
      .map(a => {
        const name = METRIC_DISPLAY_NAMES[a.metricType] || a.metricType;
        const direction = a.direction === 'above' ? 'elevated' : 'lower than usual';
        const pct = Math.abs(Math.round(a.deviationPct));
        return `${name} is ${direction} (${pct}% from your baseline)`;
      })
      .join(', ');

    const patternContext = hasPattern
      ? anomalies.find(a => a.patternFingerprint)?.patternFingerprint
      : 'isolated_change';

    const prompt = `You are a health AI assistant generating a personalized check-in question for a user.

DETECTED CHANGES:
${metricsDescription}

PATTERN: ${patternContext === 'illness_precursor' ? 'Multiple metrics suggest possible early signs of illness' : patternContext === 'recovery_deficit' ? 'Metrics indicate potential recovery issues' : 'Individual metric deviation'}

SEVERITY: ${maxSeverity}

${userContext?.recentLifeEvents?.length ? `RECENT CONTEXT: ${userContext.recentLifeEvents.join(', ')}` : ''}
${userContext?.preferredName ? `USER NAME: ${userContext.preferredName}` : ''}

Generate a warm, non-alarming check-in question that:
1. References the specific metrics that changed (use plain language, not medical jargon)
2. Asks how they're feeling on a 1-10 scale
3. Is conversational and caring, not clinical
4. Does NOT diagnose or make medical claims
5. Is under 50 words

IMPORTANT: Do not use phrases like "I noticed" - instead use "Your data shows" or similar.

Respond with JSON only:
{
  "questionText": "The check-in question",
  "urgency": "low|medium|high",
  "suggestedFollowUp": "Optional follow-up if they rate low"
}`;

    try {
      const response = await genai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const text = response.text || '';
      const parsed = JSON.parse(text);

      const triggerMetrics: Record<string, { value: number; deviation: number }> = {};
      for (const a of anomalies) {
        triggerMetrics[a.metricType] = {
          value: a.currentValue,
          deviation: a.deviationPct,
        };
      }

      const question: GeneratedQuestion = {
        questionText: parsed.questionText,
        questionType: 'scale_1_10',
        triggerPattern: patternContext || 'unknown',
        triggerMetrics,
        urgency: parsed.urgency || maxSeverity === 'high' ? 'high' : maxSeverity === 'moderate' ? 'medium' : 'low',
        suggestedChannel: maxSeverity === 'high' ? 'push' : 'in_app',
      };

      logger.info('[FeedbackGenerator] Generated question', {
        pattern: patternContext,
        metricsCount: anomalies.length,
        urgency: question.urgency,
      });

      return question;
    } catch (error) {
      logger.error('[FeedbackGenerator] Failed to generate question', { error });

      return this.generateFallbackQuestion(anomalies);
    }
  }

  async generateMultipleQuestions(
    anomalies: AnomalyResult[],
    maxQuestions: number = 3,
    userContext?: {
      recentLifeEvents?: string[];
      lastFeedbackHoursAgo?: number;
      preferredName?: string;
    }
  ): Promise<GeneratedQuestion[]> {
    if (anomalies.length === 0) {
      return [];
    }

    const deliveryWindows: Array<'morning' | 'midday' | 'evening'> = ['morning', 'midday', 'evening'];
    const effectiveMaxQuestions = Math.min(maxQuestions, deliveryWindows.length);

    const sortedAnomalies = [...anomalies].sort((a, b) => {
      const severityOrder = { low: 0, moderate: 1, high: 2 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.modelConfidence - a.modelConfidence;
    });

    const topAnomalies = sortedAnomalies.slice(0, effectiveMaxQuestions);

    const fullContextDescription = anomalies
      .map(a => {
        const name = METRIC_DISPLAY_NAMES[a.metricType] || a.metricType;
        const direction = a.direction === 'above' ? 'elevated' : 'lower than usual';
        const pct = Math.abs(Math.round(a.deviationPct));
        return `${name}: ${direction} (${pct}% deviation, ${a.severity} severity)`;
      })
      .join('\n');

    const questions: GeneratedQuestion[] = [];

    try {
    for (let i = 0; i < topAnomalies.length; i++) {
      const focusAnomaly = topAnomalies[i];
      const focusMetricName = METRIC_DISPLAY_NAMES[focusAnomaly.metricType] || focusAnomaly.metricType;
      const focusDirection = focusAnomaly.direction === 'above' ? 'higher' : 'lower';
      const focusPct = Math.abs(Math.round(focusAnomaly.deviationPct));

      const prompt = `You are a health AI assistant generating a personalized check-in question for a user.

FOCUS METRIC (this question should specifically ask about):
${focusMetricName} is ${focusPct}% ${focusDirection} than the user's baseline

FULL CONTEXT (all detected changes for awareness):
${fullContextDescription}

${userContext?.recentLifeEvents?.length ? `RECENT USER CONTEXT: ${userContext.recentLifeEvents.join(', ')}` : ''}
${userContext?.preferredName ? `USER NAME: ${userContext.preferredName}` : ''}

Generate a warm, non-alarming check-in question that:
1. Specifically references ${focusMetricName} (the focus metric)
2. Asks how they're feeling on a 1-10 scale
3. Is conversational and caring, not clinical
4. Does NOT diagnose or make medical claims
5. Is under 50 words
6. Use "Your data shows" instead of "I noticed"

Respond with JSON only:
{
  "questionText": "The check-in question focused on ${focusMetricName}",
  "urgency": "low|medium|high"
}`;

      try {
        const response = await genai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        });

        const text = response.text || '';
        const parsed = JSON.parse(text);

        const triggerMetrics: Record<string, { value: number; deviation: number }> = {};
        for (const a of anomalies) {
          triggerMetrics[a.metricType] = {
            value: a.currentValue,
            deviation: a.deviationPct,
          };
        }

        const defaultUrgency = focusAnomaly.severity === 'high' ? 'high' : focusAnomaly.severity === 'moderate' ? 'medium' : 'low';
        const isValidUrgency = parsed.urgency === 'low' || parsed.urgency === 'medium' || parsed.urgency === 'high';
        const resolvedUrgency = isValidUrgency ? parsed.urgency : defaultUrgency;
        
        if (!isValidUrgency) {
          logger.debug('[FeedbackGenerator] Urgency fallback to severity-derived default', {
            focusMetric: focusAnomaly.metricType,
            parsedUrgency: parsed.urgency,
            defaultUrgency,
          });
        }

        questions.push({
          questionText: parsed.questionText,
          questionType: 'scale_1_10',
          triggerPattern: focusAnomaly.patternFingerprint || 'single_metric',
          triggerMetrics,
          urgency: resolvedUrgency,
          suggestedChannel: focusAnomaly.severity === 'high' ? 'push' : 'in_app',
          focusMetric: focusAnomaly.metricType,
          deliveryWindow: deliveryWindows[i],
        });

        logger.info('[FeedbackGenerator] Generated focused question', {
          focusMetric: focusAnomaly.metricType,
          deliveryWindow: deliveryWindows[i],
          index: i + 1,
          totalQuestions: topAnomalies.length,
        });
      } catch (error) {
        logger.error('[FeedbackGenerator] Failed to generate focused question', {
          focusMetric: focusAnomaly.metricType,
          error,
        });
        questions.push(this.generateFocusedFallbackQuestion(focusAnomaly, anomalies, deliveryWindows[i]));
      }
    }
    } catch (upstreamError) {
      logger.error('[FeedbackGenerator] Upstream failure in generateMultipleQuestions, using fallbacks for all', { upstreamError });
      for (let i = 0; i < topAnomalies.length; i++) {
        if (!questions.some(q => q.focusMetric === topAnomalies[i].metricType)) {
          questions.push(this.generateFocusedFallbackQuestion(topAnomalies[i], anomalies, deliveryWindows[i]));
        }
      }
    }

    return questions;
  }

  private generateFocusedFallbackQuestion(
    focusAnomaly: AnomalyResult,
    allAnomalies: AnomalyResult[],
    deliveryWindow: 'morning' | 'midday' | 'evening'
  ): GeneratedQuestion {
    const metricName = METRIC_DISPLAY_NAMES[focusAnomaly.metricType] || focusAnomaly.metricType;
    const direction = focusAnomaly.direction === 'above' ? 'higher' : 'lower';

    const triggerMetrics: Record<string, { value: number; deviation: number }> = {};
    for (const a of allAnomalies) {
      triggerMetrics[a.metricType] = {
        value: a.currentValue,
        deviation: a.deviationPct,
      };
    }

    return {
      questionText: `Your ${metricName} has been ${direction} than your usual baseline recently. On a scale of 1-10, how are you feeling right now?`,
      questionType: 'scale_1_10',
      triggerPattern: focusAnomaly.patternFingerprint || 'single_metric',
      triggerMetrics,
      urgency: focusAnomaly.severity === 'high' ? 'high' : focusAnomaly.severity === 'moderate' ? 'medium' : 'low',
      suggestedChannel: focusAnomaly.severity === 'high' ? 'push' : 'in_app',
      focusMetric: focusAnomaly.metricType,
      deliveryWindow,
    };
  }

  private generateFallbackQuestion(anomalies: AnomalyResult[]): GeneratedQuestion {
    const primaryAnomaly = anomalies.reduce((max, a) => {
      const severityOrder = { low: 0, moderate: 1, high: 2 };
      return severityOrder[a.severity] > severityOrder[max.severity] ? a : max;
    }, anomalies[0]);

    const metricName = METRIC_DISPLAY_NAMES[primaryAnomaly.metricType] || primaryAnomaly.metricType;
    const direction = primaryAnomaly.direction === 'above' ? 'higher' : 'lower';

    const triggerMetrics: Record<string, { value: number; deviation: number }> = {};
    for (const a of anomalies) {
      triggerMetrics[a.metricType] = {
        value: a.currentValue,
        deviation: a.deviationPct,
      };
    }

    return {
      questionText: `Your ${metricName} has been ${direction} than your usual baseline recently. On a scale of 1-10, how are you feeling right now?`,
      questionType: 'scale_1_10',
      triggerPattern: primaryAnomaly.patternFingerprint || 'single_metric',
      triggerMetrics,
      urgency: primaryAnomaly.severity === 'high' ? 'high' : primaryAnomaly.severity === 'moderate' ? 'medium' : 'low',
      suggestedChannel: primaryAnomaly.severity === 'high' ? 'push' : 'in_app',
    };
  }

  async generateVoicePrompt(question: GeneratedQuestion): Promise<string> {
    return `${question.questionText} You can say a number from 1 to 10, where 1 means you're feeling terrible and 10 means you're feeling fantastic.`;
  }

  parseVoiceResponse(transcript: string): { value: number | null; raw: string } {
    const numberWords: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };

    const lower = transcript.toLowerCase();

    for (const [word, num] of Object.entries(numberWords)) {
      if (lower.includes(word)) {
        return { value: num, raw: transcript };
      }
    }

    const match = lower.match(/\b([1-9]|10)\b/);
    if (match) {
      return { value: parseInt(match[1], 10), raw: transcript };
    }

    return { value: null, raw: transcript };
  }
}

export const dynamicFeedbackGenerator = new DynamicFeedbackGenerator();
