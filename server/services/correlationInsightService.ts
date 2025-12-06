import { bigQueryService } from './bigQueryService';
import { bigQueryBaselineEngine, AnomalyResult } from './bigQueryBaselineEngine';
import { dynamicFeedbackGenerator, GeneratedQuestion } from './dynamicFeedbackGenerator';
import { getHealthId } from './supabaseHealthStorage';
import { writeInsightToBrain, checkDuplicateInsight } from './brainService';
import { apnsService } from './apnsService';
import { db } from '../db';
import { users, pendingCorrelationFeedback } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

const DATASET_ID = 'flo_analytics';

const FEEDBACK_EXPIRY_HOURS = 48;

export interface CorrelationInsight {
  insightId: string;
  insightType: string;
  title: string;
  description: string;
  confidence: number;
  metricsInvolved: string[];
  attribution?: string;
}

export interface AnalysisResult {
  healthId: string;
  timestamp: Date;
  anomalies: AnomalyResult[];
  feedbackQuestion: GeneratedQuestion | null;
  insights: CorrelationInsight[];
  patterns: {
    name: string;
    confidence: number;
    metrics: string[];
  }[];
}

class CorrelationInsightService {
  async runFullAnalysis(userId: string): Promise<AnalysisResult> {
    const healthId = await getHealthId(userId);
    const timestamp = new Date();

    if (!healthId) {
      logger.warn(`[CorrelationInsight] Cannot run analysis: no healthId found for user ${userId}`);
      return {
        healthId: '',
        timestamp,
        anomalies: [],
        feedbackQuestion: null,
        insights: [],
        patterns: [],
      };
    }

    logger.info(`[CorrelationInsight] Starting full analysis for user ${userId}`);

    const anomalies = await bigQueryBaselineEngine.detectAnomalies(healthId);
    logger.info(`[CorrelationInsight] Detected ${anomalies.length} anomalies`);

    let feedbackQuestion: GeneratedQuestion | null = null;
    if (anomalies.length > 0) {
      feedbackQuestion = await dynamicFeedbackGenerator.generateQuestion(anomalies);
    }

    const patterns = this.extractPatterns(anomalies);

    const insights = await this.generateInsights(healthId, anomalies, patterns);

    if (insights.length > 0) {
      await this.storeInsights(healthId, insights);
    }

    const result: AnalysisResult = {
      healthId,
      timestamp,
      anomalies,
      feedbackQuestion,
      insights,
      patterns,
    };

    logger.info(`[CorrelationInsight] Analysis complete`, {
      anomalies: anomalies.length,
      patterns: patterns.length,
      insights: insights.length,
      hasFeedbackQuestion: !!feedbackQuestion,
    });

    return result;
  }

  private extractPatterns(anomalies: AnomalyResult[]): { name: string; confidence: number; metrics: string[] }[] {
    const patterns: { name: string; confidence: number; metrics: string[] }[] = [];

    const patternGroups = new Map<string, AnomalyResult[]>();
    for (const a of anomalies) {
      if (a.patternFingerprint) {
        const existing = patternGroups.get(a.patternFingerprint) || [];
        existing.push(a);
        patternGroups.set(a.patternFingerprint, existing);
      }
    }

    Array.from(patternGroups.entries()).forEach(([fingerprint, group]) => {
      const confidence = Math.min(0.95, 0.5 + group.length * 0.15);
      patterns.push({
        name: fingerprint,
        confidence,
        metrics: group.map((a: AnomalyResult) => a.metricType),
      });
    });

    return patterns;
  }

  private async generateInsights(
    healthId: string,
    anomalies: AnomalyResult[],
    patterns: { name: string; confidence: number; metrics: string[] }[]
  ): Promise<CorrelationInsight[]> {
    const insights: CorrelationInsight[] = [];

    for (const pattern of patterns) {
      if (pattern.name === 'illness_precursor') {
        insights.push({
          insightId: randomUUID(),
          insightType: 'health_alert',
          title: 'Early Warning Signs Detected',
          description: 'Multiple vital signs are showing patterns that often appear 24-48 hours before feeling unwell. Consider prioritizing rest and hydration.',
          confidence: pattern.confidence,
          metricsInvolved: pattern.metrics,
          attribution: 'Multi-metric pattern analysis',
        });
      } else if (pattern.name === 'recovery_deficit') {
        insights.push({
          insightId: randomUUID(),
          insightType: 'recovery_insight',
          title: 'Recovery May Need Attention',
          description: 'Your HRV and sleep patterns suggest your body may not be fully recovering. Consider lighter activity and earlier bedtime.',
          confidence: pattern.confidence,
          metricsInvolved: pattern.metrics,
          attribution: 'Recovery pattern analysis',
        });
      }
    }

    for (const anomaly of anomalies) {
      if (!anomaly.patternFingerprint && anomaly.severity === 'high') {
        insights.push({
          insightId: randomUUID(),
          insightType: 'metric_alert',
          title: this.getMetricAlertTitle(anomaly),
          description: this.getMetricAlertDescription(anomaly),
          confidence: 0.7,
          metricsInvolved: [anomaly.metricType],
        });
      }
    }

    return insights;
  }

  private getMetricAlertTitle(anomaly: AnomalyResult): string {
    const titles: Record<string, Record<string, string>> = {
      wrist_temperature_deviation: {
        above: 'Elevated Overnight Temperature',
        below: 'Temperature Below Baseline',
      },
      respiratory_rate: {
        above: 'Breathing Rate Elevated',
        below: 'Breathing Rate Low',
      },
      hrv: {
        above: 'HRV Spike Detected',
        below: 'HRV Drop Detected',
      },
      resting_heart_rate: {
        above: 'Elevated Resting Heart Rate',
        below: 'Lower Resting Heart Rate',
      },
    };

    return titles[anomaly.metricType]?.[anomaly.direction] || 
      `${anomaly.metricType} ${anomaly.direction === 'above' ? 'Elevated' : 'Low'}`;
  }

  private getMetricAlertDescription(anomaly: AnomalyResult): string {
    const pct = Math.abs(Math.round(anomaly.deviationPct));
    const direction = anomaly.direction === 'above' ? 'higher' : 'lower';
    
    return `Your ${anomaly.metricType.replace(/_/g, ' ')} is ${pct}% ${direction} than your typical baseline. This is worth monitoring.`;
  }

  private async storeInsights(healthId: string, insights: CorrelationInsight[]): Promise<void> {
    const rows = insights.map(i => ({
      health_id: healthId,
      insight_id: i.insightId,
      created_at: new Date().toISOString(),
      insight_type: i.insightType,
      title: i.title,
      description: i.description,
      confidence: i.confidence,
      metrics_involved: JSON.stringify(i.metricsInvolved),
      time_range_start: null,
      time_range_end: null,
      attribution: i.attribution || null,
      action_taken: null,
      user_feedback_id: null,
    }));

    await bigQueryService.insertRows('correlation_insights', rows);
  }

  async storeInsightsToBrain(userId: string, insights: CorrelationInsight[]): Promise<number> {
    let stored = 0;

    for (const insight of insights) {
      try {
        const insightText = `${insight.title}: ${insight.description} (Confidence: ${Math.round(insight.confidence * 100)}%, Metrics: ${insight.metricsInvolved.join(', ')})`;

        const isDuplicate = await checkDuplicateInsight(userId, insightText, 0.85);
        if (isDuplicate) {
          logger.debug(`[CorrelationInsight] Skipping duplicate insight for user ${userId}`);
          continue;
        }

        const tags = [
          'correlation',
          insight.insightType,
          ...insight.metricsInvolved.map(m => m.replace(/_/g, '-')),
        ];

        const importance = insight.confidence >= 0.8 ? 4 : insight.confidence >= 0.6 ? 3 : 2;

        await writeInsightToBrain(userId, insightText, {
          source: 'correlation_insight',
          tags,
          importance,
        });

        stored++;
        logger.info(`[CorrelationInsight] Stored insight to brain for user ${userId}`, {
          title: insight.title,
          importance,
        });
      } catch (error) {
        logger.error(`[CorrelationInsight] Failed to store insight to brain`, { error, insight });
      }
    }

    return stored;
  }

  async storePendingFeedback(userId: string, feedbackId: string, question: GeneratedQuestion): Promise<void> {
    const expiresAt = new Date(Date.now() + FEEDBACK_EXPIRY_HOURS * 60 * 60 * 1000);
    
    await db.insert(pendingCorrelationFeedback).values({
      feedbackId,
      userId,
      questionText: question.questionText,
      questionType: question.questionType,
      options: question.options || null,
      triggerPattern: question.triggerPattern,
      triggerMetrics: question.triggerMetrics,
      urgency: question.urgency,
      expiresAt,
    }).onConflictDoUpdate({
      target: pendingCorrelationFeedback.feedbackId,
      set: {
        questionText: question.questionText,
        questionType: question.questionType,
        options: question.options || null,
        triggerPattern: question.triggerPattern,
        triggerMetrics: question.triggerMetrics,
        urgency: question.urgency,
        expiresAt,
      },
    });

    logger.debug(`[CorrelationInsight] Stored pending feedback ${feedbackId} for user ${userId}`);
  }

  async getPendingFeedback(feedbackId: string): Promise<{
    feedbackId: string;
    userId: string;
    question: GeneratedQuestion;
    createdAt: Date;
    expiresAt: Date;
  } | null> {
    const rows = await db.select()
      .from(pendingCorrelationFeedback)
      .where(eq(pendingCorrelationFeedback.feedbackId, feedbackId))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    
    if (new Date() > row.expiresAt) {
      await this.deletePendingFeedback(feedbackId);
      return null;
    }

    return {
      feedbackId: row.feedbackId,
      userId: row.userId,
      question: {
        questionText: row.questionText,
        questionType: row.questionType,
        options: row.options || undefined,
        triggerPattern: row.triggerPattern || '',
        triggerMetrics: row.triggerMetrics || {},
        urgency: row.urgency,
        suggestedChannel: 'push',
      },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }

  async deletePendingFeedback(feedbackId: string): Promise<void> {
    await db.delete(pendingCorrelationFeedback)
      .where(eq(pendingCorrelationFeedback.feedbackId, feedbackId));
  }

  async cleanupExpiredFeedback(): Promise<number> {
    const result = await db.delete(pendingCorrelationFeedback)
      .where(lt(pendingCorrelationFeedback.expiresAt, new Date()))
      .returning({ feedbackId: pendingCorrelationFeedback.feedbackId });
    
    if (result.length > 0) {
      logger.info(`[CorrelationInsight] Cleaned up ${result.length} expired pending feedback items`);
    }
    return result.length;
  }

  async sendProactiveFeedbackNotification(
    userId: string,
    feedbackQuestion: GeneratedQuestion,
    feedbackId: string
  ): Promise<boolean> {
    try {
      await this.storePendingFeedback(userId, feedbackId, feedbackQuestion);

      const payload = {
        title: 'Flō has a question for you',
        body: feedbackQuestion.questionText,
        sound: 'default',
        data: {
          type: 'feedback_request',
          feedbackId,
          questionText: feedbackQuestion.questionText,
          questionType: feedbackQuestion.questionType,
          triggerPattern: feedbackQuestion.triggerPattern,
          options: feedbackQuestion.options,
          urgency: feedbackQuestion.urgency,
        },
      };

      const result = await apnsService.sendToUser(userId, payload);

      if (result.success) {
        logger.info(`[CorrelationInsight] Sent feedback notification to user ${userId}`, {
          devicesReached: result.devicesReached,
          feedbackId,
        });
      } else {
        logger.warn(`[CorrelationInsight] Failed to send feedback notification to user ${userId}`, {
          error: result.error,
        });
      }

      return result.success;
    } catch (error) {
      logger.error(`[CorrelationInsight] Error sending feedback notification`, { error, userId });
      return false;
    }
  }

  async runFullAnalysisWithNotification(userId: string): Promise<AnalysisResult & { notificationSent: boolean; brainInsightsStored: number }> {
    const result = await this.runFullAnalysis(userId);

    let brainInsightsStored = 0;
    if (result.insights.length > 0) {
      brainInsightsStored = await this.storeInsightsToBrain(userId, result.insights);
    }

    let notificationSent = false;
    if (result.feedbackQuestion && result.anomalies.some(a => a.severity === 'high')) {
      const feedbackId = randomUUID();
      notificationSent = await this.sendProactiveFeedbackNotification(userId, result.feedbackQuestion, feedbackId);
    }

    return {
      ...result,
      notificationSent,
      brainInsightsStored,
    };
  }

  async getRecentInsights(userId: string, limit: number = 10): Promise<CorrelationInsight[]> {
    const healthId = await getHealthId(userId);
    const insights = await bigQueryService.getCorrelationInsights(healthId, limit);

    return insights.map(i => ({
      insightId: i.insightId,
      insightType: i.insightType,
      title: i.title,
      description: i.description,
      confidence: i.confidence,
      metricsInvolved: [],
    }));
  }

  async recordFeedbackResponse(
    userId: string,
    feedbackId: string,
    question: GeneratedQuestion,
    response: {
      value?: number;
      boolean?: boolean;
      option?: string;
      text?: string;
    },
    channel: 'push' | 'in_app' | 'voice' = 'in_app'
  ): Promise<void> {
    const healthId = await getHealthId(userId);

    await bigQueryService.recordFeedback(healthId, feedbackId, {
      questionType: question.questionType,
      questionText: question.questionText,
      responseValue: response.value,
      responseBoolean: response.boolean,
      responseOption: response.option,
      responseText: response.text,
      triggerPattern: question.triggerPattern,
      triggerMetrics: question.triggerMetrics,
      collectionChannel: channel,
    });

    logger.info(`[CorrelationInsight] Recorded feedback response`, {
      healthId,
      feedbackId,
      questionType: question.questionType,
      pattern: question.triggerPattern,
    });
  }

  async simulateAnomalyForTesting(
    userId: string,
    scenario: 'illness' | 'recovery' | 'single_metric'
  ): Promise<AnalysisResult> {
    const healthId = await getHealthId(userId);
    const timestamp = new Date();

    let anomalies: AnomalyResult[];

    switch (scenario) {
      case 'illness':
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'wrist_temperature_deviation',
            currentValue: 0.6,
            baselineValue: 0.1,
            deviationPct: 500,
            zScore: 3.2,
            direction: 'above',
            severity: 'high',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: {
              wrist_temperature_deviation: { value: 0.6, deviation: 500 },
              respiratory_rate: { value: 18, deviation: 20 },
            },
          },
          {
            anomalyId: randomUUID(),
            metricType: 'respiratory_rate',
            currentValue: 18,
            baselineValue: 15,
            deviationPct: 20,
            zScore: 2.1,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: null,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'resting_heart_rate',
            currentValue: 68,
            baselineValue: 58,
            deviationPct: 17,
            zScore: 1.8,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: null,
          },
        ];
        break;

      case 'recovery':
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'hrv',
            currentValue: 35,
            baselineValue: 55,
            deviationPct: -36,
            zScore: -2.5,
            direction: 'below',
            severity: 'high',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: {
              hrv: { value: 35, deviation: -36 },
              deep_sleep: { value: 30, deviation: -40 },
            },
          },
          {
            anomalyId: randomUUID(),
            metricType: 'deep_sleep',
            currentValue: 30,
            baselineValue: 50,
            deviationPct: -40,
            zScore: -2.2,
            direction: 'below',
            severity: 'moderate',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: null,
          },
        ];
        break;

      case 'single_metric':
      default:
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'resting_heart_rate',
            currentValue: 72,
            baselineValue: 60,
            deviationPct: 20,
            zScore: 2.0,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: null,
            relatedMetrics: null,
          },
        ];
    }

    const feedbackQuestion = await dynamicFeedbackGenerator.generateQuestion(anomalies);
    const patterns = this.extractPatterns(anomalies);
    const insights = await this.generateInsights(healthId, anomalies, patterns);

    return {
      healthId,
      timestamp,
      anomalies,
      feedbackQuestion,
      insights,
      patterns,
    };
  }
}

export const correlationInsightService = new CorrelationInsightService();
