import * as healthRouter from './healthStorageRouter';
import { logger } from '../logger';

export interface ReminderContext {
  userId: string;
  biomarkers: BiomarkerTrend[];
  dexa: DexaComparison | null;
  wearables: WearableMetrics | null;
  behaviors: BehaviorMetrics | null;
  training: TrainingMetrics | null;
  goals: string[];
  insights: InsightSummary[];
  actionPlan: ActionPlanItem[];
}

export interface ActionPlanItem {
  title: string;
  action: string;
  category: string;
  targetBiomarker?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  daysSinceAdded: number;
}

export interface InsightSummary {
  category: string;
  pattern: string;
  confidence: number;
  isNew: boolean;
}

export interface BiomarkerTrend {
  name: string;
  currentValue: number;
  unit: string;
  currentDate: Date;
  previousValue?: number;
  previousDate?: Date;
  percentChange?: number;
}

export interface DexaComparison {
  latestScanDate: Date;
  bodyFatPercentage?: number;
  leanMassKg?: number;
  visceralFatAreaCm2?: number;
  prevBodyFatPercentage?: number;
  prevVisceralFatAreaCm2?: number;
  prevLeanMassKg?: number;
  prevScanDate?: Date;
  visceralFatChangeCm2?: number;
}

export interface WearableMetrics {
  hrv7dAvg?: number;
  rhr7dAvg?: number;
  sleep7dAvgHours?: number;
  activeKcal7dAvg?: number;
  steps7dAvg?: number;
  exercise7dAvgMin?: number;
  hrv30dAvg?: number;
  rhr30dAvg?: number;
  sleep30dAvgHours?: number;
  hrvTrendPercent?: number;
}

export interface BehaviorMetrics {
  alcoholEvents14d: number;
  totalDrinks14d: number;
  zeroDrinkStreakDays: number;
  saunaSessions14d: number;
  avgStressLevel14d?: number;
  supplementEvents14d: number;
  iceBathSessions14d: number;
}

export interface TrainingMetrics {
  zone2Minutes7d?: number;
  zone5Minutes7d?: number;
  strengthSessions7d: number;
  totalWorkoutKcal7d?: number;
  totalWorkoutMinutes7d?: number;
}

/**
 * Build comprehensive clinical context for a user using Supabase health data
 * Routes all health data reads through healthStorageRouter to Supabase
 */
export async function buildReminderContext(userId: string): Promise<ReminderContext> {
  try {
    logger.info(`[ReminderContext] Building context for user ${userId} via Supabase health router`);

    // Query all health data in parallel from Supabase via router
    const [
      biomarkerTrends,
      dexaComparison,
      wearableAverages,
      behaviorMetrics,
      trainingLoad,
      goals,
      insightCards,
      actionPlanItems,
    ] = await Promise.all([
      healthRouter.getBiomarkerTrends(userId, 5),
      healthRouter.getLatestDexaComparison(userId),
      healthRouter.getWearableAverages(userId),
      healthRouter.getBehaviorMetrics14d(userId),
      healthRouter.getTrainingLoad7d(userId),
      healthRouter.getReminderGoals(userId),
      healthRouter.getReminderInsightCards(userId, 3),
      healthRouter.getReminderActionPlanItems(userId, 5),
    ]);

    // Transform biomarker trends
    const biomarkers: BiomarkerTrend[] = biomarkerTrends.map(b => ({
      name: b.biomarker_name,
      currentValue: b.current_value,
      unit: b.unit,
      currentDate: b.current_date,
      previousValue: b.previous_value,
      previousDate: b.previous_date,
      percentChange: b.percent_change,
    }));

    // Transform DEXA comparison
    const dexa: DexaComparison | null = dexaComparison ? {
      latestScanDate: dexaComparison.latestScanDate,
      bodyFatPercentage: dexaComparison.bodyFatPercentage,
      leanMassKg: dexaComparison.leanMassKg,
      visceralFatAreaCm2: dexaComparison.visceralFatAreaCm2,
      prevBodyFatPercentage: dexaComparison.prevBodyFatPercentage,
      prevVisceralFatAreaCm2: dexaComparison.prevVisceralFatAreaCm2,
      prevLeanMassKg: dexaComparison.prevLeanMassKg,
      prevScanDate: dexaComparison.prevScanDate,
      visceralFatChangeCm2: dexaComparison.visceralFatChangeCm2,
    } : null;

    // Transform wearable metrics
    const wearables: WearableMetrics | null = wearableAverages ? {
      hrv7dAvg: wearableAverages.hrv_7d_avg,
      rhr7dAvg: wearableAverages.rhr_7d_avg,
      sleep7dAvgHours: wearableAverages.sleep_7d_avg_hours,
      activeKcal7dAvg: wearableAverages.active_kcal_7d_avg,
      steps7dAvg: wearableAverages.steps_7d_avg,
      hrv30dAvg: wearableAverages.hrv_30d_avg,
      rhr30dAvg: wearableAverages.rhr_30d_avg,
      sleep30dAvgHours: wearableAverages.sleep_30d_avg_hours,
      hrvTrendPercent: wearableAverages.hrv_trend_percent,
    } : null;

    // Transform behavior metrics
    const behaviors: BehaviorMetrics | null = behaviorMetrics ? {
      alcoholEvents14d: behaviorMetrics.alcohol_events_14d,
      totalDrinks14d: behaviorMetrics.total_drinks_14d,
      zeroDrinkStreakDays: behaviorMetrics.zero_drink_streak_days,
      saunaSessions14d: behaviorMetrics.sauna_sessions_14d,
      avgStressLevel14d: undefined,
      supplementEvents14d: behaviorMetrics.supplement_events_14d,
      iceBathSessions14d: behaviorMetrics.ice_bath_sessions_14d,
    } : null;

    // Transform training metrics
    const training: TrainingMetrics | null = trainingLoad ? {
      zone2Minutes7d: trainingLoad.zone2_minutes_7d,
      zone5Minutes7d: trainingLoad.zone5_minutes_7d,
      strengthSessions7d: trainingLoad.strength_sessions_7d,
      totalWorkoutKcal7d: trainingLoad.total_workout_kcal_7d,
      totalWorkoutMinutes7d: trainingLoad.total_workout_minutes_7d,
    } : null;

    // Transform insights
    const insights: InsightSummary[] = insightCards.map(c => ({
      category: c.category,
      pattern: c.pattern,
      confidence: c.confidence,
      isNew: c.isNew,
    }));

    // Transform action plan items with daysSinceAdded calculation
    const now = new Date();
    const actionPlan: ActionPlanItem[] = actionPlanItems.map(item => {
      const addedAt = item.addedAt || now;
      const daysSinceAdded = Math.floor((now.getTime() - addedAt.getTime()) / (1000 * 60 * 60 * 24));
      return {
        title: item.title,
        action: item.action,
        category: item.category,
        targetBiomarker: item.targetBiomarker,
        currentValue: item.currentValue,
        targetValue: item.targetValue,
        unit: item.unit,
        daysSinceAdded,
      };
    });

    logger.info(`[ReminderContext] Context built successfully for user ${userId}: ${biomarkers.length} biomarker trends, DEXA: ${dexa ? 'yes' : 'no'}, wearables: ${wearables ? 'yes' : 'no'}, behaviors: ${behaviors ? 'yes' : 'no'}, training: ${training ? 'yes' : 'no'}, insights: ${insights.length} (${insights.filter(i => i.isNew).length} new), actions: ${actionPlan.length}, goals: ${goals.length}`);

    return {
      userId,
      biomarkers,
      dexa,
      wearables,
      behaviors,
      training,
      goals,
      insights,
      actionPlan,
    };
  } catch (error: any) {
    logger.error(`[ReminderContext] Failed to build context for user ${userId}:`, error);
    throw new Error(`Failed to build reminder context: ${error.message}`);
  }
}

/**
 * Format reminder context into Grok prompt template string
 * Converts structured data into natural language clinical summary
 */
export function formatContextForGrok(context: ReminderContext): string {
  const sections: string[] = [];

  // Section 1: Proactive Insights (NEW discoveries - priority placement)
  if (context.insights.length > 0) {
    const insightLines = context.insights.map(i => {
      const badge = i.isNew ? ' [NEW]' : '';
      const confidencePercent = Math.round(i.confidence * 100);
      return `- ${i.pattern}${badge} (${confidencePercent}% confidence)`;
    });
    sections.push(`Proactive Insights (AI-discovered patterns):\n${insightLines.join('\n')}`);
  }

  // Section 2: Active Goals
  if (context.goals.length > 0) {
    sections.push(`Active goals:\n${context.goals.map(g => `- ${g}`).join('\n')}`);
  }

  // Section 2.5: Action Plan Items (user's active health actions)
  if (context.actionPlan && context.actionPlan.length > 0) {
    const actionLines = context.actionPlan.map(a => {
      let line = `- [${a.category}] ${a.title}`;
      if (a.targetBiomarker && a.currentValue !== undefined && a.targetValue !== undefined) {
        line += ` - Current: ${a.currentValue} ${a.unit || ''}, Target: ${a.targetValue} ${a.unit || ''}`;
      }
      line += ` (${a.daysSinceAdded}d ago)`;
      return line;
    });
    sections.push(`Action Plan (user's active health goals):\n${actionLines.join('\n')}`);
  }

  // Section 3: Biomarker Trends (only significant changes)
  if (context.biomarkers.length > 0) {
    const biomarkerLines = context.biomarkers.map(b => {
      const trend = b.percentChange! >= 0 ? 'up' : 'down';
      const prevStr = b.previousValue ? ` (was ${b.previousValue} ${b.unit})` : '';
      return `- ${b.name}: ${b.currentValue} ${b.unit}${prevStr} ${trend} ${Math.abs(b.percentChange!)}%`;
    });
    sections.push(`Clinically relevant changes last 90 days:\n${biomarkerLines.join('\n')}`);
  }

  // Section 4: DEXA Changes
  if (context.dexa) {
    const dexaLines: string[] = [];
    if (context.dexa.visceralFatChangeCm2 !== undefined) {
      const sign = context.dexa.visceralFatChangeCm2 > 0 ? '+' : '';
      dexaLines.push(`- Visceral fat: ${sign}${context.dexa.visceralFatChangeCm2} cm2`);
    }
    if (context.dexa.leanMassKg && context.dexa.prevLeanMassKg) {
      const change = context.dexa.leanMassKg - context.dexa.prevLeanMassKg;
      const sign = change > 0 ? '+' : '';
      dexaLines.push(`- Lean mass: ${sign}${change.toFixed(1)} kg`);
    }
    if (dexaLines.length > 0) {
      sections.push(`DEXA changes:\n${dexaLines.join('\n')}`);
    }
  }

  // Section 5: HRV & Wearables (7d vs 30d baseline)
  if (context.wearables) {
    const w = context.wearables;
    const wearableLines: string[] = [];
    if (w.hrv7dAvg && w.hrv30dAvg) {
      const trend = w.hrvTrendPercent! >= 0 ? 'up' : 'down';
      wearableLines.push(`- HRV: ${w.hrv7dAvg} ms (7d avg) vs ${w.hrv30dAvg} ms (30d baseline) ${trend} ${Math.abs(w.hrvTrendPercent!)}%`);
    }
    if (w.rhr7dAvg) {
      wearableLines.push(`- RHR: ${w.rhr7dAvg} bpm (7d avg)`);
    }
    if (w.sleep7dAvgHours) {
      wearableLines.push(`- Sleep: ${w.sleep7dAvgHours} hrs/night (7d avg)`);
    }
    if (wearableLines.length > 0) {
      sections.push(`Wearables (7-day trends):\n${wearableLines.join('\n')}`);
    }
  }

  // Section 6: Behavior Tracking
  if (context.behaviors) {
    const b = context.behaviors;
    const behaviorLines: string[] = [];
    if (b.zeroDrinkStreakDays > 0) {
      behaviorLines.push(`- Alcohol: ${b.zeroDrinkStreakDays}-day zero-drink streak (${b.totalDrinks14d} drinks in last 14d)`);
    }
    if (b.saunaSessions14d > 0) {
      behaviorLines.push(`- Sauna: ${b.saunaSessions14d} sessions (14d)`);
    }
    if (b.iceBathSessions14d > 0) {
      behaviorLines.push(`- Ice bath: ${b.iceBathSessions14d} sessions (14d)`);
    }
    if (b.avgStressLevel14d !== undefined && b.avgStressLevel14d > 0) {
      behaviorLines.push(`- Avg stress level: ${b.avgStressLevel14d.toFixed(1)}/10 (14d)`);
    }
    if (b.supplementEvents14d > 0) {
      behaviorLines.push(`- Supplement adherence: ${b.supplementEvents14d} logged (14d)`);
    }
    if (behaviorLines.length > 0) {
      sections.push(`Behaviors (14-day window):\n${behaviorLines.join('\n')}`);
    }
  }

  // Section 7: Training Load
  if (context.training) {
    const t = context.training;
    const trainingLines: string[] = [];
    if (t.zone2Minutes7d) {
      trainingLines.push(`- Zone 2: ${Math.round(t.zone2Minutes7d)} min (7d)`);
    }
    if (t.zone5Minutes7d) {
      trainingLines.push(`- Zone 5: ${Math.round(t.zone5Minutes7d)} min (7d)`);
    }
    if (t.strengthSessions7d > 0) {
      trainingLines.push(`- Strength: ${t.strengthSessions7d} sessions (7d)`);
    }
    if (trainingLines.length > 0) {
      sections.push(`Training load (7-day):\n${trainingLines.join('\n')}`);
    }
  }

  // If no data at all, return minimal context
  if (sections.length === 0) {
    return 'No recent health data available for this user.';
  }

  return sections.join('\n\n');
}
