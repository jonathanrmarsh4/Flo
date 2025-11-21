/**
 * Supabase Table Setup for Daily Reminders
 * 
 * This table stores generated daily reminders that are delivered to mobile clients via Realtime
 * Run this SQL in your Supabase SQL Editor
 */

-- Create daily_reminders table
CREATE TABLE IF NOT EXISTS public.daily_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  body TEXT NOT NULL,
  schedule_at_ms BIGINT NOT NULL,
  delivered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE
);

-- Create index on user_id for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_reminders_user_id 
  ON public.daily_reminders(user_id);

-- Create index on delivered for cleanup queries
CREATE INDEX IF NOT EXISTS idx_daily_reminders_delivered 
  ON public.daily_reminders(delivered);

-- Create index on created_at for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_daily_reminders_created_at 
  ON public.daily_reminders(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.daily_reminders ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can read their own reminders
CREATE POLICY "Users can view own reminders"
  ON public.daily_reminders
  FOR SELECT
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Create policy: Service role can insert reminders
CREATE POLICY "Service role can insert reminders"
  ON public.daily_reminders
  FOR INSERT
  WITH CHECK (true); -- Only service role should have INSERT permission

-- Create policy: Service role can update reminders
CREATE POLICY "Service role can update reminders"
  ON public.daily_reminders
  FOR UPDATE
  USING (true); -- Only service role should have UPDATE permission

-- Create policy: Service role can delete reminders
CREATE POLICY "Service role can delete reminders"
  ON public.daily_reminders
  FOR DELETE
  USING (true); -- Only service role should have DELETE permission

-- Enable Realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_reminders;

COMMENT ON TABLE public.daily_reminders IS 'Stores AI-generated daily health reminder notifications for delivery to mobile clients';
COMMENT ON COLUMN public.daily_reminders.schedule_at_ms IS 'Unix timestamp in milliseconds for when the notification should fire in user local timezone';
COMMENT ON COLUMN public.daily_reminders.delivered IS 'True if the client has successfully scheduled the local notification';
