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
    staleTime: 0, // Force fresh data - critical for HealthKit body comp
    gcTime: 0, // Don't cache between unmounts
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
  
  const weightKg = snapshot?.weightKg;
  const leanMassKg = snapshot?.leanMassKg;
  let bodyFatPct = snapshot?.bodyFatPct;
  
  // Calculate body fat % from weight and lean mass if not directly available
  // Formula: Body fat percentage = [(Total weight − Lean body mass) ÷ Total weight] × 100
  if (bodyFatPct === null || bodyFatPct === undefined) {
    if (weightKg !== null && weightKg !== undefined && leanMassKg !== null && leanMassKg !== undefined && weightKg > 0) {
      bodyFatPct = ((weightKg - leanMassKg) / weightKg) * 100;
    }
  }
  
  // Calculate lean percentage
  let leanPercent: number | null = null;
  if (bodyFatPct !== null && bodyFatPct !== undefined) {
    leanPercent = 100 - bodyFatPct;
  }
  
  // Show body composition visualization if we have the data
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
      ) : hasData ? (
        <div className="space-y-6">
          {/* Total Weight */}
          {weightKg !== null && weightKg !== undefined && (
            <div className="space-y-2" data-testid="metric-weight">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-gray-700'}`}>
                    Total Weight
                  </span>
                  {renderSourceBadge(snapshot?.weightSource || null)}
                </div>
                <span className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {weightKg.toFixed(1)} <span className="text-base font-normal">kg</span>
                </span>
              </div>
            </div>
          )}

          {/* Body Composition Breakdown - only show if we can calculate it */}
          {hasBodyComp && weightKg !== null && weightKg !== undefined && leanMassKg !== null && leanMassKg !== undefined && (
            <>
              {/* Visual breakdown bar */}
              <div className="space-y-3" data-testid="body-comp-visualization">
                <div className={`text-xs font-medium ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Body Composition
                </div>
                <div className="relative h-8 rounded-full overflow-hidden flex">
                  {/* Lean Mass (left side) */}
                  <div 
                    className="bg-blue-500 transition-all duration-500 ease-out flex items-center justify-center"
                    style={{ width: `${leanPercent}%` }}
                  >
                    {leanPercent! > 20 && (
                      <span className="text-xs font-medium text-white">
                        {leanPercent!.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {/* Body Fat (right side) */}
                  <div 
                    className="bg-orange-500 transition-all duration-500 ease-out flex items-center justify-center"
                    style={{ width: `${bodyFatPct}%` }}
                  >
                    {bodyFatPct! > 20 && (
                      <span className="text-xs font-medium text-white">
                        {bodyFatPct!.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Lean Body Mass */}
              <div className="space-y-2" data-testid="metric-lean-mass">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Lean Body Mass
                    </span>
                    {renderSourceBadge(snapshot?.leanMassSource || null)}
                  </div>
                  <span className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {leanMassKg.toFixed(1)} kg
                  </span>
                </div>
              </div>

              {/* Body Fat Mass */}
              <div className="space-y-2" data-testid="metric-body-fat">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      Body Fat Mass
                    </span>
                    {renderSourceBadge(snapshot?.bodyFatSource || null)}
                  </div>
                  <span className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {(weightKg - leanMassKg).toFixed(1)} kg
                  </span>
                </div>
              </div>
            </>
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
