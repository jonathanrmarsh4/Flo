/**
 * Weight & Body Composition Forecasting API Routes
 * 
 * Endpoints:
 * - GET /v1/weight/tile - Dashboard tile payload
 * - GET /v1/weight/overview - Full module overview
 * - POST /v1/weight/goal - Create/update goal
 * - POST /v1/weight/weigh-in - Manual weigh-in entry
 * - POST /v1/weight/body-comp - Manual body comp entry
 * - POST /v1/weight/forecast/recompute - Admin force recompute
 */

import { Router } from 'express';
import { z } from 'zod';
import { isAuthenticated } from '../replitAuth';
import { requireAdmin } from '../middleware/rbac';
import { createLogger } from '../utils/logger';
import { getClickHouseClient, isClickHouseEnabled } from '../services/clickhouseService';
import { queueForecastRecompute } from '../services/weightForecast/clickhouseSchema';
import { triggerBackfillIfNeeded } from '../services/clickhouseBackfillService';
import { processUserForecastManual } from '../services/weightForecast/forecastWorker';
import { v4 as uuidv4 } from 'uuid';
import * as supabaseHealthStorage from '../services/supabaseHealthStorage';

const logger = createLogger('WeightForecastRoutes');
const router = Router();

/**
 * Apply body fat correction from user profile.
 * User can calibrate their scale's body fat reading by setting a correction offset.
 * E.g., if scale shows 7% but DEXA shows 12%, user sets +5 correction.
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

interface ForecastSummary {
  user_id: string;
  generated_at_utc: string;
  horizon_days: number;
  confidence_level: string;
  status_chip: string;
  current_weight_kg: number | null;
  delta_vs_7d_avg_kg: number | null;
  goal_target_weight_kg: number | null;
  goal_target_date_local: string | null;
  progress_percent: number | null;
  forecast_weight_low_kg_at_horizon: number | null;
  forecast_weight_high_kg_at_horizon: number | null;
  eta_weeks: number | null;
  eta_uncertainty_weeks: number | null;
  source_label: string | null;
  last_sync_relative: string | null;
  staleness_days: number | null;
  daily_advice: string | null;
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

interface ForecastSeriesPoint {
  local_date_key: string;
  weight_mid_kg: number | null;
  weight_low_kg: number | null;
  weight_high_kg: number | null;
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
  
  if (features.length < 3) {
    return drivers;
  }
  
  const withWeight = features.filter(f => f.weight_kg !== null);
  if (withWeight.length < 2) {
    return drivers;
  }
  
  // Calculate simple trend from weight data using actual date difference
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
      drivers.push({
        rank: 1,
        driver_id: 'gain_on_track',
        title: `Good progress: +${weeklyRate.toFixed(1)} kg/week`,
        subtitle: 'You\'re building mass at a healthy rate',
        confidence_level: confidence,
        deeplink: 'flo://weight/history',
      });
    } else {
      drivers.push({
        rank: 1,
        driver_id: 'gain_increase_calories',
        title: 'Increase calories to gain weight',
        subtitle: 'Add 300-500 kcal/day to create a surplus',
        confidence_level: confidence,
        deeplink: 'flo://nutrition',
      });
    }
    drivers.push({
      rank: 2,
      driver_id: 'gain_protein_target',
      title: `Target ${Math.round(currentWeightKg * 1.8)}g protein daily`,
      subtitle: 'Protein supports muscle growth during weight gain',
      confidence_level: 'MEDIUM',
      deeplink: 'flo://nutrition',
    });
  } else if (goalType === 'LOSE') {
    if (slopeKgPerDay < -0.01) {
      drivers.push({
        rank: 1,
        driver_id: 'lose_on_track',
        title: `On track: -${weeklyRate.toFixed(1)} kg/week`,
        subtitle: weeklyRate > 1 ? 'Consider slowing down to preserve muscle' : 'Sustainable pace – keep going!',
        confidence_level: confidence,
        deeplink: 'flo://weight/history',
      });
    } else {
      drivers.push({
        rank: 1,
        driver_id: 'lose_create_deficit',
        title: 'Create a calorie deficit',
        subtitle: 'Aim for 300-500 kcal/day deficit for sustainable loss',
        confidence_level: confidence,
        deeplink: 'flo://nutrition',
      });
    }
    drivers.push({
      rank: 2,
      driver_id: 'lose_protein_preserve',
      title: `Maintain ${Math.round(currentWeightKg * 1.6)}g protein`,
      subtitle: 'High protein preserves muscle during weight loss',
      confidence_level: 'MEDIUM',
      deeplink: 'flo://nutrition',
    });
  } else {
    // MAINTAIN or no goal
    if (Math.abs(slopeKgPerDay) < 0.02) {
      drivers.push({
        rank: 1,
        driver_id: 'maintain_stable',
        title: 'Weight is stable',
        subtitle: 'You\'re maintaining well – keep up your current habits',
        confidence_level: confidence,
        deeplink: 'flo://weight/history',
      });
    } else {
      const direction = slopeKgPerDay > 0 ? 'increasing' : 'decreasing';
      drivers.push({
        rank: 1,
        driver_id: 'maintain_trend',
        title: `Weight ${direction} ${weeklyRate.toFixed(1)} kg/week`,
        subtitle: 'Small adjustments can help maintain your target',
        confidence_level: confidence,
        deeplink: 'flo://weight/history',
      });
    }
    drivers.push({
      rank: 2,
      driver_id: 'activity_consistency',
      title: 'Stay active consistently',
      subtitle: 'Aim for 8,000+ steps daily to support metabolism',
      confidence_level: 'MEDIUM',
      deeplink: 'flo://activity',
    });
  }
  
  // Add weigh-in frequency driver if applicable
  const latest = features[features.length - 1];
  const weighinsPerWeek = latest?.data_quality_weighins_per_week_14d ?? 0;
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

router.get('/tile', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    // Trigger ClickHouse backfill if needed (non-blocking)
    triggerBackfillIfNeeded(userId);
    
    // Fetch profile for body fat correction
    const [goal, profile] = await Promise.all([
      getUserGoal(userId),
      supabaseHealthStorage.getProfile(userId),
    ]);
    const bodyFatCorrectionPct = profile?.body_fat_correction_pct ?? 0;
    
    let summary: ForecastSummary | null = null;
    let bodyFatPct: number | null = null;
    let leanMassKg: number | null = null;
    let currentWeightKg: number | null = null;
    let sourceLabel: string | null = null;
    
    // Try ClickHouse first
    if (isClickHouseEnabled()) {
      const client = getClickHouseClient();
      if (client) {
        try {
          const result = await client.query({
            query: `
              SELECT
                user_id,
                toString(generated_at_utc) AS generated_at_utc,
                horizon_days,
                confidence_level,
                status_chip,
                current_weight_kg,
                delta_vs_7d_avg_kg,
                goal_target_weight_kg,
                toString(goal_target_date_local) AS goal_target_date_local,
                progress_percent,
                forecast_weight_low_kg_at_horizon,
                forecast_weight_high_kg_at_horizon,
                eta_weeks,
                eta_uncertainty_weeks,
                source_label,
                last_sync_relative,
                staleness_days,
                daily_advice
              FROM flo_ml.forecast_summary FINAL
              WHERE user_id = {userId:String}
              LIMIT 1
            `,
            query_params: { userId },
            format: 'JSONEachRow',
          });
          
          const rows = await result.json() as ForecastSummary[];
          summary = rows.length > 0 ? rows[0] : null;
          
          if (summary) {
            currentWeightKg = summary.current_weight_kg;
            sourceLabel = summary.source_label;
            
            const featuresResult = await client.query({
              query: `
                SELECT body_fat_pct, lean_mass_kg
                FROM flo_ml.daily_features FINAL
                WHERE user_id = {userId:String} AND body_fat_pct IS NOT NULL
                ORDER BY local_date_key DESC
                LIMIT 1
              `,
              query_params: { userId },
              format: 'JSONEachRow',
            });
            const featuresRows = await featuresResult.json() as { body_fat_pct: number | null; lean_mass_kg: number | null }[];
            if (featuresRows.length > 0) {
              bodyFatPct = featuresRows[0].body_fat_pct;
              leanMassKg = featuresRows[0].lean_mass_kg;
            }
          }
        } catch (chError) {
          logger.warn('[WeightForecast] ClickHouse query failed, falling back to Supabase:', { err: chError });
        }
      }
    }
    
    // Supabase fallback when ClickHouse has no data
    if (!currentWeightKg) {
      try {
        const metrics = await supabaseHealthStorage.getDailyMetricsFlexible(userId, { limit: 90 });
        
        // Find latest weight
        for (const m of metrics) {
          if (m.weight_kg && !currentWeightKg) {
            currentWeightKg = m.weight_kg;
            sourceLabel = 'Apple Health';
          }
          if (m.body_fat_percent && !bodyFatPct) {
            bodyFatPct = m.body_fat_percent;
          }
          if (m.lean_body_mass_kg && !leanMassKg) {
            leanMassKg = m.lean_body_mass_kg;
          }
          // Stop once we have all values
          if (currentWeightKg && bodyFatPct && leanMassKg) break;
        }
        
        if (currentWeightKg) {
          logger.info(`[WeightForecast] Using Supabase fallback for tile: weight=${currentWeightKg}kg`);
        }
      } catch (sbError) {
        logger.error('[WeightForecast] Supabase fallback failed:', { err: sbError });
      }
    }
    
    res.json({
      user_id: userId,
      generated_at_utc: summary?.generated_at_utc ?? null,
      status_chip: summary?.status_chip ?? (currentWeightKg ? 'DATA_AVAILABLE' : 'NEEDS_DATA'),
      confidence_level: summary?.confidence_level ?? 'LOW',
      current_weight_kg: currentWeightKg,
      delta_vs_7d_avg_kg: summary?.delta_vs_7d_avg_kg ?? null,
      body_fat_pct: applyBodyFatCorrection(bodyFatPct, bodyFatCorrectionPct),
      lean_mass_kg: leanMassKg,
      goal: {
        configured: goal.configured,
        goal_type: goal.goal_type,
        target_weight_kg: goal.target_weight_kg,
        target_date_local: goal.target_date_local,
      },
      progress_percent: summary?.progress_percent ?? null,
      forecast: {
        horizon_days: summary?.horizon_days ?? 42,
        weight_low_kg_at_horizon: summary?.forecast_weight_low_kg_at_horizon ?? null,
        weight_high_kg_at_horizon: summary?.forecast_weight_high_kg_at_horizon ?? null,
        eta_weeks: summary?.eta_weeks ?? null,
        eta_uncertainty_weeks: summary?.eta_uncertainty_weeks ?? null,
      },
      source: {
        label: sourceLabel,
        last_sync_relative: summary?.last_sync_relative ?? null,
        staleness_days: summary?.staleness_days ?? null,
      },
    });
  } catch (error) {
    logger.error('[WeightForecast] Error fetching tile:', error);
    res.status(500).json({ error: 'Failed to fetch weight tile' });
  }
});

router.get('/overview', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    logger.info(`[WeightForecast] Overview request for user ${userId}`);
    
    // Trigger ClickHouse backfill if needed (non-blocking)
    triggerBackfillIfNeeded(userId);
    
    const range = (req.query.range as string) || '30d';
    const rangeDays = range === '6m' ? 180 : range === '90d' ? 90 : 30;
    
    // Fetch profile for body fat correction
    const [goal, profile] = await Promise.all([
      getUserGoal(userId),
      supabaseHealthStorage.getProfile(userId),
    ]);
    const bodyFatCorrectionPct = profile?.body_fat_correction_pct ?? 0;
    
    let summary: ForecastSummary | null = null;
    let features: DailyFeature[] = [];
    let forecastSeries: ForecastSeriesPoint[] = [];
    let drivers: ForecastDriver[] = [];
    let simulatorResults: SimulatorResult[] = [];
    let currentWeightKg: number | null = null;
    let bodyFatPct: number | null = null;
    let leanMassKg: number | null = null;
    let sourceLabel: string | null = null;
    
    // Try ClickHouse first
    if (isClickHouseEnabled()) {
      const client = getClickHouseClient();
      if (client) {
        try {
          const [summaryResult, featuresResult, seriesResult, driversResult, simulatorResult] = await Promise.all([
            client.query({
              query: `
                SELECT
                  user_id,
                  toString(generated_at_utc) AS generated_at_utc,
                  horizon_days,
                  confidence_level,
                  status_chip,
                  current_weight_kg,
                  delta_vs_7d_avg_kg,
                  goal_target_weight_kg,
                  toString(goal_target_date_local) AS goal_target_date_local,
                  progress_percent,
                  forecast_weight_low_kg_at_horizon,
                  forecast_weight_high_kg_at_horizon,
                  eta_weeks,
                  eta_uncertainty_weeks,
                  source_label,
                  last_sync_relative,
                  staleness_days,
                  daily_advice
                FROM flo_ml.forecast_summary FINAL
                WHERE user_id = {userId:String}
                LIMIT 1
              `,
              query_params: { userId },
              format: 'JSONEachRow',
            }),
            client.query({
              query: `
                SELECT
                  toString(local_date_key) AS local_date_key,
                  weight_kg,
                  weight_trend_kg,
                  body_fat_pct,
                  lean_mass_kg,
                  data_quality_weighins_per_week_14d,
                  data_quality_staleness_days,
                  data_quality_nutrition_days_14d,
                  data_quality_cgm_days_14d
                FROM flo_ml.daily_features FINAL
                WHERE user_id = {userId:String} AND local_date_key >= today() - {rangeDays:UInt16}
                ORDER BY local_date_key ASC
              `,
              query_params: { userId, rangeDays },
              format: 'JSONEachRow',
            }),
            client.query({
              query: `
                SELECT
                  toString(local_date_key) AS local_date_key,
                  weight_mid_kg,
                  weight_low_kg,
                  weight_high_kg
                FROM flo_ml.forecast_series
                WHERE user_id = {userId:String}
                  AND generated_at_utc = (
                    SELECT max(generated_at_utc) FROM flo_ml.forecast_series WHERE user_id = {userId:String}
                  )
                ORDER BY local_date_key ASC
              `,
              query_params: { userId },
              format: 'JSONEachRow',
            }),
            client.query({
              query: `
                SELECT
                  rank,
                  driver_id,
                  title,
                  subtitle,
                  confidence_level,
                  deeplink
                FROM flo_ml.forecast_drivers
                WHERE user_id = {userId:String}
                  AND generated_at_utc = (
                    SELECT max(generated_at_utc) FROM flo_ml.forecast_drivers WHERE user_id = {userId:String}
                  )
                ORDER BY rank ASC
              `,
              query_params: { userId },
              format: 'JSONEachRow',
            }),
            client.query({
              query: `
                SELECT
                  lever_id,
                  lever_title,
                  effort,
                  forecast_low_kg_at_horizon,
                  forecast_high_kg_at_horizon,
                  eta_weeks,
                  confidence_level
                FROM flo_ml.simulator_results
                WHERE user_id = {userId:String}
                  AND generated_at_utc = (
                    SELECT max(generated_at_utc) FROM flo_ml.simulator_results WHERE user_id = {userId:String}
                  )
              `,
              query_params: { userId },
              format: 'JSONEachRow',
            }),
          ]);
          
          const summaryRows = await summaryResult.json() as ForecastSummary[];
          features = await featuresResult.json() as DailyFeature[];
          forecastSeries = await seriesResult.json() as ForecastSeriesPoint[];
          drivers = await driversResult.json() as ForecastDriver[];
          simulatorResults = await simulatorResult.json() as SimulatorResult[];
          
          summary = summaryRows.length > 0 ? summaryRows[0] : null;
          if (summary) {
            currentWeightKg = summary.current_weight_kg;
            sourceLabel = summary.source_label;
          }
          
          const latestFeature = features.length > 0 ? features[features.length - 1] : null;
          if (latestFeature) {
            bodyFatPct = latestFeature.body_fat_pct;
            leanMassKg = latestFeature.lean_mass_kg;
          }
        } catch (chError) {
          logger.warn('[WeightForecast] ClickHouse query failed, falling back to Supabase:', { err: chError });
        }
      }
    }
    
    // Supabase fallback when ClickHouse has no data
    if (!currentWeightKg || features.length === 0) {
      try {
        const metrics = await supabaseHealthStorage.getDailyMetricsFlexible(userId, { limit: rangeDays });
        
        // Build features array from Supabase data
        if (features.length === 0 && metrics.length > 0) {
          // Reverse to get ascending order by date
          const sortedMetrics = [...metrics].reverse();
          features = sortedMetrics
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
          
          logger.info(`[WeightForecast] Using Supabase fallback for overview: ${features.length} weight data points`);
        }
        
        // Find latest values from Supabase
        if (!currentWeightKg) {
          for (const m of metrics) {
            if (m.weight_kg && !currentWeightKg) {
              currentWeightKg = m.weight_kg;
              sourceLabel = 'Apple Health';
            }
            if (m.body_fat_percent && !bodyFatPct) {
              bodyFatPct = m.body_fat_percent;
            }
            if (m.lean_body_mass_kg && !leanMassKg) {
              leanMassKg = m.lean_body_mass_kg;
            }
            if (currentWeightKg && bodyFatPct && leanMassKg) break;
          }
        }
      } catch (sbError) {
        logger.error('[WeightForecast] Supabase fallback failed:', { err: sbError });
      }
    }
    
    const latestFeature = features.length > 0 ? features[features.length - 1] : null;
    
    // Auto-queue forecast recompute if user has weight data but no drivers/simulator results yet
    if (isClickHouseEnabled() && features.length >= 7 && drivers.length === 0) {
      logger.info(`[WeightForecast] Auto-queuing recompute for user ${userId}: has ${features.length} data points but no drivers`);
      queueForecastRecompute(userId, 'manual', 50).catch(err => {
        logger.warn('[WeightForecast] Failed to auto-queue recompute:', { err });
      });
    }
    
    // Generate inline drivers if we have features but no drivers from ClickHouse
    if (drivers.length === 0 && features.length >= 3 && currentWeightKg) {
      const inlineDrivers = generateInlineDrivers(features, currentWeightKg, goal);
      drivers.push(...inlineDrivers);
      logger.info(`[WeightForecast] Generated ${drivers.length} inline drivers for user ${userId}`);
    }
    
    // Generate inline simulator results if we have features but no results from ClickHouse
    if (simulatorResults.length === 0 && currentWeightKg) {
      const inlineSimResults = generateInlineSimulatorResults(currentWeightKg, goal);
      simulatorResults.push(...inlineSimResults);
    }
    
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
        generated_at_utc: summary?.generated_at_utc ?? null,
        status_chip: summary?.status_chip ?? (currentWeightKg ? 'DATA_AVAILABLE' : 'NEEDS_DATA'),
        confidence_level: summary?.confidence_level ?? 'LOW',
        current_weight_kg: currentWeightKg,
        delta_vs_7d_avg_kg: summary?.delta_vs_7d_avg_kg ?? null,
        body_fat_pct: applyBodyFatCorrection(bodyFatPct ?? latestFeature?.body_fat_pct ?? null, bodyFatCorrectionPct),
        lean_mass_kg: leanMassKg ?? latestFeature?.lean_mass_kg ?? null,
        goal: {
          configured: goal.configured,
          goal_type: goal.goal_type,
          target_weight_kg: goal.target_weight_kg,
          target_date_local: goal.target_date_local,
        },
        progress_percent: summary?.progress_percent ?? null,
        forecast: {
          horizon_days: summary?.horizon_days ?? 42,
          weight_low_kg_at_horizon: summary?.forecast_weight_low_kg_at_horizon ?? null,
          weight_high_kg_at_horizon: summary?.forecast_weight_high_kg_at_horizon ?? null,
          eta_weeks: summary?.eta_weeks ?? null,
          eta_uncertainty_weeks: summary?.eta_uncertainty_weeks ?? null,
        },
        source: {
          label: sourceLabel,
          last_sync_relative: summary?.last_sync_relative ?? null,
          staleness_days: summary?.staleness_days ?? null,
        },
        daily_advice: summary?.daily_advice ?? null,
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
        forecast_band: forecastSeries.map(f => ({
          local_date_key: f.local_date_key,
          low_kg: f.weight_low_kg,
          mid_kg: f.weight_mid_kg,
          high_kg: f.weight_high_kg,
        })),
      },
      drivers,
      simulator: {
        levers,
        results: simulatorResults,
      },
      data_quality: {
        weighins_per_week_14d: latestFeature?.data_quality_weighins_per_week_14d ?? null,
        staleness_days: latestFeature?.data_quality_staleness_days ?? null,
        nutrition_days_14d: latestFeature?.data_quality_nutrition_days_14d ?? null,
        cgm_days_14d: latestFeature?.data_quality_cgm_days_14d ?? null,
      },
    });
  } catch (error) {
    logger.error('[WeightForecast] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch weight overview' });
  }
});

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
    
    if (isClickHouseEnabled()) {
      await queueForecastRecompute(userId, 'goal_change', 10);
    }
    
    logger.info(`[WeightForecast] Goal saved for user ${userId}: ${goal.goal_type}`);
    res.json({ ok: true });
  } catch (error) {
    logger.error('[WeightForecast] Error saving goal:', error);
    res.status(500).json({ error: 'Failed to save goal' });
  }
});

router.post('/weigh-in', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const parseResult = weighInSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid weigh-in data', details: parseResult.error.errors });
    }
    
    const { timestamp_local, user_timezone, weight_kg } = parseResult.data;
    
    if (!isClickHouseEnabled()) {
      return res.status(503).json({ error: 'Weight tracking not available' });
    }
    
    const client = getClickHouseClient();
    if (!client) {
      return res.status(503).json({ error: 'Weight tracking not available' });
    }
    
    const eventId = uuidv4();
    const timestampUtc = new Date(timestamp_local).toISOString();
    const localDate = timestamp_local.split('T')[0];
    
    await client.insert({
      table: 'flo_ml.raw_weight_events',
      values: [{
        user_id: userId,
        event_id: eventId,
        timestamp_utc: timestampUtc,
        user_timezone: user_timezone,
        local_date_key: localDate,
        weight_kg: weight_kg,
        source_type: 'MANUAL',
        source_device_name: null,
        imported: 0,
        editable: 1,
        created_at_utc: new Date().toISOString(),
      }],
      format: 'JSONEachRow',
    });
    
    await queueForecastRecompute(userId, 'new_weigh_in', 20);
    
    logger.info(`[WeightForecast] Manual weigh-in saved for user ${userId}: ${weight_kg}kg`);
    res.json({ ok: true, event_id: eventId });
  } catch (error) {
    logger.error('[WeightForecast] Error saving weigh-in:', error);
    res.status(500).json({ error: 'Failed to save weigh-in' });
  }
});

router.post('/body-comp', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const parseResult = bodyCompSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid body comp data', details: parseResult.error.errors });
    }
    
    const { timestamp_local, user_timezone, body_fat_pct, lean_mass_kg, estimated } = parseResult.data;
    
    if (!body_fat_pct && !lean_mass_kg) {
      return res.status(400).json({ error: 'At least one of body_fat_pct or lean_mass_kg is required' });
    }
    
    if (!isClickHouseEnabled()) {
      return res.status(503).json({ error: 'Body composition tracking not available' });
    }
    
    const client = getClickHouseClient();
    if (!client) {
      return res.status(503).json({ error: 'Body composition tracking not available' });
    }
    
    const eventId = uuidv4();
    const timestampUtc = new Date(timestamp_local).toISOString();
    const localDate = timestamp_local.split('T')[0];
    
    await client.insert({
      table: 'flo_ml.raw_body_comp_events',
      values: [{
        user_id: userId,
        event_id: eventId,
        timestamp_utc: timestampUtc,
        user_timezone: user_timezone,
        local_date_key: localDate,
        body_fat_pct: body_fat_pct ?? null,
        lean_mass_kg: lean_mass_kg ?? null,
        source_type: 'MANUAL',
        source_device_name: null,
        estimated: estimated ? 1 : 0,
        imported: 0,
        editable: 1,
        created_at_utc: new Date().toISOString(),
      }],
      format: 'JSONEachRow',
    });
    
    await queueForecastRecompute(userId, 'new_weigh_in', 12);
    
    logger.info(`[WeightForecast] Body comp saved for user ${userId}: ${body_fat_pct ?? 'N/A'}% fat`);
    res.json({ ok: true, event_id: eventId });
  } catch (error) {
    logger.error('[WeightForecast] Error saving body comp:', error);
    res.status(500).json({ error: 'Failed to save body composition' });
  }
});

router.post('/forecast/recompute', isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const { user_id, reason } = req.body;
    
    if (!user_id || !reason) {
      return res.status(400).json({ error: 'user_id and reason are required' });
    }
    
    if (!isClickHouseEnabled()) {
      return res.status(503).json({ error: 'Weight forecasting not available' });
    }
    
    await queueForecastRecompute(user_id, 'manual', 255);
    
    logger.info(`[WeightForecast] Admin force recompute for user ${user_id}: ${reason}`);
    res.json({ ok: true });
  } catch (error) {
    logger.error('[WeightForecast] Error queueing recompute:', error);
    res.status(500).json({ error: 'Failed to queue recompute' });
  }
});

const executeSchema = z.object({
  user_id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100),
});

router.post('/forecast/execute', isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid user_id format', details: parsed.error.errors });
    }
    
    const { user_id } = parsed.data;
    
    if (!isClickHouseEnabled()) {
      return res.status(503).json({ error: 'Weight forecasting not available' });
    }
    
    logger.info(`[WeightForecast] Admin direct execute for user ${user_id}`);
    const success = await processUserForecastManual(user_id);
    
    if (success) {
      logger.info(`[WeightForecast] Successfully generated forecast for user ${user_id}`);
      res.json({ ok: true, message: 'Forecast generated successfully' });
    } else {
      logger.warn(`[WeightForecast] Failed to generate forecast for user ${user_id}`);
      res.status(500).json({ ok: false, error: 'Forecast generation failed - check server logs' });
    }
  } catch (error) {
    logger.error('[WeightForecast] Error executing forecast:', error);
    res.status(500).json({ error: 'Failed to execute forecast', details: String(error) });
  }
});

const userIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100);

/**
 * GET /v1/weight/goal-narrative
 * Returns the pre-generated AI narrative about the user's weight goal.
 * Narratives are generated by the scheduled forecast worker.
 * If no cached narrative exists, triggers on-demand generation.
 */
router.get('/goal-narrative', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    // Try ClickHouse first for cached narrative
    if (isClickHouseEnabled()) {
      const client = getClickHouseClient();
      if (client) {
        const result = await client.query({
          query: `
            SELECT 
              goal_narrative,
              daily_advice,
              generated_at_utc
            FROM flo_ml.forecast_summary FINAL
            WHERE user_id = {userId:String}
            ORDER BY generated_at_utc DESC
            LIMIT 1
          `,
          query_params: { userId },
          format: 'JSONEachRow',
        });
        
        const rows = await result.json() as Array<{ 
          goal_narrative: string | null; 
          daily_advice: string | null;
          generated_at_utc: string;
        }>;
        
        if (rows.length > 0) {
          const narrative = rows[0].goal_narrative || rows[0].daily_advice || null;
          if (narrative) {
            return res.json({
              narrative,
              generated_at: rows[0].generated_at_utc,
            });
          }
        }
        
        // No cached narrative - trigger on-demand generation
        logger.info(`[WeightForecast] No cached narrative for user ${userId}, triggering generation`);
        const success = await processUserForecastManual(userId);
        if (success) {
          // Fetch the newly generated narrative
          const freshResult = await client.query({
            query: `
              SELECT 
                goal_narrative,
                daily_advice,
                generated_at_utc
              FROM flo_ml.forecast_summary FINAL
              WHERE user_id = {userId:String}
              ORDER BY generated_at_utc DESC
              LIMIT 1
            `,
            query_params: { userId },
            format: 'JSONEachRow',
          });
          const freshRows = await freshResult.json() as Array<{ 
            goal_narrative: string | null; 
            daily_advice: string | null;
            generated_at_utc: string;
          }>;
          if (freshRows.length > 0) {
            const narrative = freshRows[0].goal_narrative || freshRows[0].daily_advice || null;
            return res.json({
              narrative,
              generated_at: freshRows[0].generated_at_utc,
            });
          }
        }
      }
    }
    
    // ClickHouse not available - return null (feature requires ClickHouse)
    return res.json({ narrative: null, generated_at: null });
  } catch (error) {
    logger.error('[WeightForecast] Error fetching goal narrative:', { err: error });
    res.status(500).json({ error: 'Failed to fetch goal narrative' });
  }
});

/**
 * POST /v1/weight/goal-why
 * Generates an on-demand full inspirational AI review of the user's current position.
 * This is more detailed than the cached narrative and always fresh.
 */
router.post('/goal-why', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI service not available' });
    }
    
    const { GoogleGenAI } = await import('@google/genai');
    const geminiClient = new GoogleGenAI({ apiKey });
    
    // Fetch user data from ClickHouse
    interface UserDataType {
      current_weight_kg: number | null;
      goal_type: string | null;
      goal_target_weight_kg: number | null;
      goal_target_date_local: string | null;
      progress_percent: number | null;
      eta_weeks: number | null;
      daily_advice: string | null;
      status_chip: string | null;
      confidence_level: string | null;
      forecast_weight_low_kg_at_horizon: number | null;
      forecast_weight_high_kg_at_horizon: number | null;
    }
    let userData: UserDataType | null = null;
    
    let drivers: Array<{ title: string; subtitle: string | null }> = [];
    let recentTrend: { direction: string; rate_kg_per_week: number } | null = null;
    
    if (isClickHouseEnabled()) {
      const client = getClickHouseClient();
      if (client) {
        // Get forecast summary
        const summaryResult = await client.query({
          query: `
            SELECT 
              current_weight_kg,
              goal_target_weight_kg,
              goal_target_date_local,
              goal_type,
              progress_percent,
              eta_weeks,
              daily_advice,
              status_chip,
              confidence_level,
              forecast_weight_low_kg_at_horizon,
              forecast_weight_high_kg_at_horizon
            FROM flo_ml.forecast_summary FINAL
            WHERE user_id = {userId:String}
            ORDER BY generated_at_utc DESC
            LIMIT 1
          `,
          query_params: { userId },
          format: 'JSONEachRow',
        });
        const summaryRows = await summaryResult.json() as UserDataType[];
        if (summaryRows.length > 0) {
          userData = summaryRows[0];
        }
        
        // Get drivers
        const driversResult = await client.query({
          query: `
            SELECT title, subtitle
            FROM flo_ml.forecast_drivers
            WHERE user_id = {userId:String}
            ORDER BY rank ASC
            LIMIT 5
          `,
          query_params: { userId },
          format: 'JSONEachRow',
        });
        drivers = await driversResult.json() as typeof drivers;
        
        // Get recent trend from daily features
        const trendResult = await client.query({
          query: `
            SELECT 
              weight_kg
            FROM flo_ml.daily_features
            WHERE user_id = {userId:String} AND weight_kg IS NOT NULL
            ORDER BY local_date_key DESC
            LIMIT 14
          `,
          query_params: { userId },
          format: 'JSONEachRow',
        });
        const trendRows = await trendResult.json() as Array<{ weight_kg: number }>;
        if (trendRows.length >= 2) {
          const latest = trendRows[0].weight_kg;
          const oldest = trendRows[trendRows.length - 1].weight_kg;
          const days = trendRows.length;
          const slopePerDay = (latest - oldest) / days;
          const ratePerWeek = slopePerDay * 7;
          recentTrend = {
            direction: slopePerDay > 0.01 ? 'gaining' : slopePerDay < -0.01 ? 'losing' : 'stable',
            rate_kg_per_week: Math.abs(ratePerWeek),
          };
        }
      }
    }
    
    if (!userData || !userData.goal_target_weight_kg) {
      return res.status(400).json({ error: 'No weight goal configured' });
    }
    
    const goalType = userData.goal_type || 'MAINTAIN';
    const currentWeight = userData.current_weight_kg ?? 0;
    const targetWeight = userData.goal_target_weight_kg;
    const remaining = Math.abs(currentWeight - targetWeight);
    const progressPct = userData.progress_percent ?? 0;
    const etaWeeks = userData.eta_weeks;
    const statusChip = userData.status_chip || 'UNKNOWN';
    
    const driversList = drivers.map(d => `- ${d.title}${d.subtitle ? `: ${d.subtitle}` : ''}`).join('\n');
    
    const systemPrompt = `You are Flō, an elite longevity coach and analytical health scientist. The user has clicked a "Why" button to understand deeply why they should stay on track with their weight goal.

Your mission is to deliver a powerful, data-driven inspirational message that:
1. Acknowledges their current position with SPECIFIC numbers from their data
2. Explains the science behind their progress (or lack thereof)
3. Connects their daily behaviors to their goal outcome
4. Projects what success looks like if they continue/improve
5. Ends with a motivating call to action

Style:
- Be analytical first, inspirational second
- Use specific numbers and percentages
- Reference their actual metrics
- Be encouraging but honest about challenges
- Write 4-6 sentences, max 200 words
- Don't use bullet points - write flowing prose

For ${goalType} goals:
${goalType === 'LOSE' ? '- Focus on sustainable fat loss, preserving muscle, metabolic health benefits' : ''}
${goalType === 'GAIN' ? '- Focus on lean mass gains, strength improvements, body composition optimization' : ''}
${goalType === 'MAINTAIN' ? '- Focus on consistency, metabolic stability, long-term health span' : ''}`;

    const userPrompt = `User's Current Data:
- Goal: ${goalType} weight to ${targetWeight} kg
- Current weight: ${currentWeight.toFixed(1)} kg
- Remaining: ${remaining.toFixed(1)} kg to goal
- Progress: ${progressPct.toFixed(0)}% complete
- Status: ${statusChip.replace('_', ' ')}
${recentTrend ? `- Recent trend: ${recentTrend.direction} at ${recentTrend.rate_kg_per_week.toFixed(2)} kg/week` : ''}
${etaWeeks ? `- Estimated time to goal: ~${etaWeeks} weeks` : ''}
${userData.goal_target_date_local ? `- Target date: ${userData.goal_target_date_local}` : ''}

Key Drivers Affecting Progress:
${driversList || '- No specific drivers identified yet'}

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
    
    // Track usage
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
        {
          userId,
          latencyMs,
          status: 'success',
          metadata: { goalType },
        }
      ).catch(() => {});
    }
    
    logger.info(`[WeightForecast] Generated goal-why for user ${userId}`, { latencyMs, length: whyText.length });
    
    res.json({
      why: whyText,
      generated_at: new Date().toISOString(),
      context: {
        current_weight_kg: currentWeight,
        target_weight_kg: targetWeight,
        progress_percent: progressPct,
        status: statusChip,
      },
    });
  } catch (error) {
    logger.error('[WeightForecast] Error generating goal-why:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

router.get('/debug/tables', isAuthenticated, requireAdmin, async (req: any, res) => {
  try {
    const userIdRaw = req.query.user_id as string | undefined;
    let userId: string | null = null;
    
    if (userIdRaw) {
      const parsed = userIdSchema.safeParse(userIdRaw);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid user_id format' });
      }
      userId = parsed.data;
    }
    
    if (!isClickHouseEnabled()) {
      return res.status(503).json({ error: 'ClickHouse not available' });
    }
    
    const client = getClickHouseClient();
    if (!client) {
      return res.status(503).json({ error: 'ClickHouse client not available' });
    }
    
    const queries = userId ? [
      { name: 'daily_features', query: 'SELECT count(*) as cnt FROM flo_ml.daily_features WHERE user_id = {userId:String}' },
      { name: 'forecast_summary', query: 'SELECT count(*) as cnt FROM flo_ml.forecast_summary FINAL WHERE user_id = {userId:String}' },
      { name: 'forecast_drivers', query: 'SELECT count(*) as cnt FROM flo_ml.forecast_drivers WHERE user_id = {userId:String}' },
      { name: 'simulator_results', query: 'SELECT count(*) as cnt FROM flo_ml.simulator_results WHERE user_id = {userId:String}' },
      { name: 'recompute_queue', query: 'SELECT count(*) as cnt FROM flo_ml.recompute_queue WHERE user_id = {userId:String}' },
    ] : [
      { name: 'daily_features', query: 'SELECT count(*) as cnt FROM flo_ml.daily_features' },
      { name: 'forecast_summary', query: 'SELECT count(*) as cnt FROM flo_ml.forecast_summary FINAL' },
      { name: 'forecast_drivers', query: 'SELECT count(*) as cnt FROM flo_ml.forecast_drivers' },
      { name: 'simulator_results', query: 'SELECT count(*) as cnt FROM flo_ml.simulator_results' },
      { name: 'recompute_queue', query: 'SELECT count(*) as cnt FROM flo_ml.recompute_queue' },
    ];
    
    const results: Record<string, number> = {};
    for (const q of queries) {
      const result = await client.query({ 
        query: q.query, 
        query_params: userId ? { userId } : {},
        format: 'JSONEachRow' 
      });
      const rows = await result.json() as { cnt: string }[];
      results[q.name] = parseInt(rows[0]?.cnt || '0', 10);
    }
    
    res.json({ user_id: userId || 'all', table_counts: results });
  } catch (error) {
    logger.error('[WeightForecast] Error querying debug tables:', error);
    res.status(500).json({ error: 'Failed to query tables', details: String(error) });
  }
});

/**
 * POST /v1/weight/ai-analysis
 * Generates AI-powered weight management analysis with structured recommendations
 */
router.post('/ai-analysis', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
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
