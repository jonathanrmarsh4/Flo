/**
 * Insight Quality Guard
 * 
 * Filters out low-value insights before they become notifications.
 * Implements minimum evidence requirements, multi-day trend validation,
 * and topic suppression via user memory.
 * 
 * Quality Criteria:
 * 1. Statistical Significance: Z-score ≥ 2.0 OR multi-day trend (≥3 days)
 * 2. Actionability: Insight must be actionable (score ≥ 0.5)
 * 3. Novelty: Not recently surfaced to user (via user memory)
 * 4. Pattern Persistence: Single-day fluctuations are rejected
 */

import { logger } from '../logger';
import { getUserMemories, storeMemory, type UserMemory } from './userMemoryService';
import { subDays, differenceInDays } from 'date-fns';
import { clickhouseBaselineEngine } from './clickhouseBaselineEngine';

export interface InsightQualityInput {
  insightType: string;
  metricName: string;
  zScore?: number | null;
  deviationPercent?: number | null;
  confidenceScore: number;
  impactScore: number;
  actionabilityScore: number;
  freshnessScore: number;
  trendDays?: number;
  dataPoints?: number;
  rawText?: string;
}

export interface QualityGateResult {
  passed: boolean;
  reason: string;
  qualityScore: number;
  recommendations?: string[];
}

const LOW_VALUE_METRIC_PATTERNS = [
  'flights_climbed',
  'stand_hours',
  'stairs',
  'flights',
];

const SINGLE_DAY_TRIVIAL_PATTERNS = [
  'fewer.*stairs',
  'fewer.*flights',
  'less.*stand',
  'lower.*steps.*than usual',
  'fewer.*steps.*today',
  'didn\'t.*stand',
];

const TOPIC_SUPPRESSION_DURATION_DAYS = 7;

export class InsightQualityGuard {
  
  /**
   * Main quality gate - determines if an insight should be surfaced
   */
  async evaluateInsight(
    userId: string,
    insight: InsightQualityInput
  ): Promise<QualityGateResult> {
    const checks: { name: string; passed: boolean; reason: string }[] = [];
    
    const compositeScore = 
      insight.confidenceScore * 
      insight.impactScore * 
      insight.actionabilityScore * 
      insight.freshnessScore;
    
    if (compositeScore < 0.15) {
      return {
        passed: false,
        reason: `Composite quality score too low (${compositeScore.toFixed(3)} < 0.15)`,
        qualityScore: compositeScore,
      };
    }
    checks.push({ name: 'composite_score', passed: true, reason: 'Score above threshold' });
    
    if (insight.zScore !== null && insight.zScore !== undefined) {
      const absZScore = Math.abs(insight.zScore);
      if (absZScore < 2.0) {
        const hasTrend = insight.trendDays && insight.trendDays >= 3;
        if (!hasTrend) {
          return {
            passed: false,
            reason: `Z-score not significant (${absZScore.toFixed(2)} < 2.0) and no multi-day trend`,
            qualityScore: compositeScore,
            recommendations: ['Wait for pattern to persist 3+ days', 'Look for corroborating signals'],
          };
        }
      }
      checks.push({ name: 'statistical_significance', passed: true, reason: `Z-score: ${absZScore.toFixed(2)}` });
    }
    
    if (insight.actionabilityScore < 0.5) {
      return {
        passed: false,
        reason: `Low actionability score (${insight.actionabilityScore.toFixed(2)} < 0.5)`,
        qualityScore: compositeScore,
        recommendations: ['Insight needs clearer action path'],
      };
    }
    checks.push({ name: 'actionability', passed: true, reason: 'Actionable' });
    
    const isLowValueMetric = LOW_VALUE_METRIC_PATTERNS.some(
      pattern => insight.metricName.toLowerCase().includes(pattern)
    );
    
    if (isLowValueMetric) {
      const hasStrongSignal = 
        (insight.zScore && Math.abs(insight.zScore) >= 3.0) ||
        (insight.trendDays && insight.trendDays >= 5);
      
      if (!hasStrongSignal) {
        return {
          passed: false,
          reason: `Low-value metric (${insight.metricName}) requires stronger signal`,
          qualityScore: compositeScore,
          recommendations: ['Metric fluctuates naturally', 'Need 5+ day trend or z-score > 3.0'],
        };
      }
    }
    checks.push({ name: 'metric_value', passed: true, reason: 'Metric worth surfacing' });
    
    if (insight.rawText) {
      const isTrivialSingleDay = SINGLE_DAY_TRIVIAL_PATTERNS.some(
        pattern => new RegExp(pattern, 'i').test(insight.rawText!)
      );
      
      if (isTrivialSingleDay) {
        return {
          passed: false,
          reason: 'Single-day trivial observation with no pattern',
          qualityScore: compositeScore,
          recommendations: ['Wait for multi-day pattern', 'Not actionable as single datapoint'],
        };
      }
    }
    checks.push({ name: 'trivial_check', passed: true, reason: 'Not trivial single-day' });
    
    const isSuppressed = await this.checkTopicSuppression(userId, insight.metricName, insight.insightType);
    if (isSuppressed) {
      return {
        passed: false,
        reason: `Topic suppressed by user for ${insight.metricName}`,
        qualityScore: compositeScore,
      };
    }
    checks.push({ name: 'topic_suppression', passed: true, reason: 'Not suppressed' });
    
    logger.info(`[QualityGuard] Insight PASSED all checks for ${insight.metricName}`, {
      userId,
      insightType: insight.insightType,
      zScore: insight.zScore,
      compositeScore: compositeScore.toFixed(3),
      checksRun: checks.length,
    });
    
    return {
      passed: true,
      reason: 'All quality gates passed',
      qualityScore: compositeScore,
    };
  }
  
  /**
   * Check if user has suppressed this topic/metric
   */
  private async checkTopicSuppression(
    userId: string,
    metricName: string,
    insightType: string
  ): Promise<boolean> {
    try {
      const recentMemories = await getUserMemories(userId, {
        limit: 50,
        since: subDays(new Date(), TOPIC_SUPPRESSION_DURATION_DAYS),
      });
      
      for (const memory of recentMemories) {
        if (memory.memory?.type === 'topic_suppression') {
          const suppressed = memory.memory.extracted?.suppressed_topics || [];
          const suppressedMetric = memory.memory.extracted?.metric_name;
          
          if (
            suppressed.includes(metricName) ||
            suppressed.includes(insightType) ||
            suppressedMetric === metricName
          ) {
            logger.debug(`[QualityGuard] Topic suppression found for ${metricName}`);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      logger.error('[QualityGuard] Error checking topic suppression:', error);
      return false;
    }
  }
  
  /**
   * Record user feedback when they skip/dismiss an insight
   * This trains the system to avoid similar insights
   */
  async recordInsightFeedback(
    userId: string,
    insightId: string,
    feedbackType: 'skipped' | 'dismissed' | 'not_helpful' | 'helpful',
    metricName: string,
    insightType: string,
    reason?: string
  ): Promise<void> {
    try {
      if (feedbackType === 'skipped' || feedbackType === 'dismissed' || feedbackType === 'not_helpful') {
        await storeMemory(userId, {
          type: 'topic_suppression',
          raw: `User ${feedbackType} insight about ${metricName}`,
          extracted: {
            suppressed_topics: [metricName],
            metric_name: metricName,
            insight_type: insightType,
            insight_id: insightId,
            feedback_type: feedbackType,
            reason: reason || null,
            suppress_until: new Date(Date.now() + TOPIC_SUPPRESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          },
          importance: 'medium',
        });
        
        logger.info(`[QualityGuard] Recorded ${feedbackType} feedback for ${metricName}`, {
          userId,
          insightId,
          metricName,
        });
      }
    } catch (error) {
      logger.error('[QualityGuard] Error recording insight feedback:', error);
    }
  }
  
  /**
   * Batch evaluate multiple insights and return only quality ones
   */
  async filterInsights(
    userId: string,
    insights: InsightQualityInput[]
  ): Promise<{ passed: InsightQualityInput[]; rejected: { insight: InsightQualityInput; reason: string }[] }> {
    const passed: InsightQualityInput[] = [];
    const rejected: { insight: InsightQualityInput; reason: string }[] = [];
    
    for (const insight of insights) {
      const result = await this.evaluateInsight(userId, insight);
      
      if (result.passed) {
        passed.push(insight);
      } else {
        rejected.push({ insight, reason: result.reason });
      }
    }
    
    logger.info(`[QualityGuard] Filtered ${insights.length} insights: ${passed.length} passed, ${rejected.length} rejected`, {
      userId,
      passRate: (passed.length / insights.length * 100).toFixed(1) + '%',
    });
    
    return { passed, rejected };
  }
}

export const insightQualityGuard = new InsightQualityGuard();
