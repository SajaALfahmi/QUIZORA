import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "./layout/AppLayout";

interface Source {
  document_id: string;
  document_title: string;
  organization: string;
  official_source: string;
  similarity: number;
}

const EXAMPLE_SCENARIO_AR =
  "مركز تدريب اعتمد نظام QUIZORA كمنصته لتحضير موظفيه لشهادات AWS وPMP، مستخدمًا تحديدًا ميزتي توليد الأسئلة ومراجعتها التلقائية. بعد أشهر من الاستخدام الناجح، مدير التدريب يطلب تقييم مدى توافق آلية التوليد والمراجعة المزدوجة بالذكاء الاصطناعي مع معايير حوكمة المحتوى التعليمي.";
const EXAMPLE_SCENARIO_EN =
  "A training center adopted QUIZORA as its platform to prepare its staff for AWS and PMP certifications, specifically using the AI question-generation and automated-review features. After months of successful use, the training manager requests an assessment of how well the dual AI generation-and-review mechanism aligns with educational content governance standards.";

const ScenarioAnalysisPage = () => {
  const { toast } = useToast();
  const [isArabic, setIsArabic] = useState(document.documentElement.dir === "rtl");
  const [scenario, setScenario] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsArabic(document.documentElement.dir === "rtl");
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  async function handleAnalyze() {
    if (!scenario.trim() || loading) return;
    setLoading(true);
    setAnalysis(null);
    setSources([]);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-scenario", {
        body: { scenario, language: isArabic ? "ar" : "en" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Analysis failed");

      setAnalysis(data.analysis);
      setSources(data.sources || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      toast({
        title: isArabic ? "حدث خطأ" : "Something went wrong",
        description: message || (isArabic ? "تعذر إكمال التحليل. حاول مرة أخرى." : "Could not complete the analysis. Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function useExample() {
    setScenario(isArabic ? EXAMPLE_SCENARIO_AR : EXAMPLE_SCENARIO_EN);
  }

  return (
    <AppLayout>
      <div className="px-2 py-4 max-w-4xl mx-auto space-y-6" style={{ direction: isArabic ? "rtl" : "ltr" }}>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            {isArabic ? "تحليل السيناريوهات مقابل السياسات" : "Policy Scenario Analysis"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isArabic
              ? "اكتب سيناريو واقعي، وسيتم تحليله مقابل قاعدة المعرفة (وثائق سياسات ومعايير رسمية) باستخدام استرجاع دلالي (RAG)."
              : "Describe a real-world scenario and it will be analyzed against the knowledge base (official policy/standards documents) using semantic retrieval (RAG)."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isArabic ? "السيناريو" : "Scenario"}</CardTitle>
            <CardDescription>
              {isArabic ? "صف الموقف بالتفصيل (حتى 4000 حرف)." : "Describe the situation in detail (up to 4000 characters)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              maxLength={4000}
              rows={6}
              placeholder={isArabic ? "اكتب السيناريو هنا..." : "Type the scenario here..."}
              className="resize-none"
            />
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={useExample} disabled={loading}>
                {isArabic ? "استخدم مثال" : "Use example"}
              </Button>
              <Button onClick={handleAnalyze} disabled={loading || !scenario.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {isArabic ? "جاري التحليل..." : "Analyzing..."}
                  </>
                ) : (
                  isArabic ? "تحليل" : "Analyze"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isArabic ? "التحليل" : "Analysis"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{analysis}</div>
            </CardContent>
          </Card>
        )}

        {sources.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isArabic ? "المصادر المسترجعة" : "Retrieved Sources"}
              </CardTitle>
              <CardDescription>
                {isArabic ? "أعلى المقتطفات تشابهًا من قاعدة المعرفة، مرتبة تنازليًا." : "Top-matching knowledge base excerpts, ranked by similarity."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sources.map((s, i) => (
                <div key={`${s.document_id}-${i}`} className="flex items-start justify-between gap-3 text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium">{s.document_id}</span>
                    {" - "}
                    <a href={s.official_source} target="_blank" rel="noreferrer" className="hover:underline">
                      {s.document_title}
                    </a>
                    <div className="text-xs text-muted-foreground">{s.organization}</div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {(s.similarity * 100).toFixed(0)}%
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default ScenarioAnalysisPage;
