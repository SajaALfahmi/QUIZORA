-- Add a nullable language tag to public.learning_sessions.
--
-- This locks a session's presentation/question language for its entire
-- lifetime: set once at session creation, read on every subsequent
-- next-question call as the authoritative value instead of trusting
-- whatever language the frontend happens to send on that request (which
-- may drift if the user toggles UI language mid-quiz). Mirrors the
-- CHECK/nullable/no-default pattern used for public.questions.language.
--
-- Schema-only change: existing sessions are left untouched (NULL) - no
-- backfill is performed here. normalizeLanguage() already handles a NULL
-- persisted value by falling back to "en" with a logged warning, so old
-- sessions remain functional without a guessed language.

ALTER TABLE public.learning_sessions
  ADD COLUMN language text CHECK (language IN ('ar', 'en'));
