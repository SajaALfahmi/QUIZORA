import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.103.0/cors";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    
    const userId = "system";

    const { skill_id, course_id, difficulty, count = 5 } = await req.json();

    if (!skill_id || !course_id) {
      return new Response(JSON.stringify({ error: "skill_id and course_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get skill info
    const { data: skill } = await supabase
      .from("skills")
      .select("name, description")
      .eq("id", skill_id)
      .single();

    // Get course info
    const { data: course } = await supabase
      .from("courses")
      .select("category, sub_category, title")
      .eq("id", course_id)
      .single();

    if (!skill || !course) {
      return new Response(JSON.stringify({ error: "Skill or course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's skill level
    const { data: userSkill } = await supabase
      .from("user_skill_levels")
      .select("mastery_level")
      .eq("user_id", userId)
      .eq("skill_id", skill_id)
      .single();

    const masteryLevel = userSkill?.mastery_level ?? 0;
    const targetDifficulty = difficulty || (masteryLevel >= 0.7 ? "hard" : masteryLevel >= 0.4 ? "medium" : "easy");

    // Build prompt for AI
    const prompt = buildQuestionPrompt(course, skill, targetDifficulty, count);

    // Call AI to generate questions
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
            content: `You are an expert question generator for Saudi standardized tests. Generate questions in Arabic. Always respond with valid JSON only, no markdown. Respect the requested difficulty level exactly and generate questions appropriate for that level.`,
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return new Response(JSON.stringify({ error: "AI generation failed", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const generatedContent = JSON.parse(aiData.choices[0].message.content);

    // Save generated questions to database
    const savedQuestions = [];
    for (const q of generatedContent.questions || []) {
      const { data: savedQuestion, error: qError } = await supabase
        .from("questions")
        .insert({
          skill_id,
          course_id,
          content: q.content,
          explanation: q.explanation,
          difficulty: targetDifficulty,
          is_ai_generated: true,
        })
        .select()
        .single();

      if (savedQuestion && !qError) {
        const options = (q.options || []).map((opt: any, idx: number) => ({
          question_id: savedQuestion.id,
          content: opt.content,
          is_correct: opt.is_correct,
          order_index: idx,
        }));

        await supabase.from("answer_options").insert(options);

        const { data: savedOptions } = await supabase
          .from("answer_options")
          .select("*")
          .eq("question_id", savedQuestion.id);

        savedQuestions.push({ ...savedQuestion, answer_options: savedOptions });
      }
    }

    return new Response(JSON.stringify({ questions: savedQuestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildQuestionPrompt(course: any, skill: any, difficulty: string, count: number): string {
  const categoryMap: Record<string, string> = {
    qudurat: "اختبار القدرات العامة",
    tahseeli: "اختبار التحصيلي",
    certifications: "شهادات مهنية",
  };

  const difficultyMap: Record<string, string> = {
    easy: "سهل",
    medium: "متوسط",
    hard: "صعب",
  };

  return `Generate ${count} high-quality multiple-choice questions in Arabic for Saudi high school students preparing for the Tahseeli exam.

- Test: ${categoryMap[course.category] || course.category}
- Subject: ${course.sub_category} (${course.title})
- Skill: ${skill.name}${skill.description ? ` - ${skill.description}` : ""}
- Difficulty: ${difficultyMap[difficulty] || difficulty}

STRICT RULES:
- Use the requested difficulty exactly: ${difficultyMap[difficulty] || difficulty}.
- Easy: clear and focused questions with simple reasoning.
- Medium: questions requiring understanding, interpretation, or moderate analysis.
- Hard: questions requiring deeper reasoning, multiple steps, comparison, or application.
- Questions must test real knowledge, not just definitions.
- The correct answer must NEVER be the same word as the question.
- The correct answer must not repeat exact wording from the question stem.
- Wrong answers must be plausible and related to the topic.
- Questions should require thinking, not just reading.
- For Arabic language: test grammar rules, literary devices, and comprehension.
- For Geography: test locations, climate, population, and economic geography.
- For Islamic Studies: test Quran, Hadith, Fiqh, and Islamic history.

Return JSON with this exact structure:
{
  "questions": [
    {
      "content": "نص السؤال هنا",
      "explanation": "شرح مفصل للإجابة الصحيحة",
      "options": [
        { "content": "الخيار الأول", "is_correct": false },
        { "content": "الخيار الثاني", "is_correct": true },
        { "content": "الخيار الثالث", "is_correct": false },
        { "content": "الخيار الرابع", "is_correct": false }
      ]
    }
  ]
}

Rules:
- Each question must have exactly 4 options.
- Exactly one option must be correct.
- Questions must be appropriate for the difficulty level.
- Explanations should be educational and detailed.
- All text must be in Arabic.`;
}