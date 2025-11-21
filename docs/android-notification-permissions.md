# Android Notification Permissions Setup

## Overview
Starting with Android 13 (API level 33), apps require explicit permissions to:
1. Display notifications (`POST_NOTIFICATIONS`) - ✅ Requested programmatically
2. Schedule exact alarms (`SCHEDULE_EXACT_ALARM`) - ⚠️ **Requires manual user setup**

## CRITICAL LIMITATION (Phase 1 MVP)

**Capacitor's LocalNotifications plugin cannot programmatically:**
- Check if `SCHEDULE_EXACT_ALARM` permission is granted
- Request `SCHEDULE_EXACT_ALARM` permission from the user

**Phase 1 Status:**
- ✅ **iOS**: Full programmatic permission support
- ✅ **Android POST_NOTIFICATIONS**: Programmatically requested
- ⚠️ **Android SCHEDULE_EXACT_ALARM**: Manual user setup required

**Phase 2 Enhancement:**
Consider implementing a custom Capacitor plugin to:
- Check `AlarmManager.canScheduleExactAlarms()` on Android 13+
- Deep-link users to exact alarm settings via `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` intent
- Provide in-app permission flow for Android users

**Current Limitations:**
1. The permission MUST be declared in `AndroidManifest.xml`
2. Users MUST manually enable "Alarms & reminders" in system settings
3. The app cannot detect if this permission is missing
4. Reminders may not fire at the exact scheduled time if permission is denied

## Required Configuration

### 1. AndroidManifest.xml Permissions

Add these permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Required for displaying notifications (Android 13+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- Required for scheduling exact alarms for daily reminders (Android 13+) -->
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    
    <!-- Optional: Use exact alarm (less restrictive than SCHEDULE_EXACT_ALARM) -->
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    
    <application>
        <!-- Your app configuration -->
    </application>
</manifest>
```

### 2. Permission Request Flow

The app automatically requests these permissions:

1. **POST_NOTIFICATIONS**: Requested via `LocalNotifications.requestPermissions()` on app startup
2. **SCHEDULE_EXACT_ALARM**: 
   - Declared in AndroidManifest.xml
   - User must manually enable "Alarms & reminders" in system settings
   - On Android 14+, the system may prompt automatically

### 3. User Instructions (Android 13+)

If daily reminders aren't working, users need to:

1. Open **Settings** → **Apps** → **Flō**
2. Tap **Notifications** → Enable notifications
3. Tap **Alarms & reminders** → Enable permission
4. Return to Flō app

### 4. Testing Permission Flow

```typescript
import { requestDailyReminderPermissions } from '@/services/dailyReminderListener';

// Request permissions on app startup
const result = await requestDailyReminderPermissions();

if (!result.granted) {
  // Show error: "Notification permissions denied"
}

if (result.exactAlarmsAvailable === false) {
  // Show warning: "Enable 'Alarms & reminders' in Settings"
}
```

## API Level Requirements

| Android Version | API Level | POST_NOTIFICATIONS | SCHEDULE_EXACT_ALARM |
|-----------------|-----------|-------------------|---------------------|
| Android 12 and below | ≤ 31 | Not required | Not required |
| Android 13 | 33 | **Required** | **Required** |
| Android 14+ | 34+ | **Required** | **Required** (may auto-prompt) |

## Fallback Behavior

If exact alarm permission is denied:
- App will attempt to schedule notifications with best-effort timing
- Notifications may be delayed by battery optimization
- User should enable permission for reliable daily reminders

## Development Notes

- The `SCHEDULE_EXACT_ALARM` permission is a special permission that doesn't require runtime request
- It must be declared in AndroidManifest.xml
- User must manually enable it in system settings (Android 13)
- On Android 14+, the system shows a prompt when the app tries to schedule an exact alarm
- The `USE_EXACT_ALARM` permission is an alternative that doesn't require user approval but is more restrictive (only for alarm clock apps and calendar apps)

## References

- [Android 13 notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [Schedule exact alarms](https://developer.android.com/develop/background-work/services/alarms/schedule#exact-permission-declare)
- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
