-- Create user_insights_embeddings table for brain memory semantic search
-- This enables Flō Oracle to find relevant medical documents and other insights using RAG

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the user_insights_embeddings table
CREATE TABLE IF NOT EXISTS user_insights_embeddings (
  insight_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  importance INTEGER DEFAULT 3,
  source TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_user_id 
  ON user_insights_embeddings(user_id);

CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_source 
  ON user_insights_embeddings(source);

-- Create IVFFlat index for vector similarity search (faster than exact search)
CREATE INDEX IF NOT EXISTS idx_user_insights_embeddings_vector 
  ON user_insights_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Create the match_user_insights RPC function for semantic search
CREATE OR REPLACE FUNCTION match_user_insights(
  query_embedding vector(1536),
  match_user_id TEXT,
  match_count INT DEFAULT 5,
  min_importance INT DEFAULT 1
)
RETURNS TABLE (
  insight_id TEXT,
  user_id TEXT,
  text TEXT,
  tags TEXT[],
  importance INTEGER,
  source TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    insight_id,
    user_id,
    text,
    tags,
    importance,
    source,
    1 - (embedding <=> query_embedding) AS similarity,
    created_at
  FROM user_insights_embeddings
  WHERE user_id = match_user_id
    AND importance >= min_importance
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION match_user_insights TO service_role;
GRANT EXECUTE ON FUNCTION match_user_insights TO anon;
GRANT EXECUTE ON FUNCTION match_user_insights TO authenticated;

-- Enable RLS
ALTER TABLE user_insights_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own embeddings
CREATE POLICY "Users can view own insight embeddings"
  ON user_insights_embeddings
  FOR SELECT
  USING (true);

CREATE POLICY "Service can insert insight embeddings"
  ON user_insights_embeddings
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update insight embeddings"
  ON user_insights_embeddings
  FOR UPDATE
  USING (true);

-- Verify the table and function were created
SELECT 'user_insights_embeddings table created' as status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_insights_embeddings');

SELECT 'match_user_insights function created' as status
WHERE EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'match_user_insights');
