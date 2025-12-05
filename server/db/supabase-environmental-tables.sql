-- Environmental Data Tables for Flō
-- Run this in Supabase SQL Editor to create location and weather tables
--
-- SECURITY MODEL:
-- These tables use health_id for tenant isolation. All access is through the backend 
-- which uses the Supabase service role key (bypasses RLS) and ALWAYS scopes queries 
-- by health_id. There is no direct client-to-Supabase access.
--
-- The RLS policies below are permissive because:
-- 1. Backend uses service role key which bypasses RLS
-- 2. All queries are scoped by health_id in the application layer
-- 3. No direct client SDK access is configured
--
-- If direct client access were ever enabled, these policies would need to be 
-- updated to use auth.uid() mapped to health_id via a secure lookup.

-- User Location History
-- Stores location updates from iOS app for weather/AQI correlation
CREATE TABLE IF NOT EXISTS user_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('gps', 'network', 'manual')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient querying by health_id and time
CREATE INDEX IF NOT EXISTS idx_user_location_history_health_id_time 
  ON user_location_history(health_id, recorded_at DESC);

-- RLS policies for location history (backend uses service role, bypassing RLS)
ALTER TABLE user_location_history ENABLE ROW LEVEL SECURITY;

-- Service role bypasses these policies; they exist for completeness
-- All backend access is scoped by health_id in the WHERE clause
CREATE POLICY "Service role access for location history" ON user_location_history
  FOR ALL USING (true) WITH CHECK (true);

-- Weather Daily Cache
-- Caches weather and air quality data per user per day
-- Prevents redundant API calls and enables historical correlation
CREATE TABLE IF NOT EXISTS weather_daily_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  date DATE NOT NULL,
  weather_data JSONB,
  air_quality_data JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint for upsert on health_id + date
  UNIQUE(health_id, date)
);

-- Index for efficient querying by health_id and date range
CREATE INDEX IF NOT EXISTS idx_weather_cache_health_id_date 
  ON weather_daily_cache(health_id, date DESC);

-- RLS policies for weather cache (backend uses service role, bypassing RLS)
ALTER TABLE weather_daily_cache ENABLE ROW LEVEL SECURITY;

-- Service role bypasses these policies; they exist for completeness
-- All backend access is scoped by health_id in the WHERE clause
CREATE POLICY "Service role access for weather cache" ON weather_daily_cache
  FOR ALL USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE user_location_history IS 'Stores user location updates from iOS app for environmental health correlations. Access controlled by backend health_id scoping.';
COMMENT ON TABLE weather_daily_cache IS 'Caches OpenWeather API responses per user per day to reduce API calls and enable historical analysis. Access controlled by backend health_id scoping.';

COMMENT ON COLUMN weather_daily_cache.weather_data IS 'JSON containing temperature, humidity, pressure, wind, conditions from OpenWeather';
COMMENT ON COLUMN weather_daily_cache.air_quality_data IS 'JSON containing AQI, PM2.5, PM10, O3, NO2, CO, SO2 from OpenWeather Air Pollution API';
