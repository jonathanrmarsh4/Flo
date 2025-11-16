import { db } from "../db";
import { flomentumDaily, flomentumWeekly, userSettings as userSettingsTable } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logger } from "../logger";

export interface WeeklyInsight {
  avgScore: number;
  highestScore: number;
  lowestScore: number;
  whatHelped: string[];
  whatHeldBack: string[];
  focusNextWeek: string;
  sparklineScores: number[];
}

export async function aggregateWeeklyFlomentum(
  userId: string,
  weekStartDate: string
): Promise<WeeklyInsight | null> {
  try {
    // Calculate week end date (6 days after start)
    const weekStart = new Date(weekStartDate);
    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndDate = weekEnd.toISOString().split('T')[0];

    logger.info('Aggregating weekly Flōmentum', { userId, weekStartDate, weekEndDate });

    // Get all daily scores for the week
    const dailyScores = await db
      .select()
      .from(flomentumDaily)
      .where(
        and(
          eq(flomentumDaily.userId, userId),
          gte(flomentumDaily.date, weekStartDate),
          lte(flomentumDaily.date, weekEndDate)
        )
      )
      .orderBy(flomentumDaily.date);

    if (dailyScores.length === 0) {
      logger.warn('No daily scores found for week', { userId, weekStartDate });
      return null;
    }

    // Calculate basic statistics
    const scores = dailyScores.map(d => d.score);
    const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    // Analyze factors across all days
    const allFactors = dailyScores.flatMap(day => {
      try {
        const factors = day.factors as any[];
        return factors.map(f => ({
          ...f,
          date: day.date,
          dayScore: day.score,
        }));
      } catch {
        return [];
      }
    });

    // Identify what helped (positive factors from high-scoring days)
    const highScoringDays = dailyScores.filter(d => d.score >= 70);
    const positiveFactors = highScoringDays.flatMap(day => {
      try {
        const factors = day.factors as any[];
        return factors
          .filter(f => f.status === 'positive' && f.pointsContribution >= 6)
          .map(f => ({
            componentKey: f.componentKey,
            title: f.title,
            points: f.pointsContribution,
          }));
      } catch {
        return [];
      }
    });

    // Group positive factors by component and count occurrences
    const positiveComponentCounts = new Map<string, { count: number; title: string }>();
    for (const factor of positiveFactors) {
      const current = positiveComponentCounts.get(factor.componentKey);
      if (current) {
        current.count += 1;
      } else {
        positiveComponentCounts.set(factor.componentKey, { count: 1, title: factor.title });
      }
    }

    // Get top 2 positive contributors
    const whatHelped = Array.from(positiveComponentCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 2)
      .map(([_key, value]) => value.title);

    // Identify what held back (negative factors from low-scoring days)
    const lowScoringDays = dailyScores.filter(d => d.score < 60);
    const negativeFactors = lowScoringDays.flatMap(day => {
      try {
        const factors = day.factors as any[];
        return factors
          .filter(f => f.status === 'negative' && f.pointsContribution <= -4)
          .map(f => ({
            componentKey: f.componentKey,
            title: f.title,
            points: f.pointsContribution,
          }));
      } catch {
        return [];
      }
    });

    // Group negative factors by component and count occurrences
    const negativeComponentCounts = new Map<string, { count: number; title: string }>();
    for (const factor of negativeFactors) {
      const current = negativeComponentCounts.get(factor.componentKey);
      if (current) {
        current.count += 1;
      } else {
        negativeComponentCounts.set(factor.componentKey, { count: 1, title: factor.title });
      }
    }

    // Get top 2 negative contributors
    const whatHeldBack = Array.from(negativeComponentCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 2)
      .map(([_key, value]) => value.title);

    // Generate focus for next week based on most frequent negative factor
    let focusNextWeek = "Keep building momentum with consistent movement and rest.";
    
    if (negativeComponentCounts.size > 0) {
      const entries = Array.from(negativeComponentCounts.entries());
      const topNegative = entries.sort((a, b) => b[1].count - a[1].count)[0];
      const componentKey = topNegative[0];

      const focusMessages: Record<string, string> = {
        steps: "Focus on reaching your step target 5+ days next week.",
        intensity: "Add 1-2 moderate workouts to boost activity next week.",
        sleep: "Aim for consistent 7-8 hour sleep every night next week.",
        resting_hr: "Prioritize recovery: lighter workouts and quality sleep.",
        hrv: "Focus on stress management and consistent sleep patterns.",
        temp: "Listen to your body and rest if illness symptoms persist.",
        resp_rate: "Monitor respiratory health and ease off intense training.",
        spo2: "Consult a healthcare provider about low oxygen levels.",
      };

      focusNextWeek = focusMessages[componentKey] || focusNextWeek;
    }

    // Create sparkline (7 days worth of scores, null for missing days)
    const sparklineScores: number[] = [];
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(weekStartDate);
      targetDate.setDate(targetDate.getDate() + i);
      const targetDateStr = targetDate.toISOString().split('T')[0];
      
      const dayScore = dailyScores.find(d => d.date === targetDateStr);
      sparklineScores.push(dayScore ? dayScore.score : 0);
    }

    const insight: WeeklyInsight = {
      avgScore,
      highestScore,
      lowestScore,
      whatHelped,
      whatHeldBack,
      focusNextWeek,
      sparklineScores,
    };

    // Build daily scores array for database
    const dailyScoresArray = dailyScores.map(day => ({
      date: day.date,
      label: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
      score: day.score,
      zone: day.zone,
    }));

    // Store in database
    await db.insert(flomentumWeekly).values({
      weekStartDate,
      userId,
      averageScore: avgScore,
      dailyScores: dailyScoresArray,
      whatHelped,
      whatHeldBack,
      focusNextWeek,
    }).onConflictDoUpdate({
      target: [flomentumWeekly.userId, flomentumWeekly.weekStartDate],
      set: {
        averageScore: avgScore,
        dailyScores: dailyScoresArray,
        whatHelped,
        whatHeldBack,
        focusNextWeek,
      },
    });

    logger.info('Weekly Flōmentum aggregated', { 
      userId, 
      weekStartDate, 
      avgScore,
    });

    return insight;
  } catch (error) {
    logger.error('Error aggregating weekly Flōmentum', { userId, weekStartDate, error });
    return null;
  }
}

export async function getWeeklyInsight(
  userId: string,
  weekStartDate: string
): Promise<WeeklyInsight | null> {
  try {
    const [weekly] = await db
      .select()
      .from(flomentumWeekly)
      .where(
        and(
          eq(flomentumWeekly.userId, userId),
          eq(flomentumWeekly.weekStartDate, weekStartDate)
        )
      )
      .limit(1);

    if (!weekly) {
      return null;
    }

    const dailyScoresArray = weekly.dailyScores as any[];
    const sparkline = dailyScoresArray.map(d => d.score);

    return {
      avgScore: weekly.averageScore,
      highestScore: 0,
      lowestScore: 0,
      whatHelped: weekly.whatHelped as string[],
      whatHeldBack: weekly.whatHeldBack as string[],
      focusNextWeek: weekly.focusNextWeek,
      sparklineScores: sparkline,
    };
  } catch (error) {
    logger.error('Error getting weekly insight', { userId, weekStartDate, error });
    return null;
  }
}

export function getMondayOfWeek(date: Date = new Date()): string {
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Adjust to get Monday
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toISOString().split('T')[0];
}
