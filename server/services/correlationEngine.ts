import { db } from '../db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { 
  userDailyMetrics, 
  sleepNights, 
  insightCards,
  lifeEvents,
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
        steps: userDailyMetrics.stepsNormalized,
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

    logger.info(`[CorrelationEngine] Activity-Sleep: ${validDays.length} valid days found (${metrics.length} total metrics)`);

    if (validDays.length < 7) {
      logger.info(`[CorrelationEngine] ✗ Activity-Sleep: Insufficient data (${validDays.length} days, need 7+)`);
      return null;
    }

    // Check for high-step days (>10k steps) vs low-step days
    const highStepDays = validDays.filter((d) => d.steps! >= 10000);
    const lowStepDays = validDays.filter((d) => d.steps! < 10000);

    logger.info(`[CorrelationEngine] Activity-Sleep variation: ${highStepDays.length} high-step days, ${lowStepDays.length} low-step days`);

    if (highStepDays.length < 3 || lowStepDays.length < 3) {
      logger.info(`[CorrelationEngine] ✗ Activity-Sleep: Insufficient step variation (need 3+ each)`);
      return null; // Not enough variation
    }

    const avgSleepHighSteps =
      highStepDays.reduce((sum, d) => sum + d.sleepMin!, 0) / highStepDays.length;
    const avgSleepLowSteps =
      lowStepDays.reduce((sum, d) => sum + d.sleepMin!, 0) / lowStepDays.length;

    const sleepDifference = avgSleepHighSteps - avgSleepLowSteps;

    // Only create insight if difference is meaningful (>30 min)
    if (Math.abs(sleepDifference) < 30) {
      logger.info(`[CorrelationEngine] ✗ Activity-Sleep: Difference too small (${Math.round(sleepDifference)} min, need 30+)`);
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

    if (validDays.length < 7) {
      logger.info(`[CorrelationEngine] ✗ Sleep-HRV: Insufficient data (${validDays.length} days, need 7+)`);
      return null;
    }

    // Check for good sleep days (>7.5h = 450min) vs poor sleep days
    const goodSleepDays = validDays.filter((d) => d.sleepMin! >= 450);
    const poorSleepDays = validDays.filter((d) => d.sleepMin! < 450);

    logger.info(`[CorrelationEngine] Sleep-HRV: ${validDays.length} valid days (${goodSleepDays.length} good sleep, ${poorSleepDays.length} poor sleep)`);

    if (goodSleepDays.length < 3 || poorSleepDays.length < 3) {
      logger.info(`[CorrelationEngine] ✗ Sleep-HRV: Insufficient sleep variation (need 3+ each)`);
      return null;
    }

    const avgHrvGoodSleep = goodSleepDays.reduce((sum, d) => sum + d.hrv!, 0) / goodSleepDays.length;
    const avgHrvPoorSleep = poorSleepDays.reduce((sum, d) => sum + d.hrv!, 0) / poorSleepDays.length;

    const hrvDifference = avgHrvGoodSleep - avgHrvPoorSleep;
    const percentChange = ((hrvDifference / avgHrvPoorSleep) * 100);

    // Only create insight if difference is meaningful (>10% change)
    if (Math.abs(percentChange) < 10) {
      logger.info(`[CorrelationEngine] ✗ Sleep-HRV: Change too small (${Math.round(percentChange)}%, need 10%+)`);
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
 * Detect correlation between life events and health metrics
 * Examples: ice baths → RHR drop, late meals → glucose spike, supplements → HRV boost
 */
async function detectLifeEventCorrelations(userId: string): Promise<CorrelationResult[]> {
  try {
    const correlations: CorrelationResult[] = [];
    
    // Get life events from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const events = await db
      .select()
      .from(lifeEvents)
      .where(
        and(
          eq(lifeEvents.userId, userId),
          gte(lifeEvents.happenedAt, ninetyDaysAgo)
        )
      )
      .orderBy(desc(lifeEvents.happenedAt));

    if (events.length < 3) {
      logger.debug('[CorrelationEngine] Insufficient life events for correlation');
      return correlations;
    }

    // Group events by type
    const eventsByType = events.reduce((acc, event) => {
      if (!acc[event.eventType]) acc[event.eventType] = [];
      acc[event.eventType].push(event);
      return acc;
    }, {} as Record<string, typeof events>);

    // Analyze ice bath → RHR correlation
    const iceBaths = eventsByType['ice_bath'] || [];
    if (iceBaths.length >= 3) {
      const iceBathCorr = await analyzeIceBathRHRCorrelation(userId, iceBaths);
      if (iceBathCorr) correlations.push(iceBathCorr);
    }

    // Analyze alcohol → HRV correlation
    const alcoholEvents = eventsByType['alcohol'] || [];
    if (alcoholEvents.length >= 3) {
      const alcoholCorr = await analyzeAlcoholHRVCorrelation(userId, alcoholEvents);
      if (alcoholCorr) correlations.push(alcoholCorr);
    }

    // Analyze supplements → HRV correlation
    const supplementEvents = eventsByType['supplements'] || [];
    if (supplementEvents.length >= 5) {
      const suppCorr = await analyzeSupplementHRVCorrelation(userId, supplementEvents);
      if (suppCorr) correlations.push(suppCorr);
    }

    return correlations;
  } catch (error) {
    logger.error('[CorrelationEngine] Life event correlation error:', error);
    return [];
  }
}

/**
 * Analyze ice bath → Resting Heart Rate correlation
 */
async function analyzeIceBathRHRCorrelation(
  userId: string,
  iceBaths: any[]
): Promise<CorrelationResult | null> {
  try {
    let rhrDrops = 0;
    let totalRhrChange = 0;

    for (const bath of iceBaths) {
      const bathDate = new Date(bath.happenedAt);
      const preBathDate = new Date(bathDate);
      preBathDate.setDate(preBathDate.getDate() - 1);
      const postBathDate = new Date(bathDate);
      postBathDate.setDate(postBathDate.getDate() + 2);

      // Get RHR before and after
      const [preBath] = await db
        .select({ rhr: userDailyMetrics.restingHrBpm })
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, preBathDate.toISOString().split('T')[0])
          )
        )
        .limit(1);

      const [postBath] = await db
        .select({ rhr: userDailyMetrics.restingHrBpm })
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, postBathDate.toISOString().split('T')[0])
          )
        )
        .limit(1);

      if (preBath?.rhr && postBath?.rhr) {
        const change = preBath.rhr - postBath.rhr;
        totalRhrChange += change;
        if (change > 2) rhrDrops++;
      }
    }

    const avgRhrDrop = totalRhrChange / iceBaths.length;
    const successRate = rhrDrops / iceBaths.length;

    if (successRate >= 0.6 && avgRhrDrop > 2) {
      const duration = (iceBaths[0].details as any)?.duration_min || 'your';
      return {
        category: 'recovery_hrv',
        pattern: `Ice baths drop your resting heart rate ${Math.round(avgRhrDrop)} bpm over the next 48 hours (${rhrDrops}/${iceBaths.length} times)`,
        confidence: Math.min(successRate, 0.95),
        supportingData: `Based on ${iceBaths.length} ice bath sessions`,
        details: {
          eventType: 'ice_bath',
          avgRhrDrop: Math.round(avgRhrDrop * 10) / 10,
          successRate,
          sampleSize: iceBaths.length,
        },
      };
    }

    return null;
  } catch (error) {
    logger.error('[CorrelationEngine] Ice bath RHR correlation error:', error);
    return null;
  }
}

/**
 * Analyze alcohol → HRV correlation
 */
async function analyzeAlcoholHRVCorrelation(
  userId: string,
  alcoholEvents: any[]
): Promise<CorrelationResult | null> {
  try {
    let hrvDrops = 0;
    let totalHrvChange = 0;

    for (const event of alcoholEvents) {
      const eventDate = new Date(event.happenedAt);
      const nextDay = new Date(eventDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const priorDay = new Date(eventDate);
      priorDay.setDate(priorDay.getDate() - 1);

      const [prior] = await db
        .select({ hrv: userDailyMetrics.hrvMs })
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, priorDay.toISOString().split('T')[0])
          )
        )
        .limit(1);

      const [next] = await db
        .select({ hrv: userDailyMetrics.hrvMs })
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, nextDay.toISOString().split('T')[0])
          )
        )
        .limit(1);

      if (prior?.hrv && next?.hrv) {
        const change = prior.hrv - next.hrv;
        totalHrvChange += change;
        if (change > 5) hrvDrops++;
      }
    }

    const avgHrvDrop = totalHrvChange / alcoholEvents.length;
    const dropRate = hrvDrops / alcoholEvents.length;

    if (dropRate >= 0.6 && avgHrvDrop > 5) {
      return {
        category: 'recovery_hrv',
        pattern: `Alcohol consistently drops your HRV by ${Math.round(avgHrvDrop)} ms for 24-72 hours (${hrvDrops}/${alcoholEvents.length} times)`,
        confidence: Math.min(dropRate, 0.95),
        supportingData: `Based on ${alcoholEvents.length} drinking occasions`,
        details: {
          eventType: 'alcohol',
          avgHrvDrop: Math.round(avgHrvDrop * 10) / 10,
          dropRate,
          sampleSize: alcoholEvents.length,
        },
      };
    }

    return null;
  } catch (error) {
    logger.error('[CorrelationEngine] Alcohol HRV correlation error:', error);
    return null;
  }
}

/**
 * Analyze supplement → HRV correlation
 */
async function analyzeSupplementHRVCorrelation(
  userId: string,
  supplementEvents: any[]
): Promise<CorrelationResult | null> {
  try {
    let hrvBoosts = 0;
    let totalHrvChange = 0;

    for (const event of supplementEvents) {
      const eventDate = new Date(event.happenedAt);
      const nextDay = new Date(eventDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const priorDay = new Date(eventDate);
      priorDay.setDate(priorDay.getDate() - 1);

      const [prior] = await db
        .select({ hrv: userDailyMetrics.hrvMs })
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, priorDay.toISOString().split('T')[0])
          )
        )
        .limit(1);

      const [next] = await db
        .select({ hrv: userDailyMetrics.hrvMs })
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, nextDay.toISOString().split('T')[0])
          )
        )
        .limit(1);

      if (prior?.hrv && next?.hrv) {
        const change = next.hrv - prior.hrv;
        totalHrvChange += change;
        if (change > 5) hrvBoosts++;
      }
    }

    const avgHrvBoost = totalHrvChange / supplementEvents.length;
    const boostRate = hrvBoosts / supplementEvents.length;

    if (boostRate >= 0.6 && avgHrvBoost > 5) {
      const suppNames = (supplementEvents[0].details as any)?.names;
      const suppText = suppNames ? ` (${suppNames.join(', ')})` : '';
      
      return {
        category: 'recovery_hrv',
        pattern: `Your supplement stack${suppText} boosts HRV by ${Math.round(avgHrvBoost)} ms the next day (${hrvBoosts}/${supplementEvents.length} times)`,
        confidence: Math.min(boostRate, 0.95),
        supportingData: `Based on ${supplementEvents.length} supplement days`,
        details: {
          eventType: 'supplements',
          avgHrvBoost: Math.round(avgHrvBoost * 10) / 10,
          boostRate,
          sampleSize: supplementEvents.length,
          supplements: suppNames || [],
        },
      };
    }

    return null;
  } catch (error) {
    logger.error('[CorrelationEngine] Supplement HRV correlation error:', error);
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
  const [activitySleep, sleepHRV, lifeEventCorrs] = await Promise.all([
    detectActivitySleepCorrelation(userId),
    detectSleepHRVCorrelation(userId),
    detectLifeEventCorrelations(userId),
  ]);

  logger.info(`[CorrelationEngine] Detection complete: activitySleep=${!!activitySleep}, sleepHRV=${!!sleepHRV}, lifeEvents=${lifeEventCorrs.length}`);

  if (activitySleep) {
    correlations.push(activitySleep);
    logger.info(`[CorrelationEngine] ✓ Activity-Sleep insight: ${activitySleep.pattern}`);
  }
  
  if (sleepHRV) {
    correlations.push(sleepHRV);
    logger.info(`[CorrelationEngine] ✓ Sleep-HRV insight: ${sleepHRV.pattern}`);
  }
  
  if (lifeEventCorrs.length > 0) {
    correlations.push(...lifeEventCorrs);
    logger.info(`[CorrelationEngine] ✓ Life Event insights: ${lifeEventCorrs.length} patterns`);
  }

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
