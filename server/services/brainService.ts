import { db } from "../db";
import { userInsights, floChatMessages, type InsertUserInsight, type UserInsight, type InsertFloChatMessage } from "@shared/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { getSupabaseClient } from "./supabaseClient";
import { generateEmbedding } from "./embeddingService";
import { logger } from "../logger";

type InsightSource = "gpt_insights_job" | "chat_brain_update" | "chat_summary_job" | "manual" | "medical_document";

export interface BrainInsight {
  id: string;
  text: string;
  tags: string[];
  importance: number;
  source: InsightSource;
  createdAt: Date;
  similarity?: number;
}

export interface HybridRetrievalResult {
  recentInsights: BrainInsight[];
  semanticInsights: BrainInsight[];
  merged: BrainInsight[];
}

export async function writeInsightToBrain(
  userId: string,
  text: string,
  options: {
    source: InsightSource;
    tags?: string[];
    importance?: number;
  }
): Promise<string> {
  const insertData: InsertUserInsight = {
    userId,
    text,
    source: options.source,
    tags: options.tags || [],
    importance: options.importance || 3,
    status: "active",
  };

  const [inserted] = await db
    .insert(userInsights)
    .values(insertData)
    .returning({ id: userInsights.id });

  storeInsightEmbeddingAsync(inserted.id, userId, text, insertData).catch((err) => {
    logger.error(`[BrainService] Failed to store embedding for insight ${inserted.id}:`, err);
  });

  logger.info(`[BrainService] Wrote insight ${inserted.id} from ${options.source} for user ${userId}`);
  return inserted.id;
}

async function storeInsightEmbeddingAsync(
  insightId: string,
  userId: string,
  text: string,
  data: InsertUserInsight
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const embedding = await generateEmbedding(text, userId);

    const { error } = await supabase
      .from("user_insights_embeddings")
      .upsert({
        insight_id: insightId,
        user_id: userId,
        text: text,
        tags: data.tags || [],
        importance: data.importance || 3,
        source: data.source,
        embedding,
      }, {
        onConflict: "insight_id",
      });

    if (error) {
      logger.error(`[BrainService] Supabase upsert error for insight ${insightId}:`, error);
      throw error;
    }

    logger.debug(`[BrainService] Stored embedding for insight ${insightId}`);
  } catch (err) {
    logger.error(`[BrainService] Error storing insight embedding:`, err);
    throw err;
  }
}

export async function getRecentInsights(
  userId: string,
  limit: number = 10
): Promise<BrainInsight[]> {
  const rows = await db
    .select()
    .from(userInsights)
    .where(and(
      eq(userInsights.userId, userId),
      eq(userInsights.status, "active")
    ))
    .orderBy(desc(userInsights.createdAt))
    .limit(limit);

  return rows.map(mapRowToBrainInsight);
}

export async function searchInsightsBySimilarity(
  userId: string,
  query: string,
  limit: number = 5,
  minImportance: number = 1
): Promise<BrainInsight[]> {
  try {
    const supabase = getSupabaseClient();
    const queryEmbedding = await generateEmbedding(query, userId);

    const { data, error } = await supabase.rpc("match_user_insights", {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: limit,
      min_importance: minImportance,
    });

    if (error) {
      logger.error("[BrainService] Similarity search error:", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.insight_id,
      text: row.text,
      tags: row.tags || [],
      importance: row.importance,
      source: row.source as InsightSource,
      createdAt: new Date(row.created_at),
      similarity: row.similarity,
    }));
  } catch (err) {
    logger.error("[BrainService] Error in similarity search:", err);
    return [];
  }
}

export async function getHybridInsights(
  userId: string,
  query: string,
  options: {
    recentLimit?: number;
    semanticLimit?: number;
    minImportance?: number;
  } = {}
): Promise<HybridRetrievalResult> {
  const {
    recentLimit = 10,
    semanticLimit = 5,
    minImportance = 1,
  } = options;

  const [recentInsights, semanticInsights] = await Promise.all([
    getRecentInsights(userId, recentLimit),
    searchInsightsBySimilarity(userId, query, semanticLimit, minImportance),
  ]);

  const seenIds = new Set<string>();
  const merged: BrainInsight[] = [];

  for (const insight of semanticInsights) {
    if (!seenIds.has(insight.id)) {
      seenIds.add(insight.id);
      merged.push(insight);
    }
  }

  for (const insight of recentInsights) {
    if (!seenIds.has(insight.id)) {
      seenIds.add(insight.id);
      merged.push(insight);
    }
  }

  return {
    recentInsights,
    semanticInsights,
    merged,
  };
}

export async function writeBatchInsightsToBrain(
  userId: string,
  insights: Array<{
    text: string;
    tags?: string[];
    importance?: number;
  }>,
  source: InsightSource
): Promise<string[]> {
  const ids: string[] = [];

  for (const insight of insights) {
    try {
      const id = await writeInsightToBrain(userId, insight.text, {
        source,
        tags: insight.tags,
        importance: insight.importance,
      });
      ids.push(id);
    } catch (err) {
      logger.error(`[BrainService] Failed to write batch insight:`, err);
    }
  }

  return ids;
}

export async function updateInsightStatus(
  insightId: string,
  status: "active" | "resolved" | "dismissed"
): Promise<void> {
  await db
    .update(userInsights)
    .set({ 
      status,
      updatedAt: new Date(),
    })
    .where(eq(userInsights.id, insightId));

  logger.info(`[BrainService] Updated insight ${insightId} status to ${status}`);
}

export async function saveChatMessage(
  userId: string,
  sender: "user" | "flo",
  message: string,
  sessionId?: string
): Promise<string> {
  const insertData: InsertFloChatMessage = {
    userId,
    sender,
    message,
    sessionId,
  };

  const [inserted] = await db
    .insert(floChatMessages)
    .values(insertData)
    .returning({ id: floChatMessages.id });

  return inserted.id;
}

export async function getRecentChatMessages(
  userId: string,
  limit: number = 50,
  since?: Date
): Promise<Array<{ id: string; sender: "user" | "flo"; message: string; createdAt: Date }>> {
  let query = db
    .select()
    .from(floChatMessages)
    .where(
      since
        ? and(
            eq(floChatMessages.userId, userId),
            sql`${floChatMessages.createdAt} >= ${since}`
          )
        : eq(floChatMessages.userId, userId)
    )
    .orderBy(desc(floChatMessages.createdAt))
    .limit(limit);

  const rows = await query;

  return rows.map((row) => ({
    id: row.id,
    sender: row.sender as "user" | "flo",
    message: row.message,
    createdAt: row.createdAt,
  }));
}

export async function checkDuplicateInsight(
  userId: string,
  text: string,
  similarityThreshold: number = 0.92
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const embedding = await generateEmbedding(text, userId);

    const { data, error } = await supabase.rpc("match_user_insights", {
      query_embedding: embedding,
      match_user_id: userId,
      match_count: 1,
      min_importance: 1,
    });

    if (error) {
      logger.error("[BrainService] Duplicate check error:", error);
      return false;
    }

    if (data && data.length > 0 && data[0].similarity >= similarityThreshold) {
      logger.debug(`[BrainService] Found duplicate insight with similarity ${data[0].similarity}`);
      return true;
    }

    return false;
  } catch (err) {
    logger.error("[BrainService] Error checking duplicate:", err);
    return false;
  }
}

export async function writeInsightIfNotDuplicate(
  userId: string,
  text: string,
  options: {
    source: InsightSource;
    tags?: string[];
    importance?: number;
    similarityThreshold?: number;
  }
): Promise<string | null> {
  const isDuplicate = await checkDuplicateInsight(
    userId,
    text,
    options.similarityThreshold || 0.92
  );

  if (isDuplicate) {
    logger.info(`[BrainService] Skipping duplicate insight for user ${userId}`);
    return null;
  }

  return writeInsightToBrain(userId, text, options);
}

function mapRowToBrainInsight(row: UserInsight): BrainInsight {
  return {
    id: row.id,
    text: row.text,
    tags: row.tags || [],
    importance: row.importance,
    source: row.source as InsightSource,
    createdAt: row.createdAt,
  };
}

export function formatInsightsForChat(insights: BrainInsight[]): string {
  if (insights.length === 0) {
    return "No prior insights available.";
  }

  return insights
    .map((insight, idx) => {
      const importanceLabel = 
        insight.importance >= 4 ? "[HIGH]" :
        insight.importance >= 3 ? "[MED]" :
        "[LOW]";
      
      const tagsStr = insight.tags.length > 0 ? ` (${insight.tags.join(", ")})` : "";
      const dateStr = insight.createdAt.toLocaleDateString();
      
      return `${idx + 1}. ${importanceLabel} ${insight.text}${tagsStr} [${dateStr}]`;
    })
    .join("\n");
}
