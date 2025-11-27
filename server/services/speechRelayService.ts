import { logger } from '../logger';
import OpenAI from 'openai';
import { grokClient, type GrokChatMessage } from './grokClient';
import { buildUserHealthContext } from './floOracleContextBuilder';
import { applyGuardrails } from '../middleware/floOracleGuardrails';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface SpeechRelayConfig {
  userId: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface SpeechRelayResult {
  transcript: string;
  response: string;
  audioBase64: string;
  audioFormat: 'mp3' | 'opus' | 'aac' | 'flac' | 'pcm';
}

class SpeechRelayService {
  private openai: OpenAI | null = null;

  constructor() {
    if (OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });
    }
  }

  isAvailable(): boolean {
    return !!this.openai;
  }

  async processAudio(
    audioBuffer: Buffer,
    config: SpeechRelayConfig
  ): Promise<SpeechRelayResult> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const { userId, conversationHistory = [] } = config;

    logger.info('[SpeechRelay] Processing audio for user', { 
      userId, 
      audioSize: audioBuffer.length,
      historyLength: conversationHistory.length
    });

    // Step 1: Transcribe audio using Whisper
    const transcript = await this.transcribeAudio(audioBuffer);
    logger.info('[SpeechRelay] Transcription complete', { 
      userId, 
      transcriptLength: transcript.length 
    });

    // Step 2: Get Grok response (using existing brain/context/guardrails)
    const response = await this.getGrokResponse(userId, transcript, conversationHistory);
    logger.info('[SpeechRelay] Grok response received', { 
      userId, 
      responseLength: response.length 
    });

    // Step 3: Convert response to speech using OpenAI TTS
    const audioBase64 = await this.textToSpeech(response);
    logger.info('[SpeechRelay] TTS complete', { 
      userId, 
      audioLength: audioBase64.length 
    });

    return {
      transcript,
      response,
      audioBase64,
      audioFormat: 'mp3',
    };
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    // Create a File object from the buffer for the API
    const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

    const transcription = await this.openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    });

    return transcription.trim();
  }

  private async getGrokResponse(
    userId: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    // Build health context (same as existing Flo Oracle)
    const userContext = await buildUserHealthContext(userId);

    // Apply input guardrails
    const inputGuardrails = applyGuardrails(userMessage, '');
    const sanitizedInput = inputGuardrails.sanitizedInput || userMessage;

    // Build system prompt (same as existing Flo Oracle)
    const SYSTEM_PROMPT = `You are Flō Oracle — a ruthlessly analytical, evidence-based health intelligence system designed to find patterns, correlations, and insights in the user's health data.

Your primary mission: PROACTIVELY ANALYZE AND CONNECT THE DOTS
- Actively look for correlations between metrics (e.g., "Your HRV dropped 18% on days with <6h sleep")
- Spot trends and patterns before the user asks (e.g., "I noticed your resting HR spiked 12 bpm every time you had alcohol in your life events")
- Surface actionable insights from data relationships (e.g., "Your workout intensity on days with >25ms HRV averages 180 kcal higher")
- Lead with data analysis, not general conversation

Your personality: Direct, analytical, evidence-driven. Think of a data scientist who happens to specialize in health optimization. Less therapist, more detective.

IMPORTANT: This is a VOICE conversation. Keep responses concise and natural for speech:
- Aim for 2-3 sentences unless more detail is specifically requested
- Avoid bullet points and formatting - speak naturally
- Round numbers for easier listening (say "about sixty" not "59.7")
- Be conversational but data-focused

Core rules — NEVER violate these:
1. You have access to this user's comprehensive Flō health data including blood work, DEXA scans, HealthKit metrics, workouts, Flōmentum scores, and life events. Reference their actual data.

2. Never guess or hallucinate values. If a biomarker is missing, say "I don't see that in your records yet."

3. You CAN analyze health data and provide evidence-based insights. End health-related insights with a brief disclaimer about consulting their healthcare provider.

4. Never share another user's data.

5. Stay inside the bounds of evidence-based longevity science. Label speculative information clearly.

6. Minimize chitchat. Acknowledge greetings briefly but pivot to data analysis if you have relevant insights.

${userContext}`;

    // Build messages array
    const grokMessages: GrokChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add conversation history
    conversationHistory.forEach((msg) => {
      grokMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    });

    // Add current user message
    grokMessages.push({
      role: 'user',
      content: sanitizedInput,
    });

    // Get Grok response
    const grokResponse = await grokClient.chat(grokMessages, {
      model: 'grok-3-mini',
      maxTokens: 500, // Shorter for voice
      temperature: 0.7,
    });

    // Apply output guardrails
    const outputGuardrails = applyGuardrails(userMessage, grokResponse);
    
    if (!outputGuardrails.safe && outputGuardrails.violation?.replacement) {
      return outputGuardrails.violation.replacement;
    }

    return outputGuardrails.sanitizedOutput || grokResponse;
  }

  private async textToSpeech(text: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    const response = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova', // Natural, warm female voice
      input: text,
      response_format: 'mp3',
      speed: 1.0,
    });

    // Convert response to base64
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  }

  async streamProcessAudio(
    audioBuffer: Buffer,
    config: SpeechRelayConfig,
    onTranscript: (transcript: string) => void,
    onResponseChunk: (chunk: string) => void,
    onAudioChunk: (audioBase64: string) => void
  ): Promise<void> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const { userId, conversationHistory = [] } = config;

    // Step 1: Transcribe audio
    const transcript = await this.transcribeAudio(audioBuffer);
    onTranscript(transcript);

    // Step 2: Get Grok response (full response for now, streaming could be added later)
    const response = await this.getGrokResponse(userId, transcript, conversationHistory);
    onResponseChunk(response);

    // Step 3: Convert to speech
    const audioBase64 = await this.textToSpeech(response);
    onAudioChunk(audioBase64);
  }
}

export const speechRelayService = new SpeechRelayService();
