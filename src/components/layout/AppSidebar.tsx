import { useNavigate, useLocation } from "react-router-dom";
import {
  Home, BookOpen, FileText, CheckCircle, User, BarChart3, Settings, ChevronRight, LogOut
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

const AppSidebar = ({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { t } = useLanguage();

  const navItems = [
    { label: t("nav.dashboard"),     icon: Home,       path: "/dashboard" },
    { label: t("nav.learningTrack"), icon: BookOpen,   path: "/courses"   },
    { label: t("nav.results"),       icon: FileText,   path: "/evaluation"},
    { label: t("nav.assessments"),   icon: CheckCircle,path: "/questions" },
    { label: t("nav.profile"),       icon: User,       path: "/profile"   },
    { label: t("nav.reports"),       icon: BarChart3,  path: "/reports"   },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <aside className={`fixed left-0 top-0 bottom-0 bg-card border-r border-border/50 z-40 flex flex-col rtl:left-auto rtl:right-0 rtl:border-r-0 rtl:border-l rtl:border-border/50 transition-all duration-300 ${isOpen ? 'w-56' : 'w-0 overflow-hidden'}`}>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border/50">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-secondary">
          <BookOpen className="w-5 h-5 text-foreground" />
        </div>
        <span className="text-lg font-bold text-primary">Quizora</span>
        <ChevronRight className={`w-4 h-4 text-muted-foreground ml-auto rtl:ml-0 rtl:mr-auto transition-transform duration-300 ${isOpen ? '' : 'rotate-180'}`} onClick={onToggle} />
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4 border-t border-border/50 pt-4 space-y-1">
        <button
          onClick={() => navigate("/settings")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            location.pathname === "/settings"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <Settings className="w-5 h-5" />
          {t("common.settings")}
        </button>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          {t("common.signOut")}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
