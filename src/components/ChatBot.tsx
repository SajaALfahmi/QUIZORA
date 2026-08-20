import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CourseInfo {
  title: string;
  category: string;
}

// Arabic/English labels for course categories, used only to group the
// dynamically-fetched course list below - not a course list itself, so it
// can't go stale the way a hardcoded course list can.
const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  qudurat: { ar: "القدرات", en: "Qudurat" },
  tahseeli: { ar: "التحصيلي", en: "Tahseeli" },
  certifications: { ar: "الشهادات المهنية", en: "Professional Certifications" },
};

// Strips a redundant "Tahseeli - " / "Qudurat - " prefix from a course
// title when it duplicates the category label already shown alongside it.
function stripCategoryPrefix(title: string): string {
  return title.replace(/^(Tahseeli|Qudurat)\s*-\s*/i, "").trim();
}

// Courses intentionally held back from launch (isFutureWork: true in
// CoursesPage.tsx's defaultCourses array) even though they may already have
// question content in the database - e.g. deliberately out of scope for the
// current hackathon. The Courses page is the source of truth for this
// decision, not the database, so it can't be derived from a live query; keep
// this in sync by hand with CoursesPage.tsx's isFutureWork flags.
const FUTURE_WORK_COURSE_TITLES = new Set([
  "Tahseeli - Mathematics",
  "Tahseeli - Physics",
]);

// Builds the chatbot's course-list line directly from whatever courses
// actually have questions right now, so it can never claim a live course is
// "Future Work" (or vice versa) the way a hardcoded list eventually would.
function buildCourseListText(courses: CourseInfo[], arabic: boolean): string {
  const byCategory = new Map<string, string[]>();
  for (const c of courses) {
    const list = byCategory.get(c.category) || [];
    list.push(stripCategoryPrefix(c.title));
    byCategory.set(c.category, list);
  }
  const lines: string[] = [];
  for (const [category, titles] of byCategory) {
    const label = CATEGORY_LABELS[category]?.[arabic ? "ar" : "en"] || category;
    lines.push(`${label}: ${titles.join(arabic ? "، " : ", ")}`);
  }
  return lines.join(arabic ? "\n   - " : "\n   - ");
}

const RobotIcon = ({ className = "w-5 h-5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

export default function ChatBot() {
  const [isArabic, setIsArabic] = useState(
    document.documentElement.dir === "rtl"
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsArabic(document.documentElement.dir === "rtl");
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: isArabic ? "مرحبا! كيف اقدر اساعدك؟" : "Hello! How can I help you?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetched once and cached for the component's lifetime, rather than a
  // hardcoded list in the system prompt below - courses that actually have
  // questions are the only ones ever described to a student as available,
  // so this can't drift out of sync with the real database the way a
  // hardcoded list did. FUTURE_WORK_COURSE_TITLES is then subtracted so this
  // still matches what CoursesPage.tsx actually shows a student, even for a
  // course that already has DB content but hasn't launched yet.
  const [availableCourses, setAvailableCourses] = useState<CourseInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: questionRows } = await supabase.from("questions").select("course_id");
        const liveCourseIds = [...new Set((questionRows || []).map((r: any) => r.course_id).filter(Boolean))];
        if (liveCourseIds.length === 0) return;
        const { data: courseRows } = await supabase
          .from("courses")
          .select("title, category")
          .in("id", liveCourseIds);
        const launchedCourses = (courseRows as CourseInfo[] | null)?.filter(
          (c) => !FUTURE_WORK_COURSE_TITLES.has(c.title)
        );
        if (!cancelled && launchedCourses) setAvailableCourses(launchedCourses);
      } catch (err) {
        console.error("Error fetching available courses for chatbot:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Keep the static greeting in sync with a language switch while it's
  // still the untouched initial message - never overwrites an actual
  // conversation in progress (real messages are meant to stay in whatever
  // language the user/assistant actually used, matching the system
  // prompt's own "respond in the same language the user writes in" rule).
  useEffect(() => {
    setMessages(prev =>
      prev.length === 1 && prev[0].role === "assistant"
        ? [{ role: "assistant", content: isArabic ? "مرحبا! كيف اقدر اساعدك؟" : "Hello! How can I help you?" }]
        : prev
    );
  }, [isArabic]);

  function toggleChat() {
    if (open) {
      setMessages([
        { role: "assistant", content: isArabic ? "مرحبا! كيف اقدر اساعدك؟" : "Hello! How can I help you?" }
      ]);
    }
    setOpen(!open);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setLoading(true);

    // تخزين سؤال اليوزر
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any).from("chat_history").insert({
          user_id: user.id,
          role: "user",
          content: currentInput,
        });
      }
    } catch (err) {
      console.error("Error saving user message:", err);
    }

    // Falls back to directing the student to the Courses page - never to a
    // specific hardcoded list - if the live fetch hasn't resolved yet or
    // failed, so the assistant can't repeat a stale/wrong availability claim
    // either way.
    const courseListText = availableCourses && availableCourses.length > 0
      ? buildCourseListText(availableCourses, isArabic)
      : null;
    const courseListLine = courseListText
      ? `   - ${courseListText}`
      : isArabic
        ? "   - (راجع صفحة الكورسات داخل المنصة للاطلاع على القائمة الحالية إذا لم تكن متأكداً)"
        : "   - (Check the Courses page in the app for the current list if unsure)";

    const systemContent = isArabic
      ? `أنت المساعد الذكي الرسمي لمنصة Quizora (منصة اختبارات ذكية وتوليد أسئلة تفاعلية تعتمد على خوارزمية الـ BKT).
يجب أن تتجاوب دائماً بنفس لغة المستخدم. إذا كتب بالعربي رد بالعربي، وإذا كتب بالإنجليزي رد بالإنجليزي.

وظيفتك الوحيدة: الإجابة على أسئلة الطلاب العلمية وشرح المفاهيم في المواد المتاحة فقط، ومساعدتهم في فهم طريقة عمل المنصة.

قواعد صارمة التزم بها تماماً:
1. المنصة تقدم (أسئلة، خيارات متعددة، تقييم ذكي، وشروحات للإجابات) وليس بها كورسات فيديو أو مشاريع أو دعم عملاء.
2. الكورسات المتاحة حالياً (هذه القائمة هي المصدر الوحيد الموثوق - لا تفترض توفر أو عدم توفر أي مادة أخرى):
${courseListLine}
3. إذا سألك الطالب عن مادة غير مذكورة في القائمة أعلاه أخبره: "هذه المادة تندرج حالياً ضمن خطتنا للعمل المستقبلي وقريباً ستكون متاحة".
4. إجاباتك مختصرة ومباشرة بدون مقدمات طويلة.`
      : `You are the official smart assistant for Quizora (an AI-powered smart testing and adaptive question platform running on BKT algorithm).
You must always respond in the same language the user writes in. If the user writes in Arabic, respond in Arabic. If in English, respond in English.

Your sole purpose is to answer educational questions, explain concepts for the CURRENTLY AVAILABLE courses only, and guide students on how the testing platform works.

Strict Rules:
1. The platform ONLY provides (Multiple-choice questions, adaptive quizzes via BKT, and answer explanations). No video courses, certificates, assignments, or customer support.
2. Currently active courses (this list is the only reliable source - never assume any other subject is or isn't available):
${courseListLine}
3. If a student asks about a subject not listed above, reply: "This subject is currently part of our Future Work roadmap and will be available soon."
4. Keep responses concise, direct, and professional.`;

    try {
      const { data, error } = await supabase.functions.invoke("chatbot", {
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemContent },
            ...messages,
            userMessage
          ],
        }),
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const assistantContent = data.choices[0].message.content;
      setMessages(prev => [...prev, { role: "assistant", content: assistantContent }]);

      // تخزين رد المساعد
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await (supabase as any).from("chat_history").insert({
            user_id: user.id,
            role: "assistant",
            content: assistantContent,
          });
        }
      } catch (err) {
        console.error("Error saving assistant message:", err);
      }

    } catch (error) {
      console.error("Error connecting to OpenAI:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: isArabic
          ? "عذراً، حدث خطأ أثناء التواصل مع المساعد. حاول مرة أخرى."
          : "Sorry, something went wrong connecting to the assistant. Please try again."
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={toggleChat}
        className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg transition-transform active:scale-95 focus:outline-none"
        aria-label="Toggle Assistant"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <RobotIcon className="w-6 h-6" />
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-[9999] w-[340px] md:w-[360px] h-[460px] bg-card text-card-foreground border border-border shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
          style={{ direction: isArabic ? "rtl" : "ltr" }}
        >
          <div className="px-4 py-3 bg-gradient-to-r from-primary/10 via-secondary/5 to-transparent border-b border-border/80 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm shrink-0">
              <RobotIcon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold tracking-wide truncate">
                {isArabic ? "مساعد كويزورا الذكي" : "Quizura Assistant"}
              </h3>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {isArabic ? "نشط الآن" : "Online"}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-muted/5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 max-w-[85%] ${
                  msg.role === "user"
                    ? (isArabic ? "mr-auto flex-row-reverse" : "ml-auto flex-row-reverse")
                    : ""
                }`}
              >
                {msg.role !== "user" && (
                  <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                    <RobotIcon className="w-3 h-3" />
                  </div>
                )}
                <div
                  className={`text-xs px-3.5 py-2.5 shadow-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none"
                      : "bg-muted text-foreground border border-border/40 rounded-2xl rounded-tl-none"
                  }`}
                  style={{ textAlign: isArabic ? "right" : "left" }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground text-[11px] px-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span>{isArabic ? "جاري التفكير..." : "Thinking..."}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-card border-t border-border/60 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder={isArabic ? "اكتب سؤالك هنا..." : "Type your question..."}
              className="flex-1 h-9 rounded-xl text-xs bg-muted/40 border border-border px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="h-9 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center shrink-0"
            >
              {isArabic ? "إرسال" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}