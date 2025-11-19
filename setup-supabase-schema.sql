-- =====================================================
-- Supabase Schema Setup for RAG Insights
-- =====================================================
-- Run this SQL in your Supabase SQL Editor
-- This creates the health_embeddings table for vector search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create health_embeddings table
CREATE TABLE IF NOT EXISTS public.health_embeddings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR NOT NULL,
  source_type VARCHAR NOT NULL, -- 'blood_work' or 'healthkit'
  source_id VARCHAR NOT NULL, -- ID of the blood work or healthkit metric
  data_date DATE NOT NULL,
  content_text TEXT NOT NULL, -- Human-readable description for embedding
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB, -- Additional context (biomarker name, value, unit, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS health_embeddings_user_idx ON public.health_embeddings(user_id);
CREATE INDEX IF NOT EXISTS health_embeddings_source_idx ON public.health_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS health_embeddings_date_idx ON public.health_embeddings(data_date DESC);

-- Create IVFFlat index for vector similarity search
-- Using 100 lists (good for ~10K-100K vectors)
CREATE INDEX IF NOT EXISTS health_embeddings_vector_idx 
ON public.health_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Grant permissions (adjust based on your Supabase setup)
-- Replace 'anon' and 'authenticated' with your actual roles if different
ALTER TABLE public.health_embeddings ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (customize based on your auth setup)
-- This allows users to only access their own embeddings
CREATE POLICY "Users can access own embeddings" 
ON public.health_embeddings
FOR ALL
USING (user_id = auth.uid()::VARCHAR);

-- Service role bypass (for backend operations)
CREATE POLICY "Service role full access" 
ON public.health_embeddings
FOR ALL
TO service_role
USING (true);

-- Verify setup
SELECT 
  'health_embeddings table created' AS status,
  COUNT(*) AS row_count 
FROM public.health_embeddings;
