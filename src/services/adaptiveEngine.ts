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
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("REQUEST RECEIVED");

    const authHeader = req.headers.get("Authorization");

    console.log("AUTH HEADER:", authHeader);

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized - Missing token",
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Create service role client for database writes (bypassing RLS)
    const supabaseService = createClient(
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log("USER:", user);
    console.log("USER ERROR:", userError);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized user",
          details: userError,
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

    const action =
      req.headers.get("x-action") ||
      new URL(req.url).searchParams.get("action");

    console.log("ACTION:", action);

    if (action === "start-session") {
      return await handleStartSession(
        supabaseService,
        userId,
        await req.json()
      );
    }

    if (action === "submit-answer") {
      return await handleSubmitAnswer(
        supabaseService,
        userId,
        await req.json()
      );
    }

    if (action === "next-question") {
      const body = await req.json();

      return await handleNextQuestion(
        supabaseService,
        userId,
        body.session_id
      );
    }

    if (action === "end-session") {
      const body = await req.json();

      return await handleEndSession(
        supabaseService,
        userId,
        body.session_id
      );
    }

    return new Response(
      JSON.stringify({
        error: "Invalid action",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("EDGE FUNCTION ERROR:", error);

    return new Response(
      JSON.stringify({
        error: error?.message || String(error),
        stack: error?.stack || null,
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

async function ensureCourseExists(supabaseService: any, courseId: string) {
  // Check if course exists
  const { data: existingCourse } = await supabaseService
    .from("courses")
    .select("id, sub_category")
    .eq("id", courseId)
    .single();

  const courseExists = !!existingCourse;
  const courseData: Record<string, any> = {
    "455159fc-0c91-445e-a3b3-650d0727f1f7": {
      category: "qudurat",
      sub_category: "verbal",
      title: "Qudurat - Verbal",
      description: "Verbal reasoning and reading comprehension practice",
    },
    "954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f": {
      category: "qudurat",
      sub_category: "quantitative",
      title: "Qudurat - Quantitative",
      description: "Quantitative reasoning and mathematical problem solving",
    },
    "9127a8c4-1d22-4d29-a5e9-3530ded07534": {
      category: "tahseeli",
      sub_category: "mathematics",
      title: "Tahseeli - Mathematics",
      description: "High school mathematics curriculum preparation",
    },
    "c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf": {
      category: "tahseeli",
      sub_category: "physics",
      title: "Tahseeli - Physics",
      description: "High school physics curriculum preparation",
    },
    "7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9": {
      category: "tahseeli",
      sub_category: "chemistry",
      title: "Tahseeli - Chemistry",
      description: "High school chemistry curriculum preparation",
    },
    "f8f8a675-09ea-4179-b4f8-b32a2b232fbc": {
      category: "tahseeli",
      sub_category: "biology",
      title: "Tahseeli - Biology",
      description: "High school biology curriculum preparation",
    },
    "48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864": {
      category: "certifications",
      sub_category: "ccna",
      title: "CCNA",
      description: "Cisco Certified Network Associate certification prep",
    },
    "84c82536-ff63-4663-9fa4-7f3818f48e1b": {
      category: "certifications",
      sub_category: "security",
      title: "CompTIA Security+",
      description: "CompTIA Security+ certification preparation",
    },
    "28ce9f52-455c-431d-9e5a-caa107a97fa5": {
      category: "certifications",
      sub_category: "aws",
      title: "AWS Cloud Practitioner",
      description: "AWS Cloud Practitioner certification prep",
    },
    "304a9f8b-a018-4d8e-a0ff-9889e4b4b635": {
      category: "certifications",
      sub_category: "pmp",
      title: "PMP",
      description: "Project Management Professional certification preparation",
    },
  };

  const courseInfo = courseData[courseId];
  if (!courseInfo) {
    console.log("Unknown course ID:", courseId);
    return;
  }

  let skillId: string | null = null;
  const subCategory = courseExists ? existingCourse.sub_category : courseInfo.sub_category;

  if (!courseExists) {
    console.log("Creating course:", courseId);

    const { data: course, error: courseError } = await supabaseService
      .from("courses")
      .insert({
        id: courseId,
        ...courseInfo,
      })
      .select()
      .single();

    if (courseError) {
      console.error("Error creating course:", courseError);
      return;
    }

    console.log("Created course:", course);
  }

  const { data: existingSkill } = await supabaseService
    .from("skills")
    .select("id")
    .eq("course_id", courseId)
    .limit(1)
    .single();

  if (existingSkill?.id) {
    skillId = existingSkill.id;
  } else {
    const { data: skill, error: skillError } = await supabaseService
      .from("skills")
      .insert({
        course_id: courseId,
        name: `${subCategory} Fundamentals`,
        description: `Basic concepts in ${subCategory}`,
        order_index: 0,
      })
      .select()
      .single();

    if (skillError || !skill) {
      console.error("Error creating skill:", skillError);
      return;
    }

    skillId = skill.id;
    console.log("Created skill:", skill);
  }

  const { count } = await supabaseService
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);

  const questionCount = typeof count === "number" ? count : 0;
  if (questionCount === 0) {
    console.log(`Generating 25 AI questions for course ${courseId}...`);
    await generateAIQuestions(supabaseService, courseId, skillId, subCategory);
  } else {
    console.log(`Course ${courseId} already has ${questionCount} questions.`);
  }
}

async function generateAIQuestions(
  supabaseService: any,
  courseId: string,
  skillId: string,
  subCategory: string
) {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OpenAI API key not configured. Using fallback.");
      await createCourseSampleQuestions(supabaseService, courseId, skillId, subCategory, 0);
      return;
    }

    console.log(`Generating 75 AI questions (25 per difficulty) for ${subCategory}...`);

    const difficulties = ["easy", "medium", "hard"];
    let totalGenerated = 0;

    for (const difficulty of difficulties) {
      const prompt = buildQuestionPrompt(subCategory, 25, difficulty);

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
              content: `You are an expert question generator for Saudi standardized tests. Generate questions in Arabic. Always respond with valid JSON only, no markdown.`,
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error(`AI generation failed for ${difficulty}:`, errText);
        continue;
      }

      const aiData = await aiResponse.json();
      let generatedContent;
      try {
        generatedContent = JSON.parse(aiData.choices[0].message.content);
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        continue;
      }

      for (const q of generatedContent.questions || []) {
        const { data: question, error: qError } = await supabaseService
          .from("questions")
          .insert({
            skill_id: skillId,
            course_id: courseId,
            content: q.content,
            explanation: q.explanation,
            difficulty: difficulty,
            is_ai_generated: true,
          })
          .select()
          .single();

        if (qError || !question) {
          console.error(`Error creating ${difficulty} question:`, qError);
          continue;
        }

        const options = (q.options || []).map((opt: any, idx: number) => ({
          question_id: question.id,
          content: opt.content,
          is_correct: opt.is_correct,
          order_index: idx,
        }));

        const { error: optError } = await supabaseService
          .from("answer_options")
          .insert(options);

        if (optError) {
          console.error(`Error creating options for ${difficulty}:`, optError);
        } else {
          totalGenerated++;
        }
      }
    }

    console.log(`Successfully generated ${totalGenerated} AI questions.`);
    if (totalGenerated === 0) {
      console.log("Falling back to sample questions...");
      await createCourseSampleQuestions(supabaseService, courseId, skillId, subCategory, 0);
    }
  } catch (error) {
    console.error("Error generating AI questions:", error);
    console.log("Falling back to sample questions...");
    await createCourseSampleQuestions(supabaseService, courseId, skillId, subCategory, 0);
  }
}

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

  const difficultyMap: Record<string, string> = {
    easy: "سهل جداً - أسئلة أساسية",
    medium: "متوسط - أسئلة معتدلة",
    hard: "صعب جداً - أسئلة متقدمة",
  };

  return `Generate ${count} unique and VARIED multiple-choice questions in Arabic for:
Subject: ${categoryMap[subCategory] || subCategory}
Difficulty Level: ${difficultyMap[difficulty]}

Return JSON with this exact structure:
{
  "questions": [
    {
      "content": "نص السؤال هنا",
      "explanation": "شرح مفصل ومفيد للإجابة الصحيحة",
      "options": [
        { "content": "الخيار الأول", "is_correct": false },
        { "content": "الخيار الثاني", "is_correct": true },
        { "content": "الخيار الثالث", "is_correct": false },
        { "content": "الخيار الرابع", "is_correct": false }
      ]
    }
  ]
}

Critical Requirements:
- Generate EXACTLY ${count} DIFFERENT and UNIQUE questions
- Each question MUST have exactly 4 options
- Exactly ONE option must be is_correct: true
- All questions MUST be at ${difficulty} difficulty level
- NO REPEATED questions
- All text MUST be in Arabic only
- Explanations must be detailed and educational
- Each question must be distinct with different content`;
}

async function createCourseSampleQuestions(
  serviceSupabase: any,
  courseId: string,
  skillId: string,
  subCategory: string,
  startIndex = 0
) {
  const questions = generateSampleQuestions(subCategory);
  const questionsToInsert = questions.slice(startIndex, 25);

  for (const q of questionsToInsert) {
    const { data: question, error: questionError } = await serviceSupabase
      .from("questions")
      .insert({
        skill_id: skillId,
        course_id: courseId,
        content: q.content,
        explanation: q.explanation,
        difficulty: q.difficulty || "easy",
        is_ai_generated: false,
      })
      .select()
      .single();

    if (questionError || !question) {
      console.error("Error creating question:", questionError);
      continue;
    }

    const options = q.options.map((opt: any, index: number) => ({
      question_id: question.id,
      content: opt.content,
      is_correct: opt.is_correct,
      order_index: index,
    }));

    const { error: optionsError } = await serviceSupabase
      .from("answer_options")
      .insert(options);

    if (optionsError) {
      console.error("Error creating options for question", question.id, optionsError);
    }
  }
}

function generateSampleQuestions(subCategory: string) {
  const questions: Array<{ content: string; explanation: string; difficulty: string; options: any[] }> = [];

  if (subCategory === "verbal") {
    const words = [
      { word: "مثابرة", answer: "الإصرار" },
      { word: "ابتكار", answer: "الإبداع" },
      { word: "تركيز", answer: "الانتباه" },
      { word: "تقليل", answer: "خفض" },
      { word: "سريع", answer: "عاجل" },
      { word: "مضاد", answer: "عكس" },
      { word: "صديق", answer: "زميل" },
      { word: "منع", answer: "حظر" },
      { word: "تفوق", answer: "نجاح" },
      { word: "تعاون", answer: "شراكة" },
      { word: "اعتذار", answer: "أسف" },
      { word: "سعادة", answer: "فرح" },
      { word: "حكمة", answer: "عقل" },
      { word: "حب", answer: "مودة" },
      { word: "قوة", answer: "طاقة" },
      { word: "خسارة", answer: "فقدان" },
      { word: "شجاعة", answer: "جرأة" },
      { word: "طموح", answer: "أمل" },
      { word: "هدوء", answer: "سكينة" },
      { word: "تحدي", answer: "اختبار" },
      { word: "دقة", answer: "اتقان" },
      { word: "فهم", answer: "إدراك" },
      { word: "رحمة", answer: "عطف" },
      { word: "قيمة", answer: "أهمية" },
      { word: "ذاكرة", answer: "حفظ" },
    ];

    words.forEach((item, index) => {
      questions.push({
        content: `اختر المعنى الأقرب لكلمة '${item.word}' من بين الخيارات التالية:`,
        explanation: `الكلمة '${item.word}' تعني '${item.answer}' أكثر من الخيارات الأخرى.`,
        difficulty: index < 10 ? "easy" : index < 18 ? "medium" : "hard",
        options: [
          { content: item.answer, is_correct: true },
          { content: "عكسها", is_correct: false },
          { content: "شبهها", is_correct: false },
          { content: "لا علاقة", is_correct: false },
        ],
      });
    });
  } else if (subCategory === "quantitative") {
    for (let i = 1; i <= 25; i++) {
      const a = i + 2;
      const b = i + 3;
      questions.push({
        content: `إذا كان لديك ${a * 2} تفاحات وأعطيت ${b} أصدقاء ${a} تفاحات لكل منهم، كم تفاحة تبقت؟`,
        explanation: `المجموع المعطى هو ${b} × ${a} = ${a * b}. إذًا إذا كان لديك ${a * 2} تفاحات، يبقى ${a * 2 - a * b}.`,
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: `${Math.max(0, a * 2 - a * b)}`, is_correct: true },
          { content: `${a * 2}`, is_correct: false },
          { content: `${a * b + 1}`, is_correct: false },
          { content: `${b}`, is_correct: false },
        ],
      });
    }
  } else if (subCategory === "mathematics") {
    for (let i = 1; i <= 25; i++) {
      const x = i + 3;
      const total = x + i;
      questions.push({
        content: `إذا كان x + ${i} = ${total}، فما قيمة x؟`,
        explanation: `نطرح ${i} من الطرفين: x = ${total} - ${i} = ${x}.`,
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: `x = ${x}`, is_correct: true },
          { content: `x = ${i}`, is_correct: false },
          { content: `x = ${total}`, is_correct: false },
          { content: `x = ${x + 1}`, is_correct: false },
        ],
      });
    }
  } else if (subCategory === "physics") {
    const physicsQuestions = [
      {
        content: "ما وحدة قياس القوة في النظام الدولي؟",
        explanation: "القوة تقاس بالنيوتن في النظام الدولي.",
        answer: "النيوتن",
      },
      {
        content: "إذا تحرك جسم بسرعة 10 م/ث لمدة 2 ثانية، ما المسافة المقطوعة؟",
        explanation: "المسافة = السرعة × الزمن = 10 × 2 = 20 مترًا.",
        answer: "20 مترًا",
      },
      {
        content: "أي مما يلي يعبر عن الطاقة؟",
        explanation: "الجول هو وحدة الطاقة في النظام الدولي.",
        answer: "الجول",
      },
      {
        content: "ما هو الرمز المستخدم لسرعة الضوء تقريبًا؟",
        explanation: "الرمز c يمثل سرعة الضوء.",
        answer: "c",
      },
      {
        content: "ما هو معدل التسارع إذا تغيرت السرعة من 0 إلى 10 م/ث خلال ثانية واحدة؟",
        explanation: "التسارع = التغير في السرعة ÷ الزمن = 10 ÷ 1 = 10 م/ث².",
        answer: "10 م/ث²",
      },
    ];

    for (let i = 0; i < 25; i++) {
      const item = physicsQuestions[i % physicsQuestions.length];
      questions.push({
        content: item.content.replace(/\d+/, `${i + 1}`),
        explanation: item.explanation,
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: item.answer, is_correct: true },
          { content: "النيوتن", is_correct: item.answer === "النيوتن" },
          { content: "الواط", is_correct: item.answer === "الواط" },
          { content: "الكيلوغرام", is_correct: item.answer === "الكيلوغرام" },
        ],
      });
    }
  } else if (subCategory === "chemistry") {
    const chemistryQuestions = [
      { content: "ما هو الرمز الكيميائي للأكسجين؟", explanation: "الرمز الكيميائي للأكسجين هو O.", answer: "O" },
      { content: "ما هي وحدة قياس الكتلة في النظام الدولي؟", explanation: "الكيلوغرام هو وحدة الكتلة في النظام الدولي.", answer: "الكيلوغرام" },
      { content: "ما هو المركب H₂O؟", explanation: "H₂O هو صيغة الماء.", answer: "ماء" },
      { content: "ما نوع الروابط في جزيء NaCl؟", explanation: "NaCl يحتوي على روابط أيونية.", answer: "روابط أيونية" },
      { content: "أي مما يلي عنصر؟", explanation: "الذهب هو عنصر كيميائي.", answer: "الذهب" },
    ];

    for (let i = 0; i < 25; i++) {
      const item = chemistryQuestions[i % chemistryQuestions.length];
      questions.push({
        content: item.content.replace(/\d+/, `${i + 1}`),
        explanation: item.explanation,
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: item.answer, is_correct: true },
          { content: "RDS", is_correct: false },
          { content: "H₂O", is_correct: item.answer === "H₂O" },
          { content: "CO₂", is_correct: false },
        ],
      });
    }
  } else if (subCategory === "biology") {
    const biologyQuestions = [
      { content: "ما هي الوحدة الأساسية للحياة؟", explanation: "الخلية هي الوحدة الأساسية للحياة.", answer: "الخلية" },
      { content: "أي مما يلي يلعب دورًا في نقل المعلومات الوراثية؟", explanation: "الحمض النووي DNA هو المسؤول عن المعلومات الوراثية.", answer: "DNA" },
      { content: "ما هو الجهاز الذي يساعد في تبادل الغازات في الإنسان؟", explanation: "الرئتان هما العضوان المسؤولان عن تبادل الغازات.", answer: "الرئتان" },
      { content: "ما هو الاسم الذي يطلق على مجموعة من الأعضاء المتكاملة؟", explanation: "النظام أو الجهاز عبارة عن مجموعة أعضاء تؤدي وظيفة مشتركة.", answer: "جهاز" },
      { content: "أي مما يلي هو خلية نباتية؟", explanation: "الخلايا النباتية تحتوي على جدار خلوي.", answer: "لها جدار خلوي" },
    ];

    for (let i = 0; i < 25; i++) {
      const item = biologyQuestions[i % biologyQuestions.length];
      questions.push({
        content: item.content.replace(/\d+/, `${i + 1}`),
        explanation: item.explanation,
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: item.answer, is_correct: true },
          { content: "خيار خاطئ 1", is_correct: false },
          { content: "خيار خاطئ 2", is_correct: false },
          { content: "خيار خاطئ 3", is_correct: false },
        ],
      });
    }
  } else if (subCategory === "ccna") {
    for (let i = 1; i <= 25; i++) {
      questions.push({
        content: `ما هو البروتوكول المستخدم لإرسال البريد الإلكتروني في الشبكات؟ (${i})`,
        explanation: "البروتوكول المستخدم لإرسال البريد الإلكتروني هو SMTP.",
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: "SMTP", is_correct: true },
          { content: "HTTP", is_correct: false },
          { content: "TCP", is_correct: false },
          { content: "DNS", is_correct: false },
        ],
      });
    }
  } else if (subCategory === "security") {
    for (let i = 1; i <= 25; i++) {
      questions.push({
        content: `ما هو المصطلح المعروف للهجوم الذي يعتمد على خداع المستخدم؟ (${i})`,
        explanation: "الهندسة الاجتماعية هي الهجوم الذي يعتمد على خداع المستخدم.",
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: "الهندسة الاجتماعية", is_correct: true },
          { content: "DDoS", is_correct: false },
          { content: "SQL Injection", is_correct: false },
          { content: "Phishing", is_correct: false },
        ],
      });
    }
  } else if (subCategory === "aws") {
    const awsServices = ["S3", "EC2", "Lambda", "RDS", "DynamoDB", "CloudFront", "IAM", "VPC", "SNS", "SQS"];
    for (let i = 1; i <= 25; i++) {
      const correct = awsServices[i % awsServices.length];
      questions.push({
        content: `أي من هذه الخدمات هي خدمة تخزين كائنات من AWS؟ (${i})`,
        explanation: "S3 هي خدمة تخزين كائنات من AWS.",
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: "S3", is_correct: true },
          { content: "EC2", is_correct: false },
          { content: "Lambda", is_correct: false },
          { content: "RDS", is_correct: false },
        ],
      });
    }
  } else if (subCategory === "pmp") {
    for (let i = 1; i <= 25; i++) {
      questions.push({
        content: `أي نموذج من نماذج إدارة المشاريع يركز على التسليم التدريجي والتعاون؟ (${i})`,
        explanation: "Agile هو النموذج الذي يركز على التسليم التدريجي والتعاون.",
        difficulty: i < 10 ? "easy" : i < 18 ? "medium" : "hard",
        options: [
          { content: "Agile", is_correct: true },
          { content: "Waterfall", is_correct: false },
          { content: "Scrum", is_correct: false },
          { content: "Six Sigma", is_correct: false },
        ],
      });
    }
  } else {
    for (let i = 1; i <= 25; i++) {
      questions.push({
        content: `سؤال عام رقم ${i} للدورة.`,
        explanation: "هذا سؤال تجريبي عام.",
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

async function handleStartSession(
  supabaseService: any,
  userId: string,
  payload: StartSessionPayload
) {
  console.log("START SESSION PAYLOAD:", payload);

  const { course_id, total_questions } = payload;

  // First, ensure the course exists in the database
  await ensureCourseExists(supabaseService, course_id);

  const { data: session, error } = await supabaseService
    .from("learning_sessions")
    .insert({
      user_id: userId,
      course_id,
      status: "active",
      total_questions: total_questions ?? 25,
    })
    .select()
    .single();

  console.log("SESSION:", session);
  console.log("SESSION ERROR:", error);

  if (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error,
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

  return new Response(
    JSON.stringify({ session }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

async function handleSubmitAnswer(
  supabaseService: any,
  userId: string,
  payload: SubmitAnswerPayload
) {
  const {
    session_id,
    question_id,
    selected_option_id,
    time_spent_seconds,
  } = payload;

  const { data: option } = await supabaseService
    .from("answer_options")
    .select("is_correct")
    .eq("id", selected_option_id)
    .single();

  const isCorrect = option?.is_correct ?? false;

  const { error } = await supabaseService
    .from("user_answers")
    .insert({
      user_id: userId,
      session_id,
      question_id,
      selected_option_id,
      is_correct: isCorrect,
      time_spent_seconds,
    });

  if (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error,
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

  return new Response(
    JSON.stringify({
      success: true,
      is_correct: isCorrect,
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

async function handleNextQuestion(
  supabaseService: any,
  userId: string,
  sessionId: string
) {
  console.log("========== NEXT QUESTION ==========");
  console.log("USER ID:", userId);
  console.log("SESSION ID:", sessionId);

  if (!sessionId) {
    return new Response(
      JSON.stringify({
        error: "session_id is required",
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

  // جلب الجلسة
  const {
    data: session,
    error: sessionError,
  } = await supabaseService
    .from("learning_sessions")
    .select("id, course_id, total_questions")
    .eq("id", sessionId)
    .single();

  console.log("SESSION:", session);
  console.log("SESSION ERROR:", sessionError);

  if (sessionError) {
    return new Response(
      JSON.stringify({
        error: sessionError.message,
        details: sessionError,
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

  if (!session) {
    return new Response(
      JSON.stringify({
        error: "Session not found",
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

  const { data: answeredQuestions, error: answeredError } = await supabaseService
    .from("user_answers")
    .select("question_id")
    .eq("session_id", sessionId);

  if (answeredError) {
    return new Response(
      JSON.stringify({
        error: answeredError.message,
        details: answeredError,
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

  const askedQuestionIds = (answeredQuestions || []).map((row: any) => row.question_id);
  const answeredCount = askedQuestionIds.length;

  if (session.total_questions && answeredCount >= session.total_questions) {
    return new Response(
      JSON.stringify({ question: null, finished: true }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const {
    data: questions,
    error: questionError,
  } = await supabaseService
    .from("questions")
    .select(`
      id,
      content,
      explanation,
      difficulty,
      answer_options (
        id,
        content,
        is_correct,
        order_index
      )
    `)
    .eq("course_id", session.course_id);

  console.log("QUESTIONS FOR COURSE:", questions);

  if (questionError) {
    return new Response(
      JSON.stringify({
        error: questionError.message,
        details: questionError,
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

  const remainingQuestions = (questions || []).filter((question: any) => !askedQuestionIds.includes(question.id));

  console.log("REMAINING QUESTIONS COUNT:", remainingQuestions.length);

  if (!remainingQuestions || remainingQuestions.length === 0) {
    return new Response(
      JSON.stringify({ question: null, finished: true }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  // ===== التكيف الذكي مع مستوى اليوزر =====
  // جلب إجابات الجلسة الحالية لحساب الأداء
  const { data: sessionAnswers } = await supabaseService
    .from("user_answers")
    .select("is_correct")
    .eq("session_id", sessionId);

  const totalAnswered = sessionAnswers?.length || 0;
  const totalCorrect = sessionAnswers?.filter((a: any) => a.is_correct).length || 0;
  const accuracy = totalAnswered > 0 ? totalCorrect / totalAnswered : 0.5;

  // تحديد صعوبة السؤال التالي بناءً على الأداء
  let targetDifficulty: string;
  if (accuracy >= 0.75) {
    targetDifficulty = "hard";      // أداء ممتاز → أسئلة صعبة
  } else if (accuracy >= 0.5) {
    targetDifficulty = "medium";    // أداء متوسط → أسئلة متوسطة
  } else {
    targetDifficulty = "easy";      // أداء ضعيف → أسئلة سهلة
  }

  console.log(`Accuracy: ${accuracy.toFixed(2)}, Target difficulty: ${targetDifficulty}`);

  // نختار من الصعوبة المناسبة أولاً، لو ما فيها نأخذ من أي صعوبة
  const preferredQuestions = remainingQuestions.filter((q: any) => q.difficulty === targetDifficulty);
  const fallbackQuestions = remainingQuestions.filter((q: any) => q.difficulty !== targetDifficulty);

  const pool = preferredQuestions.length > 0 ? preferredQuestions : fallbackQuestions;
  const nextQuestion = pool[Math.floor(Math.random() * pool.length)];

  return new Response(
    JSON.stringify({ question: nextQuestion, finished: false }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}


async function handleEndSession(
  supabaseService: any,
  userId: string,
  sessionId: string
) {
  const { data, error } = await supabaseService
    .from("learning_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error,
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

  return new Response(
    JSON.stringify({ session: data }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}