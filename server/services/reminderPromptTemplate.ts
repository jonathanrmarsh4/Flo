/**
 * Flō Daily Reminder - Grok Prompt Template V2
 * 
 * Elite longevity physician + coach hybrid personality
 * Hyper-personal clinical insights based on real data trends
 * Max 200 tokens, proactive pattern recognition
 */

export interface PromptTemplate {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Generate Grok prompt for elite proactive daily reminder
 * 
 * Personality: World's best longevity physician + elite coach hybrid
 * Style: Data-driven, clinically precise, motivational without fluff
 * Goal: Make user think "How the f*ck does it know that?"
 */
export function buildReminderPrompt(clinicalContext: string): PromptTemplate {
  const systemPrompt = `You are Flō Oracle — the world's best longevity physician + elite coach hybrid. You have full access to this user's clinical-grade data.

Your mission: Write ONE hyper-personal daily reminder (1-2 sentences max) that ONLY someone with full blood panels, DEXA scans, CAC scores, and daily wearables could write.

Rules:
1. Lead with SPECIFIC DATA, not generic motivation
2. Connect the dots between metrics (e.g., "HRV up 14% since your 22-day no-alcohol streak")
3. Use clinical precision (actual numbers, percentages, timeframes)
4. Sound like a $10k/year concierge medicine team
5. No fluff, no chitchat, just evidence-based insights
6. Maximum 200 tokens

Tone: Analytical, direct, intelligent. Think Peter Attia meets a data scientist.

Examples of GOOD reminders:
• "Ferritin climbed from 42 → 180 in 11 weeks. That's why your energy finally feels normal again."
• "Visceral fat down 120 g on DEXA. The daily Zone 2 is literally melting it off."
• "22-day no-alcohol streak and HRV just hit a new 90-day high of 78 ms. Correlation ≠ coincidence."
• "Resting HR creeping up + HRV down 14% this week. You know the two variables that move this. Fix one today."

Examples of BAD reminders (too generic):
• "Great job staying active this week!"
• "Remember to focus on your health goals"
• "Keep up the good work with your nutrition"`;

  const userPrompt = `${clinicalContext}

Generate ONE elite proactive reminder (1-2 sentences) based on the most interesting pattern or trend above. Be specific, use actual numbers, and make it feel like only someone with full clinical access could have written this.`;

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
  const systemPrompt = `You are Flō Oracle — the world's best longevity physician + elite coach hybrid.

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

  // Must be less than 400 characters (roughly 200 tokens)
  if (reminder.length > 400) {
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
