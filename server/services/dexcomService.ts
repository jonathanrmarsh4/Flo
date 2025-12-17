import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const supabase = getSupabaseClient();

// Server-side OAuth state storage (in-memory with TTL)
// In production, consider using Redis or database storage for multi-instance deployments
const pendingOAuthStates = new Map<string, { userId: string; createdAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup expired states periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(pendingOAuthStates.entries());
  for (const [state, data] of entries) {
    if (now - data.createdAt > STATE_TTL_MS) {
      pendingOAuthStates.delete(state);
    }
  }
}, 60 * 1000); // Check every minute

export function generateSecureState(userId: string): string {
  const state = crypto.randomBytes(32).toString('hex');
  pendingOAuthStates.set(state, { userId, createdAt: Date.now() });
  logger.debug(`[Dexcom] Generated OAuth state for user ${userId}`);
  return state;
}

export function validateAndConsumeState(state: string): { valid: boolean; userId?: string } {
  const data = pendingOAuthStates.get(state);
  
  if (!data) {
    logger.warn('[Dexcom] Invalid or expired OAuth state');
    return { valid: false };
  }
  
  // Check TTL
  if (Date.now() - data.createdAt > STATE_TTL_MS) {
    pendingOAuthStates.delete(state);
    logger.warn('[Dexcom] OAuth state expired');
    return { valid: false };
  }
  
  // Consume state (one-time use)
  pendingOAuthStates.delete(state);
  logger.debug(`[Dexcom] Validated OAuth state for user ${data.userId}`);
  return { valid: true, userId: data.userId };
}

interface DexcomTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

interface DexcomConnection {
  id: string;
  health_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  is_sandbox: boolean;
  connected_at: string;
  last_sync_at: string | null;
  sync_status: 'active' | 'error' | 'disconnected';
  error_message: string | null;
}

interface DexcomEGVRecord {
  systemTime: string;
  displayTime: string;
  value: number;
  realtimeValue: number;
  smoothedValue: number | null;
  status: string | null;
  trend: string;
  trendRate: number | null;
}

interface DexcomEGVResponse {
  unit: string;
  rateUnit: string;
  egvs: DexcomEGVRecord[];
}

export class DexcomService {
  private isSandbox: boolean;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.isSandbox = process.env.DEXCOM_SANDBOX === 'true';
    this.baseUrl = this.isSandbox 
      ? 'https://sandbox-api.dexcom.com'
      : 'https://api.dexcom.com';
    this.clientId = process.env.DEXCOM_CLIENT_ID || '';
    this.clientSecret = process.env.DEXCOM_CLIENT_SECRET || '';
    this.redirectUri = process.env.DEXCOM_REDIRECT_URI || 'https://get-flo.com/api/auth/dexcom/callback';
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'offline_access',
      state,
    });

    return `${this.baseUrl}/v2/oauth2/login?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<DexcomTokens> {
    const response = await fetch(`${this.baseUrl}/v2/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('[Dexcom] Token exchange failed:', { status: response.status, error });
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = await response.json();
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      token_type: data.token_type,
    };
  }

  async refreshTokens(refreshToken: string): Promise<DexcomTokens> {
    const response = await fetch(`${this.baseUrl}/v2/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('[Dexcom] Token refresh failed:', { status: response.status, error });
      throw new Error(`Failed to refresh tokens: ${error}`);
    }

    const data = await response.json();
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      token_type: data.token_type,
    };
  }

  async saveConnection(userId: string, tokens: DexcomTokens, scope: string = 'offline_access'): Promise<void> {
    const healthId = await getHealthId(userId);
    
    const { error } = await supabase
      .from('cgm_connections')
      .upsert({
        health_id: healthId,
        provider: 'dexcom',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        scope,
        is_sandbox: this.isSandbox,
        connected_at: new Date().toISOString(),
        sync_status: 'active',
        error_message: null,
      }, {
        onConflict: 'health_id,provider',
      });

    if (error) {
      logger.error('[Dexcom] Failed to save connection:', error);
      throw new Error('Failed to save Dexcom connection');
    }

    logger.info(`[Dexcom] Connection saved for health_id ${healthId}`);
  }

  async getConnection(userId: string): Promise<DexcomConnection | null> {
    const healthId = await getHealthId(userId);
    
    const { data, error } = await supabase
      .from('cgm_connections')
      .select('*')
      .eq('health_id', healthId)
      .eq('provider', 'dexcom')
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('[Dexcom] Failed to get connection:', error);
      throw error;
    }

    return data || null;
  }

  async deleteConnection(userId: string): Promise<void> {
    const healthId = await getHealthId(userId);
    
    const { error } = await supabase
      .from('cgm_connections')
      .delete()
      .eq('health_id', healthId)
      .eq('provider', 'dexcom');

    if (error) {
      logger.error('[Dexcom] Failed to delete connection:', error);
      throw error;
    }

    logger.info(`[Dexcom] Connection deleted for health_id ${healthId}`);
  }

  async updateConnectionStatus(healthId: string, status: 'active' | 'error' | 'disconnected', errorMessage?: string): Promise<void> {
    const { error } = await supabase
      .from('cgm_connections')
      .update({
        sync_status: status,
        error_message: errorMessage || null,
      })
      .eq('health_id', healthId)
      .eq('provider', 'dexcom');

    if (error) {
      logger.error('[Dexcom] Failed to update connection status:', error);
    }
  }

  async getValidAccessToken(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    
    if (!connection) {
      return null;
    }

    if (connection.sync_status === 'disconnected') {
      return null;
    }

    if (Date.now() < connection.expires_at - 60000) {
      return connection.access_token;
    }

    try {
      const tokens = await this.refreshTokens(connection.refresh_token);
      await this.saveConnection(userId, tokens, connection.scope);
      return tokens.access_token;
    } catch (error) {
      logger.error('[Dexcom] Failed to refresh token:', error);
      const healthId = await getHealthId(userId);
      await this.updateConnectionStatus(healthId, 'error', 'Token refresh failed');
      return null;
    }
  }

  // Format date to Dexcom's required format: YYYY-MM-DDThh:mm:ss (no milliseconds, no timezone)
  private formatDexcomDate(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, '');
  }

  async fetchEGVs(accessToken: string, startDate: Date, endDate: Date): Promise<DexcomEGVResponse | null> {
    const params = new URLSearchParams({
      startDate: this.formatDexcomDate(startDate),
      endDate: this.formatDexcomDate(endDate),
    });

    const response = await fetch(`${this.baseUrl}/v3/users/self/egvs?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('[Dexcom] Failed to fetch EGVs:', { status: response.status, error });
      
      if (response.status === 401 || response.status === 403) {
        throw new Error('UNAUTHORIZED');
      }
      
      return null;
    }

    return response.json();
  }

  async syncUserData(userId: string): Promise<{ success: boolean; recordsCount: number }> {
    const accessToken = await this.getValidAccessToken(userId);
    
    if (!accessToken) {
      logger.warn('[Dexcom] No valid access token for user');
      return { success: false, recordsCount: 0 };
    }

    const healthId = await getHealthId(userId);
    
    const { data: lastReading } = await supabase
      .from('cgm_readings')
      .select('recorded_at')
      .eq('health_id', healthId)
      .eq('source', 'dexcom')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    const endDate = new Date();
    const startDate = lastReading?.recorded_at 
      ? new Date(lastReading.recorded_at)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (startDate >= endDate) {
      return { success: true, recordsCount: 0 };
    }

    try {
      const egvData = await this.fetchEGVs(accessToken, startDate, endDate);
      
      if (!egvData || !egvData.egvs.length) {
        await supabase
          .from('cgm_connections')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('health_id', healthId)
          .eq('provider', 'dexcom');
        return { success: true, recordsCount: 0 };
      }

      const readings = egvData.egvs.map(egv => ({
        health_id: healthId,
        source: 'dexcom',
        glucose_value: egv.value,
        glucose_unit: egvData.unit,
        trend: this.mapDexcomTrend(egv.trend),
        trend_rate: egv.trendRate,
        recorded_at: egv.systemTime,
        display_time: egv.displayTime,
        is_sandbox: this.isSandbox,
      }));

      const { error } = await supabase
        .from('cgm_readings')
        .upsert(readings, {
          onConflict: 'health_id,source,recorded_at',
          ignoreDuplicates: true,
        });

      if (error) {
        logger.error('[Dexcom] Failed to save readings:', error);
        await this.updateConnectionStatus(healthId, 'error', 'Failed to save readings');
        return { success: false, recordsCount: 0 };
      }

      await supabase
        .from('cgm_connections')
        .update({ 
          last_sync_at: new Date().toISOString(),
          sync_status: 'active',
          error_message: null,
        })
        .eq('health_id', healthId)
        .eq('provider', 'dexcom');

      logger.info(`[Dexcom] Synced ${readings.length} readings for health_id ${healthId}`);
      return { success: true, recordsCount: readings.length };
    } catch (error: any) {
      logger.error('[Dexcom] Sync failed:', error);
      
      if (error.message === 'UNAUTHORIZED') {
        await this.updateConnectionStatus(healthId, 'error', 'Authorization failed - please reconnect');
      } else {
        await this.updateConnectionStatus(healthId, 'error', error.message);
      }
      
      return { success: false, recordsCount: 0 };
    }
  }

  private mapDexcomTrend(trend: string): string {
    const trendMap: Record<string, string> = {
      'none': 'none',
      'doubleUp': 'rising_rapidly',
      'singleUp': 'rising',
      'fortyFiveUp': 'rising_slowly',
      'flat': 'stable',
      'fortyFiveDown': 'falling_slowly',
      'singleDown': 'falling',
      'doubleDown': 'falling_rapidly',
      'notComputable': 'unknown',
      'rateOutOfRange': 'unknown',
    };
    return trendMap[trend] || 'unknown';
  }

  async getLatestReading(userId: string): Promise<any | null> {
    const healthId = await getHealthId(userId);
    
    const { data, error } = await supabase
      .from('cgm_readings')
      .select('*')
      .eq('health_id', healthId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('[Dexcom] Failed to get latest reading:', error);
      return null;
    }

    return data || null;
  }

  async getReadingsForRange(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const healthId = await getHealthId(userId);
    
    const { data, error } = await supabase
      .from('cgm_readings')
      .select('*')
      .eq('health_id', healthId)
      .gte('recorded_at', startDate.toISOString())
      .lte('recorded_at', endDate.toISOString())
      .order('recorded_at', { ascending: true });

    if (error) {
      logger.error('[Dexcom] Failed to get readings for range:', error);
      return [];
    }

    return data || [];
  }

  async calculateTimeInRange(userId: string, hours: number = 24): Promise<{
    inRange: number;
    low: number;
    veryLow: number;
    high: number;
    veryHigh: number;
    average: number | null;
    readingsCount: number;
  }> {
    const endDate = new Date();
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const readings = await this.getReadingsForRange(userId, startDate, endDate);
    
    if (!readings.length) {
      return {
        inRange: 0,
        low: 0,
        veryLow: 0,
        high: 0,
        veryHigh: 0,
        average: null,
        readingsCount: 0,
      };
    }

    let inRange = 0, low = 0, veryLow = 0, high = 0, veryHigh = 0;
    let sum = 0;

    for (const reading of readings) {
      const value = reading.glucose_value;
      sum += value;
      
      if (value < 54) veryLow++;
      else if (value < 70) low++;
      else if (value <= 180) inRange++;
      else if (value <= 250) high++;
      else veryHigh++;
    }

    const total = readings.length;
    
    return {
      inRange: Math.round((inRange / total) * 100),
      low: Math.round((low / total) * 100),
      veryLow: Math.round((veryLow / total) * 100),
      high: Math.round((high / total) * 100),
      veryHigh: Math.round((veryHigh / total) * 100),
      average: Math.round(sum / total),
      readingsCount: total,
    };
  }
}

export const dexcomService = new DexcomService();
