-- Weather Backfill Status Table for Flō
-- Tracks 12-month historical environmental data backfill progress per user
-- Run this in Supabase SQL Editor

-- Weather Backfill Status
-- Tracks which users have been backfilled and progress state
CREATE TABLE IF NOT EXISTS weather_backfill_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL UNIQUE,
  backfill_started_at TIMESTAMPTZ,
  backfill_completed_at TIMESTAMPTZ,
  last_processed_date DATE,
  earliest_date DATE,
  latest_date DATE,
  total_days_processed INTEGER DEFAULT 0,
  total_days_with_location INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'no_location_data')),
  error_log TEXT,
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
