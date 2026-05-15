import { useEffect } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "./components/LandingPage";
import AuthPage from "./components/AuthPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import Dashboard from "./components/Dashboard";
import CoursesPage from "./components/CoursesPage";
import CourseDetailPage from "./components/CourseDetailPage";
import QuestionsPage from "./components/QuestionsPage";
import EvaluationPage from "./components/EvaluationPage";
import ProfilePage from "./components/ProfilePage";
import ReportsPage from "./components/ReportsPage";
import SettingsPage from "./components/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {

  useEffect(() => {
    const testOpenAI = async () => {
      try {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
             Authorization: 'Bearer ${import.meta.env.VITE_OPENAI_API_KEY}',
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages: [
                {
                  role: "user",
                  content: "Hello",
                },
              ],
            }),
          }
        );

        const data = await response.json();

        console.log("OpenAI Response:", data);
      } catch (error) {
        console.error("OpenAI Error:", error);
      }
    };

    testOpenAI();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <LanguageProvider>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route
                  path="/courses"
                  element={
                    <ProtectedRoute>
                      <CoursesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/course/:id"
                  element={
                    <ProtectedRoute>
                      <CourseDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/questions"
                  element={
                    <ProtectedRoute>
                      <QuestionsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/evaluation"
                  element={
                    <ProtectedRoute>
                      <EvaluationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute>
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </LanguageProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;