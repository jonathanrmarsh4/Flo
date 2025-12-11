-- Migration: Add extended data source support
-- This migration extends the source column to support Oura, Dexcom, and future integrations

-- Step 1: Update sleep_nights source constraint to include new sources
-- First, drop the old constraint, then add the new one
ALTER TABLE sleep_nights DROP CONSTRAINT IF EXISTS sleep_nights_source_check;
ALTER TABLE sleep_nights 
  ADD CONSTRAINT sleep_nights_source_check 
  CHECK (source IN ('manual', 'healthkit', 'oura', 'dexcom'));

-- Step 2: Add source column to user_daily_metrics if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_daily_metrics' AND column_name = 'source') THEN
    ALTER TABLE user_daily_metrics ADD COLUMN source VARCHAR(20) DEFAULT 'healthkit' CHECK (source IN ('manual', 'healthkit', 'oura', 'dexcom'));
  END IF;
END $$;

-- Step 3: Add source_details JSONB column for granular per-metric source tracking
-- This allows tracking which specific metrics came from which source when merged
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_daily_metrics' AND column_name = 'source_details') THEN
    ALTER TABLE user_daily_metrics ADD COLUMN source_details JSONB DEFAULT '{}';
  END IF;
END $$;

-- Step 4: Add source column to healthkit_samples for raw sample tracking
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthkit_samples' AND column_name = 'data_source') THEN
    ALTER TABLE healthkit_samples ADD COLUMN data_source VARCHAR(20) DEFAULT 'healthkit' CHECK (data_source IN ('manual', 'healthkit', 'oura', 'dexcom'));
  END IF;
END $$;

-- Step 5: Create index for source filtering
CREATE INDEX IF NOT EXISTS idx_sleep_nights_source ON sleep_nights(source);
CREATE INDEX IF NOT EXISTS idx_user_daily_metrics_source ON user_daily_metrics(source);

-- Step 6: Add oura_session_id column to sleep_nights for deduplication
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sleep_nights' AND column_name = 'oura_session_id') THEN
    ALTER TABLE sleep_nights ADD COLUMN oura_session_id TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_nights_oura_session ON sleep_nights(oura_session_id) WHERE oura_session_id IS NOT NULL;

-- Step 7: Comment the columns for documentation
COMMENT ON COLUMN sleep_nights.source IS 'Data source: healthkit, oura, dexcom, or manual';
COMMENT ON COLUMN sleep_nights.oura_session_id IS 'Oura API session ID for deduplication';
COMMENT ON COLUMN user_daily_metrics.source IS 'Primary data source for this daily record';
COMMENT ON COLUMN user_daily_metrics.source_details IS 'Per-metric source tracking: {"hrv": "oura", "steps": "healthkit"}';
