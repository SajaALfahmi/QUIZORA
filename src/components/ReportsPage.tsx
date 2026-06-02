import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, FileText, Clock, TrendingUp, Loader2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import AppLayout from "./layout/AppLayout";
import { useUserStats } from "@/hooks/useUserStats";
import { useLanguage } from "@/contexts/LanguageContext";

const ReportsPage = () => {
  const navigate = useNavigate();
  const stats = useUserStats();
  const { t, language } = useLanguage();

  if (stats.loading) {
    return <AppLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  }

  const pieData = [
    { name: t("reports.completed"), value: stats.completedSessions },
    { name: t("reports.remaining"), value: Math.max(0, stats.totalSessions - stats.completedSessions) },
  ];
  const pieColors = ["hsl(270, 60%, 55%)", "hsl(50, 95%, 55%)"];
  const donutData = [
    { name: t("reports.correct"), value: stats.totalCorrect },
    { name: t("reports.incorrect"), value: Math.max(0, stats.totalQuestions - stats.totalCorrect) },
  ];
  const donutColors = ["hsl(270, 60%, 55%)", "hsl(330, 85%, 60%)"];
  const hours = Math.round(stats.totalStudyTimeMinutes / 60);

  return (
    <AppLayout>
      <div className="px-8 py-10 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
            {t("reports.trackProgress")}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">{t("reports.progress")}</span>
          </h2>
          <p className="text-muted-foreground">{t("reports.insights")}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* 1. كرت Overall Score (بدون زر) */}
          <Card className="bg-card/80 border border-border/30 flex flex-col justify-between">
            <div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/40"><BarChart3 className="w-5 h-5 text-foreground" /></div><CardTitle className="text-lg">{t("reports.overallScore")}</CardTitle></div>
                <p className="text-sm text-muted-foreground mt-1">{t("reports.avgScore")}: <span className="text-foreground font-bold text-xl">{stats.averageScore}%</span></p>
              </CardHeader>
              <CardContent>
                {stats.monthlyScores.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={stats.monthlyScores} margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
                      <defs>
                        <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(270, 60%, 55%)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="hsl(270, 60%, 55%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" stroke="hsl(0,0%,50%)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(0,0%,50%)" fontSize={12} domain={[0, 100]} tickLine={false} axisLine={false} />
                      <Area type="monotone" dataKey="score" stroke="hsl(270, 60%, 55%)" strokeWidth={3} fillOpacity={1} fill="url(#purpleGradient)" dot={{ fill: "hsl(270, 60%, 55%)", stroke: "hsl(240, 10%, 10%)", strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} isAnimationActive={true} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-16">{t("reports.noData")}</p>}
              </CardContent>
            </div>
          </Card>

          {/* 2. كرت Learning Track Reports (بدون زر) */}
          <Card className="bg-card/80 border border-border/30 flex flex-col justify-between">
            <div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-gradient-to-br from-secondary to-secondary/40"><FileText className="w-5 h-5 text-foreground" /></div><CardTitle className="text-lg">{t("reports.learningTrack")}</CardTitle></div>
                <p className="text-sm text-muted-foreground mt-1">{t("reports.sessionsCompleted")}: <span className="text-foreground font-bold text-xl">{stats.completedSessions}</span></p>
              </CardHeader>
              <CardContent className="flex items-center justify-center pb-6">
                {stats.totalSessions > 0 ? (
                  <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>{pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}</Pie></PieChart></ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground py-16">{t("reports.noSessions")}</p>}
              </CardContent>
            </div>
          </Card>

          {/* 3. كرت Assessment Reports */}
          <Card className="bg-card/80 border border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-gradient-to-br from-accent to-accent/40"><TrendingUp className="w-5 h-5 text-foreground" /></div><CardTitle className="text-lg">{t("reports.assessmentReports")}</CardTitle></div>
              <p className="text-sm text-muted-foreground mt-1">{t("reports.accuracyLabel")}: <span className="text-foreground font-bold text-xl">{stats.averageScore}%</span></p>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {stats.totalQuestions > 0 ? (
                <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>{donutData.map((_, i) => <Cell key={i} fill={donutColors[i]} />)}</Pie></PieChart></ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground py-16">{t("reports.noAnswers")}</p>}
            </CardContent>
          </Card>

          {/* 4. كرت Weekly Activity */}
          <Card className="bg-card/80 border border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary/40"><Clock className="w-5 h-5 text-foreground" /></div><CardTitle className="text-lg">{t("reports.weeklyActivity")}</CardTitle></div>
              <p className="text-sm text-muted-foreground mt-1">{t("reports.totalStudyTime")}: <span className="text-foreground font-bold text-xl">{hours}h {stats.totalStudyTimeMinutes % 60}m</span></p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}><BarChart data={stats.weeklyActivity}><XAxis dataKey="day" stroke="hsl(0,0%,40%)" fontSize={12} axisLine={false} tickLine={false} /><YAxis stroke="hsl(0,0%,40%)" fontSize={12} axisLine={false} tickLine={false} /><Bar dataKey="questions" radius={[4, 4, 0, 0]}>{stats.weeklyActivity.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? "hsl(330, 85%, 60%)" : "hsl(270, 60%, 55%)"} />)}</Bar></BarChart></ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default ReportsPage;
