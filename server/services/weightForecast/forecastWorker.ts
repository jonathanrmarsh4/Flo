/**
 * Forecast Worker Service for Weight & Body Composition Forecasting Engine
 * 
 * Polls the recompute queue and generates personalized weight forecasts with:
 * - Trend extraction and projection
 * - Uncertainty bands based on data quality
 * - Driver attribution
 * - Scenario simulation
 */

import { getClickHouseClient, isClickHouseEnabled } from '../clickhouseService';
import { createLogger } from '../../utils/logger';
import { GoogleGenAI } from '@google/genai';
import { trackGeminiUsage } from '../aiUsageTracker';

const logger = createLogger('ForecastWorker');

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      logger.warn('[ForecastWorker] GOOGLE_AI_API_KEY not configured - AI advice disabled');
      return null;
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

const POLL_INTERVAL_MS = 10000;
const BATCH_SIZE = 50;
const DEBOUNCE_WINDOW_SECONDS = 120;
const HORIZON_DAYS = 42;

interface DailyFeature {
  user_id: string;
  local_date_key: string;
  user_timezone: string;
  weight_kg: number | null;
  weight_trend_kg: number | null;
  weight_trend_slope_kg_per_day: number | null;
  water_volatility_score: number | null;
  steps: number | null;
  active_energy_kcal: number | null;
  workout_minutes: number | null;
  strength_sessions: number | null;
  sleep_duration_min: number | null;
  sleep_score: number | null;
  rhr: number | null;
  hrv: number | null;
  calories_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_coverage_pct: number | null;
  mean_glucose_mgdl: number | null;
  tir_pct: number | null;
  glucose_cv_pct: number | null;
  late_spike_flag: number | null;
  cgm_coverage_pct: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  body_comp_is_estimated: number | null;
  data_quality_weighins_per_week_14d: number | null;
  data_quality_staleness_days: number | null;
  data_quality_nutrition_days_14d: number | null;
  data_quality_cgm_days_14d: number | null;
}

interface ModelState {
  k_user_response: number;
  energy_balance_effective_kcal_per_day: number;
  water_noise_sigma: number;
  baseline_weight_trend_slope: number;
  last_trained_local_date_key: string | null;
}

interface UserGoal {
  goal_type: 'LOSE' | 'GAIN' | 'MAINTAIN' | null;
  target_weight_kg: number | null;
  target_date_local: string | null;
  start_weight_kg: number | null;
}

interface QueueItem {
  event_id: string;
  user_id: string;
  reason: string;
  priority: number;
  queued_at_utc: string;
}

interface ForecastResult {
  userId: string;
  success: boolean;
  error?: string;
}

type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type StatusChip = 'NEEDS_DATA' | 'AT_RISK' | 'ON_TRACK';

const BAND_MULTIPLIERS: Record<ConfidenceLevel, number> = {
  LOW: 1.8,
  MEDIUM: 1.2,
  HIGH: 0.9,
};

const DEFAULT_MODEL_STATE: ModelState = {
  k_user_response: 1.0,
  energy_balance_effective_kcal_per_day: 0.0,
  water_noise_sigma: 0.35,
  baseline_weight_trend_slope: 0.0,
  last_trained_local_date_key: null,
};

let workerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

interface ForecastDriver {
  rank: number;
  driver_id: string;
  title: string;
  subtitle: string | null;
  confidence_level: ConfidenceLevel;
  deeplink: string;
}

interface SimulatorResult {
  lever_id: string;
  lever_title: string;
  effort: 'Easy' | 'Medium' | 'Hard';
  forecast_low_kg_at_horizon: number | null;
  forecast_high_kg_at_horizon: number | null;
  eta_weeks: number | null;
  confidence_level: ConfidenceLevel;
}

const LEVERS_LOSE = [
  { lever_id: 'steps_plus_2000', title: '+2,000 steps/day', effort: 'Easy' as const, delta_E_kcal_per_day: -80, uncertainty_multiplier: 1.05 },
  { lever_id: 'protein_plus_25g', title: '+25g protein/day', effort: 'Easy' as const, delta_E_kcal_per_day: -40, uncertainty_multiplier: 1.0 },
  { lever_id: 'last_meal_minus_2h', title: 'Last meal 2h earlier', effort: 'Medium' as const, delta_E_kcal_per_day: -60, uncertainty_multiplier: 0.98 },
  { lever_id: 'deficit_250', title: '-250 kcal/day', effort: 'Medium' as const, delta_E_kcal_per_day: -250, uncertainty_multiplier: 1.0 },
];

const LEVERS_GAIN = [
  { lever_id: 'surplus_350', title: '+350 kcal/day', effort: 'Easy' as const, delta_E_kcal_per_day: 350, uncertainty_multiplier: 1.0 },
  { lever_id: 'protein_plus_30g', title: '+30g protein/day', effort: 'Easy' as const, delta_E_kcal_per_day: 50, uncertainty_multiplier: 0.95 },
  { lever_id: 'strength_plus_1', title: '+1 strength session/week', effort: 'Medium' as const, delta_E_kcal_per_day: 30, uncertainty_multiplier: 0.9 },
  { lever_id: 'surplus_500', title: '+500 kcal/day (aggressive)', effort: 'Hard' as const, delta_E_kcal_per_day: 500, uncertainty_multiplier: 1.1 },
];

const LEVERS_MAINTAIN = [
  { lever_id: 'steps_consistent', title: 'Keep 8k+ steps/day', effort: 'Easy' as const, delta_E_kcal_per_day: 0, uncertainty_multiplier: 0.9 },
  { lever_id: 'protein_maintain', title: 'Maintain 1.6g/kg protein', effort: 'Easy' as const, delta_E_kcal_per_day: 0, uncertainty_multiplier: 0.95 },
  { lever_id: 'strength_maintain', title: 'Keep 2+ strength sessions', effort: 'Medium' as const, delta_E_kcal_per_day: 0, uncertainty_multiplier: 0.9 },
];

async function pollQueueAndProcess(): Promise<void> {
  if (!isClickHouseEnabled() || isProcessing) {
    return;
  }

  const client = getClickHouseClient();
  if (!client) {
    return;
  }

  isProcessing = true;

  try {
    const queueItems = await fetchQueueItems(client);
    if (queueItems.length === 0) {
      return;
    }

    const dedupedUsers = dedupeByUser(queueItems);
    logger.info(`[ForecastWorker] Processing ${dedupedUsers.size} users from ${queueItems.length} queue items`);

    const results: ForecastResult[] = [];
    for (const [userId, item] of Array.from(dedupedUsers.entries())) {
      try {
        await processUserForecast(client, userId);
        results.push({ userId, success: true });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[ForecastWorker] Failed to process user ${userId}:`, error);
        results.push({ userId, success: false, error: errorMsg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`[ForecastWorker] Completed: ${successCount}/${results.length} forecasts generated`);

  } catch (error) {
    logger.error('[ForecastWorker] Error in poll cycle:', error);
  } finally {
    isProcessing = false;
  }
}

async function fetchQueueItems(client: any): Promise<QueueItem[]> {
  const cutoff = new Date(Date.now() - DEBOUNCE_WINDOW_SECONDS * 1000).toISOString();
  
  const result = await client.query({
    query: `
      SELECT 
        event_id,
        user_id,
        reason,
        priority,
        toString(queued_at_utc) AS queued_at_utc
      FROM flo_ml.recompute_queue
      WHERE queued_at_utc <= '${cutoff}'
      ORDER BY priority DESC, queued_at_utc ASC
      LIMIT ${BATCH_SIZE}
    `,
    format: 'JSONEachRow',
  });

  return await result.json() as QueueItem[];
}

function dedupeByUser(items: QueueItem[]): Map<string, QueueItem> {
  const userMap = new Map<string, QueueItem>();
  
  for (const item of items) {
    const existing = userMap.get(item.user_id);
    if (!existing || item.priority > existing.priority) {
      userMap.set(item.user_id, item);
    }
  }
  
  return userMap;
}

async function generateDailyAdvice(
  goal: UserGoal,
  currentMetrics: CurrentMetrics,
  forecast: ForecastBand,
  eta: EtaResult,
  drivers: ForecastDriver[],
  features: DailyFeature[],
  userId: string
): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    const goalType = goal.goal_type || 'MAINTAIN';
    const currentWeight = currentMetrics.currentWeightKg ?? 0;
    const targetWeight = goal.target_weight_kg;
    const weeklyRate = Math.abs(forecast.slopeKgPerDay * 7);
    const direction = forecast.slopeKgPerDay > 0 ? 'gaining' : forecast.slopeKgPerDay < 0 ? 'losing' : 'stable';
    
    const latest = features.length > 0 ? features[0] : null;
    const avgProtein = features.slice(0, 7).filter(f => f.protein_g !== null).map(f => f.protein_g!);
    const proteinAvg = avgProtein.length >= 3 ? Math.round(avgProtein.reduce((a, b) => a + b, 0) / avgProtein.length) : null;
    const avgSteps = features.slice(0, 7).filter(f => f.steps !== null).map(f => f.steps!);
    const stepsAvg = avgSteps.length >= 3 ? Math.round(avgSteps.reduce((a, b) => a + b, 0) / avgSteps.length) : null;
    const strengthSessions = features.slice(0, 7).filter(f => f.strength_sessions !== null).map(f => f.strength_sessions!).reduce((a, b) => a + b, 0);
    
    const cgmData = latest?.mean_glucose_mgdl !== null ? {
      meanGlucose: latest?.mean_glucose_mgdl,
      tirPct: latest?.tir_pct,
      lateSpikes: features.slice(0, 7).filter(f => f.late_spike_flag === 1).length,
    } : null;

    const topDrivers = drivers.slice(0, 3).map(d => d.title).join('; ');

    const systemPrompt = `You are Flō, an elite longevity coach and data scientist. Generate ONE personalized, motivational daily message (2-3 sentences max) for someone working on their weight goals.

Style:
- Be specific with numbers from the data
- Sound like a $10k/year concierge health coach
- Be encouraging but data-driven
- Vary your focus daily - don't always mention the same metrics
- If goal is GAIN: focus on surplus, protein, strength training, lean mass
- If goal is LOSE: focus on deficit, steps, protein to preserve muscle
- If goal is MAINTAIN: focus on consistency, stability, body composition
${cgmData ? '- Include glucose insights when relevant (meal timing, TIR, late spikes)' : ''}

End with one concrete action for today.`;

    const userPrompt = `Goal: ${goalType} weight
Current: ${currentWeight.toFixed(1)} kg${targetWeight ? ` → Target: ${targetWeight} kg` : ''}
Trend: ${direction} at ${weeklyRate.toFixed(2)} kg/week
${eta.etaWeeks ? `ETA to goal: ~${eta.etaWeeks} weeks` : ''}
${proteinAvg ? `7-day avg protein: ${proteinAvg}g` : ''}
${stepsAvg ? `7-day avg steps: ${stepsAvg}` : ''}
${strengthSessions > 0 ? `Strength sessions this week: ${strengthSessions}` : ''}
${cgmData ? `Glucose: avg ${Math.round(cgmData.meanGlucose!)} mg/dL, TIR ${cgmData.tirPct?.toFixed(0) || '--'}%, late spikes: ${cgmData.lateSpikes} in 7d` : ''}
Top priorities: ${topDrivers || 'Keep going!'}

Generate today's personalized advice.`;

    const startTime = Date.now();
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.8,
        maxOutputTokens: 200,
      },
    });

    const latencyMs = Date.now() - startTime;
    const adviceText = result.text?.trim() || null;

    const usage = result.usageMetadata;
    if (usage) {
      await trackGeminiUsage(
        'weight_daily_advice',
        'gemini-2.5-flash',
        {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
        {
          userId,
          latencyMs,
          status: adviceText ? 'success' : 'empty_response',
          metadata: { goalType },
        }
      ).catch(() => {});
    }

    if (adviceText) {
      logger.info(`[ForecastWorker] Generated AI advice for user ${userId}`, { latencyMs, length: adviceText.length });
    }

    return adviceText;
  } catch (error) {
    logger.error(`[ForecastWorker] Failed to generate AI advice for user ${userId}:`, error);
    return null;
  }
}

async function processUserForecast(client: any, userId: string): Promise<void> {
  const generatedAtUtc = new Date().toISOString();

  const dailyFeatures = await fetchDailyFeatures(client, userId);
  const modelState = await fetchModelState(client, userId);
  const goal = await fetchUserGoal(client, userId);

  const currentMetrics = deriveCurrentMetrics(dailyFeatures, goal);
  const { confidence, bandMultiplier, baseSigma } = computeConfidenceAndBandwidth(dailyFeatures, modelState);
  const forecast = generateForecast(dailyFeatures, modelState, currentMetrics, baseSigma, bandMultiplier);
  const eta = calculateEta(forecast, currentMetrics, goal);
  const statusChip = determineStatusChip(dailyFeatures, goal, eta, forecast.slopeKgPerDay);
  const drivers = generateDrivers(dailyFeatures, currentMetrics, goal, confidence);
  const simulatorResults = runSimulator(forecast, currentMetrics, goal, baseSigma, bandMultiplier, confidence);
  
  const dailyAdvice = await generateDailyAdvice(goal, currentMetrics, forecast, eta, drivers, dailyFeatures, userId);

  await writeForecastSummary(client, userId, generatedAtUtc, confidence, statusChip, currentMetrics, goal, forecast, eta, dailyAdvice);
  await writeForecastSeries(client, userId, generatedAtUtc, forecast, confidence);
  await writeDrivers(client, userId, generatedAtUtc, drivers);
  await writeSimulatorResults(client, userId, generatedAtUtc, simulatorResults);
  await updateModelState(client, userId, modelState, dailyFeatures);
  await cleanupProcessedQueue(client, userId);

  logger.info(`[ForecastWorker] Generated forecast for user ${userId}: confidence=${confidence}, status=${statusChip}, hasAdvice=${!!dailyAdvice}`);
}

async function fetchDailyFeatures(client: any, userId: string): Promise<DailyFeature[]> {
  const result = await client.query({
    query: `
      SELECT
        user_id,
        toString(local_date_key) AS local_date_key,
        user_timezone,
        weight_kg,
        weight_trend_kg,
        weight_trend_slope_kg_per_day,
        water_volatility_score,
        steps,
        active_energy_kcal,
        workout_minutes,
        strength_sessions,
        sleep_duration_min,
        sleep_score,
        rhr,
        hrv,
        calories_kcal,
        protein_g,
        carbs_g,
        fat_g,
        nutrition_coverage_pct,
        mean_glucose_mgdl,
        tir_pct,
        glucose_cv_pct,
        late_spike_flag,
        cgm_coverage_pct,
        body_fat_pct,
        lean_mass_kg,
        body_comp_is_estimated,
        data_quality_weighins_per_week_14d,
        data_quality_staleness_days,
        data_quality_nutrition_days_14d,
        data_quality_cgm_days_14d
      FROM flo_ml.daily_features FINAL
      WHERE user_id = '${userId}' AND local_date_key >= toString(today() - 120)
      ORDER BY local_date_key DESC
    `,
    format: 'JSONEachRow',
  });

  return await result.json() as DailyFeature[];
}

async function fetchModelState(client: any, userId: string): Promise<ModelState> {
  const result = await client.query({
    query: `
      SELECT
        k_user_response,
        energy_balance_effective_kcal_per_day,
        water_noise_sigma,
        baseline_weight_trend_slope,
        toString(last_trained_local_date_key) AS last_trained_local_date_key
      FROM flo_ml.model_state FINAL
      WHERE user_id = '${userId}'
      LIMIT 1
    `,
    format: 'JSONEachRow',
  });

  const rows = await result.json() as ModelState[];
  return rows.length > 0 ? rows[0] : { ...DEFAULT_MODEL_STATE };
}

async function fetchUserGoal(_client: any, userId: string): Promise<UserGoal> {
  try {
    const { getProfile } = await import('../supabaseHealthStorage');
    const profile = await getProfile(userId);
    const aiPersonalization = profile?.ai_personalization as Record<string, any> | null;
    const weightGoal = aiPersonalization?.weight_goal;
    
    if (weightGoal && weightGoal.goal_type) {
      return {
        goal_type: weightGoal.goal_type as 'LOSE' | 'GAIN' | 'MAINTAIN',
        target_weight_kg: weightGoal.target_weight_kg ?? null,
        target_date_local: weightGoal.target_date_local ?? null,
        start_weight_kg: weightGoal.start_weight_kg ?? null,
      };
    }
  } catch (error) {
    logger.error('[ForecastWorker] Error fetching user goal', error);
  }
  
  return {
    goal_type: null,
    target_weight_kg: null,
    target_date_local: null,
    start_weight_kg: null,
  };
}

interface CurrentMetrics {
  currentWeightKg: number | null;
  deltaVs7dAvgKg: number | null;
  progressPercent: number | null;
  latestBodyFatPct: number | null;
  latestLeanMassKg: number | null;
  stalenessDays: number;
  weighinsPerWeek14d: number;
}

function deriveCurrentMetrics(features: DailyFeature[], goal: UserGoal): CurrentMetrics {
  const withWeight = features.filter(f => f.weight_kg !== null);
  const currentWeightKg = withWeight.length > 0 ? withWeight[0].weight_kg : null;
  
  const last7Weights = withWeight.slice(0, 7).map(f => f.weight_kg!).filter(w => w !== null);
  const avg7d = last7Weights.length > 0 ? last7Weights.reduce((a, b) => a + b, 0) / last7Weights.length : null;
  const deltaVs7dAvgKg = (currentWeightKg !== null && avg7d !== null) ? currentWeightKg - avg7d : null;

  let progressPercent: number | null = null;
  if (goal.start_weight_kg !== null && goal.target_weight_kg !== null && currentWeightKg !== null) {
    const totalChange = goal.start_weight_kg - goal.target_weight_kg;
    if (Math.abs(totalChange) > 0.01) {
      const actualChange = goal.start_weight_kg - currentWeightKg;
      progressPercent = Math.max(0, Math.min(100, (actualChange / totalChange) * 100));
      if (goal.goal_type === 'GAIN') {
        progressPercent = Math.max(0, Math.min(100, (-actualChange / -totalChange) * 100));
      }
    }
  }

  const latestBodyFatPct = features.find(f => f.body_fat_pct !== null)?.body_fat_pct ?? null;
  const latestLeanMassKg = features.find(f => f.lean_mass_kg !== null)?.lean_mass_kg ?? null;
  
  const stalenessDays = features.length > 0 && features[0].data_quality_staleness_days !== null 
    ? features[0].data_quality_staleness_days 
    : 999;
  
  const weighinsPerWeek14d = features.length > 0 && features[0].data_quality_weighins_per_week_14d !== null
    ? features[0].data_quality_weighins_per_week_14d
    : 0;

  return {
    currentWeightKg,
    deltaVs7dAvgKg,
    progressPercent,
    latestBodyFatPct,
    latestLeanMassKg,
    stalenessDays,
    weighinsPerWeek14d,
  };
}

function computeConfidenceAndBandwidth(
  features: DailyFeature[],
  modelState: ModelState
): { confidence: ConfidenceLevel; bandMultiplier: number; baseSigma: number } {
  const latest = features.length > 0 ? features[0] : null;
  
  const weighinsPerWeek = latest?.data_quality_weighins_per_week_14d ?? 0;
  const stalenessDays = latest?.data_quality_staleness_days ?? 999;

  let confidence: ConfidenceLevel;
  if (weighinsPerWeek < 2 || stalenessDays > 7) {
    confidence = 'LOW';
  } else if (weighinsPerWeek >= 5 && stalenessDays <= 3) {
    confidence = 'HIGH';
  } else {
    confidence = 'MEDIUM';
  }

  const withWeight = features.filter(f => f.weight_kg !== null && f.weight_trend_kg !== null);
  const residuals = withWeight.slice(0, 14).map(f => Math.abs(f.weight_kg! - f.weight_trend_kg!));
  const avgResidual = residuals.length > 0 ? residuals.reduce((a, b) => a + b, 0) / residuals.length : 0.35;
  
  const baseSigma = Math.max(modelState.water_noise_sigma, avgResidual * 0.8);
  const bandMultiplier = BAND_MULTIPLIERS[confidence];

  return { confidence, bandMultiplier, baseSigma };
}

interface ForecastBand {
  series: Array<{ localDateKey: string; midKg: number; lowKg: number; highKg: number }>;
  slopeKgPerDay: number;
  horizonMidKg: number;
  horizonLowKg: number;
  horizonHighKg: number;
}

function generateForecast(
  features: DailyFeature[],
  _modelState: ModelState,
  currentMetrics: CurrentMetrics,
  baseSigma: number,
  bandMultiplier: number
): ForecastBand {
  const withTrend = features.filter(f => f.weight_trend_slope_kg_per_day !== null);
  let slopeKgPerDay = withTrend.length > 0 ? withTrend[0].weight_trend_slope_kg_per_day! : 0;
  
  if (withTrend.length >= 7) {
    const recentSlopes = withTrend.slice(0, 7).map(f => f.weight_trend_slope_kg_per_day!);
    slopeKgPerDay = recentSlopes.reduce((a, b) => a + b, 0) / recentSlopes.length;
  }

  const startWeight = currentMetrics.currentWeightKg ?? 70;
  const today = new Date();
  const series: Array<{ localDateKey: string; midKg: number; lowKg: number; highKg: number }> = [];

  for (let dayIndex = 1; dayIndex <= HORIZON_DAYS; dayIndex++) {
    const forecastDate = new Date(today);
    forecastDate.setDate(today.getDate() + dayIndex);
    const localDateKey = forecastDate.toISOString().split('T')[0];

    const midKg = startWeight + (slopeKgPerDay * dayIndex);
    const uncertainty = baseSigma * bandMultiplier * Math.sqrt(dayIndex / 7);
    const lowKg = midKg - uncertainty;
    const highKg = midKg + uncertainty;

    series.push({ localDateKey, midKg, lowKg, highKg });
  }

  const last = series[series.length - 1];

  return {
    series,
    slopeKgPerDay,
    horizonMidKg: last.midKg,
    horizonLowKg: last.lowKg,
    horizonHighKg: last.highKg,
  };
}

interface EtaResult {
  etaWeeks: number | null;
  etaUncertaintyWeeks: number | null;
}

function calculateEta(
  forecast: ForecastBand,
  currentMetrics: CurrentMetrics,
  goal: UserGoal
): EtaResult {
  if (goal.target_weight_kg === null || currentMetrics.currentWeightKg === null) {
    return { etaWeeks: null, etaUncertaintyWeeks: null };
  }

  const target = goal.target_weight_kg;
  const current = currentMetrics.currentWeightKg;
  const slope = forecast.slopeKgPerDay;

  if (Math.abs(slope) < 0.001) {
    return { etaWeeks: null, etaUncertaintyWeeks: null };
  }

  const delta = target - current;
  const isLosingGoal = goal.goal_type === 'LOSE';
  
  if ((isLosingGoal && slope >= 0) || (!isLosingGoal && slope <= 0)) {
    return { etaWeeks: null, etaUncertaintyWeeks: null };
  }

  const daysToGoal = delta / slope;
  if (daysToGoal <= 0 || daysToGoal > 365) {
    return { etaWeeks: null, etaUncertaintyWeeks: null };
  }

  const etaWeeks = daysToGoal / 7;
  const crossingPoint = forecast.series.find(s => 
    (isLosingGoal && s.midKg <= target) || (!isLosingGoal && s.midKg >= target)
  );
  
  let etaUncertaintyWeeks: number | null = null;
  if (crossingPoint) {
    const bandWidth = crossingPoint.highKg - crossingPoint.lowKg;
    etaUncertaintyWeeks = (bandWidth / Math.abs(slope)) / 7;
  }

  return { etaWeeks: Math.round(etaWeeks * 10) / 10, etaUncertaintyWeeks };
}

function determineStatusChip(
  features: DailyFeature[],
  goal: UserGoal,
  eta: EtaResult,
  slopeKgPerDay: number
): StatusChip {
  const latest = features.length > 0 ? features[0] : null;
  const stalenessDays = latest?.data_quality_staleness_days ?? 999;
  const hasRecentWeight = features.some(f => f.weight_kg !== null);

  if (!hasRecentWeight || stalenessDays > 7 || goal.goal_type === null) {
    return 'NEEDS_DATA';
  }

  if (goal.target_date_local && eta.etaWeeks !== null) {
    const targetDate = new Date(goal.target_date_local);
    const today = new Date();
    const daysToTarget = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksToTarget = daysToTarget / 7;
    
    if (eta.etaWeeks > weeksToTarget + 2) {
      return 'AT_RISK';
    }
  }

  const isLosingGoal = goal.goal_type === 'LOSE';
  if ((isLosingGoal && slopeKgPerDay > 0.01) || (!isLosingGoal && goal.goal_type === 'GAIN' && slopeKgPerDay < -0.01)) {
    return 'AT_RISK';
  }

  return 'ON_TRACK';
}

function generateDrivers(
  features: DailyFeature[],
  currentMetrics: CurrentMetrics,
  goal: UserGoal,
  confidence: ConfidenceLevel
): ForecastDriver[] {
  const drivers: ForecastDriver[] = [];
  const latest = features.length > 0 ? features[0] : null;

  if (!latest) {
    return drivers;
  }

  const recentFeatures = features.slice(0, 14);
  const goalType = goal.goal_type;
  const currentWeight = currentMetrics.currentWeightKg ?? 70;
  
  const avgCalories = recentFeatures.filter(f => f.calories_kcal !== null).map(f => f.calories_kcal!);
  const avgCal = avgCalories.length >= 3 ? avgCalories.reduce((a, b) => a + b, 0) / avgCalories.length : null;
  
  const avgProtein = recentFeatures.filter(f => f.protein_g !== null).map(f => f.protein_g!);
  const avgP = avgProtein.length >= 3 ? avgProtein.reduce((a, b) => a + b, 0) / avgProtein.length : null;
  
  const avgSteps = recentFeatures.filter(f => f.steps !== null).map(f => f.steps!);
  const avgS = avgSteps.length >= 7 ? avgSteps.reduce((a, b) => a + b, 0) / avgSteps.length : null;
  
  const avgStrength = recentFeatures.filter(f => f.strength_sessions !== null).map(f => f.strength_sessions!);
  const weeklyStrength = avgStrength.length >= 7 ? avgStrength.reduce((a, b) => a + b, 0) : null;
  
  const slope = latest.weight_trend_slope_kg_per_day ?? 0;
  const weeklyRate = Math.abs(slope * 7);
  
  const estimatedTDEE = 22 * currentWeight + (avgS ? avgS * 0.04 : 0) + (weeklyStrength ? weeklyStrength * 50 : 0);

  if (goalType === 'GAIN') {
    const targetProtein = Math.round(currentWeight * 1.8);
    const targetCalories = Math.round(estimatedTDEE + 350);
    
    if (slope > 0.01) {
      drivers.push({
        rank: 1,
        driver_id: 'gain_on_track',
        title: `Great progress: +${weeklyRate.toFixed(1)} kg/week`,
        subtitle: 'You\'re building mass at a healthy rate',
        confidence_level: confidence,
        deeplink: 'flo://weight/history',
      });
    } else if (slope <= 0) {
      const neededSurplus = Math.round(Math.abs(slope) * 7700 / 7 + 300);
      drivers.push({
        rank: 1,
        driver_id: 'gain_increase_calories',
        title: `Increase calories by ~${neededSurplus} kcal/day`,
        subtitle: avgCal ? `Currently ~${Math.round(avgCal)} kcal/day → aim for ${Math.round(avgCal + neededSurplus)}` : `Aim for ${targetCalories}+ kcal/day`,
        confidence_level: confidence,
        deeplink: 'flo://nutrition',
      });
    }
    
    if (avgP !== null && avgP < targetProtein) {
      drivers.push({
        rank: drivers.length + 1,
        driver_id: 'gain_protein_target',
        title: `Hit ${targetProtein}g protein daily`,
        subtitle: `Currently averaging ${Math.round(avgP)}g – need +${Math.round(targetProtein - avgP)}g`,
        confidence_level: 'HIGH',
        deeplink: 'flo://nutrition',
      });
    }
    
    if (weeklyStrength !== null && weeklyStrength < 3) {
      drivers.push({
        rank: drivers.length + 1,
        driver_id: 'gain_strength_sessions',
        title: 'Add more strength training',
        subtitle: `${weeklyStrength} sessions/week – aim for 3-4 to maximize lean mass`,
        confidence_level: 'MEDIUM',
        deeplink: 'flo://activity',
      });
    }
    
  } else if (goalType === 'LOSE') {
    const targetDeficit = 400;
    const targetCalories = Math.round(estimatedTDEE - targetDeficit);
    const targetProtein = Math.round(currentWeight * 1.6);
    
    if (slope < -0.01) {
      drivers.push({
        rank: 1,
        driver_id: 'lose_on_track',
        title: `On track: -${weeklyRate.toFixed(1)} kg/week`,
        subtitle: weeklyRate > 1 ? 'Consider slowing down to preserve muscle' : 'Sustainable pace – keep going!',
        confidence_level: confidence,
        deeplink: 'flo://weight/history',
      });
    } else if (slope >= 0) {
      const neededDeficit = Math.round(slope * 7700 / 7 + targetDeficit);
      drivers.push({
        rank: 1,
        driver_id: 'lose_create_deficit',
        title: `Create a ${neededDeficit} kcal/day deficit`,
        subtitle: avgCal ? `Currently ~${Math.round(avgCal)} kcal/day → aim for ${Math.round(avgCal - neededDeficit)}` : `Aim for ${targetCalories} kcal/day`,
        confidence_level: confidence,
        deeplink: 'flo://nutrition',
      });
    }
    
    if (avgP !== null && avgP < targetProtein) {
      drivers.push({
        rank: drivers.length + 1,
        driver_id: 'lose_protein_preserve',
        title: `Protect muscle: ${targetProtein}g protein`,
        subtitle: `Currently ${Math.round(avgP)}g/day – increase to preserve lean mass`,
        confidence_level: 'HIGH',
        deeplink: 'flo://nutrition',
      });
    }
    
    if (avgS !== null && avgS < 8000) {
      const extraSteps = 8000 - Math.round(avgS);
      const extraCal = Math.round(extraSteps * 0.04);
      drivers.push({
        rank: drivers.length + 1,
        driver_id: 'lose_increase_steps',
        title: `Add ${extraSteps.toLocaleString()} daily steps`,
        subtitle: `Burns ~${extraCal} extra kcal/day`,
        confidence_level: 'MEDIUM',
        deeplink: 'flo://activity',
      });
    }
    
  } else {
    if (Math.abs(slope) < 0.02) {
      drivers.push({
        rank: 1,
        driver_id: 'maintain_stable',
        title: 'Weight is stable',
        subtitle: 'You\'re maintaining well – keep doing what you\'re doing',
        confidence_level: confidence,
        deeplink: 'flo://weight/history',
      });
    } else {
      const direction = slope > 0 ? 'gaining' : 'losing';
      const adjustment = slope > 0 ? 'reduce' : 'increase';
      const amount = Math.round(Math.abs(slope) * 7700 / 7);
      drivers.push({
        rank: 1,
        driver_id: 'maintain_adjust',
        title: `Gradually ${direction} – ${adjustment} by ~${amount} kcal`,
        subtitle: `Small adjustment needed to maintain your weight`,
        confidence_level: confidence,
        deeplink: 'flo://nutrition',
      });
    }
  }

  const weighinsPerWeek = latest.data_quality_weighins_per_week_14d ?? 0;
  if (weighinsPerWeek < 3) {
    drivers.push({
      rank: drivers.length + 1,
      driver_id: 'weighin_frequency',
      title: 'Weigh in more often',
      subtitle: `Only ${weighinsPerWeek.toFixed(1)}/week – aim for 4+ for accurate tracking`,
      confidence_level: 'LOW',
      deeplink: 'flo://weight/log',
    });
  }

  const lateSpikes = recentFeatures.filter(f => f.late_spike_flag === 1).length;
  const hasCgmData = recentFeatures.some(f => f.mean_glucose_mgdl !== null);
  if (hasCgmData && lateSpikes >= 3) {
    drivers.push({
      rank: drivers.length + 1,
      driver_id: 'cgm_late_spikes',
      title: 'Optimize meal timing',
      subtitle: `${lateSpikes} glucose spikes after 8pm – try eating dinner earlier`,
      confidence_level: 'MEDIUM',
      deeplink: 'flo://cgm',
    });
  }
  
  const avgGlucose = recentFeatures.filter(f => f.mean_glucose_mgdl !== null).map(f => f.mean_glucose_mgdl!);
  if (avgGlucose.length >= 5) {
    const meanGlucose = avgGlucose.reduce((a, b) => a + b, 0) / avgGlucose.length;
    const avgTir = recentFeatures.filter(f => f.tir_pct !== null).map(f => f.tir_pct!);
    const tirPct = avgTir.length > 0 ? avgTir.reduce((a, b) => a + b, 0) / avgTir.length : null;
    
    if (tirPct !== null && tirPct < 70) {
      drivers.push({
        rank: drivers.length + 1,
        driver_id: 'cgm_improve_tir',
        title: 'Improve glucose stability',
        subtitle: `Time in range ${Math.round(tirPct)}% – try lower glycemic foods`,
        confidence_level: 'MEDIUM',
        deeplink: 'flo://cgm',
      });
    } else if (meanGlucose > 110) {
      drivers.push({
        rank: drivers.length + 1,
        driver_id: 'cgm_high_avg',
        title: 'Watch carb intake',
        subtitle: `Average glucose ${Math.round(meanGlucose)} mg/dL – consider reducing refined carbs`,
        confidence_level: 'MEDIUM',
        deeplink: 'flo://cgm',
      });
    }
  }

  return drivers.slice(0, 5);
}

function runSimulator(
  baseForecast: ForecastBand,
  currentMetrics: CurrentMetrics,
  goal: UserGoal,
  baseSigma: number,
  bandMultiplier: number,
  confidence: ConfidenceLevel
): SimulatorResult[] {
  const results: SimulatorResult[] = [];
  const startWeight = currentMetrics.currentWeightKg ?? 70;

  const levers = goal.goal_type === 'GAIN' ? LEVERS_GAIN 
    : goal.goal_type === 'MAINTAIN' ? LEVERS_MAINTAIN 
    : LEVERS_LOSE;

  for (const lever of levers) {
    const adjustedSlopeKgPerDay = baseForecast.slopeKgPerDay + (lever.delta_E_kcal_per_day / 7700);
    const adjustedBandMultiplier = bandMultiplier * lever.uncertainty_multiplier;
    
    const horizonMidKg = startWeight + (adjustedSlopeKgPerDay * HORIZON_DAYS);
    const uncertainty = baseSigma * adjustedBandMultiplier * Math.sqrt(HORIZON_DAYS / 7);
    const horizonLowKg = horizonMidKg - uncertainty;
    const horizonHighKg = horizonMidKg + uncertainty;

    let etaWeeks: number | null = null;
    if (goal.target_weight_kg !== null && Math.abs(adjustedSlopeKgPerDay) > 0.001) {
      const delta = goal.target_weight_kg - startWeight;
      const daysToGoal = delta / adjustedSlopeKgPerDay;
      if (daysToGoal > 0 && daysToGoal < 365) {
        etaWeeks = Math.round((daysToGoal / 7) * 10) / 10;
      }
    }

    results.push({
      lever_id: lever.lever_id,
      lever_title: lever.title,
      effort: lever.effort,
      forecast_low_kg_at_horizon: Math.round(horizonLowKg * 10) / 10,
      forecast_high_kg_at_horizon: Math.round(horizonHighKg * 10) / 10,
      eta_weeks: etaWeeks,
      confidence_level: confidence,
    });
  }

  return results;
}

async function writeForecastSummary(
  client: any,
  userId: string,
  generatedAtUtc: string,
  confidence: ConfidenceLevel,
  statusChip: StatusChip,
  currentMetrics: CurrentMetrics,
  goal: UserGoal,
  forecast: ForecastBand,
  eta: EtaResult,
  dailyAdvice: string | null
): Promise<void> {
  const sourceLabel = currentMetrics.stalenessDays <= 1 ? 'Apple Health' : 'Manual';
  const lastSyncRelative = currentMetrics.stalenessDays === 0 ? 'Today' 
    : currentMetrics.stalenessDays === 1 ? 'Yesterday' 
    : `${currentMetrics.stalenessDays} days ago`;

  await client.insert({
    table: 'flo_ml.forecast_summary',
    values: [{
      user_id: userId,
      generated_at_utc: generatedAtUtc,
      horizon_days: HORIZON_DAYS,
      confidence_level: confidence,
      status_chip: statusChip,
      current_weight_kg: currentMetrics.currentWeightKg,
      delta_vs_7d_avg_kg: currentMetrics.deltaVs7dAvgKg !== null ? Math.round(currentMetrics.deltaVs7dAvgKg * 100) / 100 : null,
      goal_target_weight_kg: goal.target_weight_kg,
      goal_target_date_local: goal.target_date_local,
      progress_percent: currentMetrics.progressPercent !== null ? Math.round(currentMetrics.progressPercent * 10) / 10 : null,
      forecast_weight_low_kg_at_horizon: Math.round(forecast.horizonLowKg * 10) / 10,
      forecast_weight_high_kg_at_horizon: Math.round(forecast.horizonHighKg * 10) / 10,
      eta_weeks: eta.etaWeeks,
      eta_uncertainty_weeks: eta.etaUncertaintyWeeks !== null ? Math.round(eta.etaUncertaintyWeeks * 10) / 10 : null,
      source_label: sourceLabel,
      last_sync_relative: lastSyncRelative,
      staleness_days: currentMetrics.stalenessDays,
      daily_advice: dailyAdvice,
      version_utc: generatedAtUtc,
    }],
    format: 'JSONEachRow',
  });
}

async function writeForecastSeries(
  client: any,
  userId: string,
  generatedAtUtc: string,
  forecast: ForecastBand,
  confidence: ConfidenceLevel
): Promise<void> {
  const rows = forecast.series.map(s => ({
    user_id: userId,
    generated_at_utc: generatedAtUtc,
    local_date_key: s.localDateKey,
    weight_mid_kg: Math.round(s.midKg * 10) / 10,
    weight_low_kg: Math.round(s.lowKg * 10) / 10,
    weight_high_kg: Math.round(s.highKg * 10) / 10,
    confidence_level: confidence,
  }));

  await client.insert({
    table: 'flo_ml.forecast_series',
    values: rows,
    format: 'JSONEachRow',
  });
}

async function writeDrivers(
  client: any,
  userId: string,
  generatedAtUtc: string,
  drivers: ForecastDriver[]
): Promise<void> {
  if (drivers.length === 0) return;

  const rows = drivers.map(d => ({
    user_id: userId,
    generated_at_utc: generatedAtUtc,
    rank: d.rank,
    driver_id: d.driver_id,
    title: d.title,
    subtitle: d.subtitle,
    confidence_level: d.confidence_level,
    deeplink: d.deeplink,
  }));

  await client.insert({
    table: 'flo_ml.forecast_drivers',
    values: rows,
    format: 'JSONEachRow',
  });
}

async function writeSimulatorResults(
  client: any,
  userId: string,
  generatedAtUtc: string,
  results: SimulatorResult[]
): Promise<void> {
  if (results.length === 0) return;

  const rows = results.map(r => ({
    user_id: userId,
    generated_at_utc: generatedAtUtc,
    lever_id: r.lever_id,
    lever_title: r.lever_title,
    effort: r.effort,
    forecast_low_kg_at_horizon: r.forecast_low_kg_at_horizon,
    forecast_high_kg_at_horizon: r.forecast_high_kg_at_horizon,
    eta_weeks: r.eta_weeks,
    confidence_level: r.confidence_level,
  }));

  await client.insert({
    table: 'flo_ml.simulator_results',
    values: rows,
    format: 'JSONEachRow',
  });
}

async function updateModelState(
  client: any,
  userId: string,
  currentState: ModelState,
  features: DailyFeature[]
): Promise<void> {
  const withWeight = features.filter(f => f.weight_kg !== null && f.weight_trend_kg !== null);
  
  if (withWeight.length < 14) {
    return;
  }

  const residuals = withWeight.slice(0, 14).map(f => Math.abs(f.weight_kg! - f.weight_trend_kg!));
  const newWaterNoiseSigma = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  
  const slopeValues = withWeight.slice(0, 14)
    .filter(f => f.weight_trend_slope_kg_per_day !== null)
    .map(f => f.weight_trend_slope_kg_per_day!);
  const avgSlope = slopeValues.length > 0 ? slopeValues.reduce((a, b) => a + b, 0) / slopeValues.length : 0;

  const today = new Date().toISOString().split('T')[0];

  await client.insert({
    table: 'flo_ml.model_state',
    values: [{
      user_id: userId,
      k_user_response: currentState.k_user_response,
      energy_balance_effective_kcal_per_day: avgSlope * 7700,
      water_noise_sigma: Math.max(0.2, Math.min(1.0, newWaterNoiseSigma)),
      baseline_weight_trend_slope: avgSlope,
      last_trained_local_date_key: today,
      version_utc: new Date().toISOString(),
    }],
    format: 'JSONEachRow',
  });
}

async function cleanupProcessedQueue(client: any, userId: string): Promise<void> {
  try {
    await client.command({
      query: `
        ALTER TABLE flo_ml.recompute_queue 
        DELETE WHERE user_id = '${userId}' AND queued_at_utc < now() - INTERVAL 1 MINUTE
      `,
    });
  } catch (error) {
    logger.warn(`[ForecastWorker] Failed to cleanup queue for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function startForecastWorker(): void {
  if (!isClickHouseEnabled()) {
    logger.info('[ForecastWorker] ClickHouse not enabled - skipping worker start');
    return;
  }

  if (workerInterval) {
    logger.warn('[ForecastWorker] Worker already running');
    return;
  }

  logger.info('[ForecastWorker] Starting forecast worker');

  workerInterval = setInterval(async () => {
    try {
      await pollQueueAndProcess();
    } catch (error) {
      logger.error('[ForecastWorker] Error in poll cycle:', error);
    }
  }, POLL_INTERVAL_MS);

  setTimeout(async () => {
    try {
      logger.info('[ForecastWorker] Running initial poll');
      await pollQueueAndProcess();
    } catch (error) {
      logger.error('[ForecastWorker] Error in initial poll:', error);
    }
  }, 5000);

  logger.info(`[ForecastWorker] Worker started - polling every ${POLL_INTERVAL_MS / 1000}s`);
}

export function stopForecastWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  logger.info('[ForecastWorker] Worker stopped');
}

export async function processUserForecastManual(userId: string): Promise<boolean> {
  if (!isClickHouseEnabled()) {
    return false;
  }

  const client = getClickHouseClient();
  if (!client) {
    return false;
  }

  try {
    await processUserForecast(client, userId);
    return true;
  } catch (error) {
    logger.error(`[ForecastWorker] Manual process failed for user ${userId}:`, error);
    return false;
  }
}

export interface WorkerStats {
  isRunning: boolean;
  isProcessing: boolean;
  pollIntervalMs: number;
  batchSize: number;
  horizonDays: number;
}

export function getWorkerStats(): WorkerStats {
  return {
    isRunning: workerInterval !== null,
    isProcessing,
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    horizonDays: HORIZON_DAYS,
  };
}
