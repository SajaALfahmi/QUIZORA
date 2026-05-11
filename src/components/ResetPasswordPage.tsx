import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import logo from "@/assets/logo.png";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {}, []);

  const handleResetPassword = async () => {
    if (password !== confirmPassword) { toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" }); return; }
    if (password.length < 6) { toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" }); return; }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Password updated!", description: "You can now sign in with your new password." }); navigate("/auth"); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Quizora" className="w-16 h-16 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{t("reset.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("reset.enterNew")}</p>
        </div>
        <Card className="bg-card/80 border border-border/30 shadow-xl">
          <CardHeader className="text-center pb-4"><CardTitle className="text-xl">{t("reset.newPassword")}</CardTitle><CardDescription>{t("reset.chooseStrong")}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>{t("auth.password")}</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input type="password" placeholder={t("reset.newPlaceholder")} className="pl-10 bg-muted/30 border-border/50 rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} /></div></div>
            <div className="space-y-2"><Label>{t("reset.confirm")}</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input type="password" placeholder={t("reset.confirmPlaceholder")} className="pl-10 bg-muted/30 border-border/50 rounded-xl" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div></div>
            <Button className="w-full bg-gradient-to-r from-primary to-secondary text-foreground font-semibold shadow-lg py-5 rounded-xl" onClick={handleResetPassword} disabled={isLoading}>{isLoading ? t("reset.updating") : t("reset.updatePassword")}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
