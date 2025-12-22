/**
 * CausalAnalysisService - Aggregates causal context for anomaly insights
 * 
 * When ML detects an anomaly (e.g., "deep sleep improved"), this service:
 * 1. Looks at active N-of-1 experiments that may have caused the change
 * 2. Fetches notable behaviors from yesterday (bedtime, supplements, rest day, etc.)
 * 3. Finds historical positive patterns that consistently precede similar improvements
 * 4. Returns actionable recommendations like "keep doing X, Y, Z"
 */

import { behaviorAttributionEngine, getMLSettings } from './behaviorAttributionEngine';
import { n1ExperimentService } from './n1ExperimentService';
import { getHealthId } from './supabaseHealthStorage';
import { getSupabaseClient } from './supabaseClient';
import { clickhouse, isClickHouseEnabled } from './clickhouseService';
import { logger } from '../utils/logger';
import { AnomalyResult } from './clickhouseBaselineEngine';

export interface CausalContext {
  // Active experiments that might explain the change
  activeExperiments: Array<{
    productName: string;
    intent: string;
    supplementTypeId: string;
    daysIntoExperiment: number;
  }>;
  
  // Notable behaviors from yesterday/recent days
  notableBehaviors: Array<{
    category: string;
    key: string;
    description: string;
    value: string;
    deviation: number; // percentage deviation from baseline
    direction: 'above' | 'below';
  }>;
  
  // Historical patterns that consistently precede this type of improvement
  positivePatterns: Array<{
    description: string;
    occurrenceCount: number;
    confidence: number;
    behaviorKeys: string[]; // For deduplication
  }>;
  
  // Summary text for AI prompt enrichment
  causalSummary: string;
  
  // Actionable recommendations based on analysis
  recommendations: string[];
}

class CausalAnalysisService {
  /**
   * Analyze potential causes for a detected anomaly.
   * Returns rich causal context for AI insight generation.
   */
  async analyzeAnomalyCauses(
    userId: string,
    anomaly: AnomalyResult
  ): Promise<CausalContext> {
    const healthId = await getHealthId(userId);
    
    if (!healthId) {
      return this.emptyContext();
    }
    
    const results = await Promise.allSettled([
      this.getActiveExperiments(userId),
      this.getNotableBehaviors(healthId, anomaly.metricType),
      this.findPositivePatterns(healthId, anomaly),
    ]);
    
    const activeExperiments = results[0].status === 'fulfilled' ? results[0].value : [];
    const notableBehaviors = results[1].status === 'fulfilled' ? results[1].value : [];
    const positivePatterns = results[2].status === 'fulfilled' ? results[2].value : [];
    
    // Build causal summary for AI prompt
    const causalSummary = this.buildCausalSummary(
      anomaly,
      activeExperiments,
      notableBehaviors,
      positivePatterns
    );
    
    // Generate actionable recommendations
    const recommendations = this.generateRecommendations(
      anomaly,
      activeExperiments,
      notableBehaviors,
      positivePatterns
    );
    
    return {
      activeExperiments,
      notableBehaviors,
      positivePatterns,
      causalSummary,
      recommendations,
    };
  }
  
  /**
   * Analyze causes for multiple anomalies at once.
   * Combines context and deduplicates patterns.
   */
  async analyzeMultipleAnomalies(
    userId: string,
    anomalies: AnomalyResult[]
  ): Promise<CausalContext> {
    if (anomalies.length === 0) {
      return this.emptyContext();
    }
    
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return this.emptyContext();
    }
    
    // Focus on the primary anomaly (highest severity)
    const primaryAnomaly = anomalies.reduce((max, a) => {
      const severityOrder = { low: 0, moderate: 1, high: 2 };
      return severityOrder[a.severity] > severityOrder[max.severity] ? a : max;
    }, anomalies[0]);
    
    // Get context for primary anomaly
    const primaryContext = await this.analyzeAnomalyCauses(userId, primaryAnomaly);
    
    // For positive anomalies (improvements), also check secondary metrics
    if (primaryAnomaly.direction === 'above' && anomalies.length > 1) {
      // Find additional positive patterns from secondary anomalies
      for (const anomaly of anomalies.slice(1, 3)) {
        if (anomaly.direction === 'above') {
          const secondaryPatterns = await this.findPositivePatterns(healthId, anomaly);
          // Deduplicate and add unique patterns
          for (const pattern of secondaryPatterns) {
            const exists = primaryContext.positivePatterns.some(
              p => p.behaviorKeys.some(key => pattern.behaviorKeys.includes(key))
            );
            if (!exists) {
              primaryContext.positivePatterns.push(pattern);
            }
          }
        }
      }
    }
    
    // Rebuild summary with all anomalies considered
    primaryContext.causalSummary = this.buildCausalSummary(
      primaryAnomaly,
      primaryContext.activeExperiments,
      primaryContext.notableBehaviors,
      primaryContext.positivePatterns.slice(0, 3)
    );
    
    return primaryContext;
  }
  
  private async getActiveExperiments(userId: string): Promise<CausalContext['activeExperiments']> {
    try {
      const experiments = await n1ExperimentService.getActiveExperimentsWithProducts(userId);
      
      // Get experiment start dates for "days into experiment" calculation
      const healthId = await getHealthId(userId);
      if (!healthId) return [];
      
      const supabase = getSupabaseClient();
      const { data: experimentDetails } = await supabase
        .from('n1_experiments')
        .select('supplement_type_id, started_at')
        .eq('health_id', healthId)
        .in('status', ['active', 'baseline']);
      
      const startDates = new Map<string, Date>();
      if (experimentDetails) {
        for (const exp of experimentDetails) {
          if (exp.started_at) {
            startDates.set(exp.supplement_type_id, new Date(exp.started_at));
          }
        }
      }
      
      return experiments.map(exp => ({
        productName: exp.productName,
        intent: exp.intent,
        supplementTypeId: exp.supplementTypeId,
        daysIntoExperiment: startDates.has(exp.supplementTypeId)
          ? Math.floor((Date.now() - startDates.get(exp.supplementTypeId)!.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      }));
    } catch (error) {
      logger.debug('[CausalAnalysis] Error getting active experiments:', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
  
  private async getNotableBehaviors(
    healthId: string,
    outcomeMetric: string
  ): Promise<CausalContext['notableBehaviors']> {
    if (!isClickHouseEnabled()) return [];
    
    try {
      // Get notable behaviors from yesterday and the day before
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(today);
      dayBefore.setDate(dayBefore.getDate() - 2);
      
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      
      const query = `
        SELECT 
          factor_category,
          factor_key,
          numeric_value,
          string_value,
          deviation_from_baseline,
          baseline_value,
          local_date
        FROM flo_health.daily_behavior_factors
        WHERE health_id = {healthId:String}
          AND local_date IN ({yesterday:Date}, {dayBefore:Date})
          AND is_notable = 1
          AND abs(deviation_from_baseline) > 15
        ORDER BY abs(deviation_from_baseline) DESC
        LIMIT 10
      `;
      
      const results = await clickhouse.query<{
        factor_category: string;
        factor_key: string;
        numeric_value: number | null;
        string_value: string | null;
        deviation_from_baseline: number;
        baseline_value: number | null;
        local_date: string;
      }>(query, { healthId, yesterday: yesterdayStr, dayBefore: dayBeforeStr });
      
      return results.map(r => ({
        category: r.factor_category,
        key: r.factor_key,
        description: this.formatBehaviorDescription(r.factor_category, r.factor_key),
        value: r.string_value || (r.numeric_value !== null ? String(r.numeric_value) : ''),
        deviation: r.deviation_from_baseline,
        direction: r.deviation_from_baseline > 0 ? 'above' : 'below',
      }));
    } catch (error) {
      logger.debug('[CausalAnalysis] Error getting notable behaviors:', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
  
  private async findPositivePatterns(
    healthId: string,
    anomaly: AnomalyResult
  ): Promise<CausalContext['positivePatterns']> {
    try {
      // Only look for positive patterns if this is an improvement
      if (anomaly.direction === 'below') {
        // For metrics where lower is better (like RHR), this is still an improvement
        const lowerIsBetter = ['resting_heart_rate', 'rhr_bpm', 'respiratory_rate', 'blood_glucose', 'cgm_glucose'];
        if (!lowerIsBetter.includes(anomaly.metricType)) {
          return [];
        }
      }
      
      const result = await behaviorAttributionEngine.findPositivePatterns(
        healthId,
        anomaly.metricType
      );
      
      return result.patterns.map(p => ({
        description: p.behaviors.map(b => b.description).join(' + '),
        occurrenceCount: p.occurrenceCount,
        confidence: p.confidence,
        behaviorKeys: p.behaviors.map(b => `${b.category}:${b.key}`),
      }));
    } catch (error) {
      logger.debug('[CausalAnalysis] Error finding positive patterns:', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
  
  private buildCausalSummary(
    anomaly: AnomalyResult,
    experiments: CausalContext['activeExperiments'],
    behaviors: CausalContext['notableBehaviors'],
    patterns: CausalContext['positivePatterns']
  ): string {
    const parts: string[] = [];
    
    // Active experiments
    if (experiments.length > 0) {
      const expList = experiments
        .map(e => `${e.productName} (day ${e.daysIntoExperiment})`)
        .join(', ');
      parts.push(`Active experiments: ${expList}`);
    }
    
    // Notable recent behaviors
    if (behaviors.length > 0) {
      const behaviorList = behaviors.slice(0, 4).map(b => {
        const dir = b.deviation > 0 ? 'higher' : 'lower';
        return `${b.description} was ${Math.abs(Math.round(b.deviation))}% ${dir} than usual`;
      }).join('; ');
      parts.push(`Recent notable behaviors: ${behaviorList}`);
    }
    
    // Positive historical patterns
    if (patterns.length > 0 && anomaly.direction === 'above') {
      const patternList = patterns.slice(0, 3).map(p => 
        `${p.description} (${p.occurrenceCount} times before)`
      ).join('; ');
      parts.push(`Historically associated with improvement: ${patternList}`);
    }
    
    return parts.length > 0 ? parts.join('. ') : '';
  }
  
  private generateRecommendations(
    anomaly: AnomalyResult,
    experiments: CausalContext['activeExperiments'],
    behaviors: CausalContext['notableBehaviors'],
    patterns: CausalContext['positivePatterns']
  ): string[] {
    const recommendations: string[] = [];
    
    // Only generate recommendations for improvements
    const isImprovement = anomaly.direction === 'above' || 
      ['resting_heart_rate', 'rhr_bpm', 'respiratory_rate'].includes(anomaly.metricType);
    
    if (!isImprovement) return recommendations;
    
    // Recommend continuing experiments that may be working
    for (const exp of experiments) {
      if (exp.daysIntoExperiment >= 3) {
        recommendations.push(`Continue with ${exp.productName} experiment`);
      }
    }
    
    // Recommend replicating positive behaviors
    const positiveBehaviors = behaviors.filter(b => b.deviation > 0);
    for (const behavior of positiveBehaviors.slice(0, 2)) {
      recommendations.push(`Keep ${behavior.description} elevated`);
    }
    
    // Recommend based on historical patterns
    for (const pattern of patterns.slice(0, 2)) {
      recommendations.push(`Continue ${pattern.description.toLowerCase()}`);
    }
    
    return recommendations.slice(0, 3); // Max 3 recommendations
  }
  
  private formatBehaviorDescription(category: string, key: string): string {
    const keyMappings: Record<string, string> = {
      // Sleep-related
      'bedtime': 'earlier bedtime',
      'sleep_duration': 'sleep duration',
      'wake_time': 'wake time',
      'sleep_score': 'sleep quality score',
      
      // Supplements
      'supplement_magnesium': 'magnesium supplement',
      'supplement_melatonin': 'melatonin supplement',
      'supplement_glycine': 'glycine supplement',
      'supplement_ashwagandha': 'ashwagandha supplement',
      
      // Workout
      'total_duration_min': 'workout duration',
      'workout_count': 'number of workouts',
      'avg_intensity': 'workout intensity',
      'cardio_minutes': 'cardio exercise',
      'strength_minutes': 'strength training',
      
      // Nutrition
      'total_calories': 'calorie intake',
      'protein_g': 'protein intake',
      'caffeine_mg': 'caffeine intake',
      'last_meal_time': 'last meal timing',
      
      // Life events
      'rest_day': 'rest day',
      'travel': 'travel',
      'illness': 'illness',
      'alcohol_units': 'alcohol consumption',
      
      // Environment
      'temperature_c': 'temperature',
      'humidity_pct': 'humidity',
      'aqi': 'air quality',
    };
    
    return keyMappings[key] || key.replace(/_/g, ' ');
  }
  
  private emptyContext(): CausalContext {
    return {
      activeExperiments: [],
      notableBehaviors: [],
      positivePatterns: [],
      causalSummary: '',
      recommendations: [],
    };
  }
}

export const causalAnalysisService = new CausalAnalysisService();
