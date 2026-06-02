import { useState, useEffect, useRef } from "react";

// أيقونة روبوت جرافيك عصرية (SVG) بديلة للإيموجي 🤖 وتتناسق مع التصميم الأنيق للموقع
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
  
  // مرجع لعمل سكرول تلقائي لأسفل المحادثة عند وصول رسائل جديدة
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
    setInput("");
    setLoading(true);

    // صياغة الـ System Prompt الجديد لتحديد هوية ونطاق عمل المنصة الفعلي بدقة
    const systemContent = isArabic
      ? `أنت المساعد الذكي الرسمي لمنصة Quizora (منصة اختبارات ذكية وتوليد أسئلة تفاعلية تعتمد على خوارزمية الـ BKT).
وظيفتك الوحيدة: الإجابة على أسئلة الطلاب العلمية وشرح المفاهيم في المواد المتاحة فقط، ومساعدتهم في فهم طريقة عمل المنصة.

قواعد صارمة التزم بها تماماً:
1. المنصة تقدم (أسئلة، خيارات متعددة، تقييم ذكي، وشروحات للإجابات) وليس بها كورسات فيديو أو مشاريع أو دعم عملاء. لا تقترح على الطالب التواصل مع دعم العملاء أو مراجعة مشاريع.
2. الكورسات والمواد المتاحة حالياً لتقديم الأسئلة والاختبارات الذكية هي:
   - القدرات: كمّي، ولفظي.
   - التحصيلي (القسم العلمي): كيمياء، وأحياء فقط. (تنبيه هام جداً: الرياضيات والفيزياء هي عمل مستقبلي Future Work وغير مدعومة حالياً في النظام).
   - الشهادات المهنية العالمية: CCNA، و CompTIA Security+، و AWS Cloud Practitioner، و PMP.
3. إذا سألك الطالب عن مادة غير مدعومة أو مادة تندرج تحت العمل المستقبلي (كالرياضيات والفيزياء في التحصيلي)، أخبره مباشرة بذكاء: "هذه المادة تندرج حالياً ضمن خطتنا للعمل المستقبلي (Future Work) وقريباً ستكون متاحة للاختبارات التفاعلية".
4. إجاباتك يجب أن تكون مختصرة، مباشرة، ومصقولة برمجياً وعلمياً بدون مقدمات طويلة وتجنب تماماً تخيل ميزات غير موجودة بالمنصة.`
      : `You are the official smart assistant for Quizora (an AI-powered smart testing and adaptive question platform running on BKT algorithm).
Your sole purpose is to answer educational questions, explain concepts for the CURRENTLY AVAILABLE courses only, and guide students on how the testing platform works.

Strict Rules to Follow:
1. The platform ONLY provides (Multiple-choice questions, adaptive quizzes via BKT, and answer explanations). There are NO video courses, certificates, assignments, projects, or customer support. Never ask the user to contact support or submit projects.
2. The ONLY currently active courses for testing are:
   - Qudurat: Quantitative and Verbal.
   - Tahsili (Science): Chemistry and Biology ONLY. (CRITICAL: Mathematics and Physics are strictly marked as Future Work and NOT available right now in the system).
   - Professional Certifications: CCNA, CompTIA Security+, AWS Cloud Practitioner, and PMP.
3. If a student asks about an unsupported subject or a future work subject (like Math or Physics in Tahsili), reply directly and smartly: "This subject is currently part of our Future Work roadmap and will be available for adaptive testing soon."
4. Keep your responses concise, direct, professional, and never hallucinate features or services that do not exist on Quizora.`;
    
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
            {
              role: "system",
              content: systemContent
            },
            ...messages,
            userMessage
          ],
        }),
      });
      const data = await response.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.choices[0].message.content }]);
    } catch (error) {
      console.error("Error connecting to OpenAI:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* زر تفعيل الشات العائم السفلي - يتطابق مع تدرجات النظام وألوانه الاحترافية */}
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

      {/* صندوق المحادثة الرئيسي - يدعم الوضعين المظلم والمضيء بشكل انسيابي مميز */}
      {open && (
        <div 
          className="fixed bottom-24 right-6 z-[9999] w-[340px] md:w-[360px] h-[460px] bg-card text-card-foreground border border-border shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
          style={{ direction: isArabic ? "rtl" : "ltr" }}
        >
          {/* رأس الشات بوت - مدمج مع تدرج لوني خفيف من هوية الموقع (بدون ألوان حادة) */}
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

          {/* منطقة استعراض الرسائل - مريحة جداً للعين وتدعم الـ Light & Dark Modes */}
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
                {/* الأيقونة تظهر بجانب رسائل المساعد فقط */}
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
            
            {/* مؤشر جاري الكتابة المتناسق بصرياً مع الموقع */}
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

          {/* الحقل السفلي لإرسال الرسائل */}
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