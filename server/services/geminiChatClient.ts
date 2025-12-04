/**
 * Gemini Chat Client for Flō Oracle Text Conversations
 * Uses Gemini 2.5 Flash for consistency with voice chat
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '../logger';
import { trackGeminiUsage } from './aiUsageTracker';

export interface GeminiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GeminiChatOptions {
  model?: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  maxTokens?: number;
  temperature?: number;
  userId?: string;
}

export interface GeminiChatResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

class GeminiChatClient {
  private client: GoogleGenAI | null = null;
  private defaultModel = 'gemini-2.5-flash';

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      logger.warn('[GeminiChat] GOOGLE_AI_API_KEY not found - Gemini chat features will be disabled');
      return;
    }

    try {
      this.client = new GoogleGenAI({ apiKey });
      logger.info('[GeminiChat] Client initialized successfully');
    } catch (error) {
      logger.error('[GeminiChat] Failed to initialize client:', error);
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Send a chat message to Gemini
   * @param messages - Array of chat messages (system, user, assistant)
   * @param options - Chat options (model, temperature, etc.)
   * @returns The assistant's response text
   */
  async chat(
    messages: GeminiChatMessage[],
    options: GeminiChatOptions = {}
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Gemini chat client not initialized - check GOOGLE_AI_API_KEY');
    }

    const {
      model = this.defaultModel,
      maxTokens = 1000,
      temperature = 0.7,
      userId,
    } = options;

    const startTime = Date.now();

    try {
      logger.info(`[GeminiChat] Sending chat request with ${messages.length} messages using ${model}`);

      // Extract system prompt and conversation messages
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Build Gemini content format
      const contents = conversationMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const generationConfig = {
        temperature,
        maxOutputTokens: maxTokens,
      };

      const result = await this.client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemMessage?.content || '',
          ...generationConfig,
        },
      });

      // Extract response text with multiple fallback strategies
      let response = '';
      if (result.text) {
        response = result.text;
      } else if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        response = result.candidates[0].content.parts[0].text;
      }
      
      if (!response) {
        logger.warn('[GeminiChat] Empty response from Gemini API', { model });
        throw new Error('Empty response from Gemini API');
      }
      
      const latencyMs = Date.now() - startTime;

      // Track usage
      if (result.usageMetadata) {
        await trackGeminiUsage(
          'gemini-chat',
          model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
          {
            promptTokens: result.usageMetadata.promptTokenCount || 0,
            completionTokens: result.usageMetadata.candidatesTokenCount || 0,
            totalTokens: result.usageMetadata.totalTokenCount || 0,
          },
          {
            userId,
            latencyMs,
            status: 'success',
          }
        ).catch((err) => {
          logger.error('[GeminiChat] Failed to track usage:', err);
        });
      }

      logger.info(`[GeminiChat] Received response (${response.length} chars) in ${latencyMs}ms`);

      return response;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      // Track error
      await trackGeminiUsage(
        'gemini-chat',
        model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        {
          userId,
          latencyMs,
          status: 'error',
          errorMessage: error.message,
        }
      ).catch(() => {});

      logger.error('[GeminiChat] Chat request failed:', {
        error: error.message,
        status: error.status,
        code: error.code,
      });
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}

export const geminiChatClient = new GeminiChatClient();
