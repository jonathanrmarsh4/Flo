import { logger } from '../logger';
import { geminiChatClient } from './geminiChatClient';
import { LifeContextCategory } from './supabaseHealthStorage';

/**
 * Conversational Intent Parser
 * Detects follow-up requests and life context from natural conversation
 * Uses Gemini 2.5 Flash for consistency with text/voice chat
 */

// ==================== TYPES ====================

export interface FollowUpIntent {
  type: 'follow_up';
  intent_summary: string;
  metrics: string[];
  days_until_check: number;
  comparison_baseline?: string;
  original_text: string;
}

export interface LifeContextIntent {
  type: 'life_context';
  category: LifeContextCategory;
  description: string;
  start_date?: string;
  end_date?: string;
  expected_impact?: {
    hrv?: 'higher' | 'lower' | 'variable';
    sleep?: 'better' | 'worse' | 'disrupted';
    training?: 'increased' | 'reduced' | 'none';
    rhr?: 'higher' | 'lower';
    energy?: 'higher' | 'lower';
  };
  original_text: string;
}

export interface ConversationalIntentResult {
  follow_up?: FollowUpIntent;
  life_context?: LifeContextIntent;
  acknowledgment?: string;
}

// ==================== TRIGGER DETECTION ====================

const FOLLOW_UP_TRIGGERS = [
  'check back', 'check in', 'follow up', 'let me know',
  'remind me', 'tell me if', 'check whether', 'check if',
  'in a few days', 'in a week', 'next week', 'after',
  'see if', 'monitor', 'track whether', 'watch my',
  'is it working', 'is this working', 'having an effect',
  'making a difference', 'helping', 'improving',
];

const LIFE_CONTEXT_TRIGGERS = [
  'traveling', 'travel', 'business trip', 'vacation', 'flying',
  'won\'t be able to', 'can\'t train', 'can\'t exercise', 'can\'t work out',
  'taking time off', 'break from', 'pausing', 'stopping',
  'sick', 'illness', 'injured', 'injury', 'recovering',
  'stressed', 'stressful', 'busy period', 'crazy week',
  'not sleeping', 'jet lag', 'new baby', 'sleep deprived',
  'started taking', 'stopped taking', 'new medication',
  'fasting', 'new diet', 'cutting', 'bulking',
  'moving', 'new job', 'big change', 'life event',
];

/**
 * Quick pre-filter to check if message might contain follow-up or context intent
 */
export function couldContainConversationalIntent(message: string): {
  maybeFollowUp: boolean;
  maybeLifeContext: boolean;
} {
  const lowerMessage = message.toLowerCase();
  
  const followUpMatches = FOLLOW_UP_TRIGGERS.filter(t => lowerMessage.includes(t));
  const contextMatches = LIFE_CONTEXT_TRIGGERS.filter(t => lowerMessage.includes(t));
  
  if (followUpMatches.length > 0 || contextMatches.length > 0) {
    logger.info('[IntentParser] Potential intent detected', {
      followUpMatches,
      contextMatches,
      messagePreview: message.substring(0, 100),
    });
  }
  
  return {
    maybeFollowUp: followUpMatches.length > 0,
    maybeLifeContext: contextMatches.length > 0,
  };
}

// ==================== INTENT EXTRACTION ====================

const INTENT_EXTRACTION_PROMPT = `You are an AI assistant that detects two types of conversational intents:

1. **Follow-Up Requests**: User asks to be checked on later regarding health metrics
2. **Life Context**: User shares information about their life that affects health expectations

Output JSON with this structure (include only detected intents, omit if not present):

{
  "follow_up": {
    "intent_summary": "Brief description of what to check",
    "metrics": ["hrv", "sleep_quality", "rhr", "recovery", "energy"],
    "days_until_check": 3,
    "comparison_baseline": "before_saunas|before_activity|last_week|yesterday"
  },
  "life_context": {
    "category": "travel|training_pause|illness|stress|sleep_disruption|diet_change|medication|life_event|other",
    "description": "Brief description",
    "start_date": "2024-12-04",
    "end_date": "2024-12-08",
    "expected_impact": {
      "hrv": "lower|higher|variable",
      "sleep": "better|worse|disrupted",
      "training": "increased|reduced|none",
      "rhr": "higher|lower",
      "energy": "higher|lower"
    }
  },
  "acknowledgment": "Natural, conversational response confirming understanding"
}

## Follow-Up Examples:

User: "Can you check back with me in a few days, review my HRV and sleep and let me know if these saunas are having an effect?"
→ {
  "follow_up": {
    "intent_summary": "Check if saunas are improving HRV and sleep quality",
    "metrics": ["hrv", "sleep_quality"],
    "days_until_check": 3,
    "comparison_baseline": "before_saunas"
  },
  "acknowledgment": "Got it, I'll check your HRV and sleep in a few days and let you know if those saunas are helping."
}

User: "remind me to look at my recovery scores next week"
→ {
  "follow_up": {
    "intent_summary": "Review recovery scores",
    "metrics": ["recovery"],
    "days_until_check": 7
  },
  "acknowledgment": "I'll remind you next week to review your recovery scores."
}

User: "Is this ice bath routine working? Check in with me in 5 days"
→ {
  "follow_up": {
    "intent_summary": "Evaluate if ice bath routine is effective",
    "metrics": ["hrv", "recovery", "rhr"],
    "days_until_check": 5,
    "comparison_baseline": "before_activity"
  },
  "acknowledgment": "I'll check back in 5 days to see how those ice baths are affecting your metrics."
}

## Life Context Examples:

User: "I'm not going to be able to train for the next few days because I'm on a business trip"
→ {
  "life_context": {
    "category": "travel",
    "description": "Business trip - training paused",
    "end_date": "3 days from now",
    "expected_impact": {
      "training": "none",
      "sleep": "disrupted",
      "hrv": "lower"
    }
  },
  "acknowledgment": "Got it, I'll keep that in mind when looking at your data over the next few days."
}

User: "Pretty stressed at work lately, might affect my numbers"
→ {
  "life_context": {
    "category": "stress",
    "description": "High work stress period",
    "expected_impact": {
      "hrv": "lower",
      "sleep": "worse",
      "rhr": "higher"
    }
  },
  "acknowledgment": "Thanks for letting me know - I'll factor that in when reviewing your metrics."
}

User: "Just got back from vacation, dealing with jet lag"
→ {
  "life_context": {
    "category": "sleep_disruption",
    "description": "Jet lag from vacation",
    "expected_impact": {
      "sleep": "disrupted",
      "hrv": "variable",
      "energy": "lower"
    }
  },
  "acknowledgment": "Jet lag can definitely throw things off. I'll keep that in mind for the next few days."
}

User: "Started a new medication this week"
→ {
  "life_context": {
    "category": "medication",
    "description": "New medication started",
    "expected_impact": {
      "hrv": "variable"
    }
  },
  "acknowledgment": "Good to know - medications can affect your metrics. I'll watch for any patterns."
}

## Combined Example:

User: "I've been doing cold plunges every morning. I'm also traveling for work starting tomorrow for 4 days. Can you check in next week to see if the cold plunges are helping despite the travel?"
→ {
  "follow_up": {
    "intent_summary": "Check if cold plunges are helping despite travel impact",
    "metrics": ["hrv", "recovery"],
    "days_until_check": 7,
    "comparison_baseline": "before_activity"
  },
  "life_context": {
    "category": "travel",
    "description": "Work travel for 4 days",
    "start_date": "tomorrow",
    "end_date": "4 days from start",
    "expected_impact": {
      "training": "reduced",
      "sleep": "disrupted"
    }
  },
  "acknowledgment": "Got it! I'll note the travel period and check back next week to see how those cold plunges are working for you."
}

## Rules:
1. Only extract intents that are clearly expressed - don't infer too much
2. For dates, use relative terms like "tomorrow", "3 days from now", or ISO format if specific
3. Metrics should be: hrv, sleep_quality, rhr, recovery, energy, steps, training_load
4. If no intent is detected, return {}
5. Keep acknowledgments natural and conversational - like a friend would respond
`;

/**
 * Extract conversational intents using Gemini 2.5 Flash
 */
export async function extractConversationalIntents(
  message: string
): Promise<ConversationalIntentResult | null> {
  try {
    if (!geminiChatClient.isAvailable()) {
      logger.warn('[IntentParser] Gemini client not available');
      return null;
    }

    const response = await geminiChatClient.chat([
      { role: 'user', content: INTENT_EXTRACTION_PROMPT },
      { role: 'user', content: `User message: "${message}"\n\nExtract any follow-up requests or life context. Return JSON only.` },
    ]);

    logger.info('[IntentParser] Gemini response:', { 
      response: response.substring(0, 200) 
    });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.debug('[IntentParser] No JSON found in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // If empty object, no intents detected
    if (Object.keys(parsed).length === 0) {
      return null;
    }

    const result: ConversationalIntentResult = {};
    
    if (parsed.follow_up) {
      result.follow_up = {
        type: 'follow_up',
        intent_summary: parsed.follow_up.intent_summary,
        metrics: parsed.follow_up.metrics || [],
        days_until_check: parsed.follow_up.days_until_check || 3,
        comparison_baseline: parsed.follow_up.comparison_baseline,
        original_text: message,
      };
      logger.info('[IntentParser] Extracted follow-up intent:', result.follow_up);
    }
    
    if (parsed.life_context) {
      result.life_context = {
        type: 'life_context',
        category: parsed.life_context.category as LifeContextCategory,
        description: parsed.life_context.description,
        start_date: parseDateString(parsed.life_context.start_date),
        end_date: parseDateString(parsed.life_context.end_date),
        expected_impact: parsed.life_context.expected_impact,
        original_text: message,
      };
      logger.info('[IntentParser] Extracted life context:', result.life_context);
    }
    
    if (parsed.acknowledgment) {
      result.acknowledgment = parsed.acknowledgment;
    }

    return result;
  } catch (error: any) {
    logger.error('[IntentParser] Error extracting intents:', { 
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
}

/**
 * Parse relative date strings to ISO format
 */
function parseDateString(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  const lower = dateStr.toLowerCase();
  const today = new Date();
  
  // Handle relative dates
  if (lower === 'today') {
    return today.toISOString().split('T')[0];
  }
  if (lower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Handle "X days from now" or "X days from start"
  const daysMatch = lower.match(/(\d+)\s*days?\s*(?:from\s*(?:now|today|start))?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const future = new Date(today);
    future.setDate(future.getDate() + days);
    return future.toISOString().split('T')[0];
  }
  
  // Handle "next week"
  if (lower.includes('next week')) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }
  
  // If already ISO format, return as-is
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0];
  }
  
  // Return undefined if we can't parse
  return undefined;
}

/**
 * Main entry point: detect and extract intents from a message
 * Returns null if no intents found (to avoid unnecessary AI calls)
 */
export async function parseConversationalIntent(
  message: string
): Promise<ConversationalIntentResult | null> {
  // Quick pre-filter
  const { maybeFollowUp, maybeLifeContext } = couldContainConversationalIntent(message);
  
  if (!maybeFollowUp && !maybeLifeContext) {
    logger.debug('[IntentParser] No trigger words found, skipping AI call');
    return null;
  }
  
  // Extract intents using Gemini
  return extractConversationalIntents(message);
}
