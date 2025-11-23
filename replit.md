# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform that uses AI to analyze blood work, calculate biological age, and provide personalized health recommendations. It offers a dashboard with four intelligent tiles summarizing lab results, diagnostic studies, and HealthKit data into actionable health scores. The platform tracks health metrics, integrates OpenAI's GPT models and Apple HealthKit, and features **Flō Oracle** – a Grok-powered voice chat coach for real-time health insights. The platform includes a **Stripe-powered subscription system** with FREE and PREMIUM tiers, providing feature gating and upgrade prompts. Its core purpose is to deliver trusted, clear, and actionable health information, delivering deep health insights and market potential in personalized wellness.

## Recent Changes

### Daily Insights Engine v2.0 - Baseline Calculation Fix (Nov 23, 2025)
**Problem**: After ~10 fixes, insights became generic with no trends, baselines, percent changes, or biomarker data.

**Root Causes Identified**:
1. Overly strict 30-day baseline requirement (user had only 11 days of data)
2. Truthy checks treating zero/near-zero values as null
3. Biomarker baselines hardcoded to null instead of using historical lab tests
4. Division by zero creating Infinity values
5. Stable-at-zero metrics (0→0) reported as null instead of 0%

**Fixes Applied** (`server/services/insightsEngineV2.ts`):
1. ✅ Flexible HealthKit baseline windows with 30d → 10d → 7d cascade (lines 309-328)
2. ✅ Biomarker historical baseline calculation from all previous lab tests (lines 376-410)
3. ✅ Biomarker name normalization using `biomarkerNameToCanonicalKey()` (line 458)
4. ✅ Explicit `!== null` checks instead of truthy checks (both HealthKit and biomarkers)
5. ✅ Division by zero guards: 0→0 = 0% change, 0→X = null (lines 340-348, 401-410)
6. ✅ Comprehensive debug logging for all metrics calculations

**Expected Results**:
- Rich insights with 7-30 day trends and baselines
- Biomarker insights showing historical trends from quarterly lab tests (1-4x/year)
- Percent changes preserved for stable/zero-value metrics
- Specific targets and recommendations in NLG output
- Cross-domain insights overlaying infrequent biomarker trends with HealthKit data for disease detection

**Next Steps**: Deploy to production and validate with real user data, then implement Layer E cross-domain fusion for enhanced disease detection (overlaying infrequent biomarker trends with HealthKit divergence patterns).

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, with 44pt touch targets. It utilizes Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS. The UI includes locked tiles and paywall modals for subscription management. The admin panel includes manual insight generation controls with two buttons: "Generate Now (For Me)" for immediate admin-only generation and "Run Scheduler (All Users @ 6am)" for triggering the full scheduler.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query for server state and Wouter for routing. Key features include biomarker insights, AI-powered health reports, PDF upload for blood work parsing, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types plus individual workout sessions, and **Flō Oracle voice chat** using ElevenLabs via WebSockets. The dashboard includes a **Flōmentum tile** for daily health momentum scores and detailed daily/weekly insights.

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API. It features a unified authentication system (Replit Auth OIDC, JWT), file storage via pre-signed GCS URLs, and implements the PhenoAge biological age calculation. The backend includes a blood work extraction pipeline using GPT-4o, AI integration for insights, admin endpoints, **Flō Oracle integration** (Grok-powered chat using xAI's grok-3-mini model with comprehensive health context and safety guardrails), and **ElevenLabs integration** for natural voice conversations. Biomarker scoring uses a comprehensive alias mapping system. It also features a HealthKit Readiness System, a Comprehensive Sleep Tracking System, **Workout Session Tracking**, and the **Flōmentum Momentum Scoring System**. Production code utilizes structured error logging, and **Apple Push Notifications (APNs)** provide real-time biomarker alerts. **Stripe Billing Integration** handles subscription management with secure webhook processing, plan enforcement middleware, and automated feature gating.

**Data Storage:** Uses PostgreSQL (Neon serverless) with Drizzle ORM. The schema includes tables for users, blood work, AI analysis results, HealthKit samples, HealthKit workouts, normalized HealthKit daily metrics, Flōmentum tables, RAG Insights tables, life_events table, push notification management, billing tables (billing_customers, subscriptions, payments for Stripe integration), and audit logs.

**Daily Insights Engine v2.0:** A 4-layer analytical system generates 0-5 personalized health insights daily at 06:00 local time. It includes layers for Physiological Pathways, Bayesian Correlations, Dose-Response & Timing Analysis, and Anomaly Detection. It uses evidence-based confidence scoring, insight ranking, domain diversity limits, and natural language generation with N-of-1 experiment suggestions. The system includes admin controls for manual testing (force-generate for current user) and scheduler triggering (all users at 6am local time). User IDs are UUID strings throughout the system.

**Conversational Life Event Logging System:** Automatically tracks comprehensive health narratives from Flō Oracle conversations with dosage tracking support. Grok-powered extraction parses events into structured JSONB, logged to the `life_events` table, capturing behaviors, dosage amounts (e.g., ml, mg, mcg), symptoms, health goals, and observations. Recent events integrate into Flō Oracle's context for personalized insights.

**Admin User Management:** Implements Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles, providing user management, system overview metrics, and audit logs.

**AI Usage Analytics System:** Tracks all OpenAI and Grok API calls with token counts, costs, and latency to the `openaiUsageEvents` table. The admin dashboard displays provider-separated metrics.

**Billing & Subscription System:** Supports FREE (limited features) and PREMIUM (unlimited features) tiers. Integrates with Stripe for checkout, webhook handling, and subscription lifecycle events. Feature gating middleware enforces plan limits. Frontend components include locked tiles and paywall modals.

**Daily Reminder Notifications:** Implements programmatic notification permission flows for iOS and Android.

**iOS Shortcuts Integration:** Provides secure API key authentication for iOS Shortcuts to log events instantly. Includes pre-built shortcut templates with dosage support and a frontend settings page for API key management.

### Feature Specifications
- **Flō Oracle:** Grok-powered voice chat coach for real-time health insights with natural voice interactions via ElevenLabs.
- **HealthKit Integration:** Background syncing for 26 data types, including individual workout sessions.
- **Flōmentum:** Daily health momentum scores based on sleep, activity, recovery, and red flags.
- **Stripe Billing:** Comprehensive subscription management with feature gating.
- **Daily Insights Engine:** Personalized, evidence-based health insights generated daily.
- **Life Event Logging:** Automated tracking of conversational health events, including dosage.
- **iOS Shortcuts:** Quick logging of events via secure API keys and pre-built templates.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage.
- **Neon:** Serverless PostgreSQL database.
- **Supabase:** PostgreSQL with pgvector extension.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o and GPT-5 models for health insights, text-embedding-3-small for RAG.
- **xAI (Grok):** grok-3-mini model for Flō Oracle.
- **ElevenLabs:** Conversational AI platform for natural voice interactions.

### Key Technologies/Libraries
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`, `@capacitor/*`, `capacitor-secure-storage-plugin`, `@healthpilot/healthkit`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`, `jose`, `jsonwebtoken`, `pdf-parse`, `apns2`.