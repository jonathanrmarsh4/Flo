-- SIE (Self-Improvement Engine) Schema Introspection Function
-- This function enables SIE to dynamically discover all tables, columns, and row counts
-- Run this in the Supabase SQL Editor to enable full schema discovery

-- Set search path for security
SET search_path = public, extensions;

-- Drop existing function if exists
DROP FUNCTION IF EXISTS public.get_sie_schema_info();

-- Create the RPC function for SIE schema introspection
CREATE OR REPLACE FUNCTION public.get_sie_schema_info()
RETURNS TABLE (
  table_name text,
  columns jsonb,
  row_count bigint,
  description text
) 
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_name::text,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', c.column_name,
          'type', c.data_type,
          'nullable', c.is_nullable = 'YES'
        ) ORDER BY c.ordinal_position
      )
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' 
        AND c.table_name = t.table_name
    ) as columns,
    (
      SELECT n_live_tup::bigint 
      FROM pg_stat_user_tables s 
      WHERE s.relname = t.table_name
    ) as row_count,
    obj_description(
      (SELECT oid FROM pg_class WHERE relname = t.table_name AND relnamespace = 'public'::regnamespace),
      'pg_class'
    )::text as description
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT LIKE 'pg_%'
    AND t.table_name NOT LIKE '_prisma_%'
    AND t.table_name NOT IN ('schema_migrations', 'drizzle_migrations')
  ORDER BY t.table_name;
END;
$$;

-- Grant execute permission to authenticated users (admins only in practice via API)
GRANT EXECUTE ON FUNCTION public.get_sie_schema_info() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_sie_schema_info() IS 
  'SIE schema introspection - returns all public tables with columns, row counts, and descriptions for AI analysis';
