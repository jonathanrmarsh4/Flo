import { ArrowDown, ArrowUp, TrendingUp, TrendingDown, Brain, Heart, Sparkles, ChevronRight } from 'lucide-react';

interface InsightsScreenProps {
  isDark: boolean;
  onClose: () => void;
  onOpenFullReport: () => void;
}

export function InsightsScreen({ isDark, onClose, onOpenFullReport }: InsightsScreenProps) {
  // Mock data for biological age calculation
  const biologicalAge = 46;
  const chronologicalAge = 49.2;
  const ageDifference = chronologicalAge - biologicalAge;
  
  // Mock data for top biomarkers to improve
  const topBiomarkers = [
    { 
      name: 'LDL', 
      change: '+14%', 
      trend: 'up' as const, 
      color: 'red' as const, 
      sparkline: [85, 88, 92, 95, 97],
      benefit: 'Lowering LDL cholesterol reduces arterial plaque buildup, cutting your risk of heart disease and stroke by up to 25%. Focus on fiber-rich foods and regular cardio.'
    },
    { 
      name: 'HbA1c', 
      change: '+3%', 
      trend: 'up' as const, 
      color: 'amber' as const, 
      sparkline: [5.2, 5.3, 5.3, 5.4, 5.4],
      benefit: 'Better blood sugar control prevents diabetes complications, protects nerve and kidney function, and improves energy levels. Consider reducing refined carbs and increasing protein.'
    },
    { 
      name: 'Vitamin D', 
      change: '-7%', 
      trend: 'down' as const, 
      color: 'yellow' as const, 
      sparkline: [42, 38, 36, 35, 32],
      benefit: 'Optimal Vitamin D strengthens bones, boosts immune function, and may reduce depression risk. Aim for 15 minutes of sun exposure daily or supplement with D3.'
    }
  ];
  
  // Mock AI insight
  const aiInsight = "Your inflammation markers have dropped consistently over the past 6 months, indicating improved recovery and reduced cardiovascular risk. Keep up your current lifestyle interventions focused on omega-3 intake and regular exercise.";
  
  // Progress ring calculation for biological age
  const progressPercentage = ((chronologicalAge - biologicalAge) / chronologicalAge) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;
  
  return (
    <div className={`h-full overflow-y-auto transition-colors ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onClose}
              className={`text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
            >
              ← Back
            </button>
            <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>AI Insights</h1>
            <div className="w-12"></div> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-4">
        {/* Hero Tile: Biological Age */}
        <div 
          className={`backdrop-blur-xl rounded-3xl border p-8 transition-all hover:scale-[1.01] relative overflow-hidden ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}
          style={{ minHeight: '420px' }}
        >
          {/* Ambient glow background */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-500 rounded-full blur-3xl"></div>
          </div>

          {/* Content */}
          <div className="relative z-10">
            <div className="text-center mb-8">
              <h2 className={`text-2xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Your Biological Age
              </h2>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                isDark ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-100 border border-green-200'
              }`}>
                <TrendingDown className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                <span className={`${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  {ageDifference.toFixed(1)} years younger than chronological age
                </span>
              </div>
            </div>

            {/* Large Progress Ring */}
            <div className="flex justify-center mb-8">
              <div className="relative" style={{ width: 240, height: 240 }}>
                {/* Outer glow effect */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-500/20 via-cyan-500/20 to-blue-500/20 blur-xl"></div>
                
                <svg className="transform -rotate-90 relative z-10" width="240" height="240">
                  <defs>
                    <linearGradient id="ageGradientLarge" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#14b8a6" />
                      <stop offset="30%" stopColor="#06b6d4" />
                      <stop offset="70%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  
                  {/* Background circle */}
                  <circle
                    cx="120"
                    cy="120"
                    r="100"
                    stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                    strokeWidth="16"
                    fill="none"
                  />
                  
                  {/* Progress circle */}
                  <circle
                    cx="120"
                    cy="120"
                    r="100"
                    stroke="url(#ageGradientLarge)"
                    strokeWidth="16"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference * 2.22}
                    strokeDashoffset={strokeDashoffset * 2.22}
                    className="transition-all duration-1000 ease-out"
                    filter="url(#glow)"
                    style={{ filter: 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.6))' }}
                  />
                </svg>
                
                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className={`text-7xl mb-2 bg-gradient-to-br from-teal-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent ${
                    isDark ? '' : 'drop-shadow-lg'
                  }`} style={{ fontWeight: 600, lineHeight: 1 }}>
                    {biologicalAge}
                  </div>
                  <span className={`text-lg ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    years old
                  </span>
                  
                  {/* vs chronological age */}
                  <div className={`mt-4 text-sm ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
                    vs. {chronologicalAge.toFixed(1)} chronological
                  </div>
                </div>

                {/* Floating particles/sparkles */}
                <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-cyan-400 opacity-60 animate-pulse"></div>
                <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 rounded-full bg-blue-400 opacity-40 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute bottom-1/3 left-1/3 w-1 h-1 rounded-full bg-teal-400 opacity-50 animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute bottom-1/4 right-1/3 w-1.5 h-1.5 rounded-full bg-purple-400 opacity-30 animate-pulse" style={{ animationDelay: '1.5s' }}></div>
              </div>
            </div>

            {/* Footnote */}
            <div className={`text-center px-4 text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
              Calculated using the PhenoAge algorithm (Levine et al., 2018) based on 9 blood biomarkers.
            </div>
          </div>
        </div>

        {/* Medium Tile: Top 3 Biomarkers to Improve */}
        <div 
          className={`backdrop-blur-xl rounded-3xl border p-6 transition-all hover:scale-[1.01] ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className={`text-xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Top 3 Biomarkers to Improve
              </h2>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Based on your latest bloodwork trends
              </p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {topBiomarkers.map((biomarker, index) => {
              const isRed = biomarker.color === 'red';
              const isAmber = biomarker.color === 'amber';
              const isYellow = biomarker.color === 'yellow';
              
              return (
                <div 
                  key={index}
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isRed ? (isDark ? 'bg-red-500/20' : 'bg-red-100') :
                        isAmber ? (isDark ? 'bg-amber-500/20' : 'bg-amber-100') :
                        isDark ? 'bg-yellow-500/20' : 'bg-yellow-100'
                      }`}>
                        {biomarker.trend === 'up' ? (
                          <TrendingUp className={`w-4 h-4 ${
                            isRed ? (isDark ? 'text-red-400' : 'text-red-600') :
                            isAmber ? (isDark ? 'text-amber-400' : 'text-amber-600') :
                            isDark ? 'text-yellow-400' : 'text-yellow-600'
                          }`} />
                        ) : (
                          <TrendingDown className={`w-4 h-4 ${
                            isDark ? 'text-yellow-400' : 'text-yellow-600'
                          }`} />
                        )}
                      </div>
                      <div>
                        <div className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {biomarker.name}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Last 6 months
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Mini sparkline */}
                      <svg width="60" height="24" className="opacity-60">
                        {biomarker.sparkline.map((value, i, arr) => {
                          if (i === arr.length - 1) return null;
                          const x1 = (i / (arr.length - 1)) * 60;
                          const x2 = ((i + 1) / (arr.length - 1)) * 60;
                          const max = Math.max(...arr);
                          const min = Math.min(...arr);
                          const range = max - min || 1;
                          const y1 = 20 - ((value - min) / range) * 16;
                          const y2 = 20 - ((arr[i + 1] - min) / range) * 16;
                          
                          return (
                            <line
                              key={i}
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={
                                isRed ? (isDark ? '#f87171' : '#dc2626') :
                                isAmber ? (isDark ? '#fbbf24' : '#d97706') :
                                isDark ? '#facc15' : '#ca8a04'
                              }
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          );
                        })}
                      </svg>
                      
                      <span className={`text-sm ${
                        isRed ? (isDark ? 'text-red-400' : 'text-red-600') :
                        isAmber ? (isDark ? 'text-amber-400' : 'text-amber-600') :
                        isDark ? 'text-yellow-400' : 'text-yellow-600'
                      }`}>
                        {biomarker.change}
                      </span>
                    </div>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {biomarker.benefit}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wide Tile: AI Insights */}
        <div 
          className={`backdrop-blur-xl rounded-3xl border p-6 transition-all hover:scale-[1.01] ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <Brain className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div className="flex-1">
              <h2 className={`text-xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                AI Insights
              </h2>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Generated by analyzing all biomarker movements over time
              </p>
            </div>
          </div>

          <div className={`p-4 rounded-2xl mb-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
            <div className="flex gap-2 mb-3">
              <span className="text-2xl">🧠</span>
              <span className="text-2xl">💡</span>
              <span className="text-2xl">❤️</span>
            </div>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
              {aiInsight}
            </p>
          </div>

          <button 
            className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all ${
              isDark 
                ? 'bg-white/10 text-white hover:bg-white/20' 
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
            }`}
            onClick={onOpenFullReport}
          >
            <Sparkles className="w-4 h-4" />
            <span>See full report</span>
          </button>
        </div>

        {/* Disclaimer */}
        <div className={`p-4 rounded-2xl text-xs ${
          isDark ? 'bg-white/5 text-white/40' : 'bg-white/60 text-gray-500'
        }`}>
          ⚠️ These AI-generated insights are for educational purposes only and should not replace professional medical advice. Always consult with qualified healthcare providers before making changes to your health regimen.
        </div>
      </div>
    </div>
  );
}