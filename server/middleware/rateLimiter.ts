import { rateLimit } from "express-rate-limit";

// Rate limiter for authentication endpoints (login, OAuth)
// 10 attempts per 15 minutes per IP
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Use default IP-based key generation (handles IPv4/IPv6 properly)
});

// Rate limiter for signup endpoint
// 5 signups per hour per IP
export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  message: { error: 'Too many signup attempts. Please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiter for password reset endpoints
// 5 password reset requests per hour per IP
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  message: { error: 'Too many password reset attempts. Please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiter for AI/expensive endpoints
// 20 requests per minute per IP (generous for authenticated users)
export const aiEndpointRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 20,
  message: { error: 'Too many AI requests. Please slow down.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiter for file uploads
// 10 uploads per hour per IP
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: { error: 'Too many file uploads. Please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
