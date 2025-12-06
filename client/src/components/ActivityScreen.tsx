import { useState } from 'react';
import { Droplet, Activity, Apple, Gauge, TrendingUp, TrendingDown, AlertCircle, Footprints, Dumbbell, Heart, Battery, Waves, ChevronRight, Home, Lightbulb } from 'lucide-react';
import { FloIcon } from './FloLogo';

interface ActivityScreenProps {
  isDark: boolean;
  onClose: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToLabs?: () => void;
  onNavigateToActions?: () => void;
  onOpenAddModal?: () => void;
}

type TabType = 'activity' | 'nutrition' | 'glucose';

export function ActivityScreen({ isDark, onClose, onNavigateToDashboard, onNavigateToLabs, onNavigateToActions, onOpenAddModal }: ActivityScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('activity');

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
          <div>
            <h1 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Activity
            </h1>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Track your health journey
            </p>
          </div>
        </div>

        {/* Tabs */}
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

      {/* Content */}
      <main className="overflow-y-auto px-4 py-6 pb-32" style={{ height: 'calc(100vh - 140px)' }}>
        <div className="max-w-2xl mx-auto">
          {activeTab === 'activity' && <ActivityTabContent isDark={isDark} />}
          {activeTab === 'nutrition' && <NutritionTabContent isDark={isDark} />}
          {activeTab === 'glucose' && <GlucoseTabContent isDark={isDark} />}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t transition-colors ${
          isDark
            ? 'bg-white/5 border-white/10'
            : 'bg-white/70 border-black/10'
        }`}
      >
        <div className="grid grid-cols-5 items-center px-2 py-3">
          <button
            onClick={onNavigateToDashboard}
            className="flex flex-col items-center gap-1 px-2 py-2"
          >
            <Home
              className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`}
            />
            <span
              className={`text-[10px] ${isDark ? 'text-white/70' : 'text-gray-600'}`}
            >
              Dashboard
            </span>
          </button>

          <button
            onClick={onNavigateToLabs}
            className="flex flex-col items-center gap-1 px-2 py-2"
          >
            <Droplet
              className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`}
            />
            <span
              className={`text-[10px] ${isDark ? 'text-white/70' : 'text-gray-600'}`}
            >
              Labs
            </span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="flex flex-col items-center gap-1 px-2 py-2 -mt-2"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 flex items-center justify-center shadow-xl shadow-cyan-500/30">
              <FloIcon size={28} className="text-white" />
            </div>
            <span
              className={`text-[10px] mt-1 ${isDark ? 'text-white/70' : 'text-gray-600'}`}
            >
              Add
            </span>
          </button>

          <button
            className="flex flex-col items-center gap-1 px-2 py-2"
          >
            <Activity
              className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
            />
            <span
              className={`text-[10px] ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
            >
              Activity
            </span>
          </button>

          <button
            onClick={onNavigateToActions}
            className="flex flex-col items-center gap-1 px-2 py-2"
          >
            <Lightbulb
              className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`}
            />
            <span
              className={`text-[10px] ${isDark ? 'text-white/70' : 'text-gray-600'}`}
            >
              Actions
            </span>
          </button>
        </div>
      </nav>
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
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// Activity Tab Content
function ActivityTabContent({ isDark }: { isDark: boolean }) {
  // Mock data
  const steps = 7420;
  const stepsGoal = 10000;
  const stepsPercent = (steps / stepsGoal) * 100;
  
  const distance = 5.8; // km
  const activeEnergy = 342; // kcal
  const exerciseMinutes = 48;
  const exerciseGoal = 30;
  const standHours = 9;
  const flightsClimbed = 12;
  
  // Workouts data
  const workoutsToday = 2;
  const workoutsDuration = 63; // minutes
  const workoutsEnergy = 412; // kcal
  const lastWorkout = {
    type: 'Run',
    distance: 5.2,
    avgHeartRate: 145,
    elevation: 120
  };
  
  // Cardio Fitness data
  const vo2Max = 44;
  const vo2Level = 'Good';
  const restingHeartRate = 58;
  const sixMinWalk = 620; // meters
  const vo2Trend = 'up' as 'up' | 'stable' | 'down';
  
  // Recovery & Strain data
  const hrv = 72; // ms
  const hrvBaseline = 68;
  const hrvStatus: 'recovered' | 'ok' | 'strained' = hrv >= hrvBaseline + 5 ? 'recovered' : hrv < hrvBaseline - 5 ? 'strained' : 'ok';
  const rhrStatus = 'Normal';
  
  // Movement Quality data
  const movementQuality: 'stable' | 'watch' | 'attention' = 'stable';
  const movementScore = 87; // out of 100
  const movementDelta = 3; // vs last week
  const walkingSpeed = 5.2; // km/h
  const stepLength = 74; // cm
  const doubleSupport = 28.4; // %
  const asymmetry = 2.1; // %
  
  return (
    <div className="space-y-4">
      {/* Tile 1 - Today's Activity */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Footprints className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              Today's Activity
            </h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        {/* Progress Ring with Steps */}
        <div className="flex items-center gap-6 mb-4">
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="url(#steps-gradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${stepsPercent * 2.64} 264`}
              />
              <defs>
                <linearGradient id="steps-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {steps.toLocaleString()}
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  steps
                </div>
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
        
        {/* Exercise Minutes Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Exercise
            </span>
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {exerciseMinutes}/{exerciseGoal} min
            </span>
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${
            isDark ? 'bg-white/10' : 'bg-gray-200'
          }`}>
            <div 
              className="h-full bg-gradient-to-r from-green-400 to-green-500"
              style={{ width: `${Math.min((exerciseMinutes / exerciseGoal) * 100, 100)}%` }}
            />
          </div>
        </div>
        
        {/* Secondary Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`text-center p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Distance</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{distance} km</div>
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
      
      {/* Tile 2 - Workouts */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Dumbbell className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              Workouts
            </h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="mb-4">
          <div className={`text-3xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {workoutsToday} workouts · {workoutsDuration} min
          </div>
          <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {workoutsEnergy} cal burned
          </div>
        </div>
        
        {/* Last Workout */}
        <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
          <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Last workout
          </div>
          <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {lastWorkout.distance} km {lastWorkout.type} · {lastWorkout.avgHeartRate} bpm avg
          </div>
          {lastWorkout.elevation > 0 && (
            <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs ${
              isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'
            }`}>
              <TrendingUp className="w-3 h-3" />
              +{lastWorkout.elevation} m
            </div>
          )}
        </div>
      </button>
      
      {/* Tile 3 - Cardio Fitness */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Heart className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
            <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              Cardio Fitness
            </h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {vo2Max}
          </span>
          <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
            ml/kg/min
          </span>
          <span className={`ml-2 px-3 py-1 rounded-full text-xs ${
            isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
          }`}>
            {vo2Level}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Resting HR (7d avg)
            </div>
            <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {restingHeartRate} bpm
            </div>
          </div>
          <div>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              6-min walk
            </div>
            <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {sixMinWalk} m
            </div>
          </div>
        </div>
        
        {/* 30-day trend indicator */}
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
      </button>
      
      {/* Tile 4 - Recovery & Strain */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Battery className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              Recovery & Strain
            </h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            HRV:
          </span>
          <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {hrv}
          </span>
          <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
            ms
          </span>
          <span className={`ml-2 px-3 py-1 rounded-full text-xs ${
            hrvStatus === 'recovered' 
              ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
              : hrvStatus === 'strained'
                ? isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                : isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {hrvStatus === 'recovered' ? 'Recovered' : hrvStatus === 'strained' ? 'Strained' : 'OK'}
          </span>
        </div>
        
        <div className={`mb-4 text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
          Resting HR: {rhrStatus}
        </div>
        
        {/* Traffic light style indicator */}
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
      </button>
      
      {/* Tile 5 - Movement Quality */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Waves className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
              Movement Quality
            </h3>
          </div>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={
                  movementQuality === 'stable' ? '#10b981' :
                  movementQuality === 'watch' ? '#f59e0b' : '#ef4444'
                }
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${movementScore * 2.64} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`text-2xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {movementScore}
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <div className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Movement quality: 
              <span className={`ml-2 ${
                movementQuality === 'stable' ? isDark ? 'text-green-400' : 'text-green-600' :
                movementQuality === 'watch' ? isDark ? 'text-yellow-400' : 'text-yellow-600' :
                isDark ? 'text-red-400' : 'text-red-600'
              }`}>
                {movementQuality === 'stable' ? 'Stable' :
                 movementQuality === 'watch' ? 'Watch' : 'Needs attention'}
              </span>
            </div>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {movementDelta > 0 ? '+' : ''}{movementDelta} vs last week
            </div>
          </div>
        </div>
        
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Walking speed</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{walkingSpeed} km/h</div>
          </div>
          <div className={`p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Step length</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{stepLength} cm</div>
          </div>
          <div className={`p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Double support</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{doubleSupport}%</div>
          </div>
          <div className={`p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Asymmetry</div>
            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{asymmetry}%</div>
          </div>
        </div>
      </button>
    </div>
  );
}

// Nutrition Tab Content
function NutritionTabContent({ isDark }: { isDark: boolean }) {
  // User profile for personalization
  const userProfile = {
    sex: 'male' as 'male' | 'female',
    age: 42,
    weight: 78, // kg
    activityLevel: 'active' as 'sedentary' | 'lightly_active' | 'active' | 'very_active',
    goal: 'maintain' as 'lose' | 'maintain' | 'gain'
  };
  
  // Calculate personalized targets
  const calculateTargets = () => {
    // Protein target: 1.2 g/kg for active adult
    const proteinTarget = userProfile.weight * 1.2; // 93.6g
    
    // BMR (Mifflin-St Jeor for males): 10*weight + 6.25*height - 5*age + 5
    // Simplified: using typical height assumptions
    const bmr = 10 * userProfile.weight + 6.25 * 175 - 5 * userProfile.age + 5; // ~1695
    
    // Activity multiplier
    const activityMultipliers = {
      sedentary: 1.2,
      lightly_active: 1.375,
      active: 1.55,
      very_active: 1.725
    };
    
    const tdee = bmr * activityMultipliers[userProfile.activityLevel]; // ~2627
    
    // Goal adjustment
    const goalAdjustments = {
      lose: 0.85,
      maintain: 1.0,
      gain: 1.15
    };
    
    const calorieTarget = tdee * goalAdjustments[userProfile.goal]; // 2627
    
    return {
      protein: Math.round(proteinTarget),
      calories: Math.round(calorieTarget),
      carbs: Math.round((calorieTarget * 0.45) / 4), // 45% of cals
      fats: Math.round((calorieTarget * 0.30) / 9), // 30% of cals
      water: userProfile.weight * 35 // ml/kg
    };
  };
  
  const targets = calculateTargets();
  
  // Today's intake (mock data)
  const intake = {
    protein: 88, // g
    calories: 2420,
    carbs: 285,
    fats: 78,
    fiber: 28,
    water: 2100, // ml
    caffeine: 180, // mg
    sodium: 2100, // mg
    sugar: 42 // g
  };
  
  // Micronutrient tracking
  const microsTotal = 12;
  const microsCovered = 9;
  const lowMicros = ['Vitamin D', 'Magnesium', 'Omega-3'];
  
  // Traffic light scoring
  const proteinPercent = (intake.protein / targets.protein) * 100;
  const proteinScore: 'green' | 'amber' | 'red' = 
    proteinPercent >= 90 ? 'green' : proteinPercent >= 70 ? 'amber' : 'red';
  
  const calorieDeviation = Math.abs((intake.calories / targets.calories) - 1) * 100;
  const calorieScore: 'green' | 'amber' | 'red' = 
    calorieDeviation <= 10 ? 'green' : calorieDeviation <= 20 ? 'amber' : 'red';
  
  // Calculate overall nutrition score (0-100)
  const calculateNutritionScore = () => {
    let score = 0;
    
    // Protein (25 points)
    if (proteinScore === 'green') score += 25;
    else if (proteinScore === 'amber') score += 15;
    else score += 5;
    
    // Calories (25 points)
    if (calorieScore === 'green') score += 25;
    else if (calorieScore === 'amber') score += 18;
    else score += 10;
    
    // Micronutrient coverage (30 points)
    score += (microsCovered / microsTotal) * 30;
    
    // Fiber (10 points) - target ~30g
    if (intake.fiber >= 25) score += 10;
    else if (intake.fiber >= 18) score += 7;
    else score += 3;
    
    // Hydration (10 points)
    const waterPercent = (intake.water / targets.water) * 100;
    if (waterPercent >= 90) score += 10;
    else if (waterPercent >= 70) score += 6;
    else score += 2;
    
    return Math.round(score);
  };
  
  const nutritionScore = calculateNutritionScore();
  
  return (
    <div className="space-y-4">
      {/* Tile 1 - Nutrition Score */}
      <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="flex items-center gap-2 mb-4">
          <Apple className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Today's Nutrition
          </h3>
        </div>
        
        <div className="flex items-center gap-6 mb-4">
          <div className="relative w-28 h-28">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="url(#nutrition-gradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${nutritionScore * 2.64} 264`}
              />
              <defs>
                <linearGradient id="nutrition-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-3xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {nutritionScore}
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  score
                </div>
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
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Personalised for {userProfile.age}yr {userProfile.sex}, {userProfile.weight}kg
            </div>
          </div>
        </div>
      </div>
      
      {/* Tile 2 - Macros */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Macros
          </h3>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        {/* Protein */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Protein
            </span>
            <div className="flex items-baseline gap-1">
              <span className={`${
                proteinScore === 'green' ? isDark ? 'text-green-400' : 'text-green-600' :
                proteinScore === 'amber' ? isDark ? 'text-yellow-400' : 'text-yellow-600' :
                isDark ? 'text-red-400' : 'text-red-600'
              }`}>
                {intake.protein}g
              </span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                / {targets.protein}g
              </span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${
            isDark ? 'bg-white/10' : 'bg-gray-200'
          }`}>
            <div 
              className={`h-full ${
                proteinScore === 'green' ? 'bg-gradient-to-r from-green-400 to-green-500' :
                proteinScore === 'amber' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                'bg-gradient-to-r from-red-400 to-red-500'
              }`}
              style={{ width: `${Math.min((intake.protein / targets.protein) * 100, 100)}%` }}
            />
          </div>
          <div className={`text-xs mt-1 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
            {Math.round((intake.protein / targets.protein) * 100)}% of target (1.2g/kg)
          </div>
        </div>
        
        {/* Calories */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Calories
            </span>
            <div className="flex items-baseline gap-1">
              <span className={`${
                calorieScore === 'green' ? isDark ? 'text-green-400' : 'text-green-600' :
                calorieScore === 'amber' ? isDark ? 'text-yellow-400' : 'text-yellow-600' :
                isDark ? 'text-red-400' : 'text-red-600'
              }`}>
                {intake.calories}
              </span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                / {targets.calories}
              </span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${
            isDark ? 'bg-white/10' : 'bg-gray-200'
          }`}>
            <div 
              className={`h-full ${
                calorieScore === 'green' ? 'bg-gradient-to-r from-cyan-400 to-cyan-500' :
                calorieScore === 'amber' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                'bg-gradient-to-r from-red-400 to-red-500'
              }`}
              style={{ width: `${Math.min((intake.calories / targets.calories) * 100, 100)}%` }}
            />
          </div>
          <div className={`text-xs mt-1 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
            {Math.round((intake.calories / targets.calories) * 100)}% of TDEE
          </div>
        </div>
        
        {/* Carbs & Fats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Carbs
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {intake.carbs}g
              </span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                / {targets.carbs}g
              </span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Fats
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {intake.fats}g
              </span>
              <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                / {targets.fats}g
              </span>
            </div>
          </div>
        </div>
      </button>
      
      {/* Tile 3 - Micronutrient Coverage */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Micronutrient Coverage
          </h3>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={
                  (microsCovered / microsTotal) >= 0.8 ? '#10b981' :
                  (microsCovered / microsTotal) >= 0.6 ? '#f59e0b' : '#ef4444'
                }
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(microsCovered / microsTotal) * 264} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {microsCovered}/{microsTotal}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <div className={`text-sm mb-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              {Math.round((microsCovered / microsTotal) * 100)}% of targets hit
            </div>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Age + sex adjusted RDAs
            </div>
          </div>
        </div>
        
        {lowMicros.length > 0 && (
          <div className={`p-3 rounded-xl ${isDark ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-orange-400' : 'text-orange-700'}`}>
              Low or borderline:
            </div>
            <div className={`text-sm ${isDark ? 'text-orange-300' : 'text-orange-800'}`}>
              {lowMicros.join(', ')}
            </div>
          </div>
        )}
      </button>
      
      {/* Tile 4 - Hydration */}
      <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="flex items-center gap-2 mb-4">
          <Droplet className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Hydration
          </h3>
        </div>
        
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {(intake.water / 1000).toFixed(1)}
          </span>
          <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
            L
          </span>
          <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            / {(targets.water / 1000).toFixed(1)}L
          </span>
        </div>
        
        <div className={`h-2 rounded-full overflow-hidden mb-2 ${
          isDark ? 'bg-white/10' : 'bg-gray-200'
        }`}>
          <div 
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
            style={{ width: `${Math.min((intake.water / targets.water) * 100, 100)}%` }}
          />
        </div>
        
        <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          Target: {Math.round(targets.water / userProfile.weight)} ml/kg body weight
        </div>
      </div>
      
      {/* Tile 5 - Limits */}
      <button 
        className={`w-full backdrop-blur-xl rounded-3xl border p-6 transition-all text-left ${
          isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/60 border-black/10 hover:bg-white/80'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Watch Items
          </h3>
          <ChevronRight className={`w-5 h-5 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          {/* Caffeine */}
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Caffeine
            </div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {intake.caffeine}mg
            </div>
            <div className={`text-xs ${
              intake.caffeine <= 400 
                ? isDark ? 'text-green-400' : 'text-green-600'
                : isDark ? 'text-orange-400' : 'text-orange-600'
            }`}>
              {intake.caffeine <= 400 ? 'Within limit' : 'Above limit'}
            </div>
          </div>
          
          {/* Sodium */}
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Sodium
            </div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {intake.sodium}mg
            </div>
            <div className={`text-xs ${
              intake.sodium <= 2300 
                ? isDark ? 'text-green-400' : 'text-green-600'
                : isDark ? 'text-orange-400' : 'text-orange-600'
            }`}>
              {intake.sodium <= 2300 ? 'Within limit' : 'Above limit'}
            </div>
          </div>
          
          {/* Sugar */}
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Sugar
            </div>
            <div className={`text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {intake.sugar}g
            </div>
            <div className={`text-xs ${
              intake.sugar <= 50 
                ? isDark ? 'text-green-400' : 'text-green-600'
                : isDark ? 'text-orange-400' : 'text-orange-600'
            }`}>
              {intake.sugar <= 50 ? 'Moderate' : 'High'}
            </div>
          </div>
        </div>
        
        <div className={`mt-3 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          Guidelines: Caffeine &lt;400mg, Sodium &lt;2,300mg, Added sugar &lt;50g
        </div>
      </button>
    </div>
  );
}

// Glucose Monitoring Tab Content
function GlucoseTabContent({ isDark }: { isDark: boolean }) {
  const [timeRange, setTimeRange] = useState<'day' | '7d' | '14d'>('day');
  
  // Mock data for demonstration
  const currentGlucose = 98;
  const glucoseStatus: 'low' | 'normal' | 'high' = currentGlucose < 70 ? 'low' : currentGlucose > 140 ? 'high' : 'normal';
  
  // Time in range data
  const timeInRangeToday = 87; // percentage
  const timeInRange7d = 82; // percentage
  
  // Daily average
  const avgToday = 102;
  const minToday = 72;
  const maxToday = 145;
  
  // Lows and Highs
  const lowsToday = { count: 1, minutes: 23 };
  const highsToday = { count: 2, minutes: 87 };
  
  // Generate mock trend data
  const generateTrendData = (range: 'day' | '7d' | '14d') => {
    const points = range === 'day' ? 24 : range === '7d' ? 168 : 336;
    const data = [];
    for (let i = 0; i < points; i++) {
      const baseValue = 95 + Math.sin(i / 4) * 15;
      const noise = (Math.random() - 0.5) * 20;
      data.push({
        value: Math.max(60, Math.min(180, baseValue + noise)),
        time: i
      });
    }
    return data;
  };
  
  const trendData = generateTrendData(timeRange);
  
  return (
    <div className="space-y-4">
      {/* Hero - Current Glucose */}
      <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="text-center">
          <p className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Right Now
          </p>
          <div className="flex items-baseline justify-center gap-2 mb-3">
            <span className={`text-6xl ${
              glucoseStatus === 'low' ? 'text-orange-500' :
              glucoseStatus === 'high' ? 'text-red-500' :
              isDark ? 'text-green-400' : 'text-green-600'
            }`}>
              {currentGlucose}
            </span>
            <span className={`text-xl ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
              mg/dL
            </span>
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
              {glucoseStatus === 'low' ? 'Below Range' : 
               glucoseStatus === 'high' ? 'Above Range' : 'In Range'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Time in Range */}
      <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <h3 className={`text-sm mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Time in Range
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Today
            </p>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                {timeInRangeToday}
              </span>
              <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                %
              </span>
            </div>
            <div className={`mt-2 h-2 rounded-full overflow-hidden ${
              isDark ? 'bg-white/10' : 'bg-gray-200'
            }`}>
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-green-500"
                style={{ width: `${timeInRangeToday}%` }}
              />
            </div>
          </div>
          
          <div>
            <p className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              7 Days
            </p>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                {timeInRange7d}
              </span>
              <span className={`text-lg ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                %
              </span>
            </div>
            <div className={`mt-2 h-2 rounded-full overflow-hidden ${
              isDark ? 'bg-white/10' : 'bg-gray-200'
            }`}>
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-green-500"
                style={{ width: `${timeInRange7d}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Daily Average */}
      <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <h3 className={`text-sm mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Daily Average
        </h3>
        <div className="flex items-end gap-2 mb-3">
          <span className={`text-4xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {avgToday}
          </span>
          <span className={`text-lg mb-1 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
            mg/dL
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Min
            </p>
            <p className={`text-xl ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
              {minToday}
            </p>
          </div>
          <div className={`flex-1 mx-4 h-1 rounded-full ${
            isDark ? 'bg-white/10' : 'bg-gray-200'
          }`}>
            <div className="h-full bg-gradient-to-r from-orange-400 via-green-400 to-red-400 rounded-full" />
          </div>
          <div>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Max
            </p>
            <p className={`text-xl ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              {maxToday}
            </p>
          </div>
        </div>
      </div>
      
      {/* Lows and Highs */}
      <div className="grid grid-cols-2 gap-4">
        {/* Lows */}
        <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-orange-500" />
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Lows
            </h3>
          </div>
          <div className="mb-3">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                {lowsToday.count}
              </span>
              <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                events
              </span>
            </div>
          </div>
          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {lowsToday.minutes} mins below range
          </div>
        </div>
        
        {/* Highs */}
        <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Highs
            </h3>
          </div>
          <div className="mb-3">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                {highsToday.count}
              </span>
              <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                events
              </span>
            </div>
          </div>
          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            {highsToday.minutes} mins above range
          </div>
        </div>
      </div>
      
      {/* Trend Chart */}
      <div className={`backdrop-blur-xl rounded-3xl border p-5 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Trend
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setTimeRange('day')}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                timeRange === 'day'
                  ? isDark
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                  : isDark
                    ? 'bg-white/5 text-white/50 border border-white/10'
                    : 'bg-white/40 text-gray-600 border border-black/10'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                timeRange === '7d'
                  ? isDark
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                  : isDark
                    ? 'bg-white/5 text-white/50 border border-white/10'
                    : 'bg-white/40 text-gray-600 border border-black/10'
              }`}
            >
              7D
            </button>
            <button
              onClick={() => setTimeRange('14d')}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                timeRange === '14d'
                  ? isDark
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                  : isDark
                    ? 'bg-white/5 text-white/50 border border-white/10'
                    : 'bg-white/40 text-gray-600 border border-black/10'
              }`}
            >
              14D
            </button>
          </div>
        </div>
        
        <GlucoseTrendChart 
          data={trendData}
          isDark={isDark}
          timeRange={timeRange}
        />
      </div>
    </div>
  );
}

interface GlucoseTrendChartProps {
  data: Array<{ value: number; time: number }>;
  isDark: boolean;
  timeRange: 'day' | '7d' | '14d';
}

function GlucoseTrendChart({ data, isDark, timeRange }: GlucoseTrendChartProps) {
  const chartWidth = 320;
  const chartHeight = 160;
  const padding = { top: 20, bottom: 30, left: 0, right: 0 };
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const minValue = 60;
  const maxValue = 180;
  const valueRange = maxValue - minValue;
  
  // Target range
  const targetMin = 70;
  const targetMax = 140;
  
  const points = data.map((d, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + (1 - (d.value - minValue) / valueRange) * innerHeight;
    const inRange = d.value >= targetMin && d.value <= targetMax;
    return { x, y, value: d.value, inRange };
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
        </defs>
        
        {/* Target range band */}
        <rect
          x={0}
          y={targetMaxY}
          width={chartWidth}
          height={targetMinY - targetMaxY}
          fill="url(#glucose-gradient)"
          rx={4}
        />
        
        {/* Target range lines */}
        <line
          x1={0}
          y1={targetMaxY}
          x2={chartWidth}
          y2={targetMaxY}
          stroke="#10b981"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.4}
        />
        <line
          x1={0}
          y1={targetMinY}
          x2={chartWidth}
          y2={targetMinY}
          stroke="#10b981"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.4}
        />
        
        {/* Gradient fill under curve */}
        <defs>
          <linearGradient id="area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        
        <path
          d={`
            M 0 ${chartHeight - padding.bottom}
            L ${points.map(p => `${p.x} ${p.y}`).join(' L ')}
            L ${chartWidth} ${chartHeight - padding.bottom}
            Z
          `}
          fill="url(#area-gradient)"
        />
        
        {/* Line */}
        <path
          d={`M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Y-axis labels */}
        <text
          x={chartWidth - 5}
          y={padding.top - 5}
          className={`text-[10px] ${isDark ? 'fill-white/40' : 'fill-gray-500'}`}
          textAnchor="end"
        >
          {maxValue}
        </text>
        <text
          x={chartWidth - 5}
          y={chartHeight - padding.bottom + 12}
          className={`text-[10px] ${isDark ? 'fill-white/40' : 'fill-gray-500'}`}
          textAnchor="end"
        >
          {minValue}
        </text>
      </svg>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
            Target: {targetMin}-{targetMax} mg/dL
          </span>
        </div>
      </div>
    </div>
  );
}
