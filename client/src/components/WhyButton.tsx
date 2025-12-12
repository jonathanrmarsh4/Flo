import { HelpCircle } from 'lucide-react';

interface WhyButtonProps {
  isDark: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
}

export function WhyButton({ isDark, onClick, size = 'md' }: WhyButtonProps) {
  const sizeClasses = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${sizeClasses} rounded-full backdrop-blur-xl border transition-all duration-300 flex items-center justify-center group hover:scale-110 ${
        isDark
          ? 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30'
          : 'bg-white/40 border-black/10 hover:bg-white/60 hover:border-black/20'
      }`}
      title="Why this score?"
      data-testid="button-why"
      style={{
        boxShadow: isDark 
          ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
          : '0 2px 8px rgba(0, 0, 0, 0.1)'
      }}
    >
      <HelpCircle 
        className={`${iconSize} transition-all duration-300 ${
          isDark 
            ? 'text-white/60 group-hover:text-teal-400' 
            : 'text-gray-500 group-hover:text-teal-600'
        }`} 
      />
    </button>
  );
}
