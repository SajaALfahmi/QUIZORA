import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface UserStats {
  totalSessions: number;
  completedSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  averageScore: number;
  coursesStarted: number;
  currentStreak: number;
  totalStudyTimeMinutes: number;
  recentSessions: {
    id: string;
    course_id: string;
    course_title?: string;
    correct_answers: number;
    total_questions: number;
    started_at: string;
    completed_at: string | null;
    status: string;
  }[];
  skillLevels: {
    skill_name: string;
    mastery_level: number;
    questions_attempted: number;
    questions_correct: number;
  }[];
  weeklyActivity: { day: string; questions: number; minutes: number }[];
  monthlyScores: { month: string; score: number; monthIndex: number }[];
  loading: boolean;
}

const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function useUserStats(): UserStats {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats>({
    totalSessions: 0,
    completedSessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    averageScore: 0,
    coursesStarted: 0,
    currentStreak: 0,
    totalStudyTimeMinutes: 0,
    recentSessions: [],
    skillLevels: [],
    weeklyActivity: DAYS.map((d) => ({ day: d, questions: 0, minutes: 0 })),
    monthlyScores: [],
    loading: true,
  });

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const [sessionsRes, answersRes, progressRes, skillsRes, skillLevelsRes] = await Promise.all([
        supabase
          .from("learning_sessions")
          .select("id, course_id, correct_answers, total_questions, started_at, completed_at, status")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false }),
        supabase
          .from("user_answers")
          .select("is_correct, answered_at, time_spent_seconds")
          .eq("user_id", user.id),
        supabase
          .from("user_progress")
          .select("course_id, completed_questions, correct_answers, current_streak")
          .eq("user_id", user.id),
        supabase.from("skills").select("id, name"),
        supabase
          .from("user_skill_levels")
          .select("skill_id, mastery_level, questions_attempted, questions_correct")
          .eq("user_id", user.id),
      ]);

      const sessions    = sessionsRes.data    ?? [];
      const answers     = answersRes.data     ?? [];
      const progress    = progressRes.data    ?? [];
      const skills      = skillsRes.data      ?? [];
      const skillLevels = skillLevelsRes.data ?? [];

      const completedSessions = sessions.filter((s) => s.status === "completed");
      const totalCorrect      = answers.filter((a) => a.is_correct).length;
      const avgScore          = answers.length > 0
        ? Math.round((totalCorrect / answers.length) * 100)
        : 0;
      const uniqueCourses = new Set(sessions.map((s) => s.course_id)).size;
      const maxStreak     = progress.reduce((max, p) => Math.max(max, p.current_streak), 0);

      // ✅ حساب وقت الدراسة
      let totalTimeSeconds = 0;
      completedSessions.forEach((s) => {
        if (s.completed_at && s.started_at) {
          const diff = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000;
          if (diff > 0 && diff < 7200) totalTimeSeconds += diff;
        }
      });

      if (totalTimeSeconds === 0) {
        totalTimeSeconds = answers.reduce((sum, a) => {
          const t = a.time_spent_seconds ?? 0;
          return sum + (t < 1 ? 45 : t);
        }, 0);
      }

      if (totalTimeSeconds < 60 && completedSessions.length > 0) {
        totalTimeSeconds = completedSessions.length * 120;
      }

      const totalStudyTimeMinutes = Math.round(totalTimeSeconds / 60);

      // ✅ Weekly activity
      const weeklyQMap: Record<string, number> = {};
      const weeklyMMap: Record<string, number> = {};
      DAYS.forEach((d) => { weeklyQMap[d] = 0; weeklyMMap[d] = 0; });
      const now = new Date();
      answers.forEach((a) => {
        const d    = new Date(a.answered_at);
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        if (diff <= 7) {
          const dayName = DAYS[d.getDay()];
          weeklyQMap[dayName] += 1;
          weeklyMMap[dayName] += Math.round((a.time_spent_seconds ?? 45) / 60);
        }
      });

      // ✅ Monthly scores مرتبة زمنياً
      const monthlyMap: Record<number, { correct: number; total: number; name: string }> = {};
      answers.forEach((a) => {
        const monthIndex = new Date(a.answered_at).getMonth();
        if (!monthlyMap[monthIndex]) {
          monthlyMap[monthIndex] = { correct: 0, total: 0, name: MONTHS[monthIndex] };
        }
        monthlyMap[monthIndex].total += 1;
        if (a.is_correct) monthlyMap[monthIndex].correct += 1;
      });

      const sortedMonthlyScores = Object.entries(monthlyMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([idx, v]) => ({
          month:      v.name,
          monthIndex: Number(idx),
          score:      v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
        }));

      const skillMap = new Map(skills.map((s) => [s.id, s.name]));

      setStats({
        totalSessions:         sessions.length,
        completedSessions:     completedSessions.length,
        totalQuestions:        answers.length,
        totalCorrect,
        averageScore:          avgScore,
        coursesStarted:        uniqueCourses,
        currentStreak:         maxStreak,
        totalStudyTimeMinutes,
        recentSessions:        sessions.slice(0, 10),
        skillLevels: skillLevels.map((sl) => ({
          skill_name:          skillMap.get(sl.skill_id) ?? "Unknown",
          mastery_level:       sl.mastery_level,
          questions_attempted: sl.questions_attempted,
          questions_correct:   sl.questions_correct,
        })),
        weeklyActivity: DAYS.map((d) => ({
          day:       d,
          questions: weeklyQMap[d],
          minutes:   weeklyMMap[d],
        })),
        monthlyScores: sortedMonthlyScores,
        loading: false,
      });
    };

    fetchStats();
  }, [user]);

  return stats;
}