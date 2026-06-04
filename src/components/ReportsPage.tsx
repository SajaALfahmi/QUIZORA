import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, FileText, Clock, TrendingUp, Loader2 } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend
} from "recharts";
import AppLayout from "./layout/AppLayout";
import { useUserStats } from "@/hooks/useUserStats";
import { useLanguage } from "@/contexts/LanguageContext";

const ReportsPage = () => {
  const stats           = useUserStats();
  const { t } = useLanguage();

  if (stats.loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const pieData = [
    { name: t("reports.completed"), value: stats.completedSessions },
    { name: t("reports.remaining"), value: Math.max(0, stats.totalSessions - stats.completedSessions) },
  ];
  const pieColors = ["hsl(270, 60%, 55%)", "hsl(50, 95%, 55%)"];

  const donutData = [
    { name: t("reports.correct"),   value: stats.totalCorrect },
    { name: t("reports.incorrect"), value: Math.max(0, stats.totalQuestions - stats.totalCorrect) },
  ];
  const donutColors = ["hsl(270, 60%, 55%)", "hsl(330, 85%, 60%)"];

  const hours   = Math.floor(stats.totalStudyTimeMinutes / 60);
  const minutes = stats.totalStudyTimeMinutes % 60;

  const ScoreTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border/40 rounded-lg px-3 py-2 text-sm shadow-lg">
          <p className="text-muted-foreground mb-1">{label}</p>
          <p className="text-foreground font-bold">{payload[0].value}%</p>
        </div>
      );
    }
    return null;
  };

  const ActivityTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border/40 rounded-lg px-3 py-2 text-sm shadow-lg">
          <p className="text-muted-foreground mb-1">{label}</p>
          <p className="text-primary font-bold">{payload[0].value} {t("reports.questions")}</p>
          {payload[1] && <p className="text-secondary font-bold">{payload[1].value} {t("reports.minutes")}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <AppLayout>
      <div className="px-8 py-10 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
            {t("reports.trackProgress")}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              {t("reports.progress")}
            </span>
          </h2>
          <p className="text-muted-foreground">{t("reports.insights")}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* 1. Overall Score */}
          <Card className="bg-card/80 border border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/40">
                  <BarChart3 className="w-5 h-5 text-foreground" />
                </div>
                <CardTitle className="text-lg">{t("reports.overallScore")}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t("reports.avgScore")}:{" "}
                <span className="text-foreground font-bold text-xl">{stats.averageScore}%</span>
              </p>
            </CardHeader>
            <CardContent>
              {stats.monthlyScores.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={stats.monthlyScores}
                    margin={{ top: 10, right: 10, bottom: 5, left: -10 }}
                  >
                    <defs>
                      <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(270, 60%, 55%)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(270, 60%, 55%)" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,20%)" />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(0,0%,50%)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(0,0%,50%)"
                      fontSize={12}
                      domain={[0, 100]}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<ScoreTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(270, 60%, 55%)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#purpleGradient)"
                      dot={{ fill: "hsl(270, 60%, 55%)", stroke: "hsl(240,10%,10%)", strokeWidth: 2, r: 5 }}
                      activeDot={{ r: 7 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-16">{t("reports.noData")}</p>
              )}
            </CardContent>
          </Card>

          {/* 2. Learning Track */}
          <Card className="bg-card/80 border border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-secondary to-secondary/40">
                  <FileText className="w-5 h-5 text-foreground" />
                </div>
                <CardTitle className="text-lg">{t("reports.learningTrack")}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t("reports.sessionsCompleted")}:{" "}
                <span className="text-foreground font-bold text-xl">{stats.completedSessions}</span>
              </p>
            </CardHeader>
            <CardContent className="flex items-center justify-center pb-6">
              {stats.totalSessions > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={80}
                      dataKey="value" strokeWidth={0}
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v}`, n]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-16">{t("reports.noSessions")}</p>
              )}
            </CardContent>
          </Card>

          {/* 3. Assessment Reports */}
          <Card className="bg-card/80 border border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-accent to-accent/40">
                  <TrendingUp className="w-5 h-5 text-foreground" />
                </div>
                <CardTitle className="text-lg">{t("reports.assessmentReports")}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t("reports.accuracyLabel")}:{" "}
                <span className="text-foreground font-bold text-xl">{stats.averageScore}%</span>
              </p>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {stats.totalQuestions > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={80}
                      dataKey="value" strokeWidth={0}
                    >
                      {donutData.map((_, i) => <Cell key={i} fill={donutColors[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v}`, n]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-16">{t("reports.noAnswers")}</p>
              )}
            </CardContent>
          </Card>

          {/* 4. Weekly Activity */}
          <Card className="bg-card/80 border border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary/40">
                  <Clock className="w-5 h-5 text-foreground" />
                </div>
                <CardTitle className="text-lg">{t("reports.weeklyActivity")}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t("reports.totalStudyTime")}:{" "}
                <span className="text-foreground font-bold text-xl">{hours}h {minutes}m</span>
              </p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={stats.weeklyActivity}
                  margin={{ top: 5, right: 5, bottom: 5, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,20%)" />
                  <XAxis
                    dataKey="day"
                    stroke="hsl(0,0%,40%)"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="hsl(0,0%,40%)"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ActivityTooltip />} />
                  <Legend />
                  <Bar dataKey="questions" name={t("reports.questions")} radius={[4, 4, 0, 0]} fill="hsl(270, 60%, 55%)" />
                  <Bar dataKey="minutes"   name={t("reports.minutes")}   radius={[4, 4, 0, 0]} fill="hsl(330, 85%, 60%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
};

export default ReportsPage;
