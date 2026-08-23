import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";
// Over-fetch candidates so diversifyChunks() below has enough to pick a
// varied final set from, rather than being stuck with whatever a single
// dominant document's chunks happened to occupy every slot with.
const CANDIDATE_COUNT = 20;
const MAX_CHUNKS_PER_DOCUMENT = 2;
const FINAL_CHUNK_COUNT = 8;
// Keeps a single demo call cheap and fast, and rejects obvious abuse of the
// endpoint - a real scenario description fits comfortably within this.
const MAX_SCENARIO_LENGTH = 4000;

function normalizeLanguage(value: unknown): "ar" | "en" {
  return value === "ar" ? "ar" : "en";
}

interface KbChunkMatch {
  chunk_id: string;
  document_id: string;
  document_title: string;
  organization: string;
  official_source: string;
  chunk_text: string;
  page: number | null;
  section: string | null;
  ai_readiness_factor: string | null;
  ai_readiness_dimension: string | null;
  y3172_stage: string | null;
  similarity: number;
}

// match_kb_chunks() returns candidates already ordered by descending
// similarity (ORDER BY embedding <=> query_embedding), so a single greedy
// pass in that order naturally keeps the highest-similarity chunk(s) for
// each document within the per-document cap. Caps how many chunks any one
// document can contribute so a single dominant/generic document can't
// occupy the entire context window and crowd out other genuinely relevant
// sources - without ever padding the result back up to finalCount with
// weaker matches just to hit a round number.
function diversifyChunks(
  candidates: KbChunkMatch[],
  maxPerDocument: number,
  finalCount: number
): KbChunkMatch[] {
  const perDocumentCount = new Map<string, number>();
  const selected: KbChunkMatch[] = [];
  for (const candidate of candidates) {
    if (selected.length >= finalCount) break;
    const count = perDocumentCount.get(candidate.document_id) ?? 0;
    if (count >= maxPerDocument) continue;
    selected.push(candidate);
    perDocumentCount.set(candidate.document_id, count + 1);
  }
  return selected;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // =========================
    // AUTH - reject anonymous callers, same as generate-explanation
    // =========================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized - Missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================
    // REQUEST BODY
    // =========================
    const { scenario, language: requestedLanguage } = await req.json();
    const language = normalizeLanguage(requestedLanguage);

    if (typeof scenario !== "string" || !scenario.trim()) {
      throw new Error("scenario is required");
    }
    const trimmedScenario = scenario.trim().slice(0, MAX_SCENARIO_LENGTH);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("analyze-scenario: OPENAI_API_KEY is not set");
      throw new Error("Analysis is not configured. Please contact support.");
    }

    // =========================
    // 1. EMBED THE SCENARIO
    // =========================
    const embedResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: trimmedScenario }),
    });
    if (!embedResponse.ok) {
      const errText = await embedResponse.text();
      console.error("analyze-scenario: embedding request failed", embedResponse.status, errText);
      throw new Error("Failed to process the scenario. Please try again shortly.");
    }
    const embedData = await embedResponse.json();
    const queryEmbedding = embedData?.data?.[0]?.embedding;
    if (!Array.isArray(queryEmbedding)) {
      throw new Error("Failed to generate an embedding for the scenario.");
    }

    // =========================
    // 2. RETRIEVE RELEVANT KB CHUNKS
    // =========================
    // Called as the requesting user (forwarded JWT), not service_role - this
    // exercises the exact authenticated-role RLS/GRANT path the migration
    // was designed and verified against, rather than bypassing it.
    const { data: chunks, error: matchError } = await supabaseAuth.rpc("match_kb_chunks", {
      query_embedding: queryEmbedding,
      match_count: CANDIDATE_COUNT,
    });
    if (matchError) {
      console.error("analyze-scenario: match_kb_chunks failed", matchError);
      throw new Error("Failed to retrieve knowledge base evidence.");
    }

    const candidates = (chunks ?? []) as KbChunkMatch[];
    // Diversify from the wider candidate pool - capped per document, never
    // padded back up with weaker matches just to reach FINAL_CHUNK_COUNT.
    const results = diversifyChunks(candidates, MAX_CHUNKS_PER_DOCUMENT, FINAL_CHUNK_COUNT);

    // =========================
    // 3. BUILD GROUNDED CONTEXT
    // =========================
    const contextText = results.length
      ? results
          .map(
            (c, i) =>
              `[${i + 1}] ${c.document_id} - ${c.document_title} (${c.organization})\n${c.chunk_text}\nSource: ${c.official_source}`
          )
          .join("\n\n---\n\n")
      : "(No matching knowledge base evidence was found for this scenario.)";

    const sources = results.map((c) => ({
      document_id: c.document_id,
      document_title: c.document_title,
      organization: c.organization,
      official_source: c.official_source,
      similarity: c.similarity,
    }));

    // =========================
    // 4. ANALYSIS VIA LLM, GROUNDED ONLY IN RETRIEVED CONTEXT
    // =========================
    const systemPrompt =
      language === "ar"
        ? `أنت محلل سياسات متخصص في جاهزية الذكاء الاصطناعي. مهمتك تحليل السيناريو المُقدَّم مقابل مقتطفات قاعدة المعرفة (وثائق سياسات/معايير رسمية) المرفقة فقط.
قواعد صارمة:
1. استند فقط على المقتطفات المرفقة أدناه - لا تخترع أي وثيقة أو حكم غير موجود فيها.
2. لكل نقطة تحليل، اذكر الوثيقة المرجعية بصيغة [رقم المصدر] أو معرّف الوثيقة (مثل KB-08).
3. إذا لم تكفِ المقتطفات للإجابة على جزء من السيناريو، صرّح بذلك بوضوح بدل التخمين.
4. رد دائمًا بالعربي.
5. نظّم الجواب بنقاط واضحة ومختصرة.`
        : `You are a policy analyst specializing in AI readiness assessment. Analyze the given scenario strictly against the attached knowledge base excerpts (official policy/standards documents).
Strict rules:
1. Ground every claim ONLY in the excerpts below - never invent a document or provision not present in them.
2. For every point, cite the source using [source number] or the document ID (e.g. KB-08).
3. If the excerpts don't cover part of the scenario, say so explicitly instead of guessing.
4. Always respond in English.
5. Structure the answer as clear, concise bullet points.`;

    const userPrompt =
      language === "ar"
        ? `السيناريو:\n${trimmedScenario}\n\nمقتطفات قاعدة المعرفة ذات الصلة:\n${contextText}\n\nحلّل هذا السيناريو مقابل السياسات/المعايير أعلاه.`
        : `Scenario:\n${trimmedScenario}\n\nRelevant knowledge base excerpts:\n${contextText}\n\nAnalyze this scenario against the policies/standards above.`;

    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!chatResponse.ok) {
      const errText = await chatResponse.text();
      console.error("analyze-scenario: chat completion failed", chatResponse.status, errText);
      throw new Error("The analysis assistant is temporarily unavailable. Please try again shortly.");
    }
    const chatData = await chatResponse.json();
    const analysis = chatData?.choices?.[0]?.message?.content;
    if (!analysis) {
      console.error("analyze-scenario: no analysis returned", chatData);
      throw new Error("No analysis was returned.");
    }

    return new Response(
      JSON.stringify({ success: true, analysis, sources }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("analyze-scenario error:", error?.message || String(error));
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
