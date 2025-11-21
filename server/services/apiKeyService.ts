import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { apiKeys } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';

/**
 * API Key Service for iOS Shortcuts and External Integrations
 * 
 * Manages secure API key generation, validation, and lifecycle
 * Keys are hashed using bcrypt before storage (like passwords)
 */

const API_KEY_PREFIX = 'flo_';
const API_KEY_LENGTH = 32; // Random bytes (will be hex-encoded to 64 chars)

/**
 * Generate a new API key for a user
 * Returns the plaintext key (show to user once) and stores hash in DB
 */
export async function generateApiKey(userId: string): Promise<string> {
  try {
    // Generate cryptographically secure random key
    const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
    const plainKey = `${API_KEY_PREFIX}${randomBytes.toString('hex')}`;
    
    // Hash the key before storage
    const keyHash = await bcrypt.hash(plainKey, 10);
    
    // Check if user already has a key
    const existing = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.userId, userId),
    });
    
    if (existing) {
      // Update existing key
      await db.update(apiKeys)
        .set({ 
          keyHash,
          createdAt: new Date(),
          lastUsedAt: null, // Reset usage tracking
        })
        .where(eq(apiKeys.userId, userId));
      
      logger.info(`[ApiKey] Regenerated API key for user ${userId}`);
    } else {
      // Create new key
      await db.insert(apiKeys).values({
        userId,
        keyHash,
        name: 'Personal API Key',
      });
      
      logger.info(`[ApiKey] Generated new API key for user ${userId}`);
    }
    
    return plainKey;
  } catch (error) {
    logger.error('[ApiKey] Failed to generate API key:', error);
    throw new Error('Failed to generate API key');
  }
}

/**
 * Validate an API key and return the associated user ID
 * Also updates lastUsedAt timestamp
 */
export async function validateApiKey(plainKey: string): Promise<string | null> {
  try {
    if (!plainKey || !plainKey.startsWith(API_KEY_PREFIX)) {
      return null;
    }
    
    // Get all API keys (there should be very few)
    const allKeys = await db.query.apiKeys.findMany();
    
    // Check each key hash
    for (const keyRecord of allKeys) {
      const isValid = await bcrypt.compare(plainKey, keyRecord.keyHash);
      
      if (isValid) {
        // Update last used timestamp
        await db.update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, keyRecord.id));
        
        logger.info(`[ApiKey] Valid API key used for user ${keyRecord.userId}`);
        return keyRecord.userId;
      }
    }
    
    logger.warn('[ApiKey] Invalid API key attempted');
    return null;
  } catch (error) {
    logger.error('[ApiKey] Error validating API key:', error);
    return null;
  }
}

/**
 * Get API key info for a user (without revealing the key)
 */
export async function getApiKeyInfo(userId: string) {
  const keyRecord = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.userId, userId),
  });
  
  if (!keyRecord) {
    return null;
  }
  
  return {
    id: keyRecord.id,
    name: keyRecord.name,
    createdAt: keyRecord.createdAt,
    lastUsedAt: keyRecord.lastUsedAt,
  };
}

/**
 * Revoke (delete) API key for a user
 */
export async function revokeApiKey(userId: string): Promise<boolean> {
  try {
    const result = await db.delete(apiKeys)
      .where(eq(apiKeys.userId, userId));
    
    logger.info(`[ApiKey] Revoked API key for user ${userId}`);
    return true;
  } catch (error) {
    logger.error('[ApiKey] Failed to revoke API key:', error);
    return false;
  }
}
