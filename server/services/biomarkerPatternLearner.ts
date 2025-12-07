import { randomUUID } from 'crypto';
import * as clickhouse from './clickhouseService';
import { logger } from '../logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface LearnedBiomarkerBaseline {
  biomarker_name: string;
  age_group: string | null;
  sex: string | null;
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
  unit: string;
}

interface TrainingResult {
  success: boolean;
  biomarkersLearned: number;
  totalBaselines: number;
  dataSource: string;
  error?: string;
}

export class BiomarkerPatternLearner {
  private static NHANES_BASELINES_PATH = path.join(process.cwd(), 'scripts', 'nhanes_biomarker_baselines.json');

  async initializeLearnedBaselinesTable(): Promise<boolean> {
    try {
      const ch = clickhouse.getClickHouseClient();
      if (!ch) {
        logger.warn('[BiomarkerPatternLearner] ClickHouse not available');
        return false;
      }

      await ch.command({
        query: `
          CREATE TABLE IF NOT EXISTS flo_health.biomarker_learned_baselines (
            baseline_id String,
            biomarker_name LowCardinality(String),
            age_group Nullable(String),
            sex Nullable(String),
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
            unit String,
            data_source String DEFAULT 'NHANES',
            trained_at DateTime64(3) DEFAULT now64(3),
            model_version String DEFAULT 'v1'
          )
          ENGINE = ReplacingMergeTree(trained_at)
          ORDER BY (biomarker_name, stratification_type, age_group, sex, baseline_id)
        `,
      });

      logger.info('[BiomarkerPatternLearner] Learned baselines table initialized');
      return true;
    } catch (error) {
      logger.error('[BiomarkerPatternLearner] Failed to initialize table:', error);
      return false;
    }
  }

  async trainOnNhanesData(options: {
    regenerateData?: boolean;
  } = {}): Promise<TrainingResult> {
    const { regenerateData = false } = options;

    try {
      await this.initializeLearnedBaselinesTable();

      let nhanesData: any = null;

      if (regenerateData || !fs.existsSync(BiomarkerPatternLearner.NHANES_BASELINES_PATH)) {
        logger.info('[BiomarkerPatternLearner] Fetching fresh NHANES data...');
        
        try {
          await execAsync('python3 scripts/fetch_nhanes_biomarkers.py', {
            timeout: 300000,
            cwd: process.cwd(),
          });
        } catch (execError) {
          logger.error('[BiomarkerPatternLearner] Python script failed:', execError);
          return {
            success: false,
            biomarkersLearned: 0,
            totalBaselines: 0,
            dataSource: 'NHANES',
            error: 'Failed to fetch NHANES data - Python script error',
          };
        }
      }

      if (!fs.existsSync(BiomarkerPatternLearner.NHANES_BASELINES_PATH)) {
        return {
          success: false,
          biomarkersLearned: 0,
          totalBaselines: 0,
          dataSource: 'NHANES',
          error: 'NHANES baselines file not found',
        };
      }

      const rawData = fs.readFileSync(BiomarkerPatternLearner.NHANES_BASELINES_PATH, 'utf-8');
      nhanesData = JSON.parse(rawData);

      const dataSource = nhanesData.data_source || 'NHANES';
      logger.info(`[BiomarkerPatternLearner] Processing baselines from ${dataSource}`);

      const rows: any[] = [];
      const metadata = nhanesData.metadata || {};

      for (const [biomarker, stats] of Object.entries<any>(nhanesData.baselines.global || {})) {
        if (!stats || typeof stats.mean !== 'number') continue;
        
        const biomarkerMeta = metadata[biomarker] || {};
        rows.push({
          baseline_id: randomUUID(),
          biomarker_name: biomarker,
          age_group: null,
          sex: null,
          stratification_type: 'global',
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
          unit: stats.unit || biomarkerMeta.unit || '',
          data_source: dataSource,
          model_version: 'v1',
        });
      }

      for (const [sex, biomarkers] of Object.entries<any>(nhanesData.baselines.by_sex || {})) {
        for (const [biomarker, stats] of Object.entries<any>(biomarkers || {})) {
          if (!stats || typeof stats.mean !== 'number') continue;
          
          const biomarkerMeta = metadata[biomarker] || {};
          rows.push({
            baseline_id: randomUUID(),
            biomarker_name: biomarker,
            age_group: null,
            sex: sex,
            stratification_type: 'by_sex',
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
            unit: stats.unit || biomarkerMeta.unit || '',
            data_source: dataSource,
            model_version: 'v1',
          });
        }
      }

      for (const [ageGroup, biomarkers] of Object.entries<any>(nhanesData.baselines.by_age_group || {})) {
        for (const [biomarker, stats] of Object.entries<any>(biomarkers || {})) {
          if (!stats || typeof stats.mean !== 'number') continue;
          
          const biomarkerMeta = metadata[biomarker] || {};
          rows.push({
            baseline_id: randomUUID(),
            biomarker_name: biomarker,
            age_group: ageGroup,
            sex: null,
            stratification_type: 'by_age_group',
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
            unit: stats.unit || biomarkerMeta.unit || '',
            data_source: dataSource,
            model_version: 'v1',
          });
        }
      }

      for (const [ageGroup, sexData] of Object.entries<any>(nhanesData.baselines.by_age_and_sex || {})) {
        for (const [sex, biomarkers] of Object.entries<any>(sexData || {})) {
          for (const [biomarker, stats] of Object.entries<any>(biomarkers || {})) {
            if (!stats || typeof stats.mean !== 'number') continue;
            
            const biomarkerMeta = metadata[biomarker] || {};
            rows.push({
              baseline_id: randomUUID(),
              biomarker_name: biomarker,
              age_group: ageGroup,
              sex: sex,
              stratification_type: 'by_age_and_sex',
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
              unit: stats.unit || biomarkerMeta.unit || '',
              data_source: dataSource,
              model_version: 'v1',
            });
          }
        }
      }

      if (rows.length > 0) {
        await clickhouse.insert('biomarker_learned_baselines', rows);
      }

      const uniqueBiomarkers = new Set(rows.map(r => r.biomarker_name));

      logger.info(`[BiomarkerPatternLearner] Training complete: ${uniqueBiomarkers.size} biomarkers, ${rows.length} baselines`);

      return {
        success: true,
        biomarkersLearned: uniqueBiomarkers.size,
        totalBaselines: rows.length,
        dataSource: 'NHANES 2021-2023',
      };
    } catch (error) {
      logger.error('[BiomarkerPatternLearner] Training failed:', error);
      return {
        success: false,
        biomarkersLearned: 0,
        totalBaselines: 0,
        dataSource: 'NHANES',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getLearnedBaselines(): Promise<{
    global: Record<string, LearnedBiomarkerBaseline>;
    bySex: Record<string, Record<string, LearnedBiomarkerBaseline>>;
    byAgeGroup: Record<string, Record<string, LearnedBiomarkerBaseline>>;
    byAgeAndSex: Record<string, Record<string, LearnedBiomarkerBaseline>>;
    biomarkerCount: number;
    totalBaselines: number;
  }> {
    const sql = `
      SELECT *
      FROM flo_health.biomarker_learned_baselines
      FINAL
      ORDER BY biomarker_name, stratification_type
    `;

    const rows = await clickhouse.query<any>(sql, {});

    const result = {
      global: {} as Record<string, LearnedBiomarkerBaseline>,
      bySex: { male: {}, female: {} } as Record<string, Record<string, LearnedBiomarkerBaseline>>,
      byAgeGroup: {} as Record<string, Record<string, LearnedBiomarkerBaseline>>,
      byAgeAndSex: {} as Record<string, Record<string, LearnedBiomarkerBaseline>>,
      biomarkerCount: 0,
      totalBaselines: rows.length,
    };

    const biomarkers = new Set<string>();

    for (const row of rows) {
      const baseline: LearnedBiomarkerBaseline = {
        biomarker_name: row.biomarker_name,
        age_group: row.age_group,
        sex: row.sex,
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
        unit: row.unit,
      };

      biomarkers.add(row.biomarker_name);

      if (row.stratification_type === 'global') {
        result.global[row.biomarker_name] = baseline;
      } else if (row.stratification_type === 'by_sex' && row.sex) {
        if (!result.bySex[row.sex]) result.bySex[row.sex] = {};
        result.bySex[row.sex][row.biomarker_name] = baseline;
      } else if (row.stratification_type === 'by_age_group' && row.age_group) {
        if (!result.byAgeGroup[row.age_group]) result.byAgeGroup[row.age_group] = {};
        result.byAgeGroup[row.age_group][row.biomarker_name] = baseline;
      } else if (row.stratification_type === 'by_age_and_sex' && row.age_group && row.sex) {
        const key = `${row.age_group}_${row.sex}`;
        if (!result.byAgeAndSex[key]) result.byAgeAndSex[key] = {};
        result.byAgeAndSex[key][row.biomarker_name] = baseline;
      }
    }

    result.biomarkerCount = biomarkers.size;
    return result;
  }

  async scoreBiomarkerValue(
    biomarkerName: string,
    value: number,
    ageGroup?: string,
    sex?: string
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

    let baseline: LearnedBiomarkerBaseline | null = null;
    let baselineUsed = 'none';

    if (ageGroup && sex) {
      const key = `${ageGroup}_${sex}`;
      baseline = baselines.byAgeAndSex[key]?.[biomarkerName] || null;
      if (baseline) baselineUsed = `age_sex_${key}`;
    }

    if (!baseline && ageGroup) {
      baseline = baselines.byAgeGroup[ageGroup]?.[biomarkerName] || null;
      if (baseline) baselineUsed = `age_${ageGroup}`;
    }

    if (!baseline && sex) {
      baseline = baselines.bySex[sex]?.[biomarkerName] || null;
      if (baseline) baselineUsed = `sex_${sex}`;
    }

    if (!baseline) {
      baseline = baselines.global[biomarkerName] || null;
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

    const confidence = Math.min(0.95, 0.5 + (baseline.sample_count / 5000) * 0.45);

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
    biomarkerCount: number;
    totalBaselines: number;
    stratifications: {
      global: number;
      bySex: number;
      byAgeGroup: number;
      byAgeAndSex: number;
    };
    dataSource: string | null;
    trainedAt: string | null;
  }> {
    try {
      const countSql = `
        SELECT 
          stratification_type,
          count() as cnt,
          uniq(biomarker_name) as biomarker_count,
          max(trained_at) as last_trained,
          any(data_source) as source
        FROM flo_health.biomarker_learned_baselines
        FINAL
        GROUP BY stratification_type
      `;

      const rows = await clickhouse.query<any>(countSql, {});

      if (rows.length === 0) {
        return {
          hasLearnedBaselines: false,
          biomarkerCount: 0,
          totalBaselines: 0,
          stratifications: { global: 0, bySex: 0, byAgeGroup: 0, byAgeAndSex: 0 },
          dataSource: null,
          trainedAt: null,
        };
      }

      const stratifications = { global: 0, bySex: 0, byAgeGroup: 0, byAgeAndSex: 0 };
      let totalBaselines = 0;
      let biomarkerCount = 0;
      let dataSource: string | null = null;
      let trainedAt: string | null = null;

      for (const row of rows) {
        totalBaselines += Number(row.cnt);
        biomarkerCount = Math.max(biomarkerCount, Number(row.biomarker_count));
        dataSource = row.source;
        trainedAt = row.last_trained;

        if (row.stratification_type === 'global') stratifications.global = Number(row.cnt);
        else if (row.stratification_type === 'by_sex') stratifications.bySex = Number(row.cnt);
        else if (row.stratification_type === 'by_age_group') stratifications.byAgeGroup = Number(row.cnt);
        else if (row.stratification_type === 'by_age_and_sex') stratifications.byAgeAndSex = Number(row.cnt);
      }

      return {
        hasLearnedBaselines: totalBaselines > 0,
        biomarkerCount,
        totalBaselines,
        stratifications,
        dataSource,
        trainedAt,
      };
    } catch (error) {
      logger.error('[BiomarkerPatternLearner] Failed to get baseline stats:', error);
      return {
        hasLearnedBaselines: false,
        biomarkerCount: 0,
        totalBaselines: 0,
        stratifications: { global: 0, bySex: 0, byAgeGroup: 0, byAgeAndSex: 0 },
        dataSource: null,
        trainedAt: null,
      };
    }
  }
}

export const biomarkerPatternLearner = new BiomarkerPatternLearner();
