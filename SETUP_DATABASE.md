# Database Connection Setup Guide

## Current Issue

Your `.env` file has placeholder values that need to be replaced with your actual database connection strings.

## Required Environment Variables

### 1. DATABASE_URL (PostgreSQL/Neon)

**Format:** `postgresql://username:password@host:port/database`

**Examples:**
- **Neon Database:**
  ```
  DATABASE_URL=postgresql://user:pass@ep-xxx-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
  ```

- **Supabase Database:**
  ```
  DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
  ```

- **Local PostgreSQL:**
  ```
  DATABASE_URL=postgresql://postgres:password@localhost:5432/flo_db
  ```

### 2. SUPABASE_URL

**Format:** `https://your-project-id.supabase.co`

**Where to find it:**
1. Go to your Supabase project dashboard
2. Settings → API
3. Copy the "Project URL"

**Example:**
```
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
```

### 3. SUPABASE_SERVICE_KEY

**Format:** Long service role key (starts with `eyJ...`)

**Where to find it:**
1. Go to your Supabase project dashboard
2. Settings → API
3. Copy the "service_role" key (NOT the anon key)

**Example:**
```
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## How to Update Your .env File

1. Open the `.env` file in your editor
2. Replace the placeholder values with your actual connection strings:

```bash
# Replace this placeholder:
DATABASE_URL=postgresql://user:password@host:port/database

# With your actual connection string:
DATABASE_URL=postgresql://your-actual-connection-string-here
```

3. Do the same for `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
4. Save the file
5. Restart the server:
   ```bash
   # Stop the current server (Ctrl+C if running in foreground)
   # Then restart:
   npm run dev
   ```

## Getting Your Connection Strings

### Option 1: Neon Database
1. Log in to [neon.tech](https://neon.tech)
2. Select your project
3. Click "Connection Details"
4. Copy the connection string under "Connection string" (should include SSL mode)

### Option 2: Supabase Database
1. Log in to [supabase.com](https://supabase.com)
2. Select your project
3. Go to Settings → Database
4. Under "Connection string" → "URI", copy the connection string
5. Replace `[YOUR-PASSWORD]` with your database password

### Option 3: If You Don't Have a Database Yet

**Neon (Recommended for Quick Setup):**
1. Go to [neon.tech](https://neon.tech)
2. Sign up (free tier available)
3. Create a new project
4. Copy the connection string

**Supabase:**
1. Go to [supabase.com](https://supabase.com)
2. Sign up (free tier available)
3. Create a new project
4. Get connection details from Settings → Database

## After Updating

Once you've updated your `.env` file:

1. Restart the server:
   ```bash
   npm run dev
   ```

2. Check the logs - you should see:
   - ✅ No "Invalid URL" errors
   - ✅ No "ENOTFOUND" errors for Supabase
   - ✅ "serving on port 3000" message

3. Try logging in again - it should work!

## Security Note

⚠️ **Never commit your `.env` file to git!** It contains sensitive credentials.
The `.gitignore` file should already exclude `.env` files.


