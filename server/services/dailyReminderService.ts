import { buildReminderContext, formatContextForGrok } from './reminderContextBuilder';
import { buildReminderPrompt, buildFallbackPrompt, validateReminderQuality } from './reminderPromptTemplate';
import { getSupabaseClient } from './supabaseClient';
import { logger } from '../logger';
import { trackGeminiUsage } from './aiUsageTracker';
import { Temporal } from '@js-temporal/polyfill';
import { GoogleGenAI } from '@google/genai';

// Lazy-initialized Gemini client to avoid module-load errors
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY not configured - cannot generate AI reminders');
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

/**
 * Call Gemini API to generate proactive daily reminder
 * Uses gemini-2.5-flash for speed and cost efficiency
 */
async function callGeminiForReminder(systemPrompt: string, userPrompt: string, userId: string): Promise<string> {
  const client = getGeminiClient();

  const startTime = Date.now();
  const modelName = 'gemini-2.5-flash';

  try {
    const result = await client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 300,
      },
    });

    const latencyMs = Date.now() - startTime;
    const reminderText = result.text?.trim() || '';
    
    // Track usage
    const usage = result.usageMetadata;
    if (usage) {
      await trackGeminiUsage(
        'daily_reminder',
        'gemini-2.5-flash',
        {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
        {
          userId,
          latencyMs,
          status: 'success',
          metadata: { provider: 'gemini' },
        }
      );
    }

    if (!reminderText) {
      throw new Error('Gemini returned empty response');
    }

    logger.info(`[DailyReminder] Gemini generated reminder for user ${userId}`, {
      latencyMs,
      responseLength: reminderText.length,
    });

    return reminderText;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    
    // Track error
    await trackGeminiUsage(
      'daily_reminder',
      'gemini-2.5-flash',
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      {
        userId,
        latencyMs,
        status: 'error',
        errorMessage: error.message,
        metadata: { provider: 'gemini' },
      }
    ).catch(() => {});

    logger.error(`[DailyReminder] Gemini API call failed for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculate schedule_at timestamp in user's local time
 * Determines the NEXT occurrence of reminderTime in user's timezone
 * Uses Temporal.ZonedDateTime for DST-safe timezone arithmetic
 */
function calculateScheduleAtMs(reminderTime: string, reminderTimezone: string): number {
  try {
    // reminderTime format: "HH:MM" (24-hour)
    const [hours, minutes] = reminderTime.split(':').map(Number);
    
    // Get current time as Temporal.ZonedDateTime in user's timezone
    const now = Temporal.Now.zonedDateTimeISO(reminderTimezone);
    
    // Create a ZonedDateTime for today at the user's reminder time
    const todayAtReminderTime = now.with({
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0
    });
    
    // Determine if we should schedule for today or tomorrow
    let scheduleDateTime: Temporal.ZonedDateTime;
    if (Temporal.ZonedDateTime.compare(todayAtReminderTime, now) > 0) {
      // Reminder time hasn't passed yet, schedule for today
      scheduleDateTime = todayAtReminderTime;
    } else {
      // Reminder time has passed, schedule for tomorrow at the same local time
      // add({ days: 1 }) respects DST transitions in the target zone
      scheduleDateTime = todayAtReminderTime.add({ days: 1 });
    }
    
    // Convert to UTC Instant, then to milliseconds timestamp
    return scheduleDateTime.toInstant().epochMilliseconds;
  } catch (error: any) {
    logger.error(`[DailyReminder] Failed to calculate schedule_at for time ${reminderTime}, timezone ${reminderTimezone}:`, error);
    // Fallback: schedule for 24 hours from now
    return Date.now() + (24 * 60 * 60 * 1000);
  }
}

/**
 * Generate and queue daily reminder for a single user
 * 
 * Flow:
 * 1. Build clinical context from Neon views (biomarkers, wearables, action plan, etc.)
 * 2. Format context into AI prompt
 * 3. Call Gemini 2.5 Flash to generate proactive reminder
 * 4. Validate reminder quality
 * 5. Insert into Supabase daily_reminders table
 * 6. Client listens via Realtime and schedules local notification
 */
export async function generateDailyReminder(
  userId: string,
  reminderTime: string,
  reminderTimezone: string
): Promise<{ success: boolean; reminder?: string; error?: string }> {
  try {
    logger.info(`[DailyReminder] Generating reminder for user ${userId} (time: ${reminderTime}, tz: ${reminderTimezone})`);

    // Step 0: Check 24h rate limit - enforce max 1 reminder per user per day
    const supabase = getSupabaseClient();
    const { data: recentReminders, error: checkError } = await supabase
      .from('daily_reminders')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (checkError) {
      logger.error(`[DailyReminder] Failed to check recent reminders for user ${userId}:`, checkError);
      // Continue anyway - better to send a duplicate than skip
    } else if (recentReminders && recentReminders.length > 0) {
      const lastReminderTime = new Date(recentReminders[0].created_at).toISOString();
      logger.info(`[DailyReminder] User ${userId} already received a reminder in the last 24h (at ${lastReminderTime}), skipping`);
      return { success: false, error: 'Rate limit: reminder already sent in last 24h' };
    }

    // Step 1: Build clinical context
    const context = await buildReminderContext(userId);
    
    // Step 2: Format context for Grok
    const formattedContext = formatContextForGrok(context);
    
    // Step 3: Determine if user has sufficient data
    const hasSufficientData = 
      context.biomarkers.length > 0 ||
      context.dexa !== null ||
      context.wearables !== null ||
      context.behaviors !== null ||
      context.training !== null;

    let prompt;
    if (hasSufficientData) {
      prompt = buildReminderPrompt(formattedContext);
    } else {
      logger.info(`[DailyReminder] User ${userId} has insufficient data, using fallback prompt`);
      prompt = buildFallbackPrompt();
    }

    // Step 4: Call Gemini API
    const reminderText = await callGeminiForReminder(prompt.systemPrompt, prompt.userPrompt, userId);

    // Step 5: Validate quality
    const validation = validateReminderQuality(reminderText);
    if (!validation.valid) {
      logger.warn(`[DailyReminder] Generated reminder failed validation for user ${userId}: ${validation.reason}`);
      // Don't fail entirely, just log the warning
    }

    // Step 6: Calculate schedule time
    const scheduleAtMs = calculateScheduleAtMs(reminderTime, reminderTimezone);

    // Step 6.5: Cleanup stale undelivered reminders (older than 48 hours)
    // This prevents accumulation while allowing time for delivery confirmation
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { error: deleteError } = await supabase
      .from('daily_reminders')
      .delete()
      .eq('user_id', userId)
      .eq('delivered', false)
      .lt('created_at', twoDaysAgo);
    
    if (deleteError) {
      logger.warn(`[DailyReminder] Failed to cleanup stale reminders for user ${userId}:`, deleteError);
      // Continue anyway - not critical
    }

    // Step 7: Insert into Supabase daily_reminders table (reuse supabase client)
    const { data, error } = await supabase
      .from('daily_reminders')
      .insert({
        user_id: userId,
        title: 'Flō Health Insight', // Static title for consistency
        body: reminderText,
        schedule_at_ms: scheduleAtMs,
        delivered: false,
      })
      .select()
      .single();

    if (error) {
      logger.error(`[DailyReminder] Failed to insert reminder into Supabase for user ${userId}:`, error);
      return { success: false, error: error.message };
    }

    logger.info(`[DailyReminder] Successfully generated and queued reminder for user ${userId} (scheduled for ${new Date(scheduleAtMs).toISOString()})`);
    
    return { success: true, reminder: reminderText };
  } catch (error: any) {
    logger.error(`[DailyReminder] Failed to generate reminder for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancel any undelivered reminders for a user
 * Used when user updates their reminder preferences or disables reminders
 */
export async function cancelPendingReminders(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('daily_reminders')
      .delete()
      .eq('user_id', userId)
      .eq('delivered', false);

    if (error) {
      logger.error(`[DailyReminder] Failed to cancel pending reminders for user ${userId}:`, error);
      throw error;
    }

    logger.info(`[DailyReminder] Cancelled pending reminders for user ${userId}`);
  } catch (error: any) {
    logger.error(`[DailyReminder] Error cancelling reminders for user ${userId}:`, error);
    throw error;
  }
}
