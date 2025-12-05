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
 * Extract life event using Gemini 2.5 Flash
 * Returns null if no event detected
 */
export async function extractLifeEvent(
  message: string
): Promise<LifeEventExtraction | null> {
  try {
    if (!geminiChatClient.isAvailable()) {
      logger.warn('[LifeEventParser] Gemini client not available');
      return null;
    }

    const systemPrompt = `You are a health behavior extraction system. Extract structured life events from user messages.

Output JSON with this exact structure (or null if no event):
{
  "eventType": "ice_bath|sauna|alcohol|late_meal|supplements|workout|stress|breathwork|caffeine|symptoms|health_goal|observation|other",
  "details": {
    // For ice_bath/cold_plunge: {duration_min: 6, temp_c: 7}
    // For alcohol: {drinks: 2, type: "wine"}
    // For late_meal: {food: "pizza", hour: 22}
    // For supplements: {names: ["NMN", "Creatine"], dosage: "1g"}
    // For workout: {type: "run", duration_min: 30}
    // For stress: {severity: "high", trigger: "work"}
    // For caffeine: {source: "coffee", cups: 2, hour: 14}
    // For symptoms: {symptoms: ["headache", "fever"], severity: "moderate", duration: "3 days", triggers: "poor sleep"}
    // For health_goal: {goal: "lose weight", target: "5kg", timeframe: "3 months", area: "weight|sleep|fitness|nutrition|recovery"}
    // For observation: {area: "energy|sleep|mood|focus|recovery", sentiment: "positive|negative|neutral", context: "after workout", note: "felt more alert"}
  },
  "acknowledgment": "Short, casual acknowledgment (1 sentence max)"
}

Examples - Behaviors:
User: "just did a 6-min ice bath at 7°C"
→ {"eventType": "ice_bath", "details": {"duration_min": 6, "temp_c": 7}, "acknowledgment": "6 minutes at 7°C — logged."}

User: "had two glasses of wine and pizza at 10pm"
→ {"eventType": "late_meal", "details": {"food": "pizza and wine", "hour": 22, "drinks": 2}, "acknowledgment": "Late night pizza + wine — logged."}

User: "took my usual NMN and creatine stack"
→ {"eventType": "supplements", "details": {"names": ["NMN", "Creatine"]}, "acknowledgment": "Supplement stack logged."}

User: "feeling super stressed about work today"
→ {"eventType": "stress", "details": {"severity": "high", "trigger": "work"}, "acknowledgment": "Stress level noted."}

Examples - Symptoms:
User: "I'm feeling sick with a headache and fever"
→ {"eventType": "symptoms", "details": {"symptoms": ["headache", "fever"], "severity": "moderate"}, "acknowledgment": "Symptoms logged — feel better soon."}

User: "been having lower back pain for 3 days now"
→ {"eventType": "symptoms", "details": {"symptoms": ["lower back pain"], "severity": "moderate", "duration": "3 days"}, "acknowledgment": "Back pain noted."}

User: "woke up with a sore throat and congestion"
→ {"eventType": "symptoms", "details": {"symptoms": ["sore throat", "congestion"], "severity": "mild"}, "acknowledgment": "Morning symptoms logged."}

Examples - Health Goals:
User: "I want to lose 5kg by summer"
→ {"eventType": "health_goal", "details": {"goal": "lose weight", "target": "5kg", "timeframe": "by summer", "area": "weight"}, "acknowledgment": "Weight loss goal set — tracking."}

User: "trying to improve my sleep quality"
→ {"eventType": "health_goal", "details": {"goal": "improve sleep quality", "area": "sleep"}, "acknowledgment": "Sleep improvement goal noted."}

User: "goal is to get my HRV above 60"
→ {"eventType": "health_goal", "details": {"goal": "increase HRV", "target": "above 60", "area": "recovery"}, "acknowledgment": "HRV target set."}

User: "working on building more muscle mass"
→ {"eventType": "health_goal", "details": {"goal": "build muscle", "area": "fitness"}, "acknowledgment": "Muscle building goal logged."}

Examples - Observations:
User: "feeling really energized today"
→ {"eventType": "observation", "details": {"area": "energy", "sentiment": "positive"}, "acknowledgment": "Energy boost noted."}

User: "noticed I'm more focused on days I skip coffee"
→ {"eventType": "observation", "details": {"area": "focus", "sentiment": "positive", "context": "without caffeine", "note": "better focus without coffee"}, "acknowledgment": "Caffeine-focus pattern logged."}

User: "sleep has been terrible this week"
→ {"eventType": "observation", "details": {"area": "sleep", "sentiment": "negative", "note": "poor sleep quality this week"}, "acknowledgment": "Sleep quality decline noted."}

User: "feeling mentally sharp after my morning workout"
→ {"eventType": "observation", "details": {"area": "focus", "sentiment": "positive", "context": "after workout", "note": "mental clarity post-exercise"}, "acknowledgment": "Workout clarity boost logged."}

Non-events (return null):
User: "how's my HRV looking?"
→ null (question, not an event)

User: "what does my blood work show?"
→ null (question, not an event)

Be concise. Extract only clear, loggable behaviors, symptoms, goals, or observations. Return null for questions or general discussion.`;

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
        // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        const openaiResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini', // Use fast, cheap model for extraction
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          temperature: 0.3,
          max_tokens: 200,
        });
        response = openaiResponse.choices[0]?.message?.content || null;
        logger.info('[LifeEventParser] OpenAI fallback succeeded');
      } catch (openaiError: any) {
        logger.error('[LifeEventParser] OpenAI fallback also failed', { 
          error: openaiError.message 
        });
        return null;
      }
    }

    if (!response) {
      logger.error('[LifeEventParser] All providers failed');
      return null;
    }

    logger.info('[LifeEventParser] Response received', { 
      provider,
      responsePreview: response.substring(0, 200) 
    });

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
      provider,
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
