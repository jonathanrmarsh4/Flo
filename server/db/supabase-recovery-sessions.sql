-- Supabase Recovery Sessions Table
-- For tracking sauna and ice bath recovery sessions
-- Run this migration in Supabase SQL editor

CREATE TABLE IF NOT EXISTS recovery_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('sauna', 'icebath')),
  session_date DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  duration_minutes INTEGER NOT NULL,
  duration_seconds INTEGER,
  temperature NUMERIC,
  temperature_unit TEXT CHECK (temperature_unit IN ('F', 'C')),
  timing TEXT CHECK (timing IN ('post-workout', 'separate')),
  feeling INTEGER CHECK (feeling >= 1 AND feeling <= 5),
  calories_burned INTEGER,
  recovery_score NUMERIC,
  benefit_tags TEXT[],
  notes TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_health_id ON recovery_sessions(health_id);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_date ON recovery_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_type ON recovery_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_health_date ON recovery_sessions(health_id, session_date);

-- Enable Row Level Security
ALTER TABLE recovery_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policy for authenticated users to manage their own sessions
CREATE POLICY "Users can view own recovery sessions" ON recovery_sessions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own recovery sessions" ON recovery_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own recovery sessions" ON recovery_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own recovery sessions" ON recovery_sessions
  FOR DELETE USING (true);

-- Comment describing table purpose
COMMENT ON TABLE recovery_sessions IS 'Tracks sauna and ice bath recovery sessions for thermal recovery analytics';
