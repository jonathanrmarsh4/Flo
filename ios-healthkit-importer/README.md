# Flō HealthKit Importer

A standalone iOS app to export HealthKit data from a personal device and import it into the Flō development environment for testing.

## Purpose

This app allows developers to populate the Flō dev backend with real HealthKit data without affecting the production database. It's useful for:

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

1. **Enter your email** - The email address of your Flō account
2. **Enter API key** - The `DEV_IMPORT_API_KEY` value
3. **Configure days** - How many days of history to import (default: 90)
4. **Toggle raw samples** - Enable to include heart rate, vitals, etc.
5. **Tap "Start Import"**

The app will:
1. Read all available HealthKit data (70+ data types)
2. Aggregate daily metrics
3. Process sleep nights
4. Collect workout sessions
5. Gather nutrition data (38 nutrients)
6. Collect mindfulness sessions
7. Optionally collect raw samples (heart rate, vitals)
8. POST everything to `/api/dev/import-healthkit`

## Data Types Imported (70+ types)

### Activity & Movement
- Steps
- Active Energy
- Basal Energy
- Distance
- Flights Climbed
- Exercise Time
- Stand Time
- Apple Move Time

### Mobility Metrics (iOS 14+)
- Walking Speed
- Walking Step Length
- Walking Double Support %
- Walking Asymmetry %
- Apple Walking Steadiness
- Six Minute Walk Test Distance
- Stair Ascent Speed
- Stair Descent Speed

### Body Measurements
- Weight
- Height
- BMI
- Body Fat %
- Lean Body Mass
- Waist Circumference

### Heart & Cardiovascular
- Heart Rate (raw samples)
- Resting Heart Rate
- Walking Heart Rate Average
- HRV (SDNN)
- VO2 Max
- Heart Rate Recovery (1 min)
- Atrial Fibrillation Burden

### Respiratory & Vitals
- Respiratory Rate
- Blood Oxygen (SpO2)
- Body Temperature
- Blood Pressure (Systolic/Diastolic)
- Blood Glucose
- Wrist Temperature (Apple Watch sleep)

### Environmental
- Environmental Audio Exposure
- Headphone Audio Exposure

### Sleep
- Sleep stages (Core, Deep, REM, Awake, Unspecified)
- Sleep duration & efficiency
- Time in bed
- Sleep latency
- Wrist temperature during sleep
- Number of awakenings

### Mindfulness
- Mindfulness sessions (meditation, breathing exercises)
- Duration, source, timestamps

### Nutrition (38 types)

**Macronutrients:**
- Energy, Protein, Carbohydrates, Total Fat, Fiber, Sugar

**Fat Types:**
- Saturated, Monounsaturated, Polyunsaturated, Cholesterol

**Minerals:**
- Sodium, Potassium, Calcium, Iron, Magnesium, Phosphorus
- Zinc, Copper, Manganese, Selenium, Chromium
- Molybdenum, Iodine, Chloride

**Vitamins:**
- A, B6, B12, C, D, E, K
- Thiamin, Riboflavin, Niacin, Folate, Biotin, Pantothenic Acid

**Other:**
- Caffeine, Water

### Workouts
- All 75+ workout types
- Duration, Energy, Distance
- Heart rate data
- Source information

### Raw Samples (Optional)
- Heart Rate (individual readings)
- HRV samples
- Blood Pressure readings
- Blood Glucose readings
- SpO2 readings
- Respiratory Rate readings
- Body Temperature readings
- Wrist Temperature readings
- Audio Exposure readings

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
  "nutritionData": [...],
  "mindfulnessSessions": [...],
  "samples": [...]
}
```

## Security

- The API endpoint is protected by an API key header
- Data is imported for the user identified by email
- All data routes through healthStorageRouter to Supabase
- Only works in development environment
- Not intended for production use

## Troubleshooting

### "HealthKit Access: Denied"
- Go to Settings > Privacy & Security > Health > Flō Importer
- Enable all data categories

### "User not found"
- Ensure the email matches an existing Flō account
- The account must exist in the dev database

### "Invalid API key"
- Verify DEV_IMPORT_API_KEY is set on the backend
- Check you're using the correct server URL

### Timeout
- Large imports (365 days + raw samples) may take 2+ minutes
- The app sets a 120-second timeout for uploads
