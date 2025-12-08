import { getSupabaseClient } from './supabaseClient';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const supabase = getSupabaseClient();

// Cache health_id lookups to reduce database queries
const healthIdCache = new Map<string, string>();

/**
 * Get the pseudonymous health_id for a user
 * This is the ONLY place where user_id maps to health_id
 * If user doesn't have a health_id, one will be generated and assigned
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

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // If user exists but has no health_id, generate one
  if (!user.healthId) {
    const newHealthId = crypto.randomUUID();
    await db
      .update(users)
      .set({ healthId: newHealthId })
      .where(eq(users.id, userId));
    
    logger.info(`[SupabaseHealth] Generated health_id for user ${userId}`);
    healthIdCache.set(userId, newHealthId);
    return newHealthId;
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

/**
 * Reverse lookup: Get user_id from health_id
 * Used by ClickHouse sync to query Neon tables (like readiness) that use user_id
 */
const userIdCache = new Map<string, string>();

export async function getUserIdFromHealthId(healthId: string): Promise<string | null> {
  // Check cache first
  const cached = userIdCache.get(healthId);
  if (cached) return cached;

  // Query Neon for user_id
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.healthId, healthId))
    .limit(1);

  if (!user) {
    logger.debug(`[SupabaseHealth] No user found for health_id ${healthId}`);
    return null;
  }

  // Cache for future lookups
  userIdCache.set(healthId, user.id);
  return user.id;
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
  healthkit_backfill_complete?: boolean;
  healthkit_backfill_date?: Date | null;
  healthkit_backfill_metadata?: {
    sampleCount?: number;
    startDate?: string;
    endDate?: string;
  } | null;
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

// ==================== HEALTHKIT SYNC STATUS ====================

export interface HealthKitSyncStatus {
  backfillComplete: boolean;
  backfillDate: Date | null;
  needsHistoricalSync: boolean;
}

/**
 * Get the HealthKit sync status for a user.
 * Returns whether the user has completed their initial historical backfill.
 */
export async function getHealthKitSyncStatus(userId: string): Promise<HealthKitSyncStatus> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('profiles')
    .select('healthkit_backfill_complete, healthkit_backfill_date')
    .eq('health_id', healthId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching sync status:', error);
    throw error;
  }

  const backfillComplete = data?.healthkit_backfill_complete === true;
  const backfillDate = data?.healthkit_backfill_date ? new Date(data.healthkit_backfill_date) : null;

  return {
    backfillComplete,
    backfillDate,
    needsHistoricalSync: !backfillComplete,
  };
}

export interface BackfillMetadata {
  sampleCount?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Mark the HealthKit historical backfill as complete for a user.
 * Should be called by iOS after it has synced all historical HealthKit data.
 * @param userId - The user ID
 * @param metadata - Optional metadata about the backfill (sample count, date range)
 */
export async function markHealthKitBackfillComplete(
  userId: string, 
  metadata?: BackfillMetadata
): Promise<void> {
  const healthId = await getHealthId(userId);
  
  const { error } = await supabase
    .from('profiles')
    .upsert({
      health_id: healthId,
      healthkit_backfill_complete: true,
      healthkit_backfill_date: new Date().toISOString(),
      healthkit_backfill_metadata: metadata ? {
        sampleCount: metadata.sampleCount,
        startDate: metadata.startDate,
        endDate: metadata.endDate,
      } : null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id',
    });

  if (error) {
    logger.error('[SupabaseHealth] Error marking backfill complete:', error);
    throw error;
  }

  const metaLog = metadata ? ` (${metadata.sampleCount || 0} samples, ${metadata.startDate || 'unknown'} to ${metadata.endDate || 'unknown'})` : '';
  logger.info(`[SupabaseHealth] Marked HealthKit backfill complete for user ${userId}${metaLog}`);
}

/**
 * Reset the HealthKit backfill status for a user (admin use only).
 * This will cause iOS to re-sync all historical data on next app open.
 */
export async function resetHealthKitBackfillStatus(userId: string): Promise<void> {
  const healthId = await getHealthId(userId);
  
  const { error } = await supabase
    .from('profiles')
    .update({
      healthkit_backfill_complete: false,
      healthkit_backfill_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('health_id', healthId);

  if (error) {
    logger.error('[SupabaseHealth] Error resetting backfill status:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Reset HealthKit backfill status for user ${userId}`);
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

export async function getBiomarkerSessions(userId: string, limit = 100): Promise<BiomarkerTestSession[]> {
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
  
  logger.info(`[SupabaseHealth] getBiomarkerSessions returned ${data?.length || 0} sessions, raw test_date sample: ${data?.[0]?.test_date}`);

  return data || [];
}

export async function getTestSessionById(sessionId: string): Promise<BiomarkerTestSession | null> {
  const { data, error } = await supabase
    .from('biomarker_test_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching session by id:', error);
    throw error;
  }

  return data;
}

export async function getTestSessionByIdWithOwnerCheck(
  sessionId: string, 
  userId: string
): Promise<BiomarkerTestSession | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('biomarker_test_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('health_id', healthId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching session by id with owner check:', error);
    throw error;
  }

  return data;
}

// Check for existing session by date and source (for duplicate prevention)
export async function findSessionByDateAndSource(
  userId: string, 
  testDateUtc: string, // YYYY-MM-DD format
  source: string
): Promise<BiomarkerTestSession | null> {
  const healthId = await getHealthId(userId);
  
  // Query for sessions on the specified date with the given source
  // Use date range to handle timezone variations (midnight to midnight UTC)
  const startOfDay = `${testDateUtc}T00:00:00.000Z`;
  const endOfDay = `${testDateUtc}T23:59:59.999Z`;
  
  const { data, error } = await supabase
    .from('biomarker_test_sessions')
    .select('*')
    .eq('health_id', healthId)
    .eq('source', source)
    .gte('test_date', startOfDay)
    .lte('test_date', endOfDay)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('[SupabaseHealth] Error finding session by date:', error);
    throw error;
  }
  
  return data && data.length > 0 ? data[0] : null;
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
  reference_low_raw?: number | null;
  reference_high_raw?: number | null;
  reference_unit_raw?: string | null;
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

export interface MeasurementWithTestDate extends BiomarkerMeasurement {
  test_date: string;
}

export async function getMeasurementHistory(
  userId: string, 
  biomarkerId: string, 
  limit: number = 5
): Promise<MeasurementWithTestDate[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('biomarker_measurements')
    .select(`
      *,
      biomarker_test_sessions!inner (
        test_date,
        health_id
      )
    `)
    .eq('biomarker_id', biomarkerId)
    .eq('biomarker_test_sessions.health_id', healthId)
    .order('biomarker_test_sessions(test_date)', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching measurement history:', error);
    throw error;
  }

  return (data || []).map(row => ({
    ...row,
    test_date: row.biomarker_test_sessions?.test_date || row.created_at,
    biomarker_test_sessions: undefined,
  }));
}

export async function getMeasurementById(measurementId: string): Promise<BiomarkerMeasurement | null> {
  const { data, error } = await supabase
    .from('biomarker_measurements')
    .select('*')
    .eq('id', measurementId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching measurement:', error);
    throw error;
  }

  return data;
}

export async function getMeasurementByIdWithOwnerCheck(measurementId: string, userId: string): Promise<BiomarkerMeasurement | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('biomarker_measurements')
    .select(`
      *,
      biomarker_test_sessions!inner (
        health_id
      )
    `)
    .eq('id', measurementId)
    .eq('biomarker_test_sessions.health_id', healthId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching measurement with owner check:', error);
    throw error;
  }

  if (!data) return null;
  
  const { biomarker_test_sessions, ...measurement } = data;
  return measurement;
}

export interface UpdateMeasurementParams {
  biomarker_id?: string;
  value_raw?: number;
  unit_raw?: string;
  value_canonical?: number;
  unit_canonical?: string;
  value_display?: string;
  reference_low?: number | null;
  reference_high?: number | null;
  flags?: string[];
  warnings?: string[];
  normalization_context?: Record<string, any> | null;
  source?: string;
  updated_by?: string;
}

export async function updateMeasurement(
  measurementId: string, 
  updates: UpdateMeasurementParams
): Promise<BiomarkerMeasurement> {
  const { data, error } = await supabase
    .from('biomarker_measurements')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', measurementId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error updating measurement:', error);
    throw error;
  }

  return data;
}

export async function deleteMeasurement(measurementId: string): Promise<void> {
  const { error } = await supabase
    .from('biomarker_measurements')
    .delete()
    .eq('id', measurementId);

  if (error) {
    logger.error('[SupabaseHealth] Error deleting measurement:', error);
    throw error;
  }
}

export async function deleteTestSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('biomarker_test_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    logger.error('[SupabaseHealth] Error deleting session:', error);
    throw error;
  }
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
  logger.info(`[SupabaseHealth] createHealthkitSamples called for user ${userId} with ${samples.length} samples`);
  
  if (samples.length === 0) {
    return 0;
  }
  
  const healthId = await getHealthId(userId);
  logger.info(`[SupabaseHealth] Got healthId ${healthId} for user ${userId}`);
  
  // SERVER-SIDE PRE-DEDUPLICATION
  // iOS may send the same sample multiple times with different UUIDs
  // Deduplicate by checking (health_id, data_type, value, start_date, source_bundle_id)
  const startDates = samples.map(s => new Date(s.start_date).toISOString());
  const minDate = startDates.reduce((a, b) => a < b ? a : b);
  const maxDate = startDates.reduce((a, b) => a > b ? a : b);
  
  // Fetch ALL existing samples in the date range (with pagination to handle >1000 samples)
  const existingFingerprints = new Set<string>();
  let page = 0;
  const pageSize = 1000;
  let totalFetched = 0;
  
  while (true) {
    const { data: existingSamples, error: fetchError } = await supabase
      .from('healthkit_samples')
      .select('data_type, value, start_date, source_bundle_id')
      .eq('health_id', healthId)
      .gte('start_date', minDate)
      .lte('start_date', maxDate)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (fetchError) {
      logger.error('[SupabaseHealth] Error fetching existing samples for dedup:', fetchError);
      break;
    }
    
    if (!existingSamples || existingSamples.length === 0) {
      break;
    }
    
    totalFetched += existingSamples.length;
    
    // Create fingerprints for each existing sample
    for (const s of existingSamples) {
      // Create fingerprint: data_type|value|start_date|source_bundle_id
      // Round value to 2 decimal places to handle floating point precision
      // Truncate start_date to second level to handle microsecond differences
      const valueRounded = Math.round(s.value * 100) / 100;
      const startDateNorm = new Date(s.start_date).toISOString().slice(0, 19);
      const fingerprint = `${s.data_type}|${valueRounded}|${startDateNorm}|${s.source_bundle_id || ''}`;
      existingFingerprints.add(fingerprint);
    }
    
    // If we got less than pageSize, we've fetched all samples
    if (existingSamples.length < pageSize) {
      break;
    }
    page++;
  }
  
  if (totalFetched > 0) {
    logger.info(`[SupabaseHealth] Pre-dedup: fetched ${totalFetched} existing samples for fingerprint comparison`);
  }
  
  // Filter out samples that already exist
  const newSamples = samples.filter(s => {
    const valueRounded = Math.round(s.value * 100) / 100;
    const startDateNorm = new Date(s.start_date).toISOString().slice(0, 19);
    const fingerprint = `${s.data_type}|${valueRounded}|${startDateNorm}|${s.source_bundle_id || ''}`;
    return !existingFingerprints.has(fingerprint);
  });
  
  const duplicatesSkipped = samples.length - newSamples.length;
  if (duplicatesSkipped > 0) {
    logger.info(`[SupabaseHealth] Pre-dedup: skipped ${duplicatesSkipped} duplicate samples (same data_type, value, start_date, source)`);
  }
  
  if (newSamples.length === 0) {
    logger.info(`[SupabaseHealth] All ${samples.length} samples were duplicates, nothing to insert`);
    return 0;
  }
  
  const samplesWithHealthId = newSamples.map(s => ({
    ...s,
    health_id: healthId,
  }));

  logger.info(`[SupabaseHealth] Attempting to upsert ${samplesWithHealthId.length} samples to healthkit_samples table`);
  
  const { data, error, status, statusText } = await supabase
    .from('healthkit_samples')
    .upsert(samplesWithHealthId, {
      onConflict: 'uuid',
      ignoreDuplicates: true,
    })
    .select();

  logger.info(`[SupabaseHealth] Supabase response - status: ${status}, statusText: ${statusText}, data length: ${data?.length ?? 'null'}, error: ${error ? JSON.stringify(error) : 'none'}`);

  if (error) {
    logger.error('[SupabaseHealth] Error creating healthkit samples:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Successfully inserted ${data?.length || 0} healthkit samples for user ${userId} (${duplicatesSkipped} duplicates skipped)`);
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

export async function getHealthkitWorkoutsByDate(userId: string, localDate: string): Promise<HealthkitWorkout[]> {
  const healthId = await getHealthId(userId);
  
  // Query workouts where start_date falls on the given local date
  // We filter by date portion of start_date timestamp
  const { data, error } = await supabase
    .from('healthkit_workouts')
    .select('*')
    .eq('health_id', healthId)
    .gte('start_date', `${localDate}T00:00:00`)
    .lt('start_date', `${localDate}T23:59:59.999`);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching healthkit workouts by date:', error);
    throw error;
  }

  return data || [];
}

export async function getHealthkitWorkoutsByDateRange(userId: string, startDate: string, endDate: string): Promise<HealthkitWorkout[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('healthkit_workouts')
    .select('*')
    .eq('health_id', healthId)
    .gte('start_date', `${startDate}T00:00:00`)
    .lt('start_date', `${endDate}T23:59:59.999`)
    .order('start_date', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching healthkit workouts by date range:', error);
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

// Input type that accepts both camelCase (from code) and snake_case (from DB)
export interface LifeEventInput {
  eventType?: string;
  event_type?: string;
  details?: Record<string, any>;
  notes?: string | null;
  happenedAt?: Date;
  happened_at?: Date;
}

export async function createLifeEvent(userId: string, event: LifeEventInput): Promise<LifeEvent> {
  const healthId = await getHealthId(userId);
  
  // Convert camelCase to snake_case for Supabase, with fallbacks
  const insertData = {
    health_id: healthId,
    event_type: event.event_type || event.eventType,
    details: event.details || {},
    notes: event.notes || null,
    happened_at: event.happened_at || event.happenedAt || new Date(),
  };
  
  logger.info('[SupabaseHealth] Creating life event:', { 
    userId, 
    eventType: insertData.event_type,
    hasDetails: !!insertData.details,
  });
  
  const { data, error } = await supabase
    .from('life_events')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating life event:', error);
    throw error;
  }
  
  logger.info('[SupabaseHealth] Life event created successfully:', { id: data.id });

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
  logger.info(`[SupabaseHealth] upsertDailyMetrics called for user ${userId}, date: ${(metrics as any).local_date}`);
  
  const healthId = await getHealthId(userId);
  logger.info(`[SupabaseHealth] Got healthId ${healthId} for daily metrics upsert`);
  
  const payload = {
    ...metrics,
    health_id: healthId,
    updated_at: new Date().toISOString(),
  };
  
  logger.info(`[SupabaseHealth] Daily metrics upsert payload keys: ${Object.keys(payload).join(', ')}`);
  
  const { data, error, status, statusText } = await supabase
    .from('user_daily_metrics')
    .upsert(payload, {
      onConflict: 'health_id,local_date',
    })
    .select()
    .single();

  logger.info(`[SupabaseHealth] Daily metrics Supabase response - status: ${status}, statusText: ${statusText}, data: ${data ? 'present' : 'null'}, error: ${error ? JSON.stringify(error) : 'none'}`);

  if (error) {
    logger.error('[SupabaseHealth] Error upserting daily metrics:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Successfully upserted daily metrics for user ${userId}, date: ${(metrics as any).local_date}`);
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

export async function getDailyMetricsByDate(userId: string, localDate: string): Promise<UserDailyMetric | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('user_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .eq('local_date', localDate)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching daily metrics by date:', error);
    throw error;
  }

  // If we have HealthKit data with sleep, return it directly
  if (data && data.sleep_hours !== null && data.sleep_hours !== undefined) {
    return data;
  }

  // Try to supplement with manual sleep entry if HealthKit sleep data is missing
  try {
    const manualSleep = await getManualSleepByDate(userId, localDate);
    if (manualSleep && manualSleep.duration_minutes) {
      const manualSleepHours = manualSleep.duration_minutes / 60;
      logger.info(`[SupabaseHealth] Supplementing daily metrics with manual sleep: ${manualSleepHours.toFixed(2)}h for ${localDate}`);
      
      if (data) {
        // Supplement existing metrics with manual sleep data
        return {
          ...data,
          sleep_hours: manualSleepHours,
        };
      } else {
        // Create minimal metrics from manual sleep entry only
        const now = new Date();
        return {
          health_id: healthId,
          local_date: localDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          utc_day_start: now,
          utc_day_end: now,
          sleep_hours: manualSleepHours,
        };
      }
    }
  } catch (manualSleepError) {
    logger.debug('[SupabaseHealth] No manual sleep entry found for supplementing daily metrics');
  }

  return data || null;
}

interface GetDailyMetricsFlexibleOptions {
  startDate?: Date;
  endDate?: Date;
  localDate?: string;
  limit?: number;
}

export async function getDailyMetricsFlexible(userId: string, options: GetDailyMetricsFlexibleOptions = {}): Promise<UserDailyMetric[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('user_daily_metrics')
    .select('*')
    .eq('health_id', healthId);

  if (options.localDate) {
    query = query.eq('local_date', options.localDate);
  }
  if (options.startDate) {
    query = query.gte('local_date', options.startDate.toISOString().split('T')[0]);
  }
  if (options.endDate) {
    query = query.lte('local_date', options.endDate.toISOString().split('T')[0]);
  }
  
  query = query.order('local_date', { ascending: false });
  
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching daily metrics (flexible):', error);
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
  logger.info(`[SupabaseHealth] upsertFlomentumDaily called for user ${userId}, date: ${flomentum.date}, score: ${flomentum.score}`);
  
  const healthId = await getHealthId(userId);
  logger.info(`[SupabaseHealth] Got healthId ${healthId} for flomentum upsert`);
  
  const payload = {
    ...flomentum,
    health_id: healthId,
    updated_at: new Date().toISOString(),
  };
  logger.info(`[SupabaseHealth] Flomentum upsert payload: ${JSON.stringify(payload)}`);
  
  const { data, error, status, statusText } = await supabase
    .from('flomentum_daily')
    .upsert(payload, {
      onConflict: 'health_id,date',
    })
    .select()
    .single();

  logger.info(`[SupabaseHealth] Flomentum Supabase response - status: ${status}, statusText: ${statusText}, data: ${data ? 'present' : 'null'}, error: ${error ? JSON.stringify(error) : 'none'}`);

  if (error) {
    logger.error('[SupabaseHealth] Error upserting flomentum daily:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Successfully upserted flomentum for user ${userId}, date: ${flomentum.date}`);
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

// ==================== MANUAL SLEEP ENTRIES ====================

export interface ManualSleepEntry {
  id?: string;
  health_id: string;
  sleep_date: string;
  timezone: string;
  bedtime: Date | string;
  wake_time: Date | string;
  bedtime_local: string;
  waketime_local: string;
  duration_minutes: number;
  quality_rating: number;
  notes?: string | null;
  nightflo_score: number;
  score_label: string;
  is_timer_active?: boolean;
  timer_started_at?: Date | string | null;
  source?: 'manual' | 'healthkit';
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Calculate NightFlo score for manual sleep entries (simplified algorithm)
 * Based on duration (60%) and quality rating (40%)
 */
export function calculateManualNightfloScore(durationMinutes: number, qualityRating: number): { score: number; label: string } {
  // Duration scoring (same breakpoints as sleepScoringEngine)
  let durationScore: number;
  if (durationMinutes < 270) { // < 4.5h
    durationScore = 0;
  } else if (durationMinutes < 360) { // 4.5-6h
    durationScore = ((durationMinutes - 270) / 90) * 50;
  } else if (durationMinutes < 420) { // 6-7h
    durationScore = 50 + ((durationMinutes - 360) / 60) * 50;
  } else if (durationMinutes <= 540) { // 7-9h (ideal)
    durationScore = 100;
  } else if (durationMinutes <= 600) { // 9-10h
    durationScore = 100 - ((durationMinutes - 540) / 60) * 100;
  } else { // > 10h
    durationScore = 0;
  }

  // Quality rating to score (1-5 maps to 0-100)
  const qualityScore = ((qualityRating - 1) / 4) * 100;

  // Weighted combination: 60% duration, 40% quality
  const nightfloScore = Math.round(0.6 * durationScore + 0.4 * qualityScore);
  const clampedScore = Math.max(0, Math.min(100, nightfloScore));

  // Score label
  let scoreLabel: string;
  if (clampedScore >= 80) {
    scoreLabel = 'Excellent';
  } else if (clampedScore >= 60) {
    scoreLabel = 'Good';
  } else if (clampedScore >= 40) {
    scoreLabel = 'Fair';
  } else {
    scoreLabel = 'Low';
  }

  return { score: clampedScore, label: scoreLabel };
}

export async function upsertManualSleepEntry(userId: string, entry: Omit<ManualSleepEntry, 'health_id'>): Promise<ManualSleepEntry> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .upsert({
      ...entry,
      health_id: healthId,
      source: 'manual',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id,sleep_date',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting manual sleep entry:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Upserted manual sleep for ${entry.sleep_date}`, {
    durationMin: entry.duration_minutes,
    quality: entry.quality_rating,
    score: entry.nightflo_score,
  });

  return data;
}

export async function getManualSleepEntries(userId: string, days = 14): Promise<ManualSleepEntry[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .order('sleep_date', { ascending: false })
    .limit(days);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching manual sleep entries:', error);
    throw error;
  }

  return data || [];
}

export async function getManualSleepByDate(userId: string, sleepDate: string): Promise<ManualSleepEntry | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .eq('sleep_date', sleepDate)
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error fetching manual sleep by date:', error);
    throw error;
  }

  return data;
}

export async function getActiveManualSleepTimer(userId: string): Promise<ManualSleepEntry | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .eq('is_timer_active', true)
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error fetching active sleep timer:', error);
    throw error;
  }

  return data;
}

export async function startManualSleepTimer(userId: string, timezone: string): Promise<ManualSleepEntry> {
  const healthId = await getHealthId(userId);
  const now = new Date();
  
  // Calculate the local date in user's timezone for the sleep_date
  // This is the date when sleep STARTS (bedtime date)
  const localDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD format
  
  // Format local bedtime
  const bedtimeLocal = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).toLowerCase();

  // Check if there's already an entry for today
  const { data: existingEntry } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .eq('sleep_date', localDateStr)
    .maybeSingle();

  if (existingEntry) {
    // If it's a manual entry without active timer, convert it to timer mode
    if (existingEntry.source === 'manual' && !existingEntry.is_timer_active) {
      const { data: updated, error: updateError } = await supabase
        .from('sleep_nights')
        .update({
          bedtime: now.toISOString(),
          bedtime_local: bedtimeLocal,
          wake_time: now.toISOString(),
          waketime_local: '',
          duration_minutes: 0,
          is_timer_active: true,
          timer_started_at: now.toISOString(),
          timezone,
          updated_at: now.toISOString(),
        })
        .eq('id', existingEntry.id)
        .eq('health_id', healthId)
        .select()
        .single();

      if (updateError) {
        logger.error('[SupabaseHealth] Error converting entry to timer:', updateError);
        throw updateError;
      }

      logger.info(`[SupabaseHealth] Converted existing entry to timer at ${bedtimeLocal}`);
      return updated;
    }
    
    // If it's HealthKit data or already has an active timer, throw an error
    if (existingEntry.source === 'healthkit') {
      throw new Error('You already have HealthKit sleep data for today. Delete it first to use the timer.');
    }
    if (existingEntry.is_timer_active) {
      throw new Error('A sleep timer is already active.');
    }
  }

  // No existing entry, create a new one
  const entry: Omit<ManualSleepEntry, 'health_id'> = {
    sleep_date: localDateStr,
    timezone,
    bedtime: now.toISOString(),
    wake_time: now.toISOString(), // Placeholder
    bedtime_local: bedtimeLocal,
    waketime_local: '', // Will be filled on stop
    duration_minutes: 0,
    quality_rating: 3, // Default middle rating
    nightflo_score: 0,
    score_label: 'Low',
    is_timer_active: true,
    timer_started_at: now.toISOString(),
    source: 'manual',
  };

  const { data, error } = await supabase
    .from('sleep_nights')
    .insert({
      ...entry,
      health_id: healthId,
      source: 'manual',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error starting sleep timer:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Started sleep timer at ${bedtimeLocal}`);
  return data;
}

export async function stopManualSleepTimer(
  userId: string, 
  qualityRating: number, 
  notes?: string
): Promise<ManualSleepEntry | null> {
  const healthId = await getHealthId(userId);
  
  // Find active timer
  const activeTimer = await getActiveManualSleepTimer(userId);
  if (!activeTimer) {
    logger.warn('[SupabaseHealth] No active sleep timer found');
    return null;
  }

  const now = new Date();
  const bedtime = new Date(activeTimer.bedtime);
  const durationMinutes = Math.round((now.getTime() - bedtime.getTime()) / (1000 * 60));
  
  // Calculate the actual sleep date (date of wake)
  const sleepDate = now.toISOString().split('T')[0];
  
  // Format local wake time
  const waketimeLocal = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: activeTimer.timezone,
  }).toLowerCase();

  // Calculate NightFlo score
  const { score, label } = calculateManualNightfloScore(durationMinutes, qualityRating);

  // Check if a different entry already exists for this sleep_date (unique constraint issue)
  // If the timer was started on a different date than when it's being stopped,
  // we need to handle the potential conflict
  const timerStartDate = activeTimer.sleep_date;
  
  if (timerStartDate !== sleepDate) {
    // The sleep_date is changing - check if there's already an entry for the target date
    const { data: existingEntry } = await supabase
      .from('sleep_nights')
      .select('id, source')
      .eq('health_id', healthId)
      .eq('sleep_date', sleepDate)
      .neq('id', activeTimer.id)
      .maybeSingle();

    if (existingEntry) {
      // Check if the existing entry is from HealthKit - never overwrite those
      if (existingEntry.source === 'healthkit') {
        logger.warn('[SupabaseHealth] Cannot overwrite HealthKit sleep data, keeping timer on original date');
        // Keep the timer entry on its original date instead of moving it
        const { data, error } = await supabase
          .from('sleep_nights')
          .update({
            wake_time: now.toISOString(),
            waketime_local: waketimeLocal,
            duration_minutes: durationMinutes,
            quality_rating: qualityRating,
            notes: notes || null,
            nightflo_score: score,
            score_label: label,
            is_timer_active: false,
            timer_started_at: null,
            source: 'manual',
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeTimer.id)
          .select()
          .single();

        if (error) {
          logger.error('[SupabaseHealth] Error stopping timer (kept original date):', error);
          throw error;
        }

        return data;
      }
      
      // Existing entry is manual - safe to merge/overwrite
      logger.info('[SupabaseHealth] Found existing manual entry for sleep_date, using upsert approach');
      
      // Delete the timer row first
      await supabase
        .from('sleep_nights')
        .delete()
        .eq('id', activeTimer.id);
      
      // Upsert the sleep entry for the target date
      const { data, error } = await supabase
        .from('sleep_nights')
        .upsert({
          health_id: healthId,
          sleep_date: sleepDate,
          timezone: activeTimer.timezone,
          bedtime: activeTimer.bedtime,
          wake_time: now.toISOString(),
          bedtime_local: activeTimer.bedtime_local,
          waketime_local: waketimeLocal,
          duration_minutes: durationMinutes,
          quality_rating: qualityRating,
          notes: notes || null,
          nightflo_score: score,
          score_label: label,
          is_timer_active: false,
          timer_started_at: null,
          source: 'manual',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'health_id,sleep_date',
        })
        .select()
        .single();

      if (error) {
        logger.error('[SupabaseHealth] Error upserting stopped timer:', error);
        throw error;
      }

      logger.info(`[SupabaseHealth] Stopped sleep timer (upsert)`, {
        durationMin: durationMinutes,
        quality: qualityRating,
        score,
        label,
      });

      return data;
    }
  }

  // Normal case: just update the existing timer row
  const { data, error } = await supabase
    .from('sleep_nights')
    .update({
      sleep_date: sleepDate,
      wake_time: now.toISOString(),
      waketime_local: waketimeLocal,
      duration_minutes: durationMinutes,
      quality_rating: qualityRating,
      notes: notes || null,
      nightflo_score: score,
      score_label: label,
      is_timer_active: false,
      timer_started_at: null,
      source: 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeTimer.id)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error stopping sleep timer:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Stopped sleep timer`, {
    durationMin: durationMinutes,
    quality: qualityRating,
    score,
    label,
  });

  return data;
}

export async function getManualSleepEntryById(userId: string, entryId: string): Promise<ManualSleepEntry | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('id', entryId)
    .eq('health_id', healthId)
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error fetching manual sleep entry by ID:', error);
    return null;
  }

  return data;
}

export async function updateManualSleepEntry(
  userId: string,
  entryId: string,
  updates: Partial<Pick<ManualSleepEntry, 'bedtime' | 'wake_time' | 'quality_rating' | 'notes'>>
): Promise<ManualSleepEntry | null> {
  const healthId = await getHealthId(userId);
  
  // Get existing entry to recalculate if times changed
  const { data: existing, error: fetchError } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('id', entryId)
    .eq('health_id', healthId)
    .single();

  if (fetchError || !existing) {
    logger.error('[SupabaseHealth] Manual sleep entry not found:', fetchError);
    return null;
  }

  // Prepare update data
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.notes !== undefined) {
    updateData.notes = updates.notes;
  }

  if (updates.quality_rating !== undefined) {
    updateData.quality_rating = updates.quality_rating;
  }

  // If times changed, recalculate duration and local times
  const bedtime = updates.bedtime ? new Date(updates.bedtime) : new Date(existing.bedtime);
  const wakeTime = updates.wake_time ? new Date(updates.wake_time) : new Date(existing.wake_time);

  if (updates.bedtime || updates.wake_time) {
    const durationMinutes = Math.round((wakeTime.getTime() - bedtime.getTime()) / (1000 * 60));
    updateData.bedtime = bedtime.toISOString();
    updateData.wake_time = wakeTime.toISOString();
    updateData.duration_minutes = durationMinutes;
    updateData.sleep_date = wakeTime.toISOString().split('T')[0];
    
    updateData.bedtime_local = bedtime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: existing.timezone,
    }).toLowerCase();
    
    updateData.waketime_local = wakeTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: existing.timezone,
    }).toLowerCase();
  }

  // Recalculate NightFlo score
  const qualityRating = updates.quality_rating ?? existing.quality_rating;
  const durationMinutes = updateData.duration_minutes ?? existing.duration_minutes;
  const { score, label } = calculateManualNightfloScore(durationMinutes, qualityRating);
  updateData.nightflo_score = score;
  updateData.score_label = label;

  const { data, error } = await supabase
    .from('sleep_nights')
    .update(updateData)
    .eq('id', entryId)
    .eq('health_id', healthId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error updating manual sleep entry:', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Updated manual sleep entry ${entryId}`);
  return data;
}

export async function deleteManualSleepEntry(userId: string, entryId: string): Promise<boolean> {
  const healthId = await getHealthId(userId);
  
  const { error } = await supabase
    .from('sleep_nights')
    .delete()
    .eq('id', entryId)
    .eq('health_id', healthId);

  if (error) {
    logger.error('[SupabaseHealth] Error deleting manual sleep entry:', error);
    return false;
  }

  logger.info(`[SupabaseHealth] Deleted manual sleep entry ${entryId}`);
  return true;
}

/**
 * Get combined sleep data (HealthKit + Manual) for a date range
 * Prefers HealthKit data when both exist for the same date
 */
export async function getCombinedSleepData(
  userId: string,
  days = 14
): Promise<Array<SleepNight | ManualSleepEntry & { source: 'healthkit' | 'manual' }>> {
  const healthId = await getHealthId(userId);
  
  // Fetch both data sources
  const [healthKitData, manualData] = await Promise.all([
    getSleepNights(userId, days),
    getManualSleepEntries(userId, days),
  ]);

  // Create a map of dates to data, preferring HealthKit
  const dateMap = new Map<string, (SleepNight | ManualSleepEntry) & { source: 'healthkit' | 'manual' }>();

  // Add manual entries first
  for (const entry of manualData) {
    dateMap.set(entry.sleep_date, { ...entry, source: 'manual' });
  }

  // Override with HealthKit data (preferred)
  for (const entry of healthKitData) {
    dateMap.set(entry.sleep_date, { ...entry, source: 'healthkit' });
  }

  // Convert to array and sort by date
  const combined = Array.from(dateMap.values());
  combined.sort((a, b) => b.sleep_date.localeCompare(a.sleep_date));

  return combined;
}

// ==================== NUTRITION DAILY METRICS ====================

export interface NutritionDailyMetrics {
  id?: string;
  health_id: string;
  local_date: string;
  timezone: string;
  energy_kcal?: number | null;
  carbohydrates_g?: number | null;
  protein_g?: number | null;
  fat_total_g?: number | null;
  fat_saturated_g?: number | null;
  fat_polyunsaturated_g?: number | null;
  fat_monounsaturated_g?: number | null;
  cholesterol_mg?: number | null;
  fiber_g?: number | null;
  sugar_g?: number | null;
  vitamin_a_mcg?: number | null;
  vitamin_b6_mg?: number | null;
  vitamin_b12_mcg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  vitamin_e_mg?: number | null;
  vitamin_k_mcg?: number | null;
  thiamin_mg?: number | null;
  riboflavin_mg?: number | null;
  niacin_mg?: number | null;
  folate_mcg?: number | null;
  biotin_mcg?: number | null;
  pantothenic_acid_mg?: number | null;
  calcium_mg?: number | null;
  chloride_mg?: number | null;
  chromium_mcg?: number | null;
  copper_mg?: number | null;
  iodine_mcg?: number | null;
  iron_mg?: number | null;
  magnesium_mg?: number | null;
  manganese_mg?: number | null;
  molybdenum_mcg?: number | null;
  phosphorus_mg?: number | null;
  potassium_mg?: number | null;
  selenium_mcg?: number | null;
  sodium_mg?: number | null;
  zinc_mg?: number | null;
  caffeine_mg?: number | null;
  water_ml?: number | null;
  meal_count?: number | null;
  sources?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function getNutritionDailyMetrics(userId: string, days = 7): Promise<NutritionDailyMetrics[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('nutrition_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching nutrition daily metrics:', error);
    throw error;
  }

  return data || [];
}

interface GetNutritionDailyOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getNutritionDailyMetricsFlexible(userId: string, options: GetNutritionDailyOptions = {}): Promise<NutritionDailyMetrics[]> {
  const healthId = await getHealthId(userId);
  logger.info(`[SupabaseHealth] Nutrition query - userId: ${userId} -> healthId: ${healthId}`);
  
  let query = supabase
    .from('nutrition_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .order('local_date', { ascending: false });

  if (options.startDate) {
    const startDateStr = options.startDate.toISOString().split('T')[0];
    logger.info(`[SupabaseHealth] Nutrition query filter - startDate: ${startDateStr}`);
    query = query.gte('local_date', startDateStr);
  }
  if (options.endDate) {
    const endDateStr = options.endDate.toISOString().split('T')[0];
    query = query.lte('local_date', endDateStr);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching nutrition daily metrics (flexible):', error);
    throw error;
  }

  logger.info(`[SupabaseHealth] Nutrition query returned ${data?.length || 0} records`);
  if (data && data.length > 0) {
    logger.info(`[SupabaseHealth] First nutrition record: ${JSON.stringify(data[0])}`);
  }

  return data || [];
}

export async function getNutritionDailyByDate(userId: string, localDate: string): Promise<NutritionDailyMetrics | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('nutrition_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error fetching nutrition daily by date:', error);
    throw error;
  }

  return data;
}

export async function upsertNutritionDailyMetrics(userId: string, nutrition: Omit<NutritionDailyMetrics, 'health_id'>): Promise<NutritionDailyMetrics> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('nutrition_daily_metrics')
    .upsert({
      ...nutrition,
      health_id: healthId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id,local_date',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting nutrition daily metrics:', error);
    throw error;
  }

  return data;
}

// ==================== MINDFULNESS SESSIONS ====================

export interface MindfulnessSession {
  id?: string;
  health_id: string;
  session_date: string;
  timezone: string;
  start_time: Date;
  end_time: Date;
  duration_minutes: number;
  source_name?: string | null;
  source_id?: string | null;
  healthkit_uuid?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function getMindfulnessSessions(userId: string, days = 7): Promise<MindfulnessSession[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('mindfulness_sessions')
    .select('*')
    .eq('health_id', healthId)
    .order('start_time', { ascending: false })
    .limit(days * 10); // Allow multiple sessions per day

  if (error) {
    logger.error('[SupabaseHealth] Error fetching mindfulness sessions:', error);
    throw error;
  }

  return data || [];
}

interface GetMindfulnessSessionsOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getMindfulnessSessionsFlexible(userId: string, options: GetMindfulnessSessionsOptions = {}): Promise<MindfulnessSession[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('mindfulness_sessions')
    .select('*')
    .eq('health_id', healthId)
    .order('start_time', { ascending: false });

  if (options.startDate) {
    const startDateStr = options.startDate.toISOString().split('T')[0];
    query = query.gte('session_date', startDateStr);
  }
  if (options.endDate) {
    const endDateStr = options.endDate.toISOString().split('T')[0];
    query = query.lte('session_date', endDateStr);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching mindfulness sessions (flexible):', error);
    throw error;
  }

  return data || [];
}

export async function createMindfulnessSession(userId: string, session: Omit<MindfulnessSession, 'health_id'>): Promise<MindfulnessSession> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('mindfulness_sessions')
    .upsert({
      ...session,
      health_id: healthId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id,healthkit_uuid',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating mindfulness session:', error);
    throw error;
  }

  return data;
}

// ==================== MINDFULNESS DAILY METRICS ====================

export interface MindfulnessDailyMetrics {
  id?: string;
  health_id: string;
  local_date: string;
  timezone: string;
  total_minutes: number;
  session_count: number;
  avg_session_minutes?: number | null;
  longest_session_minutes?: number | null;
  sources?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function getMindfulnessDailyMetrics(userId: string, days = 7): Promise<MindfulnessDailyMetrics[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('mindfulness_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching mindfulness daily metrics:', error);
    throw error;
  }

  return data || [];
}

interface GetMindfulnessDailyOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getMindfulnessDailyMetricsFlexible(userId: string, options: GetMindfulnessDailyOptions = {}): Promise<MindfulnessDailyMetrics[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('mindfulness_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .order('local_date', { ascending: false });

  if (options.startDate) {
    const startDateStr = options.startDate.toISOString().split('T')[0];
    query = query.gte('local_date', startDateStr);
  }
  if (options.endDate) {
    const endDateStr = options.endDate.toISOString().split('T')[0];
    query = query.lte('local_date', endDateStr);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching mindfulness daily metrics (flexible):', error);
    throw error;
  }

  return data || [];
}

export async function getMindfulnessDailyByDate(userId: string, localDate: string): Promise<MindfulnessDailyMetrics | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('mindfulness_daily_metrics')
    .select('*')
    .eq('health_id', healthId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error fetching mindfulness daily by date:', error);
    throw error;
  }

  return data;
}

export async function upsertMindfulnessDailyMetrics(userId: string, mindfulness: Omit<MindfulnessDailyMetrics, 'health_id'>): Promise<MindfulnessDailyMetrics> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('mindfulness_daily_metrics')
    .upsert({
      ...mindfulness,
      health_id: healthId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'health_id,local_date',
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error upserting mindfulness daily metrics:', error);
    throw error;
  }

  return data;
}

// ==================== ACTION PLAN ITEMS ====================
// Extended to match Neon schema for Daily Insights integration

export interface ActionPlanItem {
  id?: string;
  health_id: string;
  title?: string | null;
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
  // Extended fields for Daily Insights integration (matches Neon schema)
  daily_insight_id?: string | null;
  snapshot_title?: string | null;
  snapshot_insight?: string | null;
  snapshot_action?: string | null;
  biomarker_id?: string | null;
  target_biomarker?: string | null;
  unit?: string | null;
  added_at?: Date | null;
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

export async function updateActionPlanItem(itemId: string, updates: Partial<ActionPlanItem>): Promise<ActionPlanItem | null> {
  const { data, error } = await supabase
    .from('action_plan_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error updating action plan item:', error);
    throw error;
  }

  if (!data) {
    logger.warn(`[SupabaseHealth] No action plan item found with id: ${itemId}`);
    return null;
  }

  return data;
}

export async function deleteActionPlanItem(itemId: string, healthId: string): Promise<boolean> {
  const { error, count } = await supabase
    .from('action_plan_items')
    .delete()
    .eq('id', itemId)
    .eq('health_id', healthId);

  if (error) {
    logger.error('[SupabaseHealth] Error deleting action plan item:', error);
    throw error;
  }

  return true;
}

// ==================== INSIGHT CARDS ====================
// AI-detected health patterns from data analysis

export interface InsightCard {
  id?: string;
  health_id: string;
  category: string;
  pattern: string;
  confidence: number;
  supporting_data?: string | null;
  details?: Record<string, any> | null;
  is_new?: boolean;
  is_active?: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export async function getInsightCards(userId: string, activeOnly: boolean = true): Promise<InsightCard[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('insight_cards')
    .select('*')
    .eq('health_id', healthId)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching insight cards:', error);
    throw error;
  }

  return data || [];
}

export async function createInsightCard(userId: string, card: Omit<InsightCard, 'health_id'>): Promise<InsightCard> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('insight_cards')
    .insert({
      ...card,
      health_id: healthId,
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating insight card:', error);
    throw error;
  }

  return data;
}

export async function updateInsightCard(cardId: string, updates: Partial<InsightCard>): Promise<InsightCard> {
  const { data, error } = await supabase
    .from('insight_cards')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error updating insight card:', error);
    throw error;
  }

  return data;
}

/**
 * Mark all NEW insight cards as discussed after a Flō Oracle conversation
 * This prevents the AI from repeatedly bringing up the same insights
 */
export async function markInsightCardsAsDiscussed(userId: string): Promise<number> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('insight_cards')
    .update({ 
      is_new: false,
      updated_at: new Date().toISOString(),
    })
    .eq('health_id', healthId)
    .eq('is_new', true)
    .eq('is_active', true)
    .select('id');

  if (error) {
    logger.error('[SupabaseHealth] Error marking insight cards as discussed:', error);
    throw error;
  }

  return data?.length || 0;
}

/**
 * Mark all insights (both insight_cards and daily_insights) as discussed after a conversation
 * Called at end of Flō Oracle voice/text sessions to prevent repetition
 */
export async function markAllInsightsAsDiscussed(userId: string): Promise<{ insightCards: number; dailyInsights: number }> {
  const healthId = await getHealthId(userId);
  let cardsCount = 0;
  let insightsCount = 0;
  
  try {
    // Mark insight_cards as discussed
    const cardsResult = await supabase
      .from('insight_cards')
      .update({ 
        is_new: false,
        updated_at: new Date().toISOString(),
      })
      .eq('health_id', healthId)
      .eq('is_new', true)
      .eq('is_active', true)
      .select('id');
    
    if (cardsResult.error) {
      logger.error('[SupabaseHealth] Error marking insight cards as discussed:', cardsResult.error);
    } else {
      cardsCount = cardsResult.data?.length || 0;
    }
  } catch (err: any) {
    logger.error('[SupabaseHealth] Exception marking insight cards as discussed:', err.message);
  }
  
  try {
    // Mark ALL new daily_insights as discussed (not just today's - user may discuss older insights)
    const insightsResult = await supabase
      .from('daily_insights')
      .update({ is_new: false })
      .eq('health_id', healthId)
      .eq('is_new', true)
      .select('id');
    
    if (insightsResult.error) {
      logger.error('[SupabaseHealth] Error marking daily insights as discussed:', insightsResult.error);
    } else {
      insightsCount = insightsResult.data?.length || 0;
    }
  } catch (err: any) {
    logger.error('[SupabaseHealth] Exception marking daily insights as discussed:', err.message);
  }
  
  if (cardsCount > 0 || insightsCount > 0) {
    logger.info('[SupabaseHealth] Marked insights as discussed after conversation', {
      userId,
      insightCardsMarked: cardsCount,
      dailyInsightsMarked: insightsCount,
    });
  }
  
  return { insightCards: cardsCount, dailyInsights: insightsCount };
}

// ==================== DAILY INSIGHTS ====================
// AI-generated personalized health insights (PHI - stored in Supabase for privacy)

export interface DailyInsight {
  id?: string;
  health_id: string;
  generated_date: string; // YYYY-MM-DD
  title: string;
  body: string;
  action?: string | null;
  target_biomarker?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  unit?: string | null;
  confidence_score: number;
  impact_score: number;
  actionability_score: number;
  freshness_score: number;
  overall_score: number;
  evidence_tier: string;
  primary_sources: string[];
  category: string;
  generating_layer: string;
  details: Record<string, any>;
  is_new: boolean;
  is_dismissed: boolean;
  created_at?: Date | string;
}

export async function getDailyInsights(
  userId: string, 
  options?: { startDate?: Date; limit?: number; generatedDate?: string }
): Promise<DailyInsight[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('daily_insights')
    .select('*')
    .eq('health_id', healthId)
    .order('overall_score', { ascending: false })
    .order('created_at', { ascending: false });

  if (options?.generatedDate) {
    query = query.eq('generated_date', options.generatedDate);
  }
  
  if (options?.startDate) {
    const startDateStr = options.startDate.toISOString().split('T')[0];
    query = query.gte('generated_date', startDateStr);
  }
  
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching daily insights:', error);
    throw error;
  }

  return data || [];
}

export async function getDailyInsightsByDate(userId: string, generatedDate: string): Promise<DailyInsight[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('health_id', healthId)
    .eq('generated_date', generatedDate)
    .eq('is_dismissed', false)
    .order('overall_score', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching daily insights by date:', error);
    throw error;
  }

  return data || [];
}

export async function getDailyInsightById(userId: string, insightId: string): Promise<DailyInsight | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('id', insightId)
    .eq('health_id', healthId)
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error fetching daily insight by id:', error);
    throw error;
  }

  return data;
}

export async function createDailyInsight(userId: string, insight: Omit<DailyInsight, 'health_id'>): Promise<DailyInsight> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('daily_insights')
    .insert({
      ...insight,
      health_id: healthId,
    })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating daily insight:', error);
    throw error;
  }

  return data;
}

export async function updateDailyInsight(insightId: string, updates: Partial<DailyInsight>): Promise<DailyInsight | null> {
  const { data, error } = await supabase
    .from('daily_insights')
    .update(updates)
    .eq('id', insightId)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('[SupabaseHealth] Error updating daily insight:', error);
    throw error;
  }

  return data;
}

export async function dismissDailyInsight(insightId: string, healthId: string): Promise<boolean> {
  const { error } = await supabase
    .from('daily_insights')
    .update({ is_dismissed: true })
    .eq('id', insightId)
    .eq('health_id', healthId);

  if (error) {
    logger.error('[SupabaseHealth] Error dismissing daily insight:', error);
    throw error;
  }

  return true;
}

export async function markDailyInsightsAsRead(userId: string, generatedDate: string): Promise<boolean> {
  const healthId = await getHealthId(userId);
  
  const { error } = await supabase
    .from('daily_insights')
    .update({ is_new: false })
    .eq('health_id', healthId)
    .eq('generated_date', generatedDate)
    .eq('is_new', true);

  if (error) {
    logger.error('[SupabaseHealth] Error marking daily insights as read:', error);
    throw error;
  }

  return true;
}

export async function deleteDailyInsights(userId: string, generatedDate: string): Promise<boolean> {
  const healthId = await getHealthId(userId);
  
  const { error } = await supabase
    .from('daily_insights')
    .delete()
    .eq('health_id', healthId)
    .eq('generated_date', generatedDate);

  if (error) {
    logger.error('[SupabaseHealth] Error deleting daily insights:', error);
    throw error;
  }

  return true;
}

export async function getAllDailyInsights(userId: string): Promise<DailyInsight[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('health_id', healthId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching all daily insights:', error);
    throw error;
  }

  return data || [];
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

// ==================== AGGREGATION FUNCTIONS FOR REMINDER CONTEXT ====================

/**
 * Get biomarker measurements with trend calculation for reminder context
 * Returns measurements from last 90 days grouped by biomarker with percent change
 */
export interface BiomarkerTrendResult {
  biomarker_name: string;
  current_value: number;
  unit: string;
  current_date: Date;
  previous_value?: number;
  previous_date?: Date;
  percent_change?: number;
}

export async function getBiomarkerTrends(userId: string, minPercentChange: number = 5): Promise<BiomarkerTrendResult[]> {
  const healthId = await getHealthId(userId);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Join through biomarker_test_sessions to filter by health_id and get biomarker name from biomarkers table
  const { data: measurements, error } = await supabase
    .from('biomarker_measurements')
    .select(`
      id,
      value_canonical,
      unit_canonical,
      biomarkers!inner(name),
      biomarker_test_sessions!inner(health_id, test_date)
    `)
    .eq('biomarker_test_sessions.health_id', healthId)
    .gte('biomarker_test_sessions.test_date', ninetyDaysAgo.toISOString())
    .not('value_canonical', 'is', null);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching biomarker trends:', error);
    throw error;
  }

  if (!measurements || measurements.length === 0) {
    return [];
  }

  // Normalize measurement data with joined biomarker name and session date
  const normalizedMeasurements = measurements.map((m: any) => ({
    biomarker_name: m.biomarkers?.name || 'Unknown',
    value: m.value_canonical,
    unit: m.unit_canonical,
    test_date: m.biomarker_test_sessions?.test_date,
  }));

  // Sort by biomarker name and test date descending
  normalizedMeasurements.sort((a, b) => {
    if (a.biomarker_name !== b.biomarker_name) {
      return a.biomarker_name.localeCompare(b.biomarker_name);
    }
    return new Date(b.test_date).getTime() - new Date(a.test_date).getTime();
  });

  // Group by biomarker and calculate trends
  const groupedByBiomarker = new Map<string, typeof normalizedMeasurements>();
  for (const m of normalizedMeasurements) {
    if (!groupedByBiomarker.has(m.biomarker_name)) {
      groupedByBiomarker.set(m.biomarker_name, []);
    }
    groupedByBiomarker.get(m.biomarker_name)!.push(m);
  }

  const trends: BiomarkerTrendResult[] = [];
  for (const [biomarkerName, biomarkerMeasurements] of Array.from(groupedByBiomarker.entries())) {
    if (biomarkerMeasurements.length < 1) continue;
    
    const current = biomarkerMeasurements[0];
    const previous = biomarkerMeasurements.length > 1 ? biomarkerMeasurements[1] : null;
    
    let percentChange: number | undefined;
    if (previous && previous.value !== 0) {
      percentChange = Math.round(((current.value - previous.value) / previous.value) * 1000) / 10;
    }

    // Only include if percent change meets threshold
    if (percentChange !== undefined && Math.abs(percentChange) >= minPercentChange) {
      trends.push({
        biomarker_name: biomarkerName,
        current_value: current.value,
        unit: current.unit || '',
        current_date: new Date(current.test_date),
        previous_value: previous?.value,
        previous_date: previous?.test_date ? new Date(previous.test_date) : undefined,
        percent_change: percentChange,
      });
    }
  }

  // Sort by absolute percent change descending
  trends.sort((a, b) => Math.abs(b.percent_change || 0) - Math.abs(a.percent_change || 0));
  return trends.slice(0, 6);
}

/**
 * Get all biomarker measurements for a user (for insights engine)
 * Returns complete measurement history with biomarker name, value, unit, and test date
 */
export interface BiomarkerMeasurementResult {
  name: string;
  value: number;
  unit: string;
  testDate: Date;
  isAbnormal: boolean;
}

export async function getAllBiomarkerMeasurements(userId: string): Promise<BiomarkerMeasurementResult[]> {
  const healthId = await getHealthId(userId);

  // Join biomarker_measurements with biomarker_test_sessions and biomarkers to get complete data
  const { data: measurements, error } = await supabase
    .from('biomarker_measurements')
    .select(`
      id,
      value_canonical,
      unit_canonical,
      flags,
      biomarkers!inner(name),
      biomarker_test_sessions!inner(health_id, test_date)
    `)
    .eq('biomarker_test_sessions.health_id', healthId)
    .not('value_canonical', 'is', null)
    .order('biomarker_test_sessions(test_date)', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching all biomarker measurements:', error);
    throw error;
  }

  if (!measurements || measurements.length === 0) {
    return [];
  }

  // Transform to standardized format
  return measurements.map((m: any) => ({
    name: m.biomarkers?.name || 'Unknown',
    value: m.value_canonical,
    unit: m.unit_canonical || '',
    testDate: new Date(m.biomarker_test_sessions?.test_date),
    isAbnormal: Array.isArray(m.flags) && m.flags.length > 0,
  }));
}

/**
 * Get wearable averages for 7-day and 30-day windows
 */
export interface WearableAveragesResult {
  hrv_7d_avg?: number;
  rhr_7d_avg?: number;
  sleep_7d_avg_hours?: number;
  active_kcal_7d_avg?: number;
  steps_7d_avg?: number;
  hrv_30d_avg?: number;
  rhr_30d_avg?: number;
  sleep_30d_avg_hours?: number;
  hrv_trend_percent?: number;
}

export async function getWearableAverages(userId: string): Promise<WearableAveragesResult | null> {
  const healthId = await getHealthId(userId);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: metrics, error } = await supabase
    .from('user_daily_metrics')
    .select(`
      local_date,
      hrv_ms,
      resting_hr_bpm,
      sleep_hours,
      active_energy_kcal,
      steps_normalized
    `)
    .eq('health_id', healthId)
    .gte('local_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('local_date', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching wearable averages:', error);
    throw error;
  }

  if (!metrics || metrics.length === 0) {
    return null;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const last7Days = metrics.filter(m => m.local_date >= sevenDaysAgoStr);
  const last30Days = metrics;

  const avg = (arr: (number | null | undefined)[]): number | undefined => {
    const valid = arr.filter(v => v != null) as number[];
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : undefined;
  };

  const hrv7d = avg(last7Days.map(m => m.hrv_ms));
  const hrv30d = avg(last30Days.map(m => m.hrv_ms));

  return {
    hrv_7d_avg: hrv7d ? Math.round(hrv7d * 10) / 10 : undefined,
    rhr_7d_avg: avg(last7Days.map(m => m.resting_hr_bpm)) ? Math.round(avg(last7Days.map(m => m.resting_hr_bpm))! * 10) / 10 : undefined,
    sleep_7d_avg_hours: avg(last7Days.map(m => m.sleep_hours)) ? Math.round(avg(last7Days.map(m => m.sleep_hours))! * 100) / 100 : undefined,
    active_kcal_7d_avg: avg(last7Days.map(m => m.active_energy_kcal)) ? Math.round(avg(last7Days.map(m => m.active_energy_kcal))!) : undefined,
    steps_7d_avg: avg(last7Days.map(m => m.steps_normalized)) ? Math.round(avg(last7Days.map(m => m.steps_normalized))!) : undefined,
    hrv_30d_avg: hrv30d ? Math.round(hrv30d * 10) / 10 : undefined,
    rhr_30d_avg: avg(last30Days.map(m => m.resting_hr_bpm)) ? Math.round(avg(last30Days.map(m => m.resting_hr_bpm))! * 10) / 10 : undefined,
    sleep_30d_avg_hours: avg(last30Days.map(m => m.sleep_hours)) ? Math.round(avg(last30Days.map(m => m.sleep_hours))! * 100) / 100 : undefined,
    hrv_trend_percent: hrv7d && hrv30d && hrv30d > 0 
      ? Math.round(((hrv7d - hrv30d) / hrv30d) * 1000) / 10 
      : undefined,
  };
}

/**
 * Get behavior metrics for last 14 days from life events
 */
export interface BehaviorMetricsResult {
  alcohol_events_14d: number;
  total_drinks_14d: number;
  zero_drink_streak_days: number;
  sauna_sessions_14d: number;
  ice_bath_sessions_14d: number;
  supplement_events_14d: number;
}

export async function getBehaviorMetrics14d(userId: string): Promise<BehaviorMetricsResult | null> {
  const healthId = await getHealthId(userId);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const { data: events, error } = await supabase
    .from('life_events')
    .select(`
      event_type,
      details,
      happened_at
    `)
    .eq('health_id', healthId)
    .gte('happened_at', fourteenDaysAgo.toISOString())
    .order('happened_at', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching behavior metrics:', error);
    throw error;
  }

  if (!events || events.length === 0) {
    return null;
  }

  const alcoholEvents = events.filter(e => e.event_type === 'alcohol');
  const totalDrinks = alcoholEvents.reduce((sum, e) => {
    const drinks = (e.details as any)?.drinks;
    return sum + (typeof drinks === 'number' ? drinks : 0);
  }, 0);

  // Calculate zero-drink streak
  let zeroDrinkStreak = 0;
  if (alcoholEvents.length === 0) {
    zeroDrinkStreak = 14;
  } else {
    const lastAlcoholDate = new Date(alcoholEvents[0].happened_at);
    zeroDrinkStreak = Math.floor((Date.now() - lastAlcoholDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    alcohol_events_14d: alcoholEvents.length,
    total_drinks_14d: totalDrinks,
    zero_drink_streak_days: zeroDrinkStreak,
    sauna_sessions_14d: events.filter(e => e.event_type === 'sauna').length,
    ice_bath_sessions_14d: events.filter(e => e.event_type === 'ice_bath' || e.event_type === 'ice bath').length,
    supplement_events_14d: events.filter(e => e.event_type === 'supplements').length,
  };
}

/**
 * Get training load metrics for last 7 days from healthkit workouts
 */
export interface TrainingLoadResult {
  zone2_minutes_7d: number;
  zone5_minutes_7d: number;
  strength_sessions_7d: number;
  total_workout_kcal_7d: number;
  total_workout_minutes_7d: number;
}

export async function getTrainingLoad7d(userId: string): Promise<TrainingLoadResult | null> {
  const healthId = await getHealthId(userId);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: workouts, error } = await supabase
    .from('healthkit_workouts')
    .select(`
      workout_type,
      duration,
      total_energy_burned_kcal,
      average_heart_rate_bpm
    `)
    .eq('health_id', healthId)
    .gte('start_date', sevenDaysAgo.toISOString());

  if (error) {
    logger.error('[SupabaseHealth] Error fetching training load:', error);
    throw error;
  }

  if (!workouts || workouts.length === 0) {
    return null;
  }

  // Zone 2: Lower intensity workouts (walking, yoga, moderate cycling)
  const zone2Types = ['Walking', 'Cycling', 'Yoga', 'Pilates', 'TraditionalStrengthTraining'];
  const zone2Workouts = workouts.filter(w => 
    zone2Types.includes(w.workout_type) && 
    (!w.average_heart_rate_bpm || w.average_heart_rate_bpm < 140)
  );
  const zone2Minutes = zone2Workouts.reduce((sum, w) => sum + (w.duration || 0), 0);

  // Zone 5: High intensity workouts (HIIT, running with high HR)
  const zone5Workouts = workouts.filter(w => 
    (w.workout_type === 'HIIT' || w.workout_type === 'Running' || w.workout_type === 'Rowing') &&
    w.average_heart_rate_bpm && w.average_heart_rate_bpm > 160
  );
  const zone5Minutes = zone5Workouts.reduce((sum, w) => sum + (w.duration || 0), 0);

  return {
    zone2_minutes_7d: Math.round(zone2Minutes),
    zone5_minutes_7d: Math.round(zone5Minutes),
    strength_sessions_7d: workouts.filter(w => w.workout_type === 'TraditionalStrengthTraining').length,
    total_workout_kcal_7d: Math.round(workouts.reduce((sum, w) => sum + (w.total_energy_burned_kcal || 0), 0)),
    total_workout_minutes_7d: Math.round(workouts.reduce((sum, w) => sum + (w.duration || 0), 0)),
  };
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

  // 9. Delete nutrition_daily_metrics
  const { error: nutritionError } = await supabase
    .from('nutrition_daily_metrics')
    .delete()
    .eq('health_id', healthId);
  if (nutritionError) errors.push(`nutrition_daily_metrics: ${nutritionError.message}`);

  // 10. Delete mindfulness_sessions
  const { error: mindfulnessSessionsError } = await supabase
    .from('mindfulness_sessions')
    .delete()
    .eq('health_id', healthId);
  if (mindfulnessSessionsError) errors.push(`mindfulness_sessions: ${mindfulnessSessionsError.message}`);

  // 11. Delete mindfulness_daily_metrics
  const { error: mindfulnessDailyError } = await supabase
    .from('mindfulness_daily_metrics')
    .delete()
    .eq('health_id', healthId);
  if (mindfulnessDailyError) errors.push(`mindfulness_daily_metrics: ${mindfulnessDailyError.message}`);

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

// Delete a single biomarker session and its measurements
export async function deleteBiomarkerSession(userId: string, sessionId: string): Promise<void> {
  const healthId = await getHealthId(userId);
  
  // First verify the session belongs to this user
  const { data: session, error: fetchError } = await supabase
    .from('biomarker_test_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('health_id', healthId)
    .single();
    
  if (fetchError || !session) {
    throw new Error(`Session not found or doesn't belong to user`);
  }
  
  // Delete measurements first (foreign key constraint)
  const { error: measurementsError } = await supabase
    .from('biomarker_measurements')
    .delete()
    .eq('session_id', sessionId);
    
  if (measurementsError) {
    logger.error('[SupabaseHealth] Error deleting measurements:', measurementsError);
    throw measurementsError;
  }
  
  // Delete the session
  const { error: sessionError } = await supabase
    .from('biomarker_test_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('health_id', healthId);
    
  if (sessionError) {
    logger.error('[SupabaseHealth] Error deleting session:', sessionError);
    throw sessionError;
  }
  
  logger.info(`[SupabaseHealth] Deleted biomarker session ${sessionId} and its measurements`);
}

// ==================== FOLLOW-UP REQUESTS ====================
// Stores user requests like "check back with me in a few days about my HRV"

export interface FollowUpRequest {
  id?: string;
  health_id: string;
  intent_summary: string;
  original_transcript?: string | null;
  metrics: string[];
  comparison_baseline?: string | null;
  created_at?: Date;
  evaluate_at: Date;
  evaluated_at?: Date | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dismissed';
  findings?: {
    summary: string;
    metrics?: Record<string, any>;
    recommendation?: string;
    data_points?: any[];
  } | null;
  notification_sent?: boolean;
  notification_sent_at?: Date | null;
  source: 'voice' | 'text' | 'system';
  session_id?: string | null;
}

export interface FollowUpRequestInput {
  intent_summary: string;
  original_transcript?: string;
  metrics?: string[];
  comparison_baseline?: string;
  evaluate_at: Date;
  source?: 'voice' | 'text' | 'system';
  session_id?: string;
}

export async function createFollowUpRequest(userId: string, input: FollowUpRequestInput): Promise<FollowUpRequest> {
  const healthId = await getHealthId(userId);
  
  const insertData = {
    health_id: healthId,
    intent_summary: input.intent_summary,
    original_transcript: input.original_transcript || null,
    metrics: input.metrics || [],
    comparison_baseline: input.comparison_baseline || null,
    evaluate_at: input.evaluate_at.toISOString(),
    status: 'pending',
    source: input.source || 'voice',
    session_id: input.session_id || null,
  };
  
  logger.info('[SupabaseHealth] Creating follow-up request:', { 
    userId, 
    intentSummary: input.intent_summary,
    evaluateAt: input.evaluate_at,
    metrics: input.metrics,
  });
  
  const { data, error } = await supabase
    .from('follow_up_requests')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating follow-up request:', error);
    throw error;
  }
  
  logger.info('[SupabaseHealth] Follow-up request created:', { id: data.id });
  return data;
}

export async function getFollowUpRequests(userId: string, status?: string): Promise<FollowUpRequest[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('follow_up_requests')
    .select('*')
    .eq('health_id', healthId)
    .order('created_at', { ascending: false });
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching follow-up requests:', error);
    throw error;
  }

  return data || [];
}

export async function getPendingFollowUpsToEvaluate(): Promise<Array<FollowUpRequest & { health_id: string }>> {
  const { data, error } = await supabase
    .from('follow_up_requests')
    .select('*')
    .eq('status', 'pending')
    .lte('evaluate_at', new Date().toISOString())
    .order('evaluate_at', { ascending: true })
    .limit(50);

  if (error) {
    logger.error('[SupabaseHealth] Error fetching pending follow-ups:', error);
    throw error;
  }

  return data || [];
}

export async function updateFollowUpRequest(
  requestId: string, 
  updates: Partial<Pick<FollowUpRequest, 'status' | 'findings' | 'evaluated_at' | 'notification_sent' | 'notification_sent_at'>>
): Promise<FollowUpRequest> {
  const { data, error } = await supabase
    .from('follow_up_requests')
    .update(updates)
    .eq('id', requestId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error updating follow-up request:', error);
    throw error;
  }

  return data;
}

// ==================== LIFE CONTEXT FACTS ====================
// Stores contextual information about user's life that affects health expectations

export type LifeContextCategory = 
  | 'travel'
  | 'training_pause'
  | 'illness'
  | 'stress'
  | 'sleep_disruption'
  | 'diet_change'
  | 'medication'
  | 'life_event'
  | 'other';

export interface LifeContextFact {
  id?: string;
  health_id: string;
  category: LifeContextCategory;
  description: string;
  start_date?: string | null;
  end_date?: string | null;
  expected_impact?: {
    hrv?: 'higher' | 'lower' | 'variable';
    sleep?: 'better' | 'worse' | 'disrupted';
    training?: 'increased' | 'reduced' | 'none';
    rhr?: 'higher' | 'lower';
    energy?: 'higher' | 'lower';
  } | null;
  source: 'voice' | 'text' | 'system';
  confidence: number;
  created_at?: Date;
  updated_at?: Date;
  is_active: boolean;
}

export interface LifeContextFactInput {
  category: LifeContextCategory;
  description: string;
  start_date?: Date | string;
  end_date?: Date | string;
  expected_impact?: LifeContextFact['expected_impact'];
  source?: 'voice' | 'text' | 'system';
  confidence?: number;
}

export async function createLifeContextFact(userId: string, input: LifeContextFactInput): Promise<LifeContextFact> {
  const healthId = await getHealthId(userId);
  
  const insertData = {
    health_id: healthId,
    category: input.category,
    description: input.description,
    start_date: input.start_date ? (input.start_date instanceof Date ? input.start_date.toISOString().split('T')[0] : input.start_date) : null,
    end_date: input.end_date ? (input.end_date instanceof Date ? input.end_date.toISOString().split('T')[0] : input.end_date) : null,
    expected_impact: input.expected_impact || null,
    source: input.source || 'voice',
    confidence: input.confidence ?? 1.0,
    is_active: true,
  };
  
  logger.info('[SupabaseHealth] Creating life context fact:', { 
    userId, 
    category: input.category,
    description: input.description,
  });
  
  const { data, error } = await supabase
    .from('life_context_facts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating life context fact:', error);
    throw error;
  }
  
  logger.info('[SupabaseHealth] Life context fact created:', { id: data.id });
  return data;
}

export async function getActiveLifeContext(userId: string): Promise<LifeContextFact[]> {
  const healthId = await getHealthId(userId);
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('life_context_facts')
    .select('*')
    .eq('health_id', healthId)
    .eq('is_active', true)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching active life context:', error);
    throw error;
  }

  return data || [];
}

export async function getAllLifeContextFacts(userId: string, includeInactive = false): Promise<LifeContextFact[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('life_context_facts')
    .select('*')
    .eq('health_id', healthId)
    .order('created_at', { ascending: false });
  
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  
  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching life context facts:', error);
    throw error;
  }

  return data || [];
}

export async function updateLifeContextFact(
  factId: string, 
  updates: Partial<Pick<LifeContextFact, 'end_date' | 'is_active' | 'description' | 'expected_impact'>>
): Promise<LifeContextFact> {
  const { data, error } = await supabase
    .from('life_context_facts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', factId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error updating life context fact:', error);
    throw error;
  }

  return data;
}

export async function deactivateLifeContextFact(factId: string): Promise<void> {
  await updateLifeContextFact(factId, { is_active: false });
  logger.info('[SupabaseHealth] Life context fact deactivated:', { id: factId });
}

// ==================== LOCATION HISTORY ====================

export interface LocationRecord {
  id?: string;
  health_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  source: 'gps' | 'network' | 'manual';
  recorded_at: string;
  created_at?: string;
}

export async function saveLocation(
  userId: string, 
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    source: 'gps' | 'network' | 'manual';
    timestamp?: string;
  }
): Promise<LocationRecord> {
  const healthId = await getHealthId(userId);
  
  const insertData = {
    health_id: healthId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    source: location.source,
    recorded_at: location.timestamp || new Date().toISOString(),
  };
  
  logger.info('[SupabaseHealth] Saving location:', { 
    userId, 
    lat: location.latitude.toFixed(4), 
    lon: location.longitude.toFixed(4),
  });
  
  const { data, error } = await supabase
    .from('user_location_history')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error saving location:', error);
    throw error;
  }
  
  return data;
}

export async function getLatestLocation(userId: string): Promise<LocationRecord | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('user_location_history')
    .select('*')
    .eq('health_id', healthId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching latest location:', error);
    throw error;
  }

  return data || null;
}

export async function getLocationHistory(
  userId: string, 
  options?: { startDate?: string; endDate?: string; limit?: number }
): Promise<LocationRecord[]> {
  const healthId = await getHealthId(userId);
  
  let query = supabase
    .from('user_location_history')
    .select('*')
    .eq('health_id', healthId)
    .order('recorded_at', { ascending: false });
  
  if (options?.startDate) {
    query = query.gte('recorded_at', options.startDate);
  }
  if (options?.endDate) {
    query = query.lte('recorded_at', options.endDate);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  
  const { data, error } = await query;

  if (error) {
    logger.error('[SupabaseHealth] Error fetching location history:', error);
    throw error;
  }

  return data || [];
}

// ==================== WEATHER CACHE ====================

export interface WeatherCacheRecord {
  id?: string;
  health_id: string;
  date: string;
  latitude: number;
  longitude: number;
  weather_data: Record<string, any> | null;
  air_quality_data: Record<string, any> | null;
  fetched_at: string;
  created_at?: string;
}

export async function getCachedWeather(
  userId: string, 
  date: string
): Promise<WeatherCacheRecord | null> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('weather_daily_cache')
    .select('*')
    .eq('health_id', healthId)
    .eq('date', date)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching cached weather:', error);
    throw error;
  }

  return data || null;
}

export async function saveWeatherCache(
  userId: string,
  date: string,
  location: { latitude: number; longitude: number },
  weatherData: Record<string, any> | null,
  airQualityData: Record<string, any> | null
): Promise<WeatherCacheRecord> {
  const healthId = await getHealthId(userId);
  
  const insertData = {
    health_id: healthId,
    date,
    latitude: location.latitude,
    longitude: location.longitude,
    weather_data: weatherData,
    air_quality_data: airQualityData,
    fetched_at: new Date().toISOString(),
  };
  
  logger.info('[SupabaseHealth] Saving weather cache:', { userId, date });
  
  const { data, error } = await supabase
    .from('weather_daily_cache')
    .upsert(insertData, { onConflict: 'health_id,date' })
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error saving weather cache:', error);
    throw error;
  }
  
  return data;
}

export async function getWeatherHistory(
  userId: string,
  startDate: string,
  endDate: string
): Promise<WeatherCacheRecord[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('weather_daily_cache')
    .select('*')
    .eq('health_id', healthId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching weather history:', error);
    throw error;
  }

  return data || [];
}

logger.info('[SupabaseHealth] Health storage service initialized');
