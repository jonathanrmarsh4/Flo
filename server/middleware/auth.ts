import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import * as client from "openid-client";
import { storage } from "../storage";
import { getOidcConfig } from "../replitAuth";

/**
 * Unified authentication middleware that supports both:
 * 1. JWT tokens (mobile apps via Authorization header)
 * 2. Session-based auth (web apps via Replit OIDC)
 * 
 * This middleware checks for JWT first, then falls back to session auth.
 * All protected API routes should use this middleware.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  // MOBILE AUTH: Check for JWT token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      if (!process.env.SESSION_SECRET) {
        console.error('[Auth] SESSION_SECRET is not configured');
        return res.status(500).json({ message: "Server configuration error" });
      }
      
      // Verify JWT with standard claims
      const decoded = jwt.verify(token, process.env.SESSION_SECRET, {
        issuer: 'flo-health-app',
        audience: 'flo-mobile-client',
      }) as any;
      
      // SECURITY: Only trust sub claim, fetch everything else from database
      const dbUser = await storage.getUser(decoded.sub);
      if (!dbUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check account status (prevent suspended accounts from accessing)
      if (dbUser.status !== 'active') {
        return res.status(403).json({ message: "Account suspended" });
      }
      
      // Attach complete user object to request (matching session auth structure)
      req.user = {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        role: dbUser.role,
        status: dbUser.status,
        // Mobile auth doesn't have OIDC claims, but include for compatibility
        claims: { sub: dbUser.id.toString() },
      } as any;
      
      return next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.error('[Auth] JWT verification failed:', error.message);
      } else if (error instanceof jwt.TokenExpiredError) {
        console.error('[Auth] JWT token expired');
      } else {
        console.error('[Auth] JWT error:', error);
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
  }
  
  // WEB AUTH: Fall back to session-based authentication (Replit OIDC)
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if token is still valid
  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // Token expired - try to refresh
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    
    // Update session with new tokens
    user.claims = tokenResponse.claims();
    user.access_token = tokenResponse.access_token;
    user.refresh_token = tokenResponse.refresh_token;
    user.expires_at = user.claims?.exp;
    
    // Persist refreshed tokens to session
    req.login(user, (err) => {
      if (err) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      return next();
    });
  } catch (error) {
    console.error('[Auth] Token refresh failed:', error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
