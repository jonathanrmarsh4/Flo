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
  source?: 'manual' | 'healthkit' | 'oura' | 'dexcom';
  oura_session_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function upsertSleepNight(userId: string, sleep: Omit<SleepNight, 'health_id'>): Promise<SleepNight> {
  const healthId = await getHealthId(userId);
  
  // MERGE STRATEGY: Fetch existing record first to preserve non-null values
  // This prevents data loss when syncs have partial data (e.g., sync without HRV shouldn't erase existing HRV)
  const { data: existing } = await supabase
    .from('sleep_nights')
    .select('*')
    .eq('health_id', healthId)
    .eq('sleep_date', sleep.sleep_date)
    .maybeSingle();
  
  // SOURCE PRIORITY: Oura > HealthKit > manual
  // If existing data is from Oura and new data is from HealthKit, skip overwriting non-null fields
  const existingSource = existing?.source;
  const newSource = sleep.source;
  const isOuraProtected = existingSource === 'oura' && newSource === 'healthkit';
  
  // Merge: only update fields that have non-null/non-undefined values in the new data
  // Preserve existing values for fields that are null/undefined in the new data
  // If Oura-protected, only fill in gaps (null fields) - don't overwrite
  const mergedSleep: Record<string, any> = { ...existing };
  
  // Fields that should always come from the original source (sleep timing, stages, metrics)
  const coreFields = [
    'total_sleep_min', 'time_in_bed_min', 'sleep_latency_min', 'sleep_efficiency_pct',
    'deep_sleep_min', 'rem_sleep_min', 'core_sleep_min', 'waso_min', 'num_awakenings',
    'deep_pct', 'rem_pct', 'core_pct', 'fragmentation_index',
    'hrv_ms', 'resting_hr_bpm', 'respiratory_rate', 'wrist_temperature', 'oxygen_saturation',
    'bedtime_local', 'waketime_local', 'mid_sleep_time_local'
  ];
  
  for (const [key, value] of Object.entries(sleep)) {
    if (value !== null && value !== undefined) {
      // If Oura-protected and this is a core field with existing data, skip
      if (isOuraProtected && coreFields.includes(key) && existing?.[key] !== null && existing?.[key] !== undefined) {
        logger.debug(`[SupabaseHealth] Preserving Oura ${key}: ${existing[key]} (skipping HealthKit: ${value})`);
        continue;
      }
      mergedSleep[key] = value;
    }
  }
  
  // If Oura-protected, keep the source as 'oura'
  if (isOuraProtected) {
    mergedSleep.source = 'oura';
  }
  
  // Always set these fields
  mergedSleep.health_id = healthId;
  mergedSleep.updated_at = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('sleep_nights')
    .upsert(mergedSleep, {
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

export async function getLatestLocationByHealthId(healthId: string): Promise<LocationRecord | null> {
  const { data, error } = await supabase
    .from('user_location_history')
    .select('*')
    .eq('health_id', healthId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SupabaseHealth] Error fetching latest location by healthId:', error);
    return null;
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

// ==================== BIOMARKER FOLLOWUPS ====================
// Track scheduled appointments/actions for specific biomarker concerns
// Helps Flō avoid repeating concerns when user has already scheduled follow-up

export type BiomarkerFollowupStatus = 'scheduled' | 'completed' | 'cancelled';

export interface BiomarkerFollowup {
  id?: string;
  health_id: string;
  biomarker_name: string;  // e.g., 'PSA', 'Cholesterol', 'Vitamin D'
  biomarker_code?: string;  // LOINC code if available
  concern_description: string;  // e.g., 'elevated PSA levels'
  action_type: string;  // e.g., 'specialist_appointment', 'retest', 'lifestyle_change'
  action_description: string;  // e.g., 'Specialist appointment scheduled'
  scheduled_date?: string;  // Date of the follow-up appointment
  status: BiomarkerFollowupStatus;
  notes?: string;
  source: 'voice' | 'text' | 'system';
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
}

export interface BiomarkerFollowupInput {
  biomarker_name: string;
  biomarker_code?: string;
  concern_description?: string;
  action_type: string;
  action_description: string;
  scheduled_date?: Date | string;
  notes?: string;
  source?: 'voice' | 'text' | 'system';
}

/**
 * Create a biomarker follow-up record
 * Used when user mentions scheduling an appointment for a specific concern
 */
export async function createBiomarkerFollowup(
  userId: string, 
  input: BiomarkerFollowupInput
): Promise<BiomarkerFollowup> {
  const healthId = await getHealthId(userId);
  
  const insertData = {
    health_id: healthId,
    biomarker_name: input.biomarker_name.toUpperCase(),
    biomarker_code: input.biomarker_code || null,
    concern_description: input.concern_description || `Elevated ${input.biomarker_name}`,
    action_type: input.action_type,
    action_description: input.action_description,
    scheduled_date: input.scheduled_date 
      ? (input.scheduled_date instanceof Date 
          ? input.scheduled_date.toISOString().split('T')[0] 
          : input.scheduled_date)
      : null,
    status: 'scheduled' as BiomarkerFollowupStatus,
    notes: input.notes || null,
    source: input.source || 'voice',
  };
  
  logger.info('[SupabaseHealth] Creating biomarker followup:', { 
    userId, 
    biomarker: input.biomarker_name,
    action: input.action_type,
    scheduledDate: insertData.scheduled_date,
  });
  
  const { data, error } = await supabase
    .from('biomarker_followups')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error creating biomarker followup:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get all pending (scheduled) biomarker follow-ups for a user
 * Used by Flō Oracle to know what concerns to suppress
 */
export async function getPendingBiomarkerFollowups(userId: string): Promise<BiomarkerFollowup[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('biomarker_followups')
    .select('*')
    .eq('health_id', healthId)
    .eq('status', 'scheduled')
    .order('scheduled_date', { ascending: true });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching pending biomarker followups:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Get all biomarker follow-ups for a specific biomarker
 */
export async function getBiomarkerFollowupsByName(
  userId: string, 
  biomarkerName: string
): Promise<BiomarkerFollowup[]> {
  const healthId = await getHealthId(userId);
  
  const { data, error } = await supabase
    .from('biomarker_followups')
    .select('*')
    .eq('health_id', healthId)
    .ilike('biomarker_name', biomarkerName)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[SupabaseHealth] Error fetching biomarker followups by name:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Mark a biomarker follow-up as completed
 */
export async function completeBiomarkerFollowup(
  followupId: string,
  notes?: string
): Promise<BiomarkerFollowup> {
  const { data, error } = await supabase
    .from('biomarker_followups')
    .update({
      status: 'completed' as BiomarkerFollowupStatus,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      notes: notes || undefined,
    })
    .eq('id', followupId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error completing biomarker followup:', error);
    throw error;
  }
  
  logger.info('[SupabaseHealth] Biomarker followup completed:', { id: followupId });
  return data;
}

/**
 * Cancel a biomarker follow-up
 */
export async function cancelBiomarkerFollowup(
  followupId: string,
  reason?: string
): Promise<BiomarkerFollowup> {
  const { data, error } = await supabase
    .from('biomarker_followups')
    .update({
      status: 'cancelled' as BiomarkerFollowupStatus,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      notes: reason || undefined,
    })
    .eq('id', followupId)
    .select()
    .single();

  if (error) {
    logger.error('[SupabaseHealth] Error cancelling biomarker followup:', error);
    throw error;
  }
  
  logger.info('[SupabaseHealth] Biomarker followup cancelled:', { id: followupId });
  return data;
}

// ==================== USER DATA METRICS ====================

export interface UserDataMetric {
  category: string;
  name: string;
  displayName: string;
  value: number | string;
  unit: string;
  source: string;
  lastUpdated: string;
}

/**
 * Get latest metric values with sources for User Data display
 * Aggregates data from healthkit_samples, sleep_nights, user_daily_metrics, cgm_readings, and oura tables
 * Now returns ALL expected metrics - shows "No data" for missing values so user can see what's not being tracked
 */
export async function getLatestMetricsWithSources(userId: string): Promise<UserDataMetric[]> {
  const healthId = await getHealthId(userId);
  const metrics: UserDataMetric[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Helper to add metric - always adds, shows "No data" if null
  const addMetric = (category: string, name: string, displayName: string, value: any, unit: string, source: string, lastUpdated: string | null) => {
    metrics.push({
      category,
      name,
      displayName,
      value: value != null ? value : 'No data',
      unit: value != null ? unit : '',
      source: value != null ? source : '—',
      lastUpdated: lastUpdated || '',
    });
  };

  try {
    // 1. Sleep data (from sleep_nights - includes ALL sleep metrics from Oura/HealthKit/manual)
    const { data: sleepData } = await supabase
      .from('sleep_nights')
      .select('*')
      .eq('health_id', healthId)
      .order('sleep_date', { ascending: false })
      .limit(1);

    const sleep = sleepData?.[0];
    const sleepSource = sleep?.source === 'oura' ? 'Oura Ring' : sleep?.source === 'healthkit' ? 'Apple Watch' : 'Manual';
    const sleepUpdated = sleep?.updated_at || sleep?.sleep_date || null;
    
    // ALL expected sleep metrics - always shown
    const totalSleepFormatted = sleep?.total_sleep_min != null 
      ? `${Math.floor(sleep.total_sleep_min / 60)}h ${Math.round(sleep.total_sleep_min % 60)}m` 
      : null;
    addMetric('Sleep', 'total_sleep', 'Total Sleep', totalSleepFormatted, '', sleepSource, sleepUpdated);
    
    const timeInBedFormatted = sleep?.time_in_bed_min != null 
      ? `${Math.floor(sleep.time_in_bed_min / 60)}h ${Math.round(sleep.time_in_bed_min % 60)}m` 
      : null;
    addMetric('Sleep', 'time_in_bed', 'Time in Bed', timeInBedFormatted, '', sleepSource, sleepUpdated);
    
    addMetric('Sleep', 'deep_sleep', 'Deep Sleep', sleep?.deep_sleep_min != null ? Math.round(sleep.deep_sleep_min) : null, 'min', sleepSource, sleepUpdated);
    addMetric('Sleep', 'rem_sleep', 'REM Sleep', sleep?.rem_sleep_min != null ? Math.round(sleep.rem_sleep_min) : null, 'min', sleepSource, sleepUpdated);
    addMetric('Sleep', 'core_sleep', 'Core/Light Sleep', sleep?.core_sleep_min != null ? Math.round(sleep.core_sleep_min) : null, 'min', sleepSource, sleepUpdated);
    addMetric('Sleep', 'sleep_efficiency', 'Sleep Efficiency', sleep?.sleep_efficiency_pct != null ? Math.round(sleep.sleep_efficiency_pct) : null, '%', sleepSource, sleepUpdated);
    addMetric('Sleep', 'sleep_latency', 'Sleep Latency', sleep?.sleep_latency_min != null ? Math.round(sleep.sleep_latency_min) : null, 'min', sleepSource, sleepUpdated);
    addMetric('Sleep', 'waso', 'Wake Time (WASO)', sleep?.waso_min != null ? Math.round(sleep.waso_min) : null, 'min', sleepSource, sleepUpdated);
    addMetric('Sleep', 'num_awakenings', 'Awakenings', sleep?.num_awakenings, '', sleepSource, sleepUpdated);
    addMetric('Sleep', 'fragmentation', 'Fragmentation Index', sleep?.fragmentation_index != null ? Math.round(sleep.fragmentation_index * 10) / 10 : null, '', sleepSource, sleepUpdated);
    addMetric('Sleep', 'deep_pct', 'Deep Sleep %', sleep?.deep_pct != null ? Math.round(sleep.deep_pct) : null, '%', sleepSource, sleepUpdated);
    addMetric('Sleep', 'rem_pct', 'REM Sleep %', sleep?.rem_pct != null ? Math.round(sleep.rem_pct) : null, '%', sleepSource, sleepUpdated);
    addMetric('Sleep', 'bedtime', 'Bedtime', sleep?.bedtime_local, '', sleepSource, sleepUpdated);
    addMetric('Sleep', 'waketime', 'Wake Time', sleep?.waketime_local, '', sleepSource, sleepUpdated);
    addMetric('Recovery', 'hrv', 'HRV (Sleep)', sleep?.hrv_ms != null ? Math.round(sleep.hrv_ms) : null, 'ms', sleepSource, sleepUpdated);
    addMetric('Heart', 'resting_hr', 'Resting Heart Rate', sleep?.resting_hr_bpm != null ? Math.round(sleep.resting_hr_bpm) : null, 'bpm', sleepSource, sleepUpdated);
    addMetric('Respiratory', 'respiratory_rate_sleep', 'Respiratory Rate (Sleep)', sleep?.respiratory_rate != null ? Math.round(sleep.respiratory_rate * 10) / 10 : null, 'bpm', sleepSource, sleepUpdated);
    addMetric('Vitals', 'wrist_temp', 'Wrist Temperature', sleep?.wrist_temperature != null ? Math.round(sleep.wrist_temperature * 100) / 100 : null, '°C', sleepSource, sleepUpdated);
    addMetric('Respiratory', 'oxygen_saturation_sleep', 'Blood Oxygen (Sleep)', sleep?.oxygen_saturation != null ? Math.round(sleep.oxygen_saturation * 10) / 10 : null, '%', sleepSource, sleepUpdated);

    // 2. Daily Metrics (from user_daily_metrics - includes activity, body composition, etc.)
    const { data: dailyData } = await supabase
      .from('user_daily_metrics')
      .select('*')
      .eq('health_id', healthId)
      .order('local_date', { ascending: false })
      .limit(1);

    const daily = dailyData?.[0];
    const dailyUpdated = daily?.updated_at || daily?.local_date || null;
    
    // ALL expected activity metrics - always shown
    addMetric('Activity', 'steps_daily', 'Steps', daily?.steps_normalized != null ? Math.round(daily.steps_normalized).toLocaleString() : null, '', 'Apple Watch', dailyUpdated);
    addMetric('Activity', 'active_energy_daily', 'Active Energy', daily?.active_energy_kcal != null ? Math.round(daily.active_energy_kcal) : null, 'kcal', 'Apple Watch', dailyUpdated);
    addMetric('Activity', 'basal_energy', 'Basal Energy', daily?.basal_energy_kcal != null ? Math.round(daily.basal_energy_kcal) : null, 'kcal', 'Apple Watch', dailyUpdated);
    addMetric('Activity', 'exercise_min', 'Exercise Minutes', daily?.exercise_minutes != null ? Math.round(daily.exercise_minutes) : null, 'min', 'Apple Watch', dailyUpdated);
    addMetric('Activity', 'stand_hours', 'Stand Hours', daily?.stand_hours, 'hrs', 'Apple Watch', dailyUpdated);
    addMetric('Activity', 'flights_climbed', 'Flights Climbed', daily?.flights_climbed, '', 'Apple Watch', dailyUpdated);
    addMetric('Activity', 'distance_daily', 'Distance', daily?.distance_meters != null ? Math.round(daily.distance_meters / 100) / 10 : null, 'km', 'Apple Watch', dailyUpdated);
    addMetric('Activity', 'move_time', 'Apple Move Time', daily?.move_time_min != null ? Math.round(daily.move_time_min) : null, 'min', 'Apple Watch', dailyUpdated);
    
    // Body metrics - always shown
    addMetric('Body', 'weight', 'Weight', daily?.weight_kg != null ? Math.round(daily.weight_kg * 10) / 10 : null, 'kg', 'Apple Watch', dailyUpdated);
    addMetric('Body', 'height', 'Height', daily?.height_cm != null ? Math.round(daily.height_cm) : null, 'cm', 'Apple Watch', dailyUpdated);
    addMetric('Body', 'bmi', 'BMI', daily?.bmi != null ? Math.round(daily.bmi * 10) / 10 : null, '', 'Apple Watch', dailyUpdated);
    addMetric('Body', 'body_fat', 'Body Fat', daily?.body_fat_pct != null ? Math.round(daily.body_fat_pct * 10) / 10 : null, '%', 'Apple Watch', dailyUpdated);
    addMetric('Body', 'lean_mass', 'Lean Body Mass', daily?.lean_body_mass_kg != null ? Math.round(daily.lean_body_mass_kg * 10) / 10 : null, 'kg', 'Apple Watch', dailyUpdated);
    addMetric('Body', 'waist_circ', 'Waist Circumference', daily?.waist_circumference_cm != null ? Math.round(daily.waist_circumference_cm * 10) / 10 : null, 'cm', 'Apple Watch', dailyUpdated);
    
    // Fitness metrics
    addMetric('Fitness', 'vo2_max_daily', 'VO2 Max', daily?.vo2_max != null ? Math.round(daily.vo2_max * 10) / 10 : null, 'mL/kg/min', 'Apple Watch', dailyUpdated);
    
    // Heart metrics
    addMetric('Heart', 'walking_hr', 'Walking Heart Rate', daily?.walking_hr_avg_bpm != null ? Math.round(daily.walking_hr_avg_bpm) : null, 'bpm', 'Apple Watch', dailyUpdated);
    addMetric('Heart', 'hr_recovery', 'Heart Rate Recovery (1 min)', daily?.hr_recovery_1min != null ? Math.round(daily.hr_recovery_1min) : null, 'bpm', 'Apple Watch', dailyUpdated);
    addMetric('Heart', 'afib_burden', 'AFib Burden', daily?.afib_burden_pct != null ? Math.round(daily.afib_burden_pct * 10) / 10 : null, '%', 'Apple Watch', dailyUpdated);
    
    // Respiratory metrics
    addMetric('Respiratory', 'respiratory_rate_daily', 'Respiratory Rate', daily?.respiratory_rate_bpm != null ? Math.round(daily.respiratory_rate_bpm * 10) / 10 : null, 'bpm', 'Apple Watch', dailyUpdated);
    addMetric('Respiratory', 'oxygen_sat_daily', 'Blood Oxygen', daily?.oxygen_saturation_pct != null ? Math.round(daily.oxygen_saturation_pct) : null, '%', 'Apple Watch', dailyUpdated);
    
    // Vitals
    addMetric('Vitals', 'body_temp', 'Body Temperature', daily?.body_temp_celsius != null ? Math.round(daily.body_temp_celsius * 10) / 10 : null, '°C', 'Apple Watch', dailyUpdated);
    const bpValue = daily?.systolic_bp != null && daily?.diastolic_bp != null 
      ? `${Math.round(daily.systolic_bp)}/${Math.round(daily.diastolic_bp)}` 
      : null;
    addMetric('Vitals', 'blood_pressure', 'Blood Pressure', bpValue, 'mmHg', 'Apple Watch', dailyUpdated);
    
    // Audio/Environmental
    addMetric('Environmental', 'env_audio', 'Environmental Audio Exposure', daily?.env_audio_exposure_db != null ? Math.round(daily.env_audio_exposure_db) : null, 'dB', 'Apple Watch', dailyUpdated);
    addMetric('Environmental', 'headphone_audio', 'Headphone Audio Exposure', daily?.headphone_audio_exposure_db != null ? Math.round(daily.headphone_audio_exposure_db) : null, 'dB', 'Apple Watch', dailyUpdated);
    
    // Nutrition - basic
    addMetric('Nutrition', 'water_intake', 'Water Intake', daily?.dietary_water_ml != null ? Math.round(daily.dietary_water_ml / 100) / 10 : null, 'L', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'calories', 'Calories Consumed', daily?.dietary_energy_kcal != null ? Math.round(daily.dietary_energy_kcal) : null, 'kcal', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'protein', 'Protein', daily?.dietary_protein_g != null ? Math.round(daily.dietary_protein_g) : null, 'g', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'carbs', 'Carbohydrates', daily?.dietary_carbs_g != null ? Math.round(daily.dietary_carbs_g) : null, 'g', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'fat_total', 'Total Fat', daily?.dietary_fat_g != null ? Math.round(daily.dietary_fat_g) : null, 'g', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'fiber', 'Fiber', daily?.dietary_fiber_g != null ? Math.round(daily.dietary_fiber_g) : null, 'g', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'sugar', 'Sugar', daily?.dietary_sugar_g != null ? Math.round(daily.dietary_sugar_g) : null, 'g', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'sodium', 'Sodium', daily?.dietary_sodium_mg != null ? Math.round(daily.dietary_sodium_mg) : null, 'mg', 'Apple Watch', dailyUpdated);
    addMetric('Nutrition', 'caffeine', 'Caffeine', daily?.dietary_caffeine_mg != null ? Math.round(daily.dietary_caffeine_mg) : null, 'mg', 'Apple Watch', dailyUpdated);
    
    // Mindfulness
    addMetric('Mindfulness', 'mindful_min', 'Mindful Minutes', daily?.mindful_minutes != null ? Math.round(daily.mindful_minutes) : null, 'min', 'Apple Watch', dailyUpdated);

    // 3. HealthKit samples (for additional/granular metrics not in daily aggregates)
    const { data: hkSamples } = await supabase
      .from('healthkit_samples')
      .select('data_type, value, unit, source_name, device_name, start_date, created_at')
      .eq('health_id', healthId)
      .gte('start_date', thirtyDaysAgo.toISOString())
      .order('start_date', { ascending: false });

    if (hkSamples && hkSamples.length > 0) {
      const latestByType = new Map<string, typeof hkSamples[0]>();
      for (const sample of hkSamples) {
        if (!latestByType.has(sample.data_type)) {
          latestByType.set(sample.data_type, sample);
        }
      }

      const hkMetricMap: Record<string, { category: string; displayName: string; unit: string; skipIfExists?: string }> = {
        'stepCount': { category: 'Activity', displayName: 'Steps (Sample)', unit: 'steps', skipIfExists: 'steps_daily' },
        'HKQuantityTypeIdentifierStepCount': { category: 'Activity', displayName: 'Steps (Sample)', unit: 'steps', skipIfExists: 'steps_daily' },
        'activeEnergyBurned': { category: 'Activity', displayName: 'Active Energy (Sample)', unit: 'kcal', skipIfExists: 'active_energy_daily' },
        'HKQuantityTypeIdentifierActiveEnergyBurned': { category: 'Activity', displayName: 'Active Energy (Sample)', unit: 'kcal', skipIfExists: 'active_energy_daily' },
        'basalEnergyBurned': { category: 'Activity', displayName: 'Basal Energy (Sample)', unit: 'kcal', skipIfExists: 'basal_energy' },
        'HKQuantityTypeIdentifierBasalEnergyBurned': { category: 'Activity', displayName: 'Basal Energy (Sample)', unit: 'kcal', skipIfExists: 'basal_energy' },
        'distanceWalkingRunning': { category: 'Activity', displayName: 'Distance (Sample)', unit: 'km', skipIfExists: 'distance_daily' },
        'HKQuantityTypeIdentifierDistanceWalkingRunning': { category: 'Activity', displayName: 'Distance (Sample)', unit: 'km', skipIfExists: 'distance_daily' },
        'flightsClimbed': { category: 'Activity', displayName: 'Flights (Sample)', unit: '', skipIfExists: 'flights_climbed' },
        'HKQuantityTypeIdentifierFlightsClimbed': { category: 'Activity', displayName: 'Flights (Sample)', unit: '', skipIfExists: 'flights_climbed' },
        'heartRate': { category: 'Heart', displayName: 'Heart Rate (Latest)', unit: 'bpm' },
        'HKQuantityTypeIdentifierHeartRate': { category: 'Heart', displayName: 'Heart Rate (Latest)', unit: 'bpm' },
        'heartRateVariabilitySDNN': { category: 'Recovery', displayName: 'HRV (Latest)', unit: 'ms', skipIfExists: 'hrv' },
        'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': { category: 'Recovery', displayName: 'HRV (Latest)', unit: 'ms', skipIfExists: 'hrv' },
        'restingHeartRate': { category: 'Heart', displayName: 'Resting HR (Latest)', unit: 'bpm', skipIfExists: 'resting_hr' },
        'HKQuantityTypeIdentifierRestingHeartRate': { category: 'Heart', displayName: 'Resting HR (Latest)', unit: 'bpm', skipIfExists: 'resting_hr' },
        'walkingHeartRateAverage': { category: 'Heart', displayName: 'Walking HR (Latest)', unit: 'bpm', skipIfExists: 'walking_hr' },
        'HKQuantityTypeIdentifierWalkingHeartRateAverage': { category: 'Heart', displayName: 'Walking HR (Latest)', unit: 'bpm', skipIfExists: 'walking_hr' },
        'vo2Max': { category: 'Fitness', displayName: 'VO2 Max (Latest)', unit: 'mL/kg/min', skipIfExists: 'vo2_max_daily' },
        'HKQuantityTypeIdentifierVO2Max': { category: 'Fitness', displayName: 'VO2 Max (Latest)', unit: 'mL/kg/min', skipIfExists: 'vo2_max_daily' },
        'bodyMass': { category: 'Body', displayName: 'Weight (Latest)', unit: 'kg', skipIfExists: 'weight' },
        'HKQuantityTypeIdentifierBodyMass': { category: 'Body', displayName: 'Weight (Latest)', unit: 'kg', skipIfExists: 'weight' },
        'bodyFatPercentage': { category: 'Body', displayName: 'Body Fat (Latest)', unit: '%', skipIfExists: 'body_fat' },
        'HKQuantityTypeIdentifierBodyFatPercentage': { category: 'Body', displayName: 'Body Fat (Latest)', unit: '%', skipIfExists: 'body_fat' },
        'leanBodyMass': { category: 'Body', displayName: 'Lean Mass (Latest)', unit: 'kg', skipIfExists: 'lean_mass' },
        'HKQuantityTypeIdentifierLeanBodyMass': { category: 'Body', displayName: 'Lean Mass (Latest)', unit: 'kg', skipIfExists: 'lean_mass' },
        'height': { category: 'Body', displayName: 'Height', unit: 'cm' },
        'HKQuantityTypeIdentifierHeight': { category: 'Body', displayName: 'Height', unit: 'cm' },
        'oxygenSaturation': { category: 'Respiratory', displayName: 'Blood Oxygen (Latest)', unit: '%', skipIfExists: 'oxygen_sat_daily' },
        'HKQuantityTypeIdentifierOxygenSaturation': { category: 'Respiratory', displayName: 'Blood Oxygen (Latest)', unit: '%', skipIfExists: 'oxygen_sat_daily' },
        'respiratoryRate': { category: 'Respiratory', displayName: 'Respiratory Rate (Latest)', unit: 'bpm', skipIfExists: 'respiratory_rate_daily' },
        'HKQuantityTypeIdentifierRespiratoryRate': { category: 'Respiratory', displayName: 'Respiratory Rate (Latest)', unit: 'bpm', skipIfExists: 'respiratory_rate_daily' },
        'bodyTemperature': { category: 'Vitals', displayName: 'Body Temp (Latest)', unit: '°C', skipIfExists: 'body_temp' },
        'HKQuantityTypeIdentifierBodyTemperature': { category: 'Vitals', displayName: 'Body Temp (Latest)', unit: '°C', skipIfExists: 'body_temp' },
        'walkingSpeed': { category: 'Mobility', displayName: 'Walking Speed', unit: 'm/s' },
        'HKQuantityTypeIdentifierWalkingSpeed': { category: 'Mobility', displayName: 'Walking Speed', unit: 'm/s' },
        'walkingStepLength': { category: 'Mobility', displayName: 'Step Length', unit: 'cm' },
        'HKQuantityTypeIdentifierWalkingStepLength': { category: 'Mobility', displayName: 'Step Length', unit: 'cm' },
        'walkingDoubleSupportPercentage': { category: 'Mobility', displayName: 'Double Support', unit: '%' },
        'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage': { category: 'Mobility', displayName: 'Double Support', unit: '%' },
        'walkingAsymmetryPercentage': { category: 'Mobility', displayName: 'Walking Asymmetry', unit: '%' },
        'HKQuantityTypeIdentifierWalkingAsymmetryPercentage': { category: 'Mobility', displayName: 'Walking Asymmetry', unit: '%' },
        'sixMinuteWalkTestDistance': { category: 'Mobility', displayName: '6-Min Walk Distance', unit: 'm' },
        'HKQuantityTypeIdentifierSixMinuteWalkTestDistance': { category: 'Mobility', displayName: '6-Min Walk Distance', unit: 'm' },
        'stairAscentSpeed': { category: 'Mobility', displayName: 'Stair Ascent Speed', unit: 'm/s' },
        'HKQuantityTypeIdentifierStairAscentSpeed': { category: 'Mobility', displayName: 'Stair Ascent Speed', unit: 'm/s' },
        'stairDescentSpeed': { category: 'Mobility', displayName: 'Stair Descent Speed', unit: 'm/s' },
        'HKQuantityTypeIdentifierStairDescentSpeed': { category: 'Mobility', displayName: 'Stair Descent Speed', unit: 'm/s' },
        'mindfulSession': { category: 'Mindfulness', displayName: 'Mindful Minutes', unit: 'min' },
        'HKCategoryTypeIdentifierMindfulSession': { category: 'Mindfulness', displayName: 'Mindful Minutes', unit: 'min' },
        'dietaryWater': { category: 'Nutrition', displayName: 'Water (Sample)', unit: 'L', skipIfExists: 'water_intake' },
        'HKQuantityTypeIdentifierDietaryWater': { category: 'Nutrition', displayName: 'Water (Sample)', unit: 'L', skipIfExists: 'water_intake' },
        'dietaryEnergyConsumed': { category: 'Nutrition', displayName: 'Calories Consumed', unit: 'kcal' },
        'HKQuantityTypeIdentifierDietaryEnergyConsumed': { category: 'Nutrition', displayName: 'Calories Consumed', unit: 'kcal' },
        'dietaryProtein': { category: 'Nutrition', displayName: 'Protein', unit: 'g' },
        'HKQuantityTypeIdentifierDietaryProtein': { category: 'Nutrition', displayName: 'Protein', unit: 'g' },
        'dietaryCarbohydrates': { category: 'Nutrition', displayName: 'Carbohydrates', unit: 'g' },
        'HKQuantityTypeIdentifierDietaryCarbohydrates': { category: 'Nutrition', displayName: 'Carbohydrates', unit: 'g' },
        'dietaryFatTotal': { category: 'Nutrition', displayName: 'Total Fat', unit: 'g' },
        'HKQuantityTypeIdentifierDietaryFatTotal': { category: 'Nutrition', displayName: 'Total Fat', unit: 'g' },
        'dietaryFiber': { category: 'Nutrition', displayName: 'Fiber', unit: 'g' },
        'HKQuantityTypeIdentifierDietaryFiber': { category: 'Nutrition', displayName: 'Fiber', unit: 'g' },
        'dietarySugar': { category: 'Nutrition', displayName: 'Sugar', unit: 'g' },
        'HKQuantityTypeIdentifierDietarySugar': { category: 'Nutrition', displayName: 'Sugar', unit: 'g' },
        'dietarySodium': { category: 'Nutrition', displayName: 'Sodium', unit: 'mg' },
        'HKQuantityTypeIdentifierDietarySodium': { category: 'Nutrition', displayName: 'Sodium', unit: 'mg' },
        'dietaryCaffeine': { category: 'Nutrition', displayName: 'Caffeine', unit: 'mg' },
        'HKQuantityTypeIdentifierDietaryCaffeine': { category: 'Nutrition', displayName: 'Caffeine', unit: 'mg' },
        'bloodPressureSystolic': { category: 'Vitals', displayName: 'Systolic BP', unit: 'mmHg' },
        'HKQuantityTypeIdentifierBloodPressureSystolic': { category: 'Vitals', displayName: 'Systolic BP', unit: 'mmHg' },
        'bloodPressureDiastolic': { category: 'Vitals', displayName: 'Diastolic BP', unit: 'mmHg' },
        'HKQuantityTypeIdentifierBloodPressureDiastolic': { category: 'Vitals', displayName: 'Diastolic BP', unit: 'mmHg' },
        'bloodGlucose': { category: 'Glucose', displayName: 'Blood Glucose', unit: 'mg/dL' },
        'HKQuantityTypeIdentifierBloodGlucose': { category: 'Glucose', displayName: 'Blood Glucose', unit: 'mg/dL' },
      };

      const existingNames = new Set(metrics.map(m => m.name));
      
      for (const [dataType, sample] of latestByType) {
        const mapping = hkMetricMap[dataType];
        if (mapping) {
          if (mapping.skipIfExists && existingNames.has(mapping.skipIfExists)) continue;

          let sourceDisplay = 'Apple Watch';
          if (sample.source_name?.toLowerCase().includes('oura')) {
            sourceDisplay = 'Oura Ring';
          } else if (sample.device_name) {
            sourceDisplay = sample.device_name;
          }

          let value = sample.value;
          if (dataType.toLowerCase().includes('distance') && value > 100) {
            value = Math.round(value / 100) / 10;
          }
          if (dataType.toLowerCase().includes('oxygen') && value <= 1) {
            value = Math.round(value * 100);
          }
          if (dataType.toLowerCase().includes('water') && value > 100) {
            value = Math.round(value / 100) / 10;
          }
          if (dataType.toLowerCase().includes('steplength') && value < 1) {
            value = Math.round(value * 100);
          }

          metrics.push({
            category: mapping.category,
            name: dataType,
            displayName: mapping.displayName,
            value: typeof value === 'number' ? Math.round(value * 10) / 10 : value,
            unit: mapping.unit,
            source: sourceDisplay,
            lastUpdated: sample.created_at || sample.start_date,
          });
        }
      }
    }

    // 4. CGM readings (Dexcom)
    const { data: cgmData } = await supabase
      .from('cgm_readings')
      .select('glucose_value, glucose_unit, recorded_at, source')
      .eq('health_id', healthId)
      .order('recorded_at', { ascending: false })
      .limit(1);

    if (cgmData?.[0]) {
      const cgm = cgmData[0];
      const existingGlucose = metrics.find(m => m.name === 'blood_glucose' || m.category === 'Glucose');
      if (!existingGlucose) {
        metrics.push({
          category: 'Glucose',
          name: 'blood_glucose',
          displayName: 'Blood Glucose (CGM)',
          value: cgm.glucose_value,
          unit: cgm.glucose_unit || 'mg/dL',
          source: 'Dexcom',
          lastUpdated: cgm.recorded_at,
        });
      }
    }

    // 5. Oura stress/resilience
    const { data: stressData } = await supabase
      .from('oura_daily_stress')
      .select('day, stress_high, recovery_high, day_summary, updated_at')
      .eq('health_id', healthId)
      .order('day', { ascending: false })
      .limit(1);

    if (stressData?.[0]) {
      const stress = stressData[0];
      if (stress.stress_high != null) {
        metrics.push({
          category: 'Stress',
          name: 'stress_high',
          displayName: 'Stress (High)',
          value: stress.stress_high,
          unit: 'min',
          source: 'Oura Ring',
          lastUpdated: stress.updated_at || stress.day,
        });
      }
      if (stress.recovery_high != null) {
        metrics.push({
          category: 'Stress',
          name: 'recovery_high',
          displayName: 'Recovery (High)',
          value: stress.recovery_high,
          unit: 'min',
          source: 'Oura Ring',
          lastUpdated: stress.updated_at || stress.day,
        });
      }
      if (stress.day_summary) {
        metrics.push({
          category: 'Stress',
          name: 'stress_summary',
          displayName: 'Stress Summary',
          value: stress.day_summary,
          unit: '',
          source: 'Oura Ring',
          lastUpdated: stress.updated_at || stress.day,
        });
      }
    }

    // 6. Oura resilience
    const { data: resilienceData } = await supabase
      .from('oura_daily_resilience')
      .select('day, level, updated_at')
      .eq('health_id', healthId)
      .order('day', { ascending: false })
      .limit(1);

    if (resilienceData?.[0]) {
      metrics.push({
        category: 'Recovery',
        name: 'resilience',
        displayName: 'Resilience',
        value: resilienceData[0].level || 'N/A',
        unit: '',
        source: 'Oura Ring',
        lastUpdated: resilienceData[0].updated_at || resilienceData[0].day,
      });
    }

    // 7. Oura readiness
    const { data: readinessData } = await supabase
      .from('oura_daily_readiness')
      .select('day, score, temperature_deviation, updated_at')
      .eq('health_id', healthId)
      .order('day', { ascending: false })
      .limit(1);

    if (readinessData?.[0]) {
      const readiness = readinessData[0];
      if (readiness.score != null) {
        metrics.push({
          category: 'Recovery',
          name: 'readiness_score',
          displayName: 'Readiness Score',
          value: readiness.score,
          unit: '',
          source: 'Oura Ring',
          lastUpdated: readiness.updated_at || readiness.day,
        });
      }
      if (readiness.temperature_deviation != null) {
        metrics.push({
          category: 'Vitals',
          name: 'temp_deviation',
          displayName: 'Temperature Deviation',
          value: Math.round(readiness.temperature_deviation * 100) / 100,
          unit: '°C',
          source: 'Oura Ring',
          lastUpdated: readiness.updated_at || readiness.day,
        });
      }
    }

    // 8. Oura activity
    const { data: activityData } = await supabase
      .from('oura_daily_activity')
      .select('day, score, steps, active_calories, total_calories, equivalent_walking_distance, updated_at')
      .eq('health_id', healthId)
      .order('day', { ascending: false })
      .limit(1);

    if (activityData?.[0]) {
      const activity = activityData[0];
      if (activity.score != null) {
        metrics.push({
          category: 'Activity',
          name: 'activity_score',
          displayName: 'Activity Score',
          value: activity.score,
          unit: '',
          source: 'Oura Ring',
          lastUpdated: activity.updated_at || activity.day,
        });
      }
      const existingSteps = metrics.find(m => m.name === 'steps_daily');
      if (!existingSteps && activity.steps) {
        metrics.push({
          category: 'Activity',
          name: 'steps_oura',
          displayName: 'Steps (Oura)',
          value: activity.steps.toLocaleString(),
          unit: '',
          source: 'Oura Ring',
          lastUpdated: activity.updated_at || activity.day,
        });
      }
      if (activity.active_calories) {
        const existingActiveEnergy = metrics.find(m => m.name === 'active_energy_daily');
        if (!existingActiveEnergy) {
          metrics.push({
            category: 'Activity',
            name: 'active_cal_oura',
            displayName: 'Active Calories (Oura)',
            value: activity.active_calories,
            unit: 'kcal',
            source: 'Oura Ring',
            lastUpdated: activity.updated_at || activity.day,
          });
        }
      }
    }

    // 9. Oura SpO2
    const { data: spo2Data } = await supabase
      .from('oura_daily_spo2')
      .select('day, spo2_percentage, breathing_disturbance_index, updated_at')
      .eq('health_id', healthId)
      .order('day', { ascending: false })
      .limit(1);

    if (spo2Data?.[0]) {
      const spo2 = spo2Data[0];
      if (spo2.spo2_percentage != null) {
        metrics.push({
          category: 'Respiratory',
          name: 'spo2_oura',
          displayName: 'SpO2 (Oura)',
          value: Math.round(spo2.spo2_percentage * 10) / 10,
          unit: '%',
          source: 'Oura Ring',
          lastUpdated: spo2.updated_at || spo2.day,
        });
      }
      if (spo2.breathing_disturbance_index != null) {
        metrics.push({
          category: 'Respiratory',
          name: 'breathing_disturbance',
          displayName: 'Breathing Disturbance Index',
          value: Math.round(spo2.breathing_disturbance_index * 10) / 10,
          unit: '',
          source: 'Oura Ring',
          lastUpdated: spo2.updated_at || spo2.day,
        });
      }
    }

    // 10. Latest workout
    const { data: workoutData } = await supabase
      .from('healthkit_workouts')
      .select('workout_type, duration_minutes, total_energy_burned, total_distance, source_name, start_date, created_at')
      .eq('health_id', healthId)
      .order('start_date', { ascending: false })
      .limit(1);

    if (workoutData?.[0]) {
      const workout = workoutData[0];
      const workoutSource = workout.source_name?.toLowerCase().includes('oura') ? 'Oura Ring' : 'Apple Watch';
      const workoutUpdated = workout.created_at || workout.start_date;
      
      metrics.push({
        category: 'Workouts',
        name: 'last_workout_type',
        displayName: 'Last Workout Type',
        value: workout.workout_type?.replace(/_/g, ' ').replace(/HKWorkoutActivityType/i, '') || 'Unknown',
        unit: '',
        source: workoutSource,
        lastUpdated: workoutUpdated,
      });
      if (workout.duration_minutes != null) {
        metrics.push({
          category: 'Workouts',
          name: 'last_workout_duration',
          displayName: 'Last Workout Duration',
          value: Math.round(workout.duration_minutes),
          unit: 'min',
          source: workoutSource,
          lastUpdated: workoutUpdated,
        });
      }
      if (workout.total_energy_burned != null) {
        metrics.push({
          category: 'Workouts',
          name: 'last_workout_energy',
          displayName: 'Last Workout Calories',
          value: Math.round(workout.total_energy_burned),
          unit: 'kcal',
          source: workoutSource,
          lastUpdated: workoutUpdated,
        });
      }
    }

    // 11. Latest biomarker measurements (lab results)
    const { data: biomarkerData } = await supabase
      .from('biomarker_measurements')
      .select(`
        biomarker_id,
        value_display,
        unit_canonical,
        source,
        created_at,
        biomarker_test_sessions!inner (
          test_date,
          health_id
        )
      `)
      .eq('biomarker_test_sessions.health_id', healthId)
      .order('biomarker_test_sessions(test_date)', { ascending: false })
      .limit(20);

    if (biomarkerData && biomarkerData.length > 0) {
      const seenBiomarkers = new Set<string>();
      for (const bm of biomarkerData) {
        if (seenBiomarkers.has(bm.biomarker_id)) continue;
        seenBiomarkers.add(bm.biomarker_id);
        
        const displayName = bm.biomarker_id
          .split('_')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        
        metrics.push({
          category: 'Lab Results',
          name: `biomarker_${bm.biomarker_id}`,
          displayName: displayName,
          value: bm.value_display || 'N/A',
          unit: bm.unit_canonical || '',
          source: bm.source === 'pdf_extraction' ? 'Lab Report' : bm.source || 'Manual',
          lastUpdated: (bm.biomarker_test_sessions as any)?.test_date || bm.created_at,
        });
      }
    }

    // Sort by category then name
    const categoryOrder = ['Sleep', 'Recovery', 'Heart', 'Activity', 'Workouts', 'Fitness', 'Body', 'Mobility', 'Respiratory', 'Vitals', 'Environmental', 'Glucose', 'Nutrition', 'Mindfulness', 'Stress', 'Lab Results'];
    metrics.sort((a, b) => {
      const catA = categoryOrder.indexOf(a.category);
      const catB = categoryOrder.indexOf(b.category);
      const catAIndex = catA === -1 ? categoryOrder.length : catA;
      const catBIndex = catB === -1 ? categoryOrder.length : catB;
      if (catAIndex !== catBIndex) return catAIndex - catBIndex;
      return a.displayName.localeCompare(b.displayName);
    });

    return metrics;
  } catch (error) {
    logger.error('[SupabaseHealth] Error getting latest metrics with sources:', error);
    return [];
  }
}

logger.info('[SupabaseHealth] Health storage service initialized');
