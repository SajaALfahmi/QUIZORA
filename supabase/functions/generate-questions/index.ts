import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
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

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const prompt = buildQuestionPrompt(course, skill, difficulty, count, language);

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

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ error: "Failed to parse AI response as JSON", details: e?.message ?? String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const generatedQuestions = parsed.questions || [];
    const savedQuestions: any[] = [];

    for (const q of generatedQuestions) {
      const { data: savedQuestion, error: questionError } = await supabase
        .from("questions")
        .insert({ skill_id, course_id, content: q.content, explanation: q.explanation, difficulty, is_ai_generated: true })
        .select()
        .single();

      if (questionError || !savedQuestion) continue;

      const options = (q.options || []).map((option: any, index: number) => ({ question_id: savedQuestion.id, content: option.content, is_correct: option.is_correct, order_index: index }));
      await supabase.from("answer_options").insert(options);

      const { data: savedOptions } = await supabase.from("answer_options").select("*").eq("question_id", savedQuestion.id);
      savedQuestions.push({ ...savedQuestion, answer_options: savedOptions });
    }

    return new Response(JSON.stringify({ questions: savedQuestions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildQuestionPrompt(course: any, skill: any, difficulty: string, count: number, language: string) {
  if (language === "ar") {
    return `أنشئ ${count} أسئلة اختيار من متعدد باللغة العربية.

المادة: ${course.title}
المهارة: ${skill.name}
الصعوبة: ${difficulty}

الشروط:
- 4 خيارات لكل سؤال
- خيار واحد صحيح فقط
- أضف شرحاً مختصراً للإجابة
- أعد JSON صالحاً فقط بهذا الشكل:\n{ "questions": [ { "content": "...", "explanation": "...", "options": [ { "content": "...", "is_correct": false } ] } ] }`;
  }
  return `Generate ${count} multiple-choice questions for the course "${course.title}" about "${skill.name}" with difficulty ${difficulty}. Return valid JSON only.`;
}
