/**
 * Migration script to create CGM tables in Supabase
 * 
 * Run with: npx tsx server/scripts/migrate-cgm-tables.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
  console.log('Creating CGM tables in Supabase...\n');

  // Create cgm_connections table
  const connectionsSQL = `
    CREATE TABLE IF NOT EXISTS cgm_connections (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      health_id UUID NOT NULL,
      provider VARCHAR(50) NOT NULL DEFAULT 'dexcom',
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      scope VARCHAR(255),
      is_sandbox BOOLEAN DEFAULT false,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      last_sync_at TIMESTAMPTZ,
      sync_status VARCHAR(20) DEFAULT 'active' CHECK (sync_status IN ('active', 'error', 'disconnected')),
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(health_id, provider)
    );

    -- Index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_cgm_connections_health_id ON cgm_connections(health_id);
    CREATE INDEX IF NOT EXISTS idx_cgm_connections_sync_status ON cgm_connections(sync_status);

    -- Enable RLS
    ALTER TABLE cgm_connections ENABLE ROW LEVEL SECURITY;

    -- RLS policy for service role
    DROP POLICY IF EXISTS "Service role access cgm_connections" ON cgm_connections;
    CREATE POLICY "Service role access cgm_connections" ON cgm_connections
      FOR ALL
      USING (true)
      WITH CHECK (true);
  `;

  // Create cgm_readings table
  const readingsSQL = `
    CREATE TABLE IF NOT EXISTS cgm_readings (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      health_id UUID NOT NULL,
      source VARCHAR(50) NOT NULL DEFAULT 'dexcom',
      glucose_value INTEGER NOT NULL,
      glucose_unit VARCHAR(20) DEFAULT 'mg/dL',
      trend VARCHAR(30),
      trend_rate FLOAT,
      recorded_at TIMESTAMPTZ NOT NULL,
      display_time TIMESTAMPTZ,
      is_sandbox BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(health_id, source, recorded_at)
    );

    -- Indexes for faster queries
    CREATE INDEX IF NOT EXISTS idx_cgm_readings_health_id ON cgm_readings(health_id);
    CREATE INDEX IF NOT EXISTS idx_cgm_readings_recorded_at ON cgm_readings(recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cgm_readings_health_time ON cgm_readings(health_id, recorded_at DESC);

    -- Enable RLS
    ALTER TABLE cgm_readings ENABLE ROW LEVEL SECURITY;

    -- RLS policy for service role
    DROP POLICY IF EXISTS "Service role access cgm_readings" ON cgm_readings;
    CREATE POLICY "Service role access cgm_readings" ON cgm_readings
      FOR ALL
      USING (true)
      WITH CHECK (true);
  `;

  try {
    // Execute connections table migration
    console.log('Creating cgm_connections table...');
    const { error: connError } = await supabase.rpc('exec_sql', { sql: connectionsSQL });
    
    if (connError) {
      // Try direct approach if RPC doesn't exist
      console.log('RPC not available, creating tables directly...');
      
      // For Supabase, we need to use the SQL editor or run migrations differently
      // The service role should be able to create tables directly
      const { error } = await supabase.from('cgm_connections').select('id').limit(1);
      
      if (error && error.code === '42P01') {
        console.log('Table does not exist. Please run the following SQL in Supabase SQL Editor:\n');
        console.log('='.repeat(80));
        console.log(connectionsSQL);
        console.log('\n');
        console.log(readingsSQL);
        console.log('='.repeat(80));
        console.log('\nAfter running the SQL, the CGM integration will be ready to use.');
        return;
      } else if (!error) {
        console.log('cgm_connections table already exists');
      }
    } else {
      console.log('cgm_connections table created successfully');
    }

    // Execute readings table migration
    console.log('Creating cgm_readings table...');
    const { error: readError } = await supabase.rpc('exec_sql', { sql: readingsSQL });
    
    if (readError) {
      const { error } = await supabase.from('cgm_readings').select('id').limit(1);
      
      if (error && error.code === '42P01') {
        console.log('cgm_readings table needs to be created via SQL Editor');
      } else if (!error) {
        console.log('cgm_readings table already exists');
      }
    } else {
      console.log('cgm_readings table created successfully');
    }

    console.log('\nMigration complete!');
    
  } catch (error) {
    console.error('Migration error:', error);
    console.log('\nPlease run the following SQL directly in Supabase SQL Editor:\n');
    console.log('='.repeat(80));
    console.log(connectionsSQL);
    console.log('\n');
    console.log(readingsSQL);
    console.log('='.repeat(80));
  }
}

// Export SQL for manual execution
export const CGM_TABLES_SQL = `
-- CGM Connections Table
CREATE TABLE IF NOT EXISTS cgm_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  health_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'dexcom',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  scope VARCHAR(255),
  is_sandbox BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  sync_status VARCHAR(20) DEFAULT 'active' CHECK (sync_status IN ('active', 'error', 'disconnected')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(health_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_cgm_connections_health_id ON cgm_connections(health_id);
CREATE INDEX IF NOT EXISTS idx_cgm_connections_sync_status ON cgm_connections(sync_status);

ALTER TABLE cgm_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access cgm_connections" ON cgm_connections
  FOR ALL USING (true) WITH CHECK (true);

-- CGM Readings Table
CREATE TABLE IF NOT EXISTS cgm_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  health_id UUID NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'dexcom',
  glucose_value INTEGER NOT NULL,
  glucose_unit VARCHAR(20) DEFAULT 'mg/dL',
  trend VARCHAR(30),
  trend_rate FLOAT,
  recorded_at TIMESTAMPTZ NOT NULL,
  display_time TIMESTAMPTZ,
  is_sandbox BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(health_id, source, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_cgm_readings_health_id ON cgm_readings(health_id);
CREATE INDEX IF NOT EXISTS idx_cgm_readings_recorded_at ON cgm_readings(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgm_readings_health_time ON cgm_readings(health_id, recorded_at DESC);

ALTER TABLE cgm_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access cgm_readings" ON cgm_readings
  FOR ALL USING (true) WITH CHECK (true);
`;

migrate().catch(console.error);
