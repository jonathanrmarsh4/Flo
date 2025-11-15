import { useState } from 'react';
import { Heart, Calendar, TrendingUp, Upload } from 'lucide-react';
import { CalciumScoreUploadModal } from './CalciumScoreUploadModal';

interface CalciumScoreTileProps {
  isDark: boolean;
  score?: number | null;
  riskLevel?: string | null;
  testDate?: string | null;
}

export function CalciumScoreTile({ 
  isDark, 
  score,
  riskLevel,
  testDate
}: CalciumScoreTileProps) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const getRiskColor = (risk: string) => {
    switch(risk.toLowerCase()) {
      case 'minimal':
      case 'low':
        return isDark ? 'text-green-400' : 'text-green-600';
      case 'moderate':
        return isDark ? 'text-yellow-400' : 'text-yellow-600';
      case 'moderately high':
      case 'high':
        return isDark ? 'text-orange-400' : 'text-orange-600';
      case 'very high':
        return isDark ? 'text-red-400' : 'text-red-600';
      default:
        return isDark ? 'text-gray-400' : 'text-gray-600';
    }
  };

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-5 transition-all hover-elevate ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}
      data-testid="tile-calcium-score"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isDark ? 'bg-red-500/20' : 'bg-red-100'
          }`}>
            <Heart className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
          </div>
          <div>
            <h3 className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Calcium Score (CAC)
            </h3>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Coronary artery calcification
            </p>
          </div>
        </div>
      </div>

      {score !== null && score !== undefined ? (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
              <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Score
              </span>
            </div>
            <p className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {score}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <Heart className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
              <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Risk
              </span>
            </div>
            <p className={`text-sm font-semibold ${getRiskColor(riskLevel || 'unknown')}`}>
              {riskLevel || 'Unknown'}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <Calendar className={`w-3 h-3 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
              <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Date
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              {testDate || 'Not available'}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <p className={`text-sm mb-3 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            No test data available
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
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
      )}

      {showUploadModal && (
        <CalciumScoreUploadModal 
          isDark={isDark}
          onClose={() => setShowUploadModal(false)}
        />
      )}
    </div>
  );
}
