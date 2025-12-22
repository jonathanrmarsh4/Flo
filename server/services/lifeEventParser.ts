import { logger } from '../logger';
import { geminiChatClient } from './geminiChatClient';
import OpenAI from 'openai';
import * as chrono from 'chrono-node';

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
  dateHint?: string;  // Raw date reference like "Sunday", "yesterday", "last week"
  occurredAt?: Date;  // Parsed date (populated after chrono processing)
  durationDays?: number;  // Duration in days for context-aware events (travel, illness, etc.)
}

interface MultipleLifeEventsExtraction {
  events: LifeEventExtraction[];
  acknowledgment: string;
}

/**
 * Parse a date hint using chrono-node with bias toward past dates
 * For life events, we assume users are talking about things that happened, not will happen
 * Returns the parsed date or null if parsing fails
 */
export function parseDateHint(dateHint: string | undefined | null, timezone?: string): Date | null {
  if (!dateHint) return null;
  
  try {
    const referenceDate = new Date();
    
    // Use chrono to parse the natural language date
    const results = chrono.parse(dateHint, referenceDate, {
      forwardDate: false,
    });
    
    if (results.length > 0 && results[0].start) {
      let parsedDate = results[0].start.date();
      
      // CRITICAL: Bias toward past dates for life events
      // If chrono returns a future date for ambiguous weekday references, go back one week
      if (parsedDate > referenceDate) {
        // Check if this is likely a weekday reference (no explicit "next" or future indicator)
        const lowerHint = dateHint.toLowerCase();
        const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const isBareWeekday = weekdays.some(day => lowerHint.includes(day)) && 
                              !lowerHint.includes('next') && 
                              !lowerHint.includes('upcoming') &&
                              !lowerHint.includes('this coming');
        
        if (isBareWeekday) {
          // Go back 7 days to get the previous occurrence
          parsedDate = new Date(parsedDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          logger.info('[LifeEventParser] Adjusted future weekday to past', {
            dateHint,
            originalDate: results[0].start.date().toISOString(),
            adjustedDate: parsedDate.toISOString(),
          });
        }
      }
      
      logger.info('[LifeEventParser] Parsed date hint', {
        dateHint,
        parsedDate: parsedDate.toISOString(),
        referenceDate: referenceDate.toISOString(),
        timezone,
      });
      
      return parsedDate;
    }
    
    logger.info('[LifeEventParser] Could not parse date hint', { dateHint });
    return null;
  } catch (error: any) {
    logger.error('[LifeEventParser] Date parsing error', { 
      dateHint, 
      error: error.message 
    });
    return null;
  }
}

/**
 * Parse a date hint for FUTURE appointments/scheduled follow-ups
 * Unlike parseDateHint, this ALLOWS future dates since appointments are typically scheduled ahead
 * Uses forwardDate: true to prefer upcoming dates
 */
export function parseFutureDate(dateHint: string | undefined | null): Date | null {
  if (!dateHint) return null;
  
  try {
    const referenceDate = new Date();
    
    // Use chrono to parse with FORWARD date preference
    const results = chrono.parse(dateHint, referenceDate, {
      forwardDate: true,
    });
    
    if (results.length > 0 && results[0].start) {
      const parsedDate = results[0].start.date();
      
      logger.info('[LifeEventParser] Parsed future date', {
        dateHint,
        parsedDate: parsedDate.toISOString(),
        referenceDate: referenceDate.toISOString(),
        isFuture: parsedDate > referenceDate,
      });
      
      return parsedDate;
    }
    
    logger.info('[LifeEventParser] Could not parse future date', { dateHint });
    return null;
  } catch (error: any) {
    logger.error('[LifeEventParser] Future date parsing error', { 
      dateHint, 
      error: error.message 
    });
    return null;
  }
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
  
  // Context-aware life events (affect ML sensitivity)
  'traveling', 'travel', 'on vacation', 'vacation', 'on holidays', 'holiday', 'holidays',
  'on a trip', 'road trip', 'flying', 'away from home', 'out of town',
  'jet lag', 'time zone', 'been sick', 'came down with', 'caught a cold', 'got sick',
  'rest day', 'recovery day', 'taking it easy', 'day off', 'injured my', 
  'dealing with stress', 'high stress', 'stressful week', 'busy week',
  'without my', 'forgot my', 'left my', 'equipment issue', 'watch died',
  'fasting', 'intermittent fasting', 'not eating', 'skipping meals',
  'started new medication', 'changed medication', 'new prescription',
  'altitude', 'high altitude', 'in the mountains',
  'period', 'menstrual', 'cycle started',
  
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
      "eventType": "ice_bath|sauna|alcohol|late_meal|supplements|workout|stress|breathwork|caffeine|symptoms|health_goal|observation|travel|illness|injury|rest_day|jet_lag|vacation|recovery",
      "details": {...},
      "acknowledgment": "Short acknowledgment for this specific event",
      "dateHint": "Raw date reference if mentioned (e.g. 'Sunday', 'yesterday', 'last week', 'this morning') or null if today",
      "durationDays": number or null (extract if user mentions duration like "for a week", "for 3 days", "until Friday")
    }
  ],
  "combinedAcknowledgment": "Brief overall acknowledgment (1 sentence)"
}

DURATION EXTRACTION (for context-aware events):
- "traveling for a week" → durationDays: 7
- "been sick for 3 days" → durationDays: 3
- "vacation until Friday" → calculate days until Friday
- "taking a rest day" → durationDays: 1
- "dealing with jet lag" → durationDays: 5 (default)
- If no duration mentioned for travel/illness → use sensible defaults (travel: 7, illness: 5, stress: 3)

DATE EXTRACTION RULES:
- If user says "Sunday", "on Sunday", "last Sunday" → dateHint: "Sunday" or "last Sunday"
- If user says "yesterday", "yesterday evening" → dateHint: "yesterday" or "yesterday evening"
- If user says "last week", "a few days ago" → dateHint: "last week" or "a few days ago"
- If user says "this morning", "earlier today" → dateHint: "this morning" or "earlier today"
- If no time reference or it's implied as now/today → dateHint: null

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
      
      // Parse date hints for each event
      for (const event of validEvents) {
        if (event.dateHint) {
          const parsedDate = parseDateHint(event.dateHint);
          if (parsedDate) {
            event.occurredAt = parsedDate;
          }
        }
      }
      
      logger.info('[LifeEventParser] Extracted multiple events:', {
        provider,
        eventCount: validEvents.length,
        types: validEvents.map(e => e.eventType),
        dateHints: validEvents.map(e => e.dateHint).filter(Boolean),
        parsedDates: validEvents.map(e => e.occurredAt?.toISOString()).filter(Boolean),
      });
      
      return validEvents;
    }
    
    // Fallback: handle old single-event format for backward compatibility
    const singleEvent = parsed as unknown as LifeEventExtraction;
    if (singleEvent.eventType && singleEvent.details) {
      // Parse date hint for single event
      if (singleEvent.dateHint) {
        const parsedDate = parseDateHint(singleEvent.dateHint);
        if (parsedDate) {
          singleEvent.occurredAt = parsedDate;
        }
      }
      
      logger.info('[LifeEventParser] Extracted single event (legacy format):', {
        provider,
        type: singleEvent.eventType,
        dateHint: singleEvent.dateHint,
        occurredAt: singleEvent.occurredAt?.toISOString(),
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

// ==================== BIOMARKER FOLLOWUP EXTRACTION ====================

// Common biomarker names for detection
const BIOMARKER_KEYWORDS = [
  'psa', 'cholesterol', 'ldl', 'hdl', 'triglycerides', 'glucose', 'hba1c', 'a1c',
  'vitamin d', 'vitamin b12', 'b12', 'iron', 'ferritin', 'testosterone', 'thyroid',
  'tsh', 't3', 't4', 'cortisol', 'crp', 'hs-crp', 'homocysteine', 'uric acid',
  'creatinine', 'egfr', 'liver', 'alt', 'ast', 'kidney', 'blood pressure',
  'hemoglobin', 'platelets', 'white blood cells', 'red blood cells', 'apob',
  'lp(a)', 'lipoprotein', 'insulin', 'dhea', 'estrogen', 'progesterone',
];

// Appointment/action keywords
const APPOINTMENT_KEYWORDS = [
  'appointment', 'doctor', 'specialist', 'urologist', 'cardiologist', 'endocrinologist',
  'scheduled', 'seeing', 'meeting', 'consultation', 'follow-up', 'followup', 'follow up',
  'retest', 'another test', 'getting tested', 'check-up', 'checkup',
];

export interface BiomarkerFollowupExtraction {
  biomarkerName: string;
  actionType: 'specialist_appointment' | 'retest' | 'lifestyle_change' | 'monitoring';
  actionDescription: string;
  scheduledDate?: Date;
  dateHint?: string;
  acknowledgment: string;
}

/**
 * Check if message might contain a biomarker follow-up mention
 */
export function couldContainBiomarkerFollowup(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  const hasBiomarker = BIOMARKER_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  const hasAppointment = APPOINTMENT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  
  return hasBiomarker && hasAppointment;
}

/**
 * Extract biomarker follow-up information from a message
 * Used when user mentions scheduling an appointment for a specific biomarker concern
 */
export async function extractBiomarkerFollowup(
  message: string
): Promise<BiomarkerFollowupExtraction | null> {
  try {
    if (!couldContainBiomarkerFollowup(message)) {
      return null;
    }

    if (!geminiChatClient.isAvailable() && !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      logger.warn('[LifeEventParser] No AI providers available for biomarker followup extraction');
      return null;
    }

    const systemPrompt = `You are a health assistant extracting biomarker follow-up appointments from user messages.

When a user mentions they have scheduled an appointment or follow-up for a specific biomarker or health concern, extract:

1. biomarkerName: The specific biomarker they are addressing (e.g., "PSA", "Cholesterol", "Vitamin D")
2. actionType: One of "specialist_appointment", "retest", "lifestyle_change", or "monitoring"
3. actionDescription: A brief description of what they are doing (e.g., "Specialist appointment with urologist")
4. dateHint: Any date mentioned (e.g., "January 6th", "next Tuesday", "in two weeks") or null
5. acknowledgment: A brief supportive message

Output JSON:
{
  "biomarkerName": "PSA",
  "actionType": "specialist_appointment",
  "actionDescription": "Specialist appointment with urologist",
  "dateHint": "January 6th",
  "acknowledgment": "Got it - I won't keep bringing up PSA since you have this handled."
}

If no clear biomarker follow-up is detected, return: {"detected": false}

Examples:
User: "I know about the PSA, I already have an appointment with a specialist on January 6th"
→ {"biomarkerName": "PSA", "actionType": "specialist_appointment", "actionDescription": "Specialist appointment scheduled", "dateHint": "January 6th", "acknowledgment": "Understood - I'll note the PSA follow-up appointment."}

User: "My doctor says to retest my vitamin D in 3 months"
→ {"biomarkerName": "Vitamin D", "actionType": "retest", "actionDescription": "Retest scheduled with doctor", "dateHint": "in 3 months", "acknowledgment": "Got it - vitamin D retest noted."}

User: "I'm seeing my cardiologist about the cholesterol next week"
→ {"biomarkerName": "Cholesterol", "actionType": "specialist_appointment", "actionDescription": "Cardiologist appointment", "dateHint": "next week", "acknowledgment": "Noted - cholesterol follow-up with cardiologist scheduled."}`;

    let response: string | null = null;
    let provider = 'gemini';

    try {
      if (geminiChatClient.isAvailable()) {
        response = await geminiChatClient.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ], {
          model: 'gemini-2.5-flash',
          temperature: 0.2,
          maxTokens: 300,
        });
      }
    } catch (geminiError: any) {
      logger.warn('[LifeEventParser] Gemini failed for biomarker followup, trying OpenAI', { 
        error: geminiError.message 
      });
    }

    if (!response && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      provider = 'openai';
      try {
        const openaiResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          temperature: 0.2,
          max_tokens: 300,
        });
        response = openaiResponse.choices[0]?.message?.content || null;
      } catch (openaiError: any) {
        logger.error('[LifeEventParser] OpenAI fallback also failed for biomarker followup', { 
          error: openaiError.message 
        });
        return null;
      }
    }

    if (!response) {
      return null;
    }

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Check if extraction was detected
    if (parsed.detected === false || !parsed.biomarkerName) {
      return null;
    }

    // Parse the date hint if present - use FUTURE date parser for appointments
    let scheduledDate: Date | undefined;
    if (parsed.dateHint) {
      // Use parseFutureDate instead of parseDateHint since appointments are typically scheduled ahead
      const parsedDate = parseFutureDate(parsed.dateHint);
      if (parsedDate) {
        scheduledDate = parsedDate;
      }
    }

    logger.info('[LifeEventParser] Extracted biomarker followup:', {
      provider,
      biomarker: parsed.biomarkerName,
      actionType: parsed.actionType,
      dateHint: parsed.dateHint,
      scheduledDate: scheduledDate?.toISOString(),
    });

    return {
      biomarkerName: parsed.biomarkerName,
      actionType: parsed.actionType || 'specialist_appointment',
      actionDescription: parsed.actionDescription || 'Follow-up scheduled',
      scheduledDate,
      dateHint: parsed.dateHint,
      acknowledgment: parsed.acknowledgment || 'Got it - follow-up noted.',
    };
  } catch (error: any) {
    logger.error('[LifeEventParser] Biomarker followup extraction error:', error);
    return null;
  }
}
