# Running the Flō Application

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables

**Minimum Required Variables:**

Create a `.env` file in the root directory with at least:

```bash
# Database (REQUIRED)
DATABASE_URL=postgresql://user:password@host:port/database

# Supabase (REQUIRED for health features)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Port (Optional - defaults to 5000)
PORT=5000
```

**Full Configuration:**

Copy `.env.example` to `.env` and fill in all values:
```bash
cp .env.example .env
# Then edit .env with your actual values
```

### 3. Start the Development Server

```bash
npm run dev
```

The application will start on `http://localhost:5000` (or the port specified in PORT env var).

## Required Environment Variables

### Critical (App won't start without these):
- `DATABASE_URL` - PostgreSQL connection string (Neon or other Postgres DB)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key

### Important (Features disabled if missing):
- `OPENAI_API_KEY` - For OpenAI integrations
- `GOOGLE_AI_API_KEY` - For Gemini/Grok AI features
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` - For client-side Supabase

### Optional:
- API keys for integrations (Stripe, Resend, etc.)
- App Store credentials for subscriptions
- ClickHouse for analytics

## Database Setup

### Option 1: Neon Database (Recommended)
1. Create a free account at [Neon](https://neon.tech)
2. Create a new project
3. Copy the connection string (starts with `postgresql://`)
4. Set it as `DATABASE_URL` in your `.env`

### Option 2: Local PostgreSQL
1. Install PostgreSQL locally
2. Create a database
3. Set `DATABASE_URL=postgresql://user:password@localhost:5432/database_name`

### Option 3: Replit Database
If running on Replit, the `javascript_database` integration automatically provides `DATABASE_URL`

## Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Get your project URL and service role key from Settings > API
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.env`
4. Run the SQL migrations from `scripts/migrations/` in your Supabase SQL editor

## Troubleshooting

### "DATABASE_URL must be set" Error
- Make sure you have a `.env` file with `DATABASE_URL` set
- Check that the connection string is correct
- Verify the database is accessible

### "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"
- Add these to your `.env` file
- Verify the Supabase project is active

### Port Already in Use
- Change the `PORT` in `.env` to a different port (e.g., `5001`)
- Or stop the process using port 5000

### Background Schedulers Warnings
- These are expected in development
- Some features require external services (ClickHouse, etc.) to be fully functional
- The app will still run with reduced functionality

## Development vs Production

- **Development**: `npm run dev` - Hot reload, Vite dev server
- **Production**: `npm run build && npm start` - Optimized build, static serving

## Background Services

The application starts several background schedulers:
- Daily reminders
- Health insights generation
- CGM/Oura sync
- Weight forecasting
- And more...

These will log errors if required services aren't configured, but won't prevent the app from starting.



