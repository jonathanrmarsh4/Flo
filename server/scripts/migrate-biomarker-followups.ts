/**
 * Migration script to create biomarker_followups table in Supabase
 * 
 * This table tracks scheduled appointments/actions for specific biomarker concerns
 * so Flō Oracle knows when to stop mentioning issues the user is already addressing.
 * 
 * Run with: npx tsx server/scripts/migrate-biomarker-followups.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const createTableSQL = `
-- Biomarker Follow-ups Table
-- Tracks scheduled appointments/actions for specific biomarker concerns
-- Enables Flō Oracle to know when to stop mentioning issues user is already addressing

CREATE TABLE IF NOT EXISTS biomarker_followups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  health_id UUID NOT NULL,
  
  -- Biomarker identification
  biomarker_name VARCHAR(100) NOT NULL,  -- e.g., 'PSA', 'CHOLESTEROL', 'VITAMIN_D'
  biomarker_code VARCHAR(50),            -- LOINC code if available
  concern_description TEXT,              -- e.g., 'Elevated PSA levels'
  
  -- Action/Follow-up details
  action_type VARCHAR(50) NOT NULL,      -- 'specialist_appointment', 'retest', 'lifestyle_change'
  action_description TEXT NOT NULL,      -- 'Specialist appointment with urologist'
  scheduled_date DATE,                   -- Date of the follow-up
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  source VARCHAR(20) DEFAULT 'voice' CHECK (source IN ('voice', 'text', 'system')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  
  -- Indexes will help with common queries
  CONSTRAINT fk_health_id FOREIGN KEY (health_id) REFERENCES profiles(health_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_biomarker_followups_health_id ON biomarker_followups(health_id);
CREATE INDEX IF NOT EXISTS idx_biomarker_followups_biomarker ON biomarker_followups(biomarker_name);
CREATE INDEX IF NOT EXISTS idx_biomarker_followups_status ON biomarker_followups(status);
CREATE INDEX IF NOT EXISTS idx_biomarker_followups_scheduled ON biomarker_followups(scheduled_date);

-- Composite index for common query: get pending followups for a user
CREATE INDEX IF NOT EXISTS idx_biomarker_followups_pending 
  ON biomarker_followups(health_id, status) 
  WHERE status = 'scheduled';

-- Enable RLS for security
ALTER TABLE biomarker_followups ENABLE ROW LEVEL SECURITY;

-- RLS policy for service role access
DROP POLICY IF EXISTS "Service role access biomarker_followups" ON biomarker_followups;
CREATE POLICY "Service role access biomarker_followups" ON biomarker_followups
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated trigger for updated_at
CREATE OR REPLACE FUNCTION update_biomarker_followups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_biomarker_followups_updated_at ON biomarker_followups;
CREATE TRIGGER update_biomarker_followups_updated_at
  BEFORE UPDATE ON biomarker_followups
  FOR EACH ROW
  EXECUTE FUNCTION update_biomarker_followups_updated_at();
`;

async function migrate() {
  console.log('Creating biomarker_followups table in Supabase...\n');

  try {
    // Check if table already exists
    const { error } = await supabase.from('biomarker_followups').select('id').limit(1);
    
    if (error && error.code === '42P01') {
      console.log('Table does not exist. Please run the following SQL in Supabase SQL Editor:\n');
      console.log('='.repeat(80));
      console.log(createTableSQL);
      console.log('='.repeat(80));
      console.log('\nAfter running the SQL, the biomarker followup feature will be ready to use.');
    } else if (!error) {
      console.log('biomarker_followups table already exists!');
    } else {
      console.error('Unexpected error:', error);
    }
  } catch (err) {
    console.error('Migration check failed:', err);
  }
}

migrate().catch(console.error);
