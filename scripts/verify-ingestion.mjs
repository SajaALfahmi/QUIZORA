#!/usr/bin/env node
/**
 * scripts/verify-ingestion.mjs
 *
 * Run this AFTER scripts/ingest-knowledge-base.mjs has been run against the
 * real Supabase project. Checks:
 *   - row counts (12 documents, 719 chunks)
 *   - no unexpected duplicate chunk_ids
 *   - embedding dimension sanity
 *   - a few realistic test queries against match_kb_chunks()
 *
 * This script only READS from Supabase (via match_kb_chunks + count queries).
 * It does not modify data. Requires SUPABASE_URL + a key that can call the
 * function as `authenticated` (service role works for this manual check).
 *
 * Usage:
 *   node scripts/verify-ingestion.mjs
 */
import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

const TEST_QUERIES = [
  { q: "Can we send student performance data to an AI service outside Saudi Arabia?", expectDocId: "KB-10" },
  { q: "What are the ethical requirements for human oversight of automated AI decisions about students?", expectDocId: "KB-01" },
  { q: "What does the ITU AI Readiness framework say about AI policy dimensions?", expectDocId: "KB-03" },
  { q: "What are the machine learning pipeline stages defined by ITU-T Y.3172?", expectDocId: "KB-04" },
];

async function embed(openaiKey, text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("=== 1. Row counts ===");
  const { count: docCount, error: docErr } = await supabase
    .from("kb_documents")
    .select("*", { count: "exact", head: true });
  if (docErr) throw new Error(docErr.message);
  console.log(`kb_documents: ${docCount} (expected 12) -> ${docCount === 12 ? "PASS" : "CHECK"}`);

  const { count: chunkCount, error: chunkErr } = await supabase
    .from("kb_chunks")
    .select("*", { count: "exact", head: true });
  if (chunkErr) throw new Error(chunkErr.message);
  console.log(`kb_chunks: ${chunkCount} (expected 719) -> ${chunkCount === 719 ? "PASS" : "CHECK"}`);

  console.log("\n=== 2. Duplicate chunk_id check ===");
  const { data: allIds, error: idsErr } = await supabase.from("kb_chunks").select("chunk_id");
  if (idsErr) throw new Error(idsErr.message);
  const seen = new Set();
  let dupes = 0;
  for (const row of allIds) {
    if (seen.has(row.chunk_id)) dupes++;
    seen.add(row.chunk_id);
  }
  console.log(`Duplicate chunk_id rows: ${dupes} -> ${dupes === 0 ? "PASS" : "CHECK"}`);

  console.log("\n=== 3. Embedding presence + dimension sanity ===");
  const { data: sampleRow, error: sampleErr } = await supabase
    .from("kb_chunks")
    .select("chunk_id, embedding")
    .not("embedding", "is", null)
    .limit(1)
    .single();
  if (sampleErr) throw new Error(sampleErr.message);
  const dim = Array.isArray(sampleRow.embedding) ? sampleRow.embedding.length : "unknown (check pgvector output format)";
  console.log(`Sample chunk ${sampleRow.chunk_id} embedding length: ${dim} (expected 1536)`);

  console.log("\n=== 4. Vector retrieval test queries ===");
  console.log(
    "NOTE: this script authenticates as service_role, which bypasses RLS entirely. " +
    "That is fine for confirming embeddings/retrieval work at all, but it does NOT prove " +
    "that a real logged-in end user (the `authenticated` role) can successfully call " +
    "match_kb_chunks() under the actual RLS/GRANT configuration. Before trusting this in " +
    "production, run the same 4 queries once manually using a real user's access token " +
    "(e.g. the JWT from a logged-in QUIZORA browser session) instead of the service role key."
  );
  let relevanceHits = 0;
  for (const { q, expectDocId } of TEST_QUERIES) {
    const queryEmbedding = await embed(OPENAI_API_KEY, q);
    const { data: results, error: matchErr } = await supabase.rpc("match_kb_chunks", {
      query_embedding: queryEmbedding,
      match_count: 3,
    });
    if (matchErr) {
      console.log(`\nQuery: "${q}"\n  ERROR: ${matchErr.message}`);
      continue;
    }
    const topDocIds = results.map((r) => r.document_id);
    const hit = topDocIds.includes(expectDocId);
    if (hit) relevanceHits++;
    console.log(`\nQuery: "${q}"`);
    console.log(`  Expected top document: ${expectDocId} -> ${hit ? "FOUND in top 3" : "NOT in top 3 (CHECK — may still be fine, but review)"}`);
    for (const r of results) {
      console.log(
        `  [${r.document_id}] ${r.document_title} (page ${r.page ?? r.section}) ` +
        `similarity=${r.similarity.toFixed(3)}\n    "${r.chunk_text.slice(0, 100).replace(/\n/g, " ")}..."`
      );
    }
  }
  console.log(`\nRelevance sanity check: ${relevanceHits}/${TEST_QUERIES.length} queries surfaced their expected document in the top 3.`);
  console.log("This is a lightweight sanity check, not a rigorous relevance benchmark — a miss here is worth investigating, not an automatic failure.");

  console.log("\nDone. Paste this full output back for review.");
}

main().catch((err) => {
  console.error("\nVERIFICATION FAILED:", err.message);
  process.exit(1);
});
