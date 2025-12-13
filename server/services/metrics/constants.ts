/**
 * Canonical ClickHouse Metric Type Names
 * 
 * This is the SINGLE SOURCE OF TRUTH for all metric type names used in ClickHouse queries.
 * All services that query ClickHouse health_metrics table MUST use these constants.
 * 
 * IMPORTANT: Do NOT use legacy names like 'hrv', 'resting_heart_rate', 'sleep_duration', 'deep_sleep'.
 * These names will NOT match data in ClickHouse and queries will return empty results.
 */

export const CLICKHOUSE_METRIC_TYPES = {
  // Core biometrics
  HRV: 'hrv_ms',
  RESTING_HEART_RATE: 'resting_heart_rate_bpm',
  RESPIRATORY_RATE: 'respiratory_rate_bpm',
  OXYGEN_SATURATION: 'oxygen_saturation_pct',
  BODY_TEMPERATURE: 'body_temperature_c',
  WRIST_TEMP_DEVIATION: 'wrist_temperature_deviation',
  
  // Sleep metrics (in minutes)
  SLEEP_DURATION: 'sleep_duration_min',
  DEEP_SLEEP: 'deep_sleep_min',
  REM_SLEEP: 'rem_sleep_min',
  CORE_SLEEP: 'core_sleep_min',
  TIME_IN_BED: 'time_in_bed_min',
  SLEEP_LATENCY: 'sleep_latency_min',
  WASO: 'waso_min',
  SLEEP_EFFICIENCY: 'sleep_efficiency_pct',
  SLEEP_HRV: 'sleep_hrv_ms',
  SLEEP_RHR: 'sleep_rhr_bpm',
  
  // Activity metrics
  STEPS: 'steps',
  ACTIVE_ENERGY: 'active_energy',
  EXERCISE_MINUTES: 'exercise_minutes',
  STAND_HOURS: 'stand_hours',
  FLIGHTS_CLIMBED: 'flights_climbed',
  DISTANCE: 'distance_km',
  BASAL_ENERGY: 'basal_energy',
  VO2_MAX: 'vo2_max',
  
  // Body composition
  WEIGHT: 'weight_kg',
  BODY_FAT: 'body_fat_pct',
  LEAN_MASS: 'lean_mass_kg',
  BMI: 'bmi',
  
  // CGM metrics
  CGM_GLUCOSE: 'cgm_glucose',
  GLUCOSE: 'glucose',
  TIME_IN_RANGE: 'time_in_range',
  
  // Subjective metrics
  ENERGY_LEVEL: 'energy_level',
  MENTAL_CLARITY: 'mental_clarity',
  MOOD: 'mood',
  STRESS_LEVEL: 'stress_level',
  
  // Readiness
  READINESS_SCORE: 'readiness_score',
  RECOVERY_SCORE: 'recovery_score',
  
  // Mindfulness
  MINDFULNESS_MINUTES: 'mindfulness_minutes',
} as const;

export type ClickHouseMetricType = typeof CLICKHOUSE_METRIC_TYPES[keyof typeof CLICKHOUSE_METRIC_TYPES];

/**
 * Maps legacy metric names to canonical ClickHouse names.
 * Use this to migrate old code or translate user-facing names.
 */
export const LEGACY_TO_CANONICAL: Record<string, string> = {
  // Legacy names -> ClickHouse names
  'hrv': 'hrv_ms',
  'hrv_sdnn_ms': 'hrv_ms',
  'resting_heart_rate': 'resting_heart_rate_bpm',
  'resting_hr': 'resting_heart_rate_bpm',
  'rhr': 'resting_heart_rate_bpm',
  'sleep_duration': 'sleep_duration_min',
  'sleep_hours': 'sleep_duration_min', // Note: sleep_hours needs conversion (multiply by 60)
  'deep_sleep': 'deep_sleep_min',
  'deep_sleep_hours': 'deep_sleep_min', // Note: needs conversion
  'rem_sleep': 'rem_sleep_min',
  'rem_sleep_hours': 'rem_sleep_min', // Note: needs conversion
  'core_sleep': 'core_sleep_min',
  'core_sleep_hours': 'core_sleep_min', // Note: needs conversion
  'respiratory_rate': 'respiratory_rate_bpm',
  'oxygen_saturation': 'oxygen_saturation_pct',
  'body_temperature': 'body_temperature_c',
  'exercise': 'exercise_minutes',
  'weight': 'weight_kg',
  'body_fat': 'body_fat_pct',
  'lean_mass': 'lean_mass_kg',
  'distance': 'distance_km',
  'mindfulness': 'mindfulness_minutes',
  'sleep_total_minutes': 'sleep_duration_min',
  'sleep_deep_minutes': 'deep_sleep_min',
};

/**
 * Resolves a metric name to its canonical ClickHouse name.
 * Returns the input if already canonical or unknown.
 */
export function resolveMetricName(name: string): string {
  return LEGACY_TO_CANONICAL[name] ?? name;
}

/**
 * Checks if a metric name is a canonical ClickHouse name.
 */
export function isCanonicalMetricName(name: string): boolean {
  const canonicalNames = new Set(Object.values(CLICKHOUSE_METRIC_TYPES));
  return canonicalNames.has(name as ClickHouseMetricType);
}

/**
 * Gets display name for a metric (for UI/logs).
 */
export const METRIC_DISPLAY_NAMES: Record<string, string> = {
  'hrv_ms': 'HRV',
  'resting_heart_rate_bpm': 'Resting Heart Rate',
  'respiratory_rate_bpm': 'Respiratory Rate',
  'oxygen_saturation_pct': 'Oxygen Saturation',
  'sleep_duration_min': 'Sleep Duration',
  'deep_sleep_min': 'Deep Sleep',
  'rem_sleep_min': 'REM Sleep',
  'core_sleep_min': 'Core Sleep',
  'sleep_efficiency_pct': 'Sleep Efficiency',
  'steps': 'Steps',
  'active_energy': 'Active Calories',
  'exercise_minutes': 'Exercise',
  'weight_kg': 'Weight',
  'body_fat_pct': 'Body Fat',
  'wrist_temperature_deviation': 'Wrist Temp Deviation',
  'readiness_score': 'Readiness Score',
  'energy_level': 'Energy Level',
  'mental_clarity': 'Mental Clarity',
  'mood': 'Mood',
};

export function getMetricDisplayName(metricType: string): string {
  return METRIC_DISPLAY_NAMES[metricType] ?? metricType.replace(/_/g, ' ');
}
