# Flō - AI-Powered Health Insights Platform

## Overview
Flō is a mobile-first health analytics platform that uses AI to analyze blood work, calculate biological age, and provide personalized health recommendations. It features a dashboard-centric design with four intelligent tiles that synthesize lab results, diagnostic studies, and future HomeKit data into actionable health scores. The platform tracks health metrics over time, integrates OpenAI's GPT models for insights, and includes user authentication, a comprehensive profile system, admin tools, and billing via Stripe and Apple Pay. Its purpose is to deliver trusted, clear, and actionable health information.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The platform features an Apple Human Interface Guidelines-inspired design, focusing on a mobile-first, content-focused minimalist aesthetic with 44pt touch targets. It uses Shadcn/ui (Radix UI primitives) with custom theming and Tailwind CSS for components and styling.

### Technical Implementations
**Frontend:** Built with React and TypeScript using Vite, leveraging TanStack Query for server state management and Wouter for client-side routing (hash-based for Capacitor apps). Key features include:
- **Biomarker Insights Modal:** AI-generated recommendations (Lifestyle, Nutrition, Supplementation, Medical Referral) with caching.
- **Comprehensive Health Report:** AI-powered reports including biological age analysis, biomarker highlights, and health forecasts.
- **PDF Upload:** Drag-and-drop for blood work PDF parsing, extraction via GPT-4o with strict JSON schema validation, and visibility for failed extractions.
- **Admin Dashboard:** A 7-tab interface for managing users, billing, API usage, analytics, and audit logs.
- **Mobile Authentication:** Uses `MobileAuth.tsx` with Apple Sign-In and Email/Password, `react-hook-form` validation, and a glassmorphism design.
- **iOS WKWebView Optimization:** A multi-layer fix for rubber band overscroll bounce, ensuring a consistent background.
- **DEXA Scan Display:** Integrates into the Diagnostics page, displaying bone density T-scores, WHO classification, body fat percentage with sex-specific categorization, and visceral adipose tissue (VAT) area.

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API.
- **Authentication:** Dual system with Replit Auth (OIDC) for web and JWT tokens for mobile (Apple Sign-In/Email/Password) stored in iOS Keychain. JWTs are production-ready with privilege escalation prevention.
- **File Storage:** Uses pre-signed URLs for client-to-GCS uploads and private serving via a backend proxy.
- **PhenoAge Biological Age Calculation:** Implements the Levine et al. (2018) algorithm using 9 biomarkers, including automatic unit conversion.
- **Calculated Biomarkers:** Automatically calculates Adjusted Calcium when Calcium and Albumin are present.
- **Blood Work Extraction Pipeline:** A two-phase system using GPT-4o for raw extraction and a backend normalizer for unit conversion (Unicode-aware), profile-based reference ranges (country/sex/age), and global defaults.
- **AI Integration:** Leverages OpenAI GPT models (GPT-4o, GPT-5) for biomarker extraction, personalized insights, and comprehensive health reports.
- **Calcium Score Extraction:** Supports standard GPT-4o extraction and an experimental OCR + GPT-5 mode for scanned PDFs, with intelligent fallback. JSON schemas are manually defined for strict validation.
- **DEXA Scan Extraction:** AI-powered extraction from PDFs using GPT-4o or OCR + GPT-5 for experimental mode, with intelligent fallback and schema validation. Includes body fat categorization based on reference ranges.
- **Admin Endpoints:** Cached endpoints for various statistics and audit logs.
- **Mobile Authentication Endpoints:** 7 REST endpoints for various authentication flows (Apple Sign-In, Google Sign-In, Email/Password, password reset, account linking).
- **Dashboard Scoring System:** Calculates health scores across Cardiometabolic, Body Composition, Inflammation, and Daily Readiness (planned) areas, using biomarker aliases and latest values. The Flō Score is a weighted average.
- **Biological Age Endpoint:** Selects the blood work session with the most required PhenoAge biomarkers to calculate biological age.

### Data Storage
The project uses PostgreSQL (Neon serverless) with Drizzle ORM. The schema includes tables for users, sessions, comprehensive profiles (demographics, health baseline, goals, AI personalization), blood work records, AI analysis results (JSONB), diagnostic studies (calcium scores, DEXA scans), body fat reference ranges, billing customers, subscriptions, payments, audit logs, and authentication credentials.

### Admin User Management
Implements Role-Based Access Control (RBAC) with `free`, `premium`, and `admin` roles, and `active`, `suspended` statuses. Features include user search, filtering, inline editing, and audit logging, with admin-only routes protected by middleware.

### Billing & Payments
Utilizes Stripe (via Replit Stripe Integration) for credit/debit card processing and Apple Pay. The database schema includes `billing_customers`, `subscriptions`, and `payments` tables.

## External Dependencies

### Third-Party Services
- **Replit Platform Services:** Replit Auth, Replit AI Integrations (OpenAI proxy), Replit Object Storage (GCS-compatible).
- **Neon:** Serverless PostgreSQL database.
- **Google Cloud Storage:** For object storage.
- **Stripe:** Payment processing.
- **OpenAI:** GPT-4o and GPT-5 models.

### Key Technologies/Libraries
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`, `@capacitor/*`, `capacitor-secure-storage-plugin`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`, `jose`, `jsonwebtoken`, `pdf-parse`.