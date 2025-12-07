# Flō - AI-Powered Health Insights Platform

## Overview
Flō is an AI-powered, mobile-first health analytics platform that processes blood work, calculates biological age, and delivers personalized health recommendations. It features an intelligent dashboard, integrates with major AI models (OpenAI, Grok, Gemini), Apple HealthKit, and includes a voice-activated AI coach, Flō Oracle. The platform operates on a Stripe-powered freemium subscription model. Flō's primary goal is to provide trustworthy, clear, and actionable health information, offering profound health insights and capitalizing on the significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform adopts a mobile-first, content-focused minimalist design, drawing inspiration from Apple Human Interface Guidelines. It uses Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS, featuring locked tiles, paywall modals, an admin panel, dark theme, reorderable dashboard tiles, and iOS Safe Area support.

### Technical Implementations
**Frontend:** Developed with React, TypeScript, and Vite, utilizing TanStack Query and Wouter. Key functionalities include biomarker insights, AI health reports, PDF upload, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types, Flō Oracle voice chat (Gemini Live API), and a Flōmentum tile for daily health momentum scores.

**Backend:** Built with Express.js and TypeScript, providing a RESTful API. It incorporates a unified authentication system (Replit Auth OIDC, JWT, WebAuthn Passkeys), GCS for file storage, PhenoAge calculation, GPT-4o for blood work extraction, Flō Oracle integration (Gemini 2.5 Flash for text, Grok for life event parsing), ElevenLabs for voice, a HealthKit Readiness System, comprehensive sleep and workout tracking, Flōmentum scoring, Apple Push Notifications (APNs), and Stripe Billing for subscriptions.

**Data Storage:** A dual-database architecture:
- **Neon (Primary):** Stores identity data (users, sessions, billing, audit logs) using Drizzle ORM.
- **Supabase (Health):** Stores sensitive health data (profiles, biomarkers, HealthKit, DEXA, life events) with Row-Level Security (RLS) and linked via a pseudonymous `health_id`.

**Key Features & Systems:**
- **HealthKit Sync Expansion:** Comprehensive syncing of vital signs, wrist temperature, mindfulness, and 26 dietary HKQuantityTypes.
- **Recovery Boost System:** Calculates readiness scores based on logged recovery activities.
- **Flō Oracle Context Routing:** Centralized `floOracleContextBuilder.ts` for comprehensive AI context.
- **Real-Time Trend Detection:** Identifies significant changes in HRV, RHR, sleep, steps, and active calories by comparing recent metrics against baseline data.
- **Daily Insights Engine v2.0 (RAG-Based):** Generates personalized health insights using a 2-layer architecture with Gemini 2.5 Pro.
- **Conversational Life Event Logging System:** Parses health narratives from Flō Oracle conversations into structured JSONB using Gemini 2.5 Flash.
- **Unified Brain Memory System:** Shared memory layer connecting Flō Oracle and Daily Insights for bidirectional AI learning.
- **Medical Document Ingestion System:** Processes unstructured medical reports (25+ types) using GPT-4o for summarization, embedding, and semantic search integration with Flō Oracle.
- **Lab Unit Display Toggle:** Users can switch between viewing biomarker values in original lab units (as reported on their lab test) or standardized canonical units for easier comparison across different labs. Toggle persists via localStorage. When raw reference ranges are unavailable, the system gracefully falls back to canonical reference ranges.
- **Billing & Subscription System:** Supports FREE and PREMIUM tiers via StoreKit 2 (iOS) and Stripe (web).
- **Daily Reminder Notifications:** AI-driven personalized reminders using Gemini 2.5 Flash.
- **On-Demand Data Retrieval (Function Calling):** Flō Oracle uses Gemini function calling to fetch specific health data (e.g., `get_nutrition_trend`, `get_biomarker_history`) for complex queries.
- **Environmental Data Integration:** Correlates OpenWeather data (temperature, AQI) with health metrics, influencing Flō Oracle context and Readiness Engine scores.
- **Synthetic CGM Training Data:** Uses simglucose (UVA/Padova diabetes simulator) to generate realistic glucose data for ML training. Features 13 virtual patients across multiple scenarios (normal, high/low carb, skipped meals, exercise). Clinical thresholds: hypo<70, severe hypo<54, hyper>180, severe hyper>250 mg/dL. Admin endpoints: `POST /api/admin/clickhouse/synthetic-cgm/generate`, `GET .../stats`, `DELETE .../clear`.
- **CGM Pattern Learner (ML Model):** Statistical learning system that trains on synthetic CGM data to establish baselines before real users send glucose readings. Computes hourly baselines (mean, std, percentiles by hour-of-day), global population baselines, scenario-specific patterns (normal, high/low carb, exercise, skipped meals), and variability norms (typical min/max range). Trained patterns are stored in ClickHouse `cgm_learned_baselines` table and used to improve anomaly detection confidence scores (10% boost when trained model available). Admin endpoints: `POST /api/admin/clickhouse/cgm-model/train`, `GET .../baselines`.
- **ClickHouse ML Correlation Engine:** High-performance analytics for anomaly detection, predictive insights, and long-term pattern recognition using a comprehensive data warehouse (12 tables: health_metrics, nutrition_metrics, biomarkers, life_events, environmental_data, body_composition, user_demographics, readiness_scores, training_load, cgm_glucose, pattern_library, pattern_occurrences). Features include:
  - **Full History Sync:** Syncs complete user history (up to 5+ years) for long-term pattern analysis. Admin endpoint: `POST /api/admin/clickhouse/backfill-full-history`
  - **Pattern Memory System:** Stores and matches recurring health patterns using fingerprinting and similarity scoring. Enables "we've seen this pattern before" detection (e.g., "this HRV pattern preceded illness last November")
  - **Seasonal Pattern Detection:** Identifies cyclical trends by season (winter, spring, summer, fall) across health metrics
  - **Pattern Context for Flō Oracle:** Enriches AI responses with pattern memory context via `getPatternContextForOracle()`
  - **Real-time Auto-sync:** Triggers on all data ingestion endpoints (non-blocking)
  - **90-day Baseline + Z-score Anomaly Detection:** Multi-metric pattern recognition with ACWR training load analysis
  - **Proactive Anomaly Alerts:** Flō Oracle proactively addresses NEW anomalies at conversation start. Anomalies detected after user's last conversation are marked [NEW] and announced at session open; older anomalies are marked [PREVIOUSLY DISCUSSED] and only referenced when relevant. Logic compares anomaly `detected_at` timestamp vs last chat message timestamp.
  - Data pipeline: iOS → Supabase (PHI storage) → ClickHouse auto-sync → Pattern matching → Anomaly detection → LLM feedback generation
- **Self-Improvement Engine (SIE):** An admin-only sandbox AI (Gemini 2.5 Pro) for product improvement suggestions, featuring dynamic data introspection, verbal output, and a brainstorming chat mode.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage.
- **Neon:** Serverless PostgreSQL database.
- **Supabase:** PostgreSQL with pgvector extension.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o, text-embedding-3-small.
- **xAI (Grok):** grok-3-mini.
- **Google AI (Gemini):** Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini Live API (gemini-2.5-flash-native-audio).
- **ElevenLabs:** Voice synthesis.
- **OpenWeather:** Current Weather, Air Pollution, and Historical Weather APIs.
- **ClickHouse Cloud:** High-performance columnar database.