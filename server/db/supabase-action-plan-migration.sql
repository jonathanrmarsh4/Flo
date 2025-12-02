-- Migration: Extend Supabase health tables to support Flō Oracle context
-- Run this migration in Supabase SQL Editor
-- 
-- This migration adds:
-- 1. Extended columns to action_plan_items for Daily Insights integration
-- 2. New insight_cards table for AI pattern detection results

-- ==================== ACTION PLAN ITEMS EXTENSIONS ====================

-- Add daily insight integration columns
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS daily_insight_id UUID;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS snapshot_title TEXT;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS snapshot_insight TEXT;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS snapshot_action TEXT;

-- Add biomarker tracking columns
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS biomarker_id UUID;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS target_biomarker TEXT;
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS unit TEXT;

-- Add added_at timestamp (equivalent to Neon's addedAt)
ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT NOW();

-- Update the status check constraint to include all statuses
ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_status_check;
ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_status_check 
  CHECK (status IN ('active', 'completed', 'paused', 'archived', 'dismissed'));

-- Create index for daily insight lookups
CREATE INDEX IF NOT EXISTS idx_action_plan_daily_insight ON action_plan_items(health_id, daily_insight_id);
CREATE INDEX IF NOT EXISTS idx_action_plan_biomarker ON action_plan_items(health_id, biomarker_id);

-- ==================== INSIGHT CARDS TABLE ====================
-- Stores AI-detected health patterns from data analysis
-- Used by Flō Oracle for context-aware conversations

-- Create insight category enum if not exists
DO $$ BEGIN
  CREATE TYPE insight_category AS ENUM (
    'sleep', 'activity', 'recovery', 'nutrition', 
    'stress', 'heart_health', 'metabolic', 'general'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS insight_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  category insight_category NOT NULL,
  pattern TEXT NOT NULL,                    -- Human-readable pattern description
  confidence REAL NOT NULL,                 -- 0.0-1.0
  supporting_data TEXT,                     -- Brief summary (e.g., "Based on 18 days")
  details JSONB,                            -- Extended data: daysAnalyzed, avgBefore, avgAfter, etc.
  is_new BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for insight_cards
CREATE INDEX IF NOT EXISTS idx_insight_cards_health_id ON insight_cards(health_id);
CREATE INDEX IF NOT EXISTS idx_insight_cards_category ON insight_cards(category);
CREATE INDEX IF NOT EXISTS idx_insight_cards_confidence ON insight_cards(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_insight_cards_active ON insight_cards(is_active);

COMMENT ON TABLE insight_cards IS 'AI-detected health patterns from data analysis, used by Flō Oracle';
COMMENT ON COLUMN insight_cards.pattern IS 'Human-readable description of the detected pattern';
COMMENT ON COLUMN insight_cards.confidence IS 'AI confidence score 0.0-1.0';
COMMENT ON COLUMN insight_cards.details IS 'Extended analysis data: daysAnalyzed, before/after values, etc.';
