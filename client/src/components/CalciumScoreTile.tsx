import { Heart, Calendar, TrendingUp } from 'lucide-react';

interface CalciumScoreTileProps {
  isDark: boolean;
  score?: number;
  riskLevel?: string;
  testDate?: string;
}

export function CalciumScoreTile({ 
  isDark, 
  score = 42,
  riskLevel = "Low",
  testDate = "March 15, 2024"
}: CalciumScoreTileProps) {
  const getRiskColor = (risk: string) => {
    switch(risk.toLowerCase()) {
      case 'minimal':
      case 'low':
        return isDark ? 'text-green-400' : 'text-green-600';
      case 'moderate':
        return isDark ? 'text-yellow-400' : 'text-yellow-600';
      case 'moderately high':
      case 'high':
        return isDark ? 'text-orange-400' : 'text-orange-600';
      case 'very high':
        return isDark ? 'text-red-400' : 'text-red-600';
      default:
        return isDark ? 'text-gray-400' : 'text-gray-600';
    }
  };

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all hover-elevate ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}
      data-testid="tile-calcium-score"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isDark ? 'bg-red-500/20' : 'bg-red-100'
          }`}>
            <Heart className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
          </div>
          <div>
            <h3 className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Calcium Score (CAC)
            </h3>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Coronary artery calcification
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Score
            </span>
          </div>
          <p className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {score}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-1">
            <Heart className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Risk
            </span>
          </div>
          <p className={`text-sm font-semibold ${getRiskColor(riskLevel)}`}>
            {riskLevel}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-1">
            <Calendar className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Date
            </span>
          </div>
          <p className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
            {testDate}
          </p>
        </div>
      </div>
    </div>
  );
}
