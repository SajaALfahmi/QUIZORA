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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question_id, user_answer, correct_answer } = await req.json();

    if (!question_id) {
      return new Response(JSON.stringify({ error: "question_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get question details
    const { data: question } = await supabase
      .from("questions")
      .select("content, explanation, skill_id")
      .eq("id", question_id)
      .single();

    if (!question) {
      return new Response(JSON.stringify({ error: "Question not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If explanation already exists, return it
    if (question.explanation) {
      return new Response(JSON.stringify({ explanation: question.explanation }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get skill info for context
    const { data: skill } = await supabase
      .from("skills")
      .select("name")
      .eq("id", question.skill_id)
      .single();

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `اشرح الإجابة الصحيحة للسؤال التالي بالتفصيل باللغة العربية:

السؤال: ${question.content}
${user_answer ? `إجابة الطالب: ${user_answer}` : ""}
${correct_answer ? `الإجابة الصحيحة: ${correct_answer}` : ""}
${skill ? `المهارة: ${skill.name}` : ""}

قدم شرحاً تعليمياً مفصلاً يساعد الطالب على فهم المفهوم. اشرح لماذا الإجابة الصحيحة هي الصحيحة ولماذا الخيارات الأخرى خاطئة إذا أمكن.`;

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
            content: "أنت معلم خبير في الاختبارات السعودية (قدرات وتحصيلي). قدم شروحات تعليمية واضحة ومفصلة باللغة العربية.",
          },
          { role: "user", content: prompt },
        ],
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
    const explanation = aiData.choices[0].message.content;

    // Save explanation to the question
    await supabase
      .from("questions")
      .update({ explanation })
      .eq("id", question_id);

    return new Response(JSON.stringify({ explanation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});