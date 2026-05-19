import { useState, useEffect } from "react";

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

 function toggleChat() {
   if (open) {
     setMessages([
       { role: "assistant", content: isArabic ? "مرحبا! كيف اقدر اساعدك؟" : "Hello! How can I help you?" }
     ]);
   }
   setOpen(!open);
 }

 async function sendMessage() {
   if (!input.trim()) return;
   const userMessage = { role: "user", content: input };
   setMessages(prev => [...prev, userMessage]);
   setInput("");
   setLoading(true);
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
           content: isArabic
             ? "انت مساعد تعليمي في منصة Quizura. تحدث بالعربي فقط. مهامك: شرح المواد، الاجابة على الاسئلة، وارشاد الطالب في الموقع."
             : "You are an educational assistant in Quizura platform. Always reply in English. Help students with subjects, explain concepts, and guide them through the platform."
         },
         ...messages,
         userMessage
       ],
     }),
   });
   const data = await response.json();
   setMessages(prev => [...prev, { role: "assistant", content: data.choices[0].message.content }]);
   setLoading(false);
 }

 return (
   <>
     <button
       onClick={toggleChat}
       style={{
         position: "fixed", bottom: 24, right: 24, zIndex: 9999,
         width: 56, height: 56, borderRadius: "50%",
         background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
         border: "none", fontSize: 24, cursor: "pointer", color: "white",
         boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
       }}
     >
       {open ? "X" : "💬"}
     </button>

     {open && (
       <div style={{
         position: "fixed", bottom: 90, right: 24, zIndex: 9999,
         width: 340, height: 450, background: "#1a1a2e",
         borderRadius: 16, display: "flex", flexDirection: "column",
         border: "1px solid #ffffff20", boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
       }}>
         <div style={{
           padding: "12px 16px",
           background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
           color: "white", fontWeight: "bold",
           textAlign: isArabic ? "right" : "left"
         }}>
           🤖 {isArabic ? "مساعد Quizura" : "Quizura Assistant"}
         </div>

         <div style={{
           flex: 1, overflowY: "auto", padding: 12,
           display: "flex", flexDirection: "column", gap: 8
         }}>
           {messages.map((msg, i) => (
             <div key={i} style={{
               alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
               background: msg.role === "user" ? "#8b5cf6" : "#ffffff15",
               color: "white", padding: "8px 12px", borderRadius: 12,
               maxWidth: "80%", fontSize: 14,
               direction: isArabic ? "rtl" : "ltr",
               textAlign: isArabic ? "right" : "left"
             }}>
               {msg.content}
             </div>
           ))}
           {loading && (
             <div style={{ color: "#ffffff60", fontSize: 12 }}>
               {isArabic ? "جاري الكتابة..." : "Typing..."}
             </div>
           )}
         </div>

         <div style={{
           padding: 12, display: "flex", gap: 8,borderTop: "1px solid #ffffff20",
           direction: isArabic ? "rtl" : "ltr"
         }}>
           <input
             value={input}
             onChange={e => setInput(e.target.value)}
             onKeyDown={e => e.key === "Enter" && sendMessage()}
             placeholder={isArabic ? "اكتب سؤالك..." : "Type your question..."}
             style={{
               flex: 1, background: "#ffffff10",
               border: "1px solid #ffffff20", borderRadius: 8,
               padding: "8px 12px", color: "white", outline: "none",
               direction: isArabic ? "rtl" : "ltr", fontSize: 14
             }}
           />
           <button
             onClick={sendMessage}
             disabled={loading}
             style={{
               background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
               border: "none", borderRadius: 8, padding: "8px 14px",
               color: "white", cursor: "pointer", fontWeight: "bold"
             }}
           >
             {isArabic ? "ارسال" : "Send"}
           </button>
         </div>
       </div>
     )}
   </>
 );
}