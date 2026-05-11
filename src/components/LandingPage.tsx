import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Award, TrendingUp, Sparkles, ArrowRight, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import logo from "@/assets/logo.png";

const LandingPage = () => {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();

  const features = [
    {
      icon: BookOpen,
      title: t("landing.feat1Title"),
      description: t("landing.feat1Desc"),
      borderColor: "border-primary/30",
    },
    {
      icon: Award,
      title: t("landing.feat2Title"),
      description: t("landing.feat2Desc"),
      borderColor: "border-accent/30",
    },
    {
      icon: TrendingUp,
      title: t("landing.feat3Title"),
      description: t("landing.feat3Desc"),
      borderColor: "border-secondary/30",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Quizora" className="w-8 h-8 object-contain" />
            <span className="text-lg font-bold text-foreground hidden sm:inline">Quizora</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <Globe className="w-5 h-5" />
              <span className="text-xs font-medium">{language === "en" ? "العربية" : "English"}</span>
            </button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate("/auth")}>
              {t("auth.signIn")}
            </Button>
          </div>
        </div>
      </header>

      <section className="py-20 md:py-28 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex justify-center mb-6">
            <img src={logo} alt="Quizora" className="w-20 h-20 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Quizora</h1>
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted/40 border border-border/50 mb-8">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground font-medium">{t("landing.tagline")}</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-8 leading-tight">
            {t("landing.headline1")}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              {t("landing.headline2")}
            </span>
          </h2>
          <div className="flex gap-4 justify-center flex-wrap mb-20">
            <Button size="lg" className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold shadow-lg px-8 py-6 rounded-xl" onClick={() => navigate("/auth")}>
              {t("landing.getStarted")}
              <Sparkles className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="border-border/50 text-foreground hover:bg-muted/50 px-8 py-6 rounded-xl" onClick={() => navigate("/courses")}>
              {t("landing.exploreLearning")}
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h3 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-12">
            {t("landing.whyChoose")}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              {t("landing.platform")}
            </span>
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className={`bg-card/80 border ${feature.borderColor} p-6 hover:border-primary/60 transition-all duration-300`}>
                  <div className="p-3 rounded-xl bg-muted/50 w-fit mb-5">
                    <Icon className="w-7 h-7 text-primary" />
                  </div>
                  <h4 className="text-lg font-bold text-foreground mb-3">{feature.title}</h4>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-6">{t("landing.readyToStart")}</h3>
          <Button size="lg" className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold shadow-xl px-10 py-6 text-lg rounded-xl" onClick={() => navigate("/auth")}>
            {t("landing.signUpFree")}
          </Button>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
