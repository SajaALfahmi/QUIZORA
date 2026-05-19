import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, BookOpen, Home, Loader2, Lightbulb, ArrowRight, Settings, Clock, HelpCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adaptiveEngine, aiService } from "@/services/adaptiveEngine";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
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

const QuestionsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { courseId, courseName, courseDescription } = (location.state as any) || {};

  // Quiz settings state
  const [showSettings, setShowSettings] = useState(true);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyOption>("auto");
  const [selectedCount, setSelectedCount] = useState(25);

  // Quiz state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    totalIntervalRef.current = setInterval(() => { totalTimerRef.current += 1; }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (totalIntervalRef.current) clearInterval(totalIntervalRef.current);
    };
  }, []);

  const handleStartQuiz = async () => {
    setShowSettings(false);
    setIsLoading(true);
    try {
      if (!courseId) {
        toast({ title: "Error", description: "Please select a course to start the quiz.", variant: "destructive" });
        navigate("/courses");
        return;
      }

      // ✅ Pass difficulty to session
      const result = await adaptiveEngine.startSession(courseId, selectedCount, selectedDifficulty);
      setSessionId(result.session.id);
      await fetchNextQuestion(result.session.id);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      navigate("/courses");
    }
  };

  const fetchNextQuestion = async (sid: string) => {
    try {
      setIsLoading(true); setShowResult(false); setSelectedAnswer(""); setExplanation(null); setLastResult(null);
      if (questionNumber >= selectedCount) { setFinished(true); setIsLoading(false); return; }
      const result = await adaptiveEngine.getNextQuestion(sid);
      if (result.finished) { setFinished(true); setIsLoading(false); return; }
      if (!result.question) {
        throw new Error("No question returned from adaptive engine.");
      }
      setCurrentQuestion(result.question);
      setQuestionNumber((p) => p + 1);
      setIsLoading(false);
      timerRef.current = 0;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => { timerRef.current += 1; }, 1000);
    } catch (error: any) { toast({ title: "Error", description: error.message, variant: "destructive" }); setIsLoading(false); }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !currentQuestion || !sessionId) return;
    setIsSubmitting(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      const result = await adaptiveEngine.submitAnswer({ session_id: sessionId, question_id: currentQuestion.id, selected_option_id: selectedAnswer, time_spent_seconds: timerRef.current });
      setLastResult(result); setShowResult(true);
      if (result.is_correct) setTotalCorrect((p) => p + 1);
      if (result.explanation) setExplanation(result.explanation);
    } catch (error: any) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  };

  const handleGetExplanation = async () => {
    if (!currentQuestion) return;
    setLoadingExplanation(true);
    try {
      const selectedOpt = currentQuestion.answer_options.find((o) => o.id === selectedAnswer);
      const correctOpt = currentQuestion.answer_options.find((o) => o.is_correct);
      const result = await aiService.generateExplanation({ question_id: currentQuestion.id, user_answer: selectedOpt?.content, correct_answer: correctOpt?.content });
      setExplanation(result.explanation);
    } catch (error: any) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    finally { setLoadingExplanation(false); }
  };

  const handleNext = () => {
    if (questionNumber >= selectedCount) {
      if (totalIntervalRef.current) clearInterval(totalIntervalRef.current);
      setFinished(true);
      return;
    }
    if (sessionId) fetchNextQuestion(sessionId);
  };

  const handleEndSession = async () => {
    if (totalIntervalRef.current) clearInterval(totalIntervalRef.current);
    if (sessionId) await adaptiveEngine.endSession(sessionId);
    navigate("/evaluation", { state: { totalQuestions: questionNumber, totalCorrect, sessionId, timeSpentSeconds: totalTimerRef.current } });
  };

  const difficultyLabel = (d: DifficultyOption) => {
    if (d === "auto") return t("quiz.auto");
    if (d === "easy") return t("questions.easy");
    if (d === "medium") return t("questions.medium");
    return t("questions.hard");
  };

  const estimatedTime = selectedCount * 2;

  // Quiz Settings Screen
  if (showSettings) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Quizora" className="w-8 h-8 object-contain" />
              <span className="text-lg font-bold text-foreground hidden sm:inline">Quizora</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/dashboard")} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"><Home className="w-5 h-5" /></button>
            </div>
          </div>
        </header>

        <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
          {/* Course header */}
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/10 border border-primary/20">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <BookOpen className="w-7 h-7 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{courseName || t("questions.adaptiveQuiz")}</h1>
                <p className="text-sm text-muted-foreground">{courseDescription || ""}</p>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-foreground" />
              <h2 className="text-xl font-bold text-foreground">{t("quiz.settings")}</h2>
            </div>

            {/* Difficulty Level */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("quiz.difficultyLevel")}</h3>
              <div className="grid grid-cols-4 gap-2">
                {(["auto", "easy", "medium", "hard"] as DifficultyOption[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDifficulty(d)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${selectedDifficulty === d
                      ? d === "auto"
                        ? "bg-gradient-to-r from-primary to-secondary text-foreground shadow-lg"
                        : "bg-primary text-primary-foreground shadow-lg"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-border/30"
                      }`}
                  >
                    {difficultyLabel(d)}
                  </button>
                ))}
              </div>
              {selectedDifficulty === "auto" && (
                <p className="text-xs text-muted-foreground mt-2">{t("quiz.autoDesc")}</p>
              )}
            </div>

            {/* Number of Questions */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("quiz.numberOfQuestions")}</h3>
              <div className="grid grid-cols-5 gap-2">
                {questionCounts.map((count) => (
                  <button
                    key={count}
                    onClick={() => setSelectedCount(count)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${selectedCount === count
                      ? "bg-accent text-accent-foreground shadow-lg"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-border/30"
                      }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Quiz Details Summary */}
            <Card className="bg-card/80 border border-border/30">
              <CardContent className="pt-5 pb-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">{t("quiz.details")}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                      <HelpCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{selectedCount}</p>
                      <p className="text-xs text-muted-foreground">{t("questions.questionsLabel")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{estimatedTime} {t("quiz.min")}</p>
                      <p className="text-xs text-muted-foreground">{t("quiz.estimatedTime")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{difficultyLabel(selectedDifficulty)}</p>
                      <p className="text-xs text-muted-foreground">{t("quiz.difficulty")}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Start Button */}
            <Button
              onClick={handleStartQuiz}
              className="w-full py-6 text-lg rounded-2xl bg-gradient-to-r from-primary via-secondary to-accent text-foreground font-bold shadow-[0_0_40px_hsl(330_85%_60%/0.25)] hover:shadow-[0_0_60px_hsl(330_85%_60%/0.4)] hover:scale-[1.02] transition-all duration-300"
            >
              {t("quiz.startQuiz")}
              <ArrowRight className={`w-5 h-5 ${language === "ar" ? "mr-2 rotate-180" : "ml-2"}`} />
            </Button>
          </div>
        </div>

        <footer className="border-t border-border/50 bg-muted/30 py-4 text-center"><p className="text-sm text-muted-foreground">© 2026 Quizora. All rights reserved.</p></footer>
      </div>
    );
  }

  // Session Complete Screen
  if (finished) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Card className="max-w-md w-full bg-card/80 border border-border/30 text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-4"><Check className="w-8 h-8 text-foreground" /></div>
            <CardTitle className="text-2xl">{t("questions.sessionComplete")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/30"><p className="text-2xl font-bold text-primary">{questionNumber}</p><p className="text-sm text-muted-foreground">{t("questions.questionsLabel")}</p></div>
              <div className="p-4 rounded-xl bg-muted/30"><p className="text-2xl font-bold text-green-500">{totalCorrect}</p><p className="text-sm text-muted-foreground">{t("questions.correct")}</p></div>
            </div>
            <p className="text-lg font-semibold">{t("questions.accuracy")}: {questionNumber > 0 ? Math.round((totalCorrect / questionNumber) * 100) : 0}%</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => navigate("/courses")}>{t("questions.backToCourses")}</Button>
              <Button className="flex-1 rounded-xl bg-gradient-to-r from-primary to-secondary" onClick={handleEndSession}>{t("questions.viewReport")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quiz Screen
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Quizora" className="w-8 h-8 object-contain" />
            <span className="text-lg font-bold text-foreground hidden sm:inline">Quizora</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"><Home className="w-5 h-5" /></button>
            <div className="text-sm text-muted-foreground">Q{questionNumber}/{selectedCount} · {totalCorrect} {t("questions.correct").toLowerCase()}</div>
          </div>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/courses")} className="text-muted-foreground hover:text-foreground">
              {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">{courseName || t("questions.adaptiveQuiz")}</h1>
              <p className="text-sm text-muted-foreground">{difficultyLabel(selectedDifficulty)} · {selectedCount} {t("questions.questionsLabel")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={handleEndSession}>{t("questions.endSession")}</Button>
        </div>
        {/* Progress bar */}
        <div className="mt-3 w-full bg-muted/30 rounded-full h-2">
          <div className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-500" style={{ width: `${(questionNumber / selectedCount) * 100}%` }} />
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary mb-4" /><p className="text-muted-foreground">{t("questions.loadingQuestion")}</p></div>
        ) : currentQuestion ? (
          <>
            <Card className="bg-card/80 border border-border/30 mb-6">
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-foreground font-bold">{questionNumber}</div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${currentQuestion.difficulty === "easy" ? "bg-green-500/20 text-green-400" : currentQuestion.difficulty === "medium" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                    {currentQuestion.difficulty === "easy" ? t("questions.easy") : currentQuestion.difficulty === "medium" ? t("questions.medium") : t("questions.hard")}
                  </span>
                </div>
                <CardTitle className="text-xl leading-relaxed" dir="auto">{currentQuestion.content}</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer} className="space-y-3" disabled={showResult}>
                  {currentQuestion.answer_options.sort((a, b) => a.order_index - b.order_index).map((opt) => {
                    let optionStyle = "bg-muted/20 border-border/30 hover:bg-muted/40";
                    if (showResult) {
                      if (opt.is_correct) optionStyle = "bg-green-500/20 border-green-500/50";
                      else if (opt.id === selectedAnswer && !opt.is_correct) optionStyle = "bg-red-500/20 border-red-500/50";
                      else optionStyle = "bg-muted/10 border-border/20 opacity-60";
                    } else if (selectedAnswer === opt.id) optionStyle = "bg-primary/10 border-primary/50";
                    return (
                      <div key={opt.id} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${optionStyle}`} onClick={() => !showResult && setSelectedAnswer(opt.id)}>
                        <RadioGroupItem value={opt.id} id={opt.id} />
                        <Label htmlFor={opt.id} className="flex-1 cursor-pointer text-foreground" dir="auto">{opt.content}</Label>
                        {showResult && opt.is_correct && <Check className="w-5 h-5 text-green-400" />}
                      </div>
                    );
                  })}
                </RadioGroup>
              </CardContent>
            </Card>

            {showResult && lastResult && (
              <Card className={`mb-6 border ${lastResult.is_correct ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                <CardContent className="pt-6">
                  <p className="text-lg font-bold mb-2" dir="auto">{lastResult.is_correct ? t("questions.correctAnswer") : t("questions.wrongAnswer")}</p>
                  {explanation && <div className="mt-3 p-4 rounded-xl bg-muted/20 text-sm leading-relaxed" dir="auto">{explanation}</div>}
                  {!explanation && (
                    <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={handleGetExplanation} disabled={loadingExplanation}>
                      {loadingExplanation ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("questions.generating")}</> : <><Lightbulb className="w-4 h-4 mr-2" />{t("questions.showExplanation")}</>}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-3">
              {!showResult ? (
                <Button disabled={!selectedAnswer || isSubmitting} onClick={handleSubmitAnswer} className="rounded-xl bg-gradient-to-r from-primary to-secondary text-foreground font-semibold px-8">
                  {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("questions.checking")}</> : <><Check className="w-4 h-4 mr-2" />{t("questions.submitAnswer")}</>}
                </Button>
              ) : (
                <Button onClick={handleNext} className="rounded-xl bg-gradient-to-r from-primary to-secondary text-foreground font-semibold px-8">
                  {t("questions.nextQuestion")} <ArrowRight className={`w-4 h-4 ${language === "ar" ? "mr-2 rotate-180" : "ml-2"}`} />
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>

      <footer className="border-t border-border/50 bg-muted/30 py-4 text-center"><p className="text-sm text-muted-foreground">© 2026 Quizora. All rights reserved.</p></footer>
    </div>
  );
};

export default QuestionsPage;