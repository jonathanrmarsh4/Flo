import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Apple, Gauge, TrendingUp, TrendingDown, Footprints, Dumbbell, Heart, Battery, Waves, ChevronRight, Loader2, Droplet, Award, X } from 'lucide-react';
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
  localDate: string;
  energyKcal: number | null;
  proteinG: number | null;
  carbohydratesG: number | null;
  fatTotalG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  caffeineMg: number | null;
  waterMl: number | null;
  vitaminDMcg: number | null;
  magnesiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  potassiumMg: number | null;
  zincMg: number | null;
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

interface WeeklyWorkoutData {
  weekData: Array<{
    day: string;
    date: string;
    workouts: Array<{
      type: string;
      duration: number;
      distance: number;
      calories: number;
      avgHR: number | null;
      intensity: string;
    }>;
  }>;
  thisWeek: {
    workouts: number;
    duration: number;
    calories: number;
    distance: number;
    avgDuration: number;
  };
  bestWeek: {
    workouts: number;
    duration: number;
    calories: number;
    distance: number;
    date: string;
  } | null;
  workoutTypes: Record<string, number>;
}

interface WeeklyActivityData {
  weekData: Array<{
    day: string;
    date: string;
    steps: number;
    distance: number;
    calories: number;
    exercise: number;
    standHours: number;
  }>;
  averages: {
    steps: number;
    distance: number;
    calories: number;
    totalExercise: number;
  };
  insights: {
    bestDay: string;
    bestDaySteps: number;
    daysOverGoal: number;
  };
}

interface MacrosWeeklyData {
  weekData: Array<{
    day: string;
    date: string;
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
    satFat: number;
    sodium: number;
    cholesterol: number;
    fiber: number;
  }>;
  averages: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  daysTracked: number;
}

export function ActivityScreen({ isDark, onClose, onAddClick }: ActivityScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('activity');

  return (
    <div className={`fixed inset-0 z-50 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors pt-[env(safe-area-inset-top)] ${
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

function ActivityDetailsModal({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
  const { data: weeklyData, isLoading } = useQuery<WeeklyActivityData>({
    queryKey: ['/api/activity/weekly'],
  });

  const weekData = weeklyData?.weekData ?? [];
  const avgSteps = weeklyData?.averages?.steps ?? 0;
  const avgDistance = weeklyData?.averages?.distance ?? 0;
  const avgCalories = weeklyData?.averages?.calories ?? 0;
  const totalExercise = weeklyData?.averages?.totalExercise ?? 0;
  const bestDay = weeklyData?.insights?.bestDay ?? '';
  const bestDaySteps = weeklyData?.insights?.bestDaySteps ?? 0;
  const daysOverGoal = weeklyData?.insights?.daysOverGoal ?? 0;

  const maxSteps = Math.max(...weekData.map(d => d.steps), 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className={`relative w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto ${ 
        isDark ? 'bg-slate-900' : 'bg-white'
      }`}>
        <div className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
          isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white/95 border-black/10'
        }`}>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Activity Details
                </h2>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Last 7 days
                </p>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-close-activity-details"
              >
                <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {isLoading ? (
            <LoadingSpinner isDark={isDark} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Avg Steps
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {avgSteps.toLocaleString()}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                    per day
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Avg Distance
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {avgDistance}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                    km/day
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Avg Calories
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {avgCalories}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                    kcal/day
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Total Exercise
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {totalExercise}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                    minutes
                  </div>
                </div>
              </div>

              <div>
                <h3 className={`text-sm mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Daily Steps
                </h3>
                <div className="space-y-2">
                  {weekData.map((day, index) => {
                    const isToday = day.day === 'Today';
                    const barPercent = maxSteps > 0 ? (day.steps / maxSteps) * 100 : 0;
                    
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <div className={`w-12 text-xs ${
                          isToday 
                            ? isDark ? 'text-cyan-400' : 'text-cyan-600'
                            : isDark ? 'text-white/50' : 'text-gray-500'
                        }`}>
                          {day.day}
                        </div>
                        <div className="flex-1">
                          <div className={`h-8 rounded-lg overflow-hidden ${
                            isDark ? 'bg-white/5' : 'bg-gray-100'
                          }`}>
                            <div 
                              className={`h-full flex items-center px-2 transition-all ${
                                isToday
                                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                  : isDark 
                                  ? 'bg-gradient-to-r from-cyan-500/50 to-blue-500/50'
                                  : 'bg-gradient-to-r from-cyan-400/70 to-blue-400/70'
                              }`}
                              style={{ width: `${barPercent}%` }}
                            >
                              <span className={`text-xs ${
                                barPercent > 30 ? 'text-white' : ''
                              }`}>
                                {barPercent > 30 ? day.steps.toLocaleString() : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={`w-16 text-xs text-right ${
                          isDark ? 'text-white/70' : 'text-gray-700'
                        }`}>
                          {barPercent <= 30 ? day.steps.toLocaleString() : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className={`text-sm mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Week Breakdown
                </h3>
                <div className={`rounded-2xl border overflow-hidden ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`grid grid-cols-5 gap-2 p-3 border-b text-xs ${
                    isDark ? 'bg-white/5 border-white/10 text-white/50' : 'bg-gray-100 border-gray-200 text-gray-500'
                  }`}>
                    <div>Day</div>
                    <div className="text-right">Steps</div>
                    <div className="text-right">Dist.</div>
                    <div className="text-right">Cal.</div>
                    <div className="text-right">Exer.</div>
                  </div>
                  
                  {weekData.map((day, index) => {
                    const isToday = day.day === 'Today';
                    return (
                      <div 
                        key={index}
                        className={`grid grid-cols-5 gap-2 p-3 text-xs ${
                          index < weekData.length - 1 ? isDark ? 'border-b border-white/10' : 'border-b border-gray-200' : ''
                        } ${
                          isToday ? isDark ? 'bg-cyan-500/10' : 'bg-cyan-50' : ''
                        }`}
                      >
                        <div className={`${
                          isToday 
                            ? isDark ? 'text-cyan-400' : 'text-cyan-600'
                            : isDark ? 'text-white/70' : 'text-gray-700'
                        }`}>
                          {day.day}
                          <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                            {day.date}
                          </div>
                        </div>
                        <div className={`text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {day.steps.toLocaleString()}
                        </div>
                        <div className={`text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          {day.distance}
                        </div>
                        <div className={`text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          {day.calories}
                        </div>
                        <div className={`text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          {day.exercise}m
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`p-4 rounded-2xl border ${
                isDark ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20' : 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200'
              }`}>
                <div className="flex items-start gap-3">
                  <TrendingUp className={`w-5 h-5 mt-0.5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                  <div>
                    <h4 className={`text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Weekly Insights
                    </h4>
                    <p className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      {daysOverGoal > 0 
                        ? `You exceeded your step goal on ${daysOverGoal} out of 7 days this week. `
                        : 'Keep pushing to reach your daily step goal! '}
                      {bestDay && bestDaySteps > 0 && `Your most active day was ${bestDay} with ${bestDaySteps.toLocaleString()} steps. `}
                      Keep up the momentum!
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityTabContent({ isDark }: { isDark: boolean }) {
  const [showWorkoutDetails, setShowWorkoutDetails] = useState(false);
  const [showActivityDetails, setShowActivityDetails] = useState(false);

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
        onClick={() => setShowActivityDetails(true)}
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
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{activeEnergy?.toFixed(1) ?? '0'} cal</div>
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
        onClick={() => setShowWorkoutDetails(true)}
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
            {workoutsToday} workout{workoutsToday !== 1 ? 's' : ''} · {workoutsDuration.toFixed(1)} min
          </div>
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {workoutsEnergy.toFixed(1)} cal burned
          </div>
        </div>
        
        {lastWorkout && (
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Last workout</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {lastWorkout.distanceKm ? `${lastWorkout.distanceKm.toFixed(1)} km ` : ''}{lastWorkout.type}
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

      {showWorkoutDetails && (
        <WorkoutDetailsModal isDark={isDark} onClose={() => setShowWorkoutDetails(false)} />
      )}
      
      {showActivityDetails && (
        <ActivityDetailsModal isDark={isDark} onClose={() => setShowActivityDetails(false)} />
      )}
      
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
              <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>{vo2Max?.toFixed(1)}</span>
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
  const [showMacrosDetails, setShowMacrosDetails] = useState(false);
  
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

  const calories = today.energyKcal ?? 0;
  const protein = today.proteinG ?? 0;
  const carbs = today.carbohydratesG ?? 0;
  const fats = today.fatTotalG ?? 0;
  const fiber = today.fiberG ?? 0;
  const sugar = today.sugarG ?? 0;
  const sodium = today.sodiumMg ?? 0;
  const caffeine = today.caffeineMg ?? 0;
  const water = today.waterMl ?? 0;

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
    today.vitaminDMcg,
    today.magnesiumMg,
    today.calciumMg,
    today.ironMg,
    today.potassiumMg,
    today.zincMg,
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
      
      <button 
        onClick={() => setShowMacrosDetails(true)}
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
        data-testid="button-macros-details"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className={isDark ? 'text-white' : 'text-gray-900'}>Macros</h3>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Protein</span>
            <div className="flex items-baseline gap-1">
              <span className={proteinScore === 'green' ? isDark ? 'text-green-400' : 'text-green-600' : proteinScore === 'amber' ? isDark ? 'text-yellow-400' : 'text-yellow-600' : isDark ? 'text-red-400' : 'text-red-600'}>{protein.toFixed(1)}g</span>
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
              <span className={calorieScore === 'green' ? isDark ? 'text-green-400' : 'text-green-600' : calorieScore === 'amber' ? isDark ? 'text-yellow-400' : 'text-yellow-600' : isDark ? 'text-red-400' : 'text-red-600'}>{calories.toFixed(1)}</span>
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
              <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{carbs.toFixed(1)}g</span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>/ {carbsTarget}g</span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Fats</div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{fats.toFixed(1)}g</span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>/ {fatsTarget}g</span>
            </div>
          </div>
        </div>
      </button>
      
      {showMacrosDetails && (
        <MacrosDetailsModal 
          isDark={isDark} 
          onClose={() => setShowMacrosDetails(false)} 
        />
      )}
      
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
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{caffeine.toFixed(1)}mg</div>
            <div className={`text-xs ${caffeine <= 400 ? isDark ? 'text-green-400' : 'text-green-600' : isDark ? 'text-orange-400' : 'text-orange-600'}`}>
              {caffeine <= 400 ? 'Within limit' : 'Above limit'}
            </div>
          </div>
          
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Sodium</div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{sodium.toFixed(1)}mg</div>
            <div className={`text-xs ${sodium <= 2300 ? isDark ? 'text-green-400' : 'text-green-600' : isDark ? 'text-orange-400' : 'text-orange-600'}`}>
              {sodium <= 2300 ? 'Within limit' : 'Above limit'}
            </div>
          </div>
          
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Sugar</div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{sugar.toFixed(1)}g</div>
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

function WorkoutDetailsModal({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery<WeeklyWorkoutData>({
    queryKey: ['/api/activity/workouts/weekly'],
  });

  const normalizeWorkoutType = (type: string): { normalized: string; display: string } => {
    const lower = type.toLowerCase().trim();
    
    if (lower.includes('run')) return { normalized: 'running', display: 'Run' };
    if (lower.includes('strength') || lower.includes('weight') || lower.includes('lifting')) 
      return { normalized: 'strength', display: 'Strength' };
    if (lower.includes('hiit') || lower.includes('high intensity') || lower.includes('interval')) 
      return { normalized: 'hiit', display: 'HIIT' };
    if (lower.includes('cycling') || lower.includes('bike') || lower.includes('biking')) 
      return { normalized: 'cycling', display: 'Cycling' };
    if (lower.includes('swim')) return { normalized: 'swimming', display: 'Swimming' };
    if (lower.includes('yoga')) return { normalized: 'yoga', display: 'Yoga' };
    if (lower.includes('pilates')) return { normalized: 'pilates', display: 'Pilates' };
    if (lower.includes('walk')) return { normalized: 'walking', display: 'Walking' };
    if (lower.includes('hik')) return { normalized: 'hiking', display: 'Hiking' };
    if (lower.includes('elliptical')) return { normalized: 'elliptical', display: 'Elliptical' };
    if (lower.includes('row')) return { normalized: 'rowing', display: 'Rowing' };
    if (lower.includes('stair') || lower.includes('stepper')) return { normalized: 'stairs', display: 'Stairs' };
    if (lower.includes('core')) return { normalized: 'core', display: 'Core' };
    if (lower.includes('flex') || lower.includes('stretch')) return { normalized: 'flexibility', display: 'Flexibility' };
    if (lower.includes('dance')) return { normalized: 'dance', display: 'Dance' };
    if (lower.includes('cardio')) return { normalized: 'cardio', display: 'Cardio' };
    if (lower.includes('cross') && lower.includes('train')) return { normalized: 'crosstraining', display: 'CrossTraining' };
    
    return { normalized: lower, display: type };
  };

  const workoutColors: { [key: string]: { bg: string; hex: string } } = {
    'running': { bg: 'bg-cyan-500', hex: '#06b6d4' },
    'strength': { bg: 'bg-purple-500', hex: '#a855f7' },
    'hiit': { bg: 'bg-red-500', hex: '#ef4444' },
    'cycling': { bg: 'bg-blue-500', hex: '#3b82f6' },
    'swimming': { bg: 'bg-teal-500', hex: '#14b8a6' },
    'yoga': { bg: 'bg-green-500', hex: '#22c55e' },
    'pilates': { bg: 'bg-pink-500', hex: '#ec4899' },
    'walking': { bg: 'bg-emerald-500', hex: '#10b981' },
    'hiking': { bg: 'bg-amber-500', hex: '#f59e0b' },
    'elliptical': { bg: 'bg-indigo-500', hex: '#6366f1' },
    'rowing': { bg: 'bg-sky-500', hex: '#0ea5e9' },
    'stairs': { bg: 'bg-orange-500', hex: '#f97316' },
    'core': { bg: 'bg-violet-500', hex: '#8b5cf6' },
    'flexibility': { bg: 'bg-lime-500', hex: '#84cc16' },
    'dance': { bg: 'bg-fuchsia-500', hex: '#d946ef' },
    'cardio': { bg: 'bg-rose-500', hex: '#f43f5e' },
    'crosstraining': { bg: 'bg-cyan-600', hex: '#0891b2' },
  };

  const defaultColor = { bg: 'bg-slate-500', hex: '#64748b' };

  const getWorkoutColor = (type: string) => {
    const { normalized } = normalizeWorkoutType(type);
    return workoutColors[normalized] || defaultColor;
  };

  const getWorkoutDisplay = (type: string) => {
    return normalizeWorkoutType(type).display;
  };

  const weekData = data?.weekData || [];
  const thisWeek = data?.thisWeek || { workouts: 0, duration: 0, calories: 0, distance: 0, avgDuration: 0 };
  const bestWeek = data?.bestWeek;
  const workoutTypes = data?.workoutTypes || {};

  const maxDailyDuration = Math.max(...weekData.map(d => 
    d.workouts.reduce((sum, w) => sum + w.duration, 0)
  ), 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="modal-backdrop-workouts"
      />
      
      <div className={`relative w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto ${ 
        isDark ? 'bg-slate-900' : 'bg-white'
      }`} data-testid="modal-workout-details">
        <div className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
          isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white/95 border-black/10'
        }`}>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Workout Details
                </h2>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Last 7 days
                </p>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-close-workout-details"
              >
                <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
          ) : (
            <>
              {/* This Week vs Best Week Comparison */}
              <div className={`rounded-2xl border p-5 ${
                isDark 
                  ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30' 
                  : 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      This Week vs Best Week
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Push yourself to beat your record!
                    </p>
                  </div>
                  <Award className={`w-5 h-5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className={`text-xs mb-2 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                      This Week
                    </div>
                    <div className="space-y-2">
                      <div className={`flex justify-between text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        <span>Workouts:</span>
                        <span className={isDark ? 'text-white' : 'text-gray-900'}>{thisWeek.workouts}</span>
                      </div>
                      <div className={`flex justify-between text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        <span>Duration:</span>
                        <span className={isDark ? 'text-white' : 'text-gray-900'}>{thisWeek.duration}m</span>
                      </div>
                      <div className={`flex justify-between text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        <span>Calories:</span>
                        <span className={isDark ? 'text-white' : 'text-gray-900'}>{thisWeek.calories}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={`text-xs mb-2 flex items-center gap-1 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      Best Week <Award className="w-3 h-3" />
                    </div>
                    {bestWeek ? (
                      <div className="space-y-2">
                        <div className={`flex justify-between text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          <span>Workouts:</span>
                          <span className={`${
                            thisWeek.workouts >= bestWeek.workouts 
                              ? isDark ? 'text-green-400' : 'text-green-600'
                              : isDark ? 'text-white' : 'text-gray-900'
                          }`}>{bestWeek.workouts}</span>
                        </div>
                        <div className={`flex justify-between text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          <span>Duration:</span>
                          <span className={`${
                            thisWeek.duration >= bestWeek.duration 
                              ? isDark ? 'text-green-400' : 'text-green-600'
                              : isDark ? 'text-white' : 'text-gray-900'
                          }`}>{bestWeek.duration}m</span>
                        </div>
                        <div className={`flex justify-between text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          <span>Calories:</span>
                          <span className={`${
                            thisWeek.calories >= bestWeek.calories 
                              ? isDark ? 'text-green-400' : 'text-green-600'
                              : isDark ? 'text-white' : 'text-gray-900'
                          }`}>{bestWeek.calories}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        No previous data
                      </div>
                    )}
                  </div>
                </div>

                {bestWeek && (thisWeek.workouts >= bestWeek.workouts || thisWeek.duration >= bestWeek.duration) ? (
                  <div className={`mt-4 p-3 rounded-xl ${
                    isDark ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-50 border border-green-200'
                  }`}>
                    <p className={`text-xs flex items-center gap-1 ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                      <Award className="w-3 h-3" /> You're crushing it! New personal record!
                    </p>
                  </div>
                ) : bestWeek ? (
                  <div className={`mt-4 p-3 rounded-xl ${
                    isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'
                  }`}>
                    <p className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Keep going! You need <span className={isDark ? 'text-purple-400' : 'text-purple-600'}>{bestWeek.workouts - thisWeek.workouts} more workouts</span> to beat your best week
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Weekly Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Total Workouts
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {thisWeek.workouts}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                    this week
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Total Time
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {thisWeek.duration}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                    minutes
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Avg Duration
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {thisWeek.avgDuration}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    min/workout
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Total Calories
                  </div>
                  <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {thisWeek.calories}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                    kcal
                  </div>
                </div>
              </div>

              {/* Workout Type Breakdown */}
              {Object.keys(workoutTypes).length > 0 && (
                <div>
                  <h3 className={`text-sm mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Workout Types
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(workoutTypes).map(([type, count]) => (
                      <div 
                        key={type}
                        className={`p-3 rounded-xl border ${
                          isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {type}
                        </div>
                        <div className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {count}× <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>sessions</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily Duration Chart - Stacked by Workout Type */}
              {weekData.length > 0 && (
                <div>
                  <h3 className={`text-sm mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Daily Workout Duration (Stacked)
                  </h3>
                  <div className="space-y-2">
                    {weekData.map((day, index) => {
                      const isToday = day.day === 'Today';
                      const dayDuration = day.workouts.reduce((sum, w) => sum + w.duration, 0);
                      const barPercent = dayDuration > 0 ? (dayDuration / maxDailyDuration) * 100 : 0;
                      
                      return (
                        <div key={index} className="flex items-center gap-3">
                          <div className={`w-12 text-xs ${
                            isToday 
                              ? isDark ? 'text-purple-400' : 'text-purple-600'
                              : isDark ? 'text-white/50' : 'text-gray-500'
                          }`}>
                            {day.day}
                          </div>
                          <div className="flex-1">
                            <div className={`h-8 rounded-lg overflow-hidden ${
                              isDark ? 'bg-white/10' : 'bg-gray-200'
                            }`}>
                              {dayDuration > 0 && (
                                <div 
                                  className="h-full flex"
                                  style={{ width: `${barPercent}%` }}
                                >
                                  {day.workouts.map((workout, wIndex) => {
                                    const segmentPercent = (workout.duration / dayDuration) * 100;
                                    const color = getWorkoutColor(workout.type);
                                    const displayName = getWorkoutDisplay(workout.type);
                                    return (
                                      <div
                                        key={wIndex}
                                        className={`h-full flex items-center justify-center ${
                                          isToday ? '' : 'opacity-80'
                                        }`}
                                        style={{ 
                                          width: `${segmentPercent}%`,
                                          backgroundColor: color.hex,
                                          minWidth: workout.duration > 0 ? '4px' : '0'
                                        }}
                                        title={`${displayName}: ${workout.duration}min`}
                                      >
                                        {segmentPercent > 25 && (
                                          <span className="text-[10px] text-white font-medium px-1 truncate drop-shadow-sm">
                                            {displayName}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className={`w-16 text-xs text-right ${
                            isDark ? 'text-white/70' : 'text-gray-700'
                          }`}>
                            {dayDuration} min
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend - shows unique normalized workout types */}
                  {Object.keys(workoutTypes).length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {(() => {
                        const uniqueTypes = new Map<string, { display: string; color: { bg: string; hex: string } }>();
                        Object.keys(workoutTypes).forEach(type => {
                          const { normalized, display } = normalizeWorkoutType(type);
                          if (!uniqueTypes.has(normalized)) {
                            uniqueTypes.set(normalized, { 
                              display, 
                              color: workoutColors[normalized] || defaultColor 
                            });
                          }
                        });
                        return Array.from(uniqueTypes.entries()).map(([key, { display, color }]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <div 
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: color.hex }}
                            />
                            <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              {display}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Daily Workout Breakdown */}
              {weekData.some(d => d.workouts.length > 0) && (
                <div>
                  <h3 className={`text-sm mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Workout Log
                  </h3>
                  <div className="space-y-2">
                    {weekData.filter(day => day.workouts.length > 0).map((day, dayIndex) => {
                      const isToday = day.day === 'Today';
                      return (
                        <div 
                          key={dayIndex}
                          className={`rounded-2xl border overflow-hidden ${
                            isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                          } ${
                            isToday ? isDark ? 'ring-1 ring-purple-500/50' : 'ring-1 ring-purple-400/50' : ''
                          }`}
                        >
                          <div className={`px-4 py-2 border-b ${
                            isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100 border-gray-200'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className={`text-sm ${
                                  isToday 
                                    ? isDark ? 'text-purple-400' : 'text-purple-600'
                                    : isDark ? 'text-white/70' : 'text-gray-700'
                                }`}>
                                  {day.day}
                                </span>
                                <span className={`ml-2 text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                                  {day.date}
                                </span>
                              </div>
                              <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                                {day.workouts.length} workout{day.workouts.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                          
                          <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-gray-200'}`}>
                            {day.workouts.map((workout, workoutIndex) => {
                              const workoutColor = getWorkoutColor(workout.type);
                              const workoutDisplayName = getWorkoutDisplay(workout.type);
                              return (
                              <div key={workoutIndex} className="px-4 py-3">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-4 h-4 rounded-full flex items-center justify-center"
                                      style={{ backgroundColor: workoutColor.hex }}
                                    >
                                      <Dumbbell className="w-2.5 h-2.5 text-white" />
                                    </div>
                                    <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                      {workoutDisplayName}
                                    </span>
                                  </div>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    workout.intensity === 'High' 
                                      ? isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                                      : workout.intensity === 'Moderate'
                                      ? isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'
                                      : isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                                  }`}>
                                    {workout.intensity}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs">
                                  <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                                    {workout.duration} min
                                  </span>
                                  {workout.distance > 0 && (
                                    <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                                      {workout.distance} km
                                    </span>
                                  )}
                                  <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                                    {workout.calories} cal
                                  </span>
                                  {workout.avgHR && (
                                    <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                                      {workout.avgHR} bpm
                                    </span>
                                  )}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {thisWeek.workouts === 0 && (
                <div className={`text-center py-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  <Dumbbell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No workouts recorded this week</p>
                  <p className="text-xs mt-1">Start exercising to see your data here</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface MacrosWeekViewProps {
  weekData: MacrosWeeklyData['weekData'];
  maxCalories: number;
  isDark: boolean;
}

function MacrosWeekView({ weekData, maxCalories, isDark }: MacrosWeekViewProps) {
  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-4" style={{ height: '200px' }}>
        {weekData.map((day, index) => {
          const isToday = day.day === 'Today';
          const totalCals = day.calories;
          
          const barHeightPx = maxCalories > 0 ? (totalCals / maxCalories) * 200 : 0;
          
          // Calculate calorie-equivalent contributions for main macros
          // Carbs: 4 cal/g, Protein: 4 cal/g, Fat: 9 cal/g
          const carbsCals = day.carbs * 4;
          const proteinCals = day.protein * 4;
          const fatCals = day.fat * 9;
          const totalMacroCals = carbsCals + proteinCals + fatCals;
          
          // Calculate percentages based on caloric contribution
          const carbsPercent = totalMacroCals > 0 ? (carbsCals / totalMacroCals) * 100 : 0;
          const proteinPercent = totalMacroCals > 0 ? (proteinCals / totalMacroCals) * 100 : 0;
          const fatPercent = totalMacroCals > 0 ? (fatCals / totalMacroCals) * 100 : 0;
          
          return (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div 
                className="w-full rounded-t-lg overflow-hidden"
                style={{ height: `${barHeightPx}px` }}
              >
                <div className="h-full flex flex-col">
                  <div 
                    className={`bg-cyan-500 ${isToday ? '' : 'opacity-80'}`}
                    style={{ height: `${carbsPercent}%` }}
                    title={`Carbs: ${day.carbs}g (${Math.round(carbsPercent)}%)`}
                  />
                  <div 
                    className={`bg-purple-500 ${isToday ? '' : 'opacity-80'}`}
                    style={{ height: `${proteinPercent}%` }}
                    title={`Protein: ${day.protein}g (${Math.round(proteinPercent)}%)`}
                  />
                  <div 
                    className={`bg-orange-500 ${isToday ? '' : 'opacity-80'}`}
                    style={{ height: `${fatPercent}%` }}
                    title={`Fat: ${day.fat}g (${Math.round(fatPercent)}%)`}
                  />
                </div>
              </div>
              <div className={`text-xs mt-2 ${
                isToday 
                  ? isDark ? 'text-purple-400' : 'text-purple-600'
                  : isDark ? 'text-white/50' : 'text-gray-500'
              }`}>
                {day.day}
              </div>
              <div className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                {totalCals}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-cyan-500" />
          <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Carbs
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Protein
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-500" />
          <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Fat
          </span>
        </div>
      </div>
    </div>
  );
}

interface MacrosDetailsModalProps {
  isDark: boolean;
  onClose: () => void;
}

function MacrosDetailsModal({ isDark, onClose }: MacrosDetailsModalProps) {
  const [timeView, setTimeView] = useState<'day' | 'week'>('day');
  
  const { data: macrosData, isLoading } = useQuery<MacrosWeeklyData>({
    queryKey: ['/api/nutrition/macros/weekly'],
  });

  const weekData = macrosData?.weekData || [];
  const todayData = weekData.length > 0 ? weekData[weekData.length - 1] : { protein: 0, carbs: 0, fat: 0, calories: 0, satFat: 0, sodium: 0, cholesterol: 0, fiber: 0, day: 'Today', date: '' };
  
  const proteinCals = todayData.protein * 4;
  const carbsCals = todayData.carbs * 4;
  const fatCals = todayData.fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;
  
  const proteinPercent = totalMacroCals > 0 ? Math.round((proteinCals / totalMacroCals) * 100) : 0;
  const carbsPercent = totalMacroCals > 0 ? Math.round((carbsCals / totalMacroCals) * 100) : 0;
  const fatPercent = totalMacroCals > 0 ? Math.round((fatCals / totalMacroCals) * 100) : 0;

  const maxCalories = Math.max(...weekData.map(d => d.calories), 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="modal-backdrop-macros"
      />
      
      <div className={`relative w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto ${ 
        isDark ? 'bg-slate-900' : 'bg-white'
      }`} data-testid="modal-macros-details">
        <div className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
          isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white/95 border-black/10'
        }`}>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Macros Details
                </h2>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Nutrition breakdown
                </p>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-close-macros-details"
              >
                <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
            </div>

            <div className={`flex gap-2 p-1 rounded-xl ${
              isDark ? 'bg-white/5' : 'bg-gray-100'
            }`}>
              <button
                onClick={() => setTimeView('day')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  timeView === 'day'
                    ? isDark 
                      ? 'bg-purple-500 text-white' 
                      : 'bg-purple-600 text-white'
                    : isDark 
                      ? 'text-white/60 hover:text-white/80' 
                      : 'text-gray-600 hover:text-gray-900'
                }`}
                data-testid="button-macros-today"
              >
                Today
              </button>
              <button
                onClick={() => setTimeView('week')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  timeView === 'week'
                    ? isDark 
                      ? 'bg-purple-500 text-white' 
                      : 'bg-purple-600 text-white'
                    : isDark 
                      ? 'text-white/60 hover:text-white/80' 
                      : 'text-gray-600 hover:text-gray-900'
                }`}
                data-testid="button-macros-week"
              >
                7 Days
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
          ) : (
            <>
          {timeView === 'day' && (
            <div className={`rounded-2xl border p-5 ${
              isDark 
                ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30' 
                : 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200'
            }`}>
              <h3 className={`text-sm mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Macro Split
              </h3>
              
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className={`p-4 rounded-xl text-center ${
                  isDark ? 'bg-white/5' : 'bg-white'
                }`}>
                  <div className={`text-2xl mb-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                    {proteinPercent}%
                  </div>
                  <div className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Protein
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {todayData.protein}g
                  </div>
                </div>

                <div className={`p-4 rounded-xl text-center ${
                  isDark ? 'bg-white/5' : 'bg-white'
                }`}>
                  <div className={`text-2xl mb-1 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                    {carbsPercent}%
                  </div>
                  <div className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Carbs
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {todayData.carbs}g
                  </div>
                </div>

                <div className={`p-4 rounded-xl text-center ${
                  isDark ? 'bg-white/5' : 'bg-white'
                }`}>
                  <div className={`text-2xl mb-1 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                    {fatPercent}%
                  </div>
                  <div className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Fat
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {todayData.fat}g
                  </div>
                </div>
              </div>

              <div className="h-3 rounded-full overflow-hidden flex">
                <div 
                  className="bg-purple-500"
                  style={{ width: `${proteinPercent}%` }}
                />
                <div 
                  className="bg-cyan-500"
                  style={{ width: `${carbsPercent}%` }}
                />
                <div 
                  className="bg-orange-500"
                  style={{ width: `${fatPercent}%` }}
                />
              </div>
            </div>
          )}

          <div>
            <h3 className={`text-sm mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {timeView === 'day' ? "Today's Breakdown" : 'Weekly Trend'}
            </h3>
            
            {timeView === 'week' && (
              <>
                <MacrosWeekView 
                  weekData={weekData}
                  maxCalories={maxCalories}
                  isDark={isDark}
                />
                
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <div className={`p-4 rounded-xl border ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Avg Calories
                    </div>
                    <div className={`text-2xl ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                      {macrosData?.averages?.calories ?? 0}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-cyan-400/70' : 'text-cyan-600/70'}`}>
                      per day
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl border ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Avg Protein
                    </div>
                    <div className={`text-2xl ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                      {macrosData?.averages?.protein ?? 0}g
                    </div>
                    <div className={`text-xs ${isDark ? 'text-purple-400/70' : 'text-purple-600/70'}`}>
                      per day
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {timeView === 'day' && (
              <div className="space-y-3">
                {[todayData].map((day, index) => {
                  const isToday = day.day === 'Today';
                  const totalCals = day.calories;
                  
                  const maxValue = Math.max(
                    day.carbs, day.protein, day.fat, day.satFat ?? 0, day.fiber ?? 0, (day.sodium ?? 0) / 10, (day.cholesterol ?? 0) / 10,
                    1
                  );

                  return (
                    <div key={index}>
                      <div className="mb-4">
                        <div className={`flex items-center justify-between mb-2 text-xs ${
                          isToday 
                            ? isDark ? 'text-purple-400' : 'text-purple-600'
                            : isDark ? 'text-white/50' : 'text-gray-500'
                        }`}>
                          <span>{day.day}</span>
                          <span className={isDark ? 'text-white/70' : 'text-gray-700'}>{totalCals} cal</span>
                        </div>
                        
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-16 text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              Carbs
                            </div>
                            <div className="flex-1">
                              <div className={`h-4 rounded-full overflow-hidden ${
                                isDark ? 'bg-white/5' : 'bg-gray-100'
                              }`}>
                                <div 
                                  className={`h-full bg-cyan-500 ${isToday ? '' : 'opacity-70'}`}
                                  style={{ width: `${(day.carbs / maxValue) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className={`w-12 text-xs text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {day.carbs}g
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className={`w-16 text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              Protein
                            </div>
                            <div className="flex-1">
                              <div className={`h-4 rounded-full overflow-hidden ${
                                isDark ? 'bg-white/5' : 'bg-gray-100'
                              }`}>
                                <div 
                                  className={`h-full bg-purple-500 ${isToday ? '' : 'opacity-70'}`}
                                  style={{ width: `${(day.protein / maxValue) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className={`w-12 text-xs text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {day.protein}g
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className={`w-16 text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              Fat
                            </div>
                            <div className="flex-1">
                              <div className={`h-4 rounded-full overflow-hidden ${
                                isDark ? 'bg-white/5' : 'bg-gray-100'
                              }`}>
                                <div 
                                  className={`h-full bg-orange-500 ${isToday ? '' : 'opacity-70'}`}
                                  style={{ width: `${(day.fat / maxValue) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className={`w-12 text-xs text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {day.fat}g
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className={`w-16 text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              Sat Fat
                            </div>
                            <div className="flex-1">
                              <div className={`h-4 rounded-full overflow-hidden ${
                                isDark ? 'bg-white/5' : 'bg-gray-100'
                              }`}>
                                <div 
                                  className={`h-full bg-red-500 ${isToday ? '' : 'opacity-70'}`}
                                  style={{ width: `${(day.satFat / maxValue) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className={`w-12 text-xs text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {day.satFat}g
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className={`w-16 text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              Sodium
                            </div>
                            <div className="flex-1">
                              <div className={`h-4 rounded-full overflow-hidden ${
                                isDark ? 'bg-white/5' : 'bg-gray-100'
                              }`}>
                                <div 
                                  className={`h-full bg-pink-500 ${isToday ? '' : 'opacity-70'}`}
                                  style={{ width: `${Math.min((day.sodium / 2300) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                            <div className={`w-12 text-xs text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {day.sodium}mg
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className={`w-16 text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              Cholesterol
                            </div>
                            <div className="flex-1">
                              <div className={`h-4 rounded-full overflow-hidden ${
                                isDark ? 'bg-white/5' : 'bg-gray-100'
                              }`}>
                                <div 
                                  className={`h-full bg-yellow-500 ${isToday ? '' : 'opacity-70'}`}
                                  style={{ width: `${Math.min((day.cholesterol / 300) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                            <div className={`w-12 text-xs text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {day.cholesterol}mg
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className={`w-16 text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                              Fiber
                            </div>
                            <div className="flex-1">
                              <div className={`h-4 rounded-full overflow-hidden ${
                                isDark ? 'bg-white/5' : 'bg-gray-100'
                              }`}>
                                <div 
                                  className={`h-full bg-green-500 ${isToday ? '' : 'opacity-70'}`}
                                  style={{ width: `${Math.min((day.fiber / 30) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                            <div className={`w-12 text-xs text-right ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {day.fiber}g
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {timeView === 'day' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-cyan-500" />
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Carbohydrates
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-purple-500" />
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Protein
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-orange-500" />
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Fat
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Saturated Fat
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-pink-500" />
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Sodium
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-yellow-500" />
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Cholesterol
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Fiber
                </span>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
