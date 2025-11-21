import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger';

/**
 * Real-time Correlation Checker for Flō Oracle
 * 
 * Analyzes user behaviors against health metrics during chat conversations
 * Provides instant feedback on correlations or silently logs if no pattern
 */

export interface CorrelationInsight {
  hasCorrelation: boolean;
  insight: string | null;
  behaviorType: string;
  sampleSize: number;
}

interface BehaviorMetricPair {
  behaviorDate: Date;
  metricValue: number | null;
  metricName: string;
}

/**
 * Behavior keywords that trigger correlation checks
 * Expanded to cover all health and activity-related mentions
 */
const BEHAVIOR_TRIGGERS = {
  alcohol: ['alcohol', 'drink', 'drinking', 'drank', 'beer', 'wine', 'whiskey', 'vodka', 'tequila', 'rum', 'cocktail', 'booze', 'tipsy', 'drunk'],
  sauna: ['sauna', 'heat therapy', 'hot room', 'infrared sauna', 'steam room'],
  iceBath: ['ice bath', 'cold plunge', 'ice water', 'cold exposure', 'cold shower', 'cryotherapy'],
  stress: ['stress', 'stressed', 'anxiety', 'anxious', 'overwhelmed', 'panic', 'nervous', 'worried', 'tense'],
  lateMeal: ['late meal', 'ate late', 'dinner late', 'late eating', 'midnight snack', 'ate before bed'],
  caffeine: ['coffee', 'caffeine', 'espresso', 'latte', 'cappuccino', 'energy drink', 'pre-workout', 'red bull', 'tea'],
  supplement: ['supplement', 'vitamin', 'magnesium', 'omega', 'fish oil', 'creatine', 'protein powder', 'probiotic', 'zinc', 'vitamin d'],
  exercise: ['workout', 'exercise', 'gym', 'training', 'ran', 'running', 'jogging', 'lifting', 'weights', 'cardio', 'hiit', 'crossfit', 'yoga', 'pilates', 'bike', 'cycling', 'swim', 'swimming'],
  sleep: ['slept', 'sleep', 'sleeping', 'nap', 'napped', 'insomnia', 'woke up', 'tired', 'exhausted', 'fatigue', 'restless'],
  fasting: ['fasting', 'fasted', 'skipped breakfast', 'intermittent fasting', 'time restricted eating', 'omad'],
  meditation: ['meditate', 'meditation', 'mindfulness', 'breathwork', 'breathing', 'wim hof'],
  illness: ['sick', 'cold', 'flu', 'fever', 'cough', 'headache', 'migraine', 'nausea', 'pain', 'sore throat'],
  travel: ['travel', 'traveling', 'flew', 'flight', 'jet lag', 'timezone', 'vacation', 'trip'],
  meal: ['ate', 'meal', 'breakfast', 'lunch', 'dinner', 'food', 'carbs', 'protein', 'fat', 'keto', 'vegan'],
};

/**
 * Detect if user message contains a behavior trigger
 * Returns first match, prioritizing more specific keywords
 */
export function detectBehavior(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  
  // Sort by keyword length descending to match longer phrases first
  // This prevents "fasted" matching "meal" before "fasting"
  const sortedBehaviors = Object.entries(BEHAVIOR_TRIGGERS).map(([type, keywords]) => ({
    type,
    keywords: keywords.sort((a, b) => b.length - a.length)
  }));
  
  for (const { type, keywords } of sortedBehaviors) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return type;
      }
    }
  }
  
  return null;
}

/**
 * Check for correlations between a behavior and health metrics
 * Returns insight if significant pattern found, null otherwise
 */
export async function checkBehaviorCorrelation(
  userId: string,
  behaviorType: string,
  currentMessage: string
): Promise<CorrelationInsight> {
  try {
    logger.info(`[RealtimeCorrelation] Checking ${behaviorType} correlation for user ${userId}`);

    // Query past occurrences of this behavior from life_events (last 60 days)
    const pastBehaviors = await db.execute(sql`
      SELECT 
        event_date::date as behavior_date,
        event_data
      FROM life_events
      WHERE user_id = ${userId}
        AND event_type = 'behavior'
        AND event_data->>'behavior' = ${behaviorType}
        AND event_date >= NOW() - INTERVAL '60 days'
      ORDER BY event_date DESC
      LIMIT 10
    `);

    const behaviorDates = (pastBehaviors.rows || []).map((row: any) => new Date(row.behavior_date));

    // Need at least 3 past occurrences to show correlation
    if (behaviorDates.length < 3) {
      logger.info(`[RealtimeCorrelation] Insufficient data: only ${behaviorDates.length} past ${behaviorType} events`);
      return {
        hasCorrelation: false,
        insight: null,
        behaviorType,
        sampleSize: behaviorDates.length,
      };
    }

    // Query health metrics for day-after each behavior occurrence (batched)
    const metricPairs: BehaviorMetricPair[] = [];
    
    const dayAfterDates = behaviorDates.map(d => {
      const dayAfter = new Date(d);
      dayAfter.setDate(dayAfter.getDate() + 1);
      return dayAfter.toISOString().split('T')[0];
    });
    
    // Batch query all day-after metrics in one go
    const allMetrics = await db.execute(sql`
      SELECT 
        date,
        hrv_ms,
        resting_hr_bpm,
        sleep_hours
      FROM user_daily_metrics
      WHERE user_id = ${userId}
        AND date = ANY(${dayAfterDates}::date[])
      ORDER BY date DESC
    `);

    // Map metrics back to behavior dates
    for (let i = 0; i < behaviorDates.length; i++) {
      const dayAfterStr = dayAfterDates[i];
      const row: any = allMetrics.rows?.find((r: any) => r.date === dayAfterStr);
      
      if (row) {
        if (row.hrv_ms !== null) {
          metricPairs.push({
            behaviorDate: behaviorDates[i],
            metricValue: parseFloat(String(row.hrv_ms)),
            metricName: 'HRV',
          });
        }
        
        if (row.resting_hr_bpm !== null) {
          metricPairs.push({
            behaviorDate: behaviorDates[i],
            metricValue: parseFloat(String(row.resting_hr_bpm)),
            metricName: 'RHR',
          });
        }
        
        if (row.sleep_hours !== null) {
          metricPairs.push({
            behaviorDate: behaviorDates[i],
            metricValue: parseFloat(String(row.sleep_hours)),
            metricName: 'Sleep',
          });
        }
      }
    }

    if (metricPairs.length === 0) {
      logger.info(`[RealtimeCorrelation] No health metrics found for ${behaviorType} events`);
      return {
        hasCorrelation: false,
        insight: null,
        behaviorType,
        sampleSize: behaviorDates.length,
      };
    }

    // Get user's baseline metrics (30-day average excluding behavior days AND day-after)
    const baselineMetrics = await db.execute(sql`
      SELECT 
        AVG(hrv_ms) as avg_hrv,
        AVG(resting_hr_bpm) as avg_rhr,
        AVG(sleep_hours) as avg_sleep
      FROM user_daily_metrics
      WHERE user_id = ${userId}
        AND date >= NOW() - INTERVAL '30 days'
        AND date NOT IN (
          SELECT event_date::date 
          FROM life_events 
          WHERE user_id = ${userId} 
            AND event_type = 'behavior'
            AND event_data->>'behavior' = ${behaviorType}
          UNION ALL
          SELECT (event_date::date + INTERVAL '1 day')::date 
          FROM life_events 
          WHERE user_id = ${userId} 
            AND event_type = 'behavior'
            AND event_data->>'behavior' = ${behaviorType}
        )
    `);

    const baseline: any = baselineMetrics.rows?.[0];
    
    // Check if we have at least ONE baseline metric (not all null)
    if (!baseline || (baseline.avg_hrv === null && baseline.avg_rhr === null && baseline.avg_sleep === null)) {
      logger.info(`[RealtimeCorrelation] No baseline metrics available (all null)`);
      return {
        hasCorrelation: false,
        insight: null,
        behaviorType,
        sampleSize: behaviorDates.length,
      };
    }

    // Calculate average impact for each metric
    const hrvPairs = metricPairs.filter(p => p.metricName === 'HRV');
    const rhrPairs = metricPairs.filter(p => p.metricName === 'RHR');
    const sleepPairs = metricPairs.filter(p => p.metricName === 'Sleep');

    const insights: string[] = [];

    // HRV correlation (independent check)
    if (hrvPairs.length >= 3 && baseline.avg_hrv !== null) {
      const avgHrvAfter = hrvPairs.reduce((sum, p) => sum + (p.metricValue || 0), 0) / hrvPairs.length;
      const baselineHrv = parseFloat(String(baseline.avg_hrv));
      const hrvChange = avgHrvAfter - baselineHrv;
      const hrvChangePercent = ((hrvChange / baselineHrv) * 100).toFixed(0);

      // Significant if >8% change
      if (Math.abs(parseFloat(hrvChangePercent)) >= 8) {
        const direction = hrvChange > 0 ? 'up' : 'down';
        insights.push(`HRV ${direction} ${Math.abs(parseFloat(hrvChangePercent))}% day-after (${avgHrvAfter.toFixed(0)} ms vs ${baselineHrv.toFixed(0)} ms baseline)`);
      }
    }

    // RHR correlation (independent check)
    if (rhrPairs.length >= 3 && baseline.avg_rhr !== null) {
      const avgRhrAfter = rhrPairs.reduce((sum, p) => sum + (p.metricValue || 0), 0) / rhrPairs.length;
      const baselineRhr = parseFloat(String(baseline.avg_rhr));
      const rhrChange = avgRhrAfter - baselineRhr;
      const rhrChangePercent = ((rhrChange / baselineRhr) * 100).toFixed(0);

      // Significant if >5% change
      if (Math.abs(parseFloat(rhrChangePercent)) >= 5) {
        const direction = rhrChange > 0 ? 'up' : 'down';
        insights.push(`Resting HR ${direction} ${Math.abs(parseFloat(rhrChangePercent))}% day-after (${avgRhrAfter.toFixed(0)} bpm vs ${baselineRhr.toFixed(0)} bpm baseline)`);
      }
    }

    // Sleep correlation (independent check)
    if (sleepPairs.length >= 3 && baseline.avg_sleep !== null) {
      const avgSleepAfter = sleepPairs.reduce((sum, p) => sum + (p.metricValue || 0), 0) / sleepPairs.length;
      const baselineSleep = parseFloat(String(baseline.avg_sleep));
      const sleepChange = avgSleepAfter - baselineSleep;
      const sleepChangePercent = ((sleepChange / baselineSleep) * 100).toFixed(0);

      // Significant if >10% change
      if (Math.abs(parseFloat(sleepChangePercent)) >= 10) {
        const direction = sleepChange > 0 ? 'up' : 'down';
        insights.push(`Sleep ${direction} ${Math.abs(parseFloat(sleepChangePercent))}% (${avgSleepAfter.toFixed(1)}h vs ${baselineSleep.toFixed(1)}h baseline)`);
      }
    }

    // Build final insight message
    if (insights.length > 0) {
      const insightText = `Interesting - based on your last ${behaviorDates.length} ${behaviorType} events: ${insights.join(', ')}. Pattern worth watching.`;
      
      logger.info(`[RealtimeCorrelation] Found correlation for ${behaviorType}: ${insightText}`);
      
      return {
        hasCorrelation: true,
        insight: insightText,
        behaviorType,
        sampleSize: behaviorDates.length,
      };
    } else {
      logger.info(`[RealtimeCorrelation] No significant correlation found for ${behaviorType}`);
      
      return {
        hasCorrelation: false,
        insight: null,
        behaviorType,
        sampleSize: behaviorDates.length,
      };
    }

  } catch (error: any) {
    logger.error(`[RealtimeCorrelation] Error checking correlation for ${behaviorType}:`, error);
    return {
      hasCorrelation: false,
      insight: null,
      behaviorType,
      sampleSize: 0,
    };
  }
}

/**
 * Main entry point for correlation checking during Oracle chat
 * Returns enhanced context to inject into Grok response
 */
export async function analyzeMessageForCorrelations(
  userId: string,
  userMessage: string
): Promise<string | null> {
  const behaviorType = detectBehavior(userMessage);
  
  if (!behaviorType) {
    return null; // No behavior detected, continue normal chat
  }

  logger.info(`[RealtimeCorrelation] Detected ${behaviorType} in message: "${userMessage.substring(0, 50)}..."`);

  const result = await checkBehaviorCorrelation(userId, behaviorType, userMessage);

  if (result.hasCorrelation && result.insight) {
    return result.insight;
  } else if (result.sampleSize > 0) {
    return `Logged. I'm tracking ${behaviorType} patterns - need a few more data points to spot correlations.`;
  } else {
    return `Logged your ${behaviorType}. I'll watch for patterns with your health metrics.`;
  }
}
