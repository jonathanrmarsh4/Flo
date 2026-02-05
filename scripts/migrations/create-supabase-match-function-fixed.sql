-- Create PostgreSQL function for vector similarity search (FIXED VERSION)
-- This enables Flō Oracle to find relevant health data using RAG
-- Fixed: id and user_id are TEXT, not UUID

CREATE OR REPLACE FUNCTION match_health_embeddings(
  query_embedding vector(1536),
  match_user_id text,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id text,
  user_id text,
  content_type text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    user_id,
    content_type,
    content,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM health_embeddings
  WHERE user_id = match_user_id
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION match_health_embeddings TO service_role;

-- Verify the function was created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'match_health_embeddings';
