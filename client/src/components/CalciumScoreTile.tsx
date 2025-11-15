import { ArrowRight, TrendingDown, Info, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { UnifiedUploadModal } from './UnifiedUploadModal';

interface CalciumScoreTileProps {
  isDark: boolean;
  score?: number | null;
  riskLevel?: string | null;
  percentile?: number | null;
  testDate?: string | null;
}

export function CalciumScoreTile({ 
  isDark, 
  score,
  riskLevel,
  percentile,
  testDate
}: CalciumScoreTileProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // If no score, show upload state
  if (score === null || score === undefined) {
    return (
      <>
        <div 
          className={`backdrop-blur-xl rounded-3xl border p-5 transition-all hover-elevate ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}
          data-testid="tile-calcium-score"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={`text-xs tracking-wide mb-1 ${
                isDark ? 'text-white/60' : 'text-gray-500'
              }`}>
                CALCIUM SCORE
              </h3>
              <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                Coronary artery calcification
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
              data-testid="button-upload-calcium-score"
            >
              <Upload className="w-4 h-4" />
              Upload CAC Scan
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

  // Determine risk category details
  const getRiskDetails = () => {
    if (score === 0) {
      return {
        label: 'Minimal',
        color: isDark ? 'text-green-400' : 'text-green-600',
        bgColor: isDark ? 'bg-green-500/20' : 'bg-green-100',
        barColor: 'bg-green-500',
        circleColor: 'bg-gradient-to-br from-green-400 to-green-600',
        description: 'Very low risk of heart disease'
      };
    } else if (score < 100) {
      return {
        label: 'Low',
        color: isDark ? 'text-green-400' : 'text-green-600',
        bgColor: isDark ? 'bg-green-500/20' : 'bg-green-100',
        barColor: 'bg-green-500',
        circleColor: 'bg-gradient-to-br from-green-400 to-green-600',
        description: 'Low risk of heart disease'
      };
    } else if (score < 400) {
      return {
        label: 'Moderate',
        color: isDark ? 'text-yellow-400' : 'text-yellow-700',
        bgColor: isDark ? 'bg-yellow-500/20' : 'bg-yellow-100',
        barColor: 'bg-yellow-500',
        circleColor: 'bg-gradient-to-br from-yellow-400 to-yellow-600',
        description: 'Moderate risk of heart disease'
      };
    } else {
      return {
        label: 'High',
        color: isDark ? 'text-red-400' : 'text-red-600',
        bgColor: isDark ? 'bg-red-500/20' : 'bg-red-100',
        barColor: 'bg-red-500',
        circleColor: 'bg-gradient-to-br from-red-400 to-red-600',
        description: 'High risk of heart disease'
      };
    }
  };

  const risk = getRiskDetails();
  const displayPercentile = percentile !== null && percentile !== undefined ? percentile : null;

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
        data-testid="tile-calcium-score"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={`text-xs tracking-wide mb-1 ${
              isDark ? 'text-white/60' : 'text-gray-500'
            }`}>
              CALCIUM SCORE
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

        {/* Score Circle */}
        <div className="flex items-center justify-center mb-6">
          <div className={`relative w-24 h-24 rounded-full ${risk.circleColor} shadow-xl flex items-center justify-center`}>
            <div className="absolute inset-0 rounded-full animate-pulse opacity-50" style={{ 
              background: `radial-gradient(circle, ${risk.circleColor.includes('green') ? 'rgba(74, 222, 128, 0.3)' : risk.circleColor.includes('yellow') ? 'rgba(250, 204, 21, 0.3)' : 'rgba(248, 113, 113, 0.3)'} 0%, transparent 70%)`
            }}></div>
            <span className="relative text-4xl font-bold text-white z-10">
              {score}
            </span>
          </div>
        </div>

        {/* Risk Level */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 ${risk.bgColor}`}>
          <div className={`w-2 h-2 rounded-full ${risk.barColor}`}></div>
          <span className={`text-xs font-medium ${risk.color}`}>
            Risk: {risk.label}
          </span>
        </div>

        {/* Percentile Bar */}
        {displayPercentile !== null && (
          <>
            <div className="mb-3">
              <div className={`h-2 rounded-full overflow-hidden ${
                isDark ? 'bg-white/10' : 'bg-gray-200'
              }`}>
                <div 
                  className={`h-full ${risk.barColor} transition-all duration-1000 ease-out`}
                  style={{ width: `${displayPercentile}%` }}
                ></div>
              </div>
            </div>

            {/* Percentile Text */}
            <div>
              <p className={`text-xs mb-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                Age-Matched Percentile
              </p>
              <p className={`text-[10px] ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                You're lower than {displayPercentile}% of people your age
              </p>
            </div>
          </>
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
          data-testid="button-view-calcium-details"
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
                  Calcium Score Details
                </h2>
                <button 
                  onClick={() => setShowDetails(false)}
                  className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                  data-testid="button-close-calcium-details"
                >
                  <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-5 space-y-5" style={{ maxHeight: 'calc(85vh - 70px)' }}>
              {/* Score Summary */}
              <div className={`rounded-2xl p-5 ${
                isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-16 h-16 rounded-full ${risk.circleColor} shadow-lg flex items-center justify-center`}>
                    <span className="text-2xl font-bold text-white">{score}</span>
                  </div>
                  <div>
                    <h3 className={`mb-1 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Your Score: {score}
                    </h3>
                    <p className={`text-sm ${risk.color}`}>
                      {risk.description}
                    </p>
                  </div>
                </div>
                
                <div className={`text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Your coronary calcium score measures the amount of calcium in the walls of your coronary arteries. 
                  This test helps assess your risk of developing heart disease and can guide preventive care strategies.
                </div>
              </div>

              {/* Risk Categories */}
              <div>
                <h3 className={`text-sm mb-3 font-medium ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  Understanding Your Score
                </h3>
                <div className="space-y-2">
                  <RiskCategory 
                    range="0"
                    label="Minimal"
                    description="No evidence of coronary artery disease"
                    color="green"
                    isDark={isDark}
                    isActive={score === 0}
                  />
                  <RiskCategory 
                    range="1-99"
                    label="Low"
                    description="Mild coronary artery disease"
                    color="green"
                    isDark={isDark}
                    isActive={score >= 1 && score < 100}
                  />
                  <RiskCategory 
                    range="100-399"
                    label="Moderate"
                    description="Moderate coronary artery disease"
                    color="yellow"
                    isDark={isDark}
                    isActive={score >= 100 && score < 400}
                  />
                  <RiskCategory 
                    range="400+"
                    label="High"
                    description="Severe coronary artery disease"
                    color="red"
                    isDark={isDark}
                    isActive={score >= 400}
                  />
                </div>
              </div>

              {/* Recommendations */}
              <div className={`rounded-2xl p-5 ${
                isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
              }`}>
                <h3 className={`text-sm mb-3 flex items-center gap-2 font-medium ${
                  isDark ? 'text-blue-300' : 'text-blue-900'
                }`}>
                  <TrendingDown className="w-4 h-4" />
                  Recommendations
                </h3>
                <ul className={`space-y-2 text-xs ${isDark ? 'text-blue-100' : 'text-blue-800'}`}>
                  <li>• Continue regular cardiovascular exercise (150 min/week)</li>
                  <li>• Maintain a heart-healthy diet rich in omega-3 fatty acids</li>
                  <li>• Monitor blood pressure and cholesterol levels regularly</li>
                  <li>• Consider statin therapy if recommended by your doctor</li>
                  <li>• Schedule follow-up scan in 3-5 years</li>
                </ul>
              </div>

              {/* Disclaimer */}
              <div className={`text-[10px] p-3 rounded-xl ${
                isDark ? 'bg-white/5 text-white/40' : 'bg-gray-100 text-gray-500'
              }`}>
                ⚠️ This information is for educational purposes only. Always consult with your healthcare provider 
                to interpret your calcium score and develop an appropriate treatment plan.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface RiskCategoryProps {
  range: string;
  label: string;
  description: string;
  color: 'green' | 'yellow' | 'red';
  isDark: boolean;
  isActive?: boolean;
}

function RiskCategory({ range, label, description, color, isDark, isActive }: RiskCategoryProps) {
  const colorClasses = {
    green: {
      bg: isDark ? 'bg-green-500/10' : 'bg-green-50',
      border: isDark ? 'border-green-500/30' : 'border-green-200',
      text: isDark ? 'text-green-400' : 'text-green-700',
      dot: 'bg-green-500'
    },
    yellow: {
      bg: isDark ? 'bg-yellow-500/10' : 'bg-yellow-50',
      border: isDark ? 'border-yellow-500/30' : 'border-yellow-200',
      text: isDark ? 'text-yellow-400' : 'text-yellow-700',
      dot: 'bg-yellow-500'
    },
    red: {
      bg: isDark ? 'bg-red-500/10' : 'bg-red-50',
      border: isDark ? 'border-red-500/30' : 'border-red-200',
      text: isDark ? 'text-red-400' : 'text-red-700',
      dot: 'bg-red-500'
    }
  };

  const colors = colorClasses[color];

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
            <span className={`text-sm font-medium ${
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
