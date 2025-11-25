import { Activity, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BodyCompositionDetailScreen } from './BodyCompositionDetailScreen';

interface BodyCompositionData {
  body_composition_score: number;
  body_fat_percent: number | null;
  lean_mass_percent: number | null;
  visceral_fat_area_cm2: number | null;
  visceral_fat_score: number | null;
  bone_health_category: 'normal' | 'osteopenia' | 'osteoporosis';
  weight_kg: number | null;
  bmi: number | null;
  last_updated: string | null;
}

interface HistoryEntry {
  date: string;
  bodyFatPercent: number | null;
  leanMassPercent: number | null;
  weightKg: number | null;
}

interface ApiResponse {
  hasData: boolean;
  data: BodyCompositionData | null;
  history: HistoryEntry[];
}

interface BodyCompositionTileProps {
  isDark: boolean;
}

export function BodyCompositionTile({ isDark }: BodyCompositionTileProps) {
  const [showDetails, setShowDetails] = useState(false);

  const { data: response, isLoading } = useQuery<ApiResponse>({
    queryKey: ['/api/body-composition'],
    staleTime: 0,
    gcTime: 0,
  });

  if (isLoading) {
    return (
      <div 
        className={`backdrop-blur-xl rounded-2xl border p-4 animate-pulse ${
          isDark 
            ? 'bg-white/5 border-white/10' 
            : 'bg-white/60 border-black/10'
        }`}
        data-testid="tile-body-composition-loading"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-4 h-4 rounded ${isDark ? 'bg-white/20' : 'bg-gray-300'}`} />
          <div className={`h-4 w-20 rounded ${isDark ? 'bg-white/20' : 'bg-gray-300'}`} />
        </div>
        <div className={`h-10 w-16 rounded ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
      </div>
    );
  }

  if (!response?.hasData || !response.data) {
    return null;
  }

  const data = response.data;

  const getScoreColor = () => {
    if (data.body_composition_score >= 80) return isDark ? 'text-green-400' : 'text-green-600';
    if (data.body_composition_score >= 60) return isDark ? 'text-blue-400' : 'text-blue-600';
    if (data.body_composition_score >= 40) return isDark ? 'text-yellow-400' : 'text-yellow-600';
    return isDark ? 'text-orange-400' : 'text-orange-600';
  };

  const getBoneColor = () => {
    if (data.bone_health_category === 'normal') {
      return isDark ? 'text-green-400' : 'text-green-600';
    } else if (data.bone_health_category === 'osteopenia') {
      return isDark ? 'text-yellow-400' : 'text-yellow-700';
    } else {
      return isDark ? 'text-red-400' : 'text-red-600';
    }
  };

  const bodyFatPercent = data.body_fat_percent ?? 0;
  const leanMassPercent = data.lean_mass_percent ?? 0;

  const fatAngle = (bodyFatPercent / 100) * 360;
  const leanAngle = (leanMassPercent / 100) * 360;

  return (
    <>
      <div 
        onClick={() => setShowDetails(true)}
        className={`backdrop-blur-xl rounded-2xl border p-4 transition-all cursor-pointer hover:scale-[1.02] ${
          isDark 
            ? 'bg-white/5 border-white/10 hover:bg-white/10' 
            : 'bg-white/60 border-black/10 hover:bg-white/90'
        }`}
        data-testid="tile-body-composition"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Body Comp
            </h3>
          </div>
          <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className={`text-4xl ${getScoreColor()}`} data-testid="text-body-comp-score">
            {data.body_composition_score}
          </span>
          <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            /100
          </span>
        </div>

        {data.body_fat_percent !== null && data.lean_mass_percent !== null && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke={isDark ? '#fb923c' : '#f97316'}
                    strokeWidth="8"
                    strokeDasharray={`${(fatAngle / 360) * 176} 176`}
                    strokeDashoffset="0"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke={isDark ? '#60a5fa' : '#3b82f6'}
                    strokeWidth="8"
                    strokeDasharray={`${(leanAngle / 360) * 176} 176`}
                    strokeDashoffset={`-${(fatAngle / 360) * 176}`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    {bodyFatPercent}%
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5">
                <LegendItem 
                  color={isDark ? 'bg-blue-500' : 'bg-blue-600'}
                  label="Lean"
                  value={`${leanMassPercent.toFixed(1)}%`}
                  isDark={isDark}
                />
                <LegendItem 
                  color={isDark ? 'bg-orange-500' : 'bg-orange-600'}
                  label="Fat"
                  value={`${bodyFatPercent}%`}
                  isDark={isDark}
                />
              </div>
            </div>

            <div className="space-y-2">
              {data.visceral_fat_area_cm2 !== null && data.visceral_fat_score !== null && (
                <MetricRow 
                  label="Visceral Fat"
                  value={`${data.visceral_fat_area_cm2.toFixed(0)} cm²`}
                  score={data.visceral_fat_score}
                  isDark={isDark}
                />
              )}
              <MetricRow 
                label="Bone Health"
                value={data.bone_health_category.charAt(0).toUpperCase() + data.bone_health_category.slice(1)}
                valueColor={getBoneColor()}
                isDark={isDark}
              />
            </div>
          </>
        )}
      </div>

      {showDetails && (
        <BodyCompositionDetailScreen 
          isDark={isDark}
          onClose={() => setShowDetails(false)}
          data={data}
          history={response.history}
        />
      )}
    </>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
  value: string;
  isDark: boolean;
}

function LegendItem({ color, label, value, isDark }: LegendItemProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`}></div>
      <span className={`text-[10px] ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
        {label}
      </span>
      <span className={`text-[10px] ml-auto ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
        {value}
      </span>
    </div>
  );
}

interface MetricRowProps {
  label: string;
  value: string;
  score?: number;
  valueColor?: string;
  isDark: boolean;
}

function MetricRow({ label, value, score, valueColor, isDark }: MetricRowProps) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return isDark ? 'text-green-400' : 'text-green-600';
    if (s >= 60) return isDark ? 'text-blue-400' : 'text-blue-600';
    if (s >= 40) return isDark ? 'text-yellow-400' : 'text-yellow-600';
    return isDark ? 'text-orange-400' : 'text-orange-600';
  };

  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className={isDark ? 'text-white/60' : 'text-gray-600'}>
        {label}
      </span>
      <span className={valueColor || (score !== undefined ? getScoreColor(score) : isDark ? 'text-white/50' : 'text-gray-500')}>
        {value}
        {score !== undefined && ` (${score})`}
      </span>
    </div>
  );
}
