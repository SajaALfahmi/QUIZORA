/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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
      return await handleNextQuestion(supabaseService, userId, body.session_id);
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
  const { course_id, total_questions, difficulty_mode } = payload;

  await ensureCourseExists(supabaseService, course_id);

  const { data: session, error } = await supabaseService
    .from("learning_sessions")
    .insert({
      user_id: userId,
      course_id,
      status: "active",
      total_questions: total_questions ?? 25,
      difficulty_mode: difficulty_mode || "auto", // ✅ الصح
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
    .single();

  const isCorrect = option?.is_correct ?? false;

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

  return new Response(JSON.stringify({ success: true, is_correct: isCorrect }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleNextQuestion(supabaseService: any, userId: string, sessionId: string) {
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "session_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: session, error: sessionError } = await supabaseService
    .from("learning_sessions")
    .select("id, course_id, total_questions, difficulty_mode") // ✅ الصح
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const difficultyMode = session.difficulty_mode || "auto"; // ✅ الصح

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

  const { data: questions } = await supabaseService
    .from("questions")
    .select(`id, content, explanation, difficulty, skill_id, answer_options(id, content, is_correct, order_index)`)
    .eq("course_id", session.course_id);

  const remaining = (questions || []).filter((q: any) => !askedQuestionIds.includes(q.id));

  if (!remaining || remaining.length === 0) {
    return new Response(JSON.stringify({ question: null, finished: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ===== Question Selection Based on Mode =====
  let targetDifficulty = "medium";

  if (difficultyMode === "auto") {
    const skillIds = [...new Set(remaining.map((q: any) => q.skill_id).filter(Boolean))];
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
        targetDifficulty = "medium";
      }
    }
  } else {
    // Manual mode
    targetDifficulty = difficultyMode;
    console.log(`Manual mode: ${targetDifficulty}`);
  }

  const preferred = remaining.filter((q: any) => q.difficulty === targetDifficulty);
  const pool = preferred.length > 0 ? preferred : remaining;
  const nextQuestion = pool[Math.floor(Math.random() * pool.length)];

  return new Response(
    JSON.stringify({ question: nextQuestion, finished: false, difficulty_target: targetDifficulty }),
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

async function ensureCourseExists(supabaseService: any, courseId: string) {
  const { data: existingCourse } = await supabaseService
    .from("courses")
    .select("id, sub_category")
    .eq("id", courseId)
    .single();

  const courseExists = !!existingCourse;
  const courseData: Record<string, any> = {
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

  const courseInfo = courseData[courseId];
  if (!courseInfo) return;

  const subCategory = courseExists ? existingCourse.sub_category : courseInfo.sub_category;

  if (!courseExists) {
    await supabaseService.from("courses").insert({ id: courseId, ...courseInfo });
  }

  const { data: existingSkill } = await supabaseService
    .from("skills").select("id").eq("course_id", courseId).limit(1).single();

  let skillId = existingSkill?.id;

  if (!skillId) {
    const { data: skill } = await supabaseService
      .from("skills")
      .insert({ course_id: courseId, name: `${subCategory} Fundamentals`, description: `Basic concepts in ${subCategory}`, order_index: 0 })
      .select().single();
    skillId = skill?.id;
  }

  const { count } = await supabaseService
    .from("questions").select("id", { count: "exact", head: true }).eq("course_id", courseId);

  if ((count ?? 0) === 0 && skillId) {
    await generateAIQuestions(supabaseService, courseId, skillId, subCategory);
  }
}

async function generateAIQuestions(supabaseService: any, courseId: string, skillId: string, subCategory: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return;

  const difficulties = ["easy", "medium", "hard"];
  for (const difficulty of difficulties) {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert question generator for Saudi standardized tests. Generate questions in Arabic. Always respond with valid JSON only." },
          { role: "user", content: buildQuestionPrompt(subCategory, 25, difficulty) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) continue;
    const aiData = await aiResponse.json();
    const generatedContent = JSON.parse(aiData.choices[0].message.content);

    for (const q of generatedContent.questions || []) {
      const { data: question } = await supabaseService
        .from("questions")
        .insert({ skill_id: skillId, course_id: courseId, content: q.content, explanation: q.explanation, difficulty, is_ai_generated: true })
        .select().single();

      if (!question) continue;

      await supabaseService.from("answer_options").insert(
        (q.options || []).map((opt: any, idx: number) => ({
          question_id: question.id, content: opt.content, is_correct: opt.is_correct, order_index: idx,
        }))
      );
    }
  }
}

function buildQuestionPrompt(subCategory: string, count: number, difficulty: string): string {
  const categoryMap: Record<string, string> = {
    verbal: "اختبار القدرات العامة - الجزء اللفظي",
    quantitative: "اختبار القدرات العامة - الجزء الكمي",
    mathematics: "الرياضيات - الثانوية العامة",
    physics: "الفيزياء - الثانوية العامة",
    chemistry: "الكيمياء - الثانوية العامة",
    biology: "الأحياء - الثانوية العامة",
    ccna: "CCNA - شهادة تقنية",
    security: "CompTIA Security+",
    aws: "AWS Cloud Practitioner",
    pmp: "PMP - إدارة المشاريع",
  };

  const difficultyMap: Record<string, string> = {
    easy: "سهل - أسئلة أساسية",
    medium: "متوسط - أسئلة معتدلة",
    hard: "صعب - أسئلة متقدمة",
  };

  return `Generate ${count} unique multiple-choice questions in Arabic for:
Subject: ${categoryMap[subCategory] || subCategory}
Difficulty: ${difficultyMap[difficulty]}

Return JSON:
{
  "questions": [
    {
      "content": "نص السؤال",
      "explanation": "شرح مفصل",
      "options": [
        { "content": "خيار", "is_correct": false },
        { "content": "خيار صحيح", "is_correct": true },
        { "content": "خيار", "is_correct": false },
        { "content": "خيار", "is_correct": false }
      ]
    }
  ]
}
Requirements: ${count} unique questions, exactly 4 options each, exactly 1 correct, all Arabic.`;
}