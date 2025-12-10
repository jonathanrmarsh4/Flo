# Behavior Attribution System

## Overview

The Behavior Attribution System is a machine learning-powered engine that links health outcome anomalies to specific causal factors. When the ML engine detects an unusual health metric (e.g., +115% deep sleep), this system automatically scans all behaviors from that day to generate causal hypotheses like:

> "Light early dinner (300 cal @ 5pm vs usual 600 cal @ 7pm) + sauna session may have contributed to improved deep sleep"

## Architecture

### Data Flow

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Supabase Health   │────▶│  Daily Behavior     │────▶│  Attribution        │
│   Data Sources      │     │  Factors Table      │     │  Query Engine       │
│   (nutrition,       │     │  (ClickHouse)       │     │                     │
│   workouts, etc.)   │     │                     │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
                                                                   │
                                                                   ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Flo Oracle        │◀────│  Hypothesis         │◀────│  Anomaly            │
│   (Conversational   │     │  Generator          │     │  Attributions       │
│   Delivery)         │     │                     │     │  Table              │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

### ClickHouse Tables

#### `daily_behavior_factors`
Unified daily aggregation of all behavior types for a given user and date.

| Column | Type | Description |
|--------|------|-------------|
| health_id | String | User's health identifier |
| local_date | Date | The date of the behavior |
| factor_category | String | Category: nutrition, workout, recovery, environment, life_event, lifestyle, location |
| factor_key | String | Specific factor name (e.g., total_calories, caffeine_mg) |
| numeric_value | Float64 | Numeric value if applicable |
| string_value | String | String value if applicable |
| time_value | DateTime64 | Time value if applicable |
| deviation_from_baseline | Float64 | Percentage deviation from 30-day baseline |
| baseline_value | Float64 | The 30-day rolling average baseline |
| is_notable | UInt8 | Whether this factor is notable (deviation >= 30%) |
| source | String | Data source (healthkit, openweather, user_logged) |

#### `anomaly_attributions`
Links detected outcome anomalies to co-occurring behavior factors.

| Column | Type | Description |
|--------|------|-------------|
| attribution_id | UUID | Unique identifier |
| health_id | String | User's health identifier |
| anomaly_date | Date | Date of the outcome anomaly |
| outcome_metric | String | The metric that showed an anomaly (e.g., deep_sleep) |
| outcome_value | Float64 | The actual value recorded |
| outcome_deviation_pct | Float64 | Percentage deviation from baseline |
| attributed_factors | String | JSON array of contributing factors |
| hypothesis_text | String | Natural language explanation |
| confidence_score | Float64 | Confidence in the attribution (0-1) |
| experiment_suggested | UInt8 | Whether an experiment was suggested |
| experiment_outcome | String | confirmed, refuted, or inconclusive |
| user_feedback | String | User's feedback on the attribution |
| was_helpful | UInt8 | Whether user found it helpful |

## Factor Categories

### 1. Nutrition
- `total_calories` - Daily calorie intake
- `protein_g` - Protein intake in grams
- `carbohydrates_g` - Carbohydrate intake in grams
- `fat_total_g` - Total fat intake in grams
- `fat_saturated_g` - Saturated fat intake in grams
- `fiber_g` - Fiber intake in grams
- `sugar_g` - Sugar intake in grams
- `sodium_mg` - Sodium intake in milligrams
- `water_ml` - Water intake in milliliters
- `last_meal_time` - Time of last meal (stored as minutes since midnight for baseline calculation)
- `caffeine_mg` - Caffeine consumption
- `alcohol_g` - Alcohol consumption

**Note:** Time-based factors like `last_meal_time` are converted to numeric values (minutes since midnight) to enable proper baseline deviation calculations. For example, dinner at 5pm (300 minutes since noon) vs usual 7pm (420 minutes) shows a 120-minute earlier meal.

### 2. Workout
- `total_duration_min` - Total workout duration
- `total_calories` - Calories burned during workouts
- `workout_types` - Types of workouts performed
- `first_workout_time` - Time of first workout (morning vs evening)

### 3. Recovery
- `mindfulness_min` - Minutes of mindfulness/meditation
- `sauna` - Sauna session duration (from life_events)
- `cold_plunge` - Cold plunge duration (from life_events)
- `ice_bath` - Ice bath duration (from life_events)
- `hot_tub` - Hot tub duration (from life_events)
- `cryotherapy` - Cryotherapy duration (from life_events)
- `contrast_therapy` - Contrast therapy duration (from life_events)

### 4. Environment
- `aqi` - Air Quality Index
- `temperature_c` - Temperature in Celsius
- `humidity_pct` - Humidity percentage
- `pressure_hpa` - Barometric pressure in hPa
- `uv_index` - UV index
- `cloud_cover_pct` - Cloud cover percentage
- `wind_speed_mps` - Wind speed in meters per second

### 5. Location (Travel Detection)
- `latitude` - Current latitude
- `longitude` - Current longitude
- `city` - Current city name
- `timezone` - Current timezone

**Note:** Location changes are detected by comparing latitude/longitude deviations from baseline. Large deviations indicate travel which can significantly impact health metrics.

### 6. CGM (Continuous Glucose Monitoring)
- `avg_glucose_mg_dl` - Average daily glucose in mg/dL
- `glucose_variability` - Standard deviation of glucose readings
- `time_in_range_pct` - Percentage of time glucose was 70-180 mg/dL
- `max_glucose_mg_dl` - Maximum glucose (spike detection)
- `min_glucose_mg_dl` - Minimum glucose (low detection)
- `cgm_readings_count` - Number of CGM readings that day

### 7. Life Event
- Various user-logged events with severity scores
- Categories include stress, travel, illness, massage, etc.

### 8. Lifestyle
- `bedtime` - Time user went to bed (minutes since midnight)

## Usage

### Sync Daily Behavior Factors

```typescript
import { behaviorAttributionEngine } from './services/behaviorAttributionEngine';

// Sync a single day
await behaviorAttributionEngine.syncDailyBehaviorFactors(healthId, '2025-01-15');
```

### Generate Attribution When Anomaly Detected

```typescript
// When anomaly detection finds something notable
const hypothesis = await behaviorAttributionEngine.generateHypothesis(
  healthId,
  '2025-01-15',
  'deep_sleep',
  95.5,  // actual value in minutes
  115.0  // percentage deviation from baseline
);

if (hypothesis) {
  console.log(hypothesis.hypothesisText);
  // "Your deep sleep showed a 115% improvement on 2025-01-15. 
  //  Notable factors that day: calorie intake was 40% lower than usual (300 vs baseline 500); 
  //  Workout duration was 60% higher than usual (45 min vs baseline 28 min). 
  //  These behaviors may have contributed to this change."
}
```

### Get Recent Attributions for Oracle Context

```typescript
const recentAttributions = await behaviorAttributionEngine.getRecentAttributions(healthId, 3);
```

### Record Experiment Outcome

```typescript
await behaviorAttributionEngine.recordExperimentOutcome(
  attributionId,
  'confirmed',  // or 'refuted' or 'inconclusive'
  98.2,         // follow-up outcome value
  'The light dinner helped!'  // optional user feedback
);
```

### Backfill Historical Data

```bash
# Backfill a single user
npx tsx server/scripts/backfill-behavior-factors.ts <health_id> 90

# Backfill all users
npx tsx server/scripts/backfill-behavior-factors.ts all 90
```

## Integration with Flo Oracle

The behavior attribution insights are automatically included in the Oracle's context via `getBehaviorAttributionInsights()`. This allows the Oracle to naturally reference causal patterns when discussing health metrics with users.

Example Oracle context section:
```
BEHAVIOR ATTRIBUTION INSIGHTS (detected patterns linking behaviors to outcomes):
[Use these to provide personalized causal analysis when discussing health metrics]
• deep sleep: 115% improvement
  - nutrition total_calories: 40% lower than usual (300 vs baseline 500.0)
  - workout total_duration_min: 60% higher than usual (45 vs baseline 28.0)
  💡 Suggestion: Consider trying to replicate these conditions tomorrow to see if the improvement continues.
```

## Experiment Loop

The system supports a "n-of-1 experiment" loop:

1. **Detect**: ML engine detects outcome anomaly
2. **Attribute**: System identifies co-occurring behavior deviations
3. **Hypothesize**: Generate natural language explanation
4. **Suggest**: Recommend repeating the behaviors
5. **Track**: Monitor if user replicates the behaviors
6. **Evaluate**: Compare follow-up outcome to original
7. **Learn**: Mark hypothesis as confirmed/refuted
8. **Adjust**: Increase/decrease confidence for future attributions

## Future Enhancements

1. **Lag Analysis**: Consider behaviors from previous days (e.g., workout 2 days ago affecting recovery today)
2. **Interaction Effects**: Detect synergistic combinations (e.g., light dinner + sauna together)
3. **Seasonal Patterns**: Account for weekly, monthly, seasonal variations
4. **Personalized Sensitivity**: Learn individual user's sensitivity to each factor
5. **Supplement Tracking**: Track vitamin/supplement intake as behavior factors
6. **Location Context**: Factor in travel, altitude, timezone changes
