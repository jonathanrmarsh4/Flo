import { clickhouse, isClickHouseEnabled } from './clickhouseService';
import { getSupabaseClient } from './supabaseClient';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { mlSensitivitySettings } from '@shared/schema';

interface MLSettings {
  anomalyZScoreThreshold: number;
  anomalyMinConfidence: number;
  minPatternMatches: number;
  historyWindowMonths: number;
  minPositiveOccurrences: number;
  positiveOutcomeThreshold: number;
  insightConfidenceThreshold: number;
  maxCausesToShow: number;
  maxPositivePatternsToShow: number;
  enableProactiveAlerts: boolean;
  alertCooldownHours: number;
}

const DEFAULT_ML_SETTINGS: MLSettings = {
  anomalyZScoreThreshold: 2.0,
  anomalyMinConfidence: 0.5,
  minPatternMatches: 3,
  historyWindowMonths: 24,
  minPositiveOccurrences: 5,
  positiveOutcomeThreshold: 0.1,
  insightConfidenceThreshold: 0.3,
  maxCausesToShow: 3,
  maxPositivePatternsToShow: 3,
  enableProactiveAlerts: true,
  alertCooldownHours: 4,
};

let cachedSettings: MLSettings | null = null;
let settingsCachedAt = 0;
const SETTINGS_CACHE_TTL_MS = 60000; // 1 minute cache

async function getMLSettings(): Promise<MLSettings> {
  const now = Date.now();
  if (cachedSettings && (now - settingsCachedAt) < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings;
  }
  
  try {
    const [settings] = await db.select().from(mlSensitivitySettings).limit(1);
    if (settings) {
      cachedSettings = {
        anomalyZScoreThreshold: settings.anomalyZScoreThreshold,
        anomalyMinConfidence: settings.anomalyMinConfidence,
        minPatternMatches: settings.minPatternMatches,
        historyWindowMonths: settings.historyWindowMonths,
        minPositiveOccurrences: settings.minPositiveOccurrences,
        positiveOutcomeThreshold: settings.positiveOutcomeThreshold,
        insightConfidenceThreshold: settings.insightConfidenceThreshold,
        maxCausesToShow: settings.maxCausesToShow,
        maxPositivePatternsToShow: settings.maxPositivePatternsToShow,
        enableProactiveAlerts: settings.enableProactiveAlerts,
        alertCooldownHours: settings.alertCooldownHours,
      };
      settingsCachedAt = now;
      return cachedSettings;
    }
  } catch (error) {
    logger.warn('[BehaviorAttribution] Failed to load ML settings, using defaults', { error });
  }
  
  return DEFAULT_ML_SETTINGS;
}

export { getMLSettings, MLSettings };

interface BehaviorFactor {
  factor_category: string;
  factor_key: string;
  numeric_value: number | null;
  string_value: string | null;
  time_value: Date | null;
  deviation_from_baseline: number | null;
  baseline_value: number | null;
  is_notable: boolean;
  source: string;
  metadata?: Record<string, unknown>;
}

interface AttributedFactor {
  category: string;
  key: string;
  value: string;
  deviation: number;
  baselineValue: number | null;
  contribution: 'high' | 'medium' | 'low';
}

interface HypothesisResult {
  attributionId: string;
  outcomeMetric: string;
  outcomeValue: number;
  outcomeDeviationPct: number;
  attributedFactors: AttributedFactor[];
  hypothesisText: string;
  confidenceScore: number;
  experimentSuggestion: string | null;
}

const FACTOR_CATEGORIES = {
  NUTRITION: 'nutrition',
  WORKOUT: 'workout',
  RECOVERY: 'recovery',
  SUPPLEMENT: 'supplement',
  ENVIRONMENT: 'environment',
  LIFE_EVENT: 'life_event',
  LIFESTYLE: 'lifestyle',
  LOCATION: 'location',
} as const;

export class BehaviorAttributionEngine {
  private initialized = false;

  async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;
    if (!isClickHouseEnabled()) {
      logger.warn('[BehaviorAttribution] ClickHouse not enabled');
      return false;
    }
    this.initialized = true;
    return true;
  }

  async syncDailyBehaviorFactors(healthId: string, localDate: string): Promise<number> {
    if (!await this.ensureInitialized()) return 0;

    const supabase = getSupabaseClient();
    const factors: BehaviorFactor[] = [];

    try {
      // 1. Nutrition factors from nutrition_daily_aggregates
      const { data: nutrition } = await supabase
        .from('nutrition_daily_aggregates')
        .select('*')
        .eq('health_id', healthId)
        .eq('local_date', localDate)
        .single();

      if (nutrition) {
        factors.push({
          factor_category: FACTOR_CATEGORIES.NUTRITION,
          factor_key: 'total_calories',
          numeric_value: nutrition.total_calories,
          string_value: null,
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        factors.push({
          factor_category: FACTOR_CATEGORIES.NUTRITION,
          factor_key: 'protein_g',
          numeric_value: nutrition.total_protein_g,
          string_value: null,
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        // Convert last_meal_time to minutes since midnight for numeric baseline calculation
        let lastMealMinutes: number | null = null;
        if (nutrition.last_meal_time) {
          const timeParts = nutrition.last_meal_time.split(':');
          if (timeParts.length >= 2) {
            lastMealMinutes = parseInt(timeParts[0], 10) * 60 + parseInt(timeParts[1], 10);
          }
        }
        factors.push({
          factor_category: FACTOR_CATEGORIES.NUTRITION,
          factor_key: 'last_meal_time',
          numeric_value: lastMealMinutes,
          string_value: nutrition.last_meal_time,
          time_value: nutrition.last_meal_time ? new Date(`${localDate}T${nutrition.last_meal_time}`) : null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        factors.push({
          factor_category: FACTOR_CATEGORIES.NUTRITION,
          factor_key: 'caffeine_mg',
          numeric_value: nutrition.total_caffeine_mg,
          string_value: null,
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        factors.push({
          factor_category: FACTOR_CATEGORIES.NUTRITION,
          factor_key: 'alcohol_g',
          numeric_value: nutrition.total_alcohol_g,
          string_value: null,
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        // All macros - carbs, fat, fiber, sugar, sodium
        if (nutrition.carbohydrates_g != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.NUTRITION,
            factor_key: 'carbohydrates_g',
            numeric_value: nutrition.carbohydrates_g,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }

        if (nutrition.fat_total_g != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.NUTRITION,
            factor_key: 'fat_total_g',
            numeric_value: nutrition.fat_total_g,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }

        if (nutrition.fiber_g != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.NUTRITION,
            factor_key: 'fiber_g',
            numeric_value: nutrition.fiber_g,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }

        if (nutrition.sugar_g != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.NUTRITION,
            factor_key: 'sugar_g',
            numeric_value: nutrition.sugar_g,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }

        if (nutrition.sodium_mg != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.NUTRITION,
            factor_key: 'sodium_mg',
            numeric_value: nutrition.sodium_mg,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }

        if (nutrition.fat_saturated_g != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.NUTRITION,
            factor_key: 'fat_saturated_g',
            numeric_value: nutrition.fat_saturated_g,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }

        if (nutrition.water_ml != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.NUTRITION,
            factor_key: 'water_ml',
            numeric_value: nutrition.water_ml,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }
      }

      // 2. Workout factors from workout_sessions or healthkit_workouts
      const { data: workouts } = await supabase
        .from('healthkit_workouts')
        .select('*')
        .eq('health_id', healthId)
        .gte('start_date', `${localDate}T00:00:00`)
        .lt('start_date', `${localDate}T23:59:59`);

      if (workouts && workouts.length > 0) {
        // Note: column is 'duration' not 'duration_minutes'
        const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
        const totalCalories = workouts.reduce((sum, w) => sum + (w.total_energy_burned || 0), 0);
        const workoutTypes = Array.from(new Set(workouts.map(w => w.workout_type)));

        factors.push({
          factor_category: FACTOR_CATEGORIES.WORKOUT,
          factor_key: 'total_duration_min',
          numeric_value: totalDuration,
          string_value: null,
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        factors.push({
          factor_category: FACTOR_CATEGORIES.WORKOUT,
          factor_key: 'total_calories',
          numeric_value: totalCalories,
          string_value: null,
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        factors.push({
          factor_category: FACTOR_CATEGORIES.WORKOUT,
          factor_key: 'workout_types',
          numeric_value: workouts.length,
          string_value: workoutTypes.join(','),
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });

        // Get earliest workout time - convert to minutes since midnight for baseline
        const sortedWorkouts = workouts.sort((a, b) => 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        );
        if (sortedWorkouts[0]) {
          const workoutDate = new Date(sortedWorkouts[0].start_date);
          const workoutMinutes = workoutDate.getHours() * 60 + workoutDate.getMinutes();
          factors.push({
            factor_category: FACTOR_CATEGORIES.WORKOUT,
            factor_key: 'first_workout_time',
            numeric_value: workoutMinutes,
            string_value: workoutDate.toTimeString().slice(0, 5),
            time_value: workoutDate,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }
      }

      // 3. Recovery factors (sauna, cold plunge, mindfulness)
      const { data: mindfulness } = await supabase
        .from('mindfulness_sessions')
        .select('*')
        .eq('health_id', healthId)
        .gte('start_date', `${localDate}T00:00:00`)
        .lt('start_date', `${localDate}T23:59:59`);

      if (mindfulness && mindfulness.length > 0) {
        const totalMindfulnessMin = mindfulness.reduce((sum, m) => sum + (m.duration_minutes || 0), 0);
        factors.push({
          factor_category: FACTOR_CATEGORIES.RECOVERY,
          factor_key: 'mindfulness_min',
          numeric_value: totalMindfulnessMin,
          string_value: null,
          time_value: null,
          deviation_from_baseline: null,
          baseline_value: null,
          is_notable: false,
          source: 'healthkit',
        });
      }

      // 3b. Sauna and cold plunge from life_events (recovery modalities)
      // Note: life_events uses 'happened_at' timestamp, not 'event_date'
      const { data: recoveryEvents } = await supabase
        .from('life_events')
        .select('*')
        .eq('health_id', healthId)
        .gte('happened_at', `${localDate}T00:00:00`)
        .lt('happened_at', `${localDate}T23:59:59`)
        .in('event_type', ['sauna', 'cold_plunge', 'ice_bath', 'hot_tub', 'cryotherapy', 'contrast_therapy']);

      if (recoveryEvents && recoveryEvents.length > 0) {
        for (const event of recoveryEvents) {
          const details = event.details || {};
          const durationMin = details.duration_min || details.duration_minutes || 15;
          
          factors.push({
            factor_category: FACTOR_CATEGORIES.RECOVERY,
            factor_key: event.event_type,
            numeric_value: durationMin,
            string_value: null,
            time_value: event.happened_at ? new Date(event.happened_at) : null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: true,
            source: 'user_logged',
          });
        }
      }

      // 3c. Also check for sauna/recovery in "other" events with activities in details
      const { data: otherEvents } = await supabase
        .from('life_events')
        .select('*')
        .eq('health_id', healthId)
        .gte('happened_at', `${localDate}T00:00:00`)
        .lt('happened_at', `${localDate}T23:59:59`)
        .eq('event_type', 'other');

      if (otherEvents && otherEvents.length > 0) {
        for (const event of otherEvents) {
          const details = event.details || {};
          const activities = details.activities || [];
          
          // Check for recovery activities buried in "other" events
          for (const activity of activities) {
            const activityLower = (activity as string).toLowerCase();
            if (['sauna', 'cold_plunge', 'ice_bath', 'cold plunge', 'ice bath'].includes(activityLower)) {
              const durationMin = details.sauna_duration_min || details.duration_min || 15;
              factors.push({
                factor_category: FACTOR_CATEGORIES.RECOVERY,
                factor_key: activityLower.replace(' ', '_'),
                numeric_value: durationMin,
                string_value: null,
                time_value: event.happened_at ? new Date(event.happened_at) : null,
                deviation_from_baseline: null,
                baseline_value: null,
                is_notable: true,
                source: 'user_logged',
              });
            }
          }
        }
      }

      // 4. Environmental factors from environmental_daily
      const { data: environment } = await supabase
        .from('environmental_daily')
        .select('*')
        .eq('health_id', healthId)
        .eq('local_date', localDate)
        .single();

      if (environment) {
        if (environment.aqi != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.ENVIRONMENT,
            factor_key: 'aqi',
            numeric_value: environment.aqi,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: environment.aqi > 100,
            source: 'openweather',
          });
        }

        if (environment.temperature_c != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.ENVIRONMENT,
            factor_key: 'temperature_c',
            numeric_value: environment.temperature_c,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
        }

        if (environment.humidity_pct != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.ENVIRONMENT,
            factor_key: 'humidity_pct',
            numeric_value: environment.humidity_pct,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
        }

        // Additional environmental factors
        if (environment.pressure_hpa != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.ENVIRONMENT,
            factor_key: 'pressure_hpa',
            numeric_value: environment.pressure_hpa,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
        }

        if (environment.uv_index != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.ENVIRONMENT,
            factor_key: 'uv_index',
            numeric_value: environment.uv_index,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: environment.uv_index >= 8,
            source: 'openweather',
          });
        }

        if (environment.cloud_cover_pct != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.ENVIRONMENT,
            factor_key: 'cloud_cover_pct',
            numeric_value: environment.cloud_cover_pct,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
        }

        if (environment.wind_speed_mps != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.ENVIRONMENT,
            factor_key: 'wind_speed_mps',
            numeric_value: environment.wind_speed_mps,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
        }

        // Location tracking for travel detection
        if (environment.latitude != null && environment.longitude != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.LOCATION,
            factor_key: 'latitude',
            numeric_value: environment.latitude,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
          factors.push({
            factor_category: FACTOR_CATEGORIES.LOCATION,
            factor_key: 'longitude',
            numeric_value: environment.longitude,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
        }

        if (environment.city_name != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.LOCATION,
            factor_key: 'city',
            numeric_value: null,
            string_value: environment.city_name,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'openweather',
          });
        }

        if (environment.timezone != null) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.LOCATION,
            factor_key: 'timezone',
            numeric_value: null,
            string_value: environment.timezone,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'system',
          });
        }
      }

      // 5. Life events from life_events table
      const { data: lifeEvents } = await supabase
        .from('life_events')
        .select('*')
        .eq('health_id', healthId)
        .eq('event_date', localDate);

      if (lifeEvents && lifeEvents.length > 0) {
        for (const event of lifeEvents) {
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFE_EVENT,
            factor_key: event.event_type || 'general',
            numeric_value: event.severity || 5,
            string_value: event.description,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: (event.severity || 5) >= 7,
            source: 'user_logged',
          });
        }
      }

      // 6. Sleep timing from sleep_nights (for previous night context)
      const { data: sleepData } = await supabase
        .from('sleep_nights')
        .select('*')
        .eq('health_id', healthId)
        .eq('sleep_date', localDate)
        .single();

      if (sleepData) {
        if (sleepData.bedtime_local) {
          // Convert bedtime to minutes since midnight for baseline comparison
          const bedtimeDate = new Date(sleepData.bedtime_local);
          let bedtimeMinutes = bedtimeDate.getHours() * 60 + bedtimeDate.getMinutes();
          // Handle late night bedtimes (after midnight) by adding 24 hours worth of minutes
          if (bedtimeMinutes < 240) { // Before 4am, likely "yesterday's" bedtime
            bedtimeMinutes += 1440; // Add 24 hours
          }
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFESTYLE,
            factor_key: 'bedtime',
            numeric_value: bedtimeMinutes,
            string_value: bedtimeDate.toTimeString().slice(0, 5),
            time_value: bedtimeDate,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'healthkit',
          });
        }
      }

      // 7. CGM data from cgm_readings (glucose metrics)
      const { data: cgmReadings } = await supabase
        .from('cgm_readings')
        .select('*')
        .eq('health_id', healthId)
        .gte('recorded_at', `${localDate}T00:00:00`)
        .lt('recorded_at', `${localDate}T23:59:59`);

      if (cgmReadings && cgmReadings.length > 0) {
        const glucoseValues = cgmReadings.map(r => r.glucose_value).filter((v): v is number => v != null);
        
        if (glucoseValues.length > 0) {
          // Average glucose
          const avgGlucose = glucoseValues.reduce((a, b) => a + b, 0) / glucoseValues.length;
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFESTYLE,
            factor_key: 'avg_glucose_mg_dl',
            numeric_value: Math.round(avgGlucose),
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: avgGlucose > 140 || avgGlucose < 70,
            source: 'cgm',
          });

          // Glucose variability (standard deviation)
          const mean = avgGlucose;
          const variance = glucoseValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / glucoseValues.length;
          const stdDev = Math.sqrt(variance);
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFESTYLE,
            factor_key: 'glucose_variability',
            numeric_value: Math.round(stdDev * 10) / 10,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: stdDev > 30,
            source: 'cgm',
          });

          // Time in range (70-180 mg/dL)
          const inRange = glucoseValues.filter(v => v >= 70 && v <= 180).length;
          const timeInRangePct = (inRange / glucoseValues.length) * 100;
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFESTYLE,
            factor_key: 'time_in_range_pct',
            numeric_value: Math.round(timeInRangePct),
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: timeInRangePct < 70,
            source: 'cgm',
          });

          // Max glucose (spikes)
          const maxGlucose = Math.max(...glucoseValues);
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFESTYLE,
            factor_key: 'max_glucose_mg_dl',
            numeric_value: maxGlucose,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: maxGlucose > 180,
            source: 'cgm',
          });

          // Min glucose (lows)
          const minGlucose = Math.min(...glucoseValues);
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFESTYLE,
            factor_key: 'min_glucose_mg_dl',
            numeric_value: minGlucose,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: minGlucose < 70,
            source: 'cgm',
          });

          // Number of readings
          factors.push({
            factor_category: FACTOR_CATEGORIES.LIFESTYLE,
            factor_key: 'cgm_readings_count',
            numeric_value: glucoseValues.length,
            string_value: null,
            time_value: null,
            deviation_from_baseline: null,
            baseline_value: null,
            is_notable: false,
            source: 'cgm',
          });
        }
      }

      // Calculate baselines and deviations for each factor
      await this.enrichWithBaselines(healthId, localDate, factors);

      // Insert into ClickHouse
      if (factors.length > 0) {
        const rows = factors.map(f => ({
          health_id: healthId,
          local_date: localDate,
          factor_category: f.factor_category,
          factor_key: f.factor_key,
          numeric_value: f.numeric_value,
          string_value: f.string_value,
          time_value: f.time_value && !isNaN(f.time_value.getTime()) ? f.time_value.toISOString() : null,
          deviation_from_baseline: f.deviation_from_baseline,
          baseline_value: f.baseline_value,
          is_notable: f.is_notable ? 1 : 0,
          source: f.source,
          metadata: f.metadata ? JSON.stringify(f.metadata) : null,
        }));

        await clickhouse.insert('daily_behavior_factors', rows);
        logger.info(`[BehaviorAttribution] Synced ${rows.length} behavior factors for ${healthId} on ${localDate}`);
      }

      return factors.length;
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error syncing behavior factors:`, error);
      return 0;
    }
  }

  private async enrichWithBaselines(healthId: string, localDate: string, factors: BehaviorFactor[]): Promise<void> {
    if (!isClickHouseEnabled()) return;

    // Calculate 30-day baselines for each factor
    const startDate = new Date(localDate);
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];

    for (const factor of factors) {
      if (factor.numeric_value == null) continue;

      try {
        const baselineQuery = `
          SELECT 
            avg(numeric_value) as mean_value,
            stddevPop(numeric_value) as std_dev
          FROM flo_health.daily_behavior_factors
          WHERE health_id = {healthId:String}
            AND factor_category = {category:String}
            AND factor_key = {factorKey:String}
            AND local_date >= {startDate:Date}
            AND local_date < {localDate:Date}
            AND numeric_value IS NOT NULL
        `;

        const result = await clickhouse.query<{ mean_value: number; std_dev: number }>(
          baselineQuery,
          {
            healthId,
            category: factor.factor_category,
            factorKey: factor.factor_key,
            startDate: startDateStr,
            localDate,
          }
        );

        if (result.length > 0 && result[0].mean_value != null) {
          const baseline = result[0].mean_value;
          const stdDev = result[0].std_dev || 1;
          const deviation = baseline > 0 
            ? ((factor.numeric_value - baseline) / baseline) * 100 
            : 0;

          factor.baseline_value = baseline;
          factor.deviation_from_baseline = deviation;
          
          // Mark as notable if deviation is significant (>30%)
          if (Math.abs(deviation) >= 30) {
            factor.is_notable = true;
          }
        }
      } catch (error) {
        logger.debug(`[BehaviorAttribution] Could not calculate baseline for ${factor.factor_key}:`, error as Error);
      }
    }
  }

  async findAttributedFactors(
    healthId: string,
    anomalyDate: string,
    outcomeMetric: string,
    outcomeDeviationPct: number
  ): Promise<AttributedFactor[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      // Query all notable behavior factors from that day
      const query = `
        SELECT 
          factor_category,
          factor_key,
          numeric_value,
          string_value,
          deviation_from_baseline,
          baseline_value,
          is_notable
        FROM flo_health.daily_behavior_factors
        WHERE health_id = {healthId:String}
          AND local_date = {anomalyDate:Date}
          AND (is_notable = 1 OR abs(deviation_from_baseline) >= 25)
        ORDER BY abs(deviation_from_baseline) DESC
        LIMIT 10
      `;

      const factors = await clickhouse.query<{
        factor_category: string;
        factor_key: string;
        numeric_value: number | null;
        string_value: string | null;
        deviation_from_baseline: number | null;
        baseline_value: number | null;
        is_notable: number;
      }>(query, { healthId, anomalyDate });

      return factors.map(f => ({
        category: f.factor_category,
        key: f.factor_key,
        value: f.numeric_value != null ? f.numeric_value.toString() : (f.string_value || ''),
        deviation: f.deviation_from_baseline || 0,
        baselineValue: f.baseline_value,
        contribution: Math.abs(f.deviation_from_baseline || 0) >= 50 ? 'high' : 
                      Math.abs(f.deviation_from_baseline || 0) >= 30 ? 'medium' : 'low',
      }));
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error finding attributed factors:`, error);
      return [];
    }
  }

  async generateHypothesis(
    healthId: string,
    anomalyDate: string,
    outcomeMetric: string,
    outcomeValue: number,
    outcomeDeviationPct: number
  ): Promise<HypothesisResult | null> {
    if (!await this.ensureInitialized()) return null;

    try {
      const attributedFactors = await this.findAttributedFactors(
        healthId,
        anomalyDate,
        outcomeMetric,
        outcomeDeviationPct
      );

      if (attributedFactors.length === 0) {
        return null;
      }

      // Build natural language hypothesis
      const direction = outcomeDeviationPct > 0 ? 'improvement' : 'decline';
      const outcomeLabel = this.formatMetricName(outcomeMetric);
      
      const factorDescriptions = attributedFactors.slice(0, 3).map(f => {
        const changeDir = f.deviation > 0 ? 'higher than usual' : 'lower than usual';
        const factorLabel = this.formatFactorName(f.category, f.key);
        return `${factorLabel} was ${Math.abs(Math.round(f.deviation))}% ${changeDir} (${f.value} vs baseline ${f.baselineValue?.toFixed(1) || 'unknown'})`;
      });

      const hypothesisText = `Your ${outcomeLabel} showed a ${Math.abs(Math.round(outcomeDeviationPct))}% ${direction} on ${anomalyDate}. ` +
        `Notable factors that day: ${factorDescriptions.join('; ')}. ` +
        `These behaviors may have contributed to this change.`;

      const experimentSuggestion = outcomeDeviationPct > 0 
        ? `Consider trying to replicate these conditions tomorrow to see if the ${direction} continues.`
        : null;

      const confidenceScore = Math.min(0.9, 0.3 + (attributedFactors.length * 0.15));

      const result: HypothesisResult = {
        attributionId: uuidv4(),
        outcomeMetric,
        outcomeValue,
        outcomeDeviationPct,
        attributedFactors,
        hypothesisText,
        confidenceScore,
        experimentSuggestion,
      };

      // Store attribution in ClickHouse - include the actual experiment suggestion text
      await clickhouse.insert('anomaly_attributions', [{
        health_id: healthId,
        anomaly_date: anomalyDate,
        outcome_metric: outcomeMetric,
        outcome_value: outcomeValue,
        outcome_deviation_pct: outcomeDeviationPct,
        attributed_factors: JSON.stringify(attributedFactors),
        hypothesis_text: hypothesisText,
        confidence_score: confidenceScore,
        supporting_stats: JSON.stringify({ 
          factorCount: attributedFactors.length,
          experimentSuggestionText: experimentSuggestion,
        }),
        experiment_suggested: experimentSuggestion ? 1 : 0,
      }]);

      logger.info(`[BehaviorAttribution] Generated hypothesis for ${outcomeMetric} anomaly on ${anomalyDate}`);
      return result;
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error generating hypothesis:`, error);
      return null;
    }
  }

  private formatMetricName(metric: string): string {
    const mapping: Record<string, string> = {
      'deep_sleep': 'deep sleep',
      'rem_sleep': 'REM sleep',
      'sleep_duration': 'total sleep',
      'hrv': 'HRV',
      'resting_heart_rate': 'resting heart rate',
      'steps': 'daily steps',
      'active_energy': 'active calories',
    };
    return mapping[metric] || metric.replace(/_/g, ' ');
  }

  private formatFactorName(category: string, key: string): string {
    const catLabels: Record<string, string> = {
      'nutrition': '',
      'workout': 'Workout',
      'recovery': 'Recovery',
      'environment': 'Environmental',
      'life_event': 'Life event',
      'lifestyle': 'Lifestyle',
      'location': 'Location',
      'cgm': 'CGM',
    };

    const keyLabels: Record<string, string> = {
      // Nutrition
      'total_calories': 'calorie intake',
      'protein_g': 'protein intake',
      'carbohydrates_g': 'carbs intake',
      'fat_total_g': 'fat intake',
      'fiber_g': 'fiber intake',
      'sugar_g': 'sugar intake',
      'sodium_mg': 'sodium intake',
      'fat_saturated_g': 'saturated fat',
      'water_ml': 'water intake',
      'last_meal_time': 'last meal timing',
      'caffeine_mg': 'caffeine',
      'alcohol_g': 'alcohol',
      // Workout
      'total_duration_min': 'duration',
      'workout_types': 'type',
      'first_workout_time': 'timing',
      // Recovery
      'mindfulness_min': 'mindfulness',
      'sauna': 'sauna session',
      'cold_plunge': 'cold plunge',
      'ice_bath': 'ice bath',
      'hot_tub': 'hot tub',
      'cryotherapy': 'cryotherapy',
      'contrast_therapy': 'contrast therapy',
      // Environment
      'aqi': 'air quality (AQI)',
      'temperature_c': 'temperature',
      'humidity_pct': 'humidity',
      'pressure_hpa': 'barometric pressure',
      'uv_index': 'UV index',
      'cloud_cover_pct': 'cloud cover',
      'wind_speed_mps': 'wind speed',
      // Location
      'latitude': 'latitude',
      'longitude': 'longitude',
      'city': 'city',
      'timezone': 'timezone',
      // Lifestyle
      'bedtime': 'bedtime',
      // CGM
      'avg_glucose_mg_dl': 'average glucose',
      'glucose_variability': 'glucose variability',
      'time_in_range_pct': 'time in range',
      'max_glucose_mg_dl': 'glucose spike (max)',
      'min_glucose_mg_dl': 'glucose low (min)',
      'cgm_readings_count': 'CGM readings',
    };

    const catLabel = catLabels[category] || category;
    const keyLabel = keyLabels[key] || key.replace(/_/g, ' ');
    
    return catLabel ? `${catLabel} ${keyLabel}` : keyLabel.charAt(0).toUpperCase() + keyLabel.slice(1);
  }

  async getRecentAttributions(healthId: string, limit: number = 5): Promise<HypothesisResult[]> {
    if (!await this.ensureInitialized()) return [];

    try {
      const query = `
        SELECT 
          toString(attribution_id) as attribution_id,
          outcome_metric,
          outcome_value,
          outcome_deviation_pct,
          attributed_factors,
          hypothesis_text,
          confidence_score,
          experiment_suggested,
          supporting_stats
        FROM flo_health.anomaly_attributions
        WHERE health_id = {healthId:String}
        ORDER BY created_at DESC
        LIMIT {limit:UInt32}
      `;

      const results = await clickhouse.query<{
        attribution_id: string;
        outcome_metric: string;
        outcome_value: number;
        outcome_deviation_pct: number;
        attributed_factors: string;
        hypothesis_text: string;
        confidence_score: number;
        experiment_suggested: number;
        supporting_stats: string;
      }>(query, { healthId, limit });

      return results.map(r => {
        // Extract actual experiment suggestion text from supporting_stats
        let experimentSuggestionText: string | null = null;
        try {
          const stats = JSON.parse(r.supporting_stats || '{}');
          experimentSuggestionText = stats.experimentSuggestionText || null;
        } catch (e) {
          // Ignore parse errors
        }
        
        return {
          attributionId: r.attribution_id,
          outcomeMetric: r.outcome_metric,
          outcomeValue: r.outcome_value,
          outcomeDeviationPct: r.outcome_deviation_pct,
          attributedFactors: JSON.parse(r.attributed_factors),
          hypothesisText: r.hypothesis_text,
          confidenceScore: r.confidence_score,
          experimentSuggestion: experimentSuggestionText,
        };
      });
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error getting recent attributions:`, error);
      return [];
    }
  }

  async recordExperimentOutcome(
    attributionId: string,
    outcome: 'confirmed' | 'refuted' | 'inconclusive',
    outcomeValue: number,
    userFeedback?: string
  ): Promise<boolean> {
    if (!await this.ensureInitialized()) return false;

    try {
      const updateQuery = `
        ALTER TABLE flo_health.anomaly_attributions
        UPDATE 
          experiment_outcome = {outcome:String},
          user_feedback = {userFeedback:Nullable(String)},
          was_helpful = {wasHelpful:UInt8}
        WHERE toString(attribution_id) = {attributionId:String}
      `;

      await clickhouse.command(updateQuery);
      logger.info(`[BehaviorAttribution] Recorded experiment outcome for ${attributionId}: ${outcome}`);
      return true;
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error recording experiment outcome:`, error);
      return false;
    }
  }

  async evaluateExperimentFollowup(
    healthId: string,
    originalDate: string,
    outcomeMetric: string
  ): Promise<{ confirmed: boolean; followupValue: number; originalValue: number } | null> {
    if (!await this.ensureInitialized()) return null;

    try {
      const nextDay = new Date(originalDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];

      // Get the original attribution
      const attributionQuery = `
        SELECT outcome_value, attributed_factors
        FROM flo_health.anomaly_attributions
        WHERE health_id = {healthId:String}
          AND anomaly_date = {originalDate:Date}
          AND outcome_metric = {outcomeMetric:String}
        LIMIT 1
      `;

      const [attribution] = await clickhouse.query<{ outcome_value: number; attributed_factors: string }>(
        attributionQuery,
        { healthId, originalDate, outcomeMetric }
      );

      if (!attribution) return null;

      // Check if the same behaviors occurred on the follow-up day
      const factorsQuery = `
        SELECT factor_key, deviation_from_baseline
        FROM flo_health.daily_behavior_factors
        WHERE health_id = {healthId:String}
          AND local_date = {nextDayStr:Date}
          AND is_notable = 1
      `;

      const followupFactors = await clickhouse.query<{ factor_key: string; deviation_from_baseline: number }>(
        factorsQuery,
        { healthId, nextDayStr }
      );

      // Get the outcome value for the follow-up day from ClickHouse health_metrics
      const outcomeQuery = `
        SELECT avg(hm.value) as avg_value
        FROM flo_health.health_metrics hm
        WHERE hm.health_id = {healthId:String}
          AND hm.metric_type = {outcomeMetric:String}
          AND hm.local_date = {nextDayStr:Date}
      `;

      const [followupOutcome] = await clickhouse.query<{ avg_value: number }>(
        outcomeQuery,
        { healthId, outcomeMetric, nextDayStr }
      );

      if (!followupOutcome) return null;

      // Compare: if original was a positive deviation and follow-up is also positive, experiment is confirmed
      const originalValue = attribution.outcome_value;
      const followupValue = followupOutcome.avg_value;
      const wasPositive = originalValue > 0;
      const isStillPositive = followupValue > 0;
      const confirmed = wasPositive === isStillPositive && Math.abs(followupValue) >= Math.abs(originalValue) * 0.5;

      return { confirmed, followupValue, originalValue };
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error evaluating experiment followup:`, error);
      return null;
    }
  }

  async getAttributionStats(healthId: string): Promise<{
    totalAttributions: number;
    confirmedExperiments: number;
    refutedExperiments: number;
    topContributingFactors: { factor: string; count: number }[];
  }> {
    if (!await this.ensureInitialized()) {
      return { totalAttributions: 0, confirmedExperiments: 0, refutedExperiments: 0, topContributingFactors: [] };
    }

    try {
      const statsQuery = `
        SELECT 
          count(*) as total,
          countIf(experiment_outcome = 'confirmed') as confirmed,
          countIf(experiment_outcome = 'refuted') as refuted
        FROM flo_health.anomaly_attributions
        WHERE health_id = {healthId:String}
      `;

      const [stats] = await clickhouse.query<{ total: number; confirmed: number; refuted: number }>(
        statsQuery,
        { healthId }
      );

      // Get top contributing factors
      const factorsQuery = `
        SELECT factor_category || '.' || factor_key as factor, count(*) as cnt
        FROM flo_health.daily_behavior_factors
        WHERE health_id = {healthId:String}
          AND is_notable = 1
        GROUP BY factor
        ORDER BY cnt DESC
        LIMIT 5
      `;

      const topFactors = await clickhouse.query<{ factor: string; cnt: number }>(factorsQuery, { healthId });

      return {
        totalAttributions: stats?.total || 0,
        confirmedExperiments: stats?.confirmed || 0,
        refutedExperiments: stats?.refuted || 0,
        topContributingFactors: topFactors.map(f => ({ factor: f.factor, count: f.cnt })),
      };
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error getting attribution stats:`, error);
      return { totalAttributions: 0, confirmedExperiments: 0, refutedExperiments: 0, topContributingFactors: [] };
    }
  }
  /**
   * Find historical occurrences where similar behavior patterns preceded similar outcomes.
   * Searches ALL available data (years if available) to identify repeating cause-effect patterns.
   * Returns: number of times this pattern has occurred, dates, and confidence score.
   */
  async findHistoricalPatternMatches(
    healthId: string,
    currentAnomalyDate: string,
    outcomeMetric: string,
    outcomeDirection: 'above' | 'below',
    notableBehaviors: { category: string; key: string; direction: 'above' | 'below' }[]
  ): Promise<{
    matchCount: number;
    totalHistoryMonths: number;
    matchDates: string[];
    patternConfidence: number;
    isRecurringPattern: boolean;
    patternDescription: string;
  }> {
    if (!await this.ensureInitialized() || notableBehaviors.length === 0) {
      return { matchCount: 0, totalHistoryMonths: 0, matchDates: [], patternConfidence: 0, isRecurringPattern: false, patternDescription: '' };
    }

    try {
      // First, get the user's full data range
      const rangeQuery = `
        SELECT 
          min(local_date) as first_date,
          max(local_date) as last_date,
          dateDiff('month', min(local_date), max(local_date)) as months_of_data
        FROM flo_health.daily_behavior_factors
        WHERE health_id = {healthId:String}
      `;
      const [range] = await clickhouse.query<{ first_date: string; last_date: string; months_of_data: number }>(
        rangeQuery, { healthId }
      );

      if (!range || range.months_of_data < 1) {
        return { matchCount: 0, totalHistoryMonths: 0, matchDates: [], patternConfidence: 0, isRecurringPattern: false, patternDescription: '' };
      }

      // Build behavior pattern matching conditions
      const behaviorConditions = notableBehaviors.map((b, i) => {
        const dirCondition = b.direction === 'above' ? '> 0' : '< 0';
        return `countIf(factor_category = {cat${i}:String} AND factor_key = {key${i}:String} AND deviation_from_baseline ${dirCondition}) > 0`;
      }).join(' AND ');

      const params: Record<string, string> = { healthId, currentAnomalyDate, outcomeMetric };
      notableBehaviors.forEach((b, i) => {
        params[`cat${i}`] = b.category;
        params[`key${i}`] = b.key;
      });

      // Find all days where this exact behavior pattern occurred (excluding current day)
      const patternDaysQuery = `
        SELECT local_date
        FROM flo_health.daily_behavior_factors
        WHERE health_id = {healthId:String}
          AND local_date != {currentAnomalyDate:Date}
        GROUP BY local_date
        HAVING ${behaviorConditions}
        ORDER BY local_date DESC
      `;

      const patternDays = await clickhouse.query<{ local_date: string }>(patternDaysQuery, params);

      if (patternDays.length === 0) {
        return { matchCount: 0, totalHistoryMonths: range.months_of_data, matchDates: [], patternConfidence: 0, isRecurringPattern: false, patternDescription: '' };
      }

      // Now check which of these days also had the same outcome direction
      // Join health_metrics with metric_baselines to compute z_score on the fly
      const outcomeDirection_ = outcomeDirection === 'above' ? '>' : '<';
      const matchingOutcomesQuery = `
        SELECT DISTINCT hm.local_date
        FROM flo_health.health_metrics hm
        LEFT JOIN flo_health.metric_baselines mb 
          ON hm.health_id = mb.health_id 
          AND hm.metric_type = mb.metric_type 
          AND hm.local_date = mb.baseline_date
        WHERE hm.health_id = {healthId:String}
          AND hm.metric_type = {outcomeMetric:String}
          AND hm.local_date IN (${patternDays.map(d => `'${d.local_date}'`).join(',')})
          AND mb.std_dev > 0
          AND ((hm.value - mb.mean_value) / mb.std_dev) ${outcomeDirection_} 1.5
        ORDER BY hm.local_date DESC
        LIMIT 50
      `;

      const matchingOutcomes = await clickhouse.query<{ local_date: string }>(matchingOutcomesQuery, params);

      const matchDates = matchingOutcomes.map(d => d.local_date);
      const matchCount = matchDates.length;

      // Calculate pattern confidence based on frequency over time
      // More matches over longer time = higher confidence
      const monthsWithPattern = matchCount / Math.max(range.months_of_data, 1);
      const patternConfidence = Math.min(0.95, 0.3 + (matchCount * 0.07) + (monthsWithPattern * 0.1));

      // Build human-readable pattern description
      const behaviorDescriptions = notableBehaviors.map(b => {
        const dir = b.direction === 'above' ? 'higher' : 'lower';
        return `${this.formatFactorName(b.category, b.key)} was ${dir} than usual`;
      });

      const outcomeDesc = outcomeDirection === 'above' ? 'elevated' : 'lower';
      const patternDescription = matchCount > 0
        ? `This pattern (${behaviorDescriptions.join(' + ')}) has preceded ${outcomeDesc} ${this.formatMetricName(outcomeMetric)} ${matchCount} times over the past ${range.months_of_data} months.`
        : '';

      // Use ML settings for recurring pattern threshold
      const mlSettings = await getMLSettings();
      
      return {
        matchCount,
        totalHistoryMonths: range.months_of_data,
        matchDates: matchDates.slice(0, 10), // Return up to 10 example dates
        patternConfidence,
        isRecurringPattern: matchCount >= mlSettings.minPatternMatches,
        patternDescription,
      };
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error finding historical pattern matches:`, error);
      return { matchCount: 0, totalHistoryMonths: 0, matchDates: [], patternConfidence: 0, isRecurringPattern: false, patternDescription: '' };
    }
  }

  /**
   * Find positive patterns - behaviors that consistently precede GOOD outcomes.
   * Helps identify "what's working" so users can keep doing it.
   * Uses ML sensitivity settings for thresholds.
   */
  async findPositivePatterns(
    healthId: string,
    outcomeMetric: string,
    lookbackMonths?: number
  ): Promise<{
    patterns: {
      behaviors: { category: string; key: string; description: string }[];
      outcomeImprovement: number;
      occurrenceCount: number;
      lastOccurred: string;
      confidence: number;
    }[];
  }> {
    if (!await this.ensureInitialized()) {
      return { patterns: [] };
    }

    try {
      // Get ML settings for thresholds
      const mlSettings = await getMLSettings();
      const effectiveLookbackMonths = lookbackMonths ?? mlSettings.historyWindowMonths;
      
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - effectiveLookbackMonths);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Find days with positive outcome deviations
      // Join health_metrics with metric_baselines to compute z_score on the fly
      const goodDaysQuery = `
        SELECT hm.local_date, avg((hm.value - mb.mean_value) / mb.std_dev) as avg_z
        FROM flo_health.health_metrics hm
        LEFT JOIN flo_health.metric_baselines mb 
          ON hm.health_id = mb.health_id 
          AND hm.metric_type = mb.metric_type 
          AND hm.local_date = mb.baseline_date
        WHERE hm.health_id = {healthId:String}
          AND hm.metric_type = {outcomeMetric:String}
          AND hm.local_date >= {startDate:Date}
          AND mb.std_dev > 0
          AND ((hm.value - mb.mean_value) / mb.std_dev) > 1.0
        GROUP BY hm.local_date
        ORDER BY avg_z DESC
        LIMIT 100
      `;

      const goodDays = await clickhouse.query<{ local_date: string; avg_z: number }>(
        goodDaysQuery, { healthId, outcomeMetric, startDate: startDateStr }
      );

      if (goodDays.length < mlSettings.minPositiveOccurrences) {
        return { patterns: [] };
      }

      // Find common behaviors on those good days
      const goodDatesList = goodDays.map(d => `'${d.local_date}'`).join(',');
      const minOccurrences = mlSettings.minPositiveOccurrences;
      const outcomeThreshold = mlSettings.positiveOutcomeThreshold * 100; // Convert to percentage
      const commonBehaviorsQuery = `
        SELECT 
          factor_category,
          factor_key,
          count(*) as occurrence_count,
          avg(deviation_from_baseline) as avg_deviation,
          max(local_date) as last_occurred
        FROM flo_health.daily_behavior_factors
        WHERE health_id = {healthId:String}
          AND local_date IN (${goodDatesList})
          AND is_notable = 1
          AND deviation_from_baseline > ${outcomeThreshold}
        GROUP BY factor_category, factor_key
        HAVING occurrence_count >= ${minOccurrences}
        ORDER BY occurrence_count DESC
        LIMIT ${mlSettings.maxPositivePatternsToShow * 3}
      `;

      const commonBehaviors = await clickhouse.query<{
        factor_category: string;
        factor_key: string;
        occurrence_count: number;
        avg_deviation: number;
        last_occurred: string;
      }>(commonBehaviorsQuery, { healthId });

      const avgImprovement = goodDays.reduce((sum, d) => sum + d.avg_z, 0) / goodDays.length;

      const patterns = commonBehaviors.map(b => ({
        behaviors: [{
          category: b.factor_category,
          key: b.factor_key,
          description: this.formatFactorName(b.factor_category, b.factor_key),
        }],
        outcomeImprovement: avgImprovement * 10, // Convert Z-score to percentage
        occurrenceCount: b.occurrence_count,
        lastOccurred: b.last_occurred,
        confidence: Math.min(0.9, 0.3 + (b.occurrence_count * 0.1)),
      }));

      return { patterns };
    } catch (error) {
      logger.error(`[BehaviorAttribution] Error finding positive patterns:`, error);
      return { patterns: [] };
    }
  }
}

export const behaviorAttributionEngine = new BehaviorAttributionEngine();
