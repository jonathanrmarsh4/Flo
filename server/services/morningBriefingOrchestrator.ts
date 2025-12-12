import { createLogger } from '../utils/logger';
import { clickhouse } from './clickhouseService';
import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import { apnsService } from './apnsService';
import { computeDailyReadiness } from './readinessEngine';

const supabase = getSupabaseClient();
import { db } from '../db';
import { users, notificationLogs, userDailyReadiness } from '@shared/schema';
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

export async function aggregateDailyInsights(healthId: string, eventDate: string, userId?: string): Promise<DailyUserInsight> {
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
  
  // Use stored readiness score as single source of truth (calibrated score from dashboard)
  // First check userDailyReadiness table for existing stored score, then fall back to computation
  if (userId) {
    const originalReadiness = today.readiness_score;
    today.readiness_score = null; // Reset to ensure we use stored/computed value
    
    try {
      // Step 1: Check for stored readiness score (already calibrated from dashboard)
      const storedReadiness = await db
        .select({ readinessScore: userDailyReadiness.readinessScore })
        .from(userDailyReadiness)
        .where(
          and(
            eq(userDailyReadiness.userId, userId),
            eq(userDailyReadiness.date, eventDate)
          )
        )
        .limit(1);
      
      if (storedReadiness.length > 0 && typeof storedReadiness[0].readinessScore === 'number') {
        today.readiness_score = storedReadiness[0].readinessScore;
        logger.info(`[MorningBriefing] Using stored calibrated readiness ${today.readiness_score} for ${healthId} (was: ${originalReadiness})`);
      } else {
        // Step 2: Fall back to computing readiness (if no stored value)
        logger.debug(`[MorningBriefing] No stored readiness for ${eventDate}, computing...`);
        const readinessResult = await computeDailyReadiness(userId, eventDate);
        if (readinessResult && typeof readinessResult.readinessScore === 'number') {
          today.readiness_score = readinessResult.readinessScore;
          logger.debug(`[MorningBriefing] Using computed readiness ${today.readiness_score} for ${healthId}`);
        } else {
          logger.debug(`[MorningBriefing] readinessEngine returned null for ${healthId}, will use fallback`);
        }
      }
    } catch (err) {
      logger.warn(`[MorningBriefing] Failed to get readiness for ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  
  // Fallback only if readinessEngine didn't provide a score
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
    logger.debug(`[MorningBriefing] Fallback readiness ${today.readiness_score} for ${healthId}`);
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
    // First, try to compute fresh baselines directly from health_metrics (source of truth)
    // This bypasses the metric_baselines table which may have stale or mismatched window data
    const liveBaselinesQuery = `
      SELECT
        metric_type,
        avg(value) as mean_value,
        stddevPop(value) as std_dev,
        count() as sample_count
      FROM flo_health.health_metrics FINAL
      WHERE health_id = {healthId:String}
        AND recorded_at >= now() - INTERVAL 90 DAY
      GROUP BY metric_type
      HAVING count() >= 3
    `;

    let rows = await clickhouse.query<{
      metric_type: string;
      mean_value: number;
      std_dev: number;
      sample_count: number;
    }>(liveBaselinesQuery, { healthId });

    // If no 90-day data, try 30-day window
    if (rows.length === 0) {
      logger.debug(`[MorningBriefing] No 90-day baselines for ${healthId}, trying 30-day window`);
      const thirtyDayQuery = `
        SELECT
          metric_type,
          avg(value) as mean_value,
          stddevPop(value) as std_dev,
          count() as sample_count
        FROM flo_health.health_metrics FINAL
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL 30 DAY
        GROUP BY metric_type
        HAVING count() >= 3
      `;
      rows = await clickhouse.query<{
        metric_type: string;
        mean_value: number;
        std_dev: number;
        sample_count: number;
      }>(thirtyDayQuery, { healthId });
    }

    // If still no data, try 7-day window as last resort
    if (rows.length === 0) {
      logger.debug(`[MorningBriefing] No 30-day baselines for ${healthId}, trying 7-day window`);
      const sevenDayQuery = `
        SELECT
          metric_type,
          avg(value) as mean_value,
          stddevPop(value) as std_dev,
          count() as sample_count
        FROM flo_health.health_metrics FINAL
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL 7 DAY
        GROUP BY metric_type
        HAVING count() >= 2
      `;
      rows = await clickhouse.query<{
        metric_type: string;
        mean_value: number;
        std_dev: number;
        sample_count: number;
      }>(sevenDayQuery, { healthId });
    }

    if (rows.length === 0) {
      logger.debug(`[MorningBriefing] No ClickHouse baselines for ${healthId}, using population defaults`);
      return defaults;
    }

    const metricsMap = new Map(rows.map(r => [r.metric_type, r]));
    
    // Log found baselines for debugging
    const foundMetrics = Array.from(metricsMap.keys()).join(', ');
    const hrvBaseline = metricsMap.get('hrv');
    logger.info(`[MorningBriefing] Found baselines for ${healthId}: ${foundMetrics}. HRV: mean=${hrvBaseline?.mean_value?.toFixed(1)}, std=${hrvBaseline?.std_dev?.toFixed(1)}, n=${hrvBaseline?.sample_count}`);

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

    // Note: readiness_score is now handled exclusively by aggregateDailyInsights via readinessEngine
    // This ensures consistency with the dashboard and prevents duplicate/conflicting calculations

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
      readiness_score: null, // Calculated by aggregateDailyInsights using readinessEngine
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

    // Fallback: Fetch live weather from OpenWeather using user's latest location from history
    const { getLatestLocationByHealthId } = await import('./supabaseHealthStorage');
    const latestLocation = await getLatestLocationByHealthId(healthId);
    
    // Use user's device location or default to Sydney, Australia as fallback
    const lat = latestLocation?.latitude || -33.8688;
    const lon = latestLocation?.longitude || 151.2093;
    
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

// ==================== RICH CONTEXT FETCHING ====================

interface RecentLifeEvent {
  event_type: string;
  description: string;
  severity: number;
  occurred_at: string;
}

interface RecentCorrelation {
  behavior_type: string;
  outcome_type: string;
  direction: string;
  effect_size: number;
  description: string;
}

interface RecentAnomaly {
  metric_type: string;
  severity: string;
  description: string;
  detected_at: string;
}

interface SubjectiveSurvey {
  local_date: string;
  energy: number;
  clarity: number;
  mood: number;
}

interface BehaviorAttribution {
  factor_category: string;
  factor_key: string;
  deviation_pct: number;
  is_notable: boolean;
}

interface CausalInsight {
  metric_type: string;
  deviation_pct: number;
  likely_causes: string[];
  whats_working: string[];
  confidence: number;
  is_recurring_pattern: boolean;
}

interface RichContext {
  recent_life_events: RecentLifeEvent[];
  discovered_correlations: RecentCorrelation[];
  recent_anomalies: RecentAnomaly[];
  recent_surveys: SubjectiveSurvey[];
  past_briefing_feedback: { positive: number; negative: number };
  workout_yesterday: { type?: string; duration_minutes?: number; intensity?: string } | null;
  behavior_attributions: BehaviorAttribution[];
  causal_insights: CausalInsight[];
}

async function fetchRichContext(healthId: string, eventDate: string): Promise<RichContext> {
  const context: RichContext = {
    recent_life_events: [],
    discovered_correlations: [],
    recent_anomalies: [],
    recent_surveys: [],
    past_briefing_feedback: { positive: 0, negative: 0 },
    workout_yesterday: null,
    behavior_attributions: [],
    causal_insights: [],
  };

  try {
    // Fetch recent life events (last 7 days)
    const lifeEventsSql = `
      SELECT event_type, description, severity, occurred_at
      FROM flo_health.life_events
      WHERE health_id = {healthId:String}
        AND local_date >= {startDate:Date}
        AND local_date <= {eventDate:Date}
      ORDER BY occurred_at DESC
      LIMIT 5
    `;
    const startDate = new Date(eventDate);
    startDate.setDate(startDate.getDate() - 7);
    const lifeEvents = await clickhouse.query<{ event_type: string; description: string; severity: number; occurred_at: string }>(
      lifeEventsSql,
      { healthId, startDate: startDate.toISOString().split('T')[0], eventDate }
    );
    context.recent_life_events = lifeEvents;

    // Fetch discovered correlations (last 30 days, high confidence)
    const correlationsSql = `
      SELECT behavior_type, outcome_type, direction, effect_size, description
      FROM flo_health.long_term_correlations
      WHERE health_id = {healthId:String}
        AND is_significant = 1
        AND confidence_level > 0.7
      ORDER BY discovered_at DESC
      LIMIT 5
    `;
    const correlations = await clickhouse.query<{ behavior_type: string; outcome_type: string; direction: string; effect_size: number; description: string }>(
      correlationsSql,
      { healthId }
    );
    context.discovered_correlations = correlations;

    // Fetch recent anomalies (last 3 days, unresolved)
    const anomaliesSql = `
      SELECT metric_type, severity, description, detected_at
      FROM flo_health.detected_anomalies
      WHERE health_id = {healthId:String}
        AND toDate(detected_at) >= today() - 3
        AND (resolution_status IS NULL OR resolution_status = 'unresolved')
      ORDER BY detected_at DESC
      LIMIT 3
    `;
    const anomalies = await clickhouse.query<{ metric_type: string; severity: string; description: string; detected_at: string }>(
      anomaliesSql,
      { healthId }
    );
    context.recent_anomalies = anomalies;

    // Fetch recent subjective surveys (last 7 days)
    const surveysSql = `
      SELECT local_date, energy, clarity, mood
      FROM flo_health.subjective_surveys
      WHERE health_id = {healthId:String}
        AND local_date >= {startDate:Date}
        AND local_date < {eventDate:Date}
      ORDER BY local_date DESC
      LIMIT 7
    `;
    const surveys = await clickhouse.query<{ local_date: string; energy: number; clarity: number; mood: number }>(
      surveysSql,
      { healthId, startDate: startDate.toISOString().split('T')[0], eventDate }
    );
    context.recent_surveys = surveys;

    // Fetch past briefing feedback
    const feedbackSql = `
      SELECT 
        countIf(user_feedback = 'thumbs_up') as positive,
        countIf(user_feedback = 'thumbs_down') as negative
      FROM flo_health.morning_briefing_log
      WHERE health_id = {healthId:String}
        AND user_feedback IS NOT NULL
    `;
    const feedback = await clickhouse.query<{ positive: number; negative: number }>(
      feedbackSql,
      { healthId }
    );
    if (feedback.length > 0) {
      context.past_briefing_feedback = feedback[0];
    }

    // Fetch yesterday's workout
    const yesterdayDate = new Date(eventDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const workoutSql = `
      SELECT workout_type, duration_min, intensity
      FROM flo_health.healthkit_workouts
      WHERE health_id = {healthId:String}
        AND local_date = {yesterdayDate:Date}
      ORDER BY start_time DESC
      LIMIT 1
    `;
    const workouts = await clickhouse.query<{ workout_type: string; duration_min: number; intensity: string }>(
      workoutSql,
      { healthId, yesterdayDate: yesterdayDate.toISOString().split('T')[0] }
    );
    if (workouts.length > 0) {
      context.workout_yesterday = {
        type: workouts[0].workout_type,
        duration_minutes: workouts[0].duration_min,
        intensity: workouts[0].intensity,
      };
    }

    // Fetch notable behavior factors from yesterday (for sleep/recovery attribution)
    const behaviorSql = `
      SELECT 
        factor_category,
        factor_key,
        toFloat64(deviation_from_baseline * 100) as deviation_pct,
        is_notable
      FROM flo_health.daily_behavior_factors
      WHERE health_id = {healthId:String}
        AND local_date = {yesterdayDate:Date}
        AND is_notable = 1
      ORDER BY abs(deviation_from_baseline) DESC
      LIMIT 5
    `;
    const behaviorFactors = await clickhouse.query<{ factor_category: string; factor_key: string; deviation_pct: number; is_notable: number }>(
      behaviorSql,
      { healthId, yesterdayDate: yesterdayDate.toISOString().split('T')[0] }
    );
    context.behavior_attributions = behaviorFactors.map(f => ({
      factor_category: f.factor_category,
      factor_key: f.factor_key,
      deviation_pct: f.deviation_pct,
      is_notable: f.is_notable === 1,
    }));

    // Fetch recent causal insights from pending_correlation_feedback (today and yesterday)
    try {
      const { data: causalData } = await supabase
        .from('pending_correlation_feedback')
        .select('focus_metric, deviation_pct, likely_causes, whats_working, pattern_confidence, is_recurring_pattern')
        .eq('health_id', healthId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (causalData && causalData.length > 0) {
        context.causal_insights = causalData.map((c: any) => ({
          metric_type: c.focus_metric,
          deviation_pct: c.deviation_pct || 0,
          likely_causes: c.likely_causes || [],
          whats_working: c.whats_working || [],
          confidence: c.pattern_confidence || 0.3,
          is_recurring_pattern: c.is_recurring_pattern || false,
        }));
      }
    } catch (causalError) {
      logger.debug(`[MorningBriefing] Causal insights fetch failed: ${causalError}`);
    }

  } catch (error) {
    logger.warn(`[MorningBriefing] Error fetching rich context: ${error}`);
    // Continue with partial context
  }

  return context;
}

// ==================== AI GENERATION ====================

const MORNING_BRIEFING_SYSTEM_PROMPT = `You are Flō, a world-class data scientist and health coach delivering DEEPLY PERSONALIZED morning briefings. You have access to the user's complete health history - biometrics, sleep, workouts, life events, ML-discovered correlations, and anomaly detection.

## YOUR MISSION
Create a briefing that makes the user think "holy shit, this AI REALLY knows me." Every sentence MUST reference specific numbers, dates, or patterns from their data. NO generic advice.

## CRITICAL: USE THE USER'S NAME
The user's name is in user_profile.name. ALWAYS start the greeting with "Good morning [NAME]" - for example "Good morning Jonathan" or "Good morning Sarah". This is NON-NEGOTIABLE.

## MANDATORY DATA REFERENCES
You MUST cite specific metrics in every insight:
- "Your HRV hit 68ms today - that's 23% above your 52ms baseline"
- "Deep sleep was 94 minutes vs your usual 71 - the evening gym session at 6pm likely helped"
- "Your resting HR has dropped 4 bpm over the past week from 58 to 54"

## PERSONALIZATION RULES (NON-NEGOTIABLE)
1. **Life Events**: If present, ALWAYS mention them: "Day 3 post-Melbourne flight - jet lag typically peaks around now"
2. **Correlations**: If ML patterns exist, USE them: "Your data shows evening workouts boost deep sleep 18% - consider the gym after 5pm"
3. **Anomalies**: If detected, ADDRESS them: "Alert: RHR up 6bpm for 3 consecutive days - could be stress or oncoming illness"
4. **Surveys**: If trends exist, CITE them: "Energy rating trending up: 6.2 → 7.1 → 7.8 over the past 3 days"
5. **Yesterday's Workout**: ALWAYS connect: "That 52-min strength session is showing up as +18min deep sleep"
6. **ML Causal Attribution**: If behavior factors are present, EXPLAIN the WHY: "Your 3 sauna sessions yesterday (+200% above baseline) likely drove that exceptional deep sleep"
7. **ML Causal Insights**: If likely causes are identified, ATTRIBUTE outcomes: "Your HRV spike appears linked to yesterday's reduced alcohol intake and extended sleep window"
8. **Recurring Patterns**: If marked as recurring, EMPHASIZE: "This is a pattern we've seen 7 times before - your body consistently responds this way"

## OUTPUT LENGTH REQUIREMENTS
- greeting: 1-2 sentences with THE most striking metric (40-80 words)
- readiness_insight: 3-4 sentences with AT LEAST 3 specific numbers/comparisons (80-120 words)
- sleep_insight: 3-4 sentences connecting sleep to recent behaviors/events (80-120 words)
- recommendation: 4-5 sentences of SPECIFIC actions with times/durations (100-150 words)

## RESPONSE JSON FORMAT
{
  "primary_focus": "Most impactful insight with a specific number",
  "secondary_focus": "Second key insight with data reference",
  "recommended_actions": ["Specific action with time/duration", "Action 2 with metric target", "Action 3 tied to their patterns"],
  "push_text": "Punchy hook with a specific number (max 200 chars)",
  "briefing_content": {
    "greeting": "Personalized greeting citing their standout metric today",
    "readiness_insight": "Deep analysis with baseline comparisons, z-scores, and what it means for their day",
    "sleep_insight": "Sleep quality analysis connecting to life events, workouts, or patterns discovered",
    "recommendation": "Specific, actionable advice referencing their correlations and anomalies",
    "weather_note": "Weather impact on recommended activities (if applicable)"
  }
}

## EXAMPLES OF GOOD VS BAD

BAD: "You had good sleep last night. Keep it up!"
GOOD: "94 minutes of deep sleep - 32% above your 71-minute baseline. That 6pm gym session is paying dividends. Your body clearly responds to evening strength work."

BAD: "Your readiness is looking solid today."
GOOD: "Readiness at 87 with HRV 68ms (z-score +1.4). This is your 3rd day in a row above 80 - you're riding a recovery wave. Your Melbourne jet lag appears fully resolved."

BAD: "Consider staying hydrated."
GOOD: "With humidity at 45% and your elevated HRV, today's ideal for that Zone 2 run you've been skipping. Aim for 35-40 minutes before 10am - your data shows morning cardio correlates with 12% better afternoon focus."

## SAFETY NOTE
This is educational, not medical advice. For concerning patterns, add: "Consider discussing with your healthcare provider."`;

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
  richContext?: RichContext,
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

    // Build rich context section for AI
    const richContextSection = richContext ? `

## RICH PERSONALIZATION CONTEXT
Use this data to make the briefing deeply personal:

### Recent Life Events (last 7 days)
${richContext.recent_life_events.length > 0 
  ? richContext.recent_life_events.map(e => `- ${e.event_type}: ${e.description} (severity: ${e.severity}/10, ${e.occurred_at})`).join('\n')
  : 'No recent life events logged.'}

### ML-Discovered Correlations (from your historical data)
${richContext.discovered_correlations.length > 0
  ? richContext.discovered_correlations.map(c => `- ${c.behavior_type} → ${c.outcome_type}: ${c.direction} effect (${(c.effect_size * 100).toFixed(0)}% impact) - ${c.description}`).join('\n')
  : 'No significant correlations discovered yet.'}

### Recent Anomalies Detected
${richContext.recent_anomalies.length > 0
  ? richContext.recent_anomalies.map(a => `- ${a.metric_type} [${a.severity}]: ${a.description}`).join('\n')
  : 'No anomalies detected recently.'}

### Recent Subjective Surveys (self-reported 1-10 scale)
${richContext.recent_surveys.length > 0
  ? richContext.recent_surveys.map(s => `- ${s.local_date}: Energy ${s.energy}/10, Clarity ${s.clarity}/10, Mood ${s.mood}/10`).join('\n')
  : 'No recent survey data.'}

### Yesterday's Workout
${richContext.workout_yesterday 
  ? `${richContext.workout_yesterday.type} for ${richContext.workout_yesterday.duration_minutes} minutes (${richContext.workout_yesterday.intensity} intensity)`
  : 'No workout recorded yesterday.'}

### Your Briefing Feedback History
${richContext.past_briefing_feedback.positive > 0 || richContext.past_briefing_feedback.negative > 0
  ? `${richContext.past_briefing_feedback.positive} positive, ${richContext.past_briefing_feedback.negative} negative ratings`
  : 'No prior feedback.'}

### ML CAUSAL ATTRIBUTION (Yesterday's Notable Behaviors)
${richContext.behavior_attributions.length > 0
  ? `These behaviors from yesterday likely influenced today's recovery metrics:\n${richContext.behavior_attributions.map(b => 
      `- ${b.factor_category}/${b.factor_key}: ${b.deviation_pct > 0 ? '+' : ''}${b.deviation_pct.toFixed(0)}% vs baseline`
    ).join('\n')}`
  : 'No notable behavior deviations detected yesterday.'}

### ML CAUSAL INSIGHTS (Why Metrics Changed)
${richContext.causal_insights.length > 0
  ? richContext.causal_insights.map(ci => {
      const causes = ci.likely_causes?.length > 0 
        ? `Likely causes: ${ci.likely_causes.slice(0, 3).join(', ')}`
        : 'No clear causes identified';
      const working = ci.whats_working?.length > 0
        ? `What's working: ${ci.whats_working.slice(0, 2).join(', ')}`
        : '';
      const pattern = ci.is_recurring_pattern ? ' [RECURRING PATTERN]' : '';
      return `- ${ci.metric_type}: ${ci.deviation_pct > 0 ? '+' : ''}${ci.deviation_pct?.toFixed(0) || 0}% deviation${pattern}\n  ${causes}${working ? '\n  ' + working : ''}`;
    }).join('\n')
  : 'No causal insights generated for today.'}
` : '';

    // Format the prompt to clearly separate data sections for better AI comprehension
    const structuredPrompt = `## TODAY'S METRICS & BASELINES
${JSON.stringify(requestPayload, null, 2)}

${richContextSection ? `## PERSONALIZATION DATA (USE THIS!)
${richContextSection}

IMPORTANT: The above personalization data is CRITICAL. Reference specific life events, correlations, anomalies, and surveys in your response. Do NOT ignore this section.` : ''}

Generate a deeply personalized morning briefing following the system prompt format. Every insight MUST cite specific numbers from the data above.`;
    
    logger.debug(`[MorningBriefing] Sending prompt with ${richContextSection.length} chars of rich context`);
    logger.debug(`[MorningBriefing] Rich context preview: ${richContextSection.substring(0, 500)}...`);

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: structuredPrompt }],
        },
      ],
      config: {
        systemInstruction: MORNING_BRIEFING_SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      logger.error('[MorningBriefing] Empty response from Gemini', { 
        responseKeys: Object.keys(response || {}),
        candidates: (response as any)?.candidates?.length,
        promptFeedback: (response as any)?.promptFeedback 
      });
      return null;
    }
    
    logger.debug(`[MorningBriefing] Gemini response length: ${text.length} chars`);

    // Strip markdown code blocks if present (Gemini sometimes wraps in ```json)
    let cleanedText = text;
    if (text.includes('```json')) {
      cleanedText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    } else if (text.includes('```')) {
      cleanedText = text.replace(/```\s*/g, '');
    }
    
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
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
    
    // Get user's timezone to determine "today" in their local time
    const userResult = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
    const userTimezone = userResult[0]?.timezone || 'UTC';
    
    // Calculate today's date in user's timezone
    const { formatInTimeZone } = await import('date-fns-tz');
    const today = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');
    
    logger.debug(`[MorningBriefing] getTodaysBriefing for ${userId}: timezone=${userTimezone}, today=${today}`);

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

    logger.debug(`[MorningBriefing] getTodaysBriefing query result: ${rows.length} rows found, event_dates=${rows.map(r => r.event_date).join(',')}`);

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
    // Pass userId to enable readinessEngine lookup (single source of truth for readiness score)
    const insights = await aggregateDailyInsights(healthId, eventDate, userId);

    // Fetch user profile for personalization (use maybeSingle to tolerate missing profile)
    const [{ data: profile }, neonUser] = await Promise.all([
      supabase
        .from('profiles')
        .select('goals, briefing_preferences, first_name')
        .eq('health_id', healthId)
        .maybeSingle(),
      db.select({ firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(rows => rows[0] || null),
    ]);

    // Prefer Neon user's firstName, fall back to Supabase profile, then 'there'
    const userName = neonUser?.firstName || profile?.first_name || 'there';
    const userGoals = profile?.goals || [];
    const prefs = BriefingPreferencesSchema.safeParse(profile?.briefing_preferences);
    const preferences = prefs.success ? prefs.data : {
      enabled: true,
      notification_morning_hour: 7,
      preferred_tone: 'supportive' as const,
      show_weather: true,
      show_recommendations: true,
    };

    // Fetch rich context for personalization
    const richContext = await fetchRichContext(healthId, eventDate);
    logger.debug(`[MorningBriefing] Rich context for ${userId}: ${richContext.recent_life_events.length} life events, ${richContext.discovered_correlations.length} correlations, ${richContext.recent_anomalies.length} anomalies`);

    // Generate briefing via AI with rich context
    let briefingResponse = await generateMorningBriefing(
      insights,
      {
        name: userName,
        goals: userGoals,
        preferences,
      },
      richContext
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

    // Send push notification via APNs
    if (briefingResponse.push_text) {
      await sendBriefingPushNotification(userId, briefingId, briefingResponse.push_text, eventDate);
    }

    return briefingId;
  } catch (error) {
    logger.error(`[MorningBriefing] Error in generateBriefingForUser for ${userId}:`, error);
    return null;
  }
}

// ==================== PUSH NOTIFICATIONS ====================

async function sendBriefingPushNotification(
  userId: string, 
  briefingId: string, 
  pushText: string,
  eventDate: string
): Promise<void> {
  try {
    // Create notification log entry
    const [logEntry] = await db.insert(notificationLogs).values({
      userId,
      title: 'Your Morning Briefing is Ready',
      body: pushText.length > 200 ? pushText.substring(0, 197) + '...' : pushText,
      status: 'pending',
      contextData: { type: 'morning_briefing', briefingId, eventDate },
    }).returning();

    // Send via APNs
    const result = await apnsService.sendToUser(userId, {
      title: 'Good Morning ☀️',
      body: pushText.length > 200 ? pushText.substring(0, 197) + '...' : pushText,
      sound: 'default',
      interruptionLevel: 'time-sensitive',
      data: {
        type: 'morning_briefing',
        briefingId,
        eventDate,
      },
    }, logEntry?.id);

    if (result.success) {
      logger.info(`[MorningBriefing] Push notification sent for briefing ${briefingId} to ${result.devicesReached} device(s)`);
      
      // Update briefing push status
      await updateBriefingPushStatus(briefingId, 'sent');
    } else {
      logger.warn(`[MorningBriefing] Push notification failed for briefing ${briefingId}: ${result.error}`);
      await updateBriefingPushStatus(briefingId, 'failed');
    }
  } catch (error) {
    logger.error(`[MorningBriefing] Error sending push notification for ${briefingId}:`, error);
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
