import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { storeMultipleMemories, MemoryPayload } from './userMemoryService';

const openai = new OpenAI();

const EXTRACTION_PROMPT = `You are an expert personal context extractor. Extract every concrete fact, goal, preference, symptom, mood, habit, interest, relationship, stress factor, life event, or other personal detail from the conversation below. Include aspects of mental wellbeing, daily habits, and broader life context that could influence health or behavior.

Return valid JSON only (no markdown). Use this exact schema:

{
  "memories": [
    {
      "type": "goal_set|goal_update|symptom|mood_report|habit|personal_interest|life_context|preference|relationship|health_observation",
      "raw": "exact quote or paraphrase from user",
      "extracted": {
        // structured data varies by type, include all relevant fields
      },
      "importance": "low|medium|high",
      "linked_to": ["optional array of related health metrics or topics"]
    }
  ]
}

Guidelines:
- Only extract facts explicitly stated by the user (never infer or assume)
- Include mental health states (stress, anxiety, mood)
- Include habits and routines
- Include personal interests and hobbies
- Include relationships and social context
- Include life events (travel, work changes, family events)
- Include health observations and symptoms
- Include goals and aspirations
- Set importance based on:
  - high: goals, significant symptoms, major life events, mental health concerns
  - medium: habits, preferences, regular patterns
  - low: casual mentions, minor details

If no meaningful personal context is found, return: {"memories": []}`;

interface ExtractionResult {
  memories: MemoryPayload[];
}

export async function extractMemoriesFromConversation(
  conversation: string
): Promise<MemoryPayload[]> {
  try {
    if (!conversation || conversation.trim().length < 20) {
      return [];
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: conversation }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.warn('[MemoryExtraction] Empty response from OpenAI');
      return [];
    }

    const parsed: ExtractionResult = JSON.parse(content);
    
    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      return [];
    }

    const validMemories = parsed.memories.filter(m => 
      m.type && m.raw && m.extracted && typeof m.extracted === 'object'
    );

    logger.info(`[MemoryExtraction] Extracted ${validMemories.length} memories from conversation`);
    return validMemories;

  } catch (error: any) {
    if (error.message?.includes('JSON')) {
      logger.warn('[MemoryExtraction] Failed to parse JSON response:', error.message);
    } else {
      logger.error('[MemoryExtraction] Error extracting memories:', error);
    }
    return [];
  }
}

export async function extractAndStoreMemories(
  userId: string,
  conversation: string,
  sessionId?: string
): Promise<number> {
  try {
    const memories = await extractMemoriesFromConversation(conversation);
    
    if (memories.length === 0) {
      logger.info(`[MemoryExtraction] No memories to store for user ${userId}`);
      return 0;
    }

    const stored = await storeMultipleMemories(userId, memories, sessionId);
    logger.info(`[MemoryExtraction] Stored ${stored} memories for user ${userId}`);
    
    return stored;
  } catch (error) {
    logger.error('[MemoryExtraction] Error extracting and storing memories:', error);
    return 0;
  }
}

export async function extractMemoriesFromChatTurn(
  userMessage: string,
  assistantResponse: string
): Promise<MemoryPayload[]> {
  const conversation = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
  return extractMemoriesFromConversation(conversation);
}

export async function processAndStoreFromChatTurn(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  sessionId?: string
): Promise<number> {
  const conversation = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
  return extractAndStoreMemories(userId, conversation, sessionId);
}
