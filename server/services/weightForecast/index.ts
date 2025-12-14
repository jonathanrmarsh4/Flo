/**
 * Weight & Body Composition Forecasting Engine
 * 
 * Provides ML-driven weight forecasting with:
 * - Multi-source data ingestion (HealthKit, manual, DEXA, CGM)
 * - Daily feature aggregation and trend analysis
 * - Personalized forecast bands with confidence intervals
 * - Driver attribution and scenario simulation
 */

export { initializeWeightForecastSchema, queueForecastRecompute } from './clickhouseSchema';
export { 
  startWeightForecastOrchestrator, 
  stopWeightForecastOrchestrator,
  runHourlyJobs,
  runRecomputeQueueJob,
  triggerHourlyJobs,
  triggerRecomputeQueueJob,
  getOrchestrationStats,
  type JobResult,
  type OrchestrationStats 
} from './orchestrationJobs';
export {
  startForecastWorker,
  stopForecastWorker,
  processUserForecastManual,
  getWorkerStats,
  type WorkerStats
} from './forecastWorker';
export {
  syncHealthKitWeightSamples,
  insertManualWeighIn,
  insertManualBodyComp,
  syncHistoricalWeightFromSupabase,
  type HealthKitSample,
  type WeightEvent,
  type BodyCompEvent
} from './dataIngestion';
