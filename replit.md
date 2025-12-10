# Flō - AI-Powered Health Insights Platform

## Overview
Flō is an AI-powered, mobile-first health analytics platform designed to process blood work, calculate biological age, and deliver personalized health recommendations. It features an intelligent dashboard, integrates with leading AI models (OpenAI, Grok, Gemini), and Apple HealthKit, and includes a voice-activated AI coach, Flō Oracle. Operating on a Stripe-powered freemium subscription model, Flō aims to provide trustworthy, clear, and actionable health information, offering profound health insights and capitalizing on the significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines. It leverages Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS, supporting locked tiles, paywall modals, an admin panel, dark theme, reorderable dashboard tiles, and iOS Safe Area.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query and Wouter. Key features include biomarker insights, AI health reports, PDF upload, admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing, Flō Oracle voice chat (Gemini Live API), and Flōmentum scores.

**Backend:** Developed with Express.js and TypeScript, exposing a RESTful API. It uses a unified authentication system (Replit Auth OIDC, JWT, WebAuthn Passkeys), GCS for file storage, PhenoAge calculation, GPT-4o for blood work extraction, Flō Oracle integration (Gemini 2.5 Flash for text, Grok for life event parsing), ElevenLabs for voice, a HealthKit Readiness System, comprehensive sleep and workout tracking, Flōmentum scoring, Apple Push Notifications (APNs), and Stripe Billing.

**Data Storage:** A dual-database approach:
- **Neon (Primary):** Stores identity data (users, sessions, billing, audit logs) using Drizzle ORM.
- **Supabase (Health):** Stores sensitive health data (profiles, biomarkers, HealthKit, DEXA, life events) with Row-Level Security (RLS) and pseudonymous linking via `health_id`.

**Key Features & Systems:**
- **HealthKit Sync Expansion & Historical Backfill:** Comprehensive syncing of vital signs, wrist temperature, mindfulness, and 26 dietary HKQuantityTypes, including initial full historical data backfill.
- **AI-Powered Insights:** Includes a Daily Insights Engine (RAG-based, GPT-4o via InsightsEngineV2, stores in Supabase `daily_insights`), Conversational Life Event Logging (Gemini 2.5 Flash), Real-Time Trend Detection, and a Unified Brain Memory System for bidirectional AI learning. **InsightsSchedulerV2** runs hourly and triggers at 6 AM user local time with catch-up mode for missed generations. Uses `users.healthId` field from Neon to identify users with Supabase health data, and `healthRouter.getDailyInsightsByDate()` to check for existing insights. Separate ClickHouse ML insights stored in brain `user_insights` table via CorrelationInsightService.
- **Flō Oracle Enhancements:** Centralized context routing, conversation memory, and on-demand data retrieval via Gemini function calling. Voice session startup optimized with timeout wrappers (5s default, 3s for semantic search) to prevent blocking. Includes stale session cleanup (30-minute threshold) running every 10 minutes to prevent connection failures.
- **Anti-Repetition System:** User memory service tracks 'topic_suppression' and 'do_not_mention' memory types with high importance. Memory extraction automatically detects "don't mention X" instructions from user conversations. Suppressed topics are placed prominently at the top of AI context with explicit "DO NOT MENTION" guidance in both text and voice chat flows.
- **Medical Data Processing:** Medical Document Ingestion using GPT-4o for summarization and semantic search, and Lab Unit Display Toggle for user preference.
- **Machine Learning Models:**
    - **CGM Pattern Learner:** Trains on synthetic glucose data from simglucose for baseline establishment and anomaly detection.
    - **Biomarker Pattern Learner:** Trains blood work baselines from CDC NHANES population data.
    - **HealthKit Pattern Learner:** Trains wearable/activity baselines from synthetic data.
- **ClickHouse ML Correlation Engine:** High-performance analytics for anomaly detection, predictive insights, and long-term pattern recognition. Features full history sync, pattern memory, seasonal pattern detection, real-time auto-sync, 90-day baseline + Z-score anomaly detection, and proactive anomaly alerts.
- **ML Architecture Refactor (In Progress):** Step 1 establishes ClickHouse as the single source of truth for baseline calculations via `getMetricsForAnalysis()` API. Features:
  - Unified `MetricAnalysis` interface with baseline, z-score, deviation, severity, direction
  - Comparison logging between ClickHouse and legacy shadow math (anomalyDetectionEngine, ragInsightGenerator, baselineCalculator)
  - Feature flag `USE_CLICKHOUSE_ML_SOURCE` (default: false) for safe rollout
  - Admin endpoints: `/api/admin/ml/unified-analysis/:userId`, `/api/admin/ml/baseline-comparison/:userId`, `/api/admin/ml/source-of-truth-status`
  - Step 2: Validate results match across all consumers; Step 3: Remove shadow math after validation
- **Long-Horizon Correlation Engine:** Discovers statistically significant behavior-outcome correlations over months using Mann-Whitney U test. Now includes subjective survey data (Energy, Clarity, Mood) as outcome metrics, enabling correlations like "afternoon workouts correlate with 8% higher energy levels" or "consistent bedtime correlates with improved mental clarity."
- **User Engagement:** AI Feedback Questions (1-10 scale responses stored in ClickHouse `user_feedback` table), Daily 3PM Subjective Survey (synced to ClickHouse `subjective_surveys` and aggregated into `weekly_outcome_rollups` for ML correlation), and Daily Reminder Notifications.
- **Environmental Data Integration:** Correlates OpenWeather data with health metrics.
- **HealthKit Sample Deduplication:** Server-side fingerprint-based deduplication for HealthKit samples.
- **Self-Improvement Engine (SIE):** Admin-only sandbox AI for product improvement suggestions.
- **Morning Briefing System:** Personalized AI-generated daily briefings triggered after sleep ends. Uses 90-day baseline Z-score deviations from ClickHouse ML engine to surface "holy shit" insights. Features readiness score, weather context, actionable recommendations, and "Talk to Flō" integration for contextual Oracle conversations. Stored in ClickHouse `daily_user_insights` and `morning_briefing_log` tables with user preferences in Supabase `profiles.ai_personalization` JSONB field.
- **Dexcom CGM Integration:** Direct OAuth2 integration with Dexcom API for continuous glucose monitoring. Features secure OAuth flow with server-side state validation, automatic 5-minute data sync via `cgmSyncScheduler`, real-time glucose dashboard tile with trend arrows and time-in-range visualization. Supports sandbox and production modes. Data stored in Supabase `cgm_connections` and `cgm_readings` tables. Redirect URI: `https://get-flo.com/api/auth/dexcom/callback`. Environment variables: `DEXCOM_CLIENT_ID`, `DEXCOM_CLIENT_SECRET`, `DEXCOM_SANDBOX`, `DEXCOM_REDIRECT_URI`.
- **Apple Push Notifications (APNs):** Configurable via Admin Dashboard → Settings → APNs Configuration. Configuration stored in Neon database (`apns_configuration` table), not environment variables. Key details:
  - **Team ID:** `QRJGSY642V`
  - **Key ID:** `8PY6UV28L4`
  - **Bundle ID:** `com.flo.healthapp`
  - **Signing Key:** Full .p8 private key contents (include BEGIN/END markers)
  - **Environment:** Use **Sandbox** for Xcode builds, **Production** for TestFlight/App Store builds
  - Device tokens are stored in Supabase `device_tokens` table and auto-deactivated when APNs reports them invalid

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage.
- **Neon:** Serverless PostgreSQL database.
- **Supabase:** PostgreSQL with pgvector extension.
- **Google Cloud Storage:** Object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o, text-embedding-3-small.
- **xAI (Grok):** grok-3-mini.
- **Google AI (Gemini):** Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini Live API (gemini-2.5-flash-native-audio).
- **ElevenLabs:** Voice synthesis.
- **OpenWeather:** Weather and air pollution data.
- **ClickHouse Cloud:** High-performance columnar database.