import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="bg-card/80 border border-border/30 text-center p-10 max-w-md">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-primary to-secondary w-fit mx-auto mb-6 flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-foreground" />
        </div>
        <h1 className="text-5xl font-bold text-foreground mb-3">404</h1>
        <p className="text-lg text-muted-foreground mb-2">Page Not Found</p>
        <p className="text-sm text-muted-foreground mb-8">Sorry, the page you're looking for doesn't exist or has been moved.</p>
        <Button className="bg-gradient-to-r from-primary to-secondary text-foreground font-semibold rounded-xl px-6" onClick={() => window.location.href = "/"}>
          <Home className="w-4 h-4 mr-2" />
          Return to Home
        </Button>
      </Card>
    </div>
  );
};

export default NotFound;
