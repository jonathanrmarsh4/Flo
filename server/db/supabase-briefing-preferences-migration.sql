-- Morning Briefing Preferences Migration
-- Extends profiles table with briefing-specific columns

-- Add briefing preferences columns to profiles table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'briefing_preferences') THEN
    ALTER TABLE profiles ADD COLUMN briefing_preferences JSONB DEFAULT '{
      "enabled": true,
      "notification_morning_hour": 7,
      "preferred_tone": "supportive",
      "show_weather": true,
      "show_recommendations": true
    }'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'behavior_patterns') THEN
    ALTER TABLE profiles ADD COLUMN behavior_patterns JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'constraints') THEN
    ALTER TABLE profiles ADD COLUMN constraints JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'engagement_preferences') THEN
    ALTER TABLE profiles ADD COLUMN engagement_preferences JSONB DEFAULT '{
      "high_response_focus_areas": [],
      "low_response_focus_areas": [],
      "avg_feedback_score": null
    }'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN profiles.briefing_preferences IS 'Morning briefing settings: enabled, notification hour, tone, display options';
COMMENT ON COLUMN profiles.behavior_patterns IS 'Learned patterns: caffeine_sensitivity, alcohol_hrv_impact, night_owl, three_pm_slump, etc.';
COMMENT ON COLUMN profiles.constraints IS 'Health constraints: injuries, no_high_impact, doctor_flags, medications';
COMMENT ON COLUMN profiles.engagement_preferences IS 'ML-learned preferences from briefing feedback: topics user responds to';

-- Create index for briefing-enabled users
CREATE INDEX IF NOT EXISTS idx_profiles_briefing_enabled ON profiles((briefing_preferences->>'enabled'));
