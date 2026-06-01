import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { User, Mail, Phone, MapPin, Calendar, Save, GraduationCap, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUserStats } from "@/hooks/useUserStats";
import { useLanguage } from "@/contexts/LanguageContext";
import AppLayout from "./layout/AppLayout";

const ProfilePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const stats = useUserStats();
  const { t, language } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState({ name: "", email: "", phone: "", location: "", department: "", position: "", bio: "" });

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      setUserInfo({ name: data?.full_name ?? user.user_metadata?.full_name ?? "", email: data?.email ?? user.email ?? "", phone: "", location: "", department: "", position: "", bio: "" });
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: userInfo.name, email: userInfo.email }).eq("user_id", user.id);
    setIsSaving(false); setIsEditing(false);
    if (error) toast({ title: t("common.error"), description: t("profile.saveError"), variant: "destructive" });
    else toast({ title: t("profile.saveSuccessTitle"), description: t("profile.saveSuccessDesc") });
  };

  const handleInputChange = (field: string, value: string) => setUserInfo((p) => ({ ...p, [field]: value }));

  const initials = userInfo.name ? userInfo.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "U";

  const levels = [
    { label: t("profile.overallAccuracy"), score: stats.averageScore, status: stats.averageScore >= 80 ? t("profile.excellent") : stats.averageScore >= 60 ? t("profile.good") : t("profile.needsWork") },
    { label: t("profile.questionsCompleted"), score: Math.min(100, Math.round((stats.totalQuestions / Math.max(1, stats.totalQuestions + 20)) * 100)), status: `${stats.totalQuestions} ${t("profile.answered")}` },
    { label: t("profile.learningStreak"), score: Math.min(100, stats.currentStreak * 10), status: `${stats.currentStreak} ${t("profile.days")}` },
  ];

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="px-8 py-10 max-w-5xl mx-auto">
        <div className="flex justify-end mb-6">
          {isEditing ? (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setIsEditing(false)} className="rounded-xl border-border/50">{t("profile.cancelChanges")}</Button>
              <Button className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl" onClick={handleSave} disabled={isSaving}>
                {isSaving ? t("profile.saving") : <><Save className="w-4 h-4 mr-2" />{t("profile.saveChanges")}</>}
              </Button>
            </div>
          ) : (
            <Button className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl" onClick={() => setIsEditing(true)}>{t("profile.editProfile")}</Button>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="bg-card/80 border border-border/30 p-6 flex flex-col items-center text-center">
            <Avatar className="w-24 h-24 mb-4 border-4 border-primary/30"><AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-secondary text-foreground font-bold">{initials}</AvatarFallback></Avatar>
            <h2 className="text-2xl font-bold text-foreground mb-2">{userInfo.name || "User"}</h2>
            <div className="flex gap-2">
              {userInfo.department && <Badge className="bg-primary/20 text-primary border-primary/30"><GraduationCap className="w-3 h-3 mr-1" />{userInfo.department}</Badge>}
              <Badge className="bg-secondary/20 text-secondary border-secondary/30"><Calendar className="w-3 h-3 mr-1" />{stats.totalSessions} {t("profile.sessions")}</Badge>
            </div>
          </Card>

          <Card className="bg-card/80 border border-border/30 p-6">
            <h3 className="text-lg font-bold text-foreground mb-1">{t("profile.myLevel")}</h3>
            <p className="text-sm text-muted-foreground mb-5">{t("profile.progressOverview")}</p>
            <div className="space-y-5">
              {levels.map((l) => (
                <div key={l.label}>
                  <div className="flex justify-between mb-1.5"><span className="text-sm font-medium text-foreground">{l.label}</span><span className="text-sm text-muted-foreground">{l.status} {typeof l.score === "number" ? `${l.score}%` : ""}</span></div>
                  <Progress value={l.score} className="h-2" />
                </div>
              ))}
            </div>
            <Button className="w-full mt-6 bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl" onClick={() => navigate("/reports")}><FileText className="w-4 h-4 mr-2" />{t("profile.viewReport")}</Button>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-card/80 border border-border/30">
            <CardHeader><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-secondary to-secondary/40"><GraduationCap className="w-5 h-5 text-foreground" /></div><div><CardTitle className="text-lg">{t("profile.academicInfo")}</CardTitle><CardDescription>{t("profile.educationalDetails")}</CardDescription></div></div></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label className="text-muted-foreground text-sm">{t("profile.educationalLevel")}</Label><Input value={userInfo.department} onChange={(e) => handleInputChange("department", e.target.value)} disabled={!isEditing} className="bg-muted/30 border-border/50 rounded-xl" /></div>
              <div className="space-y-1.5"><Label className="text-muted-foreground text-sm">{t("profile.gradeLevel")}</Label><Input value={userInfo.position} onChange={(e) => handleInputChange("position", e.target.value)} disabled={!isEditing} className="bg-muted/30 border-border/50 rounded-xl" /></div>
              <div className="space-y-1.5"><Label className="text-muted-foreground text-sm">{t("profile.aboutMe")}</Label><Textarea value={userInfo.bio} onChange={(e) => handleInputChange("bio", e.target.value)} disabled={!isEditing} className="min-h-[100px] bg-muted/30 border-border/50 rounded-xl" /></div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border border-border/30">
            <CardHeader><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/40"><User className="w-5 h-5 text-foreground" /></div><div><CardTitle className="text-lg">{t("profile.personalInfo")}</CardTitle><CardDescription>{t("profile.personalDetails")}</CardDescription></div></div></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label className="text-muted-foreground text-sm">{t("profile.fullName")}</Label><Input value={userInfo.name} onChange={(e) => handleInputChange("name", e.target.value)} disabled={!isEditing} className="bg-muted/30 border-border/50 rounded-xl" /></div>
              <div className="space-y-1.5"><Label className="text-muted-foreground text-sm">{t("profile.email")}</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input value={userInfo.email} disabled className="pl-10 bg-muted/30 border-border/50 rounded-xl" /></div></div>
              <div className="space-y-1.5"><Label className="text-muted-foreground text-sm">{t("profile.phone")}</Label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input value={userInfo.phone} onChange={(e) => handleInputChange("phone", e.target.value)} disabled={!isEditing} className="pl-10 bg-muted/30 border-border/50 rounded-xl" /></div></div>
              <div className="space-y-1.5"><Label className="text-muted-foreground text-sm">{t("profile.location")}</Label><div className="relative"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input value={userInfo.location} onChange={(e) => handleInputChange("location", e.target.value)} disabled={!isEditing} className="pl-10 bg-muted/30 border-border/50 rounded-xl" /></div></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default ProfilePage;
