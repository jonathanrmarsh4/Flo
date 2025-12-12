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
  const sevenDaysAgo = subDays(new Date(), 7);
  
  const [todayScore, recentScores] = await Promise.all([
    getFlomentumDailyByDate(userId, today),
    getFlomentumDaily(userId, { startDate: sevenDaysAgo, limit: 7 }),
  ]);
  
  const factors = todayScore?.factors || [];
  const avgScore = recentScores.length > 0 
    ? Math.round(recentScores.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / recentScores.length)
    : null;
  
  return {
    tileType: 'flomentum',
    score: todayScore?.score ?? null,
    components: {
      zone: todayScore?.zone,
      factors: factors,
      dailyFocus: todayScore?.dailyFocus,
    },
    recentTrends: {
      averageScore7Day: avgScore,
      recentScores: recentScores.map((s: any) => ({ date: s.local_date, score: s.score })),
    },
  };
}

async function fetchSleepIndexContext(userId: string, userTimezone: string): Promise<TileDataContext> {
  const sevenDaysAgo = subDays(new Date(), 7);
  
  const [recentSleep, recentSubscores] = await Promise.all([
    getSleepNights(userId, { startDate: sevenDaysAgo, limit: 7 }),
    db.select().from(sleepSubscores)
      .where(eq(sleepSubscores.userId, userId))
      .orderBy(desc(sleepSubscores.sleepDate))
      .limit(7),
  ]);
  
  const latestNight = recentSleep[0];
  const latestSubscores = recentSubscores[0];
  
  const avgScore = recentSubscores.length > 0
    ? Math.round(recentSubscores.reduce((sum, s) => sum + (s.nightfloScore || 0), 0) / recentSubscores.length)
    : null;
  
  return {
    tileType: 'sleep_index',
    score: latestSubscores?.nightfloScore ?? null,
    components: {
      totalSleepMinutes: latestNight?.totalSleepMin,
      sleepEfficiencyPct: latestNight?.sleepEfficiencyPct,
      deepPct: latestNight?.deepPct,
      remPct: latestNight?.remPct,
      hrvMs: latestNight?.hrvMs,
      restingHrBpm: latestNight?.restingHrBpm,
      durationScore: latestSubscores?.durationScore,
      efficiencyScore: latestSubscores?.efficiencyScore,
      structureScore: latestSubscores?.structureScore,
      consistencyScore: latestSubscores?.consistencyScore,
      recoveryScore: latestSubscores?.recoveryScore,
      scoreLabel: latestSubscores?.scoreLabel,
    },
    recentTrends: {
      averageScore7Day: avgScore,
      recentNights: recentSubscores.map(s => ({
        date: s.sleepDate,
        score: s.nightfloScore,
        label: s.scoreLabel,
      })),
    },
  };
}

async function fetchReadinessContext(userId: string, userTimezone: string): Promise<TileDataContext> {
  const today = format(new TZDate(new Date(), userTimezone), 'yyyy-MM-dd');
  
  const [todayReadiness, recentReadiness] = await Promise.all([
    db.select().from(userDailyReadiness)
      .where(and(eq(userDailyReadiness.userId, userId), eq(userDailyReadiness.date, today)))
      .limit(1),
    db.select().from(userDailyReadiness)
      .where(eq(userDailyReadiness.userId, userId))
      .orderBy(desc(userDailyReadiness.date))
      .limit(7),
  ]);
  
  const todayData = todayReadiness[0];
  const avgScore = recentReadiness.length > 0
    ? Math.round(recentReadiness.reduce((sum, r) => sum + (r.readinessScore || 0), 0) / recentReadiness.length)
    : null;
  
  return {
    tileType: 'daily_readiness',
    score: todayData?.readinessScore ?? null,
    components: {
      readinessBucket: todayData?.readinessBucket,
      sleepScore: todayData?.sleepScore,
      recoveryScore: todayData?.recoveryScore,
      loadScore: todayData?.loadScore,
      trendScore: todayData?.trendScore,
      isCalibrating: todayData?.isCalibrating,
    },
    recentTrends: {
      averageScore7Day: avgScore,
      recentDays: recentReadiness.map(r => ({
        date: r.date,
        score: r.readinessScore,
        bucket: r.readinessBucket,
      })),
    },
  };
}

function buildSystemPrompt(): string {
  return `You are Flō, a friendly AI health coach who provides personalized, evidence-based health insights in a warm, conversational tone.

Your task is to explain WHY a user has a particular health score. Be specific, actionable, and encouraging.

Guidelines:
- Be conversational but informative - like a knowledgeable friend
- Reference specific data points from the context provided
- Explain what's going well AND areas for improvement
- Provide actionable recommendations
- Keep the tone positive and motivating
- Do not use clinical jargon - use everyday language
- Connect different metrics to show how they influence each other

Output format (JSON):
{
  "explanation": "A 2-3 paragraph conversational explanation of why the score is what it is. Reference specific metrics and trends.",
  "keyInsights": ["Insight 1 with specific data", "Insight 2 with specific data", "Insight 3 with recommendation", "Insight 4 if relevant", "Up to 5 insights"]
}`;
}

function buildUserPrompt(context: TileDataContext, firstName: string): string {
  const tileLabels: Record<TileType, string> = {
    flo_overview: 'Flō Score',
    flomentum: 'Flōmentum',
    sleep_index: 'Sleep Index',
    daily_readiness: 'Daily Readiness',
  };
  
  return `Generate an explanation for ${firstName}'s ${tileLabels[context.tileType]} of ${context.score ?? 'unknown'}.

Context data:
${JSON.stringify(context.components, null, 2)}

Recent trends:
${JSON.stringify(context.recentTrends || {}, null, 2)}

Please explain why their score is what it is, what's contributing positively and negatively, and what they can do to improve or maintain it.`;
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
