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

// ===== Session-local difficulty ladder =====
// Historical BKT mastery (masteryToDifficulty above) is the seed for a
// session's FIRST question only - captured once in handleStartSession and
// frozen in learning_sessions.starting_difficulty. Everything after that
// is driven purely by this session's own answers, replayed here, so a
// student's persistent cross-session mastery can never keep serving Hard
// through a session where they are currently doing poorly, while a
// genuinely strong student still opens on Hard as their history warrants.
const DIFFICULTY_STEPS = ["easy", "medium", "hard"] as const;

function stepDifficulty(tier: string, delta: number): string {
  const idx = DIFFICULTY_STEPS.indexOf(tier as (typeof DIFFICULTY_STEPS)[number]);
  const safeIdx = idx === -1 ? 1 : idx; // unknown tier defaults to medium, never throws
  const newIdx = Math.max(0, Math.min(DIFFICULTY_STEPS.length - 1, safeIdx + delta));
  return DIFFICULTY_STEPS[newIdx];
}

function computeSessionDifficulty(
  seedTier: string,
  sessionAnswersInOrder: { is_correct: boolean }[]
): string {
  let difficulty = seedTier;
  let correctStreak = 0;
  for (const answer of sessionAnswersInOrder) {
    if (answer.is_correct) {
      correctStreak++;
      if (correctStreak >= 2) {
        difficulty = stepDifficulty(difficulty, +1);
        correctStreak = 0; // climbing again requires a fresh pair at the new level
      }
    } else {
      correctStreak = 0;
      difficulty = stepDifficulty(difficulty, -1);
    }
  }
  return difficulty;
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
  const normalizedDifficultyMode = normalizeDifficultyMode(difficulty_mode);

  const skillId = await ensureCourseExists(supabaseService, course_id, sessionLanguage);

  // Seed for the session-local difficulty ladder (see computeSessionDifficulty
  // above) - captured once, here, before this session has any answers, so it
  // reflects genuine cross-session BKT mastery rather than a value that could
  // later drift mid-session from this same session's own answers. Only
  // meaningful in auto mode; manual-mode sessions never read this column.
  let startingDifficulty: string | null = null;
  if (normalizedDifficultyMode === "auto" && skillId) {
    const { data: skillLevel } = await supabaseService
      .from("user_skill_levels")
      .select("mastery_level")
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .maybeSingle();
    startingDifficulty = masteryToDifficulty(skillLevel?.mastery_level ?? BKT.P_L0);
  }

  const { data: session, error } = await supabaseService
    .from("learning_sessions")
    .insert({
      user_id: userId,
      course_id,
      status: "active",
      total_questions: total_questions ?? 25,
      difficulty_mode: normalizedDifficultyMode, // ✅ الصح
      language: sessionLanguage,
      starting_difficulty: startingDifficulty,
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
    .select("id, course_id, total_questions, difficulty_mode, language, starting_difficulty") // ✅ الصح
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

  const subCategoryForSession = COURSE_DATA[session.course_id]?.sub_category;

  const { data: answeredQuestions } = await supabaseService
    .from("user_answers")
    .select("question_id, is_correct, answered_at")
    .eq("session_id", sessionId)
    .order("answered_at", { ascending: true });

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

  // Captured from the true (unfiltered) pool, before the topic guard below
  // can empty it - skill_id is a structural property attached correctly
  // even to a topically-wrong row, so this stays reliable regardless of how
  // much the topic filter removes.
  const skillIdFallback = remaining[0]?.skill_id;

  // Runtime defense-in-depth against exactly the contamination class found
  // in the live database: a quantitative/trivia row persisted under the
  // Verbal skill (or vice versa). No-op for every course outside Qudurat's
  // verbal/quantitative split. Filtering here - before language/difficulty
  // selection - means a topically-wrong row can never be picked, and an
  // exhausted post-filter pool naturally triggers the same on-demand
  // generation path already used for plain pool exhaustion below, rather
  // than silently substituting a wrong-topic question.
  remaining = remaining.filter((q: any) => !looksOffTopicForQudurateSection(q.content, subCategoryForSession, q.id));

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
    // Seed is the historical BKT tier frozen at session start (see
    // handleStartSession) - never re-derived from user_skill_levels here,
    // since that value keeps changing from this same session's own answers
    // and would otherwise re-inject exactly the cross-session-mastery
    // volatility this ladder exists to remove. Falls back to the default
    // "no prior data" tier only for sessions created before this column
    // existed (starting_difficulty is null on historical rows).
    const seedTier = session.starting_difficulty ?? masteryToDifficulty(BKT.P_L0);
    const sessionAnswersInOrder = (answeredQuestions || []).map((r: any) => ({ is_correct: r.is_correct }));
    targetDifficulty = computeSessionDifficulty(seedTier, sessionAnswersInOrder);
    console.log(`Session ladder: seed=${seedTier} answers=${sessionAnswersInOrder.length} → ${targetDifficulty}`);
  } else {
    // Manual mode
    targetDifficulty = difficultyMode;
    console.log(`Manual mode: ${targetDifficulty}`);
  }

  // Selected from languageMatched (not languagePool) so that a wrong-language
  // row at the target difficulty can never satisfy "preferred" and thereby
  // skip the generation attempt below - languagePool may silently contain
  // other-language rows (its fallback-to-remaining case), and trusting it
  // here was the exact mechanism that let a session serve the wrong
  // language: generation was never attempted because a same-difficulty,
  // wrong-language row already made "preferred" non-empty.
  let preferred = languageMatched.filter((q: any) => q.difficulty === targetDifficulty);

  if (preferred.length === 0) {
    // total_questions (checked earlier, above) is the only session-
    // completion boundary - pool exhaustion at a specific difficulty must
    // never itself end the session. Attempt to generate more questions for
    // the exact same course/skill/session-language/target-difficulty
    // before deciding the pool is genuinely unable to satisfy the request.
    const skillIdForGeneration = skillIdFallback;
    const subCategoryForGeneration = subCategoryForSession;

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
      // exactly as persisted, rather than trusted from local state. The
      // topic guard is re-applied here too - a plain re-fetch would
      // otherwise silently reintroduce any already-persisted off-topic rows
      // that the first filter pass (above) had excluded.
      remaining = (await fetchServableQuestions())
        .filter((q: any) => !looksOffTopicForQudurateSection(q.content, subCategoryForSession, q.id));
      languageMatched = remaining.filter((q: any) => q.language === sessionLanguage);
      languagePool = languageMatched.length > 0 ? languageMatched : remaining;
      // Same as the initial preferred computation above: language-matched
      // rows only, never the (possibly wrong-language) languagePool.
      preferred = languageMatched.filter((q: any) => q.difficulty === targetDifficulty);
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

  // Auto-mode any-difficulty fallback: still prefer language-matched content
  // (any difficulty) over languagePool, which may contain other-language
  // rows. languagePool is only reached here as an absolute last resort -
  // when generation was just attempted above and still produced nothing in
  // the requested language - and the needsTranslation()/translateQuestion()
  // check below remains the final safeguard against actually serving it.
  const pool = preferred.length > 0 ? preferred : (languageMatched.length > 0 ? languageMatched : languagePool);

  // Defensive only: every path above already guarantees pool is non-empty
  // by this point (the top-of-function remaining.length===0 check, plus
  // generation-then-graceful-end in manual mode). Kept as a hard stop
  // rather than trusting that invariant silently, since indexing an empty
  // array here would otherwise throw on nextQuestion.content below.
  if (pool.length === 0) {
    console.warn(`adaptive-engine: session ${sessionId} - pool unexpectedly empty after topic filtering and generation attempt - ending session`);
    return new Response(JSON.stringify({ question: null, finished: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let nextQuestion = pool[Math.floor(Math.random() * pool.length)];

  if (needsTranslation(nextQuestion.content, sessionLanguage)) {
    nextQuestion = await translateQuestion(nextQuestion, sessionLanguage);

    // translateQuestion() falls back to returning the ORIGINAL, untranslated
    // question on any failure (network/parse/re-validation) - safe for
    // correctness, but that must never mean silently serving the student's
    // non-selected language. Treat a still-mismatched-language result
    // exactly like pool exhaustion: generate fresh content in the correct
    // language rather than ever substituting the wrong one - the same
    // "never substitute, generate instead" principle already applied to
    // category mismatches above.
    if (needsTranslation(nextQuestion.content, sessionLanguage)) {
      console.warn(`adaptive-engine: session ${sessionId} - translation to "${sessionLanguage}" failed; generating fresh "${targetDifficulty}" content in the correct language instead of serving a wrong-language question`);
      let generatedForLanguage = 0;
      if (skillIdFallback && subCategoryForSession) {
        generatedForLanguage = await generateAIQuestionsForDifficulty(
          supabaseService, session.course_id, skillIdFallback, subCategoryForSession,
          sessionLanguage, targetDifficulty, 1
        );
      }
      const freshLanguagePool = generatedForLanguage > 0
        ? (await fetchServableQuestions())
            .filter((q: any) => !looksOffTopicForQudurateSection(q.content, subCategoryForSession, q.id))
            .filter((q: any) => q.language === sessionLanguage && q.difficulty === targetDifficulty)
        : [];
      if (freshLanguagePool.length > 0) {
        nextQuestion = freshLanguagePool[Math.floor(Math.random() * freshLanguagePool.length)];
      } else {
        console.warn(`adaptive-engine: session ${sessionId} - could not produce "${sessionLanguage}" content after translation failure - ending session rather than serving the wrong language`);
        return new Response(JSON.stringify({ question: null, finished: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
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

  // Deliberately does NOT eagerly bulk-seed questions here. This used to
  // call a 3-difficulty x up to-25-question generator synchronously inside
  // start-session whenever a course had under 50 rows in the requested
  // language - up to ~12 sequential OpenAI calls awaited before the HTTP
  // response could return. Every currently active course has under 50
  // English rows (several have zero), so EVERY English start-session was
  // hitting this path, taking 100+ seconds and in practice failing outright
  // with a platform WORKER_RESOURCE_LIMIT error - confirmed by direct
  // reproduction against the deployed function. handleNextQuestion() already
  // has its own on-demand, tightly-bounded top-up (generateAIQuestionsForDifficulty,
  // capped at 2 attempts for the one specific difficulty actually needed) -
  // that path is fast, already proven safe, and is sufficient on its own, so
  // start-session no longer needs to (and must not) block on bulk generation.

  return skillId as string | undefined;
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
  subCategory?: string;
}

// English-only description of what topically belongs in a given Qudurat
// section, used solely by the independent review prompt below to catch
// off-topic content (arithmetic/trivia generated under "verbal", or
// vocabulary questions generated under "quantitative") before insertion.
// Returns "" for any subCategory outside Qudurat's verbal/quantitative
// split, in which case no extra topic-alignment bullet is added - those
// subjects (Chemistry, CCNA, etc.) are already unambiguous from their
// single subject label.
function qudurateSectionCriteriaEnglish(subCategory: string | undefined): string {
  if (subCategory === "verbal") {
    return "a VERBAL reasoning question only - synonyms, antonyms, sentence completion, verbal analogies, odd-one-out, contextual word meaning, reading comprehension, or inference from a passage. It must NOT be arithmetic, a calculation, a percentage, an algebraic equation, a geometry problem, or any other quantitative/mathematical reasoning, and must NOT be general-knowledge trivia unrelated to language (e.g. capital cities, planets, animals, chemical symbols).";
  }
  if (subCategory === "quantitative") {
    return "a QUANTITATIVE reasoning question only - arithmetic, ratios/proportions, percentages, algebra, geometry, numerical word problems, or number series. It must NOT be based on vocabulary, synonyms, antonyms, reading comprehension, or any other purely verbal-reasoning format, and must NOT be general-knowledge trivia unrelated to quantitative reasoning.";
  }
  return "";
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
  reason?: unknown;
}

// The reason string is diagnostic metadata ONLY - logged for observability,
// never inspected or branched on anywhere. `valid` remains the sole
// accept/reject decision input, parsed exactly as before this field existed.
interface SemanticVerdict {
  valid: boolean;
  reason: string | null;
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
): Promise<SemanticVerdict[]> {
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
      const categorySpec = qudurateSectionCriteriaEnglish(q.subCategory);
      const categoryText = categorySpec ? `\nRequired category: this question MUST be ${categorySpec}` : "";
      return `[${i}] ${q.content}\n${optionsText}${explanationText}${difficultyText}${categoryText}`;
    })
    .join("\n\n");

  const prompt = `Review each of the following multiple-choice questions. For each one, answer honestly:\n- Is the question objectively answerable with exactly one correct option?\n- Is the option marked "[marked correct]" actually the correct answer?\n- Are all other options genuinely incorrect?\n- Is the question free of ambiguity, malformed wording, contradictions, or multiple plausible answers?\n- If the question involves a calculation, formula, or scientific/technical constant: is the marked-correct answer derivable using ONLY the formulas and numeric values explicitly stated in the question itself, with no outside constant (e.g. a specific heat value, or any other reference figure) required? If the question restricts the student to a specific stated formula/method, does the marked-correct answer actually match applying only that stated formula/method (not a different, additional calculation)?\n- If an explanation is provided: does it logically support the option marked correct (no contradiction)? Does it end with an explicit statement of the final answer (not just steps that imply it)? Does it stay strictly within the 4 given options, without introducing any term/fact/option not among them?\n- If an assigned difficulty is given, does the question's actual cognitive difficulty genuinely match that tier's stated requirement (not easier, not harder)?\n- If a "Required category" is given, does the question's actual content and primary reasoning mechanism genuinely match that required category? A question that is topically or mechanically wrong for its required category (e.g. an arithmetic/trivia question under a verbal-reasoning requirement, or a vocabulary question under a quantitative requirement) is INVALID regardless of whether it is otherwise well-formed and correctly answerable.\n- Does the question stem itself avoid stating or directly hinting at the correct answer? A question is INVALID if a student could answer it correctly just from reading the stem, without needing to actually consider the 4 options. This includes the direct-statement shape (e.g. "Which command shows X? The command is Y." directly inside the question text) AND the self-referential/tautological shape, where the stem gives a specific value, identity, attribute, or fact as an explicit premise and then asks for that exact same value/attribute back (e.g. "a device's IP is 192.168.1.1 ... what is the device's IP?" with "192.168.1.1" as the marked-correct option) - the marked-correct option there is just the given value copied verbatim, with no reasoning required. Do NOT flag legitimate repetition where the student still has to reason, discriminate among candidates, apply a definition, interpret a passage, or identify an odd-one-out - a shared word or concept between the stem and an option is only a leak when it eliminates the need to reason, not merely when it exists.\n- Does the marked-correct option actually answer the specific type of thing the question asks for? If the question asks to identify a person, object, element, category, term, command, concept, or value, the marked-correct option must actually name or provide that thing. An option that merely repeats a descriptive or property clause from the question's own premise, without actually identifying what was asked for, is INVALID - even if that option is technically true as a general statement (e.g. the question asks "which elements have similar properties and sit in the same periodic-table group?" and the marked-correct option is just "have similar properties," restating the premise instead of naming a group). This does NOT apply to legitimate definition, vocabulary/synonym, matching, odd-one-out, "which of the following", or passage-comprehension questions, where the correct option genuinely names the requested term, synonym, category, or answer.\n- To judge both of the two rules above: (A) True leakage - the stem already gives the exact answer/value being asked for, so picking the correct option requires no reasoning; always INVALID. (B) Legitimate repetition - a word or concept from the stem also appears in an option, but the student still needs reasoning, discrimination, interpretation, or definition-application to pick the correct one; always VALID, never reject this. (C) Non-answering/malformed option - the question asks for one type of thing, but the marked-correct option does not actually identify/answer that thing, and instead just echoes a description or property from the stem; always INVALID. Only reject for (A) or (C); (B) must remain valid.\n- If the assigned difficulty is "hard" and the subject is not inherently quantitative (e.g. verbal reasoning, cybersecurity, project management, networking, cloud computing): does the question's difficulty genuinely come from deeper conceptual analysis or realistic scenario judgment, rather than from an invented, non-standard formula/ratio/financial-calculation fabricated just to manufacture arithmetic steps? A question that dresses a made-up calculation in the subject's vocabulary without testing real domain knowledge is INVALID.\n- If the question states or depends on a specific real-world fact, formula, scientific/technical constant, chemical reaction, physical law, biological process, or named relationship: is that underlying premise actually true in reality - not merely internally consistent with the question's own arithmetic? For example, a chemical equation is INVALID if the stated reactants could not actually produce the stated products (e.g. an element appearing in a product that is absent from every reactant), even if the arithmetic applied on top of that false reaction is done correctly. A question built on a fabricated formula, an invented constant, an impossible process, or a false definition is INVALID, and so is an explanation that confidently reinforces such a false premise instead of using a true one. This does not penalize legitimate educational simplification (e.g. ignoring negligible real-world effects) - only claims that are factually false.\n\nA question is valid only if the answer to ALL of the above is yes. Also give a concise reason (max ~15 words) for each verdict - a specific, factual reason, not vague wording: for a valid question, a brief confirmation of why it's fine; for an invalid one, the primary reason it failed. Return JSON only: {"results": [{"index": 0, "valid": true, "reason": "Correct, relevant, and unambiguous"}, {"index": 1, "valid": false, "reason": "Marked answer is incorrect"}]} with exactly one entry per question index below.\n\n${questionsText}`;

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
      return candidates.map(() => ({ valid: false, reason: "OpenAI request failed (HTTP error) - failed closed" }));
    }

    const aiData = await aiResponse.json();
    const raw = aiData?.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const results: SemanticValidationResult[] = Array.isArray(parsed?.results) ? parsed.results : [];

    // `valid` is parsed exactly as before this field existed - unchanged
    // condition, unchanged fail-closed default. `reason` is extracted
    // independently and defensively: a missing/malformed/oversized reason
    // never affects the `valid` boolean above it.
    return candidates.map((_, i) => {
      const result = results.find((r) => r?.index === i);
      const valid = result?.valid === true;
      const reasonRaw = result?.reason;
      const reason = typeof reasonRaw === "string" && reasonRaw.trim().length > 0 ? reasonRaw.trim().slice(0, 200) : null;
      return { valid, reason };
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`semanticallyValidateQuestions: exception during semantic validation - failing closed - ${message}`);
    return candidates.map(() => ({ valid: false, reason: "Exception during semantic validation - failed closed" }));
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
    if (correctOption) {
      const verdict = deterministicMathCheck(q.content, correctOption.content);
      if (verdict === false) {
        console.warn(`generateAndInsertBatch: rejecting generated question - deterministic math check disagrees with marked-correct answer (course ${courseId}, skill ${skillId}, difficulty ${difficulty})`);
        return false;
      }
    }
    const chemistryVerdict = deterministicChemistryEquationCheck(q.content);
    if (chemistryVerdict === false) {
      console.warn(`generateAndInsertBatch: rejecting generated question - stated chemical equation is not atomically balanced (course ${courseId}, skill ${skillId}, difficulty ${difficulty})`);
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
    deterministicallyValid.map((q) => ({ content: q.content, explanation: q.explanation, options: q.options, difficulty, subCategory }))
  );

  let insertedCount = 0;

  for (let i = 0; i < deterministicallyValid.length; i++) {
    if (!verdicts[i].valid) {
      console.warn(`generateAndInsertBatch: skipping generated question that failed semantic validation (course ${courseId}, skill ${skillId}, language ${language}, difficulty ${difficulty}) - reason: ${verdicts[i].reason ?? "no reason provided"}`);
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

  // Qudurat's "verbal"/"quantitative" split found in practice to be
  // insufficiently specified by the bare subject label above alone - the
  // model filled the gap with generic trivia, arithmetic, and general
  // knowledge (confirmed: general-trivia/quantitative content was found
  // inserted under the Verbal skill in the live database). This gives each
  // section an explicit allowed-format list and an explicit prohibited list,
  // and is also what the topic-alignment check in
  // semanticallyValidateQuestions() verifies the output against.
  const qudurateSectionSpec = subCategory === "verbal"
    ? (language === "ar"
        ? 'هذا القسم يختبر التفكير اللفظي فقط. الأنواع المسموحة حصراً: (1) مرادفات، (2) أضداد، (3) إكمال جملة بكلمة أو عبارة مناسبة، (4) تناظر لفظي/علاقة بين كلمتين (أ:ب كما ج:؟)، (5) تحديد الكلمة الشاذة من بين مجموعة كلمات - يجب أن يُصاغ السؤال بحيث يطلب تحديد الكلمة التي لا تنتمي إلى الفئة المشتركة (وليس التي تنتمي إليها)؛ يجب أن تنتمي ثلاث كلمات بوضوح إلى فئة واحدة مشتركة، وأن تكون الكلمة الرابعة فقط هي الاستثناء الوحيد بلا لبس؛ ويجب أن يتفق نص السؤال والخيارات والإجابة الصحيحة المخزنة والشرح جميعها مع بعضها البعض دون تناقض، (6) معنى كلمة في سياق جملة أو فقرة قصيرة، (7) استيعاب المقروء (فقرة قصيرة مع سؤال حولها)، (8) استنتاج ضمني من نص. ممنوع تماماً: أي حساب أو عملية حسابية أو نسبة مئوية أو معادلة جبرية أو مسألة هندسية أو أي شكل من أشكال التفكير الكمي/الرياضي؛ وممنوع أي سؤال معلومات عامة أو ثقافة عامة أو حقائق غير لغوية (مثل عواصم الدول، الكواكب، الحيوانات، الرموز الكيميائية) لا علاقة لها بالتفكير اللفظي أو اللغوي.'
        : 'This section tests VERBAL reasoning ONLY. Allowed formats, exclusively: (1) synonyms, (2) antonyms, (3) sentence completion with a fitting word/phrase, (4) verbal analogies / word relationships (A:B as C:?), (5) identifying the odd-one-out word in a set - the question must be phrased to ask for the ONE word that does NOT belong to the shared category (never phrased as asking which word belongs, when multiple options would belong); exactly three words must clearly share one common category, and the fourth word must be the sole, unambiguous exception; the question wording, the options, the stored correct answer, and the explanation must all agree with each other with no contradiction, (6) contextual meaning of a word within a sentence or short passage, (7) reading comprehension (a short passage with a question about it), (8) implicit inference from a passage. STRICTLY PROHIBITED: any arithmetic, calculation, percentage, algebraic equation, geometry problem, or any form of quantitative/mathematical reasoning; and any general-knowledge/trivia question unrelated to language or verbal reasoning (e.g. capital cities, planets, animals, chemical symbols).')
    : subCategory === "quantitative"
    ? (language === "ar"
        ? 'هذا القسم يختبر التفكير الكمي فقط. الأنواع المسموحة: العمليات الحسابية، النسب والتناسب، النسبة المئوية، الجبر (معادلات خطية بسيطة)، الهندسة (مساحة/محيط/حجم)، مسائل لفظية عددية، وسلاسل/أنماط عددية. ممنوع تماماً: أي سؤال يعتمد على المفردات أو المرادفات أو الأضداد أو استيعاب المقروء أو أي شكل من أشكال التفكير اللفظي البحت، وممنوع أي سؤال معلومات عامة لا علاقة له بالتفكير الكمي.'
        : 'This section tests QUANTITATIVE reasoning ONLY. Allowed formats: arithmetic operations, ratios and proportions, percentages, algebra (simple linear equations), geometry (area/perimeter/volume), numerical word problems, and number series/patterns. STRICTLY PROHIBITED: any question based on vocabulary, synonyms, antonyms, reading comprehension, or any purely verbal-reasoning format, and any general-knowledge trivia unrelated to quantitative reasoning.')
    : "";
  const qudurateSectionBlock = qudurateSectionSpec ? `\n\n${qudurateSectionSpec}` : "";

  // Certification courses previously got only a bare subject-name label,
  // same underlying gap as Qudurat before its fix. These domain lists are
  // each certification's own publicly-published competency areas (e.g.
  // Cisco/CompTIA/AWS/PMI all publish their exam's domain breakdown
  // publicly) - stated here only as topic scope, never as literal
  // reproduced exam questions.
  const certificationDomains: Record<string, string> = {
    ccna: language === "ar"
      ? "غطِّ مجالات اختبار CCNA الحقيقية: أساسيات الشبكات، الوصول للشبكة (VLAN/switching)، الاتصال بروتوكول IP (التوجيه)، خدمات IP (DHCP/NAT/NTP)، أساسيات الأمن، والأتمتة والبرمجة."
      : "Cover CCNA's real exam domains: Network Fundamentals, Network Access (VLANs/switching), IP Connectivity (routing), IP Services (DHCP/NAT/NTP), Security Fundamentals, and Automation/Programmability.",
    security: language === "ar"
      ? "غطِّ مجالات اختبار Security+ الحقيقية: المفاهيم العامة للأمن، التهديدات والثغرات والتخفيف منها، بنية وتصميم الأمن، إدارة العمليات الأمنية، وإدارة البرامج والمخاطر الأمنية."
      : "Cover Security+'s real exam domains: General Security Concepts, Threats/Vulnerabilities/Mitigations, Security Architecture, Security Operations, and Security Program Management/Risk.",
    aws: language === "ar"
      ? "غطِّ مجالات اختبار AWS Cloud Practitioner الحقيقية: مفهوم السحابة، الأمن والامتثال، التقنية (الخدمات الأساسية مثل EC2/S3/IAM)، والإدارة المالية للتكلفة."
      : "Cover AWS Cloud Practitioner's real exam domains: Cloud Concepts, Security and Compliance, Cloud Technology (core services like EC2/S3/IAM), and Billing/Pricing/Cost Management.",
    pmp: language === "ar"
      ? "غطِّ مجالات اختبار PMP الحقيقية بحسب PMBOK: الأشخاص (قيادة الفريق)، العملية (تخطيط وتنفيذ ومراقبة المشروع)، وبيئة الأعمال (ربط المشروع باستراتيجية المؤسسة)."
      : "Cover PMP's real exam domains per PMBOK: People (leading the team), Process (planning/executing/monitoring the project), and Business Environment (linking the project to organizational strategy).",
  };
  const certificationDomainBlock = certificationDomains[subCategory] ? `\n\n${certificationDomains[subCategory]}` : "";

  // Found in practice: several generated CCNA questions stated the correct
  // answer directly in the question stem itself (e.g. "Which command shows
  // the routing table? The command is 'show ip route'.") - technically
  // still structurally valid and correctly-scored, but defeats the purpose
  // of a multiple-choice question and doesn't resemble a real exam item.
  // Later found a second, subtler shape of the same defect: a
  // self-referential/tautological stem that states a specific value as a
  // given premise and then asks for that exact same value back (e.g. "a
  // device's IP is 192.168.1.1 ... what is the device's IP?"), where the
  // "correct" option is just the given value copied verbatim - no reasoning
  // required. The rule below explicitly covers both shapes while carving
  // out legitimate repetition (odd-one-out, "which of the following",
  // definition/vocabulary, passage comprehension) where a shared word
  // between stem and option does NOT eliminate the need to reason.
  const noAnswerLeakRule = language === "ar"
    ? 'يجب ألا يكشف نص السؤال نفسه عن الإجابة الصحيحة أو يلمّح إليها بشكل مباشر - يجب أن يبقى السؤال بحاجة فعلية للاختيار بين الخيارات الأربعة لمعرفة الإجابة. يشمل ذلك الحالة الدائرية/الذاتية المرجع: إذا ذكر نص السؤال قيمة أو هوية أو خاصية أو حقيقة محددة كمُعطى صريح، ثم سأل عن نفس هذه القيمة أو الخاصية بالضبط، فإن السؤال غير صالح لأن الطالب يمكنه نسخ الإجابة مباشرة من نص السؤال دون أي تفكير. هذا لا ينطبق على التكرار المشروع حيث ما زال الطالب بحاجة إلى التفكير أو التمييز بين المرشحين أو تطبيق تعريف أو تفسير نص أو تحديد العنصر المختلف - فتشارك كلمة أو مفهوم بين نص السؤال وأحد الخيارات لا يمثل مشكلة إلا عندما يُلغي الحاجة إلى التفكير، وليس لمجرد وجوده.\n\nللتمييز: (A) تسريب حقيقي - نص السؤال يقدّم الإجابة أو القيمة المطلوبة بالفعل بحيث لا يتطلب اختيار الخيار الصحيح أي تفكير؛ غير صالح دائمًا. (B) تكرار مشروع - كلمة أو مفهوم من نص السؤال يظهر أيضًا في أحد الخيارات، لكن الطالب ما زال بحاجة إلى التفكير أو التمييز أو التفسير أو تطبيق تعريف لاختيار الإجابة الصحيحة؛ صالح دائمًا ولا يجب اعتباره تسريبًا.'
    : 'The question stem itself must never state or directly hint at the correct answer - the four options must be genuinely necessary to determine the answer, not already given away in the question text. This includes the self-referential/tautological case: if the stem gives a specific value, identity, attribute, or fact as an explicit premise and then asks for that exact same value/attribute back, the question is invalid, because the student can copy the answer directly from the stem without any reasoning. This does NOT apply to legitimate repetition where the student still has to reason, discriminate among candidates, apply a definition, interpret a passage, or identify an odd-one-out - a shared word or concept between the stem and an option is only a problem when it eliminates the need to reason, not merely when it exists.\n\nTo tell these apart: (A) True leakage - the stem already gives the exact answer/value being asked for, so picking the correct option requires no reasoning; always invalid. (B) Legitimate repetition - a word or concept from the stem also appears in an option, but the student still needs reasoning, discrimination, interpretation, or definition-application to pick the correct one; always valid, never treat this as a leak.';

  // Found in practice: "hard" Security+/PMP questions repeatedly satisfied
  // the "multiple combined steps" difficulty criterion above by inventing a
  // non-standard financial/arithmetic formula (e.g. a fabricated
  // "Cost-Benefit Ratio = Potential Damage / Remediation Cost") dressed in
  // domain vocabulary, rather than testing genuine conceptual/scenario
  // judgment - the cheapest way to manufacture "multiple steps" for a
  // conceptual subject is arithmetic, not deeper domain reasoning. This
  // does not restrict genuinely quantitative subjects (Qudurat
  // Quantitative, math/physics/chemistry), which legitimately use real
  // calculation for hard-tier depth.
  const hardTierAuthenticityRule = difficulty === "hard"
    ? (language === "ar"
        ? 'بالنسبة لمادة غير كمية بطبيعتها (مثل الاستدلال اللفظي، الأمن السيبراني، إدارة المشاريع، الشبكات، الحوسبة السحابية): يجب أن يأتي مستوى "صعب" من تحليل مفاهيمي أعمق أو حكم على سيناريو واقعي أو دمج عدة مفاهيم حقيقية من المادة - وليس من اختراع معادلة أو نسبة مالية أو حسابية غير معروفة أو غير معيارية في هذا المجال فقط لخلق خطوات حسابية.'
        : 'For a subject that is not inherently quantitative (e.g. verbal reasoning, cybersecurity, project management, networking, cloud computing): "hard" difficulty must come from deeper conceptual analysis, realistic scenario judgment, or integrating multiple real concepts from the subject - NOT from inventing an arbitrary or non-standard formula, ratio, or financial calculation that is not a real, recognized concept in that field, just to manufacture calculation steps.')
    : "";
  const hardTierAuthenticityBlock = hardTierAuthenticityRule ? `\n\n${hardTierAuthenticityRule}` : "";

  // Every generated question must be wholly original - never reproduce or
  // closely paraphrase a real, copyrighted exam question. Applies broadly,
  // but stated explicitly here since Qudurat is the section most likely to
  // tempt reproducing real Qiyas items.
  const originalityRule = language === "ar"
    ? 'يجب أن تكون جميع الأسئلة أصلية بالكامل من تأليفك - لا تنسخ أو تعيد صياغة أي سؤال حقيقي من اختبار قياس أو أي اختبار محمي بحقوق النشر. أعد إنتاج أسلوب ونمط ومستوى الصعوبة المتوقع فقط، وليس أي سؤال فعلي.'
    : 'All questions must be wholly original, authored by you - never copy or closely paraphrase a real question from Qiyas or any copyrighted exam. Reproduce only the intended style, format, and difficulty level - never an actual real question.';

  if (language === "ar") {
    return `Generate ${count} unique multiple-choice questions in Arabic for:\nSubject: ${categoryMap[subCategory] || subCategory}\nDifficulty: ${difficultyMap[difficulty]}${qudurateSectionBlock}${certificationDomainBlock}\n\n${explanationRules}\n\n${selfContainmentRule}\n\n${noAnswerLeakRule}${hardTierAuthenticityBlock}\n\n${originalityRule}\n\nReturn JSON:\n{\n  "questions": [\n    {\n      "content": "نص السؤال",\n      "explanation": "شرح مفصل ينتهي بذكر الإجابة النهائية صراحة",\n      "options": [\n        { "content": "خيار أ", "is_correct": false },\n        { "content": "خيار ب", "is_correct": false },\n        { "content": "خيار ج", "is_correct": false },\n        { "content": "خيار د", "is_correct": false }\n      ]\n    }\n  ]\n}\nThe example above shows the JSON shape ONLY - it is not a hint about which position is correct. For each question, independently decide which option is actually correct based on its own content, and set is_correct: true on exactly that one option. The position of the correct option must vary randomly and evenly across all 4 slots across the ${count} questions - do NOT systematically place it in the same position (e.g. do not always make the 2nd option correct).\nRequirements: ${count} unique questions, exactly 4 options each, exactly 1 correct, all Arabic. Double-check that each question's actual cognitive difficulty genuinely matches the "${difficulty}" criteria above before including it.`;
  }

  return `Generate ${count} unique multiple-choice questions in English for:\nSubject: ${categoryMap[subCategory] || subCategory}\nDifficulty: ${difficultyMap[difficulty]}${qudurateSectionBlock}${certificationDomainBlock}\n\n${explanationRules}\n\n${selfContainmentRule}\n\n${noAnswerLeakRule}${hardTierAuthenticityBlock}\n\n${originalityRule}\n\nReturn JSON:\n{\n  "questions": [\n    {\n      "content": "question text",\n      "explanation": "detailed explanation ending with an explicit statement of the final answer",\n      "options": [\n        { "content": "option A", "is_correct": false },\n        { "content": "option B", "is_correct": false },\n        { "content": "option C", "is_correct": false },\n        { "content": "option D", "is_correct": false }\n      ]\n    }\n  ]\n}\nThe example above shows the JSON shape ONLY - it is not a hint about which position is correct. For each question, independently decide which option is actually correct based on its own content, and set is_correct: true on exactly that one option. The position of the correct option must vary randomly and evenly across all 4 slots across the ${count} questions - do NOT systematically place it in the same position (e.g. do not always make the 2nd option correct).\nRequirements: ${count} unique questions, exactly 4 options each, exactly 1 correct, all English. Double-check that each question's actual cognitive difficulty genuinely matches the "${difficulty}" criteria above before including it.`;
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

// --- Deterministic chemistry equation validation -----------------------
// Narrowly scoped: verifies that a chemical equation stated in a Chemistry
// question's own text is atomically balanced (same count of each element on
// both sides of the arrow). This is the exact bug class found in live
// testing - e.g. "2 H2SO4 + Na2CO3 -> Na2SO4 + CO2 + H2O", which is not
// balanced (the real ratio is 1:1). Deliberately does NOT judge whether a
// balanced reaction is chemically real/feasible (wrong-but-balanced
// products) - that stays the semantic reviewer's job. Only ever returns
// false when an equation IS confidently and unambiguously parsed and is
// provably unbalanced. Any parsing uncertainty - ions/charges, hydrates,
// nested parentheses, fractional coefficients, unrecognized element
// symbols, or no/multiple arrows - returns null so the candidate falls
// through to semantic review untouched, exactly like deterministicMathCheck.

const CHEMICAL_ELEMENT_SYMBOLS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
  "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
  "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
  "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu",
  "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn",
  "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr",
]);

const CHEMISTRY_STATE_SYMBOLS = new Set(["s", "l", "g", "aq"]);
const SUBSCRIPT_DIGIT_MAP: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

function normalizeChemistrySubscripts(s: string): string {
  return s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => SUBSCRIPT_DIGIT_MAP[c] ?? c);
}

// Parses a single molecular formula (no coefficient, no state symbol, no
// charge) into an element -> atom-count map. Supports at most one level of
// parentheses (e.g. "Ca(OH)2"). Returns null on anything not confidently
// recognized (unknown element symbol, nested parens, stray characters)
// rather than guessing.
function parseChemicalFormula(formula: string): Map<string, number> | null {
  const counts = new Map<string, number>();
  let i = 0;
  while (i < formula.length) {
    if (formula[i] === "(") {
      const close = formula.indexOf(")", i);
      if (close === -1) return null;
      const inner = formula.slice(i + 1, close);
      if (inner.length === 0 || inner.includes("(")) return null;
      const innerCounts = parseChemicalFormula(inner);
      if (!innerCounts) return null;
      i = close + 1;
      const multMatch = /^\d+/.exec(formula.slice(i));
      const mult = multMatch ? parseInt(multMatch[0], 10) : 1;
      if (multMatch) i += multMatch[0].length;
      for (const [el, c] of innerCounts) {
        counts.set(el, (counts.get(el) || 0) + c * mult);
      }
      continue;
    }
    const elMatch = /^[A-Z][a-z]?/.exec(formula.slice(i));
    if (!elMatch || !CHEMICAL_ELEMENT_SYMBOLS.has(elMatch[0])) return null;
    const el = elMatch[0];
    i += el.length;
    const numMatch = /^\d+/.exec(formula.slice(i));
    const n = numMatch ? parseInt(numMatch[0], 10) : 1;
    if (numMatch) i += numMatch[0].length;
    counts.set(el, (counts.get(el) || 0) + n);
  }
  return counts.size > 0 ? counts : null;
}

// Parses one side of an equation ("term + term + ...") into a combined
// element -> atom-count map, honoring per-species coefficients. Returns
// null if any species can't be confidently and unambiguously parsed
// (ions/charges, hydrates, fractional coefficients, unrecognized tokens).
function parseChemicalEquationSide(side: string): Map<string, number> | null {
  const terms = side.split("+").map((t) => t.trim()).filter((t) => t.length > 0);
  if (terms.length === 0) return null;

  const totals = new Map<string, number>();
  for (let term of terms) {
    term = term.replace(/\s*\(\s*(s|l|g|aq)\s*\)\s*$/i, "").trim();
    if (term.length === 0) return null;
    if (/[⁺⁻^]/.test(term) || /[+\-]$/.test(term)) return null; // ion/charge - out of scope
    if (term.includes("·") || term.includes(".")) return null; // hydrate/decimal - out of scope

    const coefMatch = /^(\d+)\s*/.exec(term);
    const coef = coefMatch ? parseInt(coefMatch[1], 10) : 1;
    const formula = coefMatch ? term.slice(coefMatch[0].length) : term;
    if (formula.length === 0 || coef === 0) return null;

    const parsed = parseChemicalFormula(formula);
    if (!parsed) return null;

    for (const [el, n] of parsed) {
      totals.set(el, (totals.get(el) || 0) + n * coef);
    }
  }
  return totals;
}

const CHEMICAL_EQUATION_ARROW = /->|→|⟶|⇌/;

// Locates a chemical-equation clause within free-form question text by
// splitting on sentence/clause punctuation and picking the one clause that
// contains an arrow. Deliberately conservative: if zero or more than one
// clause contains an arrow, returns null (unrecognized) rather than
// guessing which one is the real equation.
function extractChemicalEquationClause(content: string): string | null {
  // A "." splits UNLESS it sits directly between two digits (a decimal
  // point, as in "0.5") - a species ending in a subscript digit right
  // before a sentence period (e.g. "...NH3.") must still split normally.
  const clauses = content.split(/(?<!\d)\.|\.(?!\d)|[!?؟؛،,\n:：]/);
  const withArrow = clauses.filter((c) => CHEMICAL_EQUATION_ARROW.test(c));
  if (withArrow.length !== 1) return null;
  return withArrow[0].trim();
}

// Returns false only when a chemical equation is confidently and
// unambiguously parsed AND proven atomically unbalanced. Returns true when
// confidently parsed and balanced. Returns null (no-op) whenever the
// equation can't be confidently parsed - see file comment above for the
// full list of things this intentionally does not attempt to support.
function deterministicChemistryEquationCheck(questionContent: string): boolean | null {
  const clause = extractChemicalEquationClause(questionContent);
  if (!clause) return null;

  const arrowMatch = CHEMICAL_EQUATION_ARROW.exec(clause);
  if (!arrowMatch) return null;
  const leftRaw = clause.slice(0, arrowMatch.index);
  const rightRaw = clause.slice(arrowMatch.index + arrowMatch[0].length);
  if (CHEMICAL_EQUATION_ARROW.test(leftRaw) || CHEMICAL_EQUATION_ARROW.test(rightRaw)) return null;

  const left = normalizeChemistrySubscripts(leftRaw);
  const right = normalizeChemistrySubscripts(rightRaw);

  const leftTotals = parseChemicalEquationSide(left);
  const rightTotals = parseChemicalEquationSide(right);
  if (!leftTotals || !rightTotals) return null;

  const elements = new Set([...leftTotals.keys(), ...rightTotals.keys()]);
  for (const el of elements) {
    if ((leftTotals.get(el) || 0) !== (rightTotals.get(el) || 0)) return false;
  }
  return true;
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

// Last-resort, deterministic (no API call) runtime guard against a
// Qudurat-verbal quiz ever serving quantitative/trivia content or vice
// versa - defense-in-depth for exactly the contamination class found in the
// live database (arithmetic/algebra/geometry/general-trivia rows persisted
// under the Verbal skill). This is NOT the primary quality gate - that's
// the strengthened generation prompt and the topic-alignment check in
// semanticallyValidateQuestions() at insert time - this only catches
// already-persisted rows (pre-dating that gate, or any future gap) before
// they'd ever reach a student. Deliberately conservative: only flags
// strong, unambiguous signals, so it can't starve a legitimate pool through
// false positives. No-op for every subCategory other than Qudurat's
// verbal/quantitative split.
// All 50 confirmed-contaminated rows from the Qudurat-Verbal incident
// audited on 2026-08-20 (English arithmetic/algebra/geometry/trivia content
// found persisted under the Arabic Verbal skill). Quarantined here - made
// permanently unservable - rather than deleted, so no row's history is
// destroyed regardless of whether it has real user_answers referencing it.
// This is a CLOSED, ONE-TIME remediation list for this specific incident,
// not the ongoing category-validation mechanism: it is a fixed snapshot,
// never appended to for future contamination. Ongoing protection against
// new contamination comes from three independent, content-based layers
// that don't depend on any ID list - the strengthened generation prompt
// (buildQuestionPrompt's qudurateSectionSpec), the topic-alignment check in
// semanticallyValidateQuestions() at insert time, and the deterministic
// looksOffTopicForQudurateSection() heuristic below, which by itself
// already independently re-derives all 50 of these same rows as off-topic
// from their content alone (verified against this exact list).
const KNOWN_INVALID_QUESTION_IDS = new Set([
  "090c7935-fc85-4626-b3b8-37d27fa7fe5b",
  "6242c084-2ba2-4a11-85a0-83c0b0b608bf",
  "ac828df4-acbb-461a-87f7-8e06916641a7",
  "259ea7f9-14af-41a5-a98a-d1fade66f09a",
  "498d7b36-d205-482b-b161-d237d55b81d9",
  "7184b2fd-975f-40a5-9474-fd9f91a08d20",
  "e4ee7e27-7213-4353-adfe-571303c4804e",
  "7b7a5778-074f-4d38-9ce4-e07e58065abd",
  "8094e70c-d564-471f-9084-8ea3aac3b1b1",
  "25f763a4-d7a4-4c80-b302-f4150cae0f18",
  "c2e09711-583e-40ee-85f5-fa368147586e",
  "ca3e385b-c0db-4955-b9a5-34fb9413efc8",
  "2cb0b826-4352-4b69-84c8-fc31018ac100",
  "b3cbc578-10e6-404c-a862-1a0a256d3d08",
  "e37d720f-3580-4105-94df-5c43c6e41ebc",
  "1566f605-0a0d-4d0f-950c-57aa63812751",
  "7c16e924-71df-4aee-9dca-bfaa5bdd3916",
  "1268528a-9042-4e44-8958-1f53645f3431",
  "6c8c41bd-d6df-477c-a48e-14579ca5c9b7",
  "c92184da-8486-4f74-976b-d46e5002543e",
  "ea8d3169-d2d5-4495-a0d4-f77c332dd325",
  "27399816-1a0d-47e1-9b6e-e21c15819477",
  "24818e7d-f1b9-4f66-97d9-89974e835833",
  "9863d58c-f9c6-41fc-b2ce-5a783ba22849",
  "5fbb0a41-f378-4a71-9b32-903739274c4d",
  "0e5004b9-9995-43c3-8711-9d14db6fac37",
  "61e54c58-73d1-4778-aa58-dda5224d1728",
  "13051a92-8e4a-4c3a-b444-3350e18d9d2e",
  "3fbda8f7-cce9-42f2-884f-e1470dd519bb",
  "c8016f48-416f-4130-ab85-b02167273935",
  "d9572d0d-db56-4067-ac8d-d497b02ca134",
  "0d15cc6e-4c70-4abb-9606-0bf768d5d04c",
  "7d9bcc82-3a32-4263-9220-2e6d0cb4dea5",
  "7e323f58-5269-423e-9fff-e739651b383b",
  "5e76c2e9-6f37-4b69-adf8-0d911d6236ad",
  "f11f567b-a9ce-4ace-aa7e-3cc92869fb71",
  "d819f8cc-a600-40e3-952a-4b593dadd769",
  "255cacf5-b1b4-4e7f-afb7-40c57eede5a8",
  "73ccfe2b-2531-40c5-bf68-52a6c973ce72",
  "f75e482f-6435-48da-83ee-22a9fbe555f3",
  "d2d37e72-d2aa-4367-9602-853fe09d55fb",
  "f6df0d03-4933-4a68-b498-446eb3db6280",
  "479b3cf0-102f-4d53-864f-73175a501584",
  "dc20eaf8-ba74-4cb4-bb8b-9939b75c1d67",
  "f172cfdb-9f2e-4017-b769-0a3e58db896e",
  "3d5f54eb-af32-4d3e-b26b-12ccea7f79b5",
  "8c564d0a-6559-48f9-abea-e567c943795a",
  "01da5947-3696-492e-aa60-4c9a8de64a06",
  "03fdc669-91f0-4b6d-b14e-369f068868be",
  "39ad32a3-7031-43b2-80fe-c625fbf873ae",
]);

function looksOffTopicForQudurateSection(content: string, subCategory: string | undefined, questionId?: string): boolean {
  if (questionId && KNOWN_INVALID_QUESTION_IDS.has(questionId)) return true;
  if (subCategory !== "verbal" && subCategory !== "quantitative") return false;

  const hasArithmeticExpression = /\d\s*[+\-×÷*/]\s*\d/.test(content);
  const hasPercentSign = /%|بالمئة|نسبة مئوية/.test(content);
  const hasEquationPattern = /=\s*-?\d|\b[a-zA-Z]\s*=|[سصع]\s*=/.test(content);
  const hasGeometryKeyword = /\b(rectangle|triangle|perimeter|area|volume|radius|cylinder|circle)\b/i.test(content)
    || /(مساحة|محيط|حجم|مثلث|مستطيل|دائرة|نصف قطر)/.test(content);
  // Numeric word problems (e.g. "a train travels 240 km at 60 km/h...")
  // often carry no bare arithmetic symbol or "=" at all - caught instead by
  // 2+ distinct numbers combined with a rate/quantity word problem cue.
  const numberCount = (content.match(/\d+(\.\d+)?/g) || []).length;
  const hasWordProblemCue = /\b(km\/h|per hour|per minute|per day|average speed|travels?|calculate|how many|how much|total cost|kilometers?|minutes?)\b/i.test(content)
    || /(كم|السرعة|احسب|كيلومتر|بالساعة|بالدقيقة|إجمالي|المتوسط)/.test(content);
  const hasNumericWordProblem = numberCount >= 2 && hasWordProblemCue;
  const hasQuantitativeSignal = hasArithmeticExpression || hasPercentSign || hasEquationPattern || hasGeometryKeyword || hasNumericWordProblem;

  // Spelled-out arithmetic ("12 divided by 4") carries no bare symbol/"="
  // for hasArithmeticExpression/hasEquationPattern above to catch.
  const hasSpelledOutArithmetic = /\b(divided by|multiplied by|plus|minus|times)\b.*\d|\d.*\b(divided by|multiplied by|plus|minus|times)\b/i.test(content);
  // General fact-recall framing ("How many X are there/in Y", "Which W is
  // the Z", "What is the largest/smallest/tallest W") is inherently
  // trivia/recall, not verbal reasoning, regardless of the specific noun -
  // broader than an ever-growing keyword list. The superlative clause
  // (largest/smallest/etc.) is deliberately a closed, narrow adjective
  // list anchored to the very start of the stem - it only matches "what is
  // the <superlative> ..." framing, the exact shape of general-knowledge
  // trivia (e.g. "What is the largest mammal in the world?"), and does NOT
  // match on the mere presence of "what" or "which" anywhere in a
  // question - so it does not affect legitimate synonym/antonym/analogy/
  // sentence-completion/reading-comprehension verbal questions, which
  // essentially never open with this exact construction.
  const hasFactRecallFraming = /^how many\b.*\b(are there|in|on)\b/i.test(content.trim())
    || /^which\b.*\b(planet|animal|gas|instrument|mammal|color|continent|desert|currency|mineral|element)\b/i.test(content.trim())
    || /^what\s+(is|was)\s+the\s+(largest|smallest|biggest|tallest|shortest|longest|highest|deepest|fastest|slowest|oldest|youngest|heaviest|lightest|widest|narrowest|hottest|coldest|richest|poorest)\b/i.test(content.trim())
    // No trailing \b here deliberately - JavaScript's \b is defined against
    // ASCII word characters only and does not recognize Arabic letters as
    // "word" characters, so a \b immediately after an Arabic word silently
    // fails to match at all (confirmed while testing this exact pattern).
    || /^ما\s*(هو|هي)?\s*(أكبر|أصغر|أطول|أقصر|أعلى|أعمق|أسرع|أبطأ|أقدم|أثقل|أخف|أوسع|أضيق)(\s|$)/.test(content.trim());
  const hasTriviaKeyword = /\b(capital of|which planet|national animal|king of the jungle|chemical symbol|which continent|currency used in|boiling point|dna stand)\b/i.test(content)
    || /(عاصمة|الكوكب|الرمز الكيميائي|العملة المستخدمة|القارة)/.test(content)
    || hasSpelledOutArithmetic || hasFactRecallFraming;

  if (subCategory === "verbal") {
    return hasQuantitativeSignal || hasTriviaKeyword;
  }

  const hasVerbalSignal = /(مرادف|مضاد كلمة|ضد كلمة|أكمل الجملة|الكلمة الشاذة|تناظر لفظي|\bsynonym\b|\bantonym\b|\banalogy\b|odd.?one.?out|fill in the blank)/i.test(content);
  return hasVerbalSignal;
}

// Proportion-based, not presence-based: a naive "contains any Latin
// character" check was found in practice to misjudge Arabic content as
// "already English" (and skip translation entirely) whenever it happened
// to mention an English acronym/brand name embedded in the Arabic sentence
// - e.g. "\u0645\u0627 \u0647\u064A \u0627\u0644\u0645\u0633\u0624\u0648\u0644\u064A\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629 \u0641\u064A \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u062E\u062F\u0645\u0627\u062A AWS\u061F" contains "AWS",
// which alone made the old check treat this as not needing translation to
// English, silently serving Arabic content in an English session. Mirrors
// the same dominant-script reasoning already used for cached-explanation
// language detection in generate-explanation/index.ts's looksLikeLanguage().
function needsTranslation(content: string, targetLang: string) {
  const arabicCount = (content.match(/[\u0600-\u06FF]/g) || []).length;
  const englishCount = (content.match(/[A-Za-z]/g) || []).length;
  const QUOTE_TOLERANCE = 0.2;
  if (targetLang === "ar") {
    const looksArabic = arabicCount > 0 && englishCount <= arabicCount * QUOTE_TOLERANCE;
    return !looksArabic && englishCount > 0;
  }
  const looksEnglish = englishCount > 0 && arabicCount <= englishCount * QUOTE_TOLERANCE;
  return !looksEnglish && arabicCount > 0;
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
    const [translationVerdict] = await semanticallyValidateQuestions(apiKey, [
      { content: parsedResult.content, options: translatedOptions },
    ]);
    if (!translationVerdict.valid) {
      console.warn(`translateQuestion: translated question ${question?.id} failed semantic re-validation - returned untranslated - reason: ${translationVerdict.reason ?? "no reason provided"}`);
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
