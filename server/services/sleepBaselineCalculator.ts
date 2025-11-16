import { db } from "../db";
import { sleepNights, sleepSubscores, sleepBaselines } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { logger } from "../logger";

// Metrics to track for sleep baselines
const SLEEP_BASELINE_METRICS = [
  'total_sleep_min',
  'deep_pct',
  'rem_pct',
  'sleep_efficiency_pct',
  'mid_sleep_time_local',
  'resting_hr_bpm',
  'hrv_ms',
  'respiratory_rate',
  'wrist_temperature',
  'oxygen_saturation',
  'nightflo_score',
];

const WINDOW_DAYS = 28;
const MIN_SAMPLES = 5; // Minimum nights needed for baselines

// Helper: Calculate median of array
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// Helper: Calculate standard deviation
function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Calculate baselines for a single user
export async function calculateSleepBaselinesForUser(userId: string): Promise<void> {
  try {
    logger.info('Calculating sleep baselines', { userId });

    // Get cutoff date (28 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - WINDOW_DAYS);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // Fetch last 28 days of sleep nights
    const nights = await db
      .select()
      .from(sleepNights)
      .where(and(
        eq(sleepNights.userId, userId),
        gte(sleepNights.sleepDate, cutoffDateStr)
      ))
      .orderBy(desc(sleepNights.sleepDate));

    // Fetch corresponding subscores
    const subscores = await db
      .select()
      .from(sleepSubscores)
      .where(and(
        eq(sleepSubscores.userId, userId),
        gte(sleepSubscores.sleepDate, cutoffDateStr)
      ))
      .orderBy(desc(sleepSubscores.sleepDate));

    if (nights.length < MIN_SAMPLES) {
      logger.info('Insufficient sleep data for baselines', { userId, nights: nights.length, required: MIN_SAMPLES });
      return;
    }

    // Create maps for quick lookup
    const subscoreMap = new Map(subscores.map(s => [s.sleepDate, s]));

    // Calculate baselines for each metric
    for (const metricKey of SLEEP_BASELINE_METRICS) {
      const values: number[] = [];

      for (const night of nights) {
        let value: number | null = null;

        // Extract value based on metric key
        switch (metricKey) {
          case 'total_sleep_min':
            value = night.totalSleepMin;
            break;
          case 'deep_pct':
            value = night.deepPct;
            break;
          case 'rem_pct':
            value = night.remPct;
            break;
          case 'sleep_efficiency_pct':
            value = night.sleepEfficiencyPct;
            break;
          case 'mid_sleep_time_local':
            value = night.midSleepTimeLocal;
            break;
          case 'resting_hr_bpm':
            value = night.restingHrBpm;
            break;
          case 'hrv_ms':
            value = night.hrvMs;
            break;
          case 'respiratory_rate':
            value = night.respiratoryRate;
            break;
          case 'wrist_temperature':
            value = night.wristTemperature;
            break;
          case 'oxygen_saturation':
            value = night.oxygenSaturation;
            break;
          case 'nightflo_score':
            const subscore = subscoreMap.get(night.sleepDate);
            value = subscore?.nightfloScore || null;
            break;
        }

        if (value !== null && !isNaN(value)) {
          values.push(value);
        }
      }

      // Skip if insufficient data for this metric
      if (values.length < MIN_SAMPLES) {
        logger.debug(`Insufficient data for metric ${metricKey}`, { userId, samples: values.length });
        continue;
      }

      // Calculate statistics
      const medianValue = median(values);
      const meanValue = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDevValue = stdDev(values, meanValue);

      // Upsert baseline
      await db
        .insert(sleepBaselines)
        .values({
          userId,
          metricKey,
          windowDays: WINDOW_DAYS,
          median: medianValue,
          stdDev: stdDevValue,
          numSamples: values.length,
          lastCalculatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [sleepBaselines.userId, sleepBaselines.metricKey],
          set: {
            median: medianValue,
            stdDev: stdDevValue,
            numSamples: values.length,
            lastCalculatedAt: new Date(),
          },
        });

      logger.debug(`Updated baseline for ${metricKey}`, {
        userId,
        metricKey,
        median: medianValue,
        stdDev: stdDevValue,
        samples: values.length,
      });
    }

    logger.info('Sleep baselines calculation complete', { userId, nights: nights.length });
  } catch (error) {
    logger.error('Error calculating sleep baselines', { error, userId });
    throw error;
  }
}

// Calculate baselines for all users (for scheduled runs)
export async function calculateSleepBaselinesForAllUsers(): Promise<void> {
  try {
    logger.info('Starting sleep baseline calculation for all users');

    // Get unique user IDs from sleep_nights
    const users = await db
      .selectDistinct({ userId: sleepNights.userId })
      .from(sleepNights);

    logger.info(`Found ${users.length} users with sleep data`);

    for (const { userId } of users) {
      try {
        await calculateSleepBaselinesForUser(userId);
      } catch (error) {
        logger.error('Failed to calculate baselines for user', { error, userId });
        // Continue with other users
      }
    }

    logger.info('Completed sleep baseline calculation for all users');
  } catch (error) {
    logger.error('Error in sleep baseline calculation job', { error });
    throw error;
  }
}
