-- Weather Backfill Status Table for Flō
-- Tracks 12-month historical environmental data backfill progress per user
-- Also tracks global API quota usage
-- Run this in Supabase SQL Editor

-- Weather Backfill Status
-- Tracks which users have been backfilled and progress state
-- health_id '__GLOBAL_QUOTA__' is reserved for tracking daily API quota across all workers
CREATE TABLE IF NOT EXISTS weather_backfill_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id TEXT NOT NULL UNIQUE,
  backfill_started_at TIMESTAMPTZ,
  backfill_completed_at TIMESTAMPTZ,
  last_processed_date DATE,
  earliest_date DATE,
  latest_date DATE,
  total_days_processed INTEGER DEFAULT 0,
  total_days_with_location INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'no_location_data', 'quota_tracker')),
  error_log TEXT,
  -- API quota tracking columns (used by __GLOBAL_QUOTA__ row)
  api_calls_today INTEGER DEFAULT 0,
  api_calls_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_weather_backfill_status_health_id 
  ON weather_backfill_status(health_id);

CREATE INDEX IF NOT EXISTS idx_weather_backfill_status_status 
  ON weather_backfill_status(status);

-- RLS policies (backend uses service role, bypassing RLS)
ALTER TABLE weather_backfill_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access for backfill status" ON weather_backfill_status
  FOR ALL USING (true) WITH CHECK (true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_weather_backfill_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_weather_backfill_status ON weather_backfill_status;
CREATE TRIGGER trigger_update_weather_backfill_status
  BEFORE UPDATE ON weather_backfill_status
  FOR EACH ROW
  EXECUTE FUNCTION update_weather_backfill_status_updated_at();

COMMENT ON TABLE weather_backfill_status IS 'Tracks 12-month historical environmental data backfill progress per user. Uses historical location data for accurate location-based AQI.';
COMMENT ON COLUMN weather_backfill_status.total_days_with_location IS 'Number of days in the backfill period where user had location data available';
COMMENT ON COLUMN weather_backfill_status.api_calls_today IS 'Daily API call counter for OpenWeather quota tracking (used only by __GLOBAL_QUOTA__ row)';
COMMENT ON COLUMN weather_backfill_status.api_calls_date IS 'Date for which api_calls_today applies, resets when date changes';

-- Atomic increment function for multi-worker quota safety
-- Uses advisory lock for serialization, ensuring only one increment at a time
-- Returns the new count (1 to max_quota) on successful increment
-- Returns 0 if quota was already exhausted (no increment performed)
CREATE OR REPLACE FUNCTION increment_weather_api_quota(quota_date DATE, max_quota INTEGER DEFAULT 950)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
  current_date DATE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('openweather_quota'));
  
  SELECT api_calls_today, api_calls_date 
  INTO current_count, current_date
  FROM weather_backfill_status
  WHERE health_id = '__GLOBAL_QUOTA__';
  
  IF NOT FOUND THEN
    INSERT INTO weather_backfill_status (health_id, status, api_calls_today, api_calls_date)
    VALUES ('__GLOBAL_QUOTA__', 'quota_tracker', 1, quota_date);
    RETURN 1;
  END IF;
  
  IF current_date IS NULL OR current_date != quota_date THEN
    UPDATE weather_backfill_status
    SET api_calls_today = 1, api_calls_date = quota_date, updated_at = NOW()
    WHERE health_id = '__GLOBAL_QUOTA__';
    RETURN 1;
  END IF;
  
  IF current_count >= max_quota THEN
    RETURN 0;
  END IF;
  
  UPDATE weather_backfill_status
  SET api_calls_today = current_count + 1, updated_at = NOW()
  WHERE health_id = '__GLOBAL_QUOTA__';
  
  RETURN current_count + 1;
END;
$$ LANGUAGE plpgsql;
