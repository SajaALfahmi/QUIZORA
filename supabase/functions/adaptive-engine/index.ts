/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// Derived from the actual imported client rather than hand-typed, so it
// stays accurate without needing a separate Database schema type import.
type SupabaseServiceClient = ReturnType<typeof createClient>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-action",
};

// ===== BKT Parameters =====
const BKT = {
  P_L0: 0.3,
  P_T: 0.15,
  P_G: 0.2,
  P_S: 0.1,
};

function updateMastery(currentMastery: number, isCorrect: boolean): number {
  const pL = currentMastery;
  const pCorrect = pL * (1 - BKT.P_S) + (1 - pL) * BKT.P_G;
  const pWrong = 1 - pCorrect;
  let pLgivenObs: number;
  if (isCorrect) {
    pLgivenObs = (pL * (1 - BKT.P_S)) / pCorrect;
  } else {
    pLgivenObs = (pL * BKT.P_S) / pWrong;
  }
  const newMastery = pLgivenObs + (1 - pLgivenObs) * BKT.P_T;
  return Math.max(0, Math.min(1, newMastery));
}

function masteryToDifficulty(mastery: number): string {
  if (mastery >= 0.7) return "hard";
  if (mastery >= 0.4) return "medium";
  return "easy";
}

// Single, explicit place where an invalid/missing language value is resolved.
// Any fallback here is logged, never silent, so a dropped/omitted language
// argument upstream is visible instead of quietly behaving like "en".
function normalizeLanguage(value: unknown): "ar" | "en" {
  if (value === "ar" || value === "en") return value;
  console.warn(`adaptive-engine: unexpected language value "${value}" - falling back to "en"`);
  return "en";
}

// Same pattern as normalizeLanguage() above: the frontend's difficulty
// selector is already a strict "auto"|"easy"|"medium"|"hard" TypeScript
// union, so this is defense-in-depth rather than a fix for a currently
// observed bug - it guarantees targetDifficulty can only ever be one of
// the canonical, lowercase values that questions.difficulty actually
// stores, so a malformed/unexpected value can never silently cause every
// difficulty-pool lookup to come up empty.
function normalizeDifficultyMode(value: unknown): "auto" | "easy" | "medium" | "hard" {
  if (value === "auto" || value === "easy" || value === "medium" || value === "hard") return value;
  console.warn(`adaptive-engine: unexpected difficulty_mode value "${value}" - falling back to "auto"`);
  return "auto";
}

// Short subject labels used to build a language-correct auto-generated
// skill name. Kept in sync with the "skill.*" translation keys in
// src/contexts/LanguageContext.tsx so frontend lookups continue to match.
const SUBJECT_LABELS: Record<string, { ar: string; en: string }> = {
  verbal: { ar: "اللفظي", en: "Verbal" },
  quantitative: { ar: "الكمي", en: "Quantitative" },
  mathematics: { ar: "الرياضيات", en: "Mathematics" },
  physics: { ar: "الفيزياء", en: "Physics" },
  chemistry: { ar: "الكيمياء", en: "Chemistry" },
  biology: { ar: "الأحياء", en: "Biology" },
  ccna: { ar: "الشبكات", en: "Network" },
  security: { ar: "الأمن السيبراني", en: "Security" },
  aws: { ar: "الحوسبة السحابية", en: "Cloud" },
  pmp: { ar: "إدارة المشاريع", en: "Project Management" },
};

// Known-course metadata, keyed by course_id. Hoisted to module scope so
// both ensureCourseExists (bulk, session-start generation) and the
// on-demand exhaustion-triggered generation in handleNextQuestion can
// resolve a course's sub_category without duplicating this table or
// adding an extra DB round-trip.
const COURSE_DATA: Record<string, any> = {
  "455159fc-0c91-445e-a3b3-650d0727f1f7": { category: "qudurat", sub_category: "verbal", title: "Qudurat - Verbal", description: "Verbal reasoning" },
  "954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f": { category: "qudurat", sub_category: "quantitative", title: "Qudurat - Quantitative", description: "Quantitative reasoning" },
  "9127a8c4-1d22-4d29-a5e9-3530ded07534": { category: "tahseeli", sub_category: "mathematics", title: "Tahseeli - Mathematics", description: "Mathematics" },
  "c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf": { category: "tahseeli", sub_category: "physics", title: "Tahseeli - Physics", description: "Physics" },
  "7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9": { category: "tahseeli", sub_category: "chemistry", title: "Tahseeli - Chemistry", description: "Chemistry" },
  "f8f8a675-09ea-4179-b4f8-b32a2b232fbc": { category: "tahseeli", sub_category: "biology", title: "Tahseeli - Biology", description: "Biology" },
  "48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864": { category: "certifications", sub_category: "ccna", title: "CCNA", description: "CCNA" },
  "84c82536-ff63-4663-9fa4-7f3818f48e1b": { category: "certifications", sub_category: "security", title: "CompTIA Security+", description: "Security+" },
  "28ce9f52-455c-431d-9e5a-caa107a97fa5": { category: "certifications", sub_category: "aws", title: "AWS Cloud Practitioner", description: "AWS" },
  "304a9f8b-a018-4d8e-a0ff-9889e4b4b635": { category: "certifications", sub_category: "pmp", title: "PMP", description: "PMP" },
};

interface SubmitAnswerPayload {
  session_id: string;
  question_id: string;
  selected_option_id: string;
  time_spent_seconds: number;
}

interface StartSessionPayload {
  course_id: string;
  total_questions?: number;
  difficulty_mode?: string;
  language?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized - Missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const action = req.headers.get("x-action") || new URL(req.url).searchParams.get("action");

    if (action === "start-session") {
      return await handleStartSession(supabaseService, userId, await req.json());
    }
    if (action === "submit-answer") {
      return await handleSubmitAnswer(supabaseService, userId, await req.json());
    }
    if (action === "next-question") {
      const body = await req.json();
      return await handleNextQuestion(supabaseService, userId, body.session_id, body.language);
    }
    if (action === "end-session") {
      const body = await req.json();
      return await handleEndSession(supabaseService, userId, body.session_id);
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleStartSession(supabaseService: any, userId: string, payload: StartSessionPayload) {
  const { course_id, total_questions, difficulty_mode, language } = payload;
  const sessionLanguage = normalizeLanguage(language);

  await ensureCourseExists(supabaseService, course_id, sessionLanguage);

  const { data: session, error } = await supabaseService
    .from("learning_sessions")
    .insert({
      user_id: userId,
      course_id,
      status: "active",
      total_questions: total_questions ?? 25,
      difficulty_mode: normalizeDifficultyMode(difficulty_mode), // ✅ الصح
      language: sessionLanguage,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
// توليد أسئلة جديدة عند بداية كل جلسة

  return new Response(JSON.stringify({ session }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleSubmitAnswer(supabaseService: any, userId: string, payload: SubmitAnswerPayload) {
  const { session_id, question_id, selected_option_id, time_spent_seconds } = payload;

  const { data: option } = await supabaseService
    .from("answer_options")
    .select("is_correct")
    .eq("id", selected_option_id)
    .eq("question_id", question_id)
    .maybeSingle();

  if (!option) {
    return new Response(
      JSON.stringify({ error: "selected_option_id does not belong to question_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const isCorrect = option.is_correct;

  await supabaseService.from("user_answers").insert({
    user_id: userId,
    session_id,
    question_id,
    selected_option_id,
    is_correct: isCorrect,
    time_spent_seconds,
  });

  // ===== BKT Update =====
  const { data: question } = await supabaseService
    .from("questions")
    .select("skill_id")
    .eq("id", question_id)
    .single();

  if (question?.skill_id) {
    const skillId = question.skill_id;

    const { data: skillLevel } = await supabaseService
      .from("user_skill_levels")
      .select("mastery_level, questions_attempted, questions_correct")
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .single();

    const currentMastery = skillLevel?.mastery_level ?? BKT.P_L0;
    const newMastery = updateMastery(currentMastery, isCorrect);
    const questionsAttempted = (skillLevel?.questions_attempted ?? 0) + 1;
    const questionsCorrect = (skillLevel?.questions_correct ?? 0) + (isCorrect ? 1 : 0);

    await supabaseService.from("user_skill_levels").upsert({
      user_id: userId,
      skill_id: skillId,
      mastery_level: newMastery,
      questions_attempted: questionsAttempted,
      questions_correct: questionsCorrect,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,skill_id" });

    console.log(`BKT: ${currentMastery.toFixed(3)} → ${newMastery.toFixed(3)} (correct: ${isCorrect})`);
  }

  const { data: correctOption } = await supabaseService
    .from("answer_options")
    .select("id")
    .eq("question_id", question_id)
    .eq("is_correct", true)
    .maybeSingle();

  return new Response(
    JSON.stringify({ success: true, is_correct: isCorrect, correct_option_id: correctOption?.id ?? null }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleNextQuestion(supabaseService: any, userId: string, sessionId: string, frontendLanguage: string = "en") {
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "session_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  frontendLanguage = normalizeLanguage(frontendLanguage);

  const { data: session, error: sessionError } = await supabaseService
    .from("learning_sessions")
    .select("id, course_id, total_questions, difficulty_mode, language") // ✅ الصح
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const difficultyMode = normalizeDifficultyMode(session.difficulty_mode); // ✅ الصح

  // The session's persisted language is authoritative for its lifetime.
  // A frontend-sent language is never trusted for an existing session - it
  // may just reflect a UI language toggle mid-quiz, which must not change
  // an in-progress session's question language.
  const sessionLanguage = normalizeLanguage(session.language);
  if (frontendLanguage !== sessionLanguage) {
    console.warn(`adaptive-engine: session ${sessionId} locked to language "${sessionLanguage}" - ignoring mismatched request language "${frontendLanguage}"`);
  }

  const { data: answeredQuestions } = await supabaseService
    .from("user_answers")
    .select("question_id")
    .eq("session_id", sessionId);

  const askedQuestionIds = (answeredQuestions || []).map((r: any) => r.question_id);

  if (session.total_questions && askedQuestionIds.length >= session.total_questions) {
    return new Response(JSON.stringify({ question: null, finished: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const fetchServableQuestions = async () => {
    const { data } = await supabaseService
      .from("questions")
      .select(`id, content, explanation, difficulty, skill_id, language, answer_options(id, content, is_correct, order_index)`)
      .eq("course_id", session.course_id);
    // Exclude already-answered questions and any question that isn't safely
    // servable (missing/invalid answer options, empty content, no skill_id) -
    // protects against rows already broken in the database, not just future
    // inserts. Applied before language/difficulty selection so nothing
    // downstream can ever pick a broken row.
    return (data || [])
      .filter((q: any) => !askedQuestionIds.includes(q.id))
      .filter((q: any) => isServableQuestion(q));
  };

  let remaining = await fetchServableQuestions();

  if (!remaining || remaining.length === 0) {
    return new Response(JSON.stringify({ question: null, finished: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Prefer rows already persisted in the requested language. NULL/untagged
  // rows are NOT treated as a match - future data-integrity gap, not a
  // wildcard. Falls back to the full pool - and therefore to the existing
  // needsTranslation()/translateQuestion() fallback - only when no
  // same-language row exists yet.
  let languageMatched = remaining.filter((q: any) => q.language === sessionLanguage);
  let languagePool = languageMatched.length > 0 ? languageMatched : remaining;

  // ===== Question Selection Based on Mode =====
  let targetDifficulty = "medium";

  if (difficultyMode === "auto") {
    const skillIds = [...new Set(languagePool.map((q: any) => q.skill_id).filter(Boolean))];
    if (skillIds.length > 0) {
      const { data: skillLevels } = await supabaseService
        .from("user_skill_levels")
        .select("skill_id, mastery_level")
        .eq("user_id", userId)
        .in("skill_id", skillIds);

      if (skillLevels && skillLevels.length > 0) {
        const avgMastery = skillLevels.reduce((sum: number, s: any) => sum + s.mastery_level, 0) / skillLevels.length;
        targetDifficulty = masteryToDifficulty(avgMastery);
        console.log(`BKT auto: mastery=${avgMastery.toFixed(3)} → ${targetDifficulty}`);
      } else {
        targetDifficulty = masteryToDifficulty(BKT.P_L0);
      }
    }
  } else {
    // Manual mode
    targetDifficulty = difficultyMode;
    console.log(`Manual mode: ${targetDifficulty}`);
  }

  let preferred = languagePool.filter((q: any) => q.difficulty === targetDifficulty);

  if (preferred.length === 0) {
    // total_questions (checked earlier, above) is the only session-
    // completion boundary - pool exhaustion at a specific difficulty must
    // never itself end the session. Attempt to generate more questions for
    // the exact same course/skill/session-language/target-difficulty
    // before deciding the pool is genuinely unable to satisfy the request.
    const skillIdForGeneration = languagePool[0]?.skill_id;
    const subCategoryForGeneration = COURSE_DATA[session.course_id]?.sub_category;

    // Bound generation to what this session could still possibly need -
    // mirrors the same `session.total_questions &&` truthiness guard used
    // for the session-completion check above, so a falsy total_questions
    // (treated there as "no limit") falls back to the previous fixed
    // batch size instead of producing a NaN/negative count. When a real
    // limit exists, it's already guaranteed larger than askedQuestionIds
    // .length at this point (checked above), so this is always >= 1.
    const remainingSessionQuestions = session.total_questions
      ? session.total_questions - askedQuestionIds.length
      : 10;
    const generationCount = Math.min(10, remainingSessionQuestions);

    let generatedCount = 0;
    if (skillIdForGeneration && subCategoryForGeneration) {
      generatedCount = await generateAIQuestionsForDifficulty(
        supabaseService,
        session.course_id,
        skillIdForGeneration,
        subCategoryForGeneration,
        sessionLanguage,
        targetDifficulty,
        generationCount
      );
    }

    if (generatedCount > 0) {
      // Re-fetch so newly inserted (and validated) rows are reflected
      // exactly as persisted, rather than trusted from local state.
      remaining = await fetchServableQuestions();
      languageMatched = remaining.filter((q: any) => q.language === sessionLanguage);
      languagePool = languageMatched.length > 0 ? languageMatched : remaining;
      preferred = languagePool.filter((q: any) => q.difficulty === targetDifficulty);
    }

    if (preferred.length === 0 && difficultyMode !== "auto") {
      // Manual difficulty is a hard constraint: generation was attempted
      // and still could not produce a usable question at the requested
      // difficulty. Ending gracefully is the only safe option left - never
      // silently substitute a different difficulty.
      console.warn(`adaptive-engine: session ${sessionId} manual difficulty "${targetDifficulty}" exhausted and generation did not produce a usable question - ending session`);
      return new Response(JSON.stringify({ question: null, finished: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Auto mode: if still empty here, fall through to the existing
    // any-difficulty fallback below - preserves adaptive flow rather than
    // ending the session prematurely.
  }

  const pool = preferred.length > 0 ? preferred : languagePool;
  let nextQuestion = pool[Math.floor(Math.random() * pool.length)];

  if (needsTranslation(nextQuestion.content, sessionLanguage)) {
    nextQuestion = await translateQuestion(nextQuestion, sessionLanguage);
  }

  // Do not expose is_correct / explanation to the client before the user answers.
  // language is used for selection only and is intentionally omitted here
  // (undefined keys are dropped by JSON.stringify) so the response shape is unchanged.
  const sanitizedQuestion = {
    ...nextQuestion,
    explanation: null,
    language: undefined,
    answer_options: (nextQuestion.answer_options || []).map((opt: any) => ({
      id: opt.id,
      content: opt.content,
      order_index: opt.order_index,
    })),
  };

  return new Response(
    JSON.stringify({ question: sanitizedQuestion, finished: false, difficulty_target: targetDifficulty }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleEndSession(supabaseService: any, userId: string, sessionId: string) {
  const { data, error } = await supabaseService
    .from("learning_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ session: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ensureCourseExists(supabaseService: any, courseId: string, language: "ar" | "en") {
  const { data: existingCourse } = await supabaseService
    .from("courses")
    .select("id, sub_category")
    .eq("id", courseId)
    .single();

  const courseExists = !!existingCourse;
  const courseInfo = COURSE_DATA[courseId];
  if (!courseInfo) return;

  const subCategory = courseExists ? existingCourse.sub_category : courseInfo.sub_category;

  if (!courseExists) {
    await supabaseService.from("courses").insert({ id: courseId, ...courseInfo });
  }

  const { data: existingSkill } = await supabaseService
    .from("skills").select("id").eq("course_id", courseId).limit(1).single();

  let skillId = existingSkill?.id;

  if (!skillId) {
    const label = SUBJECT_LABELS[subCategory]?.[language] ?? subCategory;
    const skillName = subCategory === "pmp"
      ? label
      : language === "ar" ? `أساسيات ${label}` : `${label} Fundamentals`;
    const skillDescription = language === "ar" ? `مفاهيم أساسية في ${label}` : `Basic concepts in ${label}`;
    const { data: skill } = await supabaseService
      .from("skills")
      .insert({ course_id: courseId, name: skillName, description: skillDescription, order_index: 0 })
      .select().single();
    skillId = skill?.id;
  }

  const { count } = await supabaseService
    .from("questions").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("language", language);

  if ((count ?? 0) < 50 && skillId) {
    await generateAIQuestions(supabaseService, courseId, skillId, subCategory, language);
  }
}

async function generateAIQuestions(supabaseService: any, courseId: string, skillId: string, subCategory: string, language: "ar" | "en") {
  for (const difficulty of ["easy", "medium", "hard"]) {
    await generateAIQuestionsForDifficulty(supabaseService, courseId, skillId, subCategory, language, difficulty, 25);
  }
}

interface AnswerOptionCandidate {
  content: string;
  is_correct: boolean;
}

interface GeneratedQuestionCandidate {
  content: string;
  explanation?: string;
  options: AnswerOptionCandidate[];
}

interface SemanticValidationCandidate {
  content: string;
  explanation?: string;
  options: AnswerOptionCandidate[];
  difficulty?: string;
}

// English-language criteria used only by the independent review prompt
// below (which is itself always in English regardless of question
// language). Deliberately the same substantive bar as the bilingual
// difficultyMap inside buildQuestionPrompt() - kept as separate strings
// rather than a shared constant because one is embedded in a
// language-switched generation prompt and the other in a fixed-English
// review prompt, but both encode the same three tiers.
function difficultyCriteriaEnglish(difficulty: string): string {
  switch (difficulty) {
    case "easy":
      return "a single direct step only (recalling one fact, or applying one simple rule/calculation)";
    case "medium":
      return "combining 2-3 steps, or connecting two related concepts";
    case "hard":
      return "multiple combined steps, integrating several concepts, or deeper analysis - NOT a single simple one-step calculation or plain fact recall";
    default:
      return "an unspecified difficulty tier";
  }
}

interface SemanticValidationResult {
  index?: unknown;
  valid?: unknown;
}

// Batch semantic self-check: independently reviews each already
// structurally-valid candidate rather than trusting the generation call's
// own is_correct flags at face value. One extra API call per batch (not
// per-question), to keep latency/cost bounded - matches this codebase's
// existing batch-review pattern (see review-questions/index.ts).
// Fails CLOSED: any error/malformed response rejects the whole batch
// rather than assuming unverified content is fine.
async function semanticallyValidateQuestions(
  apiKey: string,
  candidates: SemanticValidationCandidate[]
): Promise<boolean[]> {
  if (candidates.length === 0) return [];

  const questionsText = candidates
    .map((q, i) => {
      const optionsText = q.options
        .map((o, j) => `  ${j}. ${o.content}${o.is_correct ? "  [marked correct]" : ""}`)
        .join("\n");
      const explanationText = q.explanation ? `\nExplanation: ${q.explanation}` : "";
      const difficultyText = q.difficulty
        ? `\nAssigned difficulty: "${q.difficulty}" (should require ${difficultyCriteriaEnglish(q.difficulty)})`
        : "";
      return `[${i}] ${q.content}\n${optionsText}${explanationText}${difficultyText}`;
    })
    .join("\n\n");

  const prompt = `Review each of the following multiple-choice questions. For each one, answer honestly:\n- Is the question objectively answerable with exactly one correct option?\n- Is the option marked "[marked correct]" actually the correct answer?\n- Are all other options genuinely incorrect?\n- Is the question free of ambiguity, malformed wording, contradictions, or multiple plausible answers?\n- If the question involves a calculation, formula, or scientific/technical constant: is the marked-correct answer derivable using ONLY the formulas and numeric values explicitly stated in the question itself, with no outside constant (e.g. a specific heat value, or any other reference figure) required? If the question restricts the student to a specific stated formula/method, does the marked-correct answer actually match applying only that stated formula/method (not a different, additional calculation)?\n- If an explanation is provided: does it logically support the option marked correct (no contradiction)? Does it end with an explicit statement of the final answer (not just steps that imply it)? Does it stay strictly within the 4 given options, without introducing any term/fact/option not among them?\n- If an assigned difficulty is given, does the question's actual cognitive difficulty genuinely match that tier's stated requirement (not easier, not harder)?\n\nA question is valid only if the answer to ALL of the above is yes. Return JSON only: {"results": [{"index": 0, "valid": true}, ...]} with exactly one entry per question index below.\n\n${questionsText}`;

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a strict quality reviewer for multiple-choice test questions. Reply with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    if (!aiResponse.ok) {
      console.warn(`semanticallyValidateQuestions: OpenAI request failed with status ${aiResponse.status} - failing closed (rejecting all ${candidates.length} candidates in this batch)`);
      return candidates.map(() => false);
    }

    const aiData = await aiResponse.json();
    const raw = aiData?.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const results: SemanticValidationResult[] = Array.isArray(parsed?.results) ? parsed.results : [];

    return candidates.map((_, i) => results.find((r) => r?.index === i)?.valid === true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`semanticallyValidateQuestions: exception during semantic validation - failing closed - ${message}`);
    return candidates.map(() => false);
  }
}

// One generation+validation+insert pass for up to `count` questions.
// Extracted so generateAIQuestionsForDifficulty can call it a second,
// strictly bounded time for a shortfall top-up without any looping.
async function generateAndInsertBatch(
  supabaseService: SupabaseServiceClient,
  apiKey: string,
  courseId: string,
  skillId: string,
  subCategory: string,
  language: "ar" | "en",
  difficulty: string,
  count: number
): Promise<number> {
  if (count <= 0) return 0;

  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            language === "ar"
              ? "You are an expert question generator for Saudi standardized tests. Generate questions in Arabic. Always respond with valid JSON only."
              : "You are an expert question generator for Saudi standardized tests. Generate questions in English. Always respond with valid JSON only.",
        },
        { role: "user", content: buildQuestionPrompt(subCategory, count, difficulty, language) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!aiResponse.ok) return 0;
  const aiData = await aiResponse.json();

  let generatedContent: { questions?: GeneratedQuestionCandidate[] };
  try {
    generatedContent = JSON.parse(aiData.choices[0].message.content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`generateAndInsertBatch: failed to parse AI response as JSON (course ${courseId}, skill ${skillId}, language ${language}, difficulty ${difficulty}) - ${message}`);
    return 0;
  }

  const rawQuestions: GeneratedQuestionCandidate[] = generatedContent.questions || [];

  // Structural validation first (cheap, no extra API call) - only
  // structurally-sound candidates are worth spending a semantic-review
  // call on. Covers: non-empty/uncorrupted question shell with a valid
  // difficulty, and a valid 4-option set (non-empty, uncorrupted, exactly
  // one correct, no duplicate text/ids).
  const structurallyValid = rawQuestions.filter((q) => {
    if (!hasValidQuestionShell(q.content, difficulty)) {
      console.warn(`generateAndInsertBatch: skipping generated question with invalid/corrupted content or difficulty (course ${courseId}, skill ${skillId}, language ${language}, difficulty ${difficulty})`);
      return false;
    }
    const ok = hasValidOptions(q.options);
    if (!ok) {
      console.warn(`generateAndInsertBatch: skipping generated question with invalid options (course ${courseId}, skill ${skillId}, language ${language}, difficulty ${difficulty})`);
    }
    return ok;
  });

  if (structurallyValid.length === 0) return 0;

  // Deterministic math validation - for questions that reduce to a plain
  // arithmetic expression or single-variable linear equation, check the
  // marked-correct answer exactly rather than trusting it. Only rejects
  // when the pattern IS recognized and the computed value disagrees; a
  // null verdict (pattern not recognized) is not held against the
  // candidate - it falls through to semantic review like everything else.
  const deterministicallyValid = structurallyValid.filter((q) => {
    const correctOption = q.options.find((o) => o.is_correct === true);
    if (!correctOption) return true; // already filtered by hasValidOptions if missing
    const verdict = deterministicMathCheck(q.content, correctOption.content);
    if (verdict === false) {
      console.warn(`generateAndInsertBatch: rejecting generated question - deterministic math check disagrees with marked-correct answer (course ${courseId}, skill ${skillId}, difficulty ${difficulty})`);
      return false;
    }
    return true;
  });

  if (deterministicallyValid.length === 0) return 0;

  // Semantic validation: the system does not trust the generation call's
  // own is_correct flags at face value - a separate, independent review
  // pass judges each candidate before anything is persisted.
  const verdicts = await semanticallyValidateQuestions(
    apiKey,
    deterministicallyValid.map((q) => ({ content: q.content, explanation: q.explanation, options: q.options, difficulty }))
  );

  let insertedCount = 0;

  for (let i = 0; i < deterministicallyValid.length; i++) {
    if (!verdicts[i]) {
      console.warn(`generateAndInsertBatch: skipping generated question that failed semantic validation (course ${courseId}, skill ${skillId}, language ${language}, difficulty ${difficulty})`);
      continue;
    }

    const q = deterministicallyValid[i];

    if (await isDuplicateOfExistingQuestion(supabaseService, courseId, q.content)) {
      console.warn(`generateAndInsertBatch: skipping generated question that exactly duplicates an existing question in this course (course ${courseId}, skill ${skillId}, difficulty ${difficulty})`);
      continue;
    }

    const { data: insertedQuestionRow } = await supabaseService
      .from("questions")
      .insert({ skill_id: skillId, course_id: courseId, content: q.content, explanation: q.explanation, difficulty, is_ai_generated: true, language })
      .select().single();

    if (!insertedQuestionRow) continue;

    // The un-parameterized Supabase client (no Database schema generic is
    // configured anywhere in this file) returns `unknown` for row data, so
    // this narrows it to the one field actually used below - the real id
    // of the row this same call just inserted.
    const question = insertedQuestionRow as { id: string };

    const { data: insertedOptions, error: optionsError } = await supabaseService
      .from("answer_options")
      .insert(
        q.options.map((opt, idx) => ({
          question_id: question.id, content: opt.content, is_correct: opt.is_correct, order_index: idx,
        }))
      )
      .select();

    if (optionsError || !insertedOptions || insertedOptions.length !== q.options.length) {
      console.error(`generateAndInsertBatch: answer_options insert failed/incomplete for question ${question.id} - removing orphan question instead of leaving it without valid options`, optionsError);
      await supabaseService.from("questions").delete().eq("id", question.id);
      continue;
    }

    insertedCount++;
  }

  return insertedCount;
}

// Generates and persists up to `count` valid questions for exactly one
// difficulty. Used both by generateAIQuestions (bulk, session-start
// seeding across all three difficulties) and by handleNextQuestion
// (targeted, on-demand top-up when a specific difficulty's pool is
// exhausted mid-session). Returns the number of questions successfully
// inserted with valid options, so callers can tell generation-failure
// apart from generation-success without a second DB round-trip.
async function generateAIQuestionsForDifficulty(
  supabaseService: any,
  courseId: string,
  skillId: string,
  subCategory: string,
  language: "ar" | "en",
  difficulty: string,
  count: number
): Promise<number> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return 0;

  let insertedCount = await generateAndInsertBatch(supabaseService, apiKey, courseId, skillId, subCategory, language, difficulty, count);

  // Bounded top-up: if structural or semantic validation rejected enough
  // candidates that the batch came up short, make exactly ONE more
  // generation attempt for the shortfall - never retries beyond this one
  // extra pass regardless of outcome, so this always terminates.
  if (insertedCount < count) {
    const shortfall = count - insertedCount;
    insertedCount += await generateAndInsertBatch(supabaseService, apiKey, courseId, skillId, subCategory, language, difficulty, shortfall);
  }

  return insertedCount;
}

function buildQuestionPrompt(subCategory: string, count: number, difficulty: string, language: string): string {
  const categoryMap: Record<string, string> = {
    verbal: language === "ar" ? "اختبار القدرات العامة - الجزء اللفظي" : "Qudurat - Verbal",
    quantitative: language === "ar" ? "اختبار القدرات العامة - الجزء الكمي" : "Qudurat - Quantitative",
    mathematics: language === "ar" ? "الرياضيات - الثانوية العامة" : "Tahseeli - Mathematics",
    physics: language === "ar" ? "الفيزياء - الثانوية العامة" : "Tahseeli - Physics",
    chemistry: language === "ar" ? "الكيمياء - الثانوية العامة" : "Tahseeli - Chemistry",
    biology: language === "ar" ? "الأحياء - الثانوية العامة" : "Tahseeli - Biology",
    ccna: language === "ar" ? "CCNA - شهادة تقنية" : "CCNA - Technical Certification",
    security: "CompTIA Security+",
    aws: "AWS Cloud Practitioner",
    pmp: language === "ar" ? "PMP - إدارة المشاريع" : "PMP - Project Management",
  };

  // Concrete, checkable criteria per tier - vague labels like "basic" vs
  // "advanced" left the model free to generate a trivial single-step
  // question and call it "hard" (confirmed in practice: a plain two-step
  // linear equation was generated and labeled "hard"). These criteria are
  // also what the independent semantic-review pass in
  // semanticallyValidateQuestions() checks the output against, so a
  // mismatch is rejected rather than just discouraged here.
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

  const explanationRules = language === "ar"
    ? 'كل شرح يجب أن: (1) يوضح خطوات الاستدلال أو الحساب بإيجاز، (2) ينتهي بجملة صريحة تذكر الإجابة النهائية بوضوح (مثال: "إذاً س = 4")، (3) يبقى ضمن نطاق الخيارات الأربعة المعطاة فقط - لا تذكر أي مصطلح أو حقيقة أو خيار غير موجود ضمن الأربعة خيارات.'
    : 'Every explanation must: (1) briefly show the reasoning/calculation steps, (2) end with an explicit sentence stating the final answer clearly (e.g. "so x = 4"), (3) stay strictly within the scope of the 4 given options - never mention a term, fact, or option that is not one of the 4 options.';

  // Found in practice: a "hard" physics question instructed the student to
  // use exactly one given formula, but its own marked-correct answer only
  // came out right if an additional formula AND an additional numeric
  // constant (neither stated in the question) were also used. This rule
  // closes that gap - any numeric/technical question must be solvable from
  // ONLY what it explicitly states.
  const selfContainmentRule = language === "ar"
    ? 'إذا كان السؤال يتطلب حسابات أو معادلات أو ثوابت علمية، يجب أن يذكر السؤال نفسه كل قانون وكل ثابت رقمي لازم للوصول إلى الإجابة الصحيحة - لا تفترض أن الطالب أو النموذج يعرف ثابتاً غير مذكور (مثل الحرارة النوعية، أو أي قيمة مرجعية أخرى). يجب أن تكون الإجابة الصحيحة قابلة للاشتقاق فقط من المعطيات المذكورة صراحة في نص السؤال.'
    : 'If a question requires a calculation, formula, or scientific constant, the question itself must state every formula and numeric constant needed to reach the correct answer - never assume the student or model already knows an unstated constant (e.g. a specific heat value, or any other reference figure). The marked-correct answer must be derivable ONLY from what is explicitly given in the question text.';

  if (language === "ar") {
    return `Generate ${count} unique multiple-choice questions in Arabic for:\nSubject: ${categoryMap[subCategory] || subCategory}\nDifficulty: ${difficultyMap[difficulty]}\n\n${explanationRules}\n\n${selfContainmentRule}\n\nReturn JSON:\n{\n  "questions": [\n    {\n      "content": "نص السؤال",\n      "explanation": "شرح مفصل ينتهي بذكر الإجابة النهائية صراحة",\n      "options": [\n        { "content": "خيار أ", "is_correct": false },\n        { "content": "خيار ب", "is_correct": false },\n        { "content": "خيار ج", "is_correct": false },\n        { "content": "خيار د", "is_correct": false }\n      ]\n    }\n  ]\n}\nThe example above shows the JSON shape ONLY - it is not a hint about which position is correct. For each question, independently decide which option is actually correct based on its own content, and set is_correct: true on exactly that one option. The position of the correct option must vary randomly and evenly across all 4 slots across the ${count} questions - do NOT systematically place it in the same position (e.g. do not always make the 2nd option correct).\nRequirements: ${count} unique questions, exactly 4 options each, exactly 1 correct, all Arabic. Double-check that each question's actual cognitive difficulty genuinely matches the "${difficulty}" criteria above before including it.`;
  }

  return `Generate ${count} unique multiple-choice questions in English for:\nSubject: ${categoryMap[subCategory] || subCategory}\nDifficulty: ${difficultyMap[difficulty]}\n\n${explanationRules}\n\n${selfContainmentRule}\n\nReturn JSON:\n{\n  "questions": [\n    {\n      "content": "question text",\n      "explanation": "detailed explanation ending with an explicit statement of the final answer",\n      "options": [\n        { "content": "option A", "is_correct": false },\n        { "content": "option B", "is_correct": false },\n        { "content": "option C", "is_correct": false },\n        { "content": "option D", "is_correct": false }\n      ]\n    }\n  ]\n}\nThe example above shows the JSON shape ONLY - it is not a hint about which position is correct. For each question, independently decide which option is actually correct based on its own content, and set is_correct: true on exactly that one option. The position of the correct option must vary randomly and evenly across all 4 slots across the ${count} questions - do NOT systematically place it in the same position (e.g. do not always make the 2nd option correct).\nRequirements: ${count} unique questions, exactly 4 options each, exactly 1 correct, all English. Double-check that each question's actual cognitive difficulty genuinely matches the "${difficulty}" criteria above before including it.`;
}

// Shared answer-option shape check, used both before persisting newly
// generated questions and before a persisted question is eligible for
// selection. Works on either the AI-generated {content, is_correct} shape
// or the fetched {id, content, is_correct, order_index} shape - only the
// two common fields are checked.
interface OptionLike {
  content?: unknown;
  is_correct?: unknown;
  id?: unknown;
}

// Unicode replacement character (U+FFFD) is what a corrupted/mis-decoded
// string turns into - it never appears in legitimately generated text, so
// its presence is an unambiguous signal of a garbled/corrupted string (the
// exact defect class found in the 725-question audit's "27cd2e6a" row).
function hasCorruptedText(text: string): boolean {
  return text.includes("�");
}

function hasValidOptions(options: unknown): boolean {
  if (!Array.isArray(options) || options.length !== 4) return false;
  const opts = options as OptionLike[];
  if (!opts.every((o) => typeof o?.content === "string" && o.content.trim().length > 0)) return false;
  if (opts.some((o) => hasCorruptedText(String(o.content)))) return false;
  const correctCount = opts.filter((o) => o?.is_correct === true).length;
  if (correctCount !== 1) return false;
  // Reject duplicate option text/ids within the same question - a question
  // whose "wrong" answers are actually copies of each other (or of the
  // correct one) doesn't have 4 genuinely distinct choices.
  const normalizedContents = opts.map((o) => String(o.content).trim().toLowerCase());
  if (new Set(normalizedContents).size !== normalizedContents.length) return false;
  const ids = opts.map((o) => o.id).filter((id): id is string => typeof id === "string");
  if (ids.length > 0 && new Set(ids).size !== ids.length) return false;
  return true;
}

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

// Cheap, non-semantic checks that don't need an API call - question content
// itself (not just its options) is non-empty, uncorrupted, and has a
// recognized difficulty. Runs before any generated candidate is worth
// spending a semantic-review call on.
function hasValidQuestionShell(content: unknown, difficulty: unknown): boolean {
  if (typeof content !== "string" || content.trim().length === 0) return false;
  if (hasCorruptedText(content)) return false;
  if (typeof difficulty !== "string" || !VALID_DIFFICULTIES.has(difficulty)) return false;
  return true;
}

// --- Deterministic math validation -----------------------------------
// For questions whose content reduces to a plain arithmetic expression or a
// single-variable linear equation, the "correct" answer can be checked
// exactly rather than trusted - this is the safety net for the exact bug
// class found repeatedly in the 725-question audit (e.g. "50 - 23" marked
// as 29 instead of 27). Returns true/false when the pattern is recognized
// and checkable, or null when the content doesn't match a recognized
// deterministic pattern (in which case the caller falls back to semantic
// review instead of rejecting).
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

// Returns null when the question doesn't match a recognized deterministic
// pattern (arithmetic expression, or single-variable linear equation with
// the variable on one or both sides). Returns true/false only when the
// pattern IS recognized and therefore checkable against the option marked
// correct.
function deterministicMathCheck(questionContent: string, correctOptionContent: string): boolean | null {
  const expectedValue = extractNumericValue(correctOptionContent);
  if (expectedValue === null) return null;

  // Equation pattern: contains "=" and a recognized variable symbol.
  if (questionContent.includes("=") && VARIABLE_SYMBOLS.some((v) => questionContent.includes(v))) {
    const eqMatch = /([0-9xXس+\-*/×÷().\s]+)=([0-9xXس+\-*/×÷().\s]+)/.exec(questionContent);
    if (!eqMatch) return null;
    const lhs = parseLinearTerms(eqMatch[1].replace(/×/g, "*").replace(/÷/g, "/"), VARIABLE_SYMBOLS);
    const rhs = parseLinearTerms(eqMatch[2].replace(/×/g, "*").replace(/÷/g, "/"), VARIABLE_SYMBOLS);
    if (!lhs || !rhs) return null;
    const coefDiff = lhs.coef - rhs.coef;
    if (coefDiff === 0) return null; // no unique solution - not our call to make
    const solution = (rhs.constant - lhs.constant) / coefDiff;
    return Math.abs(solution - expectedValue) < 0.01;
  }

  // Plain arithmetic pattern: longest run of digits/operators/parens with
  // no variable letters, at least one operator, at least 3 chars.
  const arithMatches = questionContent.match(/[0-9+\-*/×÷().\s]{3,}/g);
  if (!arithMatches) return null;
  const candidate = arithMatches.sort((a, b) => b.length - a.length)[0];
  if (!candidate || !/[+\-*/×÷]/.test(candidate)) return null;

  const computed = evaluateArithmeticExpression(candidate);
  if (computed === null) return null;
  return Math.abs(computed - expectedValue) < 0.01;
}

// Exact-duplicate guard: rejects a candidate whose normalized text already
// exists as a question in the same course. Deliberately exact-match only
// (not fuzzy/embedding-based near-duplicate detection, which this codebase
// doesn't have infrastructure for yet) - catches verbatim regeneration
// without false-positiving on the large number of legitimately similar
// questions already in the pool (e.g. many distinct "solve for x" items).
async function isDuplicateOfExistingQuestion(
  supabaseService: SupabaseServiceClient,
  courseId: string,
  content: string
): Promise<boolean> {
  const normalized = content.trim().replace(/\s+/g, " ").toLowerCase();
  const { data } = await supabaseService
    .from("questions")
    .select("id, content")
    .eq("course_id", courseId);
  if (!Array.isArray(data)) return false;
  return (data as { content?: unknown }[]).some(
    (row) => typeof row.content === "string" && row.content.trim().replace(/\s+/g, " ").toLowerCase() === normalized
  );
}

// Serving-time gate: a question is only eligible for selection if it has
// real content, a valid skill_id, and a valid answer-option set. Protects
// against already-broken rows in the database, not just future inserts.
function isServableQuestion(q: any): boolean {
  if (!q || typeof q.content !== "string" || q.content.trim().length === 0) return false;
  if (!q.skill_id) return false;
  return hasValidOptions(q.answer_options);
}

function needsTranslation(content: string, targetLang: string) {
  const hasArabic = /[\u0600-\u06FF]/.test(content);
  const hasEnglish = /[A-Za-z]/.test(content);
  if (targetLang === "ar") return !hasArabic && hasEnglish;
  return !hasEnglish && hasArabic;
}

interface PersistedAnswerOption {
  id: string;
  content: string;
  is_correct: boolean;
  order_index: number;
}

async function translateQuestion(question: any, targetLang: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn(`translateQuestion: OPENAI_API_KEY not configured - question ${question?.id} returned untranslated`);
    return question;
  }

  const languageName = targetLang === "ar" ? "Arabic" : "English";
  const sourceLanguage = targetLang === "ar" ? "English" : "Arabic";
  // Identity (id) and correctness (is_correct) are never sourced from the
  // translation response - translation is a pure content transform, not a
  // re-evaluation of which option is correct. The AI is never even shown
  // real option ids (it has no way to know them), and its output is
  // matched back to these original options strictly by array position.
  const sortedOptions: PersistedAnswerOption[] = ((question.answer_options || []) as PersistedAnswerOption[])
    .slice()
    .sort((a, b) => a.order_index - b.order_index);
  const optionsText = sortedOptions
    .map((opt: any) => `- ${opt.content} (${opt.is_correct ? "correct" : "wrong"})`)
    .join("\n");

  const prompt = `Translate the following multiple-choice question from ${sourceLanguage} to ${languageName}. Keep the meaning and answer correctness exactly the same - do not re-evaluate which option is correct, only translate the wording. Return JSON only with this shape:\n{\n  "content": "...",\n  "explanation": "...",\n  "options": ["translated option 1", "translated option 2", ...]\n}\nThe "options" array must have exactly ${sortedOptions.length} items, in the SAME ORDER as the original options listed below - do not reorder, add, or remove any.\n\nQuestion:\n${question.content}\n\nExplanation:\n${question.explanation || ""}\n\nOptions (in order):\n${optionsText}`;

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a translator for quiz questions. Reply with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      console.warn(`translateQuestion: OpenAI request failed with status ${aiResponse.status} for question ${question?.id} - returned untranslated`);
      return question;
    }

    const aiData = await aiResponse.json();
    const translated = aiData?.choices?.[0]?.message?.content;
    if (!translated) {
      console.warn(`translateQuestion: empty/missing translated content for question ${question?.id} - returned untranslated`);
      return question;
    }

    let parsedResult: any = translated;
    if (typeof translated === "string") {
      try {
        parsedResult = JSON.parse(translated);
      } catch {
        console.warn(`translateQuestion: failed to parse AI response as JSON for question ${question?.id} - returned untranslated`);
        return question;
      }
    }

    if (
      !parsedResult?.content ||
      !Array.isArray(parsedResult.options) ||
      parsedResult.options.length !== sortedOptions.length
    ) {
      console.warn(`translateQuestion: AI response had unexpected/malformed structure for question ${question?.id} - returned untranslated`);
      return question;
    }

    // id, is_correct, and order_index always come from the original,
    // already-validated database row - only the option text itself is
    // taken from the translation, matched strictly by array position.
    const translatedOptions = sortedOptions.map((originalOpt, idx: number) => {
      const translated = parsedResult.options[idx];
      const translatedContent = typeof translated === "string" ? translated : translated?.content;
      return {
        id: originalOpt.id,
        content: translatedContent || originalOpt.content,
        is_correct: originalOpt.is_correct,
        order_index: originalOpt.order_index,
      };
    });

    // Translation is a comparatively rare, latency-sensitive runtime path,
    // but a mistranslation can silently break correctness (e.g. flipping
    // "increases" to "decreases") without breaking any structural check
    // above. One extra semantic-review call catches this before serving a
    // corrupted translation - on any failure, fall back to the original,
    // untranslated (already-validated) content rather than risk it.
    const [translationValid] = await semanticallyValidateQuestions(apiKey, [
      { content: parsedResult.content, options: translatedOptions },
    ]);
    if (!translationValid) {
      console.warn(`translateQuestion: translated question ${question?.id} failed semantic re-validation - returned untranslated`);
      return question;
    }

    return {
      ...question,
      content: parsedResult.content,
      explanation: parsedResult.explanation || question.explanation,
      answer_options: translatedOptions,
    };
  } catch (error: any) {
    console.error(`translateQuestion: network/exception error for question ${question?.id} - ${error?.message || String(error)} - returned untranslated`);
    return question;
  }
}
