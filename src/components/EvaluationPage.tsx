import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Loader2, BookOpen, PlayCircle, Clock, CheckCircle2, ArrowRight,
  Sparkles, Trophy, FileText, RefreshCw,
} from "lucide-react";
import AppLayout from "./layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

interface CourseScore {
  courseId:   string;
  courseName: string;
  score:      number;
  correct:    number;
  total:      number;
  sessions:   number;
}

interface InProgressCourse {
  sessionId:  string;
  courseId:   string;
  courseName: string;
  answeredQ:  number;
  totalQ:     number;
  startedAt:  string;
  pct:        number;
}

const EvaluationPage = () => {
  const navigate        = useNavigate();
  const { language }    = useLanguage();
  const { user }        = useAuth();
  const location        = useLocation();
  const isAr            = language === "ar";

  const stateData = (location.state as any) || {};
  useEffect(() => {
    if (stateData.sessionId) {
      localStorage.setItem("lastEvaluation", JSON.stringify(stateData));
    }
  }, []);

  const [loading, setLoading]           = useState(true);
  const [courseScores, setCourseScores] = useState<CourseScore[]>([]);
  const [inProgress,   setInProgress]  = useState<InProgressCourse[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      if (!user) { setLoading(false); return; }
      setLoading(true);
      try {

        /* 1 — الكورسات المكتملة */
        const { data: completedSessions } = await supabase
          .from("learning_sessions")
          .select("id, course_id, correct_answers, total_questions")
          .eq("user_id", user.id)
          .eq("status", "completed");

        if (completedSessions && completedSessions.length > 0) {
          const uniqueCourseIds = [...new Set(completedSessions.map((s) => s.course_id))];
          const [{ data: courses }, { data: allSkills }] = await Promise.all([
            supabase.from("courses").select("id, title").in("id", uniqueCourseIds),
            supabase.from("skills").select("id, course_id").in("course_id", uniqueCourseIds),
          ]);
          const skillIds = (allSkills ?? []).map((s) => s.id);
          const { data: masteryLevels } = await supabase
            .from("user_skill_levels")
            .select("skill_id, mastery_level")
            .eq("user_id", user.id)
            .in("skill_id", skillIds);

          const sessionIds = completedSessions.map((s) => s.id);
          const { data: allAnswers } = await supabase
            .from("user_answers").select("session_id, is_correct").in("session_id", sessionIds);

          const courseMap: Record<string, { correct: number; total: number; sessions: number }> = {};
          completedSessions.forEach((s) => {
            if (!courseMap[s.course_id]) courseMap[s.course_id] = { correct: 0, total: 0, sessions: 0 };
            courseMap[s.course_id].sessions += 1;
          });
          (allAnswers ?? []).forEach((ans) => {
            const session = completedSessions.find((s) => s.id === ans.session_id);
            if (!session) return;
            courseMap[session.course_id].total += 1;
            if (ans.is_correct) courseMap[session.course_id].correct += 1;
          });

          const scores: CourseScore[] = Object.entries(courseMap).map(([cid, data]) => {
            const courseSkills    = (allSkills ?? []).filter((s) => s.course_id === cid);
            const courseMasteries = (masteryLevels ?? []).filter((m) =>
              courseSkills.some((s) => s.id === m.skill_id)
            );
            const bktScore = courseMasteries.length > 0
              ? Math.round(courseMasteries.reduce((sum, m) => sum + m.mastery_level, 0) / courseMasteries.length * 100)
              : data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
            return {
              courseId:   cid,
              courseName: courses?.find((c) => c.id === cid)?.title ?? cid,
              score: bktScore, correct: data.correct, total: data.total, sessions: data.sessions,
            };
          });
          scores.sort((a, b) => b.score - a.score);
          setCourseScores(scores);
        }

        /* 2 — الكورسات غير المكتملة */
        const { data: activeSessions } = await supabase
          .from("learning_sessions")
          .select("id, course_id, total_questions, started_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("started_at", { ascending: false });

        if (activeSessions && activeSessions.length > 0) {
          const activeCourseIds = [...new Set(activeSessions.map((s) => s.course_id))];
          const { data: activeCourses } = await supabase
            .from("courses").select("id, title").in("id", activeCourseIds);
          const { data: activeAnswers } = await supabase
            .from("user_answers").select("session_id")
            .in("session_id", activeSessions.map((s) => s.id));

          const answersCountMap: Record<string, number> = {};
          (activeAnswers ?? []).forEach((a) => {
            answersCountMap[a.session_id] = (answersCountMap[a.session_id] ?? 0) + 1;
          });

          const seenCourses = new Set<string>();
          const inProgressList: InProgressCourse[] = [];
          for (const s of activeSessions) {
            if (seenCourses.has(s.course_id)) continue;
            seenCourses.add(s.course_id);
            const answered = answersCountMap[s.id] ?? 0;
            const total    = s.total_questions ?? 10;
            inProgressList.push({
              sessionId:  s.id,
              courseId:   s.course_id,
              courseName: activeCourses?.find((c) => c.id === s.course_id)?.title ?? s.course_id,
              answeredQ:  answered,
              totalQ:     total,
              startedAt:  s.started_at,
              pct:        total > 0 ? Math.round((answered / total) * 100) : 0,
            });
          }
          setInProgress(inProgressList);
        }

      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [user]);

  const getLevel = (score: number) =>
    score >= 90 ? { label: isAr ? "خبير"  : "Expert",       color: "text-primary", bg: "bg-primary/10 border-primary/30" } :
    score >= 75 ? { label: isAr ? "متقدم" : "Advanced",     color: "text-secondary", bg: "bg-secondary/10 border-secondary/30" } :
    score >= 60 ? { label: isAr ? "متوسط" : "Intermediate", color: "text-accent",  bg: "bg-accent/10 border-accent/30"  } :
    score >= 40 ? { label: isAr ? "مبتدئ" : "Beginner",     color: "text-muted-foreground", bg: "bg-muted/15 border-muted/30" } :
                 { label: isAr ? "جديد"  : "Newcomer",     color: "text-muted-foreground", bg: "bg-muted/15 border-muted/30" };

  const getBarColor = (score: number) =>
    score >= 80 ? "bg-gradient-to-r from-primary to-secondary" :
    score >= 60 ? "bg-gradient-to-r from-secondary to-accent" :
                 "bg-gradient-to-r from-primary/70 to-accent/80";

  const totalCompletedCourses = courseScores.length;
  const totalActiveSessions = inProgress.length;
  const averageScore = totalCompletedCourses > 0
    ? Math.round(courseScores.reduce((sum, course) => sum + course.score, 0) / totalCompletedCourses)
    : 0;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const isEmpty = inProgress.length === 0 && courseScores.length === 0;

  return (
    <AppLayout>
      <div className="px-4 py-8 sm:px-6 max-w-6xl mx-auto space-y-10">
        <div className="grid gap-6 xl:grid-cols-[1.9fr_1fr] items-start">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              <Sparkles className="w-4 h-4" />
              {isAr ? "ملخص التقييم" : "Evaluation Summary"}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl font-black text-foreground">
                {isAr ? "أداء التعلم الخاص بك" : "Your Learning Performance"}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {isAr
                  ? "راقب تقدمك ومؤشرات الأداء في صفحة أنيقة ومتناسقة مع نظام Quizora."
                  : "Track your progress and performance indicators in a clean page that matches Quizora’s visual identity."}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="bg-card/90 border border-border/30 p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {isAr ? "الكورسات المكتملة" : "Completed"}
                  </p>
                  <p className="text-2xl font-black text-foreground">{totalCompletedCourses}</p>
                </div>
                <div className="rounded-2xl bg-secondary/10 p-3 text-secondary">
                  <Trophy className="w-5 h-5" />
                </div>
              </div>
            </Card>
            <Card className="bg-card/90 border border-border/30 p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {isAr ? "المعدل العام" : "Average Score"}
                  </p>
                  <p className="text-2xl font-black text-foreground">{averageScore}%</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
            </Card>
            <Card className="bg-card/90 border border-border/30 p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {isAr ? "جلسات نشطة" : "Active Sessions"}
                  </p>
                  <p className="text-2xl font-black text-foreground">{totalActiveSessions}</p>
                </div>
                <div className="rounded-2xl bg-accent/10 p-3 text-accent">
                  <PlayCircle className="w-5 h-5" />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ══ فارغة ══ */}
        {isEmpty && (
          <Card className="bg-card/90 border border-border/30 text-center py-20 shadow-card">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {isAr ? "لا يوجد تقييم بعد" : "No Evaluations Yet"}
              </h3>
              <p className="text-muted-foreground max-w-sm">
                {isAr
                  ? "ابدأ أول جلسة تدريبية لترى تقييمك ومستواك هنا"
                  : "Start your first training session to see your evaluation and progress here"}
              </p>
              <Button
                className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl px-8 mt-4 shadow-button"
                onClick={() => navigate("/courses")}
              >
                <BookOpen className="w-4 h-4 me-2" />
                {isAr ? "ابدأ الآن" : "Start Now"}
              </Button>
            </div>
          </Card>
        )}

        {/* ══ أكمل من حيث توقفت ══ */}
        {inProgress.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20">
                <PlayCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground">
                  {isAr ? "أكمل من حيث توقفت" : "Continue Where You Left Off"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isAr
                    ? `لديك ${inProgress.length} كورس${inProgress.length > 1 ? "ات" : ""} لم تكملها بعد`
                    : `You have ${inProgress.length} unfinished course${inProgress.length > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {inProgress.map((course) => {
                const daysAgo   = Math.floor((Date.now() - new Date(course.startedAt).getTime()) / 86400000);
                const remaining = course.totalQ - course.answeredQ;
                return (
                  <Card key={course.sessionId} className="bg-card/90 border border-border/30 shadow-card hover:border-primary/50 transition-all duration-300 overflow-hidden group">
                    <div className="h-1 bg-gradient-to-r from-primary to-secondary" />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-foreground truncate mb-1">{course.courseName}</h4>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3 text-primary" />
                            <span>
                              {daysAgo === 0 ? (isAr ? "بدأت اليوم" : "Started today")
                              : daysAgo === 1 ? (isAr ? "بدأت أمس"  : "Started yesterday")
                              : isAr ? `منذ ${daysAgo} أيام` : `${daysAgo} days ago`}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ms-3 w-14 h-14 rounded-full border-2 border-primary/40 bg-primary/10 flex flex-col items-center justify-center">
                          <span className="text-base font-black text-primary leading-none">{course.pct}%</span>
                          <span className="text-[9px] text-muted-foreground">{isAr ? "مكتمل" : "done"}</span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-secondary" />
                            {course.answeredQ} {isAr ? "سؤال أجبت" : "answered"}
                          </span>
                          <span className="text-secondary font-medium">
                            {remaining} {isAr ? "متبقي" : "remaining"}
                          </span>
                        </div>
                        <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-700"
                            style={{ width: `${course.pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                          <span>0</span>
                          <span>{course.totalQ} {isAr ? "سؤال" : "questions"}</span>
                        </div>
                      </div>

                      <Button
                        className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-xl shadow-button hover:shadow-primary/30 group-hover:scale-[1.02] transition-all duration-300"
                        onClick={() => navigate("/questions", {
                          state: {
                            courseId:        course.courseId,
                            courseName:      course.courseName,
                            resumeSessionId: course.sessionId,
                          },
                        })}
                      >
                        <PlayCircle className="w-4 h-4 me-2" />
                        {isAr ? "أكمل الكورس" : "Continue Course"}
                        <ArrowRight className={`w-4 h-4 ms-2 ${isAr ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ نتيجة كل كورس ══ */}
        {courseScores.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground">
                  {isAr ? "نتيجتك لكل كورس" : "Your Score Per Course"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isAr ? "مستوى الإتقان محسوب بخوارزمية BKT" : "Mastery level calculated using BKT algorithm"}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courseScores.map((course) => {
                const lvl = getLevel(course.score);
                return (
                  <Card key={course.courseId} className="bg-card/90 border border-border/30 shadow-card hover:border-primary/50 transition-all duration-300 overflow-hidden">
                    <div className={`h-1 ${getBarColor(course.score)}`} />
                    <div className="p-5">
                      <h4 className="text-sm font-bold text-foreground truncate mb-4">{course.courseName}</h4>

                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart
                              cx="50%" cy="50%"
                              innerRadius="60%" outerRadius="100%"
                              startAngle={90}
                              endAngle={90 - (course.score / 100) * 360}
                              data={[{ value: course.score, fill: "hsl(var(--primary))" }]}
                            >
                              <RadialBar dataKey="value" background={{ fill: "hsl(var(--card))" }} cornerRadius={6} />
                            </RadialBarChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-black text-foreground">{course.score}%</span>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border mb-3 ${lvl.bg} ${lvl.color}`}>
                            {lvl.label}
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{isAr ? "الأسئلة" : "Questions"}</span>
                              <span className="text-foreground font-semibold">{course.total}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{isAr ? "صحيحة" : "Correct"}</span>
                              <span className="text-secondary font-semibold">{course.correct}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{isAr ? "خاطئة" : "Wrong"}</span>
                              <span className="text-accent font-semibold">{course.total - course.correct}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{isAr ? "الجلسات" : "Sessions"}</span>
                              <span className="text-primary font-semibold">{course.sessions}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${getBarColor(course.score)}`}
                          style={{ width: `${course.score}%` }}
                        />
                      </div>

                      <Button
                        className="w-full mt-3 rounded-xl bg-gradient-to-r from-secondary to-accent text-foreground font-semibold text-xs shadow-button hover:shadow-accent/30"
                        onClick={() => navigate("/courses")}
                      >
                        <RefreshCw className="w-3 h-3 me-1.5" />
                        {isAr ? "تدرب مجدداً" : "Retrain"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ زر التقارير ══ */}
        {!isEmpty && (
          <div className="flex justify-center pt-2">
            <Button
              className="bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-xl px-10 py-5 shadow-button hover:shadow-primary/30"
              onClick={() => navigate("/reports")}
            >
              <FileText className="w-4 h-4 me-2" />
              {isAr ? "عرض التقارير التفصيلية" : "View Detailed Reports"}
            </Button>
          </div>
        )}

      </div>
    </AppLayout>
  );
};

export default EvaluationPage;