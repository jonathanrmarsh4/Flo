import { Activity, ChevronRight } from 'lucide-react';

interface BodyCompositionTileProps {
  isDark: boolean;
  score?: number | null;
}

export function BodyCompositionTile({
  isDark,
  score,
}: BodyCompositionTileProps) {
  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return isDark ? 'text-white/30' : 'text-gray-400';
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const hasData = score !== null && score !== undefined;

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
            BODY COMPOSITION
          </h3>
        </div>
        <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
      </div>

      {hasData ? (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-4xl ${getScoreColor(score)}`} data-testid="text-score">
              {score}
            </span>
            <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              / 100
            </span>
          </div>

          <div className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            From latest DEXA scan
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
