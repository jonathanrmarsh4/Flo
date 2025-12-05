# Flo HealthKit Importer

A standalone iOS app to export HealthKit data from a personal device and import it into the Flo development environment for testing.

## Purpose

This app allows developers to populate the Flo dev backend with real HealthKit data without affecting the production database. It's useful for:

- Testing AI insights with real health data
- Debugging HealthKit data flow issues
- Validating dashboard visualizations with authentic data

## Setup

### 1. Open in Xcode

```bash
cd ios-healthkit-importer
open FloHealthKitImporter.xcodeproj
```

### 2. Configure Signing

1. Select the project in Xcode
2. Go to "Signing & Capabilities"
3. Select your development team
4. Ensure HealthKit capability is enabled

### 3. Set Up Backend

Ensure the `DEV_IMPORT_API_KEY` environment variable is set on your Replit backend:

```
DEV_IMPORT_API_KEY=your-secure-random-key
```

### 4. Build & Run

1. Connect your iPhone (HealthKit requires a real device)
2. Build and run the app
3. Grant HealthKit permissions when prompted

## Usage

1. **Enter your email** - The email address of your Flo account
2. **Enter API key** - The `DEV_IMPORT_API_KEY` value
3. **Configure days** - How many days of history to import (default: 90)
4. **Tap "Start Import"**

The app will:
1. Read all available HealthKit data
2. Aggregate daily metrics
3. Process sleep nights
4. Collect workout sessions
5. Gather nutrition data
6. POST everything to `/api/dev/import-healthkit`

## Data Types Imported

### Activity
- Steps
- Active Energy
- Basal Energy
- Distance
- Flights Climbed
- Exercise Time
- Stand Time

### Body Measurements
- Weight
- Height
- BMI
- Body Fat %
- Lean Body Mass
- Waist Circumference

### Heart
- Heart Rate
- Resting Heart Rate
- Walking Heart Rate Average
- HRV (SDNN)
- VO2 Max

### Vitals
- Respiratory Rate
- Blood Oxygen (SpO2)
- Body Temperature
- Blood Pressure
- Blood Glucose

### Sleep
- Sleep stages (Core, Deep, REM, Awake)
- Sleep duration
- Sleep efficiency
- Time in bed

### Nutrition
- Calories
- Protein, Carbs, Fat
- Fiber, Sugar
- Sodium, Water
- Caffeine, Cholesterol

### Workouts
- All workout types
- Duration, Energy, Distance
- Heart rate data

## API Endpoint

```
POST /api/dev/import-healthkit
Headers:
  X-Dev-Import-Key: <DEV_IMPORT_API_KEY>
  Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "dailyMetrics": [...],
  "sleepNights": [...],
  "workouts": [...],
  "nutritionData": [...]
}
```

## Security

- The API endpoint is protected by an API key header
- Data is imported for the user identified by email
- Only works in development environment
- Not intended for production use

## Troubleshooting

### "HealthKit Access: Denied"
- Go to Settings > Privacy > Health > Flo Importer
- Enable all data categories

### "User not found"
- Ensure the email matches an existing Flo account
- The account must exist in the dev database

### "Invalid API key"
- Verify DEV_IMPORT_API_KEY is set on the backend
- Check you're using the correct server URL
