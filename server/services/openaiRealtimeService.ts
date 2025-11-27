import { logger } from '../logger';

interface SessionConfig {
  userId: string;
  healthContext: string;
  userName?: string;
}

interface EphemeralKeyResponse {
  value: string;
  expires_at: string;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = 'gpt-4o-realtime-preview';

export class OpenAIRealtimeService {
  private baseUrl = 'https://api.openai.com/v1';

  async createEphemeralKey(config: SessionConfig): Promise<EphemeralKeyResponse> {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const systemInstructions = this.buildSystemPrompt(config);

    // The ephemeral token API uses flat session parameters, not nested under 'session'
    const sessionConfig = {
      model: REALTIME_MODEL,
      voice: 'alloy',
      instructions: systemInstructions,
      input_audio_transcription: {
        model: 'whisper-1'
      },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      }
    };

    logger.info('[OpenAI-Realtime] Creating ephemeral key for user', { 
      userId: config.userId,
      model: REALTIME_MODEL
    });

    const response = await fetch(`${this.baseUrl}/realtime/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sessionConfig)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[OpenAI-Realtime] Failed to create ephemeral key', { 
        status: response.status, 
        error: errorText 
      });
      throw new Error(`Failed to create ephemeral key: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // The sessions endpoint returns client_secret object
    const result: EphemeralKeyResponse = {
      value: data.client_secret?.value || data.value,
      expires_at: data.client_secret?.expires_at || data.expires_at
    };
    
    logger.info('[OpenAI-Realtime] Ephemeral key created successfully', { 
      userId: config.userId,
      expiresAt: result.expires_at
    });

    return result;
  }

  async createUnifiedSession(sdpOffer: string, config: SessionConfig): Promise<string> {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const systemInstructions = this.buildSystemPrompt(config);

    const sessionConfig = JSON.stringify({
      type: 'realtime',
      model: REALTIME_MODEL,
      instructions: systemInstructions,
      voice: 'alloy',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: {
        model: 'whisper-1'
      },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      }
    });

    logger.info('[OpenAI-Realtime] Creating unified session for user', { 
      userId: config.userId,
      model: REALTIME_MODEL
    });

    const formData = new FormData();
    formData.set('sdp', sdpOffer);
    formData.set('session', sessionConfig);

    const response = await fetch(`${this.baseUrl}/realtime/calls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[OpenAI-Realtime] Failed to create unified session', { 
        status: response.status, 
        error: errorText 
      });
      throw new Error(`Failed to create session: ${response.status} ${errorText}`);
    }

    const sdpAnswer = await response.text();
    
    logger.info('[OpenAI-Realtime] Unified session created successfully', { 
      userId: config.userId
    });

    return sdpAnswer;
  }

  private buildSystemPrompt(config: SessionConfig): string {
    const userName = config.userName || 'there';
    
    return `You are Flō, a warm and insightful AI health companion. Your personality is:
- Empathetic and supportive, like a knowledgeable friend
- Data-driven but approachable - you explain complex health concepts simply
- Proactive in spotting patterns and connections in health data
- Encouraging without being preachy

CRITICAL: You have access to this user's real health data. Use it to provide personalized insights.

USER CONTEXT:
${config.healthContext}

GUIDELINES:
1. Reference their actual data when relevant (e.g., "I see your resting heart rate has been averaging 62 BPM...")
2. Look for patterns and correlations across different metrics
3. Celebrate improvements and gently note areas for attention
4. Always end health insights with: "This is educational information - please consult your healthcare provider for medical advice."
5. Be conversational and natural - this is a voice conversation
6. Keep responses concise for voice - aim for 2-3 sentences unless more detail is requested
7. If asked about something not in their data, acknowledge you don't have that specific information

Start the conversation warmly, acknowledging you're Flō and ready to help with their health insights.`;
  }
}

export const openaiRealtimeService = new OpenAIRealtimeService();
