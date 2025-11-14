import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';

// Get API base URL - use production URL for iOS/Android, relative for web
function getApiBaseUrl(): string {
  // Check if running in native app (iOS/Android)
  if (Capacitor.isNativePlatform()) {
    return 'https://get-flo.com';
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
      return value;
    } catch (error) {
      // Token not found or error reading secure storage
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
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    console.error('[API Error] Status:', res.status);
    console.error('[API Error] Response:', text);
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
  
  console.log(`[API Request] ${method} ${fullUrl}`);
  
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

    console.log(`[API Response] ${res.status} ${res.statusText}`);
    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error('[API Request Failed]', error);
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
