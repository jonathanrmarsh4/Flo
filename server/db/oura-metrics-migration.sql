-- Oura Extended Metrics Migration
-- New tables for stress, resilience, SpO2, and sleep time recommendations

-- Oura Daily Stress - Tracks daytime stress and recovery patterns
CREATE TABLE IF NOT EXISTS oura_daily_stress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  day TEXT NOT NULL,
  oura_id TEXT,
  stress_high_seconds INTEGER,
  recovery_high_seconds INTEGER,
  day_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oura_daily_stress_unique ON oura_daily_stress(health_id, day);
CREATE INDEX IF NOT EXISTS idx_oura_daily_stress_health_day ON oura_daily_stress(health_id, day);

-- Oura Daily Resilience - Measures ability to cope with stress
CREATE TABLE IF NOT EXISTS oura_daily_resilience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  day TEXT NOT NULL,
  oura_id TEXT,
  level TEXT,
  contributor_sleep INTEGER,
  contributor_stress INTEGER,
  contributor_daytime_recovery INTEGER,
  contributor_activity_balance INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oura_daily_resilience_unique ON oura_daily_resilience(health_id, day);
CREATE INDEX IF NOT EXISTS idx_oura_daily_resilience_health_day ON oura_daily_resilience(health_id, day);

-- Oura Daily SpO2 - Blood oxygen saturation during sleep
CREATE TABLE IF NOT EXISTS oura_daily_spo2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  day TEXT NOT NULL,
  oura_id TEXT,
  spo2_average REAL,
  breathing_disturbance_index REAL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oura_daily_spo2_unique ON oura_daily_spo2(health_id, day);
CREATE INDEX IF NOT EXISTS idx_oura_daily_spo2_health_day ON oura_daily_spo2(health_id, day);

-- Oura Sleep Time Recommendations - Optimal bedtime windows
CREATE TABLE IF NOT EXISTS oura_sleep_time (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  day TEXT NOT NULL,
  oura_id TEXT,
  optimal_bedtime_start_offset INTEGER,
  optimal_bedtime_end_offset INTEGER,
  optimal_bedtime_day_tz INTEGER,
  recommendation TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oura_sleep_time_unique ON oura_sleep_time(health_id, day);
CREATE INDEX IF NOT EXISTS idx_oura_sleep_time_health_day ON oura_sleep_time(health_id, day);

-- Add temperature deviation columns to sleep_nights table if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sleep_nights' AND column_name = 'skin_temp_deviation') THEN
    ALTER TABLE sleep_nights ADD COLUMN skin_temp_deviation REAL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sleep_nights' AND column_name = 'skin_temp_trend_deviation') THEN
    ALTER TABLE sleep_nights ADD COLUMN skin_temp_trend_deviation REAL;
  END IF;
END $$;

-- Enable Row Level Security on new tables
ALTER TABLE oura_daily_stress ENABLE ROW LEVEL SECURITY;
ALTER TABLE oura_daily_resilience ENABLE ROW LEVEL SECURITY;
ALTER TABLE oura_daily_spo2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE oura_sleep_time ENABLE ROW LEVEL SECURITY;

-- Create service role access policies for new tables
CREATE POLICY "Service role full access" ON oura_daily_stress FOR ALL USING (true);
CREATE POLICY "Service role full access" ON oura_daily_resilience FOR ALL USING (true);
CREATE POLICY "Service role full access" ON oura_daily_spo2 FOR ALL USING (true);
CREATE POLICY "Service role full access" ON oura_sleep_time FOR ALL USING (true);
