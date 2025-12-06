import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Apple, Gauge, TrendingUp, TrendingDown, Footprints, Dumbbell, Heart, Battery, Waves, ChevronRight, Loader2, Droplet } from 'lucide-react';
import { BottomNav } from './BottomNav';

interface ActivityScreenProps {
  isDark: boolean;
  onClose: () => void;
  onAddClick?: () => void;
}

type TabType = 'activity' | 'nutrition' | 'glucose';

interface ActivitySummary {
  date: string;
  steps: number | null;
  stepsGoal: number;
  distance: number | null;
  activeEnergy: number | null;
  exerciseMinutes: number | null;
  exerciseGoal: number;
  standHours: number | null;
  flightsClimbed: number | null;
  vo2Max: number | null;
  vo2Level: string | null;
  vo2Trend: 'up' | 'stable' | 'down';
  restingHeartRate: number | null;
  hrv: number | null;
  hrvBaseline: number | null;
  hrvStatus: 'recovered' | 'ok' | 'strained';
  strainScore: number | null;
  walkingSpeed: number | null;
  stepLength: number | null;
  doubleSupport: number | null;
  asymmetry: number | null;
  weight: number | null;
  sex: string | null;
  birthYear: number | null;
}

interface WorkoutsSummary {
  date: string;
  count: number;
  totalDurationMinutes: number;
  totalEnergyKcal: number;
  lastWorkout: {
    type: string;
    distanceKm: number | null;
    avgHeartRate: number | null;
    durationMinutes: number;
    energyKcal: number | null;
  } | null;
  workouts: Array<{
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    durationMinutes: number;
    distanceKm: number | null;
    energyKcal: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
  }>;
}

interface NutritionDaily {
  local_date: string;
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrates_g: number | null;
  fat_total_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  caffeine_mg: number | null;
  water_ml: number | null;
  vitamin_d_mcg: number | null;
  magnesium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  potassium_mg: number | null;
  zinc_mg: number | null;
}

interface GlucoseDaily {
  date: string;
  currentGlucose: number | null;
  glucoseStatus: 'low' | 'normal' | 'high';
  timeInRangeToday: number | null;
  timeInRange7d: number | null;
  avgToday: number | null;
  minToday: number | null;
  maxToday: number | null;
  avgGlucose7d: number | null;
  lowsToday: { count: number; minutes: number };
  highsToday: { count: number; minutes: number };
  trendData: Array<{ date: string; value: number }>;
  targetMin: number;
  targetMax: number;
}

export function ActivityScreen({ isDark, onClose, onAddClick }: ActivityScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('activity');

  return (
    <div className={`fixed inset-0 z-50 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-3">
          <div>
            <h1 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Activity
            </h1>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Track your health journey
            </p>
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="flex gap-2">
            <TabButton
              icon={<Activity className="w-4 h-4" />}
              label="Activity"
              isActive={activeTab === 'activity'}
              onClick={() => setActiveTab('activity')}
              isDark={isDark}
            />
            <TabButton
              icon={<Apple className="w-4 h-4" />}
              label="Nutrition"
              isActive={activeTab === 'nutrition'}
              onClick={() => setActiveTab('nutrition')}
              isDark={isDark}
            />
            <TabButton
              icon={<Gauge className="w-4 h-4" />}
              label="Glucose"
              isActive={activeTab === 'glucose'}
              onClick={() => setActiveTab('glucose')}
              isDark={isDark}
            />
          </div>
        </div>
      </header>

      <main className="overflow-y-auto px-4 py-6 pb-32" style={{ height: 'calc(100vh - 140px)' }}>
        <div className="max-w-2xl mx-auto">
          {activeTab === 'activity' && <ActivityTabContent isDark={isDark} />}
          {activeTab === 'nutrition' && <NutritionTabContent isDark={isDark} />}
          {activeTab === 'glucose' && <GlucoseTabContent isDark={isDark} />}
        </div>
      </main>

      <BottomNav isDark={isDark} onAddClick={onAddClick} />
    </div>
  );
}

interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isDark: boolean;
}

function TabButton({ icon, label, isActive, onClick, isDark }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all ${
        isActive
          ? isDark
            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
            : 'bg-cyan-100 text-cyan-700 border border-cyan-300'
          : isDark
            ? 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
            : 'bg-white/40 text-gray-600 border border-black/10 hover:bg-white/60'
      }`}
      data-testid={`tab-${label.toLowerCase()}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function LoadingSpinner({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
    </div>
  );
}

function EmptyState({ isDark, message }: { isDark: boolean; message: string }) {
  return (
    <div className={`text-center py-12 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
      <p>{message}</p>
    </div>
  );
}

function ActivityTabContent({ isDark }: { isDark: boolean }) {
  const { data: summary, isLoading: summaryLoading } = useQuery<ActivitySummary>({
    queryKey: ['/api/activity/summary'],
  });

  const { data: workouts, isLoading: workoutsLoading } = useQuery<WorkoutsSummary>({
    queryKey: ['/api/activity/workouts'],
  });

  if (summaryLoading || workoutsLoading) {
    return <LoadingSpinner isDark={isDark} />;
  }

  const steps = summary?.steps ?? 0;
  const stepsGoal = summary?.stepsGoal ?? 10000;
  const stepsPercent = stepsGoal > 0 ? (steps / stepsGoal) * 100 : 0;
  const distance = summary?.distance ?? 0;
  const activeEnergy = summary?.activeEnergy ?? 0;
  const exerciseMinutes = summary?.exerciseMinutes ?? 0;
  const exerciseGoal = summary?.exerciseGoal ?? 30;
  const standHours = summary?.standHours ?? 0;
  const flightsClimbed = summary?.flightsClimbed ?? 0;
  
  const workoutsToday = workouts?.count ?? 0;
  const workoutsDuration = workouts?.totalDurationMinutes ?? 0;
  const workoutsEnergy = workouts?.totalEnergyKcal ?? 0;
  const lastWorkout = workouts?.lastWorkout;
  
  const vo2Max = summary?.vo2Max;
  const vo2Level = summary?.vo2Level ?? 'Unknown';
  const restingHeartRate = summary?.restingHeartRate;
  const vo2Trend = summary?.vo2Trend ?? 'stable';
  
  const hrv = summary?.hrv;
  const hrvBaseline = summary?.hrvBaseline;
  const hrvStatus = summary?.hrvStatus ?? 'ok';
  const strainScore = summary?.strainScore;
  
  // Movement quality metrics
  const walkingSpeed = summary?.walkingSpeed;
  const stepLength = summary?.stepLength;
  const doubleSupport = summary?.doubleSupport;
  const asymmetry = summary?.asymmetry;
  const hasMovementData = walkingSpeed != null || stepLength != null || doubleSupport != null || asymmetry != null;
  
  return (
    <div className="space-y-4">
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
        data-testid="tile-todays-activity"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Footprints className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Today's Activity</h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="flex items-center gap-6 mb-4">
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="url(#steps-gradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${Math.min(stepsPercent, 100) * 2.64} 264`} />
              <defs>
                <linearGradient id="steps-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="steps-count">
                  {steps.toLocaleString()}
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>steps</div>
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <div className={`text-sm mb-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Goal: {stepsGoal.toLocaleString()}
            </div>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {Math.round(stepsPercent)}% complete
            </div>
          </div>
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Exercise</span>
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{exerciseMinutes}/{exerciseGoal} min</span>
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
            <div className="h-full bg-gradient-to-r from-green-400 to-green-500" style={{ width: `${Math.min((exerciseMinutes / exerciseGoal) * 100, 100)}%` }} />
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <div className={`text-center p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Distance</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{distance?.toFixed(1) ?? '0'} km</div>
          </div>
          <div className={`text-center p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Energy</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{activeEnergy} cal</div>
          </div>
          <div className={`text-center p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Stand</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{standHours} hrs</div>
          </div>
        </div>
        
        {flightsClimbed > 0 && (
          <div className={`mt-3 text-xs text-center ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {flightsClimbed} flights climbed
          </div>
        )}
      </button>
      
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
        data-testid="tile-workouts"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Dumbbell className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Workouts</h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="mb-4">
          <div className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="workouts-summary">
            {workoutsToday} workout{workoutsToday !== 1 ? 's' : ''} · {workoutsDuration} min
          </div>
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {workoutsEnergy} cal burned
          </div>
        </div>
        
        {lastWorkout && (
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Last workout</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {lastWorkout.distanceKm ? `${lastWorkout.distanceKm} km ` : ''}{lastWorkout.type}
              {lastWorkout.avgHeartRate ? ` · ${lastWorkout.avgHeartRate} bpm avg` : ''}
            </div>
          </div>
        )}
        
        {workoutsToday === 0 && (
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No workouts recorded today
          </div>
        )}
      </button>
      
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
        data-testid="tile-cardio-fitness"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Heart className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
            <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Cardio Fitness</h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        {vo2Max != null ? (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>{vo2Max}</span>
              <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>ml/kg/min</span>
              <span className={`ml-2 px-3 py-1 rounded-full text-xs ${
                vo2Level === 'Excellent' || vo2Level === 'Good' 
                  ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                  : isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
              }`}>{vo2Level}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Resting HR (7d avg)</div>
                <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {restingHeartRate ?? '--'} bpm
                </div>
              </div>
            </div>
            
            <div className={`flex items-center gap-2 text-sm ${
              vo2Trend === 'up' ? isDark ? 'text-green-400' : 'text-green-600' :
              vo2Trend === 'down' ? isDark ? 'text-red-400' : 'text-red-600' :
              isDark ? 'text-white/50' : 'text-gray-500'
            }`}>
              {vo2Trend === 'up' && <TrendingUp className="w-4 h-4" />}
              {vo2Trend === 'stable' && <span className="w-4 h-0.5 bg-current"></span>}
              {vo2Trend === 'down' && <TrendingDown className="w-4 h-4" />}
              <span className="text-xs">
                {vo2Trend === 'up' ? 'Improving' : vo2Trend === 'down' ? 'Declining' : 'Stable'} (30d)
              </span>
            </div>
          </>
        ) : (
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No VO2 max data available
          </div>
        )}
      </button>
      
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
        data-testid="tile-recovery"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Battery className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Recovery & Strain</h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        {hrv != null || strainScore != null ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {hrv != null && (
                <div>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>HRV</div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>{hrv}</span>
                    <span className={`text-sm ${isDark ? 'text-white/40' : 'text-gray-500'}`}>ms</span>
                  </div>
                  {hrvBaseline && (
                    <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Baseline: {hrvBaseline} ms
                    </div>
                  )}
                </div>
              )}
              
              {strainScore != null && (
                <div>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Strain</div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>{strainScore.toFixed(1)}</span>
                    <span className={`text-sm ${isDark ? 'text-white/40' : 'text-gray-500'}`}>/ 21</span>
                  </div>
                  <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {strainScore < 7 ? 'Low' : strainScore < 14 ? 'Moderate' : 'High'}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-3 py-1 rounded-full text-xs ${
                hrvStatus === 'recovered' 
                  ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                  : hrvStatus === 'strained'
                    ? isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                    : isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {hrvStatus === 'recovered' ? 'Recovered' : hrvStatus === 'strained' ? 'Strained' : 'OK'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                hrvStatus === 'recovered' ? 'bg-green-500' :
                hrvStatus === 'strained' ? 'bg-red-500' : 'bg-yellow-500'
              }`}></div>
              <span className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                {hrvStatus === 'recovered' 
                  ? 'Ready to push hard today' 
                  : hrvStatus === 'strained'
                    ? 'Consider taking it easier'
                    : 'Normal recovery status'}
              </span>
            </div>
          </>
        ) : (
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No recovery data available
          </div>
        )}
      </button>
      
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
        data-testid="tile-movement-quality"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Waves className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Movement Quality</h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        {hasMovementData ? (
          <div className="grid grid-cols-2 gap-4">
            {walkingSpeed != null && (
              <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Walking Speed</div>
                <div className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {(walkingSpeed * 3.6).toFixed(1)} <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>km/h</span>
                </div>
              </div>
            )}
            
            {stepLength != null && (
              <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Step Length</div>
                <div className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {(stepLength * 100).toFixed(0)} <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>cm</span>
                </div>
              </div>
            )}
            
            {doubleSupport != null && (
              <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Double Support</div>
                <div className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {doubleSupport.toFixed(1)} <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>%</span>
                </div>
              </div>
            )}
            
            {asymmetry != null && (
              <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Gait Asymmetry</div>
                <div className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {asymmetry.toFixed(1)} <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>%</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No movement quality data available. Walk with your iPhone to collect gait metrics.
          </div>
        )}
      </button>
    </div>
  );
}

function NutritionTabContent({ isDark }: { isDark: boolean }) {
  const { data: nutritionData, isLoading } = useQuery<NutritionDaily[]>({
    queryKey: ['/api/nutrition/daily'],
  });

  if (isLoading) {
    return <LoadingSpinner isDark={isDark} />;
  }

  const today = nutritionData?.[0];
  
  if (!today) {
    return <EmptyState isDark={isDark} message="No nutrition data available. Start logging your meals to see insights." />;
  }

  const calories = today.energy_kcal ?? 0;
  const protein = today.protein_g ?? 0;
  const carbs = today.carbohydrates_g ?? 0;
  const fats = today.fat_total_g ?? 0;
  const fiber = today.fiber_g ?? 0;
  const sugar = today.sugar_g ?? 0;
  const sodium = today.sodium_mg ?? 0;
  const caffeine = today.caffeine_mg ?? 0;
  const water = today.water_ml ?? 0;

  const calorieTarget = 2500;
  const proteinTarget = 120;
  const carbsTarget = 300;
  const fatsTarget = 80;
  const waterTarget = 2500;

  const proteinPercent = proteinTarget > 0 ? (protein / proteinTarget) * 100 : 0;
  const caloriePercent = calorieTarget > 0 ? (calories / calorieTarget) * 100 : 0;

  const proteinScore = proteinPercent >= 90 ? 'green' : proteinPercent >= 70 ? 'amber' : 'red';
  const calorieDeviation = Math.abs(caloriePercent - 100);
  const calorieScore = calorieDeviation <= 10 ? 'green' : calorieDeviation <= 20 ? 'amber' : 'red';

  const microsChecked = [
    today.vitamin_d_mcg,
    today.magnesium_mg,
    today.calcium_mg,
    today.iron_mg,
    today.potassium_mg,
    today.zinc_mg,
  ];
  const microsCovered = microsChecked.filter(v => v != null && v > 0).length;
  const microsTotal = microsChecked.length;

  let nutritionScore = 0;
  if (proteinScore === 'green') nutritionScore += 25;
  else if (proteinScore === 'amber') nutritionScore += 15;
  else nutritionScore += 5;
  
  if (calorieScore === 'green') nutritionScore += 25;
  else if (calorieScore === 'amber') nutritionScore += 18;
  else nutritionScore += 10;
  
  nutritionScore += (microsCovered / microsTotal) * 30;
  if (fiber >= 25) nutritionScore += 10;
  else if (fiber >= 18) nutritionScore += 7;
  else nutritionScore += 3;
  
  const waterPercent = waterTarget > 0 ? (water / waterTarget) * 100 : 0;
  if (waterPercent >= 90) nutritionScore += 10;
  else if (waterPercent >= 70) nutritionScore += 6;
  else nutritionScore += 2;

  nutritionScore = Math.round(nutritionScore);
  
  return (
    <div className="space-y-4">
      <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="flex items-center gap-2 mb-4">
          <Apple className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
          <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Today's Nutrition</h3>
        </div>
        
        <div className="flex items-center gap-6 mb-4">
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="url(#nutrition-gradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${nutritionScore * 2.64} 264`} />
              <defs>
                <linearGradient id="nutrition-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-3xl ${isDark ? 'text-white' : 'text-gray-900'}`}>{nutritionScore}</div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>score</div>
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <div className={`text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              {nutritionScore >= 85 ? 'Excellent nutrition today!' :
               nutritionScore >= 70 ? 'Good nutrition balance' :
               nutritionScore >= 55 ? 'Room for improvement' :
               'Focus on hitting your targets'}
            </div>
          </div>
        </div>
      </div>
      
      <button className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
        isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Macros</h3>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Protein</span>
            <div className="flex items-baseline gap-1">
              <span className={proteinScore === 'green' ? isDark ? 'text-green-400' : 'text-green-600' : proteinScore === 'amber' ? isDark ? 'text-yellow-400' : 'text-yellow-600' : isDark ? 'text-red-400' : 'text-red-600'}>{protein}g</span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>/ {proteinTarget}g</span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
            <div className={`h-full ${proteinScore === 'green' ? 'bg-gradient-to-r from-green-400 to-green-500' : proteinScore === 'amber' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`} style={{ width: `${Math.min(proteinPercent, 100)}%` }} />
          </div>
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Calories</span>
            <div className="flex items-baseline gap-1">
              <span className={calorieScore === 'green' ? isDark ? 'text-green-400' : 'text-green-600' : calorieScore === 'amber' ? isDark ? 'text-yellow-400' : 'text-yellow-600' : isDark ? 'text-red-400' : 'text-red-600'}>{calories}</span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>/ {calorieTarget}</span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
            <div className={`h-full ${calorieScore === 'green' ? 'bg-gradient-to-r from-cyan-400 to-cyan-500' : calorieScore === 'amber' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`} style={{ width: `${Math.min(caloriePercent, 100)}%` }} />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Carbs</div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{carbs}g</span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>/ {carbsTarget}g</span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Fats</div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{fats}g</span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>/ {fatsTarget}g</span>
            </div>
          </div>
        </div>
      </button>
      
      <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="flex items-center gap-2 mb-4">
          <Droplet className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Hydration</h3>
        </div>
        
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>{(water / 1000).toFixed(1)}</span>
          <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>L</span>
          <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>/ {(waterTarget / 1000).toFixed(1)}L</span>
        </div>
        
        <div className={`h-2 rounded-full overflow-hidden mb-2 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
          <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.min(waterPercent, 100)}%` }} />
        </div>
      </div>
      
      <button className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
        isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Watch Items</h3>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Caffeine</div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{caffeine}mg</div>
            <div className={`text-xs ${caffeine <= 400 ? isDark ? 'text-green-400' : 'text-green-600' : isDark ? 'text-orange-400' : 'text-orange-600'}`}>
              {caffeine <= 400 ? 'Within limit' : 'Above limit'}
            </div>
          </div>
          
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Sodium</div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{sodium}mg</div>
            <div className={`text-xs ${sodium <= 2300 ? isDark ? 'text-green-400' : 'text-green-600' : isDark ? 'text-orange-400' : 'text-orange-600'}`}>
              {sodium <= 2300 ? 'Within limit' : 'Above limit'}
            </div>
          </div>
          
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Sugar</div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{sugar}g</div>
            <div className={`text-xs ${sugar <= 50 ? isDark ? 'text-green-400' : 'text-green-600' : isDark ? 'text-orange-400' : 'text-orange-600'}`}>
              {sugar <= 50 ? 'Moderate' : 'High'}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function GlucoseTabContent({ isDark }: { isDark: boolean }) {
  const [timeRange, setTimeRange] = useState<'day' | '7d' | '14d'>('day');

  const { data: glucoseData, isLoading } = useQuery<GlucoseDaily>({
    queryKey: ['/api/glucose/daily', { range: timeRange }],
  });

  if (isLoading) {
    return <LoadingSpinner isDark={isDark} />;
  }

  const currentGlucose = glucoseData?.currentGlucose;
  const glucoseStatus = glucoseData?.glucoseStatus ?? 'normal';
  const timeInRangeToday = glucoseData?.timeInRangeToday;
  const timeInRange7d = glucoseData?.timeInRange7d;
  const avgToday = glucoseData?.avgToday;
  const minToday = glucoseData?.minToday;
  const maxToday = glucoseData?.maxToday;
  const lowsToday = glucoseData?.lowsToday ?? { count: 0, minutes: 0 };
  const highsToday = glucoseData?.highsToday ?? { count: 0, minutes: 0 };
  const trendData = glucoseData?.trendData ?? [];
  const targetMin = glucoseData?.targetMin ?? 70;
  const targetMax = glucoseData?.targetMax ?? 140;

  if (currentGlucose == null && trendData.length === 0) {
    return <EmptyState isDark={isDark} message="No glucose data available. Connect a continuous glucose monitor or log blood glucose readings." />;
  }
  
  return (
    <div className="space-y-4">
      <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="text-center">
          <p className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Right Now</p>
          <div className="flex items-baseline justify-center gap-2 mb-3">
            <span className={`text-6xl ${
              glucoseStatus === 'low' ? 'text-orange-500' :
              glucoseStatus === 'high' ? 'text-red-500' :
              isDark ? 'text-green-400' : 'text-green-600'
            }`}>{currentGlucose ?? '--'}</span>
            <span className={`text-xl ${isDark ? 'text-white/40' : 'text-gray-500'}`}>mg/dL</span>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
            glucoseStatus === 'low' ? 'bg-orange-500/20 text-orange-500' :
            glucoseStatus === 'high' ? 'bg-red-500/20 text-red-500' :
            isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
          }`}>
            {glucoseStatus === 'low' && <TrendingDown className="w-4 h-4" />}
            {glucoseStatus === 'high' && <TrendingUp className="w-4 h-4" />}
            {glucoseStatus === 'normal' && <Gauge className="w-4 h-4" />}
            <span className="text-sm font-medium">
              {glucoseStatus === 'low' ? 'Below Range' : glucoseStatus === 'high' ? 'Above Range' : 'In Range'}
            </span>
          </div>
        </div>
      </div>
      
      {(timeInRangeToday != null || timeInRange7d != null) && (
        <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <h3 className={`text-sm mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Time in Range</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Today</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl ${isDark ? 'text-green-400' : 'text-green-600'}`}>{timeInRangeToday ?? '--'}</span>
                <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>%</span>
              </div>
            </div>
            <div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>7 Days</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl ${isDark ? 'text-green-400' : 'text-green-600'}`}>{timeInRange7d ?? '--'}</span>
                <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>%</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {avgToday != null && (
        <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <h3 className={`text-sm mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Daily Average</h3>
          <div className="flex items-end gap-2 mb-3">
            <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>{avgToday}</span>
            <span className={`text-lg mb-1 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>mg/dL</span>
          </div>
          {minToday != null && maxToday != null && (
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Min</p>
                <p className={`text-xl ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>{minToday}</p>
              </div>
              <div className={`flex-1 mx-4 h-1 rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                <div className="h-full bg-gradient-to-r from-orange-400 via-green-400 to-red-400 rounded-full" />
              </div>
              <div>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Max</p>
                <p className={`text-xl ${isDark ? 'text-red-400' : 'text-red-600'}`}>{maxToday}</p>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-4">
        <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-orange-500" />
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Lows</h3>
          </div>
          <div className="mb-3">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>{lowsToday.count}</span>
              <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>events</span>
            </div>
          </div>
          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {lowsToday.minutes} mins below range
          </div>
        </div>
        
        <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Highs</h3>
          </div>
          <div className="mb-3">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl ${isDark ? 'text-red-400' : 'text-red-600'}`}>{highsToday.count}</span>
              <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>events</span>
            </div>
          </div>
          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {highsToday.minutes} mins above range
          </div>
        </div>
      </div>
      
      {trendData.length > 0 && (
        <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Trend</h3>
            <div className="flex gap-2">
              {(['day', '7d', '14d'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    timeRange === range
                      ? isDark ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                      : isDark ? 'bg-white/5 text-white/50 border border-white/10' : 'bg-white/40 text-gray-600 border border-black/10'
                  }`}
                >
                  {range === 'day' ? 'Day' : range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          <GlucoseTrendChart data={trendData} isDark={isDark} targetMin={targetMin} targetMax={targetMax} />
        </div>
      )}
    </div>
  );
}

interface GlucoseTrendChartProps {
  data: Array<{ date: string; value: number }>;
  isDark: boolean;
  targetMin: number;
  targetMax: number;
}

function GlucoseTrendChart({ data, isDark, targetMin, targetMax }: GlucoseTrendChartProps) {
  const chartWidth = 320;
  const chartHeight = 160;
  const padding = { top: 20, bottom: 30, left: 0, right: 0 };
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const minValue = 60;
  const maxValue = 180;
  const valueRange = maxValue - minValue;

  const points = data.map((d, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + (1 - (d.value - minValue) / valueRange) * innerHeight;
    return { x, y, value: d.value };
  });

  const targetMinY = padding.top + (1 - (targetMin - minValue) / valueRange) * innerHeight;
  const targetMaxY = padding.top + (1 - (targetMax - minValue) / valueRange) * innerHeight;

  return (
    <div className="w-full">
      <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
        <defs>
          <linearGradient id="glucose-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <rect x={0} y={targetMaxY} width={chartWidth} height={targetMinY - targetMaxY} fill="url(#glucose-gradient)" rx={4} />
        <line x1={0} y1={targetMaxY} x2={chartWidth} y2={targetMaxY} stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} />
        <line x1={0} y1={targetMinY} x2={chartWidth} y2={targetMinY} stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} />

        {points.length > 1 && (
          <>
            <path
              d={`M 0 ${chartHeight - padding.bottom} L ${points.map(p => `${p.x} ${p.y}`).join(' L ')} L ${chartWidth} ${chartHeight - padding.bottom} Z`}
              fill="url(#area-gradient)"
            />
            <path
              d={`M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`}
              fill="none"
              stroke="#06b6d4"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        <text x={chartWidth - 5} y={padding.top - 5} className={`text-[10px] ${isDark ? 'fill-white/40' : 'fill-gray-500'}`} textAnchor="end">{maxValue}</text>
        <text x={chartWidth - 5} y={chartHeight - padding.bottom + 12} className={`text-[10px] ${isDark ? 'fill-white/40' : 'fill-gray-500'}`} textAnchor="end">{minValue}</text>
      </svg>

      <div className="flex items-center justify-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className={isDark ? 'text-white/50' : 'text-gray-500'}>Target: {targetMin}-{targetMax} mg/dL</span>
        </div>
      </div>
    </div>
  );
}
