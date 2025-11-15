import { X, Activity, TrendingUp, Bone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from './ui/card';

interface BodyCompositionDetailScreenProps {
  isDark: boolean;
  onClose: () => void;
}

interface AnalysisData {
  overallScore: number;
  components: {
    bodyFatPercent: number | null;
    leanMassPercent: number | null;
    visceralFatArea: number | null;
    visceralFatScore: number | null;
    boneHealth: string | null;
    boneTScore: number | null;
  };
  recommendations: {
    lifestyle: string[];
    nutrition: string[];
    supplementation: string[];
    medicalReferral?: string;
  };
  dexaDetails: any;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-sm opacity-50">No data</span>;
  
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
  const bgColor = score >= 80 ? 'bg-green-400/10' : score >= 60 ? 'bg-yellow-400/10' : 'bg-red-400/10';
  
  return (
    <span className={`${color} ${bgColor} px-3 py-1 rounded-full text-sm font-medium`}>
      {score}
    </span>
  );
}

function ComponentCard({ title, value, unit, status, icon: Icon, isDark }: {
  title: string;
  value: number | string | null;
  unit?: string;
  status?: string;
  icon: any;
  isDark: boolean;
}) {
  return (
    <Card className={`p-4 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 opacity-70" />
          <h3 className="font-medium text-sm">{title}</h3>
        </div>
      </div>
      
      {value !== null ? (
        <div className="space-y-1">
          <div className="text-2xl font-bold">
            {typeof value === 'number' ? value.toFixed(1) : value}
            {unit && <span className="text-sm ml-1 opacity-70">{unit}</span>}
          </div>
          {status && (
            <div className={`text-xs px-2 py-1 rounded-full inline-block ${
              status.toLowerCase().includes('normal') || status.toLowerCase().includes('fit') || status.toLowerCase().includes('athlete')
                ? 'bg-green-400/20 text-green-400'
                : status.toLowerCase().includes('osteopenia') || status.toLowerCase().includes('average')
                ? 'bg-yellow-400/20 text-yellow-400'
                : 'bg-red-400/20 text-red-400'
            }`}>
              {status}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm opacity-50">No data</div>
      )}
    </Card>
  );
}

export function BodyCompositionDetailScreen({ isDark, onClose }: BodyCompositionDetailScreenProps) {
  const { data, isLoading, error } = useQuery<AnalysisData>({
    queryKey: ['/api/body-composition/analysis'],
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="modal-overlay-body-composition"
      />

      <div className={`relative w-full max-w-2xl mx-4 rounded-3xl overflow-hidden ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        <div className={`p-6 border-b ${
          isDark ? 'border-white/10' : 'border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Body Composition & Strength
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-body-composition"
            >
              <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {isLoading && (
            <div className={`text-center py-12 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <div className="text-sm opacity-60">Loading analysis...</div>
            </div>
          )}

          {error && (
            <div className={`text-center py-12 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <div className="text-sm opacity-60">
                {(error as any)?.message?.includes('404') 
                  ? 'No body composition data available. Please upload a DEXA scan.'
                  : 'Failed to load analysis. Please try again.'}
              </div>
            </div>
          )}

          {data && (
            <div className="space-y-6">
              {/* Overall Score */}
              <div className={`text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <div className="text-6xl font-bold mb-2" data-testid="text-overall-score">{data.overallScore}</div>
                <div className="text-xl">Overall Score</div>
              </div>

              {/* Component Metrics */}
              <div>
                <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  Component Breakdown
                </h3>
                <div className="grid gap-3">
                  <ComponentCard
                    title="Body Fat"
                    value={data.components.bodyFatPercent}
                    unit="%"
                    icon={Activity}
                    isDark={isDark}
                  />
                  <ComponentCard
                    title="Lean Mass"
                    value={data.components.leanMassPercent}
                    unit="%"
                    icon={TrendingUp}
                    isDark={isDark}
                  />
                  <ComponentCard
                    title="Visceral Fat Area"
                    value={data.components.visceralFatArea}
                    unit="cm²"
                    icon={Activity}
                    isDark={isDark}
                  />
                  <ComponentCard
                    title="Bone Health"
                    value={data.components.boneTScore !== null ? `T-Score: ${data.components.boneTScore.toFixed(1)}` : null}
                    status={data.components.boneHealth || undefined}
                    icon={Bone}
                    isDark={isDark}
                  />
                </div>
              </div>

              {/* AI Recommendations */}
              <div>
                <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  Personalized Recommendations
                </h3>
                <div className="space-y-4">
                  {data.recommendations.lifestyle && data.recommendations.lifestyle.length > 0 && (
                    <Card className={`p-4 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Lifestyle & Exercise
                      </h4>
                      <ul className="space-y-1 text-sm opacity-80">
                        {data.recommendations.lifestyle.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span>•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  {data.recommendations.nutrition && data.recommendations.nutrition.length > 0 && (
                    <Card className={`p-4 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Nutrition
                      </h4>
                      <ul className="space-y-1 text-sm opacity-80">
                        {data.recommendations.nutrition.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span>•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  {data.recommendations.supplementation && data.recommendations.supplementation.length > 0 && (
                    <Card className={`p-4 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Bone className="w-4 h-4" />
                        Supplementation
                      </h4>
                      <ul className="space-y-1 text-sm opacity-80">
                        {data.recommendations.supplementation.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span>•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  {data.recommendations.medicalReferral && (
                    <Card className={`p-4 ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
                      <h4 className="font-medium mb-2 text-red-500">
                        Medical Consultation
                      </h4>
                      <p className="text-sm opacity-90">{data.recommendations.medicalReferral}</p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
