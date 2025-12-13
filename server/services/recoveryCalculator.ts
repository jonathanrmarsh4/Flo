import { logger } from "../logger";

/**
 * Recovery Calculator Service
 * 
 * Calculates calories burned, recovery scores, and benefits for sauna and ice bath sessions
 * Based on MET (Metabolic Equivalent of Task) formulas and research-backed thresholds.
 */

// ==================== TYPES ====================

export interface SaunaCalculationInput {
  durationMinutes: number;
  temperatureCelsius?: number | null;
  userWeightKg?: number | null;
}

export interface IceBathCalculationInput {
  durationMinutes: number;
  durationSeconds: number;
  userWeightKg?: number | null;
}

export interface RecoveryCalculationResult {
  caloriesBurned: number;
  recoveryScore: number;
  benefitTags: string[];
  safetyWarning: string | null;
}

// ==================== CONSTANTS ====================

// Default weight if user hasn't provided one (average adult)
const DEFAULT_WEIGHT_KG = 70;

// MET values for thermal exposure
const SAUNA_MET_BASE = 2.0;
const SAUNA_MET_HIGH_TEMP = 2.5; // Used when temp > 90°C (194°F)
const SAUNA_HIGH_TEMP_THRESHOLD_C = 90;

const ICE_BATH_MET = 1.5;

// Recovery score multipliers and caps
const SAUNA_RECOVERY_MULTIPLIER = 1.5;
const SAUNA_RECOVERY_CAP = 45;

const ICE_BATH_RECOVERY_MULTIPLIER = 10.0;
const ICE_BATH_RECOVERY_CAP = 50;

// Safety thresholds
const SAUNA_MAX_SAFE_DURATION_MIN = 60;
const ICE_BATH_MAX_SAFE_DURATION_MIN = 10;

// Benefit thresholds (research-based)
const SAUNA_BENEFITS = [
  { minDuration: 15, benefit: "Heat Shock Protein Release" },
  { minDuration: 25, benefit: "Growth Hormone Boost" },
  { minDuration: 30, benefit: "Cardiovascular Conditioning" },
  { minDuration: 45, benefit: "Deep Detox Mode" },
];

const ICE_BATH_BENEFITS = [
  { minDuration: 1, benefit: "Dopamine Spike" },
  { minDuration: 3, benefit: "Systemic Inflammation Reduction" },
  { minDuration: 5, benefit: "Enhanced Recovery" },
  { minDuration: 8, benefit: "Cold Adaptation" },
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Global MET formula for calculating calories burned
 * calories_burned = (met_value * 3.5 * user_weight_kg / 200) * duration_minutes
 */
function calculateCaloriesFromMET(metValue: number, weightKg: number, durationMinutes: number): number {
  const calories = (metValue * 3.5 * weightKg / 200) * durationMinutes;
  return Math.round(calories);
}

/**
 * Convert Fahrenheit to Celsius
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * 5 / 9;
}

/**
 * Convert Celsius to Fahrenheit
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9 / 5) + 32;
}

// ==================== SAUNA CALCULATIONS ====================

export function calculateSaunaSession(input: SaunaCalculationInput): RecoveryCalculationResult {
  const { durationMinutes, temperatureCelsius, userWeightKg } = input;
  const weightKg = userWeightKg ?? DEFAULT_WEIGHT_KG;

  // Determine MET based on temperature
  let metValue = SAUNA_MET_BASE;
  if (temperatureCelsius != null && temperatureCelsius > SAUNA_HIGH_TEMP_THRESHOLD_C) {
    metValue = SAUNA_MET_HIGH_TEMP;
  }

  // Calculate calories burned
  const caloriesBurned = calculateCaloriesFromMET(metValue, weightKg, durationMinutes);

  // Calculate recovery score (capped)
  const rawScore = durationMinutes * SAUNA_RECOVERY_MULTIPLIER;
  const recoveryScore = Math.min(Math.round(rawScore * 10) / 10, SAUNA_RECOVERY_CAP);

  // Determine benefits earned
  const benefitTags = SAUNA_BENEFITS
    .filter(b => durationMinutes >= b.minDuration)
    .map(b => b.benefit);

  // Safety warning
  let safetyWarning: string | null = null;
  if (durationMinutes > SAUNA_MAX_SAFE_DURATION_MIN) {
    safetyWarning = `Sessions over ${SAUNA_MAX_SAFE_DURATION_MIN} minutes may increase dehydration risk. Stay hydrated!`;
  }

  logger.debug(`[RecoveryCalc] Sauna: ${durationMinutes}min @ ${temperatureCelsius ?? 'unknown'}°C = ${caloriesBurned}cal, score ${recoveryScore}`);

  return {
    caloriesBurned,
    recoveryScore,
    benefitTags,
    safetyWarning,
  };
}

// ==================== ICE BATH CALCULATIONS ====================

export function calculateIceBathSession(input: IceBathCalculationInput): RecoveryCalculationResult {
  const { durationMinutes, durationSeconds, userWeightKg } = input;
  const weightKg = userWeightKg ?? DEFAULT_WEIGHT_KG;

  // Total duration in minutes (for calorie calculation)
  const totalMinutes = durationMinutes + (durationSeconds / 60);

  // Calculate calories burned
  const caloriesBurned = calculateCaloriesFromMET(ICE_BATH_MET, weightKg, totalMinutes);

  // Calculate recovery score based on total minutes (capped)
  const rawScore = totalMinutes * ICE_BATH_RECOVERY_MULTIPLIER;
  const recoveryScore = Math.min(Math.round(rawScore * 10) / 10, ICE_BATH_RECOVERY_CAP);

  // Determine benefits earned (based on full minutes)
  const benefitTags = ICE_BATH_BENEFITS
    .filter(b => totalMinutes >= b.minDuration)
    .map(b => b.benefit);

  // Safety warning
  let safetyWarning: string | null = null;
  if (totalMinutes > ICE_BATH_MAX_SAFE_DURATION_MIN) {
    safetyWarning = `Sessions over ${ICE_BATH_MAX_SAFE_DURATION_MIN} minutes may risk hypothermia. Monitor your body's response!`;
  }

  logger.debug(`[RecoveryCalc] Ice Bath: ${durationMinutes}:${durationSeconds.toString().padStart(2, '0')} = ${caloriesBurned}cal, score ${recoveryScore}`);

  return {
    caloriesBurned,
    recoveryScore,
    benefitTags,
    safetyWarning,
  };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get the temperature in Celsius regardless of input unit
 */
export function normalizeTemperatureToCelsius(
  temperature: number | null | undefined,
  unit: 'F' | 'C' | null | undefined
): number | null {
  if (temperature == null) return null;
  if (unit === 'F') {
    return fahrenheitToCelsius(temperature);
  }
  return temperature; // Already Celsius or null unit (assume Celsius)
}

/**
 * Calculate combined daily recovery impact from multiple sessions
 */
export function calculateDailyRecoveryImpact(sessions: Array<{
  session_type: 'sauna' | 'icebath';
  recovery_score: number | null;
  calories_burned: number | null;
}>): {
  totalRecoveryScore: number;
  totalCaloriesBurned: number;
  saunaCount: number;
  iceBathCount: number;
} {
  let totalRecoveryScore = 0;
  let totalCaloriesBurned = 0;
  let saunaCount = 0;
  let iceBathCount = 0;

  for (const session of sessions) {
    totalRecoveryScore += session.recovery_score ?? 0;
    totalCaloriesBurned += session.calories_burned ?? 0;
    if (session.session_type === 'sauna') {
      saunaCount++;
    } else {
      iceBathCount++;
    }
  }

  // Cap combined daily recovery score at 100
  totalRecoveryScore = Math.min(totalRecoveryScore, 100);

  return {
    totalRecoveryScore,
    totalCaloriesBurned,
    saunaCount,
    iceBathCount,
  };
}

logger.info('[RecoveryCalculator] Service initialized');
