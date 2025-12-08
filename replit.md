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
- **AI-Powered Insights:** Includes a Daily Insights Engine (RAG-based, Gemini 2.5 Pro), Conversational Life Event Logging (Gemini 2.5 Flash), Real-Time Trend Detection, and a Unified Brain Memory System for bidirectional AI learning.
- **Flō Oracle Enhancements:** Centralized context routing, conversation memory, and on-demand data retrieval via Gemini function calling.
- **Medical Data Processing:** Medical Document Ingestion using GPT-4o for summarization and semantic search, and Lab Unit Display Toggle for user preference.
- **Machine Learning Models:**
    - **CGM Pattern Learner:** Trains on synthetic glucose data from simglucose for baseline establishment and anomaly detection.
    - **Biomarker Pattern Learner:** Trains blood work baselines from CDC NHANES population data.
    - **HealthKit Pattern Learner:** Trains wearable/activity baselines from synthetic data.
- **ClickHouse ML Correlation Engine:** High-performance analytics for anomaly detection, predictive insights, and long-term pattern recognition. Features full history sync, pattern memory, seasonal pattern detection, real-time auto-sync, 90-day baseline + Z-score anomaly detection, and proactive anomaly alerts.
- **Long-Horizon Correlation Engine:** Discovers statistically significant behavior-outcome correlations over months using Mann-Whitney U test. Now includes subjective survey data (Energy, Clarity, Mood) as outcome metrics, enabling correlations like "afternoon workouts correlate with 8% higher energy levels" or "consistent bedtime correlates with improved mental clarity."
- **User Engagement:** AI Feedback Questions (1-10 scale responses stored in ClickHouse `user_feedback` table), Daily 3PM Subjective Survey (synced to ClickHouse `subjective_surveys` and aggregated into `weekly_outcome_rollups` for ML correlation), and Daily Reminder Notifications.
- **Environmental Data Integration:** Correlates OpenWeather data with health metrics.
- **HealthKit Sample Deduplication:** Server-side fingerprint-based deduplication for HealthKit samples.
- **Self-Improvement Engine (SIE):** Admin-only sandbox AI for product improvement suggestions.

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