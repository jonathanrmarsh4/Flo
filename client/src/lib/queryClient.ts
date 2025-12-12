import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';
import { logger } from './logger';

// Pre-load SecureStoragePlugin at module level to avoid JIT freeze on first API call
// This is imported statically but only used on native platforms
let SecureStoragePluginInstance: any = null;
let secureStorageLoadPromise: Promise<void> | null = null;

// PERFORMANCE FIX: Cache the auth token in memory to avoid repeated native bridge calls
// Each SecureStoragePlugin.get() blocks the JS thread for ~20-50ms
// When 10 queries run in parallel, that's 10 native calls = 200-500ms of freeze
let cachedAuthToken: string | null = null;
let tokenFetchPromise: Promise<string | null> | null = null;
let tokenCacheTime: number = 0;
const TOKEN_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes - token expiry is 7 days

// Check if we're in an iOS/Android WebView with native plugins available
// isNativePlatform() returns false when frontend is served from web URL (get-flo.com)
// but native plugins may still be available via the Capacitor bridge
function hasSecureStorageCapability(): boolean {
  // Check if Capacitor bridge is available (works even when isNativePlatform returns false)
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isPluginAvailable) {
    return (window as any).Capacitor.isPluginAvailable('SecureStoragePlugin');
  }
  // Fallback to platform check
  return Capacitor.isNativePlatform();
}

// Eagerly load the plugin if native capabilities are available
// CRITICAL: Store the promise so getAuthToken() can await it instead of re-importing
if (hasSecureStorageCapability() || Capacitor.isNativePlatform()) {
  secureStorageLoadPromise = import('capacitor-secure-storage-plugin').then(module => {
    SecureStoragePluginInstance = module.SecureStoragePlugin;
    console.log('[QueryClient] SecureStoragePlugin pre-loaded');
  }).catch(err => {
    console.warn('[QueryClient] Failed to pre-load SecureStoragePlugin:', err);
  });
}

// Get API base URL - use production URL for iOS/Android, relative for web
function getApiBaseUrl(): string {
  // Check if running in native app (iOS/Android)
  if (Capacitor.isNativePlatform()) {
    // PROD: Production domain
    return 'https://get-flo.com';
    // DEV: Uncomment this for local development
    // return 'https://7de3d6a7-d19a-4ca9-b491-86cd4eba9a01-00-36fnrwc0flg0z.picard.replit.dev';
  }
  // For web builds, use relative URLs (same origin)
  return '';
}

// Internal function to actually fetch token from secure storage (only called once per cache period)
async function fetchTokenFromSecureStorage(): Promise<string | null> {
  try {
    // Wait for the preload promise instead of triggering a new import
    if (secureStorageLoadPromise) {
      await secureStorageLoadPromise;
    }
    
    // If preload failed or plugin not available, do a fresh import as fallback
    if (!SecureStoragePluginInstance) {
      const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
      SecureStoragePluginInstance = SecureStoragePlugin;
    }
    
    const { value } = await SecureStoragePluginInstance.get({ key: 'auth_token' });
    if (value) {
      console.log('[AuthToken] Successfully retrieved token from secure storage');
    } else {
      console.log('[AuthToken] Token key exists but value is empty/null');
    }
    return value;
  } catch (error: any) {
    // Token not found or error reading secure storage
    console.log('[AuthToken] Failed to get token from secure storage:', error?.message || error);
    return null;
  }
}

// Get auth token from secure encrypted storage (mobile) or localStorage (web)
// PERFORMANCE FIX: Uses in-memory cache + singleton promise to dedupe concurrent requests
// Before: 10 parallel queries = 10 native bridge calls = 200-500ms freeze
// After: 10 parallel queries = 1 native bridge call = 20-50ms
export async function getAuthToken(): Promise<string | null> {
  // Use capability check instead of platform check - works when frontend is served from web URL
  const hasSecureStorage = hasSecureStorageCapability();
  
  if (hasSecureStorage) {
    const now = Date.now();
    
    // Return cached token if still valid
    if (cachedAuthToken && (now - tokenCacheTime) < TOKEN_CACHE_DURATION) {
      return cachedAuthToken;
    }
    
    // If a fetch is already in progress, wait for it (dedupes concurrent calls)
    if (tokenFetchPromise) {
      return tokenFetchPromise;
    }
    
    // Start a new fetch and store the promise for deduplication
    tokenFetchPromise = fetchTokenFromSecureStorage().then(token => {
      // BUGFIX: Only cache valid tokens, not null - otherwise we cache "no token" for 5 minutes
      // which causes 401 errors even after the user logs in
      if (token) {
        cachedAuthToken = token;
        tokenCacheTime = Date.now();
        return token;
      }
      // SecureStorage returned null - check localStorage as fallback
      // (token may have been stored there if SecureStorage wasn't available during login)
      const localToken = localStorage.getItem('auth_token');
      if (localToken) {
        cachedAuthToken = localToken;
        tokenCacheTime = Date.now();
        console.log('[AuthToken] Found token in localStorage fallback');
        return localToken;
      }
      tokenFetchPromise = null; // Clear the promise once resolved
      return null;
    }).catch(error => {
      // SecureStorage failed - check localStorage as fallback
      console.log('[AuthToken] SecureStorage error, checking localStorage:', error);
      const localToken = localStorage.getItem('auth_token');
      if (localToken) {
        cachedAuthToken = localToken;
        tokenCacheTime = Date.now();
        tokenFetchPromise = null;
        return localToken;
      }
      tokenFetchPromise = null; // Clear on error so next call can retry
      return null;
    });
    
    return tokenFetchPromise;
  }
  
  // For web, check localStorage for JWT token (from email/password login)
  const webToken = localStorage.getItem('auth_token');
  if (webToken) {
    return webToken;
  }
  // Fall back to session cookies automatically sent by the browser
  return null;
}

// Clear the cached token (call on logout or when token is refreshed)
export function clearCachedAuthToken(): void {
  cachedAuthToken = null;
  tokenCacheTime = 0;
  tokenFetchPromise = null;
  console.log('[AuthToken] Cache cleared');
}

// Update the cached token directly (call after successful login to avoid stale cache)
export function setCachedAuthToken(token: string): void {
  cachedAuthToken = token;
  tokenCacheTime = Date.now();
  tokenFetchPromise = null;
  console.log('[AuthToken] Cache updated with new token');
}

// Create authorization headers with JWT token for mobile
async function getAuthHeaders(additionalHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...additionalHeaders };
  
  const token = await getAuthToken();
  if (token) {
    logger.debug('Adding Authorization header with JWT token');
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    logger.debug('No auth token found, using session cookies');
  }
  
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    logger.error('API request failed', undefined, { status: res.status, response: text });
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const fullUrl = baseUrl + url;
  
  logger.debug('API request', { method, url: fullUrl });
  console.log('[API] Making request:', method, fullUrl); // ALWAYS log in prod
  
  try {
    const headers = await getAuthHeaders(
      data ? { "Content-Type": "application/json" } : {}
    );
    
    console.log('[API] Headers prepared:', Object.keys(headers)); // ALWAYS log in prod
    
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    console.log('[API] Response received:', res.status, res.statusText); // ALWAYS log in prod
    logger.debug('API response', { status: res.status, statusText: res.statusText });
    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error('[API] Request failed:', error); // ALWAYS log in prod
    logger.error('API request failed', error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiBaseUrl();
    const fullUrl = baseUrl + queryKey.join("/");
    
    const headers = await getAuthHeaders();
    
    const res = await fetch(fullUrl, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0, // Health data should always be fresh - refetch when queries are called
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Export helper functions for use in custom uploads/requests
export { getAuthHeaders, getApiBaseUrl };
