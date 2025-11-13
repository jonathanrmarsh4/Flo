import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { ChevronLeft, Activity, TrendingUp, TrendingDown, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function FullReport() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const [isDark] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const analysisId = params.id;

  const { data: report, isLoading, error } = useQuery<any>({
    queryKey: analysisId && analysisId !== 'latest' ? ['/api/comprehensive-report', analysisId] : ['/api/comprehensive-report'],
    queryFn: async () => {
      const url = analysisId && analysisId !== 'latest'
        ? `/api/comprehensive-report?sessionId=${analysisId}`
        : '/api/comprehensive-report';
      
      const response = await fetch(url, { credentials: 'include' });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate report');
      }
      
      return response.json();
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        <div className="text-center px-6">
          <Loader2 className={`w-12 h-12 animate-spin mx-auto mb-4 ${
            isDark ? 'text-cyan-400' : 'text-cyan-600'
          }`} />
          <h2 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Generating Your Health Report
          </h2>
          <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            Our AI is analyzing your biomarker data and creating personalized insights...
          </p>
          <p className={`text-xs mt-3 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            This may take up to 30 seconds
          </p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        <div className="text-center max-w-md">
          <AlertCircle className={`w-12 h-12 mx-auto mb-4 ${
            isDark ? 'text-red-400' : 'text-red-600'
          }`} />
          <h2 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Unable to Load Report
          </h2>
          <p className={`text-sm mb-4 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
            {error ? 'Failed to generate report' : 'No report data available'}
          </p>
          <button
            onClick={() => setLocation(analysisId ? `/insights/${analysisId}` : '/insights')}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              isDark 
                ? 'bg-cyan-500 text-white hover:bg-cyan-600' 
                : 'bg-cyan-600 text-white hover:bg-cyan-700'
            }`}
          >
            Back to Insights
          </button>
        </div>
      </div>
    );
  }

  const { 
    summary_header, 
    key_takeaways, 
    biological_age_analysis, 
    biomarker_highlights,
    biomarker_groups,
    focus_next_period,
    forecast,
    technical_summary 
  } = report;

  return (
    <div className={`min-h-screen ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setLocation(analysisId ? `/insights/${analysisId}` : '/insights')}
              className={`${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Comprehensive Health Report
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-4 pb-20">
        {/* Summary Header */}
        {summary_header && (
          <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className={`text-xl font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {summary_header.overall_health_rating || 'Good'}
                </h2>
                {summary_header.biological_age_years && (
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Biological Age: {summary_header.biological_age_years} years
                  </p>
                )}
              </div>
              <Activity className={`w-12 h-12 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            </div>
            {summary_header.badges && summary_header.badges.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {summary_header.badges.map((badge: string, idx: number) => (
                  <span key={idx} className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isDark ? 'bg-cyan-500/20 text-cyan-300' : 'bg-cyan-100 text-cyan-700'
                  }`}>
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Key Takeaways */}
        {key_takeaways && key_takeaways.length > 0 && (
          <div className="space-y-3">
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Key Takeaways
            </h3>
            {key_takeaways.map((takeaway: any, idx: number) => (
              <div key={idx} className={`backdrop-blur-xl rounded-2xl border p-4 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{takeaway.icon || '💡'}</span>
                  <div className="flex-1">
                    <h4 className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {takeaway.title}
                    </h4>
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      {takeaway.insight}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Biological Age Analysis */}
        {biological_age_analysis && biological_age_analysis.phenoage_years && (
          <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Biological Age Analysis
            </h3>
            <div className="space-y-4">
              <div>
                <p className={`text-sm mb-1 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  {biological_age_analysis.method}
                </p>
                <p className={`text-2xl font-bold ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                  {biological_age_analysis.phenoage_years} years
                </p>
              </div>
              {biological_age_analysis.ai_comment && (
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  {biological_age_analysis.ai_comment}
                </p>
              )}
              {biological_age_analysis.top_drivers && biological_age_analysis.top_drivers.length > 0 && (
                <div className="space-y-2">
                  <p className={`text-sm font-medium ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                    Top Drivers:
                  </p>
                  {biological_age_analysis.top_drivers.map((driver: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      {driver.direction === 'up' && <TrendingUp className={`w-4 h-4 ${
                        driver.impact === 'positive' ? 'text-green-500' : 'text-red-500'
                      }`} />}
                      {driver.direction === 'down' && <TrendingDown className={`w-4 h-4 ${
                        driver.impact === 'positive' ? 'text-green-500' : 'text-red-500'
                      }`} />}
                      <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        {driver.driver}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Biomarker Highlights */}
        {biomarker_highlights && biomarker_highlights.length > 0 && (
          <div className="space-y-3">
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Biomarker Highlights
            </h3>
            {biomarker_highlights.map((marker: any, idx: number) => (
              <div key={idx} className={`backdrop-blur-xl rounded-2xl border p-4 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {marker.label}
                    </h4>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      {marker.current_value} {marker.unit}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    marker.status === 'optimal' ? (isDark ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700') :
                    marker.status === 'high' || marker.status === 'borderline_high' ? (isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700') :
                    (isDark ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-100 text-yellow-700')
                  }`}>
                    {marker.status}
                  </span>
                </div>
                {marker.ai_comment && (
                  <p className={`text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    {marker.ai_comment}
                  </p>
                )}
                {marker.actions && marker.actions.length > 0 && (
                  <div className="space-y-1">
                    {marker.actions.map((action: string, actionIdx: number) => (
                      <div key={actionIdx} className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
                        • {action}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Biomarker Groups */}
        {biomarker_groups && biomarker_groups.length > 0 && (
          <div className="space-y-3">
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Biomarker Groups
            </h3>
            {biomarker_groups.map((group: any, idx: number) => (
              <div key={idx} className={`backdrop-blur-xl rounded-2xl border overflow-hidden ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
              }`}>
                <button
                  onClick={() => toggleGroup(group.group_name)}
                  className={`w-full p-4 flex items-center justify-between ${
                    isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                  }`}
                >
                  <div className="text-left">
                    <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {group.group_name}
                    </h4>
                    <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      {group.markers?.length || 0} markers
                    </p>
                  </div>
                  {expandedGroups.has(group.group_name) ? (
                    <ChevronUp className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-600'}`} />
                  ) : (
                    <ChevronDown className={`w-5 h-5 ${isDark ? 'text-white/60' : 'text-gray-600'}`} />
                  )}
                </button>
                {expandedGroups.has(group.group_name) && (
                  <div className={`p-4 border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                    {group.group_summary && (
                      <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        {group.group_summary}
                      </p>
                    )}
                    {group.markers && (
                      <div className="flex flex-wrap gap-2">
                        {group.markers.map((marker: string, markerIdx: number) => (
                          <span key={markerIdx} className={`px-2 py-1 rounded-lg text-xs ${
                            isDark ? 'bg-white/10 text-white/80' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {marker}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Focus Next Period */}
        {focus_next_period && focus_next_period.length > 0 && (
          <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Focus for Next Period
            </h3>
            <div className="space-y-3">
              {focus_next_period.map((focus: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3">
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {focus.category}
                  </span>
                  <p className={`text-sm flex-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    {focus.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forecast */}
        {forecast && forecast.ai_message && (
          <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
            isDark ? 'bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border-cyan-500/20' : 'bg-gradient-to-br from-cyan-50 to-purple-50 border-cyan-200'
          }`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Health Forecast
            </h3>
            <p className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
              {forecast.ai_message}
            </p>
          </div>
        )}

        {/* Disclaimer */}
        {technical_summary?.disclaimer && (
          <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`}>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {technical_summary.disclaimer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
