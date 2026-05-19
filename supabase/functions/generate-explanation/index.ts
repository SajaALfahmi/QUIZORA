import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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

    // =========================
    // REQUEST BODY
    // =========================

    const {
      question_id,
      forceRegenerate = false,
    } = await req.json();

    if (!question_id) {
      throw new Error("question_id is required");
    }

    // =========================
    // GET QUESTION
    // =========================

    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("*")
      .eq("id", question_id)
      .single();

    if (questionError || !question) {
      throw new Error("Question not found");
    }

    // =========================
    // RETURN EXISTING EXPLANATION
    // =========================

    if (question.explanation && !forceRegenerate) {
      return new Response(
        JSON.stringify({
          success: true,
          explanation: question.explanation,
          regenerated: false,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // =========================
    // OPENAI REQUEST
    // =========================

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
          temperature: 0.8,
          messages: [
            {
              role: "system",
              content: `
You are an expert AI tutor.

Generate clear and adaptive explanations.
Make every explanation unique.
Avoid repetitive wording.
Adjust the explanation style based on question difficulty.
`,
            },
            {
              role: "user",
              content: `
Question:
${question.content}

Correct Answer:
${question.correct_answer}

Generate a detailed explanation in ${question.language}.
`,
            },
          ],
        }),
      }
    );

    const openAiData = await openAiResponse.json();

    const explanation =
      openAiData?.choices?.[0]?.message?.content;

    if (!explanation) {
      console.error(openAiData);

      throw new Error("No explanation returned from AI");
    }

    // =========================
    // SAVE EXPLANATION
    // =========================

    const { error: updateError } = await supabase
      .from("questions")
      .update({
        explanation,
      })
      .eq("id", question_id);

    if (updateError) {
      console.error(updateError);
    }

    // =========================
    // FINAL RESPONSE
    // =========================

    return new Response(
      JSON.stringify({
        success: true,
        explanation,
        regenerated: true,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Generate Explanation Error:", error);

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