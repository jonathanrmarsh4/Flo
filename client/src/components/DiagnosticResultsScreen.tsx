import { Heart, Activity, FileText, Droplet } from 'lucide-react';
import { Link } from 'wouter';
import { CalciumScoreTile } from './CalciumScoreTile';
import { DexaScanTile } from './DexaScanTile';
import { SpecialistReportsTile } from './SpecialistReportsTile';
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
            <div className="flex items-center gap-2">
              <Link 
                href="/labs"
                className={`flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="link-labs"
                aria-label="Labs"
              >
                <Droplet className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                <span className={`text-[10px] ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                  Labs
                </span>
              </Link>
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
            </div>
          </section>

          {/* Specialist Reports Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileText className={`w-5 h-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <h2 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                Specialist Reports
              </h2>
            </div>
            
            <div className="space-y-3">
              <SpecialistReportsTile isDark={isDark} />
            </div>
          </section>
      </div>
    </div>
  );
}

