import { Link, useLocation } from "wouter";
import { Home, Upload, Clock, User } from "lucide-react";

export function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", icon: Home, label: "Home", testId: "nav-home" },
    { path: "/upload", icon: Upload, label: "Upload", testId: "nav-upload" },
    { path: "/history", icon: Clock, label: "History", testId: "nav-history" },
    { path: "/profile", icon: User, label: "Profile", testId: "nav-profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-card-border safe-area-inset-bottom z-50">
      <div className="max-w-md mx-auto px-4 py-2">
        <div className="flex items-center justify-around">
          {navItems.map(({ path, icon: Icon, label, testId }) => {
            const isActive = location === path;
            return (
              <Link key={path} href={path}>
                <button
                  data-testid={testId}
                  className={`flex flex-col items-center justify-center min-w-[60px] py-2 rounded-lg transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover-elevate"
                  }`}
                >
                  <Icon className={`w-6 h-6 mb-1 ${isActive ? "fill-primary" : ""}`} />
                  <span className="text-caption-2 font-medium">{label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
