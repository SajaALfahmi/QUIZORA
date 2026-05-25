import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ===== AUTH =====
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

    // ===== REQUEST BODY =====
    const {
      skill_id,
      course_id,
      difficulty = "medium",
      count = 10,
    } = await req.json();

    // ===== VALIDATION =====
    if (!skill_id || !course_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing skill_id or course_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ===== GET SKILL + COURSE =====
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

    const topic = skill?.name || "القدرات";
    const subCategory = course?.sub_category || "verbal";

    // ===== CATEGORY MAP =====
    const categoryMap: Record<string, string> = {
      verbal: "اختبار القدرات العامة - القسم اللفظي",
      quantitative: "اختبار القدرات العامة - القسم الكمي",
    };

    // ===== DIFFICULTY MAP =====
    const difficultyMap: Record<string, string> = {
      easy: "سهل",
      medium: "متوسط",
      hard: "صعب",
    };

    // ===== EXISTING QUESTIONS =====
    const { data: existingQuestions } = await supabase
      .from("questions")
      .select("content")
      .eq("course_id", course_id)
      .limit(50);

    const existingContents = (existingQuestions || [])
      .map((q: any) => q.content)
      .join("\n")
      .slice(0, 2000);

    // ===== OPENAI REQUEST =====
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
          temperature: 0.4,
          response_format: { type: "json_object" },

          messages: [
            {
              role: "system",
              content: `
أنت خبير سعودي متخصص في إنشاء أسئلة اختبار القدرات العامة (قياس).

مهم جداً:
- أجب بصيغة JSON فقط
- لا تستخدم markdown
- لا تستخدم \`\`\`
- لا تضف أي نص خارج JSON
- لا تكرر الخيارات
- لا تجعل الإجابة الصحيحة مكررة
- يجب أن تكون جميع الخيارات مختلفة
- لا تستخدم أسئلة ضعيفة أو غبية
- لا تجعل الإجابة هي نفسها نص السؤال
- لا تغير أسماء الحقول

الصيغة المطلوبة:

{
  "questions": [
    {
      "content": "نص السؤال",
      "explanation": "شرح تعليمي واضح",
      "options": [
        {
          "content": "الخيار الأول",
          "is_correct": false
        },
        {
          "content": "الخيار الثاني",
          "is_correct": true
        },
        {
          "content": "الخيار الثالث",
          "is_correct": false
        },
        {
          "content": "الخيار الرابع",
          "is_correct": false
        }
      ]
    }
  ]
}
              `,
            },

            {
              role: "user",
              content: `
قم بتوليد ${count} سؤال جديد وفريد.

القسم:
${categoryMap[subCategory] || "اختبار القدرات"}

الموضوع:
${topic}

الصعوبة:
${difficultyMap[difficulty] || "متوسط"}

الأسئلة السابقة:
${existingContents || "لا يوجد"}

المتطلبات:
- أسئلة جديدة وغير مكررة
- 4 خيارات مختلفة
- إجابة صحيحة واحدة فقط
- شرح تعليمي واضح
- باللغة العربية الفصحى
- مستوى يشبه اختبار قياس الحقيقي
              `,
            },
          ],
        }),
      }
    );

    // ===== OPENAI ERROR =====
    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();

      console.error("OPENAI ERROR:", errorText);

      throw new Error("Failed to generate questions");
    }

    // ===== OPENAI DATA =====
    const openAiData = await openAiResponse.json();

    console.log(
      "FULL OPENAI RESPONSE:",
      JSON.stringify(openAiData, null, 2)
    );

    const aiContent =
      openAiData?.choices?.[0]?.message?.content;

    console.log("RAW AI CONTENT:", aiContent);

    if (!aiContent) {
      throw new Error("No AI content returned");
    }

    // ===== CLEAN + PARSE JSON =====
    let parsed: any;

    try {
      const cleanContent = aiContent
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      console.log("CLEAN CONTENT:", cleanContent);

      parsed = JSON.parse(cleanContent);

      console.log("PARSED JSON:", parsed);

    } catch (parseError) {
      console.error("JSON PARSE ERROR:", parseError);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid AI JSON response",
          rawContent: aiContent,
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

    // ===== QUESTIONS =====
    const generatedQuestions = parsed.questions || [];

    console.log("GENERATED QUESTIONS:", generatedQuestions);

    if (!generatedQuestions.length) {
      throw new Error("No questions generated");
    }

    // ===== SAVE TO DATABASE =====
    const insertedQuestions = [];

    for (const q of generatedQuestions) {

      // ===== BASIC VALIDATION =====
      if (
        !q.content ||
        !Array.isArray(q.options) ||
        q.options.length !== 4
      ) {
        console.log("INVALID QUESTION:", q);
        continue;
      }

      // ===== CLEAN OPTIONS =====
      const cleanedOptions = q.options.map((opt: any) => ({
        content: String(opt.content || "").trim(),
        is_correct: Boolean(opt.is_correct),
      }));

      // ===== REMOVE EMPTY =====
      const validOptions = cleanedOptions.filter(
        (opt: any) => opt.content.length > 0
      );

      if (validOptions.length !== 4) {
        console.log("INVALID OPTIONS LENGTH:", q);
        continue;
      }

      // ===== UNIQUE OPTIONS =====
      const uniqueTexts = new Set(
        validOptions.map((opt: any) =>
          opt.content.toLowerCase()
        )
      );

      if (uniqueTexts.size !== 4) {
        console.log("DUPLICATED OPTIONS SKIPPED:", q);
        continue;
      }

      // ===== ONE CORRECT ANSWER =====
      const correctCount = validOptions.filter(
        (o: any) => o.is_correct
      ).length;

      if (correctCount !== 1) {
        console.log("INVALID CORRECT ANSWERS:", q);
        continue;
      }

      // ===== QUESTION TOO SHORT =====
      if (q.content.trim().length < 10) {
        console.log("QUESTION TOO SHORT:", q);
        continue;
      }

      // ===== DUPLICATE QUESTION =====
      const { data: duplicate } = await supabase
        .from("questions")
        .select("id")
        .eq("course_id", course_id)
        .eq("content", q.content.trim())
        .maybeSingle();

      if (duplicate) {
        console.log("DUPLICATE QUESTION SKIPPED");
        continue;
      }

      // ===== INSERT QUESTION =====
      const { data: inserted, error: insertError } =
        await supabase
          .from("questions")
          .insert({
            skill_id,
            course_id,
            content: q.content.trim(),
            explanation: q.explanation || "",
            difficulty,
            is_ai_generated: true,
          })
          .select()
          .single();

      if (insertError || !inserted) {
        console.error("QUESTION INSERT ERROR:", insertError);
        continue;
      }

      // ===== INSERT OPTIONS =====
      const options = validOptions.map(
        (opt: any, idx: number) => ({
          question_id: inserted.id,
          content: opt.content,
          is_correct: opt.is_correct,
          order_index: idx,
        })
      );

      const { error: optionsError } = await supabase
        .from("answer_options")
        .insert(options);

      if (optionsError) {
        console.error("OPTIONS INSERT ERROR:", optionsError);
        continue;
      }

      insertedQuestions.push(inserted);
    }

    // ===== SUCCESS =====
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
    console.error("FUNCTION ERROR:", error);

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


    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const body = await req.json();

    const {
      skill_id,
      course_id,
      difficulty = "medium",
      count = 5,
      language = "ar",
    } = body;

    if (!skill_id || !course_id) {
      return new Response(
        JSON.stringify({
          error: "skill_id and course_id are required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // =========================
    // GET SKILL
    // =========================

    const { data: skill } = await supabase
      .from("skills")
      .select("*")
      .eq("id", skill_id)
      .single();

    // =========================
    // GET COURSE
    // =========================

    const { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("id", course_id)
      .single();

    if (!skill || !course) {
      return new Response(
        JSON.stringify({
          error: "Skill or course not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // =========================
    // OPENAI
    // =========================

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "OPENAI_API_KEY missing",
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

    const prompt = buildQuestionPrompt(
      course,
      skill,
      difficulty,
      count,
      language
    );

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: Bearer ${apiKey},
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                language === "ar"
                  ? "أنت خبير في إنشاء أسئلة تعليمية عالية الجودة. أعد فقط JSON صالح بدون markdown."
                  : "You are an expert educational question generator. Return valid JSON only without markdown.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: {
            type: "json_object",
          },
          temperature: 0.8,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();

      return new Response(
        JSON.stringify({
          error: "OpenAI request failed",
          details: errorText,
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

    const aiData = await aiResponse.json();

    const parsed = JSON.parse(
      aiData.choices[0].message.content
    );

    const generatedQuestions = parsed.questions || [];

    const savedQuestions = [];

    for (const q of generatedQuestions) {
      const { data: savedQuestion, error: questionError } =
        await supabase
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

      if (questionError || !savedQuestion) {
        continue;
      }

      const options = (q.options || []).map(
        (option: any, index: number) => ({
          question_id: savedQuestion.id,
          content: option.content,
          is_correct: option.is_correct,
          order_index: index,
        })
      );

      await supabase
        .from("answer_options")
        .insert(options);

      const { data: savedOptions } = await supabase
        .from("answer_options")
        .select("*")
        .eq("question_id", savedQuestion.id);

      savedQuestions.push({
        ...savedQuestion,
        answer_options: savedOptions,
      });
    }

    return new Response(
      JSON.stringify({
        questions: savedQuestions,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message,
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

function buildQuestionPrompt(
  course: any,
  skill: any,
  difficulty: string,
  count: number,
  language: string
) {
  if (language === "ar") {
    return `
أنشئ ${count} أسئلة اختيار من متعدد باللغة العربية.

المادة: ${course.title}
المهارة: ${skill.name}
الصعوبة: ${difficulty}

الشروط:
- 4 خيارات لكل سؤال
- خيار واحد صحيح فقط
- أضف شرح للإجابة
- الأسئلة تكون ذكية وليست حفظ فقط

أعد JSON بهذا الشكل فقط:

{
  "questions": [
    {
      "content": "السؤال",
      "explanation": "الشرح",
      "options": [
        {
          "content": "خيار",
          "is_correct": true
        }
      ]
    }
  ]
}
`;
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
- Questions should test understanding

Return JSON only in this format:

{
  "questions": [
    {
      "content": "Question",
      "explanation": "Explanation",
      "options": [
        {
          "content": "Option",
          "is_correct": true
        }
      ]
    }
  ]
}
`;
}
