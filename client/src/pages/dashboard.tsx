import { useState } from 'react';
import { Plus, Upload, LogOut, Moon, Sun, Sparkles, TrendingUp, TrendingDown, Shield, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { FloLogo } from '@/components/FloLogo';
import { FloBottomNav } from '@/components/FloBottomNav';
import { TrendChart } from '@/components/TrendChart';
import { AddTestResultsModal } from '@/components/AddTestResultsModal';
import { BiomarkerInsightsModal } from '@/components/BiomarkerInsightsModal';
import { useAuth } from '@/hooks/useAuth';
import { 
  mapAnalysisToBiomarkerReadings, 
  type BiomarkerReading 
} from '@/lib/flo-data-adapters';
import { BIOMARKER_CONFIGS, CATEGORIES } from '@/lib/biomarker-config';
import { queryClient } from '@/lib/queryClient';

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
  
  const handleLogout = async () => {
    // Mobile: Clear JWT token from secure storage
    if (Capacitor.isNativePlatform()) {
      try {
        const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
        await SecureStoragePlugin.remove({ key: 'auth_token' });
        console.log('[Logout] JWT token cleared from secure storage');
      } catch (error) {
        console.error('[Logout] Failed to clear token:', error);
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
  const [isDark, setIsDark] = useState(true);
  
  // Insights modal state
  const [selectedInsightsBiomarker, setSelectedInsightsBiomarker] = useState<{
    id: string;
    name: string;
    value: number;
    unit: string;
    status: 'optimal' | 'low' | 'high';
  } | null>(null);

  // Fetch biomarker sessions with measurements (new system)
  const { data: sessionsData } = useQuery<any>({
    queryKey: ['/api/biomarker-sessions'],
    enabled: !!user,
  });

  // Fetch all biomarkers catalog
  const { data: biomarkersData } = useQuery<any>({
    queryKey: ['/api/biomarkers'],
    enabled: !!user,
  });

  const sessions = sessionsData?.sessions || [];
  const biomarkers = biomarkersData?.biomarkers || [];

  // Build measurements map: biomarkerId -> array of measurements with dates
  const measurementsByBiomarker = new Map<string, Array<{
    value: number;
    unit: string;
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
        value: m.valueCanonical,
        unit: m.unitCanonical,
        date: session.testDate,
        biomarkerId: m.biomarkerId,
        biomarkerName: biomarker.name,
      });
    });
  });

  // Get tracked biomarker IDs (only those with measurements)
  const trackedBiomarkerIds = Array.from(measurementsByBiomarker.keys());

  // Filter by category
  const filteredBiomarkerIds = trackedBiomarkerIds.filter(biomarkerId => {
    if (selectedCategory === 'All') return true;
    const measurements = measurementsByBiomarker.get(biomarkerId);
    if (!measurements || measurements.length === 0) return false;
    
    const biomarkerName = measurements[0].biomarkerName;
    const config = BIOMARKER_CONFIGS[biomarkerName];
    return config && config.category === selectedCategory;
  });

  const getLatestMeasurement = (biomarkerId: string) => {
    const measurements = measurementsByBiomarker.get(biomarkerId) || [];
    return measurements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const isInRange = (biomarkerName: string, value: number) => {
    const config = BIOMARKER_CONFIGS[biomarkerName];
    if (!config) return true;
    return value >= config.min && value <= config.max;
  };

  const getBiomarkerHistory = (biomarkerId: string) => {
    const measurements = measurementsByBiomarker.get(biomarkerId) || [];
    return measurements
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(m => ({
        biomarker: m.biomarkerName,
        value: m.value,
        date: m.date,
      }));
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
              {user?.role === 'admin' && (
                <Link 
                  href="/admin"
                  className={`p-2 rounded-lg transition-colors inline-flex items-center justify-center ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                  data-testid="link-admin"
                  aria-label="Admin Dashboard"
                >
                  <Shield className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                </Link>
              )}
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
        {trackedBiomarkerIds.length === 0 ? (
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
              
              const inRange = isInRange(biomarkerName, latest.value);
              const history = getBiomarkerHistory(biomarkerId);

              const handleTileClick = () => {
                setSelectedInsightsBiomarker({
                  id: biomarkerId,
                  name: biomarkerName,
                  value: latest.value,
                  unit: latest.unit,
                  status: inRange ? 'optimal' : (latest.value < config.min ? 'low' : 'high'),
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
                      {latest.value}
                    </span>
                    <span className={`mb-1.5 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>{latest.unit}</span>
                  </div>
                  
                  <div className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                    Optimal: {config.min} - {config.max} {config.unit}
                  </div>
                  
                  {/* Trend Chart */}
                  {history.length >= 2 && (
                    <TrendChart 
                      history={history}
                      min={config.min}
                      max={config.max}
                      biomarker={biomarkerName}
                      isDark={isDark}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <FloBottomNav />
      
      {/* Add Test Results Modal */}
      <AddTestResultsModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

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
