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
  unit?: string | null; // Unit of measurement for biomarkers (e.g., "mg/dL")
}

export interface AIGeneratedInsight {
  title: string;
  body: string;
  action: string;
  targetBiomarker?: string; // Name of the biomarker being tracked (e.g., "Vitamin D")
  currentValue?: number; // Current value (e.g., 28)
  targetValue?: number; // Target value to achieve (e.g., 50)
  unit?: string; // Unit of measurement (e.g., "ng/mL")
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
  
  // DEBUG: Log baseline data being passed to AI
  logger.info(`[AI Prompt Debug] Baseline data for "${candidate.independent}"`, {
    baselineCount: baselines.length,
    baselines: baselines.map(b => ({
      variable: b.variable,
      current: b.current,
      unit: b.unit,
    })),
  });

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
4. **Progress Tracking** (for biomarker-related insights ONLY):
   - If this insight is about a specific biomarker that can be tracked (e.g., Vitamin D, HbA1c, Cholesterol, CRP, etc.):
     * **targetBiomarker**: The name of the biomarker (e.g., "Vitamin D", "HbA1c", "LDL Cholesterol")
     * **currentValue**: The user's CURRENT measured value from the baseline data (numeric)
     * **targetValue**: The OPTIMAL target value for THIS USER based on:
       - Age-specific reference ranges (different targets for 25yo vs 65yo)
       - Sex-specific reference ranges (different targets for males vs females)
       - Evidence-based optimal zones (not just "normal" but truly optimal for longevity/health)
       - Example: For a 35yo male with Vitamin D at 28 ng/mL, target should be ~50 ng/mL (middle of optimal range 40-60)
     * **unit**: The unit of measurement from the baseline data (e.g., "ng/mL", "%", "mg/dL")
   - If this insight is NOT about a trackable biomarker (e.g., sleep patterns, activity correlations without lab values):
     * Leave these fields NULL - not every insight needs progress tracking

## CRITICAL SAFETY RULES (YOU MUST FOLLOW THESE)

1. **Weight Loss Contraindications**:
   - NEVER recommend fat loss, caloric restriction, or weight loss if:
     * User is UNDERWEIGHT (BMI < 18.5)
     * User is LEAN (male body fat <15%, female <22%)
     * User has low lean mass relative to height
   - For underweight/lean users: Focus ONLY on muscle building, nutrient density, adequate calories, and recovery

2. **Supplement Safety**:
   - NEVER recommend specific supplement dosages (e.g., "take 5000 IU vitamin D", "use 3g creatine")
   - ONLY suggest: "Discuss [supplement name] with your doctor based on your [biomarker] levels"
   - NEVER suggest supplements without lab confirmation of deficiency or clinical need
   - Exception: General food-based nutrition is safe (e.g., "eat more protein-rich foods")

3. **Medical Boundaries**:
   - NEVER provide medical diagnoses (e.g., "you have insulin resistance", "you have hypothyroidism")
   - Use language like: "patterns suggest", "may indicate", "worth discussing with your doctor"
   - NEVER recommend stopping medications
   - NEVER recommend prescription medications or controlled substances
   - NEVER recommend diagnostic tests (e.g., "get a glucose tolerance test")

4. **Lab Value Interpretation**:
   - ALWAYS acknowledge when biomarker values are outside reference ranges
   - Distinguish between "clinical range" and "optimal range"
   - For abnormal labs: "Consult your doctor about this result"
   - NEVER dismiss concerning lab values

5. **Activity Safety**:
   - Consider user's current activity level before recommending changes
   - For sedentary users: Start with small, achievable goals (e.g., "walk 15 min/day")
   - For active users: Focus on optimization and recovery, not more volume
   - NEVER recommend extreme training increases (>10% per week)

6. **General Guidance**:
   - Provide specific, actionable HOW (e.g., "resistance training 3x/week targeting major muscle groups")
   - Use everyday language, avoid medical jargon
   - Include realistic timelines (weeks to months, not days)
   - Focus on sustainable behavior change, not quick fixes

## Output Format (JSON)
{
  "title": "Short punchy headline",
  "body": "What changed, why it matters, good/bad interpretation for this user.",
  "action": "Specific recommendation with HOW to do it safely.",
  "targetBiomarker": "Biomarker name (e.g., 'Vitamin D') or null if not applicable",
  "currentValue": 28.5 (numeric current value or null if not applicable),
  "targetValue": 50 (numeric age/sex-specific optimal target or null if not applicable),
  "unit": "ng/mL" (unit string or null if not applicable)
}

IMPORTANT: For biomarker insights, ALWAYS include progress tracking fields:
- **targetBiomarker**: Extract from the baseline data variable name (e.g., "Vitamin D", "Globulin", "Ferritin")
- **currentValue**: Extract from the baseline data current value (numeric)
- **targetValue**: Calculate the MIDDLE of the age/sex-specific optimal range for THIS user
  - Consider their age (${userContext.age || 'unknown'}) and sex (${userContext.sex || 'unknown'})
  - Use evidence-based optimal ranges, not just "normal" clinical ranges
  - Example targets: Vitamin D 50 ng/mL, HbA1c 5.0%, LDL 70 mg/dL, CRP <1.0 mg/L
- **unit**: Extract from the baseline data unit field

Only set these to null if the insight is NOT about a specific biomarker (e.g., sleep patterns, activity trends).

Do NOT include progress tracking for:
- General patterns (e.g., "sleep affects recovery")
- Activity correlations without lab values
- Behavioral insights without biomarkers`;

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

    const insight: AIGeneratedInsight = {
      title: parsed.title || 'Health Insight',
      body: parsed.body || 'Correlation detected in your data.',
      action: parsed.action || 'Monitor this relationship over time.',
      targetBiomarker: parsed.targetBiomarker || undefined,
      currentValue: parsed.currentValue !== null && parsed.currentValue !== undefined ? Number(parsed.currentValue) : undefined,
      targetValue: parsed.targetValue !== null && parsed.targetValue !== undefined ? Number(parsed.targetValue) : undefined,
      unit: parsed.unit || undefined,
    };
    
    // POST-GENERATION SAFETY VALIDATION
    const safetyViolation = validateInsightSafety(insight, userContext);
    if (safetyViolation) {
      logger.warn('AI insight blocked due to safety violation', { safetyViolation, insight });
      throw new Error(`Safety violation: ${safetyViolation}`);
    }
    
    return insight;
  } catch (error) {
    logger.error('AI insight generation failed', { error, candidate });
    
    // Fallback to basic insight (without progress tracking)
    return {
      title: `${candidate.independent} affects ${candidate.dependent}`,
      body: `Your ${candidate.independent} and ${candidate.dependent} show a ${candidate.direction} relationship. This pattern is supported by ${evidenceExplanation}.`,
      action: `Monitor the relationship between ${candidate.independent} and ${candidate.dependent} to understand how changes affect your health.`,
      targetBiomarker: undefined,
      currentValue: undefined,
      targetValue: undefined,
      unit: undefined,
    };
  }
}

// ============================================================================
// Safety Validation
// ============================================================================

/**
 * Validate AI-generated insight for safety violations
 * Returns error message if unsafe, null if safe
 */
function validateInsightSafety(
  insight: AIGeneratedInsight,
  userContext: UserContext
): string | null {
  const fullText = `${insight.title} ${insight.body} ${insight.action}`.toLowerCase();
  
  // 1. Check for ANY supplement recommendations (not just dosages)
  // Use flexible patterns with optional words to catch variants like "start ashwagandha" or "increase your zinc"
  const supplementPatterns = [
    // Dosages (explicit amounts)
    /\d+\s*(iu|mcg|mg|g|ml|units?)\s+(of\s+)?(\w+\s+)?(vitamin|creatine|omega|d3|b12|zinc|magnesium|calcium|protein|collagen|supplement)/i,
    /take\s+\d+/i,
    /\d+\s*(gram|milligram|microgram)/i,
    
    // Direct supplement recommendations with flexible matching - comprehensive list
    /\b(take|start|use|try|add|supplement|consider|increase|boost)\s+(\w+\s+)?(your\s+)?(creatine|omega|vitamin|d3|b12|b6|zinc|magnesium|calcium|iron|protein\s+powder|collagen|probiotics?|prebiotics?|fish\s+oil|curcumin|turmeric|ashwagandha|rhodiola|ginseng|multivitamin|supplement|chromium|lion'?s?\s+mane|berberine|nad\+?|nmn|resveratrol|quercetin|coq10?|melatonin|5-?htp)/i,
    /\b(creatine|omega|vitamin|d3|b12|zinc|magnesium|calcium|iron|ashwagandha|curcumin|probiotics?|chromium|berberine|nad|nmn|quercetin)\s+(\w+\s+)?(supplement|supplementation|daily|intake)/i,
  ];
  
  for (const pattern of supplementPatterns) {
    if (pattern.test(fullText)) {
      return 'Contains supplement recommendation (must suggest "discuss with doctor" instead)';
    }
  }
  
  // 2. Check for weight loss recommendations for lean users
  const bmi = userContext.bodyComposition.bmi || 25;
  const bodyFatPct = userContext.bodyComposition.bodyFatPct || 20;
  const isUnderweight = bmi < 18.5;
  const sexLower = (userContext.sex || '').toLowerCase();
  const isLeanMale = sexLower === 'male' && bodyFatPct < 15;
  const isLeanFemale = sexLower === 'female' && bodyFatPct < 22;
  const isLean = isUnderweight || isLeanMale || isLeanFemale;
  
  if (isLean) {
    const weightLossPatterns = [
      /\blose\s+weight\b/i,
      /\bfat\s+loss\b/i,
      /\bcaloric\s+restriction\b/i,
      /\bcalorie\s+deficit\b/i,
      /\breduce\s+(body\s+)?fat\b/i,
      /\bcut\s+calories\b/i,
      /\bweight\s+reduction\b/i,
    ];
    
    for (const pattern of weightLossPatterns) {
      if (pattern.test(fullText)) {
        return 'Recommends weight loss for underweight/lean user';
      }
    }
  }
  
  // 3. Check for medical diagnoses (broader patterns)
  const diagnosisPatterns = [
    /\byou\s+(have|are|might have|likely have|probably have)\s+(insulin\s+resistance|hypothyroidism|diabetes|hypertension|metabolic syndrome|pcos|thyroid|prediabetes)/i,
    /\bdiagnosed\s+with\b/i,
    /\byou\s+(are|might be|could be)\s+(diabetic|hypertensive|insulin\s+resistant|hypothyroid|prediabetic)/i,
    /\b(this\s+suggests?|this\s+indicates?|this\s+means?)\s+(insulin\s+resistance|diabetes|hypothyroidism)/i,
  ];
  
  for (const pattern of diagnosisPatterns) {
    if (pattern.test(fullText)) {
      return 'Contains medical diagnosis (use "patterns suggest" instead)';
    }
  }
  
  // 4. Check for prescription medication recommendations (flexible patterns)
  // Use optional words to catch variants like "increase your statin dosage" or "ask your doctor about ozempic"
  const medicationPatterns = [
    // Direct medication recommendations with flexible matching - comprehensive drug list
    /\b(take|start|use|try|add|consider|ask\s+your\s+doctor\s+(for|about|to\s+prescribe)|increase|decrease|boost|reduce)\s+(\w+\s+)?(your\s+)?(dose|dosage|dosing\s+of\s+)?(metformin|levothyroxine|statins?|beta\s+blockers?|thyroid\s+medication|blood\s+pressure\s+medication|diabetes\s+medication|statin|ozempic|wegovy|mounjaro|victoza|trulicity|jardiance|farxiga|rybelsus|insulin|lantus|humalog|novolog|glp-?1)/i,
    /\b(start|stop|discontinue|change|adjust|modify|up|increase|decrease)\s+(\w+\s+)?(your\s+)?(taking\s+)?(medication|prescription|thyroid\s+meds?|bp\s+meds?|statins?|metformin|ozempic|insulin)/i,
    /\byour\s+doctor\s+(should\s+)?(prescribe|give\s+you|put\s+you\s+on|up|increase)/i,
    /\b(increase|decrease|adjust|change)\s+(\w+\s+)?(your\s+)?(\w+\s+)?(statin|metformin|levothyroxine|medication|dose|dosage|dosing|ozempic|insulin)/i,
  ];
  
  for (const pattern of medicationPatterns) {
    if (pattern.test(fullText)) {
      return 'Contains medication prescription or change advice (only doctors can prescribe)';
    }
  }
  
  // 5. Check for diagnostic test recommendations (broader patterns)
  const diagnosticTestPatterns = [
    /\b(get|schedule|order|ask for|request)\s+(a\s+)?(glucose\s+tolerance|thyroid|hormone|insulin|a1c|fasting\s+glucose|lipid\s+panel|metabolic\s+panel)\s+test/i,
    /\b(you\s+should|you\s+need|consider)\s+(getting\s+)?(tested|screening|labs|blood work)/i,
  ];
  
  for (const pattern of diagnosticTestPatterns) {
    if (pattern.test(fullText)) {
      return 'Recommends specific diagnostic tests (suggest "discuss with doctor" instead)';
    }
  }
  
  // All safety checks passed
  return null;
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
  
  // BMI and weight category
  if (context.bodyComposition.bmi !== null) {
    const bmi = context.bodyComposition.bmi;
    const bmiCategory = bmi < 18.5 ? 'UNDERWEIGHT (⚠️ DO NOT recommend weight loss)' :
                       bmi < 25 ? 'Healthy Weight' :
                       bmi < 30 ? 'Overweight' : 'Obese';
    parts.push(`BMI: ${bmi.toFixed(1)} (${bmiCategory})`);
  }

  if (context.bodyComposition.bodyFatPct !== null) {
    const fatPct = context.bodyComposition.bodyFatPct;
    const category = context.sex === 'Male' 
      ? (fatPct < 10 ? 'very lean (⚠️ DO NOT recommend fat loss)' : fatPct < 15 ? 'lean (⚠️ DO NOT recommend fat loss)' : fatPct < 20 ? 'fit' : fatPct < 25 ? 'average' : 'high')
      : (fatPct < 18 ? 'very lean (⚠️ DO NOT recommend fat loss)' : fatPct < 22 ? 'lean (⚠️ DO NOT recommend fat loss)' : fatPct < 28 ? 'fit' : fatPct < 32 ? 'average' : 'high');
    
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
      const unit = b.unit ? ` ${b.unit}` : '';
      parts.push(`Current: ${b.current.toFixed(1)}${unit}`);
    }

    if (b.baseline7d !== null && b.percentChange7d !== null) {
      const unit = b.unit ? ` ${b.unit}` : '';
      parts.push(`7-day baseline: ${b.baseline7d.toFixed(1)}${unit} (${b.percentChange7d >= 0 ? '+' : ''}${b.percentChange7d.toFixed(1)}% change)`);
    }

    if (b.baseline30d !== null && b.percentChange30d !== null) {
      const unit = b.unit ? ` ${b.unit}` : '';
      parts.push(`30-day baseline: ${b.baseline30d.toFixed(1)}${unit} (${b.percentChange30d >= 0 ? '+' : ''}${b.percentChange30d.toFixed(1)}% change)`);
    }

    return parts.join(', ');
  }).join('\n');
}

function buildCorrelationSummary(candidate: InsightCandidate): string {
  const parts: string[] = [];
  
  // Variables and direction
  const direction = candidate.direction === 'positive' ? 'increases' : 'decreases';
  parts.push(`When ${candidate.independent} ${direction}, ${candidate.dependent} also changes`);
  
  // Effect size (quantitative) - check for both null and undefined
  if (candidate.effectSize !== null && candidate.effectSize !== undefined) {
    const strength = Math.abs(candidate.effectSize) > 0.6 ? 'strong' : 
                    Math.abs(candidate.effectSize) > 0.4 ? 'moderate' : 'weak';
    parts.push(`Effect Size: ${candidate.effectSize.toFixed(3)} (${strength} ${candidate.direction} relationship)`);
  }
  
  // Deviation percent (for anomaly detection) - check for both null and undefined
  if (candidate.deviationPercent !== null && candidate.deviationPercent !== undefined) {
    parts.push(`Deviation: ${candidate.deviationPercent.toFixed(1)}% from baseline`);
  }
  
  // Layer type
  const layerDesc = candidate.layer === 'A' ? 'Physiological Pathway' :
                   candidate.layer === 'B' ? 'Bayesian Correlation (Personal Data)' :
                   candidate.layer === 'C' ? 'Dose-Response Analysis' : 'Anomaly Detection';
  parts.push(`Analysis Type: ${layerDesc}`);
  
  return parts.join('\n');
}
