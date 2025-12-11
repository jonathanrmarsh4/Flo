import { supabase } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import { ClickHouseBaselineEngine } from './clickhouseBaselineEngine';
import { createLogger } from '../utils/logger';
import { 
  SUPPLEMENT_CONFIGURATIONS, 
  getSupplementConfig, 
  calculateVerdict,
  getVerdictMessage,
  type SupplementTypeConfig,
  type SupplementObjectiveMetric,
  type SupplementSubjectiveMetric,
} from '../../shared/supplementConfig';

// Initialize ClickHouse baseline engine instance
const clickhouseEngine = new ClickHouseBaselineEngine();

const logger = createLogger('N1ExperimentService');

// Type definitions
export interface N1Experiment {
  id: string;
  health_id: string;
  supplement_type_id: string;
  product_name: string;
  product_brand?: string;
  product_barcode?: string;
  product_image_url?: string;
  product_strength?: string;
  product_serving_size?: string;
  product_dsld_id?: string;
  dosage_amount: number;
  dosage_unit: string;
  dosage_frequency: string;
  dosage_timing?: string;
  primary_intent: string;
  status: 'pending' | 'baseline' | 'active' | 'washout' | 'completed' | 'paused' | 'cancelled';
  baseline_days: number;
  experiment_days: number;
  washout_days?: number;
  created_at: string;
  baseline_start_date?: string;
  experiment_start_date?: string;
  experiment_end_date?: string;
  completed_at?: string;
  noise_filters: string[];
  updated_at: string;
}

export interface N1ExperimentMetric {
  id: string;
  experiment_id: string;
  metric_name: string;
  metric_type: 'objective' | 'subjective';
  data_source?: string;
  healthkit_type?: string;
  clickhouse_metric?: string;
  baseline_duration_days: number;
  expected_onset_days: number;
  success_criteria?: string;
  minimum_effect_percent?: number;
  scale_min: number;
  scale_max: number;
  daily_checkin: boolean;
  created_at: string;
}

export interface N1DailyCheckin {
  id: string;
  experiment_id: string;
  health_id: string;
  checkin_date: string;
  checkin_timestamp: string;
  phase: 'baseline' | 'active' | 'washout';
  day_number: number;
  ratings: Record<string, number>;
  notes?: string;
  noise_flags: string[];
  source: 'manual' | 'push_notification' | 'dashboard_popup' | 'reminder';
  created_at: string;
}

export interface N1ExperimentResult {
  id: string;
  experiment_id: string;
  calculated_at: string;
  baseline_days_used: number;
  experiment_days_used: number;
  noisy_days_excluded: number;
  metric_results: MetricResult[];
  overall_verdict: 'strong_success' | 'moderate_benefit' | 'no_effect' | 'negative_effect' | 'insufficient_data';
  overall_effect_size: number;
  ai_summary?: string;
  ai_recommendations?: Record<string, any>;
  confidence_level?: number;
  created_at: string;
}

export interface MetricResult {
  metric_name: string;
  metric_type: 'objective' | 'subjective';
  effect_size: number;
  baseline_mean: number;
  baseline_std: number;
  experiment_mean: number;
  verdict: string;
  confidence: number;
  data_points_baseline: number;
  data_points_experiment: number;
}

export interface CreateExperimentInput {
  userId: string;
  supplementTypeId: string;
  productName: string;
  productBrand?: string;
  productBarcode?: string;
  productImageUrl?: string;
  productStrength?: string;
  productServingSize?: string;
  productDsldId?: string;
  dosageAmount: number;
  dosageUnit?: string;
  dosageFrequency?: string;
  dosageTiming?: string;
  primaryIntent: string;
  experimentDays?: number;
  selectedObjectiveMetrics?: string[];
  selectedSubjectiveMetrics?: string[];
}

// N-of-1 Experiment Service
class N1ExperimentService {
  
  // Create a new experiment
  async createExperiment(input: CreateExperimentInput): Promise<N1Experiment> {
    const healthId = await getHealthId(input.userId);
    if (!healthId) {
      throw new Error('Health ID not found for user');
    }

    const supplementConfig = getSupplementConfig(input.supplementTypeId);
    if (!supplementConfig) {
      throw new Error(`Unknown supplement type: ${input.supplementTypeId}`);
    }

    // Determine baseline and experiment duration from config
    const baselineDays = Math.max(
      ...supplementConfig.objectiveMetrics.map(m => m.baselineDuration),
      ...supplementConfig.subjectiveMetrics.map(m => m.baselineDuration)
    );
    const experimentDays = input.experimentDays || supplementConfig.recommendedDuration;
    const washoutDays = supplementConfig.washoutPeriod;

    logger.info(`Creating N-of-1 experiment for user ${input.userId}`, {
      supplementType: input.supplementTypeId,
      productName: input.productName,
      baselineDays,
      experimentDays,
    });

    // Insert experiment
    const { data: experiment, error } = await supabase
      .from('n1_experiments')
      .insert({
        health_id: healthId,
        supplement_type_id: input.supplementTypeId,
        product_name: input.productName,
        product_brand: input.productBrand,
        product_barcode: input.productBarcode,
        product_image_url: input.productImageUrl,
        product_strength: input.productStrength,
        product_serving_size: input.productServingSize,
        product_dsld_id: input.productDsldId,
        dosage_amount: input.dosageAmount,
        dosage_unit: input.dosageUnit || 'mg',
        dosage_frequency: input.dosageFrequency || 'daily',
        dosage_timing: input.dosageTiming,
        primary_intent: input.primaryIntent,
        status: 'pending',
        baseline_days: baselineDays,
        experiment_days: experimentDays,
        washout_days: washoutDays,
        noise_filters: supplementConfig.contextualNoiseFilters,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create experiment', { error: error.message });
      throw new Error(`Failed to create experiment: ${error.message}`);
    }

    // Insert experiment metrics
    const objectiveMetricsToInsert = input.selectedObjectiveMetrics
      ? supplementConfig.objectiveMetrics.filter(m => input.selectedObjectiveMetrics!.includes(m.metric))
      : supplementConfig.objectiveMetrics;

    const subjectiveMetricsToInsert = input.selectedSubjectiveMetrics
      ? supplementConfig.subjectiveMetrics.filter(m => input.selectedSubjectiveMetrics!.includes(m.metric))
      : supplementConfig.subjectiveMetrics;

    const metricsToInsert = [
      ...objectiveMetricsToInsert.map(m => ({
        experiment_id: experiment.id,
        metric_name: m.metric,
        metric_type: 'objective' as const,
        data_source: m.source,
        healthkit_type: m.healthkitType,
        clickhouse_metric: m.clickhouseMetric,
        baseline_duration_days: m.baselineDuration,
        expected_onset_days: m.expectedOnset,
        success_criteria: m.successCriteria,
        minimum_effect_percent: m.minimumEffect,
        scale_min: 0,
        scale_max: 0,
        daily_checkin: false,
      })),
      ...subjectiveMetricsToInsert.map(m => ({
        experiment_id: experiment.id,
        metric_name: m.metric,
        metric_type: 'subjective' as const,
        data_source: 'User Input',
        baseline_duration_days: m.baselineDuration,
        expected_onset_days: m.expectedOnset,
        success_criteria: m.successCriteria,
        minimum_effect_percent: m.minimumEffect,
        scale_min: 0,
        scale_max: 10,
        daily_checkin: m.dailyCheckIn,
      })),
    ];

    if (metricsToInsert.length > 0) {
      const { error: metricsError } = await supabase
        .from('n1_experiment_metrics')
        .insert(metricsToInsert);

      if (metricsError) {
        logger.error('Failed to insert experiment metrics', { error: metricsError.message });
      }
    }

    logger.info(`Experiment created successfully: ${experiment.id}`);
    return experiment;
  }

  // Get experiments for a user
  async getUserExperiments(userId: string): Promise<N1Experiment[]> {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return [];
    }

    const { data, error } = await supabase
      .from('n1_experiments')
      .select('*')
      .eq('health_id', healthId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch experiments', { error: error.message });
      throw new Error(`Failed to fetch experiments: ${error.message}`);
    }

    return data || [];
  }

  // Get a single experiment with metrics
  async getExperiment(experimentId: string, userId: string): Promise<{ experiment: N1Experiment; metrics: N1ExperimentMetric[] } | null> {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return null;
    }

    const { data: experiment, error } = await supabase
      .from('n1_experiments')
      .select('*')
      .eq('id', experimentId)
      .eq('health_id', healthId)
      .single();

    if (error || !experiment) {
      return null;
    }

    const { data: metrics } = await supabase
      .from('n1_experiment_metrics')
      .select('*')
      .eq('experiment_id', experimentId);

    return {
      experiment,
      metrics: metrics || [],
    };
  }

  // Start an experiment (transition from pending to active or baseline)
  async startExperiment(experimentId: string, userId: string, useRetroactiveBaseline: boolean = true): Promise<N1Experiment> {
    const experimentData = await this.getExperiment(experimentId, userId);
    if (!experimentData) {
      throw new Error('Experiment not found');
    }

    const { experiment } = experimentData;
    if (experiment.status !== 'pending') {
      throw new Error('Experiment is not in pending status');
    }

    const now = new Date().toISOString();
    let newStatus: 'baseline' | 'active' = 'active';
    let baselineStartDate: string | undefined;
    let experimentStartDate: string | undefined;

    if (useRetroactiveBaseline) {
      // Use retroactive baseline - start experiment immediately
      const baselineDaysAgo = new Date();
      baselineDaysAgo.setDate(baselineDaysAgo.getDate() - experiment.baseline_days);
      baselineStartDate = baselineDaysAgo.toISOString();
      experimentStartDate = now;
      newStatus = 'active';
    } else {
      // Need to collect baseline data first
      baselineStartDate = now;
      newStatus = 'baseline';
    }

    const experimentEndDate = new Date();
    experimentEndDate.setDate(experimentEndDate.getDate() + experiment.experiment_days);

    const { data, error } = await supabase
      .from('n1_experiments')
      .update({
        status: newStatus,
        baseline_start_date: baselineStartDate,
        experiment_start_date: experimentStartDate,
        experiment_end_date: experimentEndDate.toISOString(),
        updated_at: now,
      })
      .eq('id', experimentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to start experiment: ${error.message}`);
    }

    logger.info(`Experiment ${experimentId} started`, { status: newStatus, useRetroactiveBaseline });
    return data;
  }

  // Validate baseline data availability
  async validateBaselineData(userId: string, supplementTypeId: string): Promise<{
    hasEnoughData: boolean;
    metrics: { metric: string; daysAvailable: number; daysRequired: number; sufficient: boolean }[];
  }> {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return { hasEnoughData: false, metrics: [] };
    }

    const supplementConfig = getSupplementConfig(supplementTypeId);
    if (!supplementConfig) {
      return { hasEnoughData: false, metrics: [] };
    }

    const metricsResults: { metric: string; daysAvailable: number; daysRequired: number; sufficient: boolean }[] = [];

    // Check objective metrics using ClickHouse - get all baselines at once
    try {
      const baselines = await clickhouseEngine.calculateBaselines(healthId, 30);
      const baselineMap = new Map(baselines.map(b => [b.metricType, b]));

      for (const metric of supplementConfig.objectiveMetrics) {
        if (metric.clickhouseMetric) {
          const baseline = baselineMap.get(metric.clickhouseMetric);
          const daysAvailable = baseline?.sampleCount || 0;
          const daysRequired = metric.baselineDuration;
          
          metricsResults.push({
            metric: metric.metric,
            daysAvailable,
            daysRequired,
            sufficient: daysAvailable >= daysRequired,
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to get baselines from ClickHouse', { error });
      // Add all objective metrics as insufficient
      for (const metric of supplementConfig.objectiveMetrics) {
        metricsResults.push({
          metric: metric.metric,
          daysAvailable: 0,
          daysRequired: metric.baselineDuration,
          sufficient: false,
        });
      }
    }

    // Subjective metrics don't have historical data initially
    for (const metric of supplementConfig.subjectiveMetrics) {
      metricsResults.push({
        metric: metric.metric,
        daysAvailable: 0,
        daysRequired: metric.baselineDuration,
        sufficient: false, // Will be collected during experiment
      });
    }

    // Need at least one objective metric to have enough data
    const objectiveMetricsSufficient = metricsResults
      .filter(m => supplementConfig.objectiveMetrics.some(om => om.metric === m.metric))
      .some(m => m.sufficient);

    return {
      hasEnoughData: objectiveMetricsSufficient,
      metrics: metricsResults,
    };
  }

  // Record a daily check-in
  async recordDailyCheckin(
    experimentId: string,
    userId: string,
    ratings: Record<string, number>,
    notes?: string,
    noiseFlags?: string[],
    source: 'manual' | 'push_notification' | 'dashboard_popup' | 'reminder' = 'manual'
  ): Promise<N1DailyCheckin> {
    const experimentData = await this.getExperiment(experimentId, userId);
    if (!experimentData) {
      throw new Error('Experiment not found');
    }

    const { experiment } = experimentData;
    const healthId = await getHealthId(userId);
    if (!healthId) {
      throw new Error('Health ID not found');
    }

    // Determine phase and day number
    const today = new Date().toISOString().split('T')[0];
    let phase: 'baseline' | 'active' | 'washout' = 'active';
    let dayNumber = 1;

    if (experiment.experiment_start_date) {
      const startDate = new Date(experiment.experiment_start_date);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      dayNumber = diffDays + 1;
    }

    if (experiment.status === 'baseline') {
      phase = 'baseline';
    } else if (experiment.status === 'washout') {
      phase = 'washout';
    }

    // Upsert check-in (update if exists for today)
    const { data, error } = await supabase
      .from('n1_daily_checkins')
      .upsert({
        experiment_id: experimentId,
        health_id: healthId,
        checkin_date: today,
        phase,
        day_number: dayNumber,
        ratings,
        notes,
        noise_flags: noiseFlags || [],
        source,
      }, {
        onConflict: 'experiment_id,checkin_date',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record check-in: ${error.message}`);
    }

    logger.info(`Daily check-in recorded for experiment ${experimentId}`, { phase, dayNumber });
    return data;
  }

  // Get daily check-ins for an experiment
  async getExperimentCheckins(experimentId: string, userId: string): Promise<N1DailyCheckin[]> {
    const experimentData = await this.getExperiment(experimentId, userId);
    if (!experimentData) {
      return [];
    }

    const { data, error } = await supabase
      .from('n1_daily_checkins')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('checkin_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch check-ins: ${error.message}`);
    }

    return data || [];
  }

  // Calculate experiment results
  async calculateResults(experimentId: string, userId: string): Promise<N1ExperimentResult> {
    const experimentData = await this.getExperiment(experimentId, userId);
    if (!experimentData) {
      throw new Error('Experiment not found');
    }

    const { experiment, metrics } = experimentData;
    const healthId = await getHealthId(userId);
    if (!healthId) {
      throw new Error('Health ID not found');
    }

    const metricResults: MetricResult[] = [];
    let totalEffectSize = 0;
    let validMetricCount = 0;

    // Get baselines from ClickHouse for baseline period
    let baselineMap = new Map<string, { mean: number; stdDev: number | null; sampleCount: number }>();
    let experimentMap = new Map<string, { mean: number; stdDev: number | null; sampleCount: number }>();
    
    try {
      // Get baseline period data (use baseline_days for window)
      const baselines = await clickhouseEngine.calculateBaselines(healthId, experiment.baseline_days);
      baselineMap = new Map(baselines.map(b => [b.metricType, { 
        mean: b.meanValue, 
        stdDev: b.stdDev, 
        sampleCount: b.sampleCount 
      }]));
      
      // For experiment period, we use the same calculation but for the most recent days
      // This is a simplified approach - ideally we'd query a specific date range
      const experimentBaselines = await clickhouseEngine.calculateBaselines(healthId, experiment.experiment_days);
      experimentMap = new Map(experimentBaselines.map(b => [b.metricType, { 
        mean: b.meanValue, 
        stdDev: b.stdDev, 
        sampleCount: b.sampleCount 
      }]));
    } catch (error) {
      logger.warn('Failed to get baselines from ClickHouse', { error });
    }

    // Calculate effect size for each objective metric
    for (const metric of metrics.filter(m => m.metric_type === 'objective')) {
      if (metric.clickhouse_metric) {
        try {
          const baseline = baselineMap.get(metric.clickhouse_metric);
          const experimentData = experimentMap.get(metric.clickhouse_metric);

          if (baseline && experimentData && baseline.stdDev && baseline.stdDev > 0) {
            // Calculate Effect Size: (Avg_Phase_B - Avg_Phase_A) / Std_Dev_Phase_A
            const effectSize = (experimentData.mean - baseline.mean) / baseline.stdDev;
            const verdict = calculateVerdict(effectSize);

            metricResults.push({
              metric_name: metric.metric_name,
              metric_type: 'objective',
              effect_size: effectSize,
              baseline_mean: baseline.mean,
              baseline_std: baseline.stdDev,
              experiment_mean: experimentData.mean,
              verdict,
              confidence: Math.min(baseline.sampleCount, experimentData.sampleCount) >= 14 ? 0.9 : 0.7,
              data_points_baseline: baseline.sampleCount,
              data_points_experiment: experimentData.sampleCount,
            });

            totalEffectSize += effectSize;
            validMetricCount++;
          }
        } catch (error) {
          logger.warn(`Failed to calculate effect size for ${metric.metric_name}`, { error });
        }
      }
    }

    // Calculate effect size for subjective metrics from check-ins
    const checkins = await this.getExperimentCheckins(experimentId, userId);
    const baselineCheckins = checkins.filter(c => c.phase === 'baseline');
    const activeCheckins = checkins.filter(c => c.phase === 'active');

    for (const metric of metrics.filter(m => m.metric_type === 'subjective')) {
      const baselineValues = baselineCheckins
        .map(c => c.ratings[metric.metric_name])
        .filter((v): v is number => typeof v === 'number');
      
      const activeValues = activeCheckins
        .map(c => c.ratings[metric.metric_name])
        .filter((v): v is number => typeof v === 'number');

      if (baselineValues.length >= 3 && activeValues.length >= 3) {
        const baselineMean = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
        const baselineStd = Math.sqrt(
          baselineValues.reduce((sum, val) => sum + Math.pow(val - baselineMean, 2), 0) / baselineValues.length
        );
        const activeMean = activeValues.reduce((a, b) => a + b, 0) / activeValues.length;

        if (baselineStd > 0) {
          const effectSize = (activeMean - baselineMean) / baselineStd;
          const verdict = calculateVerdict(effectSize);

          metricResults.push({
            metric_name: metric.metric_name,
            metric_type: 'subjective',
            effect_size: effectSize,
            baseline_mean: baselineMean,
            baseline_std: baselineStd,
            experiment_mean: activeMean,
            verdict,
            confidence: Math.min(baselineValues.length, activeValues.length) >= 7 ? 0.85 : 0.6,
            data_points_baseline: baselineValues.length,
            data_points_experiment: activeValues.length,
          });

          totalEffectSize += effectSize;
          validMetricCount++;
        }
      }
    }

    // Calculate overall verdict
    const overallEffectSize = validMetricCount > 0 ? totalEffectSize / validMetricCount : 0;
    const overallVerdict = validMetricCount >= 2 
      ? calculateVerdict(overallEffectSize)
      : 'insufficient_data';

    // Store results
    const { data: result, error } = await supabase
      .from('n1_experiment_results')
      .insert({
        experiment_id: experimentId,
        baseline_days_used: experiment.baseline_days,
        experiment_days_used: experiment.experiment_days,
        noisy_days_excluded: 0, // TODO: Implement noise filtering
        metric_results: metricResults,
        overall_verdict: overallVerdict,
        overall_effect_size: overallEffectSize,
        confidence_level: validMetricCount >= 3 ? 0.85 : 0.7,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store results: ${error.message}`);
    }

    // Update experiment status to completed
    await supabase
      .from('n1_experiments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', experimentId);

    logger.info(`Experiment ${experimentId} completed`, { 
      overallVerdict, 
      overallEffectSize, 
      metricsAnalyzed: metricResults.length 
    });

    return result;
  }

  // Get experiment results
  async getExperimentResults(experimentId: string, userId: string): Promise<N1ExperimentResult | null> {
    const experimentData = await this.getExperiment(experimentId, userId);
    if (!experimentData) {
      return null;
    }

    const { data, error } = await supabase
      .from('n1_experiment_results')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  // Update experiment status
  async updateExperimentStatus(
    experimentId: string, 
    userId: string, 
    status: 'active' | 'paused' | 'cancelled'
  ): Promise<N1Experiment> {
    const experimentData = await this.getExperiment(experimentId, userId);
    if (!experimentData) {
      throw new Error('Experiment not found');
    }

    const updates: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'active' && !experimentData.experiment.experiment_start_date) {
      updates.experiment_start_date = new Date().toISOString();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + experimentData.experiment.experiment_days);
      updates.experiment_end_date = endDate.toISOString();
    }

    const { data, error } = await supabase
      .from('n1_experiments')
      .update(updates)
      .eq('id', experimentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update experiment: ${error.message}`);
    }

    logger.info(`Experiment ${experimentId} status updated to ${status}`);
    return data;
  }

  // Get experiments requiring daily check-in
  async getExperimentsNeedingCheckin(userId: string): Promise<N1Experiment[]> {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return [];
    }

    // Get active experiments
    const { data: experiments, error } = await supabase
      .from('n1_experiments')
      .select('*')
      .eq('health_id', healthId)
      .in('status', ['active', 'baseline']);

    if (error || !experiments) {
      return [];
    }

    // Check which ones don't have a check-in today
    const today = new Date().toISOString().split('T')[0];
    const experimentsNeedingCheckin: N1Experiment[] = [];

    for (const experiment of experiments) {
      const { data: checkins } = await supabase
        .from('n1_daily_checkins')
        .select('id')
        .eq('experiment_id', experiment.id)
        .eq('checkin_date', today)
        .limit(1);

      if (!checkins || checkins.length === 0) {
        experimentsNeedingCheckin.push(experiment);
      }
    }

    return experimentsNeedingCheckin;
  }
}

export const n1ExperimentService = new N1ExperimentService();
