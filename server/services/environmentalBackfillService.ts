import { createLogger } from '../utils/logger';
import { getHistoricalAirQuality, getCurrentWeather, AirQualityData } from './openWeatherService';

const logger = createLogger('EnvironmentalBackfill');

// Limit backfill to 1 month per run - accumulates over time
const BACKFILL_MONTHS = 1;
const DAYS_PER_API_CALL = 5;
const API_CALL_DELAY_MS = 1100;
const MAX_RETRIES = 3;
const DAILY_API_QUOTA = 950;
// Reserve some quota for real-time weather requests (100 calls/day)
const BACKFILL_QUOTA_RESERVE = 100;

async function getPersistedQuota(): Promise<{ date: string; callsUsed: number }> {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('weather_backfill_status')
      .select('api_calls_today, api_calls_date')
      .eq('health_id', '__GLOBAL_QUOTA__')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      logger.error('[Quota] Error fetching quota:', error);
      return { date: today, callsUsed: 0 };
    }
    
    if (data && data.api_calls_date === today) {
      return { date: today, callsUsed: data.api_calls_today || 0 };
    } else {
      return { date: today, callsUsed: 0 };
    }
  } catch (e) {
    logger.error('[Quota] Error reading persisted quota:', e);
    return { date: today, callsUsed: 0 };
  }
}

async function tryIncrementQuotaAtomic(): Promise<{ success: boolean; newCount: number }> {
  const today = new Date().toISOString().split('T')[0];
  
  const supabase = await getSupabaseClient();
  
  const { data: result, error: rpcError } = await supabase.rpc('increment_weather_api_quota', {
    quota_date: today,
    max_quota: DAILY_API_QUOTA
  });
  
  if (rpcError) {
    logger.error('[Quota] RPC failed - cannot safely increment quota:', rpcError.message);
    logger.error('[Quota] Please ensure increment_weather_api_quota function is deployed to Supabase');
    throw new Error(`QUOTA_RPC_UNAVAILABLE: ${rpcError.message}`);
  }
  
  const newCount = result as number;
  
  if (newCount === 0) {
    logger.warn(`[Quota] Daily API quota exhausted (${DAILY_API_QUOTA}/${DAILY_API_QUOTA})`);
    return { success: false, newCount: DAILY_API_QUOTA };
  }
  
  if (newCount % 100 === 0) {
    logger.info(`[Quota] OpenWeather API calls today: ${newCount}/${DAILY_API_QUOTA}`);
  }
  
  return { success: true, newCount };
}

async function getQuotaStatusInternal(): Promise<{ date: string; callsUsed: number; remaining: number; quotaExhausted: boolean }> {
  const quota = await getPersistedQuota();
  return {
    date: quota.date,
    callsUsed: quota.callsUsed,
    remaining: DAILY_API_QUOTA - quota.callsUsed,
    quotaExhausted: quota.callsUsed >= DAILY_API_QUOTA,
  };
}

interface BackfillStatus {
  healthId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'no_location_data' | 'paused_quota';
  backfillStartedAt: Date | null;
  backfillCompletedAt: Date | null;
  lastProcessedDate: string | null;
  earliestDate: string | null;
  latestDate: string | null;
  totalDaysProcessed: number;
  totalDaysWithLocation: number;
  errorLog: string | null;
}

interface LocationRecord {
  date: string;
  latitude: number;
  longitude: number;
}

interface DailyAQIAggregate {
  date: string;
  latitude: number;
  longitude: number;
  avgAqi: number;
  maxAqi: number;
  minAqi: number;
  avgPm25: number;
  avgPm10: number;
  avgO3: number;
  avgNo2: number;
  avgSo2: number;
  avgCo: number;
  avgNh3: number;
  sampleCount: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getSupabaseClient() {
  const { getSupabaseClient } = await import('./supabaseClient');
  return getSupabaseClient();
}

export async function getBackfillStatus(healthId: string): Promise<BackfillStatus | null> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('weather_backfill_status')
    .select('*')
    .eq('health_id', healthId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[Backfill] Error fetching status:', error);
    return null;
  }

  if (!data) return null;

  return {
    healthId: data.health_id,
    status: data.status,
    backfillStartedAt: data.backfill_started_at ? new Date(data.backfill_started_at) : null,
    backfillCompletedAt: data.backfill_completed_at ? new Date(data.backfill_completed_at) : null,
    lastProcessedDate: data.last_processed_date,
    earliestDate: data.earliest_date,
    latestDate: data.latest_date,
    totalDaysProcessed: data.total_days_processed || 0,
    totalDaysWithLocation: data.total_days_with_location || 0,
    errorLog: data.error_log,
  };
}

async function updateBackfillStatus(
  healthId: string,
  updates: Partial<{
    status: string;
    backfillStartedAt: Date;
    backfillCompletedAt: Date;
    lastProcessedDate: string;
    earliestDate: string;
    latestDate: string;
    totalDaysProcessed: number;
    totalDaysWithLocation: number;
    errorLog: string;
  }>
): Promise<void> {
  const supabase = await getSupabaseClient();
  
  const dbUpdates: Record<string, any> = {};
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.backfillStartedAt) dbUpdates.backfill_started_at = updates.backfillStartedAt.toISOString();
  if (updates.backfillCompletedAt) dbUpdates.backfill_completed_at = updates.backfillCompletedAt.toISOString();
  if (updates.lastProcessedDate) dbUpdates.last_processed_date = updates.lastProcessedDate;
  if (updates.earliestDate) dbUpdates.earliest_date = updates.earliestDate;
  if (updates.latestDate) dbUpdates.latest_date = updates.latestDate;
  if (updates.totalDaysProcessed !== undefined) dbUpdates.total_days_processed = updates.totalDaysProcessed;
  if (updates.totalDaysWithLocation !== undefined) dbUpdates.total_days_with_location = updates.totalDaysWithLocation;
  if (updates.errorLog !== undefined) dbUpdates.error_log = updates.errorLog;

  const { error } = await supabase
    .from('weather_backfill_status')
    .upsert({ health_id: healthId, ...dbUpdates }, { onConflict: 'health_id' });

  if (error) {
    logger.error('[Backfill] Error updating status:', error);
  }
}

async function getHistoricalLocations(healthId: string, startDate: Date, endDate: Date): Promise<Map<string, LocationRecord>> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('user_location_history')
    .select('latitude, longitude, recorded_at')
    .eq('health_id', healthId)
    .gte('recorded_at', startDate.toISOString())
    .lte('recorded_at', endDate.toISOString())
    .order('recorded_at', { ascending: true });

  if (error) {
    logger.error('[Backfill] Error fetching location history:', error);
    return new Map();
  }

  if (!data || data.length === 0) {
    return new Map();
  }

  const locationsByDate = new Map<string, LocationRecord>();
  
  for (const loc of data) {
    const date = new Date(loc.recorded_at).toISOString().split('T')[0];
    if (!locationsByDate.has(date)) {
      locationsByDate.set(date, {
        date,
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
    }
  }

  return locationsByDate;
}

function aggregateDailyAQI(
  date: string,
  latitude: number,
  longitude: number,
  hourlyData: AirQualityData[]
): DailyAQIAggregate | null {
  if (hourlyData.length === 0) return null;

  const aqiValues = hourlyData.map(h => h.aqi);
  const pm25Values = hourlyData.map(h => h.components.pm2_5);
  const pm10Values = hourlyData.map(h => h.components.pm10);
  const o3Values = hourlyData.map(h => h.components.o3);
  const no2Values = hourlyData.map(h => h.components.no2);
  const so2Values = hourlyData.map(h => h.components.so2);
  const coValues = hourlyData.map(h => h.components.co);
  const nh3Values = hourlyData.map(h => h.components.nh3);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    date,
    latitude,
    longitude,
    avgAqi: Math.round(avg(aqiValues) * 10) / 10,
    maxAqi: Math.max(...aqiValues),
    minAqi: Math.min(...aqiValues),
    avgPm25: Math.round(avg(pm25Values) * 100) / 100,
    avgPm10: Math.round(avg(pm10Values) * 100) / 100,
    avgO3: Math.round(avg(o3Values) * 100) / 100,
    avgNo2: Math.round(avg(no2Values) * 100) / 100,
    avgSo2: Math.round(avg(so2Values) * 100) / 100,
    avgCo: Math.round(avg(coValues) * 100) / 100,
    avgNh3: Math.round(avg(nh3Values) * 100) / 100,
    sampleCount: hourlyData.length,
  };
}

async function saveAQIToCache(healthId: string, aggregate: DailyAQIAggregate): Promise<void> {
  const supabase = await getSupabaseClient();

  const airQualityData = {
    aqi: aggregate.avgAqi,
    aqiLabel: getAqiLabel(Math.round(aggregate.avgAqi)),
    maxAqi: aggregate.maxAqi,
    minAqi: aggregate.minAqi,
    components: {
      pm2_5: aggregate.avgPm25,
      pm10: aggregate.avgPm10,
      o3: aggregate.avgO3,
      no2: aggregate.avgNo2,
      so2: aggregate.avgSo2,
      co: aggregate.avgCo,
      nh3: aggregate.avgNh3,
    },
    sampleCount: aggregate.sampleCount,
    source: 'historical_backfill',
  };

  const { error } = await supabase
    .from('weather_daily_cache')
    .upsert({
      health_id: healthId,
      date: aggregate.date,
      latitude: aggregate.latitude,
      longitude: aggregate.longitude,
      air_quality_data: airQualityData,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'health_id,date' });

  if (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Backfill] Error saving AQI for ${aggregate.date}: ${errorMsg}`);
    throw error;
  }
}

function getAqiLabel(aqi: number): string {
  if (aqi <= 1) return 'Good';
  if (aqi <= 2) return 'Fair';
  if (aqi <= 3) return 'Moderate';
  if (aqi <= 4) return 'Poor';
  return 'Very Poor';
}

async function fetchAQIForDateRange(
  latitude: number,
  longitude: number,
  startDate: Date,
  endDate: Date,
  retryCount = 0
): Promise<AirQualityData[]> {
  const quotaResult = await tryIncrementQuotaAtomic();
  
  if (!quotaResult.success) {
    logger.warn(`[Backfill] Daily API quota exhausted (${quotaResult.newCount}/${DAILY_API_QUOTA})`);
    throw new Error('QUOTA_EXHAUSTED: Daily OpenWeather API limit reached');
  }
  
  try {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    const data = await getHistoricalAirQuality(latitude, longitude, startTimestamp, endTimestamp);
    return data;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const backoffMs = Math.pow(2, retryCount) * 1000;
      logger.warn(`[Backfill] API call failed, retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
      return fetchAQIForDateRange(latitude, longitude, startDate, endDate, retryCount + 1);
    }
    throw error;
  }
}

export async function getQuotaStatus(): Promise<{ date: string; callsUsed: number; remaining: number; quotaExhausted: boolean }> {
  return getQuotaStatusInternal();
}

export async function getCurrentWeatherWithQuotaGuard(lat: number, lon: number): Promise<{
  weather: any;
  airQuality: any;
  fetchedAt: string;
  location: { lat: number; lon: number };
} | null> {
  const quotaResult = await tryIncrementQuotaAtomic();
  
  if (!quotaResult.success) {
    logger.warn(`[Quota] Skipping current weather fetch - daily quota exhausted`);
    return null;
  }
  
  const { getEnvironmentalData } = await import('./openWeatherService');
  return await getEnvironmentalData(lat, lon);
}

export async function runBackfillForUser(
  healthId: string,
  options: { monthsBack?: number; forceRefresh?: boolean } = {}
): Promise<{ success: boolean; daysProcessed: number; error?: string }> {
  const { monthsBack = BACKFILL_MONTHS, forceRefresh = false } = options;
  
  logger.info(`[Backfill] Starting ${monthsBack}-month backfill for health_id ${healthId}`);

  // Check quota upfront - reserve some for real-time requests
  const quotaStatus = await getQuotaStatusInternal();
  if (quotaStatus.remaining < BACKFILL_QUOTA_RESERVE) {
    logger.warn(`[Backfill] Skipping user ${healthId} - insufficient quota (${quotaStatus.remaining} remaining, need ${BACKFILL_QUOTA_RESERVE} reserve)`);
    return { success: false, daysProcessed: 0, error: 'QUOTA_INSUFFICIENT: Not enough quota for backfill' };
  }

  const existingStatus = await getBackfillStatus(healthId);
  if (existingStatus?.status === 'completed' && !forceRefresh) {
    logger.info(`[Backfill] User ${healthId} already backfilled, skipping`);
    return { success: true, daysProcessed: existingStatus.totalDaysProcessed };
  }

  if (existingStatus?.status === 'in_progress') {
    logger.warn(`[Backfill] User ${healthId} backfill already in progress`);
    return { success: false, daysProcessed: 0, error: 'Backfill already in progress' };
  }

  const endDate = new Date();
  let startDate = new Date();
  startDate.setMonth(startDate.getMonth() - monthsBack);

  // Resume from last processed date if paused due to quota
  let resuming = false;
  if ((existingStatus?.status === 'paused_quota' || existingStatus?.status === 'failed') && existingStatus.lastProcessedDate) {
    const lastProcessed = new Date(existingStatus.lastProcessedDate);
    // Start from the day after the last processed date
    lastProcessed.setDate(lastProcessed.getDate() + 1);
    if (lastProcessed < endDate) {
      startDate = lastProcessed;
      resuming = true;
      logger.info(`[Backfill] Resuming user ${healthId} from ${startDate.toISOString().split('T')[0]}`);
    }
  }

  await updateBackfillStatus(healthId, {
    status: 'in_progress',
    backfillStartedAt: resuming ? undefined : new Date(),
    earliestDate: resuming ? undefined : startDate.toISOString().split('T')[0],
    latestDate: endDate.toISOString().split('T')[0],
    errorLog: '',
  });

  try {
    const locationsByDate = await getHistoricalLocations(healthId, startDate, endDate);
    
    if (locationsByDate.size === 0) {
      logger.warn(`[Backfill] No location history found for user ${healthId}`);
      await updateBackfillStatus(healthId, {
        status: 'no_location_data',
        totalDaysWithLocation: 0,
        errorLog: 'No location history available for the backfill period',
      });
      return { success: false, daysProcessed: 0, error: 'No location history available' };
    }

    logger.info(`[Backfill] Found ${locationsByDate.size} days with location data for ${healthId}`);

    await updateBackfillStatus(healthId, {
      totalDaysWithLocation: locationsByDate.size,
    });

    let daysProcessed = 0;
    const sortedDates = Array.from(locationsByDate.keys()).sort();

    const locationGroups: { lat: number; lon: number; dates: string[] }[] = [];
    let currentGroup: { lat: number; lon: number; dates: string[] } | null = null;

    for (const dateStr of sortedDates) {
      const loc = locationsByDate.get(dateStr)!;
      
      if (!currentGroup || 
          Math.abs(currentGroup.lat - loc.latitude) > 0.1 || 
          Math.abs(currentGroup.lon - loc.longitude) > 0.1) {
        if (currentGroup) {
          locationGroups.push(currentGroup);
        }
        currentGroup = { lat: loc.latitude, lon: loc.longitude, dates: [dateStr] };
      } else {
        currentGroup.dates.push(dateStr);
      }
    }
    if (currentGroup) {
      locationGroups.push(currentGroup);
    }

    for (const group of locationGroups) {
      const groupDates = group.dates;
      
      for (let i = 0; i < groupDates.length; i += DAYS_PER_API_CALL) {
        const batchDates = groupDates.slice(i, i + DAYS_PER_API_CALL);
        const batchStart = new Date(batchDates[0]);
        const batchEnd = new Date(batchDates[batchDates.length - 1]);
        batchEnd.setHours(23, 59, 59, 999);

        logger.debug(`[Backfill] Fetching AQI for ${batchDates.length} days at (${group.lat}, ${group.lon})`);

        const hourlyData = await fetchAQIForDateRange(group.lat, group.lon, batchStart, batchEnd);

        if (hourlyData.length > 0) {
          const hourlyByDate = new Map<string, AirQualityData[]>();
          
          const hoursPerDay = Math.ceil(hourlyData.length / batchDates.length);
          for (let j = 0; j < batchDates.length; j++) {
            const dayStart = j * hoursPerDay;
            const dayEnd = Math.min((j + 1) * hoursPerDay, hourlyData.length);
            const dayData = hourlyData.slice(dayStart, dayEnd);
            if (dayData.length > 0) {
              hourlyByDate.set(batchDates[j], dayData);
            }
          }

          for (const [dateStr, dayHourly] of Array.from(hourlyByDate.entries())) {
            const aggregate = aggregateDailyAQI(dateStr, group.lat, group.lon, dayHourly);
            if (aggregate) {
              await saveAQIToCache(healthId, aggregate);
              daysProcessed++;
            }
          }
        }

        await updateBackfillStatus(healthId, {
          lastProcessedDate: batchDates[batchDates.length - 1],
          totalDaysProcessed: daysProcessed,
        });

        await sleep(API_CALL_DELAY_MS);
      }
    }

    await updateBackfillStatus(healthId, {
      status: 'completed',
      backfillCompletedAt: new Date(),
      totalDaysProcessed: daysProcessed,
    });

    logger.info(`[Backfill] Completed backfill for ${healthId}: ${daysProcessed} days processed`);

    // ClickHouse removed - environmental data stored in Supabase only

    return { success: true, daysProcessed };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Backfill] Failed for ${healthId}:`, error);
    
    // Use 'paused_quota' status for quota-related errors so we can resume later
    const isQuotaError = errorMsg.includes('QUOTA_EXHAUSTED') || errorMsg.includes('QUOTA_INSUFFICIENT');
    
    await updateBackfillStatus(healthId, {
      status: isQuotaError ? 'paused_quota' : 'failed',
      errorLog: errorMsg,
    });

    return { success: false, daysProcessed: 0, error: errorMsg };
  }
}

export async function runBackfillForAllUsers(): Promise<{ 
  total: number; 
  successful: number; 
  failed: number;
  noLocationData: number;
  pausedQuota: number;
  quotaExhaustedAt?: number;
  stoppedDueToQuota: boolean;
}> {
  const supabase = await getSupabaseClient();
  
  const { data: users, error } = await supabase
    .from('user_location_history')
    .select('health_id')
    .order('health_id');

  if (error) {
    logger.error('[Backfill] Error fetching users:', error);
    return { total: 0, successful: 0, failed: 0, noLocationData: 0, pausedQuota: 0, stoppedDueToQuota: false };
  }

  const uniqueHealthIds = Array.from(new Set(users?.map(u => u.health_id) || []));
  logger.info(`[Backfill] Starting bulk backfill for ${uniqueHealthIds.length} users`);

  let successful = 0;
  let failed = 0;
  let noLocationData = 0;
  let pausedQuota = 0;
  let stoppedDueToQuota = false;
  let quotaExhaustedAt: number | undefined;

  for (let i = 0; i < uniqueHealthIds.length; i++) {
    const healthId = uniqueHealthIds[i];
    
    const quotaStatus = await getQuotaStatusInternal();
    if (quotaStatus.remaining < BACKFILL_QUOTA_RESERVE) {
      logger.warn(`[Backfill] Stopping bulk backfill: insufficient quota (${quotaStatus.remaining} remaining, need ${BACKFILL_QUOTA_RESERVE} reserve)`);
      stoppedDueToQuota = true;
      quotaExhaustedAt = i;
      break;
    }
    
    const result = await runBackfillForUser(healthId);
    
    if (result.success) {
      successful++;
    } else if (result.error === 'No location history available') {
      noLocationData++;
    } else if (result.error?.includes('QUOTA_EXHAUSTED') || result.error?.includes('QUOTA_INSUFFICIENT')) {
      pausedQuota++;
      stoppedDueToQuota = true;
      quotaExhaustedAt = i;
      logger.warn(`[Backfill] Stopping bulk backfill at user ${i + 1}/${uniqueHealthIds.length}: quota exhausted`);
      break;
    } else if (result.error?.includes('QUOTA_RPC_UNAVAILABLE') || result.error?.includes('QUOTA_INCREMENT_FAILED')) {
      logger.error(`[Backfill] ABORTING bulk backfill: Quota RPC unavailable. Deploy increment_weather_api_quota function to Supabase.`);
      failed++;
      break;
    } else {
      failed++;
    }

    await sleep(500);
  }

  const message = stoppedDueToQuota 
    ? `Bulk backfill paused at user ${quotaExhaustedAt! + 1}/${uniqueHealthIds.length}: quota exhausted`
    : `Bulk backfill complete: ${successful} successful, ${failed} failed, ${noLocationData} no location data`;
  logger.info(`[Backfill] ${message}`);

  return { total: uniqueHealthIds.length, successful, failed, noLocationData, pausedQuota, quotaExhaustedAt, stoppedDueToQuota };
}

export async function getBackfillStats(): Promise<{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  noLocationData: number;
  pausedQuota: number;
  apiQuota: { date: string; callsUsed: number; remaining: number; quotaExhausted: boolean };
}> {
  const supabase = await getSupabaseClient();
  
  const { data, error } = await supabase
    .from('weather_backfill_status')
    .select('status');

  if (error) {
    logger.error('[Backfill] Error fetching stats:', error);
    return { 
      total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0, noLocationData: 0, pausedQuota: 0,
      apiQuota: await getQuotaStatusInternal()
    };
  }

  const statuses = (data || []).filter(s => s.status !== 'quota_tracker');
  return {
    total: statuses.length,
    pending: statuses.filter(s => s.status === 'pending').length,
    inProgress: statuses.filter(s => s.status === 'in_progress').length,
    completed: statuses.filter(s => s.status === 'completed').length,
    failed: statuses.filter(s => s.status === 'failed').length,
    noLocationData: statuses.filter(s => s.status === 'no_location_data').length,
    pausedQuota: statuses.filter(s => s.status === 'paused_quota').length,
    apiQuota: await getQuotaStatusInternal(),
  };
}

logger.info('[EnvironmentalBackfill] Service initialized');
