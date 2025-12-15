/**
 * Weight Management Context Builder
 * 
 * Builds the FLO_WEIGHT_CONTEXT_JSON for the AI Weight Management Analyst.
 * Aggregates weight, nutrition, energy, sleep, CGM, and life events data.
 */

import { createLogger } from '../utils/logger';
import { getClickHouseClient, isClickHouseEnabled } from './clickhouseService';
import * as supabaseHealth from './supabaseHealthStorage';
import {
  getProfile as getHealthRouterProfile,
  getSleepNights as getHealthRouterSleepNights,
  getLifeEvents as getHealthRouterLifeEvents,
  getNutritionDailyMetrics as getHealthRouterNutritionMetrics,
  getDailyMetrics as getHealthRouterDailyMetrics,
  isSupabaseHealthEnabled,
} from './healthStorageRouter';
import { calculateAgeFromBirthYear } from '@shared/utils/ageCalculation';

const logger = createLogger('WeightManagementContext');

export interface WeightContextJson {
  user_profile: {
    age: number | null;
    sex: string | null;
    height_cm: number | null;
    typical_activity: string | null;
    constraints: string[];
    preferences: string[];
    dietary_pattern: string | null;
  };
  goal: {
    target_weight_kg: number | null;
    target_date: string | null;
    body_fat_goal: number | null;
    priority: 'fat_loss' | 'muscle_gain' | 'maintenance' | 'recomposition' | null;
  };
  baseline_summary: {
    avg_weight_90d_kg: number | null;
    avg_weight_60d_kg: number | null;
    avg_weight_30d_kg: number | null;
    start_weight_kg: number | null;
  };
  weight_data: {
    daily_weights: Array<{
      date: string;
      weight_kg: number;
      source: string | null;
    }>;
    trend_7d_kg: number | null;
    trend_28d_kg: number | null;
    rate_kg_per_week: number | null;
    current_weight_kg: number | null;
    body_fat_pct: number | null;
  };
  nutrition_data: {
    avg_daily_calories_14d: number | null;
    avg_protein_g: number | null;
    avg_carbs_g: number | null;
    avg_fat_g: number | null;
    avg_fiber_g: number | null;
    avg_alcohol_g: number | null;
    avg_sodium_mg: number | null;
    days_tracked_14d: number;
    eating_window_hours: number | null;
    adherence_days: number;
  };
  energy_data: {
    bmr_estimate_kcal: number | null;
    tdee_estimate_kcal: number | null;
    avg_resting_energy_kcal: number | null;
    avg_active_burn_kcal: number | null;
    avg_steps_14d: number | null;
    avg_workout_minutes_14d: number | null;
  };
  sleep_recovery: {
    avg_sleep_duration_min: number | null;
    avg_sleep_quality_pct: number | null;
    avg_hrv_ms: number | null;
    avg_rhr_bpm: number | null;
    sleep_flag: 'good' | 'ok' | 'needs_work' | 'unknown';
  };
  cgm_data: {
    available: boolean;
    glucose_mean_mgdl: number | null;
    fasting_trend: string | null;
    time_in_range_pct: number | null;
    variability_cv_pct: number | null;
    nocturnal_stability: string | null;
  };
  notes_context: {
    recent_life_events: Array<{
      date: string;
      category: string;
      description: string;
    }>;
    travel_days_14d: number;
    illness_days_14d: number;
  };
  constraints: {
    time_budget: string | null;
    food_preferences: string[];
    intolerances: string[];
    wont_do_list: string[];
  };
  confidence_inputs: {
    weight_data_days: number;
    nutrition_data_days: number;
    cgm_data_days: number;
    sleep_data_days: number;
    overall_confidence: 'low' | 'medium' | 'high';
  };
}

export async function buildWeightManagementContext(userId: string): Promise<WeightContextJson> {
  logger.info(`[WeightManagementContext] Building context for user ${userId}`);

  const context: WeightContextJson = {
    user_profile: {
      age: null,
      sex: null,
      height_cm: null,
      typical_activity: null,
      constraints: [],
      preferences: [],
      dietary_pattern: null,
    },
    goal: {
      target_weight_kg: null,
      target_date: null,
      body_fat_goal: null,
      priority: null,
    },
    baseline_summary: {
      avg_weight_90d_kg: null,
      avg_weight_60d_kg: null,
      avg_weight_30d_kg: null,
      start_weight_kg: null,
    },
    weight_data: {
      daily_weights: [],
      trend_7d_kg: null,
      trend_28d_kg: null,
      rate_kg_per_week: null,
      current_weight_kg: null,
      body_fat_pct: null,
    },
    nutrition_data: {
      avg_daily_calories_14d: null,
      avg_protein_g: null,
      avg_carbs_g: null,
      avg_fat_g: null,
      avg_fiber_g: null,
      avg_alcohol_g: null,
      avg_sodium_mg: null,
      days_tracked_14d: 0,
      eating_window_hours: null,
      adherence_days: 0,
    },
    energy_data: {
      bmr_estimate_kcal: null,
      tdee_estimate_kcal: null,
      avg_resting_energy_kcal: null,
      avg_active_burn_kcal: null,
      avg_steps_14d: null,
      avg_workout_minutes_14d: null,
    },
    sleep_recovery: {
      avg_sleep_duration_min: null,
      avg_sleep_quality_pct: null,
      avg_hrv_ms: null,
      avg_rhr_bpm: null,
      sleep_flag: 'unknown',
    },
    cgm_data: {
      available: false,
      glucose_mean_mgdl: null,
      fasting_trend: null,
      time_in_range_pct: null,
      variability_cv_pct: null,
      nocturnal_stability: null,
    },
    notes_context: {
      recent_life_events: [],
      travel_days_14d: 0,
      illness_days_14d: 0,
    },
    constraints: {
      time_budget: null,
      food_preferences: [],
      intolerances: [],
      wont_do_list: [],
    },
    confidence_inputs: {
      weight_data_days: 0,
      nutrition_data_days: 0,
      cgm_data_days: 0,
      sleep_data_days: 0,
      overall_confidence: 'low',
    },
  };

  try {
    await Promise.all([
      populateUserProfile(userId, context),
      populateGoal(userId, context),
      populateWeightData(userId, context),
      populateNutritionData(userId, context),
      populateEnergyData(userId, context),
      populateSleepData(userId, context),
      populateCGMData(userId, context),
      populateLifeEvents(userId, context),
    ]);

    calculateConfidence(context);
    logger.info(`[WeightManagementContext] Context built successfully for user ${userId}`);
  } catch (error) {
    logger.error(`[WeightManagementContext] Error building context for user ${userId}:`, error);
  }

  return context;
}

async function populateUserProfile(userId: string, context: WeightContextJson): Promise<void> {
  try {
    const profile = await getHealthRouterProfile(userId);
    if (!profile) return;

    const birthYear = (profile as any).birth_year || (profile as any).birthYear;
    context.user_profile.age = calculateAgeFromBirthYear(birthYear);
    context.user_profile.sex = profile.sex || null;
    
    const height = profile.height;
    const heightUnit = (profile as any).height_unit || (profile as any).heightUnit;
    if (height) {
      context.user_profile.height_cm = heightUnit === 'inches' ? Math.round(height * 2.54) : height;
    }

    const goals = profile.goals;
    if (Array.isArray(goals)) {
      context.user_profile.preferences = goals;
    }

    const aiPersonalization = (profile as any).ai_personalization || (profile as any).aiPersonalization;
    if (aiPersonalization) {
      if (aiPersonalization.activity_level) {
        context.user_profile.typical_activity = aiPersonalization.activity_level;
      }
      if (aiPersonalization.dietary_preferences) {
        context.user_profile.dietary_pattern = aiPersonalization.dietary_preferences;
      }
      if (Array.isArray(aiPersonalization.food_intolerances)) {
        context.constraints.intolerances = aiPersonalization.food_intolerances;
      }
      if (Array.isArray(aiPersonalization.food_preferences)) {
        context.constraints.food_preferences = aiPersonalization.food_preferences;
      }
    }
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching user profile:', error);
  }
}

async function populateGoal(userId: string, context: WeightContextJson): Promise<void> {
  try {
    const profile = await supabaseHealth.getProfile(userId);
    const aiPersonalization = profile?.ai_personalization as Record<string, any> | null;
    const weightGoal = aiPersonalization?.weight_goal;

    if (weightGoal) {
      context.goal.target_weight_kg = weightGoal.target_weight_kg ?? null;
      context.goal.target_date = weightGoal.target_date_local ?? null;
      context.baseline_summary.start_weight_kg = weightGoal.start_weight_kg ?? null;

      const goalType = weightGoal.goal_type;
      if (goalType === 'LOSE') {
        context.goal.priority = 'fat_loss';
      } else if (goalType === 'GAIN') {
        context.goal.priority = 'muscle_gain';
      } else if (goalType === 'MAINTAIN') {
        context.goal.priority = 'maintenance';
      }
    }
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching goal:', error);
  }
}

async function populateWeightData(userId: string, context: WeightContextJson): Promise<void> {
  if (!isClickHouseEnabled()) {
    logger.debug('[WeightManagementContext] ClickHouse not enabled - skipping weight data');
    return;
  }

  const client = getClickHouseClient();
  if (!client) return;

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

    const weights = await client.query({
      query: `
        SELECT 
          local_date_key,
          weight_kg,
          source_type
        FROM flo_ml.raw_weight_events
        WHERE user_id = {userId:String}
          AND local_date_key >= {startDate:String}
        ORDER BY local_date_key ASC
      `,
      query_params: { userId, startDate: ninetyDaysAgoStr },
      format: 'JSONEachRow',
    });

    const weightRows = await weights.json() as Array<{
      local_date_key: string;
      weight_kg: number;
      source_type: string | null;
    }>;

    if (weightRows.length === 0) return;

    context.weight_data.daily_weights = weightRows.map(row => ({
      date: row.local_date_key,
      weight_kg: row.weight_kg,
      source: row.source_type,
    }));

    context.confidence_inputs.weight_data_days = weightRows.length;

    const latestWeight = weightRows[weightRows.length - 1].weight_kg;
    context.weight_data.current_weight_kg = latestWeight;

    const allWeights = weightRows.map(r => r.weight_kg);
    context.baseline_summary.avg_weight_90d_kg = Math.round(allWeights.reduce((a, b) => a + b, 0) / allWeights.length * 10) / 10;

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyDayWeights = weightRows.filter(r => new Date(r.local_date_key) >= sixtyDaysAgo).map(r => r.weight_kg);
    if (sixtyDayWeights.length > 0) {
      context.baseline_summary.avg_weight_60d_kg = Math.round(sixtyDayWeights.reduce((a, b) => a + b, 0) / sixtyDayWeights.length * 10) / 10;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDayWeights = weightRows.filter(r => new Date(r.local_date_key) >= thirtyDaysAgo).map(r => r.weight_kg);
    if (thirtyDayWeights.length > 0) {
      context.baseline_summary.avg_weight_30d_kg = Math.round(thirtyDayWeights.reduce((a, b) => a + b, 0) / thirtyDayWeights.length * 10) / 10;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDayWeights = weightRows.filter(r => new Date(r.local_date_key) >= sevenDaysAgo);
    if (sevenDayWeights.length >= 2) {
      const firstWeight = sevenDayWeights[0].weight_kg;
      const lastWeight = sevenDayWeights[sevenDayWeights.length - 1].weight_kg;
      context.weight_data.trend_7d_kg = Math.round((lastWeight - firstWeight) * 10) / 10;
    }

    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
    const twentyEightDayWeights = weightRows.filter(r => new Date(r.local_date_key) >= twentyEightDaysAgo);
    if (twentyEightDayWeights.length >= 2) {
      const firstWeight = twentyEightDayWeights[0].weight_kg;
      const lastWeight = twentyEightDayWeights[twentyEightDayWeights.length - 1].weight_kg;
      context.weight_data.trend_28d_kg = Math.round((lastWeight - firstWeight) * 10) / 10;

      const firstDate = new Date(twentyEightDayWeights[0].local_date_key);
      const lastDate = new Date(twentyEightDayWeights[twentyEightDayWeights.length - 1].local_date_key);
      const daysDiff = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
      const ratePerDay = (lastWeight - firstWeight) / daysDiff;
      context.weight_data.rate_kg_per_week = Math.round(ratePerDay * 7 * 100) / 100;
    }

    const bodyCompResult = await client.query({
      query: `
        SELECT body_fat_pct
        FROM flo_ml.raw_body_comp_events
        WHERE user_id = {userId:String}
        ORDER BY timestamp_utc DESC
        LIMIT 1
      `,
      query_params: { userId },
      format: 'JSONEachRow',
    });

    const bodyCompRows = await bodyCompResult.json() as Array<{ body_fat_pct: number | null }>;
    if (bodyCompRows.length > 0 && bodyCompRows[0].body_fat_pct) {
      context.weight_data.body_fat_pct = bodyCompRows[0].body_fat_pct;
    }
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching weight data:', error);
  }
}

async function populateNutritionData(userId: string, context: WeightContextJson): Promise<void> {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const nutritionData = await getHealthRouterNutritionMetrics(userId, {
      startDate: fourteenDaysAgo,
      endDate: new Date(),
    });

    if (!nutritionData || nutritionData.length === 0) return;

    context.confidence_inputs.nutrition_data_days = nutritionData.length;
    context.nutrition_data.days_tracked_14d = nutritionData.length;

    const withCalories = nutritionData.filter((d: any) => d.calories && d.calories > 0);
    if (withCalories.length > 0) {
      context.nutrition_data.avg_daily_calories_14d = Math.round(
        withCalories.reduce((sum: number, d: any) => sum + (d.calories || 0), 0) / withCalories.length
      );
      context.nutrition_data.adherence_days = withCalories.length;
    }

    const sumField = (field: string) => {
      const values = nutritionData.filter((d: any) => d[field] && d[field] > 0);
      if (values.length === 0) return null;
      return Math.round(values.reduce((sum: number, d: any) => sum + (d[field] || 0), 0) / values.length);
    };

    context.nutrition_data.avg_protein_g = sumField('protein');
    context.nutrition_data.avg_carbs_g = sumField('carbs');
    context.nutrition_data.avg_fat_g = sumField('fat');
    context.nutrition_data.avg_fiber_g = sumField('fiber');
    context.nutrition_data.avg_sodium_mg = sumField('sodium');
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching nutrition data:', error);
  }
}

async function populateEnergyData(userId: string, context: WeightContextJson): Promise<void> {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    let dailyMetrics: any[] = [];
    
    if (isSupabaseHealthEnabled()) {
      dailyMetrics = await supabaseHealth.getDailyMetrics(userId, 14);
    }

    if (!dailyMetrics || dailyMetrics.length === 0) return;

    const avgField = (field: string): number | null => {
      const values = dailyMetrics.filter((d: any) => d[field] != null && d[field] > 0);
      if (values.length === 0) return null;
      return Math.round(values.reduce((sum: number, d: any) => sum + d[field], 0) / values.length);
    };

    context.energy_data.avg_resting_energy_kcal = avgField('basal_energy');
    context.energy_data.avg_active_burn_kcal = avgField('active_energy');
    context.energy_data.avg_steps_14d = avgField('steps');
    context.energy_data.avg_workout_minutes_14d = avgField('workout_minutes');

    const restingEnergy = context.energy_data.avg_resting_energy_kcal;
    const activeEnergy = context.energy_data.avg_active_burn_kcal;
    if (restingEnergy) {
      context.energy_data.bmr_estimate_kcal = restingEnergy;
      if (activeEnergy) {
        context.energy_data.tdee_estimate_kcal = restingEnergy + activeEnergy;
      }
    }
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching energy data:', error);
  }
}

async function populateSleepData(userId: string, context: WeightContextJson): Promise<void> {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const sleepNights = await getHealthRouterSleepNights(userId, {
      startDate: fourteenDaysAgo,
      endDate: new Date(),
      limit: 14,
    });

    if (!sleepNights || sleepNights.length === 0) return;

    context.confidence_inputs.sleep_data_days = sleepNights.length;

    const sleepDurations = sleepNights
      .filter((s: any) => {
        const duration = s.total_sleep_min || s.totalSleepMin;
        return duration != null && duration > 180;
      })
      .map((s: any) => s.total_sleep_min || s.totalSleepMin);

    if (sleepDurations.length > 0) {
      context.sleep_recovery.avg_sleep_duration_min = Math.round(
        sleepDurations.reduce((a: number, b: number) => a + b, 0) / sleepDurations.length
      );
    }

    const efficiencies = sleepNights
      .filter((s: any) => {
        const eff = s.sleep_efficiency_pct || s.sleepEfficiencyPct;
        return eff != null;
      })
      .map((s: any) => s.sleep_efficiency_pct || s.sleepEfficiencyPct);

    if (efficiencies.length > 0) {
      context.sleep_recovery.avg_sleep_quality_pct = Math.round(
        efficiencies.reduce((a: number, b: number) => a + b, 0) / efficiencies.length
      );
    }

    const hrvValues = sleepNights
      .filter((s: any) => {
        const hrv = s.avg_hrv_ms || s.avgHrvMs;
        return hrv != null;
      })
      .map((s: any) => s.avg_hrv_ms || s.avgHrvMs);

    if (hrvValues.length > 0) {
      context.sleep_recovery.avg_hrv_ms = Math.round(
        hrvValues.reduce((a: number, b: number) => a + b, 0) / hrvValues.length
      );
    }

    const rhrValues = sleepNights
      .filter((s: any) => {
        const rhr = s.avg_rhr_bpm || s.avgRhrBpm || s.rhr;
        return rhr != null;
      })
      .map((s: any) => s.avg_rhr_bpm || s.avgRhrBpm || s.rhr);

    if (rhrValues.length > 0) {
      context.sleep_recovery.avg_rhr_bpm = Math.round(
        rhrValues.reduce((a: number, b: number) => a + b, 0) / rhrValues.length
      );
    }

    const avgDuration = context.sleep_recovery.avg_sleep_duration_min;
    const avgQuality = context.sleep_recovery.avg_sleep_quality_pct;
    if (avgDuration !== null && avgQuality !== null) {
      if (avgDuration >= 420 && avgQuality >= 80) {
        context.sleep_recovery.sleep_flag = 'good';
      } else if (avgDuration >= 360 && avgQuality >= 70) {
        context.sleep_recovery.sleep_flag = 'ok';
      } else {
        context.sleep_recovery.sleep_flag = 'needs_work';
      }
    }
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching sleep data:', error);
  }
}

async function populateCGMData(userId: string, context: WeightContextJson): Promise<void> {
  if (!isClickHouseEnabled()) return;

  const client = getClickHouseClient();
  if (!client) return;

  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

    const cgmResult = await client.query({
      query: `
        SELECT 
          COUNT(*) as reading_count,
          AVG(mean_glucose_mgdl) as avg_glucose,
          AVG(tir_pct) as avg_tir,
          AVG(glucose_cv_pct) as avg_cv
        FROM flo_ml.raw_cgm_daily
        WHERE user_id = {userId:String}
          AND local_date_key >= {startDate:String}
      `,
      query_params: { userId, startDate: fourteenDaysAgoStr },
      format: 'JSONEachRow',
    });

    const cgmRows = await cgmResult.json() as Array<{
      reading_count: number;
      avg_glucose: number | null;
      avg_tir: number | null;
      avg_cv: number | null;
    }>;

    if (cgmRows.length > 0 && cgmRows[0].reading_count > 0) {
      context.cgm_data.available = true;
      context.cgm_data.glucose_mean_mgdl = cgmRows[0].avg_glucose ? Math.round(cgmRows[0].avg_glucose) : null;
      context.cgm_data.time_in_range_pct = cgmRows[0].avg_tir ? Math.round(cgmRows[0].avg_tir) : null;
      context.cgm_data.variability_cv_pct = cgmRows[0].avg_cv ? Math.round(cgmRows[0].avg_cv * 10) / 10 : null;
      context.confidence_inputs.cgm_data_days = cgmRows[0].reading_count;
    }
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching CGM data:', error);
  }
}

async function populateLifeEvents(userId: string, context: WeightContextJson): Promise<void> {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const lifeEvents = await getHealthRouterLifeEvents(userId, { startDate: fourteenDaysAgo });

    if (!lifeEvents || lifeEvents.length === 0) return;

    context.notes_context.recent_life_events = lifeEvents.slice(0, 10).map((event: any) => ({
      date: event.event_date || event.eventDate || new Date(event.created_at || event.createdAt).toISOString().split('T')[0],
      category: event.category || 'general',
      description: event.summary || event.description || 'Life event',
    }));

    const travelEvents = lifeEvents.filter((e: any) => 
      (e.category || '').toLowerCase().includes('travel') ||
      (e.summary || '').toLowerCase().includes('travel') ||
      (e.description || '').toLowerCase().includes('travel')
    );
    context.notes_context.travel_days_14d = travelEvents.length;

    const illnessEvents = lifeEvents.filter((e: any) => 
      (e.category || '').toLowerCase().includes('illness') ||
      (e.category || '').toLowerCase().includes('sick') ||
      (e.summary || '').toLowerCase().includes('sick') ||
      (e.description || '').toLowerCase().includes('sick')
    );
    context.notes_context.illness_days_14d = illnessEvents.length;
  } catch (error) {
    logger.error('[WeightManagementContext] Error fetching life events:', error);
  }
}

function calculateConfidence(context: WeightContextJson): void {
  const weightDays = context.confidence_inputs.weight_data_days;
  const nutritionDays = context.confidence_inputs.nutrition_data_days;
  const sleepDays = context.confidence_inputs.sleep_data_days;

  let score = 0;
  if (weightDays >= 14) score += 3;
  else if (weightDays >= 7) score += 2;
  else if (weightDays >= 3) score += 1;

  if (nutritionDays >= 10) score += 2;
  else if (nutritionDays >= 5) score += 1;

  if (sleepDays >= 7) score += 1;

  if (context.cgm_data.available) score += 1;

  if (score >= 5) {
    context.confidence_inputs.overall_confidence = 'high';
  } else if (score >= 3) {
    context.confidence_inputs.overall_confidence = 'medium';
  } else {
    context.confidence_inputs.overall_confidence = 'low';
  }
}
