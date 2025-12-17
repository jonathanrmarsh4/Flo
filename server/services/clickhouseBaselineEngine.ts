import { clickhouse, isClickHouseEnabled, initializeClickHouse } from './clickhouseService';
import { getHealthId } from './supabaseHealthStorage';
import { correlationEngine } from './clickhouseCorrelationEngine';
import { getMLSettings } from './behaviorAttributionEngine';
import { createLogger } from '../utils/logger';
import { randomUUID } from 'crypto';

const logger = createLogger('ClickHouseML');

// Rate limiting for anomaly detection to prevent log spam
// Only run detection once per healthId per 30 minutes (from any caller)
const anomalyDetectionCooldowns = new Map<string, number>();
const ANOMALY_DETECTION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Metrics that are ALREADY deviation values (e.g., skin_temp_deviation_c)
// These use ABSOLUTE thresholds in their native units, NOT percentage deviation
const ABSOLUTE_THRESHOLD_METRICS = new Set([
  'wrist_temperature_deviation',
  'wrist_temp_deviation_c',
  'skin_temp_deviation_c',
  'skin_temp_trend_deviation_c',
  'body_temperature_deviation',
]);

// Maximum physiologically plausible values - values beyond these are sensor errors
const SENSOR_ERROR_THRESHOLDS: Record<string, number> = {
  wrist_temperature_deviation: 2.5,  // Max 2.5°C deviation is plausible (high fever)
  wrist_temp_deviation_c: 2.5,
  skin_temp_deviation_c: 2.5,
  skin_temp_trend_deviation_c: 2.5,
  body_temperature_deviation: 3.0,   // Body temp can vary more during illness
};

const METRIC_THRESHOLDS: Record<string, {
  zScoreThreshold: number;
  percentageThreshold: number;  // For absolute threshold metrics, this is the ABSOLUTE value threshold
  direction: 'both' | 'high' | 'low';
  severity: { moderate: number; high: number };  // For absolute metrics, these are absolute values too
}> = {
  hrv_ms: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  resting_heart_rate_bpm: {
    zScoreThreshold: 1.5,
    percentageThreshold: 8,
    direction: 'both',
    severity: { moderate: 8, high: 15 },
  },
  // Temperature deviation metrics use ABSOLUTE thresholds in °C
  // A deviation of 0.5°C is significant, 1.0°C is high
  wrist_temperature_deviation: {
    zScoreThreshold: 2.0,
    percentageThreshold: 0.4,  // Alert if deviation > 0.4°C (ABSOLUTE, not percentage)
    direction: 'high',
    severity: { moderate: 0.4, high: 0.7 },  // Absolute °C values
  },
  wrist_temp_deviation_c: {
    zScoreThreshold: 2.0,
    percentageThreshold: 0.4,
    direction: 'high',
    severity: { moderate: 0.4, high: 0.7 },
  },
  skin_temp_deviation_c: {
    zScoreThreshold: 2.0,
    percentageThreshold: 0.4,
    direction: 'high',
    severity: { moderate: 0.4, high: 0.7 },
  },
  skin_temp_trend_deviation_c: {
    zScoreThreshold: 2.0,
    percentageThreshold: 0.4,
    direction: 'high',
    severity: { moderate: 0.4, high: 0.7 },
  },
  body_temperature_deviation: {
    zScoreThreshold: 2.0,
    percentageThreshold: 0.5,  // Body temp deviation may vary more than wrist
    direction: 'high',
    severity: { moderate: 0.5, high: 0.8 },
  },
  respiratory_rate_bpm: {
    zScoreThreshold: 1.5,
    percentageThreshold: 10,
    direction: 'high',
    severity: { moderate: 10, high: 20 },
  },
  oxygen_saturation_pct: {
    zScoreThreshold: 1.5,
    percentageThreshold: 2,
    direction: 'low',
    severity: { moderate: 2, high: 4 },
  },
  steps: {
    zScoreThreshold: 2.0,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  active_energy: {
    zScoreThreshold: 2.0,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  sleep_duration_min: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  deep_sleep_min: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  rem_sleep_min: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  core_sleep_min: {
    zScoreThreshold: 2.0,
    percentageThreshold: 25,
    direction: 'both',
    severity: { moderate: 25, high: 40 },
  },
  sleep_efficiency_pct: {
    zScoreThreshold: 1.5,
    percentageThreshold: 10,
    direction: 'low',
    severity: { moderate: 10, high: 20 },
  },
  sleep_fragmentation: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'high',
    severity: { moderate: 30, high: 50 },
  },
  deep_sleep_pct: {
    zScoreThreshold: 1.5,
    percentageThreshold: 25,
    direction: 'both',  // Changed to 'both' - detect high deep sleep % too
    severity: { moderate: 25, high: 40 },
  },
  rem_sleep_pct: {
    zScoreThreshold: 1.5,
    percentageThreshold: 25,
    direction: 'both',  // Changed to 'both' - detect high REM % too
    severity: { moderate: 25, high: 40 },
  },
  sleep_hrv_ms: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  waso_min: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'high',
    severity: { moderate: 30, high: 50 },
  },
  glucose: {
    zScoreThreshold: 2.0,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 30 },
  },
  cgm_glucose: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 40 },
  },
  cgm_hypo: {
    zScoreThreshold: 1.0,
    percentageThreshold: 10,
    direction: 'low',
    severity: { moderate: 70, high: 54 },
  },
  cgm_hyper: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'high',
    severity: { moderate: 180, high: 250 },
  },
  cgm_variability: {
    zScoreThreshold: 2.0,
    percentageThreshold: 25,
    direction: 'high',
    severity: { moderate: 25, high: 36 },
  },
  time_in_range: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'low',
    severity: { moderate: 15, high: 25 },
  },
  // ========== ACTIVITY & FITNESS ==========
  exercise_minutes: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  stand_hours: {
    zScoreThreshold: 1.5,
    percentageThreshold: 25,
    direction: 'both',
    severity: { moderate: 25, high: 40 },
  },
  flights_climbed: {
    zScoreThreshold: 2.0,
    percentageThreshold: 40,
    direction: 'both',
    severity: { moderate: 40, high: 60 },
  },
  distance_km: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  basal_energy: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  vo2_max: {
    zScoreThreshold: 1.5,
    percentageThreshold: 10,
    direction: 'both',
    severity: { moderate: 10, high: 20 },
  },
  // ========== BODY COMPOSITION ==========
  weight_kg: {
    zScoreThreshold: 1.5,
    percentageThreshold: 3,
    direction: 'both',
    severity: { moderate: 3, high: 5 },
  },
  body_fat_pct: {
    zScoreThreshold: 1.5,
    percentageThreshold: 10,
    direction: 'both',
    severity: { moderate: 10, high: 20 },
  },
  lean_mass_kg: {
    zScoreThreshold: 1.5,
    percentageThreshold: 5,
    direction: 'both',
    severity: { moderate: 5, high: 10 },
  },
  bmi: {
    zScoreThreshold: 1.5,
    percentageThreshold: 5,
    direction: 'both',
    severity: { moderate: 5, high: 10 },
  },
  waist_circumference: {
    zScoreThreshold: 1.5,
    percentageThreshold: 5,
    direction: 'both',
    severity: { moderate: 5, high: 10 },
  },
  // ========== GAIT & MOBILITY ==========
  walking_speed: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  walking_step_length: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  walking_double_support: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  walking_asymmetry: {
    zScoreThreshold: 1.5,
    percentageThreshold: 25,
    direction: 'high',
    severity: { moderate: 25, high: 40 },
  },
  walking_steadiness: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'low',
    severity: { moderate: 15, high: 25 },
  },
  six_minute_walk_distance: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  stair_ascent_speed: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  stair_descent_speed: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  // ========== NUTRITION ==========
  calories: {
    zScoreThreshold: 1.5,
    percentageThreshold: 25,
    direction: 'both',
    severity: { moderate: 25, high: 40 },
  },
  protein: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  carbohydrates: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  fat_total: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  fiber: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  sugar: {
    zScoreThreshold: 1.5,
    percentageThreshold: 35,
    direction: 'both',
    severity: { moderate: 35, high: 60 },
  },
  sodium: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  caffeine: {
    zScoreThreshold: 1.5,
    percentageThreshold: 40,
    direction: 'both',
    severity: { moderate: 40, high: 70 },
  },
  water: {
    zScoreThreshold: 1.5,
    percentageThreshold: 30,
    direction: 'both',
    severity: { moderate: 30, high: 50 },
  },
  // ========== VITALS ==========
  body_temperature: {
    zScoreThreshold: 1.5,
    percentageThreshold: 2,
    direction: 'both',
    severity: { moderate: 2, high: 4 },
  },
  walking_heart_rate: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  // ========== MINDFULNESS & RECOVERY ==========
  mindfulness_minutes: {
    zScoreThreshold: 1.5,
    percentageThreshold: 40,
    direction: 'both',
    severity: { moderate: 40, high: 60 },
  },
  readiness_score: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  recovery_score: {
    zScoreThreshold: 1.5,
    percentageThreshold: 15,
    direction: 'both',
    severity: { moderate: 15, high: 25 },
  },
  // ========== SUBJECTIVE METRICS ==========
  energy_level: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  mental_clarity: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  mood: {
    zScoreThreshold: 1.5,
    percentageThreshold: 20,
    direction: 'both',
    severity: { moderate: 20, high: 35 },
  },
  stress_level: {
    zScoreThreshold: 1.5,
    percentageThreshold: 25,
    direction: 'high',
    severity: { moderate: 25, high: 40 },
  },
};

const CGM_ABSOLUTE_THRESHOLDS = {
  hypoglycemia: {
    moderate: 70,
    severe: 54,
    urgent: 40,
  },
  hyperglycemia: {
    moderate: 180,
    severe: 250,
    urgent: 400,
  },
  rateOfChange: {
    rising: 2,
    risingFast: 3,
    falling: -2,
    fallingFast: -3,
  },
  targetRange: {
    low: 70,
    high: 180,
  },
};

export interface BaselineResult {
  metricType: string;
  windowDays: number;
  meanValue: number;
  stdDev: number | null;
  minValue: number | null;
  maxValue: number | null;
  sampleCount: number;
  percentile10: number | null;
  percentile25: number | null;
  percentile75: number | null;
  percentile90: number | null;
}

export interface AnomalyResult {
  anomalyId: string;
  metricType: string;
  currentValue: number;
  baselineValue: number;
  deviationPct: number;
  zScore: number | null;
  direction: 'above' | 'below';
  severity: 'low' | 'moderate' | 'high';
  patternFingerprint: string | null;
  relatedMetrics: Record<string, any> | null;
  modelConfidence: number;
  detectedAt: string | null;
}

export interface MLModelStats {
  modelId: string;
  healthId: string;
  modelType: string;
  trainedAt: Date;
  sampleCount: number;
  accuracy: number;
  precision: number;
  recall: number;
}

/**
 * ============================================================================
 * UNIFIED METRIC ANALYSIS - SINGLE SOURCE OF TRUTH
 * ============================================================================
 * 
 * This interface is the canonical output format for all baseline/anomaly data.
 * All downstream consumers (insightsEngineV2, ragInsightGenerator, anomalyDetectionEngine)
 * should use this instead of calculating their own baselines.
 * 
 * Step 1 of ML Architecture Refactor:
 * - getMetricsForAnalysis() returns this unified format
 * - Downstream files consume this, not raw data
 * - Eliminates "shadow math" where different files calculate different baselines
 */
export interface MetricAnalysis {
  metric: string;
  
  // Current state
  currentValue: number;
  currentDate: string;
  sampleCountRecent: number;  // samples in lookback period (e.g., 48h)
  
  // Baseline (from ClickHouse - THE source of truth)
  baseline: {
    mean: number;
    stdDev: number | null;
    min: number | null;
    max: number | null;
    sampleCount: number;
    windowDays: number;
    percentile10: number | null;
    percentile25: number | null;
    percentile75: number | null;
    percentile90: number | null;
  };
  
  // Deviation analysis (calculated from baseline)
  deviation: {
    absolute: number;           // currentValue - baseline.mean
    percentage: number;         // ((current - mean) / mean) * 100
    zScore: number | null;      // (current - mean) / stdDev
    direction: 'above' | 'below' | 'normal';
    isSignificant: boolean;     // exceeds threshold for this metric
  };
  
  // Trend context (Step 2: for ragInsightGenerator compatibility)
  trend: {
    consecutiveDaysAbove: number;    // days in a row above baseline
    consecutiveDaysBelow: number;    // days in a row below baseline
    weeklyAverage: number | null;    // 7-day average (for RAG activity baselines)
    monthlyAverage: number | null;   // 30-day average (for RAG activity baselines)
    percentBelowBaseline: number | null;  // how far below baseline (for activity insights)
    suggestedTarget: number | null;  // recommended target value (for actionable insights)
  };
  
  // Freshness classification (Step 2: for anomalyDetectionEngine compatibility)
  freshness: {
    category: 'green' | 'yellow' | 'red';  // green=<30d, yellow=30-90d, red=>90d
    lastUpdatedDays: number;               // days since last data point
    halfLifeDays: number;                  // expected update frequency for this metric
  };
  
  // Clinical interpretation
  interpretation: {
    severity: 'normal' | 'low' | 'moderate' | 'high';
    thresholdUsed: {
      zScoreThreshold: number;
      percentageThreshold: number;
      direction: 'both' | 'high' | 'low';
    } | null;
    clinicalContext: string | null;  // brief clinical interpretation text
  };
  
  // Data quality indicators
  dataQuality: {
    hasEnoughData: boolean;     // sampleCount >= minRequired (3)
    isStale: boolean;           // currentDate is > 24h old
    confidenceScore: number;    // 0-1 based on sample count & recency
  };
}

/**
 * Summary response from getMetricsForAnalysis()
 */
export interface MetricsAnalysisResult {
  healthId: string;
  analysisTimestamp: string;
  windowDays: number;
  lookbackHours: number;
  
  // All metrics with their analysis
  metrics: MetricAnalysis[];
  
  // Pre-filtered views for convenience
  anomalies: MetricAnalysis[];           // only significant deviations
  highSeverity: MetricAnalysis[];        // severity = 'high'
  
  // Pattern detection (multi-metric)
  patterns: Array<{
    patternType: string;
    confidence: number;
    involvedMetrics: string[];
    description: string;
  }>;
  
  // Data quality summary
  dataQualitySummary: {
    totalMetrics: number;
    metricsWithEnoughData: number;
    averageConfidence: number;
  };
}

export class ClickHouseBaselineEngine {
  private initialized = false;

  async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;
    if (!isClickHouseEnabled()) {
      logger.warn('[ClickHouseML] ClickHouse not enabled');
      return false;
    }

    try {
      const success = await initializeClickHouse();
      this.initialized = success;
      return success;
    } catch (error) {
      logger.error('[ClickHouseML] Initialization failed:', error);
      return false;
    }
  }

  // Full history constant: 10 years (3650 days) covers all possible user data
  static readonly FULL_HISTORY_DAYS = 3650;

  // Track recent sync attempts to prevent repeated full syncs for users with no data
  // Map: healthId -> { timestamp: Date, recordsSynced: number }
  private syncAttempts = new Map<string, { timestamp: Date; recordsSynced: number }>();
  private readonly SYNC_COOLDOWN_HOURS = 24; // Don't retry full sync for 24 hours

  /**
   * Check if we've recently attempted a full sync for this user.
   * Returns true if sync was attempted within the cooldown period.
   */
  hasRecentSyncAttempt(healthId: string): boolean {
    const attempt = this.syncAttempts.get(healthId);
    if (!attempt) return false;
    
    const hoursSinceAttempt = (Date.now() - attempt.timestamp.getTime()) / (1000 * 60 * 60);
    return hoursSinceAttempt < this.SYNC_COOLDOWN_HOURS;
  }

  /**
   * Record that we attempted a full sync for this user.
   */
  recordSyncAttempt(healthId: string, recordsSynced: number): void {
    this.syncAttempts.set(healthId, { timestamp: new Date(), recordsSynced });
    logger.debug(`[ClickHouseML] Recorded sync attempt for ${healthId}: ${recordsSynced} records`);
  }

  /**
   * Clear sync attempt record for a user (use when forcing a retry).
   */
  clearSyncAttempt(healthId: string): void {
    this.syncAttempts.delete(healthId);
  }

  /**
   * Check if a user has any data in ClickHouse health_metrics table.
   * Used to determine if full history sync is needed.
   */
  async hasDataForUser(healthId: string): Promise<boolean> {
    if (!await this.ensureInitialized()) return false;
    
    try {
      const client = getClickHouseClient();
      if (!client) return false;
      
      const result = await client.query({
        query: `SELECT count() as cnt FROM flo_health.health_metrics WHERE health_id = {healthId:String} LIMIT 1`,
        query_params: { healthId },
        format: 'JSONEachRow',
      });
      
      const rows = await result.json() as { cnt: number }[];
      return rows.length > 0 && rows[0].cnt > 0;
    } catch (error) {
      logger.error(`[ClickHouseML] Error checking data for ${healthId}:`, error);
      return false;
    }
  }

  async syncHealthDataFromSupabase(healthId: string, daysBack: number | null = 30): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      // If daysBack is null, sync all available data (full history)
      let query = supabase
        .from('user_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .order('local_date', { ascending: true });

      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        query = query.gte('local_date', startDateStr);
      }

      const { data: metrics, error } = await query;

      if (error) {
        logger.error('[ClickHouseML] Error fetching from Supabase:', error);
        return 0;
      }

      if (!metrics || metrics.length === 0) {
        logger.debug(`[ClickHouseML] No metrics to sync for ${healthId}`);
        return 0;
      }

      // Comprehensive mapping of ALL health metrics from user_daily_metrics
      // IMPORTANT: Use canonical ClickHouse metric type names (with units suffix)
      const metricMappings: Record<string, string> = {
        // Core HealthKit metrics - use canonical names with unit suffixes
        hrv_ms: 'hrv_ms',
        resting_hr_bpm: 'resting_heart_rate_bpm',
        // Steps: Use steps_normalized (deduplicated step count with Watch > iPhone priority)
        // steps_raw_sum is often NULL because iOS primarily sends steps_normalized
        steps_normalized: 'steps',
        active_energy_kcal: 'active_energy',
        sleep_hours: 'sleep_duration_min', // Note: value needs *60 conversion, handled in sync
        exercise_minutes: 'exercise_minutes',
        weight_kg: 'weight_kg',
        bmi: 'bmi',
        // Extended vital signs
        walking_hr_avg_bpm: 'walking_heart_rate_bpm',
        oxygen_saturation_pct: 'oxygen_saturation_pct',
        respiratory_rate_bpm: 'respiratory_rate_bpm',
        body_temp_celsius: 'body_temperature_c',
        basal_energy_kcal: 'basal_energy',
        dietary_water_ml: 'water_intake_ml',
        // Wrist temperature
        wrist_temp_baseline_c: 'wrist_temperature_baseline',
        wrist_temp_deviation_c: 'wrist_temperature_deviation',
        // Sleep metrics from user_daily_metrics (hours-based summary)
        // NOTE: Detailed sleep metrics come from sleep_nights table (minutes-based, more accurate)
        // We intentionally EXCLUDE time_in_bed_hours here to avoid unit mismatch with time_in_bed_min from sleep_nights
        // The sleep_nights table syncs deep_sleep, rem_sleep, core_sleep, time_in_bed in MINUTES
        deep_sleep_hours: 'deep_sleep_hours',  // Keep as hours to distinguish from minutes
        rem_sleep_hours: 'rem_sleep_hours',    // Keep as hours to distinguish from minutes
        core_sleep_hours: 'core_sleep_hours',  // Keep as hours to distinguish from minutes
        sleep_awakenings: 'sleep_awakenings',
        // time_in_bed_hours: EXCLUDED - use time_in_bed from sleep_nights (in minutes) instead
        sleep_latency_min: 'sleep_latency_min',
        // Body composition
        body_fat_pct: 'body_fat_pct',
        lean_mass_kg: 'lean_mass_kg',
        // Activity metrics
        stand_hours: 'stand_hours',
        flights_climbed: 'flights_climbed',
        distance_km: 'distance_km',
        // Mindfulness
        mindfulness_minutes: 'mindfulness_minutes',
      };

      // First, get existing records for this health_id in the date range to avoid duplicates
      const existingDates = new Set<string>();
      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        
        try {
          const existingQuery = `
            SELECT DISTINCT local_date, metric_type 
            FROM health_metrics 
            WHERE health_id = {healthId:String} 
            AND local_date >= {startDate:String}
          `;
          const existingResult = await clickhouse.query(existingQuery, {
            healthId,
            startDate: startDateStr,
          });
          
          for (const record of existingResult) {
            existingDates.add(`${record.local_date}:${record.metric_type}`);
          }
          logger.debug(`[ClickHouseML] Found ${existingDates.size} existing metric-date combinations`);
        } catch (err) {
          logger.warn('[ClickHouseML] Could not check existing records, proceeding with insert:', err);
        }
      }

      const rows: any[] = [];

      for (const row of metrics) {
        for (const [dbField, metricType] of Object.entries(metricMappings)) {
          const value = row[dbField];
          if (value !== null && value !== undefined && !isNaN(value)) {
            // Skip if this metric-date combination already exists in ClickHouse
            const key = `${row.local_date}:${metricType}`;
            if (existingDates.has(key)) {
              continue;
            }
            
            rows.push({
              health_id: healthId,
              metric_type: metricType,
              value: Number(value),
              recorded_at: new Date(row.local_date + 'T12:00:00Z').toISOString(),
              local_date: row.local_date,
              source: 'healthkit',
            });
          }
        }
      }

      if (rows.length > 0) {
        await clickhouse.insert('health_metrics', rows);
        logger.info(`[ClickHouseML] Synced ${rows.length} NEW metrics for ${healthId} (skipped ${existingDates.size} existing)`);
      } else {
        logger.debug(`[ClickHouseML] No new metrics to sync for ${healthId} (all ${existingDates.size} already exist)`);
      }

      // Also sync detailed sleep components from sleep_nights table
      const sleepRows = await this.syncSleepComponentsFromSupabase(healthId, daysBack);
      
      return rows.length + sleepRows;
    } catch (error) {
      logger.error('[ClickHouseML] Sync error:', error);
      return 0;
    }
  }

  /**
   * Sync detailed sleep components from sleep_nights table to ClickHouse.
   * This provides granular sleep stage data (deep, REM, core) for ML pattern detection.
   */
  async syncSleepComponentsFromSupabase(healthId: string, daysBack: number | null = 30): Promise<number> {
    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('sleep_nights')
        .select('*')
        .eq('health_id', healthId)
        .order('sleep_date', { ascending: true });

      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        query = query.gte('sleep_date', startDateStr);
      }

      const { data: sleepNights, error } = await query;

      if (error) {
        logger.error('[ClickHouseML] Error fetching sleep_nights from Supabase:', error);
        return 0;
      }

      if (!sleepNights || sleepNights.length === 0) {
        logger.debug(`[ClickHouseML] No sleep_nights to sync for ${healthId}`);
        return 0;
      }

      // Map sleep_nights fields to ClickHouse metric types
      // NOTE: Supabase returns snake_case field names directly from the table
      // IMPORTANT: Values must be canonical ClickHouse metric types (see server/services/metrics/constants.ts)
      const sleepMappings: Record<string, string> = {
        'deep_sleep_min': 'deep_sleep_min',           // Deep sleep in minutes
        'rem_sleep_min': 'rem_sleep_min',             // REM sleep in minutes  
        'core_sleep_min': 'core_sleep_min',           // Light/Core sleep in minutes
        'total_sleep_min': 'sleep_duration_min',      // Total sleep in minutes
        'sleep_efficiency_pct': 'sleep_efficiency_pct', // Sleep efficiency percentage
        'num_awakenings': 'sleep_awakenings',         // Number of awakenings
        'fragmentation_index': 'sleep_fragmentation', // Sleep fragmentation index
        'waso_min': 'waso_min',                       // Wake after sleep onset
        'sleep_latency_min': 'sleep_latency_min',     // Time to fall asleep
        'hrv_ms': 'sleep_hrv_ms',                     // HRV during sleep
        'deep_pct': 'deep_sleep_pct',                 // Deep sleep percentage
        'rem_pct': 'rem_sleep_pct',                   // REM sleep percentage
        'core_pct': 'core_sleep_pct',                 // Core sleep percentage
        'time_in_bed_min': 'time_in_bed_min',         // Time in bed
      };

      const rows: any[] = [];

      for (const night of sleepNights) {
        // Construct proper UTC timestamp from sleep_date (YYYY-MM-DD format)
        const sleepDateStr = night.sleep_date;
        const recordedAt = sleepDateStr ? new Date(`${sleepDateStr}T08:00:00Z`).toISOString() : null;
        
        if (!recordedAt || isNaN(new Date(recordedAt).getTime())) {
          logger.warn(`[ClickHouseML] Invalid sleep_date for night: ${sleepDateStr}`);
          continue;
        }
        
        // Use actual source from database (oura, healthkit, etc.) or default to healthkit_sleep
        const nightSource = night.source || 'healthkit_sleep';
        
        for (const [dbField, metricType] of Object.entries(sleepMappings)) {
          const rawValue = night[dbField];
          // Handle both numeric and string values (Supabase may return decimal strings)
          if (rawValue === null || rawValue === undefined) continue;
          
          const numValue = typeof rawValue === 'string' ? parseFloat(rawValue) : Number(rawValue);
          if (isNaN(numValue)) continue;
          
          rows.push({
            health_id: healthId,
            metric_type: metricType,
            value: numValue,
            recorded_at: recordedAt,
            local_date: sleepDateStr,
            source: nightSource,
          });
        }
      }

      if (rows.length > 0) {
        await clickhouse.insert('health_metrics', rows);
        logger.info(`[ClickHouseML] Synced ${rows.length} sleep component metrics for ${healthId} from ${sleepNights.length} nights`);
      }

      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Sleep sync error:', error);
      return 0;
    }
  }

  async calculateBaselines(healthId: string, windowDays: number = 7): Promise<BaselineResult[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      // Minimum value thresholds for sleep metrics to exclude naps and partial syncs
      // These values represent 4 hours (240 min) as the minimum for "real" overnight sleep
      const sleepMinimumThresholds: Record<string, number> = {
        'time_in_bed_min': 240,       // Minimum 4 hours to count as overnight sleep
        'sleep_duration_min': 180,    // Minimum 3 hours actual sleep
        'total_sleep_min': 180,       // Minimum 3 hours actual sleep
        'deep_sleep_min': 15,         // Minimum 15 min deep sleep (excludes naps with no deep sleep)
        'rem_sleep_min': 15,          // Minimum 15 min REM sleep
        'core_sleep_min': 60,         // Minimum 1 hour core sleep
      };

      // Build conditional WHERE clause for minimum thresholds
      // For sleep metrics, exclude values below threshold; for all others, include everything
      // Use IQR-based outlier filtering: exclude values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
      // This uses a subquery to first calculate percentiles, then filter outliers before averaging
      const sql = `
        WITH percentiles AS (
          SELECT
            metric_type,
            quantile(0.25)(value) as q1,
            quantile(0.75)(value) as q3
          FROM flo_health.health_metrics
          WHERE health_id = {healthId:String}
            AND recorded_at >= now() - INTERVAL {windowDays:UInt8} DAY
            AND (
              (metric_type = 'time_in_bed_min' AND value >= 240) OR
              (metric_type = 'sleep_duration_min' AND value >= 180) OR
              (metric_type = 'total_sleep_min' AND value >= 180) OR
              (metric_type = 'deep_sleep_min' AND value >= 15) OR
              (metric_type = 'rem_sleep_min' AND value >= 15) OR
              (metric_type = 'core_sleep_min' AND value >= 60) OR
              (metric_type NOT IN ('time_in_bed_min', 'sleep_duration_min', 'total_sleep_min', 'deep_sleep_min', 'rem_sleep_min', 'core_sleep_min'))
            )
          GROUP BY metric_type
        )
        SELECT
          m.metric_type,
          avg(m.value) as mean_value,
          stddevPop(m.value) as std_dev,
          min(m.value) as min_value,
          max(m.value) as max_value,
          count() as sample_count,
          quantile(0.10)(m.value) as percentile_10,
          quantile(0.25)(m.value) as percentile_25,
          quantile(0.75)(m.value) as percentile_75,
          quantile(0.90)(m.value) as percentile_90
        FROM flo_health.health_metrics m
        INNER JOIN percentiles p ON m.metric_type = p.metric_type
        WHERE m.health_id = {healthId:String}
          AND m.recorded_at >= now() - INTERVAL {windowDays:UInt8} DAY
          -- Filter out naps/partial syncs for sleep metrics
          AND (
            (m.metric_type = 'time_in_bed_min' AND m.value >= 240) OR
            (m.metric_type = 'sleep_duration_min' AND m.value >= 180) OR
            (m.metric_type = 'total_sleep_min' AND m.value >= 180) OR
            (m.metric_type = 'deep_sleep_min' AND m.value >= 15) OR
            (m.metric_type = 'rem_sleep_min' AND m.value >= 15) OR
            (m.metric_type = 'core_sleep_min' AND m.value >= 60) OR
            (m.metric_type NOT IN ('time_in_bed_min', 'sleep_duration_min', 'total_sleep_min', 'deep_sleep_min', 'rem_sleep_min', 'core_sleep_min'))
          )
          -- IQR-based outlier filtering: exclude values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
          -- When IQR is negligible (< 0.01), skip filtering to avoid floating-point issues
          AND (
            (p.q3 - p.q1) < 0.01 OR (
              m.value >= p.q1 - 1.5 * (p.q3 - p.q1)
              AND m.value <= p.q3 + 1.5 * (p.q3 - p.q1)
            )
          )
        GROUP BY m.metric_type
        HAVING count() >= 3
      `;

      const rows = await clickhouse.query<{
        metric_type: string;
        mean_value: number;
        std_dev: number;
        min_value: number;
        max_value: number;
        sample_count: number;
        percentile_10: number;
        percentile_25: number;
        percentile_75: number;
        percentile_90: number;
      }>(sql, { healthId, windowDays });

      const results: BaselineResult[] = rows.map(r => ({
        metricType: r.metric_type,
        windowDays,
        meanValue: r.mean_value,
        stdDev: r.std_dev > 0 ? r.std_dev : null,
        minValue: r.min_value,
        maxValue: r.max_value,
        sampleCount: Number(r.sample_count),
        percentile10: r.percentile_10,
        percentile25: r.percentile_25,
        percentile75: r.percentile_75,
        percentile90: r.percentile_90,
      }));

      if (results.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const baselineRows = results.map(r => ({
          health_id: healthId,
          metric_type: r.metricType,
          baseline_date: today,
          window_days: windowDays,
          mean_value: r.meanValue,
          std_dev: r.stdDev || 0,
          min_value: r.minValue || 0,
          max_value: r.maxValue || 0,
          sample_count: r.sampleCount,
          percentile_10: r.percentile10 || 0,
          percentile_25: r.percentile25 || 0,
          percentile_75: r.percentile75 || 0,
          percentile_90: r.percentile90 || 0,
        }));

        await clickhouse.insert('metric_baselines', baselineRows);
      }

      logger.info(`[ClickHouseML] Calculated ${results.length} baselines for ${healthId}`);
      return results;
    } catch (error) {
      logger.error('[ClickHouseML] Baseline calculation error:', error);
      return [];
    }
  }

  async detectAnomalies(
    healthId: string,
    options: { windowDays?: number; lookbackHours?: number; bypassRateLimit?: boolean } = {}
  ): Promise<AnomalyResult[]> {
    const { windowDays = 7, lookbackHours = 48, bypassRateLimit = false } = options;

    // Rate limit anomaly detection to prevent log spam
    // Only bypass for admin-initiated calls or scheduled jobs
    if (!bypassRateLimit) {
      const lastRun = anomalyDetectionCooldowns.get(healthId);
      const now = Date.now();
      
      if (lastRun && (now - lastRun) < ANOMALY_DETECTION_COOLDOWN_MS) {
        // Return empty silently - don't spam logs
        return [];
      }
      anomalyDetectionCooldowns.set(healthId, now);
    }

    if (!await this.ensureInitialized()) return [];

    try {
      // Get active suppressions - metrics the user has flagged as having data quality issues
      const suppressedMetrics = await this.getActiveSuppressions(healthId);
      if (suppressedMetrics.size > 0) {
        logger.debug(`[ClickHouseML] Active suppressions for ${healthId}: ${Array.from(suppressedMetrics).join(', ')}`);
      }

      const baselines = await this.calculateBaselines(healthId, windowDays);
      const baselineMap = new Map(baselines.map(b => [b.metricType, b]));

      const sql = `
        SELECT
          metric_type,
          avg(value) as current_value,
          count() as sample_count
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL {lookbackHours:UInt32} HOUR
        GROUP BY metric_type
        HAVING count() >= 1
      `;

      const recentMetrics = await clickhouse.query<{
        metric_type: string;
        current_value: number;
        sample_count: number;
      }>(sql, { healthId, lookbackHours });

      const anomalies: AnomalyResult[] = [];

      // Fetch admin-configured ML sensitivity settings
      const mlSettings = await getMLSettings();
      
      // Default threshold for any metric not explicitly defined - opens up the system to ALL metrics
      // Uses admin-configured anomalyZScoreThreshold from ML Sensitivity Settings
      const DEFAULT_THRESHOLD = {
        zScoreThreshold: mlSettings.anomalyZScoreThreshold,
        percentageThreshold: 25,
        direction: 'both' as const,
        severity: { moderate: 25, high: 40 },
      };

      for (const metric of recentMetrics) {
        // Skip metrics that user has suppressed due to data quality issues
        if (suppressedMetrics.has(metric.metric_type)) {
          logger.debug(`[ClickHouseML] Skipping suppressed metric ${metric.metric_type} for ${healthId}`);
          continue;
        }
        const baseline = baselineMap.get(metric.metric_type);
        if (!baseline || baseline.sampleCount < 3) continue;

        // Use personalized thresholds if available, then explicit defaults, then global default
        const defaultThreshold = METRIC_THRESHOLDS[metric.metric_type] || DEFAULT_THRESHOLD;
        const personalizedThreshold = await this.getPersonalizedThreshold(healthId, metric.metric_type);
        
        // Use personalized if available, otherwise use defaults
        // IMPORTANT: Apply admin threshold as a MINIMUM - ensures admin sensitivity setting affects ALL metrics
        // Use Math.max so metric-specific thresholds can be MORE sensitive (lower) if needed
        const baseZScoreThreshold = personalizedThreshold.isPersonalized 
          ? personalizedThreshold.zScoreThreshold 
          : defaultThreshold.zScoreThreshold;
        
        const threshold = {
          ...defaultThreshold,
          zScoreThreshold: Math.max(mlSettings.anomalyZScoreThreshold, baseZScoreThreshold),
          percentageThreshold: personalizedThreshold.isPersonalized 
            ? personalizedThreshold.percentageThreshold 
            : defaultThreshold.percentageThreshold,
        };

        const deviation = metric.current_value - baseline.meanValue;
        const zScore = baseline.stdDev && baseline.stdDev > 0
          ? deviation / baseline.stdDev
          : null;
        const absZScore = zScore !== null ? Math.abs(zScore) : 0;
        
        // Check if this is an absolute threshold metric (already a deviation value)
        const isAbsoluteThresholdMetric = ABSOLUTE_THRESHOLD_METRICS.has(metric.metric_type);
        
        let isAnomaly = false;
        let deviationPct: number;
        
        if (isAbsoluteThresholdMetric) {
          // For deviation metrics, use ABSOLUTE value comparison, not percentage
          // The current_value IS the deviation (e.g., 0.6°C deviation from personal baseline)
          const absValue = Math.abs(metric.current_value);
          
          // Check for sensor errors - physiologically impossible values
          const sensorErrorThreshold = SENSOR_ERROR_THRESHOLDS[metric.metric_type];
          if (sensorErrorThreshold && absValue > sensorErrorThreshold) {
            logger.debug(`[ClickHouseML] Rejecting ${metric.metric_type} value ${metric.current_value}°C as sensor error (threshold: ${sensorErrorThreshold}°C)`);
            continue;
          }
          
          // For absolute metrics, percentageThreshold is actually the absolute threshold
          isAnomaly = absValue >= threshold.percentageThreshold ||
            (zScore !== null && absZScore >= threshold.zScoreThreshold);
          
          // Store the actual deviation value (not percentage) in deviationPct for these metrics
          // This is semantically clearer in logs/insights
          deviationPct = metric.current_value; // Store actual °C deviation
        } else {
          // For regular metrics, use percentage deviation from baseline
          deviationPct = baseline.meanValue !== 0 ? (deviation / baseline.meanValue) * 100 : 0;
          const absDeviationPct = Math.abs(deviationPct);
          
          isAnomaly = absDeviationPct >= threshold.percentageThreshold ||
            (zScore !== null && absZScore >= threshold.zScoreThreshold);
        }

        if (!isAnomaly) continue;

        const direction = deviation > 0 ? 'above' : 'below';
        if (threshold.direction === 'high' && direction === 'below') continue;
        if (threshold.direction === 'low' && direction === 'above') continue;

        let severity: 'low' | 'moderate' | 'high' = 'low';
        if (isAbsoluteThresholdMetric) {
          // For temperature deviation metrics, severity is based on absolute °C value
          const absValue = Math.abs(metric.current_value);
          if (absValue >= threshold.severity.high) severity = 'high';
          else if (absValue >= threshold.severity.moderate) severity = 'moderate';
        } else {
          // For regular metrics, severity is based on percentage deviation
          const absDeviationPct = Math.abs(deviationPct);
          if (absDeviationPct >= threshold.severity.high) severity = 'high';
          else if (absDeviationPct >= threshold.severity.moderate) severity = 'moderate';
        }

        const historicalAccuracy = await this.getPatternAccuracy(healthId, null);
        // Use admin-configured minimum confidence threshold, scale up based on historical accuracy
        const modelConfidence = Math.min(0.95, mlSettings.anomalyMinConfidence + (historicalAccuracy * 0.4));

        anomalies.push({
          anomalyId: randomUUID(),
          metricType: metric.metric_type,
          currentValue: metric.current_value,
          baselineValue: baseline.meanValue,
          deviationPct,
          zScore,
          direction,
          severity,
          patternFingerprint: null,
          relatedMetrics: null,
          modelConfidence,
          detectedAt: new Date().toISOString(),
        });
      }

      const patternedAnomalies = this.detectMultiMetricPatterns(anomalies);
      
      // First filter by admin-configured minimum confidence threshold
      const confidenceFilteredAnomalies = patternedAnomalies.filter(a => a.modelConfidence >= mlSettings.anomalyMinConfidence);
      
      // Filter isolated temperature anomalies that lack corroborating vital sign deviations
      // Skin/wrist temperature spikes can be data integrity issues (sensor placement, ambient temp, etc.)
      // Only alert for temperature anomalies when accompanied by at least one other vital sign change
      // that survives confidence filtering AND has medically consistent direction WITH meaningful deviation
      const temperatureMetrics = ['wrist_temperature_deviation', 'wrist_temp_deviation_c', 'skin_temp_deviation_c', 'skin_temp_trend_deviation_c', 'body_temperature', 'body_temperature_c'];
      
      // Find corroborating vitals with medically consistent directions for fever/illness
      // REQUIRE MEANINGFUL DEVIATION - not just barely crossing threshold
      // Minimum deviations for corroboration: HR +5%, RR +8%, HRV -10%, SpO2 -1.5%
      const CORROBORATION_MIN_DEVIATION: Record<string, number> = {
        resting_heart_rate_bpm: 5,
        respiratory_rate_bpm: 8,
        hrv_ms: 10,
        oxygen_saturation_pct: 1.5,
      };
      
      const corroboratingVitals: AnomalyResult[] = confidenceFilteredAnomalies.filter(a => {
        const minDeviation = CORROBORATION_MIN_DEVIATION[a.metricType];
        if (!minDeviation) return false;
        
        const absDeviation = Math.abs(a.deviationPct);
        
        // Check direction and minimum deviation
        if (a.metricType === 'resting_heart_rate_bpm' && a.direction === 'above' && absDeviation >= minDeviation) return true;
        if (a.metricType === 'respiratory_rate_bpm' && a.direction === 'above' && absDeviation >= minDeviation) return true;
        if (a.metricType === 'hrv_ms' && a.direction === 'below' && absDeviation >= minDeviation) return true;
        if (a.metricType === 'oxygen_saturation_pct' && a.direction === 'below' && absDeviation >= minDeviation) return true;
        return false;
      });
      
      const hasValidCorroboratingVital = corroboratingVitals.length > 0;
      
      // Build a map of temperature anomalies to their corroborating vitals for inclusion in insights
      const tempCorroborationMap = new Map<string, AnomalyResult[]>();
      
      const filteredAnomalies = confidenceFilteredAnomalies.filter(a => {
        // If this is a temperature anomaly, require at least one corroborating vital sign
        // with medically consistent direction that also passed confidence threshold
        if (temperatureMetrics.includes(a.metricType)) {
          if (!hasValidCorroboratingVital) {
            logger.debug(`[ClickHouseML] Filtering isolated temperature anomaly ${a.metricType} - no medically corroborating vital signs with meaningful deviation detected`);
            return false;
          }
          // Store corroborating vitals for this temperature anomaly
          tempCorroborationMap.set(a.anomalyId, corroboratingVitals);
          
          // Add corroborating vital info to relatedMetrics for insight generation
          const corroborationDetails: Record<string, any> = {};
          for (const vital of corroboratingVitals) {
            corroborationDetails[vital.metricType] = {
              value: vital.currentValue,
              deviation: vital.deviationPct,
              direction: vital.direction,
              isCorroboratingVital: true,
            };
          }
          a.relatedMetrics = { ...a.relatedMetrics, ...corroborationDetails };
          
          logger.info(`[ClickHouseML] Temperature anomaly ${a.metricType} corroborated by: ${corroboratingVitals.map(v => `${v.metricType} (${v.deviationPct.toFixed(1)}%)`).join(', ')}`);
        }
        return true;
      });

      if (filteredAnomalies.length > 0) {
        await this.storeAnomalies(healthId, filteredAnomalies);
        
        // Generate AI feedback questions based on detected anomalies
        await this.triggerFeedbackQuestions(healthId, filteredAnomalies);
      }

      logger.info(`[ClickHouseML] Detected ${filteredAnomalies.length} anomalies for ${healthId} (${patternedAnomalies.length - filteredAnomalies.length} filtered by confidence threshold)`);
      return filteredAnomalies;
    } catch (error) {
      logger.error('[ClickHouseML] Anomaly detection error:', error);
      return [];
    }
  }

  private detectMultiMetricPatterns(anomalies: AnomalyResult[]): AnomalyResult[] {
    if (anomalies.length < 2) return anomalies;

    const metricTypes = anomalies.map(a => a.metricType);

    const illnessIndicators = ['wrist_temperature_deviation', 'respiratory_rate_bpm', 'resting_heart_rate_bpm', 'hrv_ms', 'oxygen_saturation_pct'];
    const illnessMatches = metricTypes.filter(m => illnessIndicators.includes(m));

    if (illnessMatches.length >= 2) {
      const tempAnomaly = anomalies.find(a => a.metricType === 'wrist_temperature_deviation' && a.direction === 'above');
      const respAnomaly = anomalies.find(a => a.metricType === 'respiratory_rate_bpm' && a.direction === 'above');
      const rhrAnomaly = anomalies.find(a => a.metricType === 'resting_heart_rate_bpm' && a.direction === 'above');
      const hrvAnomaly = anomalies.find(a => a.metricType === 'hrv_ms' && a.direction === 'below');
      const o2Anomaly = anomalies.find(a => a.metricType === 'oxygen_saturation_pct' && a.direction === 'below');

      const patternMatches = [tempAnomaly, respAnomaly, rhrAnomaly, hrvAnomaly, o2Anomaly].filter(Boolean);

      if (patternMatches.length >= 2) {
        const patternFingerprint = 'illness_precursor';
        const relatedMetrics = Object.fromEntries(
          patternMatches.map(a => [a!.metricType, { value: a!.currentValue, deviation: a!.deviationPct }])
        );

        return anomalies.map(a => {
          if (patternMatches.some(p => p?.metricType === a.metricType)) {
            return {
              ...a,
              patternFingerprint,
              relatedMetrics,
              severity: 'high' as const,
              modelConfidence: Math.min(0.95, a.modelConfidence + 0.15),
            };
          }
          return a;
        });
      }
    }

    const recoveryIndicators = ['hrv_ms', 'resting_heart_rate_bpm', 'sleep_duration_min', 'deep_sleep_min'];
    const recoveryMatches = metricTypes.filter(m => recoveryIndicators.includes(m));

    if (recoveryMatches.length >= 2) {
      const hrvLow = anomalies.find(a => a.metricType === 'hrv_ms' && a.direction === 'below');
      const sleepLow = anomalies.find(a => ['sleep_duration_min', 'deep_sleep_min'].includes(a.metricType) && a.direction === 'below');

      if (hrvLow && sleepLow) {
        const patternFingerprint = 'recovery_deficit';
        const relatedMetrics = {
          [hrvLow.metricType]: { value: hrvLow.currentValue, deviation: hrvLow.deviationPct },
          [sleepLow.metricType]: { value: sleepLow.currentValue, deviation: sleepLow.deviationPct },
        };

        return anomalies.map(a => {
          if (a.metricType === hrvLow.metricType || a.metricType === sleepLow.metricType) {
            return { ...a, patternFingerprint, relatedMetrics };
          }
          return a;
        });
      }
    }

    const glucoseIndicators = ['glucose', 'cgm_glucose', 'cgm_hypo', 'cgm_hyper'];
    const glucoseAnomalies = anomalies.filter(a => glucoseIndicators.includes(a.metricType));
    
    if (glucoseAnomalies.length > 0) {
      const glucoseAnomaly = glucoseAnomalies[0];
      const hrvAnomaly = anomalies.find(a => a.metricType === 'hrv_ms');
      
      if (hrvAnomaly) {
        const patternFingerprint = glucoseAnomaly.direction === 'below' 
          ? 'hypoglycemia_hrv_correlation'
          : 'hyperglycemia_hrv_correlation';
        
        const relatedMetrics = {
          glucose: { value: glucoseAnomaly.currentValue, deviation: glucoseAnomaly.deviationPct },
          hrv_ms: { value: hrvAnomaly.currentValue, deviation: hrvAnomaly.deviationPct },
        };

        return anomalies.map(a => {
          if (a.metricType === glucoseAnomaly.metricType || a.metricType === 'hrv_ms') {
            return {
              ...a,
              patternFingerprint,
              relatedMetrics,
              severity: glucoseAnomaly.currentValue < CGM_ABSOLUTE_THRESHOLDS.hypoglycemia.severe ? 'high' as const : a.severity,
              modelConfidence: Math.min(0.95, a.modelConfidence + 0.1),
            };
          }
          return a;
        });
      }

      const sleepAnomaly = anomalies.find(a => ['sleep_duration_min', 'deep_sleep_min', 'sleep_efficiency_pct'].includes(a.metricType));
      
      if (sleepAnomaly) {
        const patternFingerprint = 'glucose_sleep_correlation';
        const relatedMetrics = {
          glucose: { value: glucoseAnomaly.currentValue, deviation: glucoseAnomaly.deviationPct },
          [sleepAnomaly.metricType]: { value: sleepAnomaly.currentValue, deviation: sleepAnomaly.deviationPct },
        };

        return anomalies.map(a => {
          if (a.metricType === glucoseAnomaly.metricType || a.metricType === sleepAnomaly.metricType) {
            return { ...a, patternFingerprint, relatedMetrics };
          }
          return a;
        });
      }

      const activityAnomaly = anomalies.find(a => ['steps', 'active_energy', 'exercise_minutes', 'workout_minutes'].includes(a.metricType));
      
      if (activityAnomaly) {
        const patternFingerprint = 'glucose_activity_correlation';
        const relatedMetrics = {
          glucose: { value: glucoseAnomaly.currentValue, deviation: glucoseAnomaly.deviationPct },
          [activityAnomaly.metricType]: { value: activityAnomaly.currentValue, deviation: activityAnomaly.deviationPct },
        };

        return anomalies.map(a => {
          if (a.metricType === glucoseAnomaly.metricType || a.metricType === activityAnomaly.metricType) {
            return { ...a, patternFingerprint, relatedMetrics };
          }
          return a;
        });
      }
    }

    return anomalies;
  }

  /**
   * ============================================================================
   * getMetricsForAnalysis - THE UNIFIED API (Single Source of Truth)
   * ============================================================================
   * 
   * This is THE method that downstream consumers should use instead of:
   * - anomalyDetectionEngine.calculateBaseline()
   * - ragInsightGenerator.computeActivityBaselines()
   * - baselineCalculator.calculateBaseline()
   * 
   * All baseline math happens HERE in ClickHouse SQL, not in JavaScript.
   * Downstream files just interpret the results, they don't recalculate.
   * 
   * @param healthId - User's health ID
   * @param options - Configuration for window and lookback periods
   * @returns MetricsAnalysisResult with all metrics, anomalies, and patterns
   */
  async getMetricsForAnalysis(
    healthId: string,
    options: { windowDays?: number; lookbackHours?: number } = {}
  ): Promise<MetricsAnalysisResult> {
    const { windowDays = 90, lookbackHours = 48 } = options;
    const analysisTimestamp = new Date().toISOString();
    
    // Default empty result
    const emptyResult: MetricsAnalysisResult = {
      healthId,
      analysisTimestamp,
      windowDays,
      lookbackHours,
      metrics: [],
      anomalies: [],
      highSeverity: [],
      patterns: [],
      dataQualitySummary: {
        totalMetrics: 0,
        metricsWithEnoughData: 0,
        averageConfidence: 0,
      },
    };

    if (!await this.ensureInitialized()) return emptyResult;

    try {
      // Step 1: Get baselines from ClickHouse (90-day window for robust statistics)
      const baselines = await this.calculateBaselines(healthId, windowDays);
      const baselineMap = new Map(baselines.map(b => [b.metricType, b]));
      
      if (baselines.length === 0) {
        logger.debug(`[ClickHouseML] No baselines available for ${healthId}`);
        return emptyResult;
      }

      // Step 2: Get current values (recent lookback period)
      const recentSql = `
        SELECT
          metric_type,
          avg(value) as current_value,
          max(recorded_at) as latest_date,
          count() as sample_count
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL {lookbackHours:UInt32} HOUR
        GROUP BY metric_type
      `;

      const recentMetrics = await clickhouse.query<{
        metric_type: string;
        current_value: number;
        latest_date: string;
        sample_count: number;
      }>(recentSql, { healthId, lookbackHours });

      const recentMap = new Map(recentMetrics.map(r => [r.metric_type, r]));

      // Step 2b: Get weekly and monthly averages (for trend context)
      const trendSql = `
        SELECT
          metric_type,
          avgIf(value, recorded_at >= now() - INTERVAL 7 DAY) as weekly_avg,
          avgIf(value, recorded_at >= now() - INTERVAL 30 DAY) as monthly_avg
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL 30 DAY
        GROUP BY metric_type
      `;

      const trendMetrics = await clickhouse.query<{
        metric_type: string;
        weekly_avg: number | null;
        monthly_avg: number | null;
      }>(trendSql, { healthId });

      const trendMap = new Map(trendMetrics.map(t => [t.metric_type, t]));

      // Step 3: Build MetricAnalysis for each metric
      const metrics: MetricAnalysis[] = [];
      
      for (const baseline of baselines) {
        const recent = recentMap.get(baseline.metricType);
        const currentValue = recent?.current_value ?? baseline.meanValue;
        const currentDate = recent?.latest_date ?? analysisTimestamp;
        const sampleCountRecent = recent?.sample_count ?? 0;
        
        // Calculate deviation
        const absoluteDeviation = currentValue - baseline.meanValue;
        const percentageDeviation = baseline.meanValue !== 0 
          ? (absoluteDeviation / baseline.meanValue) * 100 
          : 0;
        const zScore = baseline.stdDev && baseline.stdDev > 0
          ? absoluteDeviation / baseline.stdDev
          : null;
        
        // Determine direction
        let direction: 'above' | 'below' | 'normal' = 'normal';
        if (percentageDeviation > 5) direction = 'above';
        else if (percentageDeviation < -5) direction = 'below';
        
        // Get threshold config for this metric
        const threshold = METRIC_THRESHOLDS[baseline.metricType];
        
        // Check significance
        const absDeviation = Math.abs(percentageDeviation);
        const absZScore = zScore !== null ? Math.abs(zScore) : 0;
        const isSignificant = threshold 
          ? (absDeviation >= threshold.percentageThreshold || 
             (zScore !== null && absZScore >= threshold.zScoreThreshold))
          : absDeviation >= 20; // Default 20% threshold
        
        // Apply direction filter (e.g., only flag high temp, not low)
        const directionValid = !threshold || 
          threshold.direction === 'both' ||
          (threshold.direction === 'high' && direction === 'above') ||
          (threshold.direction === 'low' && direction === 'below');
        
        const effectivelySignificant = isSignificant && directionValid;
        
        // Determine severity
        let severity: 'normal' | 'low' | 'moderate' | 'high' = 'normal';
        if (effectivelySignificant && threshold) {
          if (baseline.metricType === 'wrist_temperature_deviation') {
            // Temperature uses absolute value thresholds
            const absValue = Math.abs(currentValue);
            if (absValue >= threshold.severity.high) severity = 'high';
            else if (absValue >= threshold.severity.moderate) severity = 'moderate';
            else severity = 'low';
          } else {
            if (absDeviation >= threshold.severity.high) severity = 'high';
            else if (absDeviation >= threshold.severity.moderate) severity = 'moderate';
            else severity = 'low';
          }
        }
        
        // Data quality
        const hasEnoughData = baseline.sampleCount >= 3;
        const latestDate = new Date(currentDate);
        const isStale = (Date.now() - latestDate.getTime()) > 24 * 60 * 60 * 1000;
        
        // Confidence score: 0-1 based on sample count and recency
        let confidenceScore = 0.5;
        if (baseline.sampleCount >= 30) confidenceScore += 0.3;
        else if (baseline.sampleCount >= 14) confidenceScore += 0.2;
        else if (baseline.sampleCount >= 7) confidenceScore += 0.1;
        if (!isStale) confidenceScore += 0.1;
        if (sampleCountRecent >= 3) confidenceScore += 0.1;
        confidenceScore = Math.min(1, confidenceScore);
        
        // Get trend data for this metric
        const trendData = trendMap.get(baseline.metricType);
        const weeklyAverage = trendData?.weekly_avg ?? null;
        const monthlyAverage = trendData?.monthly_avg ?? null;
        
        // Calculate percent below baseline (for activity insights)
        const percentBelowBaseline = baseline.meanValue > 0 && currentValue < baseline.meanValue
          ? ((baseline.meanValue - currentValue) / baseline.meanValue) * 100
          : null;
        
        // Calculate suggested target (baseline mean as target for underperformance)
        const suggestedTarget = percentBelowBaseline !== null && percentBelowBaseline > 10
          ? baseline.meanValue
          : null;
        
        // Freshness calculation (days since last data point)
        const lastUpdatedDays = (Date.now() - latestDate.getTime()) / (24 * 60 * 60 * 1000);
        let freshnessCategory: 'green' | 'yellow' | 'red' = 'green';
        if (lastUpdatedDays > 90) freshnessCategory = 'red';
        else if (lastUpdatedDays > 30) freshnessCategory = 'yellow';
        
        // Half-life depends on metric type (wearable data updates daily, blood work less often)
        const halfLifeDays = this.getMetricHalfLife(baseline.metricType);
        
        // Clinical context - brief interpretation text
        const clinicalContext = this.generateClinicalContext(
          baseline.metricType,
          currentValue,
          baseline.meanValue,
          direction,
          severity
        );

        const metricAnalysis: MetricAnalysis = {
          metric: baseline.metricType,
          currentValue,
          currentDate,
          sampleCountRecent,
          baseline: {
            mean: baseline.meanValue,
            stdDev: baseline.stdDev,
            min: baseline.minValue,
            max: baseline.maxValue,
            sampleCount: baseline.sampleCount,
            windowDays,
            percentile10: baseline.percentile10,
            percentile25: baseline.percentile25,
            percentile75: baseline.percentile75,
            percentile90: baseline.percentile90,
          },
          deviation: {
            absolute: absoluteDeviation,
            percentage: percentageDeviation,
            zScore,
            direction,
            isSignificant: effectivelySignificant,
          },
          trend: {
            consecutiveDaysAbove: 0,  // TODO: Add SQL query for streak calculation
            consecutiveDaysBelow: 0,  // TODO: Add SQL query for streak calculation
            weeklyAverage,
            monthlyAverage,
            percentBelowBaseline,
            suggestedTarget,
          },
          freshness: {
            category: freshnessCategory,
            lastUpdatedDays: Math.round(lastUpdatedDays),
            halfLifeDays,
          },
          interpretation: {
            severity,
            thresholdUsed: threshold ? {
              zScoreThreshold: threshold.zScoreThreshold,
              percentageThreshold: threshold.percentageThreshold,
              direction: threshold.direction,
            } : null,
            clinicalContext,
          },
          dataQuality: {
            hasEnoughData,
            isStale,
            confidenceScore,
          },
        };
        
        metrics.push(metricAnalysis);
      }
      
      // Step 4: Filter anomalies and high-severity
      const anomalies = metrics.filter(m => m.deviation.isSignificant);
      const highSeverity = metrics.filter(m => m.interpretation.severity === 'high');
      
      // Step 5: Detect patterns (reuse existing logic)
      const patterns = this.detectUnifiedPatterns(metrics);
      
      // Step 6: Build data quality summary
      const metricsWithEnoughData = metrics.filter(m => m.dataQuality.hasEnoughData).length;
      const averageConfidence = metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.dataQuality.confidenceScore, 0) / metrics.length
        : 0;
      
      const result: MetricsAnalysisResult = {
        healthId,
        analysisTimestamp,
        windowDays,
        lookbackHours,
        metrics,
        anomalies,
        highSeverity,
        patterns,
        dataQualitySummary: {
          totalMetrics: metrics.length,
          metricsWithEnoughData,
          averageConfidence,
        },
      };
      
      logger.info(`[ClickHouseML] getMetricsForAnalysis: ${metrics.length} metrics, ${anomalies.length} anomalies, ${patterns.length} patterns for ${healthId}`);
      
      return result;
    } catch (error) {
      logger.error('[ClickHouseML] getMetricsForAnalysis error:', error);
      return emptyResult;
    }
  }

  /**
   * Get expected update frequency (half-life) for a metric type
   * Used for freshness calculation - wearable data updates daily, blood work less often
   */
  private getMetricHalfLife(metricType: string): number {
    const wearableMetrics = [
      'steps', 'active_energy', 'heart_rate', 'resting_heart_rate_bpm', 'hrv_ms',
      'sleep_duration_min', 'deep_sleep_min', 'rem_sleep_min',
      'respiratory_rate_bpm', 'oxygen_saturation_pct', 'wrist_temperature_deviation',
      'distance_walking_running', 'exercise_time', 'stand_time', 'stand_hours',
      'flights_climbed', 'basal_energy_burned', 'walking_heart_rate_bpm',
      'mindful_minutes', 'walking_speed', 'walking_step_length',
      'walking_double_support_percentage', 'walking_asymmetry_percentage',
      'stair_ascent_speed', 'stair_descent_speed', 'six_minute_walk_test_distance'
    ];
    
    const bloodWorkMetrics = [
      'glucose', 'cholesterol', 'triglycerides', 'hdl', 'ldl', 'hemoglobin',
      'hematocrit', 'platelets', 'white_blood_cells', 'red_blood_cells',
      'tsh', 'vitamin_d', 'vitamin_b12', 'ferritin', 'creatinine', 'alt', 'ast'
    ];
    
    if (wearableMetrics.some(m => metricType.toLowerCase().includes(m))) {
      return 1; // Daily updates expected
    }
    if (bloodWorkMetrics.some(m => metricType.toLowerCase().includes(m))) {
      return 90; // Quarterly updates typical for blood work
    }
    return 7; // Default weekly for unknown metrics
  }

  /**
   * Generate brief clinical context text for a metric analysis
   */
  private generateClinicalContext(
    metricType: string,
    currentValue: number,
    baselineMean: number,
    direction: 'above' | 'below' | 'normal',
    severity: 'normal' | 'low' | 'moderate' | 'high'
  ): string | null {
    if (severity === 'normal') return null;
    
    const metricLabels: Record<string, string> = {
      'hrv_ms': 'Heart rate variability',
      'resting_heart_rate_bpm': 'Resting heart rate',
      'sleep_duration_min': 'Sleep duration',
      'deep_sleep_min': 'Deep sleep',
      'rem_sleep_min': 'REM sleep',
      'steps': 'Daily steps',
      'active_energy': 'Active calories',
      'wrist_temperature_deviation': 'Wrist temperature',
      'respiratory_rate_bpm': 'Breathing rate',
      'oxygen_saturation_pct': 'Blood oxygen',
    };
    
    const label = metricLabels[metricType] || metricType.replace(/_/g, ' ');
    const percentDiff = Math.abs(((currentValue - baselineMean) / baselineMean) * 100).toFixed(0);
    
    if (direction === 'above') {
      return `${label} is ${percentDiff}% above your 90-day baseline (${severity} deviation)`;
    } else if (direction === 'below') {
      return `${label} is ${percentDiff}% below your 90-day baseline (${severity} deviation)`;
    }
    return null;
  }

  /**
   * Detect multi-metric patterns from unified MetricAnalysis array
   */
  private detectUnifiedPatterns(metrics: MetricAnalysis[]): MetricsAnalysisResult['patterns'] {
    const patterns: MetricsAnalysisResult['patterns'] = [];
    const anomalyMetrics = metrics.filter(m => m.deviation.isSignificant);
    
    if (anomalyMetrics.length < 2) return patterns;
    
    const metricNames = anomalyMetrics.map(m => m.metric);
    
    // Illness precursor pattern
    const illnessIndicators = ['wrist_temperature_deviation', 'respiratory_rate_bpm', 'resting_heart_rate_bpm', 'hrv_ms', 'oxygen_saturation_pct'];
    const illnessMatches = anomalyMetrics.filter(m => 
      illnessIndicators.includes(m.metric) &&
      ((m.metric === 'wrist_temperature_deviation' && m.deviation.direction === 'above') ||
       (m.metric === 'respiratory_rate_bpm' && m.deviation.direction === 'above') ||
       (m.metric === 'resting_heart_rate_bpm' && m.deviation.direction === 'above') ||
       (m.metric === 'hrv_ms' && m.deviation.direction === 'below') ||
       (m.metric === 'oxygen_saturation_pct' && m.deviation.direction === 'below'))
    );
    
    if (illnessMatches.length >= 2) {
      const avgConfidence = illnessMatches.reduce((sum, m) => sum + m.dataQuality.confidenceScore, 0) / illnessMatches.length;
      patterns.push({
        patternType: 'illness_precursor',
        confidence: Math.min(0.95, avgConfidence + 0.15),
        involvedMetrics: illnessMatches.map(m => m.metric),
        description: 'Multiple vital signs suggest early illness onset. Elevated temperature, respiratory rate, and/or heart rate with decreased HRV.',
      });
    }
    
    // Recovery deficit pattern
    const hrvLow = anomalyMetrics.find(m => m.metric === 'hrv_ms' && m.deviation.direction === 'below');
    const sleepLow = anomalyMetrics.find(m => 
      ['sleep_duration_min', 'deep_sleep_min'].includes(m.metric) && 
      m.deviation.direction === 'below'
    );
    
    if (hrvLow && sleepLow) {
      const avgConfidence = (hrvLow.dataQuality.confidenceScore + sleepLow.dataQuality.confidenceScore) / 2;
      patterns.push({
        patternType: 'recovery_deficit',
        confidence: Math.min(0.9, avgConfidence + 0.1),
        involvedMetrics: [hrvLow.metric, sleepLow.metric],
        description: 'Low HRV combined with poor sleep indicates inadequate recovery. Consider rest day or reduced training load.',
      });
    }
    
    // Glucose-HRV correlation
    const glucoseMetrics = ['glucose', 'cgm_glucose', 'cgm_hypo', 'cgm_hyper'];
    const glucoseAnomaly = anomalyMetrics.find(m => glucoseMetrics.includes(m.metric));
    const hrvAnomaly = anomalyMetrics.find(m => m.metric === 'hrv_ms');
    
    if (glucoseAnomaly && hrvAnomaly) {
      const patternType = glucoseAnomaly.deviation.direction === 'below' 
        ? 'hypoglycemia_hrv_correlation' 
        : 'hyperglycemia_hrv_correlation';
      patterns.push({
        patternType,
        confidence: 0.85,
        involvedMetrics: [glucoseAnomaly.metric, 'hrv_ms'],
        description: `Glucose dysregulation affecting HRV. ${glucoseAnomaly.deviation.direction === 'below' ? 'Low blood sugar' : 'High blood sugar'} correlates with heart rate variability changes.`,
      });
    }
    
    // Activity-sleep pattern
    const activityHigh = anomalyMetrics.find(m => 
      ['steps', 'active_energy', 'exercise_minutes'].includes(m.metric) && 
      m.deviation.direction === 'above'
    );
    const sleepQualityLow = anomalyMetrics.find(m => 
      ['deep_sleep_min', 'rem_sleep_min', 'sleep_efficiency_pct'].includes(m.metric) && 
      m.deviation.direction === 'below'
    );
    
    if (activityHigh && sleepQualityLow) {
      patterns.push({
        patternType: 'overtraining_sleep_impact',
        confidence: 0.75,
        involvedMetrics: [activityHigh.metric, sleepQualityLow.metric],
        description: 'High activity levels may be affecting sleep quality. Consider timing of exercise relative to bedtime.',
      });
    }
    
    return patterns;
  }

  async detectCgmAnomalies(healthId: string, options: { lookbackHours?: number } = {}): Promise<AnomalyResult[]> {
    const { lookbackHours = 24 } = options;

    if (!await this.ensureInitialized()) return [];

    try {
      const { cgmPatternLearner } = await import('./cgmPatternLearner');
      const learnedBaselines = await cgmPatternLearner.getLearnedBaselines();
      const hasLearnedModel = learnedBaselines.global !== null || learnedBaselines.hourly.length > 0;

      const sql = `
        SELECT
          avg(glucose_mg_dl) as avg_glucose,
          min(glucose_mg_dl) as min_glucose,
          max(glucose_mg_dl) as max_glucose,
          stddevPop(glucose_mg_dl) as glucose_std,
          countIf(glucose_mg_dl < ${CGM_ABSOLUTE_THRESHOLDS.hypoglycemia.moderate}) as hypo_count,
          countIf(glucose_mg_dl < ${CGM_ABSOLUTE_THRESHOLDS.hypoglycemia.severe}) as severe_hypo_count,
          countIf(glucose_mg_dl > ${CGM_ABSOLUTE_THRESHOLDS.hyperglycemia.moderate}) as hyper_count,
          countIf(glucose_mg_dl > ${CGM_ABSOLUTE_THRESHOLDS.hyperglycemia.severe}) as severe_hyper_count,
          countIf(glucose_mg_dl BETWEEN ${CGM_ABSOLUTE_THRESHOLDS.targetRange.low} AND ${CGM_ABSOLUTE_THRESHOLDS.targetRange.high}) as in_range_count,
          count() as total_readings
        FROM flo_health.cgm_glucose
        WHERE health_id = {healthId:String}
          AND recorded_at >= now() - INTERVAL {lookbackHours:UInt32} HOUR
      `;

      const results = await clickhouse.query<{
        avg_glucose: number;
        min_glucose: number;
        max_glucose: number;
        glucose_std: number;
        hypo_count: number;
        severe_hypo_count: number;
        hyper_count: number;
        severe_hyper_count: number;
        in_range_count: number;
        total_readings: number;
      }>(sql, { healthId, lookbackHours });

      if (results.length === 0 || results[0].total_readings < 12) {
        return [];
      }

      const r = results[0];
      const anomalies: AnomalyResult[] = [];
      const timeInRange = (r.in_range_count / r.total_readings) * 100;

      const globalBaseline = learnedBaselines.global;
      const baselineMean = globalBaseline?.mean_glucose || r.avg_glucose;
      const baselineStd = globalBaseline?.std_glucose || r.glucose_std || 30;
      const modelConfidenceBoost = hasLearnedModel ? 0.1 : 0;

      if (r.min_glucose < CGM_ABSOLUTE_THRESHOLDS.hypoglycemia.moderate) {
        const severity = r.min_glucose < CGM_ABSOLUTE_THRESHOLDS.hypoglycemia.severe ? 'high' : 'moderate';
        const zScore = baselineStd > 0 ? (r.min_glucose - baselineMean) / baselineStd : null;
        anomalies.push({
          anomalyId: randomUUID(),
          metricType: 'cgm_hypo',
          currentValue: r.min_glucose,
          baselineValue: baselineMean,
          deviationPct: ((r.min_glucose - baselineMean) / baselineMean) * 100,
          zScore,
          direction: 'below',
          severity,
          patternFingerprint: severity === 'high' ? 'severe_hypoglycemia' : 'hypoglycemia_event',
          relatedMetrics: { 
            hypo_count: r.hypo_count, 
            severe_count: r.severe_hypo_count,
            model_trained: hasLearnedModel,
          },
          modelConfidence: Math.min(0.95, 0.85 + modelConfidenceBoost),
          detectedAt: new Date().toISOString(),
        });
      }

      if (r.max_glucose > CGM_ABSOLUTE_THRESHOLDS.hyperglycemia.moderate) {
        const severity = r.max_glucose > CGM_ABSOLUTE_THRESHOLDS.hyperglycemia.severe ? 'high' : 'moderate';
        const zScore = baselineStd > 0 ? (r.max_glucose - baselineMean) / baselineStd : null;
        anomalies.push({
          anomalyId: randomUUID(),
          metricType: 'cgm_hyper',
          currentValue: r.max_glucose,
          baselineValue: baselineMean,
          deviationPct: ((r.max_glucose - baselineMean) / baselineMean) * 100,
          zScore,
          direction: 'above',
          severity,
          patternFingerprint: severity === 'high' ? 'severe_hyperglycemia' : 'hyperglycemia_event',
          relatedMetrics: { 
            hyper_count: r.hyper_count, 
            severe_count: r.severe_hyper_count,
            model_trained: hasLearnedModel,
          },
          modelConfidence: Math.min(0.95, 0.85 + modelConfidenceBoost),
          detectedAt: new Date().toISOString(),
        });
      }

      const expectedVariability = learnedBaselines.variability?.range || 100;
      const userRange = r.max_glucose - r.min_glucose;
      const isHighVariability = userRange > expectedVariability * 1.5 || r.glucose_std > CGM_ABSOLUTE_THRESHOLDS.rateOfChange.risingFast * 10;

      if (isHighVariability) {
        anomalies.push({
          anomalyId: randomUUID(),
          metricType: 'cgm_variability',
          currentValue: r.glucose_std,
          baselineValue: baselineStd,
          deviationPct: ((r.glucose_std - baselineStd) / baselineStd) * 100,
          zScore: null,
          direction: 'above',
          severity: r.glucose_std > baselineStd * 2 ? 'high' : 'moderate',
          patternFingerprint: 'high_glucose_variability',
          relatedMetrics: { 
            coefficient_of_variation: (r.glucose_std / r.avg_glucose) * 100,
            learned_expected_range: expectedVariability,
            model_trained: hasLearnedModel,
          },
          modelConfidence: Math.min(0.92, 0.80 + modelConfidenceBoost),
          detectedAt: new Date().toISOString(),
        });
      }

      if (timeInRange < 70) {
        anomalies.push({
          anomalyId: randomUUID(),
          metricType: 'time_in_range',
          currentValue: timeInRange,
          baselineValue: 70,
          deviationPct: ((timeInRange - 70) / 70) * 100,
          zScore: null,
          direction: 'below',
          severity: timeInRange < 50 ? 'high' : 'moderate',
          patternFingerprint: 'low_time_in_range',
          relatedMetrics: { 
            in_range_count: r.in_range_count, 
            total_readings: r.total_readings,
            model_trained: hasLearnedModel,
          },
          modelConfidence: Math.min(0.93, 0.83 + modelConfidenceBoost),
          detectedAt: new Date().toISOString(),
        });
      }

      if (anomalies.length > 0) {
        await this.storeAnomalies(healthId, anomalies);
      }

      logger.info(`[ClickHouseML] Detected ${anomalies.length} CGM anomalies for ${healthId} (learned model: ${hasLearnedModel})`);
      return anomalies;
    } catch (error) {
      logger.error('[ClickHouseML] CGM anomaly detection error:', error);
      return [];
    }
  }

  private async storeAnomalies(healthId: string, anomalies: AnomalyResult[]): Promise<void> {
    const rows = anomalies.map(a => ({
      anomaly_id: a.anomalyId,
      health_id: healthId,
      metric_type: a.metricType,
      current_value: a.currentValue,
      baseline_value: a.baselineValue,
      deviation_pct: a.deviationPct,
      z_score: a.zScore,
      direction: a.direction,
      severity: a.severity,
      pattern_fingerprint: a.patternFingerprint,
      related_metrics: a.relatedMetrics ? JSON.stringify(a.relatedMetrics) : null,
      model_confidence: a.modelConfidence,
    }));

    await clickhouse.insert('detected_anomalies', rows);
  }

  private async triggerFeedbackQuestions(healthId: string, anomalies: AnomalyResult[]): Promise<void> {
    try {
      // Check if proactive alerts are enabled in admin settings
      const mlSettings = await getMLSettings();
      if (!mlSettings.enableProactiveAlerts) {
        logger.debug(`[ClickHouseML] Proactive alerts disabled, skipping feedback questions for ${healthId}`);
        return;
      }
      
      // Only generate questions for moderate or high severity anomalies
      const significantAnomalies = anomalies.filter(a => a.severity === 'moderate' || a.severity === 'high');
      if (significantAnomalies.length === 0) return;

      // Extract patterns and metrics for the correlation engine
      const patterns = [...new Set(significantAnomalies.map(a => a.patternFingerprint).filter(Boolean))] as string[];
      const anomalyIds = significantAnomalies.map(a => a.anomalyId);
      const metrics: Record<string, number> = {};
      
      for (const a of significantAnomalies) {
        metrics[a.metricType] = a.deviationPct;
        // Also store absolute values for specific metrics
        if (a.metricType === 'wrist_temperature_deviation') {
          metrics['wrist_temperature_deviation'] = a.currentValue;
        }
      }

      // Use correlation engine to generate contextual feedback question
      const question = await correlationEngine.generateFeedbackQuestion(
        healthId,
        'anomaly',
        anomalyIds,
        patterns,
        metrics
      );

      if (question) {
        logger.info(`[ClickHouseML] Generated feedback question for ${healthId}: "${question.questionText}"`);
      }
    } catch (error) {
      logger.error('[ClickHouseML] Error triggering feedback questions:', error);
    }
  }

  async recordFeedbackOutcome(
    healthId: string,
    anomalyId: string,
    userFeeling: number,
    wasConfirmed: boolean,
    feedbackText?: string
  ): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const outcome = wasConfirmed ? 'confirmed' : 'false_positive';

      // Get the metric type from the anomaly for threshold adjustment
      const anomalyInfo = await clickhouse.query<{ metric_type: string }>(`
        SELECT metric_type FROM flo_health.detected_anomalies
        WHERE anomaly_id = {anomalyId:String} AND health_id = {healthId:String}
        LIMIT 1
      `, { anomalyId, healthId });

      await clickhouse.command(`
        ALTER TABLE flo_health.detected_anomalies
        UPDATE 
          resolved_at = now64(3),
          outcome = '${outcome}',
          user_feeling = ${userFeeling},
          feedback_text = ${feedbackText ? `'${feedbackText.replace(/'/g, "''")}'` : 'NULL'}
        WHERE anomaly_id = '${anomalyId}' AND health_id = '${healthId}'
      `);

      await this.updateMLTrainingData(healthId, anomalyId, wasConfirmed);
      
      // Update personalized thresholds based on feedback
      if (anomalyInfo.length > 0) {
        await this.updatePersonalizedThreshold(healthId, anomalyInfo[0].metric_type, wasConfirmed);
      }
      
      // Analyze and store free text feedback if provided
      if (feedbackText && feedbackText.trim().length > 0) {
        await this.analyzeFreeTextFeedback(healthId, anomalyId, feedbackText, anomalyInfo[0]?.metric_type);
      }

      logger.info(`[ClickHouseML] Recorded feedback for anomaly ${anomalyId}:`, { wasConfirmed, userFeeling });
    } catch (error) {
      logger.error('[ClickHouseML] Error recording feedback:', error);
    }
  }

  /**
   * Updates personalized anomaly detection thresholds based on user feedback.
   * False positives increase threshold (less sensitive), confirmed anomalies keep threshold.
   */
  async updatePersonalizedThreshold(
    healthId: string,
    metricType: string,
    wasConfirmed: boolean
  ): Promise<void> {
    try {
      // Get current threshold or use defaults
      const existing = await clickhouse.query<{
        z_score_threshold: number;
        percentage_threshold: number;
        false_positive_count: number;
        confirmed_count: number;
        threshold_adjustment_factor: number;
      }>(`
        SELECT z_score_threshold, percentage_threshold, false_positive_count, confirmed_count, threshold_adjustment_factor
        FROM flo_health.user_learned_thresholds
        WHERE health_id = {healthId:String} AND metric_type = {metricType:String}
        ORDER BY updated_at DESC
        LIMIT 1
      `, { healthId, metricType });

      const defaults = METRIC_THRESHOLDS[metricType as keyof typeof METRIC_THRESHOLDS] || 
                       { zScoreThreshold: 2.0, percentageThreshold: 20 };
      
      let zScore = existing[0]?.z_score_threshold ?? defaults.zScoreThreshold;
      let pctThreshold = existing[0]?.percentage_threshold ?? defaults.percentageThreshold;
      let fpCount = existing[0]?.false_positive_count ?? 0;
      let confirmedCount = existing[0]?.confirmed_count ?? 0;
      let adjustmentFactor = existing[0]?.threshold_adjustment_factor ?? 1.0;

      if (wasConfirmed) {
        confirmedCount++;
        // Slightly decrease adjustment factor when confirmed (more confidence in current threshold)
        adjustmentFactor = Math.max(0.8, adjustmentFactor - 0.02);
      } else {
        fpCount++;
        // Increase threshold by 10% for false positives (less sensitive)
        adjustmentFactor = Math.min(2.0, adjustmentFactor + 0.1);
        zScore = defaults.zScoreThreshold * adjustmentFactor;
        pctThreshold = defaults.percentageThreshold * adjustmentFactor;
      }

      // Upsert the learned threshold
      await clickhouse.insert('user_learned_thresholds', [{
        health_id: healthId,
        metric_type: metricType,
        z_score_threshold: zScore,
        percentage_threshold: pctThreshold,
        false_positive_count: fpCount,
        confirmed_count: confirmedCount,
        threshold_adjustment_factor: adjustmentFactor,
        last_feedback_at: new Date().toISOString(),
        notes: `Last: ${wasConfirmed ? 'confirmed' : 'false_positive'}`,
        updated_at: new Date().toISOString(),
      }]);

      logger.info(`[ClickHouseML] Updated threshold for ${healthId}/${metricType}: factor=${adjustmentFactor.toFixed(2)}, fp=${fpCount}, confirmed=${confirmedCount}`);
    } catch (error) {
      logger.error('[ClickHouseML] Error updating personalized threshold:', error);
    }
  }

  /**
   * Analyzes free text feedback to extract themes and actionable insights.
   * Stores analysis for use in future AI context and ML training.
   */
  private async analyzeFreeTextFeedback(
    healthId: string,
    anomalyId: string,
    feedbackText: string,
    metricType?: string
  ): Promise<void> {
    try {
      // Extract themes from feedback using simple keyword analysis
      const lowerText = feedbackText.toLowerCase();
      const themes: string[] = [];
      
      // Theme detection
      if (lowerText.includes('stress') || lowerText.includes('anxious') || lowerText.includes('worried')) {
        themes.push('stress');
      }
      if (lowerText.includes('sick') || lowerText.includes('ill') || lowerText.includes('cold') || lowerText.includes('flu')) {
        themes.push('illness');
      }
      if (lowerText.includes('travel') || lowerText.includes('jet lag') || lowerText.includes('timezone')) {
        themes.push('travel');
      }
      if (lowerText.includes('alcohol') || lowerText.includes('drink') || lowerText.includes('wine') || lowerText.includes('beer')) {
        themes.push('alcohol');
      }
      if (lowerText.includes('exercise') || lowerText.includes('workout') || lowerText.includes('training') || lowerText.includes('gym')) {
        themes.push('exercise');
      }
      if (lowerText.includes('sleep') || lowerText.includes('insomnia') || lowerText.includes('tired') || lowerText.includes('fatigue')) {
        themes.push('sleep_issue');
      }
      if (lowerText.includes('meal') || lowerText.includes('food') || lowerText.includes('ate') || lowerText.includes('dinner') || lowerText.includes('lunch')) {
        themes.push('nutrition');
      }
      if (lowerText.includes('medication') || lowerText.includes('medicine') || lowerText.includes('supplement')) {
        themes.push('medication');
      }
      
      // Data quality / sensor error detection - for false positives from Apple/device issues
      const dataQualityKeywords = [
        'apple', 'watch', 'sensor', 'bug', 'glitch', 'error', 'data issue', 'data problem',
        'impossible', 'incorrect', 'wrong data', 'bad data', 'sync issue', 'sync problem',
        'duplicate', 'missing', 'gap', 'not accurate', 'inaccurate data', 'false', 
        'false positive', 'device', 'not wearing', 'took off', 'charged', 'charging'
      ];
      if (dataQualityKeywords.some(kw => lowerText.includes(kw))) {
        themes.push('data_quality');
        // Create a metric suppression when data quality issue is reported
        if (metricType) {
          await this.createMetricSuppression(healthId, metricType, feedbackText, 7);
        }
      }
      
      // Sentiment detection (simple)
      let sentiment = 'neutral';
      const positiveWords = ['good', 'great', 'better', 'improved', 'helpful', 'accurate', 'right', 'yes'];
      const negativeWords = ['bad', 'wrong', 'inaccurate', 'not', 'didn\'t', 'false', 'annoying', 'stop'];
      
      const positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;
      const negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;
      
      if (positiveCount > negativeCount) sentiment = 'positive';
      else if (negativeCount > positiveCount) sentiment = 'negative';

      // Store the analysis
      const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await clickhouse.insert('user_feedback_analysis', [{
        feedback_id: feedbackId,
        health_id: healthId,
        feedback_source: 'anomaly_response',
        original_text: feedbackText,
        extracted_themes: themes,
        sentiment: sentiment,
        actionable_insight: themes.length > 0 ? `User mentioned: ${themes.join(', ')}` : null,
        related_metrics: metricType ? [metricType] : [],
        created_at: new Date().toISOString(),
      }]);

      logger.info(`[ClickHouseML] Analyzed feedback for ${healthId}: themes=${themes.join(',')}, sentiment=${sentiment}`);
    } catch (error) {
      logger.error('[ClickHouseML] Error analyzing free text feedback:', error);
    }
  }

  /**
   * Gets personalized threshold for a metric, falling back to defaults if not learned yet.
   */
  async getPersonalizedThreshold(
    healthId: string,
    metricType: string
  ): Promise<{ zScoreThreshold: number; percentageThreshold: number; isPersonalized: boolean }> {
    try {
      const result = await clickhouse.query<{
        z_score_threshold: number;
        percentage_threshold: number;
      }>(`
        SELECT z_score_threshold, percentage_threshold
        FROM flo_health.user_learned_thresholds
        WHERE health_id = {healthId:String} AND metric_type = {metricType:String}
        ORDER BY updated_at DESC
        LIMIT 1
      `, { healthId, metricType });

      if (result.length > 0) {
        return {
          zScoreThreshold: result[0].z_score_threshold,
          percentageThreshold: result[0].percentage_threshold,
          isPersonalized: true,
        };
      }

      // Fall back to defaults
      const defaults = METRIC_THRESHOLDS[metricType as keyof typeof METRIC_THRESHOLDS] || 
                       { zScoreThreshold: 2.0, percentageThreshold: 20 };
      
      return {
        zScoreThreshold: defaults.zScoreThreshold,
        percentageThreshold: defaults.percentageThreshold,
        isPersonalized: false,
      };
    } catch (error) {
      logger.error('[ClickHouseML] Error getting personalized threshold:', error);
      const defaults = METRIC_THRESHOLDS[metricType as keyof typeof METRIC_THRESHOLDS] || 
                       { zScoreThreshold: 2.0, percentageThreshold: 20 };
      return { ...defaults, isPersonalized: false };
    }
  }

  /**
   * Creates a temporary metric suppression when user reports data quality issues.
   * Suppresses the metric from anomaly detection for the specified number of days.
   */
  private async createMetricSuppression(
    healthId: string,
    metricType: string,
    reason: string,
    durationDays: number = 7
  ): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);
      
      const suppressionId = `supp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await clickhouse.insert('user_metric_suppressions', [{
        suppression_id: suppressionId,
        health_id: healthId,
        metric_type: metricType,
        reason: reason.substring(0, 500), // Limit text length
        suppression_type: 'data_quality',
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      }]);
      
      logger.info(`[ClickHouseML] Created ${durationDays}-day suppression for ${healthId}/${metricType} due to data quality feedback`);
    } catch (error) {
      logger.error('[ClickHouseML] Error creating metric suppression:', error);
    }
  }

  /**
   * Gets active suppressions for a health ID to skip during anomaly detection.
   */
  private async getActiveSuppressions(healthId: string): Promise<Set<string>> {
    try {
      // NOTE: Do not use FINAL - SharedMergeTree doesn't support it
      const result = await clickhouse.query<{ metric_type: string }>(`
        SELECT DISTINCT metric_type
        FROM flo_health.user_metric_suppressions
        WHERE health_id = {healthId:String}
          AND expires_at > now()
      `, { healthId });
      
      return new Set(result.map(r => r.metric_type));
    } catch (error) {
      logger.error('[ClickHouseML] Error getting active suppressions:', error);
      return new Set();
    }
  }

  async storeFeedbackResponse(
    healthId: string,
    feedbackId: string,
    data: {
      questionType: string;
      questionText: string;
      responseValue?: number;
      responseBoolean?: boolean;
      responseOption?: string;
      responseText?: string;
      triggerPattern?: string;
      triggerMetrics?: Record<string, { value: number; deviation: number }>;
      collectionChannel: 'voice' | 'push' | 'in_app';
    }
  ): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      await clickhouse.insert('user_feedback', [{
        feedback_id: feedbackId,
        health_id: healthId,
        collected_at: new Date().toISOString(),
        question_type: data.questionType,
        question_text: data.questionText,
        response_value: data.responseValue ?? null,
        response_boolean: data.responseBoolean ?? null,
        response_option: data.responseOption ?? null,
        response_text: data.responseText ?? null,
        trigger_pattern: data.triggerPattern ?? null,
        trigger_metrics: data.triggerMetrics ? JSON.stringify(data.triggerMetrics) : null,
        anomaly_id: null,
        collection_channel: data.collectionChannel,
      }]);

      logger.info(`[ClickHouseML] Stored feedback response ${feedbackId} for ${healthId}`);
    } catch (error) {
      logger.error('[ClickHouseML] Error storing feedback response:', error);
    }
  }

  private async updateMLTrainingData(healthId: string, anomalyId: string, wasConfirmed: boolean): Promise<void> {
    try {
      const anomalyData = await clickhouse.query<{
        pattern_fingerprint: string | null;
        detected_at: string;
      }>(`
        SELECT pattern_fingerprint, detected_at
        FROM flo_health.detected_anomalies
        WHERE anomaly_id = {anomalyId:String} AND health_id = {healthId:String}
        LIMIT 1
      `, { anomalyId, healthId });

      if (anomalyData.length === 0) return;

      const pattern = anomalyData[0].pattern_fingerprint;
      const detectedDate = new Date(anomalyData[0].detected_at).toISOString().split('T')[0];

      const featureData = await clickhouse.query<{
        hrv_avg: number | null;
        rhr_avg: number | null;
        sleep_avg: number | null;
      }>(`
        SELECT
          avgIf(value, metric_type = 'hrv_ms') as hrv_avg,
          avgIf(value, metric_type = 'resting_heart_rate_bpm') as rhr_avg,
          avgIf(value, metric_type = 'sleep_duration_min') as sleep_avg
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND local_date = {detectedDate:String}
      `, { healthId, detectedDate });

      if (featureData.length === 0) return;

      const label_illness = pattern === 'illness_precursor' && wasConfirmed ? 1 : 0;
      const label_recovery = pattern === 'recovery_deficit' && wasConfirmed ? 1 : 0;

      await clickhouse.insert('ml_training_data', [{
        health_id: healthId,
        feature_date: detectedDate,
        hrv_avg: featureData[0].hrv_avg,
        rhr_avg: featureData[0].rhr_avg,
        sleep_duration_avg: featureData[0].sleep_avg,
        label_illness,
        label_recovery_deficit: label_recovery,
      }]);

      logger.info(`[ClickHouseML] Updated training data for ${healthId}`);
    } catch (error) {
      logger.error('[ClickHouseML] Error updating training data:', error);
    }
  }

  async getPatternAccuracy(healthId: string, pattern: string | null): Promise<number> {
    if (!await this.ensureInitialized()) return 0.5;

    try {
      let sql = `
        SELECT
          countIf(outcome = 'confirmed') as confirmed,
          countIf(outcome = 'false_positive') as false_positive,
          count() as total
        FROM flo_health.detected_anomalies
        WHERE health_id = {healthId:String}
          AND outcome IS NOT NULL
      `;

      if (pattern) {
        sql += ` AND pattern_fingerprint = {pattern:String}`;
      }

      const result = await clickhouse.query<{
        confirmed: number;
        false_positive: number;
        total: number;
      }>(sql, { healthId, pattern });

      if (result.length === 0 || result[0].total === 0) {
        return 0.5;
      }

      return Number(result[0].confirmed) / Number(result[0].total);
    } catch (error) {
      logger.error('[ClickHouseML] Error getting pattern accuracy:', error);
      return 0.5;
    }
  }

  async getMLInsights(healthId: string): Promise<{
    totalPredictions: number;
    confirmedCount: number;
    falsePositiveCount: number;
    accuracyRate: number;
    patternBreakdown: Record<string, { total: number; confirmed: number; accuracy: number }>;
    recentAnomalies: AnomalyResult[];
  }> {
    if (!await this.ensureInitialized()) {
      return {
        totalPredictions: 0,
        confirmedCount: 0,
        falsePositiveCount: 0,
        accuracyRate: 0,
        patternBreakdown: {},
        recentAnomalies: [],
      };
    }

    try {
      const statsResult = await clickhouse.query<{
        pattern: string;
        total: number;
        confirmed: number;
      }>(`
        SELECT
          coalesce(pattern_fingerprint, 'single_metric') as pattern,
          count() as total,
          countIf(outcome = 'confirmed') as confirmed
        FROM flo_health.detected_anomalies
        WHERE health_id = {healthId:String}
          AND outcome IS NOT NULL
        GROUP BY pattern
      `, { healthId });

      const patternBreakdown: Record<string, { total: number; confirmed: number; accuracy: number }> = {};
      let totalPredictions = 0;
      let confirmedCount = 0;

      for (const row of statsResult) {
        const total = Number(row.total);
        const confirmed = Number(row.confirmed);
        totalPredictions += total;
        confirmedCount += confirmed;
        patternBreakdown[row.pattern] = {
          total,
          confirmed,
          accuracy: total > 0 ? confirmed / total : 0,
        };
      }

      const recentResult = await clickhouse.query<{
        anomaly_id: string;
        metric_type: string;
        current_value: number;
        baseline_value: number;
        deviation_pct: number;
        z_score: number | null;
        direction: string;
        severity: string;
        pattern_fingerprint: string | null;
        model_confidence: number;
        detected_at: string;
      }>(`
        SELECT *
        FROM flo_health.detected_anomalies
        WHERE health_id = {healthId:String}
        ORDER BY detected_at DESC
        LIMIT 10
      `, { healthId });

      const recentAnomalies: AnomalyResult[] = recentResult.map(r => ({
        anomalyId: r.anomaly_id,
        metricType: r.metric_type,
        currentValue: r.current_value,
        baselineValue: r.baseline_value,
        deviationPct: r.deviation_pct,
        zScore: r.z_score,
        direction: r.direction as 'above' | 'below',
        severity: r.severity as 'low' | 'moderate' | 'high',
        patternFingerprint: r.pattern_fingerprint,
        relatedMetrics: null,
        modelConfidence: r.model_confidence,
        detectedAt: r.detected_at || null,
      }));

      return {
        totalPredictions,
        confirmedCount,
        falsePositiveCount: totalPredictions - confirmedCount,
        accuracyRate: totalPredictions > 0 ? confirmedCount / totalPredictions : 0,
        patternBreakdown,
        recentAnomalies,
      };
    } catch (error) {
      logger.error('[ClickHouseML] Error getting ML insights:', error);
      return {
        totalPredictions: 0,
        confirmedCount: 0,
        falsePositiveCount: 0,
        accuracyRate: 0,
        patternBreakdown: {},
        recentAnomalies: [],
      };
    }
  }

  async getLearningContext(healthId: string): Promise<string> {
    const insights = await this.getMLInsights(healthId);

    if (insights.totalPredictions === 0) {
      return 'No historical prediction data available for this user yet. Using default thresholds.';
    }

    let context = `ML PREDICTION ACCURACY (ClickHouse):\n`;
    context += `- Total predictions: ${insights.totalPredictions}\n`;
    context += `- Confirmed correct: ${insights.confirmedCount} (${Math.round(insights.accuracyRate * 100)}%)\n`;
    context += `- False positives: ${insights.falsePositiveCount}\n\n`;

    context += `PATTERN-SPECIFIC ACCURACY:\n`;
    for (const [pattern, stats] of Object.entries(insights.patternBreakdown)) {
      context += `- ${pattern}: ${stats.confirmed}/${stats.total} (${Math.round(stats.accuracy * 100)}% accuracy)\n`;
    }

    if (insights.accuracyRate < 0.5) {
      context += `\n⚠️ Model accuracy is low for this user. Consider being more conservative with alerts.`;
    } else if (insights.accuracyRate > 0.8) {
      context += `\n✓ Model accuracy is high. Predictions for this user are typically reliable.`;
    }

    return context;
  }

  async simulateAnomaly(
    healthId: string,
    scenario: 'illness' | 'recovery' | 'single_metric'
  ): Promise<AnomalyResult[]> {
    let anomalies: AnomalyResult[];

    switch (scenario) {
      case 'illness':
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'wrist_temperature_deviation',
            currentValue: 0.6,
            baselineValue: 0.1,
            deviationPct: 500,
            zScore: 3.2,
            direction: 'above',
            severity: 'high',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: {
              wrist_temperature_deviation: { value: 0.6, deviation: 500 },
              respiratory_rate_bpm: { value: 18, deviation: 20 },
            },
            modelConfidence: 0.85,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'respiratory_rate_bpm',
            currentValue: 18,
            baselineValue: 15,
            deviationPct: 20,
            zScore: 2.1,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: null,
            modelConfidence: 0.75,
          },
        ];
        break;

      case 'recovery':
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'hrv_ms',
            currentValue: 35,
            baselineValue: 55,
            deviationPct: -36,
            zScore: -2.5,
            direction: 'below',
            severity: 'high',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: {
              hrv_ms: { value: 35, deviation: -36 },
              deep_sleep_min: { value: 30, deviation: -40 },
            },
            modelConfidence: 0.82,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'deep_sleep_min',
            currentValue: 30,
            baselineValue: 50,
            deviationPct: -40,
            zScore: -2.2,
            direction: 'below',
            severity: 'moderate',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: null,
            modelConfidence: 0.78,
          },
        ];
        break;

      case 'single_metric':
      default:
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'resting_heart_rate_bpm',
            currentValue: 72,
            baselineValue: 60,
            deviationPct: 20,
            zScore: 2.0,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: null,
            relatedMetrics: null,
            modelConfidence: 0.65,
          },
        ];
    }

    if (await this.ensureInitialized()) {
      await this.storeAnomalies(healthId, anomalies);
    }

    return anomalies;
  }

  // ==================== COMPREHENSIVE DATA SYNC METHODS ====================

  async syncNutritionData(healthId: string, daysBack: number | null = 90): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('nutrition_daily_metrics')
        .select('*')
        .eq('health_id', healthId)
        .order('local_date', { ascending: true });

      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        query = query.gte('local_date', startDateStr);
      }

      const { data: nutrition, error } = await query;

      if (error) {
        logger.error('[ClickHouseML] Error fetching nutrition from Supabase:', error);
        return 0;
      }

      if (!nutrition || nutrition.length === 0) {
        logger.debug(`[ClickHouseML] No nutrition data to sync for ${healthId}`);
        return 0;
      }

      const rows = nutrition.map(n => ({
        health_id: healthId,
        local_date: n.local_date,
        energy_kcal: n.energy_kcal,
        protein_g: n.protein_g,
        carbohydrates_g: n.carbohydrates_g,
        fat_total_g: n.fat_total_g,
        fat_saturated_g: n.fat_saturated_g,
        fat_monounsaturated_g: n.fat_monounsaturated_g,
        fat_polyunsaturated_g: n.fat_polyunsaturated_g,
        fiber_g: n.fiber_g,
        sugar_g: n.sugar_g,
        sodium_mg: n.sodium_mg,
        potassium_mg: n.potassium_mg,
        calcium_mg: n.calcium_mg,
        iron_mg: n.iron_mg,
        magnesium_mg: n.magnesium_mg,
        zinc_mg: n.zinc_mg,
        vitamin_a_mcg: n.vitamin_a_mcg,
        vitamin_c_mg: n.vitamin_c_mg,
        vitamin_d_mcg: n.vitamin_d_mcg,
        vitamin_e_mg: n.vitamin_e_mg,
        vitamin_k_mcg: n.vitamin_k_mcg,
        vitamin_b6_mg: n.vitamin_b6_mg,
        vitamin_b12_mcg: n.vitamin_b12_mcg,
        folate_mcg: n.folate_mcg,
        water_ml: n.dietary_water_ml,
        caffeine_mg: n.caffeine_mg,
        cholesterol_mg: n.cholesterol_mg,
      }));

      await clickhouse.insert('nutrition_metrics', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} nutrition records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Nutrition sync error:', error);
      return 0;
    }
  }

  async syncBiomarkerData(healthId: string, daysBack: number | null = 365): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      // Build query - if daysBack is null, get all history
      let query = supabase
        .from('biomarker_measurements')
        .select(`
          *,
          biomarker_test_sessions!inner (
            test_date,
            health_id,
            source
          )
        `)
        .eq('biomarker_test_sessions.health_id', healthId)
        .order('biomarker_test_sessions(test_date)', { ascending: true });

      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        query = query.gte('biomarker_test_sessions.test_date', startDateStr);
      }

      const { data: measurements, error } = await query;

      if (error) {
        logger.error('[ClickHouseML] Error fetching biomarkers from Supabase:', error);
        return 0;
      }

      if (!measurements || measurements.length === 0) {
        logger.debug(`[ClickHouseML] No biomarker data to sync for ${healthId}`);
        return 0;
      }

      const rows = measurements.map(m => {
        const rawDate = m.biomarker_test_sessions?.test_date;
        const testDate = rawDate ? rawDate.split('T')[0] : new Date().toISOString().split('T')[0];
        
        return {
          health_id: healthId,
          biomarker_id: m.id,
          biomarker_name: m.biomarker_id || 'unknown',
          value: m.value,
          unit: m.unit,
          reference_low: m.reference_low,
          reference_high: m.reference_high,
          test_date: testDate,
          session_id: m.session_id,
          source: m.biomarker_test_sessions?.source || 'blood_work',
        };
      });

      await clickhouse.insert('biomarkers', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} biomarker records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Biomarker sync error:', error);
      return 0;
    }
  }

  async syncLifeEvents(healthId: string, daysBack: number | null = 180): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('life_events')
        .select('*')
        .eq('health_id', healthId)
        .order('happened_at', { ascending: true });

      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        query = query.gte('happened_at', startDate.toISOString());
      }

      const { data: events, error } = await query;

      if (error) {
        logger.error('[ClickHouseML] Error fetching life events from Supabase:', error);
        return 0;
      }

      if (!events || events.length === 0) {
        logger.debug(`[ClickHouseML] No life events to sync for ${healthId}`);
        return 0;
      }

      const rows = events.map(e => ({
        health_id: healthId,
        event_id: e.id,
        event_type: e.event_type || 'unknown',
        category: e.category,
        description: e.description,
        severity: e.severity,
        occurred_at: new Date(e.happened_at).toISOString(),
        local_date: new Date(e.happened_at).toISOString().split('T')[0],
        metadata: e.parsed_data ? JSON.stringify(e.parsed_data) : null,
      }));

      await clickhouse.insert('life_events', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} life events for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Life events sync error:', error);
      return 0;
    }
  }

  async syncEnvironmentalData(healthId: string, daysBack?: number): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('weather_daily_cache')
        .select('*')
        .eq('health_id', healthId)
        .order('date', { ascending: true });

      if (daysBack !== undefined) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        query = query.gte('date', startDateStr);
      }

      const { data: weather, error } = await query;

      if (error) {
        logger.error('[ClickHouseML] Error fetching weather from Supabase:', error);
        return 0;
      }

      if (!weather || weather.length === 0) {
        logger.debug(`[ClickHouseML] No environmental data to sync for ${healthId}`);
        return 0;
      }

      const rows = weather.map(w => {
        const weatherData = w.weather_data as Record<string, any> | null;
        const aqData = w.air_quality_data as Record<string, any> | null;
        const components = aqData?.components || {};
        
        const temperature = weatherData?.temperature ?? null;
        const aqi = aqData?.aqi ?? null;
        
        let heatStressScore = null;
        if (temperature !== null) {
          if (temperature > 35) heatStressScore = 1.0;
          else if (temperature > 30) heatStressScore = 0.7;
          else if (temperature > 27) heatStressScore = 0.4;
          else if (temperature < 0) heatStressScore = 0.8;
          else if (temperature < 5) heatStressScore = 0.5;
        }

        return {
          health_id: healthId,
          local_date: w.date,
          latitude: w.latitude,
          longitude: w.longitude,
          temperature_c: temperature,
          humidity_pct: weatherData?.humidity ?? null,
          pressure_hpa: weatherData?.pressure ?? null,
          uv_index: null,
          aqi: aqi,
          pm25: components.pm2_5 ?? components.pm25 ?? null,
          pm10: components.pm10 ?? null,
          ozone: components.o3 ?? null,
          no2: components.no2 ?? null,
          so2: components.so2 ?? null,
          co: components.co ?? null,
          nh3: components.nh3 ?? null,
          weather_condition: weatherData?.weatherMain ?? null,
          heat_stress_score: heatStressScore,
          air_quality_impact: aqi ? (aqi > 3 ? (aqi - 3) / 2 : 0) : null,
        };
      });

      await clickhouse.insert('environmental_data', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} environmental records for ${healthId} (with full AQI components)`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Environmental sync error:', error);
      return 0;
    }
  }

  async syncBodyCompositionData(healthId: string): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      // Get DEXA scans from diagnostics_studies
      const { data: dexaScans, error } = await supabase
        .from('diagnostics_studies')
        .select('*')
        .eq('health_id', healthId)
        .eq('type', 'dexa_scan')
        .order('study_date', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching DEXA from Supabase:', error);
        return 0;
      }

      if (!dexaScans || dexaScans.length === 0) {
        logger.debug(`[ClickHouseML] No body composition data to sync for ${healthId}`);
        return 0;
      }

      const rows = dexaScans.map(d => {
        const payload = d.ai_payload as Record<string, any> || {};
        const bodyComp = payload.body_composition || {};
        return {
          health_id: healthId,
          scan_id: d.id,
          scan_date: d.study_date,
          scan_type: 'dexa',
          total_body_fat_pct: bodyComp.total_body_fat_percent,
          visceral_fat_mass_g: bodyComp.vat_mass_g || payload.visceralFatMass,
          visceral_fat_area_cm2: bodyComp.vat_area_cm2,
          total_lean_mass_kg: bodyComp.total_lean_mass_kg || payload.totalLeanMass,
          appendicular_lean_mass_kg: bodyComp.appendicular_lean_mass_kg,
          bone_mineral_density: bodyComp.bone_mineral_density,
          bone_mineral_content_g: bodyComp.bone_mineral_content_g,
          android_fat_pct: bodyComp.android_fat_percent,
          gynoid_fat_pct: bodyComp.gynoid_fat_percent,
          trunk_fat_pct: bodyComp.trunk_fat_percent,
          leg_fat_pct: bodyComp.leg_fat_percent,
          arm_fat_pct: bodyComp.arm_fat_percent,
          resting_metabolic_rate: bodyComp.resting_metabolic_rate,
        };
      });

      await clickhouse.insert('body_composition', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} body composition records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Body composition sync error:', error);
      return 0;
    }
  }

  async syncUserDemographics(healthId: string): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('health_id', healthId)
        .single();

      if (error || !profile) {
        logger.debug(`[ClickHouseML] No user profile to sync for ${healthId}`);
        return 0;
      }

      await clickhouse.insert('user_demographics', [{
        health_id: healthId,
        birth_year: profile.birth_year,
        sex: profile.sex || 'unknown',
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
        activity_level: profile.activity_level || 'moderate',
        timezone: profile.timezone,
      }]);

      logger.info(`[ClickHouseML] Synced user demographics for ${healthId}`);
      return 1;
    } catch (error) {
      logger.error('[ClickHouseML] Demographics sync error:', error);
      return 0;
    }
  }

  async syncReadinessScores(healthId: string, daysBack: number | null = 90): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      // Readiness data is stored in Neon (primary DB), not Supabase
      // Need to get userId from healthId first, then query Neon
      const { getUserIdFromHealthId } = await import('./supabaseHealthStorage');
      const userId = await getUserIdFromHealthId(healthId);
      
      if (!userId) {
        logger.debug(`[ClickHouseML] No userId found for health_id ${healthId}`);
        return 0;
      }

      const { db } = await import('../db');
      const { userDailyReadiness } = await import('@shared/schema');
      const { gte, eq, and, desc } = await import('drizzle-orm');

      // Build query - if daysBack is null, get all history
      let whereClause;
      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        whereClause = and(
          eq(userDailyReadiness.userId, userId),
          gte(userDailyReadiness.date, startDateStr)
        );
      } else {
        whereClause = eq(userDailyReadiness.userId, userId);
      }

      const readiness = await db
        .select()
        .from(userDailyReadiness)
        .where(whereClause)
        .orderBy(desc(userDailyReadiness.date));

      if (!readiness || readiness.length === 0) {
        logger.debug(`[ClickHouseML] No readiness data to sync for ${healthId}`);
        return 0;
      }

      const rows = readiness.map(r => ({
        health_id: healthId,
        local_date: r.date,
        readiness_score: r.readinessScore || 0,
        readiness_zone: r.readinessBucket || 'unknown',
        recovery_component: r.recoveryScore,
        sleep_component: r.sleepScore,
        strain_component: r.loadScore,
        hrv_component: r.trendScore,
        environmental_impact: null,
        recovery_boost: null,
        factors: r.notesJson ? JSON.stringify(r.notesJson) : null,
      }));

      await clickhouse.insert('readiness_scores', rows);
      logger.info(`[ClickHouseML] Synced ${rows.length} readiness records for ${healthId}`);
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Readiness sync error:', error);
      return 0;
    }
  }

  async syncTrainingLoad(healthId: string, daysBack: number | null = 90): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('user_daily_metrics')
        .select('*')
        .eq('health_id', healthId);

      if (daysBack !== null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];
        query = query.gte('local_date', startDateStr);
      }

      // Get daily metrics with workout data
      const { data: dailyMetrics, error } = await query
        .order('local_date', { ascending: true });

      if (error) {
        logger.error('[ClickHouseML] Error fetching training load from Supabase:', error);
        return 0;
      }

      if (!dailyMetrics || dailyMetrics.length === 0) {
        return 0;
      }

      // Calculate acute/chronic training load (simplified ACWR)
      const rows: any[] = [];
      const acuteWindow = 7;
      const chronicWindow = 28;

      for (let i = 0; i < dailyMetrics.length; i++) {
        const dm = dailyMetrics[i];
        const dailyLoad = (dm.active_energy_kcal || 0) + (dm.exercise_minutes || 0) * 5;

        // Calculate rolling averages
        const acuteStart = Math.max(0, i - acuteWindow + 1);
        const chronicStart = Math.max(0, i - chronicWindow + 1);

        let acuteSum = 0, acuteCount = 0;
        let chronicSum = 0, chronicCount = 0;

        for (let j = acuteStart; j <= i; j++) {
          const load = (dailyMetrics[j].active_energy_kcal || 0) + (dailyMetrics[j].exercise_minutes || 0) * 5;
          acuteSum += load;
          acuteCount++;
        }

        for (let j = chronicStart; j <= i; j++) {
          const load = (dailyMetrics[j].active_energy_kcal || 0) + (dailyMetrics[j].exercise_minutes || 0) * 5;
          chronicSum += load;
          chronicCount++;
        }

        const acuteLoad = acuteCount > 0 ? acuteSum / acuteCount : 0;
        const chronicLoad = chronicCount > 0 ? chronicSum / chronicCount : 0;
        const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

        let recoveryStatus = 'optimal';
        if (ratio < 0.8) recoveryStatus = 'undertrained';
        else if (ratio > 1.5) recoveryStatus = 'overreaching';
        else if (ratio > 1.3) recoveryStatus = 'high_strain';

        rows.push({
          health_id: healthId,
          local_date: dm.local_date,
          acute_load: Number(acuteLoad.toFixed(4)),
          chronic_load: Number(chronicLoad.toFixed(4)),
          training_load_ratio: Number(ratio.toFixed(4)),
          strain_score: Number(dailyLoad.toFixed(4)),
          workout_count: Math.floor(dm.workout_count || 0),
          total_workout_minutes: Math.floor(dm.exercise_minutes || 0),
          total_active_kcal: Number((dm.active_energy_kcal || 0).toFixed(4)),
          zone_distribution: null,
          recovery_status: recoveryStatus,
        });
      }

      if (rows.length > 0) {
        await clickhouse.insert('training_load', rows);
        logger.info(`[ClickHouseML] Synced ${rows.length} training load records for ${healthId}`);
      }
      return rows.length;
    } catch (error) {
      logger.error('[ClickHouseML] Training load sync error:', error);
      return 0;
    }
  }

  async syncCGMGlucoseData(healthId: string, daysBack: number | null = 90): Promise<number> {
    // Placeholder for future CGM integration
    // Schema is ready - will sync from HealthKit glucose samples or direct CGM API
    logger.debug(`[ClickHouseML] CGM sync not yet implemented for ${healthId}`);
    return 0;
  }

  async syncAllHealthData(healthId: string, daysBack: number | null = 90): Promise<{
    healthMetrics: number;
    nutrition: number;
    biomarkers: number;
    lifeEvents: number;
    environmental: number;
    bodyComposition: number;
    demographics: number;
    readiness: number;
    trainingLoad: number;
    total: number;
  }> {
    const daysLabel = daysBack === null ? 'full history' : `${daysBack} days back`;
    logger.info(`[ClickHouseML] Starting comprehensive data sync for ${healthId} (${daysLabel})`);

    const results = await Promise.all([
      this.syncHealthDataFromSupabase(healthId, daysBack),
      this.syncNutritionData(healthId, daysBack),
      this.syncBiomarkerData(healthId, daysBack), // Full history when null
      this.syncLifeEvents(healthId, daysBack),
      this.syncEnvironmentalData(healthId, daysBack),
      this.syncBodyCompositionData(healthId), // Always syncs all DEXA scans
      this.syncUserDemographics(healthId),
      this.syncReadinessScores(healthId, daysBack),
      this.syncTrainingLoad(healthId, daysBack),
    ]);

    const summary = {
      healthMetrics: results[0],
      nutrition: results[1],
      biomarkers: results[2],
      lifeEvents: results[3],
      environmental: results[4],
      bodyComposition: results[5],
      demographics: results[6],
      readiness: results[7],
      trainingLoad: results[8],
      total: results.reduce((a, b) => a + b, 0),
    };

    logger.info(`[ClickHouseML] Comprehensive sync complete: ${summary.total} total records`, summary);
    return summary;
  }

  /**
   * Clear existing data for a user from all ClickHouse tables.
   * Used before full history sync to prevent duplicates.
   */
  async clearUserData(healthId: string): Promise<void> {
    if (!await this.ensureInitialized()) return;

    const tables = [
      'health_metrics',
      'nutrition_metrics',
      'biomarkers',
      'life_events',
      'environmental_data',
      'body_composition',
      'user_demographics',
      'readiness_scores',
      'training_load',
    ];

    for (const table of tables) {
      try {
        await clickhouse.command(`
          ALTER TABLE flo_health.${table}
          DELETE WHERE health_id = '${healthId}'
        `);
      } catch (error) {
        logger.warn(`[ClickHouseML] Failed to clear ${table} for ${healthId}:`, error);
      }
    }

    logger.info(`[ClickHouseML] Cleared existing data for ${healthId} from ${tables.length} tables`);
  }

  /**
   * Sync complete user history to ClickHouse for long-term pattern analysis.
   * This enables pattern memory - recognizing recurring patterns over months/years.
   * Clears existing data first to prevent duplicates, then syncs full history.
   */
  async syncFullHistory(healthId: string): Promise<{
    healthMetrics: number;
    nutrition: number;
    biomarkers: number;
    lifeEvents: number;
    environmental: number;
    bodyComposition: number;
    demographics: number;
    readiness: number;
    trainingLoad: number;
    total: number;
  }> {
    logger.info(`[ClickHouseML] Starting FULL HISTORY sync for ${healthId} (pattern memory enabled)`);
    
    await this.clearUserData(healthId);
    
    return this.syncAllHealthData(healthId, null);
  }

  async getDataCoverageSummary(healthId: string): Promise<{
    healthMetrics: { count: number; earliestDate: string | null; latestDate: string | null };
    nutrition: { count: number; earliestDate: string | null; latestDate: string | null };
    biomarkers: { count: number; earliestDate: string | null; latestDate: string | null };
    lifeEvents: { count: number; earliestDate: string | null; latestDate: string | null };
    environmental: { count: number; earliestDate: string | null; latestDate: string | null };
    bodyComposition: { count: number; earliestDate: string | null; latestDate: string | null };
    demographics: { count: number; earliestDate: string | null; latestDate: string | null };
    readiness: { count: number; earliestDate: string | null; latestDate: string | null };
    trainingLoad: { count: number; earliestDate: string | null; latestDate: string | null };
    cgmGlucose: { count: number; earliestDate: string | null; latestDate: string | null };
  }> {
    if (!await this.ensureInitialized()) {
      const empty = { count: 0, earliestDate: null, latestDate: null };
      return {
        healthMetrics: empty,
        nutrition: empty,
        biomarkers: empty,
        lifeEvents: empty,
        environmental: empty,
        bodyComposition: empty,
        demographics: empty,
        readiness: empty,
        trainingLoad: empty,
        cgmGlucose: empty,
      };
    }

    const queryTable = async (table: string, dateCol: string) => {
      try {
        const result = await clickhouse.query<{
          cnt: number;
          earliest: string | null;
          latest: string | null;
        }>(`
          SELECT
            count() as cnt,
            min(${dateCol}) as earliest,
            max(${dateCol}) as latest
          FROM flo_health.${table}
          WHERE health_id = {healthId:String}
        `, { healthId });

        if (result.length > 0) {
          return {
            count: Number(result[0].cnt),
            earliestDate: result[0].earliest,
            latestDate: result[0].latest,
          };
        }
      } catch (e) {
        logger.warn(`[ClickHouseML] Error querying ${table}: ${e instanceof Error ? e.message : String(e)}`);
      }
      return { count: 0, earliestDate: null, latestDate: null };
    };

    const [healthMetrics, nutrition, biomarkers, lifeEvents, environmental, bodyComposition, demographics, readiness, trainingLoad, cgmGlucose] = await Promise.all([
      queryTable('health_metrics', 'local_date'),
      queryTable('nutrition_metrics', 'local_date'),
      queryTable('biomarkers', 'test_date'),
      queryTable('life_events', 'local_date'),
      queryTable('environmental_data', 'local_date'),
      queryTable('body_composition', 'scan_date'),
      queryTable('user_demographics', 'updated_at'),
      queryTable('readiness_scores', 'local_date'),
      queryTable('training_load', 'local_date'),
      queryTable('cgm_glucose', 'local_date'),
    ]);

    return { healthMetrics, nutrition, biomarkers, lifeEvents, environmental, bodyComposition, demographics, readiness, trainingLoad, cgmGlucose };
  }

  /**
   * Find matching historical patterns for a given anomaly signature.
   * Compares current anomaly's metric signature against stored patterns.
   */
  async findMatchingPatterns(
    healthId: string,
    metricSignature: string,
    zScores: Record<string, number>,
    similarityThreshold: number = 0.7
  ): Promise<{
    pattern_id: string;
    pattern_name: string;
    confidence_score: number;
    occurrence_count: number;
    typical_outcome: string | null;
    last_observed: string;
    days_since_last_seen: number;
    similarity_score: number;
  }[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      const patterns = await clickhouse.query<{
        pattern_id: string;
        pattern_name: string;
        pattern_fingerprint: string;
        confidence_score: number;
        occurrence_count: number;
        typical_outcome: string | null;
        last_observed: string;
        metric_signature: string;
        average_z_scores: string;
      }>(`
        SELECT
          pattern_id,
          pattern_name,
          pattern_fingerprint,
          confidence_score,
          occurrence_count,
          typical_outcome,
          last_observed,
          metric_signature,
          average_z_scores
        FROM flo_health.pattern_library
        WHERE health_id = {healthId:String}
          AND confidence_score >= 0.3
        ORDER BY occurrence_count DESC
        LIMIT 100
      `, { healthId });

      const currentMetrics = new Set(metricSignature.split(','));
      const matches: {
        pattern_id: string;
        pattern_name: string;
        confidence_score: number;
        occurrence_count: number;
        typical_outcome: string | null;
        last_observed: string;
        days_since_last_seen: number;
        similarity_score: number;
      }[] = [];

      for (const pattern of patterns) {
        const patternMetrics = new Set(pattern.metric_signature.split(',').filter(m => m.trim()));
        
        const intersection = new Set([...currentMetrics].filter(x => patternMetrics.has(x)));
        const union = new Set([...currentMetrics, ...patternMetrics]);
        const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

        if (intersection.size === 0) continue;

        let cosineSimilarity = 0;
        let hasDirectionMismatch = false;
        try {
          const patternZScores = JSON.parse(pattern.average_z_scores || '{}');
          let dotProduct = 0;
          let currentMag = 0;
          let patternMag = 0;
          let sumSquaredDiff = 0;
          let count = 0;

          for (const metric of intersection) {
            if (zScores[metric] !== undefined && patternZScores[metric] !== undefined) {
              const currentZ = zScores[metric];
              const patternZ = patternZScores[metric];
              
              const sameDirection = (currentZ >= 0) === (patternZ >= 0);
              if (!sameDirection) {
                hasDirectionMismatch = true;
                break;
              }

              dotProduct += currentZ * patternZ;
              currentMag += currentZ * currentZ;
              patternMag += patternZ * patternZ;
              sumSquaredDiff += Math.pow(currentZ - patternZ, 2);
              count++;
            }
          }

          if (hasDirectionMismatch) continue;

          if (count > 0 && currentMag > 0 && patternMag > 0) {
            cosineSimilarity = dotProduct / (Math.sqrt(currentMag) * Math.sqrt(patternMag));
            cosineSimilarity = (cosineSimilarity + 1) / 2;
          }

          const euclideanDistance = Math.sqrt(sumSquaredDiff);
          const normalizedEuclidean = Math.exp(-euclideanDistance / (count * 1.5));

          cosineSimilarity = cosineSimilarity * normalizedEuclidean;
        } catch {
          cosineSimilarity = 0;
        }

        const similarityScore = 
          jaccardSimilarity * 0.20 + 
          cosineSimilarity * 0.80;

        if (similarityScore >= similarityThreshold) {
          const lastObserved = new Date(pattern.last_observed);
          const daysSince = Math.floor((Date.now() - lastObserved.getTime()) / (1000 * 60 * 60 * 24));
          
          matches.push({
            pattern_id: pattern.pattern_id,
            pattern_name: pattern.pattern_name,
            confidence_score: Number(pattern.confidence_score),
            occurrence_count: Number(pattern.occurrence_count),
            typical_outcome: pattern.typical_outcome,
            last_observed: pattern.last_observed,
            days_since_last_seen: daysSince,
            similarity_score: similarityScore,
          });
        }
      }

      matches.sort((a, b) => b.similarity_score - a.similarity_score);
      logger.info(`[ClickHouseML] Found ${matches.length} matching patterns for ${healthId}`);
      return matches.slice(0, 10);
    } catch (error) {
      logger.error('[ClickHouseML] Pattern matching error:', error);
      return [];
    }
  }

  /**
   * Record a pattern occurrence when an anomaly matches a known pattern.
   */
  async recordPatternOccurrence(
    healthId: string,
    patternId: string,
    anomalyId: string,
    zScores: Record<string, number>,
    metricValues: Record<string, number>,
    severity: string
  ): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const occurrenceId = randomUUID();
      const now = new Date();

      await clickhouse.insert('pattern_occurrences', [{
        occurrence_id: occurrenceId,
        health_id: healthId,
        pattern_id: patternId,
        anomaly_id: anomalyId,
        detected_at: now.toISOString(),
        detection_date: now.toISOString().split('T')[0],
        z_scores: JSON.stringify(zScores),
        metric_values: JSON.stringify(metricValues),
        severity,
        outcome: null,
        outcome_recorded_at: null,
        user_notes: null,
      }]);

      await clickhouse.command(`
        ALTER TABLE flo_health.pattern_library
        UPDATE
          last_observed = '${now.toISOString().split('T')[0]}',
          occurrence_count = occurrence_count + 1,
          updated_at = now64(3)
        WHERE pattern_id = '${patternId}' AND health_id = '${healthId}'
      `);

      logger.info(`[ClickHouseML] Recorded pattern occurrence for pattern ${patternId}`);
    } catch (error) {
      logger.error('[ClickHouseML] Record pattern occurrence error:', error);
    }
  }

  /**
   * Generate a pattern fingerprint that uniquely identifies a pattern based on:
   * - Which metrics are involved (sorted)
   * - Signed quantized Z-score value (0.5 step granularity, preserves full range)
   * Format: metric1:+2.0|metric2:-1.5|metric3:+6.5
   */
  private generatePatternFingerprint(metricSignature: string, zScores: Record<string, number>): string {
    const sortedMetrics = metricSignature.split(',').filter(m => m.trim()).sort();
    const components: string[] = [];

    for (const metric of sortedMetrics) {
      const z = zScores[metric];
      if (z === undefined) continue;

      const signedQuantized = Math.round(z * 2) / 2;

      components.push(`${metric}:${signedQuantized >= 0 ? '+' : ''}${signedQuantized.toFixed(1)}`);
    }

    return components.join('|');
  }

  /**
   * Create or update a pattern in the pattern library.
   * Generates a fingerprint based on the metrics involved and their Z-scores.
   */
  async upsertPattern(
    healthId: string,
    patternName: string,
    metricSignature: string,
    zScores: Record<string, number>,
    description?: string,
    seasonalPattern?: string
  ): Promise<string | null> {
    if (!await this.ensureInitialized()) return null;

    try {
      const sortedMetrics = metricSignature.split(',').filter(m => m.trim()).sort().join(',');
      const sortedZScores: Record<string, number> = {};
      const metricList = sortedMetrics.split(',');
      for (const m of metricList) {
        if (zScores[m] !== undefined) {
          sortedZScores[m] = Math.round(zScores[m] * 10) / 10;
        }
      }
      
      const fingerprint = this.generatePatternFingerprint(metricSignature, zScores);

      const existing = await clickhouse.query<{ pattern_id: string }>(`
        SELECT pattern_id
        FROM flo_health.pattern_library
        WHERE health_id = {healthId:String}
          AND pattern_fingerprint = {fingerprint:String}
        LIMIT 1
      `, { healthId, fingerprint });

      const now = new Date();
      const today = now.toISOString().split('T')[0];

      if (existing.length > 0) {
        await clickhouse.command(`
          ALTER TABLE flo_health.pattern_library
          UPDATE
            last_observed = '${today}',
            occurrence_count = occurrence_count + 1,
            average_z_scores = '${JSON.stringify(sortedZScores)}',
            updated_at = now64(3)
          WHERE pattern_id = '${existing[0].pattern_id}' AND health_id = '${healthId}'
        `);
        logger.info(`[ClickHouseML] Updated existing pattern ${existing[0].pattern_id}`);
        return existing[0].pattern_id;
      }

      const patternId = randomUUID();
      await clickhouse.insert('pattern_library', [{
        pattern_id: patternId,
        health_id: healthId,
        pattern_fingerprint: fingerprint,
        pattern_name: patternName,
        pattern_description: description || null,
        first_observed: today,
        last_observed: today,
        occurrence_count: 1,
        confirmation_count: 0,
        false_positive_count: 0,
        confidence_score: 0.5,
        typical_duration_days: null,
        typical_outcome: null,
        outcome_details: null,
        seasonal_pattern: seasonalPattern || null,
        metric_signature: sortedMetrics,
        average_z_scores: JSON.stringify(sortedZScores),
        preceding_events: null,
      }]);

      logger.info(`[ClickHouseML] Created new pattern ${patternId}: ${patternName}`);
      return patternId;
    } catch (error) {
      logger.error('[ClickHouseML] Upsert pattern error:', error);
      return null;
    }
  }

  /**
   * Detect seasonal patterns in the user's health data.
   * Analyzes historical data to find recurring patterns by month/season.
   */
  async detectSeasonalPatterns(healthId: string): Promise<{
    season: string;
    metrics_affected: string[];
    direction: 'increase' | 'decrease';
    magnitude_pct: number;
    confidence: number;
    years_observed: number;
  }[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      const seasonalData = await clickhouse.query<{
        month: number;
        metric_type: string;
        avg_value: number;
        sample_count: number;
        min_date: string;
        max_date: string;
      }>(`
        SELECT
          toMonth(local_date) as month,
          metric_type,
          avg(value) as avg_value,
          count() as sample_count,
          min(local_date) as min_date,
          max(local_date) as max_date
        FROM flo_health.health_metrics
        WHERE health_id = {healthId:String}
          AND local_date >= today() - INTERVAL 5 YEAR
        GROUP BY month, metric_type
        HAVING sample_count >= 14
        ORDER BY metric_type, month
      `, { healthId });

      const metricsByType: Record<string, { month: number; avg: number; count: number; minDate: string; maxDate: string }[]> = {};
      for (const row of seasonalData) {
        if (!metricsByType[row.metric_type]) {
          metricsByType[row.metric_type] = [];
        }
        metricsByType[row.metric_type].push({
          month: Number(row.month),
          avg: Number(row.avg_value),
          count: Number(row.sample_count),
          minDate: row.min_date,
          maxDate: row.max_date,
        });
      }

      const metricsWithFullYear = Object.entries(metricsByType).filter(
        ([_, monthData]) => monthData.length >= 12
      );

      if (metricsWithFullYear.length === 0) {
        logger.debug('[ClickHouseML] No metrics have 12+ months of data for seasonal analysis');
        return [];
      }

      const seasonalPatterns: {
        season: string;
        metrics_affected: string[];
        direction: 'increase' | 'decrease';
        magnitude_pct: number;
        confidence: number;
        years_observed: number;
      }[] = [];

      const seasons = [
        { name: 'winter', months: [12, 1, 2] },
        { name: 'spring', months: [3, 4, 5] },
        { name: 'summer', months: [6, 7, 8] },
        { name: 'fall', months: [9, 10, 11] },
      ];

      for (const season of seasons) {
        const metricsAffected: { metric: string; direction: 'increase' | 'decrease'; magnitude: number; dateSpanYears: number }[] = [];

        for (const [metric, monthlyData] of metricsWithFullYear) {
          const yearlyAvg = monthlyData.reduce((sum, d) => sum + d.avg, 0) / monthlyData.length;
          if (yearlyAvg === 0) continue;
          
          const seasonalMonths = monthlyData.filter(d => season.months.includes(d.month));
          
          if (seasonalMonths.length >= 2) {
            const seasonAvg = seasonalMonths.reduce((sum, d) => sum + d.avg, 0) / seasonalMonths.length;
            const deviation = ((seasonAvg - yearlyAvg) / yearlyAvg) * 100;

            if (Math.abs(deviation) >= 10) {
              const allDates = monthlyData.map(d => d.minDate).concat(monthlyData.map(d => d.maxDate));
              const minDate = new Date(allDates.reduce((a, b) => a < b ? a : b));
              const maxDate = new Date(allDates.reduce((a, b) => a > b ? a : b));
              const dateSpanMs = maxDate.getTime() - minDate.getTime();
              const dateSpanYears = Math.max(1, Math.round(dateSpanMs / (365.25 * 24 * 60 * 60 * 1000)));
              
              metricsAffected.push({
                metric,
                direction: deviation > 0 ? 'increase' : 'decrease',
                magnitude: Math.abs(deviation),
                dateSpanYears,
              });
            }
          }
        }

        if (metricsAffected.length > 0) {
          const avgMagnitude = metricsAffected.reduce((sum, m) => sum + m.magnitude, 0) / metricsAffected.length;
          const primaryDirection = metricsAffected.filter(m => m.direction === 'increase').length >= 
                                   metricsAffected.filter(m => m.direction === 'decrease').length ? 'increase' : 'decrease';
          
          const maxYearsObserved = Math.max(...metricsAffected.map(m => m.dateSpanYears));

          seasonalPatterns.push({
            season: season.name,
            metrics_affected: metricsAffected.map(m => m.metric),
            direction: primaryDirection,
            magnitude_pct: Math.round(avgMagnitude * 10) / 10,
            confidence: Math.min(0.9, 0.4 + (metricsAffected.length * 0.1) + (maxYearsObserved * 0.1)),
            years_observed: maxYearsObserved,
          });
        }
      }

      logger.info(`[ClickHouseML] Detected ${seasonalPatterns.length} seasonal patterns for ${healthId}`);
      return seasonalPatterns;
    } catch (error) {
      logger.error('[ClickHouseML] Seasonal pattern detection error:', error);
      return [];
    }
  }

  /**
   * Get pattern context for Flō Oracle - enriches AI context with pattern memory.
   */
  async getPatternContextForOracle(healthId: string): Promise<string> {
    if (!await this.ensureInitialized()) return '';

    try {
      const recentPatterns = await clickhouse.query<{
        pattern_name: string;
        occurrence_count: number;
        last_observed: string;
        typical_outcome: string | null;
        confidence_score: number;
      }>(`
        SELECT
          pattern_name,
          occurrence_count,
          last_observed,
          typical_outcome,
          confidence_score
        FROM flo_health.pattern_library
        WHERE health_id = {healthId:String}
          AND occurrence_count >= 2
          AND confidence_score >= 0.5
        ORDER BY last_observed DESC
        LIMIT 5
      `, { healthId });

      if (recentPatterns.length === 0) return '';

      const seasonalPatterns = await this.detectSeasonalPatterns(healthId);

      let context = '\n## Pattern Memory\n';
      context += 'The following recurring patterns have been observed:\n';

      for (const p of recentPatterns) {
        const daysAgo = Math.floor((Date.now() - new Date(p.last_observed).getTime()) / (1000 * 60 * 60 * 24));
        context += `- **${p.pattern_name}** (seen ${p.occurrence_count}x, last ${daysAgo} days ago)`;
        if (p.typical_outcome) {
          context += `: typically leads to ${p.typical_outcome}`;
        }
        context += '\n';
      }

      if (seasonalPatterns.length > 0) {
        context += '\n### Seasonal Trends\n';
        for (const sp of seasonalPatterns) {
          context += `- During **${sp.season}**: ${sp.metrics_affected.join(', ')} typically ${sp.direction} by ~${sp.magnitude_pct}%\n`;
        }
      }

      return context;
    } catch (error) {
      logger.error('[ClickHouseML] Pattern context error:', error);
      return '';
    }
  }
}

export const clickhouseBaselineEngine = new ClickHouseBaselineEngine();
