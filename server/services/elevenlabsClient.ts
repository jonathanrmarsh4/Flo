import { logger } from '../logger';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

interface SignedUrlResponse {
  signed_url: string;
}

interface AgentConfig {
  agent_id: string;
  user_id: string;
}

class ElevenLabsClient {
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor() {
    this.apiKey = ELEVENLABS_API_KEY;
    this.baseUrl = ELEVENLABS_API_BASE;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async getSignedUrl(agentId: string, userId?: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      let url = `${this.baseUrl}/convai/conversation/get_signed_url?agent_id=${agentId}`;
      
      // Pass user_id as custom metadata so ElevenLabs forwards it to our LLM endpoint
      if (userId) {
        url += `&custom_llm_extra_body=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`;
      }
      
      logger.info('[ElevenLabs] Requesting signed URL', { agentId, userId });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ElevenLabs] Failed to get signed URL', { 
          status: response.status, 
          error: errorText 
        });
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as SignedUrlResponse;
      
      logger.info('[ElevenLabs] Successfully obtained signed URL');
      
      return data.signed_url;
    } catch (error) {
      logger.error('[ElevenLabs] Error getting signed URL:', error);
      throw error;
    }
  }

  async createAgent(config: {
    name: string;
    voice_id: string;
    first_message?: string;
    system_prompt?: string;
    llm_endpoint?: string;
    llm_api_key?: string;
    model?: string;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const url = `${this.baseUrl}/convai/agents/create`;
      
      logger.info('[ElevenLabs] Creating agent', { name: config.name });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_config: {
            agent: {
              prompt: {
                prompt: config.system_prompt || '',
              },
              first_message: config.first_message || 'Hello! How can I help you today?',
              language: 'en',
            },
            tts: {
              voice_id: config.voice_id,
            },
            llm: config.llm_endpoint ? {
              type: 'custom_llm',
              url: config.llm_endpoint,
              api_key: config.llm_api_key,
              model: config.model || 'grok-3-mini',
            } : undefined,
          },
          platform_settings: {
            widget: {
              avatar_url: '',
              greeting_message: config.first_message || 'Hello! How can I help you today?',
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ElevenLabs] Failed to create agent', { 
          status: response.status, 
          error: errorText 
        });
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { agent_id: string };
      
      logger.info('[ElevenLabs] Successfully created agent', { agentId: data.agent_id });
      
      return data.agent_id;
    } catch (error) {
      logger.error('[ElevenLabs] Error creating agent:', error);
      throw error;
    }
  }

  async listVoices(): Promise<Array<{ voice_id: string; name: string }>> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const url = `${this.baseUrl}/voices`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ElevenLabs] Failed to list voices', { 
          status: response.status, 
          error: errorText 
        });
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { voices: Array<{ voice_id: string; name: string }> };
      
      return data.voices;
    } catch (error) {
      logger.error('[ElevenLabs] Error listing voices:', error);
      throw error;
    }
  }
}

export const elevenlabsClient = new ElevenLabsClient();
