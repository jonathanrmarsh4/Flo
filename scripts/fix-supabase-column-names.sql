-- Fix Supabase health_embeddings table to match code expectations
-- The code expects: content_type and content
-- The table has: source_type and content_text (and newly added content)

-- Step 1: Rename source_type to content_type
ALTER TABLE health_embeddings 
RENAME COLUMN source_type TO content_type;

-- Step 2: We'll use the newly added 'content' column (content_text can stay for now)
-- No action needed - content column already exists

-- Step 3: Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Step 4: Verification - check the renamed column exists
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'health_embeddings'
ORDER BY ordinal_position;
