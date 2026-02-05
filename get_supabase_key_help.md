# How to Get Your Supabase Service Role Key

## Step 1: Go to Supabase Dashboard
1. Open: https://supabase.com
2. Sign in to your account
3. Select your project from the dashboard

## Step 2: Find Service Role Key
1. In your project, go to **Settings** (gear icon in left sidebar)
2. Click on **API** in the settings menu
3. You'll see two API keys:
   - `anon` (public) - This is for client-side code
   - `service_role` (secret) - This is your service role key

4. Copy the **service_role** key (it starts with `eyJ`)

## Step 3: Add to .env
Your .env file should have:
```
SUPABASE_URL=https://auibpmtquqigqcfieaiq.supabase.co
SUPABASE_SERVICE_KEY=eyJ...<your service role key>
VITE_SUPABASE_URL=https://auibpmtquqigqcfieaiq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...<your anon key>
```

## Step 4: ClickHouse Setup
For ClickHouse, you mentioned you use it for machine learning. I need:
- Your ClickHouse instance URL
- Username and password
- Database name

Could you provide your ClickHouse connection details?

## Alternative: I can help look up your keys
If you want me to help you find the exact location in the Supabase dashboard, I can provide more detailed steps or you could:
1. Go to your Supabase dashboard
2. Take a screenshot of the API settings page
3. Or just copy the service_role key and share it here (I'll help format it)

## Security Note
The service_role key has full permissions and should never be exposed to client-side code. It's only for server-side operations.