# Flō - AI-Powered Health Insights Platform

## Overview

Flō is a mobile-first health analytics platform that allows users to upload blood work results and receive AI-powered insights about their biological age and health markers. The application analyzes blood test data using OpenAI's GPT models to provide personalized health recommendations and track health metrics over time.

**Core Features:**
- Blood work file upload and analysis
- Biological age calculation based on blood markers
- AI-generated health insights and recommendations
- Historical tracking of blood work results
- User authentication via Replit Auth

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
- `users` - User profiles (Replit Auth integration)
- `sessions` - Express session storage (connect-pg-simple)
- `blood_work_records` - Uploaded file metadata and processing status
- `analysis_results` - AI-generated insights stored as JSONB for flexibility

**Rationale:** PostgreSQL chosen for structured relational data with JSONB support for flexible analysis result storage. Drizzle provides type safety while maintaining SQL transparency.

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

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `ISSUER_URL` - Replit OIDC issuer URL
- `REPL_ID` - Replit project identifier
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - AI proxy base URL
- `AI_INTEGRATIONS_OPENAI_API_KEY` - AI proxy authentication key
- `PUBLIC_OBJECT_SEARCH_PATHS` - (Optional) Public object path prefixes