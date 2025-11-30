/**
 * Health Data Migration Script
 * 
 * Migrates health data from Neon (user_id based) to Supabase (health_id based)
 * 
 * Run with: npx tsx server/scripts/migrate-health-data-to-supabase.ts
 */

import { db } from '../db';
import {
  users,
  profiles as neonProfiles,
  biomarkerTestSessions,
  biomarkerMeasurements,
  biomarkers,
  biomarkerSynonyms,
  biomarkerUnits,
  biomarkerReferenceRanges,
  healthkitSamples,
  healthkitWorkouts,
  diagnosticsStudies,
  lifeEvents,
  userDailyMetrics,
  flomentumDaily,
  sleepNights,
  nutritionDailyMetrics,
  mindfulnessSessions,
  mindfulnessDailyMetrics,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { getSupabaseClient } from '../services/supabaseClient';

const supabase = getSupabaseClient();

interface MigrationStats {
  users: number;
  profiles: number;
  biomarkersRef: number;
  biomarkerSessions: number;
  biomarkerMeasurements: number;
  healthkitSamples: number;
  healthkitWorkouts: number;
  diagnosticsStudies: number;
  lifeEvents: number;
  dailyMetrics: number;
  flomentumDaily: number;
  sleepNights: number;
  nutritionDailyMetrics: number;
  mindfulnessSessions: number;
  mindfulnessDailyMetrics: number;
  errors: string[];
}

const stats: MigrationStats = {
  users: 0,
  profiles: 0,
  biomarkersRef: 0,
  biomarkerSessions: 0,
  biomarkerMeasurements: 0,
  healthkitSamples: 0,
  healthkitWorkouts: 0,
  diagnosticsStudies: 0,
  lifeEvents: 0,
  dailyMetrics: 0,
  flomentumDaily: 0,
  sleepNights: 0,
  nutritionDailyMetrics: 0,
  mindfulnessSessions: 0,
  mindfulnessDailyMetrics: 0,
  errors: [],
};

async function getHealthIdMap(): Promise<Map<string, string>> {
  console.log('Building user_id -> health_id mapping...');
  
  const allUsers = await db
    .select({ id: users.id, healthId: users.healthId })
    .from(users);
  
  const map = new Map<string, string>();
  for (const user of allUsers) {
    if (user.healthId) {
      map.set(user.id, user.healthId);
    }
  }
  
  stats.users = map.size;
  console.log(`Found ${map.size} users with health_id`);
  return map;
}

async function migrateProfiles(healthIdMap: Map<string, string>) {
  console.log('\nMigrating profiles...');
  
  const neonProfileData = await db.select().from(neonProfiles);
  
  for (const profile of neonProfileData) {
    const healthId = healthIdMap.get(profile.userId);
    if (!healthId) {
      stats.errors.push(`Profile ${profile.id}: No health_id for user ${profile.userId}`);
      continue;
    }
    
    try {
      // Supabase still uses date_of_birth, convert birth_year to July 1st mid-year date
      const dateOfBirth = profile.birthYear 
        ? new Date(profile.birthYear, 6, 1).toISOString().split('T')[0] // YYYY-07-01
        : null;
      
      const { error } = await supabase.from('profiles').upsert({
        health_id: healthId,
        date_of_birth: dateOfBirth,
        sex: profile.sex,
        weight: profile.weight,
        weight_unit: profile.weightUnit,
        height: profile.height,
        height_unit: profile.heightUnit,
        goals: profile.goals,
        health_baseline: profile.healthBaseline,
        ai_personalization: profile.aiPersonalization,
        created_at: profile.createdAt?.toISOString(),
        updated_at: profile.updatedAt?.toISOString(),
      }, { onConflict: 'health_id' });
      
      if (error) throw error;
      stats.profiles++;
    } catch (err: any) {
      stats.errors.push(`Profile ${profile.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.profiles} profiles`);
}

async function migrateBiomarkersReference() {
  console.log('\nMigrating biomarkers reference data...');
  
  // Get all biomarkers from Neon
  const allBiomarkers = await db.select().from(biomarkers);
  console.log(`  Found ${allBiomarkers.length} biomarkers in Neon`);
  
  // Upsert biomarkers to Supabase (matching Neon schema)
  for (const biomarker of allBiomarkers) {
    try {
      const { error } = await supabase.from('biomarkers').upsert({
        id: biomarker.id,
        name: biomarker.name,
        category: biomarker.category,
        canonical_unit: biomarker.canonicalUnit,
        display_unit_preference: biomarker.displayUnitPreference,
        precision: biomarker.precision,
        decimals_policy: biomarker.decimalsPolicy,
        global_default_ref_min: biomarker.globalDefaultRefMin,
        global_default_ref_max: biomarker.globalDefaultRefMax,
        created_at: biomarker.createdAt?.toISOString(),
      }, { onConflict: 'id' });
      
      if (error) throw error;
      stats.biomarkersRef++;
    } catch (err: any) {
      stats.errors.push(`Biomarker ${biomarker.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.biomarkersRef} biomarkers`);
}

async function migrateBiomarkerSessions(healthIdMap: Map<string, string>): Promise<Map<string, string>> {
  console.log('\nMigrating biomarker test sessions...');
  
  const sessions = await db.select().from(biomarkerTestSessions);
  const sessionIdMap = new Map<string, string>(); // old_id -> new_id
  
  for (const session of sessions) {
    const healthId = healthIdMap.get(session.userId);
    if (!healthId) {
      stats.errors.push(`Session ${session.id}: No health_id for user ${session.userId}`);
      continue;
    }
    
    try {
      const { data, error } = await supabase.from('biomarker_test_sessions').insert({
        health_id: healthId,
        source: session.source,
        test_date: session.testDate.toISOString(),
        notes: session.notes,
        created_at: session.createdAt?.toISOString(),
      }).select().single();
      
      if (error) throw error;
      if (data) {
        sessionIdMap.set(session.id, data.id);
        stats.biomarkerSessions++;
      }
    } catch (err: any) {
      stats.errors.push(`Session ${session.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.biomarkerSessions} biomarker sessions`);
  return sessionIdMap;
}

async function migrateBiomarkerMeasurements(sessionIdMap: Map<string, string>) {
  console.log('\nMigrating biomarker measurements...');
  
  const measurements = await db.select().from(biomarkerMeasurements);
  
  for (const measurement of measurements) {
    const newSessionId = sessionIdMap.get(measurement.sessionId);
    if (!newSessionId) {
      // Session wasn't migrated, skip
      continue;
    }
    
    try {
      const { error } = await supabase.from('biomarker_measurements').insert({
        session_id: newSessionId,
        biomarker_id: measurement.biomarkerId, // Assuming biomarkers table is synced
        record_id: measurement.recordId,
        source: measurement.source,
        value_raw: measurement.valueRaw,
        unit_raw: measurement.unitRaw,
        value_canonical: measurement.valueCanonical,
        unit_canonical: measurement.unitCanonical,
        value_display: measurement.valueDisplay,
        reference_low: measurement.referenceLow,
        reference_high: measurement.referenceHigh,
        flags: measurement.flags,
        warnings: measurement.warnings,
        normalization_context: measurement.normalizationContext,
        updated_by: measurement.updatedBy,
        created_at: measurement.createdAt?.toISOString(),
        updated_at: measurement.updatedAt?.toISOString(),
      });
      
      if (error) throw error;
      stats.biomarkerMeasurements++;
    } catch (err: any) {
      stats.errors.push(`Measurement ${measurement.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.biomarkerMeasurements} biomarker measurements`);
}

async function migrateHealthkitSamples(healthIdMap: Map<string, string>) {
  console.log('\nMigrating HealthKit samples...');
  
  // Process in batches to avoid memory issues
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const samples = await db
      .select()
      .from(healthkitSamples)
      .limit(batchSize)
      .offset(offset);
    
    if (samples.length === 0) {
      hasMore = false;
      break;
    }
    
    const samplesToInsert = [];
    for (const sample of samples) {
      const healthId = healthIdMap.get(sample.userId);
      if (!healthId) continue;
      
      samplesToInsert.push({
        health_id: healthId,
        data_type: sample.dataType,
        value: sample.value,
        unit: sample.unit,
        start_date: sample.startDate.toISOString(),
        end_date: sample.endDate.toISOString(),
        source_name: sample.sourceName,
        source_bundle_id: sample.sourceBundleId,
        device_name: sample.deviceName,
        device_manufacturer: sample.deviceManufacturer,
        device_model: sample.deviceModel,
        metadata: sample.metadata,
        uuid: sample.uuid,
        created_at: sample.createdAt?.toISOString(),
      });
    }
    
    if (samplesToInsert.length > 0) {
      try {
        const { error } = await supabase.from('healthkit_samples').upsert(
          samplesToInsert,
          { onConflict: 'uuid', ignoreDuplicates: true }
        );
        
        if (error) {
          stats.errors.push(`HealthKit batch at offset ${offset}: ${error.message}`);
        } else {
          stats.healthkitSamples += samplesToInsert.length;
        }
      } catch (err: any) {
        stats.errors.push(`HealthKit batch at offset ${offset}: ${err.message}`);
      }
    }
    
    offset += batchSize;
    if (offset % 10000 === 0) {
      console.log(`  Processed ${offset} samples...`);
    }
  }
  
  console.log(`Migrated ${stats.healthkitSamples} HealthKit samples`);
}

async function migrateHealthkitWorkouts(healthIdMap: Map<string, string>) {
  console.log('\nMigrating HealthKit workouts...');
  
  const workouts = await db.select().from(healthkitWorkouts);
  
  const workoutsToInsert = [];
  for (const workout of workouts) {
    const healthId = healthIdMap.get(workout.userId);
    if (!healthId) continue;
    
    workoutsToInsert.push({
      health_id: healthId,
      workout_type: workout.workoutType,
      start_date: workout.startDate.toISOString(),
      end_date: workout.endDate.toISOString(),
      duration: workout.duration,
      total_distance: workout.totalDistance,
      total_distance_unit: workout.totalDistanceUnit,
      total_energy_burned: workout.totalEnergyBurned,
      total_energy_burned_unit: workout.totalEnergyBurnedUnit,
      average_heart_rate: workout.averageHeartRate,
      max_heart_rate: workout.maxHeartRate,
      min_heart_rate: workout.minHeartRate,
      source_name: workout.sourceName,
      source_bundle_id: workout.sourceBundleId,
      device_name: workout.deviceName,
      device_manufacturer: workout.deviceManufacturer,
      device_model: workout.deviceModel,
      metadata: workout.metadata,
      uuid: workout.uuid,
      created_at: workout.createdAt?.toISOString(),
    });
  }
  
  if (workoutsToInsert.length > 0) {
    try {
      const { error } = await supabase.from('healthkit_workouts').upsert(
        workoutsToInsert,
        { onConflict: 'uuid', ignoreDuplicates: true }
      );
      
      if (error) throw error;
      stats.healthkitWorkouts = workoutsToInsert.length;
    } catch (err: any) {
      stats.errors.push(`HealthKit workouts: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.healthkitWorkouts} HealthKit workouts`);
}

async function migrateDiagnosticsStudies(healthIdMap: Map<string, string>) {
  console.log('\nMigrating diagnostics studies...');
  
  const studies = await db.select().from(diagnosticsStudies);
  
  for (const study of studies) {
    const healthId = healthIdMap.get(study.userId);
    if (!healthId) continue;
    
    try {
      const { error } = await supabase.from('diagnostics_studies').insert({
        health_id: healthId,
        type: study.type,
        source: study.source,
        study_date: study.studyDate.toISOString(),
        age_at_scan: study.ageAtScan,
        total_score_numeric: study.totalScoreNumeric,
        risk_category: study.riskCategory,
        age_percentile: study.agePercentile,
        ai_payload: study.aiPayload,
        status: study.status,
        created_at: study.createdAt?.toISOString(),
        updated_at: study.updatedAt?.toISOString(),
      });
      
      if (error) throw error;
      stats.diagnosticsStudies++;
    } catch (err: any) {
      stats.errors.push(`Study ${study.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.diagnosticsStudies} diagnostics studies`);
}

async function migrateLifeEvents(healthIdMap: Map<string, string>) {
  console.log('\nMigrating life events...');
  
  const events = await db.select().from(lifeEvents);
  
  for (const event of events) {
    const healthId = healthIdMap.get(event.userId);
    if (!healthId) continue;
    
    try {
      const { error } = await supabase.from('life_events').insert({
        health_id: healthId,
        event_type: event.eventType,
        details: event.details,
        notes: event.notes,
        happened_at: event.happenedAt.toISOString(),
        created_at: event.createdAt?.toISOString(),
      });
      
      if (error) throw error;
      stats.lifeEvents++;
    } catch (err: any) {
      stats.errors.push(`Life event ${event.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.lifeEvents} life events`);
}

async function migrateDailyMetrics(healthIdMap: Map<string, string>) {
  console.log('\nMigrating daily metrics...');
  
  const metrics = await db.select().from(userDailyMetrics);
  
  const metricsToInsert = [];
  for (const metric of metrics) {
    const healthId = healthIdMap.get(metric.userId);
    if (!healthId) continue;
    
    metricsToInsert.push({
      health_id: healthId,
      local_date: metric.localDate,
      timezone: metric.timezone,
      utc_day_start: metric.utcDayStart.toISOString(),
      utc_day_end: metric.utcDayEnd.toISOString(),
      steps_normalized: metric.stepsNormalized,
      steps_raw_sum: metric.stepsRawSum,
      steps_sources: metric.stepsSources,
      active_energy_kcal: metric.activeEnergyKcal,
      exercise_minutes: metric.exerciseMinutes,
      sleep_hours: metric.sleepHours,
      resting_hr_bpm: metric.restingHrBpm,
      hrv_ms: metric.hrvMs,
      weight_kg: metric.weightKg,
      height_cm: metric.heightCm,
      bmi: metric.bmi,
      body_fat_percent: metric.bodyFatPercent,
      lean_body_mass_kg: metric.leanBodyMassKg,
      waist_circumference_cm: metric.waistCircumferenceCm,
      distance_meters: metric.distanceMeters,
      flights_climbed: metric.flightsClimbed,
      stand_hours: metric.standHours,
      avg_heart_rate_bpm: metric.avgHeartRateBpm,
      systolic_bp: metric.systolicBp,
      diastolic_bp: metric.diastolicBp,
      blood_glucose_mg_dl: metric.bloodGlucoseMgDl,
      vo2_max: metric.vo2Max,
      normalization_version: metric.normalizationVersion,
      created_at: metric.createdAt?.toISOString(),
      updated_at: metric.updatedAt?.toISOString(),
    });
  }
  
  // Insert in batches
  const batchSize = 500;
  for (let i = 0; i < metricsToInsert.length; i += batchSize) {
    const batch = metricsToInsert.slice(i, i + batchSize);
    try {
      const { error } = await supabase.from('user_daily_metrics').upsert(
        batch,
        { onConflict: 'health_id,local_date' }
      );
      
      if (error) throw error;
      stats.dailyMetrics += batch.length;
    } catch (err: any) {
      stats.errors.push(`Daily metrics batch ${i}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.dailyMetrics} daily metrics`);
}

async function migrateFlomentumDaily(healthIdMap: Map<string, string>) {
  console.log('\nMigrating Flōmentum daily scores...');
  
  const scores = await db.select().from(flomentumDaily);
  
  for (const score of scores) {
    const healthId = healthIdMap.get(score.userId);
    if (!healthId) continue;
    
    try {
      const { error } = await supabase.from('flomentum_daily').upsert({
        health_id: healthId,
        date: score.date,
        score: score.score,
        zone: score.zone,
        delta_vs_yesterday: score.deltaVsYesterday,
        factors: score.factors,
        daily_focus: score.dailyFocus,
        created_at: score.createdAt?.toISOString(),
        updated_at: score.updatedAt?.toISOString(),
      }, { onConflict: 'health_id,date' });
      
      if (error) throw error;
      stats.flomentumDaily++;
    } catch (err: any) {
      stats.errors.push(`Flomentum ${score.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.flomentumDaily} Flōmentum scores`);
}

async function migrateSleepNights(healthIdMap: Map<string, string>) {
  console.log('\nMigrating sleep nights...');
  
  const nights = await db.select().from(sleepNights);
  
  for (const night of nights) {
    const healthId = healthIdMap.get(night.userId);
    if (!healthId) continue;
    
    try {
      const { error } = await supabase.from('sleep_nights').upsert({
        health_id: healthId,
        sleep_date: night.sleepDate,
        timezone: night.timezone,
        night_start: night.nightStart?.toISOString(),
        final_wake: night.finalWake?.toISOString(),
        sleep_onset: night.sleepOnset?.toISOString(),
        time_in_bed_min: night.timeInBedMin,
        total_sleep_min: night.totalSleepMin,
        sleep_efficiency_pct: night.sleepEfficiencyPct,
        sleep_latency_min: night.sleepLatencyMin,
        waso_min: night.wasoMin,
        num_awakenings: night.numAwakenings,
        core_sleep_min: night.coreSleepMin,
        deep_sleep_min: night.deepSleepMin,
        rem_sleep_min: night.remSleepMin,
        unspecified_sleep_min: night.unspecifiedSleepMin,
        awake_in_bed_min: night.awakeInBedMin,
        mid_sleep_time_local: night.midSleepTimeLocal,
        fragmentation_index: night.fragmentationIndex,
        deep_pct: night.deepPct,
        rem_pct: night.remPct,
        core_pct: night.corePct,
        bedtime_local: night.bedtimeLocal,
        waketime_local: night.waketimeLocal,
        resting_hr_bpm: night.restingHrBpm,
        hrv_ms: night.hrvMs,
        respiratory_rate: night.respiratoryRate,
        wrist_temperature: night.wristTemperature,
        oxygen_saturation: night.oxygenSaturation,
        created_at: night.createdAt?.toISOString(),
        updated_at: night.updatedAt?.toISOString(),
      }, { onConflict: 'health_id,sleep_date' });
      
      if (error) throw error;
      stats.sleepNights++;
    } catch (err: any) {
      stats.errors.push(`Sleep night ${night.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.sleepNights} sleep nights`);
}

async function migrateNutritionDailyMetrics(healthIdMap: Map<string, string>) {
  console.log('\nMigrating nutrition daily metrics...');
  
  const records = await db.select().from(nutritionDailyMetrics);
  
  for (const record of records) {
    const healthId = healthIdMap.get(record.userId);
    if (!healthId) continue;
    
    try {
      const { error } = await supabase.from('nutrition_daily_metrics').upsert({
        health_id: healthId,
        local_date: record.localDate,
        timezone: record.timezone,
        energy_kcal: record.energyKcal,
        carbohydrates_g: record.carbohydratesG,
        protein_g: record.proteinG,
        fat_total_g: record.fatTotalG,
        fat_saturated_g: record.fatSaturatedG,
        fat_polyunsaturated_g: record.fatPolyunsaturatedG,
        fat_monounsaturated_g: record.fatMonounsaturatedG,
        cholesterol_mg: record.cholesterolMg,
        fiber_g: record.fiberG,
        sugar_g: record.sugarG,
        vitamin_a_mcg: record.vitaminAMcg,
        vitamin_b6_mg: record.vitaminB6Mg,
        vitamin_b12_mcg: record.vitaminB12Mcg,
        vitamin_c_mg: record.vitaminCMg,
        vitamin_d_mcg: record.vitaminDMcg,
        vitamin_e_mg: record.vitaminEMg,
        vitamin_k_mcg: record.vitaminKMcg,
        thiamin_mg: record.thiaminMg,
        riboflavin_mg: record.riboflavinMg,
        niacin_mg: record.niacinMg,
        folate_mcg: record.folateMcg,
        biotin_mcg: record.biotinMcg,
        pantothenic_acid_mg: record.pantothenicAcidMg,
        calcium_mg: record.calciumMg,
        chloride_mg: record.chlorideMg,
        chromium_mcg: record.chromiumMcg,
        copper_mg: record.copperMg,
        iodine_mcg: record.iodineMcg,
        iron_mg: record.ironMg,
        magnesium_mg: record.magnesiumMg,
        manganese_mg: record.manganeseMg,
        molybdenum_mcg: record.molybdenumMcg,
        phosphorus_mg: record.phosphorusMg,
        potassium_mg: record.potassiumMg,
        selenium_mcg: record.seleniumMcg,
        sodium_mg: record.sodiumMg,
        zinc_mg: record.zincMg,
        caffeine_mg: record.caffeineMg,
        water_ml: record.waterMl,
        meal_count: record.mealCount,
        sources: record.sources,
        created_at: record.createdAt?.toISOString(),
        updated_at: record.updatedAt?.toISOString(),
      }, { onConflict: 'health_id,local_date' });
      
      if (error) throw error;
      stats.nutritionDailyMetrics++;
    } catch (err: any) {
      stats.errors.push(`Nutrition daily ${record.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.nutritionDailyMetrics} nutrition daily metrics`);
}

async function migrateMindfulnessSessions(healthIdMap: Map<string, string>) {
  console.log('\nMigrating mindfulness sessions...');
  
  const sessions = await db.select().from(mindfulnessSessions);
  
  for (const session of sessions) {
    const healthId = healthIdMap.get(session.userId);
    if (!healthId) continue;
    
    try {
      const { error } = await supabase.from('mindfulness_sessions').upsert({
        health_id: healthId,
        session_date: session.sessionDate,
        timezone: session.timezone,
        start_time: session.startTime.toISOString(),
        end_time: session.endTime.toISOString(),
        duration_minutes: session.durationMinutes,
        source_name: session.sourceName,
        source_id: session.sourceId,
        healthkit_uuid: session.healthkitUuid,
        created_at: session.createdAt?.toISOString(),
        updated_at: session.updatedAt?.toISOString(),
      }, { onConflict: 'health_id,healthkit_uuid' });
      
      if (error) throw error;
      stats.mindfulnessSessions++;
    } catch (err: any) {
      stats.errors.push(`Mindfulness session ${session.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.mindfulnessSessions} mindfulness sessions`);
}

async function migrateMindfulnessDailyMetrics(healthIdMap: Map<string, string>) {
  console.log('\nMigrating mindfulness daily metrics...');
  
  const records = await db.select().from(mindfulnessDailyMetrics);
  
  for (const record of records) {
    const healthId = healthIdMap.get(record.userId);
    if (!healthId) continue;
    
    try {
      const { error } = await supabase.from('mindfulness_daily_metrics').upsert({
        health_id: healthId,
        local_date: record.localDate,
        timezone: record.timezone,
        total_minutes: record.totalMinutes,
        session_count: record.sessionCount,
        avg_session_minutes: record.avgSessionMinutes,
        longest_session_minutes: record.longestSessionMinutes,
        sources: record.sources,
        created_at: record.createdAt?.toISOString(),
        updated_at: record.updatedAt?.toISOString(),
      }, { onConflict: 'health_id,local_date' });
      
      if (error) throw error;
      stats.mindfulnessDailyMetrics++;
    } catch (err: any) {
      stats.errors.push(`Mindfulness daily ${record.id}: ${err.message}`);
    }
  }
  
  console.log(`Migrated ${stats.mindfulnessDailyMetrics} mindfulness daily metrics`);
}

async function runMigration() {
  console.log('=' .repeat(60));
  console.log('HEALTH DATA MIGRATION: Neon -> Supabase');
  console.log('=' .repeat(60));
  console.log('Start time:', new Date().toISOString());
  console.log();
  
  try {
    // Build the mapping
    const healthIdMap = await getHealthIdMap();
    
    // Migrate reference data first (required for foreign keys)
    await migrateBiomarkersReference();
    
    // Migrate user-linked health data
    await migrateProfiles(healthIdMap);
    const sessionIdMap = await migrateBiomarkerSessions(healthIdMap);
    await migrateBiomarkerMeasurements(sessionIdMap);
    await migrateHealthkitSamples(healthIdMap);
    await migrateHealthkitWorkouts(healthIdMap);
    await migrateDiagnosticsStudies(healthIdMap);
    await migrateLifeEvents(healthIdMap);
    await migrateDailyMetrics(healthIdMap);
    await migrateFlomentumDaily(healthIdMap);
    await migrateSleepNights(healthIdMap);
    await migrateNutritionDailyMetrics(healthIdMap);
    await migrateMindfulnessSessions(healthIdMap);
    await migrateMindfulnessDailyMetrics(healthIdMap);
    
    // Print summary
    console.log('\n' + '=' .repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('=' .repeat(60));
    console.log(`Users with health_id: ${stats.users}`);
    console.log(`Biomarkers (reference): ${stats.biomarkersRef}`);
    console.log(`Profiles: ${stats.profiles}`);
    console.log(`Biomarker sessions: ${stats.biomarkerSessions}`);
    console.log(`Biomarker measurements: ${stats.biomarkerMeasurements}`);
    console.log(`HealthKit samples: ${stats.healthkitSamples}`);
    console.log(`HealthKit workouts: ${stats.healthkitWorkouts}`);
    console.log(`Diagnostics studies: ${stats.diagnosticsStudies}`);
    console.log(`Life events: ${stats.lifeEvents}`);
    console.log(`Daily metrics: ${stats.dailyMetrics}`);
    console.log(`Flōmentum daily: ${stats.flomentumDaily}`);
    console.log(`Sleep nights: ${stats.sleepNights}`);
    console.log(`Nutrition daily metrics: ${stats.nutritionDailyMetrics}`);
    console.log(`Mindfulness sessions: ${stats.mindfulnessSessions}`);
    console.log(`Mindfulness daily metrics: ${stats.mindfulnessDailyMetrics}`);
    
    if (stats.errors.length > 0) {
      console.log(`\nErrors (${stats.errors.length}):`);
      stats.errors.slice(0, 20).forEach(e => console.log(`  - ${e}`));
      if (stats.errors.length > 20) {
        console.log(`  ... and ${stats.errors.length - 20} more errors`);
      }
    }
    
    console.log('\nEnd time:', new Date().toISOString());
    console.log('=' .repeat(60));
    
  } catch (err: any) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

// Run if called directly
runMigration().catch(console.error);
