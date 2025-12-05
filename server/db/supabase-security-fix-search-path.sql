-- Security Fix: Add fixed search_path to all functions
-- Purpose: Resolve Supabase security warnings about mutable search_path
-- Run this in Supabase SQL Editor

-- ==================== FIX 1: match_health_embeddings ====================
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
SET search_path = public
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION match_health_embeddings TO service_role;
GRANT EXECUTE ON FUNCTION match_health_embeddings TO anon;
GRANT EXECUTE ON FUNCTION match_health_embeddings TO authenticated;

-- ==================== FIX 2: match_user_insights ====================
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
SET search_path = public
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

-- ==================== FIX 3: get_active_life_context ====================
CREATE OR REPLACE FUNCTION get_active_life_context(p_health_id UUID)
RETURNS SETOF life_context_facts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM life_context_facts
  WHERE health_id = p_health_id
    AND is_active = TRUE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  ORDER BY created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_active_life_context TO service_role;

-- ==================== FIX 4: get_pending_followups_to_evaluate ====================
CREATE OR REPLACE FUNCTION get_pending_followups_to_evaluate()
RETURNS SETOF follow_up_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM follow_up_requests
  WHERE status = 'pending'
    AND evaluate_at <= NOW()
  ORDER BY evaluate_at ASC
  LIMIT 50;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_pending_followups_to_evaluate TO service_role;

-- ==================== VERIFY FIXES ====================
SELECT routine_name, 'Fixed' as status
FROM information_schema.routines
WHERE routine_name IN (
  'match_health_embeddings',
  'match_user_insights', 
  'get_active_life_context',
  'get_pending_followups_to_evaluate'
);
