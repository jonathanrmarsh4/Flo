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

// Source priority for deduplication (lower index = higher priority)
// Apple Health creates derived entries from apps like Foodnoms, causing double-counting
// We prioritize the original app sources over Apple Health derived data
// Note: Some apps (like FoodNoms) store source_name as null but set bundle_id
const SOURCE_PRIORITY_NAMES = [
  'foodnoms',       // Foodnoms app - highest priority
  'myfitnesspal',   // MyFitnessPal
  'cronometer',     // Cronometer  
  'loseit',         // Lose It!
  'lifesum',        // Lifesum
  'yazio',          // YAZIO
  'fatsecret',      // FatSecret
  'macros',         // Macros app
  'carb manager',   // Carb Manager
  'nutritionix',    // Nutritionix
];

// Bundle ID patterns for apps that may not set source_name
const SOURCE_PRIORITY_BUNDLE_IDS = [
  'com.alice.foodnoms',      // FoodNoms
  'com.foodnoms',            // FoodNoms alternative
  'com.myfitnesspal',        // MyFitnessPal
  'com.underarmour.mvp',     // MyFitnessPal (Under Armour)
  'com.cronometer',          // Cronometer
  'com.loseit',              // Lose It!
  'com.lifesum',             // Lifesum
  'com.yazio',               // YAZIO
  'com.fatsecret',           // FatSecret
  'com.getmacros',           // Macros
  'com.wombatapps.carbs',    // Carb Manager
];

// Apple Health source identifiers
const APPLE_HEALTH_IDENTIFIERS = [
  'health',
  'apple health',
  'com.apple.health',
  'com.apple.healthkit',
];

function getSourcePriority(sourceName: string | null | undefined, bundleId: string | null | undefined): number {
  const normalizedName = (sourceName || '').toLowerCase().trim();
  const normalizedBundle = (bundleId || '').toLowerCase().trim();
  
  // Check source name first
  if (normalizedName) {
    const nameIndex = SOURCE_PRIORITY_NAMES.findIndex(s => normalizedName.includes(s));
    if (nameIndex >= 0) return nameIndex;
  }
  
  // Check bundle ID if source name didn't match
  if (normalizedBundle) {
    const bundleIndex = SOURCE_PRIORITY_BUNDLE_IDS.findIndex(b => normalizedBundle.includes(b));
    if (bundleIndex >= 0) return bundleIndex;
  }
  
  // Check if this is Apple Health (lowest priority among known sources)
  if (isAppleHealthDerived(normalizedName, normalizedBundle)) {
    return SOURCE_PRIORITY_NAMES.length + 1; // After all preferred sources
  }
  
  return SOURCE_PRIORITY_NAMES.length; // Unknown sources get medium priority
}

function isAppleHealthDerived(sourceName: string | null | undefined, bundleId: string | null | undefined): boolean {
  const normalizedName = (sourceName || '').toLowerCase().trim();
  const normalizedBundle = (bundleId || '').toLowerCase().trim();
  
  return APPLE_HEALTH_IDENTIFIERS.some(id => 
    normalizedName.includes(id) || normalizedBundle.includes(id)
  );
}

function getSourceKey(sourceName: string | null | undefined, bundleId: string | null | undefined): string {
  // Create a unique key for grouping samples by source
  // Prefer bundle ID as it's more reliable, fall back to source name
  if (bundleId) return bundleId.toLowerCase();
  if (sourceName) return sourceName.toLowerCase();
  return 'unknown';
}

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
    // DETAILED LOGGING: Log input parameters
    logger.info(`[NutritionAggregator] === STARTING AGGREGATION ===`);
    logger.info(`[NutritionAggregator] userId: ${userId}, localDate: ${localDate}, timezone: ${timezone}`);
    
    // Parse localDate (YYYY-MM-DD) and create proper timezone-aware dates
    const [year, month, day] = localDate.split('-').map(Number);
    logger.info(`[NutritionAggregator] Parsed date: year=${year}, month=${month}, day=${day}`);
    
    // TZDate.tz correctly interprets the time as local time in the specified timezone
    const localDayStart = TZDate.tz(timezone, year, month - 1, day, 0, 0, 0, 0); // month is 0-indexed
    const localDayEnd = TZDate.tz(timezone, year, month - 1, day, 23, 59, 59, 999);
    
    const dayStartUTC = new Date(localDayStart.toISOString());
    const dayEndUTC = new Date(localDayEnd.toISOString());
    
    // DETAILED LOGGING: Log UTC boundaries
    logger.info(`[NutritionAggregator] Local day start: ${localDayStart.toString()}`);
    logger.info(`[NutritionAggregator] Local day end: ${localDayEnd.toString()}`);
    logger.info(`[NutritionAggregator] UTC query range: ${dayStartUTC.toISOString()} to ${dayEndUTC.toISOString()}`);
    
    // Get all nutrition samples for this date via healthStorageRouter (reads from Supabase)
    // Filter by all dietary data types
    const dietaryDataTypes = Object.keys(NUTRITION_TYPE_MAPPING);
    logger.info(`[NutritionAggregator] Querying ${dietaryDataTypes.length} dietary data types`);
    
    const samples = await healthRouter.getHealthkitSamples(userId, {
      dataTypes: dietaryDataTypes,
      startDate: dayStartUTC,
      endDate: dayEndUTC,
    });
    
    logger.info(`[NutritionAggregator] Found ${samples.length} nutrition samples for ${userId} on ${localDate} (UTC: ${dayStartUTC.toISOString()} to ${dayEndUTC.toISOString()})`);

    // Group samples by nutrient field AND source for deduplication
    // Apple Health creates derived entries from apps like Foodnoms, causing double-counting
    // Note: Some apps (like FoodNoms) store source_name as null but set bundle_id
    const samplesByNutrientAndSource: Record<string, Record<string, { values: number[]; priority: number; displayName: string }>> = {};
    const samplesBySource: Record<string, number> = {};
    
    // DETAILED LOGGING: Track calorie samples specifically
    const calorieSamples: { value: number; source: string; startDate: any }[] = [];
    const proteinSamples: { value: number; source: string; startDate: any }[] = [];
    
    for (const sample of samples) {
      const dataType = sample.dataType;
      const sampleValue = sample.value;
      const sampleUnit = sample.unit;
      const sourceName = sample.sourceName;
      const bundleId = sample.sourceBundleId;
      
      // Create a unique source key (prefer bundle ID, fall back to source name)
      const sourceKey = getSourceKey(sourceName, bundleId);
      const displayName = sourceName || bundleId || 'unknown';
      
      // Track samples by source for debugging
      samplesBySource[displayName] = (samplesBySource[displayName] || 0) + 1;
      
      const targetField = NUTRITION_TYPE_MAPPING[dataType];
      
      // DETAILED LOGGING: Track specific nutrient samples
      if (dataType === 'dietaryEnergyConsumed' || dataType === 'HKQuantityTypeIdentifierDietaryEnergyConsumed') {
        calorieSamples.push({ value: sampleValue, source: displayName, startDate: sample.startDate });
      }
      if (dataType === 'dietaryProtein' || dataType === 'HKQuantityTypeIdentifierDietaryProtein') {
        proteinSamples.push({ value: sampleValue, source: displayName, startDate: sample.startDate });
      }
      
      if (targetField && sampleValue != null) {
        let value = sampleValue;
        
        // Convert water from liters to ml if needed
        if (targetField === 'waterMl' && sampleUnit === 'L') {
          value = value * 1000;
        }
        
        // Group by nutrient, then by source
        if (!samplesByNutrientAndSource[targetField]) {
          samplesByNutrientAndSource[targetField] = {};
        }
        if (!samplesByNutrientAndSource[targetField][sourceKey]) {
          samplesByNutrientAndSource[targetField][sourceKey] = {
            values: [],
            priority: getSourcePriority(sourceName, bundleId),
            displayName,
          };
        }
        samplesByNutrientAndSource[targetField][sourceKey].values.push(value);
      } else if (!targetField) {
        logger.warn(`[NutritionAggregator] Unknown data type: ${dataType} (no mapping found)`);
      }
    }
    
    // DETAILED LOGGING: Log calorie and protein samples
    if (calorieSamples.length > 0) {
      const totalCalories = calorieSamples.reduce((sum, s) => sum + s.value, 0);
      logger.info(`[NutritionAggregator] CALORIE SAMPLES (${calorieSamples.length} total, sum=${totalCalories.toFixed(2)} kcal):`);
      calorieSamples.forEach((s, i) => {
        logger.info(`[NutritionAggregator]   [${i+1}] ${s.value.toFixed(2)} kcal from "${s.source}" at ${s.startDate}`);
      });
    } else {
      logger.warn(`[NutritionAggregator] NO CALORIE SAMPLES FOUND for ${userId} on ${localDate}`);
    }
    
    if (proteinSamples.length > 0) {
      const totalProtein = proteinSamples.reduce((sum, s) => sum + s.value, 0);
      logger.info(`[NutritionAggregator] PROTEIN SAMPLES (${proteinSamples.length} total, sum=${totalProtein.toFixed(2)} g):`);
      proteinSamples.forEach((s, i) => {
        logger.info(`[NutritionAggregator]   [${i+1}] ${s.value.toFixed(2)} g from "${s.source}" at ${s.startDate}`);
      });
    } else {
      logger.warn(`[NutritionAggregator] NO PROTEIN SAMPLES FOUND for ${userId} on ${localDate}`);
    }
    
    // Log sources for debugging
    if (Object.keys(samplesBySource).length > 0) {
      logger.info(`[NutritionAggregator] Sample sources for ${userId} on ${localDate}: ${JSON.stringify(samplesBySource)}`);
    }
    
    // Deduplicate: for each nutrient, use only the highest-priority source
    // This prevents double-counting when Apple Health creates derived entries
    // EXCEPTION: Water is summed from ALL sources - water entries are typically unique (not duplicates)
    const NUTRIENTS_SUM_ALL_SOURCES = ['waterMl'];
    
    // DETAILED LOGGING: Log the grouping structure for key nutrients
    const keyNutrientsToLog = ['energyKcal', 'proteinG', 'carbohydratesG', 'fatTotalG'];
    for (const nutrient of keyNutrientsToLog) {
      const sourceData = samplesByNutrientAndSource[nutrient];
      if (sourceData) {
        const sources = Object.entries(sourceData);
        logger.info(`[NutritionAggregator] ${nutrient} has ${sources.length} source(s):`);
        sources.forEach(([key, data]) => {
          const sum = data.values.reduce((a, b) => a + b, 0);
          logger.info(`[NutritionAggregator]   - "${data.displayName}" (priority=${data.priority}): ${data.values.length} samples, sum=${sum.toFixed(2)}`);
        });
      } else {
        logger.warn(`[NutritionAggregator] ${nutrient} has NO data in samplesByNutrientAndSource`);
      }
    }
    
    for (const [nutrient, sourceData] of Object.entries(samplesByNutrientAndSource)) {
      const sources = Object.entries(sourceData);
      
      if (sources.length === 0) continue;
      
      // Special handling for water: sum from ALL sources
      // Unlike food where meals might be duplicated, water entries from different sources are typically unique
      if (NUTRIENTS_SUM_ALL_SOURCES.includes(nutrient)) {
        const allValues = sources.flatMap(([_, data]) => data.values);
        const totalSum = allValues.reduce((a, b) => a + b, 0);
        result[nutrient] = Math.round(totalSum * 100) / 100;
        
        if (sources.length > 1) {
          const sourceBreakdown = sources.map(([key, data]) => 
            `${data.displayName}(${data.values.reduce((a, b) => a + b, 0).toFixed(0)}ml)`
          ).join(' + ');
          logger.info(`[NutritionAggregator] ${nutrient}: summed ALL sources: ${sourceBreakdown} = ${totalSum.toFixed(0)}ml`);
        }
        continue;
      }
      
      // Sort by priority (lower = better)
      sources.sort((a, b) => a[1].priority - b[1].priority);
      
      const [preferredSourceKey, preferredData] = sources[0];
      const sum = preferredData.values.reduce((a, b) => a + b, 0);
      result[nutrient] = Math.round(sum * 100) / 100; // 2 decimal precision
      
      // DETAILED LOGGING: Log deduplication decision for key nutrients
      if (keyNutrientsToLog.includes(nutrient)) {
        logger.info(`[NutritionAggregator] DEDUP DECISION for ${nutrient}: selected "${preferredData.displayName}" (priority=${preferredData.priority}) with sum=${sum.toFixed(2)}`);
        if (sources.length > 1) {
          sources.slice(1).forEach(([key, data]) => {
            const skippedSum = data.values.reduce((a, b) => a + b, 0);
            logger.info(`[NutritionAggregator]   - SKIPPED "${data.displayName}" (priority=${data.priority}) with sum=${skippedSum.toFixed(2)}`);
          });
        }
      }
      
      // Log if we skipped Apple Health derived data
      if (sources.length > 1) {
        const skippedSources = sources.slice(1).map(([key, data]) => `${data.displayName}(${data.values.length} samples)`);
        // Check if any source is Apple Health derived using displayName (which contains the actual source name)
        const hasAppleHealth = sources.some(([key, data]) => isAppleHealthDerived(data.displayName, key));
        if (hasAppleHealth) {
          logger.info(`[NutritionAggregator] ${nutrient}: using ${preferredData.displayName} (${preferredData.values.length} samples, sum=${sum.toFixed(2)}), skipped Apple Health derived: ${skippedSources.join(', ')}`);
        }
      }
    }
    
    // Log key nutrient totals
    const keyNutrients = ['energyKcal', 'proteinG', 'carbohydratesG', 'fatTotalG'];
    const nutrientSummary = keyNutrients
      .filter(n => result[n] !== null)
      .map(n => `${n}=${result[n]}`)
      .join(', ');
    if (nutrientSummary) {
      logger.info(`[NutritionAggregator] Final totals for ${userId} on ${localDate}: ${nutrientSummary}`);
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
 * IMPORTANT: Routes to Supabase via healthStorageRouter for proper health data isolation
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
    const timezone = metadata?.timezone || 'Australia/Perth';
    const localStart = new TZDate(startTime, timezone);
    const sessionDate = localStart.toISOString().split('T')[0];

    // Check for duplicate using healthStorageRouter (queries Supabase)
    const existingSessions = await healthRouter.getMindfulnessSessions(userId, {
      startDate: new Date(startTime.getTime() - 60000), // 1 minute buffer
      endDate: new Date(startTime.getTime() + 60000),
      limit: 10
    });

    // Check for duplicate by UUID or start time
    const isDuplicate = existingSessions.some(session => {
      if (healthkitUuid && session.healthkit_uuid === healthkitUuid) {
        return true;
      }
      // Check if start times are within 1 minute of each other
      const sessionStart = new Date(session.start_time).getTime();
      return Math.abs(sessionStart - startTime.getTime()) < 60000;
    });

    if (isDuplicate) {
      logger.debug(`[MindfulnessAggregator] Session already exists for ${userId} at ${startTime.toISOString()}`);
      return;
    }

    // Insert session via healthStorageRouter → Supabase
    await healthRouter.createMindfulnessSession(userId, {
      session_date: sessionDate,
      timezone,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
      source_name: sourceName,
      source_id: sourceId,
      healthkit_uuid: healthkitUuid,
    });

    logger.info(`[MindfulnessAggregator] Recorded ${durationMinutes}min mindfulness session for ${userId} on ${sessionDate}`);

    // Update daily aggregation via healthStorageRouter → Supabase
    await updateMindfulnessDaily(userId, sessionDate, timezone);
  } catch (error) {
    logger.error('[MindfulnessAggregator] Error processing mindfulness session:', error);
  }
}

/**
 * Update mindfulness daily metrics aggregation
 * IMPORTANT: Routes to Supabase via healthStorageRouter for proper health data isolation
 */
export async function updateMindfulnessDaily(
  userId: string,
  sessionDate: string,
  timezone: string
): Promise<void> {
  try {
    // Get all sessions for this date via healthStorageRouter → Supabase
    const dateStart = new Date(`${sessionDate}T00:00:00Z`);
    const dateEnd = new Date(`${sessionDate}T23:59:59Z`);
    
    const sessions = await healthRouter.getMindfulnessSessions(userId, {
      startDate: dateStart,
      endDate: dateEnd,
      limit: 100
    });

    if (sessions.length === 0) {
      logger.debug(`[MindfulnessAggregator] No sessions for ${userId} on ${sessionDate}`);
      return;
    }

    // Calculate aggregates
    const sessionCount = sessions.length;
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const avgSessionMinutes = Math.round((totalMinutes / sessionCount) * 10) / 10;
    const longestSessionMinutes = Math.max(...sessions.map(s => s.duration_minutes || 0));
    
    // Collect sources
    const sources = Array.from(new Set(sessions.map(s => s.source_name).filter((s): s is string => s !== null)));

    // Upsert daily record via healthStorageRouter → Supabase
    await healthRouter.upsertMindfulnessDailyMetrics(userId, {
      local_date: sessionDate,
      timezone,
      total_minutes: totalMinutes,
      session_count: sessionCount,
      avg_session_minutes: avgSessionMinutes,
      longest_session_minutes: longestSessionMinutes,
      sources,
    });

    logger.info(`[MindfulnessAggregator] Updated daily: ${sessionCount} sessions, ${totalMinutes}min total for ${userId} on ${sessionDate}`);
  } catch (error) {
    logger.error('[MindfulnessAggregator] Error updating daily mindfulness:', error);
  }
}

/**
 * Get mindfulness summary for a user over a date range
 * IMPORTANT: Routes to Supabase via healthStorageRouter for proper health data isolation
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
    const dailyRecords = await healthRouter.getMindfulnessDailyMetrics(userId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      limit: 100
    });

    const totalMinutes = dailyRecords.reduce((sum, r) => sum + (r.total_minutes || 0), 0);
    const sessionCount = dailyRecords.reduce((sum, r) => sum + (r.session_count || 0), 0);
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
