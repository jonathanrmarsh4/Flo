# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first, AI-powered health analytics platform designed to analyze blood work, calculate biological age, and provide personalized health recommendations. It features an intelligent dashboard, integrates with AI models (OpenAI, Grok, Gemini), Apple HealthKit, and includes a voice chat coach, Flō Oracle. The platform incorporates a Stripe-powered subscription system with FREE and PREMIUM tiers. Flō's core purpose is to deliver trusted, clear, and actionable health information, offering deep health insights and significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform employs a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, utilizing Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS. It features locked tiles, paywall modals, an admin panel, dark theme, restructured navigation, and drag-and-drop reorderable dashboard tiles. iOS Safe Area support is implemented.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, utilizing TanStack Query and Wouter. Key features include biomarker insights, AI-powered health reports, PDF upload, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types, Flō Oracle voice chat using Gemini Live API, and a Flōmentum tile for daily health momentum scores.

**Backend:** Developed with Express.js and TypeScript, offering a RESTful API. It features a unified authentication system (Replit Auth OIDC, JWT, WebAuthn Passkeys), GCS for file storage, PhenoAge calculation, GPT-4o for blood work extraction, Flō Oracle integration (Grok-powered chat via xAI's grok-3-mini), ElevenLabs integration for voice, a HealthKit Readiness System, Comprehensive Sleep Tracking, Workout Session Tracking, Flōmentum Momentum Scoring System, Apple Push Notifications (APNs), and Stripe Billing Integration for subscriptions and feature gating. Password reset tokens are hashed and single-use, and uploaded lab PDFs are deleted post-extraction.

**Data Storage:** A dual-database architecture is used for enhanced security:
- **Neon (Primary):** Stores identity data (users, sessions, email, credentials, billing, audit logs) using Drizzle ORM.
- **Supabase (Health):** Stores sensitive health data (profiles, biomarkers, HealthKit, DEXA, life events), linked via a pseudonymous `health_id` UUID. This includes Row-Level Security (RLS) and separation of 12 health-related tables. Birth year is stored instead of full date of birth for privacy.

**Health Data Routing (Dec 2025):** Critical fix for Flomentum and Daily Readiness tiles:
- `healthStorageRouter.ts` - Central routing layer with `getUserDailyMetrics()` and `getUserDailyMetricsByDate()` functions
- `supabaseHealthStorage.ts` - Supabase query layer with `getDailyMetricsByDate()` and `getDailyMetricsFlexible()`
- All health data reads now route through healthStorageRouter to Supabase when `SUPABASE_HEALTH_ENABLED=true`
- `readinessEngine.ts` - Reads daily metrics from Supabase via healthRouter
- `baselineCalculator.ts` - Reads daily metrics from Supabase via healthRouter
- `flomentumBaselineCalculator.ts` - Reads from `user_daily_metrics` via healthRouter (replaces legacy `health_daily_metrics`)
- `healthkitSampleAggregator.ts` - Uses healthRouter for all reads/writes
- `upsertFlomentumDaily()` - Converts camelCase from routes.ts to snake_case for Supabase columns
- **Architecture clarification:** `flomentumScoringEngine.ts` is a pure calculation function (no DB access)
- **Root cause fixed:** Data was written to Supabase but previously read from empty Neon tables; flomentum writes failed due to camelCase/snake_case mismatch

**Flō Oracle Context Routing (Dec 2025):** Comprehensive update to route ALL health data reads through healthStorageRouter:
- `floOracleContextBuilder.ts` - Updated to use healthStorageRouter functions for all health data sources:
  - `getHealthRouterProfile()` for user profiles
  - `getHealthRouterBiomarkerSessions()` and `getHealthRouterMeasurementsBySession()` for blood work
  - `getHealthRouterDiagnosticsStudies()` for CAC/DEXA scans
  - `getHealthRouterSleepNights()` for sleep data
  - `getHealthRouterLifeEvents()` for behavioral logs
  - `getHealthRouterFlomentumDaily()` for momentum scores
  - `getHealthRouterInsightCards()` for AI-detected patterns
  - `getSupabaseActionPlanItems()` for action plan items
- Transition pattern: Try Supabase first, fall back to Neon if empty (for migration period)
- Migration SQL: `server/db/supabase-action-plan-migration.sql` extends action_plan_items and adds insight_cards table

**Daily Insights Engine v2.0 (RAG-Based):** Generates personalized health insights using a 2-layer architecture: a RAG Layer (vector search + Gemini 2.5 Pro) and a safety net Layer D for out-of-range biomarkers. It includes confidence scoring, insight ranking, domain diversity limits, and natural language generation, with insights generated at 6 AM local time.

**Conversational Life Event Logging System:** Automatically tracks and parses health narratives from Flō Oracle conversations into structured JSONB, stored in the `life_events` table for context integration.

**Unified Brain Memory System:** A shared memory layer connecting Flō Oracle (Grok-based) and Daily Insights (Gemini-based) for bidirectional AI learning. It uses `user_insights` (vector-embedded) and `flo_chat_messages` tables for hybrid retrieval.

**AI Usage Analytics System:** Tracks all OpenAI and Grok API calls including token counts, costs, and latency, displayed in the admin dashboard.

**Billing & Subscription System:** Supports FREE and PREMIUM tiers with dual payment provider support: StoreKit 2 (iOS) for in-app purchases with JWS verification, and Stripe for web-based transactions.

**Daily Reminder Notifications:** Utilizes Gemini 2.5 Flash for AI-driven personalized reminders based on user data and Action Plan items for premium users.

**iOS Shortcuts Integration:** Provides secure API key authentication for iOS Shortcuts to log events, with pre-built templates and an API key management settings page.

### Feature Specifications
- **Flō Oracle (Gemini Live):** Natural conversational voice chat via WebSocket using Gemini Live API with real-time bidirectional voice streaming, media recording, and health context/brain memory integration.
- **HealthKit Integration:** Background syncing for 73+ data types (including core, gait & mobility, nutrition, and mindfulness metrics) and workout sessions.
- **Flōmentum:** Daily health momentum scores.
- **Stripe Billing:** Comprehensive subscription management and feature gating.
- **Daily Insights Engine:** Personalized, evidence-based health insights.
- **Life Event Logging:** Automated tracking of conversational health events.
- **iOS Shortcuts:** Quick event logging via secure API keys and templates.

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
- **ElevenLabs:** For voice synthesis.