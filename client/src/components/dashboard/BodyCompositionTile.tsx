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
      <h3 className={`text-lg font-medium mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
        Body Composition
      </h3>

      {isLoading ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        </div>
      ) : hasBodyComp ? (
        <div className="space-y-6">
          {/* Body Fat Percentage */}
          <div className="space-y-2" data-testid="metric-body-fat">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Body Fat Percentage
                </span>
                {renderSourceBadge(snapshot?.bodyFatSource || null)}
              </div>
              <span className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {bodyFatPct!.toFixed(1)}%
              </span>
            </div>
            <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
              <div 
                className="h-full bg-orange-500 transition-all duration-500 ease-out"
                style={{ width: `${bodyFatPct}%` }}
                data-testid="progress-body-fat"
              />
            </div>
          </div>

          {/* Lean Mass Percentage */}
          {leanPercent !== null && (
            <div className="space-y-2" data-testid="metric-lean-mass">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    Lean Mass Percentage
                  </span>
                  {renderSourceBadge(snapshot?.leanMassSource || null)}
                </div>
                <span className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {leanPercent.toFixed(1)}%
                </span>
              </div>
              <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                <div 
                  className="h-full bg-blue-500 transition-all duration-500 ease-out"
                  style={{ width: `${leanPercent}%` }}
                  data-testid="progress-lean-mass"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No data available
          </p>
          <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            Upload DEXA scan or sync HealthKit
          </p>
        </div>
      )}
    </div>
  );
}
