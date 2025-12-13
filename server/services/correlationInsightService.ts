import { clickhouseBaselineEngine, AnomalyResult } from './clickhouseBaselineEngine';
import { dynamicFeedbackGenerator, GeneratedQuestion } from './dynamicFeedbackGenerator';
import { getHealthId } from './supabaseHealthStorage';
import { writeInsightToBrain, checkDuplicateInsight, getRecentInsights as getBrainInsights } from './brainService';
import { apnsService } from './apnsService';
import { db } from '../db';
import { users, pendingCorrelationFeedback, answeredFeedbackPatterns } from '@shared/schema';
import { eq, and, lt, gt, or } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import { getMLSettings } from './behaviorAttributionEngine';

const FEEDBACK_EXPIRY_HOURS = 48;
// Note: Pattern cooldown now uses admin-configurable alertCooldownHours from getMLSettings()
const DEFAULT_PATTERN_COOLDOWN_HOURS = 24;

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
  async runFullAnalysis(userId: string): Promise<AnalysisResult & { feedbackQuestions: GeneratedQuestion[] }> {
    const healthId = await getHealthId(userId);
    const timestamp = new Date();

    if (!healthId) {
      logger.warn(`[CorrelationInsight] Cannot run analysis: no healthId found for user ${userId}`);
      return {
        healthId: '',
        timestamp,
        anomalies: [],
        feedbackQuestion: null,
        feedbackQuestions: [],
        insights: [],
        patterns: [],
      };
    }

    logger.info(`[CorrelationInsight] Starting full analysis for user ${userId}`);

    // Get admin-configured cooldown setting
    const mlSettings = await getMLSettings();
    const alertCooldownHours = mlSettings.alertCooldownHours;

    // Bypass rate limit for scheduled analysis jobs
    const anomalies = await clickhouseBaselineEngine.detectAnomalies(healthId, { bypassRateLimit: true });
    logger.info(`[CorrelationInsight] Detected ${anomalies.length} anomalies`);

    const recentlyAnswered = await this.getRecentlyAnsweredPatterns(userId, alertCooldownHours);
    logger.info(`[CorrelationInsight] User has ${recentlyAnswered.size} recently answered patterns (cooldown: ${alertCooldownHours}h)`);

    let feedbackQuestions: GeneratedQuestion[] = [];
    if (anomalies.length > 0) {
      const allQuestions = await dynamicFeedbackGenerator.generateMultipleQuestions(anomalies, 3);
      
      // Only filter based on specific focusMetric (e.g., "resting_heart_rate"), not generic patterns like "single_metric"
      feedbackQuestions = allQuestions.filter(q => {
        const metric = q.focusMetric || '';
        // Only filter if the specific metric was recently answered, not generic patterns
        const isRecentlyAnswered = metric && recentlyAnswered.has(metric);
        
        if (isRecentlyAnswered) {
          logger.info(`[CorrelationInsight] Filtering out question with metric "${metric}" - already answered within ${alertCooldownHours}h`);
        }
        return !isRecentlyAnswered;
      });

      logger.info(`[CorrelationInsight] Filtered ${allQuestions.length - feedbackQuestions.length} recently-answered questions, keeping ${feedbackQuestions.length}`);
      
      // All questions visible immediately - no staggered delivery
      const visibleAt = new Date();
      const anomalyDate = new Date().toISOString().split('T')[0];

      for (const question of feedbackQuestions) {
        const feedbackId = randomUUID();
        
        // Find the matching anomaly for this question to get causal analysis
        const matchingAnomaly = anomalies.find(a => a.metricType === question.focusMetric);
        let causalAnalysis: {
          insightText?: string;
          likelyCauses?: string[];
          whatsWorking?: string[];
          patternConfidence?: number;
          isRecurringPattern?: boolean;
          historicalMatchCount?: number;
        } | undefined;
        
        if (matchingAnomaly) {
          // Generate smart insight with ML causal analysis
          const smartInsight = await dynamicFeedbackGenerator.generateSmartInsight(
            healthId,
            matchingAnomaly,
            anomalyDate
          );
          
          if (smartInsight) {
            causalAnalysis = {
              insightText: smartInsight.insightText,
              likelyCauses: smartInsight.likelyCauses,
              whatsWorking: smartInsight.whatsWorking,
              patternConfidence: smartInsight.confidence,
              isRecurringPattern: smartInsight.isRecurringPattern,
              historicalMatchCount: 0, // Will be populated by historical pattern matching
            };
            logger.info(`[CorrelationInsight] Generated smart insight for ${question.focusMetric}`, {
              hasLikelyCauses: smartInsight.likelyCauses.length > 0,
              hasWhatsWorking: smartInsight.whatsWorking.length > 0,
              confidence: smartInsight.confidence,
            });
          }
        }
        
        await this.storePendingFeedback(userId, feedbackId, question, visibleAt, causalAnalysis);
        logger.info(`[CorrelationInsight] Stored feedback question ${feedbackId} for user ${userId}`, {
          hasCausalAnalysis: !!causalAnalysis,
        });
      }
    }

    const patterns = this.extractPatterns(anomalies);

    const insights = await this.generateInsights(healthId, anomalies, patterns);

    if (insights.length > 0) {
      await this.storeInsights(healthId, insights);
    }

    const result = {
      healthId,
      timestamp,
      anomalies,
      feedbackQuestion: feedbackQuestions[0] || null,
      feedbackQuestions,
      insights,
      patterns,
    };

    logger.info(`[CorrelationInsight] Analysis complete`, {
      anomalies: anomalies.length,
      patterns: patterns.length,
      insights: insights.length,
      feedbackQuestionsGenerated: feedbackQuestions.length,
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
    // Use canonical ClickHouse metric names (see server/services/metrics/constants.ts)
    const titles: Record<string, Record<string, string>> = {
      wrist_temperature_deviation: {
        above: 'Elevated Overnight Temperature',
        below: 'Temperature Below Baseline',
      },
      respiratory_rate_bpm: {
        above: 'Breathing Rate Elevated',
        below: 'Breathing Rate Low',
      },
      hrv_ms: {
        above: 'HRV Spike Detected',
        below: 'HRV Drop Detected',
      },
      resting_heart_rate_bpm: {
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
    logger.info(`[CorrelationInsight] Storing ${insights.length} insights to brain for healthId ${healthId}`);
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

  async storePendingFeedback(
    userId: string,
    feedbackId: string,
    question: GeneratedQuestion,
    visibleAt?: Date,
    causalAnalysis?: {
      insightText?: string;
      likelyCauses?: string[];
      whatsWorking?: string[];
      patternConfidence?: number;
      isRecurringPattern?: boolean;
      historicalMatchCount?: number;
    }
  ): Promise<boolean> {
    const expiresAt = new Date(Date.now() + FEEDBACK_EXPIRY_HOURS * 60 * 60 * 1000);
    const effectiveVisibleAt = visibleAt || new Date();
    
    // Check if a pending question already exists for this user and focusMetric today
    // If exists, UPDATE the existing record with new causal data instead of skipping
    if (question.focusMetric) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const existingToday = await db.select({ feedbackId: pendingCorrelationFeedback.feedbackId })
        .from(pendingCorrelationFeedback)
        .where(and(
          eq(pendingCorrelationFeedback.userId, userId),
          eq(pendingCorrelationFeedback.focusMetric, question.focusMetric),
          gt(pendingCorrelationFeedback.createdAt, today)
        ))
        .limit(1);
      
      if (existingToday.length > 0) {
        // Update existing record with new causal analysis data
        if (causalAnalysis && (causalAnalysis.likelyCauses?.length || causalAnalysis.whatsWorking?.length)) {
          await db.update(pendingCorrelationFeedback)
            .set({
              insightText: causalAnalysis.insightText || null,
              likelyCauses: causalAnalysis.likelyCauses || null,
              whatsWorking: causalAnalysis.whatsWorking || null,
              patternConfidence: causalAnalysis.patternConfidence || null,
              isRecurringPattern: causalAnalysis.isRecurringPattern || false,
              historicalMatchCount: causalAnalysis.historicalMatchCount || null,
            })
            .where(eq(pendingCorrelationFeedback.feedbackId, existingToday[0].feedbackId));
          logger.debug(`[CorrelationInsight] Updated existing question for metric "${question.focusMetric}" with causal data`);
        } else {
          logger.debug(`[CorrelationInsight] Skipping duplicate question for metric "${question.focusMetric}" - already have one today`);
        }
        return false;
      }
    }
    
    await db.insert(pendingCorrelationFeedback).values({
      feedbackId,
      userId,
      questionText: question.questionText,
      questionType: question.questionType,
      options: question.options || null,
      triggerPattern: question.triggerPattern,
      triggerMetrics: question.triggerMetrics,
      urgency: question.urgency,
      focusMetric: question.focusMetric || null,
      deliveryWindow: question.deliveryWindow || null,
      visibleAt: effectiveVisibleAt,
      expiresAt,
      // ML-computed causal analysis
      insightText: causalAnalysis?.insightText || null,
      likelyCauses: causalAnalysis?.likelyCauses || null,
      whatsWorking: causalAnalysis?.whatsWorking || null,
      patternConfidence: causalAnalysis?.patternConfidence || null,
      isRecurringPattern: causalAnalysis?.isRecurringPattern || false,
      historicalMatchCount: causalAnalysis?.historicalMatchCount || null,
    }).onConflictDoUpdate({
      target: pendingCorrelationFeedback.feedbackId,
      set: {
        questionText: question.questionText,
        questionType: question.questionType,
        options: question.options || null,
        triggerPattern: question.triggerPattern,
        triggerMetrics: question.triggerMetrics,
        urgency: question.urgency,
        focusMetric: question.focusMetric || null,
        deliveryWindow: question.deliveryWindow || null,
        visibleAt: effectiveVisibleAt,
        expiresAt,
        insightText: causalAnalysis?.insightText || null,
        likelyCauses: causalAnalysis?.likelyCauses || null,
        whatsWorking: causalAnalysis?.whatsWorking || null,
        patternConfidence: causalAnalysis?.patternConfidence || null,
        isRecurringPattern: causalAnalysis?.isRecurringPattern || false,
        historicalMatchCount: causalAnalysis?.historicalMatchCount || null,
      },
    });

    logger.debug(`[CorrelationInsight] Stored pending feedback ${feedbackId} for user ${userId}, visible at ${effectiveVisibleAt.toISOString()}`);

    // Send push notification for ML alerts immediately
    // The delivery window is for in-app display timing, but push should be immediate
    try {
      const title = this.getNotificationTitle(question);
      const body = question.questionText.length > 100 
        ? question.questionText.substring(0, 97) + '...' 
        : question.questionText;
      
      const result = await apnsService.sendToUser(userId, {
        title,
        body,
        data: {
          type: 'ml_alert',
          feedbackId,
          urgency: question.urgency,
        },
      });

      if (result.success) {
        logger.info(`[CorrelationInsight] Push notification sent for ML alert ${feedbackId} to ${result.devicesReached} device(s)`);
      } else {
        logger.warn(`[CorrelationInsight] Failed to send push for ML alert ${feedbackId}: ${result.error}`);
      }
    } catch (error) {
      // Don't fail the entire operation if push fails
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`[CorrelationInsight] Push notification failed for ML alert ${feedbackId}: ${errorMsg}`);
    }
    
    return true;
  }

  private getNotificationTitle(question: GeneratedQuestion): string {
    switch (question.urgency) {
      case 'high':
        return 'Health Alert';
      case 'medium':
        return 'Health Check-In';
      default:
        return 'Quick Check-In';
    }
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

  async getPendingFeedbackForUser(userId: string): Promise<Array<{
    feedbackId: string;
    question: GeneratedQuestion;
    createdAt: Date;
    expiresAt: Date;
    visibleAt: Date;
    focusMetric: string | null;
    deliveryWindow: string | null;
    // ML-computed causal analysis
    insightText: string | null;
    likelyCauses: string[] | null;
    whatsWorking: string[] | null;
    patternConfidence: number | null;
    isRecurringPattern: boolean;
    historicalMatchCount: number | null;
  }>> {
    await this.cleanupExpiredFeedback();
    await this.cleanupOldAnsweredPatterns();
    
    const recentlyAnswered = await this.getRecentlyAnsweredPatterns(userId);
    
    const now = new Date();
    const rows = await db.select()
      .from(pendingCorrelationFeedback)
      .where(and(
        eq(pendingCorrelationFeedback.userId, userId),
        lt(pendingCorrelationFeedback.visibleAt, now)
      ))
      .orderBy(pendingCorrelationFeedback.createdAt);

    // Only filter based on specific focusMetric (e.g., "resting_heart_rate"), not generic patterns like "single_metric"
    const filteredRows = rows.filter(row => {
      const metric = row.focusMetric || '';
      // Only filter if the specific metric was recently answered, not generic patterns
      const isRecentlyAnswered = metric && recentlyAnswered.has(metric);
      
      if (isRecentlyAnswered) {
        logger.debug(`[CorrelationInsight] Filtering pending feedback with metric "${metric}" - already answered`);
      }
      return !isRecentlyAnswered;
    });

    logger.debug(`[CorrelationInsight] Returning ${filteredRows.length}/${rows.length} pending feedback (${rows.length - filteredRows.length} filtered as recently answered)`);

    return filteredRows.map(row => ({
      feedbackId: row.feedbackId,
      question: {
        questionText: row.questionText,
        questionType: row.questionType,
        options: row.options || undefined,
        triggerPattern: row.triggerPattern || '',
        triggerMetrics: row.triggerMetrics || {},
        urgency: row.urgency,
        suggestedChannel: 'in_app' as const,
        focusMetric: row.focusMetric || undefined,
        deliveryWindow: row.deliveryWindow as 'morning' | 'midday' | 'evening' | undefined,
      },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      visibleAt: row.visibleAt,
      focusMetric: row.focusMetric,
      deliveryWindow: row.deliveryWindow,
      // ML-computed causal analysis
      insightText: row.insightText,
      likelyCauses: row.likelyCauses,
      whatsWorking: row.whatsWorking,
      patternConfidence: row.patternConfidence,
      isRecurringPattern: row.isRecurringPattern || false,
      historicalMatchCount: row.historicalMatchCount,
    }));
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

  async trackAnsweredPattern(
    userId: string,
    triggerPattern: string,
    focusMetric?: string
  ): Promise<void> {
    try {
      await db.insert(answeredFeedbackPatterns).values({
        userId,
        triggerPattern,
        focusMetric: focusMetric || null,
      });
      logger.info(`[CorrelationInsight] Tracked answered pattern "${triggerPattern}" for user ${userId}`);
    } catch (error) {
      logger.error(`[CorrelationInsight] Failed to track answered pattern:`, error);
    }
  }

  async getRecentlyAnsweredPatterns(userId: string, cooldownHours?: number): Promise<Set<string>> {
    // Use provided cooldown or fetch from admin settings, with defensive fallback
    const settingsCooldown = cooldownHours ?? (await getMLSettings()).alertCooldownHours;
    const effectiveCooldown = (settingsCooldown && settingsCooldown > 0) ? settingsCooldown : DEFAULT_PATTERN_COOLDOWN_HOURS;
    const cooldownThreshold = new Date(Date.now() - effectiveCooldown * 60 * 60 * 1000);
    
    const rows = await db.select({
      triggerPattern: answeredFeedbackPatterns.triggerPattern,
      focusMetric: answeredFeedbackPatterns.focusMetric,
    })
      .from(answeredFeedbackPatterns)
      .where(and(
        eq(answeredFeedbackPatterns.userId, userId),
        gt(answeredFeedbackPatterns.answeredAt, cooldownThreshold)
      ));

    const patterns = new Set<string>();
    for (const row of rows) {
      patterns.add(row.triggerPattern);
      if (row.focusMetric) {
        patterns.add(row.focusMetric);
      }
    }
    
    logger.debug(`[CorrelationInsight] Found ${patterns.size} recently answered patterns for user ${userId} (cooldown: ${effectiveCooldown}h)`);
    return patterns;
  }

  async cleanupOldAnsweredPatterns(): Promise<number> {
    // Use admin-configured cooldown for cleanup threshold, with defensive fallback
    const mlSettings = await getMLSettings();
    const cooldownHours = (mlSettings.alertCooldownHours && mlSettings.alertCooldownHours > 0) 
      ? mlSettings.alertCooldownHours 
      : DEFAULT_PATTERN_COOLDOWN_HOURS;
    const threshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const result = await db.delete(answeredFeedbackPatterns)
      .where(lt(answeredFeedbackPatterns.answeredAt, threshold))
      .returning({ id: answeredFeedbackPatterns.id });
    
    if (result.length > 0) {
      logger.info(`[CorrelationInsight] Cleaned up ${result.length} old answered pattern records`);
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
    try {
      const brainInsights = await getBrainInsights(userId, limit * 2);
      
      const correlationInsights = brainInsights
        .filter(i => i.source === 'correlation_insight' || i.tags.includes('correlation'))
        .slice(0, limit)
        .map(i => ({
          insightId: i.id,
          insightType: 'correlation',
          title: i.text.split(':')[0] || 'Correlation Insight',
          description: i.text.split(':').slice(1).join(':').trim() || i.text,
          confidence: (i.importance / 5),
          metricsInvolved: i.tags.filter(t => t !== 'correlation'),
        }));
      
      logger.info(`[CorrelationInsight] Retrieved ${correlationInsights.length} insights from brain for user ${userId}`);
      return correlationInsights;
    } catch (error) {
      logger.error(`[CorrelationInsight] Error getting recent insights from brain:`, error);
      return [];
    }
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

    logger.info(`[CorrelationInsight] Recorded feedback response`, {
      healthId,
      feedbackId,
      questionType: question.questionType,
      pattern: question.triggerPattern,
      response,
      channel,
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
              respiratory_rate_bpm: { value: 18, deviation: 20 },
            },
            modelConfidence: 0.85,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'respiratory_rate_bpm',
            currentValue: 18,
            baselineValue: 15,
            deviationPct: 20,
            zScore: 2.1,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: null,
            modelConfidence: 0.75,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'resting_heart_rate_bpm',
            currentValue: 68,
            baselineValue: 58,
            deviationPct: 17,
            zScore: 1.8,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: 'illness_precursor',
            relatedMetrics: null,
            modelConfidence: 0.70,
          },
        ];
        break;

      case 'recovery':
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'hrv_ms',
            currentValue: 35,
            baselineValue: 55,
            deviationPct: -36,
            zScore: -2.5,
            direction: 'below',
            severity: 'high',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: {
              hrv_ms: { value: 35, deviation: -36 },
              deep_sleep_min: { value: 30, deviation: -40 },
            },
            modelConfidence: 0.80,
          },
          {
            anomalyId: randomUUID(),
            metricType: 'deep_sleep_min',
            currentValue: 30,
            baselineValue: 50,
            deviationPct: -40,
            zScore: -2.2,
            direction: 'below',
            severity: 'moderate',
            patternFingerprint: 'recovery_deficit',
            relatedMetrics: null,
            modelConfidence: 0.75,
          },
        ];
        break;

      case 'single_metric':
      default:
        anomalies = [
          {
            anomalyId: randomUUID(),
            metricType: 'resting_heart_rate_bpm',
            currentValue: 72,
            baselineValue: 60,
            deviationPct: 20,
            zScore: 2.0,
            direction: 'above',
            severity: 'moderate',
            patternFingerprint: null,
            relatedMetrics: null,
            modelConfidence: 0.70,
          },
        ];
    }

    const feedbackQuestion = await dynamicFeedbackGenerator.generateQuestion(anomalies);
    const patterns = this.extractPatterns(anomalies);
    const insights = await this.generateInsights(healthId, anomalies, patterns);

    if (feedbackQuestion) {
      const feedbackId = randomUUID();
      await this.storePendingFeedback(userId, feedbackId, feedbackQuestion);
      logger.info(`[CorrelationInsight] Stored simulated feedback ${feedbackId} for user ${userId}`);
    }

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
