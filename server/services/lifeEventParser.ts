import { logger } from '../logger';
import { geminiChatClient } from './geminiChatClient';
import OpenAI from 'openai';

/**
 * Life event parser with multi-provider support
 * Extracts structured life events from natural language messages
 * Primary: Gemini 2.5 Pro, Fallback: OpenAI GPT-5
 */

// OpenAI client using Replit AI Integrations (no API key needed)
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface LifeEventExtraction {
  eventType: string;
  details: Record<string, any>;
  acknowledgment: string;
}

interface MultipleLifeEventsExtraction {
  events: LifeEventExtraction[];
  acknowledgment: string;
}

// Cheap pre-filter to avoid calling Grok on every message
// Uses specific phrases and high-signal terms to avoid false positives
const TRIGGER_WORDS = [
  // Activity/behavior words (existing - already specific)
  'just did', 'finished', 'completed', 'had a', 'took', 'ate', 'drank',
  'ice bath', 'cold plunge', 'sauna', 'alcohol', 'wine', 'beer', 'drinks',
  'workout', 'exercise', 'stressed', 'anxious', 'supplements', 'nmn', 
  'creatine', 'protein shake', 'vitamins', 'breathwork', 'meditation',
  'yoga', 'massage', 'pizza', 'burger', 'late night', 'caffeine',
  'coffee', 'energy drink', 'woke up', 'bedtime', 'nap',
  
  // Symptom/illness phrases (unambiguous medical terms or clear symptom phrases)
  'feeling sick', 'feeling ill', 'not feeling well', 'under the weather',
  'headache', 'migraine', 'fever', 'nausea', 'vomiting', 'sore throat',
  'back pain', 'knee pain', 'shoulder pain', 'neck pain', 'muscle ache', 'joint pain',
  'feeling dizzy', 'cough', 'congestion', 'runny nose', 'sinus pressure', 'stomach cramps',
  'got injured', 'pulled a muscle', 'feeling fatigued', 'body aches',
  
  // Goal/intention phrases (multi-word for specificity)
  'want to lose', 'want to gain', 'want to improve', 'want to increase',
  'trying to lose', 'trying to gain', 'trying to improve', 'trying to build',
  'my goal', 'goal is', 'aiming to', 'working on improving', 'focus on building',
  'hoping to', 'target is', 'planning to',
  
  // Observation phrases (specific combinations)
  'feeling energized', 'feeling tired', 'feeling sluggish', 'feeling sharp',
  'noticed that', 'noticed my', 'seems like', 'realized that',
  'brain fog', 'mental clarity', 'poor sleep', 'great sleep', 
  'sleep has been', 'energy has been', 'mood has been'
];

/**
 * Check if message potentially contains a life event
 * Logs matched trigger words for debugging
 */
export function couldContainLifeEvent(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  const matchedWords = TRIGGER_WORDS.filter(word => lowerMessage.includes(word));
  
  if (matchedWords.length > 0) {
    logger.info('[LifeEventParser] Trigger words matched', {
      matchedWords,
      messagePreview: message.substring(0, 100),
    });
    return true;
  }
  
  return false;
}

/**
 * Extract life events using Gemini/OpenAI
 * Returns array of events (can be multiple from one message)
 */
export async function extractLifeEvents(
  message: string
): Promise<LifeEventExtraction[]> {
  try {
    if (!geminiChatClient.isAvailable() && !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      logger.warn('[LifeEventParser] No AI providers available');
      return [];
    }

    const systemPrompt = `You are a health behavior extraction system. Extract ALL life events from user messages as SEPARATE entries.

CRITICAL: When a user mentions MULTIPLE activities, return EACH as a SEPARATE event in the array.

Output JSON array with this structure (empty array [] if no events):
{
  "events": [
    {
      "eventType": "ice_bath|sauna|alcohol|late_meal|supplements|workout|stress|breathwork|caffeine|symptoms|health_goal|observation",
      "details": {...},
      "acknowledgment": "Short acknowledgment for this specific event"
    }
  ],
  "combinedAcknowledgment": "Brief overall acknowledgment (1 sentence)"
}

Event Type Mappings:
- swim/swimming/ocean swim → workout (with type: "swim")
- run/running/jog → workout (with type: "run")
- gym/weights/lifting → workout (with type: "gym")
- walk/walking/hike → workout (with type: "walk")
- yoga/stretch → workout (with type: "yoga")
- sauna/steam room → sauna
- ice bath/cold plunge/cold water → ice_bath
- meditation/breathwork → breathwork
- coffee/caffeine/energy drink → caffeine
- alcohol/wine/beer/drinks → alcohol
- supplements/vitamins/NMN/creatine → supplements

MULTIPLE ACTIVITIES EXAMPLE:
User: "I had a 20 minute swim and a 40 minute sauna"
→ {
  "events": [
    {"eventType": "workout", "details": {"type": "swim", "duration_min": 20}, "acknowledgment": "20-min swim logged."},
    {"eventType": "sauna", "details": {"duration_min": 40}, "acknowledgment": "40-min sauna logged."}
  ],
  "combinedAcknowledgment": "Nice recovery session! Both logged."
}

User: "just got back from the beach, did a 20 minute ocean swim plus a 20 minute sauna"
→ {
  "events": [
    {"eventType": "workout", "details": {"type": "swim", "duration_min": 20}, "acknowledgment": "Ocean swim logged."},
    {"eventType": "sauna", "details": {"duration_min": 20}, "acknowledgment": "Sauna session logged."}
  ],
  "combinedAcknowledgment": "Beach day activities logged!"
}

User: "took my supplements and had a coffee this morning"
→ {
  "events": [
    {"eventType": "supplements", "details": {}, "acknowledgment": "Supplements noted."},
    {"eventType": "caffeine", "details": {"source": "coffee"}, "acknowledgment": "Morning coffee logged."}
  ],
  "combinedAcknowledgment": "Morning routine logged."
}

SINGLE ACTIVITY EXAMPLES:
User: "just did a 6-min ice bath at 7°C"
→ {"events": [{"eventType": "ice_bath", "details": {"duration_min": 6, "temp_c": 7}, "acknowledgment": "6 minutes at 7°C — logged."}], "combinedAcknowledgment": "Ice bath logged."}

User: "feeling super stressed about work today"
→ {"events": [{"eventType": "stress", "details": {"severity": "high", "trigger": "work"}, "acknowledgment": "Stress level noted."}], "combinedAcknowledgment": "Stress noted."}

Non-events (return empty events array):
User: "how's my HRV looking?"
→ {"events": [], "combinedAcknowledgment": ""}

IMPORTANT: NEVER combine multiple activities into a single "other" event. Each activity gets its own properly-typed event.`;

    let response: string | null = null;
    let provider = 'gemini';

    // Try Gemini first
    try {
      if (geminiChatClient.isAvailable()) {
        response = await geminiChatClient.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ], {
          model: 'gemini-2.5-pro',
          temperature: 0.3,
          maxTokens: 200,
        });
        
        if (!response || response.trim().length === 0) {
          logger.warn('[LifeEventParser] Gemini returned empty, trying OpenAI fallback');
          response = null;
        }
      }
    } catch (geminiError: any) {
      logger.warn('[LifeEventParser] Gemini failed, trying OpenAI fallback', { 
        error: geminiError.message 
      });
    }

    // Fallback to OpenAI if Gemini failed
    if (!response && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      provider = 'openai';
      try {
        const openaiResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini', // Use fast, cheap model for extraction
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          temperature: 0.3,
          max_tokens: 500, // Increased for multiple events
        });
        response = openaiResponse.choices[0]?.message?.content || null;
        logger.info('[LifeEventParser] OpenAI fallback succeeded');
      } catch (openaiError: any) {
        logger.error('[LifeEventParser] OpenAI fallback also failed', { 
          error: openaiError.message 
        });
        return [];
      }
    }

    if (!response) {
      logger.error('[LifeEventParser] All providers failed');
      return [];
    }

    logger.info('[LifeEventParser] Response received', { 
      provider,
      responsePreview: response.substring(0, 300) 
    });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.info('[LifeEventParser] No event detected in message');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as MultipleLifeEventsExtraction;
    
    // Handle new format with events array
    if (parsed.events && Array.isArray(parsed.events)) {
      const validEvents = parsed.events.filter(e => e.eventType && e.details);
      
      logger.info('[LifeEventParser] Extracted multiple events:', {
        provider,
        eventCount: validEvents.length,
        types: validEvents.map(e => e.eventType),
      });
      
      return validEvents;
    }
    
    // Fallback: handle old single-event format for backward compatibility
    const singleEvent = parsed as unknown as LifeEventExtraction;
    if (singleEvent.eventType && singleEvent.details) {
      logger.info('[LifeEventParser] Extracted single event (legacy format):', {
        provider,
        type: singleEvent.eventType,
      });
      return [singleEvent];
    }
    
    logger.info('[LifeEventParser] Invalid extraction format');
    return [];
  } catch (error: any) {
    logger.error('[LifeEventParser] Extraction error:', error);
    return [];
  }
}

/**
 * Legacy function for backward compatibility
 * Returns first event or null
 */
export async function extractLifeEvent(
  message: string
): Promise<LifeEventExtraction | null> {
  const events = await extractLifeEvents(message);
  return events.length > 0 ? events[0] : null;
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
