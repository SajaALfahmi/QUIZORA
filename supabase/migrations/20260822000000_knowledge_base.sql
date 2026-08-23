-- ============================================================
-- QUIZORA — Phase 3: Knowledge Base + pgvector foundation
-- ============================================================
-- ADDITIVE ONLY. This migration does not touch, alter, or drop
-- any existing table (profiles, courses, skills, questions,
-- answer_options, user_progress, user_skill_levels,
-- learning_sessions, user_answers).
--
-- Verified before writing this migration (Phase 3, Part 1):
--   - pgvector was NOT already enabled in this project.
--   - No kb_documents / kb_chunks / match_kb_chunks name
--     conflicts exist anywhere in the current schema.
--   - Existing RLS convention has two patterns:
--       (a) "Anyone can view X" USING (true)  -> public reference
--           data (courses, skills, questions, answer_options)
--       (b) "Users can view their own X" USING (auth.uid() = user_id)
--           -> user-owned data (user_progress, user_answers, ...)
--     Knowledge Base documents/chunks are public reference/evidence
--     data, not user-owned, so pattern (a) is the correct fit for
--     SELECT. See the "SECURITY NOTES" block below for why write
--     access intentionally has NO client-facing policy at all.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Enable pgvector (idempotent — safe if already enabled)
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


-- ------------------------------------------------------------
-- 2. kb_documents — document-level metadata (12 rows expected:
--    KB-01 .. KB-12, preserved exactly from Phase 1/2)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kb_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           text NOT NULL UNIQUE,        -- e.g. 'KB-08'
  document_title        text NOT NULL,
  organization          text,
  country               text,
  year                  text,
  version               text,
  document_type         text,
  category              text,
  folder                text,
  filename              text,
  language              text,
  source_type           text,
  official_source       text,
  domain                text,
  relevance_to_quizora  text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kb_documents IS
  'Phase 2 Knowledge Base document registry (12 authentic policy/standards/ethics/education documents). Populated only by the ingestion script (service role), never by client writes.';


-- ------------------------------------------------------------
-- 3. kb_chunks — chunk-level content + embedding
--    (719 rows expected from Phase 2's quizora_kb_chunks.jsonl)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id             text NOT NULL REFERENCES public.kb_documents(document_id) ON DELETE CASCADE,
  chunk_id                text NOT NULL UNIQUE,       -- e.g. 'KB-08-p009-c009', preserved from Phase 2
  chunk_text              text NOT NULL,
  page                    integer,                    -- null for EPUB (KB-04) — schema preserved, not invented
  section                 text,
  chunk_index             integer,

  ai_readiness_factor     text,
  ai_readiness_dimension  text,
  y3172_stage             text,

  -- text-embedding-3-small output dimension is 1536.
  -- Confirm this against the actual model response before ingesting
  -- (see docs/PHASE_3_SETUP.md, "Confirm the embedding dimension").
  embedding               extensions.vector(1536),

  created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kb_chunks IS
  'Phase 2 chunk dataset (719 chunks) with embeddings for semantic retrieval. chunk_id is the Phase 2 identifier, preserved verbatim for traceability. Populated only by the ingestion script (service role), never by client writes.';

CREATE INDEX IF NOT EXISTS idx_kb_chunks_document_id ON public.kb_chunks (document_id);


-- ------------------------------------------------------------
-- 4. Vector similarity index
-- ------------------------------------------------------------
-- At 719 rows, an index is not strictly required for query
-- performance (a sequential scan over 719 vectors is fast).
-- It is created anyway for correctness at scale and because the
-- KB will grow. HNSW is used (rather than IVFFlat) because HNSW
-- does not need a pre-populated table + ANALYZE step to build a
-- meaningful index, which matters for the still-small,
-- occasionally-reingested dataset in this project's current phase.
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding_hnsw
  ON public.kb_chunks
  USING hnsw (embedding extensions.vector_cosine_ops);


-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
-- SECURITY NOTES (why this differs from a simple copy of
-- user_progress's policies, as explicitly required):
--
--   kb_documents/kb_chunks are curated evidence for EVERY
--   institution's assessment, not any single user's private data.
--   kb_documents (titles/organizations/sources — a catalog of the
--   12 sources) is harmless to read directly, so it uses the same
--   "public reference data" pattern already used for `questions`
--   and `skills` (USING (true) for the `authenticated` role).
--
--   kb_chunks is treated more conservatively and DELIBERATELY HAS
--   NO SELECT POLICY AT ALL for `authenticated` or `anon`. Reasoning:
--     (a) it holds the raw embedding vector(1536) column, which
--         should never be directly fetchable by a client — a client
--         needing similarity search should get results back through
--         match_kb_chunks(), not by pulling raw vectors themselves;
--     (b) it prevents a trivial `select * from kb_chunks` full-table
--         dump of all 719 chunks in one request, which a plain
--         "USING (true)" SELECT policy would otherwise allow, even
--         though the content is non-sensitive — this is deliberate
--         resource/architecture discipline, not a secrecy claim;
--     (c) it matches the intended request flow (React → authenticated
--         request → a controlled retrieval function/Edge Function →
--         Knowledge Base), rather than allowing direct table reads
--         that bypass that layering.
--   The only sanctioned read path for kb_chunks content is the
--   match_kb_chunks() function below (SECURITY DEFINER), which is
--   deliberately narrower than a raw table grant: it never returns
--   the embedding column, and it caps how many rows can be returned
--   per call.
--
--   Neither table has any client-facing INSERT/UPDATE/DELETE policy.
--   With RLS enabled and no policy for those operations, they are
--   denied by default for both `anon` and `authenticated` roles.
--   Only the `service_role` key (used exclusively by the
--   server-side ingestion script, never shipped to the browser)
--   bypasses RLS entirely and can write — this is standard
--   Supabase behavior, not a custom rule.

ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view KB documents" ON public.kb_documents;
CREATE POLICY "Authenticated users can view KB documents"
  ON public.kb_documents FOR SELECT
  TO authenticated
  USING (true);

-- kb_chunks intentionally has RLS enabled with NO policies at all.
-- This blocks every direct client read (SELECT included) for both
-- `anon` and `authenticated`; the only read path is match_kb_chunks().
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 6. Vector similarity search function (retrieval foundation only
--    — NOT the RAG prompt/assessment logic; that is Phase 4)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding extensions.vector(1536),
  match_count integer DEFAULT 8,
  filter_document_id text DEFAULT NULL,
  filter_ai_readiness_dimension text DEFAULT NULL
)
RETURNS TABLE (
  chunk_id text,
  document_id text,
  document_title text,
  organization text,
  official_source text,
  chunk_text text,
  page integer,
  section text,
  ai_readiness_factor text,
  ai_readiness_dimension text,
  y3172_stage text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.chunk_id,
    c.document_id,
    d.document_title,
    d.organization,
    d.official_source,
    c.chunk_text,
    c.page,
    c.section,
    c.ai_readiness_factor,
    c.ai_readiness_dimension,
    c.y3172_stage,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.kb_chunks c
  JOIN public.kb_documents d ON d.document_id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND (filter_document_id IS NULL OR c.document_id = filter_document_id)
    AND (filter_ai_readiness_dimension IS NULL OR c.ai_readiness_dimension ILIKE '%' || filter_ai_readiness_dimension || '%')
  ORDER BY c.embedding <=> query_embedding
  -- match_count is clamped to [1, 50] so a caller cannot request an
  -- unbounded (or zero/negative) result set in one call. 50 comfortably
  -- covers any realistic Phase 4 RAG context-assembly need against a
  -- 719-chunk corpus, while preventing a single call from returning the
  -- entire table.
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

COMMENT ON FUNCTION public.match_kb_chunks IS
  'Retrieval foundation for Phase 4 RAG. Returns the top-N most similar KB chunks to a query embedding (cosine similarity), with optional document/dimension filters. Does NOT call an LLM and does NOT assemble a RAG prompt — that belongs to Phase 4.';

-- SECURITY DEFINER is required here, not merely convenient: kb_chunks
-- (Section 5) intentionally has NO SELECT policy for `authenticated`,
-- so a caller in that role has no direct table privileges on kb_chunks
-- at all. SECURITY DEFINER lets this specific, narrow, read-only query
-- run with the definer's privileges so `authenticated` callers can
-- retrieve matches without ever being granted raw table access. This is
-- the standard, recommended pattern for "controlled RPC bridges a
-- permission gap" in Postgres/Supabase, not a workaround.
-- SECURITY INVOKER would NOT work here, since it would run with the
-- caller's own (intentionally absent) table privileges and simply fail.
--
-- Why this is safe:
--   - LANGUAGE sql with a single static SELECT (no EXECUTE/dynamic SQL)
--     means there is no SQL-injection surface — all parameters are
--     strongly typed and bound by the query planner, never concatenated
--     into a string that gets re-parsed as SQL (including the ILIKE
--     pattern, which is built from a bound parameter value, not from
--     unvalidated caller-supplied SQL text).
--   - The function contains no INSERT/UPDATE/DELETE, so it cannot be
--     used to modify data regardless of its elevated read privileges.
--   - SET search_path = public, extensions is pinned, which prevents
--     search_path-hijacking attacks against SECURITY DEFINER functions
--     (a role creating a shadow object earlier in an unpinned path).
--   - The embedding column is deliberately excluded from the RETURNS
--     TABLE list, so raw vectors are never exposed to a client.
--   - match_count is clamped (see LIMIT above), so this function cannot
--     be used to dump the whole table in one call.
GRANT EXECUTE ON FUNCTION public.match_kb_chunks TO authenticated;
