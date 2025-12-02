-- Supabase Health Data Tables
-- These tables store sensitive health data, linked by pseudonymous health_id
-- The health_id is a UUID that maps to users.health_id in Neon (never exposed here)

-- Profiles table (demographics, goals)
-- Note: We only store birth_year (not full DOB) for privacy - reduces re-identification risk
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL UNIQUE,
  birth_year INTEGER,
  sex VARCHAR(20) CHECK (sex IN ('male', 'female', 'other')),
  weight REAL,
  weight_unit VARCHAR(10) DEFAULT 'kg',
  height REAL,
  height_unit VARCHAR(10) DEFAULT 'cm',
  goals TEXT[],
  health_baseline JSONB,
  ai_personalization JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_health_id ON profiles(health_id);

-- Biomarkers reference table (shared definitions)
CREATE TABLE IF NOT EXISTS biomarkers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  canonical_unit TEXT NOT NULL,
  display_unit_preference TEXT,
  precision INTEGER DEFAULT 1,
  decimals_policy VARCHAR(20) DEFAULT 'round',
  global_default_ref_min REAL,
  global_default_ref_max REAL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Biomarker test sessions
CREATE TABLE IF NOT EXISTS biomarker_test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  test_date TIMESTAMP NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biomarker_sessions_health_date ON biomarker_test_sessions(health_id, test_date);

-- Biomarker measurements
CREATE TABLE IF NOT EXISTS biomarker_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES biomarker_test_sessions(id) ON DELETE CASCADE,
  biomarker_id UUID NOT NULL REFERENCES biomarkers(id) ON DELETE CASCADE,
  record_id UUID,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  value_raw REAL NOT NULL,
  unit_raw TEXT NOT NULL,
  value_canonical REAL NOT NULL,
  unit_canonical TEXT NOT NULL,
  value_display TEXT NOT NULL,
  reference_low REAL,
  reference_high REAL,
  flags TEXT[],
  warnings TEXT[],
  normalization_context JSONB,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biomarker_measurements_session ON biomarker_measurements(session_id);
CREATE INDEX IF NOT EXISTS idx_biomarker_measurements_biomarker ON biomarker_measurements(biomarker_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_biomarker_measurements_unique ON biomarker_measurements(session_id, biomarker_id);

-- HealthKit samples
CREATE TABLE IF NOT EXISTS healthkit_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  data_type TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  source_name TEXT,
  source_bundle_id TEXT,
  device_name TEXT,
  device_manufacturer TEXT,
  device_model TEXT,
  metadata JSONB,
  uuid TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healthkit_samples_health_type_date ON healthkit_samples(health_id, data_type, start_date);
CREATE INDEX IF NOT EXISTS idx_healthkit_samples_health_date ON healthkit_samples(health_id, start_date);
CREATE INDEX IF NOT EXISTS idx_healthkit_samples_uuid ON healthkit_samples(uuid);

-- HealthKit workouts
CREATE TABLE IF NOT EXISTS healthkit_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  workout_type TEXT NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  duration REAL NOT NULL,
  total_distance REAL,
  total_distance_unit TEXT,
  total_energy_burned REAL,
  total_energy_burned_unit TEXT,
  average_heart_rate REAL,
  max_heart_rate REAL,
  min_heart_rate REAL,
  source_name TEXT,
  source_bundle_id TEXT,
  device_name TEXT,
  device_manufacturer TEXT,
  device_model TEXT,
  metadata JSONB,
  uuid TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healthkit_workouts_health_date ON healthkit_workouts(health_id, start_date);
CREATE INDEX IF NOT EXISTS idx_healthkit_workouts_health_type ON healthkit_workouts(health_id, workout_type);
CREATE INDEX IF NOT EXISTS idx_healthkit_workouts_uuid ON healthkit_workouts(uuid);

-- Diagnostics studies (DEXA, CAC, etc.)
CREATE TABLE IF NOT EXISTS diagnostics_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('DEXA', 'CAC', 'Echocardiogram', 'VO2max_test', 'Colonoscopy', 'MRI', 'Ultrasound', 'Other')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('pdf_upload', 'manual_entry', 'api_sync')),
  study_date TIMESTAMP NOT NULL,
  age_at_scan INTEGER,
  total_score_numeric REAL,
  risk_category TEXT,
  age_percentile INTEGER,
  ai_payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'parsed' CHECK (status IN ('pending', 'parsed', 'error')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_health_type_date ON diagnostics_studies(health_id, type, study_date);

-- Life events
CREATE TABLE IF NOT EXISTS life_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  notes TEXT,
  happened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_life_events_health_time ON life_events(health_id, happened_at);
CREATE INDEX IF NOT EXISTS idx_life_events_type ON life_events(event_type);

-- User daily metrics
CREATE TABLE IF NOT EXISTS user_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  local_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  utc_day_start TIMESTAMP NOT NULL,
  utc_day_end TIMESTAMP NOT NULL,
  steps_normalized INTEGER,
  steps_raw_sum INTEGER,
  steps_sources JSONB,
  active_energy_kcal REAL,
  exercise_minutes REAL,
  sleep_hours REAL,
  resting_hr_bpm REAL,
  hrv_ms REAL,
  weight_kg REAL,
  height_cm REAL,
  bmi REAL,
  body_fat_percent REAL,
  lean_body_mass_kg REAL,
  waist_circumference_cm REAL,
  distance_meters REAL,
  flights_climbed INTEGER,
  stand_hours INTEGER,
  avg_heart_rate_bpm REAL,
  systolic_bp REAL,
  diastolic_bp REAL,
  blood_glucose_mg_dl REAL,
  vo2_max REAL,
  basal_energy_kcal REAL,
  walking_hr_avg_bpm REAL,
  dietary_water_ml REAL,
  oxygen_saturation_pct REAL,
  respiratory_rate_bpm REAL,
  -- Gait & Mobility metrics (8 columns)
  walking_speed_ms REAL,
  walking_step_length_m REAL,
  walking_double_support_pct REAL,
  walking_asymmetry_pct REAL,
  apple_walking_steadiness REAL,
  six_minute_walk_distance_m REAL,
  stair_ascent_speed_ms REAL,
  stair_descent_speed_ms REAL,
  normalization_version TEXT NOT NULL DEFAULT 'norm_v1',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_daily_metrics_unique ON user_daily_metrics(health_id, local_date);
CREATE INDEX IF NOT EXISTS idx_user_daily_metrics_health_date ON user_daily_metrics(health_id, local_date);

-- Flomentum daily scores
CREATE TABLE IF NOT EXISTS flomentum_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  date TEXT NOT NULL,
  score INTEGER NOT NULL,
  zone VARCHAR(20) NOT NULL CHECK (zone IN ('BUILDING', 'MAINTAINING', 'DRAINING')),
  delta_vs_yesterday INTEGER,
  factors JSONB NOT NULL,
  daily_focus JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_flomentum_daily_unique ON flomentum_daily(health_id, date);
CREATE INDEX IF NOT EXISTS idx_flomentum_daily_health_date ON flomentum_daily(health_id, date);

-- Sleep nights (matches Neon schema exactly)
CREATE TABLE IF NOT EXISTS sleep_nights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  sleep_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  night_start TIMESTAMP,
  final_wake TIMESTAMP,
  sleep_onset TIMESTAMP,
  time_in_bed_min REAL,
  total_sleep_min REAL,
  sleep_efficiency_pct REAL,
  sleep_latency_min REAL,
  waso_min REAL,
  num_awakenings INTEGER,
  core_sleep_min REAL,
  deep_sleep_min REAL,
  rem_sleep_min REAL,
  unspecified_sleep_min REAL,
  awake_in_bed_min REAL,
  mid_sleep_time_local REAL,
  fragmentation_index REAL,
  deep_pct REAL,
  rem_pct REAL,
  core_pct REAL,
  bedtime_local TEXT,
  waketime_local TEXT,
  resting_hr_bpm REAL,
  hrv_ms REAL,
  respiratory_rate REAL,
  wrist_temperature REAL,
  oxygen_saturation REAL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_nights_unique ON sleep_nights(health_id, sleep_date);
CREATE INDEX IF NOT EXISTS idx_sleep_nights_health_date ON sleep_nights(health_id, sleep_date);

-- Action plan items (health goals/interventions)
CREATE TABLE IF NOT EXISTS action_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  priority INTEGER DEFAULT 0,
  target_value REAL,
  target_unit TEXT,
  current_value REAL,
  progress_percent REAL,
  start_date TIMESTAMP,
  target_date TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'ai_suggested', 'system')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_plan_health_status ON action_plan_items(health_id, status);
CREATE INDEX IF NOT EXISTS idx_action_plan_health_category ON action_plan_items(health_id, category);

-- User conversational memory (AI persistent memory for personal context)
-- Stores extracted memories from conversations: goals, moods, symptoms, habits, life events, preferences
-- Uses JSONB for flexible schema-less storage with GIN indexes for fast retrieval
CREATE TABLE IF NOT EXISTS user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  session_id UUID,                                    -- Optional: link to specific chat session
  occurred_at TIMESTAMPTZ DEFAULT NOW(),              -- When this memory/event happened
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,          -- Flexible memory payload (type, raw, extracted, importance)
  tags TEXT[] DEFAULT '{}',                           -- Quick filtering tags (goal, mood, symptom, habit, etc.)
  embedding VECTOR(1536),                             -- Optional: for semantic search (text-embedding-3-small)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_memory IS 'AI conversational memory for holistic personal understanding - goals, moods, habits, life events';
COMMENT ON COLUMN user_memory.memory IS 'JSONB with type, raw text, extracted facts, importance, linked metrics';
COMMENT ON COLUMN user_memory.tags IS 'Quick filter tags: goal, mood, symptom, habit, personal_life, etc.';
COMMENT ON COLUMN user_memory.embedding IS 'Vector embedding for semantic search (nullable until populated)';

CREATE INDEX IF NOT EXISTS idx_user_memory_health_time ON user_memory(health_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_memory_tags ON user_memory USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_user_memory_json ON user_memory USING GIN(memory jsonb_path_ops);

-- Nutrition Daily Metrics - Daily aggregation of all 38 nutrition types from HealthKit
CREATE TABLE IF NOT EXISTS nutrition_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  local_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  -- Macronutrients
  energy_kcal REAL,
  carbohydrates_g REAL,
  protein_g REAL,
  fat_total_g REAL,
  fat_saturated_g REAL,
  fat_polyunsaturated_g REAL,
  fat_monounsaturated_g REAL,
  cholesterol_mg REAL,
  fiber_g REAL,
  sugar_g REAL,
  -- Vitamins
  vitamin_a_mcg REAL,
  vitamin_b6_mg REAL,
  vitamin_b12_mcg REAL,
  vitamin_c_mg REAL,
  vitamin_d_mcg REAL,
  vitamin_e_mg REAL,
  vitamin_k_mcg REAL,
  thiamin_mg REAL,
  riboflavin_mg REAL,
  niacin_mg REAL,
  folate_mcg REAL,
  biotin_mcg REAL,
  pantothenic_acid_mg REAL,
  -- Minerals
  calcium_mg REAL,
  chloride_mg REAL,
  chromium_mcg REAL,
  copper_mg REAL,
  iodine_mcg REAL,
  iron_mg REAL,
  magnesium_mg REAL,
  manganese_mg REAL,
  molybdenum_mcg REAL,
  phosphorus_mg REAL,
  potassium_mg REAL,
  selenium_mcg REAL,
  sodium_mg REAL,
  zinc_mg REAL,
  -- Other
  caffeine_mg REAL,
  water_ml REAL,
  meal_count INTEGER,
  sources JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_daily_unique ON nutrition_daily_metrics(health_id, local_date);
CREATE INDEX IF NOT EXISTS idx_nutrition_daily_health_date ON nutrition_daily_metrics(health_id, local_date);

-- Mindfulness Sessions - Individual meditation/mindfulness sessions from HealthKit
CREATE TABLE IF NOT EXISTS mindfulness_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  session_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  duration_minutes REAL NOT NULL,
  source_name TEXT,
  source_id TEXT,
  healthkit_uuid TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mindfulness_sessions_health_date ON mindfulness_sessions(health_id, session_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mindfulness_sessions_uuid ON mindfulness_sessions(health_id, healthkit_uuid);

-- Mindfulness Daily Metrics - Daily aggregation of mindfulness sessions
CREATE TABLE IF NOT EXISTS mindfulness_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  local_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  total_minutes REAL NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  avg_session_minutes REAL,
  longest_session_minutes REAL,
  sources JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mindfulness_daily_unique ON mindfulness_daily_metrics(health_id, local_date);
CREATE INDEX IF NOT EXISTS idx_mindfulness_daily_health_date ON mindfulness_daily_metrics(health_id, local_date);

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE biomarker_test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE biomarker_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthkit_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthkit_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE flomentum_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_nights ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindfulness_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindfulness_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access (backend server uses service key)
CREATE POLICY "Service role full access" ON profiles FOR ALL USING (true);
CREATE POLICY "Service role full access" ON biomarker_test_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON biomarker_measurements FOR ALL USING (true);
CREATE POLICY "Service role full access" ON healthkit_samples FOR ALL USING (true);
CREATE POLICY "Service role full access" ON healthkit_workouts FOR ALL USING (true);
CREATE POLICY "Service role full access" ON diagnostics_studies FOR ALL USING (true);
CREATE POLICY "Service role full access" ON life_events FOR ALL USING (true);
CREATE POLICY "Service role full access" ON user_daily_metrics FOR ALL USING (true);
CREATE POLICY "Service role full access" ON flomentum_daily FOR ALL USING (true);
CREATE POLICY "Service role full access" ON sleep_nights FOR ALL USING (true);
CREATE POLICY "Service role full access" ON action_plan_items FOR ALL USING (true);
CREATE POLICY "Service role full access" ON user_memory FOR ALL USING (true);
CREATE POLICY "Service role full access" ON nutrition_daily_metrics FOR ALL USING (true);
CREATE POLICY "Service role full access" ON mindfulness_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON mindfulness_daily_metrics FOR ALL USING (true);

-- Biomarkers table is reference data, allow read access
ALTER TABLE biomarkers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON biomarkers FOR SELECT USING (true);
CREATE POLICY "Service role full access" ON biomarkers FOR ALL USING (true);
