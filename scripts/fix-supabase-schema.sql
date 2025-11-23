-- Fix Supabase health_embeddings table schema
-- Add missing 'content' column for RAG embedding system

-- Step 1: Add the content column with a temporary default
-- (This allows adding NOT NULL column to existing table)
ALTER TABLE health_embeddings 
ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';

-- Step 2: Remove the default so future inserts must provide content
ALTER TABLE health_embeddings 
ALTER COLUMN content DROP DEFAULT;

-- Step 3: Refresh PostgREST schema cache
-- This makes the API aware of the new column
NOTIFY pgrst, 'reload schema';

-- Verification query
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'health_embeddings'
ORDER BY ordinal_position;
