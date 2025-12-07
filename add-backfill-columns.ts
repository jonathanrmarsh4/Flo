// Migration script to add backfill columns to Supabase profiles table
import { getSupabaseClient } from './server/services/supabaseClient';

const supabase = getSupabaseClient();

async function addBackfillColumns() {
  console.log('📊 Adding backfill columns to Supabase profiles table...\n');

  // Check if columns already exist by trying to select them
  const { data, error } = await supabase
    .from('profiles')
    .select('healthkit_backfill_complete, healthkit_backfill_date')
    .limit(1);

  if (!error) {
    console.log('✅ Columns already exist in profiles table');
    console.log('   Sample data:', data);
    return;
  }

  if (error.code === '42703') {
    console.log('⚠️ Columns do not exist yet. Need to add them via Supabase SQL editor:');
    console.log(`
-- Run this in Supabase SQL Editor:
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS healthkit_backfill_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS healthkit_backfill_date TIMESTAMPTZ;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_profiles_backfill ON public.profiles(healthkit_backfill_complete);
    `);
  } else {
    console.log('❌ Unexpected error:', error);
  }
}

addBackfillColumns().catch(console.error);
