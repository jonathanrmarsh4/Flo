import { useState } from "react";
import { Link, useLocation } from "wouter";
import { User, Lightbulb, Activity, MoreHorizontal } from "lucide-react";
import { FloIcon } from "./FloLogo";
import { AddTestResultsModal } from "./AddTestResultsModal";

export function FloBottomNav() {
  const [location] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isActive = (path: string) => location === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1f3a] border-t border-white/10 pb-safe">
      <div className="max-w-md mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Profile */}
          <Link href="/profile">
            <button
              data-testid="nav-profile"
              className={`flex flex-col items-center gap-1 min-w-[50px] ${
                isActive("/profile") ? "text-[#00d4aa]" : "text-gray-400"
              }`}
            >
              <User className="w-5 h-5" />
              <span className="text-xs font-medium">Profile</span>
            </button>
          </Link>

          {/* Diagnostics */}
          <Link href="/diagnostics">
            <button
              data-testid="nav-diagnostics"
              className={`flex flex-col items-center gap-1 min-w-[50px] ${
                isActive("/diagnostics") ? "text-[#00d4aa]" : "text-gray-400"
              }`}
            >
              <Activity className="w-5 h-5" />
              <span className="text-xs font-medium">Diagnostics</span>
            </button>
          </Link>

          {/* Add (Center) */}
          <button
            onClick={() => setIsModalOpen(true)}
            data-testid="nav-add"
            className="flex flex-col items-center -mt-6"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1a1f3a] to-[#0f1222] flex items-center justify-center shadow-lg border border-white/10">
              <FloIcon size={48} />
            </div>
            <span className="text-xs font-medium text-gray-400 mt-1">Add</span>
          </button>

          {/* Insights */}
          <Link href="/insights">
            <button
              data-testid="nav-insights"
              className={`flex flex-col items-center gap-1 min-w-[50px] ${
                isActive("/insights") ? "text-[#00d4aa]" : "text-gray-400"
              }`}
            >
              <Lightbulb className="w-5 h-5" />
              <span className="text-xs font-medium">Insights</span>
            </button>
          </Link>

          {/* More */}
          <Link href="/dashboard">
            <button
              data-testid="nav-more"
              className={`flex flex-col items-center gap-1 min-w-[50px] ${
                isActive("/dashboard") ? "text-[#00d4aa]" : "text-gray-400"
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-xs font-medium">More</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Add Test Results Modal */}
      <AddTestResultsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </nav>
  );
}
