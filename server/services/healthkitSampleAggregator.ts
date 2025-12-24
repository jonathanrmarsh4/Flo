/**
 * HealthKit Sample Aggregator
 * 
 * Aggregates individual HealthKit samples into daily metrics for metrics that
 * iOS doesn't automatically aggregate (oxygen saturation, respiratory rate, body temp, etc.)
 * 
 * IMPORTANT: Uses healthStorageRouter for all database access to respect dual-database architecture
 */

import { logger } from '../utils/logger';
import { TZDate } from '@date-fns/tz';
import * as healthRouter from './healthStorageRouter';

// HealthKit data type names as they come from iOS
const SAMPLE_TYPE_MAPPING: Record<string, string> = {
  // Respiratory & Oxygen
  'oxygenSaturation': 'oxygen_saturation_pct',
  'bloodOxygen': 'oxygen_saturation_pct',
  'HKQuantityTypeIdentifierOxygenSaturation': 'oxygen_saturation_pct',
  'respiratoryRate': 'respiratory_rate_bpm',
  'HKQuantityTypeIdentifierRespiratoryRate': 'respiratory_rate_bpm',
  
  // Body Temperature
  'bodyTemperature': 'body_temp_c',
  'HKQuantityTypeIdentifierBodyTemperature': 'body_temp_c',
  
  // Wrist Temperature (Apple Watch overnight)
  'appleSleepingWristTemperature': 'wrist_temp_c',
  'HKQuantityTypeIdentifierAppleSleepingWristTemperature': 'wrist_temp_c',
  
  // Energy
  'basalEnergyBurned': 'basal_energy_kcal',
  'HKQuantityTypeIdentifierBasalEnergyBurned': 'basal_energy_kcal',
  
  // Heart Rate
  'walkingHeartRateAverage': 'walking_hr_avg_bpm',
  'HKQuantityTypeIdentifierWalkingHeartRateAverage': 'walking_hr_avg_bpm',
  
  // Water
  'dietaryWater': 'dietary_water_ml',
  'HKQuantityTypeIdentifierDietaryWater': 'dietary_water_ml',
  
  // Gait & Mobility (8 new types)
  'walkingSpeed': 'walking_speed_ms',
  'HKQuantityTypeIdentifierWalkingSpeed': 'walking_speed_ms',
  'walkingStepLength': 'walking_step_length_m',
  'HKQuantityTypeIdentifierWalkingStepLength': 'walking_step_length_m',
  'walkingDoubleSupportPercentage': 'walking_double_support_pct',
  'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage': 'walking_double_support_pct',
  'walkingAsymmetryPercentage': 'walking_asymmetry_pct',
  'HKQuantityTypeIdentifierWalkingAsymmetryPercentage': 'walking_asymmetry_pct',
  'appleWalkingSteadiness': 'apple_walking_steadiness',
  'HKQuantityTypeIdentifierAppleWalkingSteadiness': 'apple_walking_steadiness',
  'sixMinuteWalkTestDistance': 'six_minute_walk_distance_m',
  'HKQuantityTypeIdentifierSixMinuteWalkTestDistance': 'six_minute_walk_distance_m',
  'stairAscentSpeed': 'stair_ascent_speed_ms',
  'HKQuantityTypeIdentifierStairAscentSpeed': 'stair_ascent_speed_ms',
  'stairDescentSpeed': 'stair_descent_speed_ms',
  'HKQuantityTypeIdentifierStairDescentSpeed': 'stair_descent_speed_ms',
};

// Which metrics to average vs sum (energy and water are summed, everything else averaged)
const SUM_METRICS = ['basal_energy_kcal', 'dietary_water_ml', 'six_minute_walk_distance_m'];

interface AggregatedMetrics {
  oxygen_saturation_pct: number | null;
  respiratory_rate_bpm: number | null;
  body_temp_c: number | null;
  basal_energy_kcal: number | null;
  walking_hr_avg_bpm: number | null;
  dietary_water_ml: number | null;
  // Gait & Mobility
  walking_speed_ms: number | null;
  walking_step_length_m: number | null;
  walking_double_support_pct: number | null;
  walking_asymmetry_pct: number | null;
  apple_walking_steadiness: number | null;
  six_minute_walk_distance_m: number | null;
  stair_ascent_speed_ms: number | null;
  stair_descent_speed_ms: number | null;
}

/**
 * Aggregate HealthKit samples for a user on a specific date
 * Returns aggregated values for metrics that iOS doesn't aggregate
 * 
 * USES healthStorageRouter to read from Supabase when enabled
 */
export async function aggregateSamplesForDate(
  userId: string,
  localDate: string,
  timezone: string
): Promise<AggregatedMetrics> {
  const result: AggregatedMetrics = {
    oxygen_saturation_pct: null,
    respiratory_rate_bpm: null,
    body_temp_c: null,
    basal_energy_kcal: null,
    walking_hr_avg_bpm: null,
    dietary_water_ml: null,
    // Gait & Mobility
    walking_speed_ms: null,
    walking_step_length_m: null,
    walking_double_support_pct: null,
    walking_asymmetry_pct: null,
    apple_walking_steadiness: null,
    six_minute_walk_distance_m: null,
    stair_ascent_speed_ms: null,
    stair_descent_speed_ms: null,
  };

  try {
    // Calculate day boundaries in UTC based on local date and timezone
    // Parse localDate as start of day in user's timezone, then convert to UTC
    const localDayStart = new TZDate(`${localDate}T00:00:00`, timezone);
    const localDayEnd = new TZDate(`${localDate}T23:59:59.999`, timezone);
    
    // Convert to UTC Date objects for database query
    const dayStartUTC = new Date(localDayStart.toISOString());
    const dayEndUTC = new Date(localDayEnd.toISOString());
    
    logger.debug(`[SampleAggregator] Querying ${localDate} (${timezone}): UTC ${dayStartUTC.toISOString()} to ${dayEndUTC.toISOString()}`);
    
    // Get all samples for this user on this date via healthStorageRouter (Supabase)
    const samples = await healthRouter.getHealthkitSamples(userId, {
      startDate: dayStartUTC,
      endDate: dayEndUTC,
    });

    if (samples.length === 0) {
      logger.debug(`[SampleAggregator] No samples found for ${userId} on ${localDate}`);
      return result;
    }

    // Group samples by target metric
    const groupedValues: Record<string, number[]> = {};
    
    for (const sample of samples) {
      const targetField = SAMPLE_TYPE_MAPPING[sample.dataType];
      if (targetField && sample.value != null) {
        if (!groupedValues[targetField]) {
          groupedValues[targetField] = [];
        }
        
        // Convert units if needed
        let value = sample.value;
        
        // Oxygen saturation: convert to percentage if in decimal form
        if (targetField === 'oxygen_saturation_pct' && value <= 1) {
          value = value * 100;
        }
        
        // Body temperature: convert Fahrenheit to Celsius if needed
        if (targetField === 'body_temp_c' && value > 50) {
          value = (value - 32) * 5 / 9;
        }
        
        // Water: convert liters to ml if needed
        if (targetField === 'dietary_water_ml' && sample.unit === 'L') {
          value = value * 1000;
        }
        
        // Gait percentages: convert from decimal to percentage if needed
        if ((targetField === 'walking_double_support_pct' || 
             targetField === 'walking_asymmetry_pct' ||
             targetField === 'apple_walking_steadiness') && value <= 1) {
          value = value * 100;
        }
        
        // Speed units: already in m/s from iOS, no conversion needed
        // Distance: already in meters from iOS, no conversion needed
        
        groupedValues[targetField].push(value);
      }
    }

    // Calculate aggregates
    for (const [field, values] of Object.entries(groupedValues)) {
      if (values.length > 0) {
        if (SUM_METRICS.includes(field)) {
          // Sum for energy and water
          (result as any)[field] = Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
        } else {
          // Average for vital signs
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          (result as any)[field] = Math.round(avg * 10) / 10;
        }
      }
    }

    const nonNullFields = Object.entries(result).filter(([_, v]) => v !== null).map(([k]) => k);
    if (nonNullFields.length > 0) {
      logger.info(`[SampleAggregator] Aggregated ${nonNullFields.length} metrics for ${userId} on ${localDate}: ${nonNullFields.join(', ')}`);
    }

    return result;
  } catch (error) {
    logger.error('[SampleAggregator] Error aggregating samples:', error);
    return result;
  }
}

/**
 * Update user_daily_metrics with aggregated sample data
 * Only updates fields that are currently null
 * 
 * USES healthStorageRouter for database access (Supabase when enabled)
 */
export async function fillMissingMetricsFromSamples(
  userId: string,
  localDate: string,
  timezone: string
): Promise<void> {
  try {
    // Get current daily metrics via healthStorageRouter (routes to Supabase when enabled)
    const healthRouter = await import("./healthStorageRouter");
    const existing = await healthRouter.getUserDailyMetricsByDate(userId, localDate);

    // Aggregate samples first - we need this even if no record exists
    const aggregated = await aggregateSamplesForDate(userId, localDate, timezone);
    
    // Check if we have any aggregated data to save
    const hasAggregatedData = Object.values(aggregated).some(v => v !== null);
    
    if (!existing) {
      // No daily metrics record exists - CREATE one with aggregated sample data
      if (!hasAggregatedData) {
        logger.debug(`[SampleAggregator] No daily metrics record and no samples for ${userId} on ${localDate}`);
        return;
      }
      
      // Build the new record with all aggregated values
      const newRecord: Record<string, any> = {
        local_date: localDate,
        timezone,
      };
      
      if (aggregated.oxygen_saturation_pct != null) newRecord.oxygen_saturation_pct = aggregated.oxygen_saturation_pct;
      if (aggregated.respiratory_rate_bpm != null) newRecord.respiratory_rate_bpm = aggregated.respiratory_rate_bpm;
      if (aggregated.body_temp_c != null) newRecord.body_temp_c = aggregated.body_temp_c;
      if (aggregated.basal_energy_kcal != null) newRecord.basal_energy_kcal = aggregated.basal_energy_kcal;
      if (aggregated.walking_hr_avg_bpm != null) newRecord.walking_hr_avg_bpm = aggregated.walking_hr_avg_bpm;
      if (aggregated.dietary_water_ml != null) newRecord.dietary_water_ml = aggregated.dietary_water_ml;
      if (aggregated.walking_speed_ms != null) newRecord.walking_speed_ms = aggregated.walking_speed_ms;
      if (aggregated.walking_step_length_m != null) newRecord.walking_step_length_m = aggregated.walking_step_length_m;
      if (aggregated.walking_double_support_pct != null) newRecord.walking_double_support_pct = aggregated.walking_double_support_pct;
      if (aggregated.walking_asymmetry_pct != null) newRecord.walking_asymmetry_pct = aggregated.walking_asymmetry_pct;
      if (aggregated.apple_walking_steadiness != null) newRecord.apple_walking_steadiness = aggregated.apple_walking_steadiness;
      if (aggregated.six_minute_walk_distance_m != null) newRecord.six_minute_walk_distance_m = aggregated.six_minute_walk_distance_m;
      if (aggregated.stair_ascent_speed_ms != null) newRecord.stair_ascent_speed_ms = aggregated.stair_ascent_speed_ms;
      if (aggregated.stair_descent_speed_ms != null) newRecord.stair_descent_speed_ms = aggregated.stair_descent_speed_ms;
      
      await healthRouter.upsertDailyMetrics(userId, newRecord as any);
      logger.info(`[SampleAggregator] Created new daily metrics record with ${Object.keys(newRecord).length - 2} metrics from samples for ${userId} on ${localDate}`);
      return;
    }

    // Record exists - check if any of our target fields are missing
    const missingFields: string[] = [];
    if (existing.oxygenSaturationPct == null) missingFields.push('oxygen_saturation_pct');
    if (existing.respiratoryRateBpm == null) missingFields.push('respiratory_rate_bpm');
    if (existing.bodyTempC == null) missingFields.push('body_temp_c');
    if (existing.basalEnergyKcal == null) missingFields.push('basal_energy_kcal');
    if (existing.walkingHrAvgBpm == null) missingFields.push('walking_hr_avg_bpm');
    if (existing.dietaryWaterMl == null) missingFields.push('dietary_water_ml');
    // Gait & Mobility
    if (existing.walkingSpeedMs == null) missingFields.push('walking_speed_ms');
    if (existing.walkingStepLengthM == null) missingFields.push('walking_step_length_m');
    if (existing.walkingDoubleSupportPct == null) missingFields.push('walking_double_support_pct');
    if (existing.walkingAsymmetryPct == null) missingFields.push('walking_asymmetry_pct');
    if (existing.appleWalkingSteadiness == null) missingFields.push('apple_walking_steadiness');
    if (existing.sixMinuteWalkDistanceM == null) missingFields.push('six_minute_walk_distance_m');
    if (existing.stairAscentSpeedMs == null) missingFields.push('stair_ascent_speed_ms');
    if (existing.stairDescentSpeedMs == null) missingFields.push('stair_descent_speed_ms');

    if (missingFields.length === 0) {
      logger.debug(`[SampleAggregator] All sample-based metrics already populated for ${userId} on ${localDate}`);
      return;
    }

    // Build update object with snake_case keys (matching Supabase column names)
    const updates: Record<string, number> = {};
    if (aggregated.oxygen_saturation_pct != null && existing.oxygenSaturationPct == null) {
      updates.oxygen_saturation_pct = aggregated.oxygen_saturation_pct;
    }
    if (aggregated.respiratory_rate_bpm != null && existing.respiratoryRateBpm == null) {
      updates.respiratory_rate_bpm = aggregated.respiratory_rate_bpm;
    }
    if (aggregated.body_temp_c != null && existing.bodyTempC == null) {
      updates.body_temp_c = aggregated.body_temp_c;
    }
    if (aggregated.basal_energy_kcal != null && existing.basalEnergyKcal == null) {
      updates.basal_energy_kcal = aggregated.basal_energy_kcal;
    }
    if (aggregated.walking_hr_avg_bpm != null && existing.walkingHrAvgBpm == null) {
      updates.walking_hr_avg_bpm = aggregated.walking_hr_avg_bpm;
    }
    if (aggregated.dietary_water_ml != null && existing.dietaryWaterMl == null) {
      updates.dietary_water_ml = aggregated.dietary_water_ml;
    }
    // Gait & Mobility
    if (aggregated.walking_speed_ms != null && existing.walkingSpeedMs == null) {
      updates.walking_speed_ms = aggregated.walking_speed_ms;
    }
    if (aggregated.walking_step_length_m != null && existing.walkingStepLengthM == null) {
      updates.walking_step_length_m = aggregated.walking_step_length_m;
    }
    if (aggregated.walking_double_support_pct != null && existing.walkingDoubleSupportPct == null) {
      updates.walking_double_support_pct = aggregated.walking_double_support_pct;
    }
    if (aggregated.walking_asymmetry_pct != null && existing.walkingAsymmetryPct == null) {
      updates.walking_asymmetry_pct = aggregated.walking_asymmetry_pct;
    }
    if (aggregated.apple_walking_steadiness != null && existing.appleWalkingSteadiness == null) {
      updates.apple_walking_steadiness = aggregated.apple_walking_steadiness;
    }
    if (aggregated.six_minute_walk_distance_m != null && existing.sixMinuteWalkDistanceM == null) {
      updates.six_minute_walk_distance_m = aggregated.six_minute_walk_distance_m;
    }
    if (aggregated.stair_ascent_speed_ms != null && existing.stairAscentSpeedMs == null) {
      updates.stair_ascent_speed_ms = aggregated.stair_ascent_speed_ms;
    }
    if (aggregated.stair_descent_speed_ms != null && existing.stairDescentSpeedMs == null) {
      updates.stair_descent_speed_ms = aggregated.stair_descent_speed_ms;
    }

    if (Object.keys(updates).length > 0) {
      // Update via healthRouter which routes to Supabase when enabled
      // Keys are already snake_case to match Supabase column names
      await healthRouter.upsertDailyMetrics(userId, {
        local_date: localDate,
        timezone,
        ...updates,
      } as any);

      logger.info(`[SampleAggregator] Updated ${Object.keys(updates).length} metrics from samples for ${userId} on ${localDate}:`, updates);
    }
  } catch (error) {
    logger.error('[SampleAggregator] Error filling missing metrics:', error);
  }
}

/**
 * Backfill missing metrics for recent days
 * Useful for running once to populate historical data
 * 
 * USES healthStorageRouter for database access (Supabase when enabled)
 */
export async function backfillMissingMetrics(userId: string, days: number = 30): Promise<void> {
  try {
    logger.info(`[SampleAggregator] Starting backfill for ${userId}, last ${days} days`);

    // Get recent daily metrics records via healthStorageRouter (routes to Supabase when enabled)
    const healthRouter = await import("./healthStorageRouter");
    const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: days });

    let updated = 0;
    for (const record of recentMetrics) {
      await fillMissingMetricsFromSamples(userId, record.localDate, record.timezone);
      updated++;
    }

    logger.info(`[SampleAggregator] Backfill complete for ${userId}, processed ${updated} days`);
  } catch (error) {
    logger.error('[SampleAggregator] Error in backfill:', error);
  }
}

/**
 * PRIMARY METRIC AGGREGATION
 * Aggregates core HealthKit samples into daily metrics for instant tile population.
 * This enables tiles to show data immediately without waiting for iOS /api/healthkit/metrics call.
 * 
 * Handles: steps, activeEnergy, restingHR, HRV, sleep (core tile metrics)
 */

// Mapping for PRIMARY metrics (the ones tiles display)
const PRIMARY_SAMPLE_TYPE_MAPPING: Record<string, string> = {
  // Steps
  'stepCount': 'steps',
  'HKQuantityTypeIdentifierStepCount': 'steps',
  
  // Active Energy
  'activeEnergyBurned': 'active_energy_kcal',
  'HKQuantityTypeIdentifierActiveEnergyBurned': 'active_energy_kcal',
  
  // Resting Heart Rate
  'restingHeartRate': 'resting_heart_rate_bpm',
  'HKQuantityTypeIdentifierRestingHeartRate': 'resting_heart_rate_bpm',
  
  // HRV
  'heartRateVariabilitySDNN': 'hrv_ms',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': 'hrv_ms',
  
  // Sleep (category type)
  'sleepAnalysis': 'sleep',
  'HKCategoryTypeIdentifierSleepAnalysis': 'sleep',
  
  // Exercise Time
  'appleExerciseTime': 'exercise_minutes',
  'HKQuantityTypeIdentifierAppleExerciseTime': 'exercise_minutes',
  
  // Stand Hours
  'appleStandHour': 'stand_hours',
  'HKCategoryTypeIdentifierAppleStandHour': 'stand_hours',
  
  // Walking/Running Distance (HealthKit sends meters, we store meters)
  'distanceWalkingRunning': 'distance_meters',
  'HKQuantityTypeIdentifierDistanceWalkingRunning': 'distance_meters',
  
  // Flights Climbed
  'flightsClimbed': 'flights_climbed',
  'HKQuantityTypeIdentifierFlightsClimbed': 'flights_climbed',
};

// Which primary metrics to sum vs average
const PRIMARY_SUM_METRICS = ['steps', 'active_energy_kcal', 'exercise_minutes', 'distance_meters', 'flights_climbed'];

// Sleep analysis values that count as actual sleep (NOT "in bed" or "awake")
// HKCategoryValueSleepAnalysis: 0=inBed, 1=asleepUnspecified, 2=awake, 3=asleepCore, 4=asleepDeep, 5=asleepREM
// Only count actual sleeping states, exclude inBed(0) and awake(2)
const SLEEP_VALUES = [1, 3, 4, 5]; // asleepUnspecified, asleepCore, asleepDeep, asleepREM - EXCLUDES awake

interface PrimaryAggregatedMetrics {
  steps: number | null;
  active_energy_kcal: number | null;
  resting_heart_rate_bpm: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  exercise_minutes: number | null;
  stand_hours: number | null;
  distance_meters: number | null;
  flights_climbed: number | null;
}

/**
 * Aggregate PRIMARY HealthKit samples for a user on a specific date
 * Returns aggregated values for core tile metrics (steps, sleep, HRV, etc)
 */
export async function aggregatePrimaryMetricsFromSamples(
  userId: string,
  localDate: string,
  timezone: string
): Promise<PrimaryAggregatedMetrics> {
  const result: PrimaryAggregatedMetrics = {
    steps: null,
    active_energy_kcal: null,
    resting_heart_rate_bpm: null,
    hrv_ms: null,
    sleep_hours: null,
    exercise_minutes: null,
    stand_hours: null,
    distance_meters: null,
    flights_climbed: null,
  };

  try {
    // Calculate day boundaries in UTC based on local date and timezone
    const localDayStart = new TZDate(`${localDate}T00:00:00`, timezone);
    const localDayEnd = new TZDate(`${localDate}T23:59:59.999`, timezone);
    
    const dayStartUTC = new Date(localDayStart.toISOString());
    const dayEndUTC = new Date(localDayEnd.toISOString());
    
    logger.debug(`[PrimaryAggregator] Querying ${localDate} (${timezone}): UTC ${dayStartUTC.toISOString()} to ${dayEndUTC.toISOString()}`);
    
    // Get all samples for this user on this date via healthStorageRouter (Supabase)
    const samples = await healthRouter.getHealthkitSamples(userId, {
      startDate: dayStartUTC,
      endDate: dayEndUTC,
    });

    if (samples.length === 0) {
      logger.debug(`[PrimaryAggregator] No samples found for ${userId} on ${localDate}`);
      return result;
    }

    // Group samples by target metric
    const groupedValues: Record<string, number[]> = {};
    let totalSleepMs = 0;
    let standHourCount = 0;
    
    for (const sample of samples) {
      const targetField = PRIMARY_SAMPLE_TYPE_MAPPING[sample.dataType];
      if (!targetField) continue;
      
      // Special handling for sleep - calculate duration from start/end times
      if (targetField === 'sleep') {
        // Check if this is actual sleep (not just "in bed")
        const metadata = sample.metadata as Record<string, any> | null;
        const sleepValue = sample.value ?? metadata?.value;
        if (sleepValue !== undefined && SLEEP_VALUES.includes(Number(sleepValue))) {
          const startTime = new Date(sample.startDate).getTime();
          const endTime = new Date(sample.endDate).getTime();
          const durationMs = endTime - startTime;
          if (durationMs > 0) {
            totalSleepMs += durationMs;
          }
        }
        continue;
      }
      
      // Special handling for stand hours - count instances
      if (targetField === 'stand_hours') {
        // Apple stand hour is a category type where value=0 means stood
        const metadata = sample.metadata as Record<string, any> | null;
        const standValue = sample.value ?? metadata?.value;
        if (standValue === 0) {
          standHourCount++;
        }
        continue;
      }
      
      if (sample.value != null) {
        if (!groupedValues[targetField]) {
          groupedValues[targetField] = [];
        }
        
        // Value is used as-is, HealthKit sends meters for distance
        groupedValues[targetField].push(sample.value);
      }
    }

    // Calculate aggregates
    for (const [field, values] of Object.entries(groupedValues)) {
      if (values.length > 0) {
        if (PRIMARY_SUM_METRICS.includes(field)) {
          (result as any)[field] = Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
        } else {
          // Average for vital signs (HRV, resting HR)
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          (result as any)[field] = Math.round(avg * 10) / 10;
        }
      }
    }
    
    // Set sleep hours from total ms
    if (totalSleepMs > 0) {
      result.sleep_hours = Math.round((totalSleepMs / (1000 * 60 * 60)) * 10) / 10;
    }
    
    // Set stand hours
    if (standHourCount > 0) {
      result.stand_hours = standHourCount;
    }

    const nonNullFields = Object.entries(result).filter(([_, v]) => v !== null).map(([k]) => k);
    if (nonNullFields.length > 0) {
      logger.info(`[PrimaryAggregator] Aggregated ${nonNullFields.length} PRIMARY metrics for ${userId} on ${localDate}: ${nonNullFields.join(', ')}`);
    }

    return result;
  } catch (error) {
    logger.error('[PrimaryAggregator] Error aggregating primary samples:', error);
    return result;
  }
}

/**
 * Create/update user_daily_metrics with PRIMARY aggregated sample data
 * This is the key function that enables instant tile population
 */
export async function fillPrimaryMetricsFromSamples(
  userId: string,
  localDate: string,
  timezone: string
): Promise<boolean> {
  try {
    const healthRouterModule = await import("./healthStorageRouter");
    const existing = await healthRouterModule.getUserDailyMetricsByDate(userId, localDate);

    const aggregated = await aggregatePrimaryMetricsFromSamples(userId, localDate, timezone);
    
    const hasAggregatedData = Object.values(aggregated).some(v => v !== null);
    
    if (!hasAggregatedData) {
      logger.debug(`[PrimaryAggregator] No primary metrics to aggregate for ${userId} on ${localDate}`);
      return false;
    }
    
    // Build the upsert record
    const record: Record<string, any> = {
      local_date: localDate,
      timezone,
    };
    
    // Map aggregated values to Supabase column names (snake_case for writes)
    // existing uses camelCase from normalizeUserDailyMetric: stepsRawSum, activeEnergyKcal, restingHrBpm, hrvMs, etc.
    if (aggregated.steps != null && (!existing || existing.stepsRawSum == null)) {
      record.steps_raw_sum = aggregated.steps;
      record.steps_normalized = aggregated.steps;
    }
    if (aggregated.active_energy_kcal != null && (!existing || existing.activeEnergyKcal == null)) {
      record.active_energy_kcal = aggregated.active_energy_kcal;
    }
    // Note: restingHrBpm is the camelCase version (not restingHeartRateBpm)
    if (aggregated.resting_heart_rate_bpm != null && (!existing || existing.restingHrBpm == null)) {
      record.resting_hr_bpm = aggregated.resting_heart_rate_bpm;
    }
    if (aggregated.hrv_ms != null && (!existing || existing.hrvMs == null)) {
      record.hrv_ms = aggregated.hrv_ms;
    }
    if (aggregated.sleep_hours != null && (!existing || existing.sleepHours == null)) {
      record.sleep_hours = aggregated.sleep_hours;
    }
    if (aggregated.exercise_minutes != null && (!existing || existing.exerciseMinutes == null)) {
      record.exercise_minutes = aggregated.exercise_minutes;
    }
    if (aggregated.stand_hours != null && (!existing || existing.standHours == null)) {
      record.stand_hours = aggregated.stand_hours;
    }
    // Distance is already in meters from HealthKit
    if (aggregated.distance_meters != null && (!existing || existing.distanceMeters == null)) {
      record.distance_meters = aggregated.distance_meters;
    }
    if (aggregated.flights_climbed != null && (!existing || existing.flightsClimbed == null)) {
      record.flights_climbed = aggregated.flights_climbed;
    }
    
    // Only upsert if we have new fields to add
    const newFieldCount = Object.keys(record).length - 2; // subtract local_date and timezone
    if (newFieldCount > 0) {
      await healthRouterModule.upsertDailyMetrics(userId, record as any);
      logger.info(`[PrimaryAggregator] Upserted ${newFieldCount} PRIMARY metrics for ${userId} on ${localDate}`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('[PrimaryAggregator] Error filling primary metrics:', error);
    return false;
  }
}
