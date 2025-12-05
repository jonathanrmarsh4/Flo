-- Migration: Add daily_insights table to Supabase for PHI privacy compliance
-- Run this migration in Supabase SQL Editor
-- 
-- This table stores AI-generated health insights, which is considered PHI
-- and must be stored in Supabase (not Neon) for privacy compliance.

-- Create enum types if they don't exist
DO $$ BEGIN
  CREATE TYPE evidence_tier AS ENUM ('Highest', 'High', 'Moderate', 'Low', 'Insufficient');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE insight_category_type AS ENUM (
    'sleep', 'activity', 'recovery', 'nutrition', 
    'stress', 'heart_health', 'metabolic', 'longevity',
    'hormone', 'inflammation', 'immune', 'general'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Daily Insights table - stores AI-generated personalized health insights
CREATE TABLE IF NOT EXISTS daily_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  generated_date TEXT NOT NULL, -- YYYY-MM-DD format
  
  -- Insight content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action TEXT,
  
  -- Progress tracking (for biomarker-related insights)
  target_biomarker TEXT,
  current_value REAL,
  target_value REAL,
  unit TEXT,
  
  -- Scoring and classification
  confidence_score REAL NOT NULL,
  impact_score REAL NOT NULL,
  actionability_score REAL NOT NULL,
  freshness_score REAL NOT NULL,
  overall_score REAL NOT NULL,
  
  -- Evidence and sources
  evidence_tier TEXT NOT NULL, -- 'Highest', 'High', 'Moderate', 'Low', 'Insufficient'
  primary_sources TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL, -- 'sleep', 'activity', 'recovery', etc.
  
  -- Layer that generated this insight
  generating_layer TEXT NOT NULL,
  
  -- Supporting data
  details JSONB NOT NULL DEFAULT '{}',
  
  -- User interaction
  is_new BOOLEAN NOT NULL DEFAULT true,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_insights_health_date ON daily_insights(health_id, generated_date);
CREATE INDEX IF NOT EXISTS idx_daily_insights_health_id ON daily_insights(health_id);
CREATE INDEX IF NOT EXISTS idx_daily_insights_score ON daily_insights(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_daily_insights_category ON daily_insights(category);
CREATE INDEX IF NOT EXISTS idx_daily_insights_tier ON daily_insights(evidence_tier);
CREATE INDEX IF NOT EXISTS idx_daily_insights_new ON daily_insights(health_id, is_new) WHERE is_new = true;

-- Enable Row Level Security
ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access (backend server uses service key)
CREATE POLICY "Service role full access" ON daily_insights FOR ALL USING (true);

-- Add comments
COMMENT ON TABLE daily_insights IS 'AI-generated personalized health insights - PHI stored in Supabase for privacy';
COMMENT ON COLUMN daily_insights.health_id IS 'Pseudonymous health identifier linking to user profile';
COMMENT ON COLUMN daily_insights.generated_date IS 'Date insight was generated in YYYY-MM-DD format';
COMMENT ON COLUMN daily_insights.overall_score IS 'Combined score: confidence × impact × actionability × freshness';
COMMENT ON COLUMN daily_insights.details IS 'Extended analysis data: daysAnalyzed, before/after values, correlations, etc.';
