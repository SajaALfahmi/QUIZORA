-- Add a nullable language tag to public.questions.
--
-- Schema-only change: no application code reads or writes this column yet.
-- Existing rows are left untouched (NULL) - no backfill is performed here.
-- Values are constrained to the two-letter codes ("ar"/"en") already used
-- as the canonical language representation everywhere else in the
-- codebase (see normalizeLanguage() in the Edge Functions and the
-- Language type in src/contexts/LanguageContext.tsx), so no translation
-- layer is needed between the database and the application.
--
-- No DEFAULT and no NOT NULL: existing questions have no known language
-- and must remain distinguishable (NULL) from questions explicitly
-- generated for a specific language.

ALTER TABLE public.questions
  ADD COLUMN language text CHECK (language IN ('ar', 'en'));
