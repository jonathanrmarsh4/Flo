# Flō - AI-Powered Health Insights Platform

## Overview
Flō is an AI-powered, mobile-first health analytics platform designed to process blood work, calculate biological age, and deliver personalized health recommendations. It features an intelligent dashboard, integrates with leading AI models, Apple HealthKit, and includes a voice-activated AI coach, Flō Oracle. Operating on a Stripe-powered freemium subscription model, Flō aims to provide trustworthy, clear, and actionable health information, offering profound health insights and capitalizing on the significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines. It leverages Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS, supporting locked tiles, paywall modals, an admin panel, dark theme, reorderable dashboard tiles, and iOS Safe Area.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query and Wouter. Key features include biomarker insights, AI health reports, PDF upload, admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing, Flō Oracle voice chat, and Flōmentum scores.

**Backend:** Developed with Express.js and TypeScript, exposing a RESTful API. It uses a unified authentication system (Replit Auth OIDC, JWT, WebAuthn Passkeys), GCS for file storage, PhenoAge calculation, GPT-4o for blood work extraction, Flō Oracle integration, ElevenLabs for voice, a HealthKit Readiness System, comprehensive sleep and workout tracking, Flōmentum scoring, Apple Push Notifications (APNs), and Stripe Billing.

**Data Storage:** A dual-database approach:
- **Neon (Primary):** Stores identity data (users, sessions, billing, audit logs) using Drizzle ORM.
- **Supabase (Health):** Stores sensitive health data (profiles, biomarkers, HealthKit, DEXA, life events) with Row-Level Security (RLS) and pseudonymous linking via `health_id`.

**Key Features & Systems:**
- **AI-Powered Insights:** Includes a Daily Insights Engine (RAG-based, GPT-4o), Conversational Life Event Logging (Gemini 2.5 Flash), Real-Time Trend Detection, and a Unified Brain Memory System. **InsightsSchedulerV2** runs hourly.
- **Flō Oracle Enhancements:** Centralized context routing, conversation memory, and on-demand data retrieval via Gemini function calling. Includes stale session cleanup.
- **Anti-Repetition System:** User memory service tracks 'topic_suppression' and 'do_not_mention' memory types.
- **Medical Data Processing:** Medical Document Ingestion using GPT-4o for summarization and semantic search, and Lab Unit Display Toggle.
- **Machine Learning Models:** CGM, Biomarker, and HealthKit Pattern Learners train baselines.
- **ClickHouse ML Correlation Engine:** High-performance analytics for anomaly detection, predictive insights, and long-term pattern recognition, with full history sync and 90-day baseline + Z-score anomaly detection. **Sleep Baseline Filtering (Dec 2025):** Baseline queries now filter out naps and partial sleep sessions (time_in_bed < 4h, sleep_duration < 3h) to prevent artificially low baselines.
- **ML Architecture Refactor (Stage 3 Complete):** ClickHouse is now the single source of truth for all baseline calculations and anomaly detection. Shadow comparison systems removed (baselineComparisonLogger.ts, supabaseBaselineEngine.ts deleted). Legacy baselineCalculator.ts retained only for readinessEngine daily scores (future migration target).
- **Long-Horizon Correlation Engine:** Discovers statistically significant behavior-outcome correlations over months using Mann-Whitney U test, including subjective survey data.
- **ML Causality Engine (Hybrid ML+AI Architecture):** Identifies causes for health metric changes by analyzing behavior patterns. It uses ClickHouse for baselines, `BehaviorAttributionEngine` to sync factors, ML to rank causes, and Gemini to format narratives. Includes `findHistoricalPatternMatches()`, `findPositivePatterns()`, `generateSmartInsight()`, and admin-tunable ML sensitivity settings.
- **Health Context Enrichment (Dec 2025):** ML anomaly alerts now include structured health context explaining WHY anomalies matter. The `healthContextKnowledge.ts` knowledge base maps 25+ metrics to direction-specific classifications (positive/concerning/neutral/context_dependent), health implications, potential conditions to consider, and actionable advice. Gemini AI uses this context to generate more educational insights. All context is persisted in `pendingCorrelationFeedback` table with 4 new columns: `healthContextClassification`, `healthImplications`, `conditionsToConsider`, `actionableAdvice`.
- **ML Feedback Loop (Adaptive Learning):** Complete feedback loop where user feedback trains the ML system:
  - **Personalized Thresholds** (`user_learned_thresholds` table): False positives increase Z-score/percentage thresholds by 10%, confirmed anomalies maintain confidence. Uses `updatePersonalizedThreshold()` and `getPersonalizedThreshold()`.
  - **Free Text Analysis** (`user_feedback_analysis` table): Extracts themes (stress, illness, travel, alcohol, exercise, sleep, nutrition, medication, data_quality) and sentiment from user feedback via `analyzeFreeTextFeedback()`.
  - **Data Quality Suppression** (`user_metric_suppressions` table): When user reports sensor/Apple data issues in feedback (keywords: 'apple', 'sensor', 'bug', 'impossible', 'false positive', etc.), creates 7-day suppression for that metric. `detectAnomalies()` checks active suppressions and skips suppressed metrics. Enables immediate false positive suppression from survey notes.
  - **Survey-Outcome Training** (`survey_outcome_correlations` table): `trainOnSurveyOutcomes()` correlates 3PM survey scores (energy/clarity/mood) with previous day's behaviors; significant correlations (>15% difference) stored for `getSurveyInsights()` recommendations.
  - **Non-blocking Scheduler Integration:** Survey training runs via `setImmediate()` fire-and-forget pattern to avoid blocking insight generation.
  - **Graceful Degradation:** Explicit warnings when ClickHouse unavailable; FINAL keyword ensures deduplicated query results.
- **Environmental Data Integration:** Correlates OpenWeather data with health metrics.
- **HealthKit Sample Deduplication:** Server-side fingerprint-based deduplication.
- **Sleep Data Merge Strategy:** `upsertSleepNight` uses merge-on-conflict strategy to prevent data loss when partial HealthKit syncs occur - only non-null values from new syncs overwrite existing values, preserving HRV and other biometric data from previous syncs.
- **Morning Briefing System:** Personalized AI-generated daily briefings using 90-day baseline Z-score deviations from ClickHouse ML engine. Activity metrics (steps, active_energy, workout_minutes) are fetched from yesterday's data for accurate morning briefings, while sleep metrics use today's data (last night's sleep).
- **Dexcom CGM Integration:** Direct OAuth2 integration with Dexcom API for continuous glucose monitoring, automatic 5-minute data sync, and real-time glucose dashboard tile.
- **Apple Push Notifications (APNs):** Configurable via Admin Dashboard, configuration stored in Neon database.

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