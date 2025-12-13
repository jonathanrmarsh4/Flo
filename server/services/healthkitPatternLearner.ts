import { randomUUID } from 'crypto';
import * as clickhouse from './clickhouseService';
import { logger } from '../logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface LearnedHealthKitBaseline {
  metric_name: string;
  stratification_key: string | null;
  mean_value: number;
  std_value: number;
  p5_value: number;
  p10_value: number;
  p25_value: number;
  p50_value: number;
  p75_value: number;
  p90_value: number;
  p95_value: number;
  sample_count: number;
}

interface TrainingResult {
  success: boolean;
  metricsLearned: number;
  totalBaselines: number;
  syntheticRecordsUsed: number;
  error?: string;
}

export class HealthKitPatternLearner {
  private static HEALTHKIT_BASELINES_PATH = path.join(process.cwd(), 'scripts', 'healthkit_baselines.json');
  private static HEALTHKIT_DATA_PATH = path.join(process.cwd(), 'scripts', 'synthetic_healthkit_data.json');

  async initializeLearnedBaselinesTable(): Promise<boolean> {
    try {
      const ch = clickhouse.getClickHouseClient();
      if (!ch) {
        logger.warn('[HealthKitPatternLearner] ClickHouse not available');
        return false;
      }

      await ch.command({
        query: `
          CREATE TABLE IF NOT EXISTS flo_health.healthkit_learned_baselines (
            baseline_id String,
            metric_type LowCardinality(String),
            hour_of_day Int8 DEFAULT -1,
            day_of_week Int8 DEFAULT -1,
            age_group String DEFAULT '',
            activity_level String DEFAULT '',
            chronotype String DEFAULT '',
            stratification_type LowCardinality(String),
            mean_value Float64,
            std_value Float64,
            p5_value Float64,
            p10_value Float64,
            p25_value Float64,
            p50_value Float64,
            p75_value Float64,
            p90_value Float64,
            p95_value Float64,
            min_value Float64,
            max_value Float64,
            sample_count UInt32,
            unit String DEFAULT '',
            data_source String DEFAULT 'synthetic',
            trained_at DateTime64(3) DEFAULT now64(3),
            model_version String DEFAULT 'v1'
          )
          ENGINE = ReplacingMergeTree(trained_at)
          ORDER BY (metric_type, stratification_type, hour_of_day, day_of_week, baseline_id)
        `,
      });

      logger.info('[HealthKitPatternLearner] Learned baselines table initialized');
      return true;
    } catch (error) {
      logger.error('[HealthKitPatternLearner] Failed to initialize table:', error);
      return false;
    }
  }

  async trainOnSyntheticData(options: {
    numPeople?: number;
    daysPerPerson?: number;
    regenerateData?: boolean;
  } = {}): Promise<TrainingResult> {
    const { numPeople = 100, daysPerPerson = 30, regenerateData = false } = options;

    try {
      await this.initializeLearnedBaselinesTable();

      if (regenerateData || !fs.existsSync(HealthKitPatternLearner.HEALTHKIT_BASELINES_PATH)) {
        logger.info('[HealthKitPatternLearner] Generating fresh synthetic data...');
        
        try {
          await execAsync('python3 scripts/generate_synthetic_healthkit.py', {
            timeout: 120000,
            cwd: process.cwd(),
          });
        } catch (execError) {
          logger.error('[HealthKitPatternLearner] Python script failed:', execError);
          return {
            success: false,
            metricsLearned: 0,
            totalBaselines: 0,
            syntheticRecordsUsed: 0,
            error: 'Failed to generate synthetic data - Python script error',
          };
        }
      }

      if (!fs.existsSync(HealthKitPatternLearner.HEALTHKIT_BASELINES_PATH)) {
        return {
          success: false,
          metricsLearned: 0,
          totalBaselines: 0,
          syntheticRecordsUsed: 0,
          error: 'HealthKit baselines file not found',
        };
      }

      const rawData = fs.readFileSync(HealthKitPatternLearner.HEALTHKIT_BASELINES_PATH, 'utf-8');
      const healthkitData = JSON.parse(rawData);

      const totalRecords = healthkitData.total_records || 0;
      logger.info(`[HealthKitPatternLearner] Processing baselines from ${totalRecords} synthetic records`);

      const rows: any[] = [];

      const createRow = (metricType: string, stratType: string, stats: any, opts: any = {}) => ({
        baseline_id: randomUUID(),
        metric_type: metricType,
        hour_of_day: opts.hour_of_day ?? -1,
        day_of_week: opts.day_of_week ?? -1,
        age_group: opts.age_group ?? '',
        activity_level: opts.activity_level ?? '',
        chronotype: opts.chronotype ?? '',
        stratification_type: stratType,
        mean_value: stats.mean,
        std_value: stats.std || 0,
        p5_value: stats.p5 || stats.min || 0,
        p10_value: stats.p10 || stats.min || 0,
        p25_value: stats.p25 || 0,
        p50_value: stats.median || stats.p50 || stats.mean,
        p75_value: stats.p75 || 0,
        p90_value: stats.p90 || stats.max || 0,
        p95_value: stats.p95 || stats.max || 0,
        min_value: stats.min || 0,
        max_value: stats.max || 0,
        sample_count: stats.n || 0,
        unit: stats.unit || '',
        data_source: 'synthetic',
        model_version: 'v1',
      });

      for (const [metric, stats] of Object.entries<any>(healthkitData.baselines?.global || {})) {
        if (!stats || typeof stats.mean !== 'number') continue;
        rows.push(createRow(metric, 'global', stats));
      }

      for (const [sex, metrics] of Object.entries<any>(healthkitData.baselines?.by_sex || {})) {
        for (const [metric, stats] of Object.entries<any>(metrics || {})) {
          if (!stats || typeof stats.mean !== 'number') continue;
          rows.push(createRow(metric, 'by_sex', stats, { age_group: sex }));
        }
      }

      for (const [ageGroup, metrics] of Object.entries<any>(healthkitData.baselines?.by_age_group || {})) {
        for (const [metric, stats] of Object.entries<any>(metrics || {})) {
          if (!stats || typeof stats.mean !== 'number') continue;
          rows.push(createRow(metric, 'by_age_group', stats, { age_group: ageGroup }));
        }
      }

      for (const [activityLevel, metrics] of Object.entries<any>(healthkitData.baselines?.by_activity_level || {})) {
        for (const [metric, stats] of Object.entries<any>(metrics || {})) {
          if (!stats || typeof stats.mean !== 'number') continue;
          rows.push(createRow(metric, 'by_activity_level', stats, { activity_level: activityLevel }));
        }
      }

      for (const [metricName, hours] of Object.entries<any>(healthkitData.baselines?.by_hour || {})) {
        for (const [hour, stats] of Object.entries<any>(hours || {})) {
          if (!stats || typeof stats.mean !== 'number') continue;
          rows.push(createRow(metricName, 'by_hour', stats, { hour_of_day: parseInt(hour, 10) }));
        }
      }

      if (rows.length > 0) {
        await clickhouse.insert('healthkit_learned_baselines', rows);
      }

      const uniqueMetrics = new Set(rows.map(r => r.metric_type));

      logger.info(`[HealthKitPatternLearner] Training complete: ${uniqueMetrics.size} metrics, ${rows.length} baselines`);

      return {
        success: true,
        metricsLearned: uniqueMetrics.size,
        totalBaselines: rows.length,
        syntheticRecordsUsed: totalRecords,
      };
    } catch (error) {
      logger.error('[HealthKitPatternLearner] Training failed:', error);
      return {
        success: false,
        metricsLearned: 0,
        totalBaselines: 0,
        syntheticRecordsUsed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getLearnedBaselines(): Promise<{
    global: Record<string, LearnedHealthKitBaseline>;
    bySex: Record<string, Record<string, LearnedHealthKitBaseline>>;
    byAgeGroup: Record<string, Record<string, LearnedHealthKitBaseline>>;
    byActivityLevel: Record<string, Record<string, LearnedHealthKitBaseline>>;
    byHour: Record<string, Record<string, LearnedHealthKitBaseline>>;
    metricCount: number;
    totalBaselines: number;
  }> {
    // NOTE: Do not use FINAL - SharedMergeTree doesn't support it
    const sql = `
      SELECT *
      FROM flo_health.healthkit_learned_baselines
      ORDER BY metric_type, stratification_type
    `;

    const rows = await clickhouse.query<any>(sql, {});

    const result = {
      global: {} as Record<string, LearnedHealthKitBaseline>,
      bySex: {} as Record<string, Record<string, LearnedHealthKitBaseline>>,
      byAgeGroup: {} as Record<string, Record<string, LearnedHealthKitBaseline>>,
      byActivityLevel: {} as Record<string, Record<string, LearnedHealthKitBaseline>>,
      byHour: {} as Record<string, Record<string, LearnedHealthKitBaseline>>,
      metricCount: 0,
      totalBaselines: rows.length,
    };

    const metrics = new Set<string>();

    for (const row of rows) {
      const baseline: LearnedHealthKitBaseline = {
        metric_name: row.metric_type,
        stratification_key: row.age_group || row.activity_level || (row.hour_of_day >= 0 ? String(row.hour_of_day) : null),
        mean_value: row.mean_value,
        std_value: row.std_value,
        p5_value: row.p5_value,
        p10_value: row.p10_value,
        p25_value: row.p25_value,
        p50_value: row.p50_value,
        p75_value: row.p75_value,
        p90_value: row.p90_value,
        p95_value: row.p95_value,
        sample_count: row.sample_count,
      };

      metrics.add(row.metric_type);
      const key = row.age_group || row.activity_level || (row.hour_of_day >= 0 ? String(row.hour_of_day) : '');

      if (row.stratification_type === 'global') {
        result.global[row.metric_type] = baseline;
      } else if (row.stratification_type === 'by_sex' && key) {
        if (!result.bySex[key]) result.bySex[key] = {};
        result.bySex[key][row.metric_type] = baseline;
      } else if (row.stratification_type === 'by_age_group' && key) {
        if (!result.byAgeGroup[key]) result.byAgeGroup[key] = {};
        result.byAgeGroup[key][row.metric_type] = baseline;
      } else if (row.stratification_type === 'by_activity_level' && key) {
        if (!result.byActivityLevel[key]) result.byActivityLevel[key] = {};
        result.byActivityLevel[key][row.metric_type] = baseline;
      } else if (row.stratification_type === 'by_hour' && key) {
        if (!result.byHour[key]) result.byHour[key] = {};
        result.byHour[key][row.metric_type] = baseline;
      }
    }

    result.metricCount = metrics.size;
    return result;
  }

  async scoreHealthKitValue(
    metricName: string,
    value: number,
    options?: {
      ageGroup?: string;
      sex?: string;
      activityLevel?: string;
      hourOfDay?: number;
    }
  ): Promise<{
    zScore: number;
    percentile: number;
    isAnomaly: boolean;
    anomalyType: 'low' | 'high' | null;
    severity: 'mild' | 'moderate' | 'severe' | null;
    confidence: number;
    baselineUsed: string;
  }> {
    const baselines = await this.getLearnedBaselines();

    let baseline: LearnedHealthKitBaseline | null = null;
    let baselineUsed = 'none';

    if (options?.hourOfDay !== undefined) {
      const hourKey = String(options.hourOfDay);
      baseline = baselines.byHour[hourKey]?.[metricName] || null;
      if (baseline) baselineUsed = `hour_${hourKey}`;
    }

    if (!baseline && options?.activityLevel) {
      baseline = baselines.byActivityLevel[options.activityLevel]?.[metricName] || null;
      if (baseline) baselineUsed = `activity_${options.activityLevel}`;
    }

    if (!baseline && options?.ageGroup) {
      baseline = baselines.byAgeGroup[options.ageGroup]?.[metricName] || null;
      if (baseline) baselineUsed = `age_${options.ageGroup}`;
    }

    if (!baseline && options?.sex) {
      baseline = baselines.bySex[options.sex]?.[metricName] || null;
      if (baseline) baselineUsed = `sex_${options.sex}`;
    }

    if (!baseline) {
      baseline = baselines.global[metricName] || null;
      if (baseline) baselineUsed = 'global';
    }

    if (!baseline) {
      return {
        zScore: 0,
        percentile: 50,
        isAnomaly: false,
        anomalyType: null,
        severity: null,
        confidence: 0,
        baselineUsed: 'none',
      };
    }

    const zScore = baseline.std_value > 0 
      ? (value - baseline.mean_value) / baseline.std_value 
      : 0;

    let percentile = 50;
    if (value <= baseline.p5_value) percentile = 5;
    else if (value <= baseline.p10_value) percentile = 10;
    else if (value <= baseline.p25_value) percentile = 25;
    else if (value <= baseline.p50_value) percentile = 50;
    else if (value <= baseline.p75_value) percentile = 75;
    else if (value <= baseline.p90_value) percentile = 90;
    else if (value <= baseline.p95_value) percentile = 95;
    else percentile = 99;

    let isAnomaly = false;
    let anomalyType: 'low' | 'high' | null = null;
    let severity: 'mild' | 'moderate' | 'severe' | null = null;

    if (Math.abs(zScore) >= 2) {
      isAnomaly = true;
      anomalyType = zScore < 0 ? 'low' : 'high';

      if (Math.abs(zScore) >= 3) {
        severity = 'severe';
      } else if (Math.abs(zScore) >= 2.5) {
        severity = 'moderate';
      } else {
        severity = 'mild';
      }
    }

    const confidence = Math.min(0.95, 0.5 + (baseline.sample_count / 2000) * 0.45);

    return {
      zScore: Math.round(zScore * 100) / 100,
      percentile,
      isAnomaly,
      anomalyType,
      severity,
      confidence,
      baselineUsed,
    };
  }

  async getBaselineStats(): Promise<{
    hasLearnedBaselines: boolean;
    metricCount: number;
    totalBaselines: number;
    stratifications: {
      global: number;
      bySex: number;
      byAgeGroup: number;
      byActivityLevel: number;
      byHour: number;
    };
    dataSource: string | null;
    trainedAt: string | null;
  }> {
    try {
      // NOTE: Do not use FINAL - SharedMergeTree doesn't support it
      const countSql = `
        SELECT 
          stratification_type,
          count() as cnt,
          uniq(metric_type) as metric_count,
          max(trained_at) as last_trained,
          any(data_source) as source
        FROM flo_health.healthkit_learned_baselines
        GROUP BY stratification_type
      `;

      const rows = await clickhouse.query<any>(countSql, {});

      if (rows.length === 0) {
        return {
          hasLearnedBaselines: false,
          metricCount: 0,
          totalBaselines: 0,
          stratifications: { global: 0, bySex: 0, byAgeGroup: 0, byActivityLevel: 0, byHour: 0 },
          dataSource: null,
          trainedAt: null,
        };
      }

      const stratifications = { global: 0, bySex: 0, byAgeGroup: 0, byActivityLevel: 0, byHour: 0 };
      let totalBaselines = 0;
      let metricCount = 0;
      let dataSource: string | null = null;
      let trainedAt: string | null = null;

      for (const row of rows) {
        totalBaselines += Number(row.cnt);
        metricCount = Math.max(metricCount, Number(row.metric_count));
        dataSource = row.source;
        trainedAt = row.last_trained;

        if (row.stratification_type === 'global') stratifications.global = Number(row.cnt);
        else if (row.stratification_type === 'by_sex') stratifications.bySex = Number(row.cnt);
        else if (row.stratification_type === 'by_age_group') stratifications.byAgeGroup = Number(row.cnt);
        else if (row.stratification_type === 'by_activity_level') stratifications.byActivityLevel = Number(row.cnt);
        else if (row.stratification_type === 'by_hour') stratifications.byHour = Number(row.cnt);
      }

      return {
        hasLearnedBaselines: totalBaselines > 0,
        metricCount,
        totalBaselines,
        stratifications,
        dataSource,
        trainedAt,
      };
    } catch (error) {
      logger.error('[HealthKitPatternLearner] Failed to get baseline stats:', error);
      return {
        hasLearnedBaselines: false,
        metricCount: 0,
        totalBaselines: 0,
        stratifications: { global: 0, bySex: 0, byAgeGroup: 0, byActivityLevel: 0, byHour: 0 },
        dataSource: null,
        trainedAt: null,
      };
    }
  }
}

export const healthkitPatternLearner = new HealthKitPatternLearner();
