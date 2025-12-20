import { useState } from 'react';
import { Plus, Upload, LogOut, Moon, Sun, Sparkles, TrendingUp, TrendingDown, Shield, RotateCcw, AlertCircle, Activity, FlaskConical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { FloLogo } from '@/components/FloLogo';
import { BottomNav } from '@/components/BottomNav';
import { TrendChart } from '@/components/TrendChart';
import { UnifiedUploadModal } from '@/components/UnifiedUploadModal';
import { BiomarkerInsightsModal } from '@/components/BiomarkerInsightsModal';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useUnitDisplayMode } from '@/hooks/useUnitDisplayMode';
import { useTheme } from '@/components/theme-provider';
import { 
  mapAnalysisToBiomarkerReadings, 
  type BiomarkerReading 
} from '@/lib/flo-data-adapters';
import { BIOMARKER_CONFIGS, DISPLAY_CATEGORIES, DISPLAY_TO_CATEGORIES } from '@/lib/biomarker-config';
import { queryClient } from '@/lib/queryClient';
import { logger } from '@/lib/logger';

// Longevity-focused retest intervals (in months) based on clinical guidelines
const RETEST_INTERVALS: Record<string, number | null> = {
  // Core Longevity Panel (6-month)
  'WBC': 6, 'RBC': 6, 'Hemoglobin': 6, 'Hematocrit': 6, 'MCV': 6, 'MCH': 6, 'MCHC': 6, 
  'Platelets': 6, 'Neutrophils': 6, 'Lymphocytes': 6, 'Monocytes': 6, 'Eosinophils': 6, 'Basophils': 6,
  'Sodium': 6, 'Potassium': 6, 'Chloride': 6, 'CO2': 6, 'BUN': 6, 'Creatinine': 6, 'eGFR': 6,
  'Glucose': 6, 'Calcium': 6, 'Total Protein': 6, 'Albumin': 6, 'Globulin': 6, 'A/G Ratio': 6,
  'ALT': 6, 'AST': 6, 'ALP': 6, 'Total Bilirubin': 6, 'Direct Bilirubin': 6, 'GGT': 6,
  'Total Cholesterol': 6, 'LDL': 6, 'HDL': 6, 'Triglycerides': 6, 'VLDL': 6, 'Non-HDL Cholesterol': 6,
  'ApoB': 6, 'Apolipoprotein B': 6,
  'Fasting Glucose': 6, 'HbA1c': 6, 'Fasting Insulin': 6, 'HOMA-IR': 6,
  'hs-CRP': 6, 'High-Sensitivity CRP': 6,
  'Uric Acid': 6,
  'Testosterone': 6, 'Total Testosterone': 6, 'Free Testosterone': 6, 'SHBG': 6,
  'Estradiol': 6, 'E2': 6,
  'PSA': 12, 'Prostate-Specific Antigen': 12,
  
  // Extended Longevity Panel (12-month)
  'Iron': 12, 'Ferritin': 12, 'TIBC': 12, 'Transferrin Saturation': 12, 'Serum Iron': 12,
  'Vitamin B12': 12, 'B12': 12,
  'Folate': 12, 'Folic Acid': 12,
  'Vitamin D': 12, '25-OH Vitamin D': 12, 'Vitamin D 25-Hydroxy': 12,
  'Magnesium': 12, 'RBC Magnesium': 12,
  'Urine Albumin': 12, 'Urine Creatinine': 12, 'ACR': 12, 'Albumin/Creatinine Ratio': 12,
  'TSH': 12, 'Free T4': 12, 'Free T3': 12, 'T4': 12, 'T3': 12,
  'Homocysteine': 12,
  'IGF-1': 12, 'Insulin-like Growth Factor 1': 12,
  
  // One-off / Genetic markers (rarely retested)
  'Lp(a)': null, 'Lipoprotein(a)': null,
};

// Default interval for any biomarker not explicitly listed
const DEFAULT_INTERVAL_MONTHS = 6;

// Helper function to determine if a retest is recommended
function isRetestRecommended(dateString: string, biomarkerName: string): { isRecommended: boolean; daysOld: number } {
  const testDate = new Date(dateString);
  const today = new Date();
  const daysOld = Math.floor((today.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Look up the recommended interval for this specific biomarker
  const intervalMonths = RETEST_INTERVALS[biomarkerName] ?? DEFAULT_INTERVAL_MONTHS;
  
  // If interval is null, it's a one-off test (like Lp(a)) - never recommend retest
  if (intervalMonths === null) {
    return {
      isRecommended: false,
      daysOld
    };
  }
  
  // Convert months to days (using 30.44 days per month average)
  const intervalDays = Math.floor(intervalMonths * 30.44);
  
  return {
    isRecommended: daysOld >= intervalDays,
    daysOld
  };
}

// Helper to format how long ago a test was
function formatTestAge(daysOld: number): string {
  if (daysOld < 30) {
    return `${daysOld}d ago`;
  } else if (daysOld < 365) {
    const months = Math.floor(daysOld / 30);
    return `${months}mo ago`;
  } else {
    const years = Math.floor(daysOld / 365);
    return `${years}y ago`;
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  
  const handleLogout = async () => {
    // Mobile: Clear JWT token from secure storage
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        await SecureStoragePlugin.remove({ key: 'auth_token' });
        logger.info('Logout: JWT token cleared from secure storage');
      } catch (error) {
        logger.error('Logout: Failed to clear token', error);
      }
      
      // Clear all cached queries
      queryClient.clear();
      
      // Redirect to mobile auth screen
      setLocation('/mobile-auth');
    } else {
      // Web: Use session logout endpoint
      window.location.href = '/api/logout';
    }
  };
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { isDark } = useTheme();
  
  const { isOriginal, toggleMode } = useUnitDisplayMode();
  
  // Insights modal state
  const [selectedInsightsBiomarker, setSelectedInsightsBiomarker] = useState<{
    id: string;
    name: string;
    value: number;
    unit: string;
    status: 'optimal' | 'low' | 'high';
  } | null>(null);

  // Fetch biomarker sessions with measurements (new system)
  const { data: sessionsData, isLoading: isSessionsLoading } = useQuery<any>({
    queryKey: ['/api/biomarker-sessions'],
    enabled: !!user,
  });

  // Fetch all biomarkers catalog
  const { data: biomarkersData, isLoading: isBiomarkersLoading } = useQuery<any>({
    queryKey: ['/api/biomarkers'],
    enabled: !!user,
  });

  const sessions = sessionsData?.sessions || [];
  const biomarkers = biomarkersData?.biomarkers || [];
  const isInitialLoading = isSessionsLoading || isBiomarkersLoading;

  // Build measurements map: biomarkerId -> array of measurements with dates
  // Includes both raw (original) and canonical (standardized) values
  const measurementsByBiomarker = new Map<string, Array<{
    valueCanonical: number;
    unitCanonical: string;
    valueRaw: number;
    unitRaw: string;
    referenceLowRaw: number | null;
    referenceHighRaw: number | null;
    referenceLow: number | null;
    referenceHigh: number | null;
    date: string;
    biomarkerId: string;
    biomarkerName: string;
  }>>();

  sessions.forEach((session: any) => {
    session.measurements?.forEach((m: any) => {
      const biomarker = biomarkers.find((b: any) => b.id === m.biomarkerId);
      if (!biomarker) return;

      if (!measurementsByBiomarker.has(m.biomarkerId)) {
        measurementsByBiomarker.set(m.biomarkerId, []);
      }

      measurementsByBiomarker.get(m.biomarkerId)!.push({
        valueCanonical: m.valueCanonical,
        unitCanonical: m.unitCanonical,
        valueRaw: m.valueRaw,
        unitRaw: m.unitRaw,
        referenceLowRaw: m.referenceLowRaw ?? null,
        referenceHighRaw: m.referenceHighRaw ?? null,
        referenceLow: m.referenceLow ?? null,
        referenceHigh: m.referenceHigh ?? null,
        date: session.testDate,
        biomarkerId: m.biomarkerId,
        biomarkerName: biomarker.name,
      });
    });
  });
  
  // Helper to get display value/unit based on mode
  const getDisplayValues = (measurement: typeof measurementsByBiomarker extends Map<string, Array<infer T>> ? T : never) => {
    if (isOriginal) {
      return {
        value: measurement.valueRaw,
        unit: measurement.unitRaw,
        refLow: measurement.referenceLowRaw,
        refHigh: measurement.referenceHighRaw,
      };
    }
    return {
      value: measurement.valueCanonical,
      unit: measurement.unitCanonical,
      refLow: measurement.referenceLow,
      refHigh: measurement.referenceHigh,
    };
  };

  // Get tracked biomarker IDs (only those with measurements)
  const trackedBiomarkerIds = Array.from(measurementsByBiomarker.keys());

  // Helper functions - define BEFORE using them
  const getLatestMeasurement = (biomarkerId: string) => {
    const measurements = measurementsByBiomarker.get(biomarkerId) || [];
    return measurements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  // Filter by display category (maps to one or more original categories)
  const filteredBiomarkerIds = trackedBiomarkerIds.filter(biomarkerId => {
    if (selectedCategory === 'All') return true;
    const measurements = measurementsByBiomarker.get(biomarkerId);
    if (!measurements || measurements.length === 0) return false;
    
    const biomarkerName = measurements[0].biomarkerName;
    const config = BIOMARKER_CONFIGS[biomarkerName];
    if (!config) return false;
    
    // Get the original categories that map to this display category
    const originalCategories = DISPLAY_TO_CATEGORIES[selectedCategory] || [];
    return originalCategories.includes(config.category);
  });

  // Count how many tests need retesting in the filtered view
  const retestsNeeded = filteredBiomarkerIds.filter(biomarkerId => {
    const latest = getLatestMeasurement(biomarkerId);
    if (!latest) return false;
    const retestInfo = isRetestRecommended(latest.date, latest.biomarkerName);
    return retestInfo.isRecommended;
  }).length;

  const isInRangeWithRefs = (value: number, refLow: number, refHigh: number) => {
    return value >= refLow && value <= refHigh;
  };

  const getBiomarkerHistory = (biomarkerId: string) => {
    const measurements = measurementsByBiomarker.get(biomarkerId) || [];
    return measurements
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(m => {
        const display = getDisplayValues(m);
        return {
          biomarker: m.biomarkerName,
          value: display.value,
          date: m.date,
        };
      });
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <div className={`flex-1 overflow-y-auto overscroll-none pb-20 transition-colors ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FloLogo size={32} />
              <div>
                <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Blood Panel
                </h1>
                <div className="flex items-center gap-2">
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {filteredBiomarkerIds.length} biomarkers tracked
                  </p>
                  {retestsNeeded > 0 && (
                    <>
                      <span className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>•</span>
                      <p className="text-xs text-amber-500 flex items-center gap-1" data-testid="text-retests-due">
                        <AlertCircle className="w-3 h-3" />
                        {retestsNeeded} due
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link 
                href="/diagnostics"
                className={`flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="link-diagnostics"
                aria-label="Diagnostics"
              >
                <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                <span className={`text-[10px] ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                  Diagnostics
                </span>
              </Link>
              <Link 
                href="/history"
                className={`p-2 rounded-lg transition-colors inline-flex items-center justify-center ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="link-history"
                aria-label="Measurement History"
              >
                <RotateCcw className={`w-4 h-4 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Category Pills + Unit Toggle */}
      <div className={`sticky top-[57px] z-40 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory flex-1">
              {DISPLAY_CATEGORIES.map(category => (
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
                  {category}
                </button>
              ))}
            </div>
            
            {/* Unit Display Toggle */}
            <div 
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg flex-shrink-0 ${
                isDark ? 'bg-white/5' : 'bg-black/5'
              }`}
              data-testid="toggle-unit-mode"
            >
              <FlaskConical className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-500'}`} />
              <span className={`text-[10px] whitespace-nowrap ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                {isOriginal ? 'Lab' : 'Std'}
              </span>
              <Switch
                checked={!isOriginal}
                onCheckedChange={() => toggleMode()}
                className="scale-75"
                data-testid="switch-unit-mode"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="px-3 py-3">
        {isInitialLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`backdrop-blur-xl rounded-2xl border p-4 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'}`}>
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-10 w-16 mb-2" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : trackedBiomarkerIds.length === 0 ? (
          <div className={`backdrop-blur-xl rounded-2xl border p-8 text-center ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            <h3 className={`text-lg mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No blood work data yet
            </h3>
            <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Add your first test results to get started with AI-powered insights
            </p>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white px-6 py-3 rounded-xl hover:scale-105 transition-transform"
              data-testid="button-upload-first"
            >
              Add Test Results
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBiomarkerIds.map(biomarkerId => {
              const latest = getLatestMeasurement(biomarkerId);
              if (!latest) return null;
              
              const biomarkerName = latest.biomarkerName;
              const config = BIOMARKER_CONFIGS[biomarkerName];
              if (!config) return null;
              
              const displayVals = getDisplayValues(latest);
              const displayRefLow = displayVals.refLow ?? config.min;
              const displayRefHigh = displayVals.refHigh ?? config.max;
              const inRange = isInRangeWithRefs(displayVals.value, displayRefLow, displayRefHigh);
              const history = getBiomarkerHistory(biomarkerId);
              
              const retestInfo = isRetestRecommended(latest.date, biomarkerName);
              const testAge = formatTestAge(retestInfo.daysOld);

              const handleTileClick = () => {
                setSelectedInsightsBiomarker({
                  id: biomarkerId,
                  name: biomarkerName,
                  value: displayVals.value,
                  unit: displayVals.unit,
                  status: inRange ? 'optimal' : (displayVals.value < displayRefLow ? 'low' : 'high'),
                });
              };

              return (
                <div
                  key={biomarkerId}
                  onClick={handleTileClick}
                  className={`backdrop-blur-xl rounded-2xl border p-4 transition-all cursor-pointer hover:scale-[1.02] select-none ${
                    isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
                  }`}
                  style={{ WebkitTouchCallout: 'none' }}
                  data-testid={`card-biomarker-${biomarkerName.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{biomarkerName}</h3>
                        <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                          {new Date(latest.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inRange ? (
                        <div className="px-2 py-0.5 rounded-full bg-green-500/20 text-[10px] text-green-600" data-testid={`status-${biomarkerName.toLowerCase().replace(/\s+/g, '-')}-optimal`}>
                          Optimal
                        </div>
                      ) : (
                        <div className="px-2 py-0.5 rounded-full bg-red-500/20 text-[10px] text-red-600" data-testid={`status-${biomarkerName.toLowerCase().replace(/\s+/g, '-')}-out-of-range`}>
                          Out of Range
                        </div>
                      )}
                      <Sparkles className={`w-3.5 h-3.5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                    </div>
                  </div>
                  
                  <div className="flex items-end gap-2 mb-3">
                    <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid={`value-${biomarkerName.toLowerCase().replace(/\s+/g, '-')}`}>
                      {displayVals.value}
                    </span>
                    <span className={`mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>{displayVals.unit}</span>
                  </div>
                  
                  <div className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                    {isOriginal ? 'Lab Range' : 'Optimal'}: {displayRefLow} - {displayRefHigh} {displayVals.unit}
                  </div>
                  
                  {/* Trend Chart */}
                  {history.length >= 2 && (
                    <TrendChart 
                      history={history}
                      min={displayRefLow}
                      max={displayRefHigh}
                      biomarker={biomarkerName}
                      unit={displayVals.unit}
                      isDark={isDark}
                    />
                  )}

                  {/* Retest Recommendation */}
                  {retestInfo.isRecommended && (
                    <div className={`mt-3 pt-3 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                          <div>
                            <p className={`text-xs font-medium ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                              Retest Recommended
                            </p>
                            <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                              Last tested {testAge}
                            </p>
                          </div>
                        </div>
                        <div className="px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                          <span className="text-[10px] text-amber-500 font-medium">Due</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
      </div>

      <BottomNav 
        isDark={isDark}
        onAddClick={() => setIsAddModalOpen(true)}
      />
      
      {/* Upload Modal */}
      {isAddModalOpen && (
        <UnifiedUploadModal
          isDark={isDark}
          onClose={() => setIsAddModalOpen(false)}
          initialMode="lab-results"
        />
      )}

      {/* Biomarker Insights Modal */}
      {selectedInsightsBiomarker && (
        <BiomarkerInsightsModal
          isOpen={true}
          onClose={() => setSelectedInsightsBiomarker(null)}
          biomarkerId={selectedInsightsBiomarker.id}
          biomarkerName={selectedInsightsBiomarker.name}
          latestValue={selectedInsightsBiomarker.value}
          unit={selectedInsightsBiomarker.unit}
          status={selectedInsightsBiomarker.status}
        />
      )}
    </div>
  );
}
