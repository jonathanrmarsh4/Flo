/**
 * Token Encryption Utilities
 * 
 * Provides AES-256-GCM encryption for OAuth tokens stored in the database.
 * Uses a secret key from environment variables for encryption/decryption.
 */

import crypto from 'crypto';
import { logger } from '../logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard IV length
const TAG_LENGTH = 16; // GCM auth tag length

/**
 * Get encryption key from environment
 * Must be a 32-byte (256-bit) key, hex encoded (64 characters)
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required for token encryption');
  }
  
  if (keyHex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Check if encryption is available
 */
export function isEncryptionConfigured(): boolean {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  return !!(key && key.length === 64);
}

/**
 * Verify encryption is configured in production environments
 * Call this during server startup to fail fast if misconfigured
 */
export function assertEncryptionConfigured(): void {
  const isProd = process.env.NODE_ENV === 'production' || 
                 process.env.REPL_SLUG !== undefined; // Running on Replit
  
  if (isProd && !isEncryptionConfigured()) {
    logger.warn('[TokenEncryption] WARNING: TOKEN_ENCRYPTION_KEY not configured');
    logger.warn('[TokenEncryption] OAuth tokens will be stored in PLAINTEXT');
    logger.warn('[TokenEncryption] Set TOKEN_ENCRYPTION_KEY (64 hex chars) for production use');
    // Don't throw - allow startup but warn loudly
  } else if (isEncryptionConfigured()) {
    logger.info('[TokenEncryption] Token encryption is enabled');
  }
}

/**
 * Encrypt a plaintext string
 * Returns base64-encoded ciphertext in format: iv:authTag:ciphertext
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    return plaintext;
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV, auth tag, and ciphertext
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted token
 * Expects format: iv:authTag:ciphertext (base64 encoded)
 */
export function decryptToken(encrypted: string): string {
  if (!encrypted) {
    return encrypted;
  }
  
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    logger.error('[TokenEncryption] Invalid encrypted format - missing parts');
    throw new Error('Invalid encrypted token format');
  }
  
  const [ivBase64, tagBase64, ciphertext] = parts;
  
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(tagBase64, 'base64');
  
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }
  
  if (authTag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Check if a token is already encrypted (has the expected format)
 */
export function isTokenEncrypted(token: string): boolean {
  if (!token) return false;
  const parts = token.split(':');
  return parts.length === 3;
}

/**
 * Generate a new encryption key (for setup)
 * Run this once to generate a key for TOKEN_ENCRYPTION_KEY environment variable
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
