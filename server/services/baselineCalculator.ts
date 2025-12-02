import { db } from "../db";
import { userMetricBaselines } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "../logger";
import * as healthRouter from "./healthStorageRouter";

export type MetricKey = 
  | "sleep_hours" 
  | "resting_hr" 
  | "hrv_ms" 
  | "active_energy_kcal"
  | "basal_energy_kcal"
  | "walking_hr_avg_bpm"
  | "dietary_water_ml"
  | "oxygen_saturation_pct"
  | "respiratory_rate_bpm";

export interface BaselineStats {
  mean: number;
  stdDev: number;
  numSamples: number;
}

/**
 * Calculate rolling baseline statistics for a specific metric and user
 * @param userId User ID
 * @param metricKey Metric to calculate baseline for
 * @param windowDays Number of days to include in rolling window (default: 30)
 * @returns Baseline statistics or null if insufficient data
 */
export async function calculateBaseline(
  userId: string,
  metricKey: MetricKey,
  windowDays: number = 30
): Promise<BaselineStats | null> {
  try {
    // Calculate date threshold for rolling window
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    logger.debug(`[Baseline] Calculating ${metricKey} baseline for user ${userId}, window: ${windowDays} days`);

    // Fetch all daily metrics within the window via healthRouter (routes to Supabase when enabled)
    const records = await healthRouter.getUserDailyMetrics(userId, { 
      startDate: cutoffDate, 
      limit: windowDays + 1 
    });

    // Map metric key to the corresponding field in the normalized response
    const fieldMap: Record<MetricKey, string> = {
      sleep_hours: 'sleepHours',
      resting_hr: 'restingHrBpm',
      hrv_ms: 'hrvMs',
      active_energy_kcal: 'activeEnergyKcal',
      basal_energy_kcal: 'basalEnergyKcal',
      walking_hr_avg_bpm: 'walkingHrAvgBpm',
      dietary_water_ml: 'dietaryWaterMl',
      oxygen_saturation_pct: 'oxygenSaturationPct',
      respiratory_rate_bpm: 'respiratoryRateBpm',
    };

    const field = fieldMap[metricKey];

    // Extract non-null values for the specified metric
    const values: number[] = [];
    for (const record of records) {
      const value = (record as any)[field];
      if (value != null) {
        values.push(value);
      }
    }

    if (values.length === 0) {
      logger.debug(`[Baseline] No data for ${metricKey}, user ${userId}`);
      return null;
    }

    const numSamples = values.length;

    // Calculate mean
    const mean = values.reduce((sum, val) => sum + val, 0) / numSamples;

    // Calculate standard deviation
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / numSamples;
    const stdDev = Math.sqrt(variance);

    logger.debug(
      `[Baseline] ${metricKey} for user ${userId}: mean=${mean.toFixed(2)}, stdDev=${stdDev.toFixed(2)}, n=${numSamples}`
    );

    return {
      mean,
      stdDev,
      numSamples,
    };
  } catch (error) {
    logger.error(`[Baseline] Error calculating baseline for ${metricKey}, user ${userId}:`, error);
    return null;
  }
}

/**
 * Update baseline statistics for a user and metric, storing in database
 * @param userId User ID
 * @param metricKey Metric to update baseline for
 * @param windowDays Number of days in rolling window (default: 30)
 */
export async function updateBaseline(
  userId: string,
  metricKey: MetricKey,
  windowDays: number = 30
): Promise<void> {
  try {
    const stats = await calculateBaseline(userId, metricKey, windowDays);

    if (!stats) {
      logger.warn(`[Baseline] Skipping update for ${metricKey}, user ${userId} - no data`);
      return;
    }

    // Check if baseline record exists
    const existing = await db
      .select()
      .from(userMetricBaselines)
      .where(
        and(
          eq(userMetricBaselines.userId, userId),
          eq(userMetricBaselines.metricKey, metricKey)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing baseline
      await db
        .update(userMetricBaselines)
        .set({
          mean: stats.mean,
          stdDev: stats.stdDev,
          numSamples: stats.numSamples,
          windowDays,
          lastCalculatedAt: new Date(),
        })
        .where(
          and(
            eq(userMetricBaselines.userId, userId),
            eq(userMetricBaselines.metricKey, metricKey)
          )
        );

      logger.info(`[Baseline] Updated ${metricKey} baseline for user ${userId}`);
    } else {
      // Insert new baseline
      await db.insert(userMetricBaselines).values({
        userId,
        metricKey,
        mean: stats.mean,
        stdDev: stats.stdDev,
        numSamples: stats.numSamples,
        windowDays,
      });

      logger.info(`[Baseline] Created ${metricKey} baseline for user ${userId}`);
    }
  } catch (error) {
    logger.error(`[Baseline] Error updating baseline for ${metricKey}, user ${userId}:`, error);
    throw error;
  }
}

/**
 * Update all metric baselines for a specific user
 * @param userId User ID
 * @param windowDays Number of days in rolling window (default: 30)
 */
export async function updateAllBaselines(
  userId: string,
  windowDays: number = 30
): Promise<void> {
  const metrics: MetricKey[] = [
    "sleep_hours", 
    "resting_hr", 
    "hrv_ms", 
    "active_energy_kcal",
    // 5 newly added metrics for complete HealthKit coverage
    "basal_energy_kcal",
    "walking_hr_avg_bpm",
    "dietary_water_ml",
    "oxygen_saturation_pct",
    "respiratory_rate_bpm",
  ];

  logger.info(`[Baseline] Updating all baselines for user ${userId}`);

  for (const metric of metrics) {
    await updateBaseline(userId, metric, windowDays);
  }

  logger.info(`[Baseline] Completed baseline updates for user ${userId}`);
}

/**
 * Get baseline stats for a specific user and metric from database
 * @param userId User ID
 * @param metricKey Metric to retrieve baseline for
 * @returns Baseline stats or null if not found
 */
export async function getBaseline(
  userId: string,
  metricKey: MetricKey
): Promise<BaselineStats | null> {
  try {
    const baseline = await db
      .select()
      .from(userMetricBaselines)
      .where(
        and(
          eq(userMetricBaselines.userId, userId),
          eq(userMetricBaselines.metricKey, metricKey)
        )
      )
      .limit(1);

    if (baseline.length === 0) {
      return null;
    }

    const b = baseline[0];
    if (b.mean === null || b.numSamples === 0) {
      return null;
    }

    return {
      mean: b.mean,
      stdDev: b.stdDev ?? 0,
      numSamples: b.numSamples,
    };
  } catch (error) {
    logger.error(`[Baseline] Error getting baseline for ${metricKey}, user ${userId}:`, error);
    return null;
  }
}
