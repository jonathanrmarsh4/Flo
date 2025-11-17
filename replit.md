# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform that leverages AI to analyze blood work, calculate biological age, and deliver personalized health recommendations. It provides a dashboard with four intelligent tiles summarizing lab results, diagnostic studies, and HealthKit data into actionable health scores. The platform tracks health metrics over time, integrates OpenAI's GPT models for insights, and Apple HealthKit for real-time wellness data across 26 types. Key features include user authentication, comprehensive profiles, admin tools, and billing via Stripe and Apple Pay. The core purpose is to provide trusted, clear, and actionable health information.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features an Apple Human Interface Guidelines-inspired design, focusing on a mobile-first, content-focused minimalist aesthetic with 44pt touch targets. It uses Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS for components and styling.

### Technical Implementations
**Frontend:** Built with React and TypeScript using Vite, leveraging TanStack Query for server state management and Wouter for client-side routing. It includes features like biomarker insights modals, comprehensive AI-powered health reports, PDF upload for blood work parsing, an admin dashboard, mobile authentication (Apple Sign-In, Email/Password), DEXA scan display, and native iOS HealthKit integration with automatic background syncing for 26 data types. The dashboard features the new **Flōmentum tile** displaying daily health momentum scores with circular gauge visualization and zone badges. A dedicated Flōmentum screen provides detailed daily/weekly insights with factor breakdowns and personalized focus recommendations.

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API. It features a unified authentication system supporting both web (Replit Auth OIDC) and mobile (JWT) authentication, file storage via pre-signed URLs to GCS, and implements the PhenoAge biological age calculation. The backend includes a robust blood work extraction pipeline using GPT-4o with a custom normalizer, AI integration for insights, and admin endpoints. It also features a sophisticated HealthKit Readiness System, a Comprehensive Sleep Tracking System, and the new **Flōmentum Momentum Scoring System**. All three systems use iOS-side normalization, backend baseline calculation, and AI-powered scoring based on personalized baselines. The Flōmentum system calculates a 0-100 daily score based on sleep (±12 pts), activity (±16 pts), recovery (±12 pts), and red flags (-16 pts), with weekly aggregation running via cron (Monday 03:00 UTC). **The /api/healthkit/daily-metrics endpoint automatically triggers Flōmentum scoring when iOS syncs HealthKit data**, mapping userDailyMetrics fields to Flōmentum metrics and syncing to health_daily_metrics for consistency. **HealthKit data normalization uses HKStatisticsQuery with .separateBySource for deduplication, selecting the primary source (highest count) per device type to prevent double-counting from multiple sources (steps, exercise minutes)**. **Sleep tracking queries from previous day noon to current day 6PM to capture full overnight sleep sessions** (sleep typically starts the evening before the wake date). **Exercise minutes collection uses the same source deduplication strategy as steps, preventing double-counting when multiple apps track the same workout.** Sleep processing merges overlapping HealthKit intervals to calculate accurate stage durations, with proper bedtime/waketime formatting. Memory management ensures strong self capture in async HealthKit callbacks to prevent premature deallocation. All production code utilizes structured error logging.

**Data Storage:** The project uses PostgreSQL (Neon serverless) with Drizzle ORM. The schema includes tables for users, sessions, profiles, blood work, AI analysis results, diagnostic studies, body fat reference ranges, HealthKit samples, normalized HealthKit daily metrics, HealthKit metric baselines, daily readiness scores, sleep metrics, **Flōmentum tables (user_settings, health_daily_metrics, flomentum_daily, flomentum_weekly, health_baselines)**, billing information, and audit logs.

**Admin User Management:** Implements Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles. The admin dashboard provides user management (search, filter, inline editing, deletion), system overview metrics, AI API usage tracking, and audit logs, with strict security measures.

**Billing & Payments:** Integrates Stripe for credit/debit card processing and Apple Pay, with dedicated database tables for customers, subscriptions, and payments.

**Logging System:** Production-safe structured logging is implemented server-side and client-side, with environment-aware configurations.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage (GCS-compatible).
- **Neon:** Serverless PostgreSQL database.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o and GPT-5 models.

### Key Technologies/Libraries
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`, `@capacitor/*`, `capacitor-secure-storage-plugin`, `@healthpilot/healthkit`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`, `jose`, `jsonwebtoken`, `pdf-parse`.