import type { AnalysisResult } from "@shared/schema";
import { BIOMARKER_CONFIGS, CATEGORIES, type BiomarkerConfig } from './biomarker-config';

export interface BiomarkerReading {
  id: string;
  biomarker: string;
  value: number;
  date: string;
}

export { BIOMARKER_CONFIGS, CATEGORIES, type BiomarkerConfig };

export function mapAnalysisToBiomarkerReadings(
  analysis: AnalysisResult | undefined
): BiomarkerReading[] {
  if (!analysis || !analysis.metrics) return [];

  const readings: BiomarkerReading[] = [];
  const metricsData = typeof analysis.metrics === 'string' 
    ? JSON.parse(analysis.metrics) 
    : analysis.metrics;

  Object.entries(metricsData).forEach(([biomarker, value]) => {
    if (typeof value === 'number' && BIOMARKER_CONFIGS[biomarker]) {
      readings.push({
        id: `${analysis.id}-${biomarker}`,
        biomarker,
        value,
        date: analysis.createdAt instanceof Date 
          ? analysis.createdAt.toISOString() 
          : (analysis.createdAt || new Date().toISOString()),
      });
    }
  });

  return readings;
}

export function getBiologicalAgeData(analysis: AnalysisResult | undefined): {
  biologicalAge: number;
  chronologicalAge: number;
  ageDifference: number;
} {
  if (!analysis) {
    return {
      biologicalAge: 0,
      chronologicalAge: 0,
      ageDifference: 0,
    };
  }

  const biologicalAge = typeof analysis.biologicalAge === 'number' 
    ? analysis.biologicalAge 
    : (typeof analysis.biologicalAge === 'string' 
      ? parseFloat(analysis.biologicalAge) 
      : 0);
  const chronologicalAge = 50;
  
  return {
    biologicalAge,
    chronologicalAge,
    ageDifference: chronologicalAge - biologicalAge,
  };
}

export function getTopBiomarkersToImprove(
  readings: BiomarkerReading[]
): Array<{
  name: string;
  change: string;
  trend: 'up' | 'down';
  color: 'red' | 'amber' | 'yellow';
  sparkline: number[];
  benefit: string;
}> {
  const outOfRange = readings.filter(r => {
    const config = BIOMARKER_CONFIGS[r.biomarker];
    if (!config) return false;
    return r.value < config.min || r.value > config.max;
  });

  const top3 = outOfRange.slice(0, 3).map(r => {
    const config = BIOMARKER_CONFIGS[r.biomarker];
    const deviation = r.value > config.max 
      ? ((r.value - config.max) / config.max) * 100
      : ((config.min - r.value) / config.min) * 100;
    
    return {
      name: r.biomarker,
      change: `+${Math.round(deviation)}%`,
      trend: (r.value > config.max ? 'up' : 'down') as 'up' | 'down',
      color: (deviation > 20 ? 'red' : deviation > 10 ? 'amber' : 'yellow') as 'red' | 'amber' | 'yellow',
      sparkline: [r.value * 0.9, r.value * 0.95, r.value * 0.98, r.value, r.value],
      benefit: getBiomarkerBenefit(r.biomarker),
    };
  });

  return top3;
}

function getBiomarkerBenefit(biomarker: string): string {
  const benefits: Record<string, string> = {
    'LDL': 'Lowering LDL cholesterol reduces arterial plaque buildup, cutting your risk of heart disease and stroke by up to 25%. Focus on fiber-rich foods and regular cardio.',
    'HbA1c': 'Better blood sugar control prevents diabetes complications, protects nerve and kidney function, and improves energy levels. Consider reducing refined carbs and increasing protein.',
    'Vitamin D (25-OH)': 'Optimal Vitamin D strengthens bones, boosts immune function, and may reduce depression risk. Aim for 15 minutes of sun exposure daily or supplement with D3.',
    'Glucose': 'Stable glucose levels improve energy, reduce diabetes risk, and support healthy weight management.',
    'Total Cholesterol': 'Healthy cholesterol levels reduce cardiovascular disease risk and support overall heart health.',
  };
  
  return benefits[biomarker] || 'Optimizing this biomarker supports better overall health and wellness.';
}

export function getAIInsight(analysis: AnalysisResult | undefined): string {
  if (!analysis) return "Your blood work analysis is being processed.";
  
  // Try to get recommendations from analysis
  if (analysis.recommendations && typeof analysis.recommendations === 'string') {
    return analysis.recommendations;
  }
  
  // Try to parse insights array if it's JSON
  if (analysis.insights && typeof analysis.insights === 'string') {
    try {
      const insights = JSON.parse(analysis.insights);
      if (Array.isArray(insights) && insights.length > 0) {
        return insights[0].recommendation || insights[0].insight || "";
      }
    } catch (e) {
      // Fall through to default
    }
  }
  
  return "Your blood work analysis is complete. Review the biomarkers below for detailed insights.";
}

export function getFullReportData(analysis: AnalysisResult | undefined): {
  summary_header: {
    biological_age_years: number;
    chronological_age_years: number;
    bioage_trend_years_since_last: number;
    overall_health_rating: string;
    badges: string[];
  };
} {
  if (!analysis) {
    return {
      summary_header: {
        biological_age_years: 0,
        chronological_age_years: 0,
        bioage_trend_years_since_last: 0,
        overall_health_rating: "Processing",
        badges: []
      }
    };
  }

  const ageData = getBiologicalAgeData(analysis);
  const readings = mapAnalysisToBiomarkerReadings(analysis);
  const inRange = readings.filter(r => {
    const config = BIOMARKER_CONFIGS[r.biomarker];
    return config && r.value >= config.min && r.value <= config.max;
  });
  
  const badges: string[] = [];
  if (inRange.length / readings.length > 0.8) badges.push("Excellent Health");
  if (ageData.ageDifference > 2) badges.push("Biological Youth");
  
  return {
    summary_header: {
      biological_age_years: ageData.biologicalAge,
      chronological_age_years: ageData.chronologicalAge,
      bioage_trend_years_since_last: ageData.ageDifference > 0 ? ageData.ageDifference : 0,
      overall_health_rating: inRange.length / readings.length > 0.7 ? "Good" : "Needs Attention",
      badges
    }
  };
}
