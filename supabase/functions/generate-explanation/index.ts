import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Single, explicit place where an invalid/missing language value is resolved.
// Any fallback here is logged, never silent, so a dropped/omitted language
// argument upstream is visible instead of quietly behaving like "en".
function normalizeLanguage(value: unknown): "ar" | "en" {
  if (value === "ar" || value === "en") return value;
  console.warn(`generate-explanation: unexpected language value "${value}" - falling back to "en"`);
  return "en";
}

// Lightweight language sniff for a *cached* explanation. Only decides
// whether to trust the cache - never used to pick prompt output.
//
// Classifies by which language's letters clearly DOMINATE, rather than
// requiring zero presence of the other language. This tolerates a limited,
// legitimate amount of opposite-language quotation (e.g. an English
// explanation of an Arabic vocabulary word necessarily quotes that word)
// while still rejecting a cached explanation that is substantively in the
// wrong language. Calibrated against real generated explanations: genuine
// quotation stayed under ~4% of the dominant language's character count in
// every observed case, while a wrong-language explanation is dominant in
// the opposite direction - so a 20% tolerance leaves wide margin on both
// sides without just checking "some content is present".
function looksLikeLanguage(text: string, lang: "ar" | "en"): boolean {
  const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const englishCount = (text.match(/[A-Za-z]/g) || []).length;
  const QUOTE_TOLERANCE = 0.2;
  if (lang === "ar") {
    return arabicCount > 0 && englishCount <= arabicCount * QUOTE_TOLERANCE;
  }
  return englishCount > 0 && arabicCount <= englishCount * QUOTE_TOLERANCE;
}

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
      language: requestedLanguage,
    } = await req.json();

    if (!question_id) {
      throw new Error("question_id is required");
    }

    const language = normalizeLanguage(requestedLanguage);

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

    if (question.explanation && !forceRegenerate && looksLikeLanguage(question.explanation, language)) {
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
Always respond ${language === "ar" ? "in Arabic" : "in English"}, regardless of the language the question itself is written in.
`,
            },
            {
              role: "user",
              content: `
Question:
${question.content}

Correct Answer:
${question.correct_answer}

Generate a detailed explanation in ${language === "ar" ? "Arabic" : "English"}.
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