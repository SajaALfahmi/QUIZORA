import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-action",
};

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 10;
    const offset = body.offset || 0;

    // جلب الأسئلة مع إجاباتها
    const { data: questions, error: fetchError } = await supabase
      .from("questions")
      .select(`
        id,
        content,
        explanation,
        difficulty,
        course_id,
        skill_id,
        answer_options (
          id,
          content,
          is_correct,
          order_index
        )
      `)
      .range(offset, offset + batchSize - 1)
      .order("created_at", { ascending: true });

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!questions || questions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No more questions to review", reviewed: 0, finished: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // بناء prompt للمراجعة
    const questionsText = questions.map((q: any, idx: number) => {
      const options = (q.answer_options || [])
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((o: any) => `    - ${o.content} ${o.is_correct ? "[صحيحة]" : ""}`).join("\n");
      return `[${idx + 1}] ID: ${q.id}
السؤال: ${q.content}
الخيارات:
${options}
التصنيف الحالي: ${q.difficulty}
الشرح الحالي: ${q.explanation || "لا يوجد"}`;
    }).join("\n\n---\n\n");

    const prompt = `أنت خبير في الاختبارات السعودية القياسية (قدرات وتحصيلي). راجع الأسئلة التالية وقيّم كل سؤال:

${questionsText}

لكل سؤال، قيّم:
1. هل السؤال صحيح ومنطقي؟
2. هل الإجابة الصحيحة المحددة فعلاً صحيحة؟
3. ما هو التصنيف الصحيح للصعوبة (easy/medium/hard) بناءً على مستوى الاختبارات السعودية؟
4. اكتب شرحاً مفيداً وتعليمياً باللغة العربية

أجب بـ JSON فقط بالشكل التالي:
{
  "reviews": [
    {
      "id": "uuid السؤال",
      "is_valid": true,
      "correct_difficulty": "easy|medium|hard",
      "fixed_explanation": "الشرح المحسّن بالعربي",
      "issue": "وصف المشكلة إن وجدت أو null"
    }
  ]
}`;

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
            content: "أنت خبير تعليمي في الاختبارات السعودية. راجع الأسئلة بدقة وأجب بـ JSON فقط بدون أي نص إضافي أو markdown.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return new Response(JSON.stringify({ error: "AI review failed", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let reviews: any[] = [];
    try {
      const parsed = JSON.parse(aiData.choices[0].message.content);
      reviews = parsed.reviews || [];
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // تحديث الأسئلة في الداتابيس
    const updateResults = [];
    for (const review of reviews) {
      if (!review.id) continue;

      const { error: updateError } = await supabase
        .from("questions")
        .update({
          difficulty: review.correct_difficulty,
          explanation: review.fixed_explanation,
        })
        .eq("id", review.id);

      updateResults.push({
        id: review.id,
        updated: !updateError,
        difficulty_set: review.correct_difficulty,
        is_valid: review.is_valid,
        issue: review.issue,
        error: updateError?.message,
      });
    }

    const nextOffset = offset + batchSize;
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        reviewed: updateResults.length,
        results: updateResults,
        next_offset: nextOffset,
        finished: nextOffset >= (count || 0),
        total_questions: count,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});