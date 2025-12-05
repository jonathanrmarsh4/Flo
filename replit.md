# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first, AI-powered health analytics platform that analyzes blood work, calculates biological age, and provides personalized health recommendations. It features an intelligent dashboard, integrates with various AI models (OpenAI, Grok, Gemini), Apple HealthKit, and includes a voice chat coach, Flō Oracle. The platform utilizes a Stripe-powered subscription system with FREE and PREMIUM tiers. Flō's core purpose is to deliver trusted, clear, and actionable health information, offering deep health insights and significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, using Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS. It includes locked tiles, paywall modals, an admin panel, dark theme, restructured navigation, drag-and-drop reorderable dashboard tiles, and iOS Safe Area support.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query and Wouter. Key features include biomarker insights, AI-powered health reports, PDF upload, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types, Flō Oracle voice chat using Gemini Live API, and a Flōmentum tile for daily health momentum scores.

**Backend:** Developed with Express.js and TypeScript, offering a RESTful API. It features a unified authentication system (Replit Auth OIDC, JWT, WebAuthn Passkeys), GCS for file storage, PhenoAge calculation, GPT-4o for blood work extraction, Flō Oracle integration (Gemini 2.5 Flash for text chat, Grok for life event parsing/brain updates), ElevenLabs for voice, a HealthKit Readiness System, Comprehensive Sleep Tracking, Workout Session Tracking, Flōmentum Momentum Scoring System, Apple Push Notifications (APNs), and Stripe Billing Integration for subscriptions and feature gating.

**Data Storage:** A dual-database architecture enhances security:
- **Neon (Primary):** Stores identity data (users, sessions, email, credentials, billing, audit logs) using Drizzle ORM.
- **Supabase (Health):** Stores sensitive health data (profiles, biomarkers, HealthKit, DEXA, life events) linked via a pseudonymous `health_id` UUID, with Row-Level Security (RLS) and separation of 12 health-related tables.

**Key Features & Systems:**
- **HealthKit Sync Expansion:** Extended iOS HealthKitNormalisationService to sync comprehensive vital signs (walkingHeartRateAvg, oxygenSaturation, respiratoryRate, bodyTemperatureCelsius, basalEnergyKcal, dietaryWaterMl), wrist temperature, mindfulness sessions, and 26 dietary HKQuantityTypes.
- **Health Data Routing:** Centralized `healthStorageRouter.ts` for all health data reads, ensuring data is retrieved from Supabase when `SUPABASE_HEALTH_ENABLED=true`.
- **Recovery Boost System:** `readinessEngine.ts` incorporates `calculateRecoveryBoost()` based on logged recovery activities (e.g., ice bath, sauna, meditation), positively impacting the readiness score.
- **Flō Oracle Context Routing:** `floOracleContextBuilder.ts` uses `healthStorageRouter` functions for all health data sources to provide comprehensive context for the AI.
- **Daily Insights Engine v2.0 (RAG-Based):** Generates personalized health insights using a 2-layer architecture (RAG Layer with Gemini 2.5 Pro and a safety net Layer D), including confidence scoring, insight ranking, and natural language generation.
- **Conversational Life Event Logging System:** Automatically tracks and parses health narratives from Flō Oracle conversations (text and voice) into structured JSONB using Gemini 2.5 Flash, stored in the `life_events` table.
- **Unified Brain Memory System:** A shared memory layer connecting Flō Oracle (Grok-based) and Daily Insights (Gemini-based) for bidirectional AI learning, using `user_insights` and `flo_chat_messages` tables.
- **Medical Document Ingestion System:** Ingests unstructured medical specialist reports, supporting 25+ document types, with PDF text extraction, GPT-4o summarization, chunking, vector embedding via text-embedding-3-small, and storage in Supabase `user_insights`. Integrated with Flō Oracle via semantic search.
- **AI Usage Analytics System:** Tracks OpenAI and Grok API calls (token counts, costs, latency) displayed in the admin dashboard.
- **Billing & Subscription System:** Supports FREE and PREMIUM tiers with StoreKit 2 (iOS) for in-app purchases and Stripe for web-based transactions.
- **Daily Reminder Notifications:** Uses Gemini 2.5 Flash for AI-driven personalized reminders based on user data, routing all health data reads through `healthStorageRouter`.
- **iOS Shortcuts Integration:** Provides secure API key authentication for iOS Shortcuts to log events, with pre-built templates.
- **Proactive AI Conversational Intelligence:** Detects user intentions in conversations using Gemini Flash, proactively follows up on requests, and integrates life context for AI personalization.
- **On-Demand Data Retrieval (Function Calling):** Flō Oracle uses Gemini function calling to fetch detailed health data when users ask specific questions. Available tools: `get_nutrition_trend`, `get_body_composition_history`, `get_workout_summary`, `get_sleep_analysis`, `get_biomarker_history`, `get_vitals_trend`, `get_life_events`, `correlate_metrics`. Enables complex queries like "how has my protein intake affected my body composition" by fetching and analyzing raw data on-demand.
- **Dev HealthKit Importer System:** Standalone iOS app (`ios-healthkit-importer/`) for populating dev environment with real HealthKit data. Exports daily metrics, sleep nights, workouts, nutrition, and raw vital sign samples. Backend endpoint `/api/dev/import-healthkit` secured with `DEV_IMPORT_API_KEY` header, routes all data through `healthStorageRouter` to Supabase. Used for testing AI insights with authentic health data without affecting production.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage.
- **Neon:** Serverless PostgreSQL database.
- **Supabase:** PostgreSQL with pgvector extension.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o for blood work PDF extraction, text-embedding-3-small for RAG embeddings.
- **xAI (Grok):** grok-3-mini model for life event parsing, async brain memory extraction, and ElevenLabs voice bridge.
- **Google AI (Gemini):** Gemini 2.5 Pro for Daily Insights, Gemini 2.5 Flash for daily reminders and Flō Oracle text chat, Gemini Live API (gemini-2.5-flash-native-audio) for Flō Oracle voice conversations.
- **ElevenLabs:** For voice synthesis.