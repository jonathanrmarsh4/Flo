/**
 * Weight & Body Composition Data Ingestion Service
 * 
 * Syncs weight and body composition data from HealthKit samples to ClickHouse
 * for the weight forecasting engine.
 */

import { getClickHouseClient, isClickHouseEnabled } from '../clickhouseService';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('WeightDataIngestion');

// HealthKit data type identifiers for weight and body composition
const WEIGHT_DATA_TYPES = [
  'bodyMass',
  'HKQuantityTypeIdentifierBodyMass',
  'weight',
];

const BODY_FAT_DATA_TYPES = [
  'bodyFatPercentage',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'bodyFat',
];

const LEAN_MASS_DATA_TYPES = [
  'leanBodyMass',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'leanMass',
];

export interface HealthKitSample {
  data_type: string;
  value: number;
  unit: string;
  start_date: string;
  end_date: string;
  source_name?: string | null;
  source_bundle_id?: string | null;
  device_name?: string | null;
  device_manufacturer?: string | null;
  device_model?: string | null;
  metadata?: Record<string, any> | null;
  uuid?: string | null;
}

export interface WeightEvent {
  user_id: string;
  event_id: string;
  timestamp_utc: string;
  user_timezone: string;
  local_date_key: string;
  weight_kg: number;
  source_type: string;
  source_device_name: string | null;
  imported: number;
  editable: number;
}

export interface BodyCompEvent {
  user_id: string;
  event_id: string;
  timestamp_utc: string;
  user_timezone: string;
  local_date_key: string;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  source_type: string;
  source_device_name: string | null;
  estimated: number;
  imported: number;
  editable: number;
}

/**
 * Converts a weight value to kilograms
 */
function convertToKg(value: number, unit: string): number {
  const unitLower = unit.toLowerCase();
  if (unitLower === 'lb' || unitLower === 'lbs' || unitLower === 'pound' || unitLower === 'pounds') {
    return value * 0.453592;
  }
  if (unitLower === 'st' || unitLower === 'stone') {
    return value * 6.35029;
  }
  // Default to kg
  return value;
}

/**
 * Gets local date key from a timestamp and timezone
 */
function getLocalDateKey(timestamp: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(timestamp);
  } catch {
    // Fallback to UTC date
    return timestamp.toISOString().split('T')[0];
  }
}

/**
 * Determines the source type from HealthKit sample metadata
 */
function getSourceType(sample: HealthKitSample): string {
  const source = sample.source_name?.toLowerCase() || '';
  const bundleId = sample.source_bundle_id?.toLowerCase() || '';
  const device = sample.device_name?.toLowerCase() || '';

  // Check for specific device integrations
  if (source.includes('withings') || bundleId.includes('withings')) return 'WITHINGS';
  if (source.includes('garmin') || bundleId.includes('garmin')) return 'GARMIN';
  if (source.includes('fitbit') || bundleId.includes('fitbit')) return 'FITBIT';
  if (source.includes('oura') || bundleId.includes('oura')) return 'OURA';
  if (source.includes('whoop') || bundleId.includes('whoop')) return 'WHOOP';
  if (device.includes('apple watch') || bundleId.includes('apple.health')) return 'APPLE_WATCH';
  
  // Default to HealthKit import
  return 'HEALTHKIT';
}

/**
 * Syncs HealthKit samples containing weight/body-comp to ClickHouse
 * 
 * @param userId - The health_id or user identifier
 * @param samples - Array of HealthKit samples
 * @param timezone - User's timezone (defaults to Australia/Perth)
 * @returns Number of weight events and body-comp events inserted
 */
export async function syncHealthKitWeightSamples(
  userId: string,
  samples: HealthKitSample[],
  timezone: string = 'Australia/Perth'
): Promise<{ weightEvents: number; bodyCompEvents: number }> {
  if (!isClickHouseEnabled()) {
    logger.debug('[WeightDataIngestion] ClickHouse not enabled - skipping sync');
    return { weightEvents: 0, bodyCompEvents: 0 };
  }

  const client = getClickHouseClient();
  if (!client) {
    logger.warn('[WeightDataIngestion] ClickHouse client not available');
    return { weightEvents: 0, bodyCompEvents: 0 };
  }

  const weightEvents: WeightEvent[] = [];
  const bodyCompEvents: BodyCompEvent[] = [];

  // Group body composition samples by timestamp for combining fat% and lean mass
  const bodyCompByTimestamp = new Map<string, { bodyFatPct: number | null; leanMassKg: number | null; sample: HealthKitSample }>();

  for (const sample of samples) {
    const dataType = sample.data_type;
    const timestamp = new Date(sample.start_date);
    const timestampKey = sample.start_date;

    // Process weight samples
    if (WEIGHT_DATA_TYPES.some(t => dataType.toLowerCase().includes(t.toLowerCase()))) {
      const weightKg = convertToKg(sample.value, sample.unit);
      
      // Sanity check - valid adult weight range
      if (weightKg >= 20 && weightKg <= 300) {
        weightEvents.push({
          user_id: userId,
          event_id: sample.uuid || uuidv4(),
          timestamp_utc: timestamp.toISOString(),
          user_timezone: timezone,
          local_date_key: getLocalDateKey(timestamp, timezone),
          weight_kg: weightKg,
          source_type: getSourceType(sample),
          source_device_name: sample.device_name || null,
          imported: 1,
          editable: 0,
        });
      }
    }

    // Process body fat percentage samples
    if (BODY_FAT_DATA_TYPES.some(t => dataType.toLowerCase().includes(t.toLowerCase()))) {
      const existing = bodyCompByTimestamp.get(timestampKey) || { bodyFatPct: null, leanMassKg: null, sample };
      existing.bodyFatPct = sample.value;
      existing.sample = sample;
      bodyCompByTimestamp.set(timestampKey, existing);
    }

    // Process lean body mass samples
    if (LEAN_MASS_DATA_TYPES.some(t => dataType.toLowerCase().includes(t.toLowerCase()))) {
      const existing = bodyCompByTimestamp.get(timestampKey) || { bodyFatPct: null, leanMassKg: null, sample };
      existing.leanMassKg = convertToKg(sample.value, sample.unit);
      existing.sample = sample;
      bodyCompByTimestamp.set(timestampKey, existing);
    }
  }

  // Convert body composition map to events
  for (const [timestampKey, data] of Array.from(bodyCompByTimestamp.entries())) {
    const timestamp = new Date(timestampKey);
    
    // Only add if we have at least one measurement
    if (data.bodyFatPct !== null || data.leanMassKg !== null) {
      bodyCompEvents.push({
        user_id: userId,
        event_id: data.sample.uuid || uuidv4(),
        timestamp_utc: timestamp.toISOString(),
        user_timezone: timezone,
        local_date_key: getLocalDateKey(timestamp, timezone),
        body_fat_pct: data.bodyFatPct,
        lean_mass_kg: data.leanMassKg,
        source_type: getSourceType(data.sample),
        source_device_name: data.sample.device_name || null,
        estimated: 0,
        imported: 1,
        editable: 0,
      });
    }
  }

  let insertedWeightCount = 0;
  let insertedBodyCompCount = 0;

  // Insert weight events
  if (weightEvents.length > 0) {
    try {
      await client.insert({
        table: 'flo_ml.raw_weight_events',
        values: weightEvents,
        format: 'JSONEachRow',
      });
      insertedWeightCount = weightEvents.length;
      logger.info(`[WeightDataIngestion] Inserted ${insertedWeightCount} weight events for user ${userId}`);
    } catch (error) {
      logger.error('[WeightDataIngestion] Failed to insert weight events:', error);
      insertedWeightCount = 0;
    }
  }

  // Insert body composition events
  if (bodyCompEvents.length > 0) {
    try {
      await client.insert({
        table: 'flo_ml.raw_body_comp_events',
        values: bodyCompEvents,
        format: 'JSONEachRow',
      });
      insertedBodyCompCount = bodyCompEvents.length;
      logger.info(`[WeightDataIngestion] Inserted ${insertedBodyCompCount} body comp events for user ${userId}`);
    } catch (error) {
      logger.error('[WeightDataIngestion] Failed to insert body comp events:', error);
      insertedBodyCompCount = 0;
    }
  }

  return {
    weightEvents: insertedWeightCount,
    bodyCompEvents: insertedBodyCompCount,
  };
}

/**
 * Inserts a single manual weigh-in to ClickHouse
 */
export async function insertManualWeighIn(
  userId: string,
  weightKg: number,
  timestamp: Date,
  timezone: string = 'Australia/Perth'
): Promise<boolean> {
  if (!isClickHouseEnabled()) {
    return false;
  }

  const client = getClickHouseClient();
  if (!client) {
    return false;
  }

  try {
    const event: WeightEvent = {
      user_id: userId,
      event_id: uuidv4(),
      timestamp_utc: timestamp.toISOString(),
      user_timezone: timezone,
      local_date_key: getLocalDateKey(timestamp, timezone),
      weight_kg: weightKg,
      source_type: 'MANUAL',
      source_device_name: null,
      imported: 0,
      editable: 1,
    };

    await client.insert({
      table: 'flo_ml.raw_weight_events',
      values: [event],
      format: 'JSONEachRow',
    });

    logger.info(`[WeightDataIngestion] Inserted manual weigh-in for user ${userId}: ${weightKg}kg`);
    return true;
  } catch (error) {
    logger.error('[WeightDataIngestion] Failed to insert manual weigh-in:', error);
    return false;
  }
}

/**
 * Inserts manual body composition entry to ClickHouse
 */
export async function insertManualBodyComp(
  userId: string,
  bodyFatPct: number | null,
  leanMassKg: number | null,
  timestamp: Date,
  timezone: string = 'Australia/Perth',
  sourceType: string = 'MANUAL'
): Promise<boolean> {
  if (!isClickHouseEnabled()) {
    return false;
  }

  const client = getClickHouseClient();
  if (!client) {
    return false;
  }

  try {
    const event: BodyCompEvent = {
      user_id: userId,
      event_id: uuidv4(),
      timestamp_utc: timestamp.toISOString(),
      user_timezone: timezone,
      local_date_key: getLocalDateKey(timestamp, timezone),
      body_fat_pct: bodyFatPct,
      lean_mass_kg: leanMassKg,
      source_type: sourceType,
      source_device_name: null,
      estimated: 0,
      imported: 0,
      editable: 1,
    };

    await client.insert({
      table: 'flo_ml.raw_body_comp_events',
      values: [event],
      format: 'JSONEachRow',
    });

    logger.info(`[WeightDataIngestion] Inserted body comp for user ${userId}: fat=${bodyFatPct}%, lean=${leanMassKg}kg`);
    return true;
  } catch (error) {
    logger.error('[WeightDataIngestion] Failed to insert body comp:', error);
    return false;
  }
}

/**
 * Syncs historical weight data from Supabase daily metrics to ClickHouse
 * Used for backfilling when a user first enables weight forecasting
 */
export async function syncHistoricalWeightFromSupabase(
  userId: string,
  days: number = 365,
  timezone: string = 'Australia/Perth'
): Promise<number> {
  if (!isClickHouseEnabled()) {
    return 0;
  }

  const client = getClickHouseClient();
  if (!client) {
    return 0;
  }

  try {
    // Import health storage router for Supabase access
    const { getUserDailyMetrics } = await import('../healthStorageRouter');
    
    // Get historical daily metrics
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const metrics = await getUserDailyMetrics(userId, startDate, endDate);
    
    const weightEvents: WeightEvent[] = [];
    
    for (const metric of metrics) {
      // Check for weight in the daily metrics
      const weightKg = (metric as any).weight_kg || (metric as any).bodyMassKg;
      
      if (weightKg && weightKg >= 20 && weightKg <= 300) {
        const metricDate = new Date((metric as any).event_date || (metric as any).date);
        
        weightEvents.push({
          user_id: userId,
          event_id: `supabase_${userId}_${metricDate.toISOString().split('T')[0]}`,
          timestamp_utc: metricDate.toISOString(),
          user_timezone: timezone,
          local_date_key: metricDate.toISOString().split('T')[0],
          weight_kg: weightKg,
          source_type: 'SUPABASE_BACKFILL',
          source_device_name: null,
          imported: 1,
          editable: 0,
        });
      }
    }
    
    if (weightEvents.length > 0) {
      await client.insert({
        table: 'flo_ml.raw_weight_events',
        values: weightEvents,
        format: 'JSONEachRow',
      });
      
      logger.info(`[WeightDataIngestion] Backfilled ${weightEvents.length} weight events from Supabase for user ${userId}`);
    }
    
    return weightEvents.length;
  } catch (error) {
    logger.error('[WeightDataIngestion] Failed to sync historical weight from Supabase:', error);
    return 0;
  }
}
