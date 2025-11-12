import { useState } from 'react';
import { Plus, Upload, LogOut, Moon, Sun, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { FloLogo } from '@/components/FloLogo';
import { FloBottomNav } from '@/components/FloBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { 
  mapAnalysisToBiomarkerReadings, 
  type BiomarkerReading 
} from '@/lib/flo-data-adapters';
import { BIOMARKER_CONFIGS, CATEGORIES } from '@/lib/biomarker-config';

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'All': 'All',
  'Basic Panels': 'Basic',
  'Lipid & Cardiovascular Health': 'Lipids & Cardio',
  'Hormonal & Endocrine': 'Hormones',
  'Metabolic & Diabetes': 'Metabolic',
  'Liver & Kidney Function': 'Liver & Kidney',
  'Nutritional & Vitamin Status': 'Nutrition',
  'Inflammation & Immune Markers': 'Inflammation',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  
  const handleLogout = () => {
    window.location.href = '/api/logout';
  };
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDark, setIsDark] = useState(true);

  const { data: latestAnalysis } = useQuery<any>({
    queryKey: ['/api/blood-work/latest'],
    enabled: !!user,
  });

  const readings: BiomarkerReading[] = mapAnalysisToBiomarkerReadings(latestAnalysis);

  const trackedBiomarkers = Array.from(new Set(readings.map(r => r.biomarker)))
    .filter(biomarker => BIOMARKER_CONFIGS[biomarker]);

  const filteredBiomarkers = trackedBiomarkers.filter(biomarker => {
    if (selectedCategory === 'All') return true;
    const config = BIOMARKER_CONFIGS[biomarker];
    return config && config.category === selectedCategory;
  });

  const getLatestReading = (biomarker: string) => {
    return readings
      .filter(r => r.biomarker === biomarker)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const isInRange = (biomarker: string, value: number) => {
    const config = BIOMARKER_CONFIGS[biomarker];
    return value >= config.min && value <= config.max;
  };

  return (
    <div className={`min-h-screen pb-20 transition-colors ${
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
            <FloLogo size={32} showText={true} className={isDark ? 'text-white' : 'text-gray-900'} />
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsDark(!isDark)}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-theme-toggle"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-white/70" />
                ) : (
                  <Moon className="w-4 h-4 text-gray-600" />
                )}
              </button>
              <button 
                onClick={handleLogout}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-logout"
              >
                <LogOut className={`w-4 h-4 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Category Pills */}
      <div className={`sticky top-[57px] z-40 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-3 py-2.5">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory">
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`
                  px-3 py-1.5 rounded-full whitespace-nowrap transition-all flex-shrink-0 text-xs snap-start
                  ${selectedCategory === category
                    ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25'
                    : isDark 
                      ? 'bg-white/10 text-white/70 hover:bg-white/20'
                      : 'bg-white/60 text-gray-700 hover:bg-white/80'
                  }
                `}
                data-testid={`filter-category-${category.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {CATEGORY_DISPLAY_NAMES[category] || category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="px-3 py-3">
        {readings.length === 0 ? (
          <div className={`backdrop-blur-xl rounded-2xl border p-8 text-center ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            <h3 className={`text-lg mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No blood work data yet
            </h3>
            <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Upload your first blood work to get started with AI-powered insights
            </p>
            <Link href="/upload">
              <button 
                className="bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white px-6 py-3 rounded-xl hover:scale-105 transition-transform"
                data-testid="button-upload-first"
              >
                Upload Blood Work
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBiomarkers.map(biomarker => {
              const latest = getLatestReading(biomarker);
              if (!latest) return null;
              
              const config = BIOMARKER_CONFIGS[biomarker];
              const inRange = isInRange(biomarker, latest.value);
              
              return (
                <Link 
                  key={biomarker} 
                  href={latestAnalysis ? `/insights/${latestAnalysis.id}` : '/upload'}
                >
                  <div
                    className={`backdrop-blur-xl rounded-2xl border p-4 transition-all cursor-pointer hover:scale-[1.02] ${
                      isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
                    }`}
                    data-testid={`card-biomarker-${biomarker.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div>
                          <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{biomarker}</h3>
                          <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                            {new Date(latest.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {inRange ? (
                          <div className="px-2 py-0.5 rounded-full bg-green-500/20 text-[10px] text-green-600" data-testid={`status-${biomarker.toLowerCase().replace(/\s+/g, '-')}-optimal`}>
                            Optimal
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 rounded-full bg-red-500/20 text-[10px] text-red-600" data-testid={`status-${biomarker.toLowerCase().replace(/\s+/g, '-')}-out-of-range`}>
                            Out of Range
                          </div>
                        )}
                        <Sparkles className={`w-3.5 h-3.5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                      </div>
                    </div>
                    
                    <div className="flex items-end gap-2 mb-3">
                      <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid={`value-${biomarker.toLowerCase().replace(/\s+/g, '-')}`}>
                        {latest.value}
                      </span>
                      <span className={`mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>{config.unit}</span>
                    </div>
                    
                    <div className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                      Optimal: {config.min} - {config.max} {config.unit}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <FloBottomNav />
    </div>
  );
}
