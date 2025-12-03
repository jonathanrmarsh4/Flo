-- Migration to ensure healthkit_samples table exists with correct schema
-- Run this in Supabase SQL Editor

-- Create healthkit_samples table if it doesn't exist
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

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_healthkit_samples_health_type_date ON healthkit_samples(health_id, data_type, start_date);
CREATE INDEX IF NOT EXISTS idx_healthkit_samples_health_date ON healthkit_samples(health_id, start_date);
CREATE INDEX IF NOT EXISTS idx_healthkit_samples_uuid ON healthkit_samples(uuid);

-- Enable RLS
ALTER TABLE healthkit_samples ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
DROP POLICY IF EXISTS "Service role full access" ON healthkit_samples;
CREATE POLICY "Service role full access" ON healthkit_samples FOR ALL USING (true);

-- Verify the table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'healthkit_samples'
ORDER BY ordinal_position;

-- Show sample data types that can be stored:
-- Nutrition: dietaryEnergyConsumed, dietaryProtein, dietaryCarbohydrates, dietaryFatTotal, dietaryFiber, etc.
-- Mindfulness: mindfulSession
-- Vitals: heartRate, oxygenSaturation, respiratoryRate, etc.
