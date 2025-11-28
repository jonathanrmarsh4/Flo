import { Crown, Sparkles, ArrowRight, Zap, Brain, LineChart, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpgradePremiumTileProps {
  isDark: boolean;
  onUpgrade: () => void;
}

export function UpgradePremiumTile({ isDark, onUpgrade }: UpgradePremiumTileProps) {
  const features = [
    { icon: Brain, label: 'AI Insights' },
    { icon: LineChart, label: 'Flōmentum' },
    { icon: Zap, label: 'Voice Chat' },
    { icon: Shield, label: 'Full Access' },
  ];

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      data-testid="tile-upgrade-premium"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Crown className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
        <h3 className={`text-xs tracking-wide ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
          UPGRADE TO PREMIUM
        </h3>
      </div>

      {/* Main Content */}
      <div className="text-center mb-4">
        <div className="flex justify-center mb-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            isDark 
              ? 'bg-gradient-to-br from-amber-500/30 to-orange-500/30' 
              : 'bg-gradient-to-br from-amber-100 to-orange-100'
          }`}>
            <Sparkles className={`w-7 h-7 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          </div>
        </div>
        
        <h4 className={`text-lg font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Unlock Full Potential
        </h4>
        <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
          Get personalized AI insights and advanced health tracking
        </p>
      </div>

      {/* Feature Pills */}
      <div className="flex flex-wrap justify-center gap-2 mb-5">
        {features.map(({ icon: Icon, label }) => (
          <div 
            key={label}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
              isDark 
                ? 'bg-white/10 text-white/80' 
                : 'bg-black/5 text-gray-700'
            }`}
          >
            <Icon className="w-3 h-3" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <Button
        onClick={onUpgrade}
        className={`w-full group ${
          isDark
            ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white border-0'
            : 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white border-0'
        }`}
        data-testid="button-upgrade-premium"
      >
        <span>Upgrade Now</span>
        <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
      </Button>
    </div>
  );
}
