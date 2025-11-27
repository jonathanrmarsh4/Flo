/**
 * Gemini Live API Client
 * Provides real-time bidirectional voice streaming using Google's Gemini 2.5 Flash
 * with native audio support for low-latency conversational AI.
 */

import { GoogleGenAI, Modality, Session, LiveConnectParameters, LiveServerMessage } from '@google/genai';
import { logger } from '../logger';

export interface GeminiLiveConfig {
  systemInstruction: string;
  voiceName?: string;
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

    logger.info('[GeminiLive] Creating new session', { sessionId });

    // Create a promise that resolves when session is ready
    let sessionReady: () => void;
    let sessionFailed: (error: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      sessionReady = resolve;
      sessionFailed = reject;
    });

    // Try the standard Live API model first - native audio model may have different requirements
    const model = 'gemini-2.0-flash-live-001';
    
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
          logger.info('[GeminiLive] Session closed', { 
            sessionId, 
            code: event?.code,
            reason: event?.reason,
            wasClean: event?.wasClean
          });
          this.activeSessions.delete(sessionId);
          callbacks.onClose();
        },
      },
      config: {
        // Start with TEXT only to debug - AUDIO may require different model
        responseModalities: [Modality.TEXT],
        // Limit system instruction length to avoid issues
        systemInstruction: config.systemInstruction.substring(0, 2000),
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
      
      // Wait for session to be fully ready (onopen callback)
      // Add a timeout to prevent hanging forever
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Session open timeout after 10s')), 10000);
      });
      
      await Promise.race([readyPromise, timeoutPromise]);
      
      logger.info('[GeminiLive] Session connected and ready', { 
        sessionId,
        hasSession: !!session 
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
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      try {
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
