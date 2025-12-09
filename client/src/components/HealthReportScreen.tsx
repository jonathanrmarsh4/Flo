import { X, Download, Share2, Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Minus, FileText, User, Activity } from 'lucide-react';

interface HealthReportScreenProps {
  isDark: boolean;
  onClose: () => void;
  reportData?: HealthReportData;
}

export interface HealthReportData {
  patientData: {
    name: string;
    age: number;
    sex: string;
    dateOfBirth: string;
    reportDate: string;
    reportPeriod: string;
    totalBiomarkers: number;
    outOfRange: number;
    requiresAttention: number;
    overallAssessment: string;
  };
  criticalAlerts: Array<{
    marker: string;
    currentValue: number;
    unit: string;
    standardRange: string;
    optimalRange: string;
    trend: string;
    severity: string;
    lastTested: string;
    note: string;
  }>;
  biomarkerCategories: Array<{
    category: string;
    status: string;
    markers: Array<{
      name: string;
      value: number;
      unit: string;
      status: string;
      trend: string;
      change: string;
    }>;
  }>;
  correlationInsights: Array<{
    title: string;
    description: string;
    biomarkersInvolved: string[];
    clinicalRelevance: string;
  }>;
  retestRecommendations: Array<{
    marker: string;
    priority: string;
    interval: string;
    rationale: string;
  }>;
  activeInterventions: Array<{
    title: string;
    started: string;
    target: string;
    actions: string[];
    progress: string;
  }>;
}

const defaultReportData: HealthReportData = {
  patientData: {
    name: "User",
    age: 34,
    sex: "Not specified",
    dateOfBirth: "Not specified",
    reportDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    reportPeriod: "12-month analysis",
    totalBiomarkers: 0,
    outOfRange: 0,
    requiresAttention: 0,
    overallAssessment: "Comprehensive biomarker analysis will be available once you upload your blood work results."
  },
  criticalAlerts: [],
  biomarkerCategories: [],
  correlationInsights: [],
  retestRecommendations: [],
  activeInterventions: []
};

export function HealthReportScreen({ isDark, onClose, reportData }: HealthReportScreenProps) {
  const data = reportData || defaultReportData;
  const { patientData, criticalAlerts, biomarkerCategories, correlationInsights, retestRecommendations, activeInterventions } = data;

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Flō Health Summary Report',
        text: 'My personalized health summary from Flō',
      }).catch(() => {});
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'low':
      case 'critical':
        return isDark ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-red-700 bg-red-50 border-red-200';
      case 'attention':
        return isDark ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-amber-700 bg-amber-50 border-amber-200';
      case 'optimal':
      case 'good':
        return isDark ? 'text-teal-400 bg-teal-500/10 border-teal-500/30' : 'text-teal-700 bg-teal-50 border-teal-200';
      default:
        return isDark ? 'text-gray-400 bg-gray-500/10 border-gray-500/30' : 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
      case 'increasing':
        return <TrendingUp className="w-4 h-4 text-red-400" />;
      case 'down':
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-teal-400" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className={`fixed inset-0 z-50 ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className={`sticky top-0 z-10 backdrop-blur-xl border-b transition-colors print:hidden ${
        isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white/95 border-gray-200'
      }`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-xl font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Health Summary Report
              </h1>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                {patientData.reportPeriod}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                title="Share Report"
                data-testid="button-share-report"
              >
                <Share2 className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
              <button
                onClick={handleDownloadPDF}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                title="Download PDF"
                data-testid="button-download-pdf"
              >
                <Download className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                data-testid="button-close-report"
              >
                <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="overflow-y-auto pb-8" style={{ height: 'calc(100vh - 65px - env(safe-area-inset-top))' }}>
        <div className="max-w-4xl mx-auto p-4 print:p-0">
          
          <div className="hidden print:block mb-8 pb-4 border-b-2 border-gray-300">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Flō Health Summary Report</h1>
                <p className="text-sm text-gray-600">Longitudinal Biomarker Analysis</p>
              </div>
              <div className="text-right text-sm text-gray-600">
                <div>Report Date: {patientData.reportDate}</div>
                <div>Analysis Period: 12 months</div>
              </div>
            </div>
          </div>

          <section className={`rounded-2xl border p-6 mb-4 print:border-gray-300 print:rounded-none print:shadow-none ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center gap-2 mb-4">
              <User className={`w-5 h-5 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                Executive Summary
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className={`text-xs uppercase tracking-wider mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'} print:text-gray-600`}>
                  Patient Information
                </div>
                <div className={`space-y-1 ${isDark ? 'text-white/80' : 'text-gray-700'} print:text-gray-900`}>
                  <div className="flex justify-between">
                    <span className="text-sm">Name:</span>
                    <span className="text-sm font-medium">{patientData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Date of Birth:</span>
                    <span className="text-sm font-medium">{patientData.dateOfBirth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Age:</span>
                    <span className="text-sm font-medium">{patientData.age} years</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Sex:</span>
                    <span className="text-sm font-medium">{patientData.sex}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className={`text-xs uppercase tracking-wider mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'} print:text-gray-600`}>
                  Report Summary
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className={`p-3 rounded-lg border print:border-gray-300 ${isDark ? 'bg-teal-500/10 border-teal-500/30' : 'bg-teal-50 border-teal-200'}`}>
                    <div className={`text-2xl font-bold mb-1 ${isDark ? 'text-teal-400' : 'text-teal-700'} print:text-teal-700`}>
                      {patientData.totalBiomarkers}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-teal-300' : 'text-teal-600'} print:text-teal-700`}>
                      Biomarkers
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg border print:border-gray-300 ${isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                    <div className={`text-2xl font-bold mb-1 ${isDark ? 'text-amber-400' : 'text-amber-700'} print:text-amber-700`}>
                      {patientData.outOfRange}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-600'} print:text-amber-700`}>
                      Suboptimal
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg border print:border-gray-300 ${isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
                    <div className={`text-2xl font-bold mb-1 ${isDark ? 'text-red-400' : 'text-red-700'} print:text-red-700`}>
                      {patientData.requiresAttention}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-red-300' : 'text-red-600'} print:text-red-700`}>
                      Attention
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-lg border print:border-gray-300 ${isDark ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-900'} print:text-blue-900`}>
                <strong>Overall Assessment:</strong> {patientData.overallAssessment}
              </p>
            </div>
          </section>

          {criticalAlerts.length > 0 && (
            <section className={`rounded-2xl border p-6 mb-4 print:border-gray-300 print:rounded-none ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'} print:text-amber-600`} />
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                  Priority Biomarkers Requiring Attention
                </h2>
              </div>

              <div className="space-y-4">
                {criticalAlerts.map((alert, index) => (
                  <div key={index} className={`p-4 rounded-lg border print:border-gray-300 ${
                    isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                          {alert.marker}
                        </h3>
                        <div className="flex items-center gap-3 text-sm flex-wrap">
                          <span className={isDark ? 'text-white/70' : 'text-gray-600'}>
                            Current: <strong>{alert.currentValue} {alert.unit}</strong>
                          </span>
                          <span className={isDark ? 'text-white/50' : 'text-gray-500'}>|</span>
                          <span className={isDark ? 'text-white/70' : 'text-gray-600'}>
                            Optimal: {alert.optimalRange} {alert.unit}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getTrendIcon(alert.trend)}
                        <span className={`text-xs px-2 py-1 rounded ${
                          alert.severity === 'moderate' 
                            ? 'bg-amber-500/20 text-amber-300 print:bg-amber-200 print:text-amber-900' 
                            : 'bg-red-500/20 text-red-300 print:bg-red-200 print:text-red-900'
                        }`}>
                          {alert.severity}
                        </span>
                      </div>
                    </div>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'} print:text-gray-700`}>
                      {alert.note}
                    </p>
                    <div className={`mt-2 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'} print:text-gray-600`}>
                      Last tested: {alert.lastTested}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {biomarkerCategories.length > 0 && (
            <section className={`rounded-2xl border p-6 mb-4 print:border-gray-300 print:rounded-none ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <Activity className={`w-5 h-5 ${isDark ? 'text-teal-400' : 'text-teal-600'} print:text-teal-600`} />
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                  Biomarker Trends by Category
                </h2>
              </div>

              <div className="space-y-6">
                {biomarkerCategories.map((category, idx) => (
                  <div key={idx} className="print:break-inside-avoid">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                        {category.category}
                      </h3>
                      <span className={`text-xs px-2.5 py-1 rounded-full border ${getStatusColor(category.status)} print:border-gray-400`}>
                        {category.status === 'good' ? 'Good' : category.status === 'attention' ? 'Needs Attention' : 'Optimal'}
                      </span>
                    </div>
                    
                    <div className={`rounded-lg border overflow-hidden print:border-gray-300 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                      <table className="w-full text-sm">
                        <thead className={isDark ? 'bg-white/5' : 'bg-gray-50 print:bg-gray-100'}>
                          <tr>
                            <th className={`text-left p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Biomarker</th>
                            <th className={`text-right p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Current Value</th>
                            <th className={`text-center p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Trend</th>
                            <th className={`text-right p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>12-mo Change</th>
                            <th className={`text-center p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {category.markers.map((marker, mIdx) => (
                            <tr key={mIdx} className={`border-t ${isDark ? 'border-white/10' : 'border-gray-200 print:border-gray-300'}`}>
                              <td className={`p-3 ${isDark ? 'text-white/80' : 'text-gray-900'}`}>{marker.name}</td>
                              <td className={`p-3 text-right ${isDark ? 'text-white/80' : 'text-gray-900'}`}>
                                {marker.value} {marker.unit}
                              </td>
                              <td className="p-3 text-center">
                                {getTrendIcon(marker.trend)}
                              </td>
                              <td className={`p-3 text-right ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                                {marker.change}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-block w-3 h-3 rounded-full ${
                                  marker.status === 'optimal' ? 'bg-teal-500' : 
                                  marker.status === 'attention' ? 'bg-amber-500' : 
                                  'bg-red-500'
                                }`} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {correlationInsights.length > 0 && (
            <section className={`rounded-2xl border p-6 mb-4 print:border-gray-300 print:rounded-none print:break-before-page ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'} print:text-purple-600`} />
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                  AI-Powered Correlation Insights
                </h2>
              </div>
              <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'} print:text-gray-700`}>
                Multi-biomarker pattern analysis identifying clinically relevant relationships and intervention opportunities.
              </p>

              <div className="space-y-4">
                {correlationInsights.map((insight, index) => (
                  <div key={index} className={`p-4 rounded-lg border print:border-gray-300 print:break-inside-avoid ${
                    isDark ? 'bg-purple-500/5 border-purple-500/20' : 'bg-purple-50 border-purple-200'
                  }`}>
                    <h3 className={`font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                      {insight.title}
                    </h3>
                    <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'} print:text-gray-800`}>
                      {insight.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {insight.biomarkersInvolved.map((marker, mIdx) => (
                        <span key={mIdx} className={`text-xs px-2 py-1 rounded ${
                          isDark ? 'bg-white/10 text-white/70' : 'bg-white text-gray-700 border border-gray-300'
                        }`}>
                          {marker}
                        </span>
                      ))}
                    </div>
                    <div className={`text-sm p-3 rounded border-l-4 ${
                      isDark 
                        ? 'bg-purple-500/10 border-purple-500 text-purple-200' 
                        : 'bg-purple-100 border-purple-500 text-purple-900'
                    } print:bg-purple-100 print:text-purple-900 print:border-purple-500`}>
                      <strong>Clinical Relevance:</strong> {insight.clinicalRelevance}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeInterventions.length > 0 && (
            <section className={`rounded-2xl border p-6 mb-4 print:border-gray-300 print:rounded-none ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className={`w-5 h-5 ${isDark ? 'text-teal-400' : 'text-teal-600'} print:text-teal-600`} />
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                  Active Patient Interventions
                </h2>
              </div>
              <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'} print:text-gray-700`}>
                Patient is actively engaged in health optimization with the following tracked interventions:
              </p>

              <div className="space-y-3">
                {activeInterventions.map((intervention, index) => (
                  <div key={index} className={`p-4 rounded-lg border print:border-gray-300 ${
                    isDark ? 'bg-teal-500/5 border-teal-500/20' : 'bg-teal-50 border-teal-200'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                        {intervention.title}
                      </h3>
                      <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'} print:text-gray-700`}>
                        Started {intervention.started}
                      </span>
                    </div>
                    <div className={`text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      <strong>Target:</strong> {intervention.target}
                    </div>
                    <ul className={`text-sm space-y-1 mb-2 ${isDark ? 'text-white/60' : 'text-gray-600'} print:text-gray-700`}>
                      {intervention.actions.map((action, aIdx) => (
                        <li key={aIdx} className="flex items-start gap-2">
                          <span className={isDark ? 'text-teal-400' : 'text-teal-600'}>•</span>
                          {action}
                        </li>
                      ))}
                    </ul>
                    <div className={`text-xs ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                      {intervention.progress}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {retestRecommendations.length > 0 && (
            <section className={`rounded-2xl border p-6 mb-4 print:border-gray-300 print:rounded-none ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'} print:text-blue-600`} />
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} print:text-gray-900`}>
                  Recommended Retest Schedule
                </h2>
              </div>

              <div className={`rounded-lg border overflow-hidden print:border-gray-300 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                <table className="w-full text-sm">
                  <thead className={isDark ? 'bg-white/5' : 'bg-gray-50 print:bg-gray-100'}>
                    <tr>
                      <th className={`text-left p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Biomarker</th>
                      <th className={`text-center p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Priority</th>
                      <th className={`text-center p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Retest In</th>
                      <th className={`text-left p-3 ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retestRecommendations.map((retest, index) => (
                      <tr key={index} className={`border-t ${isDark ? 'border-white/10' : 'border-gray-200 print:border-gray-300'}`}>
                        <td className={`p-3 ${isDark ? 'text-white/80' : 'text-gray-900'}`}>{retest.marker}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded ${
                            retest.priority === 'High' 
                              ? 'bg-red-500/20 text-red-400 print:bg-red-200 print:text-red-900' 
                              : retest.priority === 'Moderate'
                              ? 'bg-amber-500/20 text-amber-400 print:bg-amber-200 print:text-amber-900'
                              : 'bg-teal-500/20 text-teal-400 print:bg-teal-200 print:text-teal-900'
                          }`}>
                            {retest.priority}
                          </span>
                        </td>
                        <td className={`p-3 text-center ${isDark ? 'text-white/80' : 'text-gray-900'}`}>
                          {retest.interval}
                        </td>
                        <td className={`p-3 ${isDark ? 'text-white/60' : 'text-gray-600'} print:text-gray-700`}>
                          {retest.rationale}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className={`rounded-2xl border p-6 print:border-gray-300 print:rounded-none ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <FileText className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'} print:text-gray-600`} />
              <h3 className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-gray-600'} print:text-gray-900`}>
                Report Information
              </h3>
            </div>
            <div className={`text-xs space-y-2 ${isDark ? 'text-white/50' : 'text-gray-500'} print:text-gray-700`}>
              <p>
                <strong>Data Source:</strong> This report aggregates laboratory results from certified clinical laboratories. 
                Test methodologies and reference ranges are laboratory-specific and indicated on original lab reports.
              </p>
              <p>
                <strong>AI Insights:</strong> Correlation analysis is generated using Flō's proprietary AI health correlation engine. 
                Insights are based on peer-reviewed longevity research and should be considered alongside clinical judgment.
              </p>
              <p>
                <strong>Optimal Ranges:</strong> Flō uses longevity-optimized reference ranges that may differ from standard laboratory 
                ranges. These are based on current longevity research and represent targets associated with healthspan optimization.
              </p>
              <p>
                <strong>Disclaimer:</strong> This report is for informational purposes only and does not constitute medical advice, 
                diagnosis, or treatment. All medical decisions should be made in consultation with qualified healthcare providers. 
                Flō is not intended for diagnostic purposes or emergency medical situations.
              </p>
              <p className="pt-2 border-t border-current">
                <strong>Generated:</strong> {patientData.reportDate} | <strong>Flō by Nuvitae Health</strong> | www.get-flo.com
              </p>
            </div>
          </section>

        </div>
      </main>

      <style>{`
        @media print {
          @page {
            margin: 0.75in;
            size: letter;
          }
          
          body {
            background: white !important;
            color: black !important;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:block {
            display: block !important;
          }
          
          .print\\:break-before-page {
            break-before: page;
          }
          
          .print\\:break-inside-avoid {
            break-inside: avoid;
          }
          
          .print\\:border-gray-300 {
            border-color: #d1d5db !important;
          }
          
          .print\\:text-gray-900 {
            color: #111827 !important;
          }
          
          .print\\:text-gray-700 {
            color: #374151 !important;
          }
          
          .print\\:text-gray-600 {
            color: #4b5563 !important;
          }
          
          .print\\:bg-gray-100 {
            background-color: #f3f4f6 !important;
          }
          
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
          
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          
          .hidden.print\\:block {
            display: block !important;
          }
          
          table {
            break-inside: avoid;
          }
          
          tr {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
