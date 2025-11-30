import { X, Heart, Activity, Brain, Bone, Stethoscope } from 'lucide-react';
import { CalciumScoreTile } from './CalciumScoreTile';
import { DexaScanTile } from './DexaScanTile';
import { FloLogo } from './FloLogo';

interface CalciumScoreSummary {
  totalScore: number | null;
  riskLevel: string | null;
  agePercentile: number | null;
  studyDate: string;
}

interface DexaScanSummary {
  spineTScore: number | null;
  hipTScore: number | null;
  whoClassification: string | null;
  bodyFatPercent: number | null;
  vatArea: number | null;
  studyDate: string;
}

interface DiagnosticResultsScreenProps {
  isDark: boolean;
  onClose: () => void;
  calciumScore?: CalciumScoreSummary | null;
  dexaScan?: DexaScanSummary | null;
  userSex?: 'Male' | 'Female' | 'Other' | null;
}

export function DiagnosticResultsScreen({ isDark, onClose, calciumScore, dexaScan, userSex }: DiagnosticResultsScreenProps) {
  return (
    <div className={`h-full overflow-y-auto overscroll-none pb-20 transition-colors ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FloLogo size={32} />
              <div>
                <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Diagnostics</h1>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Advanced health scans
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-4">
        {/* Cardiovascular Section */}
        <section>
            <div className="flex items-center gap-2 mb-3">
              <Heart className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
              <h2 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                Cardiovascular Health
              </h2>
            </div>
            
            <div className="space-y-3">
              <CalciumScoreTile 
                isDark={isDark}
                score={calciumScore?.totalScore ?? null}
                riskLevel={calciumScore?.riskLevel ?? null}
                testDate={calciumScore?.studyDate ?? null}
              />
              
              {/* Coming Soon Cards */}
              <ComingSoonTile 
                title="Carotid IMT"
                description="Ultrasound measurement"
                icon={<Activity className="w-5 h-5" />}
                isDark={isDark}
              />
            </div>
          </section>

          {/* Metabolic Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h2 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                Metabolic Health
              </h2>
            </div>
            
            <div className="space-y-3">
              <DexaScanTile 
                isDark={isDark}
                spineTScore={dexaScan?.spineTScore ?? null}
                hipTScore={dexaScan?.hipTScore ?? null}
                whoClassification={dexaScan?.whoClassification ?? null}
                bodyFatPercent={dexaScan?.bodyFatPercent ?? null}
                vatArea={dexaScan?.vatArea ?? null}
                testDate={dexaScan?.studyDate ?? null}
                userSex={userSex}
              />
              <ComingSoonTile 
                title="VO2 Max Test"
                description="Cardiorespiratory fitness"
                icon={<Stethoscope className="w-5 h-5" />}
                isDark={isDark}
              />
            </div>
          </section>

          {/* Cognitive Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Brain className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              <h2 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                Cognitive Health
              </h2>
            </div>
            
            <div className="space-y-3">
              <ComingSoonTile 
                title="Brain MRI"
                description="Structural brain imaging"
                icon={<Brain className="w-5 h-5" />}
                isDark={isDark}
              />
            </div>
          </section>
      </div>
    </div>
  );
}

interface ComingSoonTileProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  isDark: boolean;
}

function ComingSoonTile({ title, description, icon, isDark }: ComingSoonTileProps) {
  return (
    <div className={`backdrop-blur-xl rounded-3xl border p-5 transition-all opacity-60 ${
      isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isDark ? 'bg-white/10' : 'bg-black/5'
          }`}>
            {icon}
          </div>
          <div>
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {title}
            </h3>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {description}
            </p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs ${
          isDark ? 'bg-white/10 text-white/60' : 'bg-gray-200 text-gray-600'
        }`}>
          Coming Soon
        </div>
      </div>
    </div>
  );
}
