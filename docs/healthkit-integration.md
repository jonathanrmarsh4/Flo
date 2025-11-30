# HealthKit Integration Documentation

## Overview

Flō integrates with Apple HealthKit to capture comprehensive health and fitness data from iOS devices. The platform supports **91+ distinct health metrics** across multiple categories, making it one of the most complete HealthKit integrations available.

## Data Architecture

### Dual-Database Storage
- **Neon (Primary)**: Identity data, user settings, legacy health data during transition
- **Supabase (Health)**: All health data with Row-Level Security (RLS) for enhanced privacy

### Data Flow
1. iOS app syncs HealthKit data via background refresh
2. Backend receives batched samples via REST API
3. Samples stored in `healthkit_samples` table
4. Daily aggregation runs to compute metrics
5. Flomentum score calculated from aggregated data

---

## Metric Categories

### 1. Core Daily Metrics (26 fields)

Stored in `user_daily_metrics` table, aggregated daily from HealthKit samples.

| Metric | Field | Unit | Source |
|--------|-------|------|--------|
| Steps | `stepsNormalized`, `stepsRawSum` | count | HKQuantityTypeIdentifierStepCount |
| Distance | `distanceKm` | km | HKQuantityTypeIdentifierDistanceWalkingRunning |
| Active Energy | `activeEnergyKcal` | kcal | HKQuantityTypeIdentifierActiveEnergyBurned |
| Basal Energy | `basalEnergyKcal` | kcal | HKQuantityTypeIdentifierBasalEnergyBurned |
| Exercise Minutes | `exerciseMinutes` | min | HKQuantityTypeIdentifierAppleExerciseTime |
| Stand Hours | `standHours` | hours | HKQuantityTypeIdentifierAppleStandHour |
| Flights Climbed | `flightsClimbed` | count | HKQuantityTypeIdentifierFlightsClimbed |
| Resting Heart Rate | `restingHrBpm` | bpm | HKQuantityTypeIdentifierRestingHeartRate |
| Heart Rate Variability | `hrvMs` | ms | HKQuantityTypeIdentifierHeartRateVariabilitySDNN |
| Walking Heart Rate | `walkingHrBpm` | bpm | HKQuantityTypeIdentifierWalkingHeartRateAverage |
| Blood Pressure (Systolic) | `systolicMmHg` | mmHg | HKQuantityTypeIdentifierBloodPressureSystolic |
| Blood Pressure (Diastolic) | `diastolicMmHg` | mmHg | HKQuantityTypeIdentifierBloodPressureDiastolic |
| Respiratory Rate | `respiratoryRateBpm` | bpm | HKQuantityTypeIdentifierRespiratoryRate |
| Oxygen Saturation | `oxygenSaturationPct` | % | HKQuantityTypeIdentifierOxygenSaturation |
| Body Temperature | `bodyTempC` | °C | HKQuantityTypeIdentifierBodyTemperature |
| Weight | `weightKg` | kg | HKQuantityTypeIdentifierBodyMass |
| Height | `heightCm` | cm | HKQuantityTypeIdentifierHeight |
| BMI | `bmi` | kg/m² | HKQuantityTypeIdentifierBodyMassIndex |
| Body Fat Percentage | `bodyFatPct` | % | HKQuantityTypeIdentifierBodyFatPercentage |
| Lean Body Mass | `leanBodyMassKg` | kg | HKQuantityTypeIdentifierLeanBodyMass |
| Waist Circumference | `waistCircumferenceCm` | cm | HKQuantityTypeIdentifierWaistCircumference |
| Blood Glucose | `bloodGlucoseMgDl` | mg/dL | HKQuantityTypeIdentifierBloodGlucose |
| VO2 Max | `vo2Max` | mL/kg/min | HKQuantityTypeIdentifierVO2Max |
| Dietary Water | `dietaryWaterMl` | ml | HKQuantityTypeIdentifierDietaryWater |
| Sleep Hours | `sleepHours` | hours | Derived from sleep_nights |

---

### 2. Gait & Mobility Metrics (8 fields)

Added to `user_daily_metrics` table. Requires iOS 15+ for some metrics.

| Metric | Field | Unit | Source | iOS Version |
|--------|-------|------|--------|-------------|
| Walking Speed | `walkingSpeedMs` | m/s | HKQuantityTypeIdentifierWalkingSpeed | 14.0+ |
| Step Length | `walkingStepLengthM` | m | HKQuantityTypeIdentifierWalkingStepLength | 14.0+ |
| Double Support % | `walkingDoubleSupportPct` | % | HKQuantityTypeIdentifierWalkingDoubleSupportPercentage | 14.0+ |
| Walking Asymmetry | `walkingAsymmetryPct` | % | HKQuantityTypeIdentifierWalkingAsymmetryPercentage | 14.0+ |
| Walking Steadiness | `walkingSteadiness` | 0-100 | HKQuantityTypeIdentifierAppleWalkingSteadiness | **15.0+** |
| 6-Minute Walk Distance | `sixMinuteWalkDistanceM` | m | HKQuantityTypeIdentifierSixMinuteWalkTestDistance | 14.0+ |
| Stair Ascent Speed | `stairAscentSpeedMs` | m/s | HKQuantityTypeIdentifierStairAscentSpeed | 14.0+ |
| Stair Descent Speed | `stairDescentSpeedMs` | m/s | HKQuantityTypeIdentifierStairDescentSpeed | 14.0+ |

**Note**: Walking Steadiness requires iOS 15+ and must be checked before querying to avoid crashes on older devices.

---

### 3. Nutrition Metrics (38 fields)

Stored in `nutrition_daily_metrics` table. Daily totals from food logging apps.

#### Macronutrients (10 fields)
| Metric | Field | Unit |
|--------|-------|------|
| Energy | `energyKcal` | kcal |
| Carbohydrates | `carbohydratesG` | g |
| Protein | `proteinG` | g |
| Total Fat | `fatTotalG` | g |
| Saturated Fat | `fatSaturatedG` | g |
| Polyunsaturated Fat | `fatPolyunsaturatedG` | g |
| Monounsaturated Fat | `fatMonounsaturatedG` | g |
| Cholesterol | `cholesterolMg` | mg |
| Fiber | `fiberG` | g |
| Sugar | `sugarG` | g |

#### Vitamins (13 fields)
| Metric | Field | Unit |
|--------|-------|------|
| Vitamin A | `vitaminAMcg` | mcg RAE |
| Vitamin B6 | `vitaminB6Mg` | mg |
| Vitamin B12 | `vitaminB12Mcg` | mcg |
| Vitamin C | `vitaminCMg` | mg |
| Vitamin D | `vitaminDMcg` | mcg |
| Vitamin E | `vitaminEMg` | mg |
| Vitamin K | `vitaminKMcg` | mcg |
| Thiamin (B1) | `thiaminMg` | mg |
| Riboflavin (B2) | `riboflavinMg` | mg |
| Niacin (B3) | `niacinMg` | mg |
| Folate | `folateMcg` | mcg |
| Biotin | `biotinMcg` | mcg |
| Pantothenic Acid (B5) | `pantothenicAcidMg` | mg |

#### Minerals (14 fields)
| Metric | Field | Unit |
|--------|-------|------|
| Calcium | `calciumMg` | mg |
| Chloride | `chlorideMg` | mg |
| Chromium | `chromiumMcg` | mcg |
| Copper | `copperMg` | mg |
| Iodine | `iodineMcg` | mcg |
| Iron | `ironMg` | mg |
| Magnesium | `magnesiumMg` | mg |
| Manganese | `manganeseMg` | mg |
| Molybdenum | `molybdenumMcg` | mcg |
| Phosphorus | `phosphorusMg` | mg |
| Potassium | `potassiumMg` | mg |
| Selenium | `seleniumMcg` | mcg |
| Sodium | `sodiumMg` | mg |
| Zinc | `zincMg` | mg |

#### Other (1 field)
| Metric | Field | Unit |
|--------|-------|------|
| Caffeine | `caffeineMg` | mg |

---

### 4. Sleep Metrics (15 fields)

Stored in `sleep_nights` table. Per-night sleep data with stage breakdowns.

| Metric | Field | Unit | Description |
|--------|-------|------|-------------|
| Sleep Date | `sleepDate` | YYYY-MM-DD | Date sleep started |
| In Bed At | `inBedAt` | timestamp | When user got in bed |
| Asleep At | `asleepAt` | timestamp | When sleep began |
| Wake At | `wakeAt` | timestamp | When user woke up |
| Out of Bed At | `outOfBedAt` | timestamp | When user got out of bed |
| Total In Bed | `totalMinutesInBed` | min | Total time in bed |
| Total Asleep | `totalMinutesAsleep` | min | Total sleep time |
| Awake Minutes | `awakeMinutes` | min | Time awake during night |
| Deep Sleep | `deepMinutes` | min | Deep sleep stage |
| REM Sleep | `remMinutes` | min | REM sleep stage |
| Core Sleep | `coreMinutes` | min | Core/light sleep stage |
| Sleep Efficiency | `sleepEfficiency` | % | Asleep / In Bed ratio |
| Avg Heart Rate | `avgHeartRate` | bpm | Average HR during sleep |
| Avg HRV | `avgHrv` | ms | Average HRV during sleep |
| Avg Respiratory Rate | `avgRespiratoryRate` | bpm | Average RR during sleep |
| Avg Oxygen Saturation | `avgOxygenSaturation` | % | Average SpO2 during sleep |

---

### 5. Mindfulness Metrics (4 fields)

Stored in `mindfulness_daily_metrics` table. Aggregated from meditation apps.

| Metric | Field | Unit | Description |
|--------|-------|------|-------------|
| Total Minutes | `totalMinutes` | min | Total mindful minutes for day |
| Session Count | `sessionCount` | count | Number of meditation sessions |
| Avg Session | `avgSessionMinutes` | min | Average session duration |
| Longest Session | `longestSessionMinutes` | min | Longest session of the day |

Individual sessions stored in `mindfulness_sessions` table with:
- Session date/time
- Duration in minutes
- Source app
- HealthKit UUID (for deduplication)

---

## API Endpoints

### Ingestion Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/healthkit/samples` | POST | Batch upload raw HealthKit samples |
| `/api/healthkit/daily-metrics` | POST | Upload daily aggregated metrics |
| `/api/healthkit/sleep` | POST | Upload sleep night data |
| `/api/healthkit/nutrition` | POST | Batch upload nutrition samples |
| `/api/healthkit/mindfulness` | POST | Upload mindfulness sessions |

### Query Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/healthkit/metrics` | GET | Get daily metrics for date range |
| `/api/healthkit/sleep` | GET | Get sleep nights for date range |
| `/api/flomentum/today` | GET | Get today's Flomentum score |
| `/api/flomentum/history` | GET | Get Flomentum score history |

---

## Aggregation Services

### `healthkitSampleAggregator.ts`
Aggregates raw HealthKit samples into daily metrics:
- Sums: energy burned, dietary water
- Averages: heart rate, HRV, respiratory rate, oxygen saturation, gait metrics

### `nutritionMindfulnessAggregator.ts`
Aggregates nutrition and mindfulness data:
- Sums all nutrition values per day
- Counts and averages mindfulness sessions

---

## Unit Conversions

The backend automatically handles unit conversions:

| Source Unit | Target Unit | Conversion |
|-------------|-------------|------------|
| Fahrenheit | Celsius | (F - 32) × 5/9 |
| Liters | Milliliters | × 1000 |
| Decimal (0-1) | Percentage | × 100 |
| Pounds | Kilograms | × 0.453592 |
| Inches | Centimeters | × 2.54 |

---

## Deduplication

HealthKit samples are deduplicated using:
1. **HealthKit UUID**: Unique identifier from Apple
2. **Source priority**: Apple Watch > iPhone > Third-party apps
3. **Timestamp matching**: Prevent duplicate entries for same time period

---

## iOS Integration Notes

### Background Sync
- Uses `BGAppRefreshTask` for periodic background updates
- Syncs last 7 days of data on each refresh
- Rate-limited to prevent battery drain

### Version Requirements
- Minimum iOS 14.0 for core metrics
- iOS 15.0+ required for Apple Walking Steadiness
- Check `HKHealthStore.isHealthDataAvailable()` before queries

### Permissions
The app requests read access for all supported HealthKit types. Users can selectively grant/deny access per data type in iOS Settings.

---

## Future Enhancements

Potential additions:
- Workout route GPS data
- Electrocardiogram (ECG) readings
- Audiogram data
- Cycle tracking metrics
- Swimming stroke detection
- Environmental audio exposure

---

*Last updated: November 2025*
