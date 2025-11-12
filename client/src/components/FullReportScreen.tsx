import { ArrowDown, ArrowUp, TrendingUp, TrendingDown, Award, Target, Activity, Flame, Heart, Zap, Brain, Droplet, Sparkles, ChevronRight, ChevronDown, Share2, Download, AlertTriangle, LucideIcon, Apple, Pill, Sun, Moon, FileText } from 'lucide-react';
import { useState } from 'react';
import type { BiologicalAgeData } from './InsightsScreen';

// Icon mapping for dynamic icon rendering
const ICON_MAP: Record<string, LucideIcon> = {
  'AlertTriangle': AlertTriangle,
  'TrendingUp': TrendingUp,
  'Flame': Flame,
  'Activity': Activity,
  'Heart': Heart,
  'Droplet': Droplet,
  'Zap': Zap,
  'Brain': Brain,
  'Target': Target,
  'Apple': Apple,
  'Pill': Pill,
  'Sun': Sun,
  'Stethoscope': Heart,
  'Dumbbell': Zap,
  'Moon': Moon,
  'FileText': FileText
};

function renderIcon(iconName: string, className?: string) {
  const IconComponent = ICON_MAP[iconName] || Activity;
  return <IconComponent className={className} />;
}

export interface FullReportData {
  generated_at: string;
  summary_header: {
    biological_age_years: number;
    chronological_age_years: number;
    bioage_trend_years_since_last: number;
    overall_health_rating: string;
    badges: string[];
  };
  key_takeaways: Array<{
    icon: string;
    title: string;
    insight: string;
    cta: string;
  }>;
  biological_age_analysis: {
    method: string;
    phenoage_years: number;
    delta_years_since_last: number;
    percentile_vs_peers: number;
    top_drivers: Array<{
      driver: string;
      direction: string;
      impact: string;
    }>;
    ai_comment: string;
  };
  biomarker_highlights: Array<any>;
  focus_next_period: Array<{
    category: string;
    message: string;
  }>;
  forecast: {
    bioage_6mo: number;
    bioage_12mo: number;
    bioage_projected_change_years_to_next_test: number;
    ai_message: string;
    confidence?: number;
    assumptions?: string[];
  };
  technical_summary: {
    method: string;
    data_quality: number;
    sample_date: string;
    data_date_range: {
      start: string;
      end: string;
    };
    biomarkers_used_count: number;
    calculation_notes: string;
    markers_analyzed?: number;
    references: Array<{
      title: string;
      url: string;
      year: number;
    }>;
    disclaimer: string;
  };
}

interface FullReportScreenProps {
  isDark: boolean;
  onClose: () => void;
  reportData?: FullReportData;
}

export function FullReportScreen({ isDark, onClose, reportData: providedData }: FullReportScreenProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    technical: false,
    biomarkerGroups: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Use provided data or fallback to mock data
  const report = providedData ?? {
    generated_at: new Date().toISOString(),
    summary_header: {
      biological_age_years: 46,
      chronological_age_years: 49.2,
      bioage_trend_years_since_last: -0.8,
      overall_health_rating: "Improving",
      badges: ["Heart Healthy", "Strong Recovery", "Optimal Metabolism"]
    },
    key_takeaways: [
      {
        icon: "Flame",
        title: "Inflammation Down 23%",
        insight: "Your CRP and IL-6 markers show significant improvement, indicating reduced systemic inflammation and better recovery capacity.",
        cta: "view_detail:inflammation"
      },
      {
        icon: "TrendingUp",
        title: "Metabolic Health Improved",
        insight: "HbA1c trending toward optimal range. Your insulin sensitivity is improving with current diet interventions.",
        cta: "view_detail:metabolic"
      },
      {
        icon: "AlertTriangle",
        title: "LDL Needs Attention",
        insight: "LDL cholesterol has increased 14% over 6 months. Consider adding more soluble fiber and reducing saturated fat intake.",
        cta: "view_detail:lipids"
      }
    ],
    biological_age_analysis: {
      method: "PhenoAge (Levine 2018)",
      phenoage_years: 46,
      delta_years_since_last: -0.8,
      percentile_vs_peers: 72,
      top_drivers: [
        { driver: "Albumin", direction: "optimal", impact: "positive" },
        { driver: "Creatinine", direction: "optimal", impact: "positive" },
        { driver: "Glucose", direction: "up", impact: "negative" },
        { driver: "CRP", direction: "down", impact: "positive" },
        { driver: "Lymphocyte %", direction: "optimal", impact: "positive" }
      ],
      ai_comment: "Your biological age continues to decrease, driven primarily by improvements in inflammatory markers and kidney function. The slight rise in glucose warrants monitoring but remains within normal range."
    },
    biomarker_highlights: [
      {
        marker_code: "LDL",
        label: "LDL Cholesterol",
        icon: "Heart",
        current_value: 135,
        unit: "mg/dL",
        reference_range: { low: 0, high: 100, unit: "mg/dL" },
        trend: { direction: "up", percent_change: 14, since: "2025-05-12" },
        status: "borderline_high",
        ai_comment: "LDL has risen above optimal. Focus on soluble fiber (oats, beans) and consider omega-3 supplementation.",
        actions: ["Increase soluble fiber intake", "Add 2g omega-3 daily", "Reduce saturated fat"],
        confidence: 0.92
      },
      {
        marker_code: "HbA1c",
        label: "HbA1c",
        icon: "Activity",
        current_value: 5.4,
        unit: "%",
        reference_range: { low: 4.0, high: 5.6, unit: "%" },
        trend: { direction: "up", percent_change: 3, since: "2025-05-12" },
        status: "normal",
        ai_comment: "Trending upward but still normal. Monitor carbohydrate timing around workouts to optimize insulin sensitivity.",
        actions: ["Time carbs post-workout", "Increase protein at breakfast", "Add resistance training"],
        confidence: 0.88
      },
      {
        marker_code: "VitD",
        label: "Vitamin D",
        icon: "Sun",
        current_value: 32,
        unit: "ng/mL",
        reference_range: { low: 30, high: 100, unit: "ng/mL" },
        trend: { direction: "down", percent_change: -7, since: "2025-05-12" },
        status: "borderline_low",
        ai_comment: "Borderline low. Aim for 50-80 ng/mL for optimal immune and bone health.",
        actions: ["Supplement 4000 IU D3 daily", "15 min sun exposure midday", "Retest in 8 weeks"],
        confidence: 0.95
      },
      {
        marker_code: "CRP",
        label: "C-Reactive Protein",
        icon: "Flame",
        current_value: 0.8,
        unit: "mg/L",
        reference_range: { low: 0, high: 3.0, unit: "mg/L" },
        trend: { direction: "down", percent_change: -23, since: "2025-05-12" },
        status: "optimal",
        ai_comment: "Excellent! Low inflammation correlates with reduced cardiovascular risk. Keep current lifestyle.",
        actions: ["Maintain omega-3 intake", "Continue regular exercise", "Prioritize sleep quality"],
        confidence: 0.97
      },
      {
        marker_code: "Testosterone",
        label: "Total Testosterone",
        icon: "Zap",
        current_value: 620,
        unit: "ng/dL",
        reference_range: { low: 300, high: 1000, unit: "ng/dL" },
        trend: { direction: "stable", percent_change: 2, since: "2025-05-12" },
        status: "optimal",
        ai_comment: "Well-optimized for your age. Continue strength training and adequate sleep for maintenance.",
        actions: ["Maintain sleep 7-8h", "Heavy compound lifts 3x/week", "Manage stress"],
        confidence: 0.90
      }
    ],
    biomarker_groups: [
      {
        group_name: "Lipid",
        markers: ["LDL", "HDL", "Triglycerides", "Total Cholesterol"],
        group_summary: "Lipid panel shows mixed results. LDL elevated, but HDL remains strong. Focus on dietary fiber."
      },
      {
        group_name: "Metabolic",
        markers: ["HbA1c", "Glucose", "Insulin"],
        group_summary: "Metabolic markers trending in right direction. Continue low-glycemic approach."
      },
      {
        group_name: "Inflammation",
        markers: ["CRP", "IL-6", "ESR"],
        group_summary: "Inflammation markers excellent. This is a major driver of your improved biological age."
      }
    ],
    focus_next_period: [
      { category: "nutrition", message: "Increase soluble fiber to 10g/day minimum. Add psyllium husk or oat bran." },
      { category: "supplementation", message: "Start Vitamin D3 4000 IU daily. Consider omega-3 (2g EPA+DHA)." },
      { category: "lifestyle", message: "Maintain current exercise routine. Add 15 min daily sun exposure." },
      { category: "medical_followup", message: "Retest lipids in 3 months after dietary changes." }
    ],
    forecast: {
      bioage_projected_change_years_to_next_test: -0.5,
      ai_message: "Based on current trends, if you address LDL and maintain inflammation improvements, your biological age could decrease another 6 months by your next test in 3 months."
    },
    technical_summary: {
      data_date_range: { start: "2024-11-12", end: "2025-11-12" },
      biomarkers_used_count: 9,
      biomarkers_used_list: ["Albumin", "Creatinine", "Glucose", "CRP", "Lymphocyte %", "MCV", "RDW", "ALP", "WBC"],
      calculation_notes: "Units normalized; outliers handled using robust z-score method.",
      references: [
        { title: "Levine ME et al. (2018) An epigenetic biomarker of aging for lifespan and healthspan", year: 2018, note: "PhenoAge method reference" },
        { title: "Belsky DW et al. (2015) Quantification of biological aging in young adults", year: 2015, note: "Pace of aging framework" }
      ],
      disclaimer: "Educational use only; not medical advice. Consult qualified healthcare providers before making health decisions."
    }
  };

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
            <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Full AI Report</h1>
            <button className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}>
              <Share2 className={`w-4 h-4 ${isDark ? 'text-white' : 'text-gray-900'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-4">
        {/* Summary Header */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="text-center mb-4">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 ${
              isDark ? 'bg-green-500/20' : 'bg-green-100'
            }`}>
              <TrendingUp className={`w-4 h-4 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              <span className={`text-sm ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                {report.summary_header.overall_health_rating}
              </span>
            </div>
            
            <div className={`text-4xl mb-2 bg-gradient-to-br from-teal-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent`} style={{ fontWeight: 600 }}>
              Bio Age: {report.summary_header.biological_age_years}
            </div>
            
            <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {Math.abs(report.summary_header.bioage_trend_years_since_last).toFixed(1)} years younger since last test
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            {report.summary_header.badges.map((badge, idx) => (
              <div 
                key={idx}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${
                  isDark ? 'bg-white/10 text-white/80' : 'bg-gray-100 text-gray-700'
                }`}
              >
                <Award className="w-3 h-3" />
                {badge}
              </div>
            ))}
          </div>
        </div>

        {/* Key Takeaways */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Key Takeaways
          </h2>
          
          <div className="space-y-3">
            {report.key_takeaways.map((takeaway, idx) => (
              <div 
                key={idx}
                className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {renderIcon(takeaway.icon, `w-6 h-6 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`)}
                  <div className="flex-1">
                    <div className={`mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {takeaway.title}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      {takeaway.insight}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Biological Age Analysis */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="flex items-start gap-3 mb-4">
            <div className={`p-2 rounded-xl ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <Brain className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div>
              <h2 className={`text-xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Biological Age Analysis
              </h2>
              <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                {report.biological_age_analysis.method}
              </div>
            </div>
          </div>

          {/* Percentile */}
          <div className={`p-4 rounded-2xl mb-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
            <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Better than {report.biological_age_analysis.percentile_vs_peers}% of peers
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 rounded-full transition-all"
                style={{ width: `${report.biological_age_analysis.percentile_vs_peers}%` }}
              ></div>
            </div>
          </div>

          {/* Top Drivers */}
          <div className="space-y-2 mb-4">
            <div className={`text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Top Age Drivers:
            </div>
            {report.biological_age_analysis.top_drivers.map((driver, idx) => (
              <div 
                key={idx}
                className="flex items-center justify-between"
              >
                <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                  {driver.driver}
                </span>
                <div className="flex items-center gap-2">
                  {driver.direction === 'up' && <ArrowUp className={`w-3 h-3 ${driver.impact === 'positive' ? 'text-green-500' : 'text-red-500'}`} />}
                  {driver.direction === 'down' && <ArrowDown className={`w-3 h-3 ${driver.impact === 'positive' ? 'text-green-500' : 'text-red-500'}`} />}
                  {driver.direction === 'optimal' && <span className="text-green-500">✓</span>}
                  <span className={`text-xs ${
                    driver.impact === 'positive' ? 'text-green-500' :
                    driver.impact === 'negative' ? 'text-red-500' : 'text-gray-500'
                  }`}>
                    {driver.direction}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
            <p className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              {report.biological_age_analysis.ai_comment}
            </p>
          </div>
        </div>

        {/* Biomarker Highlights */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Biomarker Highlights
          </h2>

          <div className="space-y-3">
            {report.biomarker_highlights.map((marker, idx) => {
              const isHigh = marker.status.includes('high');
              const isLow = marker.status.includes('low');
              const isOptimal = marker.status === 'optimal';
              
              return (
                <div 
                  key={idx}
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {renderIcon(marker.icon, `w-6 h-6 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`)}
                      <div>
                        <div className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {marker.label}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {marker.current_value} {marker.unit}
                        </div>
                      </div>
                    </div>
                    
                    <div className={`px-2 py-1 rounded-lg text-xs ${
                      isOptimal ? (isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700') :
                      isHigh || isLow ? (isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700') :
                      isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {marker.trend.direction} {Math.abs(marker.trend.percent_change)}%
                    </div>
                  </div>

                  <div className={`text-xs mb-3 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    {marker.ai_comment}
                  </div>

                  {marker.actions.length > 0 && (
                    <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        Recommended Actions:
                      </div>
                      <div className="space-y-1">
                        {marker.actions.map((action: string, aidx: number) => (
                          <div key={aidx} className={`text-xs flex items-start gap-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                            <span className="text-cyan-500">•</span>
                            <span>{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Focus Next Period */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <Target className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Focus Next Period
            </h2>
          </div>

          <div className="space-y-3">
            {report.focus_next_period.map((focus, idx) => {
              const categoryIcons: Record<string, string> = {
                nutrition: 'Apple',
                supplementation: 'Pill',
                lifestyle: 'Sun',
                medical_followup: 'Stethoscope',
                training: 'Dumbbell',
                recovery: 'Moon'
              };
              const categoryIconName = categoryIcons[focus.category] || 'FileText';

              return (
                <div 
                  key={idx}
                  className={`p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}
                >
                  <div className="flex items-start gap-3">
                    {renderIcon(categoryIconName, `w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`)}
                    <div>
                      <div className={`text-sm mb-1 capitalize ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                        {focus.category.replace('_', ' ')}
                      </div>
                      <div className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                        {focus.message}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Forecast */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 relative overflow-hidden ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Forecast
              </h2>
            </div>

            <div className={`p-4 rounded-2xl mb-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`text-3xl bg-gradient-to-br from-purple-400 to-blue-400 bg-clip-text text-transparent`} style={{ fontWeight: 600 }}>
                  -{Math.abs(report.forecast.bioage_projected_change_years_to_next_test).toFixed(1)} years
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  projected by next test
                </div>
              </div>
            </div>

            <div className={`text-xs ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              {report.forecast.ai_message}
            </div>
          </div>
        </div>

        {/* Technical Summary (Collapsible) */}
        <div className={`backdrop-blur-xl rounded-3xl border overflow-hidden ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`}>
          <button 
            onClick={() => toggleSection('technical')}
            className="w-full p-6 flex items-center justify-between"
          >
            <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Technical Summary
            </h2>
            <ChevronDown className={`w-5 h-5 transition-transform ${
              expandedSections.technical ? 'rotate-180' : ''
            } ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
          </button>

          {expandedSections.technical && (
            <div className="px-6 pb-6">
              <div className={`p-4 rounded-2xl mb-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Data Range: {new Date(report.technical_summary.data_date_range.start).toLocaleDateString()} - {new Date(report.technical_summary.data_date_range.end).toLocaleDateString()}
                </div>
                <div className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Biomarkers Used: {report.technical_summary.biomarkers_used_count}
                </div>
                <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  {report.technical_summary.calculation_notes}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className={`text-xs ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  References:
                </div>
                {report.technical_summary.references.map((ref, idx) => (
                  <div key={idx} className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    • {ref.title} ({ref.year})
                  </div>
                ))}
              </div>

              <div className={`p-3 rounded-xl text-xs ${isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
                ⚠️ {report.technical_summary.disclaimer}
              </div>
            </div>
          )}
        </div>

        {/* Powered By */}
        <div className={`text-center py-4 text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
          Powered by Flō AI • insights-v1.2
        </div>
      </div>
    </div>
  );
}
