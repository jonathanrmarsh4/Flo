/**
 * Gemini Insights Client
 * Uses Google's Gemini 2.5 Pro model for generating health insights.
 * This replaces OpenAI GPT-4o for the Daily Insights engine.
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '../logger';

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
  private modelName = 'gemini-2.5-pro-preview-06-05';

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

export const geminiInsightsClient = new GeminiInsightsClient();
