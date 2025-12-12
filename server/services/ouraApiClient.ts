/**
 * Oura API Client
 * 
 * Fetches data from Oura Cloud API v2 and converts to Flō internal schema.
 * Rate limit: 5000 requests per 5 minutes
 */

import { getValidAccessToken, updateSyncStatus } from './integrationsService';
import { OURA_UNIT_CONVERSIONS, OURA_TO_INTERNAL_FIELD_MAP } from '@shared/dataSource';

const OURA_API_BASE = 'https://api.ouraring.com/v2';

interface OuraApiResponse<T> {
  data: T[];
  next_token?: string;
}

// Oura API types
export interface OuraDailySleep {
  id: string;
  day: string; // YYYY-MM-DD
  score: number | null;
  timestamp: string;
  contributors?: {
    deep_sleep: number;
    efficiency: number;
    latency: number;
    rem_sleep: number;
    restfulness: number;
    timing: number;
    total_sleep: number;
  };
}

export interface OuraSleepPeriod {
  id: string;
  day: string; // YYYY-MM-DD
  bedtime_start: string; // ISO 8601
  bedtime_end: string; // ISO 8601
  type: 'long_sleep' | 'rest' | 'nap' | 'late_nap' | 'sleep';
  average_breath?: number;
  average_heart_rate?: number;
  average_hrv?: number;
  awake_time?: number; // seconds
  deep_sleep_duration?: number; // seconds
  efficiency?: number; // percentage
  heart_rate?: {
    interval: number;
    items: (number | null)[];
    timestamp: string;
  };
  hrv?: {
    interval: number;
    items: (number | null)[];
    timestamp: string;
  };
  latency?: number; // seconds
  light_sleep_duration?: number; // seconds
  low_battery_alert?: boolean;
  lowest_heart_rate?: number;
  movement_30_sec?: string;
  readiness?: {
    contributors: {
      activity_balance: number;
      body_temperature: number;
      hrv_balance: number;
      previous_day_activity: number;
      previous_night: number;
      recovery_index: number;
      resting_heart_rate: number;
      sleep_balance: number;
    };
    score: number;
    temperature_deviation: number;
    temperature_trend_deviation: number;
  };
  rem_sleep_duration?: number; // seconds
  restless_periods?: number;
  sleep_phase_5_min?: string;
  time_in_bed?: number; // seconds
  total_sleep_duration?: number; // seconds
}

export interface OuraDailyReadiness {
  id: string;
  day: string; // YYYY-MM-DD
  score: number | null;
  temperature_deviation?: number;
  temperature_trend_deviation?: number;
  timestamp: string;
  contributors?: {
    activity_balance: number;
    body_temperature: number;
    hrv_balance: number;
    previous_day_activity: number;
    previous_night: number;
    recovery_index: number;
    resting_heart_rate: number;
    sleep_balance: number;
  };
}

export interface OuraHeartRate {
  bpm: number;
  source: 'awake' | 'rest' | 'sleep' | 'session' | 'workout';
  timestamp: string;
}

// Flō internal sleep format
export interface FloSleepNight {
  sleepDate: string;
  timezone: string;
  nightStart: Date | null;
  finalWake: Date | null;
  sleepOnset: Date | null;
  timeInBedMin: number | null;
  totalSleepMin: number | null;
  sleepEfficiencyPct: number | null;
  sleepLatencyMin: number | null;
  wasoMin: number | null;
  numAwakenings: number | null;
  coreSleepMin: number | null;
  deepSleepMin: number | null;
  remSleepMin: number | null;
  restingHrBpm: number | null;
  hrvMs: number | null;
  respiratoryRate: number | null;
  source: 'oura';
  ouraSessionId: string;
}

// Custom error class for API authentication errors
export class OuraApiAuthError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'OuraApiAuthError';
  }
}

/**
 * Fetch data from Oura API with authentication
 * Throws OuraApiAuthError on auth failures for proper error propagation
 */
async function ouraFetch<T>(
  userId: string,
  endpoint: string,
  params?: Record<string, string>
): Promise<OuraApiResponse<T>> {
  const accessToken = await getValidAccessToken(userId, 'oura');
  
  if (!accessToken) {
    console.error('[OuraAPI] No valid access token for user:', userId);
    throw new OuraApiAuthError('No valid access token - please reconnect Oura');
  }
  
  const url = new URL(`${OURA_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`[OuraAPI] Request failed: ${response.status} - ${error}`);
      
      // 401/403 indicate auth issues - token expired or revoked
      if (response.status === 401 || response.status === 403) {
        throw new OuraApiAuthError(`Oura authentication failed: ${response.status}`, response.status);
      }
      
      throw new Error(`Oura API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[OuraAPI] Fetch error:', error);
    throw error;
  }
}

/**
 * Fetch daily sleep summaries
 * Throws on API/auth errors for proper error propagation
 */
export async function fetchDailySleep(
  userId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string
): Promise<OuraDailySleep[]> {
  const response = await ouraFetch<OuraDailySleep>(
    userId,
    '/usercollection/daily_sleep',
    { start_date: startDate, end_date: endDate }
  );
  
  return response.data;
}

/**
 * Fetch detailed sleep periods (5-min interval data)
 * Throws on API/auth errors for proper error propagation
 */
export async function fetchSleepPeriods(
  userId: string,
  startDate: string,
  endDate: string
): Promise<OuraSleepPeriod[]> {
  const response = await ouraFetch<OuraSleepPeriod>(
    userId,
    '/usercollection/sleep',
    { start_date: startDate, end_date: endDate }
  );
  
  return response.data;
}

/**
 * Fetch daily readiness scores
 * Throws on API/auth errors for proper error propagation
 */
export async function fetchDailyReadiness(
  userId: string,
  startDate: string,
  endDate: string
): Promise<OuraDailyReadiness[]> {
  const response = await ouraFetch<OuraDailyReadiness>(
    userId,
    '/usercollection/daily_readiness',
    { start_date: startDate, end_date: endDate }
  );
  
  return response.data;
}

/**
 * Fetch heart rate samples
 * Throws on API/auth errors for proper error propagation
 */
export async function fetchHeartRate(
  userId: string,
  startDate: string,
  endDate: string
): Promise<OuraHeartRate[]> {
  const response = await ouraFetch<OuraHeartRate>(
    userId,
    '/usercollection/heartrate',
    { start_datetime: `${startDate}T00:00:00Z`, end_datetime: `${endDate}T23:59:59Z` }
  );
  
  return response.data;
}

/**
 * Convert Oura sleep period to Flō sleep night format
 */
export function convertSleepPeriodToFloFormat(
  period: OuraSleepPeriod,
  readiness?: OuraDailyReadiness
): FloSleepNight {
  // Only process main sleep periods (long_sleep or sleep)
  const bedtimeStart = new Date(period.bedtime_start);
  const bedtimeEnd = new Date(period.bedtime_end);
  
  // Determine timezone from the bedtime_start ISO string
  // Oura provides timezone offset in the timestamp
  const tzMatch = period.bedtime_start.match(/([+-]\d{2}:\d{2})$/);
  const timezone = tzMatch ? `UTC${tzMatch[1]}` : 'UTC';
  
  // DEBUG: Log raw Oura values to diagnose sleep calculation issues
  const totalSleepMin = period.total_sleep_duration ? OURA_UNIT_CONVERSIONS.sleepDurationSecToMin(period.total_sleep_duration) : null;
  const timeInBedMin = period.time_in_bed ? OURA_UNIT_CONVERSIONS.sleepDurationSecToMin(period.time_in_bed) : null;
  
  console.log(`[OuraAPI] Converting sleep period for ${period.day}:`, {
    sessionId: period.id,
    type: period.type,
    bedtimeStart: period.bedtime_start,
    bedtimeEnd: period.bedtime_end,
    raw_total_sleep_duration_sec: period.total_sleep_duration,
    raw_time_in_bed_sec: period.time_in_bed,
    converted_totalSleepMin: totalSleepMin,
    converted_timeInBedMin: timeInBedMin,
    efficiency: period.efficiency,
  });
  
  return {
    sleepDate: period.day,
    timezone,
    nightStart: bedtimeStart,
    finalWake: bedtimeEnd,
    sleepOnset: bedtimeStart, // Oura doesn't provide exact onset, use bedtime
    timeInBedMin,
    totalSleepMin,
    sleepEfficiencyPct: period.efficiency ?? null,
    sleepLatencyMin: period.latency ? OURA_UNIT_CONVERSIONS.sleepDurationSecToMin(period.latency) : null,
    wasoMin: period.awake_time ? OURA_UNIT_CONVERSIONS.sleepDurationSecToMin(period.awake_time) : null,
    numAwakenings: period.restless_periods ?? null,
    coreSleepMin: period.light_sleep_duration ? OURA_UNIT_CONVERSIONS.sleepDurationSecToMin(period.light_sleep_duration) : null,
    deepSleepMin: period.deep_sleep_duration ? OURA_UNIT_CONVERSIONS.sleepDurationSecToMin(period.deep_sleep_duration) : null,
    remSleepMin: period.rem_sleep_duration ? OURA_UNIT_CONVERSIONS.sleepDurationSecToMin(period.rem_sleep_duration) : null,
    restingHrBpm: period.lowest_heart_rate ?? null,
    hrvMs: period.average_hrv ?? null,
    respiratoryRate: period.average_breath ?? null,
    source: 'oura',
    ouraSessionId: period.id,
  };
}

/**
 * Sync Oura data for a user
 * Fetches the last 7 days by default
 * Properly handles auth errors with status downgrade
 */
export async function syncOuraData(
  userId: string,
  healthId: string,
  daysBack: number = 7
): Promise<{ success: boolean; sleepNights: FloSleepNight[]; error?: string; isAuthError?: boolean }> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.log(`[OuraAPI] Syncing data for user ${userId} from ${startStr} to ${endStr}`);
    
    // Fetch sleep periods and readiness in parallel
    const [sleepPeriods, readinessData] = await Promise.all([
      fetchSleepPeriods(userId, startStr, endStr),
      fetchDailyReadiness(userId, startStr, endStr),
    ]);
    
    // Create a map of readiness by day for easy lookup
    const readinessMap = new Map(readinessData.map(r => [r.day, r]));
    
    // Convert to Flō format, filtering to only main sleep periods
    const sleepNights = sleepPeriods
      .filter(p => p.type === 'long_sleep' || p.type === 'sleep')
      .map(period => convertSleepPeriodToFloFormat(period, readinessMap.get(period.day)));
    
    console.log(`[OuraAPI] Converted ${sleepNights.length} sleep nights`);
    
    // Update sync status - only mark success if we got this far
    await updateSyncStatus(userId, 'oura', true);
    
    return { success: true, sleepNights };
  } catch (error: any) {
    console.error('[OuraAPI] Sync failed:', error);
    
    // Handle auth errors specifically - downgrade to expired status
    const isAuthError = error instanceof OuraApiAuthError || 
                        error.message?.includes('access token') ||
                        error.message?.includes('authentication');
    
    // Use 'expired' status for auth errors, 'error' for other failures
    const statusOverride = isAuthError ? 'expired' : 'error';
    const errorMessage = isAuthError 
      ? 'Oura connection expired - please reconnect'
      : error.message;
    
    // Pass status override to properly set integration status
    await updateSyncStatus(userId, 'oura', false, errorMessage, undefined, statusOverride);
    
    return { 
      success: false, 
      sleepNights: [], 
      error: errorMessage,
      isAuthError,
    };
  }
}

/**
 * Get user personal info from Oura (for verification)
 */
export async function getOuraUserInfo(userId: string): Promise<any | null> {
  const accessToken = await getValidAccessToken(userId, 'oura');
  
  if (!accessToken) {
    return null;
  }
  
  try {
    const response = await fetch(`${OURA_API_BASE}/usercollection/personal_info`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[OuraAPI] Failed to fetch user info:', error);
    return null;
  }
}
