-- Daily Subjective Surveys Table
-- Stores 3PM check-in survey responses for ML pattern analysis

CREATE TABLE IF NOT EXISTS daily_subjective_surveys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  health_id TEXT NOT NULL,
  
  -- Survey responses (1-10 scale)
  energy INTEGER NOT NULL CHECK (energy >= 1 AND energy <= 10),
  clarity INTEGER NOT NULL CHECK (clarity >= 1 AND clarity <= 10),
  mood INTEGER NOT NULL CHECK (mood >= 1 AND mood <= 10),
  
  -- Timing information
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  local_date DATE NOT NULL,
  local_time TIME NOT NULL,
  timezone TEXT NOT NULL,
  
  -- Metadata
  trigger_source TEXT DEFAULT 'notification', -- 'notification', 'manual', 'deep_link'
  response_latency_seconds INTEGER, -- How long after notification before response
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_surveys_health_id ON daily_subjective_surveys(health_id);
CREATE INDEX IF NOT EXISTS idx_surveys_local_date ON daily_subjective_surveys(local_date);
CREATE INDEX IF NOT EXISTS idx_surveys_recorded_at ON daily_subjective_surveys(recorded_at);

-- Unique constraint: one survey per user per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_health_id_date 
ON daily_subjective_surveys(health_id, local_date);

-- Row Level Security
ALTER TABLE daily_subjective_surveys ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own surveys
CREATE POLICY "Users can view own surveys" ON daily_subjective_surveys
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own surveys" ON daily_subjective_surveys
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own surveys" ON daily_subjective_surveys
  FOR UPDATE USING (true);

COMMENT ON TABLE daily_subjective_surveys IS 'Daily 3PM subjective health surveys for ML pattern analysis';
COMMENT ON COLUMN daily_subjective_surveys.energy IS 'Physical energy level 1-10 (1=wiped out, 10=energized)';
COMMENT ON COLUMN daily_subjective_surveys.clarity IS 'Mental clarity level 1-10 (1=brain fog, 10=laser focused)';
COMMENT ON COLUMN daily_subjective_surveys.mood IS 'Mood/wellbeing level 1-10 (1=low/irritable, 10=positive/calm)';
