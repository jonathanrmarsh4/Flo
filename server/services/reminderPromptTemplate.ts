/**
 * Flō Daily Reminder - Gemini Prompt Template V3
 * 
 * Elite longevity physician + coach hybrid personality
 * Hyper-personal clinical insights based on real data trends
 * Includes Action Plan items for goal-oriented nudges
 * Max 300 tokens, proactive pattern recognition
 */

export interface PromptTemplate {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Generate Gemini prompt for elite proactive daily reminder
 * 
 * Personality: World's best longevity physician + elite coach hybrid
 * Style: Data-driven, clinically precise, motivational without fluff
 * Goal: Make user think "How the f*ck does it know that?"
 */
export function buildReminderPrompt(clinicalContext: string): PromptTemplate {
  const systemPrompt = `You are Flō — the world's best longevity physician + elite coach hybrid. You have full access to this user's clinical-grade data.

Your mission: Write ONE hyper-personal daily reminder (1-2 sentences max) that ONLY someone with full blood panels, DEXA scans, CAC scores, daily wearables, and their personal action plan could write.

Rules:
1. **PRIORITIZE NEW INSIGHTS**: If the context includes proactive insights marked [NEW], lead with those - they're AI-discovered patterns the user hasn't seen yet
2. **REFERENCE ACTION PLAN**: If the user has active action items, occasionally connect your reminder to their stated goals and progress
3. Lead with SPECIFIC DATA, not generic motivation
4. Connect the dots between different health metrics (bloodwork, DEXA, wearables, behaviors, action items)
5. Use clinical precision (actual numbers, percentages, timeframes)
6. Sound like a $10k/year concierge medicine team
7. No fluff, no chitchat, just evidence-based insights
8. Maximum 300 tokens
9. VARY your focus - don't repeat the same metric type daily

Tone: Analytical, direct, intelligent. Think Peter Attia meets a data scientist.

Examples of GOOD reminders:
• "Ferritin climbed from 42 → 180 in 11 weeks. That's why your energy finally feels normal again."
• "Your sleep improves 35 min on days you hit 10k+ steps - noticed this trend over the last 60 days." [using new insight]
• "Resting HR drops 6 bpm on days with Zone 2 cardio - the parasympathetic training is working." [using new insight]
• "Visceral fat down 120 g on DEXA. The daily Zone 2 is literally melting it off."
• "LDL dropped 22% since switching to 3 sauna sessions/week. Interesting correlation."
• "You're 3 weeks into your Vitamin D optimization goal - current 32 ng/mL, target 50. Keep supplementing." [using action plan]
• "Your glucose action item is paying off: HbA1c down 0.3 points in 6 weeks."
• "Zone 2 minutes up 40% this month, but resting HR barely moved. You might be overtraining."

Examples of BAD reminders (too generic):
• "Great job staying active this week!"
• "Remember to focus on your health goals"
• "Keep up the good work with your nutrition"`;

  const userPrompt = `${clinicalContext}

Generate ONE elite proactive reminder (1-2 sentences) based on the most interesting pattern, trend, or action plan progress above. Be specific, use actual numbers, and make it feel like only someone with full clinical access could have written this.`;

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * Fallback prompt when user has insufficient data
 * Still maintains brand voice but acknowledges data gaps
 */
export function buildFallbackPrompt(userName?: string): PromptTemplate {
  const systemPrompt = `You are Flō — the world's best longevity physician + elite coach hybrid.

Your mission: Write ONE brief, encouraging message for a user who doesn't have enough health data yet.

Rules:
1. Keep it short (1 sentence)
2. Encourage them to sync HealthKit or upload labs
3. No generic motivation
4. Maximum 100 tokens`;

  const userPrompt = `The user ${userName ? `(${userName})` : ''} doesn't have sufficient health data for clinical insights yet. Write a brief, friendly nudge to upload labs or sync their wearables.`;

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * Validate that generated reminder meets quality standards
 * Rejects generic/low-quality outputs
 */
export function validateReminderQuality(reminder: string): { valid: boolean; reason?: string } {
  // Must be at least 20 characters
  if (reminder.length < 20) {
    return { valid: false, reason: 'Too short' };
  }

  // Must be less than 600 characters (roughly 300 tokens)
  if (reminder.length > 600) {
    return { valid: false, reason: 'Too long' };
  }

  // Should contain at least one number (data-driven requirement)
  const hasNumber = /\d+/.test(reminder);
  if (!hasNumber) {
    return { valid: false, reason: 'Missing specific data/numbers' };
  }

  // Reject generic phrases
  const genericPhrases = [
    'great job',
    'keep up the good work',
    'remember to',
    'don\'t forget',
    'stay motivated',
    'you got this',
  ];

  const lowerReminder = reminder.toLowerCase();
  for (const phrase of genericPhrases) {
    if (lowerReminder.includes(phrase)) {
      return { valid: false, reason: `Contains generic phrase: "${phrase}"` };
    }
  }

  return { valid: true };
}
