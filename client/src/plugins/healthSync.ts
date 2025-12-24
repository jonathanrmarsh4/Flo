import { registerPlugin } from '@capacitor/core';

export interface HealthSyncPluginType {
  requestAuthorization(): Promise<{
    success: boolean;
    readAuthorized: string[];
    readDenied: string[];
    writeAuthorized: string[];
    writeDenied: string[];
  }>;
  syncReadinessData(options: { days: number; token?: string; waitForAuth?: boolean }): Promise<{
    success: boolean;
    message: string;
    days: number;
  }>;
  syncNutritionData(options: { days: number; token?: string }): Promise<{
    success: boolean;
    message: string;
    days: number;
  }>;
  syncMindfulnessData(options: { days: number; token?: string }): Promise<{
    success: boolean;
    message: string;
    days: number;
  }>;
  syncSleepData(options: { days: number; token?: string }): Promise<{
    success: boolean;
    message: string;
    days: number;
  }>;
  syncWorkouts(options: { days: number; token?: string }): Promise<{
    success: boolean;
    message: string;
    days: number;
  }>;
  clearAuthToken(): Promise<{
    success: boolean;
  }>;
}

export const HealthSyncPlugin = registerPlugin<HealthSyncPluginType>('HealthSyncPlugin');
