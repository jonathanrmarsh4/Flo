-- Setup user_insights_embeddings table in Supabase for vector search
-- This enables the shared brain layer to use semantic similarity search

-- Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create user_insights_embeddings table
CREATE TABLE IF NOT EXISTS user_insights_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  insight_id TEXT NOT NULL UNIQUE,  -- References user_insights.id in main DB
  text TEXT NOT NULL,               -- The insight text for reference
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  importance INTEGER DEFAULT 3,
  source TEXT NOT NULL,             -- 'gpt_insights_job', 'chat_brain_update', etc.
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_user_id 
  ON user_insights_embeddings(user_id);

CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_source 
  ON user_insights_embeddings(source);

CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_importance 
  ON user_insights_embeddings(importance DESC);

CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_created 
  ON user_insights_embeddings(created_at DESC);

-- Create IVFFlat index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_vector 
  ON user_insights_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create RPC function for vector similarity search
CREATE OR REPLACE FUNCTION match_user_insights(
  query_embedding VECTOR(1536),
  match_user_id TEXT,
  match_count INT DEFAULT 5,
  min_importance INT DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  insight_id TEXT,
  user_id TEXT,
  text TEXT,
  tags TEXT[],
  importance INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    insight_id,
    user_id,
    text,
    tags,
    importance,
    source,
    created_at,
    1 - (embedding <=> query_embedding) AS similarity
  FROM user_insights_embeddings
  WHERE user_id = match_user_id
    AND importance >= min_importance
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION match_user_insights TO service_role;

-- Enable Row Level Security (RLS)
ALTER TABLE user_insights_embeddings ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can manage user insights embeddings"
  ON user_insights_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verification queries
SELECT 'Table created' AS status, 
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'user_insights_embeddings') AS exists;

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'match_user_insights';
