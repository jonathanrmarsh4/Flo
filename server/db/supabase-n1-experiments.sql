-- N-of-1 Supplement Experiment Tables
-- These tables store experiment data for tracking supplement efficacy
-- Uses the same pseudonymous health_id pattern as other health tables

-- Experiment status enum (using CHECK constraint for Supabase compatibility)
-- pending: experiment created but not yet started (waiting for baseline)
-- baseline: collecting baseline data
-- active: user is taking the supplement
-- washout: washout period before starting
-- completed: experiment finished, results calculated
-- paused: user paused the experiment
-- cancelled: user cancelled the experiment

-- Main experiments table
CREATE TABLE IF NOT EXISTS n1_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  
  -- Supplement type (from our configuration matrix)
  supplement_type_id VARCHAR(100) NOT NULL,
  
  -- Actual product details from DSLD API or user input
  product_name TEXT NOT NULL,
  product_brand TEXT,
  product_barcode TEXT,
  product_image_url TEXT,
  product_strength TEXT,
  product_serving_size TEXT,
  product_dsld_id TEXT,
  
  -- User's dosage configuration
  dosage_amount REAL NOT NULL,
  dosage_unit TEXT NOT NULL DEFAULT 'mg',
  dosage_frequency TEXT NOT NULL DEFAULT 'daily',
  dosage_timing TEXT,
  
  -- User's selected intent/goal
  primary_intent TEXT NOT NULL,
  
  -- Experiment timing
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'baseline', 'active', 'washout', 'completed', 'paused', 'cancelled')),
  baseline_days INTEGER NOT NULL DEFAULT 14,
  experiment_days INTEGER NOT NULL DEFAULT 30,
  washout_days INTEGER,
  
  -- Actual dates
  created_at TIMESTAMP DEFAULT NOW(),
  baseline_start_date TIMESTAMP,
  experiment_start_date TIMESTAMP,
  experiment_end_date TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Noise filters configuration (JSON array of filter types)
  noise_filters JSONB DEFAULT '["alcohol", "extreme_activity", "sickness"]',
  
  -- Updated tracking
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_n1_experiments_health_id ON n1_experiments(health_id);
CREATE INDEX IF NOT EXISTS idx_n1_experiments_status ON n1_experiments(status);
CREATE INDEX IF NOT EXISTS idx_n1_experiments_health_status ON n1_experiments(health_id, status);

-- Experiment metrics configuration
-- Stores which metrics are being tracked for each experiment
CREATE TABLE IF NOT EXISTS n1_experiment_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES n1_experiments(id) ON DELETE CASCADE,
  
  -- Metric identification
  metric_name TEXT NOT NULL,
  metric_type VARCHAR(20) NOT NULL CHECK (metric_type IN ('objective', 'subjective')),
  
  -- Source for objective metrics (e.g., "Apple HealthKit", "Oura Ring", "Dexcom CGM")
  data_source TEXT,
  
  -- Mapping to HealthKit/ClickHouse field names
  healthkit_type TEXT,
  clickhouse_metric TEXT,
  
  -- Expected onset and success criteria
  baseline_duration_days INTEGER NOT NULL DEFAULT 7,
  expected_onset_days INTEGER NOT NULL DEFAULT 3,
  success_criteria TEXT,
  minimum_effect_percent REAL,
  
  -- For subjective metrics: scale configuration
  scale_min REAL DEFAULT 0,
  scale_max REAL DEFAULT 10,
  daily_checkin BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_n1_metrics_experiment ON n1_experiment_metrics(experiment_id);
CREATE INDEX IF NOT EXISTS idx_n1_metrics_type ON n1_experiment_metrics(metric_type);

-- Daily check-ins for subjective metrics
CREATE TABLE IF NOT EXISTS n1_daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES n1_experiments(id) ON DELETE CASCADE,
  health_id UUID NOT NULL,
  
  -- Check-in timing
  checkin_date DATE NOT NULL,
  checkin_timestamp TIMESTAMP DEFAULT NOW(),
  
  -- Phase tracking
  phase VARCHAR(20) NOT NULL CHECK (phase IN ('baseline', 'active', 'washout')),
  day_number INTEGER NOT NULL,
  
  -- Subjective ratings (JSONB for flexibility)
  -- Format: { "metric_name": value, "Sleep Quality": 7.5, "Energy Level": 6 }
  ratings JSONB NOT NULL DEFAULT '{}',
  
  -- Optional notes
  notes TEXT,
  
  -- Noise flags for this day
  noise_flags JSONB DEFAULT '[]',
  
  -- Source tracking
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'push_notification', 'dashboard_popup', 'reminder')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(experiment_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_n1_checkins_experiment ON n1_daily_checkins(experiment_id);
CREATE INDEX IF NOT EXISTS idx_n1_checkins_health_date ON n1_daily_checkins(health_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_n1_checkins_phase ON n1_daily_checkins(experiment_id, phase);

-- Experiment results
-- Stores calculated effect sizes and verdict
CREATE TABLE IF NOT EXISTS n1_experiment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES n1_experiments(id) ON DELETE CASCADE,
  
  -- Calculation metadata
  calculated_at TIMESTAMP DEFAULT NOW(),
  baseline_days_used INTEGER NOT NULL,
  experiment_days_used INTEGER NOT NULL,
  noisy_days_excluded INTEGER DEFAULT 0,
  
  -- Per-metric results (JSONB array)
  -- Format: [{ metric_name, effect_size, baseline_mean, baseline_std, experiment_mean, verdict, confidence }]
  metric_results JSONB NOT NULL DEFAULT '[]',
  
  -- Overall verdict
  overall_verdict VARCHAR(20) CHECK (overall_verdict IN ('strong_success', 'moderate_benefit', 'no_effect', 'negative_effect', 'insufficient_data')),
  overall_effect_size REAL,
  
  -- AI-generated summary
  ai_summary TEXT,
  ai_recommendations JSONB,
  
  -- Statistical confidence
  confidence_level REAL,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_n1_results_experiment ON n1_experiment_results(experiment_id);

-- RLS Policies (matching existing pattern)
ALTER TABLE n1_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE n1_experiment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE n1_daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE n1_experiment_results ENABLE ROW LEVEL SECURITY;

-- Service role policies (backend access)
CREATE POLICY "n1_experiments_service_all" ON n1_experiments FOR ALL TO service_role USING (true);
CREATE POLICY "n1_experiment_metrics_service_all" ON n1_experiment_metrics FOR ALL TO service_role USING (true);
CREATE POLICY "n1_daily_checkins_service_all" ON n1_daily_checkins FOR ALL TO service_role USING (true);
CREATE POLICY "n1_experiment_results_service_all" ON n1_experiment_results FOR ALL TO service_role USING (true);
