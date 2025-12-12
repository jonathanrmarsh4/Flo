// Reference: javascript_log_in_with_replit blueprint
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import jwt from "jsonwebtoken";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { logger } from "./logger";

export const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  const user = await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
  return user;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const user: any = {};
      updateUserSession(user, tokens);
      logger.debug('Attempting to upsert user with OIDC claims', { claims: tokens.claims() });
      const dbUser = await upsertUser(tokens.claims());
      logger.debug('User upserted successfully', { userId: dbUser.id });
      user.role = dbUser.role;
      user.status = dbUser.status;
      user.id = dbUser.id;
      verified(null, user);
    } catch (error) {
      logger.error('Error in OIDC verify callback', error);
      verified(error as Error);
    }
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => {
    const sessionUser: any = user;
    // Serialize user ID plus OIDC token metadata
    cb(null, {
      id: sessionUser.id,
      access_token: sessionUser.access_token,
      refresh_token: sessionUser.refresh_token,
      expires_at: sessionUser.expires_at,
      claims: sessionUser.claims,
    });
  });
  
  passport.deserializeUser(async (sessionData: any, cb) => {
    try {
      // Fetch fresh user data from DB (gets latest role/status)
      const dbUser = await storage.getUser(sessionData.id);
      if (!dbUser) {
        return cb(new Error('User not found'));
      }
      
      // Merge fresh DB data with session token metadata
      const user: any = {
        ...dbUser,
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
        expires_at: sessionData.expires_at,
        claims: sessionData.claims,
      };
      
      return cb(null, user);
    } catch (error) {
      return cb(error);
    }
  });

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // First, check for JWT token in Authorization header (mobile authentication)
  const authHeader = req.headers.authorization;
  
  // DEBUG: Log auth header presence for troubleshooting iOS 401 issues
  if (req.path.includes('/tiles/why')) {
    logger.info('[AuthDebug] Why endpoint auth check', {
      path: req.path,
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 15),
      hasSession: !!req.isAuthenticated?.(),
    });
  }
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      // Guard against missing SESSION_SECRET
      if (!process.env.SESSION_SECRET) {
        logger.error('SESSION_SECRET is not configured for JWT verification');
        return res.status(500).json({ message: "Server configuration error" });
      }
      
      const secret = process.env.SESSION_SECRET;
      
      // Verify JWT with standard claims
      const decoded = jwt.verify(token, secret, {
        issuer: 'flo-health-app',
        audience: 'flo-mobile-client',
      }) as any;
      
      // SECURITY: Only trust sub claim, fetch everything else from database
      const dbUser = await storage.getUser(decoded.sub);
      if (!dbUser) {
        logger.warn('JWT authentication failed: user not found', { userId: decoded.sub });
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check account status
      if (dbUser.status !== 'active') {
        logger.warn('JWT authentication failed: inactive account', { userId: decoded.sub, status: dbUser.status });
        return res.status(401).json({ message: "Account suspended" });
      }
      
      // Check token version - invalidate token if password was changed
      const tokenVersion = decoded.ver ?? 0;
      if (tokenVersion !== dbUser.tokenVersion) {
        logger.warn('JWT authentication failed: token version mismatch (password changed)', { 
          userId: decoded.sub, 
          tokenVersion, 
          dbTokenVersion: dbUser.tokenVersion 
        });
        return res.status(401).json({ message: "Session expired. Please log in again." });
      }
      
      // Attach complete user object to request (matching session auth structure)
      req.user = {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        role: dbUser.role,
        status: dbUser.status,
        // Mobile auth doesn't have OIDC claims, but include empty object for compatibility
        claims: { sub: dbUser.id },
      } as any;
      
      return next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('JWT verification failed', { error: error.message });
      } else if (error instanceof jwt.TokenExpiredError) {
        logger.info('JWT token expired');
      } else {
        logger.error('JWT authentication error', error);
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
  }
  
  // Fall back to session-based authentication (web/Replit Auth)
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    
    // Persist refreshed tokens to session
    req.login(user, (err) => {
      if (err) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      return next();
    });
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
