import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Target, TrendingUp, FileText, Star, RefreshCw, Loader2 } from "lucide-react";
import AppLayout from "./layout/AppLayout";
import { useUserStats } from "@/hooks/useUserStats";
import { useLanguage } from "@/contexts/LanguageContext";

const EvaluationPage = () => {
  const navigate = useNavigate();
  const stats = useUserStats();
  const { t, language } = useLanguage();
  const location = useLocation();
const { timeSpentSeconds = 0 } = (location.state as any) || {};
const timeMinutes = Math.floor(timeSpentSeconds / 60);
const timeSeconds = timeSpentSeconds % 60;

  if (stats.loading) {
    return <AppLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  }

  const overallScore = stats.averageScore;
  const skillScores = stats.skillLevels.map((s) => ({ name: s.skill_name, score: Math.round(s.mastery_level * 100) }));

  const categories = [
    { name: t("eval.overallAccuracy"), score: overallScore, icon: Brain, color: "from-primary to-primary/40" },
    { name: t("eval.questionsAttempted"), score: Math.min(100, Math.round((stats.totalQuestions / Math.max(1, stats.totalQuestions + 10)) * 100)), icon: Target, color: "from-secondary to-secondary/40" },
    { name: t("eval.completionRate"), score: stats.totalSessions > 0 ? Math.round((stats.completedSessions / stats.totalSessions) * 100) : 0, icon: TrendingUp, color: "from-accent to-accent/40" },
    { name: t("eval.streak"), score: Math.min(100, stats.currentStreak * 10), icon: Star, color: "from-primary to-secondary/40" },
  ];

  const getLabel = (score: number) => score >= 80 ? t("eval.strong") : score >= 60 ? t("eval.good") : t("eval.needsWork");

  const strengths: string[] = [];
  const improvements: string[] = [];
  const recommendations: string[] = [];

  const isAr = language === "ar";

  if (overallScore >= 70) strengths.push(isAr ? "دقة شاملة جيدة في جميع التقييمات" : "Good overall accuracy across assessments");
  if (stats.completedSessions >= 3) strengths.push(isAr ? `أكملت ${stats.completedSessions} جلسات تعلم` : `Completed ${stats.completedSessions} learning sessions`);
  if (stats.currentStreak >= 2) strengths.push(isAr ? `حافظت على سلسلة ${stats.currentStreak} أيام متتالية` : `Maintained a ${stats.currentStreak}-day learning streak`);
  if (strengths.length === 0) strengths.push(isAr ? "أنت في البداية — استمر!" : "You're just getting started — keep going!");

  skillScores.filter((s) => s.score < 50).forEach((s) => improvements.push(isAr ? `تحسين الإتقان في ${s.name}` : `Improve mastery in ${s.name}`));
  if (stats.completedSessions < stats.totalSessions) improvements.push(isAr ? "أكمل جلساتك غير المنتهية" : "Complete your in-progress sessions");
  if (improvements.length === 0) improvements.push(isAr ? "واصل التدرب للحفاظ على مستواك" : "Keep practicing to maintain your skills");

  recommendations.push(isAr ? "تدرّب يومياً لبناء سلسلة أطول" : "Practice daily to build a longer streak");
  if (stats.totalQuestions < 50) recommendations.push(isAr ? "أجب على مزيد من الأسئلة للحصول على رؤى دقيقة" : "Answer more questions to get accurate insights");
  recommendations.push(isAr ? "راجع الشرح بعد كل سؤال لفهم أعمق" : "Review explanations after each question for deeper understanding");

  return (
    <AppLayout>
      <div className="px-8 py-10 max-w-5xl mx-auto space-y-8">
        <Card className="bg-card/80 border border-border/30 text-center py-10">
          <div className="w-28 h-28 mx-auto mb-4 rounded-full border-4 border-primary/50 flex items-center justify-center bg-gradient-to-br from-card to-muted">
            <span className="text-4xl font-bold text-foreground">{overallScore}</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t("eval.overallScore")}</h2>
          <Badge className="bg-accent/20 text-accent border-0 text-sm px-4 py-1 mb-3">{getLabel(overallScore)}</Badge>
          {timeSpentSeconds > 0 && (
  <p className="text-muted-foreground mt-2">
    ⏱ الوقت المستغرق: {timeMinutes}m {timeSeconds}s
  </p>
)}
          <p className="text-muted-foreground">{stats.totalCorrect} {t("eval.correctOutOf")} {stats.totalQuestions} {t("eval.questionsWord")}</p>
        </Card>

        <div className="grid md:grid-cols-4 gap-5">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <Card key={cat.name} className="bg-card/80 border border-border/30 text-center p-5">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${cat.color} w-fit mx-auto mb-3`}><Icon className="w-6 h-6 text-foreground" /></div>
                <p className="text-sm text-primary font-medium mb-1">{cat.name}</p>
                <p className="text-3xl font-bold text-foreground mb-2">{cat.score}%</p>
                <div className="h-2 bg-muted/30 rounded-full overflow-hidden mb-3"><div className={`h-full bg-gradient-to-r ${cat.color} rounded-full`} style={{ width: `${cat.score}%` }} /></div>
                <Badge className={`${cat.score >= 80 ? "bg-accent/20 text-accent" : "bg-secondary/20 text-secondary"} border-0 text-xs`}>{getLabel(cat.score)}</Badge>
              </Card>
            );
          })}
        </div>

        {skillScores.length > 0 && (
          <Card className="bg-card/80 border border-border/30">
            <CardHeader><CardTitle className="text-lg">{t("eval.skillMastery")}</CardTitle><CardDescription>{t("eval.skillDesc")}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {skillScores.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-sm mb-1"><span className="text-foreground font-medium">{s.name}</span><span className="text-muted-foreground">{s.score}%</span></div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full" style={{ width: `${s.score}%` }} /></div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="bg-card/80 border border-accent/30">
            <CardHeader><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-accent to-accent/40"><Star className="w-5 h-5 text-foreground" /></div><CardTitle className="text-lg text-accent">{t("eval.strengths")}</CardTitle></div></CardHeader>
            <CardContent><ul className="space-y-3">{strengths.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground"><div className="w-1.5 h-1.5 bg-accent rounded-full mt-2 flex-shrink-0" />{s}</li>)}</ul></CardContent>
          </Card>
          <Card className="bg-card/80 border border-secondary/30">
            <CardHeader><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-secondary to-secondary/40"><TrendingUp className="w-5 h-5 text-foreground" /></div><CardTitle className="text-lg text-secondary">{t("eval.improvements")}</CardTitle></div></CardHeader>
            <CardContent><ul className="space-y-3">{improvements.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground"><div className="w-1.5 h-1.5 bg-secondary rounded-full mt-2 flex-shrink-0" />{s}</li>)}</ul></CardContent>
          </Card>
          <Card className="bg-card/80 border border-primary/30">
            <CardHeader><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/40"><Brain className="w-5 h-5 text-foreground" /></div><CardTitle className="text-lg text-primary">{t("eval.recommendations")}</CardTitle></div></CardHeader>
            <CardContent><ul className="space-y-3">{recommendations.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground"><div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />{s}</li>)}</ul></CardContent>
          </Card>
        </div>

        <div className="flex gap-4 justify-center pt-4">
          <Button className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl px-8 py-5" onClick={() => navigate("/reports")}><FileText className="w-4 h-4 mr-2" />{t("eval.viewReport")}</Button>
          <Button variant="outline" className="border-border/50 rounded-xl px-8 py-5" onClick={() => navigate("/questions")}><RefreshCw className="w-4 h-4 mr-2" />{t("eval.retake")}</Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default EvaluationPage;
