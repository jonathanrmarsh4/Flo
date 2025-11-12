# Flō - AI-Powered Health Insights Platform

## Overview

Flō is a mobile-first health analytics platform that allows users to upload blood work results and receive AI-powered insights about their biological age and health markers. The application analyzes blood test data using OpenAI's GPT models to provide personalized health recommendations and track health metrics over time.

**Core Features:**
- Blood work file upload and analysis
- Biological age calculation based on blood markers
- AI-generated health insights and recommendations
- Historical tracking of blood work results
- User authentication via Replit Auth
- Comprehensive editable user profile system with health data and AI personalization
- Admin user management with role-based access control (RBAC)
- Billing support with Stripe integration and Apple Pay

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React with TypeScript using Vite as the build tool

**UI Component System:**
- **Design System:** Based on Apple Human Interface Guidelines (HIG) for iOS-style mobile experience
- **Component Library:** Shadcn/ui (Radix UI primitives) with custom theming
- **Styling:** Tailwind CSS with custom health-focused color palette and iOS-inspired spacing system
- **State Management:** TanStack Query (React Query) for server state
- **Routing:** Wouter for lightweight client-side routing

**Design Philosophy:**
- Mobile-first with 44pt minimum touch targets
- Content-focused minimalist approach emphasizing trust and clarity
- Progressive disclosure for complex health information
- Generous spacing using Tailwind units (4, 6, 8, 12)

### Backend Architecture

**Server Framework:** Express.js with TypeScript

**API Structure:**
- RESTful endpoints organized by feature domain
- `/api/auth/*` - Authentication endpoints (Replit Auth integration)
- `/api/blood-work/*` - Blood work record management and analysis
- `/api/objects/*` - Object storage for file uploads
- `/objects/*` - Private file serving with ACL checks

**Key Architectural Decisions:**
- Monorepo structure with shared types between client and server (`/shared` directory)
- Session-based authentication using Replit's OIDC provider
- Server-side rendering in development via Vite middleware
- Production build uses static file serving with pre-compiled client bundle

### Data Storage

**Database:** PostgreSQL (via Neon serverless)

**ORM:** Drizzle ORM for type-safe database operations

**Schema Design:**
- `users` - User profiles with role (free/premium/admin) and status (active/suspended)
- `sessions` - Express session storage (connect-pg-simple)
- `profiles` - Extended user profiles with demographics, health baseline, goals, and AI personalization (1:1 with users)
- `blood_work_records` - Uploaded file metadata and processing status
- `analysis_results` - AI-generated insights stored as JSONB for flexibility
- `billing_customers` - Stripe customer records linked to users
- `subscriptions` - Stripe subscription data with status tracking
- `payments` - Payment history including Apple Pay metadata
- `audit_logs` - Admin action tracking with actionMetadata for compliance

**Rationale:** PostgreSQL chosen for structured relational data with JSONB support for flexible analysis result storage. Drizzle provides type safety while maintaining SQL transparency.

### Profile System

**Comprehensive Editable Profile:**
- **Demographics**: Date of birth (with year/month dropdown calendar covering 1900-present), sex, weight/height with metric/imperial units
- **Health Baseline**: Activity level, sleep hours, diet type, smoking status, alcohol consumption (all fields optional for incremental updates)
- **Health Goals**: Multi-select from predefined goals with add/remove functionality
- **AI Personalization**: Communication tone, insights frequency, custom focus areas (critical for tailoring AI analysis)

**UX Patterns:**
- Number inputs (weight, height, sleep) use local state with onBlur handlers to prevent mutation spam on every keystroke
- All mutations use safe defaults (`?? {}`) when spreading profile objects to prevent runtime errors
- Date picker uses useEffect to sync calendar month with profile data, preventing desync
- Section-specific PATCH endpoints for autosave functionality
- All profile schema fields are optional to support partial updates

**API Endpoints:**
- `GET /api/profile` - Fetch current user's profile
- `PATCH /api/profile/demographics` - Update date of birth, sex, weight, height, units
- `PATCH /api/profile/baseline` - Update activity, sleep, diet, smoking, alcohol (accepts partial updates)
- `PATCH /api/profile/goals` - Update health goals array
- `PATCH /api/profile/personalization` - Update tone, frequency, custom focus areas (accepts partial updates)

### Admin User Management

**Role-Based Access Control (RBAC):**
- User roles: `free`, `premium`, `admin`
- User status: `active`, `suspended`
- Admin-only routes protected by `requireAdmin` middleware
- Role validation ensures req.user.role exists before authorization check

**Admin Features:**
- User search with query filter across email and name
- Role and status filtering
- Inline editing of user roles and status via consolidated API
- Comprehensive audit logging with actionMetadata for compliance
- Admin icon (Shield) visible only to users with `role === 'admin'`

**Admin API Endpoints:**
- `GET /api/admin/users` - List/search users with filters (query, role, status, pagination)
  - Query validation: Zod schema validates `q`, `role`, `status`, `limit`, `offset` parameters
- `PATCH /api/admin/users/:id` - Update user role and/or status
  - Request validation: Zod schema validates `role?` and `status?` fields
  - Returns 404 if user not found
  - Creates audit log with actionMetadata only on successful update
- `GET /api/admin/users/:userId/billing` - View user billing information (customer, subscription, payments)

**Admin UI (/admin/users):**
- Search bar for filtering users by email or name
- Dropdown filters for role (free/premium/admin) and status (active/suspended)
- Data table with inline select controls for role/status editing
- Loading skeleton with 5 placeholder rows during data fetch
- Empty state with helpful messaging and "Clear Filters" button
- All mutations use consolidated API endpoint with proper error handling
- Success/error toasts for user feedback

**Audit Logging:**
- All admin actions tracked in `audit_logs` table
- Includes: adminId, targetUserId, action type, changes object, actionMetadata
- Logs created only after successful updates (not on failed attempts)

### Billing & Payments

**Provider:** Stripe (via Replit Stripe Integration)

**Stripe API Version:** 2025-10-29.clover

**Payment Methods:**
- Credit/debit cards via Stripe Elements
- Apple Pay automatically included in Payment Element (no separate integration needed)

**Database Schema:**
- `billing_customers` - Links users to Stripe customer IDs
- `subscriptions` - Tracks Stripe subscription data with status (incomplete, trialing, active, past_due, canceled, unpaid)
  - Includes: stripeSubscriptionId, stripePriceId, currentPeriodStart/End
- `payments` - Payment history with Apple Pay transaction metadata
  - Includes: stripePaymentIntentId, amount, currency, status
  - Apple Pay fields: applePayTransactionId, walletType

**Billing API Endpoints:**
- `POST /api/create-payment-intent` - Create Stripe PaymentIntent with card and Apple Pay support
- `POST /api/create-subscription` - Create Stripe subscription for user
- `GET /api/admin/users/:userId/billing` - Admin view of user billing info (customer, subscription, payments)

**Integration:**
- Uses Replit Stripe blueprint for automatic key management
- Environment variables: `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLIC_KEY`
- Apple Pay enabled by default in Stripe Payment Element configuration

### Authentication & Authorization

**Provider:** Replit Auth (OIDC-based)

**Implementation:**
- Passport.js strategy for OIDC authentication flow
- Session storage in PostgreSQL for persistence
- User profile synchronization on login
- Protected routes via `isAuthenticated` middleware

**Session Management:**
- 7-day cookie-based sessions
- Secure, HTTP-only cookies
- PostgreSQL-backed session store for scalability

### File Storage

**Provider:** Google Cloud Storage (via Replit Object Storage sidecar)

**Architecture:**
- Pre-signed upload URLs for direct client-to-storage uploads
- Custom ACL (Access Control List) system for per-object permissions
- Private object serving through backend proxy with access verification
- Object metadata stored in custom headers

**Flow:**
1. Client requests upload URL from server
2. Server generates pre-signed URL with ACL policy
3. Client uploads directly to GCS
4. Server stores file metadata in database
5. Subsequent access checked against ACL policy

### AI Integration

**Provider:** OpenAI (via Replit AI Integrations)

**Model:** GPT-5 for blood work analysis

**Analysis Pipeline:**
1. File uploaded to object storage
2. Server retrieves file content
3. Content sent to OpenAI with structured prompt
4. Response parsed and stored as JSONB
5. Structured data includes: biological age, insights array, metrics object, recommendations

**Prompt Engineering:**
- System role defines medical AI assistant persona
- Requests JSON-structured output with specific schema
- Analyzes biological age, health insights, blood markers, and recommendations
- Severity classification for insights (low/medium/high)

## External Dependencies

### Third-Party Services

**Replit Platform Services:**
- **Replit Auth** - OAuth 2.0 / OIDC authentication provider
- **Replit AI Integrations** - OpenAI API proxy (no API key required)
- **Replit Object Storage** - GCS-compatible object storage via sidecar (port 1106)

**Database:**
- **Neon** - Serverless PostgreSQL with WebSocket connection pooling

**Cloud Storage:**
- **Google Cloud Storage** - Object storage accessed via Replit sidecar

### Key NPM Dependencies

**Frontend:**
- `@tanstack/react-query` - Server state management
- `wouter` - Lightweight routing
- `@radix-ui/*` - Headless UI components
- `tailwindcss` - Utility-first CSS framework
- `react-hook-form` + `zod` - Form validation
- `date-fns` - Date formatting

**Backend:**
- `express` - Web server framework
- `drizzle-orm` - Type-safe ORM
- `@neondatabase/serverless` - Neon PostgreSQL driver with WebSocket support
- `passport` + `openid-client` - Authentication
- `express-session` + `connect-pg-simple` - Session management
- `@google-cloud/storage` - GCS client
- `openai` - OpenAI API client

**Development:**
- `vite` - Build tool and dev server
- `tsx` - TypeScript execution
- `esbuild` - Server bundling for production
- `drizzle-kit` - Database migrations

### Environment Variables Required

**Core Platform:**
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `ISSUER_URL` - Replit OIDC issuer URL
- `REPL_ID` - Replit project identifier

**AI Integration:**
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - AI proxy base URL
- `AI_INTEGRATIONS_OPENAI_API_KEY` - AI proxy authentication key

**Object Storage:**
- `PUBLIC_OBJECT_SEARCH_PATHS` - Public object path prefixes
- `PRIVATE_OBJECT_DIR` - Private object directory path
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - Default bucket ID

**Billing (Stripe):**
- `STRIPE_SECRET_KEY` - Stripe secret API key (server-side)
- `VITE_STRIPE_PUBLIC_KEY` - Stripe publishable key (client-side)