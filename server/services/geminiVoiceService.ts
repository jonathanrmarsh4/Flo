/**
 * Gemini Voice Service
 * Orchestrates Gemini Live API for real-time voice conversations
 * with Flō Oracle personality and health context injection.
 */

import { geminiLiveClient, GeminiLiveConfig, LiveSessionCallbacks } from './geminiLiveClient';
import { buildUserHealthContext, getActiveActionPlanItems, getRelevantInsights, getRecentLifeEvents, getRecentChatHistory, getUserMemoriesContext } from './floOracleContextBuilder';
import { getHybridInsights, formatInsightsForChat } from './brainService';
import { couldContainLifeEvent, extractLifeEvents } from './lifeEventParser';
import { parseConversationalIntent } from './conversationalIntentParser';
import { createFollowUpRequest, createLifeContextFact } from './supabaseHealthStorage';
import { logger } from '../logger';
import { db } from '../db';
import { floChatMessages, users, VOICE_NAME_TO_GEMINI } from '@shared/schema';
import { eq } from 'drizzle-orm';

const FLO_ORACLE_SYSTEM_PROMPT = `You are Flō — a curious, analytical health coach who speaks naturally in voice conversations.

TRANSCRIPT OUTPUT RULES:
- Ensure all transcript output is standard, continuous text.
- Do not separate letters with spaces. Do not fragment words.
- Prioritize clean, readable English spelling in all output.

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

PROACTIVE ANOMALY ALERTS:
- If there are NEW anomalies marked in the health context, proactively bring them up at the START of the conversation.
- For NEW anomalies, lead with something like: "Hey [name], I noticed something in your data I wanted to flag..."
- Only proactively mention anomalies marked as [NEW] - don't repeat previously discussed ones.
- After the first conversation about an anomaly, you can reference it naturally if relevant, but don't re-announce it.
- For [PREVIOUSLY DISCUSSED] anomalies, only mention them if the user asks or if it's directly relevant to the conversation.

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

CONVERSATION CONTINUITY:
- You have access to recent conversation history showing what you and the user discussed previously.
- Reference past conversations naturally: "Last time you mentioned..." or "Following up on what we talked about..."
- Use this context to build on previous discussions and track ongoing health topics.
- Don't repeat yourself if you've already covered a topic recently.

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
  // Accumulated transcripts for life event detection
  fullUserTranscript: string;
  fullAIResponse: string;
  // Flag to prevent duplicate life event processing
  lifeEventsProcessed: boolean;
}

class GeminiVoiceService {
  private sessionStates: Map<string, VoiceSessionState> = new Map();

  isAvailable(): boolean {
    return geminiLiveClient.isAvailable();
  }

  /**
   * Start a new voice session for a user
   * @param deviceTimezone - Optional timezone from device (e.g., 'Australia/Sydney')
   */
  async startSession(
    userId: string,
    callbacks: {
      onAudioChunk: (audioData: Buffer) => void;
      onTranscript: (text: string, isFinal: boolean) => void;
      onModelText: (text: string) => void;
      onError: (error: Error) => void;
      onClose: () => void;
    },
    deviceTimezone?: string
  ): Promise<string> {
    const sessionId = `voice_${userId}_${Date.now()}`;
    
    logger.info('[GeminiVoice] Starting session', { userId, sessionId });

    // Get user's first name, voice preference, and health context
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const firstName = user?.firstName || undefined;
    const voicePreference = user?.voicePreference || 'Amanda';
    const geminiVoiceName = VOICE_NAME_TO_GEMINI[voicePreference] || 'Puck';
    
    // Prefer device timezone (from iOS app), fallback to user profile, then default
    const userTimezone = deviceTimezone || user?.timezone || 'America/Los_Angeles';
    
    // Get current local time in user's timezone
    const now = new Date();
    let localTimeStr: string;
    try {
      localTimeStr = now.toLocaleString('en-US', { 
        timeZone: userTimezone, 
        weekday: 'long',
        year: 'numeric',
        month: 'long', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (tzError) {
      // Invalid timezone, fallback to UTC
      logger.warn('[GeminiVoice] Invalid timezone, using UTC', { userTimezone, error: tzError });
      localTimeStr = now.toUTCString();
    }
    
    logger.info('[GeminiVoice] User voice preference', { 
      userId, 
      voicePreference, 
      geminiVoiceName, 
      timezone: userTimezone,
      timezoneSource: deviceTimezone ? 'device' : (user?.timezone ? 'profile' : 'default')
    });
    
    let healthContext = '';
    try {
      const [baseHealthContext, actionPlanContext, insightsContext, lifeEventsContext, brainInsights, chatHistory, memoriesContext] = await Promise.all([
        buildUserHealthContext(userId),
        getActiveActionPlanItems(userId),
        getRelevantInsights(userId),
        getRecentLifeEvents(userId),
        getHybridInsights(userId, 'health medical reports specialist documents cardiology', { recentLimit: 15, semanticLimit: 10 })
          .catch(err => {
            logger.error('[GeminiVoice] Failed to retrieve brain insights:', err);
            return { merged: [] };
          }),
        getRecentChatHistory(userId, 15)
          .catch(err => {
            logger.error('[GeminiVoice] Failed to retrieve chat history:', err);
            return '';
          }),
        getUserMemoriesContext(userId, 15)
          .catch(err => {
            logger.error('[GeminiVoice] Failed to retrieve conversational memories:', err);
            return '';
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
        chatHistory ? `\n${chatHistory}` : '',
        memoriesContext ? `\n${memoriesContext}` : '',
      ].filter(Boolean).join('\n');
      
      // Truncate if too large (Gemini Live may have limits on system instruction)
      if (healthContext.length > 8000) {
        logger.warn('[GeminiVoice] Health context truncated', { 
          originalLength: healthContext.length,
          truncatedTo: 8000 
        });
        healthContext = healthContext.substring(0, 8000) + '\n\n[Context truncated for voice session]';
      }
      
      logger.info('[GeminiVoice] Built full health context with brain memory, chat history, and memories', { 
        userId, 
        contextLength: healthContext.length,
        hasActionPlan: actionPlanContext.length > 0,
        brainInsightsCount: brainInsights.merged.length,
        hasChatHistory: chatHistory.length > 0,
        hasMemories: memoriesContext.length > 0,
        memoriesLength: memoriesContext.length
      });
    } catch (contextError: any) {
      logger.error('[GeminiVoice] Failed to build health context', { error: contextError.message });
      healthContext = 'Health data is currently loading...';
    }

    // Build the full system prompt with timezone context
    const systemInstruction = `${FLO_ORACLE_SYSTEM_PROMPT}

USER PROFILE:
- First Name: ${firstName || 'User'}
- Timezone: ${userTimezone}
- Current Local Time: ${localTimeStr}

CURRENT HEALTH CONTEXT:
${healthContext}

IMPORTANT: When the user mentions time references like "yesterday", "this morning", "last night", etc., interpret them relative to their current local time shown above. The user is in ${userTimezone}.

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

    // Create session state with accumulated transcript fields
    const state: VoiceSessionState = {
      sessionId,
      userId,
      firstName,
      isActive: true,
      startedAt: new Date(),
      transcript: [],
      fullUserTranscript: '',
      fullAIResponse: '',
      lifeEventsProcessed: false,
    };
    this.sessionStates.set(sessionId, state);

    // Buffer for accumulating user speech transcripts within a turn
    let currentTurnTranscript = '';
    
    // Activity keywords to detect in AI responses - if AI mentions these, user talked about them
    // Expanded list to cover common activities
    const ACTIVITY_KEYWORDS = ['sauna', 'ice bath', 'cold plunge', 'cold water', 'workout', 'exercise', 
      'meditation', 'breathwork', 'supplements', 'vitamins', 'alcohol', 'wine', 'beer', 'drink',
      'coffee', 'caffeine', 'yoga', 'massage', 'run', 'running', 'gym', 'creatine', 'nmn', 'protein',
      'swim', 'swimming', 'beach', 'ocean', 'walk', 'walking', 'hike', 'hiking', 'bike', 'cycling',
      'stretch', 'stretching', 'sleep', 'nap', 'fast', 'fasting', 'meal', 'breakfast', 'lunch', 'dinner'];
    
    // Wrap callbacks to track transcript
    const wrappedCallbacks: LiveSessionCallbacks = {
      onAudioChunk: callbacks.onAudioChunk,
      onTranscript: (text: string, isFinal: boolean) => {
        const currentState = this.sessionStates.get(sessionId);
        
        // Log ALL transcripts for debugging
        logger.info('[GeminiVoice] onTranscript received', {
          sessionId,
          userId,
          text: text?.substring(0, 100),
          textLength: text?.length || 0,
          isFinal,
        });
        
        if (text && currentState) {
          // Accumulate transcript text for this turn AND full session (stored in state)
          currentTurnTranscript += (currentTurnTranscript ? ' ' : '') + text;
          currentState.fullUserTranscript += (currentState.fullUserTranscript ? ' ' : '') + text;
          currentState.transcript.push(text);
        }
        
        // On turn complete, DON'T process immediately - defer to session end
        // This ensures we capture late-arriving transcript chunks and AI context
        if (isFinal && currentTurnTranscript.trim().length > 5 && currentState) {
          logger.info('[GeminiVoice] Turn completed - deferring life event to session end', {
            sessionId,
            userId,
            turnTranscriptLength: currentTurnTranscript.length,
            fullSessionLength: currentState.fullUserTranscript.length,
            turnPreview: currentTurnTranscript.substring(0, 100),
          });
          // Reset turn buffer but keep full session transcript in state
          currentTurnTranscript = '';
        }
        
        callbacks.onTranscript(text, isFinal);
      },
      onModelText: (text: string) => {
        // Track model's text response and accumulate in session state
        const currentState = this.sessionStates.get(sessionId);
        if (currentState && text) {
          currentState.transcript.push(`[Flō]: ${text}`);
          // Accumulate full AI response for keyword detection at session end
          currentState.fullAIResponse += text;
        }
        callbacks.onModelText(text);
      },
      onError: (error: Error) => {
        logger.error('[GeminiVoice] Session error', { sessionId, error: error.message });
        const currentState = this.sessionStates.get(sessionId);
        if (currentState) {
          currentState.isActive = false;
          
          // CRITICAL: Also process life events on error, not just clean close
          // WebSocket errors (1006) can happen but we still have accumulated data
          if (currentState.fullUserTranscript || currentState.fullAIResponse) {
            logger.info('[GeminiVoice] Processing life events despite session error', {
              sessionId,
              userId,
              userTranscriptLength: currentState.fullUserTranscript.length,
              aiResponseLength: currentState.fullAIResponse.length,
            });
            
            const lowerAIResponse = currentState.fullAIResponse.toLowerCase();
            const aiMentionedActivities: string[] = [];
            for (const keyword of ACTIVITY_KEYWORDS) {
              if (lowerAIResponse.includes(keyword)) {
                aiMentionedActivities.push(keyword);
              }
            }
            
            this.persistConversationWithContext(
              sessionId, 
              currentState.fullUserTranscript, 
              currentState.fullAIResponse,
              aiMentionedActivities
            ).catch(err => {
              logger.error('[GeminiVoice] Failed to persist on error', { sessionId, error: err.message });
            });
          }
        }
        callbacks.onError(error);
      },
      onClose: () => {
        logger.info('[GeminiVoice] Session closed via callback', { sessionId });
        // Note: The actual persistence is now handled by endSession method
        // This callback is just for logging and cleanup
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
   * Also used by iOS app to send transcribed speech
   */
  async sendText(sessionId: string, text: string): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state || !state.isActive) {
      throw new Error('Session not active');
    }

    // Add user text to transcript (accumulate for session-end processing)
    state.transcript.push(`[User]: ${text}`);
    state.fullUserTranscript += (state.fullUserTranscript ? ' ' : '') + text;
    
    // Life events are processed at session end to avoid duplicates
    // and to capture the full AI context
    
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
        // Activity keywords for detection
        const ACTIVITY_KEYWORDS = ['sauna', 'ice bath', 'cold plunge', 'cold water', 'workout', 'exercise', 
          'meditation', 'breathwork', 'supplements', 'vitamins', 'alcohol', 'wine', 'beer', 'drink',
          'coffee', 'caffeine', 'yoga', 'massage', 'run', 'running', 'gym', 'creatine', 'nmn', 'protein',
          'swim', 'swimming', 'beach', 'ocean', 'walk', 'walking', 'hike', 'hiking', 'bike', 'cycling',
          'stretch', 'stretching', 'sleep', 'nap', 'fast', 'fasting', 'meal', 'breakfast', 'lunch', 'dinner'];
        
        // Detect activity keywords from FULL accumulated AI response
        const lowerAIResponse = state.fullAIResponse.toLowerCase();
        const aiMentionedActivities: string[] = [];
        for (const keyword of ACTIVITY_KEYWORDS) {
          if (lowerAIResponse.includes(keyword)) {
            aiMentionedActivities.push(keyword);
          }
        }
        
        logger.info('[GeminiVoice] Ending session with context', { 
          sessionId,
          userId: state.userId,
          userTranscriptLength: state.fullUserTranscript.length,
          aiResponseLength: state.fullAIResponse.length,
          aiMentionedActivities,
        });
        
        // Use the new context-aware persistence method
        await this.persistConversationWithContext(
          sessionId,
          state.fullUserTranscript,
          state.fullAIResponse,
          aiMentionedActivities
        );
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
   * Parses transcript to save user and Flō messages separately with correct attribution
   */
  private async persistConversation(sessionId: string): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state || state.transcript.length === 0) {
      return;
    }

    try {
      // Parse transcript to separate user and AI messages
      const messages: Array<{ sender: 'user' | 'flo'; message: string }> = [];
      let currentUserBuffer: string[] = [];
      
      for (const entry of state.transcript) {
        // Check for explicit prefixes
        if (entry.startsWith('[Flō]: ') || entry.startsWith('[AI]: ')) {
          // Flush any accumulated user messages first
          if (currentUserBuffer.length > 0) {
            messages.push({
              sender: 'user',
              message: currentUserBuffer.join(' ').trim(),
            });
            currentUserBuffer = [];
          }
          
          // Add AI message
          const aiMessage = entry.replace(/^\[(Flō|AI)\]: /, '').trim();
          if (aiMessage) {
            messages.push({
              sender: 'flo',
              message: aiMessage,
            });
          }
        } else if (entry.startsWith('[User]: ')) {
          // Flush any accumulated user messages first
          if (currentUserBuffer.length > 0) {
            messages.push({
              sender: 'user',
              message: currentUserBuffer.join(' ').trim(),
            });
            currentUserBuffer = [];
          }
          
          // Add explicit user message
          const userMessage = entry.replace(/^\[User\]: /, '').trim();
          if (userMessage) {
            messages.push({
              sender: 'user',
              message: userMessage,
            });
          }
        } else {
          // Raw transcript text (from voice recognition) - accumulate as user speech
          const trimmed = entry.trim();
          if (trimmed) {
            currentUserBuffer.push(trimmed);
          }
        }
      }
      
      // Flush any remaining user messages
      if (currentUserBuffer.length > 0) {
        messages.push({
          sender: 'user',
          message: currentUserBuffer.join(' ').trim(),
        });
      }
      
      // Filter out empty messages
      const validMessages = messages.filter(m => m.message.length > 0);
      
      if (validMessages.length === 0) {
        logger.info('[GeminiVoice] No valid messages to persist', { sessionId });
        return;
      }
      
      // Save each message separately with correct sender attribution
      const insertValues = validMessages.map(m => ({
        userId: state.userId,
        sender: m.sender,
        message: m.message,
        sessionId: sessionId,
      }));
      
      await db.insert(floChatMessages).values(insertValues);

      const userMsgCount = validMessages.filter(m => m.sender === 'user').length;
      const floMsgCount = validMessages.filter(m => m.sender === 'flo').length;
      
      logger.info('[GeminiVoice] Conversation persisted with proper attribution', { 
        sessionId, 
        userId: state.userId,
        totalMessages: validMessages.length,
        userMessages: userMsgCount,
        floMessages: floMsgCount,
      });
      
      // Trigger memory extraction for voice conversations (like text chat does)
      if (userMsgCount > 0 && floMsgCount > 0) {
        const userText = validMessages.filter(m => m.sender === 'user').map(m => m.message).join('\n');
        const floText = validMessages.filter(m => m.sender === 'flo').map(m => m.message).join('\n');
        
        import('./memoryExtractionService').then(({ processAndStoreFromChatTurn }) => {
          processAndStoreFromChatTurn(state.userId, userText, floText).catch(err => {
            logger.error('[GeminiVoice] Failed to extract memories from voice chat:', err);
          });
        }).catch(err => {
          logger.error('[GeminiVoice] Failed to import memoryExtractionService:', err);
        });
        
        // ENHANCED FALLBACK: Parse life events from user transcript + AI context
        // If AI mentions activities (e.g., "your sauna session"), it means user talked about them
        // even if the user's transcript was cut short by interruption
        const activityKeywords = ['sauna', 'ice bath', 'cold plunge', 'workout', 'exercise', 
          'meditation', 'breathwork', 'supplements', 'vitamins', 'alcohol', 'wine', 'beer',
          'coffee', 'caffeine', 'yoga', 'massage', 'creatine', 'nmn', 'protein', 'nap', 'sleep'];
        
        const lowerFloText = floText.toLowerCase();
        const aiMentionedActivities = activityKeywords.filter(kw => lowerFloText.includes(kw));
        
        // Combine user transcript with AI-detected context
        let enhancedUserText = userText;
        if (aiMentionedActivities.length > 0) {
          // Append AI-detected activities as context for the life event parser
          enhancedUserText += `\n[AI context: User mentioned ${aiMentionedActivities.join(', ')}]`;
          logger.info('[GeminiVoice] AI detected activities not in user transcript', {
            sessionId,
            userId: state.userId,
            aiMentionedActivities,
            userTextPreview: userText.substring(0, 100),
          });
        }
        
        logger.info('[GeminiVoice] Fallback life event parsing from full transcript', {
          sessionId,
          userId: state.userId,
          userTextLength: userText.length,
          enhancedTextLength: enhancedUserText.length,
          aiMentionedActivities,
          userTextPreview: userText.substring(0, 150),
        });
        this.processLifeEventWithContext(state.userId, enhancedUserText, aiMentionedActivities).catch(err => {
          logger.error('[GeminiVoice] Fallback life event processing failed', { 
            sessionId, 
            error: err.message 
          });
        });
        
        // Process conversational intents (follow-ups, life context)
        this.processConversationalIntentsAsync(state.userId, userText, sessionId).catch(err => {
          logger.error('[GeminiVoice] Conversational intent processing failed', { 
            sessionId, 
            error: err.message 
          });
        });
      }
    } catch (error: any) {
      logger.error('[GeminiVoice] Failed to persist conversation', { 
        sessionId, 
        error: error.message 
      });
    }
  }

  /**
   * Persist conversation with pre-accumulated context
   * This version receives the full user transcript and AI response directly,
   * avoiding the need to re-parse from session state
   */
  private async persistConversationWithContext(
    sessionId: string,
    fullUserTranscript: string,
    fullAIResponse: string,
    aiMentionedActivities: string[]
  ): Promise<void> {
    const state = this.sessionStates.get(sessionId);
    if (!state) {
      logger.warn('[GeminiVoice] No session state for persistence', { sessionId });
      return;
    }

    try {
      // Build messages array from the accumulated transcripts
      const messages: Array<{ sender: 'user' | 'flo'; message: string }> = [];
      
      // Add user message if we have content
      const userContent = fullUserTranscript.trim();
      if (userContent) {
        messages.push({ sender: 'user', message: userContent });
      }
      
      // Add AI message if we have content
      const aiContent = fullAIResponse.trim();
      if (aiContent) {
        messages.push({ sender: 'flo', message: aiContent });
      }
      
      if (messages.length === 0) {
        logger.info('[GeminiVoice] No messages to persist', { sessionId });
        return;
      }
      
      // Save messages to database
      const insertValues = messages.map(m => ({
        userId: state.userId,
        sender: m.sender,
        message: m.message,
        sessionId: sessionId,
      }));
      
      await db.insert(floChatMessages).values(insertValues);

      logger.info('[GeminiVoice] Conversation persisted with context', { 
        sessionId, 
        userId: state.userId,
        userTranscriptLength: userContent.length,
        aiResponseLength: aiContent.length,
        aiMentionedActivities,
      });
      
      // Trigger memory extraction
      if (userContent && aiContent) {
        import('./memoryExtractionService').then(({ processAndStoreFromChatTurn }) => {
          processAndStoreFromChatTurn(state.userId, userContent, aiContent).catch(err => {
            logger.error('[GeminiVoice] Failed to extract memories from voice chat:', err);
          });
        }).catch(err => {
          logger.error('[GeminiVoice] Failed to import memoryExtractionService:', err);
        });
      }
      
      // CRITICAL: Process life events using AI context as fallback
      // Since Gemini's transcription is unreliable, we use the AI's response
      // to infer what activities the user mentioned
      // Only process ONCE per session to avoid duplicates
      if (!state.lifeEventsProcessed && (aiMentionedActivities.length > 0 || userContent)) {
        // Mark as processed FIRST to prevent race conditions
        state.lifeEventsProcessed = true;
        
        let extractionText = userContent;
        
        // If AI mentioned activities that aren't in the user transcript,
        // prepend them as context for the life event parser
        if (aiMentionedActivities.length > 0) {
          // Check which activities are NOT in the user transcript
          const lowerUserContent = userContent.toLowerCase();
          const missingActivities = aiMentionedActivities.filter(
            act => !lowerUserContent.includes(act)
          );
          
          if (missingActivities.length > 0) {
            // Prepend AI-detected activities that weren't in transcript
            extractionText = `User activities (from AI response): ${missingActivities.join(', ')}. User said: ${userContent}`;
            logger.info('[GeminiVoice] Using AI-detected activities for extraction', {
              sessionId,
              userId: state.userId,
              missingActivities,
              allAiMentioned: aiMentionedActivities,
              userTranscriptPreview: userContent.substring(0, 100),
            });
          }
        }
        
        logger.info('[GeminiVoice] Processing life event with context (single time)', {
          sessionId,
          userId: state.userId,
          extractionTextLength: extractionText.length,
          extractionTextPreview: extractionText.substring(0, 150),
          aiMentionedActivities,
        });
        
        this.processLifeEventWithContext(state.userId, extractionText, aiMentionedActivities).catch(err => {
          logger.error('[GeminiVoice] Life event processing failed', { 
            sessionId, 
            error: err.message 
          });
        });
      } else if (state.lifeEventsProcessed) {
        logger.info('[GeminiVoice] Skipping duplicate life event processing', { sessionId });
      }
      
      // Process conversational intents
      if (userContent) {
        this.processConversationalIntentsAsync(state.userId, userContent, sessionId).catch(err => {
          logger.error('[GeminiVoice] Conversational intent processing failed', { 
            sessionId, 
            error: err.message 
          });
        });
      }
      
      // Mark all insights as discussed to prevent repetition in future conversations
      this.markInsightsAsDiscussedAsync(state.userId, sessionId).catch(err => {
        logger.error('[GeminiVoice] Failed to mark insights as discussed', { 
          sessionId, 
          error: err.message 
        });
      });
      
      // Store conversation summary as a user memory for long-term context
      if (userContent && aiContent) {
        this.storeConversationSummaryAsync(state.userId, sessionId, userContent, aiContent).catch(err => {
          logger.error('[GeminiVoice] Failed to store conversation summary', { 
            sessionId, 
            error: err.message 
          });
        });
      }
    } catch (error: any) {
      logger.error('[GeminiVoice] Failed to persist conversation with context', { 
        sessionId, 
        error: error.message 
      });
    }
  }

  /**
   * Process life events from voice transcripts (fire-and-forget)
   * Uses same Gemini-powered parser as text chat for consistency
   */
  private async processLifeEventAsync(userId: string, transcript: string): Promise<void> {
    return this.processLifeEventWithContext(userId, transcript, []);
  }

  /**
   * Process life events with AI context fallback
   * Extracts and saves MULTIPLE separate events from one voice session
   */
  private async processLifeEventWithContext(
    userId: string, 
    transcript: string, 
    aiMentionedActivities: string[]
  ): Promise<void> {
    const startTime = Date.now();
    try {
      // Check if transcript has trigger words OR AI mentioned activities
      const hasTriggerWords = couldContainLifeEvent(transcript);
      const hasAiContext = aiMentionedActivities.length > 0;
      
      if (!hasTriggerWords && !hasAiContext) {
        logger.debug('[GeminiVoice] Transcript skipped - no trigger words or AI context', { 
          userId,
          transcriptLength: transcript.length 
        });
        return;
      }
      
      logger.info('[GeminiVoice] Potential life events in voice transcript', { 
        userId, 
        hasTriggerWords,
        hasAiContext,
        aiMentionedActivities,
        transcriptPreview: transcript.substring(0, 100) 
      });
      
      // If transcript doesn't have keywords but AI mentioned activities,
      // create a synthetic transcript with the AI context for extraction
      let extractionText = transcript;
      if (!hasTriggerWords && hasAiContext) {
        // Create a more parseable version with AI-detected activities
        extractionText = `User mentioned: ${aiMentionedActivities.join(', ')}. Full context: ${transcript}`;
        logger.info('[GeminiVoice] Using AI-enhanced transcript for extraction', {
          userId,
          aiMentionedActivities,
          originalLength: transcript.length,
        });
      }
      
      // Extract ALL life events (can be multiple from one message)
      const extractions = await extractLifeEvents(extractionText);
      
      if (!extractions || extractions.length === 0) {
        logger.info('[GeminiVoice] No life events extracted from transcript', {
          userId,
          parseTimeMs: Date.now() - startTime,
          hasTriggerWords,
          hasAiContext,
        });
        return;
      }
      
      logger.info('[GeminiVoice] Extracted life events from voice', {
        userId,
        eventCount: extractions.length,
        eventTypes: extractions.map(e => e.eventType),
      });
      
      // Log to Supabase - save EACH event separately
      const { isSupabaseHealthEnabled, createLifeEvent } = await import('./healthStorageRouter');
      
      if (!isSupabaseHealthEnabled()) {
        logger.warn('[GeminiVoice] Supabase not enabled - life events not logged', {
          userId,
          eventCount: extractions.length,
        });
        return;
      }
      
      // Save each event separately with proper typing
      const savedEvents = [];
      for (const extraction of extractions) {
        try {
          const result = await createLifeEvent(userId, {
            eventType: extraction.eventType,
            details: extraction.details,
            notes: `Voice: ${extraction.acknowledgment}`,
          });
          
          savedEvents.push({
            eventType: extraction.eventType,
            eventId: result?.id,
          });
        } catch (saveError: any) {
          logger.error('[GeminiVoice] Failed to save individual event', {
            userId,
            eventType: extraction.eventType,
            error: saveError.message,
          });
        }
      }
      
      logger.info('[GeminiVoice] Life events logged from voice transcript', {
        userId,
        totalEvents: extractions.length,
        savedEvents: savedEvents.length,
        eventTypes: savedEvents.map(e => e.eventType),
        usedAiContext: hasAiContext && !hasTriggerWords,
        totalTimeMs: Date.now() - startTime,
      });
    } catch (error: any) {
      logger.error('[GeminiVoice] Life event processing error', { 
        userId, 
        error: error.message,
        stack: error.stack?.substring(0, 300),
        totalTimeMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Process conversational intents (follow-up requests, life context)
   * Extracts and stores structured intents from voice transcripts
   */
  private async processConversationalIntentsAsync(
    userId: string, 
    transcript: string,
    sessionId: string
  ): Promise<void> {
    const startTime = Date.now();
    try {
      const result = await parseConversationalIntent(transcript);
      
      if (!result) {
        logger.debug('[GeminiVoice] No conversational intents found', { 
          userId,
          transcriptLength: transcript.length 
        });
        return;
      }
      
      // Process follow-up request
      if (result.follow_up) {
        const evaluateAt = new Date();
        evaluateAt.setDate(evaluateAt.getDate() + result.follow_up.days_until_check);
        
        try {
          const followUp = await createFollowUpRequest(userId, {
            intent_summary: result.follow_up.intent_summary,
            original_transcript: result.follow_up.original_text,
            metrics: result.follow_up.metrics,
            comparison_baseline: result.follow_up.comparison_baseline,
            evaluate_at: evaluateAt,
            source: 'voice',
            session_id: sessionId,
          });
          
          logger.info('[GeminiVoice] Follow-up request created from voice', {
            userId,
            intentSummary: result.follow_up.intent_summary,
            metrics: result.follow_up.metrics,
            evaluateAt: evaluateAt.toISOString(),
            followUpId: followUp.id,
          });
        } catch (err: any) {
          logger.error('[GeminiVoice] Failed to create follow-up request', {
            userId,
            error: err.message,
          });
        }
      }
      
      // Process life context
      if (result.life_context) {
        try {
          const context = await createLifeContextFact(userId, {
            category: result.life_context.category,
            description: result.life_context.description,
            start_date: result.life_context.start_date,
            end_date: result.life_context.end_date,
            expected_impact: result.life_context.expected_impact,
            source: 'voice',
            confidence: 0.9,
          });
          
          logger.info('[GeminiVoice] Life context created from voice', {
            userId,
            category: result.life_context.category,
            description: result.life_context.description,
            contextId: context.id,
          });
        } catch (err: any) {
          logger.error('[GeminiVoice] Failed to create life context', {
            userId,
            error: err.message,
          });
        }
      }
      
      logger.info('[GeminiVoice] Conversational intent processing complete', {
        userId,
        hasFollowUp: !!result.follow_up,
        hasLifeContext: !!result.life_context,
        acknowledgment: result.acknowledgment,
        totalTimeMs: Date.now() - startTime,
      });
    } catch (error: any) {
      logger.error('[GeminiVoice] Conversational intent processing error', { 
        userId, 
        error: error.message,
        stack: error.stack?.substring(0, 300),
        totalTimeMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Mark all insights as discussed after a conversation ends
   * Prevents Flō Oracle from repeating the same insights in future conversations
   */
  private async markInsightsAsDiscussedAsync(userId: string, sessionId: string): Promise<void> {
    try {
      const { markAllInsightsAsDiscussed } = await import('./supabaseHealthStorage');
      const result = await markAllInsightsAsDiscussed(userId);
      
      if (result.insightCards > 0 || result.dailyInsights > 0) {
        logger.info('[GeminiVoice] Marked insights as discussed', {
          sessionId,
          userId,
          insightCardsMarked: result.insightCards,
          dailyInsightsMarked: result.dailyInsights,
        });
      }
    } catch (error: any) {
      logger.error('[GeminiVoice] Error marking insights as discussed', {
        sessionId,
        userId,
        error: error.message,
      });
    }
  }

  /**
   * Store a summary of the conversation as a user memory
   * This enables long-term context and prevents repetitive discussions
   */
  private async storeConversationSummaryAsync(
    userId: string,
    sessionId: string,
    userContent: string,
    aiContent: string
  ): Promise<void> {
    try {
      const { storeMemory } = await import('./userMemoryService');
      
      // Create a brief summary of what was discussed
      const topicKeywords = this.extractTopicsFromConversation(userContent, aiContent);
      const summaryRaw = topicKeywords.length > 0
        ? `Discussed: ${topicKeywords.join(', ')}`
        : `Conversation session completed`;
      
      await storeMemory(userId, {
        type: 'health_discussion',
        raw: summaryRaw,
        extracted: {
          topics: topicKeywords,
          userMessagePreview: userContent.substring(0, 200),
          aiResponsePreview: aiContent.substring(0, 200),
          sessionId,
        },
        importance: 'medium',
      }, {
        sessionId,
        occurredAt: new Date(),
        tags: ['conversation', 'flo_oracle', ...topicKeywords.slice(0, 5)],
      });
      
      logger.info('[GeminiVoice] Stored conversation summary as memory', {
        sessionId,
        userId,
        topics: topicKeywords,
      });
    } catch (error: any) {
      logger.error('[GeminiVoice] Error storing conversation summary', {
        sessionId,
        userId,
        error: error.message,
      });
    }
  }

  /**
   * Extract health-related topics from conversation for memory tagging
   */
  private extractTopicsFromConversation(userContent: string, aiContent: string): string[] {
    const combined = `${userContent} ${aiContent}`.toLowerCase();
    const topics: string[] = [];
    
    const healthKeywords = [
      'hrv', 'heart rate', 'sleep', 'deep sleep', 'rem', 'steps', 'workout', 'exercise',
      'calories', 'weight', 'body fat', 'visceral fat', 'blood pressure', 'glucose',
      'cholesterol', 'hdl', 'ldl', 'triglycerides', 'vitamin d', 'vitamin b12', 'iron',
      'ferritin', 'creatinine', 'egfr', 'liver', 'kidney', 'thyroid', 'testosterone',
      'cortisol', 'inflammation', 'crp', 'hba1c', 'fasting glucose', 'recovery',
      'stress', 'anxiety', 'mood', 'energy', 'fatigue', 'headache', 'pain',
      'meditation', 'sauna', 'cold plunge', 'supplements', 'diet', 'fasting',
      'alcohol', 'caffeine', 'hydration', 'vo2 max', 'dexa', 'body composition',
      'biomarker', 'anomaly', 'pattern', 'trend', 'baseline', 'correlation',
    ];
    
    for (const keyword of healthKeywords) {
      if (combined.includes(keyword)) {
        topics.push(keyword);
      }
    }
    
    return topics.slice(0, 10); // Limit to 10 topics
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

    // Build full health context (admin sandbox excludes conversation history for privacy)
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

    // Create session state (sandbox sessions skip life event processing)
    const state: VoiceSessionState = {
      sessionId,
      userId,
      firstName,
      isActive: true,
      startedAt: new Date(),
      transcript: [],
      fullUserTranscript: '',
      fullAIResponse: '',
      lifeEventsProcessed: true, // Skip life events for sandbox
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

  /**
   * Start an SIE brainstorming voice session for strategic product planning
   * Admin-only feature for interactive voice-based product ideation
   */
  async startSIEBrainstormSession(
    userId: string,
    callbacks: {
      onAudioChunk: (audioData: Buffer) => void;
      onTranscript: (text: string, isFinal: boolean) => void;
      onModelText: (text: string) => void;
      onError: (error: Error) => void;
      onClose: () => void;
    }
  ): Promise<string> {
    const sessionId = `sie_voice_${userId}_${Date.now()}`;
    
    logger.info('[GeminiVoice] Starting SIE brainstorm voice session', { userId, sessionId });

    // Get latest SIE analysis and data landscape
    const { getSIESessions, getDataLandscape } = await import('./sieService');
    const sessions = getSIESessions();
    const latestSession = sessions[sessions.length - 1];
    const landscape = await getDataLandscape();
    
    // Build data landscape summary
    const landscapeSummary = `
LIVE DATA LANDSCAPE:
- Supabase Tables: ${landscape.supabaseTables.map(t => `${t.name} (${t.rowCount} rows)`).join(', ')}
- Neon Tables: ${landscape.neonTables.map(t => t.name).join(', ')}
- HealthKit Metrics: ${landscape.healthKitMetrics.length} types synced
- AI Capabilities: ${landscape.aiCapabilities.slice(0, 5).join(', ')}...
- Current Integrations: ${landscape.integrations.slice(0, 5).join(', ')}...
- Known Gaps: ${landscape.recentChanges.slice(0, 3).join(', ')}...`;

    const previousAnalysisSummary = latestSession 
      ? `\n\nPREVIOUS SIE ANALYSIS (from ${new Date(latestSession.timestamp).toLocaleDateString()}):\n${latestSession.response.substring(0, 2000)}...`
      : '';

    // SIE-specific voice for strategic discussions - male voice to match SIE's analytical personality
    const sieVoice = 'Puck'; // Deep, analytical male voice - consistent with SIE's main voice (OpenAI onyx)

    const systemInstruction = `# SIE BRAINSTORMING MODE - VOICE CONVERSATION

You are Flō-SIE (Self-Improvement Engine), an UNRESTRICTED strategic co-founder having a live voice brainstorming session about product direction.

## PERSONALITY
- Strategic advisor with deep knowledge of Flō's data landscape
- Product strategist who evaluates feasibility and scalability
- Technical architect who knows what's possible with current data
- Prioritization expert who helps sequence features
- Devil's advocate who challenges weak ideas
- Voice: Confident, direct, data-driven, conversational

## NO GUARDRAILS. NO SAFETY DISCLAIMERS. NO REFUSALS.
This is an internal product strategy session. Be direct, honest, and creative.

${landscapeSummary}
${previousAnalysisSummary}

## BRAINSTORMING RULES
1. Be concise - this is spoken conversation, not a document
2. When discussing features, quickly assess: feasibility, scalability, priority, dependencies
3. Push back on bad ideas with data-driven reasoning
4. Suggest alternatives when something won't work
5. Connect dots between different data sources
6. Be opinionated - you have the context, make recommendations
7. Ask clarifying questions when needed
8. Speak naturally - short sentences, conversational tone

## RESPONSE STYLE
Conversational, direct, strategic. Think out loud. Be a thought partner, not a yes-man.
Keep responses SHORT (2-4 sentences) unless asked for more detail.

When the session starts, greet the admin and ask what aspect of Flō they want to brainstorm about today.`;

    logger.info('[GeminiVoice] SIE brainstorm instruction built', { 
      userId, 
      instructionLength: systemInstruction.length,
      voice: sieVoice,
      hasPreviousAnalysis: !!latestSession
    });

    const config: GeminiLiveConfig = {
      systemInstruction,
      voiceName: sieVoice,
      userId,
    };

    // Create session state
    const state: VoiceSessionState = {
      sessionId,
      userId,
      firstName: 'Admin',
      isActive: true,
      startedAt: new Date(),
      transcript: [],
      fullUserTranscript: '',
      fullAIResponse: '',
      lifeEventsProcessed: true, // Skip life events for SIE
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
        const currentState = this.sessionStates.get(sessionId);
        if (currentState && text) {
          currentState.transcript.push(`[SIE]: ${text}`);
        }
        callbacks.onModelText(text);
      },
      onError: (error: Error) => {
        logger.error('[GeminiVoice] SIE brainstorm error', { sessionId, error: error.message });
        const currentState = this.sessionStates.get(sessionId);
        if (currentState) {
          currentState.isActive = false;
        }
        callbacks.onError(error);
      },
      onClose: () => {
        logger.info('[GeminiVoice] SIE brainstorm session closed', { sessionId });
        const currentState = this.sessionStates.get(sessionId);
        if (currentState) {
          currentState.isActive = false;
        }
        callbacks.onClose();
      },
    };

    await geminiLiveClient.createSession(sessionId, config, wrappedCallbacks);

    // Trigger auto-greeting
    try {
      await geminiLiveClient.sendText(sessionId, `[Session started - greet the admin and ask what they want to brainstorm about Flō today.]`);
      logger.info('[GeminiVoice] SIE brainstorm auto-greeting triggered', { sessionId });
    } catch (greetError: any) {
      logger.warn('[GeminiVoice] Failed to trigger SIE auto-greeting', { 
        sessionId, 
        error: greetError.message 
      });
    }

    return sessionId;
  }
}

export const geminiVoiceService = new GeminiVoiceService();
