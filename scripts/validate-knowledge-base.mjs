#!/usr/bin/env node
/**
 * scripts/validate-knowledge-base.mjs
 *
 * Re-validates the Phase 2 dataset (quizora_kb_chunks.jsonl) BEFORE ingestion.
 * Does not modify the dataset. Does not touch Supabase. Read-only check.
 *
 * Usage:
 *   node scripts/validate-knowledge-base.mjs path/to/quizora_kb_chunks.jsonl
 */
import fs from "node:fs";
import readline from "node:readline";

const REQUIRED_FIELDS = [
  "chunk_id", "document_id", "document_title", "organization", "country",
  "year", "version", "document_type", "category", "folder", "filename",
  "language", "source_type", "official_source", "domain",
  "ai_readiness_factor", "ai_readiness_dimension", "y3172_stage",
  "relevance_to_quizora", "page", "section", "chunk_index", "chunk_text",
];

const EXPECTED_DOC_IDS = Array.from({ length: 12 }, (_, i) =>
  `KB-${String(i + 1).padStart(2, "0")}`
);

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node validate-knowledge-base.mjs <path-to-jsonl>");
    process.exit(1);
  }
  if (!fs.existsSync(path)) {
    console.error(`File not found: ${path}`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf-8") });
  let lineNo = 0;
  let valid = 0;
  const malformed = [];
  const docCounts = {};
  const missingFields = [];
  const chunkIdSeen = new Map();
  const dupeIds = [];
  const textSeen = new Map();
  const dupeText = [];

  for await (const raw of rl) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      malformed.push({ line: lineNo, error: e.message });
      continue;
    }
    valid++;

    docCounts[rec.document_id] = (docCounts[rec.document_id] || 0) + 1;

    for (const f of REQUIRED_FIELDS) {
      if (!(f in rec)) missingFields.push({ chunk_id: rec.chunk_id ?? "?", field: f });
    }

    if (chunkIdSeen.has(rec.chunk_id)) {
      dupeIds.push(rec.chunk_id);
    } else {
      chunkIdSeen.set(rec.chunk_id, true);
    }

    const key = `${rec.document_id}::${(rec.chunk_text || "").trim()}`;
    if (textSeen.has(key)) {
      dupeText.push([textSeen.get(key), rec.chunk_id]);
    } else {
      textSeen.set(key, rec.chunk_id);
    }
  }

  const missingDocs = EXPECTED_DOC_IDS.filter((d) => !docCounts[d]);
  const total = Object.values(docCounts).reduce((a, b) => a + b, 0);

  const result = {
    file: path,
    total_lines_read: lineNo,
    valid_json_records: valid,
    malformed_lines: malformed,
    total_chunks: total,
    expected_chunks: 719,
    chunk_count_matches_expected: total === 719,
    per_document_counts: docCounts,
    missing_document_ids: missingDocs,
    all_12_documents_present: missingDocs.length === 0,
    chunks_missing_required_field_count: missingFields.length,
    chunks_missing_required_field_sample: missingFields.slice(0, 10),
    duplicate_chunk_id_count: dupeIds.length,
    duplicate_chunk_ids: dupeIds.slice(0, 10),
    duplicate_text_pair_count: dupeText.length,
    duplicate_text_pairs_sample: dupeText.slice(0, 10),
  };

  console.log(JSON.stringify(result, null, 2));

  const ok =
    malformed.length === 0 &&
    result.chunk_count_matches_expected &&
    result.all_12_documents_present &&
    missingFields.length === 0;

  console.log(ok ? "\nVALIDATION: PASS" : "\nVALIDATION: FAIL — see fields above");
  process.exit(ok ? 0 : 2);
}

main();
