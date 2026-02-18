/**
 * Integrations Service
 * 
 * Manages external health data source integrations (Oura, Dexcom, etc.)
 * Handles OAuth flows, token management, and integration CRUD operations.
 * 
 * Security:
 * - OAuth tokens are encrypted with AES-256-GCM before storage
 * - OAuth state is stored in database (not in-memory) for multi-instance support
 * - State tokens expire after 10 minutes
 */

import { db } from '../db';
import { userIntegrations, sessions } from '@shared/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { AVAILABLE_INTEGRATIONS } from '@shared/dataSource';
import type { UserIntegration, InsertUserIntegration } from '@shared/schema';
import { encryptToken, decryptToken, isEncryptionConfigured } from '../utils/tokenEncryption';
import crypto from 'crypto';
import { logger } from '../logger';

type IntegrationProvider = 'oura' | 'dexcom';

// OAuth state stored in database for durability across restarts
// We use the sessions table's metadata field for this
interface OAuthStateData {
  userId: string;
  provider: string;
  createdAt: number;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Get all integrations for a user
 */
export async function getUserIntegrations(userId: string): Promise<UserIntegration[]> {
  const integrations = await db.query.userIntegrations.findMany({
    where: eq(userIntegrations.userId, userId),
  });
  return integrations;
}

/**
 * Get a specific integration for a user
 */
export async function getUserIntegration(
  userId: string, 
  provider: IntegrationProvider
): Promise<UserIntegration | undefined> {
  const integration = await db.query.userIntegrations.findFirst({
    where: and(
      eq(userIntegrations.userId, userId),
      eq(userIntegrations.provider, provider)
    ),
  });
  return integration;
}

/**
 * Create or update an integration
 */
export async function upsertIntegration(
  userId: string,
  provider: IntegrationProvider,
  data: Partial<InsertUserIntegration>
): Promise<UserIntegration> {
  const existing = await getUserIntegration(userId, provider);
  
  if (existing) {
    const [updated] = await db
      .update(userIntegrations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(userIntegrations)
      .values({
        userId,
        provider,
        ...data,
      })
      .returning();
    return created;
  }
}

/**
 * Delete an integration
 */
export async function deleteIntegration(
  userId: string, 
  provider: IntegrationProvider
): Promise<void> {
  await db
    .delete(userIntegrations)
    .where(and(
      eq(userIntegrations.userId, userId),
      eq(userIntegrations.provider, provider)
    ));
}

/**
 * Generate OAuth authorization URL for a provider
 */
export function getOAuthAuthorizationUrl(
  provider: IntegrationProvider,
  state: string
): string {
  const config = AVAILABLE_INTEGRATIONS.find(i => i.id === provider);
  if (!config) {
    throw new Error(`Unknown integration provider: ${provider}`);
  }
  
  const clientId = getClientId(provider);
  const redirectUri = getRedirectUri(provider);
  const scopes = config.scopes.join(' ');
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
  });
  
  return `${config.oauthUrl}?${params.toString()}`;
}

/**
 * Exchange OAuth authorization code for tokens
 */
export async function exchangeCodeForTokens(
  provider: IntegrationProvider,
  code: string
): Promise<OAuthTokenResponse> {
  const config = AVAILABLE_INTEGRATIONS.find(i => i.id === provider);
  if (!config) {
    throw new Error(`Unknown integration provider: ${provider}`);
  }
  
  const clientId = getClientId(provider);
  const clientSecret = getClientSecret(provider);
  const redirectUri = getRedirectUri(provider);
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error(`[IntegrationsService] Token exchange failed for ${provider}:`, error);
    throw new Error(`Failed to exchange authorization code: ${error}`);
  }
  
  const tokens: OAuthTokenResponse = await response.json();
  return tokens;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  provider: IntegrationProvider,
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const config = AVAILABLE_INTEGRATIONS.find(i => i.id === provider);
  if (!config) {
    throw new Error(`Unknown integration provider: ${provider}`);
  }
  
  const clientId = getClientId(provider);
  const clientSecret = getClientSecret(provider);
  
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error(`[IntegrationsService] Token refresh failed for ${provider}:`, error);
    throw new Error(`Failed to refresh token: ${error}`);
  }
  
  const tokens: OAuthTokenResponse = await response.json();
  return tokens;
}

/**
 * Store OAuth tokens for an integration
 */
export async function storeTokens(
  userId: string,
  provider: IntegrationProvider,
  tokens: OAuthTokenResponse
): Promise<UserIntegration> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  
  // Encrypt tokens before storage
  let encryptedAccessToken = tokens.access_token;
  let encryptedRefreshToken = tokens.refresh_token;
  
  if (isEncryptionConfigured()) {
    encryptedAccessToken = encryptToken(tokens.access_token);
    encryptedRefreshToken = encryptToken(tokens.refresh_token);
    logger.info(`[IntegrationsService] Tokens encrypted for ${provider}`);
  } else {
    logger.warn(`[IntegrationsService] TOKEN_ENCRYPTION_KEY not configured - storing tokens in plaintext (not recommended for production)`);
  }
  
  return upsertIntegration(userId, provider, {
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    tokenExpiresAt: expiresAt,
    tokenScope: tokens.scope,
    status: 'connected',
    connectedAt: new Date(),
    lastSyncError: null,
  });
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getValidAccessToken(
  userId: string,
  provider: IntegrationProvider
): Promise<string | null> {
  const integration = await getUserIntegration(userId, provider);
  
  if (!integration || integration.status === 'not_connected') {
    return null;
  }
  
  // Check if token is expired or about to expire (5 min buffer)
  const now = new Date();
  const expiresAt = integration.tokenExpiresAt;
  const buffer = 5 * 60 * 1000; // 5 minutes
  
  if (expiresAt && expiresAt.getTime() - buffer > now.getTime() && integration.accessToken) {
    // Decrypt token before returning
    try {
      if (isEncryptionConfigured()) {
        return decryptToken(integration.accessToken);
      }
      return integration.accessToken;
    } catch (error) {
      logger.error(`[IntegrationsService] Failed to decrypt access token:`, error);
      return null;
    }
  }
  
  // Token is expired or expiring soon, try to refresh
  if (!integration.refreshToken) {
    await upsertIntegration(userId, provider, {
      status: 'expired',
      lastSyncError: 'Refresh token missing - please reconnect',
    });
    return null;
  }
  
  try {
    // Decrypt refresh token before using it
    let refreshTokenToUse = integration.refreshToken;
    if (isEncryptionConfigured()) {
      try {
        refreshTokenToUse = decryptToken(integration.refreshToken);
      } catch (decryptError) {
        logger.error(`[IntegrationsService] Failed to decrypt refresh token:`, decryptError);
        await upsertIntegration(userId, provider, {
          status: 'error',
          lastSyncError: 'Token decryption failed - please reconnect',
        });
        return null;
      }
    }
    
    const newTokens = await refreshAccessToken(provider, refreshTokenToUse);
    await storeTokens(userId, provider, newTokens);
    return newTokens.access_token;
  } catch (error) {
    logger.error(`[IntegrationsService] Failed to refresh token for ${provider}:`, error);
    await upsertIntegration(userId, provider, {
      status: 'expired',
      lastSyncError: 'Token refresh failed - please reconnect',
    });
    return null;
  }
}

/**
 * Update last sync status
 * @param statusOverride - Override the calculated status (for auth errors use 'expired')
 */
export async function updateSyncStatus(
  userId: string,
  provider: IntegrationProvider,
  success: boolean,
  error?: string,
  cursor?: string,
  statusOverride?: 'connected' | 'error' | 'expired'
): Promise<void> {
  // Determine status: success = connected, failure = error (or override)
  let status: 'connected' | 'error' | 'expired' = 'connected';
  if (!success) {
    status = statusOverride || 'error';
  }
  
  await upsertIntegration(userId, provider, {
    lastSyncAt: new Date(),
    lastSyncError: success ? null : (error || 'Unknown error'),
    syncCursor: cursor,
    status,
  });
}

// Helper functions for secrets
function getClientId(provider: IntegrationProvider): string {
  const envVar = `${provider.toUpperCase()}_CLIENT_ID`;
  const clientId = process.env[envVar];
  if (!clientId) {
    throw new Error(`Missing environment variable: ${envVar}`);
  }
  return clientId;
}

function getClientSecret(provider: IntegrationProvider): string {
  const envVar = `${provider.toUpperCase()}_CLIENT_SECRET`;
  const secret = process.env[envVar];
  if (!secret) {
    throw new Error(`Missing environment variable: ${envVar}`);
  }
  return secret;
}

function getRedirectUri(provider: IntegrationProvider): string {
  // Production URL takes priority for OAuth (must match Oura portal config)
  const baseUrl = process.env.PRODUCTION_URL 
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || 'http://localhost:5000';
  return `${baseUrl}/api/integrations/${provider}/callback`;
}

/**
 * Generate a random state token for OAuth
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ===== Database-backed OAuth State Storage =====
// OAuth states are hashed before storage to prevent token leakage
// Database is the single source of truth (no memory fallback)

const OAUTH_STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Hash a state token before storage for security
 * Uses SHA-256 to prevent state exposure if database is compromised
 */
function hashState(state: string): string {
  return crypto.createHash('sha256').update(state).digest('hex');
}

/**
 * Store OAuth state (database-backed, hashed)
 * State is hashed before storage to prevent exposure
 */
export async function storeOAuthState(
  state: string,
  userId: string,
  provider: IntegrationProvider
): Promise<void> {
  const hashedState = hashState(state);
  const expiry = Date.now() + OAUTH_STATE_EXPIRY_MS;
  
  // Persist to database via integration record
  // Store hashed state with expiry timestamp
  await upsertIntegration(userId, provider, {
    status: 'not_connected',
    lastSyncError: `oauth_state:${hashedState}:${expiry}`, // Hash + expiry
  });
  
  logger.info(`[IntegrationsService] Stored hashed OAuth state for ${provider}`);
}

/**
 * Validate and consume OAuth state (one-time use, database only)
 * No memory fallback - database is single source of truth
 */
export async function validateAndConsumeOAuthState(
  state: string,
  expectedProvider: IntegrationProvider
): Promise<{ userId: string; provider: string } | null> {
  const hashedState = hashState(state);
  const now = Date.now();
  
  // Database lookup only - no memory fallback for security
  try {
    // Find integration with matching hashed state
    const integrations = await db.query.userIntegrations.findMany({
      where: eq(userIntegrations.provider, expectedProvider),
    });
    
    // Look for matching state with valid expiry
    for (const integration of integrations) {
      const stateField = integration.lastSyncError;
      if (!stateField?.startsWith('oauth_state:')) continue;
      
      const parts = stateField.split(':');
      if (parts.length !== 3) continue;
      
      const [, storedHash, expiryStr] = parts;
      const expiry = parseInt(expiryStr, 10);
      
      // Check hash match and expiry
      if (storedHash === hashedState) {
        // Clear the state immediately (consume it)
        await db
          .update(userIntegrations)
          .set({ lastSyncError: null })
          .where(eq(userIntegrations.id, integration.id));
        
        // Check if expired
        if (expiry < now) {
          logger.warn(`[IntegrationsService] OAuth state expired`);
          return null;
        }
        
        logger.info(`[IntegrationsService] Validated OAuth state from database`);
        return { userId: integration.userId, provider: integration.provider };
      }
    }
    
    logger.warn(`[IntegrationsService] OAuth state not found`);
    return null;
  } catch (error) {
    logger.error(`[IntegrationsService] Failed to validate state:`, error);
    return null;
  }
}
