import { registerPlugin } from '@capacitor/core';

export interface ReadinessPlugin {
  syncReadinessData(options: { days: number }): Promise<{ success: boolean; days: number; message: string }>;
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

export default Readiness;
