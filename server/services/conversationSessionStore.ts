import { logger } from '../logger';

interface ConversationSession {
  conversationId: string;
  userId: string;
  agentId: string;
  createdAt: Date;
  expiresAt: Date;
}

class ConversationSessionStore {
  private sessions: Map<string, ConversationSession>;
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.sessions = new Map();
    
    // Clean up expired sessions every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  create(conversationId: string, userId: string, agentId: string): void {
    const now = new Date();
    const session: ConversationSession = {
      conversationId,
      userId,
      agentId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.TTL_MS),
    };

    this.sessions.set(conversationId, session);
    logger.info('[ConversationStore] Created session', { conversationId, userId, agentId });
  }

  getUserId(conversationId: string): string | null {
    const session = this.sessions.get(conversationId);
    
    if (!session) {
      logger.warn('[ConversationStore] Session not found', { conversationId });
      return null;
    }

    if (new Date() > session.expiresAt) {
      logger.warn('[ConversationStore] Session expired', { conversationId, userId: session.userId });
      this.sessions.delete(conversationId);
      return null;
    }

    return session.userId;
  }

  delete(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      logger.info('[ConversationStore] Deleted session', { conversationId, userId: session.userId });
      this.sessions.delete(conversationId);
    }
  }

  private cleanup(): void {
    const now = new Date();
    let cleaned = 0;

    const expiredIds: string[] = [];
    this.sessions.forEach((session, conversationId) => {
      if (now > session.expiresAt) {
        expiredIds.push(conversationId);
      }
    });

    expiredIds.forEach(id => {
      this.sessions.delete(id);
      cleaned++;
    });

    if (cleaned > 0) {
      logger.info('[ConversationStore] Cleaned up expired sessions', { count: cleaned });
    }
  }

  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => new Date() <= s.expiresAt).length,
    };
  }
}

export const conversationSessionStore = new ConversationSessionStore();
