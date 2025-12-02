import { ArrowRight, Info, TrendingUp, AlertTriangle, Bone } from 'lucide-react';
import { useState } from 'react';

interface DexaScanTileProps {
  isDark: boolean;
  spineTScore: number | null;
  hipTScore: number | null;
  whoClassification: string | null;
  bodyFatPercent: number | null;
  vatArea: number | null;
  testDate: string | null;
  userSex?: 'Male' | 'Female' | 'Other' | null;
}

export function DexaScanTile({ 
  isDark, 
  spineTScore,
  hipTScore,
  whoClassification,
  bodyFatPercent,
  vatArea,
  testDate,
  userSex
}: DexaScanTileProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Don't render if no real data exists - check if we have any meaningful data
  const hasData = spineTScore !== null || hipTScore !== null || bodyFatPercent !== null || vatArea !== null;
  if (!hasData) {
    return null;
  }

  // Use safe defaults for display
  const safeSpineTScore = spineTScore ?? 0;
  const safeHipTScore = hipTScore ?? 0;
  const safeBodyFatPercent = bodyFatPercent ?? 0;
  const safeVatArea = vatArea ?? 0;
  const safeWhoClassification = whoClassification ?? 'Unknown';
  const safeTestDate = testDate ?? new Date().toISOString();

  const avgTScore = (safeSpineTScore + safeHipTScore) / 2;
  const leanPercentage = 100 - safeBodyFatPercent;

  const getWHOClassificationColor = () => {
    const classification = safeWhoClassification.toLowerCase();
    if (classification === 'normal') {
      return {
        bg: isDark ? 'bg-green-500/20' : 'bg-green-100',
        text: isDark ? 'text-green-400' : 'text-green-700',
        border: isDark ? 'border-green-500/30' : 'border-green-200',
        dot: 'bg-green-500'
      };
    } else if (classification === 'osteopenia') {
      return {
        bg: isDark ? 'bg-yellow-500/20' : 'bg-yellow-100',
        text: isDark ? 'text-yellow-400' : 'text-yellow-700',
        border: isDark ? 'border-yellow-500/30' : 'border-yellow-200',
        dot: 'bg-yellow-500'
      };
    } else {
      return {
        bg: isDark ? 'bg-red-500/20' : 'bg-red-100',
        text: isDark ? 'text-red-400' : 'text-red-700',
        border: isDark ? 'border-red-500/30' : 'border-red-200',
        dot: 'bg-red-500'
      };
    }
  };

  const getVATCategory = () => {
    if (safeVatArea < 100) return { 
      label: 'Low', 
      color: 'green',
      description: 'Healthy level'
    };
    if (safeVatArea < 150) return { 
      label: 'Moderate', 
      color: 'yellow',
      description: 'Monitor closely'
    };
    return { 
      label: 'High', 
      color: 'red',
      description: 'Health risk'
    };
  };

  const whoColors = getWHOClassificationColor();
  const vatCategory = getVATCategory();

  return (
    <>
      <div 
        onClick={() => setShowDetails(true)}
        className={`backdrop-blur-xl rounded-3xl border p-5 transition-all cursor-pointer hover:scale-[1.02] ${
          isDark 
            ? 'bg-gradient-to-br from-slate-800/80 via-slate-900/80 to-slate-800/80 border-white/10 hover:bg-white/10' 
            : 'bg-gradient-to-br from-white/80 to-gray-50/80 border-black/10 hover:bg-white/90'
        }`}
        style={{ minHeight: '200px' }}
        data-testid="tile-dexa-scan"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={`text-xs tracking-wide mb-1 ${
              isDark ? 'text-white/60' : 'text-gray-500'
            }`}>
              BONE DENSITY (DEXA)
            </h3>
            <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
              {new Date(safeTestDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
              })}
            </p>
          </div>
          <Bone className={`w-5 h-5 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center">
            <div className={`text-3xl mb-1 ${whoColors.text}`} data-testid="text-body-fat">
              {safeBodyFatPercent}%
            </div>
            <div className={`text-[10px] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Body Fat
            </div>
          </div>
          <div className="text-center">
            <div className={`text-3xl mb-1 ${whoColors.text}`} data-testid="text-avg-t-score">
              {avgTScore > 0 ? '+' : ''}{avgTScore.toFixed(1)}
            </div>
            <div className={`text-[10px] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Avg T-Score
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="h-3 rounded-full overflow-hidden flex mb-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-blue-600"
              style={{ width: `${leanPercentage}%` }}
              title={`Lean: ${leanPercentage.toFixed(1)}%`}
            ></div>
            <div 
              className="bg-gradient-to-r from-orange-400 to-orange-500"
              style={{ width: `${safeBodyFatPercent}%` }}
              title={`Fat: ${safeBodyFatPercent}%`}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                Lean {leanPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              <span className={isDark ? 'text-white/50' : 'text-gray-500'}>
                Fat {safeBodyFatPercent}%
              </span>
            </div>
          </div>
        </div>

        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 ${whoColors.bg}`} data-testid="badge-who-classification">
          <div className={`w-2 h-2 rounded-full ${whoColors.dot}`}></div>
          <span className={`text-xs ${whoColors.text}`}>
            {safeWhoClassification} - {safeWhoClassification}
          </span>
        </div>

        <div className={`text-xs mb-4 leading-relaxed ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
          Bone density is in the {safeWhoClassification.toLowerCase()} range with {safeBodyFatPercent < 20 ? 'low' : safeBodyFatPercent < 30 ? 'moderate' : 'elevated'} body fat.
        </div>

        <button className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
          isDark 
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white' 
            : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white'
        }`} data-testid="button-view-full-report">
          <span className="text-sm">View Full Report</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetails(false)}
          />
          
          <div className={`relative w-full max-w-2xl max-h-[85vh] rounded-t-3xl sm:rounded-3xl border overflow-hidden ${
            isDark ? 'bg-slate-900 border-white/20' : 'bg-white border-gray-200'
          }`}>
            <div className={`sticky top-0 z-10 backdrop-blur-xl border-b px-5 py-4 ${
              isDark ? 'bg-slate-900/90 border-white/10' : 'bg-white/90 border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Bone Density (DEXA)
                </h2>
                <button 
                  onClick={() => setShowDetails(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                  data-testid="button-close-modal"
                >
                  <ArrowRight className={`w-5 h-5 rotate-90 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-5 space-y-5" style={{ maxHeight: 'calc(85vh - 70px)' }}>
              <div className={`rounded-2xl p-5 ${
                isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                    <Info className={`w-4 h-4 ${isDark ? 'text-blue-300' : 'text-blue-600'}`} />
                  </div>
                  <div>
                    <h3 className={`text-sm mb-2 ${isDark ? 'text-blue-300' : 'text-blue-900'}`}>
                      AI Summary
                    </h3>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-blue-100' : 'text-blue-800'}`}>
                      Bone density is in the {safeWhoClassification.toLowerCase()} range with {safeBodyFatPercent < 20 ? 'low' : safeBodyFatPercent < 30 ? 'moderate' : 'elevated'} body fat and {safeVatArea < 100 ? 'healthy' : 'elevated'} visceral fat.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  Bone Density Assessment
                </h3>
                <div className={`rounded-2xl p-5 mb-3 ${whoColors.bg} border ${whoColors.border}`}>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className={`text-xs mb-1 ${whoColors.text}`}>Spine T-Score</div>
                      <div className={`text-2xl ${whoColors.text}`} data-testid="text-spine-t-score">
                        {safeSpineTScore > 0 ? '+' : ''}{safeSpineTScore.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs mb-1 ${whoColors.text}`}>Hip T-Score</div>
                      <div className={`text-2xl ${whoColors.text}`} data-testid="text-hip-t-score">
                        {safeHipTScore > 0 ? '+' : ''}{safeHipTScore.toFixed(1)}
                      </div>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                    isDark ? 'bg-white/10' : 'bg-white/50'
                  }`}>
                    <Bone className={`w-4 h-4 ${whoColors.text}`} />
                    <span className={`text-sm ${whoColors.text}`}>
                      WHO Classification: {safeWhoClassification}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <TScoreRange 
                    label="Normal" 
                    range="≥ -1.0" 
                    description="Healthy bone density"
                    isActive={avgTScore >= -1.0}
                    isDark={isDark}
                  />
                  <TScoreRange 
                    label="Osteopenia" 
                    range="-1.0 to -2.5" 
                    description="Low bone mass"
                    isActive={avgTScore < -1.0 && avgTScore >= -2.5}
                    isDark={isDark}
                  />
                  <TScoreRange 
                    label="Osteoporosis" 
                    range="< -2.5" 
                    description="Very low bone density"
                    isActive={avgTScore < -2.5}
                    isDark={isDark}
                  />
                </div>
              </div>

              <div className={`rounded-2xl p-5 ${
                isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'
              }`}>
                <h3 className={`mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Body Composition
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        Body Fat Percentage
                      </span>
                      <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {safeBodyFatPercent}%
                      </span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${
                      isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-orange-500"
                        style={{ width: `${(safeBodyFatPercent / 40) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        Lean Mass Percentage
                      </span>
                      <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {leanPercentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${
                      isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
                        style={{ width: `${leanPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`rounded-2xl p-5 ${
                vatCategory.color === 'green'
                  ? isDark ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'
                  : vatCategory.color === 'yellow'
                    ? isDark ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'
                    : isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
              }`}>
                <h3 className={`text-sm mb-3 flex items-center gap-2 ${
                  vatCategory.color === 'green'
                    ? isDark ? 'text-green-400' : 'text-green-700'
                    : vatCategory.color === 'yellow'
                      ? isDark ? 'text-yellow-400' : 'text-yellow-700'
                      : isDark ? 'text-red-400' : 'text-red-700'
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                  Visceral Adipose Tissue (VAT)
                </h3>
                
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className={`text-2xl mb-1 ${
                      vatCategory.color === 'green'
                        ? isDark ? 'text-green-400' : 'text-green-700'
                        : vatCategory.color === 'yellow'
                          ? isDark ? 'text-yellow-400' : 'text-yellow-700'
                          : isDark ? 'text-red-400' : 'text-red-700'
                    }`} data-testid="text-vat-area">
                      {safeVatArea.toFixed(1)} cm²
                    </div>
                    <div className={`text-xs ${
                      vatCategory.color === 'green'
                        ? isDark ? 'text-green-400' : 'text-green-700'
                        : vatCategory.color === 'yellow'
                          ? isDark ? 'text-yellow-400' : 'text-yellow-700'
                          : isDark ? 'text-red-400' : 'text-red-700'
                    }`}>
                      {vatCategory.label} Level - {vatCategory.description}
                    </div>
                  </div>
                  <div className={`h-2 flex-1 max-w-[150px] rounded-full overflow-hidden ml-4 ${
                    isDark ? 'bg-white/10' : 'bg-gray-200'
                  }`}>
                    <div 
                      className={`h-full ${
                        vatCategory.color === 'green' ? 'bg-green-500' :
                        vatCategory.color === 'yellow' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min((safeVatArea / 200) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
                
                <p className={`text-xs ${
                  vatCategory.color === 'green'
                    ? isDark ? 'text-green-300' : 'text-green-800'
                    : vatCategory.color === 'yellow'
                      ? isDark ? 'text-yellow-300' : 'text-yellow-800'
                      : isDark ? 'text-red-300' : 'text-red-800'
                }`}>
                  Visceral fat surrounds internal organs. Levels below 100 cm² are considered healthy, 
                  100-150 cm² should be monitored, and above 150 cm² poses increased health risks.
                </p>
              </div>

              <div className={`rounded-2xl p-5 ${
                isDark ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'
              }`}>
                <h3 className={`text-sm mb-3 flex items-center gap-2 ${
                  isDark ? 'text-purple-300' : 'text-purple-900'
                }`}>
                  <TrendingUp className="w-4 h-4" />
                  Personalized Recommendations
                </h3>
                <ul className={`space-y-2 text-xs ${isDark ? 'text-purple-100' : 'text-purple-800'}`}>
                  <li>• Maintain resistance training 3-4x per week to preserve lean mass</li>
                  <li>• Ensure adequate calcium (1000-1200mg/day) and vitamin D (800-1000 IU/day)</li>
                  <li>• Include weight-bearing exercises to support bone density</li>
                  <li>• Monitor body composition changes every 6-12 months</li>
                  <li>• Consider HIIT training to optimize body fat levels</li>
                  <li>• Maintain adequate protein intake (1.6-2.2g per kg body weight)</li>
                </ul>
              </div>

              <div className={`text-[10px] p-3 rounded-xl ${
                isDark ? 'bg-white/5 text-white/60' : 'bg-gray-100 text-gray-600'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span>Scan Date:</span>
                  <span>{new Date(safeTestDate).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}</span>
                </div>
              </div>

              <div className={`text-[10px] p-3 rounded-xl ${
                isDark ? 'bg-white/5 text-white/40' : 'bg-gray-100 text-gray-500'
              }`}>
                This information is for educational purposes only. DEXA scan results should be interpreted 
                by qualified healthcare professionals. Consult with your doctor before making significant changes 
                to your diet or exercise routine.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface TScoreRangeProps {
  label: string;
  range: string;
  description: string;
  isActive: boolean;
  isDark: boolean;
}

function TScoreRange({ label, range, description, isActive, isDark }: TScoreRangeProps) {
  const getColors = () => {
    if (label === 'Normal') {
      return {
        bg: isDark ? 'bg-green-500/10' : 'bg-green-50',
        border: isDark ? 'border-green-500/30' : 'border-green-200',
        text: isDark ? 'text-green-400' : 'text-green-700',
        dot: 'bg-green-500'
      };
    } else if (label === 'Osteopenia') {
      return {
        bg: isDark ? 'bg-yellow-500/10' : 'bg-yellow-50',
        border: isDark ? 'border-yellow-500/30' : 'border-yellow-200',
        text: isDark ? 'text-yellow-400' : 'text-yellow-700',
        dot: 'bg-yellow-500'
      };
    } else {
      return {
        bg: isDark ? 'bg-red-500/10' : 'bg-red-50',
        border: isDark ? 'border-red-500/30' : 'border-red-200',
        text: isDark ? 'text-red-400' : 'text-red-700',
        dot: 'bg-red-500'
      };
    }
  };

  const colors = getColors();

  return (
    <div className={`rounded-xl p-3 border transition-all ${
      isActive 
        ? `${colors.bg} ${colors.border}` 
        : isDark 
          ? 'bg-white/5 border-white/10' 
          : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-1 ${isActive ? colors.dot : isDark ? 'bg-white/30' : 'bg-gray-400'}`}></div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm ${
              isActive ? colors.text : isDark ? 'text-white/70' : 'text-gray-700'
            }`}>
              {label}
            </span>
            <span className={`text-xs ${
              isActive ? colors.text : isDark ? 'text-white/50' : 'text-gray-500'
            }`}>
              {range}
            </span>
          </div>
          <p className={`text-xs ${
            isActive ? colors.text : isDark ? 'text-white/50' : 'text-gray-500'
          }`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
