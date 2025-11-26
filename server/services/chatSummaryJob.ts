import { db } from '../db';
import { users, floChatMessages } from '@shared/schema';
import { eq, and, gte, lt } from 'drizzle-orm';
import { subDays, startOfDay, format } from 'date-fns';
import OpenAI from 'openai';
import { writeInsightIfNotDuplicate } from './brainService';
import { logger } from '../logger';
import { trackOpenAICompletion } from './aiUsageTracker';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ChatTranscript {
  sender: 'user' | 'flo';
  message: string;
  createdAt: Date;
}

interface SummaryInsight {
  text: string;
  tags: string[];
  importance: number;
}

export async function runChatSummaryJob(): Promise<{ usersProcessed: number; insightsCreated: number }> {
  logger.info('[ChatSummaryJob] Starting nightly chat summary job');
  
  const startTime = Date.now();
  let usersProcessed = 0;
  let insightsCreated = 0;

  try {
    const yesterday = startOfDay(subDays(new Date(), 1));
    const today = startOfDay(new Date());

    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.status, 'active'));

    logger.info(`[ChatSummaryJob] Found ${activeUsers.length} active users to process`);

    for (const user of activeUsers) {
      try {
        const result = await processUserChatSummary(user.id, yesterday, today);
        if (result.processed) {
          usersProcessed++;
          insightsCreated += result.insightsCreated;
        }
      } catch (err) {
        logger.error(`[ChatSummaryJob] Failed to process user ${user.id}:`, err);
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info(`[ChatSummaryJob] Completed in ${durationMs}ms: ${usersProcessed} users processed, ${insightsCreated} insights created`);

    return { usersProcessed, insightsCreated };
  } catch (err) {
    logger.error('[ChatSummaryJob] Job failed:', err);
    throw err;
  }
}

async function processUserChatSummary(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ processed: boolean; insightsCreated: number }> {
  const messages = await db
    .select({
      sender: floChatMessages.sender,
      message: floChatMessages.message,
      createdAt: floChatMessages.createdAt,
    })
    .from(floChatMessages)
    .where(
      and(
        eq(floChatMessages.userId, userId),
        gte(floChatMessages.createdAt, startDate),
        lt(floChatMessages.createdAt, endDate)
      )
    )
    .orderBy(floChatMessages.createdAt);

  if (messages.length < 4) {
    logger.debug(`[ChatSummaryJob] User ${userId} has insufficient messages (${messages.length}), skipping`);
    return { processed: false, insightsCreated: 0 };
  }

  logger.info(`[ChatSummaryJob] Processing ${messages.length} messages for user ${userId}`);

  const transcript = messages
    .map(m => `[${m.sender.toUpperCase()}]: ${m.message}`)
    .join('\n\n');

  const insights = await extractInsightsFromTranscript(userId, transcript);

  let persistedCount = 0;
  for (const insight of insights) {
    try {
      const id = await writeInsightIfNotDuplicate(userId, insight.text, {
        source: 'chat_summary_job',
        tags: insight.tags,
        importance: insight.importance,
        similarityThreshold: 0.90,
      });
      
      if (id) {
        persistedCount++;
        logger.debug(`[ChatSummaryJob] Created insight for user ${userId}: "${insight.text.substring(0, 50)}..."`);
      }
    } catch (err) {
      logger.error(`[ChatSummaryJob] Failed to persist insight:`, err);
    }
  }

  logger.info(`[ChatSummaryJob] User ${userId}: extracted ${insights.length} insights, persisted ${persistedCount}`);
  
  return { processed: true, insightsCreated: persistedCount };
}

async function extractInsightsFromTranscript(
  userId: string,
  transcript: string
): Promise<SummaryInsight[]> {
  const startTime = Date.now();
  
  try {
    const systemPrompt = `You are an expert health analyst reviewing a conversation between a user and their AI health assistant (Flō Oracle). Your task is to extract valuable insights that should be remembered for future conversations.

Extract 0-5 insights from this conversation. Only extract insights that are:
1. Specific to this user (not generic health advice)
2. Actionable or contextually important for future conversations
3. Based on concrete information shared (goals, concerns, discoveries, patterns)

For each insight, provide:
- text: A clear, concise statement (1-2 sentences max)
- tags: 1-3 lowercase keywords for categorization
- importance: 1-5 scale (1=minor, 3=standard, 5=critical)

Return a JSON array of insights. If no valuable insights exist, return an empty array [].

Example output:
[
  {"text": "User is focused on improving sleep quality before their upcoming triathlon in March", "tags": ["sleep", "training", "goal"], "importance": 4},
  {"text": "User experiences energy crashes around 2-3pm and suspects it's related to lunch timing", "tags": ["energy", "nutrition", "pattern"], "importance": 3}
]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is yesterday's conversation transcript:\n\n${transcript}\n\nExtract valuable insights as a JSON array:` }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;

    if (response.usage) {
      await trackOpenAICompletion(
        'chat_summary',
        'gpt-4o-mini' as any,
        {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        },
        {
          userId,
          latencyMs,
          status: 'success',
        }
      ).catch(() => {});
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.warn('[ChatSummaryJob] Empty response from GPT');
      return [];
    }

    const parsed = JSON.parse(content);
    
    const insights: SummaryInsight[] = [];
    const rawInsights = parsed.insights || parsed;
    
    if (Array.isArray(rawInsights)) {
      for (const item of rawInsights) {
        if (item.text && typeof item.text === 'string') {
          insights.push({
            text: item.text.trim(),
            tags: Array.isArray(item.tags) 
              ? item.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.toLowerCase())
              : [],
            importance: typeof item.importance === 'number' 
              ? Math.min(5, Math.max(1, Math.round(item.importance)))
              : 3,
          });
        }
      }
    }

    return insights;
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    
    await trackOpenAICompletion(
      'chat_summary',
      'gpt-4o-mini' as any,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      {
        userId,
        latencyMs,
        status: 'error',
        errorMessage: err.message,
      }
    ).catch(() => {});
    
    logger.error('[ChatSummaryJob] Failed to extract insights:', err);
    return [];
  }
}

export async function scheduleChatSummaryJob(): Promise<void> {
  const cron = await import('node-cron');
  
  cron.schedule('0 4 * * *', async () => {
    logger.info('[ChatSummaryJob] Scheduled job triggered at 4 AM UTC');
    try {
      await runChatSummaryJob();
    } catch (err) {
      logger.error('[ChatSummaryJob] Scheduled job failed:', err);
    }
  });
  
  logger.info('[ChatSummaryJob] Scheduled daily at 4 AM UTC');
}
