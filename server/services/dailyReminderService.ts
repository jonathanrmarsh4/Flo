import { buildReminderContext, formatContextForGrok } from './reminderContextBuilder';
import { buildReminderPrompt, buildFallbackPrompt, validateReminderQuality } from './reminderPromptTemplate';
import { getSupabaseClient } from './supabaseClient';
import { logger } from '../logger';
import { trackOpenAICompletion } from './aiUsageTracker';

/**
 * Call Grok API to generate elite proactive daily reminder
 * Uses grok-beta model (latest from xAI)
 */
async function callGrokForReminder(systemPrompt: string, userPrompt: string, userId: string): Promise<string> {
  const xaiApiKey = process.env.XAI_API_KEY;
  if (!xaiApiKey) {
    throw new Error('XAI_API_KEY not configured');
  }

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${xaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-beta', // Use latest Grok model
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.65, // Balance between creativity and consistency
        max_tokens: 200, // Enforce brevity
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    // Track usage
    if (data.usage) {
      await trackOpenAICompletion(
        'chat',
        'grok-beta' as any,
        {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        {
          userId,
          latencyMs,
          status: 'success',
          metadata: { provider: 'grok' },
        }
      );
    }

    const reminderText = data.choices[0]?.message?.content?.trim() || '';
    
    if (!reminderText) {
      throw new Error('Grok returned empty response');
    }

    return reminderText;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    
    // Track error
    await trackOpenAICompletion(
      'chat',
      'grok-beta' as any,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      {
        userId,
        latencyMs,
        status: 'error',
        errorMessage: error.message,
        metadata: { provider: 'grok' },
      }
    ).catch(() => {});

    logger.error(`[DailyReminder] Grok API call failed for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculate schedule_at timestamp in user's local time
 * Determines the NEXT occurrence of reminderTime in user's timezone
 * Uses Intl.DateTimeFormat for accurate timezone conversion
 */
function calculateScheduleAtMs(reminderTime: string, reminderTimezone: string): number {
  try {
    // reminderTime format: "HH:MM" (24-hour)
    const [hours, minutes] = reminderTime.split(':').map(Number);
    
    // Get current UTC time
    const nowUtc = new Date();
    
    // Convert current UTC to user's timezone to get their local date/time components
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: reminderTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(nowUtc);
    const userLocalYear = parseInt(parts.find(p => p.type === 'year')!.value);
    const userLocalMonth = parseInt(parts.find(p => p.type === 'month')!.value) - 1; // 0-indexed
    const userLocalDay = parseInt(parts.find(p => p.type === 'day')!.value);
    const userLocalHour = parseInt(parts.find(p => p.type === 'hour')!.value);
    const userLocalMinute = parseInt(parts.find(p => p.type === 'minute')!.value);
    
    // Create a date for today at the user's preferred time (in UTC, representing user's local time)
    const todayAtReminderTime = new Date(Date.UTC(userLocalYear, userLocalMonth, userLocalDay, hours, minutes, 0, 0));
    
    // Adjust back to UTC by calculating the offset
    const testDate = new Date(Date.UTC(userLocalYear, userLocalMonth, userLocalDay, hours, minutes, 0, 0));
    const testFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: reminderTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const testParts = testFormatter.formatToParts(testDate);
    const testHour = parseInt(testParts.find(p => p.type === 'hour')!.value);
    const testMinute = parseInt(testParts.find(p => p.type === 'minute')!.value);
    
    // Calculate offset in minutes
    const desiredHour = hours;
    const desiredMinute = minutes;
    const offsetMinutes = (desiredHour - testHour) * 60 + (desiredMinute - testMinute);
    
    // Apply offset to get correct UTC timestamp
    const scheduleDate = new Date(todayAtReminderTime.getTime() + offsetMinutes * 60 * 1000);
    
    // Check if reminder time has already passed today in user's timezone
    const currentTimeInUserTz = userLocalHour * 60 + userLocalMinute;
    const reminderTimeInMinutes = hours * 60 + minutes;
    
    if (reminderTimeInMinutes <= currentTimeInUserTz) {
      // Reminder time has passed, schedule for tomorrow
      scheduleDate.setDate(scheduleDate.getDate() + 1);
    }
    
    return scheduleDate.getTime();
  } catch (error: any) {
    logger.error(`[DailyReminder] Failed to calculate schedule_at for time ${reminderTime}, timezone ${reminderTimezone}:`, error);
    // Fallback: schedule for 24 hours from now
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 24);
    return fallback.getTime();
  }
}

/**
 * Generate and queue daily reminder for a single user
 * 
 * Flow:
 * 1. Build clinical context from Neon views
 * 2. Format context into Grok prompt
 * 3. Call Grok API to generate reminder
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

    // Step 4: Call Grok API
    const reminderText = await callGrokForReminder(prompt.systemPrompt, prompt.userPrompt, userId);

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
