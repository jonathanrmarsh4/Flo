import { Activity, ChevronRight } from 'lucide-react';

interface BodyCompositionTileProps {
  isDark: boolean;
  score?: number | null;
  fatPercent?: number | null;
  leanPercent?: number | null;
  visceralFatArea?: number | null;
  visceralFatScore?: number | null;
  boneHealth?: string | null;
}

export function BodyCompositionTile({
  isDark,
  score,
  fatPercent,
  leanPercent,
  visceralFatArea,
  visceralFatScore,
  boneHealth,
}: BodyCompositionTileProps) {
  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return isDark ? 'text-white/30' : 'text-gray-400';
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const hasData = score !== null && score !== undefined;
  const hasBodyComp = fatPercent !== null && fatPercent !== undefined && leanPercent !== null && leanPercent !== undefined;

  // Calculate donut chart segments only when we have data
  const circumference = 2 * Math.PI * 45; // radius = 45
  const fatOffset = hasBodyComp ? circumference * (1 - fatPercent! / 100) : 0;
  const leanOffset = hasBodyComp ? circumference * (fatPercent! / 100) : 0;

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover:scale-[1.02] ${
        isDark 
          ? 'bg-white/5 border-white/10 hover:bg-white/10' 
          : 'bg-white/60 border-black/10 hover:bg-white/90'
      }`}
      data-testid="tile-body-composition"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <h3 className={`text-xs tracking-wide ${
            isDark ? 'text-white/60' : 'text-gray-500'
          }`}>
            BODY COMP
          </h3>
        </div>
        <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
      </div>

      {hasData ? (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className={`text-4xl font-semibold ${getScoreColor(score)}`} data-testid="text-score">
              {score}
            </span>
            <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              / 100
            </span>
          </div>

          {hasBodyComp ? (
            <div className="flex items-center gap-4 mb-4">
              {/* Donut Chart */}
              <div className="relative" style={{ width: 80, height: 80 }}>
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                    strokeWidth="10"
                  />
                  {/* Lean segment (blue) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={leanOffset}
                    strokeLinecap="round"
                  />
                  {/* Fat segment (orange) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={fatOffset}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {fatPercent!.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between" data-testid="legend-lean">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Lean
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                    {leanPercent!.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between" data-testid="legend-fat">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Fat
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                    {fatPercent!.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className={`py-3 px-4 mb-4 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
              <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                Body composition data from DEXA scan not available
              </p>
            </div>
          )}

          <div className="space-y-2">
            {visceralFatArea !== null && visceralFatArea !== undefined && visceralFatScore !== null && (
              <div className="flex items-center justify-between" data-testid="metric-visceral-fat">
                <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Visceral Fat
                </span>
                <span className={`text-xs font-medium ${getScoreColor(visceralFatScore)}`}>
                  {visceralFatArea} cm² ({visceralFatScore})
                </span>
              </div>
            )}

            {boneHealth && (
              <div className="flex items-center justify-between" data-testid="metric-bone-health">
                <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Bone Health
                </span>
                <span className={`text-xs font-medium ${
                  boneHealth === 'Normal' ? 'text-green-500' : 
                  boneHealth === 'Osteopenia' ? 'text-yellow-500' : 
                  'text-red-500'
                }`}>
                  {boneHealth}
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="py-8 text-center">
          <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No data available
          </p>
          <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            Upload DEXA scan to see score
          </p>
        </div>
      )}
    </div>
  );
}
