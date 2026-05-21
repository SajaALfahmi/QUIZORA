/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-action",
};

// ================= BKT =================

const BKT = {
  P_L0: 0.3,
  P_T: 0.15,
  P_G: 0.2,
  P_S: 0.1,
};

function updateMastery(
  currentMastery: number,
  isCorrect: boolean
): number {
  const pL = currentMastery;

  const pCorrect =
    pL * (1 - BKT.P_S) +
    (1 - pL) * BKT.P_G;

  const pWrong = 1 - pCorrect;

  let pLgivenObs: number;

  if (isCorrect) {
    pLgivenObs =
      (pL * (1 - BKT.P_S)) / pCorrect;
  } else {
    pLgivenObs =
      (pL * BKT.P_S) / pWrong;
  }

  const newMastery =
    pLgivenObs +
    (1 - pLgivenObs) * BKT.P_T;

  return Math.max(0, Math.min(1, newMastery));
}

function masteryToDifficulty(
  mastery: number
): string {
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

// ================= MAIN =================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      )!
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized user",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const userId = user.id;

    const action =
      req.headers.get("x-action");

    if (action === "start-session") {
      return await handleStartSession(
        supabaseService,
        userId,
        await req.json()
      );
    }

    if (action === "submit-answer") {
      return await handleSubmitAnswer(
        supabaseService,
        userId,
        await req.json()
      );
    }

    if (action === "next-question") {
      const body = await req.json();

      return await handleNextQuestion(
        supabaseService,
        userId,
        body.session_id
      );
    }

    if (action === "end-session") {
      const body = await req.json();

      return await handleEndSession(
        supabaseService,
        userId,
        body.session_id
      );
    }

    return new Response(
      JSON.stringify({
        error: "Invalid action",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("FUNCTION ERROR:", error);

    return new Response(
      JSON.stringify({
        error:
          error?.message ||
          "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});

// ================= START SESSION =================

async function handleStartSession(
  supabaseService: any,
  userId: string,
  payload: StartSessionPayload
) {
  const {
    course_id,
    total_questions,
    difficulty_mode,
  } = payload;

  await ensureCourseExists(
    supabaseService,
    course_id
  );

  const { data: session, error } =
    await supabaseService
      .from("learning_sessions")
      .insert({
        user_id: userId,
        course_id,
        status: "active",
        total_questions:
          total_questions ?? 20,
        difficulty_mode:
          difficulty_mode || "auto",
      })
      .select()
      .single();

  if (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  return new Response(
    JSON.stringify({ session }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

// ================= SUBMIT ANSWER =================

async function handleSubmitAnswer(
  supabaseService: any,
  userId: string,
  payload: SubmitAnswerPayload
) {
  const {
    session_id,
    question_id,
    selected_option_id,
    time_spent_seconds,
  } = payload;

  const { data: option } =
    await supabaseService
      .from("answer_options")
      .select("is_correct")
      .eq("id", selected_option_id)
      .single();

  const isCorrect =
    option?.is_correct ?? false;

  await supabaseService
    .from("user_answers")
    .insert({
      user_id: userId,
      session_id,
      question_id,
      selected_option_id,
      is_correct: isCorrect,
      time_spent_seconds,
    });

  const { data: question } =
    await supabaseService
      .from("questions")
      .select("skill_id")
      .eq("id", question_id)
      .single();

  if (question?.skill_id) {
    const skillId = question.skill_id;

    const { data: skillLevel } =
      await supabaseService
        .from("user_skill_levels")
        .select(
          "mastery_level, questions_attempted, questions_correct"
        )
        .eq("user_id", userId)
        .eq("skill_id", skillId)
        .single();

    const currentMastery =
      skillLevel?.mastery_level ??
      BKT.P_L0;

    const newMastery =
      updateMastery(
        currentMastery,
        isCorrect
      );

    await supabaseService
      .from("user_skill_levels")
      .upsert(
        {
          user_id: userId,
          skill_id: skillId,
          mastery_level: newMastery,
          questions_attempted:
            (skillLevel?.questions_attempted ??
              0) + 1,
          questions_correct:
            (skillLevel?.questions_correct ??
              0) + (isCorrect ? 1 : 0),
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "user_id,skill_id",
        }
      );
  }

  return new Response(
    JSON.stringify({
      success: true,
      is_correct: isCorrect,
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

// ================= NEXT QUESTION =================

async function handleNextQuestion(
  supabaseService: any,
  userId: string,
  sessionId: string
) {
  const { data: session } =
    await supabaseService
      .from("learning_sessions")
      .select(
        "id, course_id, total_questions, difficulty_mode"
      )
      .eq("id", sessionId)
      .single();

  if (!session) {
    return new Response(
      JSON.stringify({
        error: "Session not found",
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  const { data: answered } =
    await supabaseService
      .from("user_answers")
      .select("question_id")
      .eq("session_id", sessionId);

  const answeredIds =
    (answered || []).map(
      (a: any) => a.question_id
    );

  const { data: questions } =
    await supabaseService
      .from("questions")
      .select(
        `
id,
content,
difficulty,
skill_id,
explanation,
answer_options(
  id,
  content,
  is_correct,
  order_index
)
`
      )
      .eq("course_id", session.course_id);

  const remaining =
    (questions || []).filter(
      (q: any) =>
        !answeredIds.includes(q.id)
    );

  if (remaining.length === 0) {
    return new Response(
      JSON.stringify({
        question: null,
        finished: true,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  let targetDifficulty = "medium";

  if (
    session.difficulty_mode ===
    "auto"
  ) {
    const skillIds = [
      ...new Set(
        remaining
          .map((q: any) => q.skill_id)
          .filter(Boolean)
      ),
    ];

    const { data: levels } =
      await supabaseService
        .from("user_skill_levels")
        .select(
          "skill_id, mastery_level"
        )
        .eq("user_id", userId)
        .in("skill_id", skillIds);

    if (levels?.length) {
      const avg =
        levels.reduce(
          (sum: number, s: any) =>
            sum + s.mastery_level,
          0
        ) / levels.length;

      targetDifficulty =
        masteryToDifficulty(avg);
    }
  } else {
    targetDifficulty =
      session.difficulty_mode ||
      "medium";
  }

  const preferred =
    remaining.filter(
      (q: any) =>
        q.difficulty ===
        targetDifficulty
    );

  const pool =
    preferred.length > 0
      ? preferred
      : remaining;

  const nextQuestion =
    pool[
      Math.floor(
        Math.random() * pool.length
      )
    ];

  return new Response(
    JSON.stringify({
      question: nextQuestion,
      finished: false,
      difficulty_target:
        targetDifficulty,
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

// ================= END SESSION =================

async function handleEndSession(
  supabaseService: any,
  userId: string,
  sessionId: string
) {
  const { data } =
    await supabaseService
      .from("learning_sessions")
      .update({
        status: "completed",
        completed_at:
          new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select()
      .single();

  return new Response(
    JSON.stringify({
      session: data,
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

// ================= ENSURE COURSE =================

async function ensureCourseExists(
  supabaseService: any,
  courseId: string
) {
  const { count } =
    await supabaseService
      .from("questions")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("course_id", courseId);

  console.log(
    "QUESTION COUNT:",
    count
  );

  if ((count ?? 0) < 50) {
    console.log(
      "Generating AI questions..."
    );

    const { data: skill } =
      await supabaseService
        .from("skills")
        .select("id, name")
        .eq("course_id", courseId)
        .limit(1)
        .single();

    if (!skill?.id) {
      console.log("NO SKILL FOUND");
      return;
    }

    await generateAIQuestions(
      supabaseService,
      courseId,
      skill.id,
      skill.name || "القدرات"
    );
  }
}

// ================= GENERATE AI QUESTIONS =================

async function generateAIQuestions(
  supabaseService: any,
  courseId: string,
  skillId: string,
  topic: string
) {
  const apiKey =
    Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    console.error("NO OPENAI KEY");
    return;
  }

  const difficulties = [
    "easy",
    "medium",
    "hard",
  ];

  for (const difficulty of difficulties) {
    console.log(
      "GENERATING:",
      difficulty
    );

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.7,
          response_format: {
            type: "json_object",
          },

          messages: [
            {
              role: "system",
              content: `
أنت خبير سعودي في اختبار القدرات.

أرجع JSON فقط.

لا تستخدم markdown.
لا تستخدم \`\`\`.
لا تضف أي نص إضافي.
`,
            },

            {
              role: "user",
              content: `
أنشئ 10 أسئلة قدرات عربية.

الموضوع:
${topic}

الصعوبة:
${difficulty}

الصيغة:

{
  "questions": [
    {
      "content": "السؤال",
      "explanation": "الشرح",
      "options": [
        {
          "content": "خيار",
          "is_correct": false
        }
      ]
    }
  ]
}
`,
            },
          ],
        }),
      }
    );

    if (!aiResponse.ok) {
      const err =
        await aiResponse.text();

      console.error(
        "OPENAI ERROR:",
        err
      );

      continue;
    }

    const aiData =
      await aiResponse.json();

    const rawContent =
      aiData?.choices?.[0]?.message
        ?.content;

    console.log(
      "RAW CONTENT:",
      rawContent
    );

    if (!rawContent) continue;

    let parsed;

    try {
      const cleanContent =
        rawContent
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

      parsed =
        JSON.parse(cleanContent);

    } catch (err) {
      console.error(
        "JSON PARSE ERROR:",
        err
      );

      continue;
    }

    const questions =
      parsed.questions || [];

    console.log(
      "TOTAL QUESTIONS:",
      questions.length
    );

    for (const q of questions) {
      if (
        !q.content ||
        !Array.isArray(q.options)
      ) {
        continue;
      }

      const { data: duplicate } =
        await supabaseService
          .from("questions")
          .select("id")
          .eq("course_id", courseId)
          .eq("content", q.content)
          .maybeSingle();

      if (duplicate) continue;

      const { data: question } =
        await supabaseService
          .from("questions")
          .insert({
            skill_id: skillId,
            course_id: courseId,
            content: q.content,
            explanation:
              q.explanation || "",
            difficulty,
            is_ai_generated: true,
          })
          .select()
          .single();

      if (!question) continue;

      const options =
        q.options.map(
          (
            opt: any,
            idx: number
          ) => ({
            question_id:
              question.id,
            content: opt.content,
            is_correct:
              opt.is_correct,
            order_index: idx,
          })
        );

      await supabaseService
        .from("answer_options")
        .insert(options);
    }
  }
}