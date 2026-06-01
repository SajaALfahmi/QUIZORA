import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Clock, PlayCircle, Sparkles, Loader2 } from "lucide-react";
import AppLayout from "./layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

interface ContinueCourse {
  sessionId: string;
  courseId: string;
  courseTitle: string;
  courseDescription?: string;
  totalQuestions: number;
  completedQuestions: number;
  remainingQuestions: number;
  progressPct: number;
  lastActivityAt: string;
}

const formatActivityDate = (dateString: string, locale: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
};

const ContinueLearningPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<ContinueCourse[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchProgress = async () => {
      setLoading(true);
      try {
        const { data: sessions } = await supabase
          .from("learning_sessions")
          .select("id, course_id, total_questions, started_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("started_at", { ascending: false });

        if (!sessions || sessions.length === 0) {
          setCourses([]);
          return;
        }

        const sessionIds = sessions.map((session) => session.id);
        const courseIds = [...new Set(sessions.map((session) => session.course_id))];

        const [{ data: coursesData }, { data: answersData }] = await Promise.all([
          supabase.from("courses").select("id, title, description").in("id", courseIds),
          supabase.from("user_answers").select("session_id, answered_at").in("session_id", sessionIds),
        ]);

        const answerStats = answersData?.reduce((acc, answer) => {
          const sessionId = answer.session_id;
          const copy = acc.get(sessionId) ?? { count: 0, lastActivity: "" };
          const answeredAt = answer.answered_at || "";
          return acc.set(sessionId, {
            count: copy.count + 1,
            lastActivity:
              answeredAt && (!copy.lastActivity || new Date(answeredAt) > new Date(copy.lastActivity))
                ? answeredAt
                : copy.lastActivity,
          });
        }, new Map<string, { count: number; lastActivity: string }>());

        const latestSessionByCourse = new Map<string, typeof sessions[0]>();
        sessions.forEach((session) => {
          const existing = latestSessionByCourse.get(session.course_id);
          if (!existing || new Date(session.started_at) > new Date(existing.started_at)) {
            latestSessionByCourse.set(session.course_id, session);
          }
        });

        const items = Array.from(latestSessionByCourse.values()).map((session) => {
          const course = coursesData?.find((course) => course.id === session.course_id);
          const stats = answerStats?.get(session.id) ?? { count: 0, lastActivity: session.started_at };
          const totalQuestions = session.total_questions ?? 25;
          const completedQuestions = stats.count;
          const remainingQuestions = Math.max(0, totalQuestions - completedQuestions);
          const progressPct = totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100) : 0;
          return {
            sessionId: session.id,
            courseId: session.course_id,
            courseTitle: course?.title ?? session.course_id,
            courseDescription: course?.description ?? "",
            totalQuestions,
            completedQuestions,
            remainingQuestions,
            progressPct,
            lastActivityAt: stats.lastActivity || session.started_at,
          };
        });

        items.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
        setCourses(items);
      } catch (error) {
        console.error(error);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [user]);

  return (
    <AppLayout>
      <div className="px-8 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted/40 border border-border/50 mb-6">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground font-medium">{t("dashboard.hub")}</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t("dashboard.continueLearning")} 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">{t("dashboard.title")}</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">{t("dashboard.continueLearningDesc")}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-72">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : courses.length === 0 ? (
          <Card className="bg-card/80 border border-border/30 text-center p-10">
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary">
                <PlayCircle className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">{t("dashboard.noProgressYet")}</h3>
              <p className="text-sm text-muted-foreground">{t("dashboard.startNewCourse")}</p>
              <Button className="mx-auto bg-gradient-to-r from-primary to-secondary text-foreground rounded-xl" onClick={() => navigate("/courses") }>
                {t("dashboard.startNow")}
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {courses.map((course) => (
              <Card key={course.sessionId} className="bg-card/80 border border-border/30 shadow-card p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-foreground">{course.courseTitle}</h3>
                    <p className="text-sm text-muted-foreground">{course.completedQuestions} / {course.totalQuestions} {t("dashboard.questionsCompleted")}</p>
                  </div>
                  <div className="rounded-full px-3 py-1 text-xs font-semibold bg-primary/10 text-primary">
                    {course.progressPct}%
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("dashboard.completed")}</span>
                    <span>{course.completedQuestions}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("dashboard.remainingQuestions")}</span>
                    <span>{course.remainingQuestions}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("dashboard.lastActivity")}</span>
                    <span>{formatActivityDate(course.lastActivityAt, isAr ? "ar-EG" : "en-US")}</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-xl"
                  onClick={() => navigate("/questions", {
                    state: {
                      resumeSessionId: course.sessionId,
                      courseId: course.courseId,
                      courseName: course.courseTitle,
                      courseDescription: course.courseDescription,
                    },
                  })}
                >
                  {t("dashboard.continueCourse")} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ContinueLearningPage;
