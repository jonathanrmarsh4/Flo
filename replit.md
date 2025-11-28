# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first AI-powered health analytics platform that analyzes blood work, calculates biological age, and provides personalized health recommendations. It features a dashboard with intelligent tiles summarizing lab results, diagnostic studies, and HealthKit data into actionable health scores. Key capabilities include integration with OpenAI's GPT models and Apple HealthKit, and **Flō Oracle**, a Grok-powered voice chat coach for real-time health insights. The platform incorporates a **Stripe-powered subscription system** offering FREE and PREMIUM tiers with feature gating. Flō's core purpose is to deliver trusted, clear, and actionable health information, offering deep health insights and significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, utilizing Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS. The UI includes locked tiles and paywall modals for subscription management, alongside an admin panel with manual insight generation controls. A recent dark theme overhaul updated AI Insights, Actions, and related components with new design specifications, including specific gradients, backgrounds, and text hierarchy. Navigation was restructured to separate Daily Insights (modal) from Action Plan (dedicated page), and dashboard tiles now support drag-and-drop reordering with persistence.

**iOS Safe Area Support:** All headers on Profile, Admin Dashboard, Actions, and Diagnostics screens use `pt-[env(safe-area-inset-top)]` to position content below the Dynamic Island/notch. The `client/index.html` viewport meta tag includes `viewport-fit=cover` to enable safe area CSS variables in Capacitor's iOS WebView. **IMPORTANT:** Changes to the viewport configuration require rebuilding the iOS app in Xcode, as these are native WebView settings. Once rebuilt, all future CSS changes (including safe area adjustments) work without app rebuilds.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query for server state and Wouter for routing. It includes biomarker insights, AI-powered health reports, PDF upload for blood work parsing, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types, and **Flō Oracle voice chat** using Gemini Live API for real-time bidirectional voice streaming with native voice understanding. The dashboard also features a **Flōmentum tile** for daily health momentum scores.

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API. It features a unified authentication system (Replit Auth OIDC, JWT), file storage via pre-signed GCS URLs, and implements the PhenoAge biological age calculation. The backend includes a blood work extraction pipeline using GPT-4o, AI integration for insights, admin endpoints, **Flō Oracle integration** (Grok-powered chat using xAI's grok-3-mini model with health context and safety guardrails), **ElevenLabs integration** for natural voice conversations, a HealthKit Readiness System, a Comprehensive Sleep Tracking System, **Workout Session Tracking**, and the **Flōmentum Momentum Scoring System**. Production code uses structured error logging and **Apple Push Notifications (APNs)**. **Stripe Billing Integration** handles subscription management, webhook processing, plan enforcement, and automated feature gating. **Password Reset Security:** Reset tokens are hashed with SHA-256 before storage and enforced single-use by clearing on successful password change, with 1-hour expiry. **Lab PDF Privacy:** Uploaded lab PDFs are automatically deleted from object storage after successful biomarker extraction to reduce storage costs and minimize privacy risks - only the extracted biomarker data is retained in the database.

**Session Data Isolation:** On login (Apple Sign-In, email login, or registration), the entire React Query cache is cleared via `queryClient.clear()` before setting up the new user session. This prevents any data leakage between user accounts.

**Data Storage:** Uses PostgreSQL (Neon serverless) with Drizzle ORM. The schema includes tables for users, blood work, AI analysis results, HealthKit samples, workouts, daily metrics, Flōmentum data, RAG Insights, life events, push notification management, billing, and audit logs.

**Daily Insights Engine v2.0 (RAG-Based):** Generates personalized health insights daily using a 2-layer architecture: **RAG Layer** (holistic cross-domain pattern discovery via vector search + **Gemini 2.5 Pro**) and **Layer D** (out-of-range biomarker safety net). It uses evidence-based confidence scoring, insight ranking, domain diversity limits, and natural language generation. The system incorporates weighted domain scoring to ensure diverse category insights, particularly for sleep and recovery, by prioritizing these metrics and relaxing HealthKit requirements for sparse data. **Automatic Timezone Sync:** The scheduler runs hourly and generates insights at 6 AM local time based on each user's stored timezone. The frontend `useTimezoneAutoSync` hook automatically detects and syncs the device timezone on app launch and resume, with 1-hour throttling for travelers crossing multiple zones. Backend stores `timezoneSource` ('device_auto' or 'manual') and `timezoneUpdatedAt` for tracking.

**Conversational Life Event Logging System:** Automatically tracks comprehensive health narratives from Flō Oracle conversations, including dosage, symptoms, and health goals, by parsing events into structured JSONB logged to the `life_events` table. These events integrate into Flō Oracle's context.

**Unified Brain Memory System:** A shared memory layer connecting Flō Oracle (Grok-based) and Daily Insights (Gemini-based) for bidirectional AI learning. Key components:
- **user_insights table:** Vector-embedded insights with source tracking (`gpt_insights`, `grok_chat`, `chat_summary`), importance levels (1-5), status management, and tags
- **flo_chat_messages table:** Conversation transcript storage for nightly summarization
- **Hybrid Retrieval:** Combines recency-based (top 10 most recent) and semantic search (top 5 by vector similarity) with deduplication
- **GPT → Brain:** Daily insights pipeline writes discoveries to brain asynchronously after generation
- **Brain → Grok:** Chat handler injects relevant insights into system prompt via `[AI_INSIGHTS]` section
- **Grok → Brain:** BRAIN_UPDATE_JSON parsing extracts and persists discoveries from chat responses
- **Nightly Summary Job:** GPT-4o analyzes chat transcripts to extract durable insights with 0.92 similarity deduplication
- **Setup Required:** Run `scripts/setup-user-insights-embeddings.sql` in Supabase to create vector search function

**Admin User Management:** Implements Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles, providing user management, system overview metrics, and audit logs.

**AI Usage Analytics System:** Tracks all OpenAI and Grok API calls with token counts, costs, and latency, stored in the `openaiUsageEvents` table and displayed in the admin dashboard.

**Billing & Subscription System:** Supports FREE (limited) and PREMIUM (unlimited) tiers with dual payment provider support:
- **StoreKit 2 (iOS):** Native in-app purchases using Apple's StoreKit 2 framework with cryptographic JWS verification. Uses `@apple/app-store-server-library` for production-grade transaction verification with embedded Apple Root CA certificates (G2, G3, Inc). Transactions are verified against Apple's certificate trust chain with OCSP revocation checking. Product IDs: `flo_premium_monthly` and `flo_premium_yearly`.
- **Stripe (Web fallback):** Standard Stripe integration for web-based purchases, checkout, and webhooks.
- **Security:** App Store transactions require JWS signature verification in production (`APP_STORE_REQUIRE_VERIFICATION=true` by default). Unverified transactions are rejected. Development mode allows decode-only with explicit warnings.

**Daily Reminder Notifications:** Implements programmatic notification permission flows for iOS and Android. Uses **Gemini 2.5 Flash** for AI-driven personalized reminders, incorporating biomarkers, HealthKit data, DEXA changes, wearables, behaviors, training load, and **Action Plan items** to generate contextual health nudges for premium users.

**iOS Shortcuts Integration:** Provides secure API key authentication for iOS Shortcuts to log events instantly, including pre-built templates with dosage support and a frontend settings page for API key management.

### Feature Specifications
- **Flō Oracle (Gemini Live):** Natural conversational voice chat using Google's Gemini Live API via WebSocket for real-time bidirectional voice streaming. Features include:
  - **WebSocket endpoint:** `/api/voice/gemini-live` with JWT authentication
  - **Audio pipeline:** MediaRecorder-based capture (WebM/Opus) to avoid feedback, 24kHz output playback
  - **Session management:** Automatic cleanup on disconnect/error to prevent resource leaks
  - **Health context injection:** Full biomarkers, HealthKit data, and life events injected into each session
  - **Brain memory integration:** Conversation transcripts persisted to `flo_chat_messages` for unified AI learning
- **HealthKit Integration:** Background syncing for 26+ data types and workout sessions, including extended daily metrics (blood pressure, blood glucose, VO2 max, distance, flights climbed, stand hours, average heart rate, height).
- **Flōmentum:** Daily health momentum scores with stand hours integration.
- **Stripe Billing:** Comprehensive subscription management and feature gating.
- **Daily Insights Engine:** Personalized, evidence-based health insights.
- **Life Event Logging:** Automated tracking of conversational health events, including dosage.
- **iOS Shortcuts:** Quick event logging via secure API keys and pre-built templates.

### Extended HealthKit Metrics (user_daily_metrics table)
The following 14 extended health metrics are now tracked from iOS HealthKit:
1. **Body Composition:** weightKg, heightCm, bmi, bodyFatPercent, leanBodyMassKg, waistCircumferenceCm
2. **Activity:** distanceMeters (walking/running), flightsClimbed, standHours (Apple Watch)
3. **Cardiovascular:** avgHeartRateBpm (daily average), systolicBp, diastolicBp (blood pressure)
4. **Metabolic:** bloodGlucoseMgDl
5. **Cardiorespiratory Fitness:** vo2Max (mL/kg/min)

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage.
- **Neon:** Serverless PostgreSQL database.
- **Supabase:** PostgreSQL with pgvector extension.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o for blood work PDF extraction, text-embedding-3-small for RAG embeddings.
- **xAI (Grok):** grok-3-mini model for Flō Oracle text chat and async brain memory extraction from voice transcripts.
- **Google AI (Gemini):** Gemini 2.5 Pro for Daily Insights generation, Gemini 2.5 Flash for daily reminder notifications, Gemini Live API (gemini-2.5-flash-native-audio) for real-time bidirectional voice streaming in Flō Oracle voice conversations.