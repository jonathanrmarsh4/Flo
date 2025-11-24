/**
 * RAG-Based Holistic Insight Generator
 * 
 * Replaces complex pathway system with AI-driven correlation discovery.
 * Uses vector search to find similar patterns in user's historical data.
 */

import { logger } from '../logger';
import { searchSimilarContent } from './embeddingService';
import { getUserContext, type UserContext } from './aiInsightGenerator';
import OpenAI from 'openai';
import { differenceInDays, format } from 'date-fns';

// Use Replit's AI Integrations service for OpenAI access
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface DataChange {
  metric: string;
  previous: number | null;
  current: number | null;
  percentChange: number | null;
  direction: 'increase' | 'decrease' | 'stable';
  unit?: string;
}

export interface RAGInsight {
  title: string;
  body: string;
  action: string;
  confidence: number;
  relatedMetrics: string[];
  // Progress tracking fields (for biomarker-related insights)
  targetBiomarker?: string | null;
  currentValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
}

/**
 * Detect significant changes in user's data
 */
export function detectDataChanges(
  biomarkers: Array<{ name: string; value: number; unit: string; testDate: Date }>,
  dailyMetrics: Array<any>
): DataChange[] {
  const changes: DataChange[] = [];
  
  // Analyze biomarker changes (compare most recent to previous)
  const biomarkersByName = new Map<string, Array<{ value: number; testDate: Date; unit: string }>>();
  
  for (const b of biomarkers) {
    if (!biomarkersByName.has(b.name)) {
      biomarkersByName.set(b.name, []);
    }
    biomarkersByName.get(b.name)!.push({ value: b.value, testDate: b.testDate, unit: b.unit });
  }
  
  // Sort and detect changes
  for (const [name, values] of Array.from(biomarkersByName.entries())) {
    const sorted = values.sort((a: any, b: any) => b.testDate.getTime() - a.testDate.getTime());
    
    if (sorted.length >= 2) {
      const current = sorted[0].value;
      const previous = sorted[1].value;
      const percentChange = previous !== 0 ? ((current - previous) / previous) * 100 : null;
      
      // Only include significant changes (>5%)
      if (percentChange !== null && Math.abs(percentChange) > 5) {
        changes.push({
          metric: name,
          previous,
          current,
          percentChange,
          direction: percentChange > 0 ? 'increase' : 'decrease',
          unit: sorted[0].unit,
        });
      }
    }
  }
  
  // Analyze HealthKit metric changes (last 7 days vs previous 7 days)
  // Relaxed requirement: allow 10+ days with up to 3 nulls per metric
  if (dailyMetrics.length >= 10) {
    const recentWeek = dailyMetrics.slice(0, 7);
    const previousWeek = dailyMetrics.slice(7, Math.min(14, dailyMetrics.length));
    
    // Map to actual database field names (from healthDailyMetrics table via fetchHealthData())
    const metricMappings = [
      { displayName: 'HRV', fieldName: 'hrvSdnnMs', unit: 'ms' },
      { displayName: 'Sleep', fieldName: 'sleepTotalMinutes', unit: 'minutes' },
      { displayName: 'Resting Heart Rate', fieldName: 'restingHr', unit: 'bpm' },
      { displayName: 'Steps', fieldName: 'steps', unit: 'steps' },
      { displayName: 'Active Energy', fieldName: 'activeKcal', unit: 'kcal' },
      { displayName: 'Exercise', fieldName: 'exerciseMinutes', unit: 'minutes' },
      { displayName: 'Body Fat', fieldName: 'bodyFatPct', unit: '%' },
      { displayName: 'Weight', fieldName: 'weightKg', unit: 'kg' },
    ];
    
    for (const mapping of metricMappings) {
      const recentValues = recentWeek.map((m: any) => m[mapping.fieldName]).filter((v: any) => v !== null && v !== undefined && !isNaN(v));
      const previousValues = previousWeek.map((m: any) => m[mapping.fieldName]).filter((v: any) => v !== null && v !== undefined && !isNaN(v));
      
      // Allow metrics with at least 4 valid data points per week (tolerates 3 nulls)
      if (recentValues.length >= 4 && previousValues.length >= 4) {
        const recentAvg = average(recentValues);
        const previousAvg = average(previousValues);
        
        if (recentAvg !== null && previousAvg !== null && previousAvg !== 0) {
          const percentChange = ((recentAvg - previousAvg) / previousAvg) * 100;
          
          // Only include significant changes (>10% for HealthKit metrics)
          if (Math.abs(percentChange) > 10) {
            changes.push({
              metric: mapping.displayName,
              previous: previousAvg,
              current: recentAvg,
              percentChange,
              direction: percentChange > 0 ? 'increase' : 'decrease',
              unit: mapping.unit,
            });
          }
        }
      }
    }
  }
  
  logger.info(`[RAG] Detected ${changes.length} significant data changes`);
  return changes;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Generate holistic insights using RAG (vector search + GPT-4o)
 */
export async function generateRAGInsights(
  userId: string,
  changes: DataChange[],
  biomarkers: Array<{ name: string; value: number; unit: string; testDate: Date; isAbnormal: boolean }>,
  userContext: UserContext
): Promise<RAGInsight[]> {
  
  if (changes.length === 0) {
    logger.info('[RAG] No significant changes detected, skipping insight generation');
    return [];
  }
  
  // Build summary of current changes for vector search
  const changeSummary = changes.map(c => 
    `${c.metric} ${c.direction === 'increase' ? 'increased' : 'decreased'} by ${Math.abs(c.percentChange || 0).toFixed(1)}%`
  ).join(', ');
  
  logger.info(`[RAG] Searching for similar patterns: ${changeSummary}`);
  
  // Search for similar patterns in user's historical data
  const similarPatterns = await searchSimilarContent(
    userId,
    changeSummary,
    10 // Get top 10 similar patterns
  );
  
  logger.info(`[RAG] Found ${similarPatterns.length} similar historical patterns`);
  
  // Build context from retrieved patterns
  const historicalContext = similarPatterns.length > 0
    ? similarPatterns.map(p => `- ${p.content} (${(p.similarity * 100).toFixed(0)}% similar)`).join('\n')
    : 'No similar historical patterns found';
  
  // Build current state summary
  const currentStateSummary = buildCurrentStateSummary(changes, biomarkers, userContext);
  
  // Generate insights using GPT-4o with retrieved context
  const prompt = `You are a health insights AI analyzing a user's recent health data changes.

## User Profile
${buildUserProfileSummary(userContext)}

## Recent Changes (Last 7-14 Days)
${changes.map(c => `- ${c.metric}: ${c.previous?.toFixed(1)}${c.unit || ''} → ${c.current?.toFixed(1)}${c.unit || ''} (${c.percentChange! > 0 ? '+' : ''}${c.percentChange?.toFixed(1)}%)`).join('\n')}

## Historical Patterns (Vector Search Results)
${historicalContext}

## Current Biomarker Status
${biomarkers.slice(0, 10).map(b => `- ${b.name}: ${b.value} ${b.unit}${b.isAbnormal ? ' ⚠️ OUT OF RANGE' : ''}`).join('\n')}

## Your Task
Generate up to 20 holistic health insights that provide comprehensive coverage across ALL categories:
1. **BIOMARKERS**: Analyze blood work patterns and lab correlations (iron, ferritin, hormones, metabolic markers, etc.)
2. **SLEEP**: Identify sleep quality patterns and trends (total duration, deep sleep %, REM %, sleep efficiency, consistency trends over time)
3. **RECOVERY**: Analyze HRV trends, resting heart rate patterns, and correlations between recovery metrics and other data
4. **ACTIVITY**: Examine steps, exercise, active energy, VO2 max, and physical performance

For each insight:
- **Identify cross-domain patterns** (e.g., "low ferritin + poor sleep recovery + declining HRV")
- **Look at TRENDS over time**, not just recent values (e.g., "sleep duration declining over the past 2 weeks")
- **Find correlations between metrics** (e.g., "HRV drops correlate with poor sleep quality")
- **Explain WHY correlations matter** with physiological mechanisms
- **Interpret whether patterns are good/bad** for THIS user's profile
- **Provide safe, practical recommendations** tailored to their current state

IMPORTANT: Generate insights for ALL 4 categories. Even if recent data is sparse, look for trends and patterns over available history. Prioritize:
- Sleep trends and quality patterns (especially if showing decline)
- HRV correlations with sleep, stress, and recovery
- Cross-metric relationships that reveal health patterns

## CRITICAL SAFETY RULES
1. NO supplement dosages (e.g., "take 5000 IU vitamin D")
2. NO weight loss recommendations for underweight/lean users
3. NO medical diagnoses (use "patterns suggest" instead)
4. NO prescription medication recommendations
5. For abnormal labs: "Consult your doctor about this result"

## Output Format (JSON Array)
[
  {
    "title": "Short punchy headline (5-8 words)",
    "body": "2-3 sentences: What changed, why it matters physiologically, good/bad interpretation",
    "action": "Specific, safe recommendation with HOW to do it",
    "confidence": 0.85,
    "relatedMetrics": ["metric1", "metric2", "metric3"],
    "targetBiomarker": "Biomarker name (e.g., 'Vitamin D', 'Ferritin') or null if not a biomarker insight",
    "currentValue": 28.5 (numeric current value from recent data or null if not applicable),
    "targetValue": 50 (numeric age/sex-specific optimal target or null if not applicable),
    "unit": "ng/mL" (unit string or null if not applicable)
  }
]

IMPORTANT: For biomarker-related insights, ALWAYS include progress tracking:
- **targetBiomarker**: Extract from the changes list (e.g., "Ferritin", "Globulin", "Vitamin D")
- **currentValue**: Current measured value (numeric)
- **targetValue**: Age/sex-specific optimal target for this ${userContext.age || 'unknown'}yo ${userContext.sex || 'unknown'} user
- **unit**: Unit from changes data (e.g., "ng/mL", "g/dL", "%")

For non-biomarker insights (sleep, HRV, activity patterns), set these to null.`;

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
    const insights: RAGInsight[] = Array.isArray(parsed.insights) ? parsed.insights : [parsed];
    
    logger.info(`[RAG] Generated ${insights.length} holistic insights`);
    return insights;
    
  } catch (error: any) {
    logger.error('[RAG] Failed to generate insights:', error);
    return [];
  }
}

function buildCurrentStateSummary(changes: DataChange[], biomarkers: Array<any>, userContext: UserContext): string {
  return `Recent changes: ${changes.map(c => c.metric).join(', ')}. ${biomarkers.length} biomarkers tracked.`;
}

function buildUserProfileSummary(userContext: UserContext): string {
  const parts: string[] = [];
  
  if (userContext.age) parts.push(`${userContext.age} years old`);
  if (userContext.sex) parts.push(userContext.sex);
  if (userContext.bodyComposition.bodyFatPct) {
    parts.push(`${userContext.bodyComposition.bodyFatPct.toFixed(1)}% body fat`);
  }
  if (userContext.bodyComposition.weightKg) {
    parts.push(`${userContext.bodyComposition.weightKg.toFixed(1)}kg`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'Profile incomplete';
}
