import { logger } from '../logger';

/**
 * Grok-powered life event parser
 * Extracts structured life events from natural language messages
 * Cost: ~$0.00002 per parsed message (only triggers when relevant)
 */

interface LifeEventExtraction {
  eventType: string;
  details: Record<string, any>;
  acknowledgment: string;
}

// Cheap pre-filter to avoid calling Grok on every message
const TRIGGER_WORDS = [
  'just', 'did', 'finished', 'completed', 'had', 'took', 'ate', 'drank', 'felt',
  'slept', 'ice bath', 'cold plunge', 'sauna', 'cold', 'hot', 'alcohol', 'wine',
  'beer', 'drinks', 'workout', 'exercise', 'stress', 'stressed', 'anxious',
  'supplements', 'nmn', 'creatine', 'protein', 'vitamins', 'breathwork',
  'meditation', 'yoga', 'massage', 'pizza', 'burger', 'late', 'night',
  'caffeine', 'coffee', 'energy drink', 'woke up', 'bedtime', 'nap'
];

/**
 * Check if message potentially contains a life event
 */
export function couldContainLifeEvent(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return TRIGGER_WORDS.some(word => lowerMessage.includes(word));
}

/**
 * Extract life event using Grok (grok-3-mini model)
 * Returns null if no event detected
 */
export async function extractLifeEvent(
  message: string
): Promise<LifeEventExtraction | null> {
  try {
    const { grokClient } = await import('./grokClient');

    const systemPrompt = `You are a health behavior extraction system. Extract structured life events from user messages.

Output JSON with this exact structure (or null if no event):
{
  "eventType": "ice_bath|sauna|alcohol|late_meal|supplements|workout|stress|breathwork|caffeine|other",
  "details": {
    // For ice_bath/cold_plunge: {duration_min: 6, temp_c: 7}
    // For alcohol: {drinks: 2, type: "wine"}
    // For late_meal: {food: "pizza", hour: 22}
    // For supplements: {names: ["NMN", "Creatine"], dosage: "1g"}
    // For workout: {type: "run", duration_min: 30}
    // For stress: {severity: "high", trigger: "work"}
    // For caffeine: {source: "coffee", cups: 2, hour: 14}
  },
  "acknowledgment": "Short, casual acknowledgment (1 sentence max)"
}

Examples:
User: "just did a 6-min ice bath at 7°C"
→ {"eventType": "ice_bath", "details": {"duration_min": 6, "temp_c": 7}, "acknowledgment": "6 minutes at 7°C — logged."}

User: "had two glasses of wine and pizza at 10pm"
→ {"eventType": "late_meal", "details": {"food": "pizza and wine", "hour": 22, "drinks": 2}, "acknowledgment": "Late night pizza + wine — logged."}

User: "took my usual NMN and creatine stack"
→ {"eventType": "supplements", "details": {"names": ["NMN", "Creatine"]}, "acknowledgment": "Supplement stack logged."}

User: "feeling super stressed about work today"
→ {"eventType": "stress", "details": {"severity": "high", "trigger": "work"}, "acknowledgment": "Stress level noted."}

User: "how's my HRV looking?"
→ null (no event to log)

Be concise. Extract only clear, loggable behaviors.`;

    const response = await grokClient.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ], {
      temperature: 0.3, // Low temp for consistent extraction
      maxTokens: 200,
    });

    logger.info('[LifeEventParser] Grok response:', { response: response.substring(0, 200) });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.info('[LifeEventParser] No event detected in message');
      return null;
    }

    const extraction = JSON.parse(jsonMatch[0]) as LifeEventExtraction;
    
    // Validate extraction
    if (!extraction.eventType || !extraction.acknowledgment) {
      logger.info('[LifeEventParser] Invalid extraction format');
      return null;
    }

    logger.info('[LifeEventParser] Extracted event:', {
      type: extraction.eventType,
      details: extraction.details,
    });

    return extraction;
  } catch (error: any) {
    logger.error('[LifeEventParser] Extraction error:', error);
    return null;
  }
}

/**
 * Format acknowledgment for chat response
 */
export function formatAcknowledgment(
  eventType: string,
  acknowledgment: string
): string {
  return `${acknowledgment}`;
}
