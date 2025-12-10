import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { storeMultipleMemories, MemoryPayload } from './userMemoryService';

const openai = new OpenAI();

const EXTRACTION_PROMPT = `You are an expert personal context extractor for a health AI assistant. Extract every concrete fact, goal, preference, symptom, mood, habit, interest, relationship, stress factor, life event, health concern, or medical discussion from the conversation below.

🚨 HIGHEST PRIORITY - TOPIC SUPPRESSIONS:
When a user says ANY of the following, you MUST create a "topic_suppression" memory:
- "don't mention X again"
- "stop talking about X"  
- "I don't want to hear about X"
- "don't bring up X"
- "X is under control, don't mention it"
- "I'm already seeing a doctor about X"
- "I have an appointment for X"
- "I know about X, no need to remind me"
- Any explicit request to NOT discuss a specific health topic, biomarker, or concern

For topic_suppression type, ALWAYS set importance: "high" and include:
- extracted.topic: the specific topic/biomarker to suppress (e.g., "PSA levels", "cholesterol")
- extracted.reason: why they want it suppressed (e.g., "doctor appointment scheduled Jan 6", "under control")
- extracted.until: any mentioned date (e.g., "2025-01-06") or null if indefinite

ALSO pay attention to health discussions that should NOT be repeated in future conversations:
- Biomarker concerns (high/low PSA, cholesterol, glucose, A1C, etc.)
- Medical conditions being monitored
- Medications and supplements being taken
- Health goals and targets
- Past medical procedures or tests
- Ongoing health issues or concerns the user has discussed

Return valid JSON only (no markdown). Use this exact schema:

{
  "memories": [
    {
      "type": "goal_set|goal_update|symptom|mood_report|habit|personal_interest|life_context|preference|relationship|health_observation|biomarker_concern|medical_condition|medication|health_discussion|topic_suppression",
      "raw": "exact quote or paraphrase from user",
      "extracted": {
        // structured data varies by type, include all relevant fields
        // For topic_suppression: MUST include topic (what to suppress), reason (why), until (date or null)
        // For biomarker_concern: include biomarker name, value if mentioned, whether high/low/normal
        // For medical_condition: include condition name, status (active/resolved/monitoring)
        // For medication: include name, purpose if known
        // For health_discussion: include topic, key points discussed, any conclusions
      },
      "importance": "low|medium|high",
      "linked_to": ["optional array of related health metrics or biomarkers"]
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
- ALWAYS extract biomarker discussions (PSA, cholesterol, A1C, glucose, testosterone, etc.)
- ALWAYS extract medical conditions or diagnoses mentioned
- ALWAYS extract medications, supplements, or treatments discussed
- 🚨 ALWAYS extract topic_suppression when user explicitly asks NOT to discuss something
- Set importance based on:
  - high: topic_suppression (ALWAYS), health concerns, biomarker issues, medical conditions, medications, goals, significant symptoms, major life events, mental health concerns
  - medium: habits, preferences, regular patterns, supplement routines
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
