import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { HealthSyncPlugin } from './healthSync';

// Wrapper to automatically include auth token
async function syncWithAuth(days: number, waitForAuth?: boolean) {
  try {
    // Get JWT token from secure storage (same key as queryClient uses)
    const { value: token } = await SecureStoragePlugin.get({ key: 'auth_token' });
    
    // Pass token to Swift plugin so it can authenticate with backend
    return await HealthSyncPlugin.syncReadinessData({ days, token: token || undefined, waitForAuth });
  } catch (error) {
    console.error('[Readiness] Failed to get auth token:', error);
    // Try without token (will fail but with better error message)
    return await HealthSyncPlugin.syncReadinessData({ days, waitForAuth });
  }
}

export default {
  syncReadinessData: (options: { days: number; waitForAuth?: boolean }) => 
    syncWithAuth(options.days, options.waitForAuth)
};
