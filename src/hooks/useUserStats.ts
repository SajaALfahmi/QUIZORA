const skillMap = new Map(skills.map((s) => [s.id, s.name]));

      setStats({
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        totalQuestions: answers.length,
        totalCorrect,
        averageScore: avgScore,
        coursesStarted: uniqueCourses,
        currentStreak: maxStreak,
        totalStudyTimeMinutes: Math.round(totalTime / 60),
        recentSessions: sessions.slice(0, 10),
        skillLevels: skillLevels.map((sl) => ({
          skill_name: skillMap.get(sl.skill_id) ?? "Unknown",
          mastery_level: sl.mastery_level,
          questions_attempted: sl.questions_attempted,
          questions_correct: sl.questions_correct,
        })),
        weeklyActivity: DAYS.map((d) => ({ day: d, questions: weeklyMap[d] })),
        monthlyScores: Object.entries(monthlyMap).map(([month, v]) => ({
          month,
          score: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
        })),
        loading: false,
      });
    };

    fetch();
  }, [user]);

  return stats;
}
