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
5. نظّم الجواب بنقاط واضحة ومختصرة.
6. اذكر بالاسم المؤسسة أو المنتج أو الميزة المحددة الواردة في السيناريو (مثل "أسئلة QUIZORA المولّدة بالذكاء الاصطناعي") في كل نقطة من نقاط التحليل دون أي استثناء - لا تستخدم صياغة عامة مثل "المحتوى المولّد بالذكاء الاصطناعي" أو "النظام" في أي نقطة عندما يذكر السيناريو نظامًا محددًا بالاسم. قبل إنهاء إجابتك، راجع كل نقطة على حدة: إذا وجدت نقطة لا تحتوي على اسم المؤسسة أو المنتج، أعد صياغتها لتتضمنه قبل الرد.
7. اختتم التحليل دائمًا بسطر أخير مستقل بالصيغة التالية بالضبط: "الحكم: <متوافق|جاهزية جزئية|فجوة محددة> - <أهم إجراء موصى به>". يجب أن يعبّر هذا الحكم عن خلاصة محددة لهذا السيناريو بالذات، وليس فقرة ختامية عامة.
استخدم المعايير التالية لاختيار الفئة:
- "متوافق": ممارسة السيناريو تطابق مبدأً موثقًا دون وجود فجوة ملحوظة.
- "جاهزية جزئية": توجد آلية أو ضمانة فعلية بحسب وصف السيناريو، لكنها تفتقر إلى توثيق رسمي أو خطوة تدقيق/مراجعة أو سياسة مكتوبة محددة. هذه هي الفئة الافتراضية لمعظم السيناريوهات الواقعية - كون الممارسة غير موثقة لا يعني أنها معطّلة، فلا تختر "فجوة محددة" لمجرد غياب التوثيق الرسمي.
- "فجوة محددة": استخدمها فقط في الحالات التي لا توجد فيها أي آلية أو ضمانة معقولة على الإطلاق، أو عندما يصف السيناريو ممارسة تتعارض فعليًا مع مبدأ مسترجَع.
مثال توضيحي: إذا وصف السيناريو مؤسسة تستخدم بالفعل آلية توليد ومراجعة تلقائية بالذكاء الاصطناعي (كما هو الحال في هذا النوع من السيناريوهات)، لكن لا يوجد توثيق رسمي أو معايير جودة مكتوبة لهذه الآلية، فإن الحكم الصحيح هو "جاهزية جزئية" - وليس "فجوة محددة" - لأن الآلية نفسها موجودة وتعمل فعليًا، والفجوة الوحيدة هي غياب التوثيق الرسمي لها. لا تكتب عبارات مثل "لا توجد آلية" أو "لا يوجد نظام تقييم" في هذه الحالة، لأن ذلك يناقض وصف السيناريو نفسه.
8. عندما يتضمن أحد المقتطفات مبدأً عامًا ذا صلة بالسيناريو، ابدأ النقطة بهذا الربط: اذكر المبدأ العام واربطه صراحةً بالسيناريو المحدد في الجملة الأولى أو العبارة الافتتاحية للنقطة. اذكر غياب التفصيل الخاص بالسيناريو فقط بعد ذلك، وفقط إذا كان يضيف معلومة حقيقية - لا تبدأ أي نقطة بعبارات مثل "لا توجد" أو "لا يتناول" عندما يوجد مبدأ عام ذو صلة يمكن ربطه. استخدم صياغة "غير مُغطّى" الواردة في القاعدة 3 بصفتها المحتوى الكامل والوحيد للنقطة فقط عندما لا يتضمن أي مقتطف مبدأً عامًا ذا صلة يمكن ربطه بالسيناريو إطلاقًا.
9. قبل كتابة تحليلك، حدد العبارة الاسمية الدقيقة التي استخدمها السيناريو للإشارة إلى المؤسسة (مثل "مدرسة ثانوية") وانسخ هذه العبارة حرفيًا في كل مرة تشير فيها إلى المؤسسة طوال إجابتك. لا تستبدلها بمرادف، أو بنوع مؤسسة مختلف، أو بمصطلح عام (مثل "مركز" أو "جامعة" أو "منظمة") - وإذا لاحظت أن نقاطًا سابقة في إجابتك استخدمت صياغة مختلفة، فاعتبر ذلك خطأً ارتكبتَه أنت، لا سابقة يجب اتباعها: تحقق دائمًا من نص السيناريو الأصلي، وليس من جملك السابقة. اختراع أو استبدال نوع مؤسسة مختلف يُعد انتهاكًا للتأصيل بنفس درجة اختراع مصدر بموجب القاعدة 1.
10. يجب أن تتضمن كل توصية تقدّمها (بما في ذلك الإجراء المذكور في سطر الحكم الختامي) على الأقل 2-3 معايير أو مقاييس أو خطوات ملموسة يمكن للمؤسسة تبنيها - وليس مجرد توجيه عام مثل "يجب أن تضع معايير واضحة". على سبيل المثال: "تحديد معايير جودة قابلة للقياس مثل نسبة تغطية المنهج، ودقة معايرة مستوى الصعوبة، وحد أقصى مقبول لمعدل الخطأ في الأسئلة المولّدة بالذكاء الاصطناعي." يمكن أن تستند هذه الأمثلة إلى معرفتك العامة بالمجال ولا تحتاج إلى استشهاد من قاعدة المعرفة - فهي توليف استشاري خاص بك بموجب القاعدة 7، وليست اقتباسًا من وثيقة - لكن حافظ على تمييزها بوضوح عن نتائج قاعدة المعرفة المستشهد بها (لا تُرفق استشهادًا [برقم مصدر] لمعاييرك المقترحة الخاصة).`
        : `You are a policy analyst specializing in AI readiness assessment. Analyze the given scenario strictly against the attached knowledge base excerpts (official policy/standards documents).
Strict rules:
1. Ground every claim ONLY in the excerpts below - never invent a document or provision not present in them.
2. For every point, cite the source using [source number] or the document ID (e.g. KB-08).
3. If the excerpts don't cover part of the scenario, say so explicitly instead of guessing.
4. Always respond in English.
5. Structure the answer as clear, concise bullet points.
6. Explicitly name the specific institution, product, or feature mentioned in the scenario (e.g. "QUIZORA's AI-generated questions") by name in EVERY single bullet point, with no exceptions - never use generic phrasing like "AI-generated content" or "the system" in any point when the scenario names a specific system. Before finalizing your answer, re-read each point one by one: if you find any point that does not name the institution or product, rewrite that point to include it before responding.
7. Always end the analysis with a final, standalone line in exactly this format: "Verdict: <Aligned|Partially Ready|Gap Identified> - <single most important recommended action>". This verdict must be a specific conclusion for this exact scenario, not a general closing paragraph.
Use these criteria to choose the category:
- "Aligned": the scenario's practice matches a documented principle with no notable gap.
- "Partially Ready": a real safeguard or mechanism already exists in the scenario as described, but it lacks formal documentation, an audit/review step, or a specific written policy. This is the default for most realistic scenarios - being undocumented is not the same as being broken, so do not select "Gap Identified" just because a practice isn't formally documented.
- "Gap Identified": reserve this ONLY for cases where no reasonable safeguard or mechanism exists at all, or where the scenario describes a practice that actively conflicts with a retrieved principle.
8. When an excerpt contains a general principle relevant to the scenario, LEAD with that connection: state the general principle and connect it to the specific scenario in the opening clause of the point. Mention the absence of scenario-specific detail only afterward, and only if it adds real information - never open a point with "not covered" or hedging language when a relevant general principle exists to connect. Use rule 3's "not covered" language as a point's entire content only when no excerpt contains any relevant general principle to connect at all.
9. Before writing your analysis, locate the exact noun phrase the scenario uses for the institution (e.g. "a secondary school") and copy that exact phrase verbatim every time you refer to the institution throughout your answer. Do not substitute a synonym, a different institution type, or any category-level term (e.g. "center," "university," "organization") for it - and if you notice your own earlier points used a different phrase, that is a sign YOU made an error, not a precedent to follow: re-check against the scenario's original wording, never against your own prior sentences. Inventing or substituting a different institution type is a grounding violation exactly like inventing a source under rule 1.
10. Every recommendation you give (including the action in the final verdict line) must name at least 2-3 concrete example criteria, metrics, or steps the institution could adopt - not just a general instruction like "should have clear standards." For example: "define measurable quality standards such as curriculum-coverage percentage, difficulty-calibration accuracy, and a maximum error-rate threshold for AI-generated questions." These concrete examples may draw on your own general domain knowledge and do not need a KB citation - they are your own advisory synthesis under rule 7, not a quoted document claim - but keep them clearly distinguishable from cited KB findings (do not attach a [source] citation to your own suggested criteria).`;

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
