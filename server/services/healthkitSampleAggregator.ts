/**
 * HealthKit Sample Aggregator
 * 
 * Aggregates individual HealthKit samples into daily metrics for metrics that
 * iOS doesn't automatically aggregate (oxygen saturation, respiratory rate, body temp, etc.)
 */

import { db } from '../db';
import { healthkitSamples, userDailyMetrics } from '@shared/schema';
import { eq, and, gte, lte, lt, sql, desc } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { TZDate } from '@date-fns/tz';

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
};

// Which metrics to average vs sum
const SUM_METRICS = ['basal_energy_kcal', 'dietary_water_ml'];

interface AggregatedMetrics {
  oxygen_saturation_pct: number | null;
  respiratory_rate_bpm: number | null;
  body_temp_c: number | null;
  basal_energy_kcal: number | null;
  walking_hr_avg_bpm: number | null;
  dietary_water_ml: number | null;
}

/**
 * Aggregate HealthKit samples for a user on a specific date
 * Returns aggregated values for metrics that iOS doesn't aggregate
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
    
    // Get all samples for this user on this date
    const samples = await db
      .select({
        dataType: healthkitSamples.dataType,
        value: healthkitSamples.value,
        unit: healthkitSamples.unit,
      })
      .from(healthkitSamples)
      .where(
        and(
          eq(healthkitSamples.userId, userId),
          gte(healthkitSamples.startDate, dayStartUTC),
          lte(healthkitSamples.startDate, dayEndUTC)
        )
      );

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
 */
export async function fillMissingMetricsFromSamples(
  userId: string,
  localDate: string,
  timezone: string
): Promise<void> {
  try {
    // Get current daily metrics
    const [existing] = await db
      .select()
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          eq(userDailyMetrics.localDate, localDate)
        )
      )
      .limit(1);

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

    if (Object.keys(updates).length > 0) {
      await db
        .update(userDailyMetrics)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, localDate)
          )
        );

      logger.info(`[SampleAggregator] Updated ${Object.keys(updates).length} metrics from samples for ${userId} on ${localDate}:`, updates);
    }
  } catch (error) {
    logger.error('[SampleAggregator] Error filling missing metrics:', error);
  }
}

/**
 * Backfill missing metrics for recent days
 * Useful for running once to populate historical data
 */
export async function backfillMissingMetrics(userId: string, days: number = 30): Promise<void> {
  try {
    logger.info(`[SampleAggregator] Starting backfill for ${userId}, last ${days} days`);

    // Get recent daily metrics records
    const recentMetrics = await db
      .select({
        localDate: userDailyMetrics.localDate,
        timezone: userDailyMetrics.timezone,
      })
      .from(userDailyMetrics)
      .where(eq(userDailyMetrics.userId, userId))
      .orderBy(desc(userDailyMetrics.localDate))
      .limit(days);

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
