import { registerPlugin } from '@capacitor/core';

export interface WebViewCachePlugin {
  /**
   * Clear all WKWebView cache and data (cookies, local storage, cache, etc.)
   */
  clearCache(): Promise<{ success: boolean; message: string }>;
  
  /**
   * Reload the webview from origin, bypassing all caches
   */
  reloadFromOrigin(): Promise<{ success: boolean; message: string }>;
}

const WebViewCache = registerPlugin<WebViewCachePlugin>('WebViewCachePlugin', {
  web: () => ({
    // Web implementation - no-op since cache clearing only applies to native
    clearCache: async () => ({ success: true, message: 'Cache clearing not needed on web' }),
    reloadFromOrigin: async () => {
      window.location.reload();
      return { success: true, message: 'Reloaded' };
    },
  }),
});

export default WebViewCache;
