-- Active Life Events Migration
-- Enhances life_events table to support duration-based contexts that suppress/adjust ML alerts
-- Example: "I'm traveling without my smart water bottle" → suppresses water intake alerts for 7 days

-- Add new columns to life_events table for active context tracking
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP;
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS affected_metrics TEXT[] DEFAULT '{}';
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS suppression_action TEXT DEFAULT 'none' CHECK (suppression_action IN ('none', 'suppress', 'adjust_threshold', 'context_only'));
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS threshold_multiplier REAL DEFAULT 1.0;
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS user_explanation TEXT;
ALTER TABLE life_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'chat' CHECK (source IN ('chat', 'check_in', 'manual', 'inferred'));

-- Create index for querying active life events efficiently
CREATE INDEX IF NOT EXISTS idx_life_events_active ON life_events(health_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_life_events_ends_at ON life_events(ends_at) WHERE ends_at IS NOT NULL;

-- Create a table for check-in prompts that need to be sent
CREATE TABLE IF NOT EXISTS check_in_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  
  -- What triggered this check-in
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('persistent_anomaly', 'sudden_change', 'pattern_break', 'scheduled')),
  trigger_metric TEXT NOT NULL,
  trigger_details JSONB DEFAULT '{}',
  
  -- Anomaly context
  anomaly_days INTEGER DEFAULT 1,
  deviation_percent REAL,
  baseline_value REAL,
  current_value REAL,
  
  -- The prompt to show the user
  prompt_message TEXT NOT NULL,
  suggested_responses TEXT[] DEFAULT '{}',
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'answered', 'dismissed', 'expired')),
  sent_at TIMESTAMP,
  answered_at TIMESTAMP,
  response_text TEXT,
  
  -- Life event that was created from the response (if any)
  resulting_life_event_id UUID REFERENCES life_events(id),
  
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_check_in_prompts_health_status ON check_in_prompts(health_id, status);
CREATE INDEX IF NOT EXISTS idx_check_in_prompts_pending ON check_in_prompts(status, created_at) WHERE status = 'pending';

-- Create a table for per-metric sensitivity overrides
CREATE TABLE IF NOT EXISTS metric_sensitivity_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Can be NULL for global defaults, or specific health_id for per-user overrides
  health_id UUID,
  
  metric_type TEXT NOT NULL,
  
  -- Sensitivity controls
  enabled BOOLEAN DEFAULT true,
  z_score_threshold REAL DEFAULT 2.0,
  percentage_threshold REAL DEFAULT 15.0,
  min_sample_count INTEGER DEFAULT 7,
  
  -- Notification controls
  notify_on_anomaly BOOLEAN DEFAULT true,
  notify_on_improvement BOOLEAN DEFAULT false,
  cooldown_hours INTEGER DEFAULT 4,
  
  -- Life event suppression - list of life event types that suppress this metric
  suppressed_by_events TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by TEXT
);

-- Ensure unique constraint for global settings (health_id IS NULL) + metric_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_sensitivity_global ON metric_sensitivity_overrides(metric_type) WHERE health_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_sensitivity_user ON metric_sensitivity_overrides(health_id, metric_type) WHERE health_id IS NOT NULL;

-- Seed default global sensitivity settings for common metrics
INSERT INTO metric_sensitivity_overrides (health_id, metric_type, z_score_threshold, percentage_threshold, notify_on_anomaly, suppressed_by_events)
VALUES
  (NULL, 'water_intake', 2.0, 40.0, true, ARRAY['travel', 'equipment_unavailable', 'illness']),
  (NULL, 'steps', 2.0, 30.0, true, ARRAY['travel', 'illness', 'injury', 'rest_day']),
  (NULL, 'active_energy', 2.0, 25.0, true, ARRAY['travel', 'illness', 'injury', 'rest_day']),
  (NULL, 'exercise_minutes', 2.0, 50.0, true, ARRAY['travel', 'illness', 'injury', 'rest_day']),
  (NULL, 'hrv_ms', 1.5, 15.0, true, ARRAY['alcohol', 'illness', 'stress', 'poor_sleep', 'travel']),
  (NULL, 'resting_heart_rate_bpm', 1.5, 8.0, true, ARRAY['alcohol', 'illness', 'stress', 'caffeine']),
  (NULL, 'sleep_duration_min', 1.5, 20.0, true, ARRAY['travel', 'social_event', 'stress']),
  (NULL, 'deep_sleep_min', 2.0, 25.0, true, ARRAY['alcohol', 'travel', 'stress']),
  (NULL, 'rem_sleep_min', 2.0, 25.0, true, ARRAY['alcohol', 'travel', 'stress']),
  (NULL, 'respiratory_rate_bpm', 2.0, 10.0, true, ARRAY['illness', 'anxiety']),
  (NULL, 'oxygen_saturation_pct', 2.0, 3.0, true, ARRAY['altitude', 'illness']),
  (NULL, 'body_temperature_deviation', 2.0, 0.4, true, ARRAY['illness', 'menstrual_cycle', 'exercise'])
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE check_in_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_sensitivity_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON check_in_prompts FOR ALL USING (true);
CREATE POLICY "Service role full access" ON metric_sensitivity_overrides FOR ALL USING (true);

-- Function to auto-deactivate expired life events
CREATE OR REPLACE FUNCTION deactivate_expired_life_events()
RETURNS void AS $$
BEGIN
  UPDATE life_events 
  SET is_active = false 
  WHERE is_active = true 
    AND ends_at IS NOT NULL 
    AND ends_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE check_in_prompts IS 'Stores contextual check-in prompts triggered by persistent anomalies. Instead of just notifying about anomalies, we ask WHY they happened.';
COMMENT ON TABLE metric_sensitivity_overrides IS 'Per-metric sensitivity controls. NULL health_id = global defaults, specific health_id = user-specific overrides.';
COMMENT ON COLUMN life_events.is_active IS 'Whether this life event is currently active and should affect ML alerts';
COMMENT ON COLUMN life_events.ends_at IS 'When this life event automatically ends (NULL = until manually ended)';
COMMENT ON COLUMN life_events.affected_metrics IS 'List of metric types this event affects (e.g., water_intake, steps)';
COMMENT ON COLUMN life_events.suppression_action IS 'How to handle alerts: none=normal, suppress=hide alerts, adjust_threshold=multiply threshold, context_only=show but explain';
