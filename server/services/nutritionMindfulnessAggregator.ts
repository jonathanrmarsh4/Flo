/**
 * Nutrition & Mindfulness Aggregator Service
 * 
 * Aggregates nutrition and mindfulness HealthKit samples into daily metrics
 * Nutrition: 38 nutrient types → nutrition_daily_metrics table (Supabase)
 * Mindfulness: Individual sessions → mindfulness_sessions + mindfulness_daily_metrics tables
 * 
 * IMPORTANT: Uses healthStorageRouter to read from Supabase (where iOS sends data)
 */

import { db } from '../db';
import { mindfulnessSessions, mindfulnessDailyMetrics } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { TZDate } from '@date-fns/tz';
import * as healthRouter from './healthStorageRouter';

// HealthKit nutrition data type identifiers mapped to our field names
const NUTRITION_TYPE_MAPPING: Record<string, string> = {
  // Macronutrients
  'dietaryEnergyConsumed': 'energyKcal',
  'HKQuantityTypeIdentifierDietaryEnergyConsumed': 'energyKcal',
  'dietaryProtein': 'proteinG',
  'HKQuantityTypeIdentifierDietaryProtein': 'proteinG',
  'dietaryCarbohydrates': 'carbohydratesG',
  'HKQuantityTypeIdentifierDietaryCarbohydrates': 'carbohydratesG',
  'dietaryFatTotal': 'fatTotalG',
  'HKQuantityTypeIdentifierDietaryFatTotal': 'fatTotalG',
  'dietaryFiber': 'fiberG',
  'HKQuantityTypeIdentifierDietaryFiber': 'fiberG',
  'dietarySugar': 'sugarG',
  'HKQuantityTypeIdentifierDietarySugar': 'sugarG',
  
  // Fat types
  'dietaryFatSaturated': 'fatSaturatedG',
  'HKQuantityTypeIdentifierDietaryFatSaturated': 'fatSaturatedG',
  'dietaryFatMonounsaturated': 'fatMonounsaturatedG',
  'HKQuantityTypeIdentifierDietaryFatMonounsaturated': 'fatMonounsaturatedG',
  'dietaryFatPolyunsaturated': 'fatPolyunsaturatedG',
  'HKQuantityTypeIdentifierDietaryFatPolyunsaturated': 'fatPolyunsaturatedG',
  'dietaryCholesterol': 'cholesterolMg',
  'HKQuantityTypeIdentifierDietaryCholesterol': 'cholesterolMg',
  
  // Minerals
  'dietarySodium': 'sodiumMg',
  'HKQuantityTypeIdentifierDietarySodium': 'sodiumMg',
  'dietaryPotassium': 'potassiumMg',
  'HKQuantityTypeIdentifierDietaryPotassium': 'potassiumMg',
  'dietaryCalcium': 'calciumMg',
  'HKQuantityTypeIdentifierDietaryCalcium': 'calciumMg',
  'dietaryIron': 'ironMg',
  'HKQuantityTypeIdentifierDietaryIron': 'ironMg',
  'dietaryMagnesium': 'magnesiumMg',
  'HKQuantityTypeIdentifierDietaryMagnesium': 'magnesiumMg',
  'dietaryPhosphorus': 'phosphorusMg',
  'HKQuantityTypeIdentifierDietaryPhosphorus': 'phosphorusMg',
  'dietaryZinc': 'zincMg',
  'HKQuantityTypeIdentifierDietaryZinc': 'zincMg',
  'dietaryCopper': 'copperMg',
  'HKQuantityTypeIdentifierDietaryCopper': 'copperMg',
  'dietaryManganese': 'manganeseMg',
  'HKQuantityTypeIdentifierDietaryManganese': 'manganeseMg',
  'dietarySelenium': 'seleniumMcg',
  'HKQuantityTypeIdentifierDietarySelenium': 'seleniumMcg',
  'dietaryChromium': 'chromiumMcg',
  'HKQuantityTypeIdentifierDietaryChromium': 'chromiumMcg',
  'dietaryMolybdenum': 'molybdenumMcg',
  'HKQuantityTypeIdentifierDietaryMolybdenum': 'molybdenumMcg',
  'dietaryIodine': 'iodineMcg',
  'HKQuantityTypeIdentifierDietaryIodine': 'iodineMcg',
  'dietaryChloride': 'chlorideMg',
  'HKQuantityTypeIdentifierDietaryChloride': 'chlorideMg',
  
  // Vitamins
  'dietaryVitaminA': 'vitaminAMcg',
  'HKQuantityTypeIdentifierDietaryVitaminA': 'vitaminAMcg',
  'dietaryVitaminB6': 'vitaminB6Mg',
  'HKQuantityTypeIdentifierDietaryVitaminB6': 'vitaminB6Mg',
  'dietaryVitaminB12': 'vitaminB12Mcg',
  'HKQuantityTypeIdentifierDietaryVitaminB12': 'vitaminB12Mcg',
  'dietaryVitaminC': 'vitaminCMg',
  'HKQuantityTypeIdentifierDietaryVitaminC': 'vitaminCMg',
  'dietaryVitaminD': 'vitaminDMcg',
  'HKQuantityTypeIdentifierDietaryVitaminD': 'vitaminDMcg',
  'dietaryVitaminE': 'vitaminEMg',
  'HKQuantityTypeIdentifierDietaryVitaminE': 'vitaminEMg',
  'dietaryVitaminK': 'vitaminKMcg',
  'HKQuantityTypeIdentifierDietaryVitaminK': 'vitaminKMcg',
  'dietaryThiamin': 'thiaminMg',
  'HKQuantityTypeIdentifierDietaryThiamin': 'thiaminMg',
  'dietaryRiboflavin': 'riboflavinMg',
  'HKQuantityTypeIdentifierDietaryRiboflavin': 'riboflavinMg',
  'dietaryNiacin': 'niacinMg',
  'HKQuantityTypeIdentifierDietaryNiacin': 'niacinMg',
  'dietaryFolate': 'folateMcg',
  'HKQuantityTypeIdentifierDietaryFolate': 'folateMcg',
  'dietaryBiotin': 'biotinMcg',
  'HKQuantityTypeIdentifierDietaryBiotin': 'biotinMcg',
  'dietaryPantothenicAcid': 'pantothenicAcidMg',
  'HKQuantityTypeIdentifierDietaryPantothenicAcid': 'pantothenicAcidMg',
  
  // Other
  'dietaryCaffeine': 'caffeineMg',
  'HKQuantityTypeIdentifierDietaryCaffeine': 'caffeineMg',
  'dietaryWater': 'waterMl',
  'HKQuantityTypeIdentifierDietaryWater': 'waterMl',
};

// All nutrition fields (all are summed for daily totals)
const NUTRITION_FIELDS = [
  'energyKcal', 'proteinG', 'carbohydratesG', 'fatTotalG', 'fiberG', 'sugarG',
  'fatSaturatedG', 'fatMonounsaturatedG', 'fatPolyunsaturatedG', 'cholesterolMg',
  'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg',
  'zincMg', 'copperMg', 'manganeseMg', 'seleniumMcg', 'chromiumMcg', 'molybdenumMcg',
  'iodineMcg', 'chlorideMg', 'vitaminAMcg', 'vitaminB6Mg', 'vitaminB12Mcg', 'vitaminCMg',
  'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'thiaminMg', 'riboflavinMg', 'niacinMg',
  'folateMcg', 'biotinMcg', 'pantothenicAcidMg', 'caffeineMg', 'waterMl',
] as const;

interface NutritionAggregated {
  [key: string]: number | null;
}

/**
 * Aggregate nutrition samples for a user on a specific date
 * Reads from Supabase's healthkit_samples table via healthStorageRouter
 */
export async function aggregateNutritionForDate(
  userId: string,
  localDate: string,
  timezone: string
): Promise<NutritionAggregated> {
  const result: NutritionAggregated = {};
  
  // Initialize all fields to null
  for (const field of NUTRITION_FIELDS) {
    result[field] = null;
  }

  try {
    const localDayStart = new TZDate(`${localDate}T00:00:00`, timezone);
    const localDayEnd = new TZDate(`${localDate}T23:59:59.999`, timezone);
    
    const dayStartUTC = new Date(localDayStart.toISOString());
    const dayEndUTC = new Date(localDayEnd.toISOString());
    
    // Get all nutrition samples for this date via healthStorageRouter (reads from Supabase)
    // Filter by all dietary data types
    const dietaryDataTypes = Object.keys(NUTRITION_TYPE_MAPPING);
    
    const samples = await healthRouter.getHealthkitSamples(userId, {
      dataTypes: dietaryDataTypes,
      startDate: dayStartUTC,
      endDate: dayEndUTC,
    });
    
    logger.debug(`[NutritionAggregator] Found ${samples.length} nutrition samples for ${userId} on ${localDate}`);

    // Group by nutrition field
    const groupedValues: Record<string, number[]> = {};
    
    for (const sample of samples) {
      // healthStorageRouter returns camelCase field names
      const dataType = sample.dataType;
      const sampleValue = sample.value;
      const sampleUnit = sample.unit;
      
      const targetField = NUTRITION_TYPE_MAPPING[dataType];
      if (targetField && sampleValue != null) {
        if (!groupedValues[targetField]) {
          groupedValues[targetField] = [];
        }
        
        let value = sampleValue;
        
        // Convert water from liters to ml if needed
        if (targetField === 'waterMl' && sampleUnit === 'L') {
          value = value * 1000;
        }
        
        groupedValues[targetField].push(value);
      }
    }

    // Sum all nutrition values (all nutrition is cumulative daily totals)
    for (const [field, values] of Object.entries(groupedValues)) {
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        result[field] = Math.round(sum * 100) / 100; // 2 decimal precision
      }
    }

    const nonNullFields = Object.entries(result).filter(([_, v]) => v !== null);
    if (nonNullFields.length > 0) {
      logger.info(`[NutritionAggregator] Aggregated ${nonNullFields.length} nutrients for ${userId} on ${localDate}`);
    }

    return result;
  } catch (error) {
    logger.error('[NutritionAggregator] Error aggregating nutrition:', error);
    return result;
  }
}

/**
 * Upsert nutrition daily metrics for a user
 * Writes to Supabase's nutrition_daily_metrics table via healthStorageRouter
 */
export async function upsertNutritionDaily(
  userId: string,
  localDate: string,
  timezone: string
): Promise<void> {
  try {
    const aggregated = await aggregateNutritionForDate(userId, localDate, timezone);
    
    // Check if any nutrition data exists
    const hasData = Object.values(aggregated).some(v => v !== null);
    if (!hasData) {
      logger.debug(`[NutritionAggregator] No nutrition data for ${userId} on ${localDate}`);
      return;
    }

    // Use healthStorageRouter to write to Supabase
    await healthRouter.upsertNutritionDailyMetrics(userId, {
      localDate,
      timezone,
      ...aggregated,
    });
    
    logger.info(`[NutritionAggregator] Upserted nutrition for ${userId} on ${localDate}`);
  } catch (error) {
    logger.error('[NutritionAggregator] Error upserting nutrition:', error);
  }
}

/**
 * Process mindfulness session from HealthKit category sample
 * Mindfulness sessions have startTime/endTime - duration is calculated from the interval
 */
export async function processMindfulnessSession(
  userId: string,
  startTime: Date,
  endTime: Date,
  sourceName: string | null = null,
  sourceId: string | null = null,
  healthkitUuid: string | null = null,
  metadata: Record<string, any> | null = null
): Promise<void> {
  try {
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    
    if (durationMinutes <= 0) {
      logger.warn(`[MindfulnessAggregator] Invalid session duration: ${durationMinutes} minutes`);
      return;
    }

    // Determine timezone from metadata or default
    const timezone = metadata?.timezone || 'America/Los_Angeles';
    const localStart = new TZDate(startTime, timezone);
    const sessionDate = localStart.toISOString().split('T')[0];

    // Check for duplicate by healthkit UUID or start time
    if (healthkitUuid) {
      const [existingByUuid] = await db
        .select()
        .from(mindfulnessSessions)
        .where(
          and(
            eq(mindfulnessSessions.userId, userId),
            eq(mindfulnessSessions.healthkitUuid, healthkitUuid)
          )
        )
        .limit(1);

      if (existingByUuid) {
        logger.debug(`[MindfulnessAggregator] Session already exists (by UUID) for ${userId}`);
        return;
      }
    }

    // Check for duplicate by start time
    const [existingByTime] = await db
      .select()
      .from(mindfulnessSessions)
      .where(
        and(
          eq(mindfulnessSessions.userId, userId),
          eq(mindfulnessSessions.startTime, startTime)
        )
      )
      .limit(1);

    if (existingByTime) {
      logger.debug(`[MindfulnessAggregator] Session already exists (by time) for ${userId} at ${startTime.toISOString()}`);
      return;
    }

    // Insert session
    await db
      .insert(mindfulnessSessions)
      .values({
        userId,
        sessionDate,
        timezone,
        startTime,
        endTime,
        durationMinutes,
        sourceName,
        sourceId,
        healthkitUuid,
      });

    logger.info(`[MindfulnessAggregator] Recorded ${durationMinutes}min mindfulness session for ${userId} on ${sessionDate}`);

    // Update daily aggregation
    await updateMindfulnessDaily(userId, sessionDate, timezone);
  } catch (error) {
    logger.error('[MindfulnessAggregator] Error processing mindfulness session:', error);
  }
}

/**
 * Update mindfulness daily metrics aggregation
 */
export async function updateMindfulnessDaily(
  userId: string,
  sessionDate: string,
  timezone: string
): Promise<void> {
  try {
    // Get all sessions for this date
    const sessions = await db
      .select()
      .from(mindfulnessSessions)
      .where(
        and(
          eq(mindfulnessSessions.userId, userId),
          eq(mindfulnessSessions.sessionDate, sessionDate)
        )
      );

    if (sessions.length === 0) {
      logger.debug(`[MindfulnessAggregator] No sessions for ${userId} on ${sessionDate}`);
      return;
    }

    // Calculate aggregates
    const sessionCount = sessions.length;
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const avgSessionMinutes = Math.round((totalMinutes / sessionCount) * 10) / 10;
    const longestSessionMinutes = Math.max(...sessions.map(s => s.durationMinutes || 0));
    
    // Collect sources
    const sources = Array.from(new Set(sessions.map(s => s.sourceName).filter((s): s is string => s !== null)));

    // Upsert daily record
    const [existing] = await db
      .select()
      .from(mindfulnessDailyMetrics)
      .where(
        and(
          eq(mindfulnessDailyMetrics.userId, userId),
          eq(mindfulnessDailyMetrics.localDate, sessionDate)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(mindfulnessDailyMetrics)
        .set({
          totalMinutes,
          sessionCount,
          avgSessionMinutes,
          longestSessionMinutes,
          sources,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mindfulnessDailyMetrics.userId, userId),
            eq(mindfulnessDailyMetrics.localDate, sessionDate)
          )
        );
    } else {
      await db
        .insert(mindfulnessDailyMetrics)
        .values({
          userId,
          localDate: sessionDate,
          timezone,
          totalMinutes,
          sessionCount,
          avgSessionMinutes,
          longestSessionMinutes,
          sources,
        });
    }

    logger.info(`[MindfulnessAggregator] Updated daily: ${sessionCount} sessions, ${totalMinutes}min total for ${userId} on ${sessionDate}`);
  } catch (error) {
    logger.error('[MindfulnessAggregator] Error updating daily mindfulness:', error);
  }
}

/**
 * Get mindfulness summary for a user over a date range
 */
export async function getMindfulnessSummary(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  totalMinutes: number;
  sessionCount: number;
  avgDailyMinutes: number;
  daysWithPractice: number;
}> {
  try {
    const dailyRecords = await db
      .select()
      .from(mindfulnessDailyMetrics)
      .where(
        and(
          eq(mindfulnessDailyMetrics.userId, userId),
          gte(mindfulnessDailyMetrics.localDate, startDate),
          lte(mindfulnessDailyMetrics.localDate, endDate)
        )
      );

    const totalMinutes = dailyRecords.reduce((sum, r) => sum + (r.totalMinutes || 0), 0);
    const sessionCount = dailyRecords.reduce((sum, r) => sum + (r.sessionCount || 0), 0);
    const daysWithPractice = dailyRecords.length;
    
    // Calculate date range span
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daySpan = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const avgDailyMinutes = Math.round((totalMinutes / daySpan) * 10) / 10;

    return { totalMinutes, sessionCount, avgDailyMinutes, daysWithPractice };
  } catch (error) {
    logger.error('[MindfulnessAggregator] Error getting summary:', error);
    return { totalMinutes: 0, sessionCount: 0, avgDailyMinutes: 0, daysWithPractice: 0 };
  }
}

/**
 * Get nutrition summary for a user over a date range
 * Reads from Supabase's nutrition_daily_metrics table via healthStorageRouter
 */
export async function getNutritionSummary(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  avgDailyCalories: number | null;
  avgDailyProtein: number | null;
  avgDailyCarbs: number | null;
  avgDailyFat: number | null;
  avgDailyFiber: number | null;
  avgDailyCaffeine: number | null;
  daysTracked: number;
}> {
  try {
    // Read from Supabase via healthStorageRouter
    const records = await healthRouter.getNutritionDailyMetrics(userId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      limit: 365, // Up to a year of data
    });

    if (records.length === 0) {
      return {
        avgDailyCalories: null,
        avgDailyProtein: null,
        avgDailyCarbs: null,
        avgDailyFat: null,
        avgDailyFiber: null,
        avgDailyCaffeine: null,
        daysTracked: 0,
      };
    }

    const daysTracked = records.length;
    
    const avgField = (fieldName: 'energyKcal' | 'proteinG' | 'carbohydratesG' | 'fatTotalG' | 'fiberG' | 'caffeineMg') => {
      const values = records.map(r => r[fieldName]).filter((v): v is number => v != null);
      if (values.length === 0) return null;
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    };

    return {
      avgDailyCalories: avgField('energyKcal'),
      avgDailyProtein: avgField('proteinG'),
      avgDailyCarbs: avgField('carbohydratesG'),
      avgDailyFat: avgField('fatTotalG'),
      avgDailyFiber: avgField('fiberG'),
      avgDailyCaffeine: avgField('caffeineMg'),
      daysTracked,
    };
  } catch (error) {
    logger.error('[NutritionAggregator] Error getting summary:', error);
    return {
      avgDailyCalories: null,
      avgDailyProtein: null,
      avgDailyCarbs: null,
      avgDailyFat: null,
      avgDailyFiber: null,
      avgDailyCaffeine: null,
      daysTracked: 0,
    };
  }
}
