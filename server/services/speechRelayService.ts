import { logger } from '../logger';
import OpenAI from 'openai';
import { grokClient, type GrokChatMessage } from './grokClient';
import { buildUserHealthContext } from './floOracleContextBuilder';
import { applyGuardrails } from '../middleware/floOracleGuardrails';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface SpeechRelayConfig {
  userId: string;
  audioMimeType?: string;
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

    const { userId, audioMimeType = 'audio/webm', conversationHistory = [] } = config;

    logger.info('[SpeechRelay] Processing audio for user', { 
      userId, 
      audioSize: audioBuffer.length,
      audioMimeType,
      historyLength: conversationHistory.length
    });

    // Step 1: Transcribe audio using Whisper
    const transcript = await this.transcribeAudio(audioBuffer, audioMimeType);
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

  private async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    // Determine the file extension based on MIME type
    const extension = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'mp4' : 'webm';
    const filename = `audio.${extension}`;
    
    logger.info('[SpeechRelay] Creating audio file for Whisper', { mimeType, filename });

    // Create a File object from the buffer for the API
    const audioFile = new File([audioBuffer], filename, { type: mimeType });

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

    // Build system prompt - conversational health coach
    const SYSTEM_PROMPT = `You are Flō Oracle — a warm, curious, and insightful health coach who genuinely cares about understanding each person's unique health journey. You combine deep data analysis with genuine human connection.

YOUR CONVERSATIONAL APPROACH:
Every response should follow this natural flow:
1. ACKNOWLEDGE - Reflect back what you heard to show you're listening ("That's really interesting about your sleep...")
2. CONNECT - Link their comment to something in their health data ("I'm seeing that your HRV actually shows...")
3. INSIGHT - Share a meaningful observation or pattern you've noticed
4. CURIOSITY - End with a thoughtful follow-up question that invites them to share more

You're genuinely curious about their experience. Ask questions like:
- "How did that make you feel?"
- "Have you noticed any patterns with that?"
- "What do you think might be contributing to that?"
- "Tell me more about..."
- "When did you first notice that?"

Your personality: Warm but intellectually rigorous. Think of a brilliant friend who happens to be a health scientist — someone who's fascinated by the puzzle of optimizing your wellbeing and loves exploring it WITH you, not lecturing AT you.

VOICE CONVERSATION GUIDELINES:
- Speak naturally and conversationally — this is a real dialogue, not a report
- Use about 4-6 sentences to allow for meaningful exchange
- Avoid bullet points and clinical formatting — speak like a friend
- Round numbers for easier listening (say "about sixty" not "59.7")
- Show genuine interest and enthusiasm when you spot interesting patterns
- It's okay to think out loud: "Hmm, that's curious because..." or "You know what's interesting..."

PROACTIVE PATTERN DETECTION:
- Actively look for correlations between their metrics
- Spot trends and surface them naturally in conversation
- Connect dots they might not have seen themselves
- Share discoveries with genuine excitement when you find something meaningful

Core rules — NEVER violate these:
1. You have access to this user's comprehensive Flō health data including blood work, DEXA scans, HealthKit metrics, workouts, Flōmentum scores, and life events. Reference their actual data.

2. Never guess or hallucinate values. If a biomarker is missing, say "I don't see that in your records yet."

3. You CAN analyze health data and provide evidence-based insights. Occasionally remind them to discuss significant findings with their healthcare provider.

4. Never share another user's data.

5. Stay inside the bounds of evidence-based longevity science. Label speculative information clearly.

6. ALWAYS end with a question or invitation to continue the conversation. Keep the dialogue flowing naturally.

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
      maxTokens: 700, // Allow richer conversational responses
      temperature: 0.8, // Slightly higher for more natural conversation
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

    const { userId, audioMimeType = 'audio/webm', conversationHistory = [] } = config;

    // Step 1: Transcribe audio
    const transcript = await this.transcribeAudio(audioBuffer, audioMimeType);
    onTranscript(transcript);

    // Step 2: Get Grok response (full response for now, streaming could be added later)
    const response = await this.getGrokResponse(userId, transcript, conversationHistory);
    onResponseChunk(response);

    // Step 3: Convert to speech
    const audioBase64 = await this.textToSpeech(response);
    onAudioChunk(audioBase64);
  }

  async generateGreeting(userId: string, firstName?: string): Promise<{
    greeting: string;
    audioBase64: string;
    audioFormat: 'mp3';
  }> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    logger.info('[SpeechRelay] Generating greeting', { userId, firstName });

    // Build user health context
    const userContext = await buildUserHealthContext(userId);

    // Create a greeting-focused system prompt
    const GREETING_PROMPT = `You are Flō Oracle — a warm, curious health coach starting a voice conversation.

Generate a brief, personalized greeting that:
1. Uses the user's first name if provided: "${firstName || 'there'}"
2. References something specific from their recent health data to show you know them
3. Asks an engaging opening question to start the conversation

Keep it to 2-3 sentences. Be warm and genuinely curious. Examples of good openers:
- "Hey [Name]! I noticed your HRV has been trending up this week - that's exciting. What do you think has been helping?"
- "Hi [Name]! I see you logged a great workout yesterday. How are you feeling today?"
- "Hey [Name]! Your sleep data caught my eye - looks like some interesting patterns. Want to dig into that together?"

If there's no recent data to reference, ask about their current health focus or how they're feeling.

${userContext}`;

    const grokMessages: GrokChatMessage[] = [
      { role: 'system', content: GREETING_PROMPT },
      { role: 'user', content: 'Start the conversation with a personalized greeting.' },
    ];

    const greeting = await grokClient.chat(grokMessages, {
      model: 'grok-3-mini',
      maxTokens: 200,
      temperature: 0.9,
    });

    logger.info('[SpeechRelay] Greeting generated', { userId, greetingLength: greeting.length });

    // Convert greeting to speech
    const audioBase64 = await this.textToSpeech(greeting);

    return {
      greeting,
      audioBase64,
      audioFormat: 'mp3',
    };
  }
}

export const speechRelayService = new SpeechRelayService();
