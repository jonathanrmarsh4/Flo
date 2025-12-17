/**
 * Meal-Glucose Correlator Service
 * 
 * Correlates meal logging with delayed CGM glucose data to understand
 * which foods cause glucose spikes for each user.
 * 
 * Data flow:
 * 1. User logs meal (nutrition samples in Supabase healthkit_samples)
 * 2. Glucose data arrives with ~3hr delay (also in healthkit_samples)
 * 3. This service matches meals to their glucose response window
 * 4. Calculates response metrics and stores in ClickHouse
 * 5. Learns per-food glucose profiles over time
 */

import { logger } from '../utils/logger';
import { getClickHouseClient } from './clickhouseService';
import { v4 as uuidv4 } from 'uuid';

interface NutritionSample {
  id: string;
  health_id: string;
  start_date: string;
  end_date: string;
  data_type: string;
  value: number;
  unit: string;
  source_name: string | null;
}

interface GlucoseSample {
  start_date: string;
  value: number;
}

interface MealWindow {
  mealTime: Date;
  calories: number | null;
  carbsG: number | null;
  proteinG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  source: string;
}

interface GlucoseResponse {
  responseId: string;
  healthId: string;
  mealTime: Date;
  mealDate: string;
  mealSource: string;
  mealCalories: number | null;
  mealCarbsG: number | null;
  mealProteinG: number | null;
  mealFatG: number | null;
  mealFiberG: number | null;
  mealSugarG: number | null;
  preMealGlucose: number | null;
  peakGlucose: number;
  peakTime: Date;
  timeToPeakMin: number;
  deltaFromBaseline: number;
  glucoseAuc2hr: number;
  timeAbove140Min: number;
  timeAbove180Min: number;
  recoveryTimeMin: number | null;
  glucoseSamplesCount: number;
  responseGrade: string;
}

// Nutrition data types that indicate a meal
const MEAL_INDICATORS = [
  'dietaryEnergyConsumed',
  'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  'dietaryCarbohydrates',
  'HKQuantityTypeIdentifierDietaryCarbohydrates',
];

// Map nutrition types to our unified naming
const NUTRITION_TYPE_MAP: Record<string, string> = {
  'dietaryEnergyConsumed': 'calories',
  'HKQuantityTypeIdentifierDietaryEnergyConsumed': 'calories',
  'dietaryCarbohydrates': 'carbs',
  'HKQuantityTypeIdentifierDietaryCarbohydrates': 'carbs',
  'dietaryProtein': 'protein',
  'HKQuantityTypeIdentifierDietaryProtein': 'protein',
  'dietaryFatTotal': 'fat',
  'HKQuantityTypeIdentifierDietaryFatTotal': 'fat',
  'dietaryFiber': 'fiber',
  'HKQuantityTypeIdentifierDietaryFiber': 'fiber',
  'dietarySugar': 'sugar',
  'HKQuantityTypeIdentifierDietarySugar': 'sugar',
};

/**
 * Process glucose responses for meals logged in a time window
 * Called after new glucose data arrives from HealthKit
 */
export async function processMealGlucoseCorrelations(
  healthId: string,
  startDate: Date,
  endDate: Date
): Promise<{ processed: number; stored: number }> {
  logger.info(`[MealGlucose] Processing correlations for ${healthId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  try {
    // Get nutrition and glucose samples from Supabase
    const { isSupabaseHealthEnabled, getSupabaseClient } = await import('./healthStorageRouter');
    
    if (!isSupabaseHealthEnabled()) {
      logger.warn('[MealGlucose] Supabase not enabled, cannot process');
      return { processed: 0, stored: 0 };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      logger.warn('[MealGlucose] Supabase client not available');
      return { processed: 0, stored: 0 };
    }

    // Look for meals in a wider window (meals could be logged up to 3hrs before glucose arrives)
    const mealWindowStart = new Date(startDate.getTime() - 3 * 60 * 60 * 1000);
    
    // Get nutrition samples (meal entries)
    const nutritionTypes = [
      'dietaryEnergyConsumed', 'HKQuantityTypeIdentifierDietaryEnergyConsumed',
      'dietaryCarbohydrates', 'HKQuantityTypeIdentifierDietaryCarbohydrates',
      'dietaryProtein', 'HKQuantityTypeIdentifierDietaryProtein',
      'dietaryFatTotal', 'HKQuantityTypeIdentifierDietaryFatTotal',
      'dietaryFiber', 'HKQuantityTypeIdentifierDietaryFiber',
      'dietarySugar', 'HKQuantityTypeIdentifierDietarySugar',
    ];

    const { data: nutritionSamples, error: nutritionError } = await supabase
      .from('healthkit_samples')
      .select('id, health_id, start_date, end_date, data_type, value, unit, source_name')
      .eq('health_id', healthId)
      .in('data_type', nutritionTypes)
      .gte('start_date', mealWindowStart.toISOString())
      .lte('start_date', endDate.toISOString())
      .order('start_date', { ascending: true });

    if (nutritionError) {
      logger.error('[MealGlucose] Error fetching nutrition samples:', nutritionError);
      return { processed: 0, stored: 0 };
    }

    if (!nutritionSamples || nutritionSamples.length === 0) {
      logger.debug('[MealGlucose] No nutrition samples found in window');
      return { processed: 0, stored: 0 };
    }

    // Group nutrition samples by meal time (within 15 min window = same meal)
    const meals = groupSamplesIntoMeals(nutritionSamples as NutritionSample[]);
    logger.info(`[MealGlucose] Found ${meals.length} meals to analyze`);

    if (meals.length === 0) {
      return { processed: 0, stored: 0 };
    }

    // Get glucose samples for the response windows (up to 3hrs after each meal)
    const earliestMeal = meals.reduce((min, m) => m.mealTime < min ? m.mealTime : min, meals[0].mealTime);
    const latestMealPlusWindow = new Date(meals.reduce((max, m) => m.mealTime > max ? m.mealTime : max, meals[0].mealTime).getTime() + 3 * 60 * 60 * 1000);

    const glucoseTypes = ['HKQuantityTypeIdentifierBloodGlucose', 'bloodGlucose', 'BloodGlucose'];
    
    const { data: glucoseSamples, error: glucoseError } = await supabase
      .from('healthkit_samples')
      .select('start_date, value')
      .eq('health_id', healthId)
      .in('data_type', glucoseTypes)
      .gte('start_date', earliestMeal.toISOString())
      .lte('start_date', latestMealPlusWindow.toISOString())
      .order('start_date', { ascending: true });

    if (glucoseError) {
      logger.error('[MealGlucose] Error fetching glucose samples:', glucoseError);
      return { processed: 0, stored: 0 };
    }

    if (!glucoseSamples || glucoseSamples.length === 0) {
      logger.debug('[MealGlucose] No glucose samples found in response window');
      return { processed: 0, stored: 0 };
    }

    logger.info(`[MealGlucose] Found ${glucoseSamples.length} glucose samples for analysis`);

    // Calculate glucose response for each meal
    const responses: GlucoseResponse[] = [];
    
    for (const meal of meals) {
      const response = calculateGlucoseResponse(healthId, meal, glucoseSamples as GlucoseSample[]);
      if (response) {
        responses.push(response);
      }
    }

    if (responses.length === 0) {
      logger.debug('[MealGlucose] No valid glucose responses calculated');
      return { processed: meals.length, stored: 0 };
    }

    // Store responses in ClickHouse
    const stored = await storeGlucoseResponses(responses);

    logger.info(`[MealGlucose] Processed ${meals.length} meals, stored ${stored} responses`);
    return { processed: meals.length, stored };

  } catch (error) {
    logger.error('[MealGlucose] Error processing correlations:', error);
    return { processed: 0, stored: 0 };
  }
}

/**
 * Group nutrition samples into discrete meals (samples within 15 min = same meal)
 */
function groupSamplesIntoMeals(samples: NutritionSample[]): MealWindow[] {
  if (samples.length === 0) return [];

  const meals: MealWindow[] = [];
  let currentMealStart: Date | null = null;
  let currentMealNutrients: Record<string, number> = {};
  let currentMealSource = '';

  const MEAL_GAP_MS = 15 * 60 * 1000; // 15 minutes

  for (const sample of samples) {
    const sampleTime = new Date(sample.start_date);
    const nutrientType = NUTRITION_TYPE_MAP[sample.data_type];

    if (!currentMealStart) {
      // Start new meal
      currentMealStart = sampleTime;
      currentMealNutrients = {};
      currentMealSource = sample.source_name || 'unknown';
    } else if (sampleTime.getTime() - currentMealStart.getTime() > MEAL_GAP_MS) {
      // Save previous meal and start new one
      if (Object.keys(currentMealNutrients).length > 0) {
        meals.push(createMealWindow(currentMealStart, currentMealNutrients, currentMealSource));
      }
      currentMealStart = sampleTime;
      currentMealNutrients = {};
      currentMealSource = sample.source_name || 'unknown';
    }

    // Add nutrient to current meal
    if (nutrientType) {
      currentMealNutrients[nutrientType] = (currentMealNutrients[nutrientType] || 0) + sample.value;
    }
  }

  // Save last meal
  if (currentMealStart && Object.keys(currentMealNutrients).length > 0) {
    meals.push(createMealWindow(currentMealStart, currentMealNutrients, currentMealSource));
  }

  return meals;
}

function createMealWindow(mealTime: Date, nutrients: Record<string, number>, source: string): MealWindow {
  return {
    mealTime,
    calories: nutrients['calories'] || null,
    carbsG: nutrients['carbs'] || null,
    proteinG: nutrients['protein'] || null,
    fatG: nutrients['fat'] || null,
    fiberG: nutrients['fiber'] || null,
    sugarG: nutrients['sugar'] || null,
    source,
  };
}

/**
 * Calculate glucose response metrics for a meal
 */
function calculateGlucoseResponse(
  healthId: string,
  meal: MealWindow,
  glucoseSamples: GlucoseSample[]
): GlucoseResponse | null {
  // Response window: 30min before to 180min after meal
  const windowStart = new Date(meal.mealTime.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(meal.mealTime.getTime() + 180 * 60 * 1000);

  // Filter glucose samples to this window
  const windowSamples = glucoseSamples.filter(s => {
    const t = new Date(s.start_date);
    return t >= windowStart && t <= windowEnd;
  });

  if (windowSamples.length < 3) {
    // Need at least 3 samples for meaningful analysis
    return null;
  }

  // Find pre-meal glucose (samples 30-0 min before meal)
  const preMealSamples = windowSamples.filter(s => {
    const t = new Date(s.start_date);
    return t < meal.mealTime;
  });
  const preMealGlucose = preMealSamples.length > 0
    ? preMealSamples.reduce((sum, s) => sum + s.value, 0) / preMealSamples.length
    : null;

  // Find post-meal samples (0-180 min after meal)
  const postMealSamples = windowSamples.filter(s => {
    const t = new Date(s.start_date);
    return t >= meal.mealTime;
  });

  if (postMealSamples.length < 2) {
    return null;
  }

  // Calculate baseline (pre-meal or first post-meal reading)
  const baseline = preMealGlucose || postMealSamples[0].value;

  // Find peak glucose and time
  let peakGlucose = 0;
  let peakTime = meal.mealTime;
  for (const sample of postMealSamples) {
    if (sample.value > peakGlucose) {
      peakGlucose = sample.value;
      peakTime = new Date(sample.start_date);
    }
  }

  const timeToPeakMin = (peakTime.getTime() - meal.mealTime.getTime()) / (60 * 1000);
  const deltaFromBaseline = peakGlucose - baseline;

  // Calculate AUC above baseline for 2hr window
  const twoHrEnd = new Date(meal.mealTime.getTime() + 120 * 60 * 1000);
  const twoHrSamples = postMealSamples.filter(s => new Date(s.start_date) <= twoHrEnd);
  let glucoseAuc2hr = 0;
  for (let i = 1; i < twoHrSamples.length; i++) {
    const prev = twoHrSamples[i - 1];
    const curr = twoHrSamples[i];
    const prevTime = new Date(prev.start_date).getTime();
    const currTime = new Date(curr.start_date).getTime();
    const intervalMin = (currTime - prevTime) / (60 * 1000);
    const avgAboveBaseline = Math.max(0, ((prev.value - baseline) + (curr.value - baseline)) / 2);
    glucoseAuc2hr += avgAboveBaseline * intervalMin;
  }

  // Calculate time above thresholds
  let timeAbove140Min = 0;
  let timeAbove180Min = 0;
  for (let i = 1; i < postMealSamples.length; i++) {
    const prev = postMealSamples[i - 1];
    const curr = postMealSamples[i];
    const prevTime = new Date(prev.start_date).getTime();
    const currTime = new Date(curr.start_date).getTime();
    const intervalMin = (currTime - prevTime) / (60 * 1000);
    
    if (prev.value >= 140 || curr.value >= 140) {
      timeAbove140Min += intervalMin;
    }
    if (prev.value >= 180 || curr.value >= 180) {
      timeAbove180Min += intervalMin;
    }
  }

  // Calculate recovery time (time to return within 10 mg/dL of baseline)
  let recoveryTimeMin: number | null = null;
  const peakIndex = postMealSamples.findIndex(s => new Date(s.start_date).getTime() === peakTime.getTime());
  for (let i = peakIndex + 1; i < postMealSamples.length; i++) {
    if (postMealSamples[i].value <= baseline + 10) {
      recoveryTimeMin = (new Date(postMealSamples[i].start_date).getTime() - meal.mealTime.getTime()) / (60 * 1000);
      break;
    }
  }

  // Grade the response
  const responseGrade = gradeGlucoseResponse(peakGlucose, deltaFromBaseline, timeAbove140Min);

  return {
    responseId: uuidv4(),
    healthId,
    mealTime: meal.mealTime,
    mealDate: meal.mealTime.toISOString().split('T')[0],
    mealSource: meal.source,
    mealCalories: meal.calories,
    mealCarbsG: meal.carbsG,
    mealProteinG: meal.proteinG,
    mealFatG: meal.fatG,
    mealFiberG: meal.fiberG,
    mealSugarG: meal.sugarG,
    preMealGlucose,
    peakGlucose,
    peakTime,
    timeToPeakMin,
    deltaFromBaseline,
    glucoseAuc2hr,
    timeAbove140Min,
    timeAbove180Min,
    recoveryTimeMin,
    glucoseSamplesCount: windowSamples.length,
    responseGrade,
  };
}

/**
 * Grade glucose response from A (excellent) to D (concerning)
 */
function gradeGlucoseResponse(peak: number, delta: number, timeAbove140: number): string {
  // A: Peak < 120, delta < 30
  // B: Peak < 140, delta < 50
  // C: Peak < 180, timeAbove140 < 30min
  // D: Peak >= 180 or prolonged high
  
  if (peak < 120 && delta < 30) return 'A';
  if (peak < 140 && delta < 50) return 'B';
  if (peak < 180 && timeAbove140 < 30) return 'C';
  return 'D';
}

/**
 * Store glucose responses in ClickHouse
 */
async function storeGlucoseResponses(responses: GlucoseResponse[]): Promise<number> {
  const ch = getClickHouseClient();
  if (!ch) {
    logger.warn('[MealGlucose] ClickHouse not available');
    return 0;
  }

  try {
    const rows = responses.map(r => ({
      response_id: r.responseId,
      health_id: r.healthId,
      meal_time: r.mealTime.toISOString(),
      meal_date: r.mealDate,
      meal_source: r.mealSource,
      meal_calories: r.mealCalories,
      meal_carbs_g: r.mealCarbsG,
      meal_protein_g: r.mealProteinG,
      meal_fat_g: r.mealFatG,
      meal_fiber_g: r.mealFiberG,
      meal_sugar_g: r.mealSugarG,
      pre_meal_glucose: r.preMealGlucose,
      peak_glucose: r.peakGlucose,
      peak_time: r.peakTime.toISOString(),
      time_to_peak_min: r.timeToPeakMin,
      delta_from_baseline: r.deltaFromBaseline,
      glucose_auc_2hr: r.glucoseAuc2hr,
      time_above_140_min: r.timeAbove140Min,
      time_above_180_min: r.timeAbove180Min,
      recovery_time_min: r.recoveryTimeMin,
      glucose_samples_count: r.glucoseSamplesCount,
      response_grade: r.responseGrade,
    }));

    await ch.insert({
      table: 'flo_health.meal_glucose_responses',
      values: rows,
      format: 'JSONEachRow',
    });

    logger.info(`[MealGlucose] Stored ${rows.length} glucose responses in ClickHouse`);
    return rows.length;
  } catch (error) {
    logger.error('[MealGlucose] Error storing responses:', error);
    return 0;
  }
}

/**
 * Get recent meal-glucose insights for a user
 */
export async function getMealGlucoseInsights(healthId: string, days: number = 7): Promise<{
  recentResponses: any[];
  topSpikers: any[];
  avgMetrics: any;
}> {
  const ch = getClickHouseClient();
  if (!ch) {
    return { recentResponses: [], topSpikers: [], avgMetrics: null };
  }

  try {
    // Get recent responses
    const recentQuery = `
      SELECT 
        meal_time,
        meal_source,
        meal_calories,
        meal_carbs_g,
        peak_glucose,
        delta_from_baseline,
        time_to_peak_min,
        response_grade
      FROM flo_health.meal_glucose_responses
      WHERE health_id = {healthId:String}
        AND meal_date >= today() - {days:UInt32}
      ORDER BY meal_time DESC
      LIMIT 20
    `;

    const recentResult = await ch.query({
      query: recentQuery,
      query_params: { healthId, days },
      format: 'JSONEachRow',
    });
    const recentResponses = await recentResult.json();

    // Get average metrics
    const avgQuery = `
      SELECT 
        avg(peak_glucose) as avg_peak,
        avg(delta_from_baseline) as avg_delta,
        avg(time_to_peak_min) as avg_time_to_peak,
        avg(glucose_auc_2hr) as avg_auc,
        countIf(response_grade = 'A') as grade_a_count,
        countIf(response_grade = 'D') as grade_d_count,
        count() as total_meals
      FROM flo_health.meal_glucose_responses
      WHERE health_id = {healthId:String}
        AND meal_date >= today() - {days:UInt32}
    `;

    const avgResult = await ch.query({
      query: avgQuery,
      query_params: { healthId, days },
      format: 'JSONEachRow',
    });
    const avgRows = await avgResult.json();
    const avgMetrics = avgRows.length > 0 ? avgRows[0] : null;

    // Get top glucose spikers (high carb meals with grade D)
    const spikersQuery = `
      SELECT 
        meal_source,
        meal_carbs_g,
        meal_sugar_g,
        max(peak_glucose) as max_peak,
        avg(delta_from_baseline) as avg_delta,
        count() as occurrence_count
      FROM flo_health.meal_glucose_responses
      WHERE health_id = {healthId:String}
        AND meal_date >= today() - 30
        AND response_grade IN ('C', 'D')
      GROUP BY meal_source, meal_carbs_g, meal_sugar_g
      ORDER BY avg_delta DESC
      LIMIT 5
    `;

    const spikersResult = await ch.query({
      query: spikersQuery,
      query_params: { healthId },
      format: 'JSONEachRow',
    });
    const topSpikers = await spikersResult.json();

    return { recentResponses, topSpikers, avgMetrics };
  } catch (error) {
    logger.error('[MealGlucose] Error getting insights:', error);
    return { recentResponses: [], topSpikers: [], avgMetrics: null };
  }
}

/**
 * Generate a human-readable insight about a glucose response
 */
export function formatGlucoseResponseInsight(response: any): string {
  const mealTime = new Date(response.meal_time);
  const timeStr = mealTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  const peakStr = Math.round(response.peak_glucose);
  const deltaStr = Math.round(response.delta_from_baseline);
  const peakTimeMin = Math.round(response.time_to_peak_min);
  
  let gradeEmoji = '';
  switch (response.response_grade) {
    case 'A': gradeEmoji = '🟢'; break;
    case 'B': gradeEmoji = '🟡'; break;
    case 'C': gradeEmoji = '🟠'; break;
    case 'D': gradeEmoji = '🔴'; break;
  }

  if (response.response_grade === 'A' || response.response_grade === 'B') {
    return `${gradeEmoji} Your ${timeStr} meal had a good glucose response - peaked at ${peakStr} mg/dL (+${deltaStr}) after ${peakTimeMin} minutes.`;
  } else {
    const carbsInfo = response.meal_carbs_g ? ` (${Math.round(response.meal_carbs_g)}g carbs)` : '';
    return `${gradeEmoji} Your ${timeStr} meal${carbsInfo} caused a significant glucose spike to ${peakStr} mg/dL (+${deltaStr}) - peaked after ${peakTimeMin} minutes.`;
  }
}
