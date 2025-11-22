import { logger } from "../logger";

export type FlomentumZone = 'BUILDING' | 'MAINTAINING' | 'DRAINING';

export interface FlomentumMetrics {
  sleepTotalMinutes: number | null;
  hrvSdnnMs: number | null;
  restingHr: number | null;
  respiratoryRate: number | null;
  bodyTempDeviationC: number | null;
  oxygenSaturationAvg: number | null;
  steps: number | null;
  activeKcal: number | null;
  exerciseMinutes: number | null;
  standHours: number | null;
}

export interface FlomentumContext {
  stepsTarget: number;
  sleepTargetMinutes: number;
  restingHrBaseline: number | null;
  hrvBaseline: number | null;
  respRateBaseline: number | null;
}

export interface FlomentumFactor {
  status: 'positive' | 'neutral' | 'negative';
  title: string;
  detail: string;
  componentKey: 'sleep' | 'steps' | 'intensity' | 'sedentary' | 'resting_hr' | 'hrv' | 'resp_rate' | 'temp' | 'spo2';
  pointsContribution: number;
}

export interface DailyFocus {
  title: string;
  body: string;
  componentKey: string;
}

export interface FlomentumResult {
  score: number;
  zone: FlomentumZone;
  factors: FlomentumFactor[];
  dailyFocus: DailyFocus;
}

const BASELINE_SCORE = 50;

export function calculateFlomentumScore(
  metrics: FlomentumMetrics,
  context: FlomentumContext
): FlomentumResult {
  let score = BASELINE_SCORE;
  const factors: FlomentumFactor[] = [];

  // 1. Sleep scoring
  const sleepResult = scoreSleep(metrics.sleepTotalMinutes, context.sleepTargetMinutes);
  score += sleepResult.points;
  if (sleepResult.factor) factors.push(sleepResult.factor);

  // 2. Steps and activity scoring
  const activityResult = scoreStepsAndActivity(metrics, context.stepsTarget);
  score += activityResult.points;
  factors.push(...activityResult.factors);

  // 3. Recovery scoring (resting HR and HRV)
  const recoveryResult = scoreRecovery(metrics, context);
  score += recoveryResult.points;
  factors.push(...recoveryResult.factors);

  // 4. Red flags (illness indicators)
  const redFlagsResult = scoreRedFlags(metrics, context);
  score += redFlagsResult.points;
  factors.push(...redFlagsResult.factors);

  // Clamp score to 0-100 range
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Determine zone
  const zone = determineZone(score);

  // Generate daily focus
  const dailyFocus = generateDailyFocus(factors);

  return {
    score,
    zone,
    factors,
    dailyFocus,
  };
}

function scoreSleep(sleepMinutes: number | null, targetMinutes: number): { points: number; factor: FlomentumFactor | null } {
  if (sleepMinutes === null) {
    return {
      points: 0,
      factor: {
        status: 'neutral',
        title: 'Sleep data missing',
        detail: 'No sleep data available for this day',
        componentKey: 'sleep',
        pointsContribution: 0,
      },
    };
  }

  const idealMin = targetMinutes - 60;
  const idealMax = targetMinutes + 60;

  // Within ideal range: +12 points
  if (sleepMinutes >= idealMin && sleepMinutes <= idealMax) {
    const roundedSleepMinutes = Math.round(sleepMinutes);
    const hours = Math.floor(roundedSleepMinutes / 60);
    const mins = roundedSleepMinutes % 60;
    return {
      points: 12,
      factor: {
        status: 'positive',
        title: 'Sleep in your optimal range',
        detail: `${hours}h ${mins}m (Target: ${Math.floor(targetMinutes / 60)}h)`,
        componentKey: 'sleep',
        pointsContribution: 12,
      },
    };
  }

  // Slightly short sleep
  if (sleepMinutes >= targetMinutes - 120 && sleepMinutes < idealMin) {
    const roundedSleepMinutes = Math.round(sleepMinutes);
    const hours = Math.floor(roundedSleepMinutes / 60);
    const mins = roundedSleepMinutes % 60;
    return {
      points: -4,
      factor: {
        status: 'negative',
        title: 'Slightly short sleep',
        detail: `${hours}h ${mins}m (Target: ${Math.floor(targetMinutes / 60)}h)`,
        componentKey: 'sleep',
        pointsContribution: -4,
      },
    };
  }

  // Very short sleep
  if (sleepMinutes < targetMinutes - 120) {
    const roundedSleepMinutes = Math.round(sleepMinutes);
    const hours = Math.floor(roundedSleepMinutes / 60);
    const mins = roundedSleepMinutes % 60;
    return {
      points: -10,
      factor: {
        status: 'negative',
        title: 'Very short sleep',
        detail: `${hours}h ${mins}m (Target: ${Math.floor(targetMinutes / 60)}h)`,
        componentKey: 'sleep',
        pointsContribution: -10,
      },
    };
  }

  // Long sleep (possible fatigue)
  if (sleepMinutes > targetMinutes + 120) {
    const roundedSleepMinutes = Math.round(sleepMinutes);
    const hours = Math.floor(roundedSleepMinutes / 60);
    const mins = roundedSleepMinutes % 60;
    return {
      points: -4,
      factor: {
        status: 'neutral',
        title: 'Long sleep, possible fatigue',
        detail: `${hours}h ${mins}m (Target: ${Math.floor(targetMinutes / 60)}h)`,
        componentKey: 'sleep',
        pointsContribution: -4,
      },
    };
  }

  return { points: 0, factor: null };
}

function scoreStepsAndActivity(metrics: FlomentumMetrics, stepsTarget: number): { points: number; factors: FlomentumFactor[] } {
  let points = 0;
  const factors: FlomentumFactor[] = [];

  // Steps scoring
  if (metrics.steps === null) {
    factors.push({
      status: 'neutral',
      title: 'No step data',
      detail: 'No step count available for this day',
      componentKey: 'steps',
      pointsContribution: 0,
    });
  } else {
    if (metrics.steps >= stepsTarget) {
      points += 8;
      factors.push({
        status: 'positive',
        title: 'Hit your step target',
        detail: `${metrics.steps.toLocaleString()} steps (Goal: ${stepsTarget.toLocaleString()})`,
        componentKey: 'steps',
        pointsContribution: 8,
      });
    } else if (metrics.steps >= stepsTarget * 0.7) {
      points += 4;
      factors.push({
        status: 'positive',
        title: 'Almost hit your step target',
        detail: `${metrics.steps.toLocaleString()} steps (Goal: ${stepsTarget.toLocaleString()})`,
        componentKey: 'steps',
        pointsContribution: 4,
      });
    } else {
      points -= 6;
      factors.push({
        status: 'negative',
        title: 'Low movement today',
        detail: `${metrics.steps.toLocaleString()} steps (Goal: ${stepsTarget.toLocaleString()})`,
        componentKey: 'steps',
        pointsContribution: -6,
      });
    }
  }

  // Exercise intensity scoring - ONLY use real HealthKit workout data
  // DO NOT use activeKcal as a proxy - it represents all-day active energy
  // and will incorrectly show hundreds of "exercise" minutes
  const exerciseMinutes = metrics.exerciseMinutes;

  if (exerciseMinutes !== null && exerciseMinutes !== undefined) {
    // Use Math.floor to avoid showing a threshold that wasn't actually crossed
    // (e.g., 29.6 minutes rounds to 30, but didn't meet the >=30 threshold)
    const displayExercise = Math.floor(exerciseMinutes);
    if (exerciseMinutes >= 30) {
      points += 6;
      factors.push({
        status: 'positive',
        title: 'Good workout / activity today',
        detail: `${displayExercise} min of exercise`,
        componentKey: 'intensity',
        pointsContribution: 6,
      });
    } else if (exerciseMinutes >= 10) {
      points += 3;
      factors.push({
        status: 'neutral',
        title: 'Light activity today',
        detail: `${displayExercise} min of exercise`,
        componentKey: 'intensity',
        pointsContribution: 3,
      });
    } else if (metrics.steps !== null && metrics.steps < stepsTarget * 0.7) {
      points -= 4;
      factors.push({
        status: 'negative',
        title: 'Low exercise intensity',
        detail: `${displayExercise} min of exercise (Target: 30+ min)`,
        componentKey: 'intensity',
        pointsContribution: -4,
      });
    }
  } else {
    // No exercise data available - provide neutral feedback
    factors.push({
      status: 'neutral',
      title: 'No workout data today',
      detail: 'Sync HealthKit workouts to track exercise',
      componentKey: 'intensity',
      pointsContribution: 0,
    });
  }

  // Sedentary time scoring
  if (metrics.standHours !== null) {
    // Use Math.floor to align display with threshold logic
    const displayStandHours = Math.floor(metrics.standHours);
    if (metrics.standHours >= 10) {
      points += 2;
      factors.push({
        status: 'positive',
        title: 'Low sedentary time',
        detail: `${displayStandHours} stand hours`,
        componentKey: 'sedentary',
        pointsContribution: 2,
      });
    } else if (metrics.standHours <= 6) {
      points -= 2;
      factors.push({
        status: 'negative',
        title: 'High sedentary time',
        detail: `${displayStandHours} stand hours (Target: 10+ hours)`,
        componentKey: 'sedentary',
        pointsContribution: -2,
      });
    }
  }

  return { points, factors };
}

function scoreRecovery(metrics: FlomentumMetrics, context: FlomentumContext): { points: number; factors: FlomentumFactor[] } {
  let points = 0;
  const factors: FlomentumFactor[] = [];

  // Resting HR scoring
  if (metrics.restingHr !== null && context.restingHrBaseline !== null) {
    const roundedRestingHr = Math.round(metrics.restingHr);
    const roundedBaseline = Math.round(context.restingHrBaseline);
    const delta = metrics.restingHr - context.restingHrBaseline;
    
    if (delta <= -3) {
      points += 6;
      factors.push({
        status: 'positive',
        title: 'Resting HR improving vs baseline',
        detail: `${roundedRestingHr} bpm (Baseline: ${roundedBaseline} bpm)`,
        componentKey: 'resting_hr',
        pointsContribution: 6,
      });
    } else if (delta >= -2 && delta <= 2) {
      points += 2;
      factors.push({
        status: 'neutral',
        title: 'Resting HR stable',
        detail: `${roundedRestingHr} bpm (Baseline: ${roundedBaseline} bpm)`,
        componentKey: 'resting_hr',
        pointsContribution: 2,
      });
    } else if (delta >= 5) {
      points -= 6;
      factors.push({
        status: 'negative',
        title: 'Resting heart rate elevated vs baseline',
        detail: `${roundedRestingHr} bpm (Baseline: ${roundedBaseline} bpm)`,
        componentKey: 'resting_hr',
        pointsContribution: -6,
      });
    }
  }

  // HRV scoring
  if (metrics.hrvSdnnMs !== null && context.hrvBaseline !== null) {
    const roundedHrv = Math.round(metrics.hrvSdnnMs);
    const roundedHrvBaseline = Math.round(context.hrvBaseline);
    const delta = metrics.hrvSdnnMs - context.hrvBaseline;
    
    if (delta >= 5) {
      points += 4;
      factors.push({
        status: 'positive',
        title: 'Heart rate variability stable or improving',
        detail: `${roundedHrv} ms (Baseline: ${roundedHrvBaseline} ms)`,
        componentKey: 'hrv',
        pointsContribution: 4,
      });
    } else if (delta <= -5) {
      points -= 4;
      factors.push({
        status: 'negative',
        title: 'HRV suppressed vs baseline',
        detail: `${roundedHrv} ms (Baseline: ${roundedHrvBaseline} ms)`,
        componentKey: 'hrv',
        pointsContribution: -4,
      });
    }
  }

  return { points, factors };
}

function scoreRedFlags(metrics: FlomentumMetrics, context: FlomentumContext): { points: number; factors: FlomentumFactor[] } {
  let points = 0;
  const factors: FlomentumFactor[] = [];

  // Respiratory rate
  if (metrics.respiratoryRate !== null && context.respRateBaseline !== null) {
    const roundedRespRate = Math.round(metrics.respiratoryRate);
    const roundedRespBaseline = Math.round(context.respRateBaseline);
    if (metrics.respiratoryRate >= context.respRateBaseline + 3) {
      points -= 4;
      factors.push({
        status: 'negative',
        title: 'Respiratory rate elevated (possible illness or overreaching)',
        detail: `${roundedRespRate} breaths/min (Baseline: ${roundedRespBaseline})`,
        componentKey: 'resp_rate',
        pointsContribution: -4,
      });
    }
  }

  // Body temperature
  if (metrics.bodyTempDeviationC !== null && metrics.bodyTempDeviationC >= 0.5) {
    points -= 6;
    factors.push({
      status: 'negative',
      title: 'Body temperature elevated (possible illness)',
      detail: `+${metrics.bodyTempDeviationC.toFixed(1)}°C deviation from baseline`,
      componentKey: 'temp',
      pointsContribution: -6,
    });
  }

  // Oxygen saturation
  if (metrics.oxygenSaturationAvg !== null && metrics.oxygenSaturationAvg < 94) {
    points -= 6;
    factors.push({
      status: 'negative',
      title: 'Low oxygen saturation – possible respiratory issue',
      detail: `${metrics.oxygenSaturationAvg.toFixed(1)}% (Normal: 95%+)`,
      componentKey: 'spo2',
      pointsContribution: -6,
    });
  }

  return { points, factors };
}

function determineZone(score: number): FlomentumZone {
  if (score >= 75) return 'BUILDING';
  if (score >= 60) return 'MAINTAINING';
  return 'DRAINING';
}

function generateDailyFocus(factors: FlomentumFactor[]): DailyFocus {
  // Group factors by component and find the most negative one
  const componentScores = new Map<string, number>();
  
  for (const factor of factors) {
    const current = componentScores.get(factor.componentKey) || 0;
    componentScores.set(factor.componentKey, current + factor.pointsContribution);
  }

  // Find the component with the most negative impact
  let weakestComponent = 'steps';
  let lowestScore = 0;
  
  const entries = Array.from(componentScores.entries());
  for (const [component, score] of entries) {
    if (score < lowestScore) {
      lowestScore = score;
      weakestComponent = component;
    }
  }

  // Generate focus message based on weakest component
  const focusMessages: Record<string, { title: string; body: string }> = {
    steps: {
      title: 'Boost your movement today',
      body: 'Add a 15–20 min walk to reach your step target.',
    },
    intensity: {
      title: 'Boost your movement today',
      body: 'Add a 15–20 min walk today to push Flōmentum up.',
    },
    sleep: {
      title: 'Prioritise sleep tonight',
      body: 'Aim for bed by a consistent time and target at least 7 hours of sleep.',
    },
    resting_hr: {
      title: 'Ease off and recover today',
      body: 'Keep moving gently but avoid very intense sessions and focus on sleep.',
    },
    hrv: {
      title: 'Ease off and recover today',
      body: 'Keep moving gently but avoid very intense sessions and focus on sleep.',
    },
    temp: {
      title: 'Listen to your body',
      body: 'Your vitals suggest possible strain or illness. Take it easy and rest if needed.',
    },
    resp_rate: {
      title: 'Listen to your body',
      body: 'Your vitals suggest possible strain or illness. Take it easy and rest if needed.',
    },
    spo2: {
      title: 'Listen to your body',
      body: 'Your vitals suggest possible strain or illness. Take it easy and rest if needed.',
    },
  };

  const message = focusMessages[weakestComponent] || focusMessages.steps;

  return {
    title: message.title,
    body: message.body,
    componentKey: weakestComponent,
  };
}
