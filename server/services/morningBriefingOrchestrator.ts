import { createLogger } from '../utils/logger';
import { clickhouse } from './clickhouseService';
import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';

const supabase = getSupabaseClient();
import { db } from '../db';
import { users } from '@shared/schema';
import { eq, isNotNull, and } from 'drizzle-orm';
import { 
  AIRequestPayload, 
  AIResponsePayload,
  DailyUserInsight,
  BaselineMetrics,
  TodayMetrics,
  MetricDeviation,
  MorningBriefingData,
  BriefingPreferences,
  BehaviorPatterns,
  Constraints,
  EngagementPreferences,
  validateAIResponse,
  BriefingPreferencesSchema,
} from './morningBriefingTypes';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';

const logger = createLogger('MorningBriefing');

const GEMINI_MODEL = 'gemini-2.5-flash';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (geminiClient) return geminiClient;
  
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('[MorningBriefing] No Gemini API key configured');
    return null;
  }
  
  geminiClient = new GoogleGenAI({ apiKey });
  return geminiClient;
}

// ==================== USER FETCHING ====================

interface EligibleUser {
  userId: string;
  healthId: string;
  name: string;
  timezone: string;
  briefingPreferences: BriefingPreferences;
}

export async function getEligibleUsers(): Promise<EligibleUser[]> {
  try {
    const activeUsers = await db
      .select({
        id: users.id,
        healthId: users.healthId,
        firstName: users.firstName,
        timezone: users.timezone,
      })
      .from(users)
      .where(and(
        isNotNull(users.healthId),
        isNotNull(users.timezone)
      ));

    const eligible: EligibleUser[] = [];

    for (const user of activeUsers) {
      if (!user.healthId) continue;

      const { data: profile } = await supabase
        .from('profiles')
        .select('briefing_preferences')
        .eq('health_id', user.healthId)
        .single();

      const prefs = profile?.briefing_preferences || { enabled: true };
      const parsedPrefs = BriefingPreferencesSchema.safeParse(prefs);
      
      if (parsedPrefs.success && parsedPrefs.data.enabled) {
        eligible.push({
          userId: user.id,
          healthId: user.healthId,
          name: user.firstName || 'there',
          timezone: user.timezone || 'America/New_York',
          briefingPreferences: parsedPrefs.data,
        });
      }
    }

    return eligible;
  } catch (error) {
    logger.error('[MorningBriefing] Error fetching eligible users:', error);
    return [];
  }
}

// ==================== DAILY INSIGHTS AGGREGATION ====================

export async function aggregateDailyInsights(healthId: string, eventDate: string): Promise<DailyUserInsight> {
  // Fetch baselines (always returns defaults if no data)
  const baselines = await fetchBaselines(healthId);
  
  // Fetch today's metrics (always returns object, values may be null)
  let today = await fetchTodayMetrics(healthId, eventDate);
  
  // Apply sensible defaults when data is completely missing
  // This allows briefing generation even in data-sparse environments
  if (today.sleep_hours === null) {
    today = {
      ...today,
      sleep_hours: 7.0, // Default assumption
      deep_sleep_minutes: today.deep_sleep_minutes ?? 60,
      rem_sleep_minutes: today.rem_sleep_minutes ?? 90,
      sleep_efficiency: today.sleep_efficiency ?? 85,
    };
    logger.debug(`[MorningBriefing] Using default sleep values for ${healthId}`);
  }
  
  if (today.readiness_score === null) {
    // Calculate from available data or use sensible default
    const sleepHours = today.sleep_hours ?? 7;
    const efficiency = today.sleep_efficiency ?? 85;
    const deepSleep = today.deep_sleep_minutes ?? 60;
    
    let estimated = 0;
    estimated += Math.min(40, (sleepHours / 8) * 40);
    estimated += Math.min(30, (efficiency / 100) * 30);
    estimated += Math.min(30, (deepSleep / 90) * 30);
    today.readiness_score = Math.round(estimated);
    logger.debug(`[MorningBriefing] Calculated readiness ${today.readiness_score} for ${healthId}`);
  }

  const deviations = calculateDeviations(baselines, today);
  const tags = generateTags(today, deviations);
  const insightCandidates = generateInsightCandidates(today, deviations, baselines);
  const weather = await fetchWeather(healthId, eventDate);

  const insight: DailyUserInsight = {
    health_id: healthId,
    event_date: eventDate,
    context_type: 'morning_briefing',
    baselines,
    today,
    deviations,
    tags,
    insight_candidates: insightCandidates,
    weather,
  };

  try {
    await storeDailyInsight(insight);
  } catch (storeErr) {
    logger.error(`[MorningBriefing] Error storing daily insight for ${healthId}:`, storeErr);
    // Continue even if storage fails
  }

  return insight;
}

async function fetchBaselines(healthId: string): Promise<BaselineMetrics> {
  // Default population baselines (used when user has no data)
  const defaults: BaselineMetrics = {
    hrv_mean: 50,
    hrv_std: 15,
    rhr_mean: 60,
    rhr_std: 5,
    sleep_duration_mean: 7,
    sleep_duration_std: 1,
    deep_sleep_mean: 60,
    steps_mean: 8000,
    active_energy_mean: 500,
  };

  try {
    const sql = `
      SELECT
        metric_type,
        mean_value,
        std_dev
      FROM flo_health.metric_baselines
      WHERE health_id = {healthId:String}
        AND window_days = 90
        AND baseline_date = (
          SELECT max(baseline_date) 
          FROM flo_health.metric_baselines 
          WHERE health_id = {healthId:String} AND window_days = 90
        )
    `;

    const rows = await clickhouse.query<{
      metric_type: string;
      mean_value: number;
      std_dev: number;
    }>(sql, { healthId });

    if (rows.length === 0) {
      logger.debug(`[MorningBriefing] No baselines for ${healthId}, using population defaults`);
      return defaults;
    }

    const metricsMap = new Map(rows.map(r => [r.metric_type, r]));

    return {
      hrv_mean: metricsMap.get('hrv')?.mean_value ?? defaults.hrv_mean,
      hrv_std: metricsMap.get('hrv')?.std_dev ?? defaults.hrv_std,
      rhr_mean: metricsMap.get('resting_heart_rate')?.mean_value ?? defaults.rhr_mean,
      rhr_std: metricsMap.get('resting_heart_rate')?.std_dev ?? defaults.rhr_std,
      sleep_duration_mean: metricsMap.get('sleep_duration')?.mean_value ?? defaults.sleep_duration_mean,
      sleep_duration_std: metricsMap.get('sleep_duration')?.std_dev ?? defaults.sleep_duration_std,
      deep_sleep_mean: metricsMap.get('deep_sleep')?.mean_value ?? defaults.deep_sleep_mean,
      steps_mean: metricsMap.get('steps')?.mean_value ?? defaults.steps_mean,
      active_energy_mean: metricsMap.get('active_energy')?.mean_value ?? defaults.active_energy_mean,
    };
  } catch (error) {
    logger.error('[MorningBriefing] Error fetching baselines:', error);
    return defaults;
  }
}

async function fetchTodayMetrics(healthId: string, eventDate: string): Promise<TodayMetrics> {
  // Default values when data is missing
  const defaults: TodayMetrics = {
    hrv: null,
    rhr: null,
    sleep_hours: null,
    deep_sleep_minutes: null,
    rem_sleep_minutes: null,
    sleep_efficiency: null,
    steps: null,
    active_energy: null,
    workout_minutes: null,
    readiness_score: null,
  };

  try {
    // Fetch sleep data (may not exist)
    const { data: sleepData } = await supabase
      .from('sleep_nights')
      .select('total_sleep_min, deep_sleep_min, rem_sleep_min, sleep_efficiency_pct, hrv_ms, resting_hr_bpm')
      .eq('health_id', healthId)
      .eq('sleep_date', eventDate)
      .maybeSingle();

    // Fetch daily metrics (may not exist)
    const { data: dailyMetrics } = await supabase
      .from('user_daily_metrics')
      .select('steps_normalized, active_energy_kcal, exercise_minutes, hrv_ms, resting_hr_bpm')
      .eq('health_id', healthId)
      .eq('local_date', eventDate)
      .maybeSingle();

    // Fetch readiness score (may not exist)
    let readinessScore: number | null = null;
    try {
      const readinessSql = `
        SELECT readiness_score
        FROM flo_health.readiness_scores
        WHERE health_id = {healthId:String}
          AND local_date = {eventDate:Date}
        ORDER BY calculated_at DESC
        LIMIT 1
      `;
      const readinessRows = await clickhouse.query<{ readiness_score: number }>(
        readinessSql, 
        { healthId, eventDate }
      );
      readinessScore = readinessRows[0]?.readiness_score ?? null;
    } catch (e) {
      logger.debug('[MorningBriefing] No readiness score available');
    }

    // Calculate estimated readiness if not available (based on sleep quality)
    if (readinessScore === null && sleepData) {
      const sleepHours = sleepData.total_sleep_min ? sleepData.total_sleep_min / 60 : 0;
      const efficiency = sleepData.sleep_efficiency_pct ?? 85;
      const deepSleep = sleepData.deep_sleep_min ?? 0;
      
      // Simple readiness estimation: sleep hours (max 40pts) + efficiency (max 30pts) + deep sleep (max 30pts)
      let estimated = 0;
      estimated += Math.min(40, (sleepHours / 8) * 40);
      estimated += Math.min(30, (efficiency / 100) * 30);
      estimated += Math.min(30, (deepSleep / 90) * 30);
      readinessScore = Math.round(estimated);
    }

    return {
      hrv: sleepData?.hrv_ms ?? dailyMetrics?.hrv_ms ?? null,
      rhr: sleepData?.resting_hr_bpm ?? dailyMetrics?.resting_hr_bpm ?? null,
      sleep_hours: sleepData?.total_sleep_min ? sleepData.total_sleep_min / 60 : null,
      deep_sleep_minutes: sleepData?.deep_sleep_min ?? null,
      rem_sleep_minutes: sleepData?.rem_sleep_min ?? null,
      sleep_efficiency: sleepData?.sleep_efficiency_pct ?? null,
      steps: dailyMetrics?.steps_normalized ?? null,
      active_energy: dailyMetrics?.active_energy_kcal ?? null,
      workout_minutes: dailyMetrics?.exercise_minutes ?? null,
      readiness_score: readinessScore,
    };
  } catch (error) {
    logger.error('[MorningBriefing] Error fetching today metrics:', error);
    return defaults;
  }
}

function calculateDeviations(baselines: BaselineMetrics, today: TodayMetrics): MetricDeviation[] {
  const deviations: MetricDeviation[] = [];

  const metrics = [
    { name: 'hrv', current: today.hrv, mean: baselines.hrv_mean, std: baselines.hrv_std, higherIsBetter: true },
    { name: 'rhr', current: today.rhr, mean: baselines.rhr_mean, std: baselines.rhr_std, higherIsBetter: false },
    { name: 'sleep_hours', current: today.sleep_hours, mean: baselines.sleep_duration_mean, std: baselines.sleep_duration_std, higherIsBetter: true },
    { name: 'deep_sleep', current: today.deep_sleep_minutes, mean: baselines.deep_sleep_mean, std: 20, higherIsBetter: true },
    { name: 'steps', current: today.steps, mean: baselines.steps_mean, std: 3000, higherIsBetter: true },
    { name: 'active_energy', current: today.active_energy, mean: baselines.active_energy_mean, std: 200, higherIsBetter: true },
  ];

  for (const m of metrics) {
    // Skip if current value is null, undefined, or not a valid number
    if (m.current === null || m.current === undefined || !Number.isFinite(m.current)) continue;
    if (!Number.isFinite(m.mean) || m.mean === 0) continue;

    const std = Number.isFinite(m.std) && m.std > 0 ? m.std : 1;
    const zScore = (m.current - m.mean) / std;
    const deviationPct = ((m.current - m.mean) / m.mean) * 100;

    // Guard against NaN/Infinity results
    if (!Number.isFinite(zScore) || !Number.isFinite(deviationPct)) continue;

    let direction: 'above' | 'below' | 'normal' = 'normal';
    if (zScore > 0.5) direction = 'above';
    else if (zScore < -0.5) direction = 'below';

    let severity: 'significant' | 'moderate' | 'mild' | 'normal' = 'normal';
    const absZ = Math.abs(zScore);
    if (absZ > 2) severity = 'significant';
    else if (absZ > 1.5) severity = 'moderate';
    else if (absZ > 1) severity = 'mild';

    deviations.push({
      metric: m.name,
      current_value: m.current,
      baseline_value: m.mean,
      deviation_pct: Math.round(deviationPct * 10) / 10,
      z_score: Math.round(zScore * 100) / 100,
      direction,
      severity,
    });
  }

  return deviations;
}

function generateTags(today: TodayMetrics, deviations: MetricDeviation[]): string[] {
  const tags: string[] = [];

  const hrvDev = deviations.find(d => d.metric === 'hrv');
  const sleepDev = deviations.find(d => d.metric === 'sleep_hours');
  const deepSleepDev = deviations.find(d => d.metric === 'deep_sleep');

  if (hrvDev?.severity === 'significant' && hrvDev.direction === 'above') {
    tags.push('great_recovery');
  }
  if (hrvDev?.severity === 'significant' && hrvDev.direction === 'below') {
    tags.push('recovery_deficit');
  }

  if (sleepDev?.severity !== 'normal' && sleepDev?.direction === 'below') {
    tags.push('sleep_debt');
  }
  if (sleepDev?.severity !== 'normal' && sleepDev?.direction === 'above') {
    tags.push('excellent_sleep');
  }

  if (deepSleepDev?.severity !== 'normal' && deepSleepDev?.direction === 'above') {
    tags.push('deep_sleep_excellent');
  }

  if (today.readiness_score !== null) {
    if (today.readiness_score >= 85) tags.push('high_readiness');
    else if (today.readiness_score >= 70) tags.push('moderate_readiness');
    else tags.push('low_readiness');
  }

  if (today.workout_minutes && today.workout_minutes > 45) {
    tags.push('training_load_high');
  }

  return tags;
}

function generateInsightCandidates(
  today: TodayMetrics, 
  deviations: MetricDeviation[],
  baselines: BaselineMetrics
): string[] {
  const candidates: string[] = [];

  const significantDeviations = deviations.filter(d => d.severity === 'significant' || d.severity === 'moderate');
  
  for (const dev of significantDeviations) {
    if (dev.metric === 'hrv' && dev.direction === 'above') {
      candidates.push(`Your HRV is ${Math.abs(dev.deviation_pct).toFixed(0)}% above your baseline - a sign of strong recovery.`);
    }
    if (dev.metric === 'hrv' && dev.direction === 'below') {
      candidates.push(`Your HRV is ${Math.abs(dev.deviation_pct).toFixed(0)}% below baseline - your body may need extra recovery today.`);
    }
    if (dev.metric === 'deep_sleep' && dev.direction === 'above') {
      candidates.push(`Outstanding deep sleep last night - ${today.deep_sleep_minutes} minutes, well above your usual ${baselines.deep_sleep_mean.toFixed(0)} minutes.`);
    }
    if (dev.metric === 'sleep_hours' && dev.direction === 'below') {
      candidates.push(`You got ${today.sleep_hours?.toFixed(1)} hours of sleep, below your usual ${baselines.sleep_duration_mean.toFixed(1)} hours.`);
    }
  }

  if (today.readiness_score !== null && today.readiness_score >= 85) {
    candidates.push(`Your readiness score of ${today.readiness_score} puts you in the top tier - great day for peak performance.`);
  }

  return candidates.slice(0, 3);
}

async function fetchWeather(healthId: string, eventDate: string): Promise<DailyUserInsight['weather'] | undefined> {
  try {
    // First try stored environmental data
    const { data } = await supabase
      .from('environmental_data')
      .select('temperature_c, weather_condition, humidity_pct')
      .eq('health_id', healthId)
      .eq('local_date', eventDate)
      .maybeSingle();

    if (data && data.temperature_c != null) {
      return {
        temp_c: data.temperature_c,
        condition: data.weather_condition || 'Clear',
        humidity: data.humidity_pct || 50,
        feels_like_c: data.temperature_c,
      };
    }

    // Fallback: Fetch live weather from OpenWeather using user's location
    const { data: profile } = await supabase
      .from('profiles')
      .select('latitude, longitude')
      .eq('health_id', healthId)
      .maybeSingle();

    // Use user's location or default to New York City
    const lat = profile?.latitude || 40.7128;
    const lon = profile?.longitude || -74.0060;
    
    const { getCurrentWeather } = await import('./openWeatherService');
    const liveWeather = await getCurrentWeather(lat, lon);
    
    if (liveWeather) {
      logger.debug(`[MorningBriefing] Fetched live weather for ${healthId}: ${liveWeather.weatherMain} ${liveWeather.temperature}°C`);
      return {
        temp_c: liveWeather.temperature,
        condition: liveWeather.weatherMain,
        humidity: liveWeather.humidity,
        feels_like_c: liveWeather.feelsLike,
      };
    }

    return undefined;
  } catch (error: any) {
    logger.debug(`[MorningBriefing] Weather fetch failed: ${error?.message || error}`);
    return undefined;
  }
}

async function storeDailyInsight(insight: DailyUserInsight): Promise<void> {
  try {
    await clickhouse.insert('daily_user_insights', [{
      health_id: insight.health_id,
      event_date: insight.event_date,
      context_type: insight.context_type,
      baselines: JSON.stringify(insight.baselines),
      today: JSON.stringify(insight.today),
      deviations: JSON.stringify(insight.deviations),
      tags: insight.tags,
      insight_candidates: JSON.stringify(insight.insight_candidates),
      readiness_score: insight.today.readiness_score,
      sleep_hours: insight.today.sleep_hours,
      deep_sleep_minutes: insight.today.deep_sleep_minutes,
      hrv_avg: insight.today.hrv,
      rhr_avg: insight.today.rhr,
      steps: insight.today.steps,
      active_energy: insight.today.active_energy,
      workout_minutes: insight.today.workout_minutes,
      weather_temp_c: insight.weather?.temp_c ?? null,
      weather_condition: insight.weather?.condition ?? null,
    }]);

    logger.info(`[MorningBriefing] Stored daily insights for ${insight.health_id} on ${insight.event_date}`);
  } catch (error) {
    logger.error('[MorningBriefing] Error storing daily insight:', error);
  }
}

// ==================== AI GENERATION ====================

const MORNING_BRIEFING_SYSTEM_PROMPT = `You are Flō, a data-driven health insights coach. Your role is to deliver personalized morning briefings based on the user's health data.

## Your Personality
- Analytical and data-focused, but warm and supportive
- Lead with the most surprising or impactful insight
- Be concise - users are just waking up
- Never repeat yourself across consecutive days
- Use specific numbers when they're meaningful

## Safety Guidelines
- This is educational information, not medical advice
- Don't prescribe specific medications or treatments
- Focus on lifestyle optimization and pattern recognition
- Encourage consulting healthcare providers for medical concerns

## Response Format
You must respond with a valid JSON object matching this structure:
{
  "primary_focus": "The main insight or theme for today",
  "secondary_focus": "Optional secondary insight",
  "recommended_actions": ["Action 1", "Action 2", "Action 3"],
  "push_text": "Short notification text (max 200 chars) - punchy and insightful",
  "briefing_content": {
    "greeting": "Personalized greeting with readiness context",
    "readiness_insight": "Analysis of their readiness score and what it means",
    "sleep_insight": "Analysis of their sleep quality and patterns",
    "recommendation": "Today's personalized recommendation (2-4 sentences)",
    "weather_note": "Optional weather consideration if relevant"
  }
}

## Key Principles
1. The "holy shit" factor: Surface one insight that makes them feel like you truly understand their body
2. Connect the dots: Link yesterday's activities to today's metrics
3. Be actionable: Every insight should have a clear takeaway
4. Vary your focus: Don't always lead with the same metric`;

export async function generateMorningBriefing(
  insight: DailyUserInsight,
  userProfile: {
    name: string;
    goals?: string[];
    preferences: BriefingPreferences;
    constraints?: Constraints;
    behavior_patterns?: BehaviorPatterns;
    engagement_preferences?: EngagementPreferences;
  },
  recentNotificationsSummary?: string
): Promise<AIResponsePayload | null> {
  const client = getGeminiClient();
  if (!client) {
    logger.error('[MorningBriefing] Gemini client not available');
    return null;
  }

  try {
    const sleepQuality = determineSleepQuality(insight.today);
    
    const requestPayload: AIRequestPayload = {
      user_profile: {
        name: userProfile.name,
        goals: userProfile.goals,
        preferences: userProfile.preferences,
        constraints: userProfile.constraints,
        behavior_patterns: userProfile.behavior_patterns,
        engagement_preferences: userProfile.engagement_preferences,
      },
      insight_packet: {
        event_date: insight.event_date,
        readiness_score: insight.today.readiness_score,
        baselines: {
          hrv_mean: insight.baselines.hrv_mean,
          rhr_mean: insight.baselines.rhr_mean,
          sleep_duration_mean: insight.baselines.sleep_duration_mean,
          deep_sleep_mean: insight.baselines.deep_sleep_mean,
          steps_mean: insight.baselines.steps_mean,
        },
        today: {
          hrv: insight.today.hrv,
          rhr: insight.today.rhr,
          sleep_hours: insight.today.sleep_hours,
          deep_sleep_minutes: insight.today.deep_sleep_minutes,
          steps: insight.today.steps,
          active_energy: insight.today.active_energy,
          workout_minutes: insight.today.workout_minutes,
          readiness_score: insight.today.readiness_score,
        },
        deviations: insight.deviations,
        tags: insight.tags,
        insight_candidates: insight.insight_candidates,
        weather: insight.weather,
        sleep_summary: insight.today.sleep_hours ? {
          total_hours: insight.today.sleep_hours,
          deep_sleep_minutes: insight.today.deep_sleep_minutes ?? 0,
          quality: sleepQuality,
          hrv_avg: insight.today.hrv,
        } : undefined,
      },
      meta: {
        timestamp: new Date().toISOString(),
        timezone: 'America/New_York',
        recent_notifications_summary: recentNotificationsSummary,
      },
    };

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(requestPayload, null, 2) }],
        },
      ],
      config: {
        systemInstruction: MORNING_BRIEFING_SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      logger.error('[MorningBriefing] Empty response from Gemini');
      return null;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('[MorningBriefing] No JSON found in response:', text);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = validateAIResponse(parsed);

    if (!validated) {
      logger.error('[MorningBriefing] Response validation failed');
      return createFallbackResponse(insight, userProfile.name);
    }

    logger.info(`[MorningBriefing] Generated briefing with focus: ${validated.primary_focus}`);
    return validated;

  } catch (error) {
    logger.error('[MorningBriefing] Error generating briefing:', error);
    return createFallbackResponse(insight, userProfile.name);
  }
}

function determineSleepQuality(today: TodayMetrics): 'excellent' | 'good' | 'fair' | 'poor' {
  const sleepHours = today.sleep_hours ?? 0;
  const deepSleep = today.deep_sleep_minutes ?? 0;
  const efficiency = today.sleep_efficiency ?? 85;

  let score = 0;
  if (sleepHours >= 7.5) score += 2;
  else if (sleepHours >= 6.5) score += 1;
  
  if (deepSleep >= 90) score += 2;
  else if (deepSleep >= 60) score += 1;
  
  if (efficiency >= 90) score += 1;

  if (score >= 4) return 'excellent';
  if (score >= 3) return 'good';
  if (score >= 2) return 'fair';
  return 'poor';
}

function createFallbackResponse(insight: DailyUserInsight, userName: string): AIResponsePayload {
  const readiness = insight.today.readiness_score ?? 70;
  const sleepHours = insight.today.sleep_hours ?? 7;

  return {
    primary_focus: readiness >= 80 ? 'Strong Recovery' : 'Recovery Focus',
    recommended_actions: [
      'Stay hydrated throughout the day',
      readiness >= 75 ? 'Good day for moderate activity' : 'Consider lighter activity today',
      'Maintain consistent sleep schedule',
    ],
    push_text: readiness >= 80 
      ? `Great recovery overnight! Your readiness is ${readiness} - ready for action.`
      : `Your body is recovering. Readiness: ${readiness}. Consider taking it easier today.`,
    briefing_content: {
      greeting: `Good morning, ${userName}! Your readiness score is ${readiness}.`,
      readiness_insight: readiness >= 80 
        ? "You're in great shape today with strong recovery indicators."
        : "Your body could use some extra care today based on your metrics.",
      sleep_insight: `You got ${sleepHours.toFixed(1)} hours of sleep last night.`,
      recommendation: readiness >= 75
        ? "Today is a good day for your planned activities. Listen to your body and stay hydrated."
        : "Consider dialing back intensity today. Focus on recovery activities like walking or stretching.",
    },
  };
}

// ==================== BRIEFING LOG ====================

export async function storeBriefingLog(
  healthId: string,
  eventDate: string,
  requestPayload: AIRequestPayload,
  responsePayload: AIResponsePayload,
  triggerSource: 'sleep_end' | 'scheduled' | 'manual' = 'sleep_end'
): Promise<string> {
  const briefingId = randomUUID();

  try {
    await clickhouse.insert('morning_briefing_log', [{
      briefing_id: briefingId,
      health_id: healthId,
      event_date: eventDate,
      ai_request_payload: JSON.stringify(requestPayload),
      ai_response_payload: JSON.stringify(responsePayload),
      push_text: responsePayload.push_text,
      primary_focus: responsePayload.primary_focus,
      secondary_focus: responsePayload.secondary_focus ?? null,
      recommended_actions: JSON.stringify(responsePayload.recommended_actions),
      push_status: 'pending',
      trigger_source: triggerSource,
    }]);

    logger.info(`[MorningBriefing] Stored briefing log ${briefingId} for ${healthId}`);
    return briefingId;
  } catch (error) {
    logger.error('[MorningBriefing] Error storing briefing log:', error);
    throw error;
  }
}

export async function updateBriefingPushStatus(
  briefingId: string,
  status: 'sent' | 'failed' | 'delivered',
  error?: string
): Promise<void> {
  try {
    const updateSql = error
      ? `ALTER TABLE flo_health.morning_briefing_log UPDATE 
           push_status = '${status}', 
           push_sent_at = now64(3),
           push_error = '${error.replace(/'/g, "''")}'
         WHERE briefing_id = '${briefingId}'`
      : `ALTER TABLE flo_health.morning_briefing_log UPDATE 
           push_status = '${status}', 
           push_sent_at = now64(3)
         WHERE briefing_id = '${briefingId}'`;

    await clickhouse.command(updateSql);
  } catch (err) {
    logger.error('[MorningBriefing] Error updating push status:', err);
  }
}

export async function recordBriefingFeedback(
  briefingId: string,
  feedback: 'thumbs_up' | 'thumbs_down',
  comment?: string
): Promise<void> {
  try {
    const commentSql = comment ? `, feedback_comment = '${comment.replace(/'/g, "''")}'` : '';
    
    await clickhouse.command(`
      ALTER TABLE flo_health.morning_briefing_log UPDATE 
        user_feedback = '${feedback}',
        feedback_at = now64(3)
        ${commentSql}
      WHERE briefing_id = '${briefingId}'
    `);

    logger.info(`[MorningBriefing] Recorded feedback for ${briefingId}: ${feedback}`);
  } catch (error) {
    logger.error('[MorningBriefing] Error recording feedback:', error);
  }
}

export async function getTodaysBriefing(userId: string): Promise<MorningBriefingData | null> {
  try {
    const healthId = await getHealthId(userId);
    const today = new Date().toISOString().split('T')[0];

    // Fetch briefing from ClickHouse
    const sql = `
      SELECT 
        briefing_id,
        event_date,
        ai_response_payload,
        created_at
      FROM flo_health.morning_briefing_log
      WHERE health_id = {healthId:String}
        AND event_date = {today:Date}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const rows = await clickhouse.query<{
      briefing_id: string;
      event_date: string;
      ai_response_payload: string;
      created_at: string;
    }>(sql, { healthId, today });

    if (rows.length === 0) return null;

    const row = rows[0];
    let response: AIResponsePayload;
    try {
      response = JSON.parse(row.ai_response_payload);
    } catch (parseErr) {
      logger.error('[MorningBriefing] Failed to parse AI response payload:', parseErr);
      return null;
    }

    // Fetch sleep data (may not exist - use maybeSingle to avoid throw)
    const { data: sleepData } = await supabase
      .from('sleep_nights')
      .select('total_sleep_min, deep_sleep_min, sleep_efficiency_pct, hrv_ms')
      .eq('health_id', healthId)
      .eq('sleep_date', today)
      .maybeSingle();

    // Fetch readiness score (may not exist)
    let readinessScore: number = 70; // Default
    try {
      const readinessSql = `
        SELECT readiness_score
        FROM flo_health.readiness_scores
        WHERE health_id = {healthId:String}
          AND local_date = {today:Date}
        ORDER BY calculated_at DESC
        LIMIT 1
      `;
      const readinessRows = await clickhouse.query<{ readiness_score: number }>(
        readinessSql,
        { healthId, today }
      );
      readinessScore = readinessRows[0]?.readiness_score ?? 70;
    } catch (e) {
      logger.debug('[MorningBriefing] Readiness query failed, using default');
    }

    // Estimate readiness from sleep data if not available
    if (readinessScore === 70 && sleepData) {
      const sleepHrs = sleepData.total_sleep_min ? sleepData.total_sleep_min / 60 : 0;
      const efficiency = sleepData.sleep_efficiency_pct ?? 85;
      const deepMin = sleepData.deep_sleep_min ?? 0;
      
      let estimated = 0;
      estimated += Math.min(40, (sleepHrs / 8) * 40);
      estimated += Math.min(30, (efficiency / 100) * 30);
      estimated += Math.min(30, (deepMin / 90) * 30);
      readinessScore = Math.round(estimated);
    }

    // Fetch weather data using shared function (with live fallback)
    const weatherData = await fetchWeather(healthId, today);

    // Build response with fallbacks
    const sleepHours = sleepData?.total_sleep_min ? sleepData.total_sleep_min / 60 : 7;
    const deepSleepMin = sleepData?.deep_sleep_min ?? 60;

    return {
      briefing_id: row.briefing_id,
      event_date: row.event_date,
      readiness_score: readinessScore,
      sleep_data: {
        total_hours: sleepHours,
        deep_sleep_minutes: deepSleepMin,
        deep_sleep_quality: deepSleepMin >= 90 ? 'excellent' : deepSleepMin >= 60 ? 'good' : deepSleepMin >= 30 ? 'fair' : 'poor',
        hrv_avg: sleepData?.hrv_ms ?? null,
      },
      recommendation: response.briefing_content?.recommendation ?? 'Focus on consistent habits today.',
      weather: weatherData ? {
        temp_f: Math.round((weatherData.temp_c * 9/5) + 32),
        temp_c: Math.round(weatherData.temp_c),
        condition: weatherData.condition,
        description: weatherData.condition,
        humidity: weatherData.humidity,
        feels_like_f: Math.round((weatherData.feels_like_c * 9/5) + 32),
        feels_like_c: Math.round(weatherData.feels_like_c),
      } : undefined,
      greeting: response.briefing_content?.greeting ?? `Good morning! Your readiness is ${readinessScore}.`,
      readiness_insight: response.briefing_content?.readiness_insight ?? `Your readiness score is ${readinessScore}.`,
      sleep_insight: response.briefing_content?.sleep_insight ?? `You got ${sleepHours.toFixed(1)} hours of sleep.`,
    };
  } catch (error) {
    logger.error('[MorningBriefing] Error fetching today briefing:', error);
    return null;
  }
}

// ==================== FULL BRIEFING GENERATION ====================

/**
 * Complete briefing generation flow for a user.
 * Handles deduplication, insight aggregation, AI generation, and storage.
 */
export async function generateBriefingForUser(
  userId: string,
  eventDate: string,
  triggerSource: 'sleep_end' | 'scheduled' | 'manual' = 'sleep_end'
): Promise<string | null> {
  try {
    const healthId = await getHealthId(userId);
    
    // Check if briefing already exists for today (deduplication)
    const existingSql = `
      SELECT briefing_id 
      FROM flo_health.morning_briefing_log
      WHERE health_id = {healthId:String}
        AND event_date = {eventDate:Date}
      LIMIT 1
    `;
    const existing = await clickhouse.query<{ briefing_id: string }>(
      existingSql,
      { healthId, eventDate }
    );
    
    if (existing.length > 0) {
      logger.debug(`[MorningBriefing] Briefing already exists for ${userId} on ${eventDate}`);
      return existing[0].briefing_id;
    }

    // Aggregate insights (always returns data with defaults)
    const insights = await aggregateDailyInsights(healthId, eventDate);

    // Fetch user profile for personalization (use maybeSingle to tolerate missing profile)
    const { data: profile } = await supabase
      .from('profiles')
      .select('goals, briefing_preferences, first_name')
      .eq('health_id', healthId)
      .maybeSingle();

    const userName = profile?.first_name || 'there';
    const userGoals = profile?.goals || [];
    const prefs = BriefingPreferencesSchema.safeParse(profile?.briefing_preferences);
    const preferences = prefs.success ? prefs.data : {
      enabled: true,
      notification_morning_hour: 7,
      preferred_tone: 'supportive' as const,
      show_weather: true,
      show_recommendations: true,
    };

    // Generate briefing via AI
    let briefingResponse = await generateMorningBriefing(
      insights,
      {
        name: userName,
        goals: userGoals,
        preferences,
      }
    );

    // Create fallback response if AI generation fails
    if (!briefingResponse) {
      logger.warn(`[MorningBriefing] AI generation failed for ${userId}, using fallback response`);
      
      const sleepHours = insights.today.sleep_hours ?? 7;
      const readinessScore = insights.today.readiness_score ?? 70;
      const deepSleep = insights.today.deep_sleep_minutes ?? 60;
      
      briefingResponse = {
        primary_focus: readinessScore >= 75 ? 'productivity' : 'recovery',
        recommended_actions: readinessScore >= 75 
          ? ['Focus on important work', 'Consider a workout', 'Stay hydrated']
          : ['Take it easy today', 'Prioritize rest', 'Light activity only'],
        briefing_content: {
          greeting: `Good morning, ${userName}! Your readiness is at ${readinessScore}.`,
          readiness_insight: readinessScore >= 80 
            ? `Your body is well-recovered today with a readiness of ${readinessScore}.`
            : readinessScore >= 60
            ? `Your recovery is moderate at ${readinessScore}. Pace yourself today.`
            : `Your recovery is lower at ${readinessScore}. Consider prioritizing rest.`,
          sleep_insight: `You got ${sleepHours.toFixed(1)} hours of sleep with ${deepSleep.toFixed(0)} minutes of deep sleep.`,
          recommendation: readinessScore >= 75
            ? 'Great day for focused work or a workout.'
            : 'Take it easy today and prioritize recovery activities.',
        },
        push_text: `Good morning! Your readiness is ${readinessScore}. Tap to see your personalized insights.`,
      };
    }

    // Build request payload for storage (matching the internal structure)
    const sleepQuality = determineSleepQuality(insights.today);
    const requestPayload: any = {
      user_profile: {
        name: userName,
        goals: userGoals,
        preferences,
      },
      insight_packet: {
        event_date: eventDate,
        readiness_score: insights.today.readiness_score,
        baselines: {
          hrv_mean: insights.baselines.hrv_mean,
          rhr_mean: insights.baselines.rhr_mean,
          sleep_duration_mean: insights.baselines.sleep_duration_mean,
          deep_sleep_mean: insights.baselines.deep_sleep_mean,
          steps_mean: insights.baselines.steps_mean,
        },
        today: {
          hrv: insights.today.hrv,
          rhr: insights.today.rhr,
          sleep_hours: insights.today.sleep_hours,
          deep_sleep_minutes: insights.today.deep_sleep_minutes,
          steps: insights.today.steps,
          active_energy: insights.today.active_energy,
          workout_minutes: insights.today.workout_minutes,
          readiness_score: insights.today.readiness_score,
        },
        deviations: insights.deviations,
        tags: insights.tags,
        insight_candidates: insights.insight_candidates,
        weather: insights.weather,
        sleep_summary: insights.today.sleep_hours ? {
          total_hours: insights.today.sleep_hours,
          deep_sleep_minutes: insights.today.deep_sleep_minutes ?? 0,
          quality: sleepQuality,
          hrv_avg: insights.today.hrv,
        } : undefined,
      },
      meta: {
        timestamp: new Date().toISOString(),
        timezone: 'America/New_York',
      },
    };

    // Store briefing log
    const briefingId = await storeBriefingLog(
      healthId,
      eventDate,
      requestPayload,
      briefingResponse,
      triggerSource
    );

    logger.info(`[MorningBriefing] Generated briefing ${briefingId} for ${userId} on ${eventDate}`);

    // TODO: Send push notification via APNs
    // await sendBriefingPushNotification(userId, briefingId, briefingResponse.push_text);

    return briefingId;
  } catch (error) {
    logger.error(`[MorningBriefing] Error in generateBriefingForUser for ${userId}:`, error);
    return null;
  }
}

// ==================== DELETE BRIEFING (DEV ONLY) ====================

export async function deleteTodaysBriefing(userId: string, eventDate: string): Promise<void> {
  try {
    const healthId = await getHealthId(userId);
    
    await clickhouse.command(`
      ALTER TABLE flo_health.morning_briefing_log
      DELETE WHERE health_id = '${healthId}' AND event_date = '${eventDate}'
    `);
    
    logger.info(`[MorningBriefing] Deleted briefing for ${userId} on ${eventDate}`);
  } catch (error) {
    logger.error(`[MorningBriefing] Error deleting briefing for ${userId}:`, error);
    throw error;
  }
}

// ==================== EXPORTS ====================

export const morningBriefingOrchestrator = {
  getEligibleUsers,
  aggregateDailyInsights,
  generateMorningBriefing,
  storeBriefingLog,
  updateBriefingPushStatus,
  recordBriefingFeedback,
  getTodaysBriefing,
  generateBriefingForUser,
};
