# Flō - AI-Powered Health Insights Platform

## Overview
Flō is an AI-powered, mobile-first health analytics platform that processes blood work, calculates biological age, and delivers personalized health recommendations. It features an intelligent dashboard, integrates with leading AI models and Apple HealthKit, and includes a voice-activated AI coach, Flō Oracle. Operating on a Stripe-powered freemium subscription model, Flō aims to provide trustworthy, clear, and actionable health information, offering profound health insights and capitalizing on the significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, leveraging Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS. It supports locked tiles, paywall modals, an admin panel, dark theme, reorderable dashboard tiles, and iOS Safe Area.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query and Wouter, featuring biomarker insights, AI health reports, PDF upload, admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing, Flō Oracle voice chat, and Flōmentum scores.

**Backend:** Developed with Express.js and TypeScript, exposing a RESTful API. It uses a unified authentication system (Replit Auth OIDC, JWT, WebAuthn Passkeys), GCS for file storage, PhenoAge calculation, GPT-4o for blood work extraction, Flō Oracle integration, ElevenLabs for voice, a HealthKit Readiness System, comprehensive sleep and workout tracking, Flōmentum scoring, Apple Push Notifications (APNs), and Stripe Billing.

**Data Storage:** A dual-database approach:
- **Neon (Primary):** Stores identity data (users, sessions, billing, audit logs) using Drizzle ORM.
- **Supabase (Health):** Stores sensitive health data (profiles, biomarkers, HealthKit, DEXA, life events) with Row-Level Security (RLS) and pseudonymous linking via `health_id`.

**Key Features & Systems:**
- **AI-Powered Insights:** Includes a Daily Insights Engine (RAG-based, GPT-4o), Conversational Life Event Logging (Gemini 2.5 Flash), Real-Time Trend Detection, and a Unified Brain Memory System.
- **Flō Oracle:** Enhanced with centralized context routing, conversation memory, on-demand data retrieval via Gemini function calling, and consistent health assessments using ClickHouse 90-day baselines. Includes an anti-repetition system.
- **Medical Data Processing:** GPT-4o for medical document ingestion (summarization, semantic search) and lab unit display toggle.
- **Machine Learning:** CGM, Biomarker, and HealthKit Pattern Learners train baselines.
- **ClickHouse ML Correlation Engine:** Provides high-performance analytics for anomaly detection, predictive insights, and long-term pattern recognition using 90-day baselines and Z-score anomaly detection, acting as the single source of truth for all baseline calculations. Includes long-horizon correlation and a hybrid ML+AI causality engine.
- **ML Feedback Loop:** Adaptive learning based on user feedback, personalized thresholds, free text analysis, data quality suppression, and survey-outcome training.
- **Environmental Data Integration:** Correlates OpenWeather data with health metrics.
- **HealthKit Integration:** Features server-side sample deduplication, a robust sleep data merge strategy, accurate stand hours calculation, and **Instant Tile Population** - server-side PRIMARY metric aggregation (steps, sleep, HRV, active energy, exercise, stand hours, distance, flights) from raw samples enables tiles to display immediately without waiting for full iOS backfill. Field names use camelCase for reads and snake_case for writes. Sleep aggregation correctly excludes awake periods (only counts asleepUnspecified, asleepCore, asleepDeep, asleepREM). Distance stored in meters (no unit conversion needed).
- **Mobile Features:** Morning Briefing System, Dexcom CGM integration with real-time glucose dashboard, Apple Push Notifications (APNs), movement quality/gait metrics syncing, saved meals feature, and comprehensive account management (logout, deletion).
- **Notification Safeguards:** Multi-layer protection against notification flooding for new users, ensuring complete ClickHouse backfill, established baseline data, data recency, active device tokens, and a fail-closed architecture. Centralized notification eligibility service enforces these rules.
- **Timezone Management:** Critical fixes for anomaly detection and survey notifications to accurately reflect user local timezones.
- **Cumulative Metrics Aggregation:** Corrected ClickHouse queries to use `max(value)` for daily cumulative metrics to prevent inaccurate baselines and insights. The cumulative metrics list includes: `steps`, `active_energy`, `exercise_minutes`, `workout_minutes`, `distance_walking_running`, `distance_km`, `stand_hours`, `stand_time`, `move_minutes`, `active_calories`, `flights_climbed`, `water_intake_ml`, `basal_energy`, `total_calories_burned`. Missing these metrics from the list causes baselines to be ~30-40% lower than actual values because partial syncs get averaged instead of max per day.
- **Goal-Oriented Notifications:** Proactive, goal-oriented notifications and insights generated using `GoalContextService` and injected into the AI.
- **Causal Analysis:** `CausalAnalysisService` identifies potential causes for health anomalies, integrating active experiments and notable behaviors to generate contextualized check-in questions.
- **Apple App Store AI Compliance:** Full system for managing user consent for sharing health data with third-party AI services, including consent screens, middleware, settings toggles, attribution, and privacy policy updates.

## External Dependencies

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