import { Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface HeartMetabolicTileProps {
  isDark: boolean;
  score?: number | null;
  riskBand?: string | null;
  glycemicScore?: number | null;
  lipidsScore?: number | null;
  bloodPressureScore?: number | null;
  cacScore?: number | null;
}

export function HeartMetabolicTile({
  isDark,
  score,
  riskBand,
  glycemicScore,
  lipidsScore,
  bloodPressureScore,
  cacScore,
}: HeartMetabolicTileProps) {
  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return isDark ? 'text-white/30' : 'text-gray-400';
    if (score >= 80) return 'text-green-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getProgressColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return isDark ? 'bg-white/10' : 'bg-gray-200';
    if (score >= 80) return 'bg-green-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getCACColor = (cacValue: number) => {
    if (cacValue === 0) return 'text-green-500';
    if (cacValue < 10) return 'text-green-400';
    if (cacValue < 100) return 'text-yellow-500';
    if (cacValue < 400) return 'text-orange-500';
    return 'text-red-500';
  };

  const hasData = score !== null && score !== undefined;

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-white/5 border-white/10' 
          : 'bg-white/60 border-black/10'
      }`}
      data-testid="tile-heart-metabolic"
    >
      <div className="flex items-center gap-2 mb-4">
        <Heart className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
        <h3 className={`text-xs tracking-wide ${
          isDark ? 'text-white/60' : 'text-gray-500'
        }`}>
          HEART & METABOLIC
        </h3>
      </div>

      {hasData ? (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-4xl font-semibold ${getScoreColor(score)}`} data-testid="text-score">
              {score}
            </span>
            <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              / 100
            </span>
          </div>

          {riskBand && (
            <Badge 
              className={`mb-4 ${
                riskBand === 'Low Risk' 
                  ? 'bg-green-500/20 text-green-500 border-green-500/30' 
                  : riskBand === 'Moderate Risk'
                  ? 'bg-orange-500/20 text-orange-500 border-orange-500/30'
                  : 'bg-red-500/20 text-red-500 border-red-500/30'
              }`}
              data-testid="badge-risk"
            >
              {riskBand}
            </Badge>
          )}

          {(glycemicScore !== null || lipidsScore !== null || bloodPressureScore !== null) ? (
            <div className="space-y-3">
              {glycemicScore !== null && glycemicScore !== undefined && (
                <div data-testid="metric-glycemic">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Glycemic
                    </span>
                    <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                      {glycemicScore}
                    </span>
                  </div>
                  <div className={`h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                    <div 
                      className={`h-full rounded-full transition-all ${getProgressColor(glycemicScore)}`}
                      style={{ width: `${glycemicScore}%` }}
                    />
                  </div>
                </div>
              )}

              {lipidsScore !== null && lipidsScore !== undefined && (
                <div data-testid="metric-lipids">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Lipids
                    </span>
                    <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                      {lipidsScore}
                    </span>
                  </div>
                  <div className={`h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                    <div 
                      className={`h-full rounded-full transition-all ${getProgressColor(lipidsScore)}`}
                      style={{ width: `${lipidsScore}%` }}
                    />
                  </div>
                </div>
              )}

              {bloodPressureScore !== null && bloodPressureScore !== undefined && (
                <div data-testid="metric-blood-pressure">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Blood Pressure
                    </span>
                    <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                      {bloodPressureScore}
                    </span>
                  </div>
                  <div className={`h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                    <div 
                      className={`h-full rounded-full transition-all ${getProgressColor(bloodPressureScore)}`}
                      style={{ width: `${bloodPressureScore}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={`py-3 px-4 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
              <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                Detailed metrics available when more biomarkers are added
              </p>
            </div>
          )}

          {cacScore !== null && cacScore !== undefined && (
            <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  CAC Score
                </span>
                <span className={`text-lg font-semibold ${getCACColor(cacScore)}`} data-testid="text-cac-score">
                  {Math.round(cacScore * 10) / 10}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="py-8 text-center">
          <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No data available
          </p>
          <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            Add lab results to see score
          </p>
        </div>
      )}
    </div>
  );
}
