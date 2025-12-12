/**
 * WhyInsightGenerator - Generates AI-powered explanations for dashboard tile scores
 * Used by the "Why" button feature to explain Flō Score, Flomentum, Sleep Index, and Readiness
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '../logger';
import { trackGeminiUsage } from './aiUsageTracker';
import { getFlomentumDaily, getFlomentumDailyByDate, getSleepNights } from './healthStorageRouter';
import { calculateDashboardScores } from './scoreCalculator';
import { subDays, format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { db } from '../db';
import { users, userDailyReadiness, sleepSubscores } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

export type TileType = 'flo_overview' | 'flomentum' | 'sleep_index' | 'daily_readiness';

export interface WhyInsightResult {
  title: string;
  score: number | string | null;
  tileType: string;
  aiExplanation: string;
  keyInsights: string[];
  rawData?: Record<string, any>;
}

interface TileDataContext {
  tileType: TileType;
  score: number | string | null;
  components: Record<string, any>;
  recentTrends?: Record<string, any>;
  baselines?: Record<string, any>;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY not configured');
  }
  return new GoogleGenAI({ apiKey });
}

async function fetchFloOverviewContext(userId: string): Promise<TileDataContext> {
  const scores = await calculateDashboardScores(userId);
  
  return {
    tileType: 'flo_overview',
    score: scores.floScore,
    components: {
      cardiometabolic: scores.cardiometabolic,
      bodyComposition: scores.bodyComposition,
      readiness: scores.readiness,
      inflammation: scores.inflammation,
      details: scores.details,
    },
    recentTrends: {
      lastUpdated: scores.lastUpdated,
    },
  };
}

async function fetchFlomentumContext(userId: string, userTimezone: string): Promise<TileDataContext> {
  const today = format(new TZDate(new Date(), userTimezone), 'yyyy-MM-dd');
  const fourteenDaysAgo = subDays(new Date(), 14);
  
  const [todayScore, recentScores] = await Promise.all([
    getFlomentumDailyByDate(userId, today),
    getFlomentumDaily(userId, { startDate: fourteenDaysAgo, limit: 14 }),
  ]);
  
  logger.debug(`[WhyInsight] Flomentum context - todayScore:`, { 
    userId, 
    today,
    hasScore: !!todayScore,
    recentCount: recentScores.length 
  });
  
  // Use today's score or most recent if today is missing
  const activeScore = todayScore || recentScores[0];
  const factors = activeScore?.factors || [];
  const avgScore = recentScores.length > 0 
    ? Math.round(recentScores.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / recentScores.length)
    : null;
  
  // Build streak info
  const consecutiveDays = recentScores.filter((s: any) => s.score && s.score > 0).length;
  
  return {
    tileType: 'flomentum',
    score: activeScore?.score ?? null,
    components: {
      zone: activeScore?.zone,
      factors: factors,
      dailyFocus: activeScore?.dailyFocus,
      streakDays: consecutiveDays,
      scoreDate: activeScore?.date || today,
    },
    recentTrends: {
      averageScore7Day: avgScore,
      recentScores: recentScores.slice(0, 7).map((s: any) => ({ 
        date: s.local_date, 
        score: s.score,
        zone: s.zone,
      })),
      trendDirection: recentScores.length >= 3 
        ? (recentScores[0]?.score > recentScores[2]?.score ? 'improving' : 
           recentScores[0]?.score < recentScores[2]?.score ? 'declining' : 'stable')
        : 'insufficient_data',
    },
  };
}

async function fetchSleepIndexContext(userId: string, userTimezone: string): Promise<TileDataContext> {
  const fourteenDaysAgo = subDays(new Date(), 14);
  
  const [recentSleep, recentSubscores] = await Promise.all([
    getSleepNights(userId, { startDate: fourteenDaysAgo, limit: 14 }),
    db.select().from(sleepSubscores)
      .where(eq(sleepSubscores.userId, userId))
      .orderBy(desc(sleepSubscores.sleepDate))
      .limit(14),
  ]);
  
  logger.debug(`[WhyInsight] Sleep context:`, { 
    userId, 
    sleepNightsCount: recentSleep.length,
    subscoresCount: recentSubscores.length 
  });
  
  const latestNight = recentSleep[0];
  const latestSubscores = recentSubscores[0];
  
  const avgScore = recentSubscores.length > 0
    ? Math.round(recentSubscores.reduce((sum, s) => sum + (s.nightfloScore || 0), 0) / recentSubscores.length)
    : null;
  
  // Calculate sleep stats from raw data if subscores aren't available
  const avgTotalSleep = recentSleep.length > 0
    ? Math.round(recentSleep.reduce((sum, s) => sum + (s.totalSleepMin || 0), 0) / recentSleep.length)
    : null;
  const avgDeepPct = recentSleep.length > 0
    ? Math.round(recentSleep.reduce((sum, s) => sum + (s.deepPct || 0), 0) / recentSleep.length)
    : null;
  const avgEfficiency = recentSleep.length > 0
    ? Math.round(recentSleep.reduce((sum, s) => sum + (s.sleepEfficiencyPct || 0), 0) / recentSleep.length)
    : null;
  
  // Trend analysis
  const last3 = recentSleep.slice(0, 3);
  const prev3 = recentSleep.slice(3, 6);
  const trendDirection = last3.length >= 2 && prev3.length >= 2
    ? (last3.reduce((s, n) => s + (n.totalSleepMin || 0), 0) / last3.length) >
      (prev3.reduce((s, n) => s + (n.totalSleepMin || 0), 0) / prev3.length)
      ? 'improving' : 'declining'
    : 'insufficient_data';
  
  return {
    tileType: 'sleep_index',
    score: latestSubscores?.nightfloScore ?? null,
    components: {
      // Latest night data
      totalSleepMinutes: latestNight?.totalSleepMin,
      totalSleepHours: latestNight?.totalSleepMin ? Math.round((latestNight.totalSleepMin / 60) * 10) / 10 : null,
      sleepEfficiencyPct: latestNight?.sleepEfficiencyPct,
      deepPct: latestNight?.deepPct,
      remPct: latestNight?.remPct,
      hrvMs: latestNight?.hrvMs,
      restingHrBpm: latestNight?.restingHrBpm,
      nightStart: latestNight?.nightStart,
      finalWake: latestNight?.finalWake,
      sleepDate: latestNight?.sleepDate,
      // Subscores
      durationScore: latestSubscores?.durationScore,
      efficiencyScore: latestSubscores?.efficiencyScore,
      structureScore: latestSubscores?.structureScore,
      consistencyScore: latestSubscores?.consistencyScore,
      recoveryScore: latestSubscores?.recoveryScore,
      scoreLabel: latestSubscores?.scoreLabel,
    },
    recentTrends: {
      averageScore7Day: avgScore,
      averageSleepMinutes: avgTotalSleep,
      averageDeepPct: avgDeepPct,
      averageEfficiency: avgEfficiency,
      trendDirection,
      nightsTracked: recentSleep.length,
      recentNights: recentSubscores.slice(0, 7).map(s => ({
        date: s.sleepDate,
        score: s.nightfloScore,
        label: s.scoreLabel,
      })),
      rawNights: recentSleep.slice(0, 5).map(s => ({
        date: s.sleepDate,
        totalHours: s.totalSleepMin ? Math.round((s.totalSleepMin / 60) * 10) / 10 : null,
        deepPct: s.deepPct,
        efficiency: s.sleepEfficiencyPct,
      })),
    },
  };
}

async function fetchReadinessContext(userId: string, userTimezone: string): Promise<TileDataContext> {
  const today = format(new TZDate(new Date(), userTimezone), 'yyyy-MM-dd');
  const fourteenDaysAgo = subDays(new Date(), 14);
  
  const [todayReadiness, recentReadiness, recentSleep] = await Promise.all([
    db.select().from(userDailyReadiness)
      .where(and(eq(userDailyReadiness.userId, userId), eq(userDailyReadiness.date, today)))
      .limit(1),
    db.select().from(userDailyReadiness)
      .where(eq(userDailyReadiness.userId, userId))
      .orderBy(desc(userDailyReadiness.date))
      .limit(14),
    getSleepNights(userId, { startDate: fourteenDaysAgo, limit: 7 }),
  ]);
  
  logger.debug(`[WhyInsight] Readiness context:`, { 
    userId, 
    today,
    hasTodayData: !!todayReadiness[0],
    recentCount: recentReadiness.length,
    sleepCount: recentSleep.length 
  });
  
  // Use today's data or most recent if today is missing
  const activeData = todayReadiness[0] || recentReadiness[0];
  
  const avgScore = recentReadiness.length > 0
    ? Math.round(recentReadiness.reduce((sum, r) => sum + (r.readinessScore || 0), 0) / recentReadiness.length)
    : null;
  
  // Sleep quality context for readiness
  const avgSleepHours = recentSleep.length > 0
    ? Math.round((recentSleep.reduce((sum, s) => sum + (s.totalSleepMin || 0), 0) / recentSleep.length) / 60 * 10) / 10
    : null;
  const avgHRV = recentSleep.length > 0
    ? Math.round(recentSleep.reduce((sum, s) => sum + (s.hrvMs || 0), 0) / recentSleep.length)
    : null;
  
  // Trend analysis
  const last3 = recentReadiness.slice(0, 3);
  const prev3 = recentReadiness.slice(3, 6);
  const trendDirection = last3.length >= 2 && prev3.length >= 2
    ? (last3.reduce((s, r) => s + (r.readinessScore || 0), 0) / last3.length) >
      (prev3.reduce((s, r) => s + (r.readinessScore || 0), 0) / prev3.length)
      ? 'improving' : 'declining'
    : 'insufficient_data';
  
  return {
    tileType: 'daily_readiness',
    score: activeData?.readinessScore ?? null,
    components: {
      readinessBucket: activeData?.readinessBucket,
      sleepScore: activeData?.sleepScore,
      recoveryScore: activeData?.recoveryScore,
      loadScore: activeData?.loadScore,
      trendScore: activeData?.trendScore,
      isCalibrating: activeData?.isCalibrating,
      scoreDate: activeData?.date || today,
      // Sleep context
      lastNightSleepHours: recentSleep[0]?.totalSleepMin 
        ? Math.round((recentSleep[0].totalSleepMin / 60) * 10) / 10 
        : null,
      lastNightHRV: recentSleep[0]?.hrvMs,
      lastNightRestingHR: recentSleep[0]?.restingHrBpm,
    },
    recentTrends: {
      averageScore7Day: avgScore,
      averageSleepHours: avgSleepHours,
      averageHRV: avgHRV,
      trendDirection,
      daysTracked: recentReadiness.length,
      recentDays: recentReadiness.slice(0, 7).map(r => ({
        date: r.date,
        score: r.readinessScore,
        bucket: r.readinessBucket,
        sleepScore: r.sleepScore,
        recoveryScore: r.recoveryScore,
      })),
    },
  };
}

function buildSystemPrompt(): string {
  return `You are Flō, a data-driven AI health analyst who provides personalized, evidence-based health insights with an analytical personality.

Your task is to explain WHY a user has a particular health score by analyzing their data. Be specific, precise, and actionable.

Guidelines:
- Lead with DATA ANALYSIS - reference specific numbers, percentages, trends
- Be analytical but approachable - explain what the numbers mean
- Reference EVERY available data point from the context - don't leave data unmentioned
- Explain what's contributing positively AND negatively to the score
- When scores are based on subscores (like duration, efficiency, recovery), explain each component's contribution
- For trends: compare recent averages to baselines, describe trajectory (improving/declining/stable)
- Provide 3-5 actionable recommendations based on specific weaknesses in the data
- Use exact values: "Your 6.2 hours of sleep is below the 7-hour optimal target" not "Your sleep was short"
- Connect different metrics: "Your HRV of 45ms combined with your resting HR of 68 suggests moderate recovery"

When data is limited or null:
- Acknowledge what data IS available and focus deeply on that
- Explain what additional data would help provide better insights
- Still provide educational context about what the score measures

Output format (JSON):
{
  "explanation": "A 2-3 paragraph analytical explanation of why the score is what it is. MUST reference specific numbers and percentages from the data. Explain each component that contributes to the overall score.",
  "keyInsights": [
    "Specific insight with exact numbers (e.g., 'Your deep sleep at 18% is above the 15% threshold')",
    "Another data-driven insight (e.g., 'Sleep efficiency of 92% indicates minimal time awake in bed')",
    "Trend insight (e.g., 'Your 7-day average of 72 is 8 points above last week')",
    "Actionable recommendation based on a specific data weakness",
    "Second actionable recommendation if relevant"
  ]
}`;
}

function buildUserPrompt(context: TileDataContext, firstName: string): string {
  const tileLabels: Record<TileType, string> = {
    flo_overview: 'Flō Score',
    flomentum: 'Flōmentum',
    sleep_index: 'Sleep Index',
    daily_readiness: 'Daily Readiness',
  };
  
  const tileDescriptions: Record<TileType, string> = {
    flo_overview: `The Flō Score (0-100) is a comprehensive health score combining:
- Cardiometabolic health (from lab biomarkers)
- Body composition 
- Daily readiness
- Inflammation markers
Higher scores indicate better overall health optimization.`,
    flomentum: `Flōmentum (0-100) measures daily health momentum across 5 zones:
- BUILDING (81-100): Exceptional day, building health capital
- MAINTAINING (61-80): Solid day, sustaining progress  
- DRAINING (0-60): Challenging day, depleting reserves
The score is based on factors like sleep quality, activity, and recovery behaviors.`,
    sleep_index: `The Sleep Index (0-100) is a NightFlō score measuring sleep quality across 5 subscores:
- Duration Score: Did you sleep long enough? (target 7-9 hours)
- Efficiency Score: Time asleep vs time in bed (target >85%)
- Structure Score: Deep + REM sleep percentages (deep target >15%, REM target >20%)
- Consistency Score: Regular sleep/wake times
- Recovery Score: HRV and resting heart rate during sleep`,
    daily_readiness: `Daily Readiness (0-100) predicts your capacity for the day based on:
- Sleep Score: Quality and duration of last night's sleep
- Recovery Score: HRV, resting HR, and overnight recovery metrics
- Load Score: Recent activity strain vs recovery balance
- Trend Score: Multi-day trajectory of your metrics
Buckets: Excellent (85+), Good (70-84), Fair (50-69), Low (<50)`,
  };
  
  const hasData = Object.values(context.components).some(v => v !== null && v !== undefined);
  const hasTrends = context.recentTrends && Object.values(context.recentTrends).some(v => 
    v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  );
  
  let dataQualityNote = '';
  if (!hasData) {
    dataQualityNote = '\n\nNOTE: Limited data available. Provide educational context about what this score measures and what data would improve the analysis.';
  } else if (!hasTrends) {
    dataQualityNote = '\n\nNOTE: Limited trend data. Focus on current data points and explain what trends would reveal with more data.';
  }
  
  return `Generate an analytical explanation for ${firstName}'s ${tileLabels[context.tileType]} of ${context.score ?? 'unknown'}.

WHAT THIS SCORE MEASURES:
${tileDescriptions[context.tileType]}

CURRENT DATA (analyze every non-null value):
${JSON.stringify(context.components, null, 2)}

RECENT TRENDS (compare and identify patterns):
${JSON.stringify(context.recentTrends || {}, null, 2)}
${dataQualityNote}

REQUIREMENTS:
1. Reference SPECIFIC numbers from the data above
2. Explain what each subscore/component contributes to the overall score
3. Identify the strongest and weakest components
4. Compare current values to optimal targets
5. Provide actionable recommendations for the weakest areas`;
}

export async function generateWhyInsight(
  userId: string,
  tileType: TileType
): Promise<WhyInsightResult> {
  const startTime = Date.now();
  
  const userRecord = await db.select({ 
    firstName: users.firstName,
    timezone: users.timezone,
  }).from(users).where(eq(users.id, userId)).limit(1);
  
  const firstName = userRecord[0]?.firstName || 'there';
  const userTimezone = userRecord[0]?.timezone || 'America/New_York';
  
  let context: TileDataContext;
  let title: string;
  let tileLabel: string;
  
  switch (tileType) {
    case 'flo_overview':
      context = await fetchFloOverviewContext(userId);
      title = 'Why Your Score is';
      tileLabel = 'Flō Score';
      break;
    case 'flomentum':
      context = await fetchFlomentumContext(userId, userTimezone);
      title = 'Why Your Score is';
      tileLabel = 'Flōmentum';
      break;
    case 'sleep_index':
      context = await fetchSleepIndexContext(userId, userTimezone);
      title = 'Why Your Score is';
      tileLabel = 'Sleep Index';
      break;
    case 'daily_readiness':
      context = await fetchReadinessContext(userId, userTimezone);
      title = 'Why Your Score is';
      tileLabel = 'Readiness';
      break;
    default:
      throw new Error(`Unknown tile type: ${tileType}`);
  }
  
  const client = getGeminiClient();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(context, firstName);
  
  try {
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
      },
    });
    
    const latencyMs = Date.now() - startTime;
    const responseText = result.text?.trim() || '';
    
    if (result.usageMetadata) {
      await trackGeminiUsage('why_insight', 'gemini-2.5-flash', {
        promptTokens: result.usageMetadata.promptTokenCount || 0,
        completionTokens: result.usageMetadata.candidatesTokenCount || 0,
        totalTokens: result.usageMetadata.totalTokenCount || 0,
      }, {
        userId,
        latencyMs,
        status: 'success',
        metadata: { tileType },
      });
    }
    
    const parsed = JSON.parse(responseText);
    
    logger.info(`[WhyInsight] Generated insight for ${tileType}`, {
      userId,
      tileType,
      score: context.score,
      latencyMs,
    });
    
    return {
      title: `${title} ${context.score ?? '—'}`,
      score: context.score,
      tileType: tileLabel,
      aiExplanation: parsed.explanation || 'Unable to generate explanation',
      keyInsights: parsed.keyInsights || [],
      rawData: context.components,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    
    await trackGeminiUsage('why_insight', 'gemini-2.5-flash', {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }, {
      userId,
      latencyMs,
      status: 'error',
      errorMessage: error.message,
      metadata: { tileType },
    }).catch(() => {});
    
    logger.error(`[WhyInsight] Failed to generate insight for ${tileType}:`, error);
    
    return {
      title: `${title} ${context.score ?? '—'}`,
      score: context.score,
      tileType: tileLabel,
      aiExplanation: `Your ${tileLabel} score is ${context.score ?? 'currently unavailable'}. We're having trouble generating a detailed explanation right now. Please try again in a moment.`,
      keyInsights: [],
      rawData: context.components,
    };
  }
}
