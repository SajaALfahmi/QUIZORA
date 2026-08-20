import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

type SupabaseServiceClient = ReturnType<typeof createClient>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Same validation contract as generateAndInsertBatch() in
// adaptive-engine/index.ts - kept in sync manually since Edge Functions
// here don't share a common module.
type GeneratedOption = { content?: unknown; is_correct?: unknown };
interface GeneratedQuestion {
  content?: unknown;
  explanation?: unknown;
  options?: unknown;
}

function hasCorruptedText(text: string): boolean {
  return text.includes("�");
}

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function hasValidQuestionShell(content: unknown, difficulty: unknown): boolean {
  if (typeof content !== "string" || content.trim().length === 0) return false;
  if (hasCorruptedText(content)) return false;
  if (typeof difficulty !== "string" || !VALID_DIFFICULTIES.has(difficulty)) return false;
  return true;
}

function hasValidOptions(options: unknown): boolean {
  if (!Array.isArray(options) || options.length !== 4) return false;
  const opts = options as GeneratedOption[];
  if (!opts.every((o) => typeof o?.content === "string" && o.content.trim().length > 0)) return false;
  if (opts.some((o) => hasCorruptedText(String(o.content)))) return false;
  const correctCount = opts.filter((o) => o?.is_correct === true).length;
  if (correctCount !== 1) return false;
  const normalizedContents = opts.map((o) => String(o.content).trim().toLowerCase());
  return new Set(normalizedContents).size === normalizedContents.length;
}

// --- Deterministic math validation (mirrors adaptive-engine/index.ts) ---
function evaluateArithmeticExpression(expr: string): number | null {
  const s = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (s.length === 0) return null;
  let pos = 0;

  function parseNumber(): number | null {
    const m = /^\d+(\.\d+)?/.exec(s.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    return parseFloat(m[0]);
  }
  function parseFactor(): number | null {
    if (s[pos] === "(") {
      pos++;
      const v = parseExpr();
      if (s[pos] !== ")") return null;
      pos++;
      return v;
    }
    if (s[pos] === "-") {
      pos++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (s[pos] === "+") {
      pos++;
      return parseFactor();
    }
    return parseNumber();
  }
  function parseTerm(): number | null {
    let v = parseFactor();
    if (v === null) return null;
    while (s[pos] === "*" || s[pos] === "/") {
      const op = s[pos];
      pos++;
      const rhs = parseFactor();
      if (rhs === null) return null;
      if (op === "/" && rhs === 0) return null;
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  }
  function parseExpr(): number | null {
    let v = parseTerm();
    if (v === null) return null;
    while (s[pos] === "+" || s[pos] === "-") {
      const op = s[pos];
      pos++;
      const rhs = parseTerm();
      if (rhs === null) return null;
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = parseExpr();
  if (pos !== s.length || result === null || !isFinite(result)) return null;
  return result;
}

function parseLinearTerms(expr: string, varSymbols: string[]): { coef: number; constant: number } | null {
  let s = expr.replace(/\s+/g, "");
  if (s.length === 0) return null;
  if (!/^[+-]/.test(s)) s = "+" + s;
  const terms = s.match(/[+-][^+-]+/g);
  if (!terms) return null;

  let coef = 0;
  let constant = 0;
  for (const term of terms) {
    const sign = term[0] === "-" ? -1 : 1;
    const body = term.slice(1);
    if (body.length === 0) return null;
    const varSymbol = varSymbols.find((v) => body.includes(v));
    if (varSymbol) {
      const numPart = body.replace(varSymbol, "");
      const n = numPart === "" ? 1 : parseFloat(numPart);
      if (isNaN(n)) return null;
      coef += sign * n;
    } else {
      const n = parseFloat(body);
      if (isNaN(n)) return null;
      constant += sign * n;
    }
  }
  return { coef, constant };
}

function extractNumericValue(text: string): number | null {
  const trimmed = text.trim();
  const direct = parseFloat(trimmed);
  if (!isNaN(direct) && String(direct) === trimmed.replace(/^\+/, "")) return direct;
  const fractionMatch = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(trimmed);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator !== 0) return numerator / denominator;
  }
  const leadingMatch = /-?\d+(?:\.\d+)?/.exec(trimmed);
  if (leadingMatch) return parseFloat(leadingMatch[0]);
  return null;
}

const VARIABLE_SYMBOLS = ["س", "x", "X"];

function deterministicMathCheck(questionContent: string, correctOptionContent: string): boolean | null {
  const expectedValue = extractNumericValue(correctOptionContent);
  if (expectedValue === null) return null;

  if (questionContent.includes("=") && VARIABLE_SYMBOLS.some((v) => questionContent.includes(v))) {
    const eqMatch = /([0-9xXس+\-*/×÷().\s]+)=([0-9xXس+\-*/×÷().\s]+)/.exec(questionContent);
    if (!eqMatch) return null;
    const lhs = parseLinearTerms(eqMatch[1].replace(/×/g, "*").replace(/÷/g, "/"), VARIABLE_SYMBOLS);
    const rhs = parseLinearTerms(eqMatch[2].replace(/×/g, "*").replace(/÷/g, "/"), VARIABLE_SYMBOLS);
    if (!lhs || !rhs) return null;
    const coefDiff = lhs.coef - rhs.coef;
    if (coefDiff === 0) return null;
    const solution = (rhs.constant - lhs.constant) / coefDiff;
    return Math.abs(solution - expectedValue) < 0.01;
  }

  const arithMatches = questionContent.match(/[0-9+\-*/×÷().\s]{3,}/g);
  if (!arithMatches) return null;
  const candidate = arithMatches.sort((a, b) => b.length - a.length)[0];
  if (!candidate || !/[+\-*/×÷]/.test(candidate)) return null;

  const computed = evaluateArithmeticExpression(candidate);
  if (computed === null) return null;
  return Math.abs(computed - expectedValue) < 0.01;
}

async function isDuplicateOfExistingQuestion(
  supabaseService: SupabaseServiceClient,
  courseId: string,
  content: string
): Promise<boolean> {
  const normalized = content.trim().replace(/\s+/g, " ").toLowerCase();
  const { data } = await supabaseService.from("questions").select("id, content").eq("course_id", courseId);
  if (!Array.isArray(data)) return false;
  return (data as { content?: unknown }[]).some(
    (row) => typeof row.content === "string" && row.content.trim().replace(/\s+/g, " ").toLowerCase() === normalized
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase: SupabaseServiceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const body = await req.json();
    const { skill_id, course_id, difficulty = "medium", count = 5, language = "ar" } = body;

    if (!skill_id || !course_id) {
      return new Response(JSON.stringify({ error: "skill_id and course_id are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: skill } = await supabase.from("skills").select("*").eq("id", skill_id).single();
    const { data: course } = await supabase.from("courses").select("*").eq("id", course_id).single();

    if (!skill || !course) {
      return new Response(JSON.stringify({ error: "Skill or course not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const skillRow = skill as { name: string };
    const courseRow = course as { title: string };

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const prompt = buildQuestionPrompt(courseRow, skillRow, difficulty, count, language);

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: language === "ar" ? "أنت خبير في إنشاء أسئلة تعليمية عالية الجودة. أعد فقط JSON صالح بدون markdown." : "You are an expert educational question generator. Return valid JSON only without markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return new Response(JSON.stringify({ error: "OpenAI request failed", details: errorText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    // The model should return a JSON string in choices[0].message.content
    const raw = aiData?.choices?.[0]?.message?.content ?? aiData?.choices?.[0]?.text ?? null;
    if (!raw) return new Response(JSON.stringify({ error: "No content from OpenAI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let parsed: { questions?: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(raw);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: "Failed to parse AI response as JSON", details: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const generatedQuestions: GeneratedQuestion[] = parsed.questions || [];
    const savedQuestions: unknown[] = [];

    for (const q of generatedQuestions) {
      if (!hasValidQuestionShell(q.content, difficulty)) continue;
      if (!hasValidOptions(q.options)) continue;

      const content = q.content as string;
      const options = q.options as GeneratedOption[];
      const correctOption = options.find((o) => o.is_correct === true);
      if (correctOption) {
        const mathVerdict = deterministicMathCheck(content, String(correctOption.content));
        if (mathVerdict === false) continue;
      }

      if (await isDuplicateOfExistingQuestion(supabase, course_id, content)) continue;

      const { data: savedQuestion, error: questionError } = await supabase
        .from("questions")
        .insert({ skill_id, course_id, content, explanation: q.explanation, difficulty, is_ai_generated: true, language })
        .select()
        .single();

      if (questionError || !savedQuestion) continue;
      const savedQuestionRow = savedQuestion as { id: string };

      const optionRows = options.map((option, index: number) => ({
        question_id: savedQuestionRow.id,
        content: option.content,
        is_correct: option.is_correct,
        order_index: index,
      }));
      const { data: savedOptions, error: optionsError } = await supabase.from("answer_options").insert(optionRows).select();

      if (optionsError || !savedOptions || savedOptions.length !== optionRows.length) {
        await supabase.from("questions").delete().eq("id", savedQuestionRow.id);
        continue;
      }

      savedQuestions.push({ ...savedQuestionRow, answer_options: savedOptions });
    }

    return new Response(JSON.stringify({ questions: savedQuestions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildQuestionPrompt(course: { title: string }, skill: { name: string }, difficulty: string, count: number, language: string) {
  const difficultyMap: Record<string, string> = {
    easy: language === "ar"
      ? "سهل - خطوة واحدة مباشرة فقط (استرجاع حقيقة، أو تطبيق قاعدة أو عملية حسابية بسيطة واحدة)"
      : "Easy - a single direct step only (recalling one fact, or applying one simple rule/calculation)",
    medium: language === "ar"
      ? "متوسط - يتطلب دمج خطوتين إلى ثلاث خطوات، أو ربط مفهومين مرتبطين ببعضهما"
      : "Medium - requires combining 2-3 steps, or connecting two related concepts",
    hard: language === "ar"
      ? "صعب - يتطلب عدة خطوات مركبة، أو دمج مفاهيم متعددة، أو تحليلاً أعمق. يجب ألا يكون مجرد عملية حسابية بسيطة من خطوة واحدة أو استرجاع حقيقة مباشرة"
      : "Hard - requires multiple combined steps, integrating several concepts, or deeper analysis. Must NOT be a single simple one-step calculation or a plain fact-recall question",
  };
  const difficultyText = difficultyMap[difficulty] ?? difficulty;

  const explanationRules = language === "ar"
    ? 'كل شرح يجب أن: (1) يوضح خطوات الاستدلال أو الحساب بإيجاز، (2) ينتهي بجملة صريحة تذكر الإجابة النهائية بوضوح (مثال: "إذاً س = 4")، (3) يبقى ضمن نطاق الخيارات الأربعة المعطاة فقط - لا تذكر أي مصطلح أو حقيقة أو خيار غير موجود ضمن الأربعة خيارات.'
    : 'Every explanation must: (1) briefly show the reasoning/calculation steps, (2) end with an explicit sentence stating the final answer clearly (e.g. "so x = 4"), (3) stay strictly within the scope of the 4 given options - never mention a term, fact, or option that is not one of the 4 options.';

  const selfContainmentRule = language === "ar"
    ? 'إذا كان السؤال يتطلب حسابات أو معادلات أو ثوابت علمية، يجب أن يذكر السؤال نفسه كل قانون وكل ثابت رقمي لازم للوصول إلى الإجابة الصحيحة - لا تفترض أن الطالب يعرف ثابتاً غير مذكور. يجب أن تكون الإجابة الصحيحة قابلة للاشتقاق فقط من المعطيات المذكورة صراحة في نص السؤال.'
    : 'If a question requires a calculation, formula, or scientific constant, the question itself must state every formula and numeric constant needed to reach the correct answer - never assume the student already knows an unstated constant. The marked-correct answer must be derivable ONLY from what is explicitly given in the question text.';

  if (language === "ar") {
    return `أنشئ ${count} أسئلة اختيار من متعدد باللغة العربية.

المادة: ${course.title}
المهارة: ${skill.name}
الصعوبة: ${difficultyText}

الشروط:
- 4 خيارات لكل سؤال
- خيار واحد صحيح فقط
- ${explanationRules}
- ${selfContainmentRule}
- أعد JSON صالحاً فقط بهذا الشكل:\n{ "questions": [ { "content": "...", "explanation": "...", "options": [ { "content": "...", "is_correct": false } ] } ] }
- تأكد قبل الإرسال أن مستوى صعوبة كل سؤال يطابق فعلياً "${difficulty}" كما هو موصوف أعلاه.`;
  }
  return `Generate ${count} multiple-choice questions for the course "${course.title}" about "${skill.name}".

Difficulty: ${difficultyText}

Requirements:
- 4 options per question, exactly 1 correct
- ${explanationRules}
- ${selfContainmentRule}
- Return valid JSON only in this shape:
{ "questions": [ { "content": "...", "explanation": "...", "options": [ { "content": "...", "is_correct": false } ] } ] }
- Before returning, double-check that each question's actual difficulty genuinely matches "${difficulty}" as described above.`;
}
