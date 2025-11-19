import { db } from '../db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { 
  userDailyMetrics, 
  sleepNights, 
  insightCards,
  type InsightCard 
} from '@shared/schema';
import { logger } from '../logger';

interface CorrelationResult {
  category: 'activity_sleep' | 'recovery_hrv' | 'sleep_quality' | 'biomarkers' | 'general';
  pattern: string;
  confidence: number;
  supportingData: string;
  details: Record<string, any>;
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Detect correlation between step count and sleep duration
 */
async function detectActivitySleepCorrelation(userId: string): Promise<CorrelationResult | null> {
  try {
    // Get daily metrics for last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateThreshold = sixtyDaysAgo.toISOString().split('T')[0];

    const metrics = await db
      .select({
        date: userDailyMetrics.localDate,
        steps: userDailyMetrics.stepsRawSum,
      })
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          gte(userDailyMetrics.localDate, dateThreshold)
        )
      )
      .orderBy(desc(userDailyMetrics.localDate));

    // Join with sleep data
    const metricsWithSleep = await Promise.all(
      metrics.map(async (m) => {
        const [sleep] = await db
          .select({ totalMin: sleepNights.totalSleepMin })
          .from(sleepNights)
          .where(
            and(
              eq(sleepNights.userId, userId),
              eq(sleepNights.sleepDate, m.date)
            )
          )
          .limit(1);

        return {
          date: m.date,
          steps: m.steps,
          sleepMin: sleep?.totalMin || null,
        };
      })
    );

    // Filter to days with both data points
    const validDays = metricsWithSleep.filter(
      (d) => d.steps !== null && d.sleepMin !== null && d.steps > 0 && d.sleepMin > 0
    );

    if (validDays.length < 14) {
      logger.debug(`[CorrelationEngine] Insufficient data for activity-sleep correlation (${validDays.length} days)`);
      return null;
    }

    // Check for high-step days (>10k steps) vs low-step days
    const highStepDays = validDays.filter((d) => d.steps! >= 10000);
    const lowStepDays = validDays.filter((d) => d.steps! < 10000);

    if (highStepDays.length < 5 || lowStepDays.length < 5) {
      return null; // Not enough variation
    }

    const avgSleepHighSteps =
      highStepDays.reduce((sum, d) => sum + d.sleepMin!, 0) / highStepDays.length;
    const avgSleepLowSteps =
      lowStepDays.reduce((sum, d) => sum + d.sleepMin!, 0) / lowStepDays.length;

    const sleepDifference = avgSleepHighSteps - avgSleepLowSteps;

    // Only create insight if difference is meaningful (>30 min)
    if (Math.abs(sleepDifference) < 30) {
      return null;
    }

    // Calculate correlation coefficient for confidence
    const steps = validDays.map((d) => d.steps!);
    const sleep = validDays.map((d) => d.sleepMin!);
    const correlation = calculateCorrelation(steps, sleep);
    const confidence = Math.min(0.95, Math.abs(correlation) * 0.9 + 0.1); // Scale to 0.1-0.95

    const pattern =
      sleepDifference > 0
        ? `Your sleep improves ${Math.round(sleepDifference)} min on days you hit 10k+ steps`
        : `Your sleep decreases ${Math.round(Math.abs(sleepDifference))} min on days you hit 10k+ steps`;

    return {
      category: 'activity_sleep',
      pattern,
      confidence,
      supportingData: `Based on ${validDays.length} days`,
      details: {
        daysAnalyzed: validDays.length,
        highStepDays: highStepDays.length,
        lowStepDays: lowStepDays.length,
        avgSleepHighSteps: Math.round(avgSleepHighSteps),
        avgSleepLowSteps: Math.round(avgSleepLowSteps),
        sleepDifferenceMin: Math.round(sleepDifference),
        correlationCoefficient: correlation.toFixed(3),
        dateRange: `${validDays[validDays.length - 1].date} - ${validDays[0].date}`,
      },
    };
  } catch (error) {
    logger.error('[CorrelationEngine] Activity-sleep correlation error:', error);
    return null;
  }
}

/**
 * Detect correlation between sleep duration and HRV
 */
async function detectSleepHRVCorrelation(userId: string): Promise<CorrelationResult | null> {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateThreshold = sixtyDaysAgo.toISOString().split('T')[0];

    const metrics = await db
      .select({
        date: userDailyMetrics.localDate,
        hrv: userDailyMetrics.hrvMs,
      })
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          gte(userDailyMetrics.localDate, dateThreshold)
        )
      )
      .orderBy(desc(userDailyMetrics.localDate));

    // Join with sleep data
    const metricsWithSleep = await Promise.all(
      metrics.map(async (m) => {
        const [sleep] = await db
          .select({ totalMin: sleepNights.totalSleepMin })
          .from(sleepNights)
          .where(
            and(
              eq(sleepNights.userId, userId),
              eq(sleepNights.sleepDate, m.date)
            )
          )
          .limit(1);

        return {
          date: m.date,
          hrv: m.hrv,
          sleepMin: sleep?.totalMin || null,
        };
      })
    );

    // Filter valid days
    const validDays = metricsWithSleep.filter(
      (d) => d.hrv !== null && d.sleepMin !== null && d.hrv > 0 && d.sleepMin > 0
    );

    if (validDays.length < 14) {
      return null;
    }

    // Check for good sleep days (>7.5h = 450min) vs poor sleep days
    const goodSleepDays = validDays.filter((d) => d.sleepMin! >= 450);
    const poorSleepDays = validDays.filter((d) => d.sleepMin! < 450);

    if (goodSleepDays.length < 5 || poorSleepDays.length < 5) {
      return null;
    }

    const avgHrvGoodSleep = goodSleepDays.reduce((sum, d) => sum + d.hrv!, 0) / goodSleepDays.length;
    const avgHrvPoorSleep = poorSleepDays.reduce((sum, d) => sum + d.hrv!, 0) / poorSleepDays.length;

    const hrvDifference = avgHrvGoodSleep - avgHrvPoorSleep;
    const percentChange = ((hrvDifference / avgHrvPoorSleep) * 100);

    // Only create insight if difference is meaningful (>10% change)
    if (Math.abs(percentChange) < 10) {
      return null;
    }

    const hrvArr = validDays.map((d) => d.hrv!);
    const sleepArr = validDays.map((d) => d.sleepMin!);
    const correlation = calculateCorrelation(sleepArr, hrvArr);
    const confidence = Math.min(0.95, Math.abs(correlation) * 0.9 + 0.15);

    const pattern =
      hrvDifference > 0
        ? `HRV climbs ${Math.round(Math.abs(percentChange))}% when you sleep >7.5h consistently`
        : `HRV drops ${Math.round(Math.abs(percentChange))}% when sleep falls below 7.5h`;

    return {
      category: 'recovery_hrv',
      pattern,
      confidence,
      supportingData: `${Math.round(Math.abs(percentChange))}% change`,
      details: {
        daysAnalyzed: validDays.length,
        goodSleepDays: goodSleepDays.length,
        poorSleepDays: poorSleepDays.length,
        avgHrvGoodSleep: Math.round(avgHrvGoodSleep),
        avgHrvPoorSleep: Math.round(avgHrvPoorSleep),
        hrvDifferenceMs: Math.round(hrvDifference),
        percentChange: Math.round(percentChange),
        correlationCoefficient: correlation.toFixed(3),
        dateRange: `${validDays[validDays.length - 1].date} - ${validDays[0].date}`,
      },
    };
  } catch (error) {
    logger.error('[CorrelationEngine] Sleep-HRV correlation error:', error);
    return null;
  }
}

/**
 * Run all correlation detection algorithms for a user
 */
export async function detectCorrelations(userId: string): Promise<CorrelationResult[]> {
  logger.info(`[CorrelationEngine] Running correlation detection for user ${userId}`);

  const correlations: CorrelationResult[] = [];

  // Run all detection algorithms in parallel
  const [activitySleep, sleepHRV] = await Promise.all([
    detectActivitySleepCorrelation(userId),
    detectSleepHRVCorrelation(userId),
  ]);

  if (activitySleep) correlations.push(activitySleep);
  if (sleepHRV) correlations.push(sleepHRV);

  logger.info(`[CorrelationEngine] Found ${correlations.length} correlations for user ${userId}`);
  return correlations;
}

/**
 * Generate and store insight cards for a user
 */
export async function generateInsightCards(userId: string): Promise<InsightCard[]> {
  try {
    logger.info(`[CorrelationEngine] Generating insight cards for user ${userId}`);

    // Detect correlations
    const correlations = await detectCorrelations(userId);

    if (correlations.length === 0) {
      logger.info(`[CorrelationEngine] No correlations found for user ${userId}`);
      return [];
    }

    // Delete old insights (keep system fresh)
    await db.delete(insightCards).where(eq(insightCards.userId, userId));

    // Insert new insights
    const newInsights: InsightCard[] = [];
    for (const corr of correlations) {
      const [inserted] = await db
        .insert(insightCards)
        .values({
          userId,
          category: corr.category,
          pattern: corr.pattern,
          confidence: corr.confidence,
          supportingData: corr.supportingData,
          details: corr.details,
          isNew: true,
          isActive: true,
        })
        .returning();

      if (inserted) {
        newInsights.push(inserted);
      }
    }

    logger.info(`[CorrelationEngine] Created ${newInsights.length} insight cards for user ${userId}`);
    return newInsights;
  } catch (error) {
    logger.error('[CorrelationEngine] Generate insight cards error:', error);
    throw error;
  }
}
