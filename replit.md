# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first, AI-powered health analytics platform that analyzes blood work, calculates biological age, and provides personalized health recommendations. It features a dashboard with intelligent tiles, integrating with OpenAI's GPT models, Apple HealthKit, and a Grok-powered voice chat coach called **Flō Oracle**. The platform includes a **Stripe-powered subscription system** with FREE and PREMIUM tiers. Flō's core purpose is to deliver trusted, clear, and actionable health information, offering deep health insights and significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, utilizing Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS. It includes locked tiles, paywall modals, and an admin panel. Recent updates include a dark theme overhaul, restructured navigation, and drag-and-drop reorderable dashboard tiles. iOS Safe Area support is implemented using `pt-[env(safe-area-inset-top)]` and `viewport-fit=cover`.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query and Wouter. Features include biomarker insights, AI-powered health reports, PDF upload, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types, **Flō Oracle voice chat** using Gemini Live API, and a **Flōmentum tile** for daily health momentum scores.

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API. It features a unified authentication system (Replit Auth OIDC, JWT, WebAuthn Passkeys), GCS for file storage, PhenoAge calculation, GPT-4o for blood work extraction, **Flō Oracle integration** (Grok-powered chat via xAI's grok-3-mini), **ElevenLabs integration** for voice, a HealthKit Readiness System, Comprehensive Sleep Tracking, Workout Session Tracking, **Flōmentum Momentum Scoring System**, **Apple Push Notifications (APNs)**, and **Stripe Billing Integration** for subscriptions and feature gating. Password reset tokens are hashed and single-use. Uploaded lab PDFs are deleted after biomarker extraction for privacy. WebAuthn Passkey authentication is implemented with `@simplewebauthn/server`. Session data is isolated on login by clearing the React Query cache.

**Data Storage:** Dual-database architecture for enhanced security:
- **Neon (Primary):** Identity data (users, sessions, email, credentials, billing, audit logs). Uses Drizzle ORM.
- **Supabase (Health):** Sensitive health data (profiles, biomarkers, HealthKit, DEXA, life events). Linked via pseudonymous `health_id` UUID.

**Data Segregation Architecture (Phase 2 Complete - Ready for Production Testing):**
- `users.health_id` column added to Neon for pseudonymous linking
- 12 health tables created in Supabase with Row-Level Security (RLS)
- Data migration completed: 11 profiles, 47 biomarker sessions, 17 daily metrics, 8 sleep nights migrated
- Feature-flagged routing via `server/services/healthStorageRouter.ts` with `SUPABASE_HEALTH_ENABLED` flag
- Service layer at `server/services/supabaseHealthStorage.ts` for Supabase operations
- Logger utility at `server/utils/logger.ts` for consistent logging
- **Birth Year Privacy Enhancement (Nov 2025):** Replaced full `date_of_birth` with `birth_year` integer only to prevent re-identification attacks if databases are compromised. Age calculations use July 1st mid-year assumption (±6 month accuracy). Shared utility at `shared/utils/ageCalculation.ts`. 12 existing profiles migrated successfully.
- **Storage Layer Expansion (Nov 2025):** Complete healthRouter implementation covering:
  - HealthKit samples (get/upsert with flexible filtering)
  - Sleep nights (getSleepNights/getSleepNightByDate/upsertSleepNight)
  - User daily metrics (get/getByDate/upsert)
  - Life events (getLifeEvents/createLifeEvent)
  - Flomentum daily (getFlomentumDaily/getFlomentumDailyByDate/upsertFlomentumDaily)
  - Diagnostic studies (getDiagnosticsStudies/createDiagnosticStudy)
  - Action plan items (getActionPlanItems/getActionPlanItem/updateActionPlanItemStatus)
  - Biomarker sessions and measurements (getBiomarkerSessions/createBiomarkerSession/getMeasurementsBySession/createBiomarkerMeasurement)
  - Health profiles (getProfile/upsertProfile)
- **Response Normalization:** healthRouter converts Supabase snake_case responses to camelCase for API compatibility
- **Predicate Safety:** All storage methods use safe predicate building (`whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)`)
- **Fully Refactored Tables (0 direct db calls):** sleepNights, healthkitSamples, lifeEvents, flomentumDaily, diagnosticsStudies, actionPlanItems
- **Intentional Direct Calls:** 
  - userDailyMetrics (timezone lookups + ingestion)
  - dailyInsights (AI-generated content stays in Neon)
  - diagnosticMetrics (AI-generated content stays in Neon)
- **Activation:** Set `SUPABASE_HEALTH_ENABLED=true` environment variable to enable Supabase routing

Production database schema changes require manual verification and careful migration to avoid data loss.

**Daily Insights Engine v2.0 (RAG-Based):** Generates personalized health insights daily using a 2-layer architecture: **RAG Layer** (vector search + **Gemini 2.5 Pro**) and **Layer D** (out-of-range biomarker safety net). It incorporates confidence scoring, insight ranking, domain diversity limits, and natural language generation. Insights are generated at 6 AM local time, with automatic timezone syncing from the frontend.

**Conversational Life Event Logging System:** Automatically tracks health narratives from Flō Oracle conversations, parsing events into structured JSONB logged to the `life_events` table for integration into Flō Oracle's context.

**Unified Brain Memory System:** A shared memory layer connecting Flō Oracle (Grok-based) and Daily Insights (Gemini-based) for bidirectional AI learning. It utilizes `user_insights` (vector-embedded with source and importance) and `flo_chat_messages` tables. Retrieval is hybrid (recency + semantic search). Insights flow from GPT to Brain, and relevant insights are injected from Brain to Grok. Grok's responses are parsed to extract and persist discoveries, with nightly GPT-4o summarization of chat transcripts.

**Admin User Management:** Implements Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles, providing user management, system overview metrics, and audit logs.

**AI Usage Analytics System:** Tracks all OpenAI and Grok API calls with token counts, costs, and latency, stored in `openaiUsageEvents` and displayed in the admin dashboard.

**Billing & Subscription System:** Supports FREE and PREMIUM tiers with dual payment provider support: **StoreKit 2 (iOS)** for in-app purchases with cryptographic JWS verification, and **Stripe (Web fallback)** for web-based transactions. Security includes mandatory JWS signature verification for App Store transactions in production.

**Daily Reminder Notifications:** Uses **Gemini 2.5 Flash** for AI-driven personalized reminders based on user data and Action Plan items for premium users.

**iOS Shortcuts Integration:** Provides secure API key authentication for iOS Shortcuts to log events, with pre-built templates and a frontend settings page for API key management.

### Feature Specifications
- **Flō Oracle (Gemini Live):** Natural conversational voice chat via WebSocket using Gemini Live API with real-time bidirectional voice streaming. It includes media recording (WebM/Opus), session management, and health context/brain memory integration.
- **HealthKit Integration:** Background syncing for 26+ data types and workout sessions, including extended daily metrics like weight, BMI, heart rate, and blood pressure.
- **Flōmentum:** Daily health momentum scores.
- **Stripe Billing:** Comprehensive subscription management and feature gating.
- **Daily Insights Engine:** Personalized, evidence-based health insights.
- **Life Event Logging:** Automated tracking of conversational health events.
- **iOS Shortcuts:** Quick event logging via secure API keys and templates.

### Extended HealthKit Metrics
The platform now tracks **73+ HealthKit data types** across multiple tables with complete daily aggregation:

**Core Metrics (26 in user_daily_metrics):** steps, distance, activeEnergy, heartRate, weight, HRV, restingHeartRate, bloodPressure (systolic/diastolic), height, BMI, bodyFatPercentage, leanBodyMass, flightsClimbed, bloodGlucose, vo2Max, waistCircumference, exerciseTime, standTime, sleepAnalysis, basalEnergy, walkingHR, dietaryWater, oxygenSaturation, respiratoryRate

**Gait & Mobility Metrics (8 fields in user_daily_metrics, Nov 2025):**
- `walkingSpeedMs` - Average walking speed in meters/second
- `walkingStepLengthM` - Average step length in meters
- `walkingDoubleSupportPct` - Double support percentage (fall risk indicator)
- `walkingAsymmetryPct` - Walking asymmetry percentage
- `walkingSteadiness` - Apple Walking Steadiness score (0-100%)
- `sixMinuteWalkDistanceM` - 6-minute walk test distance
- `stairAscentSpeedMs` - Stair climbing speed ascending
- `stairDescentSpeedMs` - Stair climbing speed descending

**Nutrition Metrics (38 fields in nutrition_daily_metrics, Nov 2025):**
- **Macronutrients:** energyKcal, proteinG, carbohydratesG, fatTotalG, fatSaturatedG, fatPolyunsaturatedG, fatMonounsaturatedG, fiberG, sugarG
- **Minerals:** calciumMg, ironMg, magnesiumMg, manganeseMg, phosphorusMg, potassiumMg, sodiumMg, zincMg, copperMg, seleniumMg, chromiumMg, iodineMg, chlorideMg, molybdenumMg
- **Vitamins:** vitaminAMcg, vitaminB6Mg, vitaminB12Mcg, vitaminCMg, vitaminDMcg, vitaminEMg, vitaminKMcg, biotinMcg, folateMcg, niacinMg, pantothenicAcidMg, riboflavinMg, thiaminMg
- **Other:** cholesterolMg, caffeineMg, waterMl

**Mindfulness Tracking (Nov 2025):**
- `mindfulness_sessions` table: Individual meditation/mindfulness sessions with duration, source app, HealthKit UUID
- `mindfulness_daily_metrics` table: Daily aggregations (totalMinutes, sessionCount, avgSessionMinutes, longestSessionMinutes)

**Aggregation Services:**
- `healthkitSampleAggregator.ts` - Aggregates core + gait/mobility metrics daily
- `nutritionMindfulnessAggregator.ts` - Aggregates nutrition and mindfulness data daily

**API Routes:**
- `POST /api/healthkit/nutrition` - Batch upload nutrition samples
- `POST /api/healthkit/mindfulness` - Upload individual mindfulness sessions

All new data types are included in Flō Oracle's AI context for personalized health insights.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage.
- **Neon:** Serverless PostgreSQL database.
- **Supabase:** PostgreSQL with pgvector extension.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o for blood work PDF extraction, text-embedding-3-small for RAG embeddings.
- **xAI (Grok):** grok-3-mini model for Flō Oracle text chat and async brain memory extraction.
- **Google AI (Gemini):** Gemini 2.5 Pro for Daily Insights, Gemini 2.5 Flash for daily reminders, Gemini Live API (gemini-2.5-flash-native-audio) for Flō Oracle voice conversations.