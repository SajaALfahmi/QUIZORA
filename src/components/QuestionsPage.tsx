import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, BookOpen, Home, Loader2, Lightbulb,
  ArrowRight, Settings, Clock, HelpCircle, Sparkles, Brain, Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adaptiveEngine, aiService } from "@/services/adaptiveEngine";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

interface Question {
  id: string;
  content: string;
  explanation: string | null;
  difficulty: string;
  answer_options: { id: string; content: string; is_correct: boolean; order_index: number }[];
}

type DifficultyOption = "auto" | "easy" | "medium" | "hard";
const questionCounts = [5, 10, 15, 20, 25];

/* ══ Skeleton Loader ══ */
const QuestionSkeleton = ({ message }: { message: string }) => (
  <div className="space-y-5 animate-pulse">
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20">
      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
        <Brain className="w-4 h-4 text-violet-400 animate-pulse" />
      </div>
      <div>
        <p className="text-sm font-medium text-violet-300">{message}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" />
          Powered by Generative AI
        </p>
      </div>
      <div className="ms-auto flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-violet-400"
            style={{ animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </div>
    </div>

    <Card className="bg-card/80 border border-border/30">
      <CardHeader>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-muted/50" />
          <div className="w-16 h-5 rounded-full bg-muted/50" />
        </div>
        <div className="space-y-2">
          <div className="h-5 bg-muted/40 rounded-lg w-full" />
          <div className="h-5 bg-muted/40 rounded-lg w-4/5" />
          <div className="h-5 bg-muted/30 rounded-lg w-3/5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/20 bg-muted/10">
            <div className="w-4 h-4 rounded-full bg-muted/40" />
            <div className="h-4 bg-muted/30 rounded-lg" style={{ width: `${55 + i * 8}%` }} />
          </div>
        ))}
      </CardContent>
    </Card>

    <div className="flex justify-end">
      <div className="w-36 h-11 rounded-xl bg-muted/40" />
    </div>
  </div>
);

const QuestionsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const initialState = (location.state as any) || {};
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(initialState.resumeSessionId ?? null);
  const [currentCourseId, setCurrentCourseId] = useState<string | null>(initialState.courseId ?? null);
  const [currentCourseName, setCurrentCourseName] = useState<string>(initialState.courseName ?? "");
  const [currentCourseDescription, setCurrentCourseDescription] = useState<string>(initialState.courseDescription ?? "");
  const isAr = language === "ar";

  const [showSettings, setShowSettings] = useState(true);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyOption>("auto");
  const [selectedCount, setSelectedCount] = useState(25);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const totalTimerRef = useRef<number>(0);
  const totalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadingMessages = isAr
    ? [
        "🧠 الذكاء الاصطناعي يولّد السؤال...",
        "⚡ جاري تحليل مستواك وتجهيز سؤال مناسب...",
        "✨ يتم إنشاء سؤال مخصص لك...",
        "🔄 جاري ضبط مستوى الصعوبة...",
        "📚 البحث في قاعدة المعرفة...",
      ]
    : [
        "🧠 AI is generating your question...",
        "⚡ Analyzing your level, preparing a tailored question...",
        "✨ Creating a personalized question for you...",
        "🔄 Calibrating difficulty level...",
        "📚 Searching the knowledge base...",
      ];

  const getRandomLoadingMessage = () =>
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  useEffect(() => {
    totalIntervalRef.current = setInterval(() => { totalTimerRef.current += 1; }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (totalIntervalRef.current) clearInterval(totalIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (resumeSessionId || currentCourseId) return;

    const restoreFromStorageOrActiveSession = async () => {
      const stored = localStorage.getItem("quizora-continue-session");
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data?.sessionId) {
            setResumeSessionId(data.sessionId);
            setCurrentCourseId(data.courseId ?? null);
            setCurrentCourseName(data.courseName ?? "");
            setCurrentCourseDescription(data.courseDescription ?? "");
            return;
          }
        } catch {
          // ignore malformed storage data
        }
      }

      try {
        const { data: sessions } = await supabase
          .from("learning_sessions")
          .select("id, course_id, total_questions")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("started_at", { ascending: false })
          .limit(1);

        if (!sessions || sessions.length === 0) return;
        const session = sessions[0];
        setResumeSessionId(session.id);
        setCurrentCourseId(session.course_id);
        setSelectedCount(session.total_questions ?? 25);

        const { data: course } = await supabase
          .from("courses")
          .select("title, description")
          .eq("id", session.course_id)
          .maybeSingle();

        if (course) {
          setCurrentCourseName(course.title);
          setCurrentCourseDescription(course.description ?? "");
        }
      } catch (error) {
        console.error(error);
      }
    };

    restoreFromStorageOrActiveSession();
  }, [user, resumeSessionId, currentCourseId]);

  useEffect(() => {
    if (!user || !resumeSessionId) return;
    if (!showSettings && sessionId === resumeSessionId) return;

    const resumeSession = async () => {
      setShowSettings(false);
      setIsLoading(true);
      setLoadingMessage(isAr ? "🚀 جاري استئناف الجلسة..." : "🚀 Resuming your previous session...");

      try {
        const { data: session } = await supabase
          .from("learning_sessions")
          .select("total_questions, course_id")
          .eq("id", resumeSessionId)
          .maybeSingle();

        if (session) {
          setSelectedCount(session.total_questions ?? 25);
          if (!currentCourseId) setCurrentCourseId(session.course_id);
          if (!currentCourseName) {
            const { data: course } = await supabase
              .from("courses")
              .select("title, description")
              .eq("id", session.course_id)
              .maybeSingle();

            if (course) {
              setCurrentCourseName(course.title);
              setCurrentCourseDescription(course.description ?? "");
            }
          }
        }

        const { data: answers } = await supabase
          .from("user_answers")
          .select("is_correct")
          .eq("session_id", resumeSessionId);

        const answered = answers?.length ?? 0;
        const previousCorrect = answers?.filter((a) => a.is_correct).length ?? 0;

        setQuestionNumber(answered);
        setTotalCorrect(previousCorrect);
        setSessionId(resumeSessionId);

        localStorage.setItem(
          "quizora-continue-session",
          JSON.stringify({
            sessionId: resumeSessionId,
            courseId: currentCourseId,
            courseName: currentCourseName,
            courseDescription: currentCourseDescription,
          })
        );

        await fetchNextQuestion(resumeSessionId);
      } catch (error: any) {
        toast({ title: "Error", description: error?.message || "Unable to resume session.", variant: "destructive" });
        setShowSettings(true);
        setIsLoading(false);
      }
    };

    resumeSession();
  }, [user, resumeSessionId, currentCourseId, currentCourseName, currentCourseDescription, showSettings, isAr, toast]);

  useEffect(() => {
    if (!sessionId || !currentCourseId) return;
    localStorage.setItem(
      "quizora-continue-session",
      JSON.stringify({
        sessionId,
        courseId: currentCourseId,
        courseName: currentCourseName,
        courseDescription: currentCourseDescription,
      })
    );
  }, [sessionId, currentCourseId, currentCourseName, currentCourseDescription]);

  const handleStartQuiz = async () => {
    setShowSettings(false);
    setIsLoading(true);
    setLoadingMessage(isAr ? "🚀 جاري بدء الجلسة..." : "🚀 Starting session...");
    try {
      if (!currentCourseId) {
        toast({ title: "Error", description: "Please select a course.", variant: "destructive" });
        navigate("/courses");
        return;
      }
      const result = await adaptiveEngine.startSession(currentCourseId, selectedCount, selectedDifficulty);
      setSessionId(result.session.id);
      await fetchNextQuestion(result.session.id, selectedDifficulty);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      navigate("/courses");
    }
  };

  const fetchNextQuestion = async (sid: string, diffMode?: string) => {
    try {
      setIsLoading(true);
      setLoadingMessage(getRandomLoadingMessage());
      setShowResult(false); setSelectedAnswer(""); setExplanation(null); setLastResult(null);
      if (questionNumber >= selectedCount) { setFinished(true); setIsLoading(false); return; }

      const result = await adaptiveEngine.getNextQuestion(sid, diffMode || selectedDifficulty);

      if (result.finished) { setFinished(true); setIsLoading(false); return; }
      if (!result.question) throw new Error("No question returned from adaptive engine.");
      setCurrentQuestion(result.question);
      if (result.adaptive_info) setAdaptiveInfo(result.adaptive_info);
      setQuestionNumber((p) => p + 1);
      setIsLoading(false);
      timerRef.current = 0;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => { timerRef.current += 1; }, 1000);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !currentQuestion || !sessionId) return;
    setIsSubmitting(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      const result = await adaptiveEngine.submitAnswer({
        session_id: sessionId,
        question_id: currentQuestion.id,
        selected_option_id: selectedAnswer,
        time_spent_seconds: timerRef.current,
      });
      setLastResult(result); setShowResult(true);
      if (result.is_correct) setTotalCorrect((p) => p + 1);
      // عرض الشرح تلقائياً إذا كان موجوداً في الرد
      if (result.explanation) setExplanation(result.explanation);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setIsSubmitting(false); }
  };

  const handleGetExplanation = async () => {
    if (!currentQuestion) return;
    setLoadingExplanation(true);
    try {
      const selectedOpt = currentQuestion.answer_options.find((o) => o.id === selectedAnswer);
      const correctOpt = currentQuestion.answer_options.find((o) => o.is_correct);
      const result = await aiService.generateExplanation({
        question_id: currentQuestion.id,
        user_answer: selectedOpt?.content,
        correct_answer: correctOpt?.content,
      });
      setExplanation(result.explanation);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoadingExplanation(false); }
  };

  const handleNext = () => {
    if (questionNumber >= selectedCount) {
      if (totalIntervalRef.current) clearInterval(totalIntervalRef.current);
      setFinished(true);
      return;
    }
    if (sessionId) fetchNextQuestion(sessionId, selectedDifficulty);
  };

  const handleEndSession = async () => {
    if (totalIntervalRef.current) clearInterval(totalIntervalRef.current);
    if (sessionId) await adaptiveEngine.endSession(sessionId);
    localStorage.removeItem("quizora-continue-session");
    navigate("/evaluation", {
      state: {
        totalQuestions: questionNumber,
        totalCorrect,
        sessionId,
        courseId: currentCourseId,
        courseName: currentCourseName,
        timeSpentSeconds: totalTimerRef.current,
      },
    });
  };

  const difficultyLabel = (d: DifficultyOption) => {
    if (d === "auto") return t("quiz.auto");
    if (d === "easy") return t("questions.easy");
    if (d === "medium") return t("questions.medium");
    return t("questions.hard");
  };

  /* ════ SETTINGS SCREEN ════ */
  if (showSettings) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Quizora" className="w-8 h-8 object-contain" />
              <span className="text-lg font-bold text-foreground hidden sm:inline">Quizora</span>
            </div>
            <button onClick={() => navigate("/dashboard")} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground">
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-violet-500/15 via-pink-500/10 to-violet-500/5 border border-violet-500/20">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{currentCourseName || t("questions.adaptiveQuiz")}</h1>
                <p className="text-sm text-muted-foreground">{currentCourseDescription || ""}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-foreground" />
              <h2 className="text-xl font-bold text-foreground">{t("quiz.settings")}</h2>
            </div>

            {/* Difficulty */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("quiz.difficultyLevel")}</h3>
              <div className="grid grid-cols-4 gap-2">
                {(["auto", "easy", "medium", "hard"] as DifficultyOption[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDifficulty(d)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      selectedDifficulty === d
                        ? "bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-lg shadow-violet-500/25"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-border/30"
                    }`}
                  >
                    {difficultyLabel(d)}
                  </button>
                ))}
              </div>
              {selectedDifficulty === "auto" && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-violet-400" />
                  {t("quiz.autoDesc")}
                </p>
              )}
            </div>

            {/* Count */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("quiz.numberOfQuestions")}</h3>
              <div className="grid grid-cols-5 gap-2">
                {questionCounts.map((count) => (
                  <button
                    key={count}
                    onClick={() => setSelectedCount(count)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      selectedCount === count
                        ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-border/30"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <Card className="bg-card/80 border border-border/30">
              <CardContent className="pt-5 pb-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">{t("quiz.details")}</h3>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { Icon: HelpCircle, bgColor: "bg-violet-500/15", iconColor: "text-violet-400", value: selectedCount, label: t("questions.questionsLabel") },
                    { Icon: Clock, bgColor: "bg-pink-500/15", iconColor: "text-pink-400", value: `${selectedCount * 2} ${t("quiz.min")}`, label: t("quiz.estimatedTime") },
                    { Icon: Sparkles, bgColor: "bg-amber-500/15", iconColor: "text-amber-400", value: difficultyLabel(selectedDifficulty), label: t("quiz.difficulty") },
                  ].map(({ Icon, bgColor, iconColor, value, label }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
                        <Icon className={`w-5 h-5 ${iconColor}`} />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* AI note */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/8 border border-violet-500/15">
              <Brain className="w-5 h-5 text-violet-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-violet-300">
                  {isAr ? "توليد بالذكاء الاصطناعي" : "AI-Powered Generation"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "الأسئلة تُولَّد بالوقت الفعلي وتتكيّف مع مستواك — قد يستغرق تحميل كل سؤال بضع ثوانٍ"
                    : "Questions are generated in real-time and adapt to your level — each question may take a few seconds to load"}
                </p>
              </div>
            </div>

            <Button
              onClick={handleStartQuiz}
              className="w-full py-6 text-lg rounded-2xl bg-gradient-to-r from-violet-600 via-pink-600 to-rose-600 text-white font-bold shadow-2xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] transition-all duration-300"
            >
              {t("quiz.startQuiz")}
              <ArrowRight className={`w-5 h-5 ms-2 ${isAr ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </div>

        <footer className="border-t border-border/50 bg-muted/30 py-4 text-center">
          <p className="text-sm text-muted-foreground">{t("app.copyright")}</p>
        </footer>
      </div>
    );
  }

  /* ════ FINISHED SCREEN ════ */
  if (finished) {
    const acc = questionNumber > 0 ? Math.round((totalCorrect / questionNumber) * 100) : 0;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Card className="max-w-md w-full bg-card/80 border border-border/30 text-center overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-violet-600 to-pink-600" />
          <CardHeader>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-violet-500/25">
              <Check className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl">{t("questions.sessionComplete")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t("questions.questionsLabel"), value: questionNumber, color: "text-violet-400" },
                { label: t("questions.correct"), value: totalCorrect, color: "text-emerald-400" },
                { label: t("questions.accuracy"), value: `${acc}%`, color: acc >= 70 ? "text-amber-400" : "text-rose-400" },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-xl bg-muted/30">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => navigate("/courses")}>
                {t("questions.backToCourses")}
              </Button>
              <Button
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold"
                onClick={handleEndSession}
              >
                {t("questions.viewReport")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ════ QUIZ SCREEN ════ */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <span className="text-lg font-bold text-primary">Quizora</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground">
              <Home className="w-5 h-5" />
            </button>
            <div className="text-sm text-muted-foreground">
              Q{questionNumber}/{selectedCount} · {totalCorrect} {t("questions.correct").toLowerCase()}
            </div>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-6 py-4 border-b border-border/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/courses")} className="text-muted-foreground hover:text-foreground">
              {isAr ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-base font-bold text-foreground">{currentCourseName || t("questions.adaptiveQuiz")}</h1>
              <p className="text-xs text-muted-foreground">{difficultyLabel(selectedDifficulty)} · {selectedCount} {t("questions.questionsLabel")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={handleEndSession}>
            {t("questions.endSession")}
          </Button>
        </div>
        <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-violet-600 to-pink-600 h-2 rounded-full transition-all duration-700"
            style={{ width: `${(questionNumber / selectedCount) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{questionNumber}/{selectedCount}</span>
          <span>{Math.round((questionNumber / selectedCount) * 100)}%</span>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">

        {/* LOADING with Skeleton */}
        {isLoading ? (
          <QuestionSkeleton message={loadingMessage || (isAr ? "🧠 جاري التوليد..." : "🧠 Generating...")} />
        ) : currentQuestion ? (
          <>
            <Card className="bg-card/80 border border-border/30 mb-5">
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-white font-bold shadow-md">
                    {questionNumber}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    currentQuestion.difficulty === "easy"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : currentQuestion.difficulty === "medium"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-rose-500/20 text-rose-400"
                  }`}>
                    {currentQuestion.difficulty === "easy"
                      ? t("questions.easy")
                      : currentQuestion.difficulty === "medium"
                      ? t("questions.medium")
                      : t("questions.hard")}
                  </span>
                  <div className="ms-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="w-3 h-3 text-violet-400" />
                    <span>{isAr ? "مولّد بالذكاء الاصطناعي" : "AI Generated"}</span>
                  </div>
                </div>
                <CardTitle className="text-xl leading-relaxed font-semibold" dir="auto">
                  {currentQuestion.content}
                </CardTitle>
              </CardHeader>

              <CardContent>
                <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer} className="space-y-3" disabled={showResult}>
                  {currentQuestion.answer_options
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((opt) => {
                      let optionStyle = "bg-muted/20 border-border/30 hover:bg-muted/40 hover:border-violet-500/30";
                      if (showResult) {
                        if (opt.is_correct) optionStyle = "bg-emerald-500/15 border-emerald-500/50";
                        else if (opt.id === selectedAnswer && !opt.is_correct) optionStyle = "bg-rose-500/15 border-rose-500/50";
                        else optionStyle = "bg-muted/10 border-border/20 opacity-50";
                      } else if (selectedAnswer === opt.id) {
                        optionStyle = "bg-violet-500/15 border-violet-500/50 shadow-sm";
                      }
                      return (
                        <div
                          key={opt.id}
                          className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${optionStyle}`}
                          onClick={() => !showResult && setSelectedAnswer(opt.id)}
                        >
                          <RadioGroupItem value={opt.id} id={opt.id} />
                          <Label htmlFor={opt.id} className="flex-1 cursor-pointer text-foreground" dir="auto">
                            {opt.content}
                          </Label>
                          {showResult && opt.is_correct && <Check className="w-5 h-5 text-emerald-400" />}
                        </div>
                      );
                    })}
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Result */}
            {showResult && lastResult && (
              <Card className={`mb-5 border ${lastResult.is_correct ? "bg-emerald-500/8 border-emerald-500/30" : "bg-rose-500/8 border-rose-500/30"}`}>
                <CardContent className="pt-5">
                  <p className="text-base font-bold mb-2" dir="auto">
                    {lastResult.is_correct ? t("questions.correctAnswer") : t("questions.wrongAnswer")}
                  </p>
                  {explanation && (
                    <div className="mt-3 p-4 rounded-xl bg-muted/20 text-sm leading-relaxed border border-border/20" dir="auto">
                      <div className="flex items-center gap-1.5 mb-2 text-violet-400">
                        <Lightbulb className="w-4 h-4" />
                        <span className="text-xs font-semibold">{isAr ? "الشرح" : "Explanation"}</span>
                      </div>
                      {explanation}
                    </div>
                  )}
                  {!explanation && (
                    <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={handleGetExplanation} disabled={loadingExplanation}>
                      {loadingExplanation
                        ? <><Loader2 className="w-4 h-4 me-2 animate-spin" />{t("questions.generating")}</>
                        : <><Lightbulb className="w-4 h-4 me-2" />{t("questions.showExplanation")}</>}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              {!showResult ? (
                <Button
                  disabled={!selectedAnswer || isSubmitting}
                  onClick={handleSubmitAnswer}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold px-8 shadow-lg shadow-violet-500/25 disabled:opacity-50"
                >
                  {isSubmitting
                    ? <><Loader2 className="w-4 h-4 me-2 animate-spin" />{t("questions.checking")}</>
                    : <><Check className="w-4 h-4 me-2" />{t("questions.submitAnswer")}</>}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold px-8 shadow-lg"
                >
                  {t("questions.nextQuestion")}
                  <ArrowRight className={`w-4 h-4 ms-2 ${isAr ? "rotate-180" : ""}`} />
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>

      <footer className="border-t border-border/50 bg-muted/30 py-4 text-center">
        <p className="text-sm text-muted-foreground">{t("app.copyright")}</p>
      </footer>
    </div>
  );
};

export default QuestionsPage;