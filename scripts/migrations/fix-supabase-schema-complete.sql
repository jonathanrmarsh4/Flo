-- Complete fix for Supabase health_embeddings table schema
-- Add both missing columns: content (already added) and content_type

-- Step 1: Add content_type column (currently missing)
ALTER TABLE health_embeddings 
ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'blood_work';

-- Remove the default so future inserts must provide content_type
ALTER TABLE health_embeddings 
ALTER COLUMN content_type DROP DEFAULT;

-- Step 2: Refresh PostgREST schema cache again
NOTIFY pgrst, 'reload schema';

-- Step 3: Verification - check all columns exist
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'health_embeddings'
ORDER BY ordinal_position;
