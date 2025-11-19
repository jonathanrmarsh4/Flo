# Supabase Setup Instructions

## ✅ What's Working
- **Grok 3 mini**: Successfully connected and tested ✅
- All API keys are configured correctly

## 🔧 Supabase Setup Needed

Your Supabase database needs the RAG vector search table created. Follow these steps:

### 1. Open Supabase SQL Editor
1. Go to your Supabase dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### 2. Run the Schema Setup
1. Copy the contents of `setup-supabase-schema.sql`
2. Paste into the SQL Editor
3. Click **Run** (or press Cmd/Ctrl + Enter)

### 3. Verify the Setup
After running, you should see:
- ✅ pgvector extension enabled
- ✅ health_embeddings table created
- ✅ Indexes created for performance
- ✅ Row Level Security policies configured

### 4. Test the Connection
Run the connection test again:
```bash
tsx test-connections.ts
```

You should see:
- Supabase: ✅ PASS
- Grok: ✅ PASS

## 📝 What This Enables

Once setup is complete, your app will have:
- **Vector similarity search** for finding related health patterns
- **Automatic embedding storage** when users upload blood work or sync HealthKit
- **RAG-powered insights** that discover correlations across your health data
- **Sub-millisecond vector queries** via IVFFlat index

## Need Help?

If you encounter any errors:
1. Make sure pgvector extension is enabled in Supabase (Database → Extensions)
2. Check that your SUPABASE_SERVICE_KEY has admin permissions
3. Verify you're running the SQL in the correct project
