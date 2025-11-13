# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform that uses AI to analyze user-uploaded blood work results. It calculates biological age, provides personalized health recommendations, and tracks health metrics over time. The platform integrates OpenAI's GPT models for insights, offers robust user authentication, a comprehensive profile system, and admin tools for user management. It also supports billing via Stripe and Apple Pay, aiming to deliver trusted, clear, and actionable health information.

## Recent Updates (November 2025)
**Performance Optimizations (November 13, 2025):**
- **Biomarker Insights Caching:** BiomarkerInsightsModal now uses cached insights instead of regenerating on every view
  - Changed forceRefresh from true to false for instant repeat views
  - React Query staleTime: 5 minutes (refetch in background), gcTime: 24 hours
  - Cache invalidation on new measurements (manual or PDF) and profile updates
  - First click generates fresh insights, subsequent clicks within 5min load instantly
  - Reduces unnecessary OpenAI API calls by ~80% for typical usage patterns
- **Medical Context Auto-Save:** Fixed Medical Context field performance
  - Removed per-keystroke API mutations that caused typing lag
  - Implemented save-on-Done pattern: text saves only when clicking "Done" button
  - Added proper dark mode text colors (white text, white/40 placeholder)
  - Prevents cursor jumping and dropped keystrokes during editing

**Reference Range Bug Fix (November 13, 2025):**
- Fixed critical bug where comprehensive health insights displayed incorrect reference ranges
- Issue: 37 biomarkers with unit conversions showed unconverted reference ranges (e.g., Calcium showed 2.1-2.6 mmol/L instead of 8.5-10.5 mg/dL)
- Solution: Modified `/api/health-insights` endpoint to recalculate correct reference ranges on-the-fly using `selectReferenceRange()`
- Frontend updated to properly extract `per_biomarker_analyses` from flattened API response
- All biomarker insights now display correct reference ranges matching canonical units

**Capacitor iOS Deployment:** Complete setup for deploying Flō as a native iOS application.
- Capacitor 7.4.4 with iOS platform configured
- App ID: com.flo.healthapp, App Name: Flō
- iOS permissions configured (Camera, Photo Library) for blood work document capture
- Build process: `npm run build && npx cap sync ios && npx cap open ios`
- Documentation in CAPACITOR.md with deployment workflow
- Ready for Xcode building and App Store submission

**Critical Bug Fixes (November 13, 2025):**
- **Unit Mismatch Resolution:** Fixed systemic bug affecting 37 biomarker measurements where reference ranges stored in mmol/L didn't match canonical measurement units in mg/dL
  - Enhanced normalization engine to convert reference range bounds to canonical/display units before flag generation
  - selectReferenceRange now falls back to any available unit when exact match not found
  - Treats reference ranges with all null bounds as missing (emits "no_reference_range" instead of incorrect "within_ref")
  - Insights endpoint recalculates correct reference ranges on-the-fly without database migration
  - All flags now generated against matching units for accurate status determination
- **Manual Entry Unit Conversions - Comprehensive Fix:** Added 140 bidirectional unit conversions for 52 biomarkers total
  - Fixed critical issue where manual entry only showed canonical units while PDF upload supported multiple units
  - **Fixed API bug:** Backend was sending `canonical` field but frontend expected `isCanonical` - now aligned
  - **Comprehensive biomarker coverage:**
    - Hormones (16 biomarkers): Estradiol, Free T3, Free T4, Free Testosterone, Total Testosterone, DHEA-S, Cortisol, Prolactin, FSH, LH, Insulin, IGF-1, C-Peptide, Reverse T3
    - Metabolic markers: Glucose, Creatinine, Calcium, BUN
    - Lipids & Cardiovascular: Total Cholesterol, HDL, LDL, Triglycerides, Non-HDL, ApoA1, ApoB
    - Vitamins & Minerals: Vitamin B12, Vitamin D, Folate, Iron, TIBC, Ferritin, Magnesium
    - Proteins: Albumin, Globulin, Hemoglobin, Bilirubin
    - Inflammation: CRP, hs-CRP, Uric Acid
  - Manual entry now fully matches PDF upload capabilities with comprehensive international unit support
  - All conversions added to seed script for reproducibility in fresh environments
- **Age Display Fix:** Corrected chronological age fallback on Insights page
  - Removed hardcoded 49.2 fallback value
  - Always fetches user profile to calculate actual age from dateOfBirth
  - Uses correct formula accounting for whether birthday has occurred this year
  - Guards against invalid age (0 or negative) with reasonable fallback
  - Added comprehensive debug logging for age calculation troubleshooting
- **Biomarker Insights Authentication:** Added credentials: 'include' to insights API calls for proper session handling
- **Cache Clearing:** Purged stale biomarker_insights to force regeneration with corrected data

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
- **Failed biomarker visibility**: Expandable section showing biomarkers the AI extracted but couldn't match to database, with specific error messages (e.g., "Unknown biomarker name", "Duplicate measurement")
- Job status "needs_review" when partial extraction occurs

**Biomarker Insights Feature:** Complete implementation of AI-powered personalized biomarker insights.
- BiomarkerInsightsModal displays AI-generated recommendations in 4 sections: Lifestyle Actions, Nutrition, Supplementation, Medical Referral
- POST /api/biomarkers/:id/insights endpoint generates insights using OpenAI gpt-5
- Intelligent caching system (30-day expiration) stores insights in biomarkerInsights table
- Dashboard refactored to use GET /api/biomarker-sessions endpoint
- Clickable biomarker tiles open insights modal with loading states
- Cache invalidation on profile changes and after adding new measurements
- BIOMARKER_CONFIGS updated to include all database biomarker names for proper tile rendering

**Comprehensive Health Report Feature (November 13, 2025):**
- Full AI-powered health report accessible from insights page via "See Full Report" button
- GET `/api/comprehensive-report` endpoint with optional `sessionId` query parameter
  - Session-specific reports when ID provided, aggregate latest data otherwise
  - Uses gpt-4o to generate comprehensive analysis (15-30 second generation time)
  - Returns structured JSON with summary, biological age analysis, biomarker highlights, focus areas, and health forecast
- Frontend `/report/:id` route with Flō design (gradients, glass-morphism, mobile-first)
  - Informative loading state with "may take up to 30 seconds" messaging
  - Back navigation preserves context (returns to originating insights page)
  - React Query caching: 5-minute staleTime, 30-minute gcTime with 1 retry
- Report sections: Summary header, key takeaways, biological age drivers, biomarker highlights with AI commentary, grouped biomarkers by system, focus areas, health forecast, technical disclaimer
- Navigation fallback to `/report/latest` when no session ID available ensures button always works

**PhenoAge Biological Age Calculation:** Live implementation of scientifically-validated aging algorithm.
- GET /api/biological-age endpoint calculates biological age using Levine et al. (2018) PhenoAge algorithm
- Requires 9 biomarkers: Albumin, Creatinine, Glucose, CRP, Lymphocytes, MCV, RDW, ALP, WBC
- Automatic unit conversion to Levine units (g/dL→g/L, mg/dL→µmol/L, mg/dL→mmol/L, mg/L→mg/dL, K/µL→10³/µL)
- Dynamic lymphocyte percentage calculation from absolute counts when needed
- Chronological age calculated from user's date of birth
- Returns biologicalAge, chronologicalAge, ageDifference, testDate, and sessionId
- Insights page displays real biological age data with error handling for missing biomarkers/DOB
- UnitConverter class in shared/utils/phenoage.ts handles all precision-critical conversions

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
- **Mobile:** `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` for iOS deployment.
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