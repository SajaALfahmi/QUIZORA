import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  BookOpen, Award, TrendingUp, Sparkles, ArrowRight, Globe, 
  Brain, Zap, Target, BarChart3, CheckCircle2, Users, Lightbulb,
  Compass, Rocket, Lock
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import logo from "@/assets/logo.png";
import { useState, useEffect } from "react";

const LandingPage = () => {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const isAr = language === "ar";
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

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

  const adaptiveSteps = [
    {
      icon: Compass,
      number: "01",
      title: t("landing.howWorksStart"),
      description: t("landing.howWorksStartDesc")
    },
    {
      icon: Brain,
      number: "02",
      title: t("landing.howWorksAIAnalysis"),
      description: t("landing.howWorksAIAnalysisDesc")
    },
    {
      icon: Lightbulb,
      number: "03",
      title: t("landing.howWorksIdentifyPatterns"),
      description: t("landing.howWorksIdentifyPatternsDesc")
    },
    {
      icon: Zap,
      number: "04",
      title: t("landing.howWorksAutoAdapt"),
      description: t("landing.howWorksAutoAdaptDesc")
    },
    {
      icon: Target,
      number: "05",
      title: t("landing.howWorksGenerateQuestions"),
      description: t("landing.howWorksGenerateQuestionsDesc")
    },
    {
      icon: TrendingUp,
      number: "06",
      title: t("landing.howWorksAchieveMastery"),
      description: t("landing.howWorksAchieveMasteryDesc")
    }
  ];

  const valueProps = [
    {
      icon: Brain,
      title: t("landing.featuresAI"),
      description: t("landing.featuresAIDesc")
    },
    {
      icon: Compass,
      title: t("landing.featuresPersonalized"),
      description: t("landing.featuresPersonalizedDesc")
    },
    {
      icon: BarChart3,
      title: t("landing.featuresAnalytics"),
      description: t("landing.featuresAnalyticsDesc")
    },
    {
      icon: Zap,
      title: t("landing.featuresSmart"),
      description: t("landing.featuresSmartDesc")
    },
    {
      icon: Target,
      title: t("landing.featuresAdaptive"),
      description: t("landing.featuresAdaptiveDesc")
    },
    {
      icon: Lock,
      title: t("landing.featuresSecure"),
      description: t("landing.featuresSecureDesc")
    }
  ];

  const stats = [
    { number: "10K+", label: t("landing.statsActiveLearners") },
    { number: "50K+", label: t("landing.statsQuestions") },
    { number: "95%", label: t("landing.statsImprovementRate") },
    { number: "24/7", label: t("landing.statsAvailable") }
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-secondary/10 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "2s" }}></div>
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-accent/10 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "4s" }}></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate("/")}>
            <img src={logo} alt={t("app.name")} className="w-9 h-9 object-contain" />
            <span className="text-xl font-bold text-primary hidden sm:inline">{t("app.name")}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              className="p-2.5 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all duration-300 hover:scale-105"
            >
              <Globe className="w-5 h-5" />
            </button>
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-xl border-border/50 hover:bg-muted/50 transition-all duration-300" 
              onClick={() => navigate("/auth")}
            >
              {t("auth.signIn")}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 px-6 z-10">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 mb-8 transition-all duration-700 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            <Sparkles className="w-4 h-4 text-accent animate-pulse" />
            <span className="text-sm text-muted-foreground font-semibold">{t("landing.tagline")}</span>
          </div>

          {/* Main Heading */}
          <div className={`mb-8 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-foreground mb-6 leading-tight">
              {t("landing.headline1")}
              <span className="block text-primary py-2">{t("landing.headline2")}</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {t("landing.heroDescription")}
            </p>
          </div>

          {/* CTA Buttons */}
          <div className={`flex gap-4 justify-center flex-wrap mb-12 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-foreground font-bold shadow-2xl px-8 py-6 rounded-xl text-base transition-all duration-300 hover:scale-105 hover:shadow-primary/50" 
              onClick={() => navigate("/auth")}
            >
              {t("landing.startFreeTrial")}
              <Sparkles className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-border/50 text-foreground hover:bg-muted/50 px-8 py-6 rounded-xl text-base transition-all duration-300 hover:scale-105" 
              onClick={() => navigate("/courses")}
            >
              {t("landing.viewCourses")}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          {/* Stats */}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-border/20 transition-all duration-1200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {stats.map((stat, index) => (
              <div key={index} className="text-center hover:scale-110 transition-transform duration-300">
                <p className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">{stat.number}</p>
                <p className="text-sm text-muted-foreground mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Quizora Works - Adaptive Learning Flow */}
      <section className="relative py-20 md:py-28 px-6 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              {t("landing.howWorks")}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("landing.howWorksDesc")}
            </p>
          </div>

          {/* Adaptive Learning Steps */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {adaptiveSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div 
                  key={index} 
                  className="group relative"
                >
                  {/* Card */}
                  <div className="bg-gradient-to-br from-card/80 to-card/40 border border-border/30 rounded-2xl p-8 h-full hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 transform hover:-translate-y-1">
                    {/* Number Badge */}
                    <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-foreground font-bold text-lg shadow-lg">
                      {step.number}
                    </div>

                    {/* Icon */}
                    <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 w-fit group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-8 h-8 text-primary" />
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-bold text-foreground mb-3">{step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>

                    {/* Arrow */}
                    {index < adaptiveSteps.length - 1 && (
                      <div className="hidden md:block absolute -right-5 top-1/2 transform -translate-y-1/2">
                        <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center text-foreground">
                          <ArrowRight className="w-5 h-5" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose Quizora - Original Features */}
      <section className="relative py-20 md:py-28 px-6 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              {t("landing.whyChoose")} <span className="text-primary">{t("app.name")}</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("landing.whyChooseDesc")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div 
                  key={index}
                  className="group bg-gradient-to-br from-card/60 to-card/20 border border-border/30 rounded-2xl p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 transform hover:-translate-y-1"
                >
                  <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 w-fit mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Value Propositions */}
      <section className="relative py-20 md:py-28 px-6 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              {t("landing.premiumFeatures")}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("landing.premiumFeaturesDesc")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {valueProps.map((prop, index) => {
              const Icon = prop.icon;
              return (
                <div 
                  key={index}
                  className="group bg-gradient-to-br from-card/80 to-card/40 border border-border/30 rounded-2xl p-8 hover:border-accent/50 transition-all duration-300 hover:shadow-lg hover:shadow-accent/10"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-gradient-to-br from-accent/20 to-primary/10 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-6 h-6 text-accent" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-foreground mb-2">{prop.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{prop.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-20 md:py-28 px-6 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-3xl p-12 md:p-16 text-center backdrop-blur-sm">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              {t("landing.finalCtaTitle")}
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t("landing.finalCtaText")}
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-foreground font-bold shadow-2xl px-8 py-6 rounded-xl text-base transition-all duration-300 hover:scale-105" 
                onClick={() => navigate("/auth")}
              >
                {t("landing.startYourFreeTrial")}
                <Rocket className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-border/50 text-foreground hover:bg-muted/50 px-8 py-6 rounded-xl text-base transition-all duration-300 hover:scale-105" 
                onClick={() => navigate("/courses")}
              >
                {t("landing.viewCourses")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-border/20 py-12 px-6 z-10">
        <div className="max-w-6xl mx-auto text-center text-muted-foreground">
          <p className="mb-4">{t("common.footer")}</p>
          <p className="text-sm">{t("landing.footerTag")}</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
