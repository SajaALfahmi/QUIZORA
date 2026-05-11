import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, User, BookOpen, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Navigate } from "react-router-dom";

const AuthPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignIn = async () => {
    if (!email || !password) {
      toast({ title: "Error", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Welcome back!", description: "You have successfully signed in." });
      navigate("/dashboard");
    }
  };

  const handleSignUp = async () => {
    if (!email || !password || !fullName) {
      toast({ title: "Error", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    setIsLoading(false);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Account created!", description: "Please check your email to verify your account." });
    }
  };

const handleSocialLogin = async (provider: "google" | "apple") => {
  setIsLoading(true);

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/dashboard`
    }
  });

  setIsLoading(false);

  if (error) {
    toast({
      title: "Login failed",
      description: error.message,
      variant: "destructive",
    });
  }
};

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Error", description: "Please enter your email first.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We sent you a password reset link." });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-primary mb-1">Quizora</h1>
          <p className="text-sm text-muted-foreground">{t("auth.accessDashboard")}</p>
        </div>

        <div className="flex gap-3 mb-6">
          <Button
            variant={activeTab === "signin" ? "default" : "outline"}
            className={`flex-1 rounded-full py-5 font-semibold ${activeTab === "signin" ? "bg-gradient-to-r from-primary to-secondary text-foreground" : "border-border/50 text-foreground"}`}
            onClick={() => setActiveTab("signin")}
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            {t("auth.signIn")}
          </Button>
          <Button
            variant={activeTab === "signup" ? "default" : "outline"}
            className={`flex-1 rounded-full py-5 font-semibold ${activeTab === "signup" ? "bg-gradient-to-r from-primary to-secondary text-foreground" : "border-border/50 text-foreground"}`}
            onClick={() => setActiveTab("signup")}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {t("auth.signUp")}
          </Button>
        </div>

        {activeTab === "signin" && (
          <Card className="bg-card/80 border border-border/30 shadow-xl">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">{t("auth.welcomeBack")}</CardTitle>
              <CardDescription>{t("auth.enterCredentials")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input placeholder={t("auth.enterEmail")} className="pl-10 bg-muted/30 border-border/50 rounded-xl" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">{t("auth.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input type="password" placeholder={t("auth.enterPassword")} className="pl-10 bg-muted/30 border-border/50 rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="text-right">
                  <button className="text-sm text-primary hover:underline" onClick={handleForgotPassword}>{t("auth.forgotPassword")}</button>
                </div>
              </div>
              <Button className="w-full bg-gradient-to-r from-primary to-secondary text-foreground font-semibold shadow-lg py-5 rounded-xl" onClick={handleSignIn} disabled={isLoading}>
                {isLoading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/50" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t("auth.orContinueWith")}</span></div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl py-5" onClick={() => handleSocialLogin("google")}>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google
                </Button>
                <Button variant="outline" className="flex-1 rounded-xl py-5" onClick={() => handleSocialLogin("apple")}>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  Apple
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "signup" && (
          <Card className="bg-card/80 border border-border/30 shadow-xl">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">{t("auth.createAccount")}</CardTitle>
              <CardDescription>{t("auth.fillDetails")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">{t("auth.fullName")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input placeholder={t("auth.enterFullName")} className="pl-10 bg-muted/30 border-border/50 rounded-xl" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input type="email" placeholder={t("auth.enterEmail")} className="pl-10 bg-muted/30 border-border/50 rounded-xl" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">{t("auth.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input type="password" placeholder={t("auth.createPassword")} className="pl-10 bg-muted/30 border-border/50 rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
              <Button className="w-full bg-gradient-to-r from-primary to-secondary text-foreground font-semibold shadow-lg py-5 rounded-xl" onClick={handleSignUp} disabled={isLoading}>
                {isLoading ? t("auth.creatingAccount") : t("auth.createAccount")}
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/50" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t("auth.orContinueWith")}</span></div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl py-5" onClick={() => handleSocialLogin("google")}>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google
                </Button>
                <Button variant="outline" className="flex-1 rounded-xl py-5" onClick={() => handleSocialLogin("apple")}>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  Apple
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center mt-6">
          {activeTab === "signin" ? (
            <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => navigate("/")}>{t("auth.backToHome")}</button>
          ) : (
            <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setActiveTab("signin")}>
              {t("auth.alreadyHaveAccount")} <span className="text-primary">{t("auth.signIn")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
