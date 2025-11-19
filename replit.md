# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform that uses AI to analyze blood work, calculate biological age, and provide personalized health recommendations. It offers a dashboard with four intelligent tiles summarizing lab results, diagnostic studies, and HealthKit data into actionable health scores. The platform tracks health metrics, integrates OpenAI's GPT models and Apple HealthKit, and features **Flō Oracle** – a Grok-powered voice chat coach for real-time health insights. Its core purpose is to deliver trusted, clear, and actionable health information.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features a mobile-first, content-focused minimalist design inspired by Apple Human Interface Guidelines, with 44pt touch targets. It utilizes Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS.

### Technical Implementations
**Frontend:** Built with React, TypeScript, and Vite. It uses TanStack Query for server state management and Wouter for routing. Key features include biomarker insights, AI-powered health reports, PDF upload for blood work parsing, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, native iOS HealthKit integration with background syncing for 26 data types, and **Flō Oracle voice chat** (using ElevenLabs Conversational AI platform via WebSockets for natural voice interactions). The dashboard includes a **Flōmentum tile** for daily health momentum scores and a dedicated screen for detailed daily/weekly insights. HealthKit sync includes robust React Query cache invalidation and periodic 15-minute syncs.

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API. It features a unified authentication system (Replit Auth OIDC, JWT), file storage via pre-signed GCS URLs, and implements the PhenoAge biological age calculation. The backend includes a blood work extraction pipeline using GPT-4o, AI integration for insights, admin endpoints, and **Flō Oracle integration** (Grok-powered chat using xAI's grok-3-mini model with comprehensive health context injection and multi-layer safety guardrails). An **ElevenLabs integration** provides natural voice conversations. Biomarker scoring uses a comprehensive alias mapping system. It also features a HealthKit Readiness System, a Comprehensive Sleep Tracking System, and the new **Flōmentum Momentum Scoring System** (0-100 daily score based on sleep, activity, recovery, and red flags). All production code utilizes structured error logging, and **Apple Push Notifications (APNs)** provide real-time delivery of biomarker alerts.

**Data Storage:** Uses PostgreSQL (Neon serverless) with Drizzle ORM. The schema includes tables for users, blood work, AI analysis results, HealthKit samples, normalized HealthKit daily metrics, **Flōmentum tables**, **RAG Insights tables** (for discovered patterns and embeddings), **life_events table** (for conversational behavior logging), push notification management, billing, and audit logs.

**RAG Insights System:** Production-ready intelligent pattern detection using Retrieval-Augmented Generation. It vectorizes blood work and HealthKit data to Supabase as OpenAI embeddings. A SQL-based Pearson correlation engine runs nightly to discover patterns and generate "Insight Cards" categorized by health area. The top 5 most confident insights are automatically injected into Flō Oracle's conversation context.

**Conversational Life Event Logging System:** Automatically tracks health-relevant events mentioned in Flō Oracle conversations (e.g., "ice bath", "late meal"). Grok-powered extraction parses events into structured JSONB, which are logged to the `life_events` table and acknowledged by Flō Oracle. Recent events are integrated into Flō Oracle's context, and the correlation engine analyzes them against HealthKit metrics to generate insights.

**Admin User Management:** Implements Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles, providing user management, system overview metrics, AI API usage tracking, and audit logs.

**Billing & Payments:** Integrates Stripe for credit/debit card processing and Apple Pay.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage.
- **Neon:** Serverless PostgreSQL database.
- **Supabase:** PostgreSQL with pgvector extension for RAG-powered semantic health data search.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o and GPT-5 models for health insights and biomarker analysis, text-embedding-3-small for RAG vectorization.
- **xAI (Grok):** grok-3-mini model for Flō Oracle conversational health coaching.
- **ElevenLabs:** Conversational AI platform for natural voice interactions with Flō Oracle.

### Key Technologies/Libraries
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`, `@capacitor/*`, `capacitor-secure-storage-plugin`, `@healthpilot/healthkit`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`, `jose`, `jsonwebtoken`, `pdf-parse`, `apns2`.