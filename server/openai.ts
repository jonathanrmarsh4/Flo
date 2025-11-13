// Reference: javascript_openai_ai_integrations blueprint
import OpenAI from "openai";
import {
  type BiomarkerObservation,
  computeClinicalBand,
  validateReport,
  calculateConfidence,
  enforceSafetyRules,
  getUrgentCareBanner,
  generateSuggestedActions,
  performDataQualityCheck,
} from "./guardrails";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

// Legacy interface for backward compatibility
interface BloodWorkAnalysis {
  biologicalAge: string;
  chronologicalAge: string;
  insights: Array<{
    category: string;
    description: string;
    severity?: "low" | "medium" | "high";
  }>;
  metrics: Record<string, any>;
  recommendations: string[];
}

interface BiomarkerInsightsInput {
  biomarkerName: string;
  latestValue: number;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  status: 'optimal' | 'low' | 'high';
  trendHistory?: Array<{ value: number; date: string }>;
  profileSnapshot: {
    age?: number;
    sex?: 'male' | 'female' | 'other';
    healthGoals?: string[];
    activityLevel?: string;
    sleepQuality?: string;
    dietType?: string;
    smoking?: string;
    alcoholConsumption?: string;
  };
}

interface BiomarkerInsightsOutput {
  lifestyleActions: string[];
  nutrition: string[];
  supplementation: string[];
  medicalReferral: string | null;
  medicalUrgency: 'routine' | 'priority';
}

export async function generateBiomarkerInsights(input: BiomarkerInsightsInput): Promise<BiomarkerInsightsOutput> {
  try {
    const systemPrompt = `You are an expert health educator specializing in personalized biomarker interpretation. You MUST NEVER diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL SAFETY RULES:
- NEVER state or imply a diagnosis
- NEVER recommend specific medications, doses, or prescription supplements
- NEVER contradict medical advice or tell users to ignore healthcare providers
- Use neutral, educational language: "may support," "research suggests," "consider discussing with your provider"
- Always defer to healthcare providers for medical decisions
- When a biomarker is significantly out of range, recommend medical consultation

YOUR TASK:
Analyze a single biomarker result and provide personalized, actionable guidance in these categories:
1. Lifestyle Actions (2-3 specific, evidence-based actions)
2. Nutrition (2-3 dietary recommendations)
3. Supplementation (2-3 evidence-based supplement considerations - mention consulting provider)
4. Medical Referral (only if biomarker is critically out of range or warrants provider discussion)

OUTPUT FORMAT (JSON only, no markdown):
{
  "lifestyleActions": ["action 1", "action 2", "action 3"],
  "nutrition": ["nutrition 1", "nutrition 2", "nutrition 3"],
  "supplementation": ["supplement 1", "supplement 2", "supplement 3"],
  "medicalReferral": "string or null",
  "medicalUrgency": "routine" or "priority"
}

WORDING RULES:
- Use "may help," "research suggests," "consider" - not "will," "must," "should"
- Personalize based on user's profile (age, sex, goals, lifestyle)
- Keep each recommendation to 1-2 sentences
- For supplementation, always include "discuss with your healthcare provider"
- Set medicalUrgency to "priority" only if critically out of range`;

    const trendSummary = input.trendHistory && input.trendHistory.length > 1
      ? `Trend: ${input.trendHistory.map((h) => `${h.value} on ${h.date}`).join(', ')}`
      : 'No trend data available';

    const profileSummary = `User Profile: Age ${input.profileSnapshot.age || 'unknown'}, Sex: ${input.profileSnapshot.sex || 'unknown'}, Activity: ${input.profileSnapshot.activityLevel || 'unknown'}, Sleep: ${input.profileSnapshot.sleepQuality || 'unknown'}, Diet: ${input.profileSnapshot.dietType || 'unknown'}`;

    const userMessage = `Biomarker: ${input.biomarkerName}
Latest Value: ${input.latestValue} ${input.unit}
Reference Range: ${input.referenceLow} - ${input.referenceHigh} ${input.unit}
Status: ${input.status}
${trendSummary}

${profileSummary}

Health Goals: ${input.profileSnapshot.healthGoals?.join(', ') || 'Not specified'}

Provide personalized, actionable insights for this biomarker.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "developer",
          content: `Follow these rules: (1) Output valid JSON matching the schema exactly. (2) Each array must have 2-3 items. (3) Use neutral, educational language. (4) Personalize based on user profile. (5) NO diagnosis or prescriptions. (6) Always mention consulting healthcare provider for supplements.`
        },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const insights = JSON.parse(content) as BiomarkerInsightsOutput;

    // Validate response structure
    if (!insights.lifestyleActions || !insights.nutrition || !insights.supplementation) {
      throw new Error("Invalid insights response structure");
    }

    // Ensure arrays have content
    if (insights.lifestyleActions.length === 0 || insights.nutrition.length === 0 || insights.supplementation.length === 0) {
      throw new Error("Empty insights arrays");
    }

    return insights;
  } catch (error: any) {
    console.error("Error generating biomarker insights:", error);
    throw new Error(`Failed to generate biomarker insights: ${error.message || 'Unknown error'}`);
  }
}

export async function analyzeBloodWork(fileContent: string, userId?: string): Promise<BloodWorkAnalysis> {
  try {
    // System prompt following AI Guardrails v1 and Upload Design v1.0
    const systemPrompt = `You are a meticulous clinical data interpreter for blood work analysis. You must NEVER diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL SAFETY RULES:
- NEVER state or imply a diagnosis
- NEVER recommend medications, doses, or specific supplements
- NEVER contradict lab flags or tell users to ignore clinician advice
- Use neutral language: "may be consistent with," "can be influenced by"
- Show uncertainty when evidence is mixed
- Always defer to healthcare providers for medical decisions

YOUR TASK:
Analyze the blood work results and provide:
1. Estimated biological age based on biomarkers (inflammation, metabolic health, organ function)
2. Chronological age (estimate from context or use 35 as default)
3. Educational insights about biomarkers (3-5 key findings)
4. Blood markers extracted with values and units
5. General lifestyle suggestions (NOT medical recommendations)

OUTPUT FORMAT (JSON only, no markdown):
{
  "biologicalAge": "number as string",
  "chronologicalAge": "number as string",
  "insights": [
    {
      "category": "category name (e.g., Inflammation, Metabolic Health)",
      "description": "educational insight using neutral language",
      "severity": "low|medium|high"
    }
  ],
  "metrics": {
    "marker_name": "value with unit"
  },
  "recommendations": ["general lifestyle suggestion 1", "suggestion 2"]
}

WORDING RULES:
- Use "could/may/might" not "does/is"
- Say "may benefit from" not "you should"
- Say "consider discussing with your healthcare provider" not "talk to your doctor about X treatment"
- Highlight assumptions: "fasting status not provided; results can differ post-meal"
- NO medical advice, NO diagnoses, NO prescriptions`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "developer",
          content: `Follow these rules: (1) Output valid JSON matching the schema. (2) Extract biomarkers with units. (3) Use neutral, educational language only. (4) Limit insights to 3-5 items. (5) NO diagnosis or prescriptions.`
        },
        {
          role: "user",
          content: `Analyze this blood work result:\n\n${fileContent}`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const analysis = JSON.parse(content) as BloodWorkAnalysis;
    
    // Validate the response structure
    if (!analysis.biologicalAge || !analysis.insights || !analysis.recommendations) {
      throw new Error("Invalid analysis response structure");
    }

    // Enforce safety rules - block unsafe responses
    const safetyCheck = enforceSafetyRules(analysis);
    if (!safetyCheck.safe) {
      const violationMessage = `AI safety violation: ${safetyCheck.violations.join(', ')}`;
      console.error('SAFETY VIOLATION:', safetyCheck.violations);
      const error: any = new Error(violationMessage);
      error.isSafetyViolation = true;
      error.violations = safetyCheck.violations;
      throw error;
    }

    return analysis;
  } catch (error: any) {
    // Preserve safety violation details
    if (error.isSafetyViolation) {
      throw error; // Rethrow safety violations with full details
    }
    
    console.error("Error analyzing blood work:", error);
    throw new Error(`Failed to analyze blood work with AI: ${error.message || 'Unknown error'}`);
  }
}
