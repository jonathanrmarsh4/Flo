-- ============================================================================
-- Flō Daily Reminder System - SQL Views for Clinical Context Aggregation
-- ============================================================================
-- These views aggregate health data from Neon for the Grok-powered daily reminder system
-- Each view is optimized for fast querying by the reminder generation service

-- View 1: Latest biomarker values with 90-day trends
-- Aggregates the most recent value for each biomarker + previous value for trend calculation
CREATE OR REPLACE VIEW user_current_biomarkers AS
SELECT 
  m.user_id,
  m.biomarker_name,
  m.value_numeric AS current_value,
  m.unit,
  m.date_taken AS current_date,
  LAG(m.value_numeric) OVER (PARTITION BY m.user_id, m.biomarker_name ORDER BY m.date_taken) AS previous_value,
  LAG(m.date_taken) OVER (PARTITION BY m.user_id, m.biomarker_name ORDER BY m.date_taken) AS previous_date,
  CASE 
    WHEN LAG(m.value_numeric) OVER (PARTITION BY m.user_id, m.biomarker_name ORDER BY m.date_taken) IS NOT NULL THEN
      ROUND(((m.value_numeric - LAG(m.value_numeric) OVER (PARTITION BY m.user_id, m.biomarker_name ORDER BY m.date_taken)) / 
        LAG(m.value_numeric) OVER (PARTITION BY m.user_id, m.biomarker_name ORDER BY m.date_taken) * 100)::numeric, 1)
    ELSE NULL
  END AS percent_change,
  ROW_NUMBER() OVER (PARTITION BY m.user_id, m.biomarker_name ORDER BY m.date_taken DESC) AS recency_rank
FROM measurements m
WHERE m.date_taken >= CURRENT_DATE - INTERVAL '90 days'
  AND m.value_numeric IS NOT NULL;

-- View 2: Latest DEXA scan with previous comparison
-- Shows current body composition and changes from previous scan
CREATE OR REPLACE VIEW user_dexa_latest AS
SELECT 
  d.user_id,
  d.scan_date AS latest_scan_date,
  d.body_fat_percentage,
  d.lean_mass_kg,
  d.fat_mass_kg,
  d.bone_mineral_density_g_cm2,
  d.visceral_fat_area_cm2,
  d.android_fat_percentage,
  d.gynoid_fat_percentage,
  d.android_gynoid_ratio,
  LAG(d.body_fat_percentage) OVER (PARTITION BY d.user_id ORDER BY d.scan_date) AS prev_body_fat_percentage,
  LAG(d.visceral_fat_area_cm2) OVER (PARTITION BY d.user_id ORDER BY d.scan_date) AS prev_visceral_fat_area_cm2,
  LAG(d.lean_mass_kg) OVER (PARTITION BY d.user_id ORDER BY d.scan_date) AS prev_lean_mass_kg,
  LAG(d.scan_date) OVER (PARTITION BY d.user_id ORDER BY d.scan_date) AS prev_scan_date,
  CASE 
    WHEN LAG(d.visceral_fat_area_cm2) OVER (PARTITION BY d.user_id ORDER BY d.scan_date) IS NOT NULL THEN
      ROUND((d.visceral_fat_area_cm2 - LAG(d.visceral_fat_area_cm2) OVER (PARTITION BY d.user_id ORDER BY d.scan_date))::numeric, 1)
    ELSE NULL
  END AS visceral_fat_change_cm2,
  ROW_NUMBER() OVER (PARTITION BY d.user_id ORDER BY d.scan_date DESC) AS scan_rank
FROM diagnostic_studies d
WHERE d.diagnostic_type = 'dexa_scan'
  AND d.scan_date IS NOT NULL;

-- View 3: 7-day and 30-day wearable averages (HRV, RHR, sleep, activity)
-- Aggregates user_daily_metrics into clinically useful windows
CREATE OR REPLACE VIEW user_wearable_7d AS
SELECT 
  user_id,
  -- 7-day averages
  ROUND(AVG(hrv_ms) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '7 days'), 1) AS hrv_7d_avg,
  ROUND(AVG(resting_hr_bpm) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '7 days'), 1) AS rhr_7d_avg,
  ROUND(AVG(sleep_hours) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '7 days'), 2) AS sleep_7d_avg,
  ROUND(AVG(active_energy_kcal) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '7 days'), 0) AS active_kcal_7d_avg,
  ROUND(AVG(steps_normalized) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '7 days'), 0) AS steps_7d_avg,
  ROUND(AVG(exercise_minutes) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '7 days'), 1) AS exercise_7d_avg,
  
  -- 30-day averages for baseline comparison
  ROUND(AVG(hrv_ms) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '30 days'), 1) AS hrv_30d_avg,
  ROUND(AVG(resting_hr_bpm) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '30 days'), 1) AS rhr_30d_avg,
  ROUND(AVG(sleep_hours) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '30 days'), 2) AS sleep_30d_avg,
  
  -- HRV trend indicator (7d vs 30d baseline)
  CASE 
    WHEN AVG(hrv_ms) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '30 days') > 0 THEN
      ROUND(((AVG(hrv_ms) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '7 days') - 
              AVG(hrv_ms) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '30 days')) / 
              AVG(hrv_ms) FILTER (WHERE utc_day_start >= CURRENT_DATE - INTERVAL '30 days') * 100)::numeric, 1)
    ELSE NULL
  END AS hrv_trend_percent
FROM user_daily_metrics
WHERE utc_day_start >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id;

-- View 4: 14-day behavior tracking (alcohol, sauna, stress, supplements, ice baths)
-- Extracts behavioral patterns from life events log
CREATE OR REPLACE VIEW user_behavior_14d AS
SELECT 
  le.user_id,
  -- Alcohol tracking
  COUNT(*) FILTER (WHERE le.event_type = 'alcohol') AS alcohol_events_14d,
  COALESCE(SUM((le.details->>'drinks')::int) FILTER (WHERE le.event_type = 'alcohol'), 0) AS total_drinks_14d,
  -- Zero-drink streak calculation (days since last alcohol event)
  COALESCE(
    CURRENT_DATE - MAX(le.happened_at::date) FILTER (WHERE le.event_type = 'alcohol'),
    365 -- If no alcohol events in 14 days, assume long streak
  ) AS zero_drink_streak_days,
  
  -- Sauna frequency
  COUNT(*) FILTER (WHERE le.event_type = 'sauna') AS sauna_sessions_14d,
  
  -- Ice bath/cold exposure
  COUNT(*) FILTER (WHERE le.event_type = 'ice_bath' OR le.event_type = 'ice bath') AS ice_bath_sessions_14d,
  
  -- Supplement tracking
  COUNT(*) FILTER (WHERE le.event_type = 'supplements') AS supplement_events_14d,
  
  -- Stress events (if tracked via symptoms with severity)
  COUNT(*) FILTER (WHERE le.event_type = 'symptom' AND le.details->>'symptom' = 'stress') AS stress_events_14d,
  
  -- Late meal events
  COUNT(*) FILTER (WHERE le.event_type = 'late_meal' OR le.event_type = 'late meal') AS late_meal_events_14d
  
FROM life_events le
WHERE le.happened_at >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY le.user_id;

-- View 5: Training load (Zone 2, Zone 5, strength, total kcal)
-- Aggregates workout data from HealthKit workout sessions
CREATE OR REPLACE VIEW user_training_load AS
SELECT 
  hw.user_id,
  -- Zone 2 volume (assuming heart rate 60-70% max or workout types like walking, cycling)
  COALESCE(SUM(hw.duration_minutes) FILTER (
    WHERE hw.workout_type IN ('Walking', 'Cycling', 'TraditionalStrengthTraining', 'Yoga')
      AND (hw.average_heart_rate_bpm IS NULL OR hw.average_heart_rate_bpm BETWEEN 100 AND 140)
  ), 0) AS zone2_minutes_7d,
  
  -- Zone 5 volume (high intensity - HIIT, running, rowing above 85% max HR)
  COALESCE(SUM(hw.duration_minutes) FILTER (
    WHERE hw.workout_type IN ('Running', 'HIIT', 'Rowing', 'Cycling')
      AND hw.average_heart_rate_bpm > 160
  ), 0) AS zone5_minutes_7d,
  
  -- Strength sessions count
  COALESCE(COUNT(*) FILTER (WHERE hw.workout_type = 'TraditionalStrengthTraining'), 0) AS strength_sessions_7d,
  
  -- Total active calories from workouts
  COALESCE(SUM(hw.total_energy_burned_kcal), 0) AS total_workout_kcal_7d,
  
  -- Total workout volume
  COALESCE(SUM(hw.duration_minutes), 0) AS total_workout_minutes_7d
  
FROM healthkit_workouts hw
WHERE hw.start_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY hw.user_id;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_measurements_user_date ON measurements(user_id, date_taken DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_studies_user_type ON diagnostic_studies(user_id, diagnostic_type, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_daily_metrics_user_date ON user_daily_metrics(user_id, utc_day_start DESC);
CREATE INDEX IF NOT EXISTS idx_life_events_user_date ON life_events(user_id, happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_healthkit_workouts_user_date ON healthkit_workouts(user_id, start_date DESC);
