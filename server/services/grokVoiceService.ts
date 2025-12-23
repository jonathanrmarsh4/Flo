/**
 * Grok Voice Agent Service
 * Real-time voice streaming using xAI's Grok Voice Agent API
 * WebSocket-based, OpenAI Realtime API compatible
 */

import WebSocket from 'ws';
import { logger } from '../logger';

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_REALTIME_URL = 'wss://api.x.ai/v1/realtime';

export interface GrokVoiceConfig {
  systemInstruction: string;
  voiceName?: 'Ara' | 'Eve' | 'Leo' | 'Sal' | 'Rex' | 'Mika' | 'Valentin';
  userId: string;
}

export interface GrokSessionCallbacks {
  onAudioChunk: (audioData: string) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onModelText: (text: string) => void;
  onError: (error: Error) => void;
  onClose: () => void;
  onTurnComplete?: () => void;
}

interface GrokSession {
  ws: WebSocket;
  config: GrokVoiceConfig;
  callbacks: GrokSessionCallbacks;
  createdAt: Date;
  isConnected: boolean;
}

class GrokVoiceService {
  private sessions: Map<string, GrokSession> = new Map();
  
  constructor() {
    logger.info('[GrokVoice] Service initialized', { 
      hasApiKey: !!XAI_API_KEY,
      apiKeyLength: XAI_API_KEY?.length || 0 
    });
  }

  isAvailable(): boolean {
    return !!XAI_API_KEY;
  }

  async createSession(
    sessionId: string,
    config: GrokVoiceConfig,
    callbacks: GrokSessionCallbacks
  ): Promise<void> {
    if (!XAI_API_KEY) {
      throw new Error('XAI_API_KEY not configured');
    }

    logger.info('[GrokVoice] Creating session', { 
      sessionId, 
      userId: config.userId,
      voice: config.voiceName || 'Ara'
    });

    const ws = new WebSocket(XAI_REALTIME_URL, {
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    const session: GrokSession = {
      ws,
      config,
      callbacks,
      createdAt: new Date(),
      isConnected: false,
    };

    this.sessions.set(sessionId, session);

    ws.on('open', () => {
      logger.info('[GrokVoice] WebSocket connected', { sessionId });
      session.isConnected = true;

      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: config.systemInstruction,
          voice: config.voiceName?.toLowerCase() || 'ara',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          tools: [
            { type: 'web_search' },
          ],
        },
      };

      ws.send(JSON.stringify(sessionConfig));
      logger.info('[GrokVoice] Session config sent', { sessionId, voice: config.voiceName });
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(sessionId, message, callbacks);
      } catch (err: any) {
        logger.error('[GrokVoice] Failed to parse message', { sessionId, error: err.message });
      }
    });

    ws.on('error', (error: Error) => {
      logger.error('[GrokVoice] WebSocket error', { sessionId, error: error.message });
      callbacks.onError(error);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      logger.info('[GrokVoice] WebSocket closed', { 
        sessionId, 
        code, 
        reason: reason.toString() 
      });
      session.isConnected = false;
      this.sessions.delete(sessionId);
      callbacks.onClose();
    });
  }

  private handleMessage(
    sessionId: string, 
    message: any, 
    callbacks: GrokSessionCallbacks
  ): void {
    const type = message.type;

    switch (type) {
      case 'session.created':
        logger.info('[GrokVoice] Session created by server', { sessionId });
        break;

      case 'session.updated':
        logger.info('[GrokVoice] Session updated', { sessionId });
        break;

      case 'conversation.created':
        logger.info('[GrokVoice] Conversation created', { sessionId });
        break;

      case 'ping':
        // Respond to ping to keep connection alive
        const pingSession = this.sessions.get(sessionId);
        if (pingSession?.ws) {
          pingSession.ws.send(JSON.stringify({ type: 'pong' }));
        }
        break;

      case 'input_audio_buffer.speech_started':
        logger.debug('[GrokVoice] Speech started', { sessionId });
        break;

      case 'input_audio_buffer.speech_stopped':
        logger.debug('[GrokVoice] Speech stopped', { sessionId });
        break;

      case 'input_audio_buffer.committed':
        logger.debug('[GrokVoice] Audio buffer committed', { sessionId });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        const transcript = message.transcript || '';
        logger.info('[GrokVoice] User transcript', { 
          sessionId, 
          transcriptLength: transcript.length,
          preview: transcript.substring(0, 100)
        });
        callbacks.onTranscript(transcript, true);
        break;

      case 'response.audio.delta':
        const audioDelta = message.delta || '';
        if (audioDelta) {
          callbacks.onAudioChunk(audioDelta);
        }
        break;

      case 'response.audio_transcript.delta':
        const textDelta = message.delta || '';
        if (textDelta) {
          callbacks.onModelText(textDelta);
        }
        break;

      case 'response.audio_transcript.done':
        logger.info('[GrokVoice] Audio transcript done', { sessionId });
        break;

      case 'response.done':
        logger.info('[GrokVoice] Response complete', { sessionId });
        callbacks.onTurnComplete?.();
        break;

      case 'error':
        const errorMsg = message.error?.message || 'Unknown error';
        logger.error('[GrokVoice] Server error', { sessionId, error: errorMsg });
        callbacks.onError(new Error(errorMsg));
        break;

      default:
        logger.debug('[GrokVoice] Unhandled message type', { sessionId, type });
    }
  }

  private audioChunkCount: Map<string, number> = new Map();
  
  sendAudio(sessionId: string, audioData: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isConnected) {
      logger.warn('[GrokVoice] Cannot send audio - session not connected', { sessionId });
      return;
    }

    // Track audio chunks for debugging
    const count = (this.audioChunkCount.get(sessionId) || 0) + 1;
    this.audioChunkCount.set(sessionId, count);
    
    // Log every 50th chunk to avoid spam
    if (count % 50 === 1) {
      logger.debug('[GrokVoice] Sending audio chunk', { 
        sessionId, 
        chunkNumber: count,
        audioDataLength: audioData.length 
      });
    }

    const message = {
      type: 'input_audio_buffer.append',
      audio: audioData,
    };

    session.ws.send(JSON.stringify(message));
  }

  commitAudio(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isConnected) {
      return;
    }

    session.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  }

  sendText(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isConnected) {
      logger.warn('[GrokVoice] Cannot send text - session not connected', { sessionId });
      return;
    }

    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    };

    session.ws.send(JSON.stringify(message));
    session.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  cancelResponse(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isConnected) {
      return;
    }

    session.ws.send(JSON.stringify({ type: 'response.cancel' }));
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    logger.info('[GrokVoice] Ending session', { sessionId });

    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.close(1000, 'Session ended');
    }

    this.sessions.delete(sessionId);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      const age = now - session.createdAt.getTime();
      if (age > maxAgeMs) {
        this.endSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('[GrokVoice] Cleaned stale sessions', { cleaned });
    }
  }
}

export const grokVoiceService = new GrokVoiceService();
