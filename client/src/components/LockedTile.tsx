import { Lock, Sparkles } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface LockedTileProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onUpgrade: () => void;
  className?: string;
  isDark?: boolean;
}

export function LockedTile({ title, description, icon: Icon, onUpgrade, className, isDark = true }: LockedTileProps) {
  return (
    <div 
      className={`backdrop-blur-xl rounded-2xl border p-4 transition-all ${
        isDark 
          ? 'bg-white/5 border-white/10' 
          : 'bg-white/60 border-black/10'
      } ${className || ""}`}
      data-testid={`card-locked-tile-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-medium flex items-center gap-2 ${
          isDark ? 'text-white/80' : 'text-gray-700'
        }`}>
          <Icon className="w-4 h-4" />
          {title}
        </h3>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
          isDark ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-600'
        }`} data-testid="badge-locked">
          <Lock className="w-3 h-3" />
          Locked
        </div>
      </div>
      
      {/* Description */}
      <p className={`text-sm mb-4 ${
        isDark ? 'text-white/60' : 'text-gray-600'
      }`} data-testid="text-locked-description">
        {description}
      </p>
      
      {/* Unlock Button */}
      <button
        onClick={onUpgrade}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        data-testid="button-unlock-feature"
      >
        <Sparkles className="w-4 h-4" />
        Unlock with Premium
      </button>
    </div>
  );
}
