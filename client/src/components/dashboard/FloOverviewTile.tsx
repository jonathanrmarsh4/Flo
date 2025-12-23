import { TrendingDown, TrendingUp, Calendar, Sparkles, Upload, ChevronRight } from 'lucide-react';
import { WhyButton } from '../WhyButton';
import { Link } from 'wouter';

// Required biomarkers for PhenoAge calculation
const PHENOAGE_REQUIRED_BIOMARKERS = [
  'Albumin',
  'Creatinine', 
  'Glucose',
  'CRP',
  'Lymphocyte %',
  'MCV',
  'RDW',
  'Alk Phos',
  'WBC'
];

interface FloOverviewTileProps {
  isDark: boolean;
  bioAge?: number | null;
  calendarAge?: number | null;
  bioAgeDelta?: number | null;
  floScore?: number | null;
  cardiometabolic?: number | null;
  bodyComposition?: number | null;
  readiness?: number | null;
  inflammation?: number | null;
  lastCheckin?: string | null;
  missingMetrics?: string[];
  onWhyClick?: () => void;
}

export function FloOverviewTile({
  isDark,
  bioAge,
  calendarAge,
  bioAgeDelta,
  floScore,
  cardiometabolic,
  bodyComposition,
  readiness,
  inflammation,
  lastCheckin,
  missingMetrics,
  onWhyClick,
}: FloOverviewTileProps) {
  const hasMissingMetrics = missingMetrics && missingMetrics.length > 0;
  const canCalculateBioAge = bioAge !== null && bioAge !== undefined && !hasMissingMetrics;
  
  // Check if user has NO lab work at all:
  // - bioAge is null/undefined AND
  // - Either missingMetrics is null/undefined (no data returned) OR ALL 9 required biomarkers are missing
  // Note: floScore can have a value from HealthKit (readiness, etc.) even without lab work,
  // so we don't require floScore to be null for the compact banner
  // If user has partial data (some biomarkers), show the detailed view with specific missing items
  const hasNoLabWork = (
    (bioAge === null || bioAge === undefined) && 
    (!missingMetrics || missingMetrics.length === PHENOAGE_REQUIRED_BIOMARKERS.length)
  );
  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return isDark ? 'text-white/30' : 'text-gray-400';
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBadge = (score: number | null | undefined) => {
    if (score === null || score === undefined) return null;
    if (score >= 80) return { label: 'Excellent', color: isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700' };
    if (score >= 60) return { label: 'Good', color: isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700' };
    return { label: 'Needs Attention', color: isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700' };
  };

  const scoreBadge = getScoreBadge(floScore);

  // Compact banner for new users without any lab work
  if (hasNoLabWork) {
    return (
      <Link href="/upload" data-testid="tile-flo-overview-banner">
        <div 
          className={`backdrop-blur-xl rounded-2xl border p-4 transition-all cursor-pointer hover-elevate ${
            isDark 
              ? 'bg-gradient-to-r from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
              : 'bg-gradient-to-r from-purple-50 via-blue-50 to-teal-50 border-black/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              isDark ? 'bg-purple-500/20' : 'bg-purple-100'
            }`}>
              <Upload className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Discover Your Biological Age
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                Upload blood work with: {PHENOAGE_REQUIRED_BIOMARKERS.slice(0, 5).join(', ')}...
              </p>
            </div>
            <ChevronRight className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-6 transition-all ${
        isDark 
          ? 'bg-gradient-to-br from-purple-900/40 via-blue-900/40 to-teal-900/40 border-white/20' 
          : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50 border-black/10'
      }`}
      data-testid="tile-flo-overview"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <h3 className={`text-sm font-medium tracking-wide ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>
            FLŌ OVERVIEW
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {scoreBadge && (
            <span className={`text-xs px-3 py-1 rounded-full ${scoreBadge.color}`}>
              {scoreBadge.label}
            </span>
          )}
          {onWhyClick && <WhyButton onClick={onWhyClick} isDark={isDark} />}
        </div>
      </div>

      {/* Biological Age Section */}
      <div className="mb-6">
        {canCalculateBioAge ? (
          <>
            <div className={`text-xs mb-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Biological Age
            </div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className={`text-5xl ${
                bioAgeDelta && bioAgeDelta < 0 
                  ? isDark ? 'text-green-400' : 'text-green-600'
                  : isDark ? 'text-orange-400' : 'text-orange-600'
              }`} data-testid="text-bio-age">
                {bioAge}
              </span>
              <span className={`text-2xl ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                years
              </span>
              {bioAgeDelta !== null && bioAgeDelta !== undefined && bioAgeDelta !== 0 && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                  bioAgeDelta < 0 
                    ? isDark ? 'bg-green-500/20' : 'bg-green-100'
                    : isDark ? 'bg-red-500/20' : 'bg-red-100'
                }`}>
                  {bioAgeDelta < 0 ? (
                    <TrendingDown className={`w-4 h-4 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                  ) : (
                    <TrendingUp className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                  )}
                  <span className={`text-sm ${
                    bioAgeDelta < 0 
                      ? isDark ? 'text-green-400' : 'text-green-700'
                      : isDark ? 'text-red-400' : 'text-red-700'
                  }`}>
                    {Math.abs(bioAgeDelta)} yrs
                  </span>
                </div>
              )}
            </div>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {bioAgeDelta !== null && bioAgeDelta !== undefined ? (
                <>
                  vs. calendar age {calendarAge ?? '--'}
                  {bioAgeDelta !== 0 && (
                    <> • {bioAgeDelta < 0 ? 'Improved' : 'Behind'} {Math.abs(bioAgeDelta).toFixed(1)} yrs this year</>
                  )}
                  {bioAgeDelta === 0 && (
                    <> • On track with calendar age</>
                  )}
                </>
              ) : (
                <>
                  vs. calendar age {calendarAge ?? '--'}
                </>
              )}
            </div>
          </>
        ) : (
          /* Missing Metrics Bubble */
          <div className={`relative rounded-2xl border-2 p-4 overflow-hidden ${
            isDark 
              ? 'bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-cyan-500/10 border-purple-500/30' 
              : 'bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 border-purple-400/40'
          }`}>
            <div className="relative">
              <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Biological Age
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className={`text-5xl ${isDark ? 'text-purple-400/40' : 'text-purple-400/60'}`} data-testid="text-bio-age">
                    --
                  </div>
                </div>
                <div className="flex-1 mt-1">
                  <div className={`text-sm font-medium mb-2 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                    More data needed
                  </div>
                  {hasMissingMetrics && (
                    <>
                      <div className={`text-xs mb-3 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                        Upload these biomarkers to calculate:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {missingMetrics!.map((metric, index) => (
                          <div 
                            key={index}
                            className={`px-2 py-1 rounded-lg text-[10px] border ${
                              isDark 
                                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' 
                                : 'bg-purple-100 border-purple-300 text-purple-700'
                            }`}
                          >
                            {metric}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Flō Score Circle and Components */}
      <div className="grid grid-cols-2 gap-4">
        {/* Flō Score Circle */}
        <div className="flex flex-col">
          <div className={`text-xs mb-2 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Flō Score
          </div>
          <div className="relative w-28 h-28">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="50"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className={isDark ? 'text-white/10' : 'text-gray-200'}
              />
              <circle
                cx="56"
                cy="56"
                r="50"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                className={`${getScoreColor(floScore)} transition-all duration-1000`}
                strokeDasharray={`${2 * Math.PI * 50}`}
                strokeDashoffset={`${2 * Math.PI * 50 * (1 - (floScore ?? 0) / 100)}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-3xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-flo-score">
                {floScore ?? '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Components Scores */}
        <div className="space-y-2 -ml-4">
          <div className={`text-xs mb-3 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Components
          </div>
          
          <ScoreComponent
            label="Cardiometabolic"
            score={cardiometabolic}
            isDark={isDark}
          />
          <ScoreComponent
            label="Body Comp"
            score={bodyComposition}
            isDark={isDark}
          />
          <ScoreComponent
            label="Readiness"
            score={readiness}
            isDark={isDark}
          />
          <ScoreComponent
            label="Inflammation"
            score={inflammation}
            isDark={isDark}
          />
        </div>
      </div>

      {/* Last Check-in */}
      {lastCheckin && (
        <div className={`mt-6 pt-4 border-t flex items-center gap-2 text-xs ${
          isDark ? 'border-white/10 text-white/50' : 'border-gray-200 text-gray-500'
        }`}>
          <Calendar className="w-3 h-3" />
          Last full check-in: {new Date(lastCheckin).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          })} ({Math.floor((Date.now() - new Date(lastCheckin).getTime()) / (1000 * 60 * 60 * 24))}d ago)
        </div>
      )}
    </div>
  );
}

interface ScoreComponentProps {
  label: string;
  score: number | null | undefined;
  isDark: boolean;
}

function ScoreComponent({ label, score, isDark }: ScoreComponentProps) {
  const getColor = () => {
    if (score === null || score === undefined) return isDark ? 'bg-white/10' : 'bg-gray-200';
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center justify-between text-xs">
      <span className={isDark ? 'text-white/70' : 'text-gray-700'}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <div className={`h-1.5 w-16 rounded-full overflow-hidden ${
          isDark ? 'bg-white/10' : 'bg-gray-200'
        }`}>
          <div 
            className={`h-full transition-all duration-1000 ${getColor()}`}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
        <span className={`w-6 text-right ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {score ?? '--'}
        </span>
      </div>
    </div>
  );
}
