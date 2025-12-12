import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import { logger } from '../utils/logger';

const supabase = getSupabaseClient();

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  return date.toLocaleDateString();
}

export interface MemoryPayload {
  type: 'goal_set' | 'goal_update' | 'symptom' | 'mood_report' | 'habit' | 'personal_interest' | 'life_context' | 'preference' | 'relationship' | 'health_observation' | 'biomarker_concern' | 'medical_condition' | 'medication' | 'health_discussion' | 'topic_suppression';
  raw: string;
  extracted: Record<string, any>;
  importance?: 'low' | 'medium' | 'high';
  linked_to?: string[];
}

export interface UserMemory {
  id?: string;
  health_id: string;
  session_id?: string | null;
  occurred_at?: Date | string;
  memory: MemoryPayload;
  tags?: string[];
  embedding?: number[] | null;
  created_at?: Date | string;
}

export async function getUserMemories(
  userId: string,
  options: {
    limit?: number;
    tags?: string[];
    since?: Date;
    importance?: 'low' | 'medium' | 'high';
  } = {}
): Promise<UserMemory[]> {
  const { limit = 25, tags, since, importance } = options;
  
  try {
    const healthId = await getHealthId(userId);
    
    let query = supabase
      .from('user_memory')
      .select('*')
      .eq('health_id', healthId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    
    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }
    
    if (since) {
      query = query.gte('occurred_at', since.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) {
      logger.error('[UserMemory] Error fetching memories:', error);
      throw error;
    }
    
    if (importance && data) {
      return data.filter(m => m.memory?.importance === importance);
    }
    
    return data || [];
  } catch (error) {
    logger.error('[UserMemory] Error getting memories:', error);
    return [];
  }
}

export async function getMemoriesAsContext(
  userId: string,
  limit: number = 25
): Promise<string> {
  try {
    const memories = await getUserMemories(userId, { limit });
    
    if (!memories.length) return '';
    
    const bullets = memories.map(row => {
      const m = row.memory;
      const typeLabel = m.type?.replace(/_/g, ' ') || 'memory';
      const rawText = m.raw || JSON.stringify(m.extracted);
      const importance = m.importance ? ` [${m.importance}]` : '';
      const timeAgo = getRelativeTime(new Date(row.occurred_at as string));
      
      return `- [${typeLabel}${importance}] (${timeAgo}): ${rawText}`;
    });
    
    return `Past context about this user (most recent first):\n${bullets.join('\n')}`;
  } catch (error) {
    logger.error('[UserMemory] Error building context:', error);
    return '';
  }
}

export async function storeMemory(
  userId: string,
  memory: MemoryPayload,
  options: {
    sessionId?: string;
    occurredAt?: Date;
    tags?: string[];
  } = {}
): Promise<UserMemory | null> {
  try {
    const healthId = await getHealthId(userId);
    
    const { data, error } = await supabase
      .from('user_memory')
      .insert({
        health_id: healthId,
        session_id: options.sessionId || null,
        occurred_at: (options.occurredAt || new Date()).toISOString(),
        memory,
        tags: options.tags || extractTagsFromMemory(memory),
      })
      .select()
      .single();
    
    if (error) {
      logger.error('[UserMemory] Error storing memory:', error);
      throw error;
    }
    
    logger.info(`[UserMemory] Stored memory for user ${userId}: ${memory.type}`);
    return data;
  } catch (error) {
    logger.error('[UserMemory] Error storing memory:', error);
    return null;
  }
}

export async function storeMultipleMemories(
  userId: string,
  memories: MemoryPayload[],
  sessionId?: string
): Promise<number> {
  try {
    const healthId = await getHealthId(userId);
    
    const rows = memories.map(memory => ({
      health_id: healthId,
      session_id: sessionId || null,
      occurred_at: new Date().toISOString(),
      memory,
      tags: extractTagsFromMemory(memory),
    }));
    
    const { data, error } = await supabase
      .from('user_memory')
      .insert(rows)
      .select();
    
    if (error) {
      logger.error('[UserMemory] Error storing multiple memories:', error);
      throw error;
    }
    
    logger.info(`[UserMemory] Stored ${data?.length || 0} memories for user ${userId}`);
    return data?.length || 0;
  } catch (error) {
    logger.error('[UserMemory] Error storing memories:', error);
    return 0;
  }
}

export async function deleteUserMemories(userId: string): Promise<boolean> {
  try {
    const healthId = await getHealthId(userId);
    
    const { error } = await supabase
      .from('user_memory')
      .delete()
      .eq('health_id', healthId);
    
    if (error) {
      logger.error('[UserMemory] Error deleting memories:', error);
      throw error;
    }
    
    logger.info(`[UserMemory] Deleted all memories for user ${userId}`);
    return true;
  } catch (error) {
    logger.error('[UserMemory] Error deleting memories:', error);
    return false;
  }
}

export async function getMemoryCount(userId: string): Promise<number> {
  try {
    const healthId = await getHealthId(userId);
    
    const { count, error } = await supabase
      .from('user_memory')
      .select('*', { count: 'exact', head: true })
      .eq('health_id', healthId);
    
    if (error) {
      logger.error('[UserMemory] Error counting memories:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    logger.error('[UserMemory] Error counting memories:', error);
    return 0;
  }
}

function extractTagsFromMemory(memory: MemoryPayload): string[] {
  const tags: string[] = [];
  
  if (memory.type) {
    tags.push(memory.type.replace(/_/g, '-'));
  }
  
  if (memory.type === 'goal_set' || memory.type === 'goal_update') {
    tags.push('goal');
  }
  if (memory.type === 'mood_report') {
    tags.push('mental-health', 'mood');
  }
  if (memory.type === 'symptom') {
    tags.push('health', 'symptom');
  }
  if (memory.type === 'habit') {
    tags.push('habit', 'behavior');
  }
  if (memory.type === 'life_context') {
    tags.push('personal-life', 'context');
  }
  if (memory.type === 'personal_interest') {
    tags.push('interest', 'wellbeing');
  }
  if (memory.type === 'biomarker_concern') {
    tags.push('health', 'biomarker', 'medical');
  }
  if (memory.type === 'medical_condition') {
    tags.push('health', 'medical', 'condition');
  }
  if (memory.type === 'medication') {
    tags.push('health', 'medication', 'treatment');
  }
  if (memory.type === 'health_discussion') {
    tags.push('health', 'discussion');
  }
  if (memory.type === 'topic_suppression') {
    tags.push('suppression', 'do-not-mention', 'preference');
  }
  
  if (memory.importance === 'high') {
    tags.push('important');
  }
  
  if (memory.linked_to && memory.linked_to.length > 0) {
    memory.linked_to.forEach(link => tags.push(link.toLowerCase().replace(/\s/g, '-')));
  }
  
  return Array.from(new Set(tags));
}

/**
 * Get all topic suppressions for a user
 * These are explicit "don't mention X" instructions from past conversations
 */
export async function getSuppressedTopics(userId: string): Promise<UserMemory[]> {
  try {
    const healthId = await getHealthId(userId);
    
    const { data, error } = await supabase
      .from('user_memory')
      .select('*')
      .eq('health_id', healthId)
      .eq('memory->>type', 'topic_suppression')
      .order('occurred_at', { ascending: false });
    
    if (error) {
      logger.error('[UserMemory] Error fetching suppressed topics:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    logger.error('[UserMemory] Error getting suppressed topics:', error);
    return [];
  }
}

/**
 * Format suppressed topics as a clear context string for AI
 */
export async function getSuppressedTopicsContext(userId: string): Promise<string> {
  try {
    const suppressions = await getSuppressedTopics(userId);
    
    // Log whether we found suppressions - critical for debugging anti-repetition
    logger.info('[UserMemory] getSuppressedTopicsContext called', { 
      userId, 
      suppressionCount: suppressions.length,
      hasSuppressions: suppressions.length > 0
    });
    
    if (!suppressions.length) {
      logger.info('[UserMemory] No suppressed topics found for user', { userId });
      return '';
    }
    
    const lines = suppressions.map(row => {
      const m = row.memory;
      const topic = m.extracted?.topic || m.extracted?.biomarker || m.raw;
      const reason = m.extracted?.reason || 'user requested';
      return `- ${topic} (${reason})`;
    });
    
    // Log exactly what we're suppressing
    logger.info('[UserMemory] Suppressed topics being added to context', { 
      userId, 
      topics: lines,
      count: lines.length 
    });
    
    return `\n\n🚫 SUPPRESSED TOPICS - DO NOT MENTION THESE:\n${lines.join('\n')}\n[User has explicitly asked you to NOT bring up these topics unless they ask first]`;
  } catch (error) {
    logger.error('[UserMemory] Error building suppressed topics context:', error);
    return '';
  }
}

/**
 * Directly detect and store a topic suppression from user text
 * This is a backup mechanism that runs immediately (not waiting for GPT extraction)
 */
export async function detectAndStoreSuppression(userId: string, userText: string): Promise<boolean> {
  const lowerText = userText.toLowerCase();
  
  // Patterns that indicate user wants to suppress a topic
  const suppressionPatterns = [
    /don'?t\s+(mention|bring up|talk about|discuss|remind me about)\s+(.+?)(?:\s+again|\s+anymore|$)/i,
    /stop\s+(mentioning|bringing up|talking about|discussing)\s+(.+?)(?:\s+again|\s+anymore|$)/i,
    /i\s+(don'?t\s+want\s+to\s+hear\s+about|know\s+about)\s+(.+?)(?:\s+again|\s+anymore|$)/i,
    /(?:i'?m\s+)?(?:already\s+)?(?:seeing\s+a\s+doctor|have\s+an\s+appointment)\s+(?:about|for)\s+(.+)/i,
    /(?:that'?s?|it'?s?)\s+under\s+control[\s,]+(?:no\s+need\s+to\s+mention|don'?t\s+bring\s+up)\s+(.+)/i,
    /please?\s+(?:stop|don'?t)\s+(?:mentioning|bringing up)\s+(.+)/i,
  ];
  
  for (const pattern of suppressionPatterns) {
    const match = userText.match(pattern);
    if (match) {
      // Extract the topic from the match
      const topic = match[match.length - 1]?.trim() || match[1]?.trim();
      
      if (topic && topic.length > 2 && topic.length < 100) {
        logger.info('[UserMemory] Direct suppression detected!', { 
          userId, 
          topic, 
          matchedPattern: pattern.source,
          originalText: userText.substring(0, 100)
        });
        
        try {
          // Check for duplicate - don't store if same topic already suppressed
          const existingSuppressions = await getSuppressedTopics(userId);
          const normalizedTopic = topic.toLowerCase().trim();
          const alreadyExists = existingSuppressions.some(s => {
            const existingTopic = (s.memory?.extracted?.topic || s.memory?.raw || '').toLowerCase().trim();
            return existingTopic === normalizedTopic || existingTopic.includes(normalizedTopic) || normalizedTopic.includes(existingTopic);
          });
          
          if (alreadyExists) {
            logger.info('[UserMemory] Suppression already exists, skipping duplicate', { userId, topic });
            return true; // Still return true - topic IS suppressed
          }
          
          const memory: MemoryPayload = {
            type: 'topic_suppression',
            raw: userText.substring(0, 500),
            extracted: {
              topic: topic,
              reason: 'user explicitly requested',
              detectedAt: new Date().toISOString(),
            },
            importance: 'high',
          };
          
          await storeMemory(userId, memory);
          logger.info('[UserMemory] Suppression stored successfully', { userId, topic });
          return true;
        } catch (error) {
          logger.error('[UserMemory] Failed to store suppression:', error);
        }
      }
    }
  }
  
  return false;
}
