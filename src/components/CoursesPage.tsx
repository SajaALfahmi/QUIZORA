import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Brain, BookOpen, Award, ArrowLeft, ArrowRight,
  Network, Shield, Cloud, Briefcase, Beaker, Atom, Calculator, FlaskConical,
  Sparkles, Loader2, Globe, BookMarked, Microscope, GraduationCap
} from "lucide-react";
import AppLayout from "./layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

type Category = "qudurat" | "tahseeli" | "certifications";
type TahseeliTrack = "scientific" | "literary" | null;

const courseTranslationMap: Record<string, { title: string; desc: string }> = {
  "Qudurat - Verbal": { title: "course.qudurat_verbal", desc: "course.qudurat_verbal_desc" },
  "Qudurat - Quantitative": { title: "course.qudurat_quantitative", desc: "course.qudurat_quantitative_desc" },
  "Tahseeli - Mathematics": { title: "course.tahseeli_math", desc: "course.tahseeli_math_desc" },
  "Tahseeli - Physics": { title: "course.tahseeli_physics", desc: "course.tahseeli_physics_desc" },
  "Tahseeli - Chemistry": { title: "course.tahseeli_chemistry", desc: "course.tahseeli_chemistry_desc" },
  "Tahseeli - Biology": { title: "course.tahseeli_biology", desc: "course.tahseeli_biology_desc" },
  "Tahseeli - Geography": { title: "course.tahseeli_geography", desc: "course.tahseeli_geography_desc" },
  "Tahseeli - Arabic Language": { title: "course.tahseeli_arabic", desc: "course.tahseeli_arabic_desc" },
  "Tahseeli - Islamic Studies": { title: "course.tahseeli_islamic", desc: "course.tahseeli_islamic_desc" },
  "CCNA": { title: "course.ccna", desc: "course.ccna_desc" },
  "CompTIA Security+": { title: "course.security_plus", desc: "course.security_plus_desc" },
  "AWS Cloud Practitioner": { title: "course.aws_ccp", desc: "course.aws_ccp_desc" },
  "PMP": { title: "course.pmp", desc: "course.pmp_desc" },
};

const courseMeta: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  borderColor: string;
  selectedBorder: string;
  badgeKey?: string;
  badgeColor?: string;
  tagKeys?: string[];
}> = {
  "PMP": {
    icon: Briefcase,
    iconBg: "bg-orange-500/20", iconColor: "text-orange-400",
    borderColor: "border-orange-500/30", selectedBorder: "border-orange-500/80",
    badgeKey: "badge.advanced", badgeColor: "text-orange-400",
    tagKeys: ["tag.projectPlanning", "tag.agileWaterfall", "tag.riskManagement"],
  },
  "AWS Cloud Practitioner": {
    icon: Cloud,
    iconBg: "bg-yellow-500/20", iconColor: "text-yellow-400",
    borderColor: "border-yellow-500/30", selectedBorder: "border-yellow-500/80",
    badgeKey: "badge.beginner", badgeColor: "text-yellow-400",
    tagKeys: ["tag.cloudConcepts", "tag.awsServices", "tag.securityCompliance"],
  },
  "CompTIA Security+": {
    icon: Shield,
    iconBg: "bg-blue-500/20", iconColor: "text-blue-400",
    borderColor: "border-blue-500/30", selectedBorder: "border-blue-500/80",
    badgeKey: "badge.intermediate", badgeColor: "text-blue-400",
    tagKeys: ["tag.threatManagement", "tag.cryptography", "tag.riskAssessment"],
  },
  "CCNA": {
    icon: Network,
    iconBg: "bg-purple-500/20", iconColor: "text-purple-400",
    borderColor: "border-purple-500/30", selectedBorder: "border-purple-500/80",
    badgeKey: "badge.intermediate", badgeColor: "text-purple-400",
    tagKeys: ["tag.routingSwitching", "tag.ipConnectivity", "tag.networkFundamentals"],
  },
  "Verbal": {
    icon: BookOpen,
    iconBg: "bg-pink-500/20", iconColor: "text-pink-400",
    borderColor: "border-pink-500/30", selectedBorder: "border-pink-500/80",
    badgeKey: "badge.allLevels", badgeColor: "text-pink-400",
    tagKeys: ["tag.readingComprehension", "tag.verbalAnalogies", "tag.criticalThinking"],
  },
  "Quantitative": {
    icon: Calculator,
    iconBg: "bg-primary/20", iconColor: "text-primary",
    borderColor: "border-primary/30", selectedBorder: "border-primary/80",
    badgeKey: "badge.allLevels", badgeColor: "text-primary",
    tagKeys: ["tag.mathLogic", "tag.problemSolving", "tag.numericalReasoning"],
  },
  "Mathematics": {
    icon: Calculator,
    iconBg: "bg-primary/20", iconColor: "text-primary",
    borderColor: "border-primary/30", selectedBorder: "border-primary/80",
    badgeKey: "badge.highSchool", badgeColor: "text-primary",
    tagKeys: ["tag.algebra", "tag.geometry", "tag.calculus"],
  },
  "Physics": {
    icon: Atom,
    iconBg: "bg-cyan-500/20", iconColor: "text-cyan-400",
    borderColor: "border-cyan-500/30", selectedBorder: "border-cyan-500/80",
    badgeKey: "badge.highSchool", badgeColor: "text-cyan-400",
    tagKeys: ["tag.mechanics", "tag.electricity", "tag.waves"],
  },
  "Chemistry": {
    icon: FlaskConical,
    iconBg: "bg-green-500/20", iconColor: "text-green-400",
    borderColor: "border-green-500/30", selectedBorder: "border-green-500/80",
    badgeKey: "badge.highSchool", badgeColor: "text-green-400",
    tagKeys: ["tag.organic", "tag.reactions", "tag.periodicTable"],
  },
  "Biology": {
    icon: Beaker,
    iconBg: "bg-emerald-500/20", iconColor: "text-emerald-400",
    borderColor: "border-emerald-500/30", selectedBorder: "border-emerald-500/80",
    badgeKey: "badge.highSchool", badgeColor: "text-emerald-400",
    tagKeys: ["tag.cells", "tag.genetics", "tag.ecosystems"],
  },
  "Geography": {
    icon: Globe,
    iconBg: "bg-teal-500/20", iconColor: "text-teal-400",
    borderColor: "border-teal-500/30", selectedBorder: "border-teal-500/80",
    badgeKey: "badge.highSchool", badgeColor: "text-teal-400",
    tagKeys: ["tag.physicalGeo", "tag.humanGeo", "tag.maps"],
  },
  "Arabic Language": {
    icon: BookMarked,
    iconBg: "bg-rose-500/20", iconColor: "text-rose-400",
    borderColor: "border-rose-500/30", selectedBorder: "border-rose-500/80",
    badgeKey: "badge.highSchool", badgeColor: "text-rose-400",
    tagKeys: ["tag.grammar", "tag.literature", "tag.rhetoric"],
  },
  "Islamic Studies": {
    icon: GraduationCap,
    iconBg: "bg-amber-500/20", iconColor: "text-amber-400",
    borderColor: "border-amber-500/30", selectedBorder: "border-amber-500/80",
    badgeKey: "badge.highSchool", badgeColor: "text-amber-400",
    tagKeys: ["tag.tawheed", "tag.fiqh", "tag.hadith"],
  },
};

// ✅ الإصلاح: دالة تبحث عن meta بثلاث طرق
const getCourseMeta = (course: any) => {
  // 1) العنوان الكامل مثل "AWS Cloud Practitioner"
  if (courseMeta[course.title]) return courseMeta[course.title];

  // 2) آخر جزء بعد " - " مثل "Verbal" من "Qudurat - Verbal"
  const shortTitle = course.title.includes(" - ")
    ? course.title.split(" - ").pop()?.trim()
    : null;
  if (shortTitle && courseMeta[shortTitle]) return courseMeta[shortTitle];

  // 3) sub_category كـ fallback
  if (course.sub_category && courseMeta[course.sub_category])
    return courseMeta[course.sub_category];

  return null;
};

const CoursesPage = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [tahseeliTrack, setTahseeliTrack] = useState<TahseeliTrack>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const categoryMeta: Record<Category, {
    title: string; subtitle: string; description: string;
    icon: React.ComponentType<{ className?: string }>; gradient: string;
  }> = {
    qudurat: { title: t("courses.qudurat"), subtitle: t("courses.quduratSub"), description: t("courses.quduratDesc"), icon: Brain, gradient: "from-primary to-primary/40" },
    tahseeli: { title: t("courses.tahseeli"), subtitle: t("courses.tahseeliSub"), description: t("courses.tahseeliDesc"), icon: BookOpen, gradient: "from-secondary to-secondary/40" },
    certifications: { title: t("courses.certifications"), subtitle: t("courses.certificationsSub"), description: t("courses.certificationsDesc"), icon: Award, gradient: "from-accent to-accent/40" },
  };

  useEffect(() => {
    // ✅ استخدام بيانات محلية بدلاً من Supabase
    const defaultCourses = [
      { id: "455159fc-0c91-445e-a3b3-650d0727f1f7", category: "qudurat", sub_category: "verbal", title: "Qudurat - Verbal", description: "Verbal reasoning and reading comprehension practice", is_active: true },
      { id: "954b6d5f-6cff-4aa4-b732-8f68b4e4fc1f", category: "qudurat", sub_category: "quantitative", title: "Qudurat - Quantitative", description: "Quantitative reasoning and mathematical problem solving", is_active: true },
      { id: "9127a8c4-1d22-4d29-a5e9-3530ded07534", category: "tahseeli", sub_category: "mathematics", title: "Tahseeli - Mathematics", track: "scientific", description: "High school mathematics curriculum preparation", is_active: true },
      { id: "c8dc4f5e-6f6e-4ae1-8a9f-b19c2c5269cf", category: "tahseeli", sub_category: "physics", title: "Tahseeli - Physics", track: "scientific", description: "High school physics curriculum preparation", is_active: true },
      { id: "7a41b06d-6d9e-4c16-bbde-5d6d13b5e0a9", category: "tahseeli", sub_category: "chemistry", title: "Tahseeli - Chemistry", track: "scientific", description: "High school chemistry curriculum preparation", is_active: true },
      { id: "f8f8a675-09ea-4179-b4f8-b32a2b232fbc", category: "tahseeli", sub_category: "biology", track: "scientific", title: "Tahseeli - Biology", description: "High school biology curriculum preparation", is_active: true },
      { id: "a1b2c3d4-0001-0001-0001-000000000001", category: "tahseeli", sub_category: "geography", track: "literary", title: "Tahseeli - Geography", description: "Human and physical geography for the achievement test", is_active: true },
      { id: "a1b2c3d4-0002-0002-0002-000000000002", category: "tahseeli", sub_category: "arabic", track: "literary", title: "Tahseeli - Arabic Language", description: "Grammar, literature, rhetoric and criticism", is_active: true },
      { id: "a1b2c3d4-0003-0003-0003-000000000003", category: "tahseeli", sub_category: "islamic", track: "literary", title: "Tahseeli - Islamic Studies", description: "Tawheed, Fiqh, Hadith and Tafsir", is_active: true },
      { id: "48f5aa9f-8a6e-42f7-bf15-2d8bdd7c3864", category: "certifications", sub_category: "ccna", title: "CCNA", description: "Cisco Certified Network Associate certification prep", is_active: true },
      { id: "84c82536-ff63-4663-9fa4-7f3818f48e1b", category: "certifications", sub_category: "security", title: "CompTIA Security+", description: "CompTIA Security+ certification preparation", is_active: true },
      { id: "28ce9f52-455c-431d-9e5a-caa107a97fa5", category: "certifications", sub_category: "aws", title: "AWS Cloud Practitioner", description: "AWS Cloud Practitioner certification prep", is_active: true },
      { id: "304a9f8b-a018-4d8e-a0ff-9889e4b4b635", category: "certifications", sub_category: "pmp", title: "PMP", description: "Project Management Professional certification preparation", is_active: true },
    ];
    setCourses(defaultCourses);
    setLoading(false);
  }, []);

  const handleCategorySelect = (cat: Category) => { setSelectedCategory(cat); setSelectedCourseId(null); setTahseeliTrack(null); };
  const handleBack = () => {
    if (selectedCategory === "tahseeli" && tahseeliTrack !== null) {
      setTahseeliTrack(null);
      setSelectedCourseId(null);
    } else {
      setSelectedCategory(null);
      setSelectedCourseId(null);
      setTahseeliTrack(null);
    }
  };

  const handleStartQuiz = () => {
    if (!selectedCourseId) return;
    const course = courses.find((c) => c.id === selectedCourseId);
    const mapped = course ? courseTranslationMap[course.title] : null;
    navigate("/questions", {
      state: {
        courseId: selectedCourseId,
        courseName: mapped ? t(mapped.title) : course?.title,
        courseDescription: mapped ? t(mapped.desc) : course?.description,
        coursePayload: course,
      },
    });
  };

  const categoryCourses = courses.filter((c) => {
    if (c.category !== selectedCategory) return false;
    if (selectedCategory === "tahseeli" && tahseeliTrack) {
      return c.track === tahseeliTrack;
    }
    return true;
  });
  const categories: Category[] = ["qudurat", "tahseeli", "certifications"];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-8 py-10 max-w-6xl mx-auto">

        {!selectedCategory ? (
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted/40 border border-border/50 mb-6">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm text-muted-foreground font-medium">{t("courses.choosePath")}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              {t("courses.whatPractice")}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
                {t("courses.practice")}
              </span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">{t("courses.selectCategory")}</p>
          </div>
        ) : (
          <div className="mb-10">
            <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
              {language === "ar" ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
              <span className="text-sm font-medium">{t("courses.backToCategories")}</span>
            </button>
            <h2 className="text-3xl font-bold text-foreground mb-2">{categoryMeta[selectedCategory!].title}</h2>
            <p className="text-muted-foreground">
              {selectedCategory === "tahseeli" && !tahseeliTrack
                ? (language === "ar" ? "اختر نوع القسم للمتابعة" : "Select your track to continue")
                : t("courses.pickSubject")}
            </p>
          </div>
        )}

        {/* Tahseeli Track Selection */}
        {selectedCategory === "tahseeli" && !tahseeliTrack && (
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <Card
              className="group relative bg-card/80 border border-cyan-500/30 hover:border-cyan-500/70 transition-all duration-300 cursor-pointer p-0 overflow-hidden"
              onClick={() => setTahseeliTrack("scientific")}
            >
              <div className="h-1.5 bg-gradient-to-r from-cyan-500 to-blue-500" />
              <div className="p-7">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500/40 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Microscope className="w-7 h-7 text-foreground" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  {language === "ar" ? "القسم العلمي" : "Scientific Track"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "ar" ? "فيزياء • رياضيات • أحياء • كيمياء" : "Physics • Mathematics • Biology • Chemistry"}
                </p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {["الفيزياء", "الرياضيات", "الأحياء", "الكيمياء"].map((s) => (
                    <span key={s} className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-400">{s}</span>
                  ))}
                </div>
                <Button className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-foreground font-semibold">
                  {language === "ar" ? "اختر العلمي" : "Select Scientific"}
                  <ArrowRight className={`w-4 h-4 ${language === "ar" ? "mr-2 rotate-180" : "ml-2"}`} />
                </Button>
              </div>
            </Card>

            <Card
              className="group relative bg-card/80 border border-rose-500/30 hover:border-rose-500/70 transition-all duration-300 cursor-pointer p-0 overflow-hidden"
              onClick={() => setTahseeliTrack("literary")}
            >
              <div className="h-1.5 bg-gradient-to-r from-rose-500 to-amber-500" />
              <div className="p-7">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500/40 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <BookMarked className="w-7 h-7 text-foreground" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  {language === "ar" ? "القسم الأدبي" : "Literary Track"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "ar" ? "جغرافيا • اللغة العربية • الدروس الإسلامية" : "Geography • Arabic Language • Islamic Studies"}
                </p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {["الجغرافيا", "اللغة العربية", "الدروس الإسلامية"].map((s) => (
                    <span key={s} className="px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">{s}</span>
                  ))}
                </div>
                <Button className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-foreground font-semibold">
                  {language === "ar" ? "اختر الأدبي" : "Select Literary"}
                  <ArrowRight className={`w-4 h-4 ${language === "ar" ? "mr-2 rotate-180" : "ml-2"}`} />
                </Button>
              </div>
            </Card>
          </div>
        )}

        {!selectedCategory && (
          <div className="grid md:grid-cols-3 gap-6">
            {categories.map((catId) => {
              const cat = categoryMeta[catId];
              const Icon = cat.icon;
              const count = courses.filter((c) => c.category === catId).length;
              return (
                <Card
                  key={catId}
                  className="group relative bg-card/80 border border-border/30 hover:border-primary/40 transition-all duration-300 cursor-pointer p-0 overflow-hidden"
                  onClick={() => handleCategorySelect(catId)}
                >
                  <div className={`h-1.5 bg-gradient-to-r ${cat.gradient}`} />
                  <div className="p-7">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-7 h-7 text-foreground" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-1">{cat.title}</h3>
                    <p className="text-sm text-muted-foreground font-medium mb-1">{cat.subtitle}</p>
                    <p className="text-xs text-muted-foreground mb-3">{count} {t("courses.available")}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">{cat.description}</p>
                    <Button className="w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-foreground font-semibold">
                      {t("courses.getStarted")}
                      <ArrowRight className={`w-4 h-4 ${language === "ar" ? "mr-2 rotate-180" : "ml-2"}`} />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {selectedCategory && (selectedCategory !== "tahseeli" || tahseeliTrack) && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {categoryCourses.map((course) => {
              const meta = getCourseMeta(course); // ✅ الإصلاح هنا
              const Icon = meta?.icon ?? Award;
              const isSelected = selectedCourseId === course.id;
              const mapped = courseTranslationMap[course.title];
              const title = mapped ? t(mapped.title) : course.title;
              const desc = mapped ? t(mapped.desc) : course.description;

              return (
                <Card
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`relative bg-card/80 border border-border/30 transition-all duration-300 cursor-pointer p-6 overflow-hidden hover:border-primary/40 hover:shadow-card hover:shadow-lg
                    ${isSelected ? "scale-[1.02] border-primary/70 shadow-lg" : "hover:scale-[1.01]"}
                  `}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isSelected ? (meta?.iconBg ?? "bg-muted/60") : (meta?.iconBg ?? "bg-muted/40")}`}>
                      <Icon className={`w-5 h-5 ${meta?.iconColor ?? "text-foreground"}`} />
                    </div>
                    {meta?.badgeKey && (
                      <span className={`text-xs font-semibold ${meta.badgeColor}`}>
                        {t(meta.badgeKey)}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{desc}</p>

                  {meta?.tagKeys && (
                    <div className="flex flex-wrap gap-1.5">
                      {meta.tagKeys.map((tagKey) => (
                        <span key={tagKey} className="px-2.5 py-0.5 rounded-full bg-muted/50 border border-border/40 text-xs text-muted-foreground">
                          {t(tagKey)}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {selectedCategory && selectedCourseId && (
          <div className="mt-10 flex justify-center">
            <Button
              onClick={handleStartQuiz}
              className="px-10 py-6 text-lg rounded-2xl bg-gradient-to-r from-primary via-secondary to-accent text-foreground font-bold hover:scale-105 transition-all duration-300"
            >
              {t("courses.startQuiz")}
              <ArrowRight className={`w-5 h-5 ${language === "ar" ? "mr-2 rotate-180" : "ml-2"}`} />
            </Button>
          </div>
        )}

      </div>
    </AppLayout>
  );
};

export default CoursesPage;