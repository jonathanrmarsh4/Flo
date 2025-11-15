# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform leveraging AI to analyze user blood work, calculate biological age, and provide personalized health recommendations. The app uses a **Dashboard-centric architecture** with 4 intelligent tiles that synthesize lab results, diagnostic studies, and future HomeKit data into actionable health scores. It tracks health metrics over time, integrates OpenAI's GPT models for insights, and includes robust user authentication, a comprehensive profile system, and admin tools. The platform also supports billing via Stripe and Apple Pay, aiming to deliver trusted, clear, and actionable health information.

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
- **DEXA Scan Display:** DexaScanTile component displaying bone density T-scores (spine/hip), WHO classification (Normal/Osteopenia/Osteoporosis), body fat percentage with sex-specific categorization (Athlete/Fit/Average/High/Very High), and visceral adipose tissue (VAT) area. Integrated into Diagnostics page with proper styling and coming-soon state handling.

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
- **Calculated Biomarkers:** Adjusted Calcium (Corrected Calcium) automatically calculated when both Calcium and Albumin are present. Formula: `corrected_calcium_mg_dL = total_calcium_mg_dL + 0.8 * (4.0 - albumin_g_dL)`. Reference range: 8.6-10.3 mg/dL for both men and women.
- **Blood Work Extraction Pipeline (November 2025):** Two-phase system for robust PDF processing:
  - **Phase 1 - Simple Extraction:** GPT-4o extracts 6 raw fields per biomarker (`biomarker_name_raw`, `value_raw`, `unit_raw`, `ref_range_raw`, `flag_raw`, `date_raw`) with NO validation or conversion. Zero assumptions, pure extraction.
  - **Phase 2 - Smart Normalization:** Backend normalizer handles case-insensitive unit matching, profile-based reference ranges (honoring user country/sex/age), and global defaults fallback. Preserves both raw strings and normalized canonical values.
  - **Database Schema:** Enhanced `biomarkers` table with global defaults (`globalDefaultRefMin/Max`), new `referenceProfiles` and `referenceProfileRanges` tables for country/sex/age-specific ranges, existing `biomarkerMeasurements` table stores both raw and canonical values.
  - **Seed Data:** 24 biomarkers including Calcium, Albumin, and Adjusted Calcium (November 2025). USA canonical units (mg/dL, ng/dL, ng/mL, mIU/mL) for 10 converted biomarkers: Total/LDL/HDL Cholesterol, Triglycerides, Glucose, Creatinine, Free T4, Vitamin D, FSH, LH. 140+ unit conversions, 4 reference profiles (Global, AU, US, UK).
  - **PDF Processing:** Uses pdf-parse v2 (PDFParse class) for text extraction, GPT-4o structured outputs with strict JSON schema validation, defensive error handling throughout pipeline.
- **AI Integration:** Uses OpenAI GPT models (GPT-4o, GPT-5) for biomarker extraction, personalized insights, and comprehensive health reports.
- **Calcium Score Extraction:** Parallel testing system for calcium score PDFs with two extraction modes:
  - **Standard Mode**: Uses GPT-4o with standard prompts for text-based PDFs (default)
  - **Experimental Mode**: Uses **OCR + GPT-5** for scanned/image-based PDFs
    - Intelligent fallback: tries pdf-parse first (fast for text PDFs), automatically falls back to OCR (Tesseract.js + pdf2pic) if PDF is image-based
    - OCR preprocessing: 300 DPI, converts PDF pages to PNG images, extracts text with Tesseract
    - Enhanced prompts optimized for OCR'd text with common OCR error correction
  - UI toggle in CalciumScoreUploadModal allows users to choose extraction method
  - Separate source tracking (`uploaded_pdf` vs `uploaded_pdf_experimental`) for comparison
  - **Schema Architecture**: Manually defined OpenAI JSON schema in `server/schemas/calciumScore.ts` (avoiding zod-to-json-schema `$ref` issues). Zod schema serves as validation source of truth, manually mirrored in OpenAI format with strict `additionalProperties: false`. Per-vessel schema includes only LAD, RCA, LCX, LM (removed "other" field that caused validation mismatches).
- **DEXA Scan Extraction (November 2025):** AI-powered extraction of bone density and body composition data from DEXA scan PDFs with dual extraction modes:
  - **Standard Mode**: Uses GPT-4o with standard prompts for text-based PDFs (default)
  - **Experimental Mode**: Uses **OCR + GPT-5** for scanned/image-based PDFs
    - Intelligent fallback: tries pdf-parse first (fast for text PDFs), automatically falls back to OCR (Tesseract.js + pdf2pic) if PDF is image-based
    - OCR preprocessing: 300 DPI, converts PDF pages to PNG images, extracts text with Tesseract
    - Enhanced prompts optimized for OCR'd text with common OCR error correction (e.g., "O" vs "0", "l" vs "1", negative sign confusion)
  - UI toggle in UnifiedUploadModal allows users to choose extraction method for DEXA scans
  - Separate source tracking (`uploaded_pdf` vs `uploaded_pdf_experimental`) for comparison
  - **POST /api/diagnostics/dexa/upload:** Standard multipart/form-data endpoint accepting DEXA scan PDFs
  - **POST /api/diagnostics/dexa/upload-experimental:** Experimental OCR + GPT-5 endpoint for difficult-to-read PDFs
  - **Extraction Schema:** Zod + OpenAI JSON schema in `server/schemas/dexaScan.ts` for structured extraction of spine T-score, hip T-score, WHO classification, body fat percentage, VAT area, and study date
  - **PDF Processing:** Dynamic import pattern for pdf-parse (CommonJS/ESM interop) in both `server/services/dexaScanExtractor.ts` and `server/services/dexaScanExtractorExperimental.ts`, proper resource cleanup with `getInfo()` + `destroy()`
  - **Body Fat Categorization:** `bodyFatReferenceRanges` table with sex-specific categories (Male: 4-60%, Female: 12-60%) across 5 levels (Athlete/Fit/Average/High/Very High)
  - **Storage:** Uses existing `diagnosticsStudies` table with `studyType='dexa'` and JSONB `aiPayload` for flexible data storage
  - **Summary Endpoint:** GET /api/diagnostics/summary returns both calcium score and DEXA data for unified diagnostics display
- **Admin Endpoints:** Cached endpoints for overview stats, API usage, revenue trends, subscription breakdowns, and audit logs.
- **Mobile Authentication Endpoints:** 7 REST endpoints for Apple Sign-In (JWT verification with jose), Google Sign-In (tokeninfo API), Email/Password (bcrypt hashing), password reset, and OAuth-to-email account linking. All endpoints enforce account status checks and create user profiles automatically. Return JWT tokens for mobile clients.
- **Dashboard Scoring System (November 2025):** Intelligent health metric scoring across 4 component areas:
  - **Biomarker Alias Mapping:** Centralized `SCORE_CALCULATOR_ALIASES` in `shared/domain/biomarkers.ts` maps database-friendly names ('LDL Cholesterol', 'hs-CRP') to internal scoring keys ('LDL_C', 'HS_CRP'). Used by `createScoreCalculatorMap()` utility.
  - **Per-Biomarker Latest Values:** Score calculator fetches latest value for each biomarker across ALL blood work sessions, ensuring accurate metrics even when data spans multiple test dates.
  - **Cardiometabolic Score (40% weight):** LDL, HDL, Triglycerides, Glucose, Blood Pressure, Coronary Calcium Score, VAT area. Optimal ranges based on clinical guidelines (e.g., LDL: 70-100 mg/dL, HDL: 60-80 mg/dL).
  - **Body Composition Score (25% weight):** DEXA scan data with nested structure access (`bone_density.spine_t_score`, `body_composition.fat_percent_total`, `body_composition.vat_area_cm2`). Bone density (20%), body fat % (50%, sex-specific targets: Male 15%, Female 25%), VAT area (30%). T-score >= -1: 100, >= -2.5: 70, < -2.5: 40.
  - **Inflammation Score (15% weight):** hs-CRP (optimal: 0-3 mg/L).
  - **Daily Readiness Score (20% weight):** Not yet implemented.
  - **Flō Score:** Weighted average of available component scores, normalized to 0-100 scale.
  - **Biological Age Endpoint:** GET /api/biological-age selects blood work session with MOST required PhenoAge biomarkers (9 total including hs-CRP recognized as CRP), calculates biological age vs chronological age difference.

### Data Storage
**Database:** PostgreSQL (Neon serverless) using Drizzle ORM.
**Schema:** Manages users, sessions, profiles (demographics, health baseline, goals, AI personalization), blood work records, AI analysis results (JSONB), diagnostic studies (calcium scores, DEXA scans), body fat reference ranges, billing customers, subscriptions, payments, audit logs, auth providers (OAuth tokens), and user credentials (password hashes).
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