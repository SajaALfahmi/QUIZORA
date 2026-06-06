import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

    const systemContent = isArabic
      ? `أنت المساعد الذكي الرسمي لمنصة Quizora (منصة اختبارات ذكية وتوليد أسئلة تفاعلية تعتمد على خوارزمية الـ BKT).
يجب أن تتجاوب دائماً بنفس لغة المستخدم. إذا كتب بالعربي رد بالعربي، وإذا كتب بالإنجليزي رد بالإنجليزي.

وظيفتك الوحيدة: الإجابة على أسئلة الطلاب العلمية وشرح المفاهيم في المواد المتاحة فقط، ومساعدتهم في فهم طريقة عمل المنصة.

قواعد صارمة التزم بها تماماً:
1. المنصة تقدم (أسئلة، خيارات متعددة، تقييم ذكي، وشروحات للإجابات) وليس بها كورسات فيديو أو مشاريع أو دعم عملاء.
2. الكورسات المتاحة حالياً:
   - القدرات: كمّي، ولفظي.
   - التحصيلي (القسم العلمي): كيمياء، وأحياء فقط. (الرياضيات والفيزياء Future Work غير مدعومة حالياً).
   - الشهادات المهنية: CCNA، CompTIA Security+، AWS Cloud Practitioner، PMP.
3. إذا سألك الطالب عن مادة غير مدعومة أخبره: "هذه المادة تندرج حالياً ضمن خطتنا للعمل المستقبلي وقريباً ستكون متاحة".
4. إجاباتك مختصرة ومباشرة بدون مقدمات طويلة.`
      : `You are the official smart assistant for Quizora (an AI-powered smart testing and adaptive question platform running on BKT algorithm).
You must always respond in the same language the user writes in. If the user writes in Arabic, respond in Arabic. If in English, respond in English.

Your sole purpose is to answer educational questions, explain concepts for the CURRENTLY AVAILABLE courses only, and guide students on how the testing platform works.

Strict Rules:
1. The platform ONLY provides (Multiple-choice questions, adaptive quizzes via BKT, and answer explanations). No video courses, certificates, assignments, or customer support.
2. Currently active courses:
   - Qudurat: Quantitative and Verbal.
   - Tahsili (Science): Chemistry and Biology ONLY. (Mathematics and Physics are Future Work and NOT available).
   - Professional Certifications: CCNA, CompTIA Security+, AWS Cloud Practitioner, and PMP.
3. If a student asks about an unsupported subject reply: "This subject is currently part of our Future Work roadmap and will be available soon."
4. Keep responses concise, direct, and professional.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemContent },
            ...messages,
            userMessage
          ],
        }),
      });
      const data = await response.json();
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