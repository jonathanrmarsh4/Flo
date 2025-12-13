/**
 * Integrations API Routes
 * 
 * Handles OAuth flows, integration management, and data sync for external health data sources.
 * 
 * Security:
 * - OAuth state is stored in database for durability across restarts
 * - OAuth tokens are encrypted before storage (AES-256-GCM)
 * - State tokens are consumed on use (one-time only)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { isAuthenticated } from '../replitAuth';
import * as integrationsService from '../services/integrationsService';
import * as ouraApiClient from '../services/ouraApiClient';
import { getHealthId, upsertSleepNight } from '../services/supabaseHealthStorage';

const router = Router();

/**
 * GET /api/integrations
 * Get all integrations for the current user
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const integrations = await integrationsService.getUserIntegrations(userId);
    
    // Remove sensitive token data from response
    const safeIntegrations = integrations.map(i => ({
      ...i,
      accessToken: undefined,
      refreshToken: undefined,
    }));
    
    res.json(safeIntegrations);
  } catch (error: any) {
    console.error('[IntegrationsAPI] Failed to get integrations:', error);
    res.status(500).json({ error: 'Failed to load integrations' });
  }
});

/**
 * POST /api/integrations/:provider/connect
 * Initiate OAuth flow for a provider
 */
router.post('/:provider/connect', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user?.id;
    const { provider } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (provider !== 'oura' && provider !== 'dexcom') {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    
    // Check if OAuth credentials are configured
    const clientIdEnv = `${provider.toUpperCase()}_CLIENT_ID`;
    if (!process.env[clientIdEnv]) {
      return res.status(503).json({ 
        error: `${provider} integration is not configured. Please contact support.` 
      });
    }
    
    // Generate state token
    const state = integrationsService.generateOAuthState();
    
    // Store state in database (persists across restarts, multi-instance safe)
    await integrationsService.storeOAuthState(state, userId, provider as 'oura' | 'dexcom');
    
    // Generate authorization URL
    const authUrl = integrationsService.getOAuthAuthorizationUrl(
      provider as 'oura' | 'dexcom',
      state
    );
    
    res.json({ authUrl });
  } catch (error: any) {
    console.error('[IntegrationsAPI] Failed to initiate OAuth:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate connection' });
  }
});

/**
 * GET /api/integrations/:provider/callback
 * OAuth callback handler
 */
router.get('/:provider/callback', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { code, state, error: oauthError } = req.query;
    
    // Handle OAuth errors
    if (oauthError) {
      console.error(`[IntegrationsAPI] OAuth error for ${provider}:`, oauthError);
      return res.redirect(`/profile?integration_error=${encodeURIComponent(String(oauthError))}`);
    }
    
    if (!code || !state) {
      return res.redirect('/profile?integration_error=missing_params');
    }
    
    // Verify and consume state from database (one-time use)
    const stateData = await integrationsService.validateAndConsumeOAuthState(
      String(state),
      provider as 'oura' | 'dexcom'
    );
    
    if (!stateData) {
      console.warn(`[IntegrationsAPI] Invalid or expired OAuth state for ${provider}`);
      return res.redirect('/profile?integration_error=invalid_state');
    }
    
    // Exchange code for tokens
    const tokens = await integrationsService.exchangeCodeForTokens(
      provider as 'oura' | 'dexcom',
      String(code)
    );
    
    // Store tokens (encrypted)
    await integrationsService.storeTokens(
      stateData.userId,
      provider as 'oura' | 'dexcom',
      tokens
    );
    
    console.log(`[IntegrationsAPI] Successfully connected ${provider} for user ${stateData.userId}`);
    
    // Redirect to profile with success message
    res.redirect('/profile?integration_success=' + provider);
  } catch (error: any) {
    console.error('[IntegrationsAPI] OAuth callback failed:', error);
    res.redirect(`/profile?integration_error=${encodeURIComponent(error.message || 'callback_failed')}`);
  }
});

/**
 * DELETE /api/integrations/:provider
 * Disconnect an integration
 */
router.delete('/:provider', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user?.id;
    const { provider } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (provider !== 'oura' && provider !== 'dexcom') {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    
    await integrationsService.deleteIntegration(userId, provider as 'oura' | 'dexcom');
    
    console.log(`[IntegrationsAPI] Disconnected ${provider} for user ${userId}`);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[IntegrationsAPI] Failed to disconnect:', error);
    res.status(500).json({ error: 'Failed to disconnect integration' });
  }
});

/**
 * POST /api/integrations/:provider/sync
 * Manually trigger data sync for an integration
 */
router.post('/:provider/sync', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user?.id;
    const { provider } = req.params;
    
    console.log(`[IntegrationsAPI] Manual sync triggered for provider: ${provider}, userId: ${userId}`);
    
    if (!userId) {
      console.log('[IntegrationsAPI] Sync rejected - no userId');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get healthId from Supabase mapping
    const healthId = await getHealthId(userId);
    console.log(`[IntegrationsAPI] Got healthId: ${healthId} for userId: ${userId}`);
    
    if (provider !== 'oura' && provider !== 'dexcom') {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    
    // Check if integration exists and is connected
    const integration = await integrationsService.getUserIntegration(userId, provider as 'oura' | 'dexcom');
    console.log(`[IntegrationsAPI] Integration status: ${integration?.status}, tokenExpiry: ${integration?.tokenExpiresAt}`);
    
    if (!integration || integration.status === 'not_connected') {
      console.log(`[IntegrationsAPI] Integration not connected for ${provider}`);
      return res.status(400).json({ error: 'Integration not connected' });
    }
    
    if (provider === 'oura') {
      console.log(`[IntegrationsAPI] Starting Oura sync for user ${userId}...`);
      // Sync Oura data
      const result = await ouraApiClient.syncOuraData(userId, healthId, 7);
      
      if (!result.success) {
        console.log(`[IntegrationsAPI] Oura sync failed: ${result.error}`);
        return res.status(500).json({ error: result.error || 'Sync failed' });
      }
      
      console.log(`[IntegrationsAPI] Oura API returned ${result.sleepNights.length} sleep nights`);
      
      // Store sleep nights in Supabase
      for (const night of result.sleepNights) {
        console.log(`[IntegrationsAPI] Storing sleep night for date: ${night.sleepDate}, totalSleep: ${night.totalSleepMin}min`);
        try {
          await upsertSleepNight(userId, {
            sleep_date: night.sleepDate,
            timezone: night.timezone,
            night_start: night.nightStart || null,
            final_wake: night.finalWake || null,
            sleep_onset: night.sleepOnset || null,
            time_in_bed_min: night.timeInBedMin,
            total_sleep_min: night.totalSleepMin,
            sleep_efficiency_pct: night.sleepEfficiencyPct,
            sleep_latency_min: night.sleepLatencyMin,
            waso_min: night.wasoMin,
            num_awakenings: night.numAwakenings,
            core_sleep_min: night.coreSleepMin,
            deep_sleep_min: night.deepSleepMin,
            rem_sleep_min: night.remSleepMin,
            resting_hr_bpm: night.restingHrBpm,
            hrv_ms: night.hrvMs,
            respiratory_rate: night.respiratoryRate,
            source: 'oura',
            oura_session_id: night.ouraSessionId,
          });
        } catch (err) {
          console.error('[IntegrationsAPI] Failed to store sleep night:', err);
        }
      }
      
      console.log(`[IntegrationsAPI] Synced ${result.sleepNights.length} sleep nights from Oura for user ${userId}`);
      
      res.json({ 
        success: true, 
        message: `Synced ${result.sleepNights.length} sleep records`,
        count: result.sleepNights.length,
      });
    } else {
      // Dexcom sync - to be implemented
      res.status(501).json({ error: 'Dexcom sync not yet implemented' });
    }
  } catch (error: any) {
    console.error('[IntegrationsAPI] Sync failed:', error);
    res.status(500).json({ error: error.message || 'Sync failed' });
  }
});

/**
 * GET /api/integrations/:provider/status
 * Get detailed status for a specific integration
 */
router.get('/:provider/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user?.id;
    const { provider } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (provider !== 'oura' && provider !== 'dexcom') {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    
    const integration = await integrationsService.getUserIntegration(userId, provider as 'oura' | 'dexcom');
    
    if (!integration) {
      return res.json({ status: 'not_connected' });
    }
    
    // Get additional info for connected integrations
    let userInfo = null;
    if (integration.status === 'connected' && provider === 'oura') {
      userInfo = await ouraApiClient.getOuraUserInfo(userId);
    }
    
    res.json({
      status: integration.status,
      enabled: integration.enabled,
      connectedAt: integration.connectedAt,
      lastSyncAt: integration.lastSyncAt,
      lastSyncError: integration.lastSyncError,
      userInfo: userInfo ? {
        email: userInfo.email,
        age: userInfo.age,
      } : null,
    });
  } catch (error: any) {
    console.error('[IntegrationsAPI] Failed to get status:', error);
    res.status(500).json({ error: 'Failed to get integration status' });
  }
});

export default router;
