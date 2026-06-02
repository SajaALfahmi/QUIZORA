import { ReactNode, useState } from "react";
import AppSidebar from "./AppSidebar";
import AppTopbar from "./AppTopbar";
import { useLanguage } from "@/contexts/LanguageContext";

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { t, dir } = useLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleToggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={sidebarCollapsed} />

      <div
        className={`flex flex-col min-h-screen transition-all duration-300 ${
          sidebarCollapsed
            ? dir === "ltr"
              ? "ml-0"
              : "mr-0"
            : dir === "ltr"
            ? "ml-56"
            : "mr-56"
        }`}
      >
        <AppTopbar onToggleSidebar={handleToggleSidebar} />

        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        <footer className="border-t border-border/50 py-4 px-6 text-center text-sm text-muted-foreground">
          {t("common.footer")}
        </footer>
      </div>
    </div>
  );
};

export default AppLayout;
