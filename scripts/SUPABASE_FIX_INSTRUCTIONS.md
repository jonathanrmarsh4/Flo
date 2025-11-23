# Supabase Schema Fix Instructions

## Problem
The `health_embeddings` table is missing the `content` column, causing RAG embedding sync to fail with `PGRST204` errors.

## Solution
Execute the SQL script in your Supabase dashboard to add the missing column.

---

## Step-by-Step Instructions

### 1. Log into Supabase Dashboard
- Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
- Select your Flō project

### 2. Open SQL Editor
- Click on the **SQL Editor** icon in the left sidebar (looks like `</>`)
- Click **New Query** button

### 3. Execute the Fix Script
Copy and paste the following SQL into the editor:

```sql
-- Add missing 'content' column to health_embeddings table
ALTER TABLE health_embeddings 
ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';

-- Remove default so future inserts must provide content
ALTER TABLE health_embeddings 
ALTER COLUMN content DROP DEFAULT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

### 4. Run the Query
- Click the **Run** button (or press `Ctrl+Enter` / `Cmd+Enter`)
- You should see success messages for each statement

### 5. Verify the Fix
Run this verification query:

```sql
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'health_embeddings'
ORDER BY ordinal_position;
```

You should see all these columns:
- `id` (uuid)
- `user_id` (uuid)
- `content_type` (text)
- **`content` (text)** ← The new column
- `metadata` (jsonb)
- `embedding` (vector)
- `created_at` (timestamp)

---

## Alternative: Direct PostgreSQL Connection

If you prefer to use `psql` or another PostgreSQL client:

1. Get your database connection string from Supabase Dashboard → Project Settings → Database
2. Connect using the **Transaction** connection string (not Pooler)
3. Execute the SQL from `scripts/fix-supabase-schema.sql`

---

## After Applying the Fix

Once the SQL is executed, you can verify the fix works by running:

```bash
npx tsx scripts/diagnose-supabase-schema.ts
```

You should see:
- ✅ All expected columns are present!
- ✅ Test insert succeeded!

Then the embedding sync will work and Flō Oracle will have full RAG semantic search capability! 🎉
