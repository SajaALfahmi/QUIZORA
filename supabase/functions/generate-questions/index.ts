import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // =============================
    // AUTH USER
    // =============================

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing authorization header",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized user",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const userId = user.id;

    // =============================
    // REQUEST BODY
    // =============================

const {
  skill_id,
  course_id,
  difficulty = "medium",
  count = 5,
} = await req.json();

// =============================
// GET SKILL + COURSE DATA
// =============================

const { data: skill } = await supabase
  .from("skills")
  .select("*")
  .eq("id", skill_id)
  .single();

const { data: course } = await supabase
  .from("courses")
  .select("*")
  .eq("id", course_id)
  .single();

const topic = skill?.name || "General Topic";
const examType = course?.title || "General Exam";
const language = "Arabic";
const numberOfQuestions = count;

    // =============================
    // GET USER HISTORY
    // =============================

    const { data: oldQuestions } = await supabase
      .from("questions")
      .select("content")
      .eq("user_id", userId)
      .limit(50);

    const previousQuestions =
      oldQuestions
        ?.map((q: any) => q.content)
        .join("\n") || "No previous questions";

    // =============================
    // OPENAI REQUEST
    // =============================

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.9,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content: `
You are an advanced AI exam question generator.

Generate UNIQUE and NON-REPETITIVE questions every time.
Never repeat wording, ideas, or patterns.
Questions must adapt to the user's difficulty level.
Create realistic and varied exam-style questions.

Return ONLY valid JSON.

Expected JSON format:

{
  "questions": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "...",
      "explanation": "..."
    }
  ]
}
`,
            },
            {
              role: "user",
              content: `
Generate ${numberOfQuestions} ${difficulty} difficulty questions.

Language: ${language}
Exam Type: ${examType}
Topic: ${topic}

IMPORTANT:
Avoid generating anything similar to these previous questions:

${previousQuestions}
`,
            },
          ],
        }),
      }
    );

    // =============================
    // VALIDATE OPENAI RESPONSE
    // =============================

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();

      console.error("OpenAI API Error:", errorText);

      throw new Error("Failed to generate questions from OpenAI");
    }

    const openAiData = await openAiResponse.json();

    const aiContent =
      openAiData?.choices?.[0]?.message?.content;

    if (!aiContent) {
      console.error(openAiData);

      throw new Error("No content returned from AI");
    }

    // =============================
    // PARSE JSON
    // =============================

    let parsed: any;

    try {
      parsed = JSON.parse(aiContent);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("AI Content:", aiContent);

      throw new Error("Invalid AI JSON response");
    }

    const generatedQuestions = parsed.questions || [];

    if (!generatedQuestions.length) {
      throw new Error("No questions generated");
    }

    const insertedQuestions = [];

    // =============================
    // SAVE QUESTIONS
    // =============================

    for (const q of generatedQuestions) {
      // SKIP INVALID QUESTIONS
      if (!q.question || !q.correct_answer) {
        continue;
      }

      // CHECK DUPLICATES FOR SAME USER ONLY
      const { data: duplicate } = await supabase
        .from("questions")
        .select("id")
        .eq("user_id", userId)
        .eq("content", q.question)
        .maybeSingle();

      if (duplicate) {
        console.log("Duplicate skipped:", q.question);
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("questions")
        .insert({
          user_id: userId,

          content: q.question,

          options: Array.isArray(q.options)
            ? q.options
            : ["Option A", "Option B", "Option C", "Option D"],

          correct_answer: q.correct_answer,

          explanation:
            q.explanation ||
            "Explanation will be generated later.",

          topic,
          difficulty,
          exam_type: examType,
          language,
          is_ai_generated: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert Error:", insertError);
        continue;
      }

      if (inserted) {
        insertedQuestions.push(inserted);
      }
    }

    // =============================
    // FINAL RESPONSE
    // =============================

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedQuestions.length,
        questions: insertedQuestions,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Function Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unknown server error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});