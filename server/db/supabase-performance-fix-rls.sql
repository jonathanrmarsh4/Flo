-- Performance Fix: RLS Policy Optimization
-- Purpose: Resolve Supabase performance warnings
-- Run this in Supabase SQL Editor
--
-- Fixes:
-- 1. Auth RLS Initialization Plan - wrap auth.* calls in (select ...)
-- 2. Multiple Permissive Policies - consolidate overlapping policies

-- ==================== FIX 1: health_embeddings ====================
-- Drop all existing policies to consolidate
DROP POLICY IF EXISTS "Users can access own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Users can view own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Users can insert own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Users can update own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Users can delete own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable read access for own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable insert access for own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable update access for own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable delete access for own embeddings" ON public.health_embeddings;

-- Create consolidated policies with optimized auth calls
CREATE POLICY "health_embeddings_select" ON public.health_embeddings 
  FOR SELECT TO authenticated 
  USING ((select auth.uid())::text = user_id);

CREATE POLICY "health_embeddings_insert" ON public.health_embeddings 
  FOR INSERT TO authenticated 
  WITH CHECK ((select auth.uid())::text = user_id);

CREATE POLICY "health_embeddings_update" ON public.health_embeddings 
  FOR UPDATE TO authenticated 
  USING ((select auth.uid())::text = user_id) 
  WITH CHECK ((select auth.uid())::text = user_id);

CREATE POLICY "health_embeddings_delete" ON public.health_embeddings 
  FOR DELETE TO authenticated 
  USING ((select auth.uid())::text = user_id);

-- Service role bypass
CREATE POLICY "health_embeddings_service" ON public.health_embeddings 
  FOR ALL TO service_role 
  USING (true) 
  WITH CHECK (true);

-- ==================== FIX 2: daily_reminders ====================
-- Note: daily_reminders uses user_id (VARCHAR), not health_id
DROP POLICY IF EXISTS "Users can view own reminders" ON public.daily_reminders;
DROP POLICY IF EXISTS "Service role full access" ON public.daily_reminders;
DROP POLICY IF EXISTS "Service role can insert reminders" ON public.daily_reminders;
DROP POLICY IF EXISTS "Service role can update reminders" ON public.daily_reminders;
DROP POLICY IF EXISTS "Service role can delete reminders" ON public.daily_reminders;

CREATE POLICY "daily_reminders_select" ON public.daily_reminders 
  FOR SELECT TO authenticated 
  USING (user_id = (select auth.uid())::text);

CREATE POLICY "daily_reminders_service" ON public.daily_reminders 
  FOR ALL TO service_role 
  USING (true) 
  WITH CHECK (true);

-- ==================== FIX 3: follow_up_requests ====================
DROP POLICY IF EXISTS "Service role full access to follow_up_requests" ON public.follow_up_requests;

CREATE POLICY "follow_up_requests_service" ON public.follow_up_requests 
  FOR ALL TO service_role 
  USING ((select auth.role()) = 'service_role') 
  WITH CHECK ((select auth.role()) = 'service_role');

-- ==================== FIX 4: life_context_facts ====================
DROP POLICY IF EXISTS "Service role full access to life_context_facts" ON public.life_context_facts;

CREATE POLICY "life_context_facts_service" ON public.life_context_facts 
  FOR ALL TO service_role 
  USING ((select auth.role()) = 'service_role') 
  WITH CHECK ((select auth.role()) = 'service_role');

-- ==================== FIX 5: healthkit_workouts ====================
-- Note: Uses current_setting('app.current_health_id') set by backend
DROP POLICY IF EXISTS "healthkit_workouts_owner_all" ON public.healthkit_workouts;
DROP POLICY IF EXISTS "healthkit_workouts_service" ON public.healthkit_workouts;

CREATE POLICY "healthkit_workouts_owner" ON public.healthkit_workouts 
  FOR ALL TO authenticated 
  USING (health_id = (select current_setting('app.current_health_id', true))::uuid)
  WITH CHECK (health_id = (select current_setting('app.current_health_id', true))::uuid);

CREATE POLICY "healthkit_workouts_service" ON public.healthkit_workouts 
  FOR ALL TO service_role 
  USING (true) 
  WITH CHECK (true);

-- ==================== FIX 6: insight_cards ====================
-- Note: Uses current_setting('app.current_health_id') set by backend
DROP POLICY IF EXISTS "insight_cards_owner_all" ON public.insight_cards;
DROP POLICY IF EXISTS "insight_cards_service" ON public.insight_cards;

CREATE POLICY "insight_cards_owner" ON public.insight_cards 
  FOR ALL TO authenticated 
  USING (health_id = (select current_setting('app.current_health_id', true))::uuid)
  WITH CHECK (health_id = (select current_setting('app.current_health_id', true))::uuid);

CREATE POLICY "insight_cards_service" ON public.insight_cards 
  FOR ALL TO service_role 
  USING (true) 
  WITH CHECK (true);

-- ==================== FIX 7: biomarkers (consolidate SELECT policies) ====================
DROP POLICY IF EXISTS "Public read access" ON public.biomarkers;
DROP POLICY IF EXISTS "Service role full access" ON public.biomarkers;

-- Single policy for public read access (covers anon, authenticated, etc.)
CREATE POLICY "biomarkers_public_read" ON public.biomarkers 
  FOR SELECT 
  USING (true);

-- Service role can do everything
CREATE POLICY "biomarkers_service" ON public.biomarkers 
  FOR ALL TO service_role 
  USING (true) 
  WITH CHECK (true);

-- ==================== VERIFY ====================
SELECT 
  schemaname, 
  tablename, 
  policyname,
  'Fixed' as status
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN (
    'health_embeddings', 
    'daily_reminders', 
    'follow_up_requests',
    'life_context_facts',
    'healthkit_workouts',
    'insight_cards',
    'biomarkers'
  )
ORDER BY tablename, policyname;
