import OpenAI from 'openai';
import { getSupabaseClient } from './supabaseClient';
import { logger } from '../logger';
import { trackOpenAICompletion } from './aiUsageTracker';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;

export interface EmbeddingInput {
  userId: string;
  contentType: 'blood_work' | 'healthkit_daily' | 'insight_card' | 'sleep_night';
  content: string;
  metadata: Record<string, any>;
}

/**
 * Generate embedding vector for text content using OpenAI
 */
export async function generateEmbedding(text: string, userId?: string): Promise<number[]> {
  const startTime = Date.now();
  
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });

    const latencyMs = Date.now() - startTime;

    // Track usage
    if (response.usage) {
      await trackOpenAICompletion(
        'embedding',
        EMBEDDING_MODEL as any,
        {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: 0,
          totalTokens: response.usage.total_tokens,
        },
        {
          userId,
          latencyMs,
          status: 'success',
        }
      );
    }

    return response.data[0].embedding;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    
    // Track error
    await trackOpenAICompletion(
      'embedding',
      EMBEDDING_MODEL as any,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      {
        userId,
        latencyMs,
        status: 'error',
        errorMessage: error.message,
      }
    ).catch(() => {});
    
    logger.error('[EmbeddingService] Failed to generate embedding:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Store health data embedding in Supabase vector DB
 */
export async function storeEmbedding(input: EmbeddingInput): Promise<string> {
  try {
    const supabase = getSupabaseClient();
    
    // Generate embedding vector (pass userId for tracking)
    const embedding = await generateEmbedding(input.content, input.userId);

    // Insert into Supabase with vector
    const { data, error } = await supabase
      .from('health_embeddings')
      .insert({
        user_id: input.userId,
        content_type: input.contentType,
        content: input.content,
        metadata: input.metadata,
        embedding,
      })
      .select('id')
      .single();

    if (error) {
      logger.error('[EmbeddingService] Failed to store embedding:', error);
      throw new Error(`Failed to store embedding: ${error.message}`);
    }

    logger.info(`[EmbeddingService] Stored ${input.contentType} embedding for user ${input.userId}`);
    return data.id;
  } catch (error: any) {
    logger.error('[EmbeddingService] Store embedding error:', error);
    throw error;
  }
}

/**
 * Search for similar health data using RAG
 */
export async function searchSimilarContent(
  userId: string,
  query: string,
  limit: number = 5,
  contentTypes?: string[]
): Promise<Array<{
  id: string;
  contentType: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}>> {
  try {
    const supabase = getSupabaseClient();
    
    // Generate embedding for the search query (pass userId for tracking)
    const queryEmbedding = await generateEmbedding(query, userId);

    // Build the RPC call for vector similarity search
    let rpcQuery = supabase.rpc('match_health_embeddings', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: limit,
    });

    const { data, error } = await rpcQuery;

    if (error) {
      logger.error('[EmbeddingService] Similarity search error:', error);
      throw new Error(`Similarity search failed: ${error.message}`);
    }

    logger.info(`[EmbeddingService] Found ${data?.length || 0} similar items for query: "${query.substring(0, 50)}..."`);
    
    return (data || []).map((row: any) => ({
      id: row.id,
      contentType: row.content_type,
      content: row.content,
      metadata: row.metadata,
      similarity: row.similarity,
    }));
  } catch (error: any) {
    logger.error('[EmbeddingService] Search similar content error:', error);
    throw error;
  }
}

/**
 * Batch sync blood work data to embeddings
 */
export async function syncBloodWorkEmbeddings(userId: string, bloodWorkData: any[]): Promise<number> {
  let count = 0;
  
  for (const bw of bloodWorkData) {
    try {
      // Create readable text representation
      const biomarkerSummary = bw.biomarkers
        ?.map((b: any) => `${b.name}: ${b.value} ${b.unit}`)
        .join(', ') || 'No biomarkers';
      
      const content = `Blood work from ${bw.testDate}: ${biomarkerSummary}`;
      
      await storeEmbedding({
        userId,
        contentType: 'blood_work',
        content,
        metadata: {
          bloodWorkId: bw.id,
          testDate: bw.testDate,
          biomarkerCount: bw.biomarkers?.length || 0,
        },
      });
      
      count++;
    } catch (error) {
      logger.error(`[EmbeddingService] Failed to sync blood work ${bw.id}:`, error);
    }
  }
  
  logger.info(`[EmbeddingService] Synced ${count}/${bloodWorkData.length} blood work embeddings for user ${userId}`);
  return count;
}

/**
 * Batch sync HealthKit daily metrics to embeddings
 */
export async function syncHealthKitEmbeddings(userId: string, dailyMetrics: any[]): Promise<number> {
  let count = 0;
  
  for (const metric of dailyMetrics) {
    try {
      const content = `HealthKit data for ${metric.localDate}: ${metric.stepsRawSum || 0} steps, ${
        metric.sleepHours ? `${metric.sleepHours}h sleep` : 'no sleep data'
      }, ${metric.exerciseMinutes || 0} min exercise, HRV ${metric.hrvMs || 'N/A'}ms, resting HR ${metric.restingHrBpm || 'N/A'} bpm`;
      
      await storeEmbedding({
        userId,
        contentType: 'healthkit_daily',
        content,
        metadata: {
          date: metric.localDate,
          steps: metric.stepsRawSum,
          sleepHours: metric.sleepHours,
          exerciseMinutes: metric.exerciseMinutes,
          hrv: metric.hrvMs,
          restingHr: metric.restingHrBpm,
        },
      });
      
      count++;
    } catch (error) {
      logger.error(`[EmbeddingService] Failed to sync HealthKit for ${metric.localDate}:`, error);
    }
  }
  
  logger.info(`[EmbeddingService] Synced ${count}/${dailyMetrics.length} HealthKit embeddings for user ${userId}`);
  return count;
}
