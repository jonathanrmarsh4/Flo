/**
 * HealthKit Service
 * 
 * Wrapper service for @healthpilot/healthkit plugin with error handling,
 * logging, and utility functions for working with Apple HealthKit data.
 */

import Health from '@healthpilot/healthkit';
import { logger } from '@/lib/logger';
import type {
  HealthDataType,
  HealthSample,
  SleepSample,
  AuthorizationStatus,
  ReadSamplesOptions,
  SaveSampleOptions,
  AuthorizationRequest,
} from '@/types/healthkit';

export class HealthKitService {
  /**
   * Check if HealthKit is available on the current device
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const result = await Health.isAvailable();
      logger.info('HealthKit availability checked', { available: result.available });
      return result.available;
    } catch (error) {
      logger.error('Error checking HealthKit availability', error);
      return false;
    }
  }

  /**
   * Request authorization to read/write health data
   */
  static async requestAuthorization(
    options: AuthorizationRequest
  ): Promise<AuthorizationStatus | null> {
    try {
      logger.info('Requesting HealthKit authorization', {
        readTypes: options.read.length,
        writeTypes: options.write.length,
      });

      const result = await Health.requestAuthorization(options);
      
      logger.info('HealthKit authorization granted', {
        readAuthorized: result.readAuthorized?.length || 0,
        writeAuthorized: result.writeAuthorized?.length || 0,
      });

      return result as AuthorizationStatus;
    } catch (error) {
      logger.error('Error requesting HealthKit authorization', error);
      return null;
    }
  }

  /**
   * Check current authorization status for read/write permissions
   */
  static async checkAuthorization(
    options: AuthorizationRequest
  ): Promise<AuthorizationStatus | null> {
    try {
      const result = await Health.checkAuthorization(options);
      return result as AuthorizationStatus;
    } catch (error) {
      logger.error('Error checking HealthKit authorization', error);
      return null;
    }
  }

  /**
   * Read quantity samples (e.g., steps, heart rate, weight)
   */
  static async readSamples(
    options: ReadSamplesOptions
  ): Promise<HealthSample[]> {
    try {
      logger.debug('Reading HealthKit samples', {
        dataType: options.dataType,
        startDate: options.startDate,
        endDate: options.endDate,
        limit: options.limit,
      });

      const result = await Health.readSamples(options);
      
      logger.info('HealthKit samples retrieved', {
        dataType: options.dataType,
        count: result.samples?.length || 0,
      });

      return result.samples as HealthSample[];
    } catch (error) {
      logger.error('Error reading HealthKit samples', error, {
        dataType: options.dataType,
      });
      return [];
    }
  }

  /**
   * Read category samples (e.g., sleep analysis)
   */
  static async readCategorySamples(
    options: ReadSamplesOptions
  ): Promise<SleepSample[]> {
    try {
      logger.debug('Reading HealthKit category samples', {
        dataType: options.dataType,
        startDate: options.startDate,
        endDate: options.endDate,
      });

      const result = await Health.readCategorySamples(options);
      
      logger.info('HealthKit category samples retrieved', {
        dataType: options.dataType,
        count: result.samples?.length || 0,
      });

      return result.samples as SleepSample[];
    } catch (error) {
      logger.error('Error reading HealthKit category samples', error, {
        dataType: options.dataType,
      });
      return [];
    }
  }

  /**
   * Save a health sample to HealthKit
   */
  static async saveSample(options: SaveSampleOptions): Promise<boolean> {
    try {
      logger.debug('Saving HealthKit sample', {
        dataType: options.dataType,
        value: options.value,
        unit: options.unit,
      });

      await Health.saveSample(options);
      
      logger.info('HealthKit sample saved', {
        dataType: options.dataType,
        value: options.value,
      });

      return true;
    } catch (error) {
      logger.error('Error saving HealthKit sample', error, {
        dataType: options.dataType,
      });
      return false;
    }
  }

  /**
   * Get the plugin version
   */
  static async getPluginVersion(): Promise<string> {
    try {
      const result = await Health.getPluginVersion();
      return result.version;
    } catch (error) {
      logger.error('Error getting HealthKit plugin version', error);
      return 'unknown';
    }
  }

  /**
   * Get the most recent sample for a data type
   */
  static async getMostRecentSample(
    dataType: HealthDataType
  ): Promise<HealthSample | null> {
    const samples = await this.readSamples({
      dataType,
      limit: 1,
      ascending: false, // Most recent first
    });

    return samples.length > 0 ? samples[0] : null;
  }

  /**
   * Get samples for a date range (last N days)
   */
  static async getSamplesForLastDays(
    dataType: HealthDataType,
    days: number,
    limit?: number
  ): Promise<HealthSample[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.readSamples({
      dataType,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit,
      ascending: false,
    });
  }

  /**
   * Get average value for a data type over the last N days
   */
  static async getAverageForLastDays(
    dataType: HealthDataType,
    days: number
  ): Promise<number | null> {
    const samples = await this.getSamplesForLastDays(dataType, days);
    
    if (samples.length === 0) {
      return null;
    }

    const sum = samples.reduce((acc, sample) => acc + sample.value, 0);
    return sum / samples.length;
  }
}
