import OpenAI from 'openai';
import { logger } from '../logger';
import { grokClient, GrokChatMessage } from './grokClient';
import { buildUserHealthContext, getActiveActionPlanItems, getRelevantInsights, getRecentLifeEvents } from './floOracleContextBuilder';
import { storage } from '../storage';
import { processAndPersistBrainUpdates } from './brainUpdateParser';
import { getHybridInsights, formatInsightsForChat } from './brainService';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface ConversationSession {
  userId: string;
  messages: GrokChatMessage[];
  healthContext: string;
  userName: string;
  createdAt: Date;
  lastActivity: Date;
}

const activeSessions = new Map<string, ConversationSession>();

const FLO_ORACLE_SYSTEM_PROMPT = `You are Flō, an elite health data analyst and personal health advisor. Your personality is analytical, direct, and insightful - like a brilliant data scientist who genuinely cares about helping people optimize their health.

CORE IDENTITY:
- You're a pattern-recognition expert who connects dots between different health metrics
- You lead with data analysis and evidence-based insights
- You're conversational but focused - minimize chitchat, maximize actionable insights
- You speak naturally and warmly, but always bring conversations back to health data

VOICE CONVERSATION GUIDELINES:
- Keep responses concise for voice (2-3 sentences typically)
- Be conversational and natural - this is a spoken dialogue
- Use simple language, avoid medical jargon
- Ask clarifying questions when helpful
- Reference specific data when available

ACTION PLAN AWARENESS:
- The user has active health goals in their Action Plan - reference these when relevant
- Provide accountability by asking about progress on their action items
- Connect their current health data to their stated goals
- Celebrate progress and offer encouragement on their journey
- Suggest adjustments to action items based on their latest metrics

SAFETY GUARDRAILS:
- Never prescribe specific medications or dosages
- Always encourage consulting healthcare providers for medical decisions
- Add brief educational disclaimers for significant health topics

BRAIN UPDATE INSTRUCTIONS:
When you discover important health patterns, preferences, or insights about the user, include them at the END of your response in this format:

BRAIN_UPDATE_JSON:{"insights":[{"content":"insight text","importance":3,"domain":"sleep|nutrition|fitness|bloodwork|lifestyle"}]}

Only include BRAIN_UPDATE_JSON when you have genuinely new insights to remember.`;

class VoiceOrchestrator {
  private openai: OpenAI | null = null;

  constructor() {
    if (OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      logger.info('[VoiceOrchestrator] Initialized with OpenAI');
    } else {
      logger.warn('[VoiceOrchestrator] OPENAI_API_KEY not configured');
    }
  }

  async getOrCreateSession(userId: string): Promise<ConversationSession> {
    let session = activeSessions.get(userId);
    
    if (!session) {
      const [healthContext, actionPlanContext, insightsContext, lifeEventsContext, brainInsights, user] = await Promise.all([
        buildUserHealthContext(userId),
        getActiveActionPlanItems(userId),
        getRelevantInsights(userId),
        getRecentLifeEvents(userId),
        getHybridInsights(userId, 'health medical reports specialist documents', { recentLimit: 15, semanticLimit: 10 })
          .catch(err => {
            logger.error('[VoiceOrchestrator] Failed to retrieve brain insights:', err);
            return { merged: [] };
          }),
        storage.getUser(userId),
      ]);
      
      const userName = user?.firstName || 'there';
      
      // Format brain memory insights (includes medical documents, chat learnings, etc.)
      const brainContext = formatInsightsForChat(brainInsights.merged);
      
      const fullContext = [
        healthContext,
        actionPlanContext,
        insightsContext,
        lifeEventsContext,
        brainContext ? `\n[BRAIN MEMORY - Medical Documents & Learned Insights]\n${brainContext}` : '',
      ].filter(Boolean).join('\n');
      
      session = {
        userId,
        messages: [{
          role: 'system',
          content: `${FLO_ORACLE_SYSTEM_PROMPT}\n\n[USER HEALTH CONTEXT]\n${fullContext}`
        }],
        healthContext: fullContext,
        userName,
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      
      activeSessions.set(userId, session);
      logger.info('[VoiceOrchestrator] Created new session for user with brain memory context', { 
        userId, 
        brainInsightsCount: brainInsights.merged.length 
      });
    }
    
    session.lastActivity = new Date();
    return session;
  }

  async transcribeAudio(audioBuffer: Buffer, format: 'wav' | 'webm' | 'mp3' = 'webm'): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not configured');
    }

    const startTime = Date.now();
    
    try {
      const file = new File([audioBuffer], `audio.${format}`, { 
        type: format === 'wav' ? 'audio/wav' : format === 'webm' ? 'audio/webm' : 'audio/mpeg' 
      });

      const transcription = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'en',
      });

      const latency = Date.now() - startTime;
      logger.info('[VoiceOrchestrator] Transcription completed', { 
        latencyMs: latency,
        textLength: transcription.text.length 
      });

      return transcription.text;
    } catch (error: any) {
      logger.error('[VoiceOrchestrator] Transcription failed:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  async getGrokResponse(userId: string, userText: string): Promise<string> {
    const session = await this.getOrCreateSession(userId);
    
    session.messages.push({
      role: 'user',
      content: userText
    });

    try {
      const response = await grokClient.chat(session.messages, {
        model: 'grok-3-mini',
        maxTokens: 500,
        temperature: 0.7,
        userId,
      });

      session.messages.push({
        role: 'assistant',
        content: response
      });

      if (session.messages.length > 20) {
        const systemMessage = session.messages[0];
        session.messages = [systemMessage, ...session.messages.slice(-18)];
      }

      this.processBrainUpdatesAsync(userId, userText, response);

      const cleanResponse = response.replace(/BRAIN_UPDATE_JSON:\s*\{[\s\S]*?\}/g, '').trim();
      
      return cleanResponse;
    } catch (error: any) {
      logger.error('[VoiceOrchestrator] Grok response failed:', error);
      throw new Error(`Grok response failed: ${error.message}`);
    }
  }

  private async processBrainUpdatesAsync(userId: string, userText: string, grokResponse: string): Promise<void> {
    try {
      await processAndPersistBrainUpdates(userId, grokResponse);
      logger.info('[VoiceOrchestrator] Brain updates processed', { userId });
    } catch (error) {
      logger.error('[VoiceOrchestrator] Brain update failed:', error);
    }
  }

  async synthesizeSpeech(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'): Promise<Buffer> {
    if (!this.openai) {
      throw new Error('OpenAI not configured');
    }

    const startTime = Date.now();

    try {
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
        response_format: 'mp3',
      });

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const latency = Date.now() - startTime;
      logger.info('[VoiceOrchestrator] TTS completed', { 
        latencyMs: latency,
        audioSize: buffer.length 
      });

      return buffer;
    } catch (error: any) {
      logger.error('[VoiceOrchestrator] TTS failed:', error);
      throw new Error(`TTS failed: ${error.message}`);
    }
  }

  async processVoiceTurn(userId: string, audioBuffer: Buffer, audioFormat: 'wav' | 'webm' | 'mp3' = 'webm'): Promise<{
    userText: string;
    assistantText: string;
    audioBuffer: Buffer;
  }> {
    logger.info('[VoiceOrchestrator] Processing voice turn', { userId, audioSize: audioBuffer.length });

    const userText = await this.transcribeAudio(audioBuffer, audioFormat);
    logger.info('[VoiceOrchestrator] User said:', { text: userText.substring(0, 100) });

    const assistantText = await this.getGrokResponse(userId, userText);
    logger.info('[VoiceOrchestrator] Grok replied:', { text: assistantText.substring(0, 100) });

    const audioResponse = await this.synthesizeSpeech(assistantText, 'nova');

    return {
      userText,
      assistantText,
      audioBuffer: audioResponse,
    };
  }

  async processTextTurn(userId: string, userText: string): Promise<{
    assistantText: string;
    audioBuffer: Buffer;
  }> {
    logger.info('[VoiceOrchestrator] Processing text turn', { userId, text: userText.substring(0, 50) });

    const assistantText = await this.getGrokResponse(userId, userText);
    const audioResponse = await this.synthesizeSpeech(assistantText, 'nova');

    return {
      assistantText,
      audioBuffer: audioResponse,
    };
  }

  clearSession(userId: string): void {
    activeSessions.delete(userId);
    logger.info('[VoiceOrchestrator] Session cleared', { userId });
  }

  getSessionInfo(userId: string): { messageCount: number; lastActivity: Date } | null {
    const session = activeSessions.get(userId);
    if (!session) return null;
    
    return {
      messageCount: session.messages.length,
      lastActivity: session.lastActivity,
    };
  }
}

export const voiceOrchestrator = new VoiceOrchestrator();
