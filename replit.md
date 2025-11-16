# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform that uses AI to analyze blood work, calculate biological age, and provide personalized health recommendations. It features a dashboard-centric design with four intelligent tiles that synthesize lab results, diagnostic studies, and HealthKit data into actionable health scores. The platform tracks health metrics over time, integrates OpenAI's GPT models for insights, Apple HealthKit for real-time wellness data (26 data types including HRV, sleep, steps, heart rate, and body composition), and includes user authentication, a comprehensive profile system, admin tools, and billing via Stripe and Apple Pay. Its purpose is to deliver trusted, clear, and actionable health information.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Production Infrastructure
**Logging System:** Production-safe structured logging implemented throughout the codebase:
- Server-side logger (`server/logger.ts`) with configurable log levels (debug, info, warn, error)
- Client-side logger (`client/src/lib/logger.ts`) with same interface for consistency
- All console.* statements replaced with proper logger calls across production code
- Environment-aware: verbose in development, production-ready with proper error context
- Seed scripts and dev server (vite.ts) retain console statements as acceptable for tooling

### UI/UX Decisions
The platform features an Apple Human Interface Guidelines-inspired design, focusing on a mobile-first, content-focused minimalist aesthetic with 44pt touch targets. It uses Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS for components and styling.

### Technical Implementations
**Frontend:** Built with React and TypeScript using Vite, leveraging TanStack Query for server state management and Wouter for client-side routing (hash-based for Capacitor apps). Key features include:
- **Biomarker Insights Modal:** AI-generated recommendations (Lifestyle, Nutrition, Supplementation, Medical Referral) with caching.
- **Comprehensive Health Report:** AI-powered reports including biological age analysis, biomarker highlights, and health forecasts.
- **PDF Upload:** Drag-and-drop for blood work PDF parsing, extraction via GPT-4o with strict JSON schema validation, and visibility for failed extractions.
- **Admin Dashboard:** A 7-tab interface for managing users, billing, API usage, analytics, and audit logs.
- **Mobile Authentication:** Uses `MobileAuth.tsx` with Apple Sign-In and Email/Password, `react-hook-form` validation, and a glassmorphism design.
- **iOS WKWebView Optimization:** A multi-layer fix for rubber band overscroll bounce, ensuring a consistent background.
- **DEXA Scan Display:** Integrates into the Diagnostics page, displaying bone density T-scores, WHO classification, body fat percentage with sex-specific categorization, and visceral adipose tissue (VAT) area.
- **HealthKit Integration:** Native iOS integration with Swift plugin directly embedded in the iOS app (not npm package), supporting 26 health data types across four categories:
  - Daily Readiness (6): HRV, resting heart rate, respiratory rate, oxygen saturation, sleep analysis, body temperature
  - Body Composition (6): weight, height, BMI, body fat %, lean body mass, waist circumference
  - Cardiometabolic (7): heart rate variants, blood pressure, blood glucose, VO2 max
  - Activity (7): steps, distance, calories, flights climbed, exercise time, stand time
  - **Swift Implementation:** Three files in `ios/App/App/`: Health.swift (core manager with 26 data types), HealthPlugin.swift (Capacitor plugin wrapper), BackgroundSyncManager.swift (background sync with UserDefaults queue)
  - **Backend API:** POST /api/healthkit/samples (batch upload with duplicate detection), GET /api/healthkit/samples (retrieve with optional dataType filter)
  - **Database:** `healthkit_samples` table with UUID-based deduplication, indexed for efficient queries by userId, dataType, and startDate
  - **Frontend:** TypeScript service layer (`client/src/services/healthkit.ts`), type definitions (`client/src/types/healthkit.ts`), permissions UI at `/healthkit`
  - **iOS Setup:** Requires physical device, HealthKit capability enabled in Xcode, Swift files added to Xcode project, privacy descriptions in `Info.plist`

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API.
- **Authentication:** Unified authentication system (`server/replitAuth.ts::isAuthenticated`) supporting both:
  - **Web:** Replit Auth (OIDC) via session cookies with automatic token refresh
  - **Mobile:** JWT tokens (Apple Sign-In/Email/Password) via `Authorization: Bearer` header
  - Security: JWTs production-ready with privilege escalation prevention (only `sub` claim trusted, role/status fetched from DB on every request)
  - All protected routes use single `isAuthenticated` middleware that checks JWT first, then falls back to session auth
- **File Storage:** Uses pre-signed URLs for client-to-GCS uploads and private serving via a backend proxy.
- **PhenoAge Biological Age Calculation:** Implements the Levine et al. (2018) algorithm using 9 biomarkers, including automatic unit conversion.
- **Calculated Biomarkers:** Automatically calculates Adjusted Calcium when Calcium and Albumin are present.
- **Blood Work Extraction Pipeline:** A two-phase system using GPT-4o for raw extraction and a backend normalizer for unit conversion (Unicode-aware), profile-based reference ranges (country/sex/age), and global defaults.
- **AI Integration:** Leverages OpenAI GPT models (GPT-4o, GPT-5) for biomarker extraction, personalized insights, and comprehensive health reports.
- **Calcium Score Extraction:** Supports standard GPT-4o extraction and an experimental OCR + GPT-5 mode for scanned PDFs, with intelligent fallback. JSON schemas are manually defined for strict validation.
- **DEXA Scan Extraction:** AI-powered extraction from PDFs using GPT-4o or OCR + GPT-5 for experimental mode, with intelligent fallback and schema validation. Includes body fat categorization based on reference ranges.
- **Admin Endpoints:** Cached endpoints for various statistics and audit logs.
- **Mobile Authentication Endpoints:** 7 REST endpoints for various authentication flows (Apple Sign-In, Google Sign-In, Email/Password, password reset, account linking). Includes robust error handling with try-catch wrappers for external API calls (Google/Apple tokeninfo endpoints) to handle network failures gracefully.
- **Dashboard Scoring System:** Calculates health scores across Cardiometabolic, Body Composition, Inflammation, and Daily Readiness (planned) areas, using biomarker aliases and latest values. The Flō Score is a weighted average.
- **Biological Age Endpoint:** Selects the blood work session with the most required PhenoAge biomarkers to calculate biological age.
- **Error Handling:** All production code uses structured error logging with proper error context, replacing raw console statements for production safety and better debugging.

### Data Storage
The project uses PostgreSQL (Neon serverless) with Drizzle ORM. The schema includes tables for users, sessions, comprehensive profiles (demographics, health baseline, goals, AI personalization), blood work records, AI analysis results (JSONB), diagnostic studies (calcium scores, DEXA scans), body fat reference ranges, billing customers, subscriptions, payments, audit logs, and authentication credentials.

### Admin User Management
Implements comprehensive Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles, and `active`, `suspended` statuses. The admin dashboard (`/admin-dashboard` or `/admin`) provides:
- **User Management Tab:** Real-time user listing with search/filter, inline editing of role and status, and complete user deletion with cascade cleanup
- **Overview Tab:** System metrics (total users, active users, revenue, AI API usage/cost)
- **AI API Usage Tab:** Detailed API call tracking by date, model, queries, cost, and latency
- **Audit Logs Tab:** Complete audit trail of all admin actions
- **Admin API Routes:** GET /api/admin/users (list), PATCH /api/admin/users/:id (update), DELETE /api/admin/users/:id (delete with cascade), GET /api/admin/overview, GET /api/admin/api-usage, GET /api/admin/audit-logs
- **Security:** Cannot modify own role/status or delete own account, all actions audited

### Billing & Payments
Utilizes Stripe (via Replit Stripe Integration) for credit/debit card processing and Apple Pay. The database schema includes `billing_customers`, `subscriptions`, and `payments` tables.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage (GCS-compatible).
- **Neon:** Serverless PostgreSQL database.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o and GPT-5 models.

### Key Technologies/Libraries
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`, `@capacitor/*`, `capacitor-secure-storage-plugin`, `@healthpilot/healthkit`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`, `jose`, `jsonwebtoken`, `pdf-parse`.