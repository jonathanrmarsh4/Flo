import { db } from "../db";
import { healthDailyMetrics, healthBaselines } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "../logger";

interface BaselineMetric {
  metricKey: 'resting_hr' | 'hrv_sdnn_ms' | 'respiratory_rate';
  columnName: string;
  defaultValue: number | null;
}

const BASELINE_METRICS: BaselineMetric[] = [
  { metricKey: 'resting_hr', columnName: 'resting_hr', defaultValue: 60 },
  { metricKey: 'hrv_sdnn_ms', columnName: 'hrv_sdnn_ms', defaultValue: 50 },
  { metricKey: 'respiratory_rate', columnName: 'respiratory_rate', defaultValue: 16 },
];

const WINDOW_DAYS = 30;
const MIN_SAMPLES = 5;

export interface FlomentumBaselineResult {
  restingHrBaseline: number | null;
  hrvBaseline: number | null;
  respRateBaseline: number | null;
}

export async function calculateFlomentumBaselines(
  userId: string,
  currentDate: string
): Promise<FlomentumBaselineResult> {
  const result: FlomentumBaselineResult = {
    restingHrBaseline: null,
    hrvBaseline: null,
    respRateBaseline: null,
  };

  const windowStartDate = new Date(currentDate);
  windowStartDate.setDate(windowStartDate.getDate() - WINDOW_DAYS);
  const windowStart = windowStartDate.toISOString().split('T')[0];

  for (const metric of BASELINE_METRICS) {
    try {
      const baseline = await calculateMetricBaseline(
        userId,
        metric.metricKey,
        metric.columnName,
        windowStart,
        currentDate,
        metric.defaultValue
      );

      if (metric.metricKey === 'resting_hr') {
        result.restingHrBaseline = baseline;
      } else if (metric.metricKey === 'hrv_sdnn_ms') {
        result.hrvBaseline = baseline;
      } else if (metric.metricKey === 'respiratory_rate') {
        result.respRateBaseline = baseline;
      }
    } catch (error) {
      logger.error(`Failed to calculate Flōmentum baseline for ${metric.metricKey}`, { userId, error });
    }
  }

  return result;
}

async function calculateMetricBaseline(
  userId: string,
  metricKey: string,
  columnName: string,
  windowStart: string,
  currentDate: string,
  defaultValue: number | null
): Promise<number | null> {
  // Validate column name against whitelist
  const validColumns = ['resting_hr', 'hrv_sdnn_ms', 'respiratory_rate'];
  if (!validColumns.includes(columnName)) {
    logger.error(`Invalid column name for baseline calculation: ${columnName}`);
    return defaultValue;
  }

  const query = sql`
    SELECT 
      AVG(${sql.raw(columnName)})::REAL as avg_value,
      COUNT(*)::INTEGER as sample_count
    FROM ${healthDailyMetrics}
    WHERE user_id = ${userId}
      AND date >= ${windowStart}
      AND date <= ${currentDate}
      AND ${sql.raw(columnName)} IS NOT NULL
  `;

  const result = await db.execute(query);
  const row = result.rows[0] as { avg_value: number | null; sample_count: number };

  const avgValue = row.avg_value;
  const sampleCount = row.sample_count;

  if (avgValue === null || avgValue === undefined || sampleCount < MIN_SAMPLES) {
    logger.debug(`Insufficient data for Flōmentum ${metricKey} baseline`, {
      userId,
      sampleCount,
      minRequired: MIN_SAMPLES,
    });
    return defaultValue;
  }

  await db
    .insert(healthBaselines)
    .values({
      userId,
      metricKey,
      baseline: avgValue,
      windowDays: WINDOW_DAYS,
      numSamples: sampleCount,
    })
    .onConflictDoUpdate({
      target: [healthBaselines.userId, healthBaselines.metricKey],
      set: {
        baseline: avgValue,
        numSamples: sampleCount,
        lastCalculatedAt: new Date(),
      },
    });

  logger.debug(`Calculated Flōmentum baseline for ${metricKey}`, {
    userId,
    baseline: avgValue,
    numSamples: sampleCount,
  });

  return avgValue;
}

export async function getFlomentumBaselines(userId: string): Promise<FlomentumBaselineResult> {
  const baselines = await db
    .select()
    .from(healthBaselines)
    .where(eq(healthBaselines.userId, userId));

  const result: FlomentumBaselineResult = {
    restingHrBaseline: null,
    hrvBaseline: null,
    respRateBaseline: null,
  };

  for (const baseline of baselines) {
    if (baseline.metricKey === 'resting_hr') {
      result.restingHrBaseline = baseline.baseline;
    } else if (baseline.metricKey === 'hrv_sdnn_ms') {
      result.hrvBaseline = baseline.baseline;
    } else if (baseline.metricKey === 'respiratory_rate') {
      result.respRateBaseline = baseline.baseline;
    }
  }

  return result;
}
