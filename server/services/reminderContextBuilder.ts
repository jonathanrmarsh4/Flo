import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger';

export interface ReminderContext {
  userId: string;
  biomarkers: BiomarkerTrend[];
  dexa: DexaComparison | null;
  wearables: WearableMetrics | null;
  behaviors: BehaviorMetrics | null;
  training: TrainingMetrics | null;
  goals: string[];
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
 * Query Neon views to build comprehensive clinical context for a user
 * This aggregates data from 5 optimized SQL views for the Grok reminder prompt
 */
export async function buildReminderContext(userId: string): Promise<ReminderContext> {
  try {
    logger.info(`[ReminderContext] Building context for user ${userId}`);

    // Query all 5 views in parallel for efficiency
    const [biomarkersRaw, dexaRaw, wearablesRaw, behaviorsRaw, trainingRaw, goalsRaw] = await Promise.all([
      // View 1: Top 6 most interesting biomarker trends (filtered by significance)
      db.execute(sql`
        SELECT 
          biomarker_name, 
          current_value, 
          unit, 
          current_date,
          previous_value,
          previous_date,
          percent_change
        FROM user_current_biomarkers
        WHERE user_id = ${userId}
          AND recency_rank = 1
          AND percent_change IS NOT NULL
          AND ABS(percent_change) >= 5
        ORDER BY ABS(percent_change) DESC
        LIMIT 6
      `),

      // View 2: Latest DEXA scan comparison
      db.execute(sql`
        SELECT 
          latest_scan_date,
          body_fat_percentage,
          lean_mass_kg,
          visceral_fat_area_cm2,
          prev_body_fat_percentage,
          prev_visceral_fat_area_cm2,
          prev_lean_mass_kg,
          prev_scan_date,
          visceral_fat_change_cm2
        FROM user_dexa_latest
        WHERE user_id = ${userId}
          AND scan_rank = 1
        LIMIT 1
      `),

      // View 3: 7-day and 30-day wearable averages
      db.execute(sql`
        SELECT 
          hrv_7d_avg,
          rhr_7d_avg,
          sleep_7d_avg_hours,
          active_kcal_7d_avg,
          steps_7d_avg,
          hrv_30d_avg,
          rhr_30d_avg,
          sleep_30d_avg_hours,
          hrv_trend_percent
        FROM user_wearable_7d
        WHERE user_id = ${userId}
        LIMIT 1
      `),

      // View 4: 14-day behavior tracking
      db.execute(sql`
        SELECT 
          alcohol_events_14d,
          total_drinks_14d,
          zero_drink_streak_days,
          sauna_sessions_14d,
          avg_stress_level_14d,
          supplement_events_14d,
          ice_bath_sessions_14d
        FROM user_behavior_14d
        WHERE user_id = ${userId}
        LIMIT 1
      `),

      // View 5: 7-day training load
      db.execute(sql`
        SELECT 
          zone2_minutes_7d,
          zone5_minutes_7d,
          strength_sessions_7d,
          total_workout_kcal_7d,
          total_workout_minutes_7d
        FROM user_training_load
        WHERE user_id = ${userId}
        LIMIT 1
      `),

      // User's active health goals
      db.execute(sql`
        SELECT goals 
        FROM profiles 
        WHERE user_id = ${userId}
        LIMIT 1
      `)
    ]);

    // Parse biomarker trends
    const biomarkers: BiomarkerTrend[] = (biomarkersRaw.rows || []).map((row: any) => ({
      name: String(row.biomarker_name || ''),
      currentValue: parseFloat(String(row.current_value || 0)),
      unit: String(row.unit || ''),
      currentDate: new Date(row.current_date as string),
      previousValue: row.previous_value ? parseFloat(String(row.previous_value)) : undefined,
      previousDate: row.previous_date ? new Date(row.previous_date as string) : undefined,
      percentChange: row.percent_change ? parseFloat(String(row.percent_change)) : undefined,
    }));

    // Parse DEXA data
    const dexaRow: any = dexaRaw.rows?.[0];
    const dexa: DexaComparison | null = dexaRow ? {
      latestScanDate: new Date(String(dexaRow.latest_scan_date)),
      bodyFatPercentage: dexaRow.body_fat_percentage ? parseFloat(String(dexaRow.body_fat_percentage)) : undefined,
      leanMassKg: dexaRow.lean_mass_kg ? parseFloat(String(dexaRow.lean_mass_kg)) : undefined,
      visceralFatAreaCm2: dexaRow.visceral_fat_area_cm2 ? parseFloat(String(dexaRow.visceral_fat_area_cm2)) : undefined,
      prevBodyFatPercentage: dexaRow.prev_body_fat_percentage ? parseFloat(String(dexaRow.prev_body_fat_percentage)) : undefined,
      prevVisceralFatAreaCm2: dexaRow.prev_visceral_fat_area_cm2 ? parseFloat(String(dexaRow.prev_visceral_fat_area_cm2)) : undefined,
      prevLeanMassKg: dexaRow.prev_lean_mass_kg ? parseFloat(String(dexaRow.prev_lean_mass_kg)) : undefined,
      prevScanDate: dexaRow.prev_scan_date ? new Date(String(dexaRow.prev_scan_date)) : undefined,
      visceralFatChangeCm2: dexaRow.visceral_fat_change_cm2 ? parseFloat(String(dexaRow.visceral_fat_change_cm2)) : undefined,
    } : null;

    // Parse wearable metrics
    const wearableRow: any = wearablesRaw.rows?.[0];
    const wearables: WearableMetrics | null = wearableRow ? {
      hrv7dAvg: wearableRow.hrv_7d_avg ? parseFloat(String(wearableRow.hrv_7d_avg)) : undefined,
      rhr7dAvg: wearableRow.rhr_7d_avg ? parseFloat(String(wearableRow.rhr_7d_avg)) : undefined,
      sleep7dAvgHours: wearableRow.sleep_7d_avg_hours ? parseFloat(String(wearableRow.sleep_7d_avg_hours)) : undefined,
      activeKcal7dAvg: wearableRow.active_kcal_7d_avg ? parseFloat(String(wearableRow.active_kcal_7d_avg)) : undefined,
      steps7dAvg: wearableRow.steps_7d_avg ? parseFloat(String(wearableRow.steps_7d_avg)) : undefined,
      exercise7dAvgMin: undefined, // Column doesn't exist in view
      hrv30dAvg: wearableRow.hrv_30d_avg ? parseFloat(String(wearableRow.hrv_30d_avg)) : undefined,
      rhr30dAvg: wearableRow.rhr_30d_avg ? parseFloat(String(wearableRow.rhr_30d_avg)) : undefined,
      sleep30dAvgHours: wearableRow.sleep_30d_avg_hours ? parseFloat(String(wearableRow.sleep_30d_avg_hours)) : undefined,
      hrvTrendPercent: wearableRow.hrv_trend_percent ? parseFloat(String(wearableRow.hrv_trend_percent)) : undefined,
    } : null;

    // Parse behavior metrics
    const behaviorRow: any = behaviorsRaw.rows?.[0];
    const behaviors: BehaviorMetrics | null = behaviorRow ? {
      alcoholEvents14d: parseInt(String(behaviorRow.alcohol_events_14d || 0)),
      totalDrinks14d: parseInt(String(behaviorRow.total_drinks_14d || 0)),
      zeroDrinkStreakDays: parseInt(String(behaviorRow.zero_drink_streak_days || 0)),
      saunaSessions14d: parseInt(String(behaviorRow.sauna_sessions_14d || 0)),
      avgStressLevel14d: behaviorRow.avg_stress_level_14d ? parseFloat(String(behaviorRow.avg_stress_level_14d)) : undefined,
      supplementEvents14d: parseInt(String(behaviorRow.supplement_events_14d || 0)),
      iceBathSessions14d: parseInt(String(behaviorRow.ice_bath_sessions_14d || 0)),
    } : null;

    // Parse training metrics
    const trainingRow: any = trainingRaw.rows?.[0];
    const training: TrainingMetrics | null = trainingRow ? {
      zone2Minutes7d: trainingRow.zone2_minutes_7d ? parseFloat(String(trainingRow.zone2_minutes_7d)) : undefined,
      zone5Minutes7d: trainingRow.zone5_minutes_7d ? parseFloat(String(trainingRow.zone5_minutes_7d)) : undefined,
      strengthSessions7d: parseInt(String(trainingRow.strength_sessions_7d || 0)),
      totalWorkoutKcal7d: trainingRow.total_workout_kcal_7d ? parseFloat(String(trainingRow.total_workout_kcal_7d)) : undefined,
      totalWorkoutMinutes7d: trainingRow.total_workout_minutes_7d ? parseFloat(String(trainingRow.total_workout_minutes_7d)) : undefined,
    } : null;

    // Parse goals
    const goalsRow: any = goalsRaw.rows?.[0];
    const goals: string[] = Array.isArray(goalsRow?.goals) ? goalsRow.goals : [];

    logger.info(`[ReminderContext] Context built successfully for user ${userId}: ${biomarkers.length} biomarker trends, DEXA: ${dexa ? 'yes' : 'no'}, wearables: ${wearables ? 'yes' : 'no'}`);

    return {
      userId,
      biomarkers,
      dexa,
      wearables,
      behaviors,
      training,
      goals,
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

  // Section 1: Active Goals
  if (context.goals.length > 0) {
    sections.push(`Active goals:\n${context.goals.map(g => `• ${g}`).join('\n')}`);
  }

  // Section 2: Biomarker Trends (only significant changes)
  if (context.biomarkers.length > 0) {
    const biomarkerLines = context.biomarkers.map(b => {
      const trend = b.percentChange! >= 0 ? '↑' : '↓';
      const prevStr = b.previousValue ? ` (was ${b.previousValue} ${b.unit})` : '';
      return `• ${b.name}: ${b.currentValue} ${b.unit}${prevStr} ${trend} ${Math.abs(b.percentChange!)}%`;
    });
    sections.push(`Clinically relevant changes last 90 days:\n${biomarkerLines.join('\n')}`);
  }

  // Section 3: DEXA Changes
  if (context.dexa) {
    const dexaLines: string[] = [];
    if (context.dexa.visceralFatChangeCm2 !== undefined) {
      const sign = context.dexa.visceralFatChangeCm2 > 0 ? '+' : '';
      dexaLines.push(`• Visceral fat: ${sign}${context.dexa.visceralFatChangeCm2} cm²`);
    }
    if (context.dexa.leanMassKg && context.dexa.prevLeanMassKg) {
      const change = context.dexa.leanMassKg - context.dexa.prevLeanMassKg;
      const sign = change > 0 ? '+' : '';
      dexaLines.push(`• Lean mass: ${sign}${change.toFixed(1)} kg`);
    }
    if (dexaLines.length > 0) {
      sections.push(`DEXA changes:\n${dexaLines.join('\n')}`);
    }
  }

  // Section 4: HRV & Wearables (7d vs 30d baseline)
  if (context.wearables) {
    const w = context.wearables;
    const wearableLines: string[] = [];
    if (w.hrv7dAvg && w.hrv30dAvg) {
      const trend = w.hrvTrendPercent! >= 0 ? '↑' : '↓';
      wearableLines.push(`• HRV: ${w.hrv7dAvg} ms (7d avg) vs ${w.hrv30dAvg} ms (30d baseline) ${trend} ${Math.abs(w.hrvTrendPercent!)}%`);
    }
    if (w.rhr7dAvg) {
      wearableLines.push(`• RHR: ${w.rhr7dAvg} bpm (7d avg)`);
    }
    if (w.sleep7dAvgHours) {
      wearableLines.push(`• Sleep: ${w.sleep7dAvgHours} hrs/night (7d avg)`);
    }
    if (wearableLines.length > 0) {
      sections.push(`Wearables (7-day trends):\n${wearableLines.join('\n')}`);
    }
  }

  // Section 5: Behavior Tracking
  if (context.behaviors) {
    const b = context.behaviors;
    const behaviorLines: string[] = [];
    if (b.zeroDrinkStreakDays > 0) {
      behaviorLines.push(`• Alcohol: ${b.zeroDrinkStreakDays}-day zero-drink streak (${b.totalDrinks14d} drinks in last 14d)`);
    }
    if (b.saunaSessions14d > 0) {
      behaviorLines.push(`• Sauna: ${b.saunaSessions14d} sessions (14d)`);
    }
    if (b.iceBathSessions14d > 0) {
      behaviorLines.push(`• Ice bath: ${b.iceBathSessions14d} sessions (14d)`);
    }
    if (b.avgStressLevel14d !== undefined && b.avgStressLevel14d > 0) {
      behaviorLines.push(`• Avg stress level: ${b.avgStressLevel14d.toFixed(1)}/10 (14d)`);
    }
    if (b.supplementEvents14d > 0) {
      behaviorLines.push(`• Supplement adherence: ${b.supplementEvents14d} logged (14d)`);
    }
    if (behaviorLines.length > 0) {
      sections.push(`Behaviors (14-day window):\n${behaviorLines.join('\n')}`);
    }
  }

  // Section 6: Training Load
  if (context.training) {
    const t = context.training;
    const trainingLines: string[] = [];
    if (t.zone2Minutes7d) {
      trainingLines.push(`• Zone 2: ${Math.round(t.zone2Minutes7d)} min (7d)`);
    }
    if (t.zone5Minutes7d) {
      trainingLines.push(`• Zone 5: ${Math.round(t.zone5Minutes7d)} min (7d)`);
    }
    if (t.strengthSessions7d > 0) {
      trainingLines.push(`• Strength: ${t.strengthSessions7d} sessions (7d)`);
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
