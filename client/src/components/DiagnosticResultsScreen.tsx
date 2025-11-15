import { X, Heart, Activity, Brain, Bone, Stethoscope } from 'lucide-react';
import { CalciumScoreTile } from './CalciumScoreTile';

interface CalciumScoreData {
  score: number | null;
  riskLevel: string | null;
  testDate: string | null;
}

interface DiagnosticResultsScreenProps {
  isDark: boolean;
  onClose: () => void;
  calciumScoreData?: CalciumScoreData;
}

export function DiagnosticResultsScreen({ isDark, onClose, calciumScoreData }: DiagnosticResultsScreenProps) {
  return (
    <div className={`fixed inset-0 z-50 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Diagnostic Results
              </h1>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Advanced health assessments
              </p>
            </div>
            <button 
              onClick={onClose}
              data-testid="button-close-diagnostics"
              className={`p-2 rounded-lg transition-colors hover-elevate ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
            >
              <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="overflow-y-auto px-4 py-6 pb-24" style={{ height: 'calc(100vh - 70px)' }}>
        <div className="space-y-6 max-w-2xl mx-auto">
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
                score={calciumScoreData?.score}
                riskLevel={calciumScoreData?.riskLevel}
                testDate={calciumScoreData?.testDate}
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
              <ComingSoonTile 
                title="DEXA Scan"
                description="Body composition analysis"
                icon={<Bone className="w-5 h-5" />}
                isDark={isDark}
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
      </main>
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
