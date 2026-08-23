#!/usr/bin/env node
/**
 * scripts/ingest-knowledge-base.mjs
 *
 * Phase 3 ingestion pipeline:
 *   JSONL -> validate -> read chunks -> generate embeddings -> upsert into Supabase
 *
 * This script is meant to be run LOCALLY BY A DEVELOPER (or CI with secrets),
 * never in the browser. It uses the Supabase SERVICE ROLE key, which bypasses
 * RLS — that key must never be shipped to the client.
 *
 * Idempotent: uses upsert on kb_documents.document_id and kb_chunks.chunk_id,
 * so re-running this script after a partial failure will not create duplicates.
 *
 * Requires environment variables (see .env.example):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (NOT the anon/publishable key)
 *   OPENAI_API_KEY
 *
 * Usage:
 *   node scripts/ingest-knowledge-base.mjs path/to/quizora_kb_chunks.jsonl
 */
import fs from "node:fs";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536; // confirmed against OpenAI's documented output size for this model
const EMBED_BATCH_SIZE = 64;      // OpenAI embeddings endpoint accepts an array of inputs per call
const DB_BATCH_SIZE = 200;        // rows per Supabase upsert call

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

async function readJsonl(path) {
  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf-8") });
  const records = [];
  let lineNo = 0;
  for await (const raw of rl) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (e) {
      throw new Error(`Malformed JSON on line ${lineNo} of ${path}: ${e.message}. Refusing to ingest.`);
    }
  }
  return records;
}

const REQUIRED_FIELDS = [
  "chunk_id", "document_id", "document_title", "organization", "country",
  "year", "version", "document_type", "category", "folder", "filename",
  "language", "source_type", "official_source", "domain",
  "ai_readiness_factor", "ai_readiness_dimension", "y3172_stage",
  "relevance_to_quizora", "page", "section", "chunk_index", "chunk_text",
];

function validate(records) {
  const expected = Array.from({ length: 12 }, (_, i) => `KB-${String(i + 1).padStart(2, "0")}`);
  const counts = {};
  for (const r of records) counts[r.document_id] = (counts[r.document_id] || 0) + 1;
  const missing = expected.filter((d) => !counts[d]);
  const total = records.length;

  if (total !== 719) {
    throw new Error(`Expected 719 chunks, found ${total}. Refusing to ingest — this dataset does not match the Phase 2 source of truth.`);
  }
  if (missing.length > 0) {
    throw new Error(`Missing document IDs: ${missing.join(", ")}. Refusing to ingest.`);
  }

  // Per-record schema check BEFORE any OpenAI calls — a malformed record
  // should fail fast and cheaply, not after spending API budget on
  // embeddings for the records ahead of it in the file.
  const fieldErrors = [];
  const seenChunkIds = new Set();
  const dupeChunkIds = new Set();
  for (const [i, r] of records.entries()) {
    for (const f of REQUIRED_FIELDS) {
      if (!(f in r)) fieldErrors.push(`line ${i + 1} (chunk_id=${r.chunk_id ?? "?"}): missing field "${f}"`);
    }
    if (!r.chunk_text || !r.chunk_text.trim()) {
      fieldErrors.push(`line ${i + 1} (chunk_id=${r.chunk_id ?? "?"}): empty chunk_text`);
    }
    if (r.chunk_id) {
      if (seenChunkIds.has(r.chunk_id)) dupeChunkIds.add(r.chunk_id);
      seenChunkIds.add(r.chunk_id);
    }
  }
  if (fieldErrors.length > 0) {
    throw new Error(
      `Dataset failed schema validation (${fieldErrors.length} issue(s)). Refusing to ingest. First 10:\n` +
      fieldErrors.slice(0, 10).join("\n")
    );
  }
  if (dupeChunkIds.size > 0) {
    throw new Error(
      `Dataset contains duplicate chunk_id values, which would break the upsert's ON CONFLICT semantics within a single batch: ${[...dupeChunkIds].slice(0, 10).join(", ")}. Refusing to ingest.`
    );
  }

  console.log(`Validation passed: ${total} chunks across ${Object.keys(counts).length} documents, all required fields present, no duplicate chunk_ids.`);
  return counts;
}

async function embedBatch(openaiKey, texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI embeddings request failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  // sanity-check the dimension of EVERY returned embedding, not just the
  // first — cheap to check all of them and avoids assuming the batch is
  // internally consistent.
  for (const item of data.data) {
    const dim = item.embedding?.length;
    if (dim !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Embedding dimension mismatch at batch index ${item.index}: model returned ${dim}, but the kb_chunks.embedding column is vector(${EMBEDDING_DIMENSION}). ` +
        `Update the migration before ingesting, or re-check the model name.`
      );
    }
  }
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node ingest-knowledge-base.mjs <path-to-quizora_kb_chunks.jsonl>");
    process.exit(1);
  }

  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Reading ${path} ...`);
  const records = await readJsonl(path);
  validate(records);

  // --- 1. Upsert kb_documents (one row per unique document_id) ---
  const docMap = new Map();
  for (const r of records) {
    if (!docMap.has(r.document_id)) {
      docMap.set(r.document_id, {
        document_id: r.document_id,
        document_title: r.document_title,
        organization: r.organization,
        country: r.country,
        year: r.year,
        version: r.version,
        document_type: r.document_type,
        category: r.category,
        folder: r.folder,
        filename: r.filename,
        language: r.language,
        source_type: r.source_type,
        official_source: r.official_source,
        domain: r.domain,
        relevance_to_quizora: r.relevance_to_quizora,
      });
    }
  }
  const docRows = Array.from(docMap.values());
  console.log(`Upserting ${docRows.length} documents into kb_documents ...`);
  const { error: docErr } = await supabase
    .from("kb_documents")
    .upsert(docRows, { onConflict: "document_id" });
  if (docErr) throw new Error(`kb_documents upsert failed: ${docErr.message}`);
  console.log("kb_documents upsert OK.");

  // --- 2. Generate embeddings in batches, upsert kb_chunks in batches ---
  const batches = chunkArray(records, EMBED_BATCH_SIZE);
  let processed = 0;
  let pendingRows = [];

  for (const [i, batch] of batches.entries()) {
    console.log(`Embedding batch ${i + 1}/${batches.length} (${batch.length} chunks) ...`);
    const embeddings = await embedBatch(OPENAI_API_KEY, batch.map((r) => r.chunk_text));

    for (let j = 0; j < batch.length; j++) {
      const r = batch[j];
      pendingRows.push({
        document_id: r.document_id,
        chunk_id: r.chunk_id,
        chunk_text: r.chunk_text,
        page: r.page,
        section: r.section,
        chunk_index: r.chunk_index,
        ai_readiness_factor: r.ai_readiness_factor,
        ai_readiness_dimension: r.ai_readiness_dimension,
        y3172_stage: r.y3172_stage,
        embedding: embeddings[j],
      });
    }
    processed += batch.length;

    if (pendingRows.length >= DB_BATCH_SIZE || i === batches.length - 1) {
      console.log(`Upserting ${pendingRows.length} rows into kb_chunks ...`);
      const { error: chunkErr } = await supabase
        .from("kb_chunks")
        .upsert(pendingRows, { onConflict: "chunk_id" });
      if (chunkErr) throw new Error(`kb_chunks upsert failed: ${chunkErr.message}`);
      pendingRows = [];
    }
  }

  console.log(`\nDone. Embedded and upserted ${processed} chunks across ${docRows.length} documents.`);
  console.log("Next: run scripts/verify-ingestion.mjs (see docs/PHASE_3_SETUP.md) to confirm row counts in Supabase.");
}

main().catch((err) => {
  console.error("\nINGESTION FAILED:", err.message);
  process.exit(1);
});
