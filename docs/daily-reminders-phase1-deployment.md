# Daily Reminders Phase 1 Deployment Checklist

## Overview
Elite Proactive Daily Reminders system for Flō - iOS-first deployment with documented Android limitations.

**Status**: Ready for deployment with Supabase table setup required

## Pre-Deployment Requirements

### 1. Environment Variables (Production)
Ensure these are set in production environment:

```bash
ENABLE_DAILY_REMINDERS=true
SUPABASE_URL=<your_supabase_project_url>
SUPABASE_SERVICE_KEY=<your_service_role_key>
XAI_API_KEY=<grok_api_key>
```

### 2. Supabase Table Setup
**CRITICAL**: Run the following SQL script in your Supabase SQL Editor before deployment:

Location: `server/db/supabase-daily-reminders-table.sql`

This creates:
- `daily_reminders` table with proper schema
- Indexes for efficient queries (user_id, delivered, created_at)
- Row Level Security (RLS) policies
- Realtime publication for client subscriptions

Verify table creation:
```sql
SELECT COUNT(*) FROM public.daily_reminders; -- Should return 0 initially
```

### 3. Database Views Verification
Confirm all required views exist in Neon database:

```sql
-- Should return 5 views
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public' AND table_name IN (
  'user_current_biomarkers',
  'user_dexa_latest',
  'user_wearable_7d',
  'user_behavior_14d',
  'user_training_load'
);
```

### 4. iOS Configuration
Verify `ios/App/App/Info.plist` contains notification permission description:

```xml
<key>NSUserNotificationsUsageDescription</key>
<string>Flō sends you personalized daily health insights based on your biomarkers, wearables, and lifestyle data to help you optimize your health journey.</string>
```

### 5. Android Configuration (Manual Setup Required for Phase 1)
See `docs/android-notification-permissions.md` for complete setup guide.

**User Must Manually**:
1. Add permissions to `android/app/src/main/AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
   <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
   ```
2. Grant exact alarm permission via Android Settings → Apps → Flō → Alarms & reminders

**Phase 2 Enhancement**: Custom Capacitor plugin for programmatic exact alarm permission request.

## System Architecture Verification

### Backend Services
1. **Scheduler Service** (`server/services/dailyReminderScheduler.ts`)
   - Runs daily at 10:00 AM UTC
   - Rate limit: max 1 reminder per user per day
   - Timezone-aware: converts UTC to user's local timezone using Temporal.ZonedDateTime

2. **Context Builder** (`server/services/reminderContextBuilder.ts`)
   - Queries 5 SQL views for comprehensive health context
   - Fixed database column name mismatches (verified Nov 21, 2025)
   - Columns verified: `sleep_7d_avg_hours`, `avg_stress_level_14d`, etc.

3. **Reminder Service** (`server/services/dailyReminderService.ts`)
   - Grok-beta integration with comprehensive safety guardrails
   - Inserts to Supabase `daily_reminders` table
   - Returns notification payload with schedule timestamp

### Frontend Client
1. **Listener Service** (`client/src/services/dailyReminderListener.ts`)
   - Subscribes to Supabase Realtime for new reminders
   - Schedules local notifications via Capacitor LocalNotifications
   - Auto-initializes on Dashboard mount for authenticated users

2. **Dashboard Integration** (`client/src/pages/dashboard.tsx`)
   - Requests notification permissions on mount (iOS)
   - Initializes reminder listener after permission grant
   - Android: POST_NOTIFICATIONS requested programmatically

## Testing Verification

### Database Schema Tests (✅ Verified)
All column name mismatches fixed:
- ✅ `sleep_7d_avg` → `sleep_7d_avg_hours`
- ✅ `sleep_30d_avg` → `sleep_30d_avg_hours`
- ✅ `stress_events_14d` → `avg_stress_level_14d`
- ✅ Removed: `late_meal_events_14d`, `exercise_7d_avg` (don't exist in views)

### Timezone Conversion Tests (✅ Verified)
Test user (Perth, UTC+8):
- UTC schedule time: 2025-11-21T02:00:00Z
- Local delivery time: 2025-11-21T10:00:00+08:00[Australia/Perth]
- DST-safe using Temporal.ZonedDateTime

### Integration Points to Test
After Supabase table setup:

1. **End-to-End Flow**:
   ```bash
   # Run manual test
   npx tsx test-reminder-generation.ts
   
   # Expected output:
   # ✅ Context built from 5 SQL views
   # ✅ Grok API call successful with comprehensive health context
   # ✅ Supabase insert successful
   # ✅ Client listener receives realtime event
   # ✅ Local notification scheduled with correct timestamp
   ```

2. **Production Monitoring**:
   - Check Grok API costs in admin dashboard (AI Usage Analytics)
   - Monitor Supabase daily_reminders table for successful inserts
   - Verify delivered=true updates from clients
   - Check iOS notifications trigger at scheduled time

## Known Limitations (Phase 1)

### Android
- **SCHEDULE_EXACT_ALARM**: Requires manual AndroidManifest.xml configuration + user settings permission
- **POST_NOTIFICATIONS**: Programmatically requested (works)
- **Phase 2**: Custom Capacitor plugin for full automation

### Rate Limiting
- Max 1 reminder per user per day (enforced by scheduler)
- No manual trigger endpoint (scheduler-only in Phase 1)

## Deployment Steps

1. ✅ Set production environment variables
2. ✅ Run Supabase table creation script
3. ✅ Verify all 5 Neon database views exist
4. ✅ Deploy backend with ENABLE_DAILY_REMINDERS=true
5. ✅ Build iOS app with notification permission flow
6. ✅ (Android) Provide setup documentation to users
7. ✅ Monitor scheduler logs for first 10:00 AM UTC run
8. ✅ Verify Supabase inserts and client notifications

## Success Criteria

- [ ] Scheduler runs daily at 10:00 AM UTC without errors
- [ ] Context builder queries all 5 views successfully
- [ ] Grok API generates relevant health insights with safety guardrails
- [ ] Supabase inserts successful with proper timestamps
- [ ] iOS clients receive notifications at correct local time (DST-aware)
- [ ] Android users receive notifications after manual permission setup
- [ ] Rate limiting prevents duplicate reminders (max 1/day/user)
- [ ] AI Usage Analytics tracks Grok costs correctly

## Rollback Plan

If issues occur:
1. Set `ENABLE_DAILY_REMINDERS=false` to disable scheduler
2. Check logs for database column errors or Supabase connection issues
3. Verify environment variables are set correctly
4. Confirm Supabase table exists and has correct schema

## Phase 2 Enhancements (Future)

1. **Android Exact Alarm Automation**: Custom Capacitor plugin
2. **Manual Trigger Endpoint**: Allow users to request reminder on-demand
3. **Notification Preferences**: User control over delivery time
4. **A/B Testing**: Compare Grok-beta vs GPT-4o for reminder quality
5. **Delivery Analytics**: Track open rates, engagement, user feedback
