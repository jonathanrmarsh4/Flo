import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { storage } from "../storage";
import { logger } from "../logger";
import { sendPasswordResetEmail } from "../services/emailService";
import {
  appleSignInSchema,
  googleSignInSchema,
  emailRegisterSchema,
  emailLoginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  type AppleSignIn,
  type GoogleSignIn,
  type EmailRegister,
  type EmailLogin,
  type PasswordResetRequest,
  type PasswordReset,
} from "@shared/schema";
import { fromError } from "zod-validation-error";

const router = Router();

// Helper function to generate JWT token for mobile authentication
function generateMobileAuthToken(userId: number | string): string {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required for JWT generation');
  }
  
  const payload = {
    sub: userId.toString(),
    iss: 'flo-health-app',
    aud: 'flo-mobile-client',
    type: 'mobile',
  };
  
  const secret = process.env.SESSION_SECRET;
  const expiresIn = '7d'; // 7 days to match session TTL
  
  return jwt.sign(payload, secret, { expiresIn });
}

// Apple Sign-In endpoint
router.post("/api/mobile/auth/apple", async (req, res) => {
  try {
    // Validate request body
    const body = appleSignInSchema.parse(req.body);
    
    // Verify Apple identity token using Apple's JWKS
    const JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
    
    let appleUserId: string;
    let email: string | undefined;
    let expiresAt: Date | undefined;
    
    try {
      const { payload } = await jwtVerify(body.identityToken, JWKS, {
        issuer: "https://appleid.apple.com",
        audience: process.env.APPLE_CLIENT_ID || "com.flo.healthapp",
      });
      
      appleUserId = payload.sub as string;
      email = payload.email as string | undefined;
      
      // Extract expiration timestamp from JWT and convert to Date
      if (payload.exp) {
        expiresAt = new Date(payload.exp * 1000); // Convert UNIX timestamp to Date
      }
    } catch (jwtError) {
      logger.error('Apple JWT verification failed', jwtError);
      return res.status(401).json({ error: "Invalid Apple identity token" });
    }
    
    // Use email from JWT payload if available, otherwise from request body
    const appleEmail = email || body.email;
    
    // First try to find by Apple provider
    let user = await storage.getUserByProvider("apple", appleUserId);
    
    // If not found via Apple, check if email exists
    if (!user && appleEmail) {
      const existingUser = await storage.getUserByEmail(appleEmail);
      if (existingUser) {
        // Email exists - link Apple to existing account
        await storage.upsertAuthProvider({
          userId: existingUser.id,
          provider: "apple",
          providerUserId: appleUserId,
          email: appleEmail,
          accessToken: null, // Apple SDK doesn't provide this
          refreshToken: null, // Apple SDK doesn't provide this
          expiresAt, // Store token expiration from JWT
          metadata: {
            authorizationCode: body.authorizationCode,
            identityToken: body.identityToken, // Store for verification
            user: body.user, // Apple user identifier
            givenName: body.givenName,
            familyName: body.familyName,
          },
        });
        user = existingUser;
      }
    }
    
    if (user) {
      // Existing user - check if suspended
      if (user.status === "suspended") {
        return res.status(403).json({ error: "Account suspended" });
      }
      
      // Update auth provider with complete token data
      await storage.upsertAuthProvider({
        userId: user.id,
        provider: "apple",
        providerUserId: appleUserId,
        email: appleEmail,
        accessToken: null, // Apple SDK doesn't provide this
        refreshToken: null, // Apple SDK doesn't provide this
        expiresAt, // Store token expiration from JWT
        metadata: {
          authorizationCode: body.authorizationCode,
          identityToken: body.identityToken, // Store for verification
          user: body.user, // Apple user identifier
          givenName: body.givenName,
          familyName: body.familyName,
        },
      });
    } else {
      // New user - create account
      user = await storage.upsertUser({
        email: appleEmail,
        firstName: body.givenName,
        lastName: body.familyName,
      });
      
      // Create auth provider record with complete token data
      await storage.upsertAuthProvider({
        userId: user.id,
        provider: "apple",
        providerUserId: appleUserId,
        email: appleEmail,
        accessToken: null, // Apple SDK doesn't provide this
        refreshToken: null, // Apple SDK doesn't provide this
        expiresAt, // Store token expiration from JWT
        metadata: {
          authorizationCode: body.authorizationCode,
          identityToken: body.identityToken, // Store for verification
          user: body.user, // Apple user identifier
          givenName: body.givenName,
          familyName: body.familyName,
        },
      });
      
      // Create profile for new user
      const existingProfile = await storage.getProfile(user.id);
      if (!existingProfile) {
        await storage.upsertProfile(user.id, {});
      }
    }
    
    // Generate JWT token for mobile authentication
    const token = generateMobileAuthToken(user.id);
    
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      token, // JWT token for mobile apps
      authenticated: true,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Apple sign-in error', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Google Sign-In endpoint
router.post("/api/mobile/auth/google", async (req, res) => {
  try {
    // Validate request body
    const body = googleSignInSchema.parse(req.body);
    
    // Verify Google ID token using Google's tokeninfo API
    const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${body.idToken}`;
    let tokenInfoResponse;
    
    try {
      tokenInfoResponse = await fetch(tokenInfoUrl);
    } catch (fetchError) {
      logger.error('Failed to reach Google tokeninfo API', fetchError);
      return res.status(503).json({ error: "Authentication service temporarily unavailable" });
    }
    
    if (!tokenInfoResponse.ok) {
      logger.warn('Google tokeninfo API returned error', { status: tokenInfoResponse.status });
      return res.status(401).json({ error: "Invalid Google ID token" });
    }
    
    const tokenInfo = await tokenInfoResponse.json();
    
    // Verify token audience matches our client ID
    const expectedAudience = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_IOS_CLIENT_ID;
    if (tokenInfo.aud !== expectedAudience && !tokenInfo.aud?.includes(expectedAudience || '')) {
      return res.status(401).json({ error: "Invalid token audience" });
    }
    
    const googleUserId = tokenInfo.sub || body.userId;
    const googleEmail = tokenInfo.email || body.email;
    
    // First try to find by Google provider
    let user = await storage.getUserByProvider("google", googleUserId);
    
    // If not found via Google, check if email exists
    if (!user && googleEmail) {
      const existingUser = await storage.getUserByEmail(googleEmail);
      if (existingUser) {
        // Email exists - link Google to existing account
        await storage.upsertAuthProvider({
          userId: existingUser.id,
          provider: "google",
          providerUserId: googleUserId,
          email: googleEmail,
          accessToken: body.accessToken,
          metadata: {
            givenName: body.givenName,
            familyName: body.familyName,
          },
        });
        user = existingUser;
      }
    }
    
    if (user) {
      // Existing user - check if suspended
      if (user.status === "suspended") {
        return res.status(403).json({ error: "Account suspended" });
      }
      
      // Update auth provider metadata
      await storage.upsertAuthProvider({
        userId: user.id,
        provider: "google",
        providerUserId: googleUserId,
        email: googleEmail,
        accessToken: body.accessToken,
        metadata: {
          givenName: body.givenName,
          familyName: body.familyName,
        },
      });
    } else {
      // New user - create account
      user = await storage.upsertUser({
        email: googleEmail,
        firstName: body.givenName,
        lastName: body.familyName,
      });
      
      // Create auth provider record
      await storage.upsertAuthProvider({
        userId: user.id,
        provider: "google",
        providerUserId: googleUserId,
        email: googleEmail,
        accessToken: body.accessToken,
        metadata: {
          givenName: body.givenName,
          familyName: body.familyName,
        },
      });
      
      // Create profile for new user
      const existingProfile = await storage.getProfile(user.id);
      if (!existingProfile) {
        await storage.upsertProfile(user.id, {});
      }
    }
    
    // Generate JWT token for mobile authentication
    const token = generateMobileAuthToken(user.id);
    
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      token, // JWT token for mobile apps
      authenticated: true,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Google sign-in error', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Email/Password registration endpoint
router.post("/api/mobile/auth/register", async (req, res) => {
  try {
    // Validate request body
    const body = emailRegisterSchema.parse(req.body);
    
    // Check if user exists
    const existingUser = await storage.getUserByEmail(body.email);
    
    if (existingUser) {
      // Check if user already has email/password credentials
      const existingCredentials = await storage.getUserCredentials(existingUser.id);
      if (existingCredentials) {
        // User has password - this is a true duplicate
        return res.status(409).json({ message: "Email already registered. Please log in." });
      }
      
      // User exists via OAuth but has no password - let them add one
      const hashedPassword = await bcrypt.hash(body.password, 10);
      await storage.createUserCredentials({
        userId: existingUser.id,
        passwordHash: hashedPassword,
      });
      
      // Create profile if missing
      const profile = await storage.getProfile(existingUser.id);
      if (!profile) {
        await storage.upsertProfile(existingUser.id, {});
      }
      
      // Create email provider link
      await storage.upsertAuthProvider({
        userId: existingUser.id,
        provider: "email",
        providerUserId: existingUser.email!,
        email: existingUser.email,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        metadata: null,
      });
      
      // Generate JWT token for mobile authentication
      const token = generateMobileAuthToken(existingUser.id);
      
      return res.json({ 
        user: {
          id: existingUser.id,
          email: existingUser.email,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          role: existingUser.role,
          status: existingUser.status,
        },
        token,
        authenticated: true,
      });
    }
    
    // No existing user - proceed with normal registration
    // Hash password with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(body.password, 10);
    
    // Create user account
    const user = await storage.upsertUser({
      email: body.email,
      firstName: body.firstName?.trim() || null,  // Store null if empty
      lastName: body.lastName?.trim() || null,
      role: "free",
      status: "active",
    });
    
    // Create user credentials
    await storage.createUserCredentials({
      userId: user.id,
      passwordHash,
    });
    
    // Create auth provider record (provider="email")
    await storage.upsertAuthProvider({
      userId: user.id,
      provider: "email",
      providerUserId: user.id,
      email: body.email,
    });
    
    // Create profile for new user
    const existingProfile = await storage.getProfile(user.id);
    if (!existingProfile) {
      await storage.upsertProfile(user.id, {});
    }
    
    // Generate JWT token for mobile authentication
    const token = generateMobileAuthToken(user.id);
    
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      token, // JWT token for mobile apps
      authenticated: true,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Email registration error', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Email/Password login endpoint
router.post("/api/mobile/auth/login", async (req, res) => {
  try {
    // Validate request body
    const body = emailLoginSchema.parse(req.body);
    
    // Get user by email
    const user = await storage.getUserByEmail(body.email);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    
    // Check if account is suspended
    if (user.status === "suspended") {
      return res.status(403).json({ message: "Account suspended. Please contact support." });
    }
    
    // Get user credentials
    const credentials = await storage.getUserCredentials(user.id);
    if (!credentials) {
      // User exists but has no password (OAuth user)
      return res.status(400).json({ error: "Please set a password first" });
    }
    
    // Validate password with bcrypt
    const isPasswordValid = await bcrypt.compare(body.password, credentials.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    // Update last login timestamp
    await storage.updateLastLoginAt(user.id);
    
    // Generate JWT token for mobile authentication
    const token = generateMobileAuthToken(user.id);
    
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      token, // JWT token for mobile apps
      authenticated: true,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Email login error', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Password reset request endpoint
router.post("/api/mobile/auth/request-reset", async (req, res) => {
  try {
    // Validate request body
    const body = passwordResetRequestSchema.parse(req.body);
    
    // Find user by email
    const user = await storage.getUserByEmail(body.email);
    
    if (user) {
      // Only create reset token if user exists and has credentials
      const credentials = await storage.getUserCredentials(user.id);
      
      if (credentials) {
        // Generate secure random token
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Hash the token for secure storage (we store the hash, send plain token in email)
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        // Set expiry to 1 hour from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);
        
        // Store hashed reset token
        await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);
        
        // Send password reset email with plain token (user clicks link with this)
        const emailSent = await sendPasswordResetEmail(user.email!, resetToken);
        if (!emailSent) {
          logger.warn('Failed to send password reset email, but token was created', { email: user.email });
        }
      }
    }
    
    // Always return success (don't reveal if email exists)
    res.json({ 
      success: true,
      message: "If an account exists with this email, you will receive password reset instructions.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Password reset request error', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Password reset endpoint
router.post("/api/mobile/auth/reset", async (req, res) => {
  try {
    // Validate request body
    const body = passwordResetSchema.parse(req.body);
    
    // Hash the incoming token to match against stored hash
    const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
    
    // Find user by valid reset token hash (not expired)
    const user = await storage.getUserByResetToken(tokenHash);
    
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    
    // Hash new password with bcrypt
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    
    // Update password and clear reset token (single-use: token is deleted)
    await storage.updatePasswordHash(user.id, passwordHash);
    
    logger.info('Password reset successful', { userId: user.id });
    
    res.json({ 
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Password reset error', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Set password endpoint (for OAuth users who want to add email/password auth)
router.post("/api/mobile/auth/set-password", async (req, res) => {
  try {
    // Check if user is authenticated (works for both session and JWT)
    if (!req.user || !(req.user as any).id) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    // Validate request body
    const body = z.object({
      password: z.string().min(8, "Password must be at least 8 characters"),
    }).parse(req.body);
    
    const userId = (req.user as any).id;
    
    // Check if user already has credentials
    const existingCredentials = await storage.getUserCredentials(userId);
    if (existingCredentials) {
      return res.status(400).json({ error: "Password already set. Use password reset if you need to change it." });
    }
    
    // Get user info
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(body.password, 10);
    
    // Create user credentials
    await storage.createUserCredentials({
      userId,
      passwordHash,
    });
    
    // Create auth provider record (provider="email")
    await storage.upsertAuthProvider({
      userId,
      provider: "email",
      providerUserId: userId,
      email: user.email!,
    });
    
    res.json({ 
      success: true,
      message: "Password has been set successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Set password error', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
