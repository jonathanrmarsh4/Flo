/**
 * HealthKit Integration Types
 * 
 * This file defines TypeScript types for the @healthpilot/healthkit plugin
 * which supports 26 different health data types from Apple HealthKit.
 */

export type HealthDataType =
  | 'steps'
  | 'distance'
  | 'calories'
  | 'heartRate'
  | 'weight'
  | 'heartRateVariability'
  | 'restingHeartRate'
  | 'bloodPressureSystolic'
  | 'bloodPressureDiastolic'
  | 'oxygenSaturation'
  | 'respiratoryRate'
  | 'height'
  | 'bmi'
  | 'bodyFatPercentage'
  | 'leanBodyMass'
  | 'basalEnergyBurned'
  | 'flightsClimbed'
  | 'bloodGlucose'
  | 'bodyTemperature'
  | 'vo2Max'
  | 'walkingHeartRateAverage'
  | 'waistCircumference'
  | 'dietaryWater'
  | 'appleExerciseTime'
  | 'appleStandTime'
  | 'sleepAnalysis';

export interface HealthSample {
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  metadata?: Record<string, string>;
}

export interface SleepSample {
  value: number; // Sleep category value
  categoryValue: number;
  startDate: string;
  endDate: string;
  metadata?: Record<string, string>;
}

export interface AuthorizationStatus {
  readAuthorized: HealthDataType[];
  readDenied: HealthDataType[];
  writeAuthorized: HealthDataType[];
  writeDenied: HealthDataType[];
}

export interface ReadSamplesOptions {
  dataType: HealthDataType;
  startDate?: string; // ISO 8601 format
  endDate?: string; // ISO 8601 format
  limit?: number;
  ascending?: boolean;
}

export interface SaveSampleOptions {
  dataType: HealthDataType;
  value: number;
  unit?: string;
  startDate?: string; // ISO 8601 format
  endDate?: string; // ISO 8601 format
  metadata?: Record<string, string>;
}

export interface AuthorizationRequest {
  read: HealthDataType[];
  write: HealthDataType[];
}

export const HEALTH_DATA_TYPE_INFO: Record<HealthDataType, { unit: string; description: string }> = {
  steps: { unit: 'count', description: 'Step count' },
  distance: { unit: 'meter', description: 'Walking/running distance' },
  calories: { unit: 'kilocalorie', description: 'Active energy burned' },
  heartRate: { unit: 'bpm', description: 'Heart rate' },
  weight: { unit: 'kilogram', description: 'Body weight' },
  heartRateVariability: { unit: 'ms', description: 'Heart rate variability SDNN' },
  restingHeartRate: { unit: 'bpm', description: 'Resting heart rate' },
  bloodPressureSystolic: { unit: 'mmHg', description: 'Systolic blood pressure' },
  bloodPressureDiastolic: { unit: 'mmHg', description: 'Diastolic blood pressure' },
  oxygenSaturation: { unit: 'percent', description: 'Blood oxygen saturation' },
  respiratoryRate: { unit: 'bpm', description: 'Respiratory rate' },
  height: { unit: 'meter', description: 'Body height' },
  bmi: { unit: 'count', description: 'Body mass index' },
  bodyFatPercentage: { unit: 'percent', description: 'Body fat percentage' },
  leanBodyMass: { unit: 'kilogram', description: 'Lean body mass' },
  basalEnergyBurned: { unit: 'kilocalorie', description: 'Basal energy burned' },
  flightsClimbed: { unit: 'count', description: 'Flights of stairs climbed' },
  bloodGlucose: { unit: 'mg/dL', description: 'Blood glucose level' },
  bodyTemperature: { unit: 'degC', description: 'Body temperature' },
  vo2Max: { unit: 'mL/kg/min', description: 'VO2 max' },
  walkingHeartRateAverage: { unit: 'bpm', description: 'Average walking heart rate' },
  waistCircumference: { unit: 'meter', description: 'Waist circumference' },
  dietaryWater: { unit: 'mL', description: 'Water intake' },
  appleExerciseTime: { unit: 'min', description: 'Apple Exercise time' },
  appleStandTime: { unit: 'min', description: 'Apple Stand time' },
  sleepAnalysis: { unit: 'category', description: 'Sleep analysis' },
};

export const DAILY_READINESS_DATA_TYPES: HealthDataType[] = [
  'heartRateVariability',
  'restingHeartRate',
  'respiratoryRate',
  'oxygenSaturation',
  'sleepAnalysis',
  'bodyTemperature',
];

export const BODY_COMPOSITION_DATA_TYPES: HealthDataType[] = [
  'weight',
  'height',
  'bmi',
  'bodyFatPercentage',
  'leanBodyMass',
  'waistCircumference',
];

export const CARDIOMETABOLIC_DATA_TYPES: HealthDataType[] = [
  'heartRate',
  'restingHeartRate',
  'walkingHeartRateAverage',
  'bloodPressureSystolic',
  'bloodPressureDiastolic',
  'bloodGlucose',
  'vo2Max',
];

export const ACTIVITY_DATA_TYPES: HealthDataType[] = [
  'steps',
  'distance',
  'calories',
  'basalEnergyBurned',
  'flightsClimbed',
  'appleExerciseTime',
  'appleStandTime',
];
