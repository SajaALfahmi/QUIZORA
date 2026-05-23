<<<<<<< Updated upstream
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
=======
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
>>>>>>> Stashed changes

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
<<<<<<< Updated upstream
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== REQUEST BODY =====
    const { skill_id, course_id, difficulty = "medium", count = 10 } = await req.json();

    // ===== GET SKILL + COURSE =====
    const { data: skill } = await supabase.from("skills").select("*").eq("id", skill_id).single();
    const { data: course } = await supabase.from("courses").select("*").eq("id", course_id).single();

    const topic = skill?.name || "General Topic";
    const subCategory = course?.sub_category || "general";
    const examType = course?.title || "General Exam";

    // ===== GET EXISTING QUESTIONS (to avoid duplicates) =====
    const { data: existingQuestions } = await supabase
      .from("questions")
      .select("content")
      .eq("course_id", course_id)
      .limit(100);

    const existingContents = (existingQuestions || [])
      .map((q: any) => q.content)
      .join("\n")
      .slice(0, 3000);

    // ===== OPENAI REQUEST =====
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
      easy: "سهل - أسئلة أساسية للمبتدئين",
      medium: "متوسط - أسئلة تتطلب فهماً جيداً",
      hard: "صعب - أسئلة متقدمة تتطلب تفكيراً عميقاً",
    };

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `أنت خبير في إعداد أسئلة الاختبارات السعودية القياسية (قدرات وتحصيلي).
قم بتوليد أسئلة فريدة ومتنوعة باللغة العربية.
أجب بـ JSON فقط بدون أي نص إضافي.

الصيغة المطلوبة:
{
  "questions": [
    {
      "content": "نص السؤال",
      "explanation": "شرح مفصل وتعليمي",
      "options": [
        { "content": "الخيار الأول", "is_correct": false },
        { "content": "الخيار الصحيح", "is_correct": true },
        { "content": "الخيار الثالث", "is_correct": false },
        { "content": "الخيار الرابع", "is_correct": false }
      ]
    }
  ]
}`,
          },
          {
            role: "user",
            content: `قم بتوليد ${count} سؤال جديد وفريد.

المادة: ${categoryMap[subCategory] || examType}
الموضوع: ${topic}
مستوى الصعوبة: ${difficultyMap[difficulty] || difficulty}

الأسئلة الموجودة مسبقاً (تجنب التكرار):
${existingContents || "لا توجد أسئلة مسبقة"}

متطلبات مهمة:
- ${count} أسئلة مختلفة وفريدة تماماً
- لا تكرر أي سؤال موجود
- 4 خيارات لكل سؤال
- إجابة صحيحة واحدة فقط
- باللغة العربية فقط
- الشرح تعليمي ومفيد ومفصل`,
          },
        ],
      }),
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      console.error("OpenAI API Error:", errorText);
      throw new Error("Failed to generate questions from OpenAI");
    }

    const openAiData = await openAiResponse.json();
    const aiContent = openAiData?.choices?.[0]?.message?.content;
    if (!aiContent) throw new Error("No content returned from AI");

    // ===== PARSE JSON =====
    let parsed: any;
    try {
      parsed = JSON.parse(aiContent);
    } catch {
      throw new Error("Invalid AI JSON response");
    }

    const generatedQuestions = parsed.questions || [];
    if (!generatedQuestions.length) throw new Error("No questions generated");

    // ===== SAVE TO DATABASE =====
    const insertedQuestions = [];

    for (const q of generatedQuestions) {
      if (!q.content || !q.options) continue;

      // Check for duplicates
      const { data: duplicate } = await supabase
        .from("questions")
        .select("id")
        .eq("course_id", course_id)
        .eq("content", q.content)
        .maybeSingle();

      if (duplicate) continue;

      // Insert question
      const { data: inserted, error: insertError } = await supabase
        .from("questions")
        .insert({
          skill_id,
          course_id,
          content: q.content,
          explanation: q.explanation || "",
          difficulty,
          is_ai_generated: true,
        })
        .select()
        .single();

      if (insertError || !inserted) {
        console.error("Insert Error:", insertError);
        continue;
      }

      // Insert answer options
      const options = (q.options || []).map((opt: any, idx: number) => ({
        question_id: inserted.id,
        content: opt.content,
        is_correct: opt.is_correct,
        order_index: idx,
      }));

      const { error: optError } = await supabase.from("answer_options").insert(options);
      if (!optError) insertedQuestions.push(inserted);
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedQuestions.length,
        questions: insertedQuestions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Function Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
=======

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const body = await req.json();
    const { skill_id, course_id, difficulty = "medium", count = 5, language = "ar" } = body;

    if (!skill_id || !course_id) {
      return new Response(
        JSON.stringify({ error: "skill_id and course_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: skill } = await supabase.from("skills").select("*").eq("id", skill_id).single();
    const { data: course } = await supabase.from("courses").select("*").eq("id", course_id).single();

    if (!skill || !course) {
      return new Response(
        JSON.stringify({ error: "Skill or course not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = buildQuestionPrompt(course, skill, difficulty, count, language);

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
            content: language === "ar"
              ? "أنت خبير في إنشاء أسئلة تعليمية عالية الجودة. أعد فقط JSON صالح بدون markdown."
              : "You are an expert educational question generator. Return valid JSON only without markdown.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return new Response(
        JSON.stringify({ error: "OpenAI request failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const parsed = JSON.parse(aiData.choices[0].message.content);
    const generatedQuestions = parsed.questions || [];
    const savedQuestions = [];

    for (const q of generatedQuestions) {
      const { data: savedQuestion, error: questionError } = await supabase
        .from("questions")
        .insert({
          skill_id,
          course_id,
          content: q.content,
          explanation: q.explanation,
          difficulty,
          is_ai_generated: true,
        })
        .select()
        .single();

      if (questionError || !savedQuestion) continue;

      const options = (q.options || []).map((option: any, index: number) => ({
        question_id: savedQuestion.id,
        content: option.content,
        is_correct: option.is_correct,
        order_index: index,
      }));

      await supabase.from("answer_options").insert(options);

      const { data: savedOptions } = await supabase
        .from("answer_options")
        .select("*")
        .eq("question_id", savedQuestion.id);

      savedQuestions.push({ ...savedQuestion, answer_options: savedOptions });
    }

    return new Response(
      JSON.stringify({ questions: savedQuestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildQuestionPrompt(course: any, skill: any, difficulty: string, count: number, language: string) {
  if (language === "ar") {
    return `
أنشئ ${count} أسئلة اختيار من متعدد باللغة العربية، تماماً بنفس نمط اختبار القدرات السعودي.

المادة: ${course.title}
المهارة: ${skill.name}
الصعوبة: ${difficulty}

أمثلة على أسئلة حقيقية من اختبار القدرات الكمي السعودي (ولّد أسئلة بنفس نمطها):
- وزعت 64 طابعة و48 حاسبة على غرف متساوية، ما أكبر عدد في كل غرفة؟
- تحرك شخص 60م شرقاً ثم 120م جنوباً ثم 30م شرقاً، ما المسافة بين البداية والنهاية؟
- إذا كان س³=343 ما قيمة س؟
- قطار يقطع 360كم في 240 دقيقة، ما سرعته؟
- اشترى خالد 12 قلم و8 دفاتر، كم حزمة دفاتر يشتري ليتساوى العدد؟
- إذا كان سعر فستان + 500 = 5 أمثاله - 900، ما سعر الفستان؟
- كم كلمة يمكن تكوينها من حروف كلمة (خالد)؟

أمثلة على أسئلة حقيقية من اختبار القدرات اللفظي السعودي (ولّد أسئلة بنفس نمطها):
- قلم:كتابة = مقص:___ (تناظر لفظي)
- كتاب:مكتبة = دواء:___ (تناظر لفظي)
- ما الكلمة الشاذة: طبيب، مهندس، معلم، مريض
- أكمل المتتالية: 2، 4، 8، 16، ___
- ما مرادف كلمة فصيح؟
- أي الجمل صحيحة نحوياً؟

الشروط:
- 4 خيارات لكل سؤال
- خيار واحد صحيح فقط
- أضف شرحاً مختصراً للإجابة
- الأسئلة تقيس الفهم وليس الحفظ فقط
- الإجابة الصحيحة يجب أن لا تكون نفس كلمة السؤال

أعد JSON صالحاً فقط بهذا الشكل:
{
  "questions": [
    {
      "content": "السؤال",
      "explanation": "الشرح",
      "options": [
        { "content": "خيار", "is_correct": false },
        { "content": "الخيار الصحيح", "is_correct": true },
        { "content": "خيار", "is_correct": false },
        { "content": "خيار", "is_correct": false }
      ]
    }
  ]
}`;
  }

  return `
Generate ${count} multiple choice questions in English.
Subject: ${course.title}
Skill: ${skill.name}
Difficulty: ${difficulty}

Requirements:
- 4 options per question
- Exactly one correct answer
- Include explanation
- Questions should test understanding, not memorization

Return JSON only:
{
  "questions": [
    {
      "content": "Question",
      "explanation": "Explanation",
      "options": [
        { "content": "Option", "is_correct": false },
        { "content": "Correct option", "is_correct": true },
        { "content": "Option", "is_correct": false },
        { "content": "Option", "is_correct": false }
      ]
    }
  ]
}`;
}