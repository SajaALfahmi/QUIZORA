import { ReactNode, useState } from "react";
import AppSidebar from "./AppSidebar";
import AppTopbar from "./AppTopbar";
import { useLanguage } from "@/contexts/LanguageContext";

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const onToggle = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar isOpen={sidebarOpen} onToggle={onToggle} />
      <div className={`ml-56 rtl:ml-0 rtl:mr-56 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? '' : 'ml-0 rtl:mr-0'}`}>
        <AppTopbar onToggleSidebar={onToggle} />
        <main className="flex-1">
          {children}
        </main>
        <footer className="border-t border-border/50 bg-muted/30 py-4 text-center">
          <p className="text-sm text-muted-foreground">© 2026 Quizora. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default AppLayout;
