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

    if (!existing) {
      logger.debug(`[SampleAggregator] No daily metrics record for ${userId} on ${localDate}`);
      return;
    }

    // Check if any of our target fields are missing
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

    // Aggregate samples
    const aggregated = await aggregateSamplesForDate(userId, localDate, timezone);

    // Build update object only for fields that have values
    const updates: Record<string, number> = {};
    if (aggregated.oxygen_saturation_pct != null && existing.oxygenSaturationPct == null) {
      updates.oxygenSaturationPct = aggregated.oxygen_saturation_pct;
    }
    if (aggregated.respiratory_rate_bpm != null && existing.respiratoryRateBpm == null) {
      updates.respiratoryRateBpm = aggregated.respiratory_rate_bpm;
    }
    if (aggregated.body_temp_c != null && existing.bodyTempC == null) {
      updates.bodyTempC = aggregated.body_temp_c;
    }
    if (aggregated.basal_energy_kcal != null && existing.basalEnergyKcal == null) {
      updates.basalEnergyKcal = aggregated.basal_energy_kcal;
    }
    if (aggregated.walking_hr_avg_bpm != null && existing.walkingHrAvgBpm == null) {
      updates.walkingHrAvgBpm = aggregated.walking_hr_avg_bpm;
    }
    if (aggregated.dietary_water_ml != null && existing.dietaryWaterMl == null) {
      updates.dietaryWaterMl = aggregated.dietary_water_ml;
    }
    // Gait & Mobility
    if (aggregated.walking_speed_ms != null && existing.walkingSpeedMs == null) {
      updates.walkingSpeedMs = aggregated.walking_speed_ms;
    }
    if (aggregated.walking_step_length_m != null && existing.walkingStepLengthM == null) {
      updates.walkingStepLengthM = aggregated.walking_step_length_m;
    }
    if (aggregated.walking_double_support_pct != null && existing.walkingDoubleSupportPct == null) {
      updates.walkingDoubleSupportPct = aggregated.walking_double_support_pct;
    }
    if (aggregated.walking_asymmetry_pct != null && existing.walkingAsymmetryPct == null) {
      updates.walkingAsymmetryPct = aggregated.walking_asymmetry_pct;
    }
    if (aggregated.apple_walking_steadiness != null && existing.appleWalkingSteadiness == null) {
      updates.appleWalkingSteadiness = aggregated.apple_walking_steadiness;
    }
    if (aggregated.six_minute_walk_distance_m != null && existing.sixMinuteWalkDistanceM == null) {
      updates.sixMinuteWalkDistanceM = aggregated.six_minute_walk_distance_m;
    }
    if (aggregated.stair_ascent_speed_ms != null && existing.stairAscentSpeedMs == null) {
      updates.stairAscentSpeedMs = aggregated.stair_ascent_speed_ms;
    }
    if (aggregated.stair_descent_speed_ms != null && existing.stairDescentSpeedMs == null) {
      updates.stairDescentSpeedMs = aggregated.stair_descent_speed_ms;
    }

    if (Object.keys(updates).length > 0) {
      // Update via healthRouter which routes to Supabase when enabled
      // Use upsert with merged existing data to update specific fields
      await healthRouter.upsertDailyMetrics(userId, {
        local_date: localDate,
        timezone,
        ...Object.fromEntries(
          Object.entries(updates).map(([key, value]) => [
            // Convert camelCase to snake_case for Supabase
            key.replace(/([A-Z])/g, '_$1').toLowerCase(),
            value
          ])
        ),
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
