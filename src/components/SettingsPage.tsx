import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "./layout/AppLayout";
import {
  Lock, Bell, Globe, Shield, Trash2, Eye, EyeOff, Save, Loader2,
} from "lucide-react";

const SettingsPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  // ── Password ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [savingPassword, setSavingPassword]   = useState(false);

  // ── Notifications ──
  const [emailNotif, setEmailNotif]           = useState(true);
  const [quizReminders, setQuizReminders]     = useState(true);
  const [progressReports, setProgressReports] = useState(false);
  const [savingNotif, setSavingNotif]         = useState(false);

  // ── Danger zone ──
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({ title: language === "ar" ? "خطأ" : "Error", description: language === "ar" ? "يرجى ملء جميع حقول كلمة المرور." : "Please fill all password fields.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: language === "ar" ? "خطأ" : "Error", description: language === "ar" ? "كلمتا المرور غير متطابقتين." : "New passwords do not match.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: language === "ar" ? "خطأ" : "Error", description: language === "ar" ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل." : "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast({ title: language === "ar" ? "خطأ" : "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: language === "ar" ? "تم تحديث كلمة المرور!" : "Password Updated!", description: language === "ar" ? "تم تغيير كلمة مرورك بنجاح." : "Your password has been changed successfully." });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    }
  };

  const handleSaveNotifications = async () => {
    setSavingNotif(true);
    await new Promise((r) => setTimeout(r, 800));
    setSavingNotif(false);
    toast({ title: language === "ar" ? "تم حفظ التفضيلات!" : "Preferences Saved!", description: language === "ar" ? "تم تحديث إعدادات الإشعارات." : "Your notification settings have been updated." });
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      language === "ar"
        ? "هل أنت متأكد من حذف حسابك؟ لا يمكن التراجع عن هذا الإجراء."
        : "Are you sure you want to delete your account? This action cannot be undone."
    );
    if (!confirmed) return;
    setDeletingAccount(true);
    await supabase.auth.signOut();
    toast({ title: language === "ar" ? "تم حذف الحساب" : "Account Deleted", description: language === "ar" ? "تم إزالة حسابك." : "Your account has been removed.", variant: "destructive" });
    setDeletingAccount(false);
  };

  const notificationItems = [
    {
      labelKey: "settings.emailNotifications",
      descKey:  "settings.emailNotificationsDesc",
      state:    emailNotif,
      setState: setEmailNotif,
    },
    {
      labelKey: "settings.quizReminders",
      descKey:  "settings.quizRemindersDesc",
      state:    quizReminders,
      setState: setQuizReminders,
    },
    {
      labelKey: "settings.progressReports",
      descKey:  "settings.progressReportsDesc",
      state:    progressReports,
      setState: setProgressReports,
    },
  ];

  return (
    <AppLayout>
      <div className="px-8 py-10 max-w-3xl mx-auto space-y-6">

        {/* Title */}
        <div className="mb-2">
          <h1 className="text-3xl font-bold text-foreground">{t("settings.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("settings.subtitle")}</p>
        </div>

        {/* Language */}
        <Card className="bg-card/80 border border-border/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-accent to-accent/40">
                <Globe className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">{t("settings.language")}</CardTitle>
                <CardDescription>{t("settings.languageDesc")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <button
                onClick={() => setLanguage("en")}
                className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                  language === "en"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                🇺🇸 English
              </button>
              <button
                onClick={() => setLanguage("ar")}
                className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                  language === "ar"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                🇸🇦 العربية
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="bg-card/80 border border-border/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/40">
                <Lock className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">{t("settings.changePassword")}</CardTitle>
                <CardDescription>{t("settings.updateAccountPassword")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">{t("settings.currentPassword")}</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("settings.enterCurrentPassword")}
                  className="pr-10 bg-muted/30 border-border/50 rounded-xl"
                />
                <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">{t("settings.newPassword")}</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("settings.enterNewPassword")}
                  className="pr-10 bg-muted/30 border-border/50 rounded-xl"
                />
                <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">{t("settings.confirmNewPassword")}</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("settings.confirmNewPasswordPlaceholder")}
                  className="pr-10 bg-muted/30 border-border/50 rounded-xl"
                />
                <button onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={savingPassword}
              className="w-full bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl"
            >
              {savingPassword
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Save className="w-4 h-4 mr-2" />}
              {savingPassword ? t("settings.saving") : t("settings.updatePassword")}
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="bg-card/80 border border-border/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-secondary to-secondary/40">
                <Bell className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">{t("settings.notifications")}</CardTitle>
                <CardDescription>{t("settings.controlEmails")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {notificationItems.map((item) => (
              <div key={item.labelKey} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t(item.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(item.descKey)}</p>
                </div>
                <Switch checked={item.state} onCheckedChange={item.setState} />
              </div>
            ))}
            <Button
              onClick={handleSaveNotifications}
              disabled={savingNotif}
              className="w-full bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl mt-2"
            >
              {savingNotif
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Save className="w-4 h-4 mr-2" />}
              {savingNotif ? t("settings.saving") : t("settings.savePreferences")}
            </Button>
          </CardContent>
        </Card>

{/* Dark Mode */}
<Card className="bg-card/80 border border-border/30">
  <CardHeader>
    <div className="flex items-center gap-3">
      <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-purple-500/40">
        <Globe className="w-5 h-5 text-foreground" />
      </div>
      <div>
        <CardTitle className="text-lg">
          {language === "ar" ? "المظهر" : "Appearance"}
        </CardTitle>
        <CardDescription>
          {language === "ar" ? "اختر مظهر الموقع" : "Choose your theme"}
        </CardDescription>
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <div className="flex gap-3">
      <button
  onClick={() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.classList.add("light");
  localStorage.setItem("theme", "light");
}}
  className="flex-1 py-3 rounded-xl border text-sm font-semibold"
>
  {language === "ar" ? "☀️ نهاري" : "☀️ Light"}
</button>
<button
  onClick={() => {
  document.documentElement.classList.remove("light");
  document.documentElement.classList.add("dark");
  localStorage.setItem("theme", "dark");
}}
  className="flex-1 py-3 rounded-xl border text-sm font-semibold"
>
  {language === "ar" ? "🌙 ليلي" : "🌙 Dark"}
</button>
    </div>
  </CardContent>
</Card>


        {/* Account Info */}
        <Card className="bg-card/80 border border-border/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/40">
                <Shield className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">{t("settings.accountInfo")}</CardTitle>
                <CardDescription>{t("settings.yourAccountDetails")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">{t("settings.emailAddress")}</Label>
              <Input
                value={user?.email ?? ""}
                disabled
                className="bg-muted/30 border-border/50 rounded-xl text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">{t("settings.accountId")}</Label>
              <Input
                value={user?.id ?? ""}
                disabled
                className="bg-muted/30 border-border/50 rounded-xl text-muted-foreground text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="bg-card/80 border border-destructive/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-destructive/20">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-lg text-destructive">{t("settings.dangerZone")}</CardTitle>
                <CardDescription>{t("settings.irreversibleActions")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/20 bg-destructive/5">
              <div>
                <p className="text-sm font-medium text-foreground">{t("settings.deleteAccount")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.deleteAccountDesc")}</p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="rounded-xl"
              >
                {deletingAccount
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4 mr-2" />}
                {deletingAccount ? t("settings.deleting") : t("settings.delete")}
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
};

export default SettingsPage;