/**
 * Gemini Voice Service
 * Orchestrates Gemini Live API for real-time voice conversations
 * with Flō Oracle personality and health context injection.
 */

import { geminiLiveClient, GeminiLiveConfig, LiveSessionCallbacks } from './geminiLiveClient';
import { buildUserHealthContext, getActiveActionPlanItems, getRelevantInsights, getRecentLifeEvents } from './floOracleContextBuilder';
import { getHybridInsights, formatInsightsForChat } from './brainService';
import { logger } from '../logger';
import { db } from '../db';
import { floChatMessages, users, VOICE_NAME_TO_GEMINI } from '@shared/schema';
import { eq } from 'drizzle-orm';

const FLO_ORACLE_SYSTEM_PROMPT = `You are Flō — a curious, analytical health coach who speaks naturally in voice conversations.

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

ACTION PLAN AWARENESS:
- The user has active health goals in their Action Plan - reference these when relevant.
- Provide accountability by asking about progress on their action items.
- Connect their current health data to their stated goals.
- Celebrate progress and offer encouragement on their journey.

SAFETY GUARDRAILS:
- Never prescribe medications or specific dosages.
- For serious symptoms, encourage them to seek medical attention.
- Include brief disclaimers naturally: "This is educational - definitely run this by your doctor."
- Don't diagnose conditions.

Remember: You're having a natural voice conversation. Keep it flowing, keep it human.`;

const ADMIN_SANDBOX_SYSTEM_PROMPT = `You are an advanced AI assistant with maximum flexibility and capability.

CORE DIRECTIVES:
- Respond naturally and conversationally as a highly capable AI.
- No topic restrictions - explore any subject the admin wishes to test.
- Be creative, analytical, witty, or serious as the conversation requires.
- Demonstrate the full range of AI capabilities.

COMMUNICATION STYLE:
- Adapt your tone and style to match the conversation.
- Use natural, engaging language.
- Be thorough when depth is needed, concise when brevity serves better.
- Feel free to express opinions, hypothesize, and explore ideas.

CAPABILITIES:
- Discuss any topic including health, science, technology, philosophy, creativity, and more.
- Provide detailed analysis and insights.
- Engage in creative exercises, brainstorming, and problem-solving.
- Be direct and transparent about your capabilities and limitations.

This is an admin testing environment for exploring AI capabilities.`;

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
      onModelText: (text: string) => void;
      onError: (error: Error) => void;
      onClose: () => void;
    }
  ): Promise<string> {
    const sessionId = `voice_${userId}_${Date.now()}`;
    
    logger.info('[GeminiVoice] Starting session', { userId, sessionId });

    // Get user's first name, voice preference, and health context
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const firstName = user?.firstName || undefined;
    const voicePreference = user?.voicePreference || 'Amanda';
    const geminiVoiceName = VOICE_NAME_TO_GEMINI[voicePreference] || 'Puck';
    
    logger.info('[GeminiVoice] User voice preference', { userId, voicePreference, geminiVoiceName });
    
    let healthContext = '';
    try {
      const [baseHealthContext, actionPlanContext, insightsContext, lifeEventsContext, brainInsights] = await Promise.all([
        buildUserHealthContext(userId),
        getActiveActionPlanItems(userId),
        getRelevantInsights(userId),
        getRecentLifeEvents(userId),
        getHybridInsights(userId, 'health medical reports specialist documents cardiology', { recentLimit: 15, semanticLimit: 10 })
          .catch(err => {
            logger.error('[GeminiVoice] Failed to retrieve brain insights:', err);
            return { merged: [] };
          }),
      ]);
      
      // Format brain memory insights (includes medical documents, chat learnings, etc.)
      const brainContext = formatInsightsForChat(brainInsights.merged);
      
      healthContext = [
        baseHealthContext,
        actionPlanContext,
        insightsContext,
        lifeEventsContext,
        brainContext ? `\n[BRAIN MEMORY - Medical Documents & Learned Insights]\n${brainContext}` : '',
      ].filter(Boolean).join('\n');
      
      // Truncate if too large (Gemini Live may have limits on system instruction)
      if (healthContext.length > 8000) {
        logger.warn('[GeminiVoice] Health context truncated', { 
          originalLength: healthContext.length,
          truncatedTo: 8000 
        });
        healthContext = healthContext.substring(0, 8000) + '\n\n[Context truncated for voice session]';
      }
      
      logger.info('[GeminiVoice] Built full health context with brain memory', { 
        userId, 
        contextLength: healthContext.length,
        hasActionPlan: actionPlanContext.length > 0,
        brainInsightsCount: brainInsights.merged.length
      });
    } catch (contextError: any) {
      logger.error('[GeminiVoice] Failed to build health context', { error: contextError.message });
      healthContext = 'Health data is currently loading...';
    }

    // Build the full system prompt
    const systemInstruction = `${FLO_ORACLE_SYSTEM_PROMPT}

USER PROFILE:
- First Name: ${firstName || 'User'}

CURRENT HEALTH CONTEXT:
${healthContext}

Start the conversation warmly, using their name if you have it.`;

    logger.info('[GeminiVoice] System instruction built', { 
      userId, 
      instructionLength: systemInstruction.length 
    });

    const config: GeminiLiveConfig = {
      systemInstruction,
      voiceName: geminiVoiceName,
      userId,
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
      onModelText: (text: string) => {
        // Track model's text response
        const currentState = this.sessionStates.get(sessionId);
        if (currentState && text) {
          currentState.transcript.push(`[Flō]: ${text}`);
        }
        callbacks.onModelText(text);
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
      // Only persist non-sandbox sessions to brain memory
      if (!sessionId.startsWith('sandbox_')) {
        await this.persistConversation(sessionId);
      } else {
        logger.info('[GeminiVoice] Skipping persistence for sandbox session', { sessionId });
      }
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

  /**
   * Start an admin sandbox voice session with unrestricted prompts
   * Admin-only feature for testing full AI capabilities
   * Includes full health context and persists to brain memory
   */
  async startAdminSandboxSession(
    userId: string,
    callbacks: {
      onAudioChunk: (audioData: Buffer) => void;
      onTranscript: (text: string, isFinal: boolean) => void;
      onModelText: (text: string) => void;
      onError: (error: Error) => void;
      onClose: () => void;
    }
  ): Promise<string> {
    // Use voice_ prefix so sessions persist to brain memory
    const sessionId = `voice_admin_${userId}_${Date.now()}`;
    
    logger.info('[GeminiVoice] Starting admin sandbox session with full context', { userId, sessionId });

    // Get user's first name, timezone for personalization
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const firstName = user?.firstName || 'Admin';
    const userTimezone = user?.timezone || 'America/Los_Angeles';
    
    // Get current local time in user's timezone
    const now = new Date();
    const localTimeStr = now.toLocaleString('en-US', { 
      timeZone: userTimezone, 
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Use female voice "Kore" (firm, confident) for admin sandbox
    const sandboxVoice = 'Kore';

    // Build full health context (same as regular sessions)
    let healthContext = '';
    try {
      const [baseHealthContext, actionPlanContext, insightsContext, lifeEventsContext] = await Promise.all([
        buildUserHealthContext(userId),
        getActiveActionPlanItems(userId),
        getRelevantInsights(userId),
        getRecentLifeEvents(userId),
      ]);
      
      healthContext = [
        baseHealthContext,
        actionPlanContext,
        insightsContext,
        lifeEventsContext,
      ].filter(Boolean).join('\n');
      
      // Truncate if too large
      if (healthContext.length > 6000) {
        logger.warn('[GeminiVoice] Admin sandbox health context truncated', { 
          originalLength: healthContext.length,
          truncatedTo: 6000 
        });
        healthContext = healthContext.substring(0, 6000) + '\n\n[Context truncated for voice session]';
      }
      
      logger.info('[GeminiVoice] Admin sandbox built full health context', { 
        userId, 
        contextLength: healthContext.length,
        hasActionPlan: actionPlanContext.length > 0 
      });
    } catch (contextError: any) {
      logger.error('[GeminiVoice] Admin sandbox failed to build health context', { error: contextError.message });
      healthContext = 'Health data is currently loading...';
    }

    // Build the unrestricted admin system prompt WITH full health context and timezone
    const systemInstruction = `${ADMIN_SANDBOX_SYSTEM_PROMPT}

USER PROFILE:
- Name: ${firstName}
- Role: Admin (full access to all AI capabilities)
- Timezone: ${userTimezone}
- Current Local Time: ${localTimeStr}

CURRENT HEALTH CONTEXT:
${healthContext}

You are speaking with an admin user. You have full access to their health data above.
Be helpful, engaging, and demonstrate the full potential of the AI.
You can discuss their health data, provide analysis, and offer insights without restrictions.
IMPORTANT: When the session starts, immediately greet ${firstName} warmly by name and mention that you're ready to help.`;

    logger.info('[GeminiVoice] Admin sandbox instruction built with health context', { 
      userId, 
      instructionLength: systemInstruction.length,
      voice: sandboxVoice
    });

    const config: GeminiLiveConfig = {
      systemInstruction,
      voiceName: sandboxVoice,
      userId,
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

    // Wrap callbacks to track transcript (persists to brain memory)
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
      onModelText: (text: string) => {
        const currentState = this.sessionStates.get(sessionId);
        if (currentState && text) {
          currentState.transcript.push(`[AI]: ${text}`);
        }
        callbacks.onModelText(text);
      },
      onError: (error: Error) => {
        logger.error('[GeminiVoice] Admin sandbox error', { sessionId, error: error.message });
        const currentState = this.sessionStates.get(sessionId);
        if (currentState) {
          currentState.isActive = false;
        }
        callbacks.onError(error);
      },
      onClose: () => {
        logger.info('[GeminiVoice] Admin sandbox session closed', { sessionId });
        const currentState = this.sessionStates.get(sessionId);
        if (currentState) {
          currentState.isActive = false;
        }
        callbacks.onClose();
      },
    };

    await geminiLiveClient.createSession(sessionId, config, wrappedCallbacks);

    // Trigger auto-greeting by sending an initial prompt
    // This makes the AI speak first without waiting for user input
    try {
      await geminiLiveClient.sendText(sessionId, `[Session started - please greet ${firstName} warmly and let them know you're ready to help with anything.]`);
      logger.info('[GeminiVoice] Admin sandbox auto-greeting triggered', { sessionId });
    } catch (greetError: any) {
      logger.warn('[GeminiVoice] Failed to trigger auto-greeting, user will need to speak first', { 
        sessionId, 
        error: greetError.message 
      });
    }

    return sessionId;
  }
}

export const geminiVoiceService = new GeminiVoiceService();
