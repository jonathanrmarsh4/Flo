# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first AI-powered health analytics platform designed to analyze blood work, calculate biological age, and provide personalized health recommendations. It features a dashboard with intelligent tiles summarizing lab results, diagnostic studies, and HealthKit data into actionable health scores. Key capabilities include integration with OpenAI's GPT models and Apple HealthKit, and **Flō Oracle**, a Grok-powered voice chat coach for real-time health insights. The platform incorporates a **Stripe-powered subscription system** offering FREE and PREMIUM tiers with feature gating. Flō's core purpose is to deliver trusted, clear, and actionable health information, offering deep health insights and significant market potential in personalized wellness.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Development Environment: User is working and testing exclusively in PRODUCTION. All bug reports and observations are from the live production app. The iOS app loads frontend from `https://get-flo.com`, so any frontend changes must be deployed to production to be visible in the mobile app.
- AI Health Commentary Policy: Flō Oracle is configured to provide evidence-based health analysis with educational disclaimers rather than blocking health insights. The AI can discuss what biomarkers might indicate, potential health patterns, and treatment options to discuss with physicians. All health-related responses include: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." Only truly dangerous patterns (specific medication prescriptions with dosages) are blocked.
- Flō Oracle Personality: Changed from conversational/therapeutic style to analytical data scientist personality. The AI now proactively searches for patterns and correlations in user data, leads with data analysis rather than general conversation, and minimizes chitchat to focus on evidence-based insights. Primary mission: Connect the dots between metrics, spot trends, and surface actionable insights from data relationships.

## Recent Changes

### RAG Insights Category Diversity Fix - Weighted Domain Scoring (Nov 23, 2025)
**Problem**: User reported 8 insights generated but ZERO sleep or recovery insights despite poor sleep trends and HRV data available. Previous first-match classification strategy caused category starvation.

**Root Cause**: The `classifyRAGInsight()` function used `determineHealthDomain()` which returned the FIRST matching domain. Mixed insights like ["Ferritin", "Sleep", "HRV"] collapsed into "biomarkers" category, starving Sleep and Recovery categories.

**Solution**: Implemented weighted domain scoring classifier to prioritize sleep/recovery metrics.

**Fixes Applied**:
1. ✅ **Increased max insights to 20** (user request): Updated RAG prompt from "5-8 insights" to "up to 20 insights"
2. ✅ **Enhanced prompt for trend analysis**:
   - Explicitly requests insights across all 4 categories: BIOMARKERS, SLEEP, RECOVERY, ACTIVITY
   - Emphasis on TRENDS over time (e.g., "sleep duration declining over past 2 weeks")
   - Focus on HRV correlations with sleep, stress, and recovery
   - Prioritize sleep and recovery pattern discovery
3. ✅ **Relaxed HealthKit requirements** (`ragInsightGenerator.ts`):
   - Changed minimum days from 14 → 10 days
   - Allow up to 3 null values per metric (4+ valid values required per week)
   - More forgiving change detection for sparse data
4. ✅ **Implemented weighted domain scoring** (`insightsEngineV2.ts`):
   - Expanded metric domain map to 45+ metrics with primary/secondary weights
   - Sleep metrics: sleep, deep sleep, REM, sleep efficiency, latency, awakenings
   - Recovery metrics: HRV, resting HR, respiratory rate
   - Performance metrics: steps, active energy, exercise, VO2 max, stand hours
   - Biomarkers organized by domain: inflammatory, hormonal, metabolic
   - Scoring system: Primary domain = +2 points, Secondary domain = +1 point
   - Priority-based tie-breaking: sleep > recovery > performance > biomarkers
   - This ensures sleep/recovery insights win ties against biomarkers

**Example Classifications**:
- `["Sleep", "HRV"]` → sleep: 2, recovery: 3 → **recovery_hrv** ✅
- `["Ferritin", "Sleep"]` → inflammatory: 2, sleep: 2 → **sleep_quality** (priority) ✅
- `["HRV", "Resting HR"]` → recovery: 4 → **recovery_hrv** ✅
- `["Ferritin"]` → inflammatory: 2 → **biomarkers** ✅

**Expected Results**:
- Up to 20 holistic insights generated daily (up from 5-8)
- Sleep insights properly categorized even when mixed with biomarkers
- Recovery/HRV insights prioritized for proper category distribution
- Comprehensive coverage across Sleep, Activity, Biomarkers, and Recovery categories

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, utilizing Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS. The UI includes locked tiles and paywall modals for subscription management, alongside an admin panel with manual insight generation controls.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite, using TanStack Query for server state and Wouter for routing. It includes biomarker insights, AI-powered health reports, PDF upload for blood work parsing, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types, and **Flō Oracle voice chat** using ElevenLabs via WebSockets. The dashboard also features a **Flōmentum tile** for daily health momentum scores.

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API. It features a unified authentication system (Replit Auth OIDC, JWT), file storage via pre-signed GCS URLs, and implements the PhenoAge biological age calculation. The backend includes a blood work extraction pipeline using GPT-4o, AI integration for insights, admin endpoints, **Flō Oracle integration** (Grok-powered chat using xAI's grok-3-mini model with health context and safety guardrails), **ElevenLabs integration** for natural voice conversations, a HealthKit Readiness System, a Comprehensive Sleep Tracking System, **Workout Session Tracking**, and the **Flōmentum Momentum Scoring System**. Production code uses structured error logging and **Apple Push Notifications (APNs)**. **Stripe Billing Integration** handles subscription management, webhook processing, plan enforcement, and automated feature gating.

**Data Storage:** Uses PostgreSQL (Neon serverless) with Drizzle ORM. The schema includes tables for users, blood work, AI analysis results, HealthKit samples, workouts, daily metrics, Flōmentum data, RAG Insights, life events, push notification management, billing, and audit logs.

**Daily Insights Engine v2.0 (RAG-Based):** Generates 0-5 personalized health insights daily at 06:00 local time using a simplified 2-layer architecture: **RAG Layer** (holistic cross-domain pattern discovery via vector search + GPT-4o) and **Layer D** (out-of-range biomarker safety net). It uses evidence-based confidence scoring, insight ranking, domain diversity limits, and natural language generation.

**Conversational Life Event Logging System:** Automatically tracks comprehensive health narratives from Flō Oracle conversations, including dosage, symptoms, and health goals, by parsing events into structured JSONB logged to the `life_events` table. These events integrate into Flō Oracle's context.

**Admin User Management:** Implements Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles, providing user management, system overview metrics, and audit logs.

**AI Usage Analytics System:** Tracks all OpenAI and Grok API calls with token counts, costs, and latency, stored in the `openaiUsageEvents` table and displayed in the admin dashboard.

**Billing & Subscription System:** Supports FREE (limited) and PREMIUM (unlimited) tiers via Stripe integration for checkout, webhooks, and subscription lifecycle events, with feature gating middleware.

**Daily Reminder Notifications:** Implements programmatic notification permission flows for iOS and Android.

**iOS Shortcuts Integration:** Provides secure API key authentication for iOS Shortcuts to log events instantly, including pre-built templates with dosage support and a frontend settings page for API key management.

### Feature Specifications
- **Flō Oracle:** Grok-powered voice chat coach with natural voice interactions via ElevenLabs.
- **HealthKit Integration:** Background syncing for 26 data types and workout sessions.
- **Flōmentum:** Daily health momentum scores.
- **Stripe Billing:** Comprehensive subscription management and feature gating.
- **Daily Insights Engine:** Personalized, evidence-based health insights.
- **Life Event Logging:** Automated tracking of conversational health events, including dosage.
- **iOS Shortcuts:** Quick event logging via secure API keys and pre-built templates.

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