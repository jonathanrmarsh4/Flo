DROP POLICY IF EXISTS "Users can view own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Users can insert own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Users can update own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Users can delete own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable read access for own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable insert access for own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable update access for own embeddings" ON public.health_embeddings;
DROP POLICY IF EXISTS "Enable delete access for own embeddings" ON public.health_embeddings;

CREATE POLICY "Users can view own embeddings" ON public.health_embeddings FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own embeddings" ON public.health_embeddings FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own embeddings" ON public.health_embeddings FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own embeddings" ON public.health_embeddings FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_health_embeddings_user_id ON public.health_embeddings(user_id);
