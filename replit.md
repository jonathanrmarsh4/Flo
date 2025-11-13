# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform that uses AI to analyze user-uploaded blood work results. It calculates biological age, provides personalized health recommendations, and tracks health metrics over time. The platform integrates OpenAI's GPT models for insights, offers robust user authentication, a comprehensive profile system, and admin tools for user management. It also supports billing via Stripe and Apple Pay, aiming to deliver trusted, clear, and actionable health information.

## Recent Updates (November 2025)
**PDF Upload Feature:** Complete implementation of automated blood work PDF parsing and extraction.
- Upload tab in AddTestResultsModal with drag-and-drop interface and file picker
- Private GCS storage with authenticated download via ObjectStorageService.getObjectEntityBuffer()
- PDF text extraction using pdf-parse v2 library (PDFParse class with .getText() and .destroy())
- GPT-4o integration for biomarker extraction with strict JSON schema validation
- Nullable optional fields (labName, notes, referenceRangeLow/High, flags) with explicit null handling
- Automatic null-to-default normalization (null flags → [], null strings → undefined)
- 10MB PDF size limit to prevent memory exhaustion
- Real-time progress tracking and status polling with proper cleanup on failure/unmount
- Seamless integration with biomarker normalization and dashboard display

**Biomarker Insights Feature:** Complete implementation of AI-powered personalized biomarker insights.
- BiomarkerInsightsModal displays AI-generated recommendations in 4 sections: Lifestyle Actions, Nutrition, Supplementation, Medical Referral
- POST /api/biomarkers/:id/insights endpoint generates insights using OpenAI gpt-5
- Intelligent caching system (30-day expiration) stores insights in biomarkerInsights table
- Dashboard refactored to use GET /api/biomarker-sessions endpoint
- Clickable biomarker tiles open insights modal with loading states
- Cache invalidation on profile changes and after adding new measurements
- BIOMARKER_CONFIGS updated to include all database biomarker names for proper tile rendering

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
**Framework:** React with TypeScript, using Vite.
**UI/UX:** Apple Human Interface Guidelines-inspired design, mobile-first, 44pt touch targets, content-focused minimalism.
**Components & Styling:** Shadcn/ui (Radix UI primitives) with custom theming, Tailwind CSS for styling and spacing.
**State Management:** TanStack Query for server state.
**Routing:** Wouter for client-side routing.

### Backend
**Framework:** Express.js with TypeScript.
**API:** RESTful, organized by domain (auth, blood-work, objects), with monorepo shared types.
**Authentication:** Session-based using Replit Auth (OIDC).
**File Storage:** Pre-signed URLs for client-to-GCS uploads, custom ACLs, private serving via backend proxy.

### Data Storage
**Database:** PostgreSQL (Neon serverless) using Drizzle ORM.
**Schema:** Manages users, sessions, profiles (demographics, health baseline, goals, AI personalization), blood work records, AI analysis results (JSONB), billing customers, subscriptions, payments, and audit logs.
**Profile System:** Comprehensive, editable user profiles with section-specific PATCH endpoints for autosave.

### Admin User Management
**RBAC:** `free`, `premium`, `admin` roles; `active`, `suspended` statuses.
**Features:** User search, filtering, inline editing of roles/status, comprehensive audit logging.
**Security:** Admin-only routes protected by `requireAdmin` middleware.

### Biomarker Normalization System
**Purpose:** Standardizes blood work measurements across units, labs, and naming conventions.
**Components:** `biomarkers` (master reference), `biomarker_synonyms`, `biomarker_units` (bidirectional conversions), `biomarker_reference_ranges` (context-aware).
**Engine:** Pure TypeScript module for synonym resolution, unit conversion (symmetric, type-safe), and context-scored reference range selection.
**API:** Endpoints for single and bulk biomarker normalization.

### Billing & Payments
**Provider:** Stripe (via Replit Stripe Integration).
**Methods:** Credit/debit cards via Stripe Elements, Apple Pay.
**Schema:** `billing_customers`, `subscriptions`, `payments` tables to track Stripe data.

### AI Integration
**Provider:** OpenAI (via Replit AI Integrations), GPT-5 model.
**Process:** Uploaded file content sent to OpenAI with structured prompt, response parsed into JSONB for biological age, insights, metrics, and recommendations.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage (GCS-compatible).
- **Neon:** Serverless PostgreSQL database.
- **Google Cloud Storage:** For object storage, accessed via Replit sidecar.
- **Stripe:** Payment processing for billing and subscriptions.

### Key NPM Dependencies
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`.
- **Development:** `vite`, `tsx`, `esbuild`, `drizzle-kit`.

### Environment Variables
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