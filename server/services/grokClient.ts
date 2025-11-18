import OpenAI from 'openai';
import logger from '../logger';

export interface GrokChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GrokChatOptions {
  model?: 'grok-3-mini' | 'grok-4' | 'grok-4-fast';
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

class GrokClient {
  private client: OpenAI | null = null;

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    const apiKey = process.env.XAI_API_KEY;

    if (!apiKey) {
      logger.warn('[Grok] XAI_API_KEY not found - Grok features will be disabled');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://api.x.ai/v1',
      });
      logger.info('[Grok] Client initialized successfully');
    } catch (error) {
      logger.error('[Grok] Failed to initialize client:', error);
    }
  }

  async chat(
    messages: GrokChatMessage[],
    options: GrokChatOptions = {}
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Grok client not initialized - check XAI_API_KEY');
    }

    const {
      model = 'grok-3-mini',
      maxTokens = 1000,
      temperature = 0.7,
    } = options;

    try {
      logger.info(`[Grok] Sending chat request with ${messages.length} messages using ${model}`);

      const completion = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }) as OpenAI.Chat.Completions.ChatCompletion;

      const response = completion.choices[0]?.message?.content || '';
      
      logger.info(`[Grok] Received response (${response.length} chars)`);
      
      return response;
    } catch (error: any) {
      logger.error('[Grok] Chat request failed:', {
        error: error.message,
        status: error.status,
        code: error.code,
      });
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async chatStream(
    messages: GrokChatMessage[],
    options: GrokChatOptions = {}
  ): Promise<AsyncIterable<string>> {
    if (!this.client) {
      throw new Error('Grok client not initialized - check XAI_API_KEY');
    }

    const {
      model = 'grok-3-mini',
      maxTokens = 1000,
      temperature = 0.7,
    } = options;

    try {
      logger.info(`[Grok] Starting stream with ${messages.length} messages using ${model}`);

      const stream = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      const generateChunks = async function* () {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            yield content;
          }
        }
      };

      return generateChunks();
    } catch (error: any) {
      logger.error('[Grok] Stream request failed:', {
        error: error.message,
        status: error.status,
        code: error.code,
      });
      throw new Error(`Grok stream error: ${error.message}`);
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }
}

export const grokClient = new GrokClient();
