import { randomUUID } from 'crypto';
import { clickhouse } from './clickhouseService';
import { createLogger } from '../utils/logger';

const logger = createLogger('ClickHouseCorrelation');

interface BehaviorEvent {
  healthId: string;
  eventId: string;
  localDate: string;
  eventTime: Date;
  behaviorType: string;
  behaviorSubtype?: string;
  value?: number;
  durationMinutes?: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  metadata?: Record<string, unknown>;
}

interface WeeklyBehaviorCohort {
  healthId: string;
  weekStart: string;
  workoutCount: number;
  workoutTotalMinutes: number;
  avgWorkoutTimeOfDay: number;
  morningWorkoutCount: number;
  afternoonWorkoutCount: number;
  eveningWorkoutCount: number;
  workoutConsistencyScore: number;
  avgCaffeineMg?: number;
  lateCaffeineDays: number;
  avgCaloriesKcal?: number;
  proteinTargetHitDays: number;
  avgSleepDurationHours?: number;
  avgBedtimeHour?: number;
  bedtimeConsistencyScore?: number;
  stressEventsCount: number;
  alcoholDays: number;
  travelDays: number;
  sickDays: number;
  cohortTags: string[];
}

interface WeeklyOutcomeRollup {
  healthId: string;
  weekStart: string;
  avgHrv?: number;
  hrvTrend: number;
  avgRestingHr?: number;
  rhrTrend: number;
  avgSleepDurationHours?: number;
  avgDeepSleepHours?: number;
  avgRemSleepHours?: number;
  avgSleepEfficiency?: number;
  sleepQualityTrend: number;
  avgReadinessScore?: number;
  avgStrainScore?: number;
  avgSteps?: number;
  avgActiveEnergy?: number;
  avgWristTempDeviation?: number;
  avgRespiratoryRate?: number;
  avgO2Saturation?: number;
  illnessDays: number;
  anomalyCount: number;
  recoveryQualityScore?: number;
}

interface LongTermCorrelation {
  correlationId: string;
  healthId: string;
  discoveredAt: Date;
  behaviorType: string;
  behaviorDescription: string;
  outcomeType: string;
  outcomeDescription: string;
  effectDirection: 'positive' | 'negative';
  effectSizePct: number;
  effectSizeAbsolute?: number;
  confidenceLevel: number;
  pValue: number;
  sampleSizeBehavior: number;
  sampleSizeControl: number;
  timeRangeMonths: number;
  statisticalTest: string;
  cohortDefinition: string;
  controlDefinition: string;
  confoundersControlled: string[];
  isActionable: boolean;
  naturalLanguageInsight: string;
}

interface AIFeedbackQuestion {
  questionId: string;
  healthId: string;
  createdAt: Date;
  expiresAt: Date;
  triggerType: 'anomaly' | 'pattern' | 'trend' | 'scheduled';
  triggerAnomalyIds: string[];
  triggerPatterns: string[];
  triggerMetrics: Record<string, number>;
  questionText: string;
  questionType: 'scale_1_10' | 'yes_no' | 'multiple_choice' | 'free_text';
  responseOptions?: string[];
  priority: number;
}

const BEHAVIOR_COHORT_DEFINITIONS = {
  high_workout_consistency: {
    condition: (cohort: WeeklyBehaviorCohort) => cohort.workoutCount >= 5,
    description: 'weeks with 5+ workouts',
  },
  low_workout_consistency: {
    condition: (cohort: WeeklyBehaviorCohort) => cohort.workoutCount < 3,
    description: 'weeks with fewer than 3 workouts',
  },
  afternoon_workout_preference: {
    condition: (cohort: WeeklyBehaviorCohort) => 
      cohort.afternoonWorkoutCount > cohort.morningWorkoutCount && 
      cohort.afternoonWorkoutCount > cohort.eveningWorkoutCount,
    description: 'weeks with primarily afternoon workouts (after 12pm)',
  },
  morning_workout_preference: {
    condition: (cohort: WeeklyBehaviorCohort) => 
      cohort.morningWorkoutCount > cohort.afternoonWorkoutCount && 
      cohort.morningWorkoutCount > cohort.eveningWorkoutCount,
    description: 'weeks with primarily morning workouts (before 12pm)',
  },
  high_caffeine_intake: {
    condition: (cohort: WeeklyBehaviorCohort) => (cohort.avgCaffeineMg ?? 0) > 300,
    description: 'weeks with average daily caffeine >300mg',
  },
  late_caffeine_habit: {
    condition: (cohort: WeeklyBehaviorCohort) => cohort.lateCaffeineDays >= 3,
    description: 'weeks with 3+ days of caffeine after 2pm',
  },
  consistent_bedtime: {
    condition: (cohort: WeeklyBehaviorCohort) => (cohort.bedtimeConsistencyScore ?? 0) >= 0.8,
    description: 'weeks with consistent bedtime (±30 min variance)',
  },
  inconsistent_bedtime: {
    condition: (cohort: WeeklyBehaviorCohort) => (cohort.bedtimeConsistencyScore ?? 1) < 0.5,
    description: 'weeks with inconsistent bedtime (>1 hour variance)',
  },
  high_protein_compliance: {
    condition: (cohort: WeeklyBehaviorCohort) => cohort.proteinTargetHitDays >= 5,
    description: 'weeks where protein target was hit 5+ days',
  },
  stress_events_present: {
    condition: (cohort: WeeklyBehaviorCohort) => cohort.stressEventsCount >= 2,
    description: 'weeks with 2+ logged stress events',
  },
} as const;

const OUTCOME_METRICS = [
  { key: 'avgDeepSleepHours', name: 'deep sleep', unit: 'hours' },
  { key: 'avgRemSleepHours', name: 'REM sleep', unit: 'hours' },
  { key: 'avgSleepDurationHours', name: 'total sleep', unit: 'hours' },
  { key: 'avgHrv', name: 'HRV', unit: 'ms' },
  { key: 'avgRestingHr', name: 'resting heart rate', unit: 'bpm' },
  { key: 'avgReadinessScore', name: 'readiness score', unit: 'points' },
  { key: 'recoveryQualityScore', name: 'recovery quality', unit: 'score' },
  { key: 'avgWristTempDeviation', name: 'wrist temperature deviation', unit: '°C' },
] as const;

export class ClickHouseCorrelationEngine {
  private initialized = false;

  async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      if (!clickhouse.isEnabled()) {
        logger.warn('[CorrelationEngine] ClickHouse not enabled');
        return false;
      }

      await clickhouse.initialize();
      this.initialized = true;
      logger.info('[CorrelationEngine] Initialized successfully');
      return true;
    } catch (error) {
      logger.error('[CorrelationEngine] Initialization failed:', error);
      return false;
    }
  }

  async extractBehaviorEvents(healthId: string, startDate: string, endDate: string): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const workoutsSql = `
        SELECT 
          local_date,
          recorded_at as event_time,
          value as duration_minutes
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND metric_type = 'exercise'
          AND local_date >= {startDate:Date}
          AND local_date <= {endDate:Date}
          AND value > 0
      `;

      const workouts = await clickhouse.query<{
        local_date: string;
        event_time: string;
        duration_minutes: number;
      }>(workoutsSql, { healthId, startDate, endDate });

      const events: BehaviorEvent[] = workouts.map(w => {
        const eventTime = new Date(w.event_time);
        const hour = eventTime.getHours();
        let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
        if (hour >= 5 && hour < 12) timeOfDay = 'morning';
        else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
        else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
        else timeOfDay = 'night';

        return {
          healthId,
          eventId: randomUUID(),
          localDate: w.local_date,
          eventTime,
          behaviorType: 'workout',
          behaviorSubtype: 'exercise',
          durationMinutes: w.duration_minutes,
          timeOfDay,
          dayOfWeek: eventTime.getDay(),
        };
      });

      const caffeineSql = `
        SELECT 
          local_date,
          caffeine_mg
        FROM flo_health.nutrition_metrics
        WHERE health_id = {healthId:String}
          AND local_date >= {startDate:Date}
          AND local_date <= {endDate:Date}
          AND caffeine_mg > 0
      `;

      const caffeineData = await clickhouse.query<{
        local_date: string;
        caffeine_mg: number;
      }>(caffeineSql, { healthId, startDate, endDate });

      for (const c of caffeineData) {
        events.push({
          healthId,
          eventId: randomUUID(),
          localDate: c.local_date,
          eventTime: new Date(c.local_date + 'T14:00:00Z'),
          behaviorType: 'nutrition',
          behaviorSubtype: 'caffeine',
          value: c.caffeine_mg,
          timeOfDay: 'afternoon',
          dayOfWeek: new Date(c.local_date).getDay(),
        });
      }

      if (events.length > 0) {
        const rows = events.map(e => ({
          health_id: e.healthId,
          event_id: e.eventId,
          local_date: e.localDate,
          event_time: e.eventTime.toISOString(),
          behavior_type: e.behaviorType,
          behavior_subtype: e.behaviorSubtype || null,
          value: e.value ?? null,
          duration_minutes: e.durationMinutes ?? null,
          time_of_day: e.timeOfDay,
          day_of_week: e.dayOfWeek,
          metadata: e.metadata ? JSON.stringify(e.metadata) : null,
        }));

        await clickhouse.insert('behavior_events', rows);
        logger.info(`[CorrelationEngine] Extracted ${events.length} behavior events for ${healthId}`);
      }

      return events.length;
    } catch (error) {
      logger.error('[CorrelationEngine] Behavior extraction error:', error);
      return 0;
    }
  }

  async buildWeeklyCohorts(healthId: string, lookbackMonths: number = 6): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - lookbackMonths);

      const sql = `
        SELECT 
          toStartOfWeek(local_date) as week_start,
          countIf(behavior_type = 'workout') as workout_count,
          sumIf(duration_minutes, behavior_type = 'workout') as workout_total_minutes,
          avgIf(toHour(event_time), behavior_type = 'workout') as avg_workout_hour,
          countIf(behavior_type = 'workout' AND time_of_day = 'morning') as morning_workouts,
          countIf(behavior_type = 'workout' AND time_of_day = 'afternoon') as afternoon_workouts,
          countIf(behavior_type = 'workout' AND time_of_day = 'evening') as evening_workouts,
          avgIf(value, behavior_subtype = 'caffeine') as avg_caffeine,
          countIf(behavior_subtype = 'caffeine' AND toHour(event_time) >= 14) as late_caffeine_count
        FROM flo_health.behavior_events
        WHERE health_id = {healthId:String}
          AND local_date >= {startDate:Date}
          AND local_date <= {endDate:Date}
        GROUP BY week_start
        ORDER BY week_start
      `;

      const weeklyData = await clickhouse.query<{
        week_start: string;
        workout_count: number;
        workout_total_minutes: number;
        avg_workout_hour: number;
        morning_workouts: number;
        afternoon_workouts: number;
        evening_workouts: number;
        avg_caffeine: number;
        late_caffeine_count: number;
      }>(sql, { 
        healthId, 
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      const sleepSql = `
        SELECT 
          toStartOfWeek(local_date) as week_start,
          avg(value) as avg_sleep_hours
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND metric_type = 'sleep_duration'
          AND local_date >= {startDate:Date}
          AND local_date <= {endDate:Date}
        GROUP BY week_start
      `;

      const sleepData = await clickhouse.query<{
        week_start: string;
        avg_sleep_hours: number;
      }>(sleepSql, { 
        healthId, 
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      const sleepMap = new Map(sleepData.map(s => [s.week_start, s.avg_sleep_hours]));

      const cohorts: WeeklyBehaviorCohort[] = weeklyData.map(w => {
        const cohort: WeeklyBehaviorCohort = {
          healthId,
          weekStart: w.week_start,
          workoutCount: Number(w.workout_count) || 0,
          workoutTotalMinutes: Number(w.workout_total_minutes) || 0,
          avgWorkoutTimeOfDay: Number(w.avg_workout_hour) || 12,
          morningWorkoutCount: Number(w.morning_workouts) || 0,
          afternoonWorkoutCount: Number(w.afternoon_workouts) || 0,
          eveningWorkoutCount: Number(w.evening_workouts) || 0,
          workoutConsistencyScore: Math.min(1, (Number(w.workout_count) || 0) / 5),
          avgCaffeineMg: Number(w.avg_caffeine) || undefined,
          lateCaffeineDays: Number(w.late_caffeine_count) || 0,
          proteinTargetHitDays: 0,
          avgSleepDurationHours: sleepMap.get(w.week_start),
          stressEventsCount: 0,
          alcoholDays: 0,
          travelDays: 0,
          sickDays: 0,
          cohortTags: [],
        };

        for (const [tagName, tagDef] of Object.entries(BEHAVIOR_COHORT_DEFINITIONS)) {
          if (tagDef.condition(cohort)) {
            cohort.cohortTags.push(tagName);
          }
        }

        return cohort;
      });

      if (cohorts.length > 0) {
        const rows = cohorts.map(c => ({
          health_id: c.healthId,
          week_start: c.weekStart,
          workout_count: c.workoutCount,
          workout_total_minutes: c.workoutTotalMinutes,
          avg_workout_time_of_day: c.avgWorkoutTimeOfDay,
          morning_workout_count: c.morningWorkoutCount,
          afternoon_workout_count: c.afternoonWorkoutCount,
          evening_workout_count: c.eveningWorkoutCount,
          workout_consistency_score: c.workoutConsistencyScore,
          avg_caffeine_mg: c.avgCaffeineMg ?? null,
          late_caffeine_days: c.lateCaffeineDays,
          avg_calories_kcal: null,
          protein_target_hit_days: c.proteinTargetHitDays,
          avg_sleep_duration_hours: c.avgSleepDurationHours ?? null,
          avg_bedtime_hour: c.avgBedtimeHour ?? null,
          bedtime_consistency_score: c.bedtimeConsistencyScore ?? null,
          stress_events_count: c.stressEventsCount,
          alcohol_days: c.alcoholDays,
          travel_days: c.travelDays,
          sick_days: c.sickDays,
          cohort_tags: c.cohortTags,
        }));

        await clickhouse.insert('weekly_behavior_cohorts', rows);
        logger.info(`[CorrelationEngine] Built ${cohorts.length} weekly cohorts for ${healthId}`);
      }

      return cohorts.length;
    } catch (error) {
      logger.error('[CorrelationEngine] Cohort building error:', error);
      return 0;
    }
  }

  async buildWeeklyOutcomes(healthId: string, lookbackMonths: number = 6): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - lookbackMonths);

      const sql = `
        SELECT 
          toStartOfWeek(local_date) as week_start,
          avgIf(value, metric_type = 'hrv') as avg_hrv,
          avgIf(value, metric_type = 'resting_heart_rate') as avg_rhr,
          avgIf(value, metric_type = 'sleep_duration') as avg_sleep,
          avgIf(value, metric_type = 'deep_sleep') as avg_deep_sleep,
          avgIf(value, metric_type = 'rem_sleep') as avg_rem_sleep,
          avgIf(value, metric_type = 'steps') as avg_steps,
          avgIf(value, metric_type = 'active_energy') as avg_active_energy,
          avgIf(value, metric_type = 'wrist_temperature_deviation') as avg_wrist_temp,
          avgIf(value, metric_type = 'respiratory_rate') as avg_resp_rate,
          avgIf(value, metric_type = 'oxygen_saturation') as avg_o2
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND local_date >= {startDate:Date}
          AND local_date <= {endDate:Date}
        GROUP BY week_start
        ORDER BY week_start
      `;

      const outcomes = await clickhouse.query<{
        week_start: string;
        avg_hrv: number | null;
        avg_rhr: number | null;
        avg_sleep: number | null;
        avg_deep_sleep: number | null;
        avg_rem_sleep: number | null;
        avg_steps: number | null;
        avg_active_energy: number | null;
        avg_wrist_temp: number | null;
        avg_resp_rate: number | null;
        avg_o2: number | null;
      }>(sql, { 
        healthId, 
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      const readinessSql = `
        SELECT 
          toStartOfWeek(local_date) as week_start,
          avg(readiness_score) as avg_readiness,
          avg(strain_component) as avg_strain
        FROM flo_health.readiness_scores
        WHERE health_id = {healthId:String}
          AND local_date >= {startDate:Date}
          AND local_date <= {endDate:Date}
        GROUP BY week_start
      `;

      const readinessData = await clickhouse.query<{
        week_start: string;
        avg_readiness: number | null;
        avg_strain: number | null;
      }>(readinessSql, { 
        healthId, 
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      const readinessMap = new Map(readinessData.map(r => [r.week_start, r]));

      const anomalySql = `
        SELECT 
          toStartOfWeek(toDate(detected_at)) as week_start,
          count() as anomaly_count
        FROM flo_health.detected_anomalies
        WHERE health_id = {healthId:String}
          AND detected_at >= {startDate:DateTime64(3)}
        GROUP BY week_start
      `;

      const anomalyData = await clickhouse.query<{
        week_start: string;
        anomaly_count: number;
      }>(anomalySql, { 
        healthId, 
        startDate: startDate.toISOString(),
      });

      const anomalyMap = new Map(anomalyData.map(a => [a.week_start, Number(a.anomaly_count)]));

      const rollups: WeeklyOutcomeRollup[] = outcomes.map((o, idx, arr) => {
        const readiness = readinessMap.get(o.week_start);
        const prevWeek = idx > 0 ? arr[idx - 1] : null;

        const hrvTrend = prevWeek && o.avg_hrv && prevWeek.avg_hrv
          ? ((o.avg_hrv - prevWeek.avg_hrv) / prevWeek.avg_hrv) * 100
          : 0;
        const rhrTrend = prevWeek && o.avg_rhr && prevWeek.avg_rhr
          ? ((o.avg_rhr - prevWeek.avg_rhr) / prevWeek.avg_rhr) * 100
          : 0;
        const sleepTrend = prevWeek && o.avg_sleep && prevWeek.avg_sleep
          ? ((o.avg_sleep - prevWeek.avg_sleep) / prevWeek.avg_sleep) * 100
          : 0;

        return {
          healthId,
          weekStart: o.week_start,
          avgHrv: o.avg_hrv ?? undefined,
          hrvTrend,
          avgRestingHr: o.avg_rhr ?? undefined,
          rhrTrend,
          avgSleepDurationHours: o.avg_sleep ?? undefined,
          avgDeepSleepHours: o.avg_deep_sleep ?? undefined,
          avgRemSleepHours: o.avg_rem_sleep ?? undefined,
          avgSleepEfficiency: undefined,
          sleepQualityTrend: sleepTrend,
          avgReadinessScore: readiness?.avg_readiness ?? undefined,
          avgStrainScore: readiness?.avg_strain ?? undefined,
          avgSteps: o.avg_steps ?? undefined,
          avgActiveEnergy: o.avg_active_energy ?? undefined,
          avgWristTempDeviation: o.avg_wrist_temp ?? undefined,
          avgRespiratoryRate: o.avg_resp_rate ?? undefined,
          avgO2Saturation: o.avg_o2 ?? undefined,
          illnessDays: 0,
          anomalyCount: anomalyMap.get(o.week_start) || 0,
          recoveryQualityScore: undefined,
        };
      });

      if (rollups.length > 0) {
        const rows = rollups.map(r => ({
          health_id: r.healthId,
          week_start: r.weekStart,
          avg_hrv: r.avgHrv ?? null,
          hrv_trend: r.hrvTrend,
          avg_resting_hr: r.avgRestingHr ?? null,
          rhr_trend: r.rhrTrend,
          avg_sleep_duration_hours: r.avgSleepDurationHours ?? null,
          avg_deep_sleep_hours: r.avgDeepSleepHours ?? null,
          avg_rem_sleep_hours: r.avgRemSleepHours ?? null,
          avg_sleep_efficiency: r.avgSleepEfficiency ?? null,
          sleep_quality_trend: r.sleepQualityTrend,
          avg_readiness_score: r.avgReadinessScore ?? null,
          avg_strain_score: r.avgStrainScore ?? null,
          avg_steps: r.avgSteps ?? null,
          avg_active_energy: r.avgActiveEnergy ?? null,
          avg_wrist_temp_deviation: r.avgWristTempDeviation ?? null,
          avg_respiratory_rate: r.avgRespiratoryRate ?? null,
          avg_o2_saturation: r.avgO2Saturation ?? null,
          illness_days: r.illnessDays,
          anomaly_count: r.anomalyCount,
          recovery_quality_score: r.recoveryQualityScore ?? null,
        }));

        await clickhouse.insert('weekly_outcome_rollups', rows);
        logger.info(`[CorrelationEngine] Built ${rollups.length} weekly outcome rollups for ${healthId}`);
      }

      return rollups.length;
    } catch (error) {
      logger.error('[CorrelationEngine] Outcome rollup error:', error);
      return 0;
    }
  }

  async discoverCorrelations(healthId: string, minWeeks: number = 12): Promise<LongTermCorrelation[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      const cohortsSql = `
        SELECT * FROM flo_health.weekly_behavior_cohorts
        WHERE health_id = {healthId:String}
        ORDER BY week_start
      `;

      const outcomesSql = `
        SELECT * FROM flo_health.weekly_outcome_rollups
        WHERE health_id = {healthId:String}
        ORDER BY week_start
      `;

      const [cohorts, outcomes] = await Promise.all([
        clickhouse.query<any>(cohortsSql, { healthId }),
        clickhouse.query<any>(outcomesSql, { healthId }),
      ]);

      if (cohorts.length < minWeeks || outcomes.length < minWeeks) {
        logger.info(`[CorrelationEngine] Insufficient data for ${healthId}: ${cohorts.length} cohorts, ${outcomes.length} outcomes`);
        return [];
      }

      const outcomeMap = new Map(outcomes.map((o: any) => [o.week_start, o]));
      const correlations: LongTermCorrelation[] = [];

      // Check for existing correlations to avoid duplicates
      const existingCorrelationsSql = `
        SELECT behavior_type, outcome_type 
        FROM flo_health.long_term_correlations
        WHERE health_id = {healthId:String}
          AND discovered_at > {cutoffDate:DateTime64(3)}
      `;
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const existingCorrelations = await clickhouse.query<{ behavior_type: string; outcome_type: string }>(
        existingCorrelationsSql, 
        { healthId, cutoffDate: cutoffDate.toISOString() }
      );
      const existingKeys = new Set(existingCorrelations.map(c => `${c.behavior_type}|${c.outcome_type}`));

      for (const [behaviorName, behaviorDef] of Object.entries(BEHAVIOR_COHORT_DEFINITIONS)) {
        const behaviorWeeks: any[] = [];
        const controlWeeks: any[] = [];
        const usedWeekStarts = new Set<string>(); // Track used weeks to prevent overlap

        // First pass: identify behavior weeks
        for (const cohort of cohorts) {
          const cohortData = {
            ...cohort,
            workoutCount: Number(cohort.workout_count),
            afternoonWorkoutCount: Number(cohort.afternoon_workout_count),
            morningWorkoutCount: Number(cohort.morning_workout_count),
            eveningWorkoutCount: Number(cohort.evening_workout_count),
            avgCaffeineMg: cohort.avg_caffeine_mg,
            lateCaffeineDays: Number(cohort.late_caffeine_days),
            bedtimeConsistencyScore: cohort.bedtime_consistency_score,
            proteinTargetHitDays: Number(cohort.protein_target_hit_days),
            stressEventsCount: Number(cohort.stress_events_count),
          } as WeeklyBehaviorCohort;

          const outcome = outcomeMap.get(cohort.week_start);
          if (!outcome) continue;

          if (behaviorDef.condition(cohortData)) {
            behaviorWeeks.push({ cohort: cohortData, outcome, weekStart: cohort.week_start });
            usedWeekStarts.add(cohort.week_start);
          }
        }

        // Second pass: identify control weeks (only weeks NOT in behavior group)
        for (const cohort of cohorts) {
          if (usedWeekStarts.has(cohort.week_start)) continue; // Skip weeks already in behavior group

          const cohortData = {
            ...cohort,
            workoutCount: Number(cohort.workout_count),
            afternoonWorkoutCount: Number(cohort.afternoon_workout_count),
            morningWorkoutCount: Number(cohort.morning_workout_count),
            eveningWorkoutCount: Number(cohort.evening_workout_count),
            avgCaffeineMg: cohort.avg_caffeine_mg,
            lateCaffeineDays: Number(cohort.late_caffeine_days),
            bedtimeConsistencyScore: cohort.bedtime_consistency_score,
            proteinTargetHitDays: Number(cohort.protein_target_hit_days),
            stressEventsCount: Number(cohort.stress_events_count),
          } as WeeklyBehaviorCohort;

          const outcome = outcomeMap.get(cohort.week_start);
          if (!outcome) continue;

          controlWeeks.push({ cohort: cohortData, outcome, weekStart: cohort.week_start });
        }

        // Require minimum sample sizes for both groups
        const MIN_WEEKS_PER_GROUP = 5;
        if (behaviorWeeks.length < MIN_WEEKS_PER_GROUP || controlWeeks.length < MIN_WEEKS_PER_GROUP) continue;

        for (const metric of OUTCOME_METRICS) {
          // Skip if this correlation was already discovered recently
          const correlationKey = `${behaviorName}|${metric.key}`;
          if (existingKeys.has(correlationKey)) continue;

          const behaviorValues = behaviorWeeks
            .map(w => w.outcome[this.camelToSnake(metric.key)])
            .filter((v): v is number => v != null && !isNaN(v));
          
          const controlValues = controlWeeks
            .map(w => w.outcome[this.camelToSnake(metric.key)])
            .filter((v): v is number => v != null && !isNaN(v));

          // Require minimum sample sizes for statistical validity
          if (behaviorValues.length < 5 || controlValues.length < 5) continue;

          const behaviorMean = this.mean(behaviorValues);
          const controlMean = this.mean(controlValues);
          
          // Avoid division by zero
          if (controlMean === 0) continue;
          
          const effectSizePct = ((behaviorMean - controlMean) / controlMean) * 100;
          const effectSizeAbs = behaviorMean - controlMean;

          const { pValue, significant, effectSize } = this.mannWhitneyU(behaviorValues, controlValues);

          // Require statistical significance AND meaningful effect size
          if (!significant || Math.abs(effectSizePct) < 5) continue;

          const timeRangeMonths = Math.ceil((cohorts.length * 7) / 30);

          const insight = this.generateNaturalLanguageInsight(
            behaviorDef.description,
            metric.name,
            effectSizePct,
            effectSizeAbs,
            metric.unit,
            timeRangeMonths,
            behaviorValues.length,
            controlValues.length
          );

          correlations.push({
            correlationId: randomUUID(),
            healthId,
            discoveredAt: new Date(),
            behaviorType: behaviorName,
            behaviorDescription: behaviorDef.description,
            outcomeType: metric.key,
            outcomeDescription: metric.name,
            effectDirection: effectSizePct > 0 ? 'positive' : 'negative',
            effectSizePct,
            effectSizeAbsolute: effectSizeAbs,
            confidenceLevel: 1 - pValue,
            pValue,
            sampleSizeBehavior: behaviorValues.length,
            sampleSizeControl: controlValues.length,
            timeRangeMonths,
            statisticalTest: 'Mann-Whitney U',
            cohortDefinition: behaviorDef.description,
            controlDefinition: `weeks without ${behaviorName.replace(/_/g, ' ')}`,
            confoundersControlled: [],
            isActionable: true,
            naturalLanguageInsight: insight,
          });
        }
      }

      if (correlations.length > 0) {
        const rows = correlations.map(c => ({
          correlation_id: c.correlationId,
          health_id: c.healthId,
          discovered_at: c.discoveredAt.toISOString(),
          behavior_type: c.behaviorType,
          behavior_description: c.behaviorDescription,
          outcome_type: c.outcomeType,
          outcome_description: c.outcomeDescription,
          effect_direction: c.effectDirection,
          effect_size_pct: c.effectSizePct,
          effect_size_absolute: c.effectSizeAbsolute ?? null,
          confidence_level: c.confidenceLevel,
          p_value: c.pValue,
          sample_size_behavior: c.sampleSizeBehavior,
          sample_size_control: c.sampleSizeControl,
          time_range_months: c.timeRangeMonths,
          statistical_test: c.statisticalTest,
          cohort_definition: c.cohortDefinition,
          control_definition: c.controlDefinition,
          confounders_controlled: c.confoundersControlled,
          is_actionable: c.isActionable ? 1 : 0,
          natural_language_insight: c.naturalLanguageInsight,
          user_acknowledged: 0,
          acknowledged_at: null,
          user_feedback: null,
          was_helpful: null,
        }));

        await clickhouse.insert('long_term_correlations', rows);
        logger.info(`[CorrelationEngine] Discovered ${correlations.length} long-term correlations for ${healthId}`);
      }

      return correlations;
    } catch (error) {
      logger.error('[CorrelationEngine] Correlation discovery error:', error);
      return [];
    }
  }

  async generateFeedbackQuestion(
    healthId: string,
    triggerType: 'anomaly' | 'pattern' | 'trend',
    anomalyIds: string[],
    patterns: string[],
    metrics: Record<string, number>
  ): Promise<AIFeedbackQuestion | null> {
    if (!await this.ensureInitialized()) return null;

    try {
      // Check for existing pending questions to avoid duplicates
      const pendingQuestions = await this.getPendingFeedbackQuestions(healthId);
      if (pendingQuestions.length >= 2) {
        // Already have enough pending questions, don't overwhelm user
        logger.debug(`[CorrelationEngine] Skipping question generation for ${healthId}: ${pendingQuestions.length} pending questions already`);
        return null;
      }

      // Check if we've already asked about this specific pattern/trigger recently
      const recentQuestionSql = `
        SELECT question_id FROM flo_health.ai_feedback_questions
        WHERE health_id = {healthId:String}
          AND created_at > {cutoffTime:DateTime64(3)}
          AND trigger_type = {triggerType:String}
        LIMIT 1
      `;
      const cutoffTime = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
      const recentQuestions = await clickhouse.query<{ question_id: string }>(
        recentQuestionSql,
        { healthId, cutoffTime: cutoffTime.toISOString(), triggerType }
      );
      
      if (recentQuestions.length > 0) {
        logger.debug(`[CorrelationEngine] Skipping question generation for ${healthId}: similar question asked recently`);
        return null;
      }

      let questionText = '';
      let questionType: AIFeedbackQuestion['questionType'] = 'scale_1_10';
      let priority = 5;

      if (patterns.includes('illness_precursor')) {
        questionText = 'Your wrist temperature and respiratory rate were both elevated last night. How are you feeling today on a scale from 1-10?';
        priority = 9;
      } else if (metrics['wrist_temperature_deviation'] && metrics['wrist_temperature_deviation'] > 0.3) {
        questionText = `Your wrist temperature was elevated by ${metrics['wrist_temperature_deviation'].toFixed(1)}°C last night. How are you feeling today on a scale from 1-10?`;
        priority = 8;
      } else if (metrics['resting_heart_rate'] && metrics['respiratory_rate']) {
        questionText = 'Your resting heart rate and respiratory rate were both elevated. Are you feeling under the weather today?';
        questionType = 'yes_no';
        priority = 7;
      } else if (metrics['hrv']) {
        const hrvDeviation = metrics['hrv'];
        if (hrvDeviation < -15) {
          questionText = 'Your HRV was significantly lower than usual. Have you been experiencing more stress lately?';
          questionType = 'yes_no';
          priority = 6;
        }
      } else if (metrics['sleep_duration']) {
        const sleepDev = metrics['sleep_duration'];
        if (sleepDev < -20) {
          questionText = 'You got less sleep than usual last night. Was there something that kept you up?';
          questionType = 'free_text';
          priority = 4;
        }
      }

      if (!questionText) return null;

      const question: AIFeedbackQuestion = {
        questionId: randomUUID(),
        healthId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        triggerType,
        triggerAnomalyIds: anomalyIds,
        triggerPatterns: patterns,
        triggerMetrics: metrics,
        questionText,
        questionType,
        priority,
      };

      const row = {
        question_id: question.questionId,
        health_id: question.healthId,
        created_at: question.createdAt.toISOString(),
        expires_at: question.expiresAt.toISOString(),
        trigger_type: question.triggerType,
        trigger_anomaly_ids: question.triggerAnomalyIds,
        trigger_patterns: question.triggerPatterns,
        trigger_metrics: JSON.stringify(question.triggerMetrics),
        question_text: question.questionText,
        question_type: question.questionType,
        response_options: null,
        priority: question.priority,
        was_shown: 0,
        shown_at: null,
        was_answered: 0,
        answered_at: null,
        response_value: null,
        response_text: null,
        channel: 'in_app',
      };

      await clickhouse.insert('ai_feedback_questions', [row]);
      logger.info(`[CorrelationEngine] Generated feedback question for ${healthId}: "${questionText}"`);

      return question;
    } catch (error) {
      logger.error('[CorrelationEngine] Question generation error:', error);
      return null;
    }
  }

  async getPendingFeedbackQuestions(healthId: string): Promise<AIFeedbackQuestion[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      const sql = `
        SELECT *
        FROM flo_health.ai_feedback_questions
        WHERE health_id = {healthId:String}
          AND was_answered = 0
          AND expires_at > now64(3)
        ORDER BY priority DESC, created_at DESC
        LIMIT 5
      `;

      const rows = await clickhouse.query<any>(sql, { healthId });

      return rows.map(r => ({
        questionId: r.question_id,
        healthId: r.health_id,
        createdAt: new Date(r.created_at),
        expiresAt: new Date(r.expires_at),
        triggerType: r.trigger_type,
        triggerAnomalyIds: r.trigger_anomaly_ids || [],
        triggerPatterns: r.trigger_patterns || [],
        triggerMetrics: JSON.parse(r.trigger_metrics || '{}'),
        questionText: r.question_text,
        questionType: r.question_type,
        responseOptions: r.response_options ? JSON.parse(r.response_options) : undefined,
        priority: r.priority,
      }));
    } catch (error) {
      logger.error('[CorrelationEngine] Get questions error:', error);
      return [];
    }
  }

  async getLongTermInsights(healthId: string, limit: number = 10): Promise<LongTermCorrelation[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      const sql = `
        SELECT *
        FROM flo_health.long_term_correlations
        WHERE health_id = {healthId:String}
          AND is_actionable = 1
        ORDER BY confidence_level DESC, abs(effect_size_pct) DESC
        LIMIT {limit:UInt32}
      `;

      const rows = await clickhouse.query<any>(sql, { healthId, limit });

      return rows.map(r => ({
        correlationId: r.correlation_id,
        healthId: r.health_id,
        discoveredAt: new Date(r.discovered_at),
        behaviorType: r.behavior_type,
        behaviorDescription: r.behavior_description,
        outcomeType: r.outcome_type,
        outcomeDescription: r.outcome_description,
        effectDirection: r.effect_direction,
        effectSizePct: r.effect_size_pct,
        effectSizeAbsolute: r.effect_size_absolute,
        confidenceLevel: r.confidence_level,
        pValue: r.p_value,
        sampleSizeBehavior: r.sample_size_behavior,
        sampleSizeControl: r.sample_size_control,
        timeRangeMonths: r.time_range_months,
        statisticalTest: r.statistical_test,
        cohortDefinition: r.cohort_definition,
        controlDefinition: r.control_definition,
        confoundersControlled: r.confounders_controlled || [],
        isActionable: r.is_actionable === 1,
        naturalLanguageInsight: r.natural_language_insight,
      }));
    } catch (error) {
      logger.error('[CorrelationEngine] Get insights error:', error);
      return [];
    }
  }

  async runFullAnalysis(healthId: string, lookbackMonths: number = 6): Promise<{
    behaviorEvents: number;
    weeklyCohorts: number;
    weeklyOutcomes: number;
    correlationsFound: number;
  }> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - lookbackMonths);
    const endDate = new Date();

    const behaviorEvents = await this.extractBehaviorEvents(
      healthId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    const weeklyCohorts = await this.buildWeeklyCohorts(healthId, lookbackMonths);
    const weeklyOutcomes = await this.buildWeeklyOutcomes(healthId, lookbackMonths);
    const correlations = await this.discoverCorrelations(healthId);

    return {
      behaviorEvents,
      weeklyCohorts,
      weeklyOutcomes,
      correlationsFound: correlations.length,
    };
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const m = this.mean(values);
    const squaredDiffs = values.map(v => (v - m) ** 2);
    return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
  }

  /**
   * Improved Mann-Whitney U test with:
   * - Proper tie correction
   * - Continuity correction for small samples
   * - Minimum sample size validation
   * - Two-tailed p-value calculation
   */
  private mannWhitneyU(group1: number[], group2: number[]): { pValue: number; significant: boolean; effectSize: number } {
    const n1 = group1.length;
    const n2 = group2.length;
    const N = n1 + n2;
    
    // Require minimum sample sizes for reliable results
    const MIN_SAMPLE_SIZE = 5;
    if (n1 < MIN_SAMPLE_SIZE || n2 < MIN_SAMPLE_SIZE) {
      return { pValue: 1, significant: false, effectSize: 0 };
    }

    // Combine and sort with original group markers
    const combined = [
      ...group1.map(v => ({ value: v, group: 1 as const })),
      ...group2.map(v => ({ value: v, group: 2 as const })),
    ].sort((a, b) => a.value - b.value);

    // Assign ranks with proper tie handling
    const ranks: number[] = new Array(N);
    let tieCorrection = 0;
    let i = 0;
    
    while (i < N) {
      let j = i;
      // Find all tied values
      while (j < N - 1 && combined[j + 1].value === combined[i].value) {
        j++;
      }
      const tieSize = j - i + 1;
      // Average rank for tied values
      const avgRank = (2 * i + tieSize + 1) / 2;
      
      for (let k = i; k <= j; k++) {
        ranks[k] = avgRank;
      }
      
      // Accumulate tie correction factor
      if (tieSize > 1) {
        tieCorrection += (tieSize * tieSize * tieSize - tieSize);
      }
      
      i = j + 1;
    }

    // Calculate rank sum for group 1
    let R1 = 0;
    for (let idx = 0; idx < N; idx++) {
      if (combined[idx].group === 1) {
        R1 += ranks[idx];
      }
    }

    // Calculate U statistics
    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U2 = n1 * n2 - U1;
    const U = Math.min(U1, U2);

    // Calculate effect size (rank-biserial correlation, ranges from -1 to 1)
    const effectSize = 1 - (2 * U) / (n1 * n2);

    // Expected value of U
    const meanU = (n1 * n2) / 2;
    
    // Standard deviation with tie correction
    const baseVariance = (n1 * n2 * (N + 1)) / 12;
    const tieAdjustment = (n1 * n2 * tieCorrection) / (12 * N * (N - 1));
    const stdU = Math.sqrt(baseVariance - tieAdjustment);
    
    if (stdU === 0) {
      return { pValue: 1, significant: false, effectSize: 0 };
    }

    // Z-score with continuity correction for small samples
    const continuityCorrection = (N < 20) ? 0.5 : 0;
    const z = (Math.abs(U - meanU) - continuityCorrection) / stdU;

    // Two-tailed p-value
    const pValue = 2 * (1 - this.normalCDF(z));

    return {
      pValue: Math.max(0, Math.min(1, pValue)),
      significant: pValue < 0.05 && Math.abs(effectSize) >= 0.2, // Require medium effect size
      effectSize,
    };
  }

  private normalCDF(z: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private generateNaturalLanguageInsight(
    behaviorDesc: string,
    outcomeName: string,
    effectPct: number,
    effectAbs: number,
    unit: string,
    months: number,
    behaviorN: number,
    controlN: number
  ): string {
    const direction = effectPct > 0 ? 'more' : 'less';
    const absEffectPct = Math.abs(effectPct).toFixed(1);
    const absEffectVal = Math.abs(effectAbs).toFixed(1);

    return `Over the last ${months} months, during ${behaviorDesc}, you averaged ${absEffectPct}% ${direction} ${outcomeName} (${absEffectVal} ${unit}) compared to other weeks. Based on ${behaviorN} weeks with this behavior vs ${controlN} control weeks.`;
  }
}

export const correlationEngine = new ClickHouseCorrelationEngine();
