import { registerPlugin } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

export interface ReadinessPlugin {
  syncReadinessData(options: { days: number; token?: string }): Promise<{ success: boolean; days: number; message: string }>;
}

const Readiness = registerPlugin<ReadinessPlugin>('HealthSyncPlugin', {
  web: () => ({
    async syncReadinessData(options: { days: number }) {
      console.log('[HealthSync Web] Mock auto-sync called with days:', options.days);
      return { 
        success: true, 
        days: options.days, 
        message: 'Web mock - automatic readiness sync not available on web' 
      };
    },
  }),
});

// Wrapper to automatically include auth token
async function syncWithAuth(days: number) {
  try {
    // Get JWT token from secure storage
    const { value: token } = await SecureStoragePlugin.get({ key: 'authToken' });
    
    // Pass token to Swift plugin
    return await Readiness.syncReadinessData({ days, token });
  } catch (error) {
    console.error('[Readiness] Failed to get auth token:', error);
    // Try without token (will fail but with better error message)
    return await Readiness.syncReadinessData({ days });
  }
}

export default {
  syncReadinessData: (options: { days: number }) => syncWithAuth(options.days)
};
