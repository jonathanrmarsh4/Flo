import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { clickhouse } from './clickhouseService';
import { logger } from '../logger';

interface SyntheticCgmReading {
  glucose_mg_dl: number;
  glucose_mmol_l: number;
  timestamp: string;
  patient_type: string;
  scenario: string;
  source: string;
  trend: string;
  is_hypo: boolean;
  is_severe_hypo: boolean;
  is_hyper: boolean;
  is_severe_hyper: boolean;
  is_in_range: boolean;
  range_label: string;
}

interface SyntheticDataset {
  generated_at: string;
  total_readings: number;
  patients_simulated: number;
  days_per_patient: number;
  patient_summaries: Array<{
    patient: string;
    scenario: string;
    readings_count: number;
    mean_glucose: number;
    std_glucose: number;
    min_glucose: number;
    max_glucose: number;
    time_in_range: number;
    hypo_events: number;
    hyper_events: number;
  }>;
  anomaly_patterns: {
    hypo_count: number;
    hyper_count: number;
    rapid_change_count: number;
    dawn_phenomenon_count: number;
    nocturnal_hypo_count: number;
  };
  readings: SyntheticCgmReading[];
}

export class SyntheticCgmService {
  private static TRAINING_HEALTH_ID_PREFIX = 'synthetic_training_';

  async generateAndInjectData(options: {
    numPatients?: number;
    daysPerPatient?: number;
    targetHealthId?: string;
  } = {}): Promise<{
    success: boolean;
    readingsInjected: number;
    patientsSimulated: number;
    anomalyPatterns: {
      hypo_count: number;
      hyper_count: number;
      rapid_change_count: number;
    };
    error?: string;
  }> {
    const { numPatients = 5, daysPerPatient = 7 } = options;
    
    logger.info(`[SyntheticCGM] Generating synthetic data: ${numPatients} patients x ${daysPerPatient} days`);

    try {
      const dataset = await this.runSimglucose(numPatients, daysPerPatient);
      
      if (!dataset || dataset.readings.length === 0) {
        return {
          success: false,
          readingsInjected: 0,
          patientsSimulated: 0,
          anomalyPatterns: { hypo_count: 0, hyper_count: 0, rapid_change_count: 0 },
          error: 'No readings generated from simglucose',
        };
      }

      const injected = await this.injectToClickhouse(dataset, options.targetHealthId);

      logger.info(`[SyntheticCGM] Successfully injected ${injected} readings`);

      return {
        success: true,
        readingsInjected: injected,
        patientsSimulated: dataset.patients_simulated,
        anomalyPatterns: {
          hypo_count: dataset.anomaly_patterns.hypo_count,
          hyper_count: dataset.anomaly_patterns.hyper_count,
          rapid_change_count: dataset.anomaly_patterns.rapid_change_count,
        },
      };
    } catch (error) {
      logger.error('[SyntheticCGM] Generation failed:', error);
      return {
        success: false,
        readingsInjected: 0,
        patientsSimulated: 0,
        anomalyPatterns: { hypo_count: 0, hyper_count: 0, rapid_change_count: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private runSimglucose(numPatients: number, daysPerPatient: number): Promise<SyntheticDataset> {
    return new Promise((resolve, reject) => {
      const outputFile = `/tmp/synthetic_cgm_${Date.now()}.json`;
      
      const pythonProcess = spawn('python', [
        'scripts/generate_synthetic_cgm.py',
        '--patients', numPatients.toString(),
        '--days', daysPerPatient.toString(),
        '--output', outputFile,
      ], {
        cwd: process.cwd(),
        env: process.env,
      });

      let stderr = '';

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug(`[SyntheticCGM] Python: ${data.toString().trim()}`);
      });

      pythonProcess.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const fs = await import('fs/promises');
          const content = await fs.readFile(outputFile, 'utf-8');
          const dataset = JSON.parse(content) as SyntheticDataset;
          
          await fs.unlink(outputFile).catch(() => {});
          
          resolve(dataset);
        } catch (error) {
          reject(error);
        }
      });

      pythonProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async injectToClickhouse(
    dataset: SyntheticDataset,
    targetHealthId?: string
  ): Promise<number> {
    const healthId = targetHealthId || `${SyntheticCgmService.TRAINING_HEALTH_ID_PREFIX}${Date.now()}`;
    
    const rows = dataset.readings.map((reading) => ({
      health_id: healthId,
      reading_id: randomUUID(),
      glucose_mg_dl: reading.glucose_mg_dl,
      reading_type: 'cgm',
      recorded_at: new Date(reading.timestamp).toISOString(),
      local_date: reading.timestamp.split('T')[0],
      device_name: 'simglucose_simulator',
      device_manufacturer: 'UVA/Padova',
      trend_direction: reading.trend,
      is_calibration: 0,
      meal_context: reading.scenario,
      exercise_context: null,
    }));

    const batchSize = 1000;
    let injected = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await clickhouse.insert('cgm_glucose', batch);
      injected += batch.length;
      logger.debug(`[SyntheticCGM] Injected batch ${Math.floor(i / batchSize) + 1}, total: ${injected}`);
    }

    await this.storeSyntheticMetadata(healthId, dataset);

    return injected;
  }

  private async storeSyntheticMetadata(
    healthId: string,
    dataset: SyntheticDataset
  ): Promise<void> {
    const metadataRows = dataset.patient_summaries.map((summary) => ({
      health_id: healthId,
      metric_type: 'synthetic_cgm_metadata',
      value: summary.mean_glucose,
      recorded_at: new Date().toISOString(),
      local_date: new Date().toISOString().split('T')[0],
      source: 'simglucose',
    }));

    if (metadataRows.length > 0) {
      await clickhouse.insert('health_metrics', metadataRows);
    }
  }

  async getSyntheticDataStats(): Promise<{
    totalSyntheticReadings: number;
    syntheticHealthIds: string[];
    oldestData: string | null;
    newestData: string | null;
  }> {
    try {
      const sql = `
        SELECT 
          count() as total_readings,
          groupUniqArray(health_id) as health_ids,
          min(recorded_at) as oldest,
          max(recorded_at) as newest
        FROM flo_health.cgm_glucose
        WHERE health_id LIKE '${SyntheticCgmService.TRAINING_HEALTH_ID_PREFIX}%'
      `;

      const rows = await clickhouse.query<{
        total_readings: number;
        health_ids: string[];
        oldest: string;
        newest: string;
      }>(sql, {});

      if (rows.length === 0) {
        return {
          totalSyntheticReadings: 0,
          syntheticHealthIds: [],
          oldestData: null,
          newestData: null,
        };
      }

      return {
        totalSyntheticReadings: rows[0].total_readings,
        syntheticHealthIds: rows[0].health_ids || [],
        oldestData: rows[0].oldest || null,
        newestData: rows[0].newest || null,
      };
    } catch (error) {
      logger.error('[SyntheticCGM] Failed to get stats:', error);
      return {
        totalSyntheticReadings: 0,
        syntheticHealthIds: [],
        oldestData: null,
        newestData: null,
      };
    }
  }

  async clearSyntheticData(): Promise<number> {
    try {
      const sql = `
        ALTER TABLE flo_health.cgm_glucose 
        DELETE WHERE health_id LIKE '${SyntheticCgmService.TRAINING_HEALTH_ID_PREFIX}%'
      `;

      await clickhouse.command(sql);
      logger.info('[SyntheticCGM] Cleared all synthetic training data');
      
      return 1;
    } catch (error) {
      logger.error('[SyntheticCGM] Failed to clear synthetic data:', error);
      return 0;
    }
  }
}

export const syntheticCgmService = new SyntheticCgmService();
