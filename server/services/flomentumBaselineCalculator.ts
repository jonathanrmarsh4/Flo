import { db } from "../db";
import { healthBaselines } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import * as healthRouter from "./healthStorageRouter";

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

  const endDate = new Date(currentDate);
  const startDate = new Date(currentDate);
  startDate.setDate(startDate.getDate() - WINDOW_DAYS);

  try {
    const metrics = await healthRouter.getUserDailyMetrics(userId, {
      startDate: startDate,
      endDate: endDate,
      limit: WINDOW_DAYS + 1,
    });

    const restingHrValues: number[] = [];
    const hrvValues: number[] = [];
    const respRateValues: number[] = [];

    for (const m of metrics) {
      if (m.restingHrBpm != null) restingHrValues.push(m.restingHrBpm);
      if (m.hrvMs != null) hrvValues.push(m.hrvMs);
      if (m.respiratoryRateBpm != null) respRateValues.push(m.respiratoryRateBpm);
    }

    if (restingHrValues.length >= MIN_SAMPLES) {
      const avg = restingHrValues.reduce((a, b) => a + b, 0) / restingHrValues.length;
      result.restingHrBaseline = avg;
      await persistBaseline(userId, 'resting_heart_rate_bpm', avg, restingHrValues.length);
    } else {
      result.restingHrBaseline = 60;
      logger.debug(`Insufficient resting HR data for Flōmentum baseline`, {
        userId,
        sampleCount: restingHrValues.length,
        minRequired: MIN_SAMPLES,
      });
    }

    if (hrvValues.length >= MIN_SAMPLES) {
      const avg = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
      result.hrvBaseline = avg;
      await persistBaseline(userId, 'hrv_ms', avg, hrvValues.length);
    } else {
      result.hrvBaseline = 50;
      logger.debug(`Insufficient HRV data for Flōmentum baseline`, {
        userId,
        sampleCount: hrvValues.length,
        minRequired: MIN_SAMPLES,
      });
    }

    if (respRateValues.length >= MIN_SAMPLES) {
      const avg = respRateValues.reduce((a, b) => a + b, 0) / respRateValues.length;
      result.respRateBaseline = avg;
      await persistBaseline(userId, 'respiratory_rate_bpm', avg, respRateValues.length);
    } else {
      result.respRateBaseline = 16;
      logger.debug(`Insufficient respiratory rate data for Flōmentum baseline`, {
        userId,
        sampleCount: respRateValues.length,
        minRequired: MIN_SAMPLES,
      });
    }

  } catch (error) {
    logger.error(`Failed to calculate Flōmentum baselines`, { userId, error });
    result.restingHrBaseline = 60;
    result.hrvBaseline = 50;
    result.respRateBaseline = 16;
  }

  return result;
}

async function persistBaseline(
  userId: string,
  metricKey: string,
  baseline: number,
  numSamples: number
): Promise<void> {
  await db
    .insert(healthBaselines)
    .values({
      userId,
      metricKey,
      baseline,
      windowDays: WINDOW_DAYS,
      numSamples,
    })
    .onConflictDoUpdate({
      target: [healthBaselines.userId, healthBaselines.metricKey],
      set: {
        baseline,
        numSamples,
        lastCalculatedAt: new Date(),
      },
    });

  logger.debug(`Calculated Flōmentum baseline for ${metricKey}`, {
    userId,
    baseline,
    numSamples,
  });
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
    if (baseline.metricKey === 'resting_heart_rate_bpm') {
      result.restingHrBaseline = baseline.baseline;
    } else if (baseline.metricKey === 'hrv_ms') {
      result.hrvBaseline = baseline.baseline;
    } else if (baseline.metricKey === 'respiratory_rate_bpm') {
      result.respRateBaseline = baseline.baseline;
    }
  }

  return result;
}
