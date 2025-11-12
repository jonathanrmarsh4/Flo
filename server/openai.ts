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
