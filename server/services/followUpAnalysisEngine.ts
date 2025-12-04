import { createLogger } from '../utils/logger';
import {
  getFollowUpRequests,
  updateFollowUpRequest,
  getUserDailyMetrics,
  getSleepNights,
  getActiveLifeContext,
  FollowUpRequest,
} from './healthStorageRouter';
import { geminiChatClient } from './geminiChatClient';

const logger = createLogger('FollowUpAnalysis');

export interface MetricData {
  metricName: string;
  values: Array<{ date: string; value: number | null }>;
  baseline?: number | null;
  currentAvg?: number | null;
  percentChange?: number | null;
}

export interface AnalysisResult {
  summary: string;
  metrics: MetricData[];
  recommendations: string[];
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  confidence: number;
}

const METRIC_MAPPING: Record<string, { table: 'daily_metrics' | 'sleep'; fields: string[] }> = {
  hrv: { table: 'daily_metrics', fields: ['hrvMs', 'hrvAvgMs'] },
  heart_rate_variability: { table: 'daily_metrics', fields: ['hrvMs', 'hrvAvgMs'] },
  sleep: { table: 'sleep', fields: ['totalMinutes', 'sleepScore'] },
  sleep_quality: { table: 'sleep', fields: ['sleepScore', 'deepMinutes', 'remMinutes'] },
  resting_heart_rate: { table: 'daily_metrics', fields: ['restingHr', 'restingHrBpm'] },
  rhr: { table: 'daily_metrics', fields: ['restingHr', 'restingHrBpm'] },
  steps: { table: 'daily_metrics', fields: ['stepsNormalized', 'stepsRawSum'] },
  energy: { table: 'daily_metrics', fields: ['activeEnergyKcal'] },
  exercise: { table: 'daily_metrics', fields: ['exerciseMinutes'] },
  recovery: { table: 'daily_metrics', fields: ['hrvMs', 'restingHr', 'sleepQualityScore'] },
  readiness: { table: 'daily_metrics', fields: ['hrvMs', 'restingHr', 'sleepQualityScore'] },
  weight: { table: 'daily_metrics', fields: ['bodyMassKg'] },
  respiratory_rate: { table: 'daily_metrics', fields: ['respiratoryRate'] },
  oxygen: { table: 'daily_metrics', fields: ['oxygenSaturation'] },
  spo2: { table: 'daily_metrics', fields: ['oxygenSaturation'] },
};

function normalizeMetricName(metric: string): string {
  return metric.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export async function gatherMetricData(
  healthId: string,
  metrics: string[],
  daysBack: number = 7
): Promise<MetricData[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  
  const result: MetricData[] = [];
  
  for (const metric of metrics) {
    const normalized = normalizeMetricName(metric);
    const mapping = METRIC_MAPPING[normalized];
    
    if (!mapping) {
      logger.warn('[FollowUpAnalysis] Unknown metric requested', { metric, normalized });
      result.push({
        metricName: metric,
        values: [],
        currentAvg: null,
        percentChange: null,
      });
      continue;
    }
    
    try {
      if (mapping.table === 'daily_metrics') {
        const dailyMetrics = await getUserDailyMetrics(healthId, { startDate, endDate });
        
        const values: Array<{ date: string; value: number | null }> = [];
        
        for (const day of dailyMetrics) {
          const date = (day as any).local_date || (day as any).localDate || '';
          let value: number | null = null;
          
          for (const field of mapping.fields) {
            const camelField = field;
            const snakeField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
            const val = (day as any)[camelField] ?? (day as any)[snakeField];
            if (val != null && typeof val === 'number') {
              value = val;
              break;
            }
          }
          
          values.push({ date, value });
        }
        
        const validValues = values.filter(v => v.value != null).map(v => v.value as number);
        const currentAvg = validValues.length > 0 
          ? validValues.reduce((a, b) => a + b, 0) / validValues.length 
          : null;
        
        result.push({
          metricName: metric,
          values,
          currentAvg,
          percentChange: null,
        });
        
      } else if (mapping.table === 'sleep') {
        const sleepNights = await getSleepNights(healthId, { startDate, endDate });
        
        const values: Array<{ date: string; value: number | null }> = [];
        
        for (const night of sleepNights) {
          const date = (night as any).sleep_date || (night as any).sleepDate || '';
          let value: number | null = null;
          
          for (const field of mapping.fields) {
            const camelField = field;
            const snakeField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
            const val = (night as any)[camelField] ?? (night as any)[snakeField];
            if (val != null && typeof val === 'number') {
              value = val;
              break;
            }
          }
          
          values.push({ date, value });
        }
        
        const validValues = values.filter(v => v.value != null).map(v => v.value as number);
        const currentAvg = validValues.length > 0 
          ? validValues.reduce((a, b) => a + b, 0) / validValues.length 
          : null;
        
        result.push({
          metricName: metric,
          values,
          currentAvg,
          percentChange: null,
        });
      }
    } catch (error: any) {
      logger.error('[FollowUpAnalysis] Error gathering metric data', { 
        healthId, 
        metric, 
        error: error.message 
      });
      result.push({
        metricName: metric,
        values: [],
        currentAvg: null,
        percentChange: null,
      });
    }
  }
  
  return result;
}

export async function analyzeFollowUp(
  request: FollowUpRequest,
  healthId: string
): Promise<AnalysisResult> {
  const startTime = Date.now();
  
  const daysBack = 7;
  const metricData = await gatherMetricData(healthId, request.metrics, daysBack);
  
  const lifeContext = await getActiveLifeContext(healthId);
  
  const hasData = metricData.some(m => m.values.some(v => v.value != null));
  
  if (!hasData) {
    return {
      summary: `Unable to analyze "${request.intent_summary}" - no data available for the requested metrics (${request.metrics.join(', ')}) in the past ${daysBack} days.`,
      metrics: metricData,
      recommendations: ['Ensure your wearable device is syncing data properly'],
      trend: 'insufficient_data',
      confidence: 0.1,
    };
  }
  
  const prompt = buildAnalysisPrompt(request, metricData, lifeContext);
  
  try {
    const text = await geminiChatClient.chat([
      { role: 'user', content: prompt }
    ], { maxTokens: 500 });
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    const analysis: AnalysisResult = {
      summary: parsed.summary || 'Analysis complete.',
      metrics: metricData,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [parsed.recommendation || 'Continue monitoring'],
      trend: parsed.trend || 'stable',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
    
    logger.info('[FollowUpAnalysis] Analysis complete', {
      requestId: request.id,
      healthId,
      metricsCount: metricData.length,
      duration: Date.now() - startTime,
    });
    
    return analysis;
  } catch (error: any) {
    logger.error('[FollowUpAnalysis] Gemini analysis failed', {
      requestId: request.id,
      error: error.message,
    });
    
    return generateFallbackAnalysis(request, metricData);
  }
}

function buildAnalysisPrompt(
  request: FollowUpRequest,
  metricData: MetricData[],
  lifeContext: any[]
): string {
  const metricsSection = metricData.map(m => {
    const validValues = m.values.filter(v => v.value != null);
    const latestValues = validValues.slice(-7);
    return `
Metric: ${m.metricName}
- Recent values: ${latestValues.map(v => `${v.date}: ${v.value}`).join(', ') || 'No data'}
- Average: ${m.currentAvg?.toFixed(2) || 'N/A'}`;
  }).join('\n');
  
  const contextSection = lifeContext.length > 0
    ? `\nActive Life Context:\n${lifeContext.map(c => `- ${c.category}: ${c.description} (${c.expected_impact})`).join('\n')}`
    : '';
  
  return `You are a health data analyst reviewing a user's follow-up request.

USER'S ORIGINAL REQUEST: "${request.original_transcript}"
INTENT SUMMARY: ${request.intent_summary}
METRICS REQUESTED: ${request.metrics.join(', ')}
COMPARISON BASELINE: ${request.comparison_baseline}
DAYS SINCE REQUEST: ${request.created_at ? Math.floor((Date.now() - new Date(request.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0}

HEALTH DATA:
${metricsSection}
${contextSection}

Analyze this data and provide a JSON response with:
{
  "summary": "A 1-2 sentence summary of findings relevant to their original request",
  "trend": "improving" | "stable" | "declining" | "insufficient_data",
  "confidence": 0.0-1.0 (how confident in the analysis given data quality),
  "recommendations": ["1-3 brief actionable recommendations"]
}

Focus on directly answering their question. Be specific about numbers and changes.
If comparing to a baseline, calculate and mention the percent change.`;
}

function generateFallbackAnalysis(
  request: FollowUpRequest,
  metricData: MetricData[]
): AnalysisResult {
  const dataPoints = metricData.flatMap(m => m.values.filter(v => v.value != null));
  
  if (dataPoints.length === 0) {
    return {
      summary: `No data available to analyze "${request.intent_summary}".`,
      metrics: metricData,
      recommendations: ['Sync your wearable to capture health data'],
      trend: 'insufficient_data',
      confidence: 0.1,
    };
  }
  
  const metricsWithData = metricData.filter(m => m.currentAvg != null);
  const summaryParts = metricsWithData.map(m => 
    `${m.metricName}: avg ${m.currentAvg?.toFixed(1)}`
  );
  
  return {
    summary: `Based on the last 7 days: ${summaryParts.join(', ') || 'limited data'}.`,
    metrics: metricData,
    recommendations: [
      'Continue monitoring your metrics',
      'Consider syncing more data for better insights',
    ],
    trend: 'stable',
    confidence: 0.4,
  };
}

export async function evaluateAndStoreFindings(
  request: FollowUpRequest & { health_id: string },
  neonUserId: string
): Promise<AnalysisResult | null> {
  const startTime = Date.now();
  const healthId = request.health_id;
  
  try {
    logger.info('[FollowUpAnalysis] Evaluating follow-up request', {
      requestId: request.id,
      healthId,
      neonUserId,
      intent: request.intent_summary,
      metrics: request.metrics,
    });
    
    const analysis = await analyzeFollowUp(request, healthId);
    
    await updateFollowUpRequest(request.id!, {
      status: 'completed',
      findings: {
        summary: analysis.summary,
        metrics: analysis.metrics.reduce((acc, m) => {
          acc[m.metricName] = {
            avg: m.currentAvg,
            percentChange: m.percentChange,
            values: m.values,
          };
          return acc;
        }, {} as Record<string, any>),
        recommendation: analysis.recommendations.join('; '),
        data_points: analysis.metrics.flatMap(m => m.values.filter(v => v.value != null)),
      },
      evaluated_at: new Date(),
    });
    
    logger.info('[FollowUpAnalysis] Follow-up evaluated and stored', {
      requestId: request.id,
      healthId,
      trend: analysis.trend,
      confidence: analysis.confidence,
      duration: Date.now() - startTime,
    });
    
    return analysis;
  } catch (error: any) {
    logger.error('[FollowUpAnalysis] Failed to evaluate follow-up', {
      requestId: request.id,
      healthId,
      error: error.message,
    });
    
    await updateFollowUpRequest(request.id!, {
      status: 'failed',
      findings: {
        summary: 'Analysis failed - please try again later.',
        recommendation: 'Please try again later.',
      },
      evaluated_at: new Date(),
    });
    
    return null;
  }
}
