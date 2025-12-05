import { db } from "../db";
import { userDailyReadiness } from "@shared/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import { logger } from "../logger";
import { getBaseline, type BaselineStats } from "./baselineCalculator";
import * as healthRouter from "./healthStorageRouter";
import { getEnvironmentalContext, type EnvironmentalContext } from "./healthStorageRouter";

export interface RecoveryBoostResult {
  totalBoost: number;
  activities: {
    type: string;
    boost: number;
    details?: string;
  }[];
}

export interface EnvironmentalStressResult {
  totalPenalty: number;
  factors: {
    type: string;
    penalty: number;
    details?: string;
  }[];
}

/**
 * Calculate environmental stress penalty from weather and air quality
 * Environmental factors that may affect HRV, sleep, and recovery
 */
function calculateEnvironmentalStress(envContext: EnvironmentalContext | null): EnvironmentalStressResult {
  if (!envContext) {
    return { totalPenalty: 0, factors: [] };
  }
  
  const factors: EnvironmentalStressResult['factors'] = [];
  
  if (envContext.weather) {
    const temp = envContext.weather.temperature;
    const humidity = envContext.weather.humidity;
    
    if (temp > 35) {
      factors.push({ type: 'Extreme Heat', penalty: 5, details: `${Math.round(temp)}°C` });
    } else if (temp > 32) {
      factors.push({ type: 'High Heat', penalty: 3, details: `${Math.round(temp)}°C` });
    } else if (temp < -5) {
      factors.push({ type: 'Extreme Cold', penalty: 4, details: `${Math.round(temp)}°C` });
    } else if (temp < 0) {
      factors.push({ type: 'Freezing', penalty: 2, details: `${Math.round(temp)}°C` });
    }
    
    if (humidity > 85 && temp > 28) {
      factors.push({ type: 'Oppressive Humidity', penalty: 3, details: `${humidity}%` });
    } else if (humidity > 80 && temp > 25) {
      factors.push({ type: 'High Humidity', penalty: 1, details: `${humidity}%` });
    }
  }
  
  if (envContext.airQuality) {
    const aqi = envContext.airQuality.aqi;
    if (aqi === 5) {
      factors.push({ type: 'Very Poor Air Quality', penalty: 6, details: `AQI ${aqi}` });
    } else if (aqi === 4) {
      factors.push({ type: 'Poor Air Quality', penalty: 4, details: `AQI ${aqi}` });
    } else if (aqi === 3) {
      factors.push({ type: 'Moderate Air Quality', penalty: 2, details: `AQI ${aqi}` });
    }
  }
  
  const totalPenalty = Math.min(
    factors.reduce((sum, f) => sum + f.penalty, 0),
    12
  );
  
  if (totalPenalty > 0) {
    logger.info(`[Readiness] Environmental stress: -${totalPenalty} points from ${factors.length} factors`);
  }
  
  return { totalPenalty, factors };
}

export interface ReadinessResult {
  userId: string;
  date: string;
  readinessScore: number;
  readinessBucket: "recover" | "ok" | "ready";
  sleepScore: number | null;
  recoveryScore: number | null;
  loadScore: number | null;
  trendScore: number | null;
  recoveryBoost?: RecoveryBoostResult;
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
 * Calculate recovery boost from logged life events
 * Rewards users for intentional recovery activities in the last 24 hours
 * @param userId User ID
 * @param date Date string (YYYY-MM-DD)
 * @returns RecoveryBoostResult with total boost and activity breakdown
 */
async function calculateRecoveryBoost(userId: string, date: string): Promise<RecoveryBoostResult> {
  const activities: RecoveryBoostResult['activities'] = [];
  
  try {
    // Fetch life events from the last 24 hours
    const targetDate = new Date(date);
    const startDate = new Date(targetDate);
    startDate.setHours(startDate.getHours() - 24);
    
    const lifeEvents = await healthRouter.getLifeEvents(userId, {
      startDate,
      limit: 50,
    });
    
    if (!lifeEvents || lifeEvents.length === 0) {
      logger.debug(`[Readiness] No life events found for recovery boost calculation`);
      return { totalBoost: 0, activities: [] };
    }
    
    logger.info(`[Readiness] Found ${lifeEvents.length} life events for recovery boost calculation`);
    
    // Track which activity types we've already counted (one boost per type per day)
    const countedTypes = new Set<string>();
    
    for (const event of lifeEvents) {
      // Handle both Supabase (snake_case) and Neon (camelCase) field names
      const eventType = ((event as any).event_type || (event as any).eventType || '').toLowerCase();
      const details = (event.details || {}) as Record<string, any>;
      
      // Skip if we've already counted this type today
      if (countedTypes.has(eventType)) continue;
      
      switch (eventType) {
        case 'ice_bath':
        case 'cold_plunge': {
          // Ice bath: +3-5 points based on duration
          // 2+ min = +3, 4+ min = +4, 6+ min = +5
          const duration = details.duration_min || details.duration || 0;
          let boost = 3;
          if (duration >= 6) boost = 5;
          else if (duration >= 4) boost = 4;
          
          activities.push({
            type: 'Cold Exposure',
            boost,
            details: duration ? `${duration} min` : undefined,
          });
          countedTypes.add(eventType);
          break;
        }
        
        case 'sauna': {
          // Sauna: +2-4 points based on duration
          // 10+ min = +2, 15+ min = +3, 20+ min = +4
          const duration = details.duration_min || details.duration || 0;
          let boost = 2;
          if (duration >= 20) boost = 4;
          else if (duration >= 15) boost = 3;
          
          activities.push({
            type: 'Sauna',
            boost,
            details: duration ? `${duration} min` : undefined,
          });
          countedTypes.add(eventType);
          break;
        }
        
        case 'breathwork':
        case 'meditation': {
          // Breathwork/meditation: +2-3 points
          const duration = details.duration_min || details.duration || 0;
          let boost = 2;
          if (duration >= 15) boost = 3;
          
          activities.push({
            type: eventType === 'breathwork' ? 'Breathwork' : 'Meditation',
            boost,
            details: duration ? `${duration} min` : undefined,
          });
          countedTypes.add(eventType);
          break;
        }
        
        case 'yoga':
        case 'stretching': {
          // Yoga/stretching: +1-2 points
          const duration = details.duration_min || details.duration || 0;
          let boost = 1;
          if (duration >= 30) boost = 2;
          
          activities.push({
            type: eventType === 'yoga' ? 'Yoga' : 'Stretching',
            boost,
            details: duration ? `${duration} min` : undefined,
          });
          countedTypes.add(eventType);
          break;
        }
        
        case 'massage': {
          // Massage: +3 points
          activities.push({
            type: 'Massage',
            boost: 3,
          });
          countedTypes.add(eventType);
          break;
        }
        
        case 'supplements': {
          // Supplements: +1 point (general health behavior)
          activities.push({
            type: 'Supplements',
            boost: 1,
            details: details.names?.join(', '),
          });
          countedTypes.add(eventType);
          break;
        }
        
        // Note: Alcohol would have a NEGATIVE effect, but we're not penalizing here
        // That's handled elsewhere - this is purely for recovery BOOSTS
      }
    }
    
    // Calculate total boost (capped at 10 points max to prevent gaming)
    const totalBoost = Math.min(
      activities.reduce((sum, a) => sum + a.boost, 0),
      10
    );
    
    if (totalBoost > 0) {
      logger.info(`[Readiness] Recovery boost calculated: +${totalBoost} points from ${activities.length} activities`);
    }
    
    return { totalBoost, activities };
  } catch (error) {
    logger.error(`[Readiness] Error calculating recovery boost:`, error);
    return { totalBoost: 0, activities: [] };
  }
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

    // Fetch today's metrics via healthRouter (routes to Supabase when enabled)
    const todayMetrics = await healthRouter.getUserDailyMetricsByDate(userId, date);

    if (!todayMetrics) {
      logger.warn(`[Readiness] No metrics found for user ${userId}, date ${date}`);
      return null;
    }

    // Fetch yesterday's metrics for load score via healthRouter (Supabase)
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const yesterdayMetrics = await healthRouter.getUserDailyMetricsByDate(userId, yesterdayStr);

    const yesterdayActiveEnergy = yesterdayMetrics?.activeEnergyKcal ?? null;

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
    
    // Calculate recovery boost from logged life events
    const recoveryBoost = await calculateRecoveryBoost(userId, date);
    
    // Calculate environmental stress from weather and air quality
    const envContext = await getEnvironmentalContext(userId, date);
    const environmentalStress = calculateEnvironmentalStress(envContext);

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
    
    // Apply recovery boost from logged life events BEFORE clamping
    if (recoveryBoost.totalBoost > 0) {
      const preBoostScore = readinessScore;
      readinessScore += recoveryBoost.totalBoost;
      logger.info(`[Readiness] Applied recovery boost: +${recoveryBoost.totalBoost} points (${preBoostScore.toFixed(1)} → ${readinessScore.toFixed(1)})`);
    }
    
    // Apply environmental stress penalty (heat, cold, air quality)
    if (environmentalStress.totalPenalty > 0) {
      const preStressScore = readinessScore;
      readinessScore -= environmentalStress.totalPenalty;
      logger.info(`[Readiness] Applied environmental stress: -${environmentalStress.totalPenalty} points (${preStressScore.toFixed(1)} → ${readinessScore.toFixed(1)})`);
    }

    // Clamp to range AFTER applying boost and penalty
    if (isCalibrating) {
      readinessScore = clamp(readinessScore, 50, 90);
    } else {
      readinessScore = clamp(readinessScore, 0, 100);
    }

    // Determine bucket AFTER boost and clamp
    let readinessBucket: "recover" | "ok" | "ready";
    if (readinessScore < 60) {
      readinessBucket = "recover";
    } else if (readinessScore < 80) {
      readinessBucket = "ok";
    } else {
      readinessBucket = "ready";
    }

    // Generate explanations with boost-aware summary
    const explanations = {
      summary: generateSummary(readinessBucket, isCalibrating, recoveryBoost.totalBoost > 0),
      sleep: generateSleepExplanation(sleepScore, todayMetrics.sleepHours),
      recovery: generateRecoveryExplanation(recoveryScore, todayMetrics.hrvMs, todayMetrics.restingHrBpm, recoveryBoost),
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
    
    // Add recovery boost activities as positive factors
    if (recoveryBoost.totalBoost > 0) {
      for (const activity of recoveryBoost.activities) {
        keyFactors.push(`${activity.type} (+${activity.boost})`);
      }
    }
    
    // Add environmental stress factors as negative factors
    if (environmentalStress.totalPenalty > 0) {
      for (const factor of environmentalStress.factors) {
        keyFactors.push(`${factor.type} (-${factor.penalty})`);
      }
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
      recoveryBoost: recoveryBoost.totalBoost > 0 ? recoveryBoost : undefined,
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

function generateSummary(bucket: "recover" | "ok" | "ready", calibrating: boolean, hasRecoveryBoost: boolean = false): string {
  if (calibrating) {
    return "Still calibrating to your baseline. Score accuracy will improve over time.";
  }

  const boostNote = hasRecoveryBoost ? " Recovery activities boosted your score." : "";

  switch (bucket) {
    case "ready":
      return `You're ready for a challenging day. Great recovery and sleep quality.${boostNote}`;
    case "ok":
      return `Proceed with caution. Moderate intensity recommended today.${boostNote}`;
    case "recover":
      return `Prioritize recovery today. Your body needs rest.${boostNote}`;
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

function generateRecoveryExplanation(
  score: number | null, 
  hrv: number | null, 
  rhr: number | null,
  recoveryBoost?: RecoveryBoostResult
): string {
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

  if (parts.length === 0 && (!recoveryBoost || recoveryBoost.totalBoost === 0)) {
    return "No recovery data.";
  }

  let explanation = parts.length > 0 ? parts.join(", ") : "";
  
  // Add recovery boost info if present
  if (recoveryBoost && recoveryBoost.totalBoost > 0) {
    const activities = recoveryBoost.activities.map(a => a.type).join(", ");
    const boostInfo = `+${recoveryBoost.totalBoost} pts from ${activities}`;
    explanation = explanation ? `${explanation}. ${boostInfo}` : boostInfo;
  }

  return explanation;
}

function generateLoadExplanation(score: number | null, energy: number | null): string {
  if (score === null || energy === null) {
    return "No recent activity data.";
  }

  return `Recent activity: ${energy.toFixed(0)} kcal`;
}
