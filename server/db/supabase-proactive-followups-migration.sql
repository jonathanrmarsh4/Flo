-- Migration: Proactive Follow-ups and Life Context
-- Purpose: Enable Flō to remember user requests for future check-ins and understand life context
-- Run this in Supabase SQL Editor

-- ==================== FOLLOW-UP REQUESTS ====================
-- Stores user requests like "check back with me in a few days about my HRV"

CREATE TABLE IF NOT EXISTS follow_up_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL REFERENCES profiles(health_id),
  
  -- What the user asked for
  intent_summary TEXT NOT NULL,                    -- "Check if saunas are improving HRV"
  original_transcript TEXT,                        -- Raw user request for context
  
  -- What metrics to analyze
  metrics TEXT[] DEFAULT '{}',                     -- ['hrv', 'sleep_quality', 'rhr']
  comparison_baseline TEXT,                        -- 'before_saunas', 'last_week', '7_days_ago'
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  evaluate_at TIMESTAMPTZ NOT NULL,                -- When to run the analysis
  evaluated_at TIMESTAMPTZ,                        -- When analysis was actually run
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dismissed')),
  
  -- Results
  findings JSONB,                                  -- { summary: "...", metrics: {...}, recommendation: "..." }
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ,
  
  -- Conversation context
  source TEXT DEFAULT 'voice' CHECK (source IN ('voice', 'text', 'system')),
  session_id TEXT                                  -- Link to original chat session
);

-- Index for scheduler queries
CREATE INDEX IF NOT EXISTS idx_followup_pending_evaluate 
  ON follow_up_requests(status, evaluate_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followup_health_id 
  ON follow_up_requests(health_id);

-- ==================== LIFE CONTEXT FACTS ====================
-- Stores contextual information about user's life that affects health expectations
-- Examples: "traveling for work", "recovering from illness", "high stress period"

CREATE TABLE IF NOT EXISTS life_context_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL REFERENCES profiles(health_id),
  
  -- What's happening
  category TEXT NOT NULL CHECK (category IN (
    'travel',           -- Business trip, vacation
    'training_pause',   -- Can't exercise temporarily
    'illness',          -- Sick, recovering
    'stress',           -- High stress period
    'sleep_disruption', -- Jet lag, new baby, etc.
    'diet_change',      -- Fasting, new diet
    'medication',       -- Started/stopped medication
    'life_event',       -- Moving, new job, etc.
    'other'
  )),
  
  description TEXT NOT NULL,                       -- "Business trip to NYC"
  
  -- Time bounds (optional - some facts are ongoing)
  start_date DATE,
  end_date DATE,                                   -- NULL = ongoing until updated
  
  -- How this affects health expectations
  expected_impact JSONB,                           -- { hrv: 'lower', sleep: 'disrupted', training: 'reduced' }
  
  -- Metadata
  source TEXT DEFAULT 'voice' CHECK (source IN ('voice', 'text', 'system')),
  confidence REAL DEFAULT 1.0,                     -- How confident AI was in extracting this
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Soft delete - facts can be marked inactive
  is_active BOOLEAN DEFAULT TRUE
);

-- Index for active context lookups
CREATE INDEX IF NOT EXISTS idx_context_active 
  ON life_context_facts(health_id, is_active) 
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_context_date_range 
  ON life_context_facts(health_id, start_date, end_date);

-- ==================== RLS POLICIES ====================
-- Enable Row Level Security

ALTER TABLE follow_up_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_context_facts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend access)
CREATE POLICY "Service role full access to follow_up_requests"
  ON follow_up_requests FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to life_context_facts"
  ON life_context_facts FOR ALL
  USING (auth.role() = 'service_role');

-- ==================== HELPER FUNCTIONS ====================

-- Function to get active life context for a user
CREATE OR REPLACE FUNCTION get_active_life_context(p_health_id UUID)
RETURNS SETOF life_context_facts AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM life_context_facts
  WHERE health_id = p_health_id
    AND is_active = TRUE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending follow-ups ready for evaluation
CREATE OR REPLACE FUNCTION get_pending_followups_to_evaluate()
RETURNS SETOF follow_up_requests AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM follow_up_requests
  WHERE status = 'pending'
    AND evaluate_at <= NOW()
  ORDER BY evaluate_at ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
