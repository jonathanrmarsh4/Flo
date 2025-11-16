import Health from '@healthpilot/healthkit';

export interface ReadinessPlugin {
  syncReadinessData(options: { days: number }): Promise<{ success: boolean; days: number; message: string }>;
}

const Readiness: ReadinessPlugin = {
  async syncReadinessData(options: { days: number }) {
    try {
      const result = await (Health as any).syncReadinessData(options);
      return result as { success: boolean; days: number; message: string };
    } catch (error) {
      console.error('[Readiness] Sync error:', error);
      return { 
        success: false, 
        days: options.days, 
        message: error instanceof Error ? error.message : 'Unknown error during sync' 
      };
    }
  },
};

export default Readiness;
