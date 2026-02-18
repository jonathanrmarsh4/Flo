/**
 * Weight & Body Composition Forecasting API Routes
 * 
 * Endpoints:
 * - GET /v1/weight/tile - Dashboard tile payload (Supabase-powered)
 * - GET /v1/weight/overview - Full module overview (Supabase-powered)
 * - GET /v1/weight/goal-narrative - AI-generated weight goal narrative
 * - POST /v1/weight/goal-why - On-demand AI weight goal motivation
 * - POST /v1/weight/goal - Create/update goal
 * - POST /v1/weight/weigh-in - Manual weigh-in entry (stored in Supabase)
 * - POST /v1/weight/body-comp - Manual body comp entry (stored in Supabase)
 * - POST /v1/weight/ai-analysis - AI-powered weight management analysis
 */

import { Router } from 'express';
import { z } from 'zod';
import { isAuthenticated } from '../replitAuth';
import { requireAdmin } from '../middleware/rbac';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import * as supabaseHealthStorage from '../services/supabaseHealthStorage';

const logger = createLogger('WeightForecastRoutes');
const router = Router();

/**
 * Apply body fat correction from user profile.
 * User can calibrate their scale's body fat reading by setting a correction offset.
 */
function applyBodyFatCorrection(rawBodyFatPct: number | null, correctionPct: number | null): number | null {
  if (rawBodyFatPct === null) return null;
  const correction = correctionPct ?? 0;
  return Math.round((rawBodyFatPct + correction) * 10) / 10;
}

const goalSchema = z.object({
  goal_type: z.enum(['LOSE', 'GAIN', 'MAINTAIN']),
  target_weight_kg: z.number().positive(),
  target_date_local: z.string().nullable().optional(),
  timeframe_weeks: z.number().positive().nullable().optional(),
  checkin_cadence: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY']).default('WEEKLY'),
  start_weight_kg: z.number().positive().optional(),
  preferences: z.object({
    training_intent: z.string().nullable().optional(),
    diet_style: z.string().nullable().optional(),
    meal_timing_preference: z.string().nullable().optional(),
  }).optional(),
});

const weighInSchema = z.object({
  timestamp_local: z.string(),
  user_timezone: z.string(),
  weight_kg: z.number().positive(),
  write_to_apple_health: z.boolean().optional().default(false),
});

const bodyCompSchema = z.object({
  timestamp_local: z.string(),
  user_timezone: z.string(),
  body_fat_pct: z.number().min(1).max(80).nullable().optional(),
  lean_mass_kg: z.number().positive().nullable().optional(),
  estimated: z.boolean().optional().default(false),
  write_to_apple_health: z.boolean().optional().default(false),
});

interface DailyFeature {
  local_date_key: string;
  weight_kg: number | null;
  weight_trend_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  data_quality_weighins_per_week_14d: number | null;
  data_quality_staleness_days: number | null;
  data_quality_nutrition_days_14d: number | null;
  data_quality_cgm_days_14d: number | null;
}

interface ForecastDriver {
  rank: number;
  driver_id: string;
  title: string;
  subtitle: string | null;
  confidence_level: string;
  deeplink: string;
}

interface SimulatorResult {
  lever_id: string;
  lever_title: string;
  effort: string;
  forecast_low_kg_at_horizon: number | null;
  forecast_high_kg_at_horizon: number | null;
  eta_weeks: number | null;
  confidence_level: string;
}

async function getUserGoal(userId: string): Promise<{
  configured: boolean;
  goal_type: string | null;
  target_weight_kg: number | null;
  target_date_local: string | null;
  start_weight_kg: number | null;
}> {
  try {
    const profile = await supabaseHealthStorage.getProfile(userId);
    const aiPersonalization = profile?.ai_personalization as Record<string, any> | null;
    const weightGoal = aiPersonalization?.weight_goal;
    
    if (weightGoal && weightGoal.goal_type) {
      return {
        configured: true,
        goal_type: weightGoal.goal_type,
        target_weight_kg: weightGoal.target_weight_kg ?? null,
        target_date_local: weightGoal.target_date_local ?? null,
        start_weight_kg: weightGoal.start_weight_kg ?? null,
      };
    }
  } catch (error) {
    logger.error('[WeightForecast] Error fetching user goal', error);
  }
  
  return {
    configured: false,
    goal_type: null,
    target_weight_kg: null,
    target_date_local: null,
    start_weight_kg: null,
  };
}

async function saveUserGoal(userId: string, goal: z.infer<typeof goalSchema>): Promise<void> {
  const profile = await supabaseHealthStorage.getProfile(userId);
  const aiPersonalization = (profile?.ai_personalization as Record<string, any>) || {};
  
  aiPersonalization.weight_goal = {
    goal_type: goal.goal_type,
    target_weight_kg: goal.target_weight_kg,
    target_date_local: goal.target_date_local ?? null,
    start_weight_kg: goal.start_weight_kg ?? null,
    checkin_cadence: goal.checkin_cadence,
    preferences: goal.preferences ?? null,
    updated_at: new Date().toISOString(),
  };
  
  await supabaseHealthStorage.upsertProfile(userId, {
    ai_personalization: aiPersonalization,
  });
}

function generateInlineDrivers(
  features: DailyFeature[],
  currentWeightKg: number,
  goal: { configured: boolean; goal_type: string | null; target_weight_kg: number | null; target_date_local: string | null; start_weight_kg: number | null }
): ForecastDriver[] {
  const drivers: ForecastDriver[] = [];
  
  if (features.length < 3) return drivers;
  
  const withWeight = features.filter(f => f.weight_kg !== null);
  if (withWeight.length < 2) return drivers;
  
  const latestWeight = withWeight[withWeight.length - 1].weight_kg!;
  const oldestWeight = withWeight[0].weight_kg!;
  const latestDate = new Date(withWeight[withWeight.length - 1].local_date_key);
  const oldestDate = new Date(withWeight[0].local_date_key);
  const daysSpan = Math.max(1, Math.round((latestDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24)));
  const slopeKgPerDay = daysSpan > 0 ? (latestWeight - oldestWeight) / daysSpan : 0;
  const weeklyRate = Math.abs(slopeKgPerDay * 7);
  
  const goalType = goal.goal_type;
  const confidence = 'LOW' as const;
  
  if (goalType === 'GAIN') {
    if (slopeKgPerDay > 0.01) {
      drivers.push({ rank: 1, driver_id: 'gain_on_track', title: `Good progress: +${weeklyRate.toFixed(1)} kg/week`, subtitle: "You're building mass at a healthy rate", confidence_level: confidence, deeplink: 'flo://weight/history' });
    } else {
      drivers.push({ rank: 1, driver_id: 'gain_increase_calories', title: 'Increase calories to gain weight', subtitle: 'Add 300-500 kcal/day to create a surplus', confidence_level: confidence, deeplink: 'flo://nutrition' });
    }
    drivers.push({ rank: 2, driver_id: 'gain_protein_target', title: `Target ${Math.round(currentWeightKg * 1.8)}g protein daily`, subtitle: 'Protein supports muscle growth during weight gain', confidence_level: 'MEDIUM', deeplink: 'flo://nutrition' });
  } else if (goalType === 'LOSE') {
    if (slopeKgPerDay < -0.01) {
      drivers.push({ rank: 1, driver_id: 'lose_on_track', title: `On track: -${weeklyRate.toFixed(1)} kg/week`, subtitle: weeklyRate > 1 ? 'Consider slowing down to preserve muscle' : 'Sustainable pace – keep going!', confidence_level: confidence, deeplink: 'flo://weight/history' });
    } else {
      drivers.push({ rank: 1, driver_id: 'lose_create_deficit', title: 'Create a calorie deficit', subtitle: 'Aim for 300-500 kcal/day deficit for sustainable loss', confidence_level: confidence, deeplink: 'flo://nutrition' });
    }
    drivers.push({ rank: 2, driver_id: 'lose_protein_preserve', title: `Maintain ${Math.round(currentWeightKg * 1.6)}g protein`, subtitle: 'High protein preserves muscle during weight loss', confidence_level: 'MEDIUM', deeplink: 'flo://nutrition' });
  } else {
    if (Math.abs(slopeKgPerDay) < 0.02) {
      drivers.push({ rank: 1, driver_id: 'maintain_stable', title: 'Weight is stable', subtitle: "You're maintaining well – keep up your current habits", confidence_level: confidence, deeplink: 'flo://weight/history' });
    } else {
      const direction = slopeKgPerDay > 0 ? 'increasing' : 'decreasing';
      drivers.push({ rank: 1, driver_id: 'maintain_trend', title: `Weight ${direction} ${weeklyRate.toFixed(1)} kg/week`, subtitle: 'Small adjustments can help maintain your target', confidence_level: confidence, deeplink: 'flo://weight/history' });
    }
    drivers.push({ rank: 2, driver_id: 'activity_consistency', title: 'Stay active consistently', subtitle: 'Aim for 8,000+ steps daily to support metabolism', confidence_level: 'MEDIUM', deeplink: 'flo://activity' });
  }
  
  return drivers.slice(0, 4);
}

function generateInlineSimulatorResults(
  currentWeightKg: number,
  goal: { configured: boolean; goal_type: string | null; target_weight_kg: number | null; target_date_local: string | null; start_weight_kg: number | null }
): SimulatorResult[] {
  const results: SimulatorResult[] = [];
  const horizonDays = 42;
  
  const levers = goal.goal_type === 'GAIN' ? [
    { lever_id: 'surplus_350', title: '+350 kcal/day', effort: 'Easy' as const, delta_E_kcal_per_day: 350 },
    { lever_id: 'protein_plus_30g', title: '+30g protein/day', effort: 'Easy' as const, delta_E_kcal_per_day: 50 },
    { lever_id: 'strength_plus_1', title: '+1 strength session/week', effort: 'Medium' as const, delta_E_kcal_per_day: 30 },
  ] : goal.goal_type === 'MAINTAIN' ? [
    { lever_id: 'steps_consistent', title: 'Keep 8k+ steps/day', effort: 'Easy' as const, delta_E_kcal_per_day: 0 },
    { lever_id: 'protein_maintain', title: 'Maintain 1.6g/kg protein', effort: 'Easy' as const, delta_E_kcal_per_day: 0 },
  ] : [
    { lever_id: 'steps_plus_2000', title: '+2,000 steps/day', effort: 'Easy' as const, delta_E_kcal_per_day: -80 },
    { lever_id: 'protein_plus_25g', title: '+25g protein/day', effort: 'Easy' as const, delta_E_kcal_per_day: -40 },
    { lever_id: 'last_meal_minus_2h', title: 'Last meal 2h earlier', effort: 'Medium' as const, delta_E_kcal_per_day: -60 },
  ];
  
  for (const lever of levers) {
    const slopeKgPerDay = lever.delta_E_kcal_per_day / 7700;
    const horizonMidKg = currentWeightKg + (slopeKgPerDay * horizonDays);
    const uncertainty = 0.5 * Math.sqrt(horizonDays / 7);
    
    let etaWeeks: number | null = null;
    if (goal.target_weight_kg && Math.abs(slopeKgPerDay) > 0.001) {
      const delta = goal.target_weight_kg - currentWeightKg;
      const daysToGoal = delta / slopeKgPerDay;
      if (daysToGoal > 0 && daysToGoal < 365) {
        etaWeeks = Math.round((daysToGoal / 7) * 10) / 10;
      }
    }
    
    results.push({
      lever_id: lever.lever_id,
      lever_title: lever.title,
      effort: lever.effort,
      forecast_low_kg_at_horizon: Math.round((horizonMidKg - uncertainty) * 10) / 10,
      forecast_high_kg_at_horizon: Math.round((horizonMidKg + uncertainty) * 10) / 10,
      eta_weeks: etaWeeks,
      confidence_level: 'LOW',
    });
  }
  
  return results;
}

/**
 * Generate a simple linear weight forecast from historical data.
 * Returns forecast band points for the next N days.
 */
function generateForecastBand(
  features: DailyFeature[],
  horizonDays: number = 42
): Array<{ local_date_key: string; low_kg: number; mid_kg: number; high_kg: number }> {
  const withWeight = features.filter(f => f.weight_kg !== null);
  if (withWeight.length < 5) return [];
  
  // Simple linear regression on recent weight data
  const n = withWeight.length;
  const xs = withWeight.map((_, i) => i);
  const ys = withWeight.map(f => f.weight_kg!);
  
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate residual std dev for uncertainty bands
  const residuals = ys.map((y, i) => y - (intercept + slope * i));
  const variance = residuals.reduce((acc, r) => acc + r * r, 0) / n;
  const stdDev = Math.sqrt(variance);
  
  const lastDate = new Date(withWeight[withWeight.length - 1].local_date_key);
  const result = [];
  
  for (let d = 1; d <= horizonDays; d++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + d);
    const dateKey = forecastDate.toISOString().split('T')[0];
    
    const forecastX = n - 1 + d;
    const midKg = intercept + slope * forecastX;
    // Uncertainty grows with time (proportional to sqrt of days ahead)
    const uncertainty = stdDev * Math.sqrt(d / 7) * 1.2;
    
    result.push({
      local_date_key: dateKey,
      low_kg: Math.round((midKg - uncertainty) * 10) / 10,
      mid_kg: Math.round(midKg * 10) / 10,
      high_kg: Math.round((midKg + uncertainty) * 10) / 10,
    });
  }
  
  return result;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /v1/weight/tile
 * Dashboard tile payload - current weight, body comp, goal progress
 */
router.get('/tile', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    const [goal, profile] = await Promise.all([
      getUserGoal(userId),
      supabaseHealthStorage.getProfile(userId),
    ]);
    const bodyFatCorrectionPct = profile?.body_fat_correction_pct ?? 0;
    
    let currentWeightKg: number | null = null;
    let bodyFatPct: number | null = null;
    let leanMassKg: number | null = null;
    let sourceLabel: string | null = null;
    
    const metrics = await supabaseHealthStorage.getDailyMetricsFlexible(userId, { limit: 90 });
    
    for (const m of metrics) {
      if (m.weight_kg && !currentWeightKg) {
        currentWeightKg = m.weight_kg;
        sourceLabel = 'Apple Health';
      }
      if (m.body_fat_percent && !bodyFatPct) bodyFatPct = m.body_fat_percent;
      if (m.lean_body_mass_kg && !leanMassKg) leanMassKg = m.lean_body_mass_kg;
      if (currentWeightKg && bodyFatPct && leanMassKg) break;
    }
    
    const correctedBodyFat = applyBodyFatCorrection(bodyFatPct, bodyFatCorrectionPct);
    
    // Calculate 7-day avg delta
    let delta7d: number | null = null;
    const recentWeights = metrics.filter(m => m.weight_kg != null).slice(0, 14);
    if (recentWeights.length >= 8) {
      const first7avg = recentWeights.slice(7, 14).reduce((acc, m) => acc + m.weight_kg!, 0) / Math.min(7, recentWeights.length - 7);
      const last7avg = recentWeights.slice(0, 7).reduce((acc, m) => acc + m.weight_kg!, 0) / 7;
      delta7d = Math.round((last7avg - first7avg) * 100) / 100;
    }
    
    res.json({
      summary: {
        status_chip: currentWeightKg ? 'DATA_AVAILABLE' : 'NEEDS_DATA',
        confidence_level: 'LOW',
        current_weight_kg: currentWeightKg,
        delta_vs_7d_avg_kg: delta7d,
        body_fat_pct: correctedBodyFat,
        lean_mass_kg: leanMassKg,
        goal: {
          configured: goal.configured,
          goal_type: goal.goal_type,
          target_weight_kg: goal.target_weight_kg,
          target_date_local: goal.target_date_local,
        },
        source: { label: sourceLabel },
      },
    });
  } catch (error) {
    logger.error('[WeightForecast] Error fetching tile:', error);
    res.status(500).json({ error: 'Failed to fetch weight tile' });
  }
});

/**
 * GET /v1/weight/overview
 * Full module overview with historical chart, forecast band, drivers, and simulator
 */
router.get('/overview', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const rangeDays = parseInt(req.query.range_days as string) || 90;
    
    const [goal, profile] = await Promise.all([
      getUserGoal(userId),
      supabaseHealthStorage.getProfile(userId),
    ]);
    const bodyFatCorrectionPct = profile?.body_fat_correction_pct ?? 0;
    
    let currentWeightKg: number | null = null;
    let bodyFatPct: number | null = null;
    let leanMassKg: number | null = null;
    let sourceLabel: string | null = null;
    
    const metrics = await supabaseHealthStorage.getDailyMetricsFlexible(userId, { limit: rangeDays });
    
    // Build features array from Supabase data (ascending date order)
    const sortedMetrics = [...metrics].reverse();
    const features: DailyFeature[] = sortedMetrics
      .filter(m => m.weight_kg !== null)
      .map(m => ({
        local_date_key: m.local_date,
        weight_kg: m.weight_kg ?? null,
        weight_trend_kg: null,
        body_fat_pct: m.body_fat_percent ?? null,
        lean_mass_kg: m.lean_body_mass_kg ?? null,
        data_quality_weighins_per_week_14d: null,
        data_quality_staleness_days: null,
        data_quality_nutrition_days_14d: null,
        data_quality_cgm_days_14d: null,
      }));
    
    for (const m of metrics) {
      if (m.weight_kg && !currentWeightKg) { currentWeightKg = m.weight_kg; sourceLabel = 'Apple Health'; }
      if (m.body_fat_percent && !bodyFatPct) bodyFatPct = m.body_fat_percent;
      if (m.lean_body_mass_kg && !leanMassKg) leanMassKg = m.lean_body_mass_kg;
      if (currentWeightKg && bodyFatPct && leanMassKg) break;
    }
    
    const latestFeature = features.length > 0 ? features[features.length - 1] : null;
    const correctedBodyFat = applyBodyFatCorrection(bodyFatPct ?? latestFeature?.body_fat_pct ?? null, bodyFatCorrectionPct);
    
    // Generate inline drivers
    const drivers: ForecastDriver[] = currentWeightKg && features.length >= 3
      ? generateInlineDrivers(features, currentWeightKg, goal)
      : [];
    
    // Generate inline simulator results
    const simulatorResults: SimulatorResult[] = currentWeightKg
      ? generateInlineSimulatorResults(currentWeightKg, goal)
      : [];
    
    // Generate AI forecast band from Supabase data
    const forecastBand = features.length >= 5
      ? generateForecastBand(features, 42)
      : [];
    
    const levers = goal.goal_type === 'GAIN' ? [
      { lever_id: 'surplus_350', title: '+350 kcal/day', effort: 'Easy' },
      { lever_id: 'protein_plus_30g', title: '+30g protein/day', effort: 'Easy' },
      { lever_id: 'strength_plus_1', title: '+1 strength session/week', effort: 'Medium' },
    ] : goal.goal_type === 'MAINTAIN' ? [
      { lever_id: 'steps_consistent', title: 'Keep 8k+ steps/day', effort: 'Easy' },
      { lever_id: 'protein_maintain', title: 'Maintain 1.6g/kg protein', effort: 'Easy' },
    ] : [
      { lever_id: 'steps_plus_2000', title: '+2,000 steps/day', effort: 'Easy' },
      { lever_id: 'protein_plus_25g', title: '+25g protein/day', effort: 'Easy' },
      { lever_id: 'last_meal_minus_2h', title: 'Last meal 2h earlier', effort: 'Medium' },
    ];
    
    res.json({
      summary: {
        user_id: userId,
        generated_at_utc: new Date().toISOString(),
        status_chip: currentWeightKg ? 'DATA_AVAILABLE' : 'NEEDS_DATA',
        confidence_level: features.length >= 14 ? 'MEDIUM' : 'LOW',
        current_weight_kg: currentWeightKg,
        delta_vs_7d_avg_kg: null,
        body_fat_pct: correctedBodyFat,
        lean_mass_kg: leanMassKg ?? latestFeature?.lean_mass_kg ?? null,
        goal: {
          configured: goal.configured,
          goal_type: goal.goal_type,
          target_weight_kg: goal.target_weight_kg,
          target_date_local: goal.target_date_local,
        },
        progress_percent: null,
        forecast: {
          horizon_days: 42,
          weight_low_kg_at_horizon: forecastBand.length > 0 ? forecastBand[forecastBand.length - 1].low_kg : null,
          weight_high_kg_at_horizon: forecastBand.length > 0 ? forecastBand[forecastBand.length - 1].high_kg : null,
          eta_weeks: null,
          eta_uncertainty_weeks: null,
        },
        source: {
          label: sourceLabel,
          last_sync_relative: null,
          staleness_days: null,
        },
        daily_advice: null,
      },
      series: {
        actual_weight_daily: features.map(f => ({
          local_date_key: f.local_date_key,
          value_kg: f.weight_kg,
        })),
        trend_weight_daily: features.map(f => ({
          local_date_key: f.local_date_key,
          value_kg: f.weight_trend_kg,
        })),
        forecast_band: forecastBand,
      },
      drivers,
      simulator: {
        levers,
        results: simulatorResults,
      },
      data_quality: {
        weighins_per_week_14d: null,
        staleness_days: null,
        nutrition_days_14d: null,
        cgm_days_14d: null,
      },
    });
  } catch (error) {
    logger.error('[WeightForecast] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch weight overview' });
  }
});

/**
 * POST /v1/weight/goal
 * Create or update user weight goal
 */
router.post('/goal', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const parseResult = goalSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid goal data', details: parseResult.error.errors });
    }
    
    const goal = parseResult.data;
    
    if (!goal.start_weight_kg) {
      const profile = await supabaseHealthStorage.getProfile(userId);
      goal.start_weight_kg = profile?.weight ?? undefined;
    }
    
    await saveUserGoal(userId, goal);
    
    logger.info(`[WeightForecast] Goal saved for user ${userId}: ${goal.goal_type}`);
    res.json({ ok: true });
  } catch (error) {
    logger.error('[WeightForecast] Error saving goal:', error);
    res.status(500).json({ error: 'Failed to save goal' });
  }
});

/**
 * POST /v1/weight/weigh-in
 * Manual weigh-in — saved directly to Supabase daily metrics
 */
router.post('/weigh-in', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const parseResult = weighInSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid weigh-in data', details: parseResult.error.errors });
    }
    
    const { timestamp_local, weight_kg } = parseResult.data;
    const localDate = timestamp_local.split('T')[0];
    const eventId = uuidv4();
    
    // Save to Supabase daily metrics via upsert
    const { getSupabaseClient } = await import('../services/supabaseClient');
    const { getHealthId } = await import('../services/supabaseHealthStorage');
    const supabase = getSupabaseClient();
    const healthId = await getHealthId(userId);
    
    await supabase
      .from('user_daily_metrics')
      .upsert({
        health_id: healthId,
        local_date: localDate,
        weight_kg: weight_kg,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'health_id,local_date',
        ignoreDuplicates: false,
      });
    
    logger.info(`[WeightForecast] Manual weigh-in saved for user ${userId}: ${weight_kg}kg`);
    res.json({ ok: true, event_id: eventId });
  } catch (error) {
    logger.error('[WeightForecast] Error saving weigh-in:', error);
    res.status(500).json({ error: 'Failed to save weigh-in' });
  }
});

/**
 * POST /v1/weight/body-comp
 * Manual body composition entry — saved directly to Supabase
 */
router.post('/body-comp', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const parseResult = bodyCompSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid body comp data', details: parseResult.error.errors });
    }
    
    const { timestamp_local, body_fat_pct, lean_mass_kg } = parseResult.data;
    
    if (!body_fat_pct && !lean_mass_kg) {
      return res.status(400).json({ error: 'At least one of body_fat_pct or lean_mass_kg is required' });
    }
    
    const localDate = timestamp_local.split('T')[0];
    const eventId = uuidv4();
    
    const { getSupabaseClient } = await import('../services/supabaseClient');
    const { getHealthId } = await import('../services/supabaseHealthStorage');
    const supabase = getSupabaseClient();
    const healthId = await getHealthId(userId);
    
    const updatePayload: Record<string, any> = {
      health_id: healthId,
      local_date: localDate,
      updated_at: new Date().toISOString(),
    };
    if (body_fat_pct !== null && body_fat_pct !== undefined) updatePayload.body_fat_percent = body_fat_pct;
    if (lean_mass_kg !== null && lean_mass_kg !== undefined) updatePayload.lean_body_mass_kg = lean_mass_kg;
    
    await supabase
      .from('user_daily_metrics')
      .upsert(updatePayload, {
        onConflict: 'health_id,local_date',
        ignoreDuplicates: false,
      });
    
    logger.info(`[WeightForecast] Body comp saved for user ${userId}: ${body_fat_pct ?? 'N/A'}% fat`);
    res.json({ ok: true, event_id: eventId });
  } catch (error) {
    logger.error('[WeightForecast] Error saving body comp:', error);
    res.status(500).json({ error: 'Failed to save body composition' });
  }
});

/**
 * GET /v1/weight/goal-narrative
 * AI-generated narrative about the user's weight goal and current trajectory
 */
router.get('/goal-narrative', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    const [goal, metrics] = await Promise.all([
      getUserGoal(userId),
      supabaseHealthStorage.getDailyMetricsFlexible(userId, { limit: 14 }),
    ]);
    
    if (!goal.configured || !goal.target_weight_kg) {
      return res.json({ narrative: null, generated_at: null });
    }
    
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return res.json({ narrative: null, generated_at: null });
    }
    
    const recentWeights = metrics.filter(m => m.weight_kg != null).slice(0, 7);
    const currentWeight = recentWeights[0]?.weight_kg ?? null;
    
    if (!currentWeight) {
      return res.json({ narrative: null, generated_at: null });
    }
    
    const remaining = Math.abs(currentWeight - goal.target_weight_kg);
    const direction = goal.goal_type === 'LOSE' ? 'lose' : goal.goal_type === 'GAIN' ? 'gain' : 'maintain';
    
    const { GoogleGenAI } = await import('@google/genai');
    const geminiClient = new GoogleGenAI({ apiKey });
    
    const result = await geminiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Generate a 2-3 sentence motivating daily narrative for someone who wants to ${direction} weight. Current: ${currentWeight.toFixed(1)}kg, Target: ${goal.target_weight_kg}kg, Remaining: ${remaining.toFixed(1)}kg. Be encouraging and specific.` }] }],
      config: { temperature: 0.7, maxOutputTokens: 150 },
    });
    
    const narrative = result.text?.trim() || null;
    
    res.json({
      narrative,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[WeightForecast] Error fetching goal narrative:', { err: error });
    res.json({ narrative: null, generated_at: null });
  }
});

/**
 * POST /v1/weight/goal-why
 * Generates an on-demand full inspirational AI review of the user's current position.
 */
router.post('/goal-why', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI service not available' });
    }
    
    const [goal, metrics] = await Promise.all([
      getUserGoal(userId),
      supabaseHealthStorage.getDailyMetricsFlexible(userId, { limit: 30 }),
    ]);
    
    if (!goal.configured || !goal.target_weight_kg) {
      return res.status(400).json({ error: 'No weight goal configured' });
    }
    
    const recentWeights = metrics.filter(m => m.weight_kg != null);
    const currentWeight = recentWeights[0]?.weight_kg ?? null;
    
    if (!currentWeight) {
      return res.status(400).json({ error: 'No weight data available' });
    }
    
    const remaining = Math.abs(currentWeight - goal.target_weight_kg);
    const goalType = goal.goal_type || 'MAINTAIN';
    
    // Calculate recent trend
    let recentTrend = '';
    if (recentWeights.length >= 7) {
      const oldest = recentWeights[Math.min(6, recentWeights.length - 1)].weight_kg!;
      const slopePerDay = (currentWeight - oldest) / 7;
      const ratePerWeek = Math.abs(slopePerDay * 7);
      const direction = slopePerDay > 0.01 ? 'gaining' : slopePerDay < -0.01 ? 'losing' : 'stable';
      recentTrend = `Recent trend: ${direction} at ${ratePerWeek.toFixed(2)} kg/week`;
    }
    
    const { GoogleGenAI } = await import('@google/genai');
    const geminiClient = new GoogleGenAI({ apiKey });
    
    const systemPrompt = `You are Flō, an elite longevity coach. Deliver a powerful, data-driven inspirational message. Be analytical first, inspirational second. Use specific numbers. Write 4-6 sentences, max 200 words. Write flowing prose, no bullet points.`;
    
    const userPrompt = `User's Data:
- Goal: ${goalType} weight to ${goal.target_weight_kg} kg
- Current weight: ${currentWeight.toFixed(1)} kg  
- Remaining: ${remaining.toFixed(1)} kg to goal
${recentTrend ? `- ${recentTrend}` : ''}
${goal.target_date_local ? `- Target date: ${goal.target_date_local}` : ''}

Generate a deeply personalized "Why" message that helps them understand their position and motivates them to continue.`;
    
    const startTime = Date.now();
    const result = await geminiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 400,
      },
    });
    
    const latencyMs = Date.now() - startTime;
    const whyText = result.text?.trim() || null;
    
    if (!whyText) {
      return res.status(500).json({ error: 'Failed to generate response' });
    }
    
    const { trackGeminiUsage } = await import('../services/aiUsageTracker');
    const usage = result.usageMetadata;
    if (usage) {
      await trackGeminiUsage(
        'weight_goal_why',
        'gemini-2.5-flash',
        {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
        { userId, latencyMs, status: 'success', metadata: { goalType } }
      ).catch(() => {});
    }
    
    logger.info(`[WeightForecast] Generated goal-why for user ${userId}`, { latencyMs, length: whyText.length });
    
    res.json({
      why: whyText,
      generated_at: new Date().toISOString(),
      context: {
        current_weight_kg: currentWeight,
        target_weight_kg: goal.target_weight_kg,
        remaining_kg: remaining,
        goal_type: goalType,
      },
    });
  } catch (error) {
    logger.error('[WeightForecast] Error generating goal-why:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

/**
 * POST /v1/weight/ai-analysis
 * AI-powered weight management analysis with structured recommendations
 */
router.post('/ai-analysis', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    logger.info(`[WeightForecast] AI analysis requested for user ${userId}`);
    
    const { generateWeightAnalysis } = await import('../services/weightManagementAI');
    const analysis = await generateWeightAnalysis(userId);
    
    res.json(analysis);
  } catch (error) {
    logger.error('[WeightForecast] Error generating AI analysis:', error);
    res.status(500).json({ 
      error: 'Failed to generate AI analysis', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
