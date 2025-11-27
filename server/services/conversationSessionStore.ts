import { logger } from '../logger';
import { randomBytes } from 'crypto';

interface ConversationSession {
  conversationId: string;
  userId: string;
  agentId: string;
  createdAt: Date;
  expiresAt: Date;
}

interface TokenSession {
  token: string;
  userId: string;
  agentId: string;
  createdAt: Date;
  expiresAt: Date;
}

class ConversationSessionStore {
  private sessions: Map<string, ConversationSession>;
  private tokenSessions: Map<string, TokenSession>; // token → session
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.sessions = new Map();
    this.tokenSessions = new Map();
    
    // Clean up expired sessions every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  generateSessionToken(userId: string, agentId: string): string {
    const token = `flo_${randomBytes(32).toString('hex')}`;
    const now = new Date();
    
    const session: TokenSession = {
      token,
      userId,
      agentId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.TTL_MS),
    };
    
    this.tokenSessions.set(token, session);
    logger.info('[ConversationStore] Generated session token', { 
      tokenPrefix: token.substring(0, 12) + '...', 
      userId, 
      agentId 
    });
    
    return token;
  }

  getUserIdFromToken(token: string): string | null {
    const session = this.tokenSessions.get(token);
    
    if (!session) {
      logger.warn('[ConversationStore] Token not found', { 
        tokenPrefix: token?.substring(0, 12) + '...' 
      });
      return null;
    }

    if (new Date() > session.expiresAt) {
      logger.warn('[ConversationStore] Token expired', { 
        tokenPrefix: token.substring(0, 12) + '...', 
        userId: session.userId 
      });
      this.tokenSessions.delete(token);
      return null;
    }

    logger.info('[ConversationStore] Token validated', { 
      tokenPrefix: token.substring(0, 12) + '...', 
      userId: session.userId 
    });
    return session.userId;
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
    let cleanedSessions = 0;
    let cleanedTokens = 0;

    // Clean up conversation sessions
    const expiredIds: string[] = [];
    this.sessions.forEach((session, conversationId) => {
      if (now > session.expiresAt) {
        expiredIds.push(conversationId);
      }
    });

    expiredIds.forEach(id => {
      this.sessions.delete(id);
      cleanedSessions++;
    });

    // Clean up token sessions
    const expiredTokens: string[] = [];
    this.tokenSessions.forEach((session, token) => {
      if (now > session.expiresAt) {
        expiredTokens.push(token);
      }
    });

    expiredTokens.forEach(token => {
      this.tokenSessions.delete(token);
      cleanedTokens++;
    });

    if (cleanedSessions > 0 || cleanedTokens > 0) {
      logger.info('[ConversationStore] Cleaned up expired sessions', { 
        conversationSessions: cleanedSessions,
        tokenSessions: cleanedTokens
      });
    }
  }

  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => new Date() <= s.expiresAt).length,
    };
  }

  getMostRecentSession(): ConversationSession | null {
    const now = new Date();
    const activeSessions = Array.from(this.sessions.values()).filter(s => now <= s.expiresAt);
    
    if (activeSessions.length === 0) {
      return null;
    }
    
    // Sort by createdAt descending and get the most recent
    activeSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const mostRecent = activeSessions[0];
    
    logger.info('[ConversationStore] Found most recent session', { 
      conversationId: mostRecent.conversationId, 
      userId: mostRecent.userId,
      ageMs: now.getTime() - mostRecent.createdAt.getTime(),
      totalActiveSessions: activeSessions.length
    });

    return mostRecent;
  }
}

export const conversationSessionStore = new ConversationSessionStore();
