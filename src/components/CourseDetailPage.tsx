import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CheckCircle, Heart, Share2, Star, BookOpen,
  Home, Search, Bell, Send, Loader2, ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Review {
  id: string;
  name: string;
  role: string;
  date: string;
  rating: number;
  title: string;
  text: string;
  initials: string;
}

const allCourses: Record<string, { title: string; description: string; includes: string[] }> = {
  "5": {
    title: "General Aptitude Test Preparation & Training",
    description:
      "Prepare for the general aptitude test through an interactive training platform powered by artificial intelligence. Solve verbal and quantitative questions that simulate the real test, get instant explanations and a personalized study plan that raises your score step by step.",
    includes: [
      "Verbal and quantitative training questions with progressive difficulty levels",
      "Instant, AI-powered explanations for every question",
      "Simulated exams with realistic timing",
      "A personalized dashboard highlighting progress, strengths, and weaknesses",
    ],
  },
};

const defaultCourse = {
  title: "Course Details",
  description: "Detailed information about this course.",
  includes: ["Comprehensive curriculum", "Expert instruction", "Practice materials"],
};

const StarRating = ({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md";
}) => {
  const [hovered, setHovered] = useState(0);
  const sz = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`transition-transform ${onChange ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
          onMouseEnter={() => onChange && setHovered(star)}
          onMouseLeave={() => onChange && setHovered(0)}
          onClick={() => onChange && onChange(star)}
        >
          <Star
            className={`${sz} transition-colors ${
              star <= (hovered || value)
                ? "text-yellow-400 fill-yellow-400"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
    </div>
  );
};

const CourseDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const course = allCourses[id || ""] || defaultCourse;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formRating, setFormRating] = useState(0);
  const [formTitle, setFormTitle] = useState("");
  const [formText, setFormText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitReview = async () => {
    if (!formRating || !formTitle.trim() || !formText.trim()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    const initials = (user?.email || "A")
      .split(/[@. ]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("");
    const newReview: Review = {
      id: Date.now().toString(),
      name: user?.email?.split("@")[0] || "Anonymous",
      role: language === "ar" ? "مشترك" : "Subscriber",
      date: new Date().toLocaleDateString(language === "ar" ? "ar-SA" : "en-US"),
      rating: formRating,
      title: formTitle,
      text: formText,
      initials,
    };
    setReviews((prev) => [newReview, ...prev]);
    setFormRating(0);
    setFormTitle("");
    setFormText("");
    setSubmitting(false);
    setSubmitted(true);
    setShowForm(false);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <span className="text-lg font-bold text-primary">Quizora</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
              <Home className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-foreground text-sm font-bold border-2 border-primary/50">
              {user?.email?.[0]?.toUpperCase() || "A"}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <div className="flex justify-end gap-3 mb-6">
          <Badge className="bg-primary/20 text-primary border-primary/30 cursor-pointer px-4 py-1.5 hover:bg-primary/30 transition-colors">
            <Share2 className="w-3.5 h-3.5 mr-1.5" />{t("common.share")}
          </Badge>
          <button className="text-muted-foreground hover:text-rose-400 transition-colors">
            <Heart className="w-6 h-6" />
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
                <BookOpen className="w-10 h-10 text-foreground" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{course.title}</h1>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-6">{course.description}</p>
            <Button
              className="w-full bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl py-5 text-lg hover:opacity-90 transition-opacity"
              onClick={() => navigate("/questions")}
            >
              <CheckCircle className="w-5 h-5 mr-2" />{t("common.start")}
            </Button>
          </div>
          <Card className="bg-card/80 border border-border/30 p-6">
            <h3 className="font-bold text-foreground mb-4">{t("courseDetail.whatIncludes")}</h3>
            <ul className="space-y-3">
              {course.includes.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />{item}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* ══════════════ REVIEWS ══════════════ */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-foreground">
                {language === "ar" ? "المراجعات:" : "Reviews:"}
              </h2>
              {reviews.length > 0 && (
                <div className="flex items-center gap-2">
                  <StarRating value={Math.round(avgRating)} size="sm" />
                  <span className="text-sm text-muted-foreground">
                    {avgRating.toFixed(1)} ({reviews.length})
                  </span>
                </div>
              )}
            </div>
            {user ? (
              <Button
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10 rounded-xl gap-2"
                onClick={() => setShowForm((v) => !v)}
              >
                <Star className="w-4 h-4" />
                {language === "ar" ? "اكتب مراجعة" : "Write a Review"}
              </Button>
            ) : (
              <button
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => navigate("/auth")}
              >
                <span>{language === "ar" ? "سجّل دخول لكتابة مراجعة" : "Sign in to write a review"}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {showForm && user && (
            <Card className="bg-card/80 border border-primary/30 p-6 mb-8">
              <h3 className="font-bold text-foreground mb-5">
                {language === "ar" ? "شاركنا رأيك" : "Share your opinion"}
              </h3>
              <div className="mb-5">
                <p className="text-sm text-muted-foreground mb-2">
                  {language === "ar" ? "التقييم العام" : "Overall Rating"}
                </p>
                <StarRating value={formRating} onChange={setFormRating} />
                {formRating === 0 && (
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {language === "ar" ? "اختر تقييمك" : "Click to rate"}
                  </p>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  {language === "ar" ? "عنوان المراجعة" : "Review Title"}
                </label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={language === "ar" ? "مثال: تجربة رائعة!" : "e.g. Amazing experience!"}
                  className="w-full bg-muted/30 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  {language === "ar" ? "رأيك بالتفصيل" : "Your detailed review"}
                </label>
                <textarea
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  rows={3}
                  placeholder={language === "ar" ? "ماذا أعجبك في هذا البرنامج؟" : "What did you like? Did it help?"}
                  className="w-full bg-muted/30 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" className="text-muted-foreground" onClick={() => setShowForm(false)}>
                  {language === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  onClick={handleSubmitReview}
                  disabled={!formRating || !formTitle.trim() || !formText.trim() || submitting}
                  className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl px-6 gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {language === "ar" ? "نشر المراجعة" : "Submit Review"}
                </Button>
              </div>
            </Card>
          )}

          {submitted && (
            <div className="mb-6 flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3">
              <CheckCircle className="w-4 h-4" />
              {language === "ar" ? "تم نشر مراجعتك بنجاح ✨" : "Your review was published successfully ✨"}
            </div>
          )}

          {reviews.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-5">
              {reviews.map((review) => (
                <Card key={review.id} className="bg-card/80 border border-border/30 p-5 hover:border-primary/20 transition-colors">
                  <StarRating value={review.rating} size="sm" />
                  <h4 className="font-bold text-foreground mt-3 mb-2">{review.title}</h4>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{review.text}</p>
                  <div className="border-t border-border/30 pt-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-secondary/40 flex items-center justify-center text-xs text-foreground font-bold">
                      {review.initials}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{review.name}</p>
                      <p className="text-xs text-muted-foreground">{review.role} · {review.date}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-card/40 border border-dashed border-border/30 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-muted-foreground font-medium mb-1">
                {language === "ar" ? "لا توجد مراجعات بعد" : "No reviews yet"}
              </p>
              <p className="text-sm text-muted-foreground/60">
                {user
                  ? (language === "ar" ? "كن أول من يشارك رأيه!" : "Be the first to share your experience!")
                  : (language === "ar" ? "سجّل دخول لتكتب أول مراجعة" : "Sign in to write the first review")}
              </p>
              {user && !showForm && (
                <Button
                  variant="outline"
                  className="mt-5 border-primary/30 text-primary hover:bg-primary/10 rounded-xl"
                  onClick={() => setShowForm(true)}
                >
                  <Star className="w-4 h-4 mr-2" />
                  {language === "ar" ? "اكتب مراجعة" : "Write a Review"}
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>

      <footer className="border-t border-border/50 bg-muted/30 py-4 text-center">
        <p className="text-sm text-muted-foreground">© 2026 Quizora. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default CourseDetailPage;
