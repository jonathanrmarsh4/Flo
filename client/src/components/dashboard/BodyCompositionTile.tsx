import { Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface BodyCompositionTileProps {
  isDark: boolean;
  score?: number | null;
}

interface BodyCompositionSnapshot {
  weightKg: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  bmi: number | null;
  waistCircumferenceCm: number | null;
  vatAreaCm2: number | null;
  weightSource: 'dexa' | 'healthkit' | null;
  bodyFatSource: 'dexa' | 'healthkit' | null;
  leanMassSource: 'dexa' | 'healthkit' | null;
  vatSource: 'dexa' | null;
  dexaScanDate: string | null;
  healthKitDataDate: string | null;
}

interface BodyCompositionData {
  snapshot: BodyCompositionSnapshot;
  trend: any[];
  explanation: string;
}

export function BodyCompositionTile({
  isDark,
  score,
}: BodyCompositionTileProps) {
  const { data: bodyCompData, isLoading } = useQuery<BodyCompositionData>({
    queryKey: ['/api/body-composition'],
  });

  const snapshot = bodyCompData?.snapshot;
  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'text-muted-foreground';
    if (score >= 80) return 'text-[hsl(var(--success))]';
    if (score >= 60) return 'text-[hsl(var(--warning))]';
    return 'text-[hsl(var(--destructive))]';
  };

  const getVisceralFatColor = (vatArea: number | null | undefined) => {
    if (vatArea === null || vatArea === undefined) return 'text-muted-foreground';
    if (vatArea < 100) return 'text-[hsl(var(--success))]';
    if (vatArea < 150) return 'text-[hsl(var(--warning))]';
    return 'text-[hsl(var(--destructive))]';
  };

  const renderSourceBadge = (source: 'dexa' | 'healthkit' | null) => {
    if (!source) return null;
    
    // Use semantic design tokens from index.css
    const badgeColor = source === 'dexa' 
      ? 'border-[hsl(var(--flo-cyan)/.3)] text-[hsl(var(--flo-cyan))]'
      : 'border-[hsl(var(--flo-purple)/.3)] text-[hsl(var(--flo-purple))]';
    
    return (
      <Badge 
        variant="outline"
        className={badgeColor}
        data-testid={`badge-source-${source}`}
      >
        {source === 'dexa' ? 'DEXA' : 'HealthKit'}
      </Badge>
    );
  };

  // Show tile content if we have a score OR ANY body comp metric from the API
  const hasData = (score !== null && score !== undefined) || (snapshot && (
    snapshot.bodyFatPct !== null || 
    snapshot.weightKg !== null || 
    snapshot.leanMassKg !== null ||
    snapshot.bmi !== null ||
    snapshot.waistCircumferenceCm !== null ||
    snapshot.vatAreaCm2 !== null
  ));
  
  const bodyFatPct = snapshot?.bodyFatPct;
  const leanMassKg = snapshot?.leanMassKg;
  const weightKg = snapshot?.weightKg;
  
  // Calculate lean percentage from lean mass and weight (with null protection)
  const leanPercent = (weightKg !== null && weightKg !== undefined && leanMassKg !== null && leanMassKg !== undefined) 
    ? (leanMassKg / weightKg) * 100 
    : null;
  
  // Show donut chart only if we have fat percentage (lean percent is optional)
  const hasBodyComp = bodyFatPct !== null && bodyFatPct !== undefined;

  // Calculate donut chart segments only when we have data
  const circumference = 2 * Math.PI * 45; // radius = 45
  const fatOffset = hasBodyComp ? circumference * (1 - bodyFatPct! / 100) : 0;
  const leanOffset = hasBodyComp ? circumference * (bodyFatPct! / 100) : 0;

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all ${
        isDark 
          ? 'bg-white/5 border-white/10' 
          : 'bg-white/60 border-black/10'
      }`}
      data-testid="tile-body-composition"
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
        <h3 className={`text-xs tracking-wide ${
          isDark ? 'text-white/60' : 'text-gray-500'
        }`}>
          BODY COMP
        </h3>
      </div>

      {isLoading ? (
        <div className="py-8 space-y-4">
          <Skeleton className="h-12 w-24 mx-auto" />
          <div className="flex items-center justify-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ) : hasData ? (
        <>
          {/* Show score if available */}
          {score !== null && score !== undefined && (
            <div className="flex items-baseline gap-2 mb-4">
              <span className={`text-4xl font-semibold ${getScoreColor(score)}`} data-testid="text-score">
                {score}
              </span>
              <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                / 100
              </span>
            </div>
          )}

          {/* If snapshot data is missing, show notice */}
          {!snapshot ? (
            <div className={`py-3 px-4 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
              <p className={`text-xs text-center ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                Detailed metrics unavailable
              </p>
            </div>
          ) : hasBodyComp ? (
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
                    {bodyFatPct!.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex-1 space-y-2">
                {leanPercent !== null && (
                  <div className="flex items-center justify-between" data-testid="legend-lean">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                        Lean
                      </span>
                      {renderSourceBadge(snapshot?.leanMassSource || null)}
                    </div>
                    <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                      {leanPercent.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between" data-testid="legend-fat">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Fat
                    </span>
                    {renderSourceBadge(snapshot?.bodyFatSource || null)}
                  </div>
                  <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                    {bodyFatPct!.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          
          {/* Only show metrics if snapshot exists */}
          {snapshot && (
            <div className="space-y-2">
            {/* Weight */}
            {snapshot?.weightKg !== null && snapshot?.weightKg !== undefined && (
              <div className="flex items-center justify-between" data-testid="metric-weight">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    Weight
                  </span>
                  {renderSourceBadge(snapshot.weightSource)}
                </div>
                <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                  {snapshot.weightKg.toFixed(1)} kg
                </span>
              </div>
            )}

            {/* BMI (HealthKit only - no badge needed) */}
            {snapshot?.bmi !== null && snapshot?.bmi !== undefined && (
              <div className="flex items-center justify-between" data-testid="metric-bmi">
                <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  BMI
                </span>
                <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                  {snapshot.bmi.toFixed(1)}
                </span>
              </div>
            )}

            {/* Visceral Fat */}
            {snapshot?.vatAreaCm2 !== null && snapshot?.vatAreaCm2 !== undefined && (
              <div className="flex items-center justify-between" data-testid="metric-visceral-fat">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    Visceral Fat
                  </span>
                  {renderSourceBadge(snapshot.vatSource)}
                </div>
                <span className={`text-xs font-medium ${getVisceralFatColor(snapshot.vatAreaCm2)}`}>
                  {snapshot.vatAreaCm2.toFixed(1)} cm²
                </span>
              </div>
            )}

            {/* Waist Circumference (HealthKit only - no badge needed) */}
            {snapshot?.waistCircumferenceCm !== null && snapshot?.waistCircumferenceCm !== undefined && (
              <div className="flex items-center justify-between" data-testid="metric-waist">
                <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Waist
                </span>
                <span className={`text-xs font-medium ${isDark ? 'text-white/90' : 'text-gray-800'}`}>
                  {snapshot.waistCircumferenceCm.toFixed(1)} cm
                </span>
              </div>
            )}
            </div>
          )}
        </>
      ) : (
        <div className="py-8 text-center">
          {/* Show score if available even without snapshot data */}
          {score !== null && score !== undefined ? (
            <>
              <div className="flex items-baseline gap-2 justify-center mb-4">
                <span className={`text-4xl font-semibold ${getScoreColor(score)}`} data-testid="text-score">
                  {score}
                </span>
                <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  / 100
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                Detailed metrics unavailable
              </p>
            </>
          ) : (
            <>
              <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                No data available
              </p>
              <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                Upload DEXA scan to see score
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
