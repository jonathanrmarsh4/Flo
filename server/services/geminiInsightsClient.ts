/**
 * Gemini Insights Client
 * Uses Google's Gemini 2.5 Pro model for generating health insights.
 * This replaces OpenAI GPT-4o for the Daily Insights engine.
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '../logger';
import { trackGeminiUsage } from './aiUsageTracker';

export interface GeminiInsightResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

class GeminiInsightsClient {
  private client: GoogleGenAI | null = null;
  private modelName = 'gemini-2.5-pro';

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      logger.info('[GeminiInsights] Client initialized with API key');
    } else {
      logger.warn('[GeminiInsights] No GOOGLE_AI_API_KEY found - Gemini Insights features disabled');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Generate insights using Gemini 2.5 Pro
   * @param systemPrompt - System instructions for the model
   * @param userPrompt - The user's prompt with health data
   * @param jsonMode - Whether to request JSON output
   * @returns Generated text response
   */
  async generateInsights(
    systemPrompt: string,
    userPrompt: string,
    jsonMode: boolean = true
  ): Promise<GeminiInsightResponse> {
    if (!this.client) {
      throw new Error('Gemini Insights client not initialized');
    }

    logger.info('[GeminiInsights] Generating insights', { 
      promptLength: userPrompt.length,
      jsonMode 
    });

    try {
      const generationConfig: any = {
        temperature: 0.7,
        maxOutputTokens: 8192,
      };

      if (jsonMode) {
        generationConfig.responseMimeType = 'application/json';
      }

      const result = await this.client.models.generateContent({
        model: this.modelName,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          ...generationConfig,
        },
      });

      const response = result.text || '';
      
      logger.info('[GeminiInsights] Generated response', { 
        responseLength: response.length,
        usageMetadata: result.usageMetadata
      });

      return {
        text: response,
        usage: result.usageMetadata ? {
          promptTokens: result.usageMetadata.promptTokenCount || 0,
          completionTokens: result.usageMetadata.candidatesTokenCount || 0,
          totalTokens: result.usageMetadata.totalTokenCount || 0,
        } : undefined,
      };
    } catch (error: any) {
      logger.error('[GeminiInsights] Generation failed', { 
        error: error.message,
        code: error.code 
      });
      throw error;
    }
  }

  /**
   * Generate structured JSON insights
   * Convenience method that parses JSON response
   */
  async generateJsonInsights<T>(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ data: T; usage?: GeminiInsightResponse['usage'] }> {
    const response = await this.generateInsights(systemPrompt, userPrompt, true);
    
    try {
      const data = JSON.parse(response.text) as T;
      return { data, usage: response.usage };
    } catch (error) {
      logger.error('[GeminiInsights] Failed to parse JSON response', { 
        responsePreview: response.text.substring(0, 200) 
      });
      throw new Error('Failed to parse Gemini response as JSON');
    }
  }
}

// Biomarker insights types (matching OpenAI interface)
export interface BiomarkerInsightsInput {
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
    medicalContext?: string;
  };
  enrichedData?: {
    valueContext: string;
    encouragementTone: 'praise' | 'maintain' | 'gentle_action' | 'urgent_action';
    severityScore: number;
    deltaPercentage: number;
    trendLabel: string;
  };
}

export interface BiomarkerInsightsOutput {
  lifestyleActions: string[];
  nutrition: string[];
  supplementation: string[];
  medicalReferral: string | null;
  medicalUrgency: 'routine' | 'priority';
}

/**
 * Generate personalized biomarker insights using Gemini 2.5 Pro
 * Replaces the OpenAI GPT-4o version for biomarker detail modals
 */
export async function generateBiomarkerInsightsGemini(input: BiomarkerInsightsInput): Promise<BiomarkerInsightsOutput> {
  if (!geminiInsightsClient.isAvailable()) {
    throw new Error('Gemini Insights client not initialized - check GOOGLE_AI_API_KEY');
  }

  const toneGuidance = {
    praise: "The user is doing great! Use positive, encouraging language. Acknowledge their success and motivate them to maintain their healthy habits.",
    maintain: "The user's value is acceptable. Provide supportive guidance to help them stay on track.",
    gentle_action: "The user's value needs attention. Be encouraging but clear that changes would be beneficial. Avoid alarming language.",
    urgent_action: "The user's value is significantly out of range. Be direct about the importance of taking action and consulting their healthcare provider. This is a priority."
  };

  const currentTone = input.enrichedData?.encouragementTone || 'maintain';
  
  const systemPrompt = `You are an expert health educator specializing in personalized biomarker interpretation. You MUST NEVER diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL SAFETY RULES:
- NEVER state or imply a diagnosis
- NEVER recommend specific medications, doses, or prescription supplements
- NEVER contradict medical advice or tell users to ignore healthcare providers
- Use neutral, educational language: "may support," "research suggests," "consider discussing with your provider"
- Always defer to healthcare providers for medical decisions
- When a biomarker is significantly out of range, recommend medical consultation

PERSONALIZATION REQUIREMENT:
- You MUST reference the user's current value (${input.latestValue} ${input.unit}) and how it compares to the normal reference range (${input.referenceLow}-${input.referenceHigh} ${input.unit})
- IMPORTANT: When status is "optimal", the user IS within the normal range. When "low", they are BELOW it. When "high", they are ABOVE it.
- Adopt this tone: ${toneGuidance[currentTone]}
- ${input.enrichedData?.trendLabel ? `Their trend is ${input.enrichedData.trendLabel} - acknowledge this in your recommendations` : ''}

YOUR TASK:
Analyze this biomarker result and provide personalized, actionable guidance in these categories:
1. Lifestyle Actions (2-3 specific, evidence-based actions that reference their current situation)
2. Nutrition (2-3 dietary recommendations tailored to their status: ${input.status === 'optimal' ? 'WITHIN normal range' : input.status === 'low' ? 'BELOW normal range' : 'ABOVE normal range'})
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
- Start at least one recommendation with acknowledgment of their current value/status
- Use "may help," "research suggests," "consider" - not "will," "must," "should"
- Personalize based on user's profile (age, sex, goals, lifestyle)
- Keep each recommendation to 1-2 sentences
- For supplementation, always include "discuss with your healthcare provider"
- Set medicalUrgency to "priority" only if critically out of range

Follow these additional rules:
(1) Output valid JSON matching the schema exactly.
(2) Each array must have 2-3 items.
(3) At least ONE recommendation must explicitly mention the user's current value (${input.latestValue} ${input.unit}) and whether it's ${input.status === 'optimal' ? 'WITHIN the normal range' : input.status === 'low' ? 'BELOW the normal range' : 'ABOVE the normal range'}.
(4) Use ${currentTone === 'praise' ? 'positive, congratulatory' : currentTone === 'urgent_action' ? 'clear, action-oriented' : 'supportive, encouraging'} language.
(5) NO diagnosis or prescriptions.
(6) Always mention consulting healthcare provider for supplements.`;

  const trendSummary = input.trendHistory && input.trendHistory.length > 1
    ? `Trend: ${input.trendHistory.map((h) => `${h.value} on ${h.date}`).join(', ')} (${input.enrichedData?.trendLabel || 'stable'})`
    : 'No trend data available';

  const profileSummary = `User Profile: Age ${input.profileSnapshot.age || 'unknown'}, Sex: ${input.profileSnapshot.sex || 'unknown'}, Activity: ${input.profileSnapshot.activityLevel || 'unknown'}, Sleep: ${input.profileSnapshot.sleepQuality || 'unknown'}, Diet: ${input.profileSnapshot.dietType || 'unknown'}`;

  const medicalContextInfo = input.profileSnapshot.medicalContext 
    ? `\n\nIMPORTANT MEDICAL CONTEXT (provided by user): ${input.profileSnapshot.medicalContext}\nTake this context into account when generating recommendations. For example, if they're on TRT, expect testosterone levels to be elevated and focus on optimizing other health markers.`
    : '';

  const contextMessage = input.enrichedData?.valueContext || `Current value: ${input.latestValue} ${input.unit} (Reference: ${input.referenceLow}-${input.referenceHigh} ${input.unit})`;

  const userPrompt = `Biomarker: ${input.biomarkerName}
${contextMessage}
Status: ${input.status}${input.enrichedData?.severityScore ? ` (Severity: ${input.enrichedData.severityScore}/100)` : ''}
${trendSummary}

${profileSummary}

Health Goals: ${input.profileSnapshot.healthGoals?.join(', ') || 'Not specified'}${medicalContextInfo}

Provide personalized, actionable insights that EXPLICITLY REFERENCE their current value and status${input.profileSnapshot.medicalContext ? '. IMPORTANT: Account for the medical context provided above when making recommendations' : ''}.`;

  const startTime = Date.now();
  
  try {
    const { data, usage } = await geminiInsightsClient.generateJsonInsights<BiomarkerInsightsOutput>(
      systemPrompt,
      userPrompt
    );

    const latencyMs = Date.now() - startTime;

    logger.info('[GeminiBiomarkerInsights] Generated insights', {
      biomarker: input.biomarkerName,
      status: input.status,
      usage,
      latencyMs
    });

    // Track Gemini usage for admin dashboard
    if (usage) {
      trackGeminiUsage('/api/biomarker-insights', 'gemini-2.5-pro', {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      }, {
        latencyMs,
        status: 'success',
        metadata: { biomarker: input.biomarkerName, biomarkerStatus: input.status },
      }).catch(err => {
        logger.warn('[GeminiBiomarkerInsights] Failed to track usage:', err.message);
      });
    }

    // Validate response structure
    if (!data.lifestyleActions || !data.nutrition || !data.supplementation) {
      throw new Error("Invalid insights response structure");
    }

    // Ensure arrays have content
    if (data.lifestyleActions.length === 0 || data.nutrition.length === 0 || data.supplementation.length === 0) {
      throw new Error("Empty insights arrays");
    }

    return data;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    
    // Track failed request
    trackGeminiUsage('/api/biomarker-insights', 'gemini-2.5-pro', {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }, {
      latencyMs,
      status: 'error',
      errorMessage: error.message,
      metadata: { biomarker: input.biomarkerName },
    }).catch(err => {
      logger.warn('[GeminiBiomarkerInsights] Failed to track error usage:', err.message);
    });
    
    logger.error('[GeminiBiomarkerInsights] Generation failed', { 
      biomarker: input.biomarkerName,
      error: error.message 
    });
    throw new Error(`Failed to generate biomarker insights: ${error.message || 'Unknown error'}`);
  }
}

export const geminiInsightsClient = new GeminiInsightsClient();
