import { GoogleGenAI } from '@google/genai';
import { AnomalyResult } from './causalAnalysisService';
import { logger } from '../utils/logger';
import { db } from '../db';
import { lifeEvents, userDailyMetrics, sleepNights } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { behaviorAttributionEngine } from './behaviorAttributionEngine';
import { getMetricHealthContext, getClassificationLabel } from './healthContextKnowledge';
import { causalAnalysisService, CausalContext } from './causalAnalysisService';

const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

// Temperature deviation metrics use absolute °C values, not percentages
const TEMPERATURE_DEVIATION_METRICS = new Set([
  'wrist_temperature_deviation',
  'wrist_temp_deviation_c',
  'skin_temp_deviation_c',
  'skin_temp_trend_deviation_c',
  'body_temperature_deviation',
]);

// Helper function to format deviation values appropriately
// Temperature metrics store °C deviation, others store percentage deviation
function formatDeviationDisplay(metricType: string, deviationPct: number): string {
  if (TEMPERATURE_DEVIATION_METRICS.has(metricType)) {
    return `${Math.abs(deviationPct).toFixed(1)}°C`;
  }
  return `${Math.abs(Math.round(deviationPct))}%`;
}

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
    behaviorKeys?: string[];  // Canonical keys for deduplication against causes
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
        const deviationStr = formatDeviationDisplay(a.metricType, a.deviationPct);
        return `${name} is ${direction} (${deviationStr} from your baseline)`;
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
        const deviationStr = formatDeviationDisplay(a.metricType, a.deviationPct);
        return `${name}: ${direction} (${deviationStr} deviation, ${a.severity} severity)`;
      })
      .join('\n');

    const questions: GeneratedQuestion[] = [];

    try {
    for (let i = 0; i < topAnomalies.length; i++) {
      const focusAnomaly = topAnomalies[i];
      const focusMetricName = METRIC_DISPLAY_NAMES[focusAnomaly.metricType] || focusAnomaly.metricType;
      const focusDirection = focusAnomaly.direction === 'above' ? 'higher' : 'lower';
      const focusDeviationStr = formatDeviationDisplay(focusAnomaly.metricType, focusAnomaly.deviationPct);

      const prompt = `You are a health AI assistant generating a personalized check-in question for a user.

FOCUS METRIC (this question should specifically ask about):
${focusMetricName} is ${focusDeviationStr} ${focusDirection} than the user's baseline

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

  /**
   * Generate check-in questions enriched with causal analysis.
   * This version includes potential causes for the anomaly and actionable recommendations.
   * 
   * Example output: "Your deep sleep improved by 25%. This could be from your earlier bedtime 
   * or the magnesium you took before bed. Keep it up! How are you feeling (1-10)?"
   */
  async generateQuestionsWithCausalContext(
    userId: string,
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
    const questions: GeneratedQuestion[] = [];

    try {
      for (let i = 0; i < topAnomalies.length; i++) {
        const focusAnomaly = topAnomalies[i];
        const focusMetricName = METRIC_DISPLAY_NAMES[focusAnomaly.metricType] || focusAnomaly.metricType;
        const focusDirection = focusAnomaly.direction === 'above' ? 'improved' : 'decreased';
        const focusDeviationStr = formatDeviationDisplay(focusAnomaly.metricType, focusAnomaly.deviationPct);
        
        // Determine if this is a positive change (improvement)
        const isImprovement = this.isPositiveChange(focusAnomaly);

        // Get causal context SPECIFIC to this anomaly's metric
        // This ensures each question references causes relevant to its focus metric
        const causalContext = await causalAnalysisService.analyzeAnomalyCauses(userId, focusAnomaly);
        
        logger.info('[FeedbackGenerator] Gathered causal context for metric', {
          focusMetric: focusAnomaly.metricType,
          experimentsCount: causalContext.activeExperiments.length,
          behaviorsCount: causalContext.notableBehaviors.length,
          patternsCount: causalContext.positivePatterns.length,
        });

        // Build causal context section for prompt
        const causalSection = this.buildCausalPromptSection(causalContext, isImprovement);

        const prompt = `You are a health AI assistant generating a personalized check-in question that includes CAUSAL INSIGHT.

DETECTED CHANGE:
${focusMetricName} ${focusDirection} by ${focusDeviationStr} from baseline
Change type: ${isImprovement ? 'POSITIVE IMPROVEMENT' : 'DECLINE/CONCERN'}

${causalSection}

${userContext?.preferredName ? `USER NAME: ${userContext.preferredName}` : ''}

Generate a check-in question that:
1. States the specific change (e.g., "Your deep sleep improved by 25%")
2. ${isImprovement ? 'Mentions 1-2 likely causes from the causal context above' : 'Acknowledges the change without alarming'}
3. ${isImprovement ? 'Encourages them to keep doing what\'s working' : 'Asks how they\'re feeling'}
4. Ends with asking how they feel on a 1-10 scale
5. Is warm and conversational, under 60 words
6. Uses "Your data shows" instead of "I noticed"

${isImprovement && causalContext.recommendations.length > 0 ? `
IMPORTANT FOR IMPROVEMENTS: Include a brief cause suggestion like:
- "This could be from [cause1] or [cause2]"
- "Your [behavior] may be helping"
- "Keep up the [recommendation]!"
` : ''}

Respond with JSON only:
{
  "questionText": "The check-in question with causal insight",
  "urgency": "low|medium|high",
  "causalInsight": "Brief summary of likely cause (1 sentence)"
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

          logger.info('[FeedbackGenerator] Generated causal-enriched question', {
            focusMetric: focusAnomaly.metricType,
            isImprovement,
            hasCausalInsight: !!parsed.causalInsight,
            deliveryWindow: deliveryWindows[i],
          });
        } catch (error) {
          logger.error('[FeedbackGenerator] Failed to generate causal question', {
            focusMetric: focusAnomaly.metricType,
            error,
          });
          // Fall back to enriched fallback with causal context
          questions.push(this.generateCausalFallbackQuestion(focusAnomaly, anomalies, deliveryWindows[i], causalContext));
        }
      }
    } catch (upstreamError) {
      logger.error('[FeedbackGenerator] Upstream failure in generateQuestionsWithCausalContext', { upstreamError });
      for (let i = 0; i < topAnomalies.length; i++) {
        if (!questions.some(q => q.focusMetric === topAnomalies[i].metricType)) {
          questions.push(this.generateFocusedFallbackQuestion(topAnomalies[i], anomalies, deliveryWindows[i]));
        }
      }
    }

    return questions;
  }

  /**
   * Build the causal context section for the AI prompt
   */
  private buildCausalPromptSection(causalContext: CausalContext, isImprovement: boolean): string {
    const sections: string[] = [];

    // Active experiments
    if (causalContext.activeExperiments.length > 0) {
      const expList = causalContext.activeExperiments
        .map(e => `${e.productName} (day ${e.daysIntoExperiment} of experiment)`)
        .join(', ');
      sections.push(`ACTIVE EXPERIMENTS: ${expList}`);
    }

    // Notable recent behaviors
    if (causalContext.notableBehaviors.length > 0) {
      const behaviorList = causalContext.notableBehaviors.slice(0, 4).map(b => {
        const dir = b.deviation > 0 ? 'higher' : 'lower';
        return `${b.description} (${Math.abs(Math.round(b.deviation))}% ${dir} than usual)`;
      }).join(', ');
      sections.push(`RECENT NOTABLE BEHAVIORS: ${behaviorList}`);
    }

    // Positive patterns (only for improvements)
    if (isImprovement && causalContext.positivePatterns.length > 0) {
      const patternList = causalContext.positivePatterns.slice(0, 3).map(p => 
        `${p.description} (seen ${p.occurrenceCount} times before improvements)`
      ).join(', ');
      sections.push(`HISTORICALLY ASSOCIATED WITH IMPROVEMENT: ${patternList}`);
    }

    // Recommendations
    if (causalContext.recommendations.length > 0) {
      sections.push(`RECOMMENDATIONS: ${causalContext.recommendations.join(', ')}`);
    }

    if (sections.length === 0) {
      return 'CAUSAL CONTEXT: No specific causes identified yet. Keep the response simple.';
    }

    return 'CAUSAL CONTEXT:\n' + sections.join('\n');
  }

  /**
   * Determine if an anomaly represents a positive change (improvement)
   */
  private isPositiveChange(anomaly: AnomalyResult): boolean {
    // Metrics where LOWER is better
    const lowerIsBetter = [
      'resting_heart_rate', 'rhr_bpm', 'respiratory_rate', 'respiratory_rate_bpm',
      'blood_glucose', 'cgm_glucose', 'glucose', 'stress_level',
      'wrist_temperature_deviation', 'body_temperature', 'sleep_latency',
      'waso', 'awake_duration', 'sleep_fragmentation',
    ];
    
    // Metrics where HIGHER is better
    const higherIsBetter = [
      'hrv', 'hrv_ms', 'hrv_rmssd', 'deep_sleep', 'rem_sleep', 'sleep_duration',
      'deep_sleep_pct', 'rem_pct', 'sleep_efficiency', 'vo2_max',
      'steps', 'active_energy', 'exercise_minutes', 'stand_hours',
      'readiness_score', 'recovery_score', 'energy_level', 'time_in_range',
    ];
    
    const metricLower = anomaly.metricType.toLowerCase();
    
    if (lowerIsBetter.some(m => metricLower.includes(m))) {
      return anomaly.direction === 'below';
    }
    
    if (higherIsBetter.some(m => metricLower.includes(m))) {
      return anomaly.direction === 'above';
    }
    
    // Default: above is improvement
    return anomaly.direction === 'above';
  }

  /**
   * Generate fallback question with causal context when AI generation fails
   */
  private generateCausalFallbackQuestion(
    focusAnomaly: AnomalyResult,
    allAnomalies: AnomalyResult[],
    deliveryWindow: 'morning' | 'midday' | 'evening',
    causalContext: CausalContext
  ): GeneratedQuestion {
    const metricName = METRIC_DISPLAY_NAMES[focusAnomaly.metricType] || focusAnomaly.metricType;
    const isImprovement = this.isPositiveChange(focusAnomaly);
    const direction = isImprovement ? 'improved' : 'been lower';
    const deviationStr = formatDeviationDisplay(focusAnomaly.metricType, focusAnomaly.deviationPct);

    // Build causal phrase if we have context
    let causalPhrase = '';
    if (isImprovement) {
      if (causalContext.activeExperiments.length > 0) {
        causalPhrase = ` This could be related to your ${causalContext.activeExperiments[0].productName} experiment.`;
      } else if (causalContext.notableBehaviors.length > 0) {
        causalPhrase = ` Your ${causalContext.notableBehaviors[0].description} may be helping.`;
      } else if (causalContext.positivePatterns.length > 0) {
        causalPhrase = ` Keep doing what's working!`;
      }
    }

    const triggerMetrics: Record<string, { value: number; deviation: number }> = {};
    for (const a of allAnomalies) {
      triggerMetrics[a.metricType] = {
        value: a.currentValue,
        deviation: a.deviationPct,
      };
    }

    return {
      questionText: `Your ${metricName} has ${direction} by ${deviationStr} from your baseline.${causalPhrase} On a scale of 1-10, how are you feeling?`,
      questionType: 'scale_1_10',
      triggerPattern: focusAnomaly.patternFingerprint || 'single_metric',
      triggerMetrics,
      urgency: focusAnomaly.severity === 'high' ? 'high' : focusAnomaly.severity === 'moderate' ? 'medium' : 'low',
      suggestedChannel: focusAnomaly.severity === 'high' ? 'push' : 'in_app',
      focusMetric: focusAnomaly.metricType,
      deliveryWindow,
    };
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
   * For sleep metrics, uses PREVIOUS day's behaviors since sleep is influenced by pre-bedtime activities.
   */
  async gatherMLAttribution(
    healthId: string,
    anomaly: AnomalyResult,
    anomalyDate: string
  ): Promise<MLAttribution> {
    try {
      // Sleep metrics are influenced by PREVIOUS day's behaviors (what you did before bed)
      const sleepMetrics = ['rem_sleep', 'deep_sleep', 'sleep_duration', 'deep_sleep_pct', 
                           'sleep_efficiency', 'rem_pct', 'awake_duration', 'sleep_latency'];
      const isSleepMetric = sleepMetrics.some(m => anomaly.metricType.toLowerCase().includes(m.toLowerCase()));
      
      // For sleep metrics, look at previous day's behaviors
      let behaviorDate = anomalyDate;
      if (isSleepMetric) {
        const prevDate = new Date(anomalyDate);
        prevDate.setDate(prevDate.getDate() - 1);
        behaviorDate = prevDate.toISOString().split('T')[0];
        logger.info('[FeedbackGenerator] Using previous day for sleep metric attribution', { 
          metricType: anomaly.metricType, 
          anomalyDate, 
          behaviorDate 
        });
      }
      
      // First, ensure behavior factors are synced for the relevant date
      // This pulls nutrition, workouts, recovery, etc. from Supabase into ClickHouse
      try {
        await behaviorAttributionEngine.syncDailyBehaviorFactors(healthId, behaviorDate);
      } catch (syncError) {
        logger.warn('[FeedbackGenerator] Failed to sync behavior factors, continuing with existing data', { syncError });
      }
      
      // Get attributed factors from the behavior date (previous day for sleep, same day otherwise)
      const attributedFactors = await behaviorAttributionEngine.findAttributedFactors(
        healthId,
        behaviorDate,
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
        // Preserve underlying behavior keys for canonical comparison
        behaviorKeys: p.behaviors.map(b => b.key.toLowerCase()),
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
   * Now includes health context to explain WHY an anomaly matters and potential health implications.
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
    healthContext?: {
      classification: 'positive' | 'concerning' | 'neutral' | 'context_dependent';
      healthImplications: string[];
      conditionsToConsider: string[];
      actionableAdvice: string;
    };
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
      
      // QUALITY GATE: Stricter evidence requirements for generating insights
      // These gates prevent speculative/low-quality insights from reaching users
      
      // Gate 1: Only count HIGH or MEDIUM contribution causes - ignore LOW contribution
      // This filters out weak correlations that don't meaningfully explain the anomaly
      const significantCauses = mlAttribution.rankedCauses.filter(c => 
        c.contribution === 'high' || c.contribution === 'medium'
      );
      const validCausesCount = significantCauses.length;
      
      // Require at least 2 significant causes OR strong historical pattern (3+ matches with 50%+ confidence)
      const hasStrongHistoricalPattern = mlAttribution.historicalPattern?.matchCount && 
        mlAttribution.historicalPattern.matchCount >= 3 &&
        mlAttribution.historicalPattern.confidence >= 0.5;
      
      const hasMinimumEvidence = validCausesCount >= 2 || hasStrongHistoricalPattern;
      
      if (!hasMinimumEvidence) {
        logger.info('[FeedbackGenerator] QUALITY GATE 1 FAILED: Insufficient causal evidence', {
          healthId,
          metricType: anomaly.metricType,
          totalCauses: mlAttribution.rankedCauses.length,
          significantCauses: validCausesCount,
          lowContributionFiltered: mlAttribution.rankedCauses.length - validCausesCount,
          patternMatches: mlAttribution.historicalPattern?.matchCount || 0,
          patternConfidence: mlAttribution.historicalPattern?.confidence || 0,
        });
        return null;
      }
      
      // Gate 2: Require minimum deviation magnitude to filter out noise
      // Activity metrics need 30%+ deviation, sleep/HRV need 20%+, others 25%+
      // Temperature deviation metrics use ABSOLUTE thresholds (°C), not percentages
      const MIN_DEVIATION_BY_METRIC: Record<string, number> = {
        active_energy: 30, active_calories: 30, workout_minutes: 30, steps: 30,
        hrv: 20, hrv_rmssd: 20, sleep_duration: 20, deep_sleep: 20,
        // Temperature metrics: min 0.3°C deviation to be meaningful
        wrist_temperature_deviation: 0.3, wrist_temp_deviation_c: 0.3, 
        skin_temp_deviation_c: 0.3, skin_temp_trend_deviation_c: 0.3,
        body_temperature_deviation: 0.4, // Body temp needs slightly higher threshold
      };
      const normalizedMetric = anomaly.metricType.toLowerCase().replace(/[-_\s]/g, '_');
      const minDeviation = MIN_DEVIATION_BY_METRIC[normalizedMetric] ?? MIN_DEVIATION_BY_METRIC[anomaly.metricType] ?? 25;
      
      if (Math.abs(anomaly.deviationPct) < minDeviation) {
        logger.info('[FeedbackGenerator] QUALITY GATE 2 FAILED: Deviation too small to be meaningful', {
          healthId,
          metricType: anomaly.metricType,
          deviationPct: anomaly.deviationPct,
          threshold: minDeviation,
          isTemperatureMetric: TEMPERATURE_DEVIATION_METRICS.has(anomaly.metricType),
        });
        return null;
      }
      
      // Gate 3: Calculate overall quality score and require minimum threshold
      const qualityScore = this.calculateInsightQualityScore(mlAttribution, anomaly);
      const MIN_QUALITY_THRESHOLD = 0.4; // Raised from 0.3 for stricter filtering
      
      if (qualityScore < MIN_QUALITY_THRESHOLD) {
        logger.info('[FeedbackGenerator] QUALITY GATE 3 FAILED: Quality score below threshold', {
          healthId,
          metricType: anomaly.metricType,
          qualityScore,
          threshold: MIN_QUALITY_THRESHOLD,
        });
        return null;
      }
      
      logger.info('[FeedbackGenerator] All quality gates passed', { 
        qualityScore, 
        validCausesCount,
        deviationPct: anomaly.deviationPct,
      });
      
      const metricName = METRIC_DISPLAY_NAMES[anomaly.metricType] || anomaly.metricType;
      const direction = anomaly.direction === 'above' ? 'higher' : 'lower';
      
      // For temperature deviation metrics, display °C instead of percentage
      const deviationDisplay = formatDeviationDisplay(anomaly.metricType, anomaly.deviationPct);
      
      // Extract corroborating vital signs from relatedMetrics if present
      const corroboratingVitals: { metric: string; deviation: string; direction: string }[] = [];
      if (anomaly.relatedMetrics) {
        for (const [metricKey, data] of Object.entries(anomaly.relatedMetrics)) {
          if (typeof data === 'object' && data && 'isCorroboratingVital' in data && data.isCorroboratingVital) {
            const vitalName = METRIC_DISPLAY_NAMES[metricKey] || metricKey;
            const vitalDeviation = typeof data.deviation === 'number' ? `${Math.abs(Math.round(data.deviation))}%` : 'unknown';
            const vitalDirection = data.direction === 'above' ? 'elevated' : 'lowered';
            corroboratingVitals.push({ metric: vitalName, deviation: vitalDeviation, direction: vitalDirection });
          }
        }
      }

      // Get health context for this metric
      const healthContext = getMetricHealthContext(anomaly.metricType, anomaly.direction);
      const classificationInfo = healthContext 
        ? getClassificationLabel(healthContext.classification)
        : null;

      // Build the AI prompt with ML-computed data AND health context
      const causesSection = mlAttribution.rankedCauses.length > 0
        ? `LIKELY CAUSES (ML-computed from YOUR data, do not invent new ones):\n${mlAttribution.rankedCauses.map((c, i) => 
            `${i + 1}. ${c.description}: ${Math.abs(Math.round(c.deviation))}% ${c.deviation > 0 ? 'higher' : 'lower'} than usual (${c.contribution} contribution)`
          ).join('\n')}`
        : 'LIKELY CAUSES: None identified from recent behavior data.';

      const historySection = mlAttribution.historicalPattern
        ? `HISTORICAL PATTERN (ML-computed):\n${mlAttribution.historicalPattern.patternDescription}\nThis pattern has occurred ${mlAttribution.historicalPattern.matchCount} times over ${mlAttribution.historicalPattern.totalHistoryMonths} months.\nConfidence: ${Math.round(mlAttribution.historicalPattern.confidence * 100)}%`
        : 'HISTORICAL PATTERN: First time seeing this exact combination.';

      const positiveSection = mlAttribution.positivePatterns.length > 0
        ? `WHAT'S WORKING FOR THIS METRIC (positive patterns to reinforce):\n${mlAttribution.positivePatterns.map(p => 
            `- ${p.description}: appeared ${p.occurrenceCount} times when ${metricName} was good`
          ).join('\n')}`
        : '';

      // Health context section - explains WHY this matters
      const healthContextSection = healthContext ? `
HEALTH SIGNIFICANCE (educational context):
Classification: ${classificationInfo?.label || 'Unknown'}
Description: ${healthContext.description}
Why This Matters:
${healthContext.healthImplications.map(h => `- ${h}`).join('\n')}
${healthContext.conditionsToConsider.length > 0 ? `
Potential Considerations:
${healthContext.conditionsToConsider.map(c => `- ${c}`).join('\n')}` : ''}
Recommended Action: ${healthContext.actionableAdvice}
` : '';

      // Build corroborating vitals section for temperature alerts
      const corroboratingVitalsSection = corroboratingVitals.length > 0
        ? `
CORROBORATING VITAL SIGNS (supporting evidence for this alert):
${corroboratingVitals.map(v => `- ${v.metric}: ${v.deviation} ${v.direction}`).join('\n')}
These vital signs show medically consistent patterns that support this temperature change being significant.
IMPORTANT: You MUST mention these corroborating vital signs in the insight text to explain why this alert is being shown.`
        : '';

      const prompt = `You are a health AI assistant creating a personalized insight for a user. Your goal is to explain not just WHAT changed, but WHY it matters for their health.

DETECTED CHANGE:
${healthContext?.displayName || metricName} is ${deviationDisplay} ${direction} than the user's personal baseline${corroboratingVitalsSection}

${healthContextSection}

${causesSection}

${historySection}

${positiveSection}

${userContext?.preferredName ? `USER NAME: ${userContext.preferredName}` : ''}

Generate an insightful, educational message that:
1. States the detected change clearly
2. EXPLAINS WHY this matters for their health (using the health significance info above)
3. If the classification is "concerning", explain what to monitor; if "positive", celebrate it
4. Reference the ML-computed likely causes if available (do NOT invent causes not in the list)
5. If relevant, mention potential health considerations (from the list above) to discuss with their doctor
6. Provide the actionable advice from the health context
7. If this is a recurring pattern, mention it for credibility
8. End with asking how they feel on a 1-10 scale
9. Be warm and educational, not alarming
10. Under 150 words total
11. Always include the disclaimer: "This is educational information, not medical advice."

Respond with JSON only:
{
  "insightText": "The main insight message with health significance explanation",
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
      const uniqueCauses = Array.from(new Set(mlAttribution.rankedCauses.map(c => c.description))).slice(0, 3);
      
      // Filter out positive patterns that overlap with likely causes
      // Use canonical factor IDs (keys) for reliable comparison instead of fuzzy string matching
      const causeKeySet = new Set(mlAttribution.rankedCauses.map(c => c.key.toLowerCase()));
      
      const whatsWorking = Array.from(new Set(
        mlAttribution.positivePatterns
          .filter(p => {
            // Check if any behavior key in this positive pattern overlaps with cause keys
            // This is canonical ID comparison - no string fuzzing needed
            const hasOverlap = p.behaviorKeys?.some(bKey => causeKeySet.has(bKey));
            if (hasOverlap) {
              return false; // Exclude patterns that share any factor with causes
            }
            return true;
          })
          .map(p => p.description)
      ));

      // Build enriched health context for the response
      const enrichedHealthContext = healthContext ? {
        classification: healthContext.classification,
        healthImplications: healthContext.healthImplications,
        conditionsToConsider: healthContext.conditionsToConsider,
        actionableAdvice: healthContext.actionableAdvice,
      } : undefined;

      logger.info('[FeedbackGenerator] Smart insight generated with health context', {
        hasHealthContext: !!healthContext,
        classification: healthContext?.classification,
        implicationsCount: healthContext?.healthImplications.length || 0,
      });

      return {
        insightText: parsed.insightText || '',
        likelyCauses: uniqueCauses,
        whatsWorking,
        confidence: mlAttribution.historicalPattern?.confidence || 0.3,
        isRecurringPattern: mlAttribution.historicalPattern?.isRecurringPattern || false,
        questionText: parsed.questionText || `On a scale of 1-10, how are you feeling right now?`,
        healthContext: enrichedHealthContext,
      };
    } catch (error) {
      logger.error('[FeedbackGenerator] Error generating smart insight', { error });
      return null;
    }
  }

  /**
   * Calculate insight quality score based on evidence strength.
   * Higher scores indicate more trustworthy insights.
   * 
   * Stricter scoring factors:
   * - Number of scientifically relevant causes with high contribution (0-0.35)
   * - Historical pattern matches with sufficient confidence (0-0.35)  
   * - Deviation significance above noise threshold (0-0.30)
   */
  private calculateInsightQualityScore(
    mlAttribution: MLAttribution,
    anomaly: AnomalyResult
  ): number {
    let score = 0;
    
    // Factor 1: Number of valid causes with high/medium contribution (max 0.35)
    // Only count causes with meaningful contribution levels
    const highContributionCauses = mlAttribution.rankedCauses.filter(c => 
      c.contribution === 'high' || c.contribution === 'medium'
    ).length;
    const causesScore = Math.min(0.35, highContributionCauses * 0.12); // Need 3 high/medium causes for max
    score += causesScore;
    
    // Factor 2: Historical pattern matches (max 0.35)
    // Require 3+ matches AND 40%+ confidence for full credit
    const patternMatches = mlAttribution.historicalPattern?.matchCount || 0;
    const patternConfidence = mlAttribution.historicalPattern?.confidence || 0;
    
    if (patternMatches >= 3 && patternConfidence >= 0.4) {
      // Strong pattern - full credit
      score += 0.35;
    } else if (patternMatches >= 2 && patternConfidence >= 0.3) {
      // Moderate pattern - partial credit
      score += 0.2;
    } else if (patternMatches >= 1) {
      // Weak pattern - minimal credit
      score += 0.1;
    }
    
    // Factor 3: Deviation significance (max 0.30)
    // Larger deviations are more meaningful - need 50%+ for full score
    const deviationMagnitude = Math.abs(anomaly.deviationPct);
    if (deviationMagnitude >= 50) {
      score += 0.30;
    } else if (deviationMagnitude >= 35) {
      score += 0.20;
    } else if (deviationMagnitude >= 25) {
      score += 0.10;
    }
    // Below 25% deviation gets no score contribution
    
    return Math.min(1, score);
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
