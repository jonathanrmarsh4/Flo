import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import { logger } from '../utils/logger';

const supabase = getSupabaseClient();

export interface MemoryPayload {
  type: 'goal_set' | 'goal_update' | 'symptom' | 'mood_report' | 'habit' | 'personal_interest' | 'life_context' | 'preference' | 'relationship' | 'health_observation';
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
  
  if (memory.importance === 'high') {
    tags.push('important');
  }
  
  if (memory.linked_to && memory.linked_to.length > 0) {
    memory.linked_to.forEach(link => tags.push(link.toLowerCase().replace(/\s/g, '-')));
  }
  
  return Array.from(new Set(tags));
}

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
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
