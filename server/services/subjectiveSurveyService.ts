import { getSupabaseClient } from './supabaseClient';
import { getClickHouseClient, insert as clickhouseInsert } from './clickhouseService';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('SubjectiveSurvey');

export interface SurveySubmission {
  energy: number;
  clarity: number;
  mood: number;
  timezone: string;
  triggerSource?: 'notification' | 'manual' | 'deep_link';
  responseLatencySeconds?: number;
}

export interface SurveyRecord {
  id: string;
  healthId: string;
  energy: number;
  clarity: number;
  mood: number;
  compositeScore: number;
  recordedAt: string;
  localDate: string;
  localTime: string;
  timezone: string;
  triggerSource: string;
  responseLatencySeconds: number | null;
}

export interface SurveyHistory {
  surveys: SurveyRecord[];
  averages: {
    energy: number;
    clarity: number;
    mood: number;
    composite: number;
  };
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
}

async function getHealthId(userId: string): Promise<string> {
  const { getHealthId: getHealthIdFromStorage } = await import('./supabaseHealthStorage');
  return getHealthIdFromStorage(userId);
}

function calculateCompositeScore(energy: number, clarity: number, mood: number): number {
  return Math.round(((energy + clarity + mood) / 3) * 10) / 10;
}

function getLocalDateTime(timezone: string): { localDate: string; localTime: string } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('en-CA', options);
  const parts = formatter.formatToParts(now);
  
  const year = parts.find(p => p.type === 'year')?.value || '2024';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  const second = parts.find(p => p.type === 'second')?.value || '00';
  
  return {
    localDate: `${year}-${month}-${day}`,
    localTime: `${hour}:${minute}:${second}`
  };
}

export async function submitSurvey(
  userId: string,
  submission: SurveySubmission
): Promise<SurveyRecord> {
  let healthId: string;
  try {
    healthId = await getHealthId(userId);
  } catch (err: any) {
    logger.error('[Survey] Failed to get health ID:', err);
    throw new Error(`Failed to get health ID: ${err.message}`);
  }
  
  if (!healthId) {
    throw new Error('Health ID not found for user');
  }
  
  const supabase = getSupabaseClient();
  
  const { localDate, localTime } = getLocalDateTime(submission.timezone);
  const compositeScore = calculateCompositeScore(submission.energy, submission.clarity, submission.mood);
  const surveyId = uuidv4();
  
  const { data, error } = await supabase
    .from('daily_subjective_surveys')
    .upsert({
      id: surveyId,
      health_id: healthId,
      energy: submission.energy,
      clarity: submission.clarity,
      mood: submission.mood,
      recorded_at: new Date().toISOString(),
      local_date: localDate,
      local_time: localTime,
      timezone: submission.timezone,
      trigger_source: submission.triggerSource || 'manual',
      response_latency_seconds: submission.responseLatencySeconds || null
    }, { 
      onConflict: 'health_id,local_date',
      ignoreDuplicates: false 
    })
    .select()
    .single();
  
  if (error) {
    logger.error('[Survey] Error submitting survey:', error);
    throw new Error(`Failed to submit survey: ${error.message}`);
  }
  
  if (!data) {
    logger.error('[Survey] No data returned from upsert');
    throw new Error('Failed to submit survey: No data returned');
  }
  
  const record: SurveyRecord = {
    id: data.id,
    healthId: data.health_id,
    energy: data.energy,
    clarity: data.clarity,
    mood: data.mood,
    compositeScore,
    recordedAt: data.recorded_at,
    localDate: data.local_date,
    localTime: data.local_time,
    timezone: data.timezone,
    triggerSource: data.trigger_source,
    responseLatencySeconds: data.response_latency_seconds
  };
  
  syncToClickHouse(record).catch(err => {
    logger.warn('[Survey] ClickHouse sync failed:', err.message);
  });
  
  logger.info(`[Survey] Survey submitted for ${healthId} on ${localDate}: E=${submission.energy} C=${submission.clarity} M=${submission.mood}`);
  
  return record;
}

export async function getTodaySurvey(userId: string, timezone: string): Promise<SurveyRecord | null> {
  const healthId = await getHealthId(userId);
  const supabase = getSupabaseClient();
  
  const { localDate } = getLocalDateTime(timezone);
  
  const { data, error } = await supabase
    .from('daily_subjective_surveys')
    .select('*')
    .eq('health_id', healthId)
    .eq('local_date', localDate)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    logger.error('[Survey] Error fetching today survey:', error);
    throw error;
  }
  
  return {
    id: data.id,
    healthId: data.health_id,
    energy: data.energy,
    clarity: data.clarity,
    mood: data.mood,
    compositeScore: calculateCompositeScore(data.energy, data.clarity, data.mood),
    recordedAt: data.recorded_at,
    localDate: data.local_date,
    localTime: data.local_time,
    timezone: data.timezone,
    triggerSource: data.trigger_source,
    responseLatencySeconds: data.response_latency_seconds
  };
}

export async function getSurveyHistory(
  userId: string,
  daysBack: number = 30
): Promise<SurveyHistory> {
  const healthId = await getHealthId(userId);
  const supabase = getSupabaseClient();
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  
  const { data, error } = await supabase
    .from('daily_subjective_surveys')
    .select('*')
    .eq('health_id', healthId)
    .gte('local_date', startDate.toISOString().split('T')[0])
    .order('local_date', { ascending: false });
  
  if (error) {
    logger.error('[Survey] Error fetching survey history:', error);
    throw error;
  }
  
  const surveys: SurveyRecord[] = (data || []).map(d => ({
    id: d.id,
    healthId: d.health_id,
    energy: d.energy,
    clarity: d.clarity,
    mood: d.mood,
    compositeScore: calculateCompositeScore(d.energy, d.clarity, d.mood),
    recordedAt: d.recorded_at,
    localDate: d.local_date,
    localTime: d.local_time,
    timezone: d.timezone,
    triggerSource: d.trigger_source,
    responseLatencySeconds: d.response_latency_seconds
  }));
  
  const averages = surveys.length > 0 ? {
    energy: Math.round((surveys.reduce((sum, s) => sum + s.energy, 0) / surveys.length) * 10) / 10,
    clarity: Math.round((surveys.reduce((sum, s) => sum + s.clarity, 0) / surveys.length) * 10) / 10,
    mood: Math.round((surveys.reduce((sum, s) => sum + s.mood, 0) / surveys.length) * 10) / 10,
    composite: Math.round((surveys.reduce((sum, s) => sum + s.compositeScore, 0) / surveys.length) * 10) / 10
  } : { energy: 0, clarity: 0, mood: 0, composite: 0 };
  
  let trend: SurveyHistory['trend'] = 'insufficient_data';
  if (surveys.length >= 7) {
    const recentWeek = surveys.slice(0, 7);
    const previousWeek = surveys.slice(7, 14);
    
    if (previousWeek.length >= 5) {
      const recentAvg = recentWeek.reduce((sum, s) => sum + s.compositeScore, 0) / recentWeek.length;
      const previousAvg = previousWeek.reduce((sum, s) => sum + s.compositeScore, 0) / previousWeek.length;
      const diff = recentAvg - previousAvg;
      
      if (diff > 0.5) trend = 'improving';
      else if (diff < -0.5) trend = 'declining';
      else trend = 'stable';
    }
  }
  
  return { surveys, averages, trend };
}

async function syncToClickHouse(record: SurveyRecord): Promise<void> {
  const ch = getClickHouseClient();
  if (!ch) {
    logger.debug('[Survey] ClickHouse not configured, skipping sync');
    return;
  }
  
  await clickhouseInsert('subjective_surveys', [{
    survey_id: record.id,
    health_id: record.healthId,
    recorded_at: record.recordedAt,
    local_date: record.localDate,
    local_time: record.localTime,
    timezone: record.timezone,
    energy: record.energy,
    clarity: record.clarity,
    mood: record.mood,
    composite_score: record.compositeScore,
    trigger_source: record.triggerSource,
    response_latency_seconds: record.responseLatencySeconds
  }]);
  
  logger.debug(`[Survey] Synced survey ${record.id} to ClickHouse`);
}

export async function backfillSurveysToClickHouse(healthId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const ch = getClickHouseClient();
  
  if (!ch) {
    logger.warn('[Survey] ClickHouse not configured, cannot backfill');
    return 0;
  }
  
  const { data, error } = await supabase
    .from('daily_subjective_surveys')
    .select('*')
    .eq('health_id', healthId)
    .order('local_date', { ascending: true });
  
  if (error) {
    logger.error('[Survey] Error fetching surveys for backfill:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    return 0;
  }
  
  const rows = data.map(d => ({
    survey_id: d.id,
    health_id: d.health_id,
    recorded_at: d.recorded_at,
    local_date: d.local_date,
    local_time: d.local_time,
    timezone: d.timezone,
    energy: d.energy,
    clarity: d.clarity,
    mood: d.mood,
    composite_score: calculateCompositeScore(d.energy, d.clarity, d.mood),
    trigger_source: d.trigger_source || 'manual',
    response_latency_seconds: d.response_latency_seconds
  }));
  
  await clickhouseInsert('subjective_surveys', rows);
  
  logger.info(`[Survey] Backfilled ${rows.length} surveys to ClickHouse for ${healthId}`);
  return rows.length;
}

export async function getSurveyContextForOracle(healthId: string, daysBack: number = 14): Promise<string | null> {
  const supabase = getSupabaseClient();
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  
  const { data, error } = await supabase
    .from('daily_subjective_surveys')
    .select('*')
    .eq('health_id', healthId)
    .gte('local_date', startDate.toISOString().split('T')[0])
    .order('local_date', { ascending: false });
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  const surveys = data.map(d => ({
    date: d.local_date,
    energy: d.energy,
    clarity: d.clarity,
    mood: d.mood,
    composite: calculateCompositeScore(d.energy, d.clarity, d.mood)
  }));
  
  const avgEnergy = Math.round((surveys.reduce((sum, s) => sum + s.energy, 0) / surveys.length) * 10) / 10;
  const avgClarity = Math.round((surveys.reduce((sum, s) => sum + s.clarity, 0) / surveys.length) * 10) / 10;
  const avgMood = Math.round((surveys.reduce((sum, s) => sum + s.mood, 0) / surveys.length) * 10) / 10;
  
  const latest = surveys[0];
  const latestVsAvg = {
    energy: latest.energy - avgEnergy,
    clarity: latest.clarity - avgClarity,
    mood: latest.mood - avgMood
  };
  
  let context = `## Recent Self-Reported Wellbeing (${surveys.length} surveys, last ${daysBack} days)\n\n`;
  context += `**Latest (${latest.date}):** Energy ${latest.energy}/10, Clarity ${latest.clarity}/10, Mood ${latest.mood}/10\n`;
  context += `**${daysBack}-day Averages:** Energy ${avgEnergy}/10, Clarity ${avgClarity}/10, Mood ${avgMood}/10\n\n`;
  
  if (Math.abs(latestVsAvg.energy) >= 2 || Math.abs(latestVsAvg.clarity) >= 2 || Math.abs(latestVsAvg.mood) >= 2) {
    context += `**Notable Changes:**\n`;
    if (latestVsAvg.energy >= 2) context += `- Energy is ${latestVsAvg.energy.toFixed(1)} points above average\n`;
    if (latestVsAvg.energy <= -2) context += `- Energy is ${Math.abs(latestVsAvg.energy).toFixed(1)} points below average\n`;
    if (latestVsAvg.clarity >= 2) context += `- Mental clarity is ${latestVsAvg.clarity.toFixed(1)} points above average\n`;
    if (latestVsAvg.clarity <= -2) context += `- Mental clarity is ${Math.abs(latestVsAvg.clarity).toFixed(1)} points below average\n`;
    if (latestVsAvg.mood >= 2) context += `- Mood is ${latestVsAvg.mood.toFixed(1)} points above average\n`;
    if (latestVsAvg.mood <= -2) context += `- Mood is ${Math.abs(latestVsAvg.mood).toFixed(1)} points below average\n`;
  }
  
  return context;
}
