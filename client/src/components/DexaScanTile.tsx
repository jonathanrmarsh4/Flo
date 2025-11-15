import { ArrowRight, Info, Upload, X, Bone, Activity } from 'lucide-react';
import { useState } from 'react';
import { UnifiedUploadModal } from './UnifiedUploadModal';

interface DexaScanTileProps {
  isDark: boolean;
  spineTScore?: number | null;
  hipTScore?: number | null;
  whoClassification?: string | null;
  bodyFatPercent?: number | null;
  vatArea?: number | null;
  testDate?: string | null;
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
  const [showUploadModal, setShowUploadModal] = useState(false);

  // If no spine T-score, show upload state
  if (spineTScore === null || spineTScore === undefined) {
    return (
      <>
        <div 
          className={`backdrop-blur-xl rounded-3xl border p-5 transition-all hover-elevate ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}
          data-testid="tile-dexa-scan"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={`text-xs tracking-wide mb-1 ${
                isDark ? 'text-white/60' : 'text-gray-500'
              }`}>
                DEXA SCAN
              </h3>
              <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                Bone density & body composition
              </p>
            </div>
          </div>

          <div className="text-center py-8">
            <p className={`text-sm mb-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              No test data available
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                isDark 
                  ? 'bg-cyan-500 hover:bg-cyan-600 text-white' 
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
              }`}
              data-testid="button-upload-dexa-scan"
            >
              <Upload className="w-4 h-4" />
              Upload DEXA Scan
            </button>
          </div>
        </div>

        {showUploadModal && (
          <UnifiedUploadModal 
            isDark={isDark}
            onClose={() => setShowUploadModal(false)}
            initialMode="diagnostics"
          />
        )}
      </>
    );
  }

  // Determine bone density category from T-score
  const getBoneDensityDetails = (tScore: number) => {
    if (tScore >= -1.0) {
      return {
        label: 'Normal',
        color: isDark ? 'text-green-400' : 'text-green-600',
        bgColor: isDark ? 'bg-green-500/20' : 'bg-green-100',
        barColor: 'bg-green-500',
        circleColor: 'bg-gradient-to-br from-green-400 to-green-600',
        description: 'Healthy bone density'
      };
    } else if (tScore >= -2.5) {
      return {
        label: 'Osteopenia',
        color: isDark ? 'text-yellow-400' : 'text-yellow-700',
        bgColor: isDark ? 'bg-yellow-500/20' : 'bg-yellow-100',
        barColor: 'bg-yellow-500',
        circleColor: 'bg-gradient-to-br from-yellow-400 to-yellow-600',
        description: 'Low bone density'
      };
    } else {
      return {
        label: 'Osteoporosis',
        color: isDark ? 'text-red-400' : 'text-red-600',
        bgColor: isDark ? 'bg-red-500/20' : 'bg-red-100',
        barColor: 'bg-red-500',
        circleColor: 'bg-gradient-to-br from-red-400 to-red-600',
        description: 'Significant bone loss'
      };
    }
  };

  // Get body fat category based on gender and percentage
  const getBodyFatCategory = (fatPercent: number, sex: 'Male' | 'Female' | 'Other' | null) => {
    if (!sex || sex === 'Other') return 'Unknown';
    
    if (sex === 'Male') {
      if (fatPercent >= 4 && fatPercent <= 13) return 'Athlete';
      if (fatPercent >= 14 && fatPercent <= 17) return 'Fit';
      if (fatPercent >= 18 && fatPercent <= 24) return 'Average';
      if (fatPercent >= 25 && fatPercent <= 35) return 'High';
      if (fatPercent >= 36) return 'Very high';
    } else if (sex === 'Female') {
      if (fatPercent >= 12 && fatPercent <= 20) return 'Athlete';
      if (fatPercent >= 21 && fatPercent <= 24) return 'Fit';
      if (fatPercent >= 25 && fatPercent <= 31) return 'Average';
      if (fatPercent >= 32 && fatPercent <= 42) return 'High';
      if (fatPercent >= 43) return 'Very high';
    }
    
    return 'Unknown';
  };

  const boneDensity = getBoneDensityDetails(spineTScore);
  const bodyFatCategory = bodyFatPercent ? getBodyFatCategory(bodyFatPercent, userSex) : null;

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={`text-xs tracking-wide mb-1 ${
              isDark ? 'text-white/60' : 'text-gray-500'
            }`}>
              DEXA SCAN
            </h3>
            <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
              {testDate ? new Date(testDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
              }) : 'Recent test'}
            </p>
          </div>
          <Info className={`w-4 h-4 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
        </div>

        {/* T-Score Circle */}
        <div className="flex items-center justify-center mb-6">
          <div className={`relative w-24 h-24 rounded-full ${boneDensity.circleColor} shadow-xl flex items-center justify-center`}>
            <div className="absolute inset-0 rounded-full animate-pulse opacity-50" style={{ 
              background: `radial-gradient(circle, ${boneDensity.circleColor.includes('green') ? 'rgba(74, 222, 128, 0.3)' : boneDensity.circleColor.includes('yellow') ? 'rgba(250, 204, 21, 0.3)' : 'rgba(248, 113, 113, 0.3)'} 0%, transparent 70%)`
            }}></div>
            <div className="relative flex flex-col items-center justify-center z-10">
              <span className="text-3xl font-bold text-white">
                {spineTScore >= 0 ? '+' : ''}{spineTScore.toFixed(1)}
              </span>
              <span className="text-xs text-white/80">T-score</span>
            </div>
          </div>
        </div>

        {/* Bone Density Status */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 ${boneDensity.bgColor}`}>
          <Bone className={`w-3 h-3 ${boneDensity.color}`} />
          <span className={`text-xs font-medium ${boneDensity.color}`}>
            {whoClassification || boneDensity.label}
          </span>
        </div>

        {/* Body Fat Badge */}
        {bodyFatPercent && bodyFatCategory && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ml-2 ${
            isDark ? 'bg-blue-500/20' : 'bg-blue-100'
          }`}>
            <Activity className={`w-3 h-3 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <span className={`text-xs font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {bodyFatPercent.toFixed(1)}% • {bodyFatCategory}
            </span>
          </div>
        )}

        {/* View Report Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(true);
          }}
          className={`w-full mt-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all min-h-[44px] ${
            isDark 
              ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white' 
              : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white'
          }`}
          data-testid="button-view-dexa-details"
        >
          <span className="text-sm font-medium">View Full Report</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetails(false)}
          />
          
          <div className={`relative w-full max-w-2xl max-h-[85vh] rounded-t-3xl sm:rounded-3xl border overflow-hidden ${
            isDark ? 'bg-slate-900 border-white/20' : 'bg-white border-gray-200'
          }`}>
            {/* Modal Header */}
            <div className={`sticky top-0 z-10 backdrop-blur-xl border-b px-5 py-4 ${
              isDark ? 'bg-slate-900/90 border-white/10' : 'bg-white/90 border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  DEXA Scan Details
                </h2>
                <button 
                  onClick={() => setShowDetails(false)}
                  className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                  data-testid="button-close-dexa-details"
                >
                  <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-5 space-y-5" style={{ maxHeight: 'calc(85vh - 70px)' }}>
              {/* Bone Density Summary */}
              <div className={`rounded-2xl p-5 ${
                isDark ? 'bg-white/5' : 'bg-gray-50'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${boneDensity.bgColor}`}>
                    <Bone className={`w-6 h-6 ${boneDensity.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-base font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Bone Density: {whoClassification || boneDensity.label}
                    </h3>
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      {boneDensity.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* T-Scores */}
              <div className={`rounded-2xl p-5 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  T-Scores
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        Lumbar Spine
                      </span>
                      <span className={`text-sm font-semibold ${boneDensity.color}`}>
                        {spineTScore >= 0 ? '+' : ''}{spineTScore.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  {hipTScore !== null && hipTScore !== undefined && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          Total Hip
                        </span>
                        <span className={`text-sm font-semibold ${
                          hipTScore >= -1.0 
                            ? (isDark ? 'text-green-400' : 'text-green-600')
                            : hipTScore >= -2.5
                              ? (isDark ? 'text-yellow-400' : 'text-yellow-700')
                              : (isDark ? 'text-red-400' : 'text-red-600')
                        }`}>
                          {hipTScore >= 0 ? '+' : ''}{hipTScore.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    T-scores compare your bone density to a healthy 30-year-old adult. 
                    -1.0 and above is normal, -1.0 to -2.5 indicates osteopenia, and below -2.5 indicates osteoporosis.
                  </p>
                </div>
              </div>

              {/* Body Composition */}
              {bodyFatPercent && (
                <div className={`rounded-2xl p-5 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Body Composition
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                          Body Fat Percentage
                        </span>
                        <span className={`text-sm font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                          {bodyFatPercent.toFixed(1)}%
                        </span>
                      </div>
                      {bodyFatCategory && (
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Category: {bodyFatCategory}
                        </p>
                      )}
                    </div>
                    {vatArea !== null && vatArea !== undefined && (
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                            Visceral Fat Area
                          </span>
                          <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {vatArea.toFixed(0)} cm²
                          </span>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          Visceral fat surrounds organs and is linked to metabolic health
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              <div className={`rounded-2xl p-5 ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                  General Recommendations
                </h3>
                <ul className={`text-sm space-y-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  <li>• Weight-bearing exercises strengthen bones</li>
                  <li>• Adequate calcium and vitamin D intake is essential</li>
                  <li>• Consult your doctor for personalized treatment options</li>
                  {boneDensity.label !== 'Normal' && (
                    <li>• Consider discussing medication options with your healthcare provider</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
