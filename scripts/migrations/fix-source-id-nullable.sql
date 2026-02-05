-- Make source_id nullable (it's currently required but our code doesn't use it)
-- The embedding code only uses: user_id, content_type, content, metadata, embedding

ALTER TABLE health_embeddings 
ALTER COLUMN source_id DROP NOT NULL;

-- Also make data_date nullable if it exists and is NOT NULL
ALTER TABLE health_embeddings 
ALTER COLUMN data_date DROP NOT NULL;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'health_embeddings'
AND is_nullable = 'NO'
ORDER BY ordinal_position;
