# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform leveraging AI to analyze user blood work, calculate biological age, and provide personalized health recommendations. It tracks health metrics over time, integrates OpenAI's GPT models for insights, and includes robust user authentication, a comprehensive profile system, and admin tools. The platform also supports billing via Stripe and Apple Pay, aiming to deliver trusted, clear, and actionable health information.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
**Framework:** React with TypeScript, using Vite.
**UI/UX:** Apple Human Interface Guidelines-inspired design, mobile-first, content-focused minimalism, 44pt touch targets.
**Components & Styling:** Shadcn/ui (Radix UI primitives) with custom theming, Tailwind CSS.
**State Management:** TanStack Query for server state.
**Routing:** Wouter for client-side routing (hash-based for Capacitor apps).
**Features:**
- **Biomarker Insights Modal:** Displays AI-generated recommendations (Lifestyle Actions, Nutrition, Supplementation, Medical Referral) with intelligent caching.
- **Comprehensive Health Report:** AI-powered, accessible from insights, providing summary, biological age analysis, biomarker highlights, focus areas, and health forecast.
- **PDF Upload:** Drag-and-drop interface for automated blood work PDF parsing, extraction, and GPT-4o integration for biomarker identification with strict JSON schema validation. Includes visibility for failed biomarker extractions.
- **Admin Dashboard:** Rebuilt with a 7-tab interface and Flō design system components (AdminMetricCard, AdminStatusBadge, AdminGlassPanel) for user, billing, API usage, analytics, and audit log management.
- **Mobile Authentication:** MobileAuth.tsx component with Apple Sign-In (Capacitor plugin), Email/Password authentication, react-hook-form validation, and glassmorphism design. Capacitor platform detection for mobile-specific flows.
- **iOS WKWebView Optimization:** Three-layer fix for rubber band overscroll bounce (AppDelegate.swift disables bounces, Capacitor config sets backgroundColor, CSS applies overscroll-behavior-y: none). All layers use consistent #0f172a background to prevent white strip flashing.

### Backend
**Framework:** Express.js with TypeScript.
**API:** RESTful, organized by domain, with monorepo shared types.
**Authentication:** Dual authentication system:
- **Web:** Replit Auth (OIDC) with session cookies via Passport.js
- **Mobile:** JWT tokens with Apple Sign-In/Email/Password, stored in encrypted iOS Keychain via `capacitor-secure-storage-plugin`
**File Storage:** Pre-signed URLs for client-to-GCS uploads, private serving via backend proxy.
**Features:**
- **Secure JWT Authentication:** Production-ready JWT implementation with privilege escalation prevention. JWT payload contains ONLY `sub` (user ID), `iss`, `aud`, `type` - role/status fetched from database on every request. Tokens signed with SESSION_SECRET, 7-day expiry. Dynamic imports prevent web bundle crashes.
- **PhenoAge Biological Age Calculation:** Implements Levine et al. (2018) algorithm requiring 9 biomarkers, with automatic unit conversion and chronological age calculation.
- **Biomarker Normalization System:** Standardizes blood work measurements across units, labs, and naming conventions using `biomarkers`, `biomarker_synonyms`, `biomarker_units`, and `biomarker_reference_ranges`. Provides endpoints for single and bulk normalization. Includes 140 bidirectional unit conversions for 52 biomarkers for manual entry and PDF uploads.
- **AI Integration:** Uses OpenAI GPT models (GPT-4o, GPT-5) for biomarker extraction, personalized insights, and comprehensive health reports.
- **Admin Endpoints:** Cached endpoints for overview stats, API usage, revenue trends, subscription breakdowns, and audit logs.
- **Mobile Authentication Endpoints:** 7 REST endpoints for Apple Sign-In (JWT verification with jose), Google Sign-In (tokeninfo API), Email/Password (bcrypt hashing), password reset, and OAuth-to-email account linking. All endpoints enforce account status checks and create user profiles automatically. Return JWT tokens for mobile clients.

### Data Storage
**Database:** PostgreSQL (Neon serverless) using Drizzle ORM.
**Schema:** Manages users, sessions, profiles (demographics, health baseline, goals, AI personalization), blood work records, AI analysis results (JSONB), billing customers, subscriptions, payments, audit logs, auth providers (OAuth tokens), and user credentials (password hashes).
**Profile System:** Comprehensive, editable user profiles with section-specific PATCH endpoints.
**Auth System:** Multi-provider authentication with `auth_providers` table (links users to Apple/Google/Replit), `user_credentials` table (email/password with bcrypt), bidirectional account linking, and automatic profile creation.

### Admin User Management
**RBAC:** `free`, `premium`, `admin` roles; `active`, `suspended` statuses.
**Features:** User search, filtering, inline editing, and comprehensive audit logging.
**Security:** Admin-only routes protected by `requireAdmin` middleware.

### Billing & Payments
**Provider:** Stripe (via Replit Stripe Integration).
**Methods:** Credit/debit cards via Stripe Elements, Apple Pay.
**Schema:** `billing_customers`, `subscriptions`, `payments` tables.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage (GCS-compatible).
- **Neon:** Serverless PostgreSQL database.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing for billing and subscriptions.
- **OpenAI:** GPT-4o and GPT-5 models for AI integration.

### Key Technologies/Libraries
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`, `jose` (JWT verification), `jsonwebtoken` (JWT signing).
- **Mobile:** `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor-community/apple-sign-in`, `capacitor-secure-storage-plugin` (encrypted Keychain storage).
- **PDF Processing:** `pdf-parse` library for text extraction.

### Environment Variables (used by the project)
- `DATABASE_URL`
- `SESSION_SECRET`
- `ISSUER_URL`
- `REPL_ID`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `PRIVATE_OBJECT_DIR`
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`
- `STRIPE_SECRET_KEY`
- `VITE_STRIPE_PUBLIC_KEY`