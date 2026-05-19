import { supabase } from "@/integrations/supabase/client";

function throwFunctionError(error: any): never {
  const message = error?.message || "Unknown edge function error";
  const details = error?.details ? ` - ${JSON.stringify(error.details)}` : "";
  throw new Error(`${message}${details}`);
}

export const adaptiveEngine = {
  startSession: async (courseId: string, totalQuestions: number, difficulty: string = "auto") => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke(
      "adaptive-engine",
      {
        body: JSON.stringify({
          course_id: courseId,
          total_questions: totalQuestions,
          difficulty_mode: difficulty, // ✅ يمرر الـ difficulty للـ edge function
        }),
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
          "x-action": "start-session",
        },
      }
    );

    if (error) throwFunctionError(error);
    return data;
  },

  submitAnswer: async (payload: {
    session_id: string;
    question_id: string;
    selected_option_id: string;
    time_spent_seconds: number;
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke(
      "adaptive-engine",
      {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
          "x-action": "submit-answer",
        },
      }
    );

    if (error) throwFunctionError(error);
    return data;
  },

  getNextQuestion: async (sessionId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke(
      "adaptive-engine",
      {
        body: JSON.stringify({ session_id: sessionId }),
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
          "x-action": "next-question",
        },
      }
    );

    if (error) throwFunctionError(error);
    return data;
  },

  endSession: async (sessionId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke(
      "adaptive-engine",
      {
        body: JSON.stringify({ session_id: sessionId }),
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
          "x-action": "end-session",
        },
      }
    );

    if (error) throw error;
    return data;
  },
};

export const aiService = {
  generateQuestions: async (payload: {
    skill_id: string;
    course_id: string;
    difficulty?: string;
    count?: number;
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke(
      "generate-questions",
      {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (error) throw error;
    return data;
  },

  generateExplanation: async (payload: {
    question_id: string;
    user_answer?: string;
    correct_answer?: string;
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke(
      "generate-explanation",
      {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (error) throw error;
    return data;
  },
};