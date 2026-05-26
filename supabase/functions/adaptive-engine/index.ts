/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-action",
};

interface SubmitAnswerPayload {
  session_id: string;
  question_id: string;
  selected_option_id: string;
  time_spent_seconds: number;
}

interface StartSessionPayload {
  course_id: string;
  total_questions?: number;
  difficulty_mode?: "auto" | "easy" | "medium" | "hard";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized user" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const action = req.headers.get("x-action") || new URL(req.url).searchParams.get("action");

    if (action === "start-session") {
      return await handleStartSession(supabaseService, userId, await req.json());
    }

    if (action === "submit-answer") {
      return await handleSubmitAnswer(supabaseService, userId, await req.json());
    }

    if (action === "next-question") {
      const body = await req.json();
      return await handleNextQuestion(supabaseService, userId, body.session_id, body.difficulty_mode);
    }

    if (action === "end-session") {
      const body = await req.json();
      return await handleEndSession(supabaseService, userId, body.session_id);
    }

    if (action === "preload-questions") {
      const body = await req.json();
      const courseId = body.course_id;

      const { count } = await supabaseService
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("course_id", courseId);

      if (count && count > 0) {
        return new Response(
          JSON.stringify({ message: "Questions already exist", count }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await ensureCourseExists(supabaseService, courseId);
      const { data: course } = await supabaseService
        .from("courses").select("sub_category").eq("id", courseId).single();
      const { data: skill } = await supabaseService
        .from("skills").select("id").eq("course_id", courseId).single();

      if (course) {
        generateQuestionsForCourse(supabaseService, courseId, skill?.id, course.sub_category)
          .catch(console.error);
      }

      return new Response(
        JSON.stringify({ message: "Generation started in background" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─────────────────────────────────────────────
// ensureCourseExists
// ─────────────────────────────────────────────
async function ensureCourseExists(supabaseService: any, courseId: string) {
  const { data: existingCourse } = await supabaseService
    .from("courses").select("id, sub_category").eq("id", courseId).single();

  const courseExists = !!existingCourse;
  const courseData: Record<string, any> = {
    "455159fc-0c91-445e-a3b3-650d0727f1f7": { category: "qudurat", sub_category: "verbal", title: "Qudurat - Verbal", description: "Verbal reasoning and reading comprehension practice" },
    "954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f": { category: "qudurat", sub_category: "quantitative", title: "Qudurat - Quantitative", description: "Quantitative reasoning and mathematical problem solving" },
    "9127a8c4-1d22-4d29-a5e9-3530ded07534": { category: "tahseeli", sub_category: "mathematics", title: "Tahseeli - Mathematics", description: "High school mathematics curriculum preparation" },
    "c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf": { category: "tahseeli", sub_category: "physics", title: "Tahseeli - Physics", description: "High school physics curriculum preparation" },
    "7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9": { category: "tahseeli", sub_category: "chemistry", title: "Tahseeli - Chemistry", description: "High school chemistry curriculum preparation" },
    "f8f8a675-09ea-4179-b4f8-b32a2b232fbc": { category: "tahseeli", sub_category: "biology", title: "Tahseeli - Biology", description: "High school biology curriculum preparation" },
    "48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864": { category: "certifications", sub_category: "ccna", title: "CCNA", description: "Cisco Certified Network Associate certification prep" },
    "84c82536-ff63-4663-9fa4-7f3818f48e1b": { category: "certifications", sub_category: "security", title: "CompTIA Security+", description: "CompTIA Security+ certification preparation" },
    "28ce9f52-455c-431d-9e5a-caa107a97fa5": { category: "certifications", sub_category: "aws", title: "AWS Cloud Practitioner", description: "AWS Cloud Practitioner certification prep" },
    "304a9f8b-a018-4d8e-a0ff-9889e4b4b635": { category: "certifications", sub_category: "pmp", title: "PMP", description: "Project Management Professional certification preparation" },
  };

  const courseInfo = courseData[courseId];
  if (!courseInfo) return;

  const subCategory = courseExists ? existingCourse.sub_category : courseInfo.sub_category;

  if (!courseExists) {
    const { error } = await supabaseService.from("courses").insert({ id: courseId, ...courseInfo });
    if (error) { console.error("Error creating course:", error); return; }
  }

  let skillId: string | null = null;
  const { data: existingSkill } = await supabaseService
    .from("skills").select("id").eq("course_id", courseId).limit(1).single();

  if (existingSkill?.id) {
    skillId = existingSkill.id;
  } else {
    const { data: skill, error } = await supabaseService
      .from("skills")
      .insert({ course_id: courseId, name: `${subCategory} Fundamentals`, description: `Basic concepts in ${subCategory}`, order_index: 0 })
      .select().single();
    if (error || !skill) { console.error("Error creating skill:", error); return; }
    skillId = skill.id;
  }

  const { count } = await supabaseService
    .from("questions").select("id", { count: "exact", head: true }).eq("course_id", courseId);

  if ((count ?? 0) === 0) {
    await generateQuestionsForCourse(supabaseService, courseId, skillId, subCategory);
  }
}

// ─────────────────────────────────────────────
// generateQuestionsForCourse
// ─────────────────────────────────────────────
async function generateQuestionsForCourse(
  supabaseService: any,
  courseId: string,
  skillId: string,
  subCategory: string
) {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      await createCourseSampleQuestions(supabaseService, courseId, skillId, subCategory, 0);
      return;
    }

    // المرحلة الأولى: 5 أسئلة سهلة سريعة
    const quickPrompt = buildQuestionPrompt(subCategory, 5, "easy");
    const quickResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert question generator for Saudi standardized tests (Qiyas). Generate questions in Arabic. Always respond with valid JSON only, no markdown." },
          { role: "user", content: quickPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      }),
    });

    let totalGenerated = 0;

    if (quickResponse.ok) {
      const quickData = await quickResponse.json();
      let quickContent;
      try { quickContent = JSON.parse(quickData.choices[0].message.content); } catch { quickContent = null; }

      for (const q of quickContent?.questions || []) {
        const { data: question } = await supabaseService
          .from("questions")
          .insert({ skill_id: skillId, course_id: courseId, content: q.content, explanation: q.explanation, difficulty: "easy", is_ai_generated: true })
          .select().single();
        if (!question) continue;
        const options = (q.options || []).map((opt: any, idx: number) => ({
          question_id: question.id, content: opt.content, is_correct: opt.is_correct, order_index: idx,
        }));
        await supabaseService.from("answer_options").insert(options);
        totalGenerated++;
      }
    }

    if (totalGenerated === 0) {
      await createCourseSampleQuestions(supabaseService, courseId, skillId, subCategory, 0);
      return;
    }

    // المرحلة الثانية: باقي الأسئلة في الخلفية
    const generateRest = async () => {
      for (const difficulty of ["easy", "medium", "hard"]) {
        try {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: "You are an expert question generator for Saudi standardized tests (Qiyas). Generate questions in Arabic. Always respond with valid JSON only, no markdown." },
                { role: "user", content: buildQuestionPrompt(subCategory, 10, difficulty) },
              ],
              response_format: { type: "json_object" },
              max_tokens: 4000,
            }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          let content;
          try { content = JSON.parse(data.choices[0].message.content); } catch { continue; }

          for (const q of content?.questions || []) {
            const { data: question } = await supabaseService
              .from("questions")
              .insert({ skill_id: skillId, course_id: courseId, content: q.content, explanation: q.explanation, difficulty, is_ai_generated: true })
              .select().single();
            if (!question) continue;
            const options = (q.options || []).map((opt: any, idx: number) => ({
              question_id: question.id, content: opt.content, is_correct: opt.is_correct, order_index: idx,
            }));
            await supabaseService.from("answer_options").insert(options);
          }
        } catch (e) { console.error(`Background error for ${difficulty}:`, e); }
      }
    };

    generateRest().catch(console.error);

  } catch (error) {
    await createCourseSampleQuestions(supabaseService, courseId, skillId, subCategory, 0);
  }
}

// ─────────────────────────────────────────────
// buildQuestionPrompt
// ─────────────────────────────────────────────
function buildQuestionPrompt(subCategory: string, count: number, difficulty: string): string {
  const categoryMap: Record<string, string> = {
    verbal: "اختبار القدرات العامة - الجزء اللفظي",
    quantitative: "اختبار القدرات العامة - الجزء الكمي",
    mathematics: "الرياضيات - الثانوية العامة",
    physics: "الفيزياء - الثانوية العامة",
    chemistry: "الكيمياء - الثانوية العامة",
    biology: "الأحياء - الثانوية العامة",
    ccna: "CCNA - شهادة تقنية",
    security: "CompTIA Security+ - شهادة تقنية",
    aws: "AWS Cloud Practitioner - شهادة سحابية",
    pmp: "PMP - إدارة المشاريع",
  };

  const difficultyGuide: Record<string, Record<string, string>> = {
    verbal: {
      easy: `مستوى سهل - قياس لفظي:\n- أسئلة المترادفات المباشرة\n- أسئلة المتضادات البسيطة\n- إكمال الجملة بكلمة واحدة واضحة`,
      medium: `مستوى متوسط - قياس لفظي:\n- أسئلة التناسب اللفظي (أ:ب كما ج:؟)\n- فهم المقروء بفقرات قصيرة\n- اكتشاف الكلمة الشاذة في مجموعة`,
      hard: `مستوى صعب - قياس لفظي:\n- فهم نصوص أكاديمية معقدة\n- التناسب اللفظي المركب\n- تحليل أسلوب الكاتب والاستنتاج الضمني`,
    },
    quantitative: {
      easy: `مستوى سهل - قياس كمي:\n- العمليات الحسابية الأساسية\n- النسب المئوية البسيطة\n- معادلات خطية بسيطة`,
      medium: `مستوى متوسط - قياس كمي:\n- مسائل النسبة والتناسب\n- التسلسلات العددية\n- الهندسة الأساسية`,
      hard: `مستوى صعب - قياس كمي:\n- مسائل متعددة الخطوات\n- التحليل الإحصائي\n- المسائل الهندسية المركبة`,
    },
    mathematics: {
      easy: `مستوى سهل - رياضيات تحصيلي:\n- العمليات على الأعداد الحقيقية\n- حل المعادلات الخطية البسيطة`,
      medium: `مستوى متوسط - رياضيات تحصيلي:\n- الدوال والعلاقات\n- المتباينات والحل الجبري`,
      hard: `مستوى صعب - رياضيات تحصيلي:\n- حساب التفاضل والتكامل\n- المصفوفات والمحددات`,
    },
    physics: {
      easy: `مستوى سهل - فيزياء: قوانين نيوتن الأساسية، وحدات القياس، الحركة المستقيمة`,
      medium: `مستوى متوسط - فيزياء: الطاقة والشغل والقدرة، الكهرباء الساكنة`,
      hard: `مستوى صعب - فيزياء: مسائل متعددة الخطوات تجمع قوانين مختلفة`,
    },
    chemistry: {
      easy: `مستوى سهل - كيمياء: الجدول الدوري، الروابط الكيميائية الأساسية`,
      medium: `مستوى متوسط - كيمياء: الحسابات الكيميائية، التفاعلات وأنواعها`,
      hard: `مستوى صعب - كيمياء: الكيمياء العضوية، التوازن الكيميائي`,
    },
    biology: {
      easy: `مستوى سهل - أحياء: الخلية ومكوناتها، التصنيف`,
      medium: `مستوى متوسط - أحياء: الأيض وعملياته، قوانين مندل`,
      hard: `مستوى صعب - أحياء: البيولوجيا الجزيئية، الهندسة الوراثية`,
    },
    ccna: {
      easy: `مستوى سهل - CCNA: نماذج OSI/TCP-IP، عناوين IP الأساسية`,
      medium: `مستوى متوسط - CCNA: التوجيه والتبديل، VLAN`,
      hard: `مستوى صعب - CCNA: سيناريوهات استكشاف الأخطاء، الأمن والـ ACL`,
    },
    security: {
      easy: `مستوى سهل - Security+: أنواع الهجمات الشائعة، مفاهيم التشفير الأساسية`,
      medium: `مستوى متوسط - Security+: بروتوكولات الأمان، إدارة الهوية والوصول`,
      hard: `مستوى صعب - Security+: سيناريوهات الاستجابة للحوادث، تحليل المخاطر`,
    },
    aws: {
      easy: `مستوى سهل - AWS CCP: الخدمات الأساسية (EC2/S3/RDS)، نماذج السحابة`,
      medium: `مستوى متوسط - AWS CCP: نموذج المسؤولية المشتركة، IAM`,
      hard: `مستوى صعب - AWS CCP: Well-Architected Framework، الامتثال والأمان`,
    },
    pmp: {
      easy: `مستوى سهل - PMP: مجموعات العمليات الخمس، مناطق المعرفة العشر`,
      medium: `مستوى متوسط - PMP: إدارة المخاطر والجودة، مؤشرات الأداء`,
      hard: `مستوى صعب - PMP: سيناريوهات معقدة، تحليل القيمة المكتسبة المتقدم`,
    },
  };

  const guide = difficultyGuide[subCategory]?.[difficulty] ||
    `مستوى ${difficulty} لاختبار ${categoryMap[subCategory] || subCategory}`;

  return `أنت خبير في إعداد اختبارات قياس وتقييم الطلاب السعوديين. مهمتك توليد ${count} سؤال اختيار من متعدد باللغة العربية.

**المادة:** ${categoryMap[subCategory] || subCategory}
**إرشادات المستوى:**
${guide}

**قواعد صياغة الأسئلة:**
- اكتب الأسئلة بأسلوب اختبار قياس الرسمي السعودي
- يجب أن تقيس الأسئلة التفكير والفهم العميق، وليس الحفظ فقط
- الخيارات يجب أن تكون متقاربة ومعقولة (لا خيارات واضحة الخطأ)
- لكل سؤال شرح تعليمي مفيد

**البنية المطلوبة (JSON فقط):**
{
  "questions": [
    {
      "content": "نص السؤال",
      "explanation": "شرح تعليمي مفصل",
      "options": [
        { "content": "الخيار أ", "is_correct": false },
        { "content": "الخيار ب", "is_correct": true },
        { "content": "الخيار ج", "is_correct": false },
        { "content": "الخيار د", "is_correct": false }
      ]
    }
  ]
}

**متطلبات إلزامية:**
- بالضبط ${count} سؤال مختلف ومتنوع
- كل سؤال له 4 خيارات وإجابة صحيحة واحدة فقط
- جميع الأسئلة باللغة العربية الفصحى`;
}

// ─────────────────────────────────────────────
// createCourseSampleQuestions (fallback)
// ─────────────────────────────────────────────
async function createCourseSampleQuestions(
  supabaseService: any, courseId: string, skillId: string, subCategory: string, startIndex = 0
) {
  const questions = generateSampleQuestions(subCategory).slice(startIndex, 25);
  for (const q of questions) {
    const { data: question, error } = await supabaseService
      .from("questions")
      .insert({ skill_id: skillId, course_id: courseId, content: q.content, explanation: q.explanation, difficulty: q.difficulty || "easy", is_ai_generated: false })
      .select().single();
    if (error || !question) continue;
    const options = q.options.map((opt: any, idx: number) => ({
      question_id: question.id, content: opt.content, is_correct: opt.is_correct, order_index: idx,
    }));
    await supabaseService.from("answer_options").insert(options);
  }
}

function generateSampleQuestions(subCategory: string) {
  const questions: Array<{ content: string; explanation: string; difficulty: string; options: any[] }> = [];
  if (subCategory === "verbal") {
    const words = [
      { word: "مثابرة", answer: "الإصرار" }, { word: "ابتكار", answer: "الإبداع" },
      { word: "تركيز", answer: "الانتباه" }, { word: "تقليل", answer: "خفض" },
      { word: "سريع", answer: "عاجل" }, { word: "مضاد", answer: "عكس" },
      { word: "صديق", answer: "زميل" }, { word: "منع", answer: "حظر" },
      { word: "تفوق", answer: "نجاح" }, { word: "تعاون", answer: "شراكة" },
      { word: "اعتذار", answer: "أسف" }, { word: "سعادة", answer: "فرح" },
      { word: "حكمة", answer: "عقل" }, { word: "حب", answer: "مودة" },
      { word: "قوة", answer: "طاقة" }, { word: "خسارة", answer: "فقدان" },
      { word: "شجاعة", answer: "جرأة" }, { word: "طموح", answer: "أمل" },
      { word: "هدوء", answer: "سكينة" }, { word: "تحدي", answer: "اختبار" },
      { word: "دقة", answer: "اتقان" }, { word: "فهم", answer: "إدراك" },
      { word: "رحمة", answer: "عطف" }, { word: "قيمة", answer: "أهمية" },
      { word: "ذاكرة", answer: "حفظ" },
    ];
    words.forEach((item, index) => {
      questions.push({
        content: `اختر المعنى الأقرب لكلمة '${item.word}':`,
        explanation: `الكلمة '${item.word}' تعني '${item.answer}'.`,
        difficulty: index < 10 ? "easy" : index < 18 ? "medium" : "hard",
        options: [
          { content: item.answer, is_correct: true },
          { content: "عكسها", is_correct: false },
          { content: "شبهها", is_correct: false },
          { content: "لا علاقة", is_correct: false },
        ],
      });
    });
  } else {
    for (let i = 1; i <= 25; i++) {
      questions.push({
        content: `سؤال رقم ${i} في مادة ${subCategory}.`,
        explanation: "هذا سؤال تجريبي.",
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: "الخيار الأول", is_correct: true },
          { content: "الخيار الثاني", is_correct: false },
          { content: "الخيار الثالث", is_correct: false },
          { content: "الخيار الرابع", is_correct: false },
        ],
      });
    }
  }
  return questions;
}

// ─────────────────────────────────────────────
// handleStartSession
// ─────────────────────────────────────────────
async function handleStartSession(supabaseService: any, userId: string, payload: StartSessionPayload) {
  const { course_id, total_questions, difficulty_mode = "auto" } = payload;
  await ensureCourseExists(supabaseService, course_id);

  const { data: session, error } = await supabaseService
    .from("learning_sessions")
    .insert({ user_id: userId, course_id, status: "active", total_questions: total_questions ?? 25, next_action: "advance" })
    .select().single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ session, difficulty_mode, current_difficulty: difficulty_mode === "auto" ? "easy" : difficulty_mode }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─────────────────────────────────────────────
// handleSubmitAnswer
// ─────────────────────────────────────────────
async function handleSubmitAnswer(supabaseService: any, userId: string, payload: SubmitAnswerPayload) {
  const { session_id, question_id, selected_option_id, time_spent_seconds } = payload;

  const { data: option } = await supabaseService
    .from("answer_options").select("is_correct").eq("id", selected_option_id).single();

  const isCorrect = option?.is_correct ?? false;

  const { error } = await supabaseService
    .from("user_answers")
    .insert({ user_id: userId, session_id, question_id, selected_option_id, is_correct: isCorrect, time_spent_seconds });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: questionData } = await supabaseService
    .from("questions").select("explanation").eq("id", question_id).single();

  return new Response(
    JSON.stringify({ success: true, is_correct: isCorrect, explanation: questionData?.explanation || null }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─────────────────────────────────────────────
// determineAdaptiveDifficulty
// ─────────────────────────────────────────────
function determineAdaptiveDifficulty(
  recentAnswers: { is_correct: boolean }[],
  currentDifficulty: string,
  difficultyMode: string
): string {
  if (difficultyMode !== "auto") return difficultyMode;
  if (recentAnswers.length === 0) return "easy";

  const lastAnswer = recentAnswers[recentAnswers.length - 1];

  if (recentAnswers.length === 1) {
    return lastAnswer.is_correct ? "medium" : "easy";
  }

  const last2 = recentAnswers.slice(-2);
  const correctInLast2 = last2.filter((a) => a.is_correct).length;

  if (correctInLast2 === 2) {
    if (currentDifficulty === "easy") return "medium";
    if (currentDifficulty === "medium") return "hard";
    return "hard";
  }

  if (correctInLast2 === 0) {
    if (currentDifficulty === "hard") return "medium";
    if (currentDifficulty === "medium") return "easy";
    return "easy";
  }

  return currentDifficulty;
}

// ─────────────────────────────────────────────
// handleNextQuestion
// ─────────────────────────────────────────────
async function handleNextQuestion(
  supabaseService: any, userId: string, sessionId: string, difficultyModeOverride?: string
) {
  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: "session_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: session, error: sessionError } = await supabaseService
    .from("learning_sessions").select("id, course_id, total_questions").eq("id", sessionId).single();

  if (sessionError || !session) {
    return new Response(
      JSON.stringify({ error: sessionError?.message || "Session not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: sessionAnswers } = await supabaseService
    .from("user_answers")
    .select("question_id, is_correct, answered_at, questions(difficulty)")
    .eq("session_id", sessionId)
    .order("answered_at", { ascending: true });

  const answeredQuestions = sessionAnswers || [];
  const askedQuestionIds = answeredQuestions.map((row: any) => row.question_id);
  const answeredCount = askedQuestionIds.length;

  if (session.total_questions && answeredCount >= session.total_questions) {
    return new Response(
      JSON.stringify({ question: null, finished: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const difficultyMode = difficultyModeOverride || "auto";
  let currentDifficulty = "easy";
  if (answeredQuestions.length > 0) {
    const last = answeredQuestions[answeredQuestions.length - 1] as any;
    currentDifficulty = last.questions?.difficulty || "easy";
  }

  const targetDifficulty = determineAdaptiveDifficulty(answeredQuestions, currentDifficulty, difficultyMode);

  const excludeFilter = askedQuestionIds.length > 0
    ? `(${askedQuestionIds.map((id: string) => `"${id}"`).join(",")})`
    : null;

  const buildQuery = (diff: string) => {
    let q = supabaseService
      .from("questions")
      .select("id, content, explanation, difficulty, answer_options(id, content, is_correct, order_index)")
      .eq("course_id", session.course_id)
      .eq("difficulty", diff);
    if (excludeFilter) q = q.not("id", "in", excludeFilter);
    return q;
  };

  let { data: questions } = await buildQuery(targetDifficulty);

  if (!questions || questions.length === 0) {
    const fallbacks = targetDifficulty === "hard" ? ["medium", "easy"] :
      targetDifficulty === "easy" ? ["medium", "hard"] : ["easy", "hard"];
    for (const fallback of fallbacks) {
      const { data: fb } = await buildQuery(fallback);
      if (fb && fb.length > 0) { questions = fb; break; }
    }
  }

  if (!questions || questions.length === 0) {
    return new Response(
      JSON.stringify({ question: null, finished: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const nextQuestion = questions[Math.floor(Math.random() * questions.length)];

  return new Response(
    JSON.stringify({
      question: nextQuestion,
      finished: false,
      adaptive_info: {
        current_difficulty: nextQuestion.difficulty,
        target_difficulty: targetDifficulty,
        difficulty_mode: difficultyMode,
        questions_answered: answeredCount,
        recent_correct: answeredQuestions.slice(-3).filter((a: any) => a.is_correct).length,
        recent_total: Math.min(answeredQuestions.length, 3),
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─────────────────────────────────────────────
// handleEndSession
// ─────────────────────────────────────────────
async function handleEndSession(supabaseService: any, userId: string, sessionId: string) {
  const { data, error } = await supabaseService
    .from("learning_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select().single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ session: data }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}