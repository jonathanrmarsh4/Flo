import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { storage } from "../storage";
import { logger } from "../logger";
import { isAuthenticated } from "../replitAuth";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/emailService";
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
    
    let isNewUser = false;
    
    if (user) {
      // Existing user - check if suspended or pending approval
      if (user.status === "suspended") {
        return res.status(403).json({ error: "Account suspended" });
      }
      if (user.status === "pending_approval") {
        return res.status(403).json({ 
          error: "Account pending approval",
          message: "Your account is awaiting approval. You'll receive an email once approved.",
          status: "pending_approval"
        });
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
      // New user - create account with pending_approval status
      isNewUser = true;
      user = await storage.upsertUser({
        email: appleEmail,
        firstName: body.givenName,
        lastName: body.familyName,
        status: "pending_approval",
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
    
    // For new users with pending_approval, return success but no token
    if (isNewUser) {
      return res.json({ 
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
        },
        authenticated: false,
        message: "Registration successful! Your account is pending approval. You'll receive an email once approved.",
        status: "pending_approval"
      });
    }
    
    // Generate JWT token for mobile authentication (existing approved users only)
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
    
    let isNewUser = false;
    
    if (user) {
      // Existing user - check if suspended or pending approval
      if (user.status === "suspended") {
        return res.status(403).json({ error: "Account suspended" });
      }
      if (user.status === "pending_approval") {
        return res.status(403).json({ 
          error: "Account pending approval",
          message: "Your account is awaiting approval. You'll receive an email once approved.",
          status: "pending_approval"
        });
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
      // New user - create account with pending_approval status
      isNewUser = true;
      user = await storage.upsertUser({
        email: googleEmail,
        firstName: body.givenName,
        lastName: body.familyName,
        status: "pending_approval",
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
    
    // For new users with pending_approval, return success but no token
    if (isNewUser) {
      return res.json({ 
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
        },
        authenticated: false,
        message: "Registration successful! Your account is pending approval. You'll receive an email once approved.",
        status: "pending_approval"
      });
    }
    
    // Generate JWT token for mobile authentication (existing approved users only)
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
    
    // Generate verification token (24 hour expiry)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const verificationExpiresAt = new Date();
    verificationExpiresAt.setHours(verificationExpiresAt.getHours() + 24);
    
    logger.info('Verification token generated for registration', { 
      email: body.email,
      tokenLength: verificationToken.length,
      hashPrefix: verificationTokenHash.substring(0, 8),
      expiresAt: verificationExpiresAt.toISOString()
    });
    
    // Create user account with pending_verification status
    const user = await storage.upsertUser({
      email: body.email,
      firstName: body.firstName?.trim() || null,
      lastName: body.lastName?.trim() || null,
      role: "free",
      status: "pending_approval", // Will be set to "active" on email verification
    });
    
    // Create user credentials with verification token
    await storage.createUserCredentials({
      userId: user.id,
      passwordHash,
      verificationToken: verificationTokenHash,
      verificationTokenExpiresAt: verificationExpiresAt,
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
    
    // Send verification email with plain token (user clicks link with this)
    const emailSent = await sendVerificationEmail(body.email, verificationToken, body.firstName || undefined);
    if (!emailSent) {
      logger.warn('Failed to send verification email', { email: body.email });
    }
    
    // Return success - user needs to verify email
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      authenticated: false,
      message: "Registration successful! Please check your email to verify your account.",
      status: "pending_verification"
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
    
    // Check if account is pending approval
    if (user.status === "pending_approval") {
      return res.status(403).json({ 
        error: "Account pending approval",
        message: "Your account is awaiting approval. You'll receive an email once approved.",
        status: "pending_approval"
      });
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

// Email verification endpoint (frictionless flow)
router.post("/api/mobile/auth/verify-email", async (req, res) => {
  try {
    // Validate request body
    const body = z.object({
      token: z.string().min(1, "Verification token is required"),
    }).parse(req.body);
    
    logger.info('Email verification attempt', { tokenLength: body.token.length });
    
    // Hash the incoming token to match against stored hash
    const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
    
    logger.info('Token hash generated', { hashPrefix: tokenHash.substring(0, 8) });
    
    // Find user by valid verification token hash (not expired)
    const user = await storage.getUserByVerificationToken(tokenHash);
    
    if (!user) {
      logger.warn('Verification failed - no user found for token', { hashPrefix: tokenHash.substring(0, 8) });
      return res.status(400).json({ error: "Invalid or expired verification link" });
    }
    
    // Activate the user account
    await storage.upsertUser({
      email: user.email!,
      status: "active",
    });
    
    // Clear the verification token (single-use)
    await storage.clearVerificationToken(user.id);
    
    // Update last login time
    await storage.updateLastLoginAt(user.id);
    
    // Generate JWT token for immediate login
    const token = generateMobileAuthToken(user.id);
    
    logger.info('Email verification successful, user activated', { userId: user.id, email: user.email });
    
    res.json({ 
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: "active",
      },
      token, // JWT token for immediate login
      authenticated: true,
      message: "Email verified successfully! Welcome to Flō.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const validationError = fromError(error);
      return res.status(400).json({ error: validationError.toString() });
    }
    logger.error('Email verification error', error);
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

// ====== WebAuthn Passkey Routes ======

// WebAuthn Relying Party configuration
const rpName = "Flō";
const rpID = process.env.NODE_ENV === "production" ? "get-flo.com" : "localhost";
const origin = process.env.NODE_ENV === "production" 
  ? "https://get-flo.com" 
  : `http://localhost:5000`;

// In-memory challenge store (for a production app, use Redis or database)
// Challenges are keyed by a unique identifier (userId for registration, email for login)
const challengeStore = new Map<string, { challenge: string; expiresAt: number; type: 'registration' | 'authentication' }>();

function storeChallenge(key: string, challenge: string, type: 'registration' | 'authentication'): void {
  challengeStore.set(key, {
    challenge,
    expiresAt: Date.now() + 2 * 60 * 1000, // 2 minute expiry (shorter for security)
    type,
  });
}

function getAndDeleteChallenge(key: string, type: 'registration' | 'authentication'): string | null {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  
  // Always delete after retrieval (one-time use)
  challengeStore.delete(key);
  
  // Validate expiry
  if (Date.now() > entry.expiresAt) {
    return null;
  }
  
  // Validate type matches
  if (entry.type !== type) {
    return null;
  }
  
  return entry.challenge;
}

function deleteChallenge(key: string): void {
  challengeStore.delete(key);
}

// Generate passkey registration options (authenticated users only)
router.get("/api/mobile/auth/passkey/register-options", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get existing passkeys to exclude from registration
    const existingPasskeys = await storage.getPasskeysByUserId(userId);
    const excludeCredentials = existingPasskeys.map(pk => ({
      id: pk.credentialId, // Already base64url encoded string
      transports: pk.transports as ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[] | undefined,
    }));
    
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(userId),
      userName: user.email || `user-${userId}`,
      userDisplayName: user.firstName 
        ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` 
        : (user.email || 'Flō User'),
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', // Use platform authenticator (Face ID, Touch ID)
      },
    });
    
    // Store challenge for verification (keyed by userId for registration)
    storeChallenge(`reg:${userId}`, options.challenge, 'registration');
    
    res.json(options);
  } catch (error) {
    logger.error('Passkey registration options error', error);
    res.status(500).json({ error: "Failed to generate registration options" });
  }
});

// Verify passkey registration response
router.post("/api/mobile/auth/passkey/register", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    
    // Get and delete challenge in one atomic operation (one-time use)
    const expectedChallenge = getAndDeleteChallenge(`reg:${userId}`, 'registration');
    
    if (!expectedChallenge) {
      return res.status(400).json({ error: "Challenge expired or not found. Please try again." });
    }
    
    // Validate request body schema
    const bodySchema = z.object({
      response: z.any(),
      deviceName: z.string().optional(),
    });
    
    const { response, deviceName } = bodySchema.parse(req.body);
    
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    
    if (!verification.verified || !verification.registrationInfo) {
      // Challenge already deleted by getAndDeleteChallenge
      return res.status(400).json({ error: "Passkey registration failed" });
    }
    
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    
    // Store the passkey credential
    // Note: In SimpleWebAuthn v10+, credential.id is already a Base64URLString
    await storage.createPasskeyCredential({
      userId,
      credentialId: credential.id, // Already base64url encoded string
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: response.response?.transports || null,
      deviceName: deviceName || null,
    });
    
    // Challenge already deleted by getAndDeleteChallenge
    
    logger.info(`Passkey registered for user ${userId}`, { deviceType: credentialDeviceType });
    
    res.json({ 
      success: true, 
      message: "Passkey registered successfully",
      deviceType: credentialDeviceType,
    });
  } catch (error) {
    logger.error('Passkey registration error', error);
    res.status(500).json({ error: "Failed to register passkey" });
  }
});

// Generate passkey authentication options (for login)
// This endpoint supports discoverable credentials (passkeys stored on device)
router.post("/api/mobile/auth/passkey/login-options", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email().optional(),
    });
    
    const { email } = bodySchema.parse(req.body);
    
    let allowCredentials: { id: string; transports?: ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[] }[] = [];
    let userId: string | null = null;
    
    // If email provided, get user's passkeys to filter allowCredentials
    if (email) {
      const user = await storage.getUserByEmail(email);
      if (user) {
        userId = user.id;
        const passkeys = await storage.getPasskeysByUserId(user.id);
        allowCredentials = passkeys.map(pk => ({
          id: pk.credentialId, // Already base64url encoded string
          transports: pk.transports as ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[] | undefined,
        }));
        
        if (passkeys.length === 0) {
          return res.status(404).json({ error: "No passkeys found for this account" });
        }
      } else {
        return res.status(404).json({ error: "Account not found" });
      }
    }
    
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'preferred',
    });
    
    // Store challenge keyed by challenge itself (since we don't know user yet for discoverable credentials)
    // The challenge is a cryptographically random value that we'll look up during verification
    storeChallenge(`auth:${options.challenge}`, options.challenge, 'authentication');
    
    res.json({ ...options, userId });
  } catch (error) {
    logger.error('Passkey login options error', error);
    res.status(500).json({ error: "Failed to generate authentication options" });
  }
});

// Verify passkey authentication and login
router.post("/api/mobile/auth/passkey/login", async (req, res) => {
  try {
    const bodySchema = z.object({
      response: z.any(),
      challenge: z.string(), // The challenge from login-options response
    });
    
    const { response, challenge } = bodySchema.parse(req.body);
    
    // Get and delete challenge in one atomic operation (one-time use)
    const expectedChallenge = getAndDeleteChallenge(`auth:${challenge}`, 'authentication');
    
    if (!expectedChallenge) {
      return res.status(400).json({ error: "Challenge expired or invalid. Please try again." });
    }
    
    // Find the passkey by credential ID
    const credentialId = response.id; // Already base64url encoded from browser
    logger.debug('Passkey login: Looking up credential', { credentialId });
    
    const passkey = await storage.getPasskeyByCredentialId(credentialId);
    
    if (!passkey) {
      // Debug: List all passkeys to compare
      const allPasskeys = await storage.getAllPasskeys();
      logger.debug('Passkey login: Credential not found. Stored passkeys:', {
        searchedFor: credentialId,
        storedCredentialIds: allPasskeys.map(p => p.credentialId),
      });
      return res.status(404).json({ error: "Passkey not found" });
    }
    
    const user = await storage.getUser(passkey.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Verify the authentication response
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId, // Already base64url encoded string
        publicKey: Buffer.from(passkey.publicKey, 'base64'),
        counter: passkey.counter,
        transports: passkey.transports as ("ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb")[] | undefined,
      },
    });
    
    if (!verification.verified) {
      // Challenge already deleted by getAndDeleteChallenge
      return res.status(401).json({ error: "Passkey authentication failed" });
    }
    
    // Verify counter monotonicity (prevent cloned authenticator attacks)
    const newCounter = verification.authenticationInfo.newCounter;
    if (newCounter <= passkey.counter && passkey.counter !== 0) {
      logger.warn(`Possible cloned authenticator detected for user ${user.id}: stored counter ${passkey.counter}, received ${newCounter}`);
      return res.status(401).json({ error: "Security violation detected. Please re-register your passkey." });
    }
    
    // Update the counter
    await storage.updatePasskeyCounter(passkey.credentialId, newCounter);
    
    // Check user status
    if (user.status === "suspended") {
      return res.status(403).json({ error: "Account suspended" });
    }
    if (user.status === "pending_approval") {
      return res.status(403).json({ 
        error: "Account pending approval",
        message: "Your account is awaiting approval.",
        status: "pending_approval"
      });
    }
    
    // Generate JWT token
    const token = generateMobileAuthToken(user.id);
    
    logger.info(`Passkey login successful for user ${user.id}`);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    logger.error('Passkey login error', error);
    res.status(500).json({ error: "Failed to authenticate with passkey" });
  }
});

// List user's passkeys (authenticated)
router.get("/api/mobile/auth/passkeys", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const passkeys = await storage.getPasskeysByUserId(userId);
    
    // Return safe passkey data (without public key)
    const safePasskeys = passkeys.map(pk => ({
      id: pk.id,
      deviceName: pk.deviceName,
      deviceType: pk.deviceType,
      backedUp: pk.backedUp,
      createdAt: pk.createdAt,
      lastUsedAt: pk.lastUsedAt,
    }));
    
    res.json(safePasskeys);
  } catch (error) {
    logger.error('List passkeys error', error);
    res.status(500).json({ error: "Failed to list passkeys" });
  }
});

// Delete a passkey (authenticated)
router.delete("/api/mobile/auth/passkeys/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const passkeyId = req.params.id;
    
    const deleted = await storage.deletePasskey(passkeyId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: "Passkey not found" });
    }
    
    logger.info(`Passkey ${passkeyId} deleted for user ${userId}`);
    
    res.json({ success: true, message: "Passkey deleted" });
  } catch (error) {
    logger.error('Delete passkey error', error);
    res.status(500).json({ error: "Failed to delete passkey" });
  }
});

export default router;
