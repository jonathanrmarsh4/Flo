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

**Backend:** Developed with Express.js and TypeScript, providing a RESTful API. It features a unified authentication system supporting both web (Replit Auth OIDC) and mobile (JWT) authentication, file storage via pre-signed URLs to GCS, and implements the PhenoAge biological age calculation. The backend includes a robust blood work extraction pipeline using GPT-4o with a custom normalizer, AI integration for insights, and admin endpoints. **Biomarker scoring uses a comprehensive alias mapping system** to handle different lab naming conventions (e.g., "Glucose" vs "Fasting Glucose" vs "Glucose (Fasting)", "LDL" vs "LDL Cholesterol"), ensuring consistent score calculation regardless of which variant appears on different labs' reports. It also features a sophisticated HealthKit Readiness System, a Comprehensive Sleep Tracking System, and the new **Flōmentum Momentum Scoring System**. All three systems use iOS-side normalization, backend baseline calculation, and AI-powered scoring based on personalized baselines. The Flōmentum system calculates a 0-100 daily score based on sleep (±12 pts), activity (±16 pts), recovery (±12 pts), and red flags (-16 pts), with weekly aggregation running via cron (Monday 03:00 UTC). **The /api/healthkit/daily-metrics endpoint automatically triggers Flōmentum scoring when iOS syncs HealthKit data**, mapping userDailyMetrics fields to Flōmentum metrics and syncing to health_daily_metrics for consistency. **HealthKit data normalization uses HKStatisticsQuery with .separateBySource for deduplication, selecting the primary source (highest count) per device type to prevent double-counting from multiple sources (steps, exercise minutes)**. **Sleep tracking queries from previous day noon to current day 6PM to capture full overnight sleep sessions** (sleep typically starts the evening before the wake date). **Exercise minutes collection uses the same source deduplication strategy as steps, preventing double-counting when multiple apps track the same workout.** Sleep processing merges overlapping HealthKit intervals to calculate accurate stage durations, with proper bedtime/waketime formatting. Memory management ensures strong self capture in async HealthKit callbacks to prevent premature deallocation. All production code utilizes structured error logging.

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
- **OneSignal:** Push notification delivery for iOS devices.

### Key Technologies/Libraries
- **Frontend:** `@tanstack/react-query`, `wouter`, `@radix-ui/*`, `tailwindcss`, `react-hook-form`, `zod`, `date-fns`, `@capacitor/*`, `capacitor-secure-storage-plugin`, `@healthpilot/healthkit`, `onesignal-cordova-plugin`.
- **Backend:** `express`, `drizzle-orm`, `@neondatabase/serverless`, `passport`, `openid-client`, `express-session`, `connect-pg-simple`, `@google-cloud/storage`, `openai`, `jose`, `jsonwebtoken`, `pdf-parse`, `@onesignal/node-onesignal`.
## Push Notifications (OneSignal)

Flō integrates OneSignal for push notifications to deliver Flōmentum daily scores, weekly summaries, lab results, and health insights directly to users' iOS devices.

### Architecture
- **Backend:** Node SDK (`@onesignal/node-onesignal`) sends notifications via REST API
- **Frontend:** Cordova plugin (`onesignal-cordova-plugin`) handles device registration and notification events
- **User Targeting:** External user IDs (Flō user IDs) enable user-specific targeting
- **Database:** `notification_preferences` table stores user preferences (enabled/disabled, notification times, timezone)

### Backend Implementation
- **NotificationService** (`server/services/notificationService.ts`): Handles all OneSignal API calls
- **API Endpoints** (`server/routes.ts`):
  - `GET /api/notifications/preferences`: Get user notification settings
  - `PUT /api/notifications/preferences`: Update notification preferences
  - `POST /api/notifications/register-device`: Register OneSignal player ID (device token)
  - `POST /api/notifications/test`: Send test notification
- **Auto-notification**: When iOS syncs HealthKit data via `/api/healthkit/daily-metrics`, the backend automatically calculates Flōmentum score and sends push notification if user preferences allow

### Frontend Implementation
- **PushNotificationService** (`client/src/services/pushNotifications.ts`): Singleton service managing OneSignal SDK
- **Initialization**: Automatic on app launch when user is authenticated (App.tsx)
- **Permission Handling**: Requests push notification permission on first launch
- **Notification Routing**: Deep links to relevant screens (Dashboard, Flōmentum, Labs, Insights)
- **Event Handlers**: Registered handlers for different notification types (daily score, weekly summary, health insights, lab results)

### iOS Xcode Setup (Required for Push Notifications)

**IMPORTANT:** Push notifications only work on physical iOS devices, not the Xcode simulator.

1. **Enable Push Notifications Capability**
   - Open `ios/App/App.xcodeproj` in Xcode
   - Select the App target → Signing & Capabilities
   - Click "+ Capability" → Search for "Push Notifications"
   - Add the capability (no configuration needed)

2. **Configure OneSignal App ID**
   - OneSignal App ID is set in `capacitor.config.ts` and automatically loaded from `ONESIGNAL_APP_ID` environment variable
   - No manual Xcode configuration needed - Capacitor handles this

3. **Build and Deploy**
   - Ensure you're building for a physical device (not simulator)
   - Push notifications require a valid provisioning profile with Push Notifications entitlement
   - Test on device by enabling HealthKit sync, which triggers Flōmentum scoring and push notification

4. **Testing Push Notifications**
   - Use `/api/notifications/test` endpoint to send test notification
   - Trigger Flōmentum scoring by syncing HealthKit data
   - Check notification preferences are enabled in user settings
   - Verify OneSignal player ID is registered via `/api/notifications/register-device`

### Notification Templates
- **Flōmentum Daily Score**: "Your Flōmentum Score: {score}" → Deep links to `/flomentum`
- **Flōmentum Weekly Summary**: "Your Weekly Flōmentum Summary" → Deep links to `/flomentum`
- **Health Insights**: "Health Insight: {title}" → Deep links to `/dashboard`
- **Lab Results**: "Your Lab Results Are Ready" → Deep links to `/labs`
- **Milestones**: "Milestone Achieved! 🎉" → Deep links to `/flomentum`

### Environment Variables
- `ONESIGNAL_APP_ID`: OneSignal application ID (stored in Replit Secrets)
- `ONESIGNAL_REST_API_KEY`: OneSignal REST API key for backend (stored in Replit Secrets)
- `VITE_ONESIGNAL_APP_ID`: OneSignal app ID for frontend (Vite env var, same as ONESIGNAL_APP_ID)
