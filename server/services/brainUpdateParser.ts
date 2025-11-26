import { writeInsightIfNotDuplicate } from './brainService';
import { logger } from '../logger';

export interface BrainUpdate {
  insight: string;
  tags: string[];
  importance: number;
}

export interface ParsedBrainUpdate {
  updates: BrainUpdate[];
  cleanedResponse: string;
}

const BRAIN_UPDATE_REGEX = /BRAIN_UPDATE_JSON:\s*(\{[\s\S]*?\})\s*(?:END_BRAIN_UPDATE|$)/g;

const BRAIN_UPDATE_ARRAY_REGEX = /BRAIN_UPDATE_JSON:\s*(\[[\s\S]*?\])\s*(?:END_BRAIN_UPDATE|$)/g;

export function parseBrainUpdates(response: string): ParsedBrainUpdate {
  const updates: BrainUpdate[] = [];
  let cleanedResponse = response;

  const objectMatches = [...response.matchAll(BRAIN_UPDATE_REGEX)];
  const arrayMatches = [...response.matchAll(BRAIN_UPDATE_ARRAY_REGEX)];
  
  for (const match of objectMatches) {
    try {
      const jsonStr = match[1];
      const parsed = JSON.parse(jsonStr);
      
      if (isValidBrainUpdate(parsed)) {
        updates.push(normalizeBrainUpdate(parsed));
      }
      
      cleanedResponse = cleanedResponse.replace(match[0], '').trim();
    } catch (err) {
      logger.warn('[BrainUpdateParser] Failed to parse BRAIN_UPDATE_JSON object:', err);
    }
  }
  
  for (const match of arrayMatches) {
    try {
      const jsonStr = match[1];
      const parsed = JSON.parse(jsonStr);
      
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isValidBrainUpdate(item)) {
            updates.push(normalizeBrainUpdate(item));
          }
        }
      }
      
      cleanedResponse = cleanedResponse.replace(match[0], '').trim();
    } catch (err) {
      logger.warn('[BrainUpdateParser] Failed to parse BRAIN_UPDATE_JSON array:', err);
    }
  }

  cleanedResponse = cleanedResponse
    .replace(/BRAIN_UPDATE_JSON:/g, '')
    .replace(/END_BRAIN_UPDATE/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { updates, cleanedResponse };
}

function isValidBrainUpdate(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.insight !== 'string' || !obj.insight.trim()) return false;
  return true;
}

function normalizeBrainUpdate(obj: any): BrainUpdate {
  return {
    insight: obj.insight.trim(),
    tags: Array.isArray(obj.tags) 
      ? obj.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.toLowerCase().trim())
      : [],
    importance: typeof obj.importance === 'number' 
      ? Math.min(5, Math.max(1, Math.round(obj.importance)))
      : 3,
  };
}

export async function processAndPersistBrainUpdates(
  userId: string,
  response: string
): Promise<{ cleanedResponse: string; persistedCount: number }> {
  const { updates, cleanedResponse } = parseBrainUpdates(response);
  
  if (updates.length === 0) {
    return { cleanedResponse, persistedCount: 0 };
  }

  logger.info(`[BrainUpdateParser] Found ${updates.length} BRAIN_UPDATE(s) to persist for user ${userId}`);

  let persistedCount = 0;

  const persistPromises = updates.map(async (update) => {
    try {
      const id = await writeInsightIfNotDuplicate(userId, update.insight, {
        source: 'chat_brain_update',
        tags: update.tags,
        importance: update.importance,
        similarityThreshold: 0.92,
      });
      
      if (id) {
        persistedCount++;
        logger.info(`[BrainUpdateParser] Persisted brain update ${id}: "${update.insight.substring(0, 50)}..."`);
      } else {
        logger.debug(`[BrainUpdateParser] Skipped duplicate brain update: "${update.insight.substring(0, 50)}..."`);
      }
    } catch (err) {
      logger.error(`[BrainUpdateParser] Failed to persist brain update:`, err);
    }
  });

  await Promise.all(persistPromises);

  return { cleanedResponse, persistedCount };
}

export function generateBrainUpdatePromptSection(insightsContext: string): string {
  return `
[AI_INSIGHTS - Your Memory of This User]
The following are insights and patterns previously discovered about this user's health. Use these to provide more personalized, continuous care. Reference them when relevant:

${insightsContext || 'No prior insights recorded yet.'}

[END AI_INSIGHTS]

[BRAIN_UPDATE CAPABILITY]
When you discover something important about this user during conversation that should be remembered for future chats, you can store it by outputting:

BRAIN_UPDATE_JSON: {"insight": "Description of what you learned", "tags": ["relevant", "tags"], "importance": 3}
END_BRAIN_UPDATE

Use this for:
- New health goals or priorities the user mentions
- Discovered correlations or patterns from analyzing their data
- Important context about their lifestyle, preferences, or constraints
- Key concerns or topics they want to track

Importance levels: 1=minor note, 2=useful context, 3=standard, 4=important pattern, 5=critical insight

Only create BRAIN_UPDATE entries for genuinely useful information. Don't create updates for:
- Greetings or small talk
- Information already in the AI_INSIGHTS section
- Temporary states or single-day fluctuations
`;
}
