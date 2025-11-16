# HealthKit Integration Setup Guide

## Overview

Flō now integrates with Apple HealthKit to provide enhanced health insights by combining blood work data with real-time health metrics from iOS devices.

## Supported Data Types (26 Total)

### Daily Readiness (6 types)
- Heart Rate Variability (HRV)
- Resting Heart Rate
- Respiratory Rate
- Oxygen Saturation
- Sleep Analysis
- Body Temperature

### Body Composition (6 types)
- Weight
- Height
- BMI
- Body Fat Percentage
- Lean Body Mass
- Waist Circumference

### Cardiometabolic (7 types)
- Heart Rate
- Resting Heart Rate
- Walking Heart Rate Average
- Blood Pressure (Systolic)
- Blood Pressure (Diastolic)
- Blood Glucose
- VO2 Max

### Activity (7 types)
- Steps
- Distance
- Active Calories
- Basal Energy Burned
- Flights Climbed
- Apple Exercise Time
- Apple Stand Time

## iOS Setup Instructions

### 1. Enable HealthKit in Xcode

1. Open your iOS project in Xcode:
   ```bash
   npx cap open ios
   ```

2. Select your app target in the project navigator

3. Go to the **Signing & Capabilities** tab

4. Click **+ Capability**

5. Search for and add **HealthKit**

### 2. Verify Info.plist Permissions

The following permissions have already been added to `ios/App/App/Info.plist`:

```xml
<key>NSHealthShareUsageDescription</key>
<string>Flō needs access to your health data to provide personalized insights and track your wellness metrics alongside your blood work results.</string>

<key>NSHealthUpdateUsageDescription</key>
<string>Flō would like to save health metrics and wellness data to your Apple Health app.</string>
```

### 3. Rebuild and Sync

Run the following commands to rebuild the iOS app with HealthKit:

```bash
# Clear Xcode cache
rm -rf ~/Library/Developer/Xcode/DerivedData

# Rebuild frontend
npm run build

# Sync Capacitor plugins
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### 4. Build and Run

In Xcode:
1. Press `Cmd + Shift + K` to clean build folder
2. Press `Cmd + R` to build and run on your device

## Using HealthKit in Flō

### Accessing HealthKit

Navigate to `/healthkit` in the app to:
- Check HealthKit availability
- Request permissions
- View connected health data categories
- See authorization status

### TypeScript Integration

```typescript
import { HealthKitService } from '@/services/healthkit';

// Check availability
const isAvailable = await HealthKitService.isAvailable();

// Request permissions
const authStatus = await HealthKitService.requestAuthorization({
  read: ['heartRate', 'weight', 'steps'],
  write: [],
});

// Read samples
const heartRateSamples = await HealthKitService.readSamples({
  dataType: 'heartRate',
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date().toISOString(),
  limit: 100,
});

// Get most recent sample
const latestWeight = await HealthKitService.getMostRecentSample('weight');

// Get average for last 7 days
const avgHeartRate = await HealthKitService.getAverageForLastDays('heartRate', 7);
```

## Package Details

- **Package**: `@healthpilot/healthkit`
- **Source**: https://github.com/jonathanrmarsh4/healthpilot-healthkit
- **Version**: 1.0.0
- **Plugin Version**: 7.2.8
- **Capacitor Compatibility**: ^7.0.0

## Privacy & Security

- All health data remains on the device and in Apple Health
- Users must explicitly authorize each data type
- Permissions can be revoked at any time through Apple Health settings
- HealthKit data is not accessible on simulators (requires physical iOS device)

## Testing

HealthKit integration requires:
- **Physical iOS device** (not available on iOS Simulator)
- **iOS 13.0 or later**
- **Apple Health app** installed
- **HealthKit capability** enabled in Xcode

## Troubleshooting

### HealthKit Not Available
- Ensure you're running on a physical device, not simulator
- Verify iOS version is 13.0 or later
- Check that HealthKit capability is enabled in Xcode

### Permission Denied
- Users can deny permissions, which is normal
- iOS privacy model prevents detecting denial (appears as "no data")
- Users can grant permissions later through Apple Health settings

### Build Errors
```bash
# If you see pod install errors
cd ios/App
pod install
cd ../..

# If HealthKit capability missing
# Open Xcode and manually add HealthKit capability
```

## Next Steps

Future enhancements:
- Background sync for automatic health data updates
- Write support for saving data to HealthKit
- Dashboard integration to show HealthKit metrics alongside blood work
- AI-powered insights combining both data sources
- Correlation analysis between biomarkers and daily metrics
