import { db } from "../db";
import { userDailyMetrics, userDailyReadiness } from "@shared/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import { logger } from "../logger";
import { getBaseline, type BaselineStats } from "./baselineCalculator";

export interface ReadinessResult {
  userId: string;
  date: string;
  readinessScore: number;
  readinessBucket: "recover" | "ok" | "ready";
  sleepScore: number | null;
  recoveryScore: number | null;
  loadScore: number | null;
  trendScore: number | null;
  isCalibrating: boolean;
  explanations: {
    summary: string;
    sleep: string;
    recovery: string;
    load: string;
    trend: string;
  };
  metrics?: {
    avgSleepHours?: number;
    avgHRV?: number;
    stepCount?: number;
  };
  keyFactors?: string[];
  timestamp?: string;
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate sleep score relative to user's baseline
 * @param sleepHours Today's sleep hours
 * @param baseline User's sleep baseline
 * @returns Sleep score (0-100) or null if no data
 */
function calculateSleepScore(sleepHours: number | null, baseline: BaselineStats | null): number | null {
  if (sleepHours === null || sleepHours === undefined) {
    return null;
  }

  // If no baseline yet, use a reasonable default (7.5 hours)
  const baselineMean = baseline?.mean ?? 7.5;

  // Calculate deviation from baseline
  const deviation = (sleepHours - baselineMean) / baselineMean;
  const clampedDev = clamp(deviation, -0.3, 0.3);

  // Preliminary score: 70 baseline, ±30 based on deviation
  let score = 70 + (clampedDev * 100);

  // Penalize very short sleep (<5 hours)
  if (sleepHours < 5) {
    score = Math.min(score, 40);
  }

  return clamp(score, 0, 100);
}

/**
 * Calculate recovery score from HRV and resting heart rate
 * @param hrvMs Today's HRV in milliseconds
 * @param restingHr Today's resting heart rate in BPM
 * @param hrvBaseline User's HRV baseline
 * @param rhrBaseline User's resting HR baseline
 * @returns Recovery score (0-100) or null if no data
 */
function calculateRecoveryScore(
  hrvMs: number | null,
  restingHr: number | null,
  hrvBaseline: BaselineStats | null,
  rhrBaseline: BaselineStats | null
): number | null {
  let hrvScore: number | null = null;
  let rhrScore: number | null = null;

  // HRV: higher is better
  if (hrvMs !== null && hrvMs !== undefined) {
    const baselineMean = hrvBaseline?.mean ?? 50; // Default 50ms
    const hrvDev = (hrvMs - baselineMean) / baselineMean;
    const clampedDev = clamp(hrvDev, -0.3, 0.3);
    hrvScore = clamp(70 + clampedDev * 100, 0, 100);
  }

  // Resting HR: lower is better
  if (restingHr !== null && restingHr !== undefined) {
    const baselineMean = rhrBaseline?.mean ?? 60; // Default 60 BPM
    const rhrDev = (baselineMean - restingHr) / baselineMean; // Inverted: lower HR = higher score
    const clampedDev = clamp(rhrDev, -0.3, 0.3);
    rhrScore = clamp(70 + clampedDev * 100, 0, 100);
  }

  // Combine: 60% HRV, 40% RHR
  if (hrvScore !== null && rhrScore !== null) {
    return hrvScore * 0.6 + rhrScore * 0.4;
  } else if (hrvScore !== null) {
    return hrvScore;
  } else if (rhrScore !== null) {
    return rhrScore;
  } else {
    return null;
  }
}

/**
 * Calculate load score from yesterday's activity
 * Higher-than-normal load should reduce readiness
 * @param yesterdayActiveEnergy Yesterday's active energy in kcal
 * @param baseline User's active energy baseline
 * @returns Load score (0-100) or null if no data
 */
function calculateLoadScore(
  yesterdayActiveEnergy: number | null,
  baseline: BaselineStats | null
): number | null {
  if (yesterdayActiveEnergy === null || yesterdayActiveEnergy === undefined) {
    return null;
  }

  // BUGFIX: Treat 0 or very low active energy as "no data"
  // Even light sedentary activity burns ~100+ kcal/day in active energy
  // A value of 0 or near-0 indicates missing/incomplete data, not true inactivity
  // Without this check, 0 vs baseline ~600 yields -100% deviation = max score of 100
  const MIN_VALID_ACTIVE_ENERGY = 50; // kcal threshold for valid data
  if (yesterdayActiveEnergy < MIN_VALID_ACTIVE_ENERGY) {
    logger.debug(`[Readiness] Ignoring low active energy ${yesterdayActiveEnergy} kcal (below ${MIN_VALID_ACTIVE_ENERGY} threshold)`);
    return null;
  }

  if (!baseline || baseline.mean === 0) {
    return null; // Can't assess load without baseline
  }

  const loadDev = (yesterdayActiveEnergy - baseline.mean) / baseline.mean;
  const clampedDev = clamp(loadDev, -0.5, 0.5);

  // Higher load = lower score
  // Baseline score 80, -60 points if significantly higher load
  const score = 80 - (clampedDev * 60);

  return clamp(score, 0, 100);
}

/**
 * Calculate trend score from recent readiness history
 * Smooths out day-to-day noise by averaging last 3 days
 * @param userId User ID
 * @param date Current date (YYYY-MM-DD)
 * @returns Trend score (0-100) or null if insufficient history
 */
async function calculateTrendScore(userId: string, date: string): Promise<number | null> {
  try {
    // Fetch last 3 days of readiness (excluding today)
    const past = await db
      .select({
        readinessScore: userDailyReadiness.readinessScore,
        date: userDailyReadiness.date,
      })
      .from(userDailyReadiness)
      .where(
        and(
          eq(userDailyReadiness.userId, userId),
          lt(userDailyReadiness.date, date)
        )
      )
      .orderBy(desc(userDailyReadiness.date))
      .limit(3);

    if (past.length < 2) {
      // Not enough history yet
      return 70; // Neutral score
    }

    // Average the past readiness scores
    const scores = past.map(p => p.readinessScore);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    return clamp(avg, 0, 100);
  } catch (error) {
    logger.error(`[Readiness] Error calculating trend score for user ${userId}:`, error);
    return 70; // Default neutral on error
  }
}

/**
 * Compute daily readiness score for a user and date
 * @param userId User ID
 * @param date Date string (YYYY-MM-DD)
 * @returns ReadinessResult or null if no data
 */
export async function computeDailyReadiness(userId: string, date: string): Promise<ReadinessResult | null> {
  try {
    logger.info(`[Readiness] Computing readiness for user ${userId}, date ${date}`);

    // Fetch today's metrics
    const metrics = await db
      .select()
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          eq(userDailyMetrics.localDate, date)
        )
      )
      .limit(1);

    if (metrics.length === 0) {
      logger.warn(`[Readiness] No metrics found for user ${userId}, date ${date}`);
      return null;
    }

    const todayMetrics = metrics[0];

    // Fetch yesterday's metrics for load score
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const yesterdayMetrics = await db
      .select()
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          eq(userDailyMetrics.localDate, yesterdayStr)
        )
      )
      .limit(1);

    const yesterdayActiveEnergy = yesterdayMetrics.length > 0 ? yesterdayMetrics[0].activeEnergyKcal : null;

    // Fetch baselines
    const sleepBaseline = await getBaseline(userId, "sleep_hours");
    const hrvBaseline = await getBaseline(userId, "hrv_ms");
    const rhrBaseline = await getBaseline(userId, "resting_hr");
    const activityBaseline = await getBaseline(userId, "active_energy_kcal");

    // Determine if we're in calibration mode (baselines have <14 samples)
    const isCalibrating = 
      (sleepBaseline && sleepBaseline.numSamples < 14) ||
      (hrvBaseline && hrvBaseline.numSamples < 14) ||
      (rhrBaseline && rhrBaseline.numSamples < 14) ||
      (!sleepBaseline && !hrvBaseline && !rhrBaseline);

    // Calculate component scores
    const sleepScore = calculateSleepScore(todayMetrics.sleepHours, sleepBaseline);
    const recoveryScore = calculateRecoveryScore(
      todayMetrics.hrvMs,
      todayMetrics.restingHrBpm,
      hrvBaseline,
      rhrBaseline
    );
    const loadScore = calculateLoadScore(yesterdayActiveEnergy, activityBaseline);
    const trendScore = await calculateTrendScore(userId, date);

    // Define weights
    const weights = {
      sleep: 0.35,
      recovery: 0.35,
      load: 0.2,
      trend: 0.1,
    };

    // Collect available scores and renormalize weights
    const available: { score: number; weight: number }[] = [];
    if (sleepScore !== null) available.push({ score: sleepScore, weight: weights.sleep });
    if (recoveryScore !== null) available.push({ score: recoveryScore, weight: weights.recovery });
    if (loadScore !== null) available.push({ score: loadScore, weight: weights.load });
    if (trendScore !== null) available.push({ score: trendScore, weight: weights.trend });

    if (available.length === 0) {
      logger.warn(`[Readiness] No component scores available for user ${userId}, date ${date}`);
      return null;
    }

    // Renormalize weights
    const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
    const normalizedScores = available.map(item => ({
      score: item.score,
      weight: item.weight / totalWeight,
    }));

    // Calculate weighted average
    let readinessScore = normalizedScores.reduce((sum, item) => sum + item.score * item.weight, 0);

    // Clamp to narrower range if calibrating
    if (isCalibrating) {
      readinessScore = clamp(readinessScore, 50, 90);
    } else {
      readinessScore = clamp(readinessScore, 0, 100);
    }

    // Determine bucket
    let readinessBucket: "recover" | "ok" | "ready";
    if (readinessScore < 60) {
      readinessBucket = "recover";
    } else if (readinessScore < 80) {
      readinessBucket = "ok";
    } else {
      readinessBucket = "ready";
    }

    // Generate explanations
    const explanations = {
      summary: generateSummary(readinessBucket, isCalibrating),
      sleep: generateSleepExplanation(sleepScore, todayMetrics.sleepHours),
      recovery: generateRecoveryExplanation(recoveryScore, todayMetrics.hrvMs, todayMetrics.restingHrBpm),
      load: generateLoadExplanation(loadScore, yesterdayActiveEnergy),
      trend: "Recent trend smoothing applied based on last 3 days.",
    };

    // Prepare metrics for frontend display
    // Note: Activity Load uses YESTERDAY's energy, so include that for consistency
    const displayMetrics = {
      avgSleepHours: sleepBaseline?.mean ?? todayMetrics.sleepHours ?? undefined,
      avgHRV: hrvBaseline?.mean ?? todayMetrics.hrvMs ?? undefined,
      stepCount: todayMetrics.stepsNormalized ?? undefined,
      // Include yesterday's active energy for Activity Load context
      yesterdayActiveKcal: yesterdayActiveEnergy ?? undefined,
      activityBaseline: activityBaseline?.mean ?? undefined,
    };

    // Generate key factors (insights)
    const keyFactors: string[] = [];
    if (sleepScore !== null && sleepScore < 60) {
      keyFactors.push("Sleep Debt");
    }
    if (recoveryScore !== null && recoveryScore < 60) {
      if (todayMetrics.hrvMs !== null && hrvBaseline && todayMetrics.hrvMs < hrvBaseline.mean * 0.85) {
        keyFactors.push("Low HRV");
      }
      if (todayMetrics.restingHrBpm !== null && rhrBaseline && todayMetrics.restingHrBpm > rhrBaseline.mean * 1.1) {
        keyFactors.push("Elevated RHR");
      }
    }
    if (loadScore !== null && loadScore < 60) {
      keyFactors.push("High Training Load");
    }
    if (trendScore !== null && trendScore < 60) {
      keyFactors.push("Declining Trend");
    }
    if (todayMetrics.sleepHours !== null && todayMetrics.sleepHours < 6) {
      keyFactors.push("Insufficient Sleep");
    }
    // Add positive factors
    if (sleepScore !== null && sleepScore >= 85) {
      keyFactors.push("Excellent Sleep");
    }
    if (recoveryScore !== null && recoveryScore >= 85) {
      keyFactors.push("Strong Recovery");
    }

    return {
      userId,
      date,
      readinessScore: Math.round(readinessScore),
      readinessBucket,
      sleepScore: sleepScore !== null ? Math.round(sleepScore) : null,
      recoveryScore: recoveryScore !== null ? Math.round(recoveryScore) : null,
      loadScore: loadScore !== null ? Math.round(loadScore) : null,
      trendScore: trendScore !== null ? Math.round(trendScore) : null,
      isCalibrating,
      explanations,
      metrics: displayMetrics,
      keyFactors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`[Readiness] Error computing readiness for user ${userId}, date ${date}:`, error);
    return null;
  }
}

function generateSummary(bucket: "recover" | "ok" | "ready", calibrating: boolean): string {
  if (calibrating) {
    return "Still calibrating to your baseline. Score accuracy will improve over time.";
  }

  switch (bucket) {
    case "ready":
      return "You're ready for a challenging day. Great recovery and sleep quality.";
    case "ok":
      return "Proceed with caution. Moderate intensity recommended today.";
    case "recover":
      return "Prioritize recovery today. Your body needs rest.";
  }
}

function generateSleepExplanation(score: number | null, hours: number | null): string {
  if (score === null) {
    return "No sleep data available.";
  }

  if (hours === null) {
    return "Sleep data unavailable.";
  }

  if (hours < 5) {
    return `Very low sleep (${hours.toFixed(1)}h). Recovery compromised.`;
  } else if (hours < 6.5) {
    return `Below baseline sleep (${hours.toFixed(1)}h). Consider more rest tonight.`;
  } else if (hours >= 7 && hours <= 9) {
    return `Good sleep duration (${hours.toFixed(1)}h). Well rested.`;
  } else {
    return `Sleep: ${hours.toFixed(1)}h.`;
  }
}

function generateRecoveryExplanation(score: number | null, hrv: number | null, rhr: number | null): string {
  if (score === null) {
    return "No recovery metrics available.";
  }

  const parts: string[] = [];
  if (hrv !== null) {
    parts.push(`HRV ${hrv.toFixed(0)}ms`);
  }
  if (rhr !== null) {
    parts.push(`RHR ${rhr.toFixed(0)} bpm`);
  }

  if (parts.length === 0) {
    return "No recovery data.";
  }

  return parts.join(", ");
}

function generateLoadExplanation(score: number | null, energy: number | null): string {
  if (score === null || energy === null) {
    return "No recent activity data.";
  }

  return `Recent activity: ${energy.toFixed(0)} kcal`;
}
