import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, HelpCircle, BarChart3, ArrowRight, Sparkles, FileText, Trophy, Target, Clock } from "lucide-react";
import AppLayout from "./layout/AppLayout";
import { useUserStats } from "@/hooks/useUserStats";
import { useLanguage } from "@/contexts/LanguageContext";

const Dashboard = () => {
  const navigate = useNavigate();
  const stats = useUserStats();
  const { t } = useLanguage();

  const mainOptions = [
    { title: t("dashboard.learningTrack"), description: t("dashboard.learningTrackDesc"), icon: BookOpen, path: "/courses", color: "from-primary to-primary/40" },
    { title: t("dashboard.questions"), description: t("dashboard.questionsDesc"), icon: HelpCircle, path: "/questions", color: "from-accent to-accent/40" },
    { title: t("dashboard.evaluation"), description: t("dashboard.evaluationDesc"), icon: BarChart3, path: "/evaluation", color: "from-secondary to-secondary/40" },
  ];

  const statCards = [
    { label: t("dashboard.questionsAnswered"), value: stats.totalQuestions, icon: Target },
    { label: t("dashboard.avgScore"), value: `${stats.averageScore}%`, icon: Trophy },
    { label: t("dashboard.studyTime"), value: `${Math.round(stats.totalStudyTimeMinutes / 60)}h`, icon: Clock },
  ];

  return (
    <AppLayout>
      <div className="px-8 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted/40 border border-border/50 mb-6">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground font-medium">{t("dashboard.hub")}</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t("dashboard.learning")}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">{t("dashboard.title")}</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">{t("dashboard.chooseOption")}</p>
        </div>

        {!stats.loading && stats.totalQuestions > 0 && (
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mb-10">
            {statCards.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label} className="bg-card/80 border border-border/30 p-4 text-center">
                  <Icon className="w-5 h-5 text-primary mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </Card>
              );
            })}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-10">
          {mainOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Card key={option.title} className="bg-card/80 border border-border/30 hover:border-primary/50 transition-all duration-300 cursor-pointer p-6 text-center" onClick={() => navigate(option.path)}>
                <div className={`p-4 rounded-2xl bg-gradient-to-br ${option.color} w-fit mx-auto mb-4`}>
                  <Icon className="w-8 h-8 text-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{option.title}</h3>
                <p className="text-sm text-muted-foreground mb-5">{option.description}</p>
                <Button className="w-full bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl">
                  {t("dashboard.startNow")}<ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="bg-card/80 border border-border/30 hover:border-primary/50 transition-all duration-300 cursor-pointer max-w-4xl mx-auto" onClick={() => navigate("/reports")}>
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary"><FileText className="w-7 h-7 text-foreground" /></div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{t("dashboard.reportsAnalytics")}</h3>
                <p className="text-sm text-muted-foreground">{t("dashboard.reportsDesc")}</p>
              </div>
            </div>
            <Button className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl">
              {t("dashboard.viewReports")}<ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
