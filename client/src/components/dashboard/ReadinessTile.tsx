import { Zap, Heart, Moon } from 'lucide-react';

interface ReadinessTileProps {
  isDark: boolean;
}

export function ReadinessTile({ isDark }: ReadinessTileProps) {
  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 border-white/10' 
          : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 border-black/10'
      }`}
      data-testid="tile-readiness"
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
        <h3 className={`text-xs tracking-wide ${
          isDark ? 'text-white/60' : 'text-gray-500'
        }`}>
          DAILY READINESS
        </h3>
      </div>

      <div className="text-center py-6">
        <div className="flex justify-center gap-3 mb-4">
          <Moon className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
          <Heart className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
          <Zap className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
        </div>
        <h4 className={`text-base mb-2 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
          Coming Soon
        </h4>
        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          Requires Apple Health integration
        </p>
        <p className={`text-xs mt-1 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
          Sleep • HRV • Activity tracking
        </p>
      </div>
    </div>
  );
}
