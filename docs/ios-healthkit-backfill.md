# iOS HealthKit Historical Backfill Implementation

## Overview

On first sync, iOS should upload ALL available HealthKit data (going back 2-3 years). Subsequent syncs should only upload data since the last sync. This enables long-term pattern analysis and correlation discovery.

## API Endpoints

### 1. Check Sync Status (Call on App Launch)

```
GET /api/healthkit/sync-status
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "backfillComplete": false,
  "backfillDate": null,
  "needsHistoricalSync": true,
  "recommendedStartDate": "2021-12-07T00:00:00.000Z"
}
```

- `needsHistoricalSync: true` → iOS should request ALL historical HealthKit data
- `needsHistoricalSync: false` → iOS should only request data since last sync
- `recommendedStartDate` → How far back to request data (3 years)

### 2. Mark Backfill Complete (Call After Historical Sync)

```
POST /api/healthkit/mark-backfill-complete
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "sampleCount": 150000,
  "startDate": "2021-12-07T00:00:00.000Z",
  "endDate": "2024-12-07T23:59:59.999Z"
}
```

**Response:**
```json
{
  "success": true,
  "backfillDate": "2024-12-07T13:51:42.153Z"
}
```

## iOS Implementation Flow

```swift
// HealthKitSyncManager.swift

class HealthKitSyncManager {
    
    func syncHealthKit() async throws {
        // 1. Check if we need historical backfill
        let syncStatus = try await checkSyncStatus()
        
        if syncStatus.needsHistoricalSync {
            // 2. First time sync - get ALL historical data
            try await performHistoricalBackfill(
                startDate: syncStatus.recommendedStartDate
            )
        } else {
            // 3. Incremental sync - only new data
            try await performIncrementalSync()
        }
    }
    
    private func checkSyncStatus() async throws -> SyncStatus {
        let url = URL(string: "https://get-flo.com/api/healthkit/sync-status")!
        var request = URLRequest(url: url)
        request.addValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(SyncStatus.self, from: data)
    }
    
    private func performHistoricalBackfill(startDate: Date) async throws {
        // Request ALL HealthKit data types from startDate to now
        let dataTypes = [
            HKQuantityType.quantityType(forIdentifier: .stepCount)!,
            HKQuantityType.quantityType(forIdentifier: .heartRate)!,
            HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKQuantityType.quantityType(forIdentifier: .restingHeartRate)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .oxygenSaturation)!,
            HKQuantityType.quantityType(forIdentifier: .respiratoryRate)!,
            HKQuantityType.quantityType(forIdentifier: .bodyTemperature)!,
            // ... add all 26 data types
        ]
        
        var totalSamples = 0
        
        for dataType in dataTypes {
            // Query ALL samples from startDate to now
            let predicate = HKQuery.predicateForSamples(
                withStart: startDate,
                end: Date(),
                options: .strictStartDate
            )
            
            let samples = try await queryHealthKitSamples(
                type: dataType,
                predicate: predicate
            )
            
            // Upload in batches of 1000
            for batch in samples.chunked(into: 1000) {
                try await uploadSamples(batch)
                totalSamples += batch.count
            }
        }
        
        // Also sync workouts and sleep
        try await syncAllWorkouts(from: startDate)
        try await syncAllSleep(from: startDate)
        
        // Mark backfill as complete
        try await markBackfillComplete(
            sampleCount: totalSamples,
            startDate: startDate,
            endDate: Date()
        )
    }
    
    private func performIncrementalSync() async throws {
        // Get last sync anchor from UserDefaults or Keychain
        let lastSyncDate = getLastSyncDate() ?? Date().addingTimeInterval(-7 * 24 * 60 * 60)
        
        // Only query data since last sync
        let predicate = HKQuery.predicateForSamples(
            withStart: lastSyncDate,
            end: Date(),
            options: .strictStartDate
        )
        
        // Sync only recent data
        // ... similar to above but with shorter time range
        
        // Save new sync anchor
        saveLastSyncDate(Date())
    }
    
    private func markBackfillComplete(
        sampleCount: Int,
        startDate: Date,
        endDate: Date
    ) async throws {
        let url = URL(string: "https://get-flo.com/api/healthkit/mark-backfill-complete")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "sampleCount": sampleCount,
            "startDate": ISO8601DateFormatter().string(from: startDate),
            "endDate": ISO8601DateFormatter().string(from: endDate)
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw SyncError.failedToMarkComplete
        }
    }
}

struct SyncStatus: Codable {
    let backfillComplete: Bool
    let backfillDate: String?
    let needsHistoricalSync: Bool
    let recommendedStartDate: Date?
}
```

## Data Types to Sync

All 26 HealthKit quantity types should be synced:

| Category | Data Types |
|----------|------------|
| Activity | stepCount, activeEnergyBurned, basalEnergyBurned |
| Heart | heartRate, restingHeartRate, heartRateVariabilitySDNN, walkingHeartRateAverage |
| Respiratory | oxygenSaturation, respiratoryRate |
| Body | bodyTemperature, bodyMass, bodyFatPercentage, leanBodyMass |
| Mobility | walkingSpeed, walkingStepLength, walkingDoubleSupportPercentage, walkingAsymmetryPercentage, appleWalkingSteadiness, sixMinuteWalkTestDistance, stairAscentSpeed, stairDescentSpeed |
| Nutrition | dietaryWater, dietaryEnergyConsumed, etc. |
| Sleep | sleepAnalysis (via /api/healthkit/sleep-samples) |
| Workouts | All workout types (via /api/healthkit/workouts/sync) |

## Best Practices

1. **Show Progress UI**: Historical backfill can take 1-5 minutes. Show a progress indicator with estimated time.

2. **Background Processing**: Use iOS background tasks to continue syncing even if app is backgrounded.

3. **Batch Uploads**: Upload samples in batches of 1000 to avoid timeouts.

4. **Error Handling**: If backfill fails, don't mark as complete. Retry on next app launch.

5. **Deduplication**: The server handles deduplication via fingerprinting, so it's safe to re-upload samples.

## Testing

To reset a user's backfill status (admin only), call:
```
POST /api/admin/reset-healthkit-backfill
{ "userId": "34226453" }
```

This will cause iOS to re-sync all historical data on next app launch.
