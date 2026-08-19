-- Restrict direct client (PostgREST) access to questions and answer_options.
--
-- Previously both tables had "USING (true)" SELECT policies, which let any
-- holder of the public anon key read answer_options.is_correct directly,
-- bypassing the adaptive-engine Edge Function's grading flow.
--
-- All Edge Functions (adaptive-engine, generate-questions,
-- generate-explanation, review-questions) read these tables through the
-- Supabase service-role client, which bypasses Row Level Security entirely,
-- so this change does not affect them.
--
-- Frontend usage check: answer_options is never queried directly from
-- src/ (only received via the Edge Function response). questions is read
-- directly in exactly one place (CoursesPage.tsx, a session-gated
-- count-only query), which remains authenticated after this change.

DROP POLICY IF EXISTS "Anyone can view answer options" ON public.answer_options;

DROP POLICY IF EXISTS "Anyone can view questions" ON public.questions;
CREATE POLICY "Authenticated users can view questions" ON public.questions
  FOR SELECT USING (auth.uid() IS NOT NULL);
