import { GoogleGenAI } from '@google/genai';
import { AnomalyResult } from './clickhouseBaselineEngine';
import { logger } from '../utils/logger';
import { db } from '../db';
import { lifeEvents, userDailyMetrics, sleepNights } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { behaviorAttributionEngine } from './behaviorAttributionEngine';

const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

// Interface for behavioral context around an anomaly
interface BehavioralContext {
  recentLifeEvents: Array<{
    eventType: string;
    description: string;
    happenedAt: Date;
  }>;
  recentActivity: {
    avgSteps: number;
    avgActiveEnergy: number;
    avgExerciseMinutes: number;
    daysWithData: number;
  } | null;
  recentSleep: {
    avgDuration: number;
    avgDeepSleep: number;
    avgRemSleep: number;
    daysWithData: number;
  } | null;
}

// ML-computed attribution data for smarter insights
interface MLAttribution {
  rankedCauses: Array<{
    category: string;
    key: string;
    description: string;
    deviation: number;
    contribution: 'high' | 'medium' | 'low';
  }>;
  historicalPattern: {
    matchCount: number;
    totalHistoryMonths: number;
    isRecurringPattern: boolean;
    patternDescription: string;
    confidence: number;
  } | null;
  positivePatterns: Array<{
    description: string;
    occurrenceCount: number;
    outcomeImprovement: number;
  }>;
}

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
  // Core vitals
  hrv: 'heart rate variability',
  resting_heart_rate: 'resting heart rate',
  wrist_temperature_deviation: 'overnight wrist temperature',
  respiratory_rate: 'breathing rate',
  oxygen_saturation: 'blood oxygen',
  body_temperature: 'body temperature',
  walking_heart_rate: 'walking heart rate',
  // Activity
  steps: 'daily steps',
  active_energy: 'active calories',
  exercise_minutes: 'exercise time',
  stand_hours: 'stand hours',
  flights_climbed: 'flights climbed',
  distance_walking_running: 'walking/running distance',
  distance_cycling: 'cycling distance',
  basal_energy: 'basal energy',
  vo2_max: 'VO2 max',
  // Sleep
  sleep_duration: 'sleep duration',
  deep_sleep: 'deep sleep',
  rem_sleep: 'REM sleep',
  core_sleep: 'core sleep',
  sleep_efficiency: 'sleep efficiency',
  sleep_fragmentation: 'sleep fragmentation',
  sleep_hrv: 'overnight HRV',
  waso: 'wake after sleep onset',
  // Blood sugar
  glucose: 'blood glucose',
  cgm_glucose: 'glucose level',
  cgm_variability: 'glucose variability',
  time_in_range: 'time in target range',
  // Body composition
  weight: 'body weight',
  body_fat_percentage: 'body fat',
  lean_body_mass: 'lean mass',
  bmi: 'BMI',
  waist_circumference: 'waist circumference',
  // Gait & mobility
  walking_speed: 'walking speed',
  walking_step_length: 'step length',
  walking_double_support: 'double support time',
  walking_asymmetry: 'walking asymmetry',
  walking_steadiness: 'walking steadiness',
  six_minute_walk_distance: 'six-minute walk distance',
  stair_ascent_speed: 'stair climbing speed',
  stair_descent_speed: 'stair descent speed',
  // Nutrition
  calories: 'calorie intake',
  protein: 'protein intake',
  carbohydrates: 'carb intake',
  fat_total: 'fat intake',
  fiber: 'fiber intake',
  sugar: 'sugar intake',
  sodium: 'sodium intake',
  caffeine: 'caffeine intake',
  water: 'water intake',
  // Recovery & wellness
  mindfulness_minutes: 'mindfulness time',
  readiness_score: 'readiness score',
  recovery_score: 'recovery score',
  energy_level: 'energy level',
  mental_clarity: 'mental clarity',
  mood: 'mood',
  stress_level: 'stress level',
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

        // Validate that questionText exists and is a non-empty string
        if (!parsed.questionText || typeof parsed.questionText !== 'string' || parsed.questionText.trim().length === 0) {
          logger.warn('[FeedbackGenerator] Invalid questionText from Gemini, using fallback', {
            focusMetric: focusAnomaly.metricType,
            parsed,
          });
          questions.push(this.generateFocusedFallbackQuestion(focusAnomaly, anomalies, deliveryWindows[i]));
          continue;
        }

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
          questionText: parsed.questionText.trim(),
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

  /**
   * Gather ML-computed attribution data for an anomaly.
   * Searches full history (years if available) to find causal patterns.
   */
  async gatherMLAttribution(
    healthId: string,
    anomaly: AnomalyResult,
    anomalyDate: string
  ): Promise<MLAttribution> {
    try {
      // First, ensure behavior factors are synced for this date
      // This pulls nutrition, workouts, recovery, etc. from Supabase into ClickHouse
      try {
        await behaviorAttributionEngine.syncDailyBehaviorFactors(healthId, anomalyDate);
      } catch (syncError) {
        logger.warn('[FeedbackGenerator] Failed to sync behavior factors, continuing with existing data', { syncError });
      }
      
      // Get attributed factors from the day of the anomaly
      const attributedFactors = await behaviorAttributionEngine.findAttributedFactors(
        healthId,
        anomalyDate,
        anomaly.metricType,
        anomaly.deviationPct
      );

      const rankedCauses = attributedFactors.map(f => ({
        category: f.category,
        key: f.key,
        description: this.formatFactorDescription(f.category, f.key),
        deviation: f.deviation,
        contribution: f.contribution,
      }));

      // Search full history for pattern matches
      let historicalPattern = null;
      if (rankedCauses.length > 0) {
        const notableBehaviors = rankedCauses.slice(0, 3).map(c => ({
          category: c.category,
          key: c.key,
          direction: (c.deviation > 0 ? 'above' : 'below') as 'above' | 'below',
        }));

        const patternMatch = await behaviorAttributionEngine.findHistoricalPatternMatches(
          healthId,
          anomalyDate,
          anomaly.metricType,
          anomaly.direction,
          notableBehaviors
        );

        if (patternMatch.matchCount > 0) {
          historicalPattern = {
            matchCount: patternMatch.matchCount,
            totalHistoryMonths: patternMatch.totalHistoryMonths,
            isRecurringPattern: patternMatch.isRecurringPattern,
            patternDescription: patternMatch.patternDescription,
            confidence: patternMatch.patternConfidence,
          };
        }
      }

      // Find positive patterns for this metric (what's working)
      const positiveResult = await behaviorAttributionEngine.findPositivePatterns(
        healthId,
        anomaly.metricType,
        24 // Look back 24 months
      );

      const positivePatterns = positiveResult.patterns.slice(0, 3).map(p => ({
        description: p.behaviors.map(b => b.description).join(' + '),
        occurrenceCount: p.occurrenceCount,
        outcomeImprovement: p.outcomeImprovement,
      }));

      return { rankedCauses, historicalPattern, positivePatterns };
    } catch (error) {
      logger.error('[FeedbackGenerator] Error gathering ML attribution', { error, healthId });
      return { rankedCauses: [], historicalPattern: null, positivePatterns: [] };
    }
  }

  /**
   * Generate a smart insight with causal analysis using ML data + AI formatting.
   * The ML layer computes causes, AI layer formats the narrative.
   */
  async generateSmartInsight(
    healthId: string,
    anomaly: AnomalyResult,
    anomalyDate: string,
    userContext?: { preferredName?: string }
  ): Promise<{
    insightText: string;
    likelyCauses: string[];
    whatsWorking: string[];
    confidence: number;
    isRecurringPattern: boolean;
    questionText: string;
  } | null> {
    try {
      logger.info('[FeedbackGenerator] Starting generateSmartInsight', { 
        healthId, 
        metricType: anomaly.metricType,
        deviationPct: anomaly.deviationPct,
        anomalyDate 
      });
      
      const mlAttribution = await this.gatherMLAttribution(healthId, anomaly, anomalyDate);
      
      logger.info('[FeedbackGenerator] ML attribution gathered', {
        rankedCausesCount: mlAttribution.rankedCauses.length,
        hasHistoricalPattern: !!mlAttribution.historicalPattern,
        positivePatternsCount: mlAttribution.positivePatterns.length,
      });
      
      const metricName = METRIC_DISPLAY_NAMES[anomaly.metricType] || anomaly.metricType;
      const direction = anomaly.direction === 'above' ? 'higher' : 'lower';
      const pct = Math.abs(Math.round(anomaly.deviationPct));

      // Build the AI prompt with ML-computed data
      const causesSection = mlAttribution.rankedCauses.length > 0
        ? `LIKELY CAUSES (ML-computed, do not invent new ones):\n${mlAttribution.rankedCauses.map((c, i) => 
            `${i + 1}. ${c.description}: ${Math.abs(Math.round(c.deviation))}% ${c.deviation > 0 ? 'higher' : 'lower'} than usual (${c.contribution} contribution)`
          ).join('\n')}`
        : 'LIKELY CAUSES: None identified yet - need more data.';

      const historySection = mlAttribution.historicalPattern
        ? `HISTORICAL PATTERN (ML-computed):\n${mlAttribution.historicalPattern.patternDescription}\nThis pattern has occurred ${mlAttribution.historicalPattern.matchCount} times over ${mlAttribution.historicalPattern.totalHistoryMonths} months.\nConfidence: ${Math.round(mlAttribution.historicalPattern.confidence * 100)}%`
        : 'HISTORICAL PATTERN: First time seeing this exact combination.';

      const positiveSection = mlAttribution.positivePatterns.length > 0
        ? `WHAT'S WORKING FOR THIS METRIC (positive patterns to reinforce):\n${mlAttribution.positivePatterns.map(p => 
            `- ${p.description}: appeared ${p.occurrenceCount} times when ${metricName} was good`
          ).join('\n')}`
        : '';

      const prompt = `You are a health AI assistant creating a personalized insight for a user.

DETECTED CHANGE:
${metricName} is ${pct}% ${direction} than the user's baseline

${causesSection}

${historySection}

${positiveSection}

${userContext?.preferredName ? `USER NAME: ${userContext.preferredName}` : ''}

Generate a warm, insightful message that:
1. Summarizes the detected change in plain language
2. References the ML-computed likely causes (do NOT invent causes not in the list)
3. If this is a recurring pattern, mention that for credibility ("This has happened X times before when...")
4. If there are positive patterns, highlight what's working so they can keep doing it
5. End with asking how they feel on a 1-10 scale
6. Be conversational and caring, not clinical
7. Under 100 words total
8. Use "Your data shows" instead of "I noticed"

Respond with JSON only:
{
  "insightText": "The main insight message",
  "questionText": "The 1-10 feeling question",
  "highlightedCauses": ["cause 1", "cause 2"],
  "reinforcementMessage": "Optional: What's working that they should keep doing"
}`;

      const response = await genai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.6,
        },
      });

      const text = response.text || '';
      const parsed = JSON.parse(text);

      // Deduplicate causes - ML might return same factor multiple times
      const uniqueCauses = [...new Set(mlAttribution.rankedCauses.map(c => c.description))].slice(0, 3);
      const whatsWorking = [...new Set(mlAttribution.positivePatterns.map(p => p.description))];

      return {
        insightText: parsed.insightText || '',
        likelyCauses: uniqueCauses,
        whatsWorking,
        confidence: mlAttribution.historicalPattern?.confidence || 0.3,
        isRecurringPattern: mlAttribution.historicalPattern?.isRecurringPattern || false,
        questionText: parsed.questionText || `On a scale of 1-10, how are you feeling right now?`,
      };
    } catch (error) {
      logger.error('[FeedbackGenerator] Error generating smart insight', { error });
      return null;
    }
  }

  private formatFactorDescription(category: string, key: string): string {
    const keyLabels: Record<string, string> = {
      'total_calories': 'calorie intake',
      'protein_g': 'protein intake',
      'last_meal_time': 'dinner timing',
      'caffeine_mg': 'caffeine',
      'alcohol_g': 'alcohol',
      'total_duration_min': 'workout duration',
      'first_workout_time': 'workout timing',
      'mindfulness_min': 'mindfulness practice',
      'sauna': 'sauna session',
      'ice_bath': 'ice bath',
      'cold_plunge': 'cold plunge',
      'bedtime': 'bedtime',
      'aqi': 'air quality',
      'temperature_c': 'temperature',
      'avg_glucose_mg_dl': 'blood glucose',
    };
    return keyLabels[key] || key.replace(/_/g, ' ');
  }
}

export const dynamicFeedbackGenerator = new DynamicFeedbackGenerator();
