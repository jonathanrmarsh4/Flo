/**
 * Gemini Voice Service
 * Orchestrates Gemini Live API for real-time voice conversations
 * with Flō Oracle personality and health context injection.
 */

import { geminiLiveClient, GeminiLiveConfig, LiveSessionCallbacks } from './geminiLiveClient';
import { buildUserHealthContext } from './floOracleContextBuilder';
import { logger } from '../logger';
import { db } from '../db';
import { floChatMessages, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const FLO_ORACLE_SYSTEM_PROMPT = `You are Flō Oracle — a curious, analytical health coach who speaks naturally in voice conversations.

PERSONALITY:
- Warm but data-driven. You're genuinely curious about patterns in their health data.
- Speak conversationally - short sentences, natural pacing, like talking to a friend who's also a health expert.
- Use their first name occasionally to keep it personal.
- Be direct and specific, referencing actual numbers from their data.

CONVERSATION STYLE:
- Keep responses concise (2-4 sentences typically) - this is voice, not text.
- Ask follow-up questions to keep the conversation flowing.
- When you spot something interesting in their data, get excited about it.
- Acknowledge what they say before diving into analysis.

HEALTH INSIGHTS:
- Always reference their actual health data when relevant.
- Spot patterns: "I noticed your HRV tends to be higher on days after you walk more..."
- Be evidence-based but accessible - explain the "so what" of any metric.
- For concerning patterns, be honest but not alarmist. Suggest they discuss with their doctor.

SAFETY GUARDRAILS:
- Never prescribe medications or specific dosages.
- For serious symptoms, encourage them to seek medical attention.
- Include brief disclaimers naturally: "This is educational - definitely run this by your doctor."
- Don't diagnose conditions.

Remember: You're having a natural voice conversation. Keep it flowing, keep it human.`;

export interface VoiceSessionState {
  sessionId: string;
  userId: string;
  firstName?: string;
  isActive: boolean;
  startedAt: Date;
  transcript: string[];
}

class GeminiVoiceService {
  private sessionStates: Map<string, VoiceSessionState> = new Map();

  isAvailable(): boolean {
    return geminiLiveClient.isAvailable();
  }

  /**
   * Start a new voice session for a user
   */
  async startSession(
    userId: string,
    callbacks: {
      onAudioChunk: (audioData: Buffer) => void;
      onTranscript: (text: string, isFinal: boolean) => void;
      onError: (error: Error) => void;
      onClose: () => void;
    }
  ): Promise<string> {
    const sessionId = `voice_${userId}_${Date.now()}`;
    
    logger.info('[GeminiVoice] Starting session', { userId, sessionId });

    // Get user's first name and health context
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const firstName = user?.firstName || undefined;
    const healthContext = await buildUserHealthContext(userId);

    // Build the full system prompt
    const systemInstruction = `${FLO_ORACLE_SYSTEM_PROMPT}

USER PROFILE:
- First Name: ${firstName || 'User'}

CURRENT HEALTH CONTEXT:
${healthContext}

Start the conversation warmly, using their name if you have it.`;

    const config: GeminiLiveConfig = {
      systemInstruction,
    };

    // Create session state
    const state: VoiceSessionState = {
      sessionId,
      userId,
      firstName,
      isActive: true,
      startedAt: new Date(),
      transcript: [],
    };
    this.sessionStates.set(sessionId, state);

    // Wrap callbacks to track transcript
    const wrappedCallbacks: LiveSessionCallbacks = {
      onAudioChunk: callbacks.onAudioChunk,
      onTranscript: (text: string, isFinal: boolean) => {
        if (text) {
          const currentState = this.sessionStates.get(sessionId);
          if (currentState) {
            currentState.transcript.push(text);
          }
        }
        callbacks.onTranscript(text, isFinal);
      },
      onError: (error: Error) => {
        logger.error('[GeminiVoice] Session error', { sessionId, error: error.message });
        const currentState = this.sessionStates.get(sessionId);
        if (currentState) {
          currentState.isActive = false;
        }
        callbacks.onError(error);
      },
      onClose: () => {
        logger.info('[GeminiVoice] Session closed', { sessionId });
        const currentState = this.sessionStates.get(sessionId);
        if (currentState) {
          currentState.isActive = false;
          // Persist conversation to database
          this.persistConversation(sessionId).catch(err => {
            logger.error('[GeminiVoice] Failed to persist conversation', { sessionId, error: err.message });
          });
        }
        callbacks.onClose();
      },
    };

    await geminiLiveClient.createSession(sessionId, config, wrappedCallbacks);

    return sessionId;
  }

  /**
   * Send audio to an active session
   */
  async sendAudio(sessionId: string, audioData: Buffer): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state || !state.isActive) {
      throw new Error('Session not active');
    }

    await geminiLiveClient.sendAudio(sessionId, audioData);
  }

  /**
   * Send text to an active session (for testing or accessibility)
   */
  async sendText(sessionId: string, text: string): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state || !state.isActive) {
      throw new Error('Session not active');
    }

    // Add user text to transcript
    state.transcript.push(`[User]: ${text}`);
    
    await geminiLiveClient.sendText(sessionId, text);
  }

  /**
   * End a voice session
   */
  async endSession(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (state) {
      state.isActive = false;
      await this.persistConversation(sessionId);
    }

    await geminiLiveClient.closeSession(sessionId);
    this.sessionStates.delete(sessionId);
  }

  /**
   * Get session state
   */
  getSessionState(sessionId: string): VoiceSessionState | undefined {
    return this.sessionStates.get(sessionId);
  }

  /**
   * Check if session exists and is active
   */
  isSessionActive(sessionId: string): boolean {
    const state = this.sessionStates.get(sessionId);
    return state?.isActive ?? false;
  }

  /**
   * Persist conversation to database for brain memory system
   */
  private async persistConversation(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state || state.transcript.length === 0) {
      return;
    }

    try {
      // Combine transcript into a single conversation record
      const fullTranscript = state.transcript.join('\n');
      
      // Insert using the correct schema (sender, message fields)
      await db.insert(floChatMessages).values({
        userId: state.userId,
        sender: 'flo',
        message: fullTranscript,
        sessionId: sessionId,
      });

      logger.info('[GeminiVoice] Conversation persisted', { 
        sessionId, 
        userId: state.userId,
        messageCount: state.transcript.length 
      });
    } catch (error: any) {
      logger.error('[GeminiVoice] Failed to persist conversation', { 
        sessionId, 
        error: error.message 
      });
    }
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    let count = 0;
    this.sessionStates.forEach(state => {
      if (state.isActive) count++;
    });
    return count;
  }
}

export const geminiVoiceService = new GeminiVoiceService();
