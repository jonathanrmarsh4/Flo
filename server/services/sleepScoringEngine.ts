import { db } from "../db";
import { sleepNights, sleepSubscores, sleepBaselines } from "@shared/schema";
import { eq, and, desc, lte } from "drizzle-orm";
import { logger } from "../logger";

interface SleepScoreInputs {
  userId: string;
  sleepDate: string;
  totalSleepMin: number;
  sleepEfficiencyPct: number;
  sleepLatencyMin?: number;
  wasoMin?: number;
  deepPct: number;
  remPct: number;
  midSleepTimeLocal?: number;
  restingHrBpm?: number;
  hrvMs?: number;
  respiratoryRate?: number;
  wristTemperature?: number;
  oxygenSaturation?: number;
}

interface SleepScoreResult {
  durationScore: number | null;
  efficiencyScore: number | null;
  structureScore: number | null;
  consistencyScore: number | null;
  recoveryScore: number | null;
  nightfloScore: number;
  scoreLabel: string;
  scoreDeltaVsBaseline: number | null;
  trendDirection: 'up' | 'down' | 'flat' | null;
}

const EPSILON = 0.001; // Prevent division by zero

// Helper: Linear interpolation
function lerp(value: number, x1: number, y1: number, x2: number, y2: number): number {
  if (value <= x1) return y1;
  if (value >= x2) return y2;
  return y1 + ((value - x1) / (x2 - x1)) * (y2 - y1);
}

// Helper: Piecewise linear scoring
function piecewiseScore(value: number, breakpoints: [number, number][]): number {
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x1, y1] = breakpoints[i];
    const [x2, y2] = breakpoints[i + 1];
    if (value >= x1 && value <= x2) {
      return lerp(value, x1, y1, x2, y2);
    }
  }
  // If outside range, use nearest endpoint
  if (value < breakpoints[0][0]) return breakpoints[0][1];
  return breakpoints[breakpoints.length - 1][1];
}

// Helper: Clamp value to range
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// 1. Duration Score (25% weight)
function calculateDurationScore(
  totalSleepMin: number,
  baseline: number | null,
  zScore: number | null
): number | null {
  // Guideline-based score: 420-540 min (7-9h) is ideal
  const breakpoints: [number, number][] = [
    [270, 0],     // 4.5h -> 0
    [360, 50],    // 6h -> 50
    [420, 100],   // 7h -> 100 (ideal start)
    [540, 100],   // 9h -> 100 (ideal end)
    [600, 0],     // 10h -> 0
  ];
  const durationNorm = piecewiseScore(totalSleepMin, breakpoints);

  // Relative score based on baseline
  let durationRel = 50; // neutral default
  if (zScore !== null) {
    // Negative z (less sleep than baseline) lowers score
    durationRel = clamp(50 + 25 * (-zScore), 0, 100);
  }

  // Combine: 60% guideline, 40% relative
  return 0.6 * durationNorm + 0.4 * durationRel;
}

// 2. Efficiency Score (20% weight)
function calculateEfficiencyScore(
  sleepEfficiencyPct: number,
  sleepLatencyMin: number | null,
  wasoMin: number | null
): number | null {
  // Efficiency component
  const effBreakpoints: [number, number][] = [
    [60, 20],
    [70, 40],
    [80, 60],
    [85, 80],
    [90, 90],
    [95, 100],
  ];
  const efficiencyComponent = piecewiseScore(sleepEfficiencyPct, effBreakpoints);

  // Latency component (optional)
  let latencyComponent = 70; // neutral default
  if (sleepLatencyMin !== null) {
    if (sleepLatencyMin < 5) {
      latencyComponent = 70; // Too fast, slight penalty
    } else if (sleepLatencyMin >= 5 && sleepLatencyMin <= 25) {
      latencyComponent = 100; // Ideal
    } else {
      const latBreakpoints: [number, number][] = [
        [25, 100],
        [45, 40],
        [90, 20],
      ];
      latencyComponent = piecewiseScore(sleepLatencyMin, latBreakpoints);
    }
  }

  // WASO component (optional)
  let wasoComponent = 70; // neutral default
  if (wasoMin !== null) {
    const wasoBreakpoints: [number, number][] = [
      [0, 100],
      [20, 100],
      [40, 80],
      [60, 60],
      [90, 40],
      [120, 20],
    ];
    wasoComponent = piecewiseScore(wasoMin, wasoBreakpoints);
  }

  // Combine: 50% efficiency, 25% latency, 25% WASO
  return 0.5 * efficiencyComponent + 0.25 * latencyComponent + 0.25 * wasoComponent;
}

// 3. Structure Score (20% weight)
function calculateStructureScore(deepPct: number, remPct: number): number | null {
  // Deep sleep: ideal 13-23%
  let deepScore: number;
  if (deepPct >= 13 && deepPct <= 23) {
    deepScore = 100;
  } else {
    const deepBreakpoints: [number, number][] = [
      [0, 20],
      [5, 40],
      [13, 100],  // ideal start
      [23, 100],  // ideal end
      [30, 40],
      [40, 20],
    ];
    deepScore = piecewiseScore(deepPct, deepBreakpoints);
  }

  // REM sleep: ideal 20-25%
  let remScore: number;
  if (remPct >= 20 && remPct <= 25) {
    remScore = 100;
  } else {
    const remBreakpoints: [number, number][] = [
      [0, 20],
      [10, 40],
      [20, 100],  // ideal start
      [25, 100],  // ideal end
      [35, 40],
      [45, 20],
    ];
    remScore = piecewiseScore(remPct, remBreakpoints);
  }

  // Combine: 50% deep, 50% REM
  return 0.5 * deepScore + 0.5 * remScore;
}

// 4. Consistency Score (20% weight)
async function calculateConsistencyScore(
  userId: string,
  sleepDate: string,
  totalSleepMin: number,
  midSleepTimeLocal: number | null
): Promise<number | null> {
  try {
    // Get last 14 days of sleep data (excluding current night)
    const historicNights = await db
      .select({
        midSleepTimeLocal: sleepNights.midSleepTimeLocal,
        totalSleepMin: sleepNights.totalSleepMin,
      })
      .from(sleepNights)
      .where(and(
        eq(sleepNights.userId, userId),
        lte(sleepNights.sleepDate, sleepDate)
      ))
      .orderBy(desc(sleepNights.sleepDate))
      .limit(15); // Get 15 to ensure we have 14 historic (excluding current)

    // Remove current night if it's in the results
    const historic = historicNights.filter(n => n.midSleepTimeLocal !== null);
    if (historic.length < 5) {
      return null; // Need at least 5 nights for consistency
    }

    // Calculate mid-sleep time standard deviation (in hours)
    const midSleepTimes = historic.map(n => (n.midSleepTimeLocal || 0) / 60); // Convert to hours
    const meanMidSleep = midSleepTimes.reduce((a, b) => a + b, 0) / midSleepTimes.length;
    const variance = midSleepTimes.reduce((sum, val) => sum + Math.pow(val - meanMidSleep, 2), 0) / midSleepTimes.length;
    const sdMidSleep = Math.sqrt(variance);

    // Timing score based on consistency
    const timingBreakpoints: [number, number][] = [
      [0, 100],
      [0.75, 100],
      [1.0, 80],
      [1.5, 60],
      [2.0, 40],
      [2.5, 20],
      [3.0, 20],
    ];
    const timingScore = piecewiseScore(sdMidSleep, timingBreakpoints);

    // Duration consistency
    const baseline = await db
      .select({ median: sleepBaselines.median })
      .from(sleepBaselines)
      .where(and(
        eq(sleepBaselines.userId, userId),
        eq(sleepBaselines.metricKey, 'total_sleep_min')
      ))
      .limit(1);

    let durationConsistencyScore = 70; // neutral default
    if (baseline[0]?.median) {
      const deviation = Math.abs(totalSleepMin - baseline[0].median) / 60; // Hours
      durationConsistencyScore = clamp(100 - 25 * deviation, 40, 100);
    }

    // Combine: 60% timing, 40% duration
    return 0.6 * timingScore + 0.4 * durationConsistencyScore;
  } catch (error) {
    logger.error('Error calculating consistency score', { error, userId, sleepDate });
    return null;
  }
}

// 5. Recovery Score (15% weight, optional)
function calculateRecoveryScore(
  restingHrBpm: number | null,
  hrvMs: number | null,
  respiratoryRate: number | null,
  wristTemperature: number | null,
  oxygenSaturation: number | null,
  baselines: Map<string, { median: number; stdDev: number }>
): number | null {
  let componentCount = 0;
  let componentSum = 0;

  // Resting HR: lower is better
  if (restingHrBpm !== null && baselines.has('resting_hr_bpm')) {
    const { median, stdDev } = baselines.get('resting_hr_bpm')!;
    const zScore = (restingHrBpm - median) / Math.max(stdDev, EPSILON);
    // Lower HR = positive, higher = negative
    const hrScore = clamp(70 - 15 * zScore, 30, 100);
    componentSum += hrScore;
    componentCount++;
  }

  // HRV: higher is better
  if (hrvMs !== null && baselines.has('hrv_ms')) {
    const { median, stdDev } = baselines.get('hrv_ms')!;
    const zScore = (hrvMs - median) / Math.max(stdDev, EPSILON);
    // Higher HRV = positive, lower = negative
    const hrvScore = clamp(70 + 15 * zScore, 30, 100);
    componentSum += hrvScore;
    componentCount++;
  }

  // Respiratory rate: deviations penalize
  if (respiratoryRate !== null && baselines.has('respiratory_rate')) {
    const { median, stdDev } = baselines.get('respiratory_rate')!;
    const zScore = Math.abs(respiratoryRate - median) / Math.max(stdDev, EPSILON);
    // Large positive deviation = illness signal
    const respScore = clamp(90 - 20 * zScore, 20, 90);
    componentSum += respScore;
    componentCount++;
  }

  // Wrist temperature: deviations penalize
  if (wristTemperature !== null && baselines.has('wrist_temperature')) {
    const { median, stdDev } = baselines.get('wrist_temperature')!;
    const zScore = Math.abs(wristTemperature - median) / Math.max(stdDev, EPSILON);
    const tempScore = clamp(90 - 20 * zScore, 20, 90);
    componentSum += tempScore;
    componentCount++;
  }

  // Oxygen saturation: below 94% or significantly below baseline penalizes
  if (oxygenSaturation !== null) {
    let spo2Score = 70;
    if (oxygenSaturation < 94) {
      spo2Score = 30;
    } else if (baselines.has('oxygen_saturation')) {
      const { median } = baselines.get('oxygen_saturation')!;
      if (oxygenSaturation < median - 2) {
        spo2Score = 50;
      }
    }
    componentSum += spo2Score;
    componentCount++;
  }

  if (componentCount === 0) return null;
  return componentSum / componentCount;
}

// Main sleep scoring function
export async function calculateSleepScore(inputs: SleepScoreInputs): Promise<SleepScoreResult> {
  const { userId, sleepDate, totalSleepMin } = inputs;

  // Minimum 3 hours required
  if (totalSleepMin < 180) {
    return {
      durationScore: null,
      efficiencyScore: null,
      structureScore: null,
      consistencyScore: null,
      recoveryScore: null,
      nightfloScore: 1,
      scoreLabel: 'Low',
      scoreDeltaVsBaseline: null,
      trendDirection: null,
    };
  }

  // Fetch baselines
  const baselinesData = await db
    .select()
    .from(sleepBaselines)
    .where(eq(sleepBaselines.userId, userId));

  const baselines = new Map<string, { median: number; stdDev: number }>();
  baselinesData.forEach(b => {
    if (b.median !== null && b.stdDev !== null) {
      baselines.set(b.metricKey, { median: b.median, stdDev: b.stdDev });
    }
  });

  // Calculate z-score for duration
  let zTotalSleep: number | null = null;
  const durationBaseline = baselines.get('total_sleep_min');
  if (durationBaseline) {
    zTotalSleep = (totalSleepMin - durationBaseline.median) / Math.max(durationBaseline.stdDev, EPSILON);
    zTotalSleep = clamp(zTotalSleep, -2.0, 2.0);
  }

  // Calculate subscores
  const durationScore = calculateDurationScore(
    totalSleepMin,
    durationBaseline?.median || null,
    zTotalSleep
  );

  const efficiencyScore = calculateEfficiencyScore(
    inputs.sleepEfficiencyPct,
    inputs.sleepLatencyMin || null,
    inputs.wasoMin || null
  );

  const structureScore = calculateStructureScore(
    inputs.deepPct,
    inputs.remPct
  );

  const consistencyScore = await calculateConsistencyScore(
    userId,
    sleepDate,
    totalSleepMin,
    inputs.midSleepTimeLocal || null
  );

  const recoveryScore = calculateRecoveryScore(
    inputs.restingHrBpm || null,
    inputs.hrvMs || null,
    inputs.respiratoryRate || null,
    inputs.wristTemperature || null,
    inputs.oxygenSaturation || null,
    baselines
  );

  // Calculate final weighted score
  const weights = {
    duration: 0.25,
    efficiency: 0.20,
    structure: 0.20,
    consistency: 0.20,
    recovery: 0.15,
  };

  // Renormalize weights if components are missing
  let totalWeight = 0;
  if (durationScore !== null) totalWeight += weights.duration;
  if (efficiencyScore !== null) totalWeight += weights.efficiency;
  if (structureScore !== null) totalWeight += weights.structure;
  if (consistencyScore !== null) totalWeight += weights.consistency;
  if (recoveryScore !== null) totalWeight += weights.recovery;

  if (totalWeight === 0) {
    return {
      durationScore,
      efficiencyScore,
      structureScore,
      consistencyScore,
      recoveryScore,
      nightfloScore: 1,
      scoreLabel: 'Low',
      scoreDeltaVsBaseline: null,
      trendDirection: null,
    };
  }

  let nightfloScoreRaw = 0;
  if (durationScore !== null) nightfloScoreRaw += (weights.duration / totalWeight) * durationScore;
  if (efficiencyScore !== null) nightfloScoreRaw += (weights.efficiency / totalWeight) * efficiencyScore;
  if (structureScore !== null) nightfloScoreRaw += (weights.structure / totalWeight) * structureScore;
  if (consistencyScore !== null) nightfloScoreRaw += (weights.consistency / totalWeight) * consistencyScore;
  if (recoveryScore !== null) nightfloScoreRaw += (weights.recovery / totalWeight) * recoveryScore;

  const nightfloScore = Math.round(clamp(nightfloScoreRaw, 1, 99));

  // Determine label
  let scoreLabel: string;
  if (nightfloScore >= 85) scoreLabel = 'Excellent';
  else if (nightfloScore >= 70) scoreLabel = 'Good';
  else if (nightfloScore >= 50) scoreLabel = 'Fair';
  else scoreLabel = 'Low';

  // Calculate delta vs baseline (if available)
  let scoreDeltaVsBaseline: number | null = null;
  let trendDirection: 'up' | 'down' | 'flat' | null = null;
  const scoreBaseline = baselines.get('nightflo_score');
  if (scoreBaseline?.median) {
    scoreDeltaVsBaseline = Math.round(nightfloScore - scoreBaseline.median);
    if (scoreDeltaVsBaseline > 3) trendDirection = 'up';
    else if (scoreDeltaVsBaseline < -3) trendDirection = 'down';
    else trendDirection = 'flat';
  }

  return {
    durationScore,
    efficiencyScore,
    structureScore,
    consistencyScore,
    recoveryScore,
    nightfloScore,
    scoreLabel,
    scoreDeltaVsBaseline,
    trendDirection,
  };
}
