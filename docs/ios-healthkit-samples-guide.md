# iOS HealthKit Individual Sample Sync Guide

## Overview

Flō's backend aggregates individual HealthKit samples into daily metrics for certain data types that iOS doesn't automatically aggregate. This enables trend analysis and personalized insights for critical health metrics.

## Priority Metrics Requiring Individual Samples

The following metrics need to be sent as **individual samples** (not pre-aggregated):

### 1. Oxygen Saturation (SpO2)
- **HealthKit Type**: `HKQuantityTypeIdentifierOxygenSaturation`
- **Expected Unit**: Percentage (0-100) or decimal (0-1)
- **Aggregation**: Daily average
- **Backend Field**: `oxygen_saturation_pct` in `user_daily_metrics`

### 2. Respiratory Rate
- **HealthKit Type**: `HKQuantityTypeIdentifierRespiratoryRate`
- **Expected Unit**: breaths/min
- **Aggregation**: Daily average
- **Backend Field**: `respiratory_rate_bpm` in `user_daily_metrics`

### 3. Body Temperature
- **HealthKit Type**: `HKQuantityTypeIdentifierBodyTemperature`
- **Expected Unit**: Celsius or Fahrenheit (auto-converted)
- **Aggregation**: Daily average
- **Backend Field**: `body_temp_c` in `user_daily_metrics`

### 4. Basal Energy Burned
- **HealthKit Type**: `HKQuantityTypeIdentifierBasalEnergyBurned`
- **Expected Unit**: kcal
- **Aggregation**: Daily sum
- **Backend Field**: `basal_energy_kcal` in `user_daily_metrics`

### 5. Walking Heart Rate Average
- **HealthKit Type**: `HKQuantityTypeIdentifierWalkingHeartRateAverage`
- **Expected Unit**: bpm
- **Aggregation**: Daily average
- **Backend Field**: `walking_hr_avg_bpm` in `user_daily_metrics`

### 6. Dietary Water
- **HealthKit Type**: `HKQuantityTypeIdentifierDietaryWater`
- **Expected Unit**: mL
- **Aggregation**: Daily sum
- **Backend Field**: `dietary_water_ml` in `user_daily_metrics`

## API Endpoint

### POST `/api/healthkit/samples`

Send individual samples to this endpoint:

```json
{
  "samples": [
    {
      "dataType": "HKQuantityTypeIdentifierOxygenSaturation",
      "value": 0.98,
      "unit": "percent",
      "startDate": "2024-01-15T08:30:00Z",
      "endDate": "2024-01-15T08:30:00Z",
      "sourceName": "Apple Watch",
      "sourceBundleId": "com.apple.health",
      "deviceName": "Apple Watch Series 9",
      "deviceManufacturer": "Apple Inc.",
      "deviceModel": "Watch6,18",
      "uuid": "unique-sample-uuid-here"
    }
  ]
}
```

### Sample Object Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dataType` | string | Yes | HealthKit type identifier |
| `value` | number | Yes | Sample value |
| `unit` | string | Yes | Unit of measurement |
| `startDate` | ISO8601 | Yes | Sample start timestamp |
| `endDate` | ISO8601 | Yes | Sample end timestamp |
| `sourceName` | string | No | Device/app source name |
| `sourceBundleId` | string | No | Bundle ID of source app |
| `deviceName` | string | No | Device name |
| `deviceManufacturer` | string | No | Device manufacturer |
| `deviceModel` | string | No | Device model identifier |
| `uuid` | string | No | Unique sample UUID for deduplication |
| `metadata` | object | No | Additional metadata |

## Data Type Aliases

The backend accepts multiple naming conventions for data types:

| HealthKit Identifier | Alternative Names |
|---------------------|-------------------|
| `HKQuantityTypeIdentifierOxygenSaturation` | `oxygenSaturation`, `bloodOxygen` |
| `HKQuantityTypeIdentifierRespiratoryRate` | `respiratoryRate` |
| `HKQuantityTypeIdentifierBodyTemperature` | `bodyTemperature` |
| `HKQuantityTypeIdentifierBasalEnergyBurned` | `basalEnergyBurned` |
| `HKQuantityTypeIdentifierWalkingHeartRateAverage` | `walkingHeartRateAverage` |
| `HKQuantityTypeIdentifierDietaryWater` | `dietaryWater` |

## Aggregation Process

1. **Timezone-Aware**: Samples are aggregated based on the user's local date (not UTC)
2. **Automatic Aggregation**: After samples are uploaded, the backend automatically aggregates them into daily metrics
3. **Unit Conversion**: 
   - Oxygen saturation: Decimal values (0-1) are converted to percentages
   - Body temperature: Fahrenheit values (>50°F) are converted to Celsius

## Deduplication

- Include a `uuid` field to prevent duplicate samples
- The backend uses UUID for deduplication on insert
- Duplicate samples (same UUID) are silently ignored

## Background Sync Recommendation

For best results, implement background sync to capture:
- Overnight sleep-related samples (SpO2, respiratory rate)
- Continuous monitoring samples from Apple Watch
- Multiple readings throughout the day

## Implementation Notes

### Swift Example

```swift
func syncHealthKitSamples(samples: [HKSample]) async throws {
    let sampleData = samples.compactMap { sample -> [String: Any]? in
        guard let quantitySample = sample as? HKQuantitySample else { return nil }
        
        let unit = getUnit(for: quantitySample.quantityType)
        let value = quantitySample.quantity.doubleValue(for: unit)
        
        return [
            "dataType": quantitySample.quantityType.identifier,
            "value": value,
            "unit": unit.unitString,
            "startDate": ISO8601DateFormatter().string(from: quantitySample.startDate),
            "endDate": ISO8601DateFormatter().string(from: quantitySample.endDate),
            "sourceName": quantitySample.sourceRevision.source.name,
            "sourceBundleId": quantitySample.sourceRevision.source.bundleIdentifier,
            "deviceName": quantitySample.device?.name,
            "deviceManufacturer": quantitySample.device?.manufacturer,
            "deviceModel": quantitySample.device?.model,
            "uuid": quantitySample.uuid.uuidString
        ]
    }
    
    try await apiClient.post("/api/healthkit/samples", body: ["samples": sampleData])
}
```

## Response Format

```json
{
  "inserted": 5,
  "duplicates": 2,
  "message": "Samples uploaded: 5 inserted, 2 duplicates"
}
```

## Error Handling

| Status | Description |
|--------|-------------|
| 200 | Success - samples processed |
| 400 | Invalid request format |
| 401 | Unauthorized - authentication required |
| 500 | Server error |

## Testing

1. Verify samples appear in the `/api/healthkit/samples?dataType=oxygenSaturation` query
2. Check aggregated values in `/api/health/daily-metrics?date=YYYY-MM-DD`
3. Confirm trends in `/api/health/comprehensive-report`
