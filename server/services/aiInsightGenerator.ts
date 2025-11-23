/**
 * AI-Powered Insight Generator - Daily Insights Engine v3.0
 * 
 * Replaces template-based NLG with GPT-4o contextual generation.
 * Uses user profile, baselines, and trend data to create safe, personalized insights.
 * 
 * Key improvements:
 * - Context-aware (knows if user is lean vs. overweight)
 * - Safe recommendations (no dangerous advice like "cut more" for lean individuals)
 * - Practical HOW (specific training/nutrition guidance)
 * - Personalized to user's profile and current state
 */

import OpenAI from 'openai';
import { logger } from '../logger';
import { db } from '../db';
import { profiles } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { BodyCompositionService } from './bodyCompositionService';
import type { InsightCandidate } from './insightsEngineV2';
import type { EvidenceTier } from './evidenceHierarchy';

// Use Replit's AI Integrations service for OpenAI access
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

// ============================================================================
// User Context for AI
// ============================================================================

export interface UserContext {
  age: number | null;
  sex: 'Male' | 'Female' | 'Other' | null;
  bodyComposition: {
    weightKg: number | null;
    bodyFatPct: number | null;
    leanMassKg: number | null;
    bmi: number | null;
  };
}

export interface BaselineData {
  variable: string;
  current: number | null;
  baseline7d: number | null;
  baseline30d: number | null;
  percentChange7d: number | null;
  percentChange30d: number | null;
}

export interface AIGeneratedInsight {
  title: string;
  body: string;
  action: string;
}

// ============================================================================
// Fetch User Context
// ============================================================================

/**
 * Fetch user context (age, sex, body composition) for AI prompting
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  // Get profile
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const age = profile?.dateOfBirth 
    ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const sex = profile?.sex ?? null;

  // Get body composition (DEXA + HealthKit)
  let bodyComposition = {
    weightKg: null as number | null,
    bodyFatPct: null as number | null,
    leanMassKg: null as number | null,
    bmi: null as number | null,
  };

  try {
    const bodyComp = await BodyCompositionService.getBodyComposition(userId);
    if (bodyComp.snapshot) {
      bodyComposition = {
        weightKg: bodyComp.snapshot.weightKg ?? null,
        bodyFatPct: bodyComp.snapshot.bodyFatPct ?? null,
        leanMassKg: bodyComp.snapshot.leanMassKg ?? null,
        bmi: bodyComp.snapshot.bmi ?? null,
      };
    }
  } catch (error) {
    logger.warn('Could not fetch body composition for AI context', { userId, error });
  }

  return {
    age,
    sex,
    bodyComposition,
  };
}

// ============================================================================
// AI Insight Generation
// ============================================================================

/**
 * Generate contextual, personalized insight using GPT-4o
 * 
 * @param candidate - Insight candidate from analysis layers
 * @param userContext - User profile and body composition
 * @param baselines - Baseline data for involved variables
 * @returns AI-generated insight with title, body, and action
 */
export async function generateContextualInsight(
  candidate: InsightCandidate,
  userContext: UserContext,
  baselines: BaselineData[]
): Promise<AIGeneratedInsight> {
  
  // Build evidence tier explanation
  const evidenceExplanations: Record<EvidenceTier, string> = {
    '1': 'meta-analyses and randomized controlled trials',
    '2': 'large cohort studies (UK Biobank, NHANES)',
    '3': 'mechanistic research and multiple smaller studies',
    '4': 'emerging patterns in longevity and performance cohorts',
    '5': 'your personal data (replicated ≥2 times)',
  };

  const evidenceExplanation = evidenceExplanations[candidate.evidenceTier];

  // Build user context summary
  const userContextSummary = buildUserContextSummary(userContext);

  // Build baseline summary
  const baselineSummary = buildBaselineSummary(baselines);

  // Build correlation summary
  const correlationSummary = buildCorrelationSummary(candidate);

  // Create AI prompt
  const prompt = `You are a health insights AI generating personalized, evidence-based recommendations.

## User Profile
${userContextSummary}

## Correlation Found
${correlationSummary}

## Evidence Level
This relationship is supported by ${evidenceExplanation}.

## Baseline Data (Recent Trends)
${baselineSummary}

## Your Task
Generate a health insight with:

1. **Title** (5-8 words, punchy headline about the relationship)
2. **Body** (2-3 sentences):
   - What changed and by how much
   - Why this matters physiologically
   - Whether this is good/bad/neutral for THIS user's profile
3. **Action** (1-2 sentences):
   - Specific, safe, practical recommendation
   - MUST consider user's current state (e.g., don't recommend fat loss to lean individuals)
   - Include HOW to achieve it (specific training/nutrition/lifestyle guidance)
   - Use realistic timelines and targets

## Safety Rules
- If user is lean (body fat <15% male, <22% female), DO NOT recommend further fat loss
- If user lacks data for safe recommendations, suggest monitoring/tracking first
- Provide specific HOW (resistance training 3x/week, 1.6g protein/kg, etc.)
- Use everyday language, avoid jargon

## Output Format (JSON)
{
  "title": "Short punchy headline",
  "body": "What changed, why it matters, good/bad interpretation for this user.",
  "action": "Specific recommendation with HOW to do it safely."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a health insights AI. Generate personalized, evidence-based, safe recommendations in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);

    return {
      title: parsed.title || 'Health Insight',
      body: parsed.body || 'Correlation detected in your data.',
      action: parsed.action || 'Monitor this relationship over time.',
    };
  } catch (error) {
    logger.error('AI insight generation failed', { error, candidate });
    
    // Fallback to basic insight
    return {
      title: `${candidate.independent} affects ${candidate.dependent}`,
      body: `Your ${candidate.independent} and ${candidate.dependent} show a ${candidate.direction} relationship. This pattern is supported by ${evidenceExplanation}.`,
      action: `Monitor the relationship between ${candidate.independent} and ${candidate.dependent} to understand how changes affect your health.`,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildUserContextSummary(context: UserContext): string {
  const parts: string[] = [];

  if (context.age !== null) {
    parts.push(`Age: ${context.age} years`);
  }

  if (context.sex !== null) {
    parts.push(`Sex: ${context.sex}`);
  }

  if (context.bodyComposition.weightKg !== null) {
    parts.push(`Weight: ${context.bodyComposition.weightKg.toFixed(1)}kg`);
  }

  if (context.bodyComposition.bodyFatPct !== null) {
    const fatPct = context.bodyComposition.bodyFatPct;
    const category = context.sex === 'Male' 
      ? (fatPct < 10 ? 'very lean' : fatPct < 15 ? 'lean' : fatPct < 20 ? 'fit' : fatPct < 25 ? 'average' : 'high')
      : (fatPct < 18 ? 'very lean' : fatPct < 22 ? 'lean' : fatPct < 28 ? 'fit' : fatPct < 32 ? 'average' : 'high');
    
    parts.push(`Body Fat: ${fatPct.toFixed(1)}% (${category})`);
  }

  if (context.bodyComposition.leanMassKg !== null) {
    parts.push(`Lean Mass: ${context.bodyComposition.leanMassKg.toFixed(1)}kg`);
  }

  if (parts.length === 0) {
    return 'Profile: Limited data available';
  }

  return parts.join('\n');
}

function buildBaselineSummary(baselines: BaselineData[]): string {
  if (baselines.length === 0) {
    return 'No baseline data available';
  }

  return baselines.map(b => {
    const parts: string[] = [b.variable];
    
    if (b.current !== null) {
      parts.push(`Current: ${b.current.toFixed(1)}`);
    }

    if (b.baseline7d !== null && b.percentChange7d !== null) {
      parts.push(`7-day baseline: ${b.baseline7d.toFixed(1)} (${b.percentChange7d >= 0 ? '+' : ''}${b.percentChange7d.toFixed(1)}% change)`);
    }

    if (b.baseline30d !== null && b.percentChange30d !== null) {
      parts.push(`30-day baseline: ${b.baseline30d.toFixed(1)} (${b.percentChange30d >= 0 ? '+' : ''}${b.percentChange30d.toFixed(1)}% change)`);
    }

    return parts.join(', ');
  }).join('\n');
}

function buildCorrelationSummary(candidate: InsightCandidate): string {
  const direction = candidate.direction === 'positive' ? 'increases' : 'decreases';
  const strength = candidate.effectSize 
    ? (Math.abs(candidate.effectSize) > 0.6 ? 'strong' : Math.abs(candidate.effectSize) > 0.4 ? 'moderate' : 'weak')
    : 'notable';

  return `When ${candidate.independent} ${direction}, ${candidate.dependent} also changes (${strength} ${candidate.direction} relationship).`;
}
