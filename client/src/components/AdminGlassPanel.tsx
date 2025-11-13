import { cn } from "@/lib/utils";

interface AdminGlassPanelProps {
  children: React.ReactNode;
  className?: string;
  gradient?: boolean;
}

export function AdminGlassPanel({ 
  children, 
  className,
  gradient = false 
}: AdminGlassPanelProps) {
  return (
    <div className="relative">
      {/* Gradient outline sheen */}
      <div className={cn(
        "absolute inset-0 rounded-3xl opacity-50",
        "bg-gradient-to-br from-cyan-500/20 via-transparent to-purple-500/20",
        "pointer-events-none"
      )} />
      
      {/* Main glass panel */}
      <div 
        className={cn(
          "relative backdrop-blur-xl rounded-3xl border p-6 transition-all",
          gradient 
            ? "bg-gradient-to-br from-white/5 via-white/10 to-white/5 border-white/10 dark:from-white/5 dark:via-white/10 dark:to-white/5 dark:border-white/10"
            : "bg-white/60 border-black/10 dark:bg-white/5 dark:border-white/10",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
