/**
 * Gemini Chat Client for Flō Oracle Text Conversations
 * Uses Gemini 2.5 Flash for consistency with voice chat
 * Supports function calling for on-demand data retrieval
 */

import { GoogleGenAI, FunctionDeclaration } from '@google/genai';
import { logger } from '../logger';
import { trackGeminiUsage } from './aiUsageTracker';

export interface GeminiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: any;
  };
}

export interface GeminiChatOptions {
  model?: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  maxTokens?: number;
  temperature?: number;
  userId?: string;
  tools?: FunctionDeclaration[];
  toolExecutor?: (name: string, args: Record<string, any>) => Promise<any>;
}

export interface GeminiChatResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolsUsed?: string[];
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

  /**
   * Send a chat message to Gemini with function calling support
   * This method allows the AI to request data on-demand using registered tools
   * @param messages - Array of chat messages
   * @param options - Chat options including tools and tool executor
   * @returns The final response text after all tool calls are resolved
   */
  async chatWithTools(
    messages: GeminiChatMessage[],
    options: GeminiChatOptions = {}
  ): Promise<{ text: string; toolsUsed: string[] }> {
    if (!this.client) {
      throw new Error('Gemini chat client not initialized - check GOOGLE_AI_API_KEY');
    }

    const {
      model = this.defaultModel,
      maxTokens = 2000,
      temperature = 0.7,
      userId,
      tools = [],
      toolExecutor,
    } = options;

    if (!toolExecutor || tools.length === 0) {
      // No tools configured, fall back to regular chat
      const response = await this.chat(messages, options);
      return { text: response, toolsUsed: [] };
    }

    const startTime = Date.now();
    const toolsUsed: string[] = [];
    let totalTokens = { prompt: 0, completion: 0, total: 0 };

    try {
      logger.info(`[GeminiChat] Starting chat with ${tools.length} tools available`);

      // Extract system prompt and conversation messages
      const systemMessage = messages.find(m => m.role === 'system');
      let conversationMessages = messages.filter(m => m.role !== 'system');

      // Add tool usage instructions to system prompt
      const toolInstructions = `

You have access to data retrieval tools to fetch detailed health data when the user asks specific questions about their trends, history, or patterns. Use these tools when:
- User asks about trends over time (e.g., "what's my protein trend this year")
- User asks about specific metrics or correlations (e.g., "how does sleep affect my HRV")
- User needs detailed data beyond the summary provided in context
- User explicitly asks for data analysis or comparisons

Available tools:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When you need to fetch data, call the appropriate tool. After receiving the data, synthesize it into a helpful response.`;

      const enhancedSystemPrompt = (systemMessage?.content || '') + toolInstructions;

      // Build initial contents
      let contents: any[] = conversationMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const generationConfig = {
        temperature,
        maxOutputTokens: maxTokens,
      };

      // Maximum tool call iterations to prevent infinite loops
      const maxIterations = 5;
      let iteration = 0;
      let finalResponse = '';

      while (iteration < maxIterations) {
        iteration++;
        
        // Note: tools parameter exists in API but TypeScript types may be outdated
        const generateParams = {
          model,
          contents,
          tools: [{ functionDeclarations: tools }],
          config: {
            systemInstruction: enhancedSystemPrompt,
            ...generationConfig,
          },
        };
        const result = await this.client.models.generateContent(generateParams as any);

        // Track token usage
        if (result.usageMetadata) {
          totalTokens.prompt += result.usageMetadata.promptTokenCount || 0;
          totalTokens.completion += result.usageMetadata.candidatesTokenCount || 0;
          totalTokens.total += result.usageMetadata.totalTokenCount || 0;
        }

        // Check for function calls
        const candidate = result.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        
        // Look for function calls in the response
        const functionCalls = parts.filter((p: any) => p.functionCall);
        
        if (functionCalls.length === 0) {
          // No function calls - extract final text response
          finalResponse = result.text || parts.find((p: any) => p.text)?.text || '';
          break;
        }

        // Execute function calls
        logger.info(`[GeminiChat] Processing ${functionCalls.length} function call(s) in iteration ${iteration}`);
        
        // Add the model's response (with function calls) to contents
        contents.push({
          role: 'model',
          parts: parts,
        });

        // Execute each function call and collect responses
        const functionResponses: any[] = [];
        
        for (const part of functionCalls) {
          const fc = part.functionCall;
          if (!fc || !fc.name) continue;
          
          const toolName = fc.name;
          const toolArgs = fc.args || {};
          
          logger.info(`[GeminiChat] Executing tool: ${toolName}`, { args: toolArgs });
          toolsUsed.push(toolName);
          
          try {
            const toolResult = await toolExecutor(toolName, toolArgs);
            functionResponses.push({
              functionResponse: {
                name: toolName,
                response: toolResult,
              },
            });
            logger.info(`[GeminiChat] Tool ${toolName} returned successfully`);
          } catch (toolError: any) {
            logger.error(`[GeminiChat] Tool ${toolName} failed:`, toolError.message);
            functionResponses.push({
              functionResponse: {
                name: toolName,
                response: { error: toolError.message },
              },
            });
          }
        }

        // Add function responses to contents
        contents.push({
          role: 'user',
          parts: functionResponses,
        });
      }

      const latencyMs = Date.now() - startTime;

      // Track usage
      await trackGeminiUsage(
        'gemini-chat-tools',
        model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
        {
          promptTokens: totalTokens.prompt,
          completionTokens: totalTokens.completion,
          totalTokens: totalTokens.total,
        },
        {
          userId,
          latencyMs,
          status: 'success',
        }
      ).catch((err) => {
        logger.error('[GeminiChat] Failed to track usage:', err);
      });

      logger.info(`[GeminiChat] Chat with tools completed in ${latencyMs}ms, used ${toolsUsed.length} tool(s): ${toolsUsed.join(', ')}`);

      return { text: finalResponse, toolsUsed };

    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      // Track error
      await trackGeminiUsage(
        'gemini-chat-tools',
        model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        {
          userId,
          latencyMs,
          status: 'error',
          errorMessage: error.message,
        }
      ).catch(() => {});

      logger.error('[GeminiChat] Chat with tools failed:', {
        error: error.message,
        status: error.status,
        code: error.code,
      });
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}

export const geminiChatClient = new GeminiChatClient();
