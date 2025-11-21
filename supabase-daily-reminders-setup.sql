-- ============================================================================
-- Flō Daily Reminders - Supabase Notification Queue Table
-- ============================================================================
-- This table acts as a real-time notification queue for the iOS/web app
-- The backend inserts rows when generating daily reminders
-- The client subscribes via Supabase Realtime and schedules local notifications

-- Create the daily_reminders table
CREATE TABLE IF NOT EXISTS daily_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  schedule_at_ms bigint NOT NULL, -- Unix timestamp in milliseconds for device-local scheduling
  created_at timestamp with time zone DEFAULT now(),
  delivered boolean DEFAULT false -- Marked true by client after scheduling notification
);

-- Create indexes for performance
CREATE INDEX idx_daily_reminders_user_id ON daily_reminders(user_id);
CREATE INDEX idx_daily_reminders_created_at ON daily_reminders(created_at DESC);
CREATE INDEX idx_daily_reminders_delivered ON daily_reminders(delivered) WHERE delivered = false;

-- Enable Row Level Security
ALTER TABLE daily_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own reminders
CREATE POLICY "Users can read own reminders"
  ON daily_reminders
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- RLS Policy: Only service role can insert reminders (blocks client inserts)
-- Note: Service key bypasses RLS, but this policy explicitly denies anon key inserts
CREATE POLICY "Service role can insert reminders"
  ON daily_reminders
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policy: Users can update delivery status of their own reminders
CREATE POLICY "Users can mark own reminders as delivered"
  ON daily_reminders
  FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Enable Realtime for this table (critical for instant notification delivery)
ALTER PUBLICATION supabase_realtime ADD TABLE daily_reminders;

-- Create a function to auto-cleanup old delivered reminders (keep last 7 days only)
CREATE OR REPLACE FUNCTION cleanup_old_reminders()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM daily_reminders
  WHERE delivered = true
    AND created_at < now() - INTERVAL '7 days';
END;
$$;

-- Optional: Schedule cleanup to run daily (requires pg_cron extension)
-- Uncomment if you want automatic cleanup:
-- SELECT cron.schedule(
--   'cleanup-old-daily-reminders',
--   '0 2 * * *', -- Runs at 2 AM UTC daily
--   $$SELECT cleanup_old_reminders();$$
-- );

COMMENT ON TABLE daily_reminders IS 'Queue for Grok-generated daily health reminders, consumed by iOS/web app via Realtime';
COMMENT ON COLUMN daily_reminders.schedule_at_ms IS 'Unix timestamp in milliseconds - client converts to device local time for notification scheduling';
COMMENT ON COLUMN daily_reminders.delivered IS 'Set to true by client after successfully scheduling the local notification';
