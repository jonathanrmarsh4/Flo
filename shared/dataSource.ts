/**
 * Data Source Infrastructure
 * 
 * Defines the source of health data throughout the Flō platform.
 * Used to track where each data point originated and for ML segregation.
 */

// Supported data sources
export const DATA_SOURCES = {
  HEALTHKIT: 'healthkit',
  OURA: 'oura',
  DEXCOM: 'dexcom',
  MANUAL: 'manual',
} as const;

export type DataSource = typeof DATA_SOURCES[keyof typeof DATA_SOURCES];

// All valid data sources as an array (for validation)
export const ALL_DATA_SOURCES: DataSource[] = Object.values(DATA_SOURCES);

// Display names for UI
export const DATA_SOURCE_DISPLAY_NAMES: Record<DataSource, string> = {
  healthkit: 'Apple Health',
  oura: 'Oura Ring',
  dexcom: 'Dexcom CGM',
  manual: 'Manual Entry',
};

// Icons for UI (using Lucide icon names)
export const DATA_SOURCE_ICONS: Record<DataSource, string> = {
  healthkit: 'Heart', // Apple Health uses heart
  oura: 'Circle', // Oura is a ring
  dexcom: 'Activity', // CGM activity line
  manual: 'PenLine', // Manual entry
};

// Colors for UI badges
export const DATA_SOURCE_COLORS: Record<DataSource, { bg: string; text: string; border: string }> = {
  healthkit: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  oura: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  dexcom: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  manual: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
};

// Which metrics each source provides (for priority resolution)
export const DATA_SOURCE_CAPABILITIES: Record<DataSource, string[]> = {
  healthkit: [
    'hrv', 'resting_heart_rate', 'steps', 'active_energy', 'sleep_duration',
    'deep_sleep', 'rem_sleep', 'core_sleep', 'sleep_efficiency', 'exercise',
    'weight', 'body_fat', 'respiratory_rate', 'oxygen_saturation', 'wrist_temperature',
    'walking_heart_rate', 'vo2_max', 'blood_glucose',
  ],
  oura: [
    'hrv', 'resting_heart_rate', 'sleep_duration', 'deep_sleep', 'rem_sleep',
    'light_sleep', 'sleep_efficiency', 'sleep_latency', 'sleep_awakenings',
    'temperature_deviation', 'wrist_temperature', 'respiratory_rate', 
    'oxygen_saturation', // Oura Gen3+ supports SpO2
    'readiness_score', 'activity_score', 'sleep_score',
    // Extended Oura metrics (added for ML/AI insights)
    'stress_high', 'recovery_high', 'stress_day_summary',
    'resilience_level', 'resilience_sleep_recovery', 'resilience_daytime_recovery',
    'spo2_average', 'breathing_disturbance_index',
    'skin_temp_deviation', 'skin_temp_trend_deviation',
    'optimal_bedtime_start', 'optimal_bedtime_end',
  ],
  dexcom: [
    'blood_glucose', 'glucose_trend', 'time_in_range',
  ],
  manual: [
    // Manual can provide any metric
  ],
};

// Metrics where Oura typically provides higher quality data than HealthKit
// Oura excels at: sleep staging, overnight biometrics, temperature
export const OURA_PREFERRED_METRICS: string[] = [
  // Sleep metrics - Oura has superior sleep staging algorithms
  'sleep_duration',
  'deep_sleep',
  'rem_sleep', 
  'core_sleep',
  'light_sleep',
  'sleep_efficiency',
  'sleep_latency',
  'sleep_awakenings',
  'time_in_bed',
  // Overnight biometrics - Oura measures throughout sleep, not on-demand
  'hrv', // Oura measures HRV throughout the night with many samples
  'resting_heart_rate', // Oura's overnight RHR is more accurate than daytime samples
  'respiratory_rate',
  'oxygen_saturation', // Oura measures SpO2 continuously during sleep (unlike Apple Watch on-demand)
  // Temperature - Oura's skin temperature during sleep is more consistent
  'temperature_deviation',
  'wrist_temperature',
  'skin_temp_deviation', // Oura skin temperature deviation from baseline
  'skin_temp_trend_deviation', // Oura skin temperature trend
  // Stress & Recovery - Oura exclusive metrics (no HealthKit equivalent)
  'stress_high',
  'recovery_high',
  'stress_day_summary',
  // Resilience - Oura exclusive metrics (no HealthKit equivalent)
  'resilience_level',
  'resilience_sleep_recovery',
  'resilience_daytime_recovery',
  // SpO2 & Breathing - Oura continuous overnight measurements
  'spo2_average',
  'breathing_disturbance_index',
  // Chronotype/Sleep Time - Oura exclusive
  'optimal_bedtime_start',
  'optimal_bedtime_end',
];

// Metrics where HealthKit/Apple Watch is typically preferred
// Apple Watch excels at: active workouts, daytime activity, body composition
export const HEALTHKIT_PREFERRED_METRICS: string[] = [
  // Activity & Movement - Apple Watch is always on during day
  'steps',
  'active_energy',
  'basal_energy',
  'distance',
  'flights_climbed',
  'stand_hours',
  // Workout metrics - Apple Watch has superior workout tracking with GPS, heart rate zones
  'exercise',
  'workout_duration',
  'workout_calories',
  'workout_heart_rate',
  'walking_heart_rate', // Only walking HR, not resting - Oura preferred for overnight resting HR
  'vo2_max',
  // Body composition - typically entered via scales synced to HealthKit
  'weight',
  'body_fat',
  'lean_mass',
  'bmi',
];

/**
 * Oura API Unit Conversions
 * 
 * Oura uses different units than our internal schema in some cases.
 * These mappings help convert Oura data to our standard format.
 */
export const OURA_UNIT_CONVERSIONS = {
  // Oura returns sleep durations in seconds, we store in minutes
  sleepDurationSecToMin: (sec: number) => Math.round(sec / 60),
  
  // Oura returns HRV as RMSSD in ms - same as HealthKit, no conversion needed
  hrvMsToMs: (ms: number) => ms,
  
  // Oura returns temperature as deviation in Celsius - same as our schema
  tempDeviationC: (c: number) => c,
  
  // Oura efficiency is 0-100 percentage - same as HealthKit
  efficiencyPct: (pct: number) => pct,
  
  // Oura breathing rate is breaths per minute - same as HealthKit
  breathingRate: (bpm: number) => bpm,
};

/**
 * Mapping from Oura API fields to our internal field names
 */
export const OURA_TO_INTERNAL_FIELD_MAP: Record<string, string> = {
  // Sleep period fields
  'average_hrv': 'hrvMs',
  'lowest_heart_rate': 'restingHrBpm',
  'average_heart_rate': 'avgHeartRateBpm',
  'average_breath': 'respiratoryRate',
  'deep_sleep_duration': 'deepSleepMin', // needs sec→min conversion
  'rem_sleep_duration': 'remSleepMin', // needs sec→min conversion
  'light_sleep_duration': 'coreSleepMin', // needs sec→min conversion
  'total_sleep_duration': 'totalSleepMin', // needs sec→min conversion
  'awake_time': 'wasoMin', // needs sec→min conversion
  'time_in_bed': 'timeInBedMin', // needs sec→min conversion
  'efficiency': 'sleepEfficiencyPct',
  'latency': 'sleepLatencyMin', // needs sec→min conversion
  'restless_periods': 'numAwakenings',
  
  // Daily readiness fields
  'temperature_deviation': 'wristTemperature',
  'temperature_trend_deviation': 'temperatureTrend',
  
  // Scores
  'score': 'ouraScore',
};

/**
 * Integration status types
 */
export const INTEGRATION_STATUS = {
  NOT_CONNECTED: 'not_connected',
  CONNECTED: 'connected',
  EXPIRED: 'expired',
  ERROR: 'error',
} as const;

export type IntegrationStatus = typeof INTEGRATION_STATUS[keyof typeof INTEGRATION_STATUS];

/**
 * Type definition for user integration settings
 */
export interface UserIntegrationSettings {
  integrationId: string; // 'oura', 'dexcom', etc.
  enabled: boolean;
  status: IntegrationStatus;
  connectedAt?: Date;
  lastSyncAt?: Date;
  lastSyncError?: string;
  
  // OAuth tokens (encrypted at rest)
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  
  // Priority settings - which metrics to prefer from this source
  priorityMetrics: string[]; // e.g., ['hrv', 'sleep_duration', 'deep_sleep']
}

/**
 * Available integrations configuration
 */
export const AVAILABLE_INTEGRATIONS = [
  {
    id: 'oura',
    name: 'Oura Ring',
    description: 'Connect your Oura Ring for detailed sleep, HRV, and temperature data.',
    icon: 'Circle',
    color: 'cyan',
    capabilities: DATA_SOURCE_CAPABILITIES.oura,
    oauthUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    apiBaseUrl: 'https://api.ouraring.com/v2',
    scopes: ['daily', 'heartrate', 'workout', 'session', 'personal'],
  },
  {
    id: 'dexcom',
    name: 'Dexcom CGM',
    description: 'Connect your Dexcom for continuous glucose monitoring data.',
    icon: 'Activity',
    color: 'green',
    capabilities: DATA_SOURCE_CAPABILITIES.dexcom,
    oauthUrl: 'https://api.dexcom.com/v2/oauth2/login',
    tokenUrl: 'https://api.dexcom.com/v2/oauth2/token',
    apiBaseUrl: 'https://api.dexcom.com',
    scopes: ['offline_access'],
  },
] as const;

export type IntegrationConfig = typeof AVAILABLE_INTEGRATIONS[number];
