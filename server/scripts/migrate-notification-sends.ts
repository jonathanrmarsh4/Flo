import { getSupabaseClient } from '../services/supabaseClient';

const createTableSQL = `
-- Notification Sends Table
-- Tracks when notifications are sent to prevent duplicates during catch-up windows
-- Survives server restarts and works across multiple instances

-- Drop and recreate to ensure correct schema (safe since tracking data is ephemeral)
DROP TABLE IF EXISTS notification_sends;

CREATE TABLE notification_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  health_id TEXT NOT NULL,  -- TEXT to match existing health_id format (free-form strings)
  local_date DATE NOT NULL,
  notification_type VARCHAR(50) NOT NULL,  -- '3pm_survey' or 'experiment_reminder'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint prevents duplicate sends
  UNIQUE(health_id, local_date, notification_type)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_sends_health_id ON notification_sends(health_id);
CREATE INDEX IF NOT EXISTS idx_notification_sends_local_date ON notification_sends(local_date);
CREATE INDEX IF NOT EXISTS idx_notification_sends_lookup ON notification_sends(health_id, local_date, notification_type);

-- Enable RLS
ALTER TABLE notification_sends ENABLE ROW LEVEL SECURITY;

-- RLS policy for service role access
DROP POLICY IF EXISTS "Service role access notification_sends" ON notification_sends;
CREATE POLICY "Service role access notification_sends" ON notification_sends
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Cleanup old records (optional scheduled job - records older than 7 days)
-- This is handled by application or can be added as a database job
`;

export async function migrateNotificationSendsTable(): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = getSupabaseClient();
    
    console.log('[Migration] Creating notification_sends table...');
    
    const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    
    if (error) {
      // Try alternative approach - execute statements individually
      console.log('[Migration] RPC not available, trying direct approach...');
      
      // Check if table exists by trying to query it
      const { error: checkError } = await supabase
        .from('notification_sends')
        .select('id')
        .limit(1);
      
      if (checkError && checkError.code === '42P01') {
        // Table doesn't exist - need to create via SQL editor
        console.log('[Migration] Table does not exist. Please create it manually via Supabase SQL Editor.');
        console.log('[Migration] SQL to execute:\n', createTableSQL);
        return { 
          success: false, 
          message: 'Table notification_sends needs to be created manually. See console for SQL.' 
        };
      } else if (!checkError) {
        console.log('[Migration] Table notification_sends already exists.');
        return { success: true, message: 'Table already exists' };
      } else {
        console.log('[Migration] Error checking table:', checkError.message);
        return { success: false, message: checkError.message };
      }
    }
    
    console.log('[Migration] notification_sends table created successfully');
    return { success: true, message: 'Table created successfully' };
  } catch (error) {
    console.error('[Migration] Error:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : String(error) 
    };
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateNotificationSendsTable()
    .then(result => {
      console.log('[Migration] Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('[Migration] Fatal error:', err);
      process.exit(1);
    });
}
