-- Supabase RLS Policies for Health Data Tables
-- Run this in Supabase SQL Editor to secure all health tables
-- Note: Service role key bypasses RLS, but this blocks anon/authenticated roles

-- =============================================================================
-- 1. insight_cards - AI-detected health patterns (FLAGGED)
-- =============================================================================
ALTER TABLE public.insight_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insight_cards_owner_all" ON public.insight_cards;

CREATE POLICY "insight_cards_owner_all" ON public.insight_cards
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 2. healthkit_workouts - iOS HealthKit workout sessions (FLAGGED)
-- =============================================================================
ALTER TABLE public.healthkit_workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "healthkit_workouts_owner_all" ON public.healthkit_workouts;

CREATE POLICY "healthkit_workouts_owner_all" ON public.healthkit_workouts
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 3. profiles - User health profiles
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_owner_all" ON public.profiles;

CREATE POLICY "profiles_owner_all" ON public.profiles
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 4. biomarker_test_sessions - Blood work test sessions
-- =============================================================================
ALTER TABLE public.biomarker_test_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "biomarker_test_sessions_owner_all" ON public.biomarker_test_sessions;

CREATE POLICY "biomarker_test_sessions_owner_all" ON public.biomarker_test_sessions
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 5. biomarker_measurements - Individual biomarker readings
-- =============================================================================
ALTER TABLE public.biomarker_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "biomarker_measurements_owner_all" ON public.biomarker_measurements;

CREATE POLICY "biomarker_measurements_owner_all" ON public.biomarker_measurements
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 6. sleep_nights - Sleep tracking data
-- =============================================================================
ALTER TABLE public.sleep_nights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sleep_nights_owner_all" ON public.sleep_nights;

CREATE POLICY "sleep_nights_owner_all" ON public.sleep_nights
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 7. user_daily_metrics - Aggregated daily health metrics
-- =============================================================================
ALTER TABLE public.user_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_daily_metrics_owner_all" ON public.user_daily_metrics;

CREATE POLICY "user_daily_metrics_owner_all" ON public.user_daily_metrics
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 8. life_events - Behavioral/lifestyle event logs
-- =============================================================================
ALTER TABLE public.life_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "life_events_owner_all" ON public.life_events;

CREATE POLICY "life_events_owner_all" ON public.life_events
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 9. diagnostics_studies - CAC/DEXA scan data
-- =============================================================================
ALTER TABLE public.diagnostics_studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnostics_studies_owner_all" ON public.diagnostics_studies;

CREATE POLICY "diagnostics_studies_owner_all" ON public.diagnostics_studies
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 10. flomentum_daily - Daily momentum scores
-- =============================================================================
ALTER TABLE public.flomentum_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flomentum_daily_owner_all" ON public.flomentum_daily;

CREATE POLICY "flomentum_daily_owner_all" ON public.flomentum_daily
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 11. action_plan_items - User action plan items
-- =============================================================================
ALTER TABLE public.action_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_plan_items_owner_all" ON public.action_plan_items;

CREATE POLICY "action_plan_items_owner_all" ON public.action_plan_items
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 12. user_insights_embeddings - Brain memory / vector embeddings
-- =============================================================================
ALTER TABLE public.user_insights_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_insights_embeddings_owner_all" ON public.user_insights_embeddings;

CREATE POLICY "user_insights_embeddings_owner_all" ON public.user_insights_embeddings
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 13. healthkit_samples - Raw HealthKit data samples
-- =============================================================================
ALTER TABLE public.healthkit_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "healthkit_samples_owner_all" ON public.healthkit_samples;

CREATE POLICY "healthkit_samples_owner_all" ON public.healthkit_samples
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 14. nutrition_daily_metrics - Daily nutrition data
-- =============================================================================
ALTER TABLE public.nutrition_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_daily_metrics_owner_all" ON public.nutrition_daily_metrics;

CREATE POLICY "nutrition_daily_metrics_owner_all" ON public.nutrition_daily_metrics
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 15. mindfulness_sessions - Individual mindfulness sessions
-- =============================================================================
ALTER TABLE public.mindfulness_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mindfulness_sessions_owner_all" ON public.mindfulness_sessions;

CREATE POLICY "mindfulness_sessions_owner_all" ON public.mindfulness_sessions
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 16. mindfulness_daily_metrics - Aggregated mindfulness data
-- =============================================================================
ALTER TABLE public.mindfulness_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mindfulness_daily_metrics_owner_all" ON public.mindfulness_daily_metrics;

CREATE POLICY "mindfulness_daily_metrics_owner_all" ON public.mindfulness_daily_metrics
  FOR ALL
  USING (health_id = current_setting('app.current_health_id', true)::uuid)
  WITH CHECK (health_id = current_setting('app.current_health_id', true)::uuid);

-- =============================================================================
-- 17. biomarkers - Reference biomarker definitions
-- =============================================================================
ALTER TABLE public.biomarkers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "biomarkers_public_read" ON public.biomarkers;

-- Biomarkers is a reference table - allow public read access
CREATE POLICY "biomarkers_public_read" ON public.biomarkers
  FOR SELECT
  USING (true);

-- =============================================================================
-- Verification: Check RLS status on all tables
-- =============================================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'insight_cards',
    'healthkit_workouts', 
    'profiles',
    'biomarker_test_sessions',
    'biomarker_measurements',
    'sleep_nights',
    'user_daily_metrics',
    'life_events',
    'diagnostics_studies',
    'flomentum_daily',
    'action_plan_items',
    'user_insights_embeddings',
    'healthkit_samples',
    'nutrition_daily_metrics',
    'mindfulness_sessions',
    'mindfulness_daily_metrics',
    'biomarkers'
  )
ORDER BY tablename;
