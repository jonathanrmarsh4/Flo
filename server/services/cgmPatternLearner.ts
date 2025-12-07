import { randomUUID } from 'crypto';
import * as clickhouse from './clickhouseService';
import { syntheticCgmService } from './syntheticCgmService';
import { logger } from '../logger';

interface LearnedCgmBaseline {
  hour_of_day: number;
  mean_glucose: number;
  std_glucose: number;
  p10_glucose: number;
  p25_glucose: number;
  p50_glucose: number;
  p75_glucose: number;
  p90_glucose: number;
  sample_count: number;
}

interface LearnedPattern {
  pattern_type: string;
  mean_value: number;
  std_value: number;
  threshold_low: number;
  threshold_high: number;
  sample_count: number;
}

interface TrainingResult {
  success: boolean;
  patternsLearned: number;
  hourlyBaselines: number;
  syntheticReadingsUsed: number;
  error?: string;
}

export class CgmPatternLearner {
  private static GLOBAL_PATTERN_ID = 'cgm_global_baseline';

  async initializeLearnedBaselinesTable(): Promise<boolean> {
    try {
      const ch = clickhouse.getClickHouseClient();
      if (!ch) {
        logger.warn('[CgmPatternLearner] ClickHouse not available');
        return false;
      }

      await ch.command({
        query: `
          CREATE TABLE IF NOT EXISTS flo_health.cgm_learned_baselines (
            baseline_id String,
            pattern_type LowCardinality(String) DEFAULT '',
            hour_of_day UInt8 DEFAULT 0,
            scenario LowCardinality(String) DEFAULT '',
            mean_glucose Float64,
            std_glucose Float64,
            p10_glucose Float64 DEFAULT 0,
            p25_glucose Float64 DEFAULT 0,
            p50_glucose Float64 DEFAULT 0,
            p75_glucose Float64 DEFAULT 0,
            p90_glucose Float64 DEFAULT 0,
            threshold_hypo Float64 DEFAULT 70,
            threshold_hyper Float64 DEFAULT 180,
            sample_count UInt32,
            trained_at DateTime64(3) DEFAULT now64(3),
            model_version String DEFAULT 'v1'
          )
          ENGINE = ReplacingMergeTree(trained_at)
          ORDER BY (pattern_type, hour_of_day, scenario, baseline_id)
        `,
      });

      logger.info('[CgmPatternLearner] Learned baselines table initialized');
      return true;
    } catch (error) {
      logger.error('[CgmPatternLearner] Failed to initialize table:', error);
      return false;
    }
  }

  async trainOnSyntheticData(options: {
    numPatients?: number;
    daysPerPatient?: number;
    regenerateData?: boolean;
  } = {}): Promise<TrainingResult> {
    const { numPatients = 10, daysPerPatient = 14, regenerateData = false } = options;

    try {
      await this.initializeLearnedBaselinesTable();

      let syntheticReadingsCount = 0;

      if (regenerateData) {
        logger.info('[CgmPatternLearner] Generating fresh synthetic data...');
        const genResult = await syntheticCgmService.generateAndInjectData({
          numPatients,
          daysPerPatient,
        });

        if (!genResult.success) {
          return {
            success: false,
            patternsLearned: 0,
            hourlyBaselines: 0,
            syntheticReadingsUsed: 0,
            error: genResult.error || 'Failed to generate synthetic data',
          };
        }
        syntheticReadingsCount = genResult.readingsInjected;
      }

      const stats = await syntheticCgmService.getSyntheticDataStats();
      syntheticReadingsCount = stats.totalSyntheticReadings;

      if (syntheticReadingsCount === 0) {
        logger.info('[CgmPatternLearner] No synthetic data found, generating...');
        const genResult = await syntheticCgmService.generateAndInjectData({
          numPatients,
          daysPerPatient,
        });
        syntheticReadingsCount = genResult.readingsInjected;
      }

      logger.info(`[CgmPatternLearner] Training on ${syntheticReadingsCount} synthetic readings`);

      const hourlyBaselines = await this.learnHourlyPatterns();
      const overallPatterns = await this.learnOverallPatterns();
      const variabilityPatterns = await this.learnVariabilityPatterns();

      const totalPatterns = overallPatterns + variabilityPatterns;

      logger.info(`[CgmPatternLearner] Training complete: ${hourlyBaselines} hourly baselines, ${totalPatterns} patterns`);

      return {
        success: true,
        patternsLearned: totalPatterns,
        hourlyBaselines,
        syntheticReadingsUsed: syntheticReadingsCount,
      };
    } catch (error) {
      logger.error('[CgmPatternLearner] Training failed:', error);
      return {
        success: false,
        patternsLearned: 0,
        hourlyBaselines: 0,
        syntheticReadingsUsed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async learnHourlyPatterns(): Promise<number> {
    const sql = `
      SELECT 
        toHour(recorded_at) as hour_of_day,
        avg(glucose_mg_dl) as mean_glucose,
        stddevPop(glucose_mg_dl) as std_glucose,
        quantile(0.10)(glucose_mg_dl) as p10_glucose,
        quantile(0.25)(glucose_mg_dl) as p25_glucose,
        quantile(0.50)(glucose_mg_dl) as p50_glucose,
        quantile(0.75)(glucose_mg_dl) as p75_glucose,
        quantile(0.90)(glucose_mg_dl) as p90_glucose,
        count() as sample_count
      FROM flo_health.cgm_glucose
      WHERE health_id LIKE 'synthetic_training_%'
      GROUP BY hour_of_day
      ORDER BY hour_of_day
    `;

    const hourlyStats = await clickhouse.query<LearnedCgmBaseline>(sql, {});

    if (hourlyStats.length === 0) {
      logger.warn('[CgmPatternLearner] No hourly data to learn from');
      return 0;
    }

    const rows = hourlyStats.map((stat) => ({
      baseline_id: randomUUID(),
      pattern_type: 'hourly_baseline',
      hour_of_day: stat.hour_of_day,
      scenario: '',
      mean_glucose: stat.mean_glucose,
      std_glucose: stat.std_glucose || 20,
      p10_glucose: stat.p10_glucose,
      p25_glucose: stat.p25_glucose,
      p50_glucose: stat.p50_glucose,
      p75_glucose: stat.p75_glucose,
      p90_glucose: stat.p90_glucose,
      threshold_hypo: Math.max(54, stat.p10_glucose - 10),
      threshold_hyper: Math.min(250, stat.p90_glucose + 30),
      sample_count: Number(stat.sample_count),
      model_version: 'v1',
    }));

    await clickhouse.insert('cgm_learned_baselines', rows);
    
    logger.info(`[CgmPatternLearner] Learned ${rows.length} hourly baselines`);
    return rows.length;
  }

  private async learnOverallPatterns(): Promise<number> {
    const sql = `
      SELECT 
        meal_context as scenario,
        avg(glucose_mg_dl) as mean_glucose,
        stddevPop(glucose_mg_dl) as std_glucose,
        quantile(0.10)(glucose_mg_dl) as p10_glucose,
        quantile(0.25)(glucose_mg_dl) as p25_glucose,
        quantile(0.50)(glucose_mg_dl) as p50_glucose,
        quantile(0.75)(glucose_mg_dl) as p75_glucose,
        quantile(0.90)(glucose_mg_dl) as p90_glucose,
        count() as sample_count
      FROM flo_health.cgm_glucose
      WHERE health_id LIKE 'synthetic_training_%'
      GROUP BY scenario
    `;

    const scenarioStats = await clickhouse.query<LearnedCgmBaseline & { scenario: string }>(sql, {});

    const rows = scenarioStats.map((stat) => ({
      baseline_id: randomUUID(),
      pattern_type: 'scenario_baseline',
      hour_of_day: 0,
      scenario: stat.scenario || '',
      mean_glucose: stat.mean_glucose,
      std_glucose: stat.std_glucose || 25,
      p10_glucose: stat.p10_glucose,
      p25_glucose: stat.p25_glucose,
      p50_glucose: stat.p50_glucose,
      p75_glucose: stat.p75_glucose,
      p90_glucose: stat.p90_glucose,
      threshold_hypo: 70,
      threshold_hyper: 180,
      sample_count: Number(stat.sample_count),
      model_version: 'v1',
    }));

    if (rows.length > 0) {
      await clickhouse.insert('cgm_learned_baselines', rows);
    }

    const globalSql = `
      SELECT 
        avg(glucose_mg_dl) as mean_glucose,
        stddevPop(glucose_mg_dl) as std_glucose,
        quantile(0.10)(glucose_mg_dl) as p10_glucose,
        quantile(0.25)(glucose_mg_dl) as p25_glucose,
        quantile(0.50)(glucose_mg_dl) as p50_glucose,
        quantile(0.75)(glucose_mg_dl) as p75_glucose,
        quantile(0.90)(glucose_mg_dl) as p90_glucose,
        count() as sample_count
      FROM flo_health.cgm_glucose
      WHERE health_id LIKE 'synthetic_training_%'
    `;

    const globalStats = await clickhouse.query<LearnedCgmBaseline>(globalSql, {});

    if (globalStats.length > 0) {
      const global = globalStats[0];
      await clickhouse.insert('cgm_learned_baselines', [{
        baseline_id: CgmPatternLearner.GLOBAL_PATTERN_ID,
        pattern_type: 'global_baseline',
        hour_of_day: 0,
        scenario: '',
        mean_glucose: global.mean_glucose,
        std_glucose: global.std_glucose || 30,
        p10_glucose: global.p10_glucose,
        p25_glucose: global.p25_glucose,
        p50_glucose: global.p50_glucose,
        p75_glucose: global.p75_glucose,
        p90_glucose: global.p90_glucose,
        threshold_hypo: 70,
        threshold_hyper: 180,
        sample_count: Number(global.sample_count),
        model_version: 'v1',
      }]);
    }

    logger.info(`[CgmPatternLearner] Learned ${rows.length} scenario patterns + 1 global`);
    return rows.length + 1;
  }

  private async learnVariabilityPatterns(): Promise<number> {
    const variabilitySql = `
      SELECT 
        health_id,
        local_date,
        avg(glucose_mg_dl) as day_mean,
        stddevPop(glucose_mg_dl) as day_std,
        max(glucose_mg_dl) - min(glucose_mg_dl) as day_range,
        count() as readings_count
      FROM flo_health.cgm_glucose
      WHERE health_id LIKE 'synthetic_training_%'
      GROUP BY health_id, local_date
      HAVING readings_count >= 20
    `;

    const dailyStats = await clickhouse.query<{
      health_id: string;
      local_date: string;
      day_mean: number;
      day_std: number;
      day_range: number;
      readings_count: number;
    }>(variabilitySql, {});

    if (dailyStats.length === 0) {
      return 0;
    }

    const cvValues = dailyStats.map(d => (d.day_std / d.day_mean) * 100);
    const rangeValues = dailyStats.map(d => d.day_range);

    const meanCv = cvValues.reduce((a, b) => a + b, 0) / cvValues.length;
    const stdCv = Math.sqrt(cvValues.map(v => (v - meanCv) ** 2).reduce((a, b) => a + b, 0) / cvValues.length);

    const meanRange = rangeValues.reduce((a, b) => a + b, 0) / rangeValues.length;
    const stdRange = Math.sqrt(rangeValues.map(v => (v - meanRange) ** 2).reduce((a, b) => a + b, 0) / rangeValues.length);

    const variabilityPatterns = [
      {
        baseline_id: randomUUID(),
        pattern_type: 'variability_cv',
        hour_of_day: 0,
        scenario: '',
        mean_glucose: meanCv,
        std_glucose: stdCv,
        p10_glucose: meanCv - 1.28 * stdCv,
        p25_glucose: meanCv - 0.67 * stdCv,
        p50_glucose: meanCv,
        p75_glucose: meanCv + 0.67 * stdCv,
        p90_glucose: meanCv + 1.28 * stdCv,
        threshold_hypo: 0,
        threshold_hyper: 36,
        sample_count: dailyStats.length,
        model_version: 'v1',
      },
      {
        baseline_id: randomUUID(),
        pattern_type: 'variability_range',
        hour_of_day: 0,
        scenario: '',
        mean_glucose: meanRange,
        std_glucose: stdRange,
        p10_glucose: meanRange - 1.28 * stdRange,
        p25_glucose: meanRange - 0.67 * stdRange,
        p50_glucose: meanRange,
        p75_glucose: meanRange + 0.67 * stdRange,
        p90_glucose: meanRange + 1.28 * stdRange,
        threshold_hypo: 0,
        threshold_hyper: meanRange + 2 * stdRange,
        sample_count: dailyStats.length,
        model_version: 'v1',
      },
    ];

    await clickhouse.insert('cgm_learned_baselines', variabilityPatterns);
    
    logger.info(`[CgmPatternLearner] Learned ${variabilityPatterns.length} variability patterns`);
    return variabilityPatterns.length;
  }

  async getLearnedBaselines(): Promise<{
    hourly: LearnedCgmBaseline[];
    global: LearnedCgmBaseline | null;
    scenarios: Record<string, LearnedCgmBaseline>;
    variability: { cv: number; range: number } | null;
  }> {
    const sql = `
      SELECT *
      FROM flo_health.cgm_learned_baselines
      ORDER BY pattern_type, hour_of_day
    `;

    const rows = await clickhouse.query<any>(sql, {});

    const hourly: LearnedCgmBaseline[] = [];
    let global: LearnedCgmBaseline | null = null;
    const scenarios: Record<string, LearnedCgmBaseline> = {};
    let variability: { cv: number; range: number } | null = null;

    for (const row of rows) {
      const baseline: LearnedCgmBaseline = {
        hour_of_day: row.hour_of_day,
        mean_glucose: row.mean_glucose,
        std_glucose: row.std_glucose,
        p10_glucose: row.p10_glucose,
        p25_glucose: row.p25_glucose,
        p50_glucose: row.p50_glucose,
        p75_glucose: row.p75_glucose,
        p90_glucose: row.p90_glucose,
        sample_count: row.sample_count,
      };

      if (row.pattern_type === 'hourly_baseline') {
        hourly.push(baseline);
      } else if (row.pattern_type === 'global_baseline') {
        global = baseline;
      } else if (row.pattern_type === 'scenario_baseline' && row.scenario) {
        scenarios[row.scenario] = baseline;
      } else if (row.pattern_type === 'variability_cv') {
        variability = variability || { cv: 0, range: 0 };
        variability.cv = row.mean_glucose;
      } else if (row.pattern_type === 'variability_range') {
        variability = variability || { cv: 0, range: 0 };
        variability.range = row.mean_glucose;
      }
    }

    return { hourly, global, scenarios, variability };
  }

  async scoreGlucoseReading(
    glucoseMgDl: number,
    hourOfDay: number
  ): Promise<{
    zScore: number;
    percentile: number;
    isAnomaly: boolean;
    anomalyType: 'hypo' | 'hyper' | 'unusual_for_time' | null;
    confidence: number;
  }> {
    const baselines = await this.getLearnedBaselines();

    const hourlyBaseline = baselines.hourly.find(h => h.hour_of_day === hourOfDay);
    const baseline = hourlyBaseline || baselines.global;

    if (!baseline) {
      return {
        zScore: 0,
        percentile: 50,
        isAnomaly: glucoseMgDl < 70 || glucoseMgDl > 180,
        anomalyType: glucoseMgDl < 70 ? 'hypo' : glucoseMgDl > 180 ? 'hyper' : null,
        confidence: 0.3,
      };
    }

    const zScore = (glucoseMgDl - baseline.mean_glucose) / (baseline.std_glucose || 1);

    let percentile: number;
    if (glucoseMgDl <= baseline.p10_glucose) percentile = 10;
    else if (glucoseMgDl <= baseline.p25_glucose) percentile = 25;
    else if (glucoseMgDl <= baseline.p50_glucose) percentile = 50;
    else if (glucoseMgDl <= baseline.p75_glucose) percentile = 75;
    else if (glucoseMgDl <= baseline.p90_glucose) percentile = 90;
    else percentile = 95;

    let anomalyType: 'hypo' | 'hyper' | 'unusual_for_time' | null = null;
    let isAnomaly = false;

    if (glucoseMgDl < 70) {
      anomalyType = 'hypo';
      isAnomaly = true;
    } else if (glucoseMgDl > 180) {
      anomalyType = 'hyper';
      isAnomaly = true;
    } else if (Math.abs(zScore) > 2.5) {
      anomalyType = 'unusual_for_time';
      isAnomaly = true;
    }

    const confidence = hourlyBaseline 
      ? Math.min(0.95, 0.5 + (baseline.sample_count / 1000) * 0.45)
      : 0.6;

    return {
      zScore: Math.round(zScore * 100) / 100,
      percentile,
      isAnomaly,
      anomalyType,
      confidence,
    };
  }
}

export const cgmPatternLearner = new CgmPatternLearner();
