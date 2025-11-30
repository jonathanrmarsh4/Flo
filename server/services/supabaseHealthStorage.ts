import { getSupabaseClient } from './supabaseClient';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

const supabase = getSupabaseClient();

// Cache health_id lookups to reduce database queries
const healthIdCache = new Map<string, string>();

/**
 * Get the pseudonymous health_id for a user
 * This is the ONLY place where user_id maps to health_id
 */
export async function getHealthId(userId: string): Promise<string> {
  // Check cache first
  const cached = healthIdCache.get(userId);
  if (cached) return cached;

  // Query Neon for health_id
  const [user] = await db
    .select({ healthId: users.healthId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.healthId) {
    throw new Error(`No health_id found for user ${userId}`);
  }

  // Cache for future lookups
  healthIdCache.set(userId, user.healthId);
  return user.healthId;
}

/**
 * Clear health_id cache (use when user is deleted or health_id changes)
 */
export function clearHealthIdCache(userId?: string) {
  if (userId) {
    healthIdCache.delete(userId);
  } else {
    healthIdCache.clear();
  }
}

// ==================== PROFILES ====================

export interface HealthProfile {
  id?: string;
  health_id: string;
  birth_year?: number | null;
  sex?: 'male' | 'female' | 'other' | null;
  weight?: number | null;
  weight_unit?: string;
  height?: number | null;
  height_unit?: string;
  goals?: string[] | null;
  health_baseline?: Record<string, any> | null;
  ai_personalization?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function getProfile(userId: string): Promise<HealthProfile | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('health_id', healthId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    logger.error('[SupabaseHealth] Error fetching profile:', error);
    throw error;
  }

  return data;
}

export async function upsertProfile(userId: string, profile: Partial<HealthProfile>): Promise<HealthProfile> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      ...profile,
      health_id: healthId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting profile:', error);
    throw error;
  }

  return data;
}

// ==================== BIOMARKER TEST SESSIONS ====================

export interface BiomarkerTestSession {
  id?: string;
  health_id: string;
  source: string;
  test_date: Date;
  notes?: string | null;
  created_at?: Date;
}

export async function createBiomarkerSession(userId: string, session: Omit<BiomarkerTestSession, 'health_id'>): Promise<BiomarkerTestSession> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('biomarker_test_sessions')
    .insert({
      ...session,
      health_id: healthId,
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating biomarker session:', error);
    throw error;
  }

  return data;
}

export async function getBiomarkerSessions(userId: string, limit = 10): Promise<BiomarkerTestSession[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('biomarker_test_sessions')
    .select('*')
    .eq('health_id', healthId)
    .order('test_date', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching biomarker sessions:', error);
    throw error;
  }

  return data || [];
}

// ==================== BIOMARKER MEASUREMENTS ====================

export interface BiomarkerMeasurement {
  id?: string;
  session_id: string;
  biomarker_id: string;
  record_id?: string | null;
  source: string;
  value_raw: number;
  unit_raw: string;
  value_canonical: number;
  unit_canonical: string;
  value_display: string;
  reference_low?: number | null;
  reference_high?: number | null;
  flags?: string[] | null;
  warnings?: string[] | null;
  normalization_context?: Record<string, any> | null;
  updated_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function createBiomarkerMeasurement(measurement: BiomarkerMeasurement): Promise<BiomarkerMeasurement> {
  const sanitizedMeasurement = {
    ...measurement,
    normalization_context: typeof measurement.normalization_context === 'string' 
      ? null 
      : (measurement.normalization_context || null),
  };
  
  const { data, error } = await supabase
    .from('biomarker_measurements')
    .insert(sanitizedMeasurement)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating biomarker measurement:', error);
    throw error;
  }

  return data;
}

export async function getMeasurementsBySession(sessionId: string): Promise<BiomarkerMeasurement[]> {
  const { data, error } = await supabase
    .from('biomarker_measurements')
    .select('*')
    .eq('session_id', sessionId);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching measurements:', error);
    throw error;
  }

  return data || [];
}

export interface CreateMeasurementWithSessionParams {
  userId: string;
  biomarkerId: string;
  value: number;
  unit: string;
  testDate: Date;
  valueCanonical: number;
  unitCanonical: string;
  valueDisplay: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  flags: string[];
  warnings: string[];
  normalizationContext: Record<string, any> | null;
  source?: string;
}

export async function createMeasurementWithSession(params: CreateMeasurementWithSessionParams): Promise<{ session: BiomarkerTestSession; measurement: BiomarkerMeasurement }> {
  const healthId = await getHealthId(params.userId);
  const source = params.source || 'manual';
  
  const testDateStart = new Date(params.testDate);
  testDateStart.setHours(0, 0, 0, 0);
  const testDateEnd = new Date(params.testDate);
  testDateEnd.setHours(23, 59, 59, 999);
  
  const { data: existingSession, error: sessionError } = await supabase
    .from('biomarker_test_sessions')
    .select('*')
    .eq('health_id', healthId)
    .eq('source', source)
    .gte('test_date', testDateStart.toISOString())
    .lte('test_date', testDateEnd.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  let session: BiomarkerTestSession;
  
  if (existingSession && !sessionError) {
    session = existingSession;
  } else {
    const { data: newSession, error: createError } = await supabase
      .from('biomarker_test_sessions')
      .insert({
        health_id: healthId,
        source: source,
        test_date: params.testDate.toISOString(),
      })
      .select()
      .single();
    
    if (createError || !newSession) {
      logger.error('[SupabaseHealth] Error creating biomarker session:', createError);
      throw createError || new Error('Failed to create session');
    }
    session = newSession;
  }
  
  const sanitizedContext = typeof params.normalizationContext === 'string' 
    ? null 
    : (params.normalizationContext || null);
  
  const { data: measurement, error: measurementError } = await supabase
    .from('biomarker_measurements')
    .insert({
      session_id: session.id,
      biomarker_id: params.biomarkerId,
      source: source,
      value_raw: params.value,
      unit_raw: params.unit,
      value_canonical: params.valueCanonical,
      unit_canonical: params.unitCanonical,
      value_display: params.valueDisplay,
      reference_low: params.referenceLow,
      reference_high: params.referenceHigh,
      flags: params.flags,
      warnings: params.warnings,
      normalization_context: sanitizedContext,
    })
    .select()
    .single();
  
  if (measurementError || !measurement) {
    logger.error('[SupabaseHealth] Error creating biomarker measurement:', measurementError);
    throw measurementError || new Error('Failed to create measurement');
  }
  
  return { session, measurement };
}

// ==================== HEALTHKIT SAMPLES ====================

export interface HealthkitSample {
  id?: string;
  health_id: string;
  data_type: string;
  value: number;
  unit: string;
  start_date: Date;
  end_date: Date;
  source_name?: string | null;
  source_bundle_id?: string | null;
  device_name?: string | null;
  device_manufacturer?: string | null;
  device_model?: string | null;
  metadata?: Record<string, any> | null;
  uuid?: string | null;
  created_at?: Date;
}

export async function createHealthkitSamples(userId: string, samples: Omit<HealthkitSample, 'health_id'>[]): Promise<number> {
  const healthId = await getHealthId(userId);
  
  const samplesWithHealthId = samples.map(s => ({
    ...s,
    health_id: healthId,
  }));

  const { data, error } = await supabase
    .from('healthkit_samples')
    .upsert(samplesWithHealthId, {
      onConflict: 'uuid',
      ignoreDuplicates: true,
    })
    .select();

  if (error) {
    logger.error('[SupabaseHealth] Error creating healthkit samples:', error);
    throw error;
  }

  return data?.length || 0;
}

export async function getHealthkitSamples(
  userId: string, 
  dataType: string, 
  startDate: Date, 
  endDate: Date
): Promise<HealthkitSample[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('healthkit_samples')
    .select('*')
    .eq('health_id', healthId)
    .eq('data_type', dataType)
    .gte('start_date', startDate.toISOString())
    .lte('start_date', endDate.toISOString())
    .order('start_date', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching healthkit samples:', error);
    throw error;
  }

  return data || [];
}

interface GetHealthkitSamplesFlexibleOptions {
  dataTypes?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getHealthkitSamplesFlexible(
  userId: string, 
  options: GetHealthkitSamplesFlexibleOptions = {}
): Promise<HealthkitSample[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('healthkit_samples')
    .select('*')
    .eq('health_id', healthId);
  
  if (options.dataTypes && options.dataTypes.length > 0) {
    query = query.in('data_type', options.dataTypes);
  }
  
  if (options.startDate) {
    query = query.gte('start_date', options.startDate.toISOString());
  }
  
  if (options.endDate) {
    query = query.lte('start_date', options.endDate.toISOString());
  }
  
  query = query.order('start_date', { ascending: false });
  
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching healthkit samples (flexible):', error);
    throw error;
  }

  return data || [];
}

// ==================== HEALTHKIT WORKOUTS ====================

export interface HealthkitWorkout {
  id?: string;
  health_id: string;
  workout_type: string;
  start_date: Date;
  end_date: Date;
  duration: number;
  total_distance?: number | null;
  total_distance_unit?: string | null;
  total_energy_burned?: number | null;
  total_energy_burned_unit?: string | null;
  average_heart_rate?: number | null;
  max_heart_rate?: number | null;
  min_heart_rate?: number | null;
  source_name?: string | null;
  source_bundle_id?: string | null;
  device_name?: string | null;
  device_manufacturer?: string | null;
  device_model?: string | null;
  metadata?: Record<string, any> | null;
  uuid?: string | null;
  created_at?: Date;
}

export async function createHealthkitWorkouts(userId: string, workouts: Omit<HealthkitWorkout, 'health_id'>[]): Promise<number> {
  const healthId = await getHealthId(userId);
  
  const workoutsWithHealthId = workouts.map(w => ({
    ...w,
    health_id: healthId,
  }));

  const { data, error } = await supabase
    .from('healthkit_workouts')
    .upsert(workoutsWithHealthId, {
      onConflict: 'uuid',
      ignoreDuplicates: true,
    })
    .select();

  if (error) {
    logger.error('[SupabaseHealth] Error creating healthkit workouts:', error);
    throw error;
  }

  return data?.length || 0;
}

export async function getHealthkitWorkouts(userId: string, limit = 7): Promise<HealthkitWorkout[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('healthkit_workouts')
    .select('*')
    .eq('health_id', healthId)
    .order('start_date', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching healthkit workouts:', error);
    throw error;
  }

  return data || [];
}

// ==================== DIAGNOSTICS STUDIES ====================

export interface DiagnosticsStudy {
  id?: string;
  health_id: string;
  type: string;
  source: string;
  study_date: Date;
  age_at_scan?: number | null;
  total_score_numeric?: number | null;
  risk_category?: string | null;
  age_percentile?: number | null;
  ai_payload: Record<string, any>;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}

export async function createDiagnosticsStudy(userId: string, study: Omit<DiagnosticsStudy, 'health_id'>): Promise<DiagnosticsStudy> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('diagnostics_studies')
    .insert({
      ...study,
      health_id: healthId,
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating diagnostics study:', error);
    throw error;
  }

  return data;
}

export async function getDiagnosticsStudies(userId: string, type?: string): Promise<DiagnosticsStudy[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('diagnostics_studies')
    .select('*')
    .eq('health_id', healthId)
    .order('study_date', { ascending: false });

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching diagnostics studies:', error);
    throw error;
  }

  return data || [];
}

// ==================== LIFE EVENTS ====================

export interface LifeEvent {
  id?: string;
  health_id: string;
  event_type: string;
  details?: Record<string, any>;
  notes?: string | null;
  happened_at: Date;
  created_at?: Date;
}

export async function createLifeEvent(userId: string, event: Omit<LifeEvent, 'health_id'>): Promise<LifeEvent> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('life_events')
    .insert({
      ...event,
      health_id: healthId,
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating life event:', error);
    throw error;
  }

  return data;
}

export async function getLifeEvents(userId: string, days = 14): Promise<LifeEvent[]> {
  const healthId = await getHealthId(userId);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await supabase
    .from('life_events')
    .select('*')
    .eq('health_id', healthId)
    .gte('happened_at', startDate.toISOString())
    .order('happened_at', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching life events:', error);
    throw error;
  }

  return data || [];
}

interface GetLifeEventsFlexibleOptions {
  startDate?: Date;
  limit?: number;
}

export async function getLifeEventsFlexible(userId: string, options: GetLifeEventsFlexibleOptions = {}): Promise<LifeEvent[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('life_events')
    .select('*')
    .eq('health_id', healthId);
  
  if (options.startDate) {
    query = query.gte('happened_at', options.startDate.toISOString());
  }
  
  query = query.order('happened_at', { ascending: false });
  
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching life events (flexible):', error);
    throw error;
  }

  return data || [];
}

// ==================== USER DAILY METRICS ====================

export interface UserDailyMetric {
  id?: string;
  health_id: string;
  local_date: string;
  timezone: string;
  utc_day_start: Date;
  utc_day_end: Date;
  steps_normalized?: number | null;
  steps_raw_sum?: number | null;
  steps_sources?: Record<string, any> | null;
  active_energy_kcal?: number | null;
  exercise_minutes?: number | null;
  sleep_hours?: number | null;
  resting_hr_bpm?: number | null;
  hrv_ms?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  bmi?: number | null;
  body_fat_percent?: number | null;
  lean_body_mass_kg?: number | null;
  waist_circumference_cm?: number | null;
  distance_meters?: number | null;
  flights_climbed?: number | null;
  stand_hours?: number | null;
  avg_heart_rate_bpm?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  blood_glucose_mg_dl?: number | null;
  vo2_max?: number | null;
  // Extended metrics for complete HealthKit coverage
  basal_energy_kcal?: number | null;
  walking_hr_avg_bpm?: number | null;
  dietary_water_ml?: number | null;
  oxygen_saturation_pct?: number | null;
  respiratory_rate_bpm?: number | null;
  body_temp_c?: number | null;
  normalization_version?: string;
  created_at?: Date;
  updated_at?: Date;
}

export async function upsertDailyMetrics(userId: string, metrics: Omit<UserDailyMetric, 'health_id'>): Promise<UserDailyMetric> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('user_daily_metrics')
    .upsert({
      ...metrics,
      health_id: healthId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id,local_date',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting daily metrics:', error);
    throw error;
  }

  return data;
}

export async function getDailyMetrics(userId: string, days = 7): Promise<UserDailyMetric[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('user_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching daily metrics:', error);
    throw error;
  }

  return data || [];
}

// ==================== FLOMENTUM DAILY ====================

export interface FlomentumDaily {
  id?: string;
  health_id: string;
  date: string;
  score: number;
  zone: string;
  delta_vs_yesterday?: number | null;
  factors: Record<string, any>;
  daily_focus?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function upsertFlomentumDaily(userId: string, flomentum: Omit<FlomentumDaily, 'health_id'>): Promise<FlomentumDaily> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('flomentum_daily')
    .upsert({
      ...flomentum,
      health_id: healthId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id,date',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting flomentum daily:', error);
    throw error;
  }

  return data;
}

export async function getFlomentumDaily(userId: string, days = 7): Promise<FlomentumDaily[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('flomentum_daily')
    .select('*')
    .eq('health_id', healthId)
    .order('date', { ascending: false })
    .limit(days);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching flomentum daily:', error);
    throw error;
  }

  return data || [];
}

interface GetFlomentumDailyFlexibleOptions {
  startDate?: Date;
  limit?: number;
}

export async function getFlomentumDailyFlexible(userId: string, options: GetFlomentumDailyFlexibleOptions = {}): Promise<FlomentumDaily[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('flomentum_daily')
    .select('*')
    .eq('health_id', healthId);
  
  if (options.startDate) {
    query = query.gte('date', options.startDate.toISOString().split('T')[0]);
  }
  
  query = query.order('date', { ascending: false });
  
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching flomentum daily (flexible):', error);
    throw error;
  }

  return data || [];
}

export async function getFlomentumDailyByDate(userId: string, date: string): Promise<FlomentumDaily | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('flomentum_daily')
    .select('*')
    .eq('health_id', healthId)
    .eq('date', date)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // No row found
    }
    logger.error('[SupabaseHealth] Error fetching flomentum daily by date:', error);
    throw error;
  }

  return data;
}

// ==================== SLEEP NIGHTS ====================

export interface SleepNight {
  id?: string;
  health_id: string;
  sleep_date: string;
  timezone: string;
  night_start?: Date | null;
  final_wake?: Date | null;
  sleep_onset?: Date | null;
  time_in_bed_min?: number | null;
  total_sleep_min?: number | null;
  sleep_efficiency_pct?: number | null;
  sleep_latency_min?: number | null;
  waso_min?: number | null;
  num_awakenings?: number | null;
  core_sleep_min?: number | null;
  deep_sleep_min?: number | null;
  rem_sleep_min?: number | null;
  unspecified_sleep_min?: number | null;
  awake_in_bed_min?: number | null;
  mid_sleep_time_local?: number | null;
  fragmentation_index?: number | null;
  deep_pct?: number | null;
  rem_pct?: number | null;
  core_pct?: number | null;
  bedtime_local?: string | null;
  waketime_local?: string | null;
  resting_hr_bpm?: number | null;
  hrv_ms?: number | null;
  respiratory_rate?: number | null;
  wrist_temperature?: number | null;
  oxygen_saturation?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function upsertSleepNight(userId: string, sleep: Omit<SleepNight, 'health_id'>): Promise<SleepNight> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .upsert({
      ...sleep,
      health_id: healthId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id,sleep_date',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting sleep night:', error);
    throw error;
  }

  return data;
}

interface GetSleepNightsOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getSleepNights(userId: string, optionsOrDays: GetSleepNightsOptions | number = 7): Promise<SleepNight[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .order('sleep_date', { ascending: false });
    
  if (typeof optionsOrDays === 'number') {
    query = query.limit(optionsOrDays);
  } else {
    const { startDate, endDate, limit } = optionsOrDays;
    if (startDate) {
      const startDateStr = startDate.toISOString().split('T')[0];
      query = query.gte('sleep_date', startDateStr);
    }
    if (endDate) {
      const endDateStr = endDate.toISOString().split('T')[0];
      query = query.lte('sleep_date', endDateStr);
    }
    if (limit) {
      query = query.limit(limit);
    }
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching sleep nights:', error);
    throw error;
  }

  return data || [];
}

export async function getSleepNightByDate(userId: string, sleepDate: string): Promise<SleepNight | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .eq('sleep_date', sleepDate)
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error fetching sleep night by date:', error);
    throw error;
  }

  return data;
}

// ==================== ACTION PLAN ITEMS ====================

export interface ActionPlanItem {
  id?: string;
  health_id: string;
  title: string;
  description?: string | null;
  category: string;
  status: string;
  priority?: number;
  target_value?: number | null;
  target_unit?: string | null;
  current_value?: number | null;
  progress_percent?: number | null;
  start_date?: Date | null;
  target_date?: Date | null;
  completed_at?: Date | null;
  notes?: string | null;
  source?: string;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function createActionPlanItem(userId: string, item: Omit<ActionPlanItem, 'health_id'>): Promise<ActionPlanItem> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('action_plan_items')
    .insert({
      ...item,
      health_id: healthId,
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating action plan item:', error);
    throw error;
  }

  return data;
}

export async function getActionPlanItems(userId: string, status?: string): Promise<ActionPlanItem[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('action_plan_items')
    .select('*')
    .eq('health_id', healthId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching action plan items:', error);
    throw error;
  }

  return data || [];
}

export async function updateActionPlanItem(itemId: string, updates: Partial<ActionPlanItem>): Promise<ActionPlanItem> {
  const { data, error } = await supabase
    .from('action_plan_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error updating action plan item:', error);
    throw error;
  }

  return data;
}

// ==================== BIOMARKERS REFERENCE ====================

export interface Biomarker {
  id?: string;
  name: string;
  category: string;
  canonical_unit: string;
  display_unit_preference?: string | null;
  precision?: number;
  decimals_policy?: string;
  global_default_ref_min?: number | null;
  global_default_ref_max?: number | null;
  created_at?: Date;
}

export async function getBiomarkers(): Promise<Biomarker[]> {
  const { data, error } = await supabase
    .from('biomarkers')
    .select('*')
    .order('category')
    .order('name');

  if (error) {
    logger.error('[SupabaseHealth] Error fetching biomarkers:', error);
    throw error;
  }

  return data || [];
}

export async function getBiomarkerByName(name: string): Promise<Biomarker | null> {
  const { data, error } = await supabase
    .from('biomarkers')
    .select('*')
    .eq('name', name)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching biomarker:', error);
    throw error;
  }

  return data;
}

export async function upsertBiomarker(biomarker: Biomarker): Promise<Biomarker> {
  const { data, error } = await supabase
    .from('biomarkers')
    .upsert(biomarker, {
      onConflict: 'name',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting biomarker:', error);
    throw error;
  }

  return data;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if Supabase health tables are accessible
 */
export async function checkHealthTablesAccess(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    return !error;
  } catch {
    return false;
  }
}

/**
 * Get all health data for a user (for export or debugging)
 */
export async function getAllHealthData(userId: string): Promise<{
  profile: HealthProfile | null;
  biomarkerSessions: BiomarkerTestSession[];
  healthkitWorkouts: HealthkitWorkout[];
  diagnosticsStudies: DiagnosticsStudy[];
  lifeEvents: LifeEvent[];
  dailyMetrics: UserDailyMetric[];
  flomentumDaily: FlomentumDaily[];
  sleepNights: SleepNight[];
  actionPlanItems: ActionPlanItem[];
}> {
  const [
    profile,
    biomarkerSessions,
    healthkitWorkouts,
    diagnosticsStudies,
    lifeEvents,
    dailyMetrics,
    flomentumDaily,
    sleepNights,
    actionPlanItems,
  ] = await Promise.all([
    getProfile(userId),
    getBiomarkerSessions(userId, 100),
    getHealthkitWorkouts(userId, 100),
    getDiagnosticsStudies(userId),
    getLifeEvents(userId, 365),
    getDailyMetrics(userId, 365),
    getFlomentumDaily(userId, 365),
    getSleepNights(userId, 365),
    getActionPlanItems(userId),
  ]);

  return {
    profile,
    biomarkerSessions,
    healthkitWorkouts,
    diagnosticsStudies,
    lifeEvents,
    dailyMetrics,
    flomentumDaily,
    sleepNights,
    actionPlanItems,
  };
}

/**
 * Delete all health data for a user (GDPR compliance / account deletion)
 * Order matters due to foreign key constraints
 * Throws on first error to ensure atomic behavior
 */
export async function deleteAllHealthData(userId: string): Promise<void> {
  const healthId = await getHealthId(userId);
  logger.info(`[SupabaseHealth] Deleting all health data for health_id: ${healthId}`);

  const errors: string[] = [];

  // Delete in order to respect foreign key constraints
  // First delete tables that reference other tables
  
  // 1. Delete flomentum_daily (references nothing)
  const { error: flomentumError } = await supabase
    .from('flomentum_daily')
    .delete()
    .eq('health_id', healthId);
  if (flomentumError) errors.push(`flomentum_daily: ${flomentumError.message}`);

  // 2. Delete sleep_nights
  const { error: sleepError } = await supabase
    .from('sleep_nights')
    .delete()
    .eq('health_id', healthId);
  if (sleepError) errors.push(`sleep_nights: ${sleepError.message}`);

  // 3. Delete life_events
  const { error: eventsError } = await supabase
    .from('life_events')
    .delete()
    .eq('health_id', healthId);
  if (eventsError) errors.push(`life_events: ${eventsError.message}`);

  // 4. Delete user_daily_metrics
  const { error: metricsError } = await supabase
    .from('user_daily_metrics')
    .delete()
    .eq('health_id', healthId);
  if (metricsError) errors.push(`user_daily_metrics: ${metricsError.message}`);

  // 5. Delete healthkit_samples
  const { error: samplesError } = await supabase
    .from('healthkit_samples')
    .delete()
    .eq('health_id', healthId);
  if (samplesError) errors.push(`healthkit_samples: ${samplesError.message}`);

  // 6. Delete healthkit_workouts
  const { error: workoutsError } = await supabase
    .from('healthkit_workouts')
    .delete()
    .eq('health_id', healthId);
  if (workoutsError) errors.push(`healthkit_workouts: ${workoutsError.message}`);

  // 7. Delete action_plan_items
  const { error: actionError } = await supabase
    .from('action_plan_items')
    .delete()
    .eq('health_id', healthId);
  if (actionError) errors.push(`action_plan_items: ${actionError.message}`);

  // 8. Delete diagnostics_studies (no child tables in Supabase - metrics are in Neon)
  const { error: diagnosticsError } = await supabase
    .from('diagnostics_studies')
    .delete()
    .eq('health_id', healthId);
  if (diagnosticsError) errors.push(`diagnostics_studies: ${diagnosticsError.message}`);

  // 9. Delete biomarker_measurements (CASCADE from sessions handles this, but explicit delete for safety)
  // Get session IDs first
  const { data: sessions } = await supabase
    .from('biomarker_test_sessions')
    .select('id')
    .eq('health_id', healthId);
  
  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map(s => s.id);
    const { error: measurementsError } = await supabase
      .from('biomarker_measurements')
      .delete()
      .in('session_id', sessionIds);
    if (measurementsError) errors.push(`biomarker_measurements: ${measurementsError.message}`);
  }

  // 10. Delete biomarker_test_sessions
  const { error: sessionsError } = await supabase
    .from('biomarker_test_sessions')
    .delete()
    .eq('health_id', healthId);
  if (sessionsError) errors.push(`biomarker_test_sessions: ${sessionsError.message}`);

  // 11. Delete profile last (other tables may reference it)
  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('health_id', healthId);
  if (profileError) errors.push(`profiles: ${profileError.message}`);

  // Clear the health ID cache for this user
  clearHealthIdCache(userId);
  
  // If any errors occurred, throw with details
  if (errors.length > 0) {
    const errorMessage = `Failed to delete some health data: ${errors.join('; ')}`;
    logger.error(`[SupabaseHealth] ${errorMessage}`);
    throw new Error(errorMessage);
  }
  
  logger.info(`[SupabaseHealth] Successfully deleted all health data for health_id: ${healthId}`);
}

logger.info('[SupabaseHealth] Health storage service initialized');
