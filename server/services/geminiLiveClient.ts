/**
 * Gemini Live API Client
 * Provides real-time bidirectional voice streaming using Google's Gemini 2.5 Flash
 * with native audio support for low-latency conversational AI.
 */

import { GoogleGenAI, Modality, Session, LiveConnectParameters, LiveServerMessage } from '@google/genai';
import { logger } from '../logger';
import { trackGeminiUsage } from './aiUsageTracker';

interface SessionMetadata {
  startTime: number;
  userId?: string;
  audioChunkCount: number;
}

export interface GeminiLiveConfig {
  systemInstruction: string;
  voiceName?: string;
  userId?: string;
}

export interface LiveSessionCallbacks {
  onAudioChunk: (audioData: Buffer) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onModelText: (text: string) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

class GeminiLiveClient {
  private client: GoogleGenAI | null = null;
  private activeSessions: Map<string, Session> = new Map();
  private sessionMetadata: Map<string, SessionMetadata> = new Map();

  /**
   * Track usage and clean up session metadata
   * Called on both clean closes and unexpected terminations
   */
  private trackAndCleanup(sessionId: string, closeReason: string): void {
    const metadata = this.sessionMetadata.get(sessionId);
    
    if (metadata) {
      const durationMs = Date.now() - metadata.startTime;
      const durationSeconds = Math.ceil(durationMs / 1000);
      
      // Estimate tokens based on audio duration
      // Gemini Live uses approximately 25 tokens per second of audio for input/output
      const estimatedTokens = Math.ceil(durationSeconds * 25);
      
      trackGeminiUsage('voice_chat', 'gemini-2.5-flash-native-audio', {
        promptTokens: estimatedTokens,
        completionTokens: estimatedTokens,
        totalTokens: estimatedTokens * 2,
      }, {
        userId: metadata.userId,
        latencyMs: durationMs,
        metadata: { 
          durationSeconds,
          audioChunks: metadata.audioChunkCount,
          closeReason,
        },
      }).catch(err => logger.error('[GeminiLive] Failed to track usage:', err));
      
      logger.info('[GeminiLive] Session usage tracked', { 
        sessionId,
        closeReason,
        durationSeconds,
        estimatedTokens,
        audioChunks: metadata.audioChunkCount,
      });
      
      // Always clean up metadata
      this.sessionMetadata.delete(sessionId);
    }
  }

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      logger.info('[GeminiLive] Client initialized with API key');
    } else {
      logger.warn('[GeminiLive] No GOOGLE_AI_API_KEY found - Gemini Live features disabled');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Create a new live session for bidirectional audio streaming
   */
  async createSession(
    sessionId: string,
    config: GeminiLiveConfig,
    callbacks: LiveSessionCallbacks
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Gemini Live client not initialized');
    }

    if (this.activeSessions.has(sessionId)) {
      logger.warn('[GeminiLive] Session already exists, closing old one', { sessionId });
      await this.closeSession(sessionId);
    }

    logger.info('[GeminiLive] Creating new session', { sessionId, voiceName: config.voiceName || 'Puck (default)' });

    // Create a promise that resolves when session is ready
    let sessionReady: () => void;
    let sessionFailed: (error: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      sessionReady = resolve;
      sessionFailed = reject;
    });

    // Native audio model for voice conversations
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
    
    const connectParams: LiveConnectParameters = {
      model,
      callbacks: {
        onopen: () => {
          logger.info('[GeminiLive] Session opened', { sessionId });
          sessionReady();
        },
        onmessage: (message: LiveServerMessage) => {
          // Log the raw message for debugging
          logger.debug('[GeminiLive] Received message', { 
            sessionId,
            hasData: !!message.data,
            hasServerContent: !!message.serverContent,
            messageType: Object.keys(message).join(', ')
          });
          this.processMessage(message, callbacks);
        },
        onerror: (error: ErrorEvent) => {
          logger.error('[GeminiLive] Session error', { sessionId, error: error.message });
          sessionFailed(new Error(error.message || 'Gemini Live session error'));
          callbacks.onError(new Error(error.message || 'Gemini Live session error'));
        },
        onclose: (event: CloseEvent) => {
          const closeReason = event?.wasClean 
            ? 'clean_close' 
            : `unexpected_close_${event?.code || 'unknown'}`;
          
          logger.info('[GeminiLive] Session closed via callback', { 
            sessionId, 
            code: event?.code,
            reason: event?.reason,
            wasClean: event?.wasClean
          });
          
          // Track usage and cleanup metadata for all close paths
          this.trackAndCleanup(sessionId, closeReason);
          
          this.activeSessions.delete(sessionId);
          callbacks.onClose();
        },
      },
      config: {
        // Native audio model requires AUDIO modality only
        responseModalities: [Modality.AUDIO],
        systemInstruction: config.systemInstruction,
        // Voice configuration - use specified voice or default to Puck
        speechConfig: config.voiceName ? {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: config.voiceName,
            },
          },
        } : undefined,
        // Enable input audio transcription to get user speech as text
        inputAudioTranscription: {},
      },
    };

    try {
      logger.info('[GeminiLive] Connecting to Gemini Live API...', { 
        sessionId,
        model: connectParams.model 
      });
      
      const session = await this.client.live.connect(connectParams);
      
      if (!session) {
        throw new Error('Session returned as undefined');
      }
      
      this.activeSessions.set(sessionId, session);
      
      // Initialize session metadata for tracking
      this.sessionMetadata.set(sessionId, {
        startTime: Date.now(),
        userId: config.userId,
        audioChunkCount: 0,
      });
      
      // Wait for session to be fully ready (onopen callback)
      // Add a timeout to prevent hanging forever
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Session open timeout after 10s')), 10000);
      });
      
      await Promise.race([readyPromise, timeoutPromise]);
      
      logger.info('[GeminiLive] Session connected and ready', { 
        sessionId,
        hasSession: !!session,
        userId: config.userId
      });
    } catch (error: any) {
      logger.error('[GeminiLive] Failed to create session', { 
        sessionId, 
        error: error.message,
        stack: error.stack 
      });
      // Clean up if we stored the session
      this.activeSessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Process incoming messages from Gemini Live
   */
  private processMessage(message: LiveServerMessage, callbacks: LiveSessionCallbacks): void {
    try {
      // Handle audio data (base64 encoded in message.data)
      if (message.data) {
        const audioBuffer = Buffer.from(message.data, 'base64');
        callbacks.onAudioChunk(audioBuffer);
      }

      // Handle input audio transcription (user's speech as text)
      // This comes from the inputAudioTranscription config option
      const serverContent = message.serverContent as any;
      if (serverContent?.inputTranscript) {
        const transcript = serverContent.inputTranscript;
        logger.info('[GeminiLive] Received input transcript', { 
          transcriptLength: transcript.length,
          transcriptPreview: transcript.substring(0, 100)
        });
        // Send the user's speech transcript - NOT final until turn complete
        callbacks.onTranscript(transcript, false);
      }

      // Handle model's text response if present in serverContent
      if (message.serverContent?.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
          if (part.text) {
            // This is the model's text response
            callbacks.onModelText(part.text);
          }
        }
      }

      // Handle turn complete
      if (message.serverContent?.turnComplete) {
        callbacks.onTranscript('', true);
      }
    } catch (error: any) {
      logger.error('[GeminiLive] Error processing message', { error: error.message });
    }
  }

  /**
   * Send audio data to the session
   * Audio should be 16-bit PCM, 16kHz, mono
   */
  async sendAudio(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const base64Audio = audioData.toString('base64');
    
    // Increment audio chunk count for usage tracking
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      metadata.audioChunkCount++;
    }
    
    try {
      await session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    } catch (error: any) {
      logger.error('[GeminiLive] Failed to send audio', { sessionId, error: error.message });
      throw error;
    }
  }

  /**
   * Send text message to the session
   */
  async sendText(sessionId: string, text: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      await session.sendRealtimeInput({
        text: text,
      });
    } catch (error: any) {
      logger.error('[GeminiLive] Failed to send text', { sessionId, error: error.message });
      throw error;
    }
  }

  /**
   * Close a session and track usage
   * Note: The onclose callback will also track usage, so we use trackAndCleanup
   * which safely handles multiple calls via sessionMetadata.get check
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      try {
        // Track usage and cleanup metadata before closing
        // This is safe to call - trackAndCleanup checks if metadata exists
        this.trackAndCleanup(sessionId, 'app_initiated_close');
        
        session.close();
        this.activeSessions.delete(sessionId);
        
        logger.info('[GeminiLive] Session closed', { sessionId });
      } catch (error: any) {
        logger.error('[GeminiLive] Error closing session', { sessionId, error: error.message });
      }
    }
  }

  /**
   * Check if a session exists and is active
   */
  hasSession(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}

export const geminiLiveClient = new GeminiLiveClient();
