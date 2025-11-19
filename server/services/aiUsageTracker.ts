import { db } from "../db";
import { openaiUsageEvents } from "../../shared/schema";
import { logger } from "../logger";

/**
 * AI Usage Tracker Service
 * 
 * Centralized service for tracking AI API usage and costs across:
 * - OpenAI (GPT-4o, GPT-5, text-embedding-3-small)
 * - Grok (grok-3-mini, grok-4)
 * 
 * Automatically calculates costs based on current pricing and logs to database
 */

// Pricing per 1M tokens (as of Nov 2024)
const PRICING = {
  // OpenAI Models
  'gpt-4o': {
    provider: 'openai',
    input: 2.50,  // $2.50 per 1M input tokens
    output: 10.00, // $10.00 per 1M output tokens
  },
  'gpt-5': {
    provider: 'openai',
    input: 5.00,  // Estimated pricing
    output: 20.00,
  },
  'text-embedding-3-small': {
    provider: 'openai',
    input: 0.02,  // $0.02 per 1M tokens
    output: 0,    // Embeddings don't have output tokens
  },
  
  // Grok Models (xAI)
  'grok-3-mini': {
    provider: 'grok',
    input: 0.15,  // $0.15 per 1M input tokens
    output: 0.60, // $0.60 per 1M output tokens
  },
  'grok-4': {
    provider: 'grok',
    input: 2.00,  // Estimated pricing
    output: 8.00,
  },
  'grok-4-fast': {
    provider: 'grok',
    input: 1.00,
    output: 4.00,
  },
} as const;

type ModelName = keyof typeof PRICING;

interface UsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface TrackUsageParams {
  userId?: string;
  endpoint: string;
  model: ModelName;
  usage: UsageMetrics;
  latencyMs?: number;
  status?: 'success' | 'error';
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Calculate cost for API usage based on model and token counts
 */
function calculateCost(model: ModelName, usage: UsageMetrics): number {
  const pricing = PRICING[model];
  if (!pricing) {
    logger.warn(`[AIUsageTracker] Unknown model pricing: ${model}, using zero cost`);
    return 0;
  }

  // Cost = (input_tokens / 1M * input_price) + (output_tokens / 1M * output_price)
  const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Track an AI API usage event
 * 
 * @param params - Usage tracking parameters
 * @returns Promise that resolves when event is logged
 */
export async function trackAIUsage(params: TrackUsageParams): Promise<void> {
  const {
    userId,
    endpoint,
    model,
    usage,
    latencyMs,
    status = 'success',
    errorMessage,
    metadata,
  } = params;

  try {
    const cost = calculateCost(model, usage);
    const provider = PRICING[model]?.provider || 'unknown';

    logger.info(`[AIUsageTracker] Logging ${provider} usage: ${model} - ${usage.totalTokens} tokens ($${cost.toFixed(4)})`);

    await db.insert(openaiUsageEvents).values({
      userId: userId || null,
      endpoint,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cost,
      latencyMs: latencyMs || null,
      status,
      errorMessage: errorMessage || null,
      metadata: metadata || null,
    });

    logger.debug(`[AIUsageTracker] Successfully logged ${provider} usage event`);
  } catch (error: any) {
    // Don't throw - we don't want usage tracking failures to break the actual API call
    logger.error('[AIUsageTracker] Failed to log AI usage:', {
      error: error.message,
      model,
      endpoint,
    });
  }
}

/**
 * Convenience wrapper for tracking OpenAI completions
 */
export async function trackOpenAICompletion(
  endpoint: string,
  model: ModelName,
  usage: UsageMetrics,
  options?: {
    userId?: string;
    latencyMs?: number;
    status?: 'success' | 'error';
    errorMessage?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  return trackAIUsage({
    endpoint,
    model,
    usage,
    ...options,
  });
}

/**
 * Convenience wrapper for tracking Grok chat
 */
export async function trackGrokChat(
  endpoint: string,
  model: ModelName,
  usage: UsageMetrics,
  options?: {
    userId?: string;
    latencyMs?: number;
    status?: 'success' | 'error';
    errorMessage?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  return trackAIUsage({
    endpoint,
    model,
    usage,
    ...options,
  });
}

/**
 * Get provider name from model
 */
export function getProviderForModel(model: string): 'openai' | 'grok' | 'unknown' {
  if (model in PRICING) {
    return PRICING[model as ModelName].provider as 'openai' | 'grok';
  }
  return 'unknown';
}
