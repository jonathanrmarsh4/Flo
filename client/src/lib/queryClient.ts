import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';
import { logger } from './logger';

// Get API base URL - use production URL for iOS/Android, relative for web
function getApiBaseUrl(): string {
  // Check if running in native app (iOS/Android)
  if (Capacitor.isNativePlatform()) {
    // DEV: Use Replit dev domain
    return 'https://7de3d6a7-d19a-4ca9-b491-86cd4eba9a01-00-36fnrwc0flg0z.picard.replit.dev';
    // PROD: Uncomment this when deploying to production
    // return 'https://get-flo.com';
  }
  // For web builds, use relative URLs (same origin)
  return '';
}

// Get auth token from secure encrypted storage (mobile) or session cookie (web)
async function getAuthToken(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Dynamic import to avoid loading plugin on web
      const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
      const { value } = await SecureStoragePlugin.get({ key: 'auth_token' });
      logger.debug('Retrieved auth token from secure storage', { hasToken: !!value });
      return value;
    } catch (error) {
      // Token not found or error reading secure storage
      logger.debug('Failed to retrieve auth token', { error });
      return null;
    }
  }
  // For web, we rely on session cookies automatically sent by the browser
  return null;
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
  
  try {
    const headers = await getAuthHeaders(
      data ? { "Content-Type": "application/json" } : {}
    );
    
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    logger.debug('API response', { status: res.status, statusText: res.statusText });
    await throwIfResNotOk(res);
    return res;
  } catch (error) {
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Export helper functions for use in custom uploads/requests
export { getAuthHeaders, getApiBaseUrl };
