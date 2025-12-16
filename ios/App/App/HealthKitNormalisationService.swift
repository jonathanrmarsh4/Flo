import Foundation
import HealthKit

/// Service for normalizing raw HealthKit data into daily aggregated metrics
/// Philosophy: Normalize first, analyze later - clean data on iOS before backend touches it
public class HealthKitNormalisationService {
    private let healthStore = HKHealthStore()
    private let calendar = Calendar.current
    
    /// Get user's current timezone
    private var userTimezone: TimeZone {
        return TimeZone.current
    }
    
    // MARK: - Oura Source Filtering
    
    /// Whether Oura is connected via OAuth API integration
    /// When true, Oura data from HealthKit is filtered to prevent double-counting
    /// When false, Oura data from HealthKit is preserved (user may only have Oura via HealthKit)
    private var isOuraConnectedViaAPI: Bool = false
    
    /// Update Oura connection status - called from sync coordinator
    /// @param connected Whether Oura is connected via direct API
    public func setOuraApiConnectionStatus(_ connected: Bool) {
        isOuraConnectedViaAPI = connected
        print("[Normalisation] Oura API connection status updated: \(connected ? "connected" : "not connected")")
        print("[Normalisation] Oura HealthKit filtering: \(connected ? "ENABLED" : "DISABLED")")
    }
    
    /// Oura source patterns to filter from activity metrics
    /// Oura Ring syncs step/activity data to HealthKit which can cause double-counting
    /// when user also has Apple Watch
    private let ouraSourcePatterns = ["oura", "ouraring", "com.ouraring"]
    
    /// Check if a source identifier or name matches Oura patterns
    /// Only returns true if Oura is connected via API (conditional filtering)
    private func isOuraSource(_ sample: HKSample) -> Bool {
        // Only filter Oura if we have better Oura data via direct API
        guard isOuraConnectedViaAPI else {
            return false
        }
        
        let sourceId = sample.sourceRevision.source.bundleIdentifier.lowercased()
        let sourceName = sample.sourceRevision.source.name.lowercased()
        
        for pattern in ouraSourcePatterns {
            if sourceId.contains(pattern) || sourceName.contains(pattern) {
                return true
            }
        }
        return false
    }
    
    /// Check if a source bundle identifier matches Oura patterns
    /// Only returns true if Oura is connected via API (conditional filtering)
    private func isOuraSourceByBundleId(_ bundleId: String) -> Bool {
        // Only filter Oura if we have better Oura data via direct API
        guard isOuraConnectedViaAPI else {
            return false
        }
        
        let lowerId = bundleId.lowercased()
        for pattern in ouraSourcePatterns {
            if lowerId.contains(pattern) {
                return true
            }
        }
        return false
    }
    
    // MARK: - Public API
    
    /// Normalize and sync the last N days of HealthKit data to backend
    /// @param days Number of days to sync (default: 7)
    /// @param completion Callback with success status and optional error
    func syncLastNDays(days: Int = 7, completion: @escaping (Bool, Error?) -> Void) {
        let endDate = Date()
        var dateComponents = DateComponents()
        dateComponents.day = -days
        guard let startDate = calendar.date(byAdding: dateComponents, to: endDate) else {
            completion(false, NSError(domain: "NormalisationService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid date range"]))
            return
        }
        
        print("[Normalisation] Syncing last \(days) days: \(startDate) to \(endDate)")
        
        // Get all day boundaries in local timezone
        let dayBoundaries = getDayBoundaries(from: startDate, to: endDate)
        
        // Process each day and collect metrics
        var allMetrics: [NormalizedDailyMetrics] = []
        let dispatchGroup = DispatchGroup()
        
        for (dayStart, dayEnd, localDateStr) in dayBoundaries {
            dispatchGroup.enter()
            normalizeDayMetrics(dayStart: dayStart, dayEnd: dayEnd, localDate: localDateStr) { metrics in
                if let metrics = metrics {
                    allMetrics.append(metrics)
                }
                dispatchGroup.leave()
            }
        }
        
        dispatchGroup.notify(queue: .main) {
            // Upload all metrics to backend
            self.uploadMetricsToBackend(metrics: allMetrics) { success, error in
                if !success {
                    completion(success, error)
                    return
                }
                
                // Upload raw sleep samples to backend for processing
                self.uploadSleepNights(for: dayBoundaries) { sleepSuccess, sleepError in
                    if !sleepSuccess {
                        completion(sleepSuccess, sleepError)
                        return
                    }
                    
                    // Upload workouts to backend
                    self.syncWorkouts(days: days) { workoutSuccess, workoutError in
                        if !workoutSuccess {
                            completion(workoutSuccess, workoutError)
                            return
                        }
                        
                        // Sync mindfulness sessions
                        self.syncMindfulnessSessions(for: dayBoundaries) { mindfulSuccess, mindfulError in
                            if !mindfulSuccess {
                                print("[Sync] Mindfulness sync failed but continuing: \(mindfulError?.localizedDescription ?? "unknown")")
                            }
                            
                            // Sync nutrition data
                            self.syncNutritionData(for: dayBoundaries) { nutritionSuccess, nutritionError in
                                if !nutritionSuccess {
                                    print("[Sync] Nutrition sync failed but continuing: \(nutritionError?.localizedDescription ?? "unknown")")
                                }
                                
                                // All syncs complete
                                completion(true, nil)
                            }
                        }
                    }
                }
            }
        }
    }
    
    /// Sync a full date range for historical backfill
    /// This is used for initial sync when user first installs the app
    /// @param from Start date for historical data
    /// @param to End date (typically now)
    /// @param completion Callback with success status, sample count, and optional error
    func syncDateRange(from startDate: Date, to endDate: Date, completion: @escaping (Bool, Int, Error?) -> Void) {
        print("[Normalisation] 📜 HISTORICAL BACKFILL: Syncing from \(startDate) to \(endDate)")
        
        // Get all day boundaries in local timezone
        let dayBoundaries = getDayBoundaries(from: startDate, to: endDate)
        let totalDays = dayBoundaries.count
        
        print("[Normalisation] 📊 Processing \(totalDays) days of historical data...")
        
        // Process in batches to avoid memory issues with very large date ranges
        let batchSize = 30 // Process 30 days at a time
        var processedDays = 0
        var totalSampleCount = 0
        
        func processBatch(batchIndex: Int) {
            let startIdx = batchIndex * batchSize
            let endIdx = min(startIdx + batchSize, totalDays)
            
            if startIdx >= totalDays {
                // All batches complete
                print("[Normalisation] ✅ Historical backfill complete! Processed \(processedDays) days, ~\(totalSampleCount) sample-days")
                completion(true, totalSampleCount, nil)
                return
            }
            
            let batchBoundaries = Array(dayBoundaries[startIdx..<endIdx])
            let batchNumber = batchIndex + 1
            let totalBatches = (totalDays + batchSize - 1) / batchSize
            
            print("[Normalisation] 📦 Processing batch \(batchNumber)/\(totalBatches) (days \(startIdx + 1)-\(endIdx) of \(totalDays))")
            
            // Process each day in this batch and collect metrics
            var batchMetrics: [NormalizedDailyMetrics] = []
            let dispatchGroup = DispatchGroup()
            
            for (dayStart, dayEnd, localDateStr) in batchBoundaries {
                dispatchGroup.enter()
                self.normalizeDayMetrics(dayStart: dayStart, dayEnd: dayEnd, localDate: localDateStr) { metrics in
                    if let metrics = metrics {
                        batchMetrics.append(metrics)
                    }
                    dispatchGroup.leave()
                }
            }
            
            dispatchGroup.notify(queue: .global(qos: .background)) {
                // Upload this batch to backend
                self.uploadMetricsToBackend(metrics: batchMetrics) { success, error in
                    if !success {
                        print("[Normalisation] ❌ Batch \(batchNumber) upload failed: \(error?.localizedDescription ?? "unknown")")
                        // Continue with next batch even on failure
                    } else {
                        print("[Normalisation] ✅ Batch \(batchNumber) uploaded (\(batchMetrics.count) days)")
                    }
                    
                    processedDays += batchBoundaries.count
                    totalSampleCount += batchMetrics.count
                    
                    // Upload sleep nights for this batch
                    self.uploadSleepNights(for: batchBoundaries) { sleepSuccess, sleepError in
                        if !sleepSuccess {
                            print("[Normalisation] ⚠️ Batch \(batchNumber) sleep upload failed: \(sleepError?.localizedDescription ?? "unknown")")
                        }
                        
                        // Small delay between batches to avoid overwhelming the server
                        DispatchQueue.global(qos: .background).asyncAfter(deadline: .now() + 0.5) {
                            processBatch(batchIndex: batchIndex + 1)
                        }
                    }
                }
            }
        }
        
        // Start processing batches
        processBatch(batchIndex: 0)
        
        // Also sync all workouts in the date range
        let daysSinceStart = calendar.dateComponents([.day], from: startDate, to: endDate).day ?? 1095
        DispatchQueue.global(qos: .background).async {
            self.syncWorkouts(days: daysSinceStart) { success, error in
                if success {
                    print("[Normalisation] ✅ Historical workouts synced")
                } else {
                    print("[Normalisation] ⚠️ Historical workout sync failed: \(error?.localizedDescription ?? "unknown")")
                }
            }
        }
    }
    
    // MARK: - Day Boundary Logic
    
    /// Get day boundaries in user's local timezone
    /// Returns array of tuples: (dayStart, dayEnd, localDateString)
    private func getDayBoundaries(from startDate: Date, to endDate: Date) -> [(Date, Date, String)] {
        var boundaries: [(Date, Date, String)] = []
        var currentDate = calendar.startOfDay(for: startDate)
        
        while currentDate <= endDate {
            let dayStart = currentDate
            guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { break }
            
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = userTimezone
            let localDateStr = formatter.string(from: dayStart)
            
            boundaries.append((dayStart, dayEnd, localDateStr))
            currentDate = dayEnd
        }
        
        return boundaries
    }
    
    // MARK: - Normalize Single Day
    
    /// Convert Date to ISO8601 UTC string for backend
    private func toISO8601UTC(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
    
    /// Normalize all metrics for a single day
    private func normalizeDayMetrics(dayStart: Date, dayEnd: Date, localDate: String, completion: @escaping (NormalizedDailyMetrics?) -> Void) {
        var metrics = NormalizedDailyMetrics(
            localDate: localDate,
            timezone: userTimezone.identifier,
            utcDayStart: toISO8601UTC(dayStart),
            utcDayEnd: toISO8601UTC(dayEnd),
            sleepHours: nil,
            restingHrBpm: nil,
            hrvMs: nil,
            activeEnergyKcal: nil,
            weightKg: nil,
            heightCm: nil,
            bmi: nil,
            bodyFatPercent: nil,
            leanBodyMassKg: nil,
            waistCircumferenceCm: nil,
            stepCount: nil,
            distanceMeters: nil,
            flightsClimbed: nil,
            exerciseMinutes: nil,
            standHours: nil,
            avgHeartRateBpm: nil,
            systolicBp: nil,
            diastolicBp: nil,
            bloodGlucoseMgDl: nil,
            vo2Max: nil,
            walkingHeartRateAvg: nil,
            oxygenSaturation: nil,
            respiratoryRate: nil,
            bodyTemperatureCelsius: nil,
            basalEnergyKcal: nil,
            dietaryWaterMl: nil,
            stepsSourcesMetadata: nil,
            notes: nil
        )
        
        let dispatchGroup = DispatchGroup()
        
        // Sleep (18:00 yesterday → 12:00 today)
        dispatchGroup.enter()
        aggregateSleep(forMorning: dayStart) { sleepHours in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // HRV (during sleep window)
        dispatchGroup.enter()
        aggregateHRV(forMorning: dayStart) { hrv in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: hrv,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Resting HR (during sleep window)
        dispatchGroup.enter()
        aggregateRestingHR(forMorning: dayStart) { rhr in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: rhr,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Active Energy (full day)
        dispatchGroup.enter()
        aggregateActiveEnergy(dayStart: dayStart, dayEnd: dayEnd) { energy in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: energy,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Exercise Minutes (with source deduplication)
        dispatchGroup.enter()
        aggregateExerciseMinutes(dayStart: dayStart, dayEnd: dayEnd) { exerciseMinutes in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Steps (with deduplication)
        dispatchGroup.enter()
        normalizeSteps(dayStart: dayStart, dayEnd: dayEnd) { stepCount, metadata in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                stepsSourcesMetadata: metadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Body Weight
        dispatchGroup.enter()
        aggregateWeight(dayStart: dayStart, dayEnd: dayEnd) { weight in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: weight,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Body Fat Percentage
        dispatchGroup.enter()
        aggregateBodyFat(dayStart: dayStart, dayEnd: dayEnd) { bodyFat in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: bodyFat,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Lean Body Mass
        dispatchGroup.enter()
        aggregateLeanBodyMass(dayStart: dayStart, dayEnd: dayEnd) { leanMass in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: leanMass,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // BMI
        dispatchGroup.enter()
        aggregateBMI(dayStart: dayStart, dayEnd: dayEnd) { bmi in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Waist Circumference
        dispatchGroup.enter()
        aggregateWaistCircumference(dayStart: dayStart, dayEnd: dayEnd) { waist in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: waist,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Height
        dispatchGroup.enter()
        aggregateHeight(dayStart: dayStart, dayEnd: dayEnd) { height in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: height,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Distance
        dispatchGroup.enter()
        aggregateDistance(dayStart: dayStart, dayEnd: dayEnd) { distance in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: distance,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Flights Climbed
        dispatchGroup.enter()
        aggregateFlightsClimbed(dayStart: dayStart, dayEnd: dayEnd) { flights in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: flights,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Stand Hours
        dispatchGroup.enter()
        aggregateStandHours(dayStart: dayStart, dayEnd: dayEnd) { standHrs in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: standHrs,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Average Heart Rate
        dispatchGroup.enter()
        aggregateAvgHeartRate(dayStart: dayStart, dayEnd: dayEnd) { avgHr in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: avgHr,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Blood Pressure
        dispatchGroup.enter()
        aggregateBloodPressure(dayStart: dayStart, dayEnd: dayEnd) { systolic, diastolic in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: systolic,
                diastolicBp: diastolic,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Blood Glucose
        dispatchGroup.enter()
        aggregateBloodGlucose(dayStart: dayStart, dayEnd: dayEnd) { glucose in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: glucose,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // VO2 Max
        dispatchGroup.enter()
        aggregateVO2Max(dayStart: dayStart, dayEnd: dayEnd) { vo2 in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: vo2,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Walking Heart Rate Average
        dispatchGroup.enter()
        aggregateWalkingHeartRate(dayStart: dayStart, dayEnd: dayEnd) { walkingHR in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: walkingHR,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Oxygen Saturation (SpO2)
        dispatchGroup.enter()
        aggregateOxygenSaturation(dayStart: dayStart, dayEnd: dayEnd) { spo2 in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: spo2,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Respiratory Rate
        dispatchGroup.enter()
        aggregateRespiratoryRate(dayStart: dayStart, dayEnd: dayEnd) { respRate in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: respRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Body Temperature
        dispatchGroup.enter()
        aggregateBodyTemperature(dayStart: dayStart, dayEnd: dayEnd) { temp in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: temp,
                basalEnergyKcal: metrics.basalEnergyKcal,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Basal Energy Burned
        dispatchGroup.enter()
        aggregateBasalEnergy(dayStart: dayStart, dayEnd: dayEnd) { basalEnergy in
            metrics = NormalizedDailyMetrics(
                localDate: metrics.localDate,
                timezone: metrics.timezone,
                utcDayStart: metrics.utcDayStart,
                utcDayEnd: metrics.utcDayEnd,
                sleepHours: metrics.sleepHours,
                restingHrBpm: metrics.restingHrBpm,
                hrvMs: metrics.hrvMs,
                activeEnergyKcal: metrics.activeEnergyKcal,
                weightKg: metrics.weightKg,
                heightCm: metrics.heightCm,
                bmi: metrics.bmi,
                bodyFatPercent: metrics.bodyFatPercent,
                leanBodyMassKg: metrics.leanBodyMassKg,
                waistCircumferenceCm: metrics.waistCircumferenceCm,
                stepCount: metrics.stepCount,
                distanceMeters: metrics.distanceMeters,
                flightsClimbed: metrics.flightsClimbed,
                exerciseMinutes: metrics.exerciseMinutes,
                standHours: metrics.standHours,
                avgHeartRateBpm: metrics.avgHeartRateBpm,
                systolicBp: metrics.systolicBp,
                diastolicBp: metrics.diastolicBp,
                bloodGlucoseMgDl: metrics.bloodGlucoseMgDl,
                vo2Max: metrics.vo2Max,
                walkingHeartRateAvg: metrics.walkingHeartRateAvg,
                oxygenSaturation: metrics.oxygenSaturation,
                respiratoryRate: metrics.respiratoryRate,
                bodyTemperatureCelsius: metrics.bodyTemperatureCelsius,
                basalEnergyKcal: basalEnergy,
                dietaryWaterMl: metrics.dietaryWaterMl,
                stepsSourcesMetadata: metrics.stepsSourcesMetadata,
                notes: metrics.notes
            )
            dispatchGroup.leave()
        }
        
        // Dietary Water
        dispatchGroup.enter()
        aggregateDietaryWater(dayStart: dayStart, dayEnd: dayEnd) { water in
            metrics.dietaryWaterMl = water
            dispatchGroup.leave()
        }
        
        // Gait & Mobility Metrics (8 types)
        dispatchGroup.enter()
        aggregateGaitMetrics(dayStart: dayStart, dayEnd: dayEnd) { gaitData in
            metrics.walkingSpeedMs = gaitData.walkingSpeedMs
            metrics.walkingStepLengthM = gaitData.walkingStepLengthM
            metrics.walkingDoubleSupportPct = gaitData.walkingDoubleSupportPct
            metrics.walkingAsymmetryPct = gaitData.walkingAsymmetryPct
            metrics.appleWalkingSteadiness = gaitData.appleWalkingSteadiness
            metrics.sixMinuteWalkDistanceM = gaitData.sixMinuteWalkDistanceM
            metrics.stairAscentSpeedMs = gaitData.stairAscentSpeedMs
            metrics.stairDescentSpeedMs = gaitData.stairDescentSpeedMs
            dispatchGroup.leave()
        }
        
        dispatchGroup.notify(queue: .main) {
            completion(metrics)
        }
    }
    
    // MARK: - Sleep Aggregation
    
    /// Aggregate sleep for the morning of a given day
    /// Uses "night before" approach: sleep ending on morning of localDate
    /// Window: 18:00 yesterday → 12:00 today
    private func aggregateSleep(forMorning morningDate: Date, completion: @escaping (Double?) -> Void) {
        guard let windowEnd = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: morningDate),
              let yesterday = calendar.date(byAdding: .day, value: -1, to: morningDate),
              let windowStart = calendar.date(bySettingHour: 18, minute: 0, second: 0, of: yesterday) else {
            completion(nil)
            return
        }
        
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { (query, samples, error) in
            guard let samples = samples as? [HKCategorySample], error == nil else {
                completion(nil)
                return
            }
            
            // Filter for "in bed" samples
            let inBedSamples = samples.filter { $0.value == HKCategoryValueSleepAnalysis.inBed.rawValue }
            
            // Sum duration
            let totalSeconds = inBedSamples.reduce(0.0) { sum, sample in
                return sum + sample.endDate.timeIntervalSince(sample.startDate)
            }
            
            let hours = totalSeconds / 3600.0
            completion(hours > 0 ? hours : nil)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - HRV Aggregation
    
    /// Aggregate HRV during sleep window (average SDNN)
    private func aggregateHRV(forMorning morningDate: Date, completion: @escaping (Double?) -> Void) {
        guard let windowEnd = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: morningDate),
              let yesterday = calendar.date(byAdding: .day, value: -1, to: morningDate),
              let windowStart = calendar.date(bySettingHour: 18, minute: 0, second: 0, of: yesterday) else {
            completion(nil)
            return
        }
        
        let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: hrvType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { (query, samples, error) in
            guard let samples = samples as? [HKQuantitySample], error == nil, !samples.isEmpty else {
                completion(nil)
                return
            }
            
            // Average HRV in milliseconds
            let total = samples.reduce(0.0) { sum, sample in
                return sum + sample.quantity.doubleValue(for: HKUnit.secondUnit(with: .milli))
            }
            
            let avg = total / Double(samples.count)
            completion(avg)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Resting HR Aggregation
    
    /// Aggregate resting heart rate (lowest HR during sleep)
    private func aggregateRestingHR(forMorning morningDate: Date, completion: @escaping (Double?) -> Void) {
        guard let windowEnd = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: morningDate),
              let yesterday = calendar.date(byAdding: .day, value: -1, to: morningDate),
              let windowStart = calendar.date(bySettingHour: 18, minute: 0, second: 0, of: yesterday) else {
            completion(nil)
            return
        }
        
        let hrType = HKObjectType.quantityType(forIdentifier: .heartRate)!
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: hrType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { (query, samples, error) in
            guard let samples = samples as? [HKQuantitySample], error == nil, !samples.isEmpty else {
                completion(nil)
                return
            }
            
            // Find minimum heart rate (resting HR)
            let hrValues = samples.map { $0.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) }
            let minHR = hrValues.min()
            completion(minHR)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Active Energy Aggregation
    
    /// Aggregate active energy for a full day (sum of all samples)
    /// NOTE: Excludes Oura Ring samples to prevent double-counting with Apple Watch
    private func aggregateActiveEnergy(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: energyType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { [weak self] (query, samples, error) in
            guard let self = self else {
                completion(nil)
                return
            }
            
            guard let samples = samples as? [HKQuantitySample], error == nil, !samples.isEmpty else {
                completion(nil)
                return
            }
            
            // Filter out Oura Ring samples to prevent double-counting
            let filteredSamples = samples.filter { !self.isOuraSource($0) }
            
            if filteredSamples.isEmpty {
                print("[ActiveEnergy] All samples were from Oura, returning nil")
                completion(nil)
                return
            }
            
            let ouraFilteredCount = samples.count - filteredSamples.count
            if ouraFilteredCount > 0 {
                print("[ActiveEnergy] Filtered out \(ouraFilteredCount) Oura samples from \(samples.count) total")
            }
            
            // Sum all active energy in kcal (excluding Oura)
            let totalKcal = filteredSamples.reduce(0.0) { sum, sample in
                return sum + sample.quantity.doubleValue(for: .kilocalorie())
            }
            
            completion(totalKcal)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Exercise Minutes Aggregation
    
    /// Aggregate exercise minutes for a full day from actual workouts
    /// Uses HKWorkout queries with proper deduplication to avoid Activity Ring cumulative counters
    private func aggregateExerciseMinutes(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        let workoutType = HKObjectType.workoutType()
        
        // Debug logging
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        formatter.timeZone = TimeZone.current
        print("[ExerciseMinutes] Querying workouts for day: \(formatter.string(from: dayStart)) to \(formatter.string(from: dayEnd))")
        
        // Note: We skip authorizationStatus check here because iOS privacy policy makes it unreliable.
        // Per Apple documentation, authorizationStatus may return .sharingDenied even when permission
        // is granted. Just attempt the query - if we have permission, we'll get data; if not, empty array.
        
        // Use generous window (12h before dayStart) to catch cross-midnight workouts
        let windowStart = calendar.date(byAdding: .hour, value: -12, to: dayStart)!
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: dayEnd, options: [])
        
        // Query actual HKWorkout objects instead of appleExerciseTime quantity
        // This avoids the Activity Ring cumulative counter issue
        let query = HKSampleQuery(
            sampleType: workoutType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { (query, samples, error) in
            guard error == nil else {
                print("[ExerciseMinutes] Query error: \(error!.localizedDescription)")
                completion(nil)
                return
            }
            
            guard let workouts = samples as? [HKWorkout], !workouts.isEmpty else {
                print("[ExerciseMinutes] No workouts found")
                completion(nil)
                return
            }
            
            print("[ExerciseMinutes] Processing \(workouts.count) workouts with deduplication...")
            
            // Deduplicate workouts using sync metadata + tight fallback heuristic
            var dedup: [String: (minutes: Double, source: String)] = [:]
            
            for workout in workouts {
                // Calculate overlap with target day
                let overlapStart = max(workout.startDate, dayStart)
                let overlapEnd = min(workout.endDate, dayEnd)
                
                // Skip if no overlap with this day
                guard overlapEnd > overlapStart else {
                    print("[ExerciseMinutes]  ⏭️  No overlap (outside day window)")
                    continue
                }
                
                let minutes = overlapEnd.timeIntervalSince(overlapStart) / 60.0
                let sourceName = workout.sourceRevision.source.name
                let bundleId = workout.sourceRevision.source.bundleIdentifier ?? "unknown"
                
                // Build deduplication key: prefer sync metadata, fallback to tight heuristic
                let key: String
                if let syncId = workout.metadata?[HKMetadataKeySyncIdentifier] as? String,
                   let version = workout.metadata?[HKMetadataKeySyncVersion] {
                    // Primary: use HealthKit sync identifier
                    key = "sync:\(syncId)#\(version)|\(bundleId)"
                } else {
                    // Fallback: tight tolerance heuristic (5-second rounding)
                    let startRounded = Int(overlapStart.timeIntervalSince1970 / 5) * 5
                    let endRounded = Int(overlapEnd.timeIntervalSince1970 / 5) * 5
                    let durationRounded = Int(workout.duration)
                    key = "heuristic:\(startRounded)|\(endRounded)|\(durationRounded)|\(workout.workoutActivityType.rawValue)|\(bundleId)"
                }
                
                // Keep longest duration per key (handles duplicates)
                if let existing = dedup[key] {
                    if minutes > existing.minutes {
                        print("[ExerciseMinutes]  🔄  Replacing duplicate: \(sourceName) (\(String(format: "%.1f", minutes)) min > \(String(format: "%.1f", existing.minutes)) min)")
                        dedup[key] = (minutes, sourceName)
                    } else {
                        print("[ExerciseMinutes]  ⏭️  Skipping duplicate: \(sourceName) (\(String(format: "%.1f", minutes)) min)")
                    }
                } else {
                    print("[ExerciseMinutes]  ✓  \(sourceName): \(String(format: "%.1f", minutes)) min")
                    dedup[key] = (minutes, sourceName)
                }
            }
            
            // Sum all unique workout durations
            let totalMinutes = dedup.values.reduce(0.0) { $0 + $1.minutes }
            
            print("[ExerciseMinutes] ═══════════════════")
            print("[ExerciseMinutes] Total: \(String(format: "%.1f", totalMinutes)) min from \(dedup.count) unique workouts")
            
            completion(totalMinutes > 0 ? totalMinutes : nil)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Steps Normalization
    
    /// Normalize steps using HKStatisticsQuery to let HealthKit handle deduplication
    /// NOTE: Excludes Oura Ring samples to prevent double-counting with Apple Watch
    private func normalizeSteps(dayStart: Date, dayEnd: Date, completion: @escaping (Int?, StepsSourcesMetadata?) -> Void) {
        let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount)!
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        // Use HKStatisticsQuery with .separateBySource to get accurate per-source totals
        // This lets HealthKit handle intra-source deduplication automatically
        let query = HKStatisticsQuery(
            quantityType: stepsType,
            quantitySamplePredicate: predicate,
            options: [.cumulativeSum, .separateBySource]
        ) { [weak self] (query, statistics, error) in
            guard let self = self else {
                completion(nil, nil)
                return
            }
            
            guard let statistics = statistics, error == nil else {
                print("[Steps] No statistics available")
                completion(nil, nil)
                return
            }
            
            // Get per-source sums (HealthKit handles overlaps within each source)
            guard let sources = statistics.sources else {
                print("[Steps] No source data available")
                completion(nil, nil)
                return
            }
            
            // Categorize sources and pick the PRIMARY source for each device type
            // (don't sum multiple sources from same device - they overlap!)
            // NOTE: Oura Ring sources are explicitly filtered out to prevent double-counting
            var watchSources: [(bundleId: String, steps: Int)] = []
            var iphoneSources: [(bundleId: String, steps: Int)] = []
            var otherSources: [(bundleId: String, steps: Int)] = []
            var ouraFilteredSources: [(bundleId: String, steps: Int)] = []
            var sourceIds: [String] = []
            
            for source in sources {
                let bundleId = source.bundleIdentifier
                
                if let sum = statistics.sumQuantity(for: source) {
                    let steps = Int(sum.doubleValue(for: .count()))
                    
                    // Filter out Oura Ring sources to prevent double-counting
                    if self.isOuraSourceByBundleId(bundleId) {
                        ouraFilteredSources.append((bundleId, steps))
                        print("[Steps] 🚫 Oura source FILTERED: \(bundleId): \(steps) steps (excluded)")
                        // Do NOT add to sourceIds - these are filtered out
                        continue
                    }
                    
                    // Only add non-Oura sources to the sourceIds metadata
                    sourceIds.append(bundleId)
                    
                    if bundleId.contains("watchOS") || bundleId.contains("Watch") {
                        watchSources.append((bundleId, steps))
                        print("[Steps] Watch source \(bundleId): \(steps) steps")
                    } else if bundleId.contains("com.apple.health") || bundleId.contains("iPhone") {
                        iphoneSources.append((bundleId, steps))
                        print("[Steps] iPhone source \(bundleId): \(steps) steps")
                    } else {
                        otherSources.append((bundleId, steps))
                        print("[Steps] Other source \(bundleId): \(steps) steps")
                    }
                }
            }
            
            // Log if Oura sources were filtered
            if !ouraFilteredSources.isEmpty {
                let totalOuraSteps = ouraFilteredSources.reduce(0) { $0 + $1.steps }
                print("[Steps] ═══════════════════")
                print("[Steps] Filtered \(ouraFilteredSources.count) Oura source(s) with \(totalOuraSteps) total steps")
            }
            
            // Pick the PRIMARY source (highest step count) from each device type
            let watchSteps = watchSources.max(by: { $0.steps < $1.steps })?.steps ?? 0
            let iphoneSteps = iphoneSources.max(by: { $0.steps < $1.steps })?.steps ?? 0
            let otherSteps = otherSources.max(by: { $0.steps < $1.steps })?.steps ?? 0
            
            // Priority: Watch > iPhone > Other
            let finalSteps: Int
            let sourceOrder: String
            
            if watchSteps > 0 {
                finalSteps = watchSteps
                sourceOrder = "Watch"
                print("[Steps] Using Watch primary source: \(watchSteps) steps (from \(watchSources.count) sources)")
            } else if iphoneSteps > 0 {
                finalSteps = iphoneSteps
                sourceOrder = "iPhone"
                print("[Steps] Using iPhone primary source: \(iphoneSteps) steps (from \(iphoneSources.count) sources)")
            } else if otherSteps > 0 {
                finalSteps = otherSteps
                sourceOrder = "Other"
                print("[Steps] Using Other primary source: \(otherSteps) steps (from \(otherSources.count) sources)")
            } else {
                completion(nil, nil)
                return
            }
            
            // Build notes including Oura filtering info
            var notes = "Using HKStatisticsQuery with .separateBySource for accurate deduplication"
            if !ouraFilteredSources.isEmpty {
                notes += "; Filtered \(ouraFilteredSources.count) Oura source(s)"
            }
            
            let metadata = StepsSourcesMetadata(
                watchSteps: watchSteps > 0 ? watchSteps : nil,
                iphoneSteps: iphoneSteps > 0 ? iphoneSteps : nil,
                otherSteps: otherSteps > 0 ? otherSteps : nil,
                finalSteps: finalSteps,
                overlapsDetected: 0, // HKStatisticsQuery handles this internally
                gapsFilled: 0,
                priorityOrder: sourceOrder,
                sourceIdentifiers: sourceIds.sorted(),
                notes: notes
            )
            
            completion(finalSteps, metadata)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Body Composition Aggregation
    
    /// Get most recent weight measurement for the day
    private func aggregateWeight(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let weightType = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: weightType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            let weightKg = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
            completion(weightKg)
        }
        
        healthStore.execute(query)
    }
    
    /// Get most recent body fat percentage for the day
    private func aggregateBodyFat(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let bodyFatType = HKObjectType.quantityType(forIdentifier: .bodyFatPercentage) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: bodyFatType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            let bodyFatPct = sample.quantity.doubleValue(for: .percent()) * 100.0
            completion(bodyFatPct)
        }
        
        healthStore.execute(query)
    }
    
    /// Get most recent lean body mass for the day
    private func aggregateLeanBodyMass(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let leanMassType = HKObjectType.quantityType(forIdentifier: .leanBodyMass) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: leanMassType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            let leanMassKg = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
            completion(leanMassKg)
        }
        
        healthStore.execute(query)
    }
    
    /// Get most recent BMI for the day
    private func aggregateBMI(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let bmiType = HKObjectType.quantityType(forIdentifier: .bodyMassIndex) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: bmiType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            let bmi = sample.quantity.doubleValue(for: .count())
            completion(bmi)
        }
        
        healthStore.execute(query)
    }
    
    /// Get most recent waist circumference for the day
    private func aggregateWaistCircumference(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let waistType = HKObjectType.quantityType(forIdentifier: .waistCircumference) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: waistType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            let waistCm = sample.quantity.doubleValue(for: .meterUnit(with: .centi))
            completion(waistCm)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Extended Health Metrics Aggregation
    
    /// Get most recent height for the day
    private func aggregateHeight(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let heightType = HKObjectType.quantityType(forIdentifier: .height) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: heightType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            let heightCm = sample.quantity.doubleValue(for: .meterUnit(with: .centi))
            completion(heightCm)
        }
        
        healthStore.execute(query)
    }
    
    /// Get total distance walked/run for the day
    private func aggregateDistance(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let distanceType = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: distanceType, quantitySamplePredicate: predicate, options: .cumulativeSum) { (query, result, error) in
            guard let sum = result?.sumQuantity(), error == nil else {
                completion(nil)
                return
            }
            
            let distanceMeters = sum.doubleValue(for: .meter())
            completion(distanceMeters > 0 ? distanceMeters : nil)
        }
        
        healthStore.execute(query)
    }
    
    /// Get total flights of stairs climbed for the day
    private func aggregateFlightsClimbed(dayStart: Date, dayEnd: Date, completion: @escaping (Int?) -> Void) {
        guard let flightsType = HKObjectType.quantityType(forIdentifier: .flightsClimbed) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: flightsType, quantitySamplePredicate: predicate, options: .cumulativeSum) { (query, result, error) in
            guard let sum = result?.sumQuantity(), error == nil else {
                completion(nil)
                return
            }
            
            let flights = Int(sum.doubleValue(for: .count()))
            completion(flights > 0 ? flights : nil)
        }
        
        healthStore.execute(query)
    }
    
    /// Get total stand hours for the day (Apple Watch stand goal)
    private func aggregateStandHours(dayStart: Date, dayEnd: Date, completion: @escaping (Int?) -> Void) {
        guard let standType = HKObjectType.quantityType(forIdentifier: .appleStandTime) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: standType, quantitySamplePredicate: predicate, options: .cumulativeSum) { (query, result, error) in
            guard let sum = result?.sumQuantity(), error == nil else {
                completion(nil)
                return
            }
            
            // Stand time is in minutes, convert to hours
            let standMinutes = sum.doubleValue(for: .minute())
            let standHours = Int(standMinutes / 60.0)
            completion(standHours > 0 ? standHours : nil)
        }
        
        healthStore.execute(query)
    }
    
    /// Get average heart rate for the day
    private func aggregateAvgHeartRate(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: hrType, quantitySamplePredicate: predicate, options: .discreteAverage) { (query, result, error) in
            guard let avg = result?.averageQuantity(), error == nil else {
                completion(nil)
                return
            }
            
            let avgBpm = avg.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            completion(avgBpm > 0 ? avgBpm : nil)
        }
        
        healthStore.execute(query)
    }
    
    /// Get most recent blood pressure readings for the day (systolic and diastolic)
    private func aggregateBloodPressure(dayStart: Date, dayEnd: Date, completion: @escaping (Double?, Double?) -> Void) {
        let systolicType = HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic)!
        let diastolicType = HKObjectType.quantityType(forIdentifier: .bloodPressureDiastolic)!
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        var systolic: Double? = nil
        var diastolic: Double? = nil
        let dispatchGroup = DispatchGroup()
        
        // Query systolic
        dispatchGroup.enter()
        let systolicQuery = HKSampleQuery(sampleType: systolicType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            if let sample = samples?.first as? HKQuantitySample, error == nil {
                systolic = sample.quantity.doubleValue(for: .millimeterOfMercury())
            }
            dispatchGroup.leave()
        }
        healthStore.execute(systolicQuery)
        
        // Query diastolic
        dispatchGroup.enter()
        let diastolicQuery = HKSampleQuery(sampleType: diastolicType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            if let sample = samples?.first as? HKQuantitySample, error == nil {
                diastolic = sample.quantity.doubleValue(for: .millimeterOfMercury())
            }
            dispatchGroup.leave()
        }
        healthStore.execute(diastolicQuery)
        
        dispatchGroup.notify(queue: .main) {
            completion(systolic, diastolic)
        }
    }
    
    /// Get most recent blood glucose reading for the day
    private func aggregateBloodGlucose(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let glucoseType = HKObjectType.quantityType(forIdentifier: .bloodGlucose) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: glucoseType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            // Convert to mg/dL (standard US unit)
            let glucoseMgDl = sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci)))
            completion(glucoseMgDl)
        }
        
        healthStore.execute(query)
    }
    
    /// Get most recent VO2 Max reading for the day
    private func aggregateVO2Max(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let vo2Type = HKObjectType.quantityType(forIdentifier: .vo2Max) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: vo2Type, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            // VO2 Max in mL/kg/min (using composed HKUnit for reliability)
            let mlPerKgMin = HKUnit.literUnit(with: .milli).unitDivided(by: HKUnit.gramUnit(with: .kilo)).unitDivided(by: HKUnit.minute())
            let vo2Max = sample.quantity.doubleValue(for: mlPerKgMin)
            completion(vo2Max)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Vital Signs Aggregation
    
    /// Aggregate walking heart rate average for a day
    private func aggregateWalkingHeartRate(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let walkingHRType = HKObjectType.quantityType(forIdentifier: .walkingHeartRateAverage) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: walkingHRType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            let bpm = sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: HKUnit.minute()))
            completion(bpm)
        }
        
        healthStore.execute(query)
    }
    
    /// Aggregate oxygen saturation (SpO2) average for a day
    private func aggregateOxygenSaturation(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let spo2Type = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: spo2Type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { (query, samples, error) in
            guard let samples = samples as? [HKQuantitySample], !samples.isEmpty, error == nil else {
                completion(nil)
                return
            }
            
            // Average all SpO2 samples for the day, convert from fraction to percentage
            let sum = samples.reduce(0.0) { $0 + $1.quantity.doubleValue(for: HKUnit.percent()) }
            let avg = sum / Double(samples.count) * 100.0 // Convert to percentage (0-100)
            completion(avg)
        }
        
        healthStore.execute(query)
    }
    
    /// Aggregate respiratory rate average for a day
    private func aggregateRespiratoryRate(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let respType = HKObjectType.quantityType(forIdentifier: .respiratoryRate) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: respType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { (query, samples, error) in
            guard let samples = samples as? [HKQuantitySample], !samples.isEmpty, error == nil else {
                completion(nil)
                return
            }
            
            // Average all respiratory rate samples for the day
            let sum = samples.reduce(0.0) { $0 + $1.quantity.doubleValue(for: HKUnit.count().unitDivided(by: HKUnit.minute())) }
            let avg = sum / Double(samples.count)
            completion(avg)
        }
        
        healthStore.execute(query)
    }
    
    /// Aggregate body temperature (most recent sample) for a day
    /// Falls back to wrist temperature if no body temp available
    private func aggregateBodyTemperature(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        // First try wrist temperature (from Apple Watch during sleep) - more common
        if #available(iOS 16.0, *) {
            aggregateWristTemperature(dayStart: dayStart, dayEnd: dayEnd) { wristTemp in
                if let temp = wristTemp {
                    print("[Temperature] Using wrist temperature: \(temp)°C")
                    completion(temp)
                    return
                }
                
                // Fall back to manual body temperature
                self.aggregateManualBodyTemperature(dayStart: dayStart, dayEnd: dayEnd, completion: completion)
            }
        } else {
            // iOS < 16, only manual body temp available
            aggregateManualBodyTemperature(dayStart: dayStart, dayEnd: dayEnd, completion: completion)
        }
    }
    
    /// Aggregate Apple Watch wrist temperature (during sleep) for a day
    @available(iOS 16.0, *)
    private func aggregateWristTemperature(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let wristTempType = HKObjectType.quantityType(forIdentifier: .appleSleepingWristTemperature) else {
            print("[Temperature] Wrist temperature type not available")
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: wristTempType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let samples = samples as? [HKQuantitySample], !samples.isEmpty, error == nil else {
                print("[Temperature] No wrist temperature samples found")
                completion(nil)
                return
            }
            
            // Average all wrist temperature samples for the day
            let sum = samples.reduce(0.0) { $0 + $1.quantity.doubleValue(for: HKUnit.degreeCelsius()) }
            let avg = sum / Double(samples.count)
            print("[Temperature] Found \(samples.count) wrist temp samples, avg: \(avg)°C")
            completion(avg)
        }
        
        healthStore.execute(query)
    }
    
    /// Aggregate manual body temperature (thermometer readings) for a day
    private func aggregateManualBodyTemperature(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let tempType = HKObjectType.quantityType(forIdentifier: .bodyTemperature) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: tempType, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            
            // Body temperature in Celsius
            let celsius = sample.quantity.doubleValue(for: HKUnit.degreeCelsius())
            print("[Temperature] Using manual body temp: \(celsius)°C")
            completion(celsius)
        }
        
        healthStore.execute(query)
    }
    
    /// Aggregate basal energy burned (sum) for a day
    private func aggregateBasalEnergy(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let basalType = HKObjectType.quantityType(forIdentifier: .basalEnergyBurned) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: basalType, quantitySamplePredicate: predicate, options: .cumulativeSum) { (query, statistics, error) in
            guard let sum = statistics?.sumQuantity(), error == nil else {
                completion(nil)
                return
            }
            
            // Basal energy in kcal
            let kcal = sum.doubleValue(for: HKUnit.kilocalorie())
            completion(kcal)
        }
        
        healthStore.execute(query)
    }
    
    /// Aggregate dietary water intake (sum) for a day
    private func aggregateDietaryWater(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        guard let waterType = HKObjectType.quantityType(forIdentifier: .dietaryWater) else {
            completion(nil)
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: waterType, quantitySamplePredicate: predicate, options: .cumulativeSum) { (query, statistics, error) in
            guard let sum = statistics?.sumQuantity(), error == nil else {
                completion(nil)
                return
            }
            
            // Water in milliliters
            let ml = sum.doubleValue(for: HKUnit.literUnit(with: .milli))
            completion(ml)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Gait & Mobility Aggregation
    
    /// Container for gait metrics results
    struct GaitMetricsResult {
        var walkingSpeedMs: Double? = nil
        var walkingStepLengthM: Double? = nil
        var walkingDoubleSupportPct: Double? = nil
        var walkingAsymmetryPct: Double? = nil
        var appleWalkingSteadiness: Double? = nil
        var sixMinuteWalkDistanceM: Double? = nil
        var stairAscentSpeedMs: Double? = nil
        var stairDescentSpeedMs: Double? = nil
    }
    
    /// Aggregate all gait & mobility metrics for a day
    private func aggregateGaitMetrics(dayStart: Date, dayEnd: Date, completion: @escaping (GaitMetricsResult) -> Void) {
        var result = GaitMetricsResult()
        let dispatchGroup = DispatchGroup()
        
        // Walking Speed (m/s)
        if let walkingSpeedType = HKObjectType.quantityType(forIdentifier: .walkingSpeed) {
            dispatchGroup.enter()
            aggregateAverageQuantity(type: walkingSpeedType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.meter().unitDivided(by: HKUnit.second())) { value in
                result.walkingSpeedMs = value
                dispatchGroup.leave()
            }
        }
        
        // Walking Step Length (m)
        if let stepLengthType = HKObjectType.quantityType(forIdentifier: .walkingStepLength) {
            dispatchGroup.enter()
            aggregateAverageQuantity(type: stepLengthType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.meter()) { value in
                result.walkingStepLengthM = value
                dispatchGroup.leave()
            }
        }
        
        // Walking Double Support Percentage (%)
        if let doubleSupportType = HKObjectType.quantityType(forIdentifier: .walkingDoubleSupportPercentage) {
            dispatchGroup.enter()
            aggregateAverageQuantity(type: doubleSupportType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.percent()) { value in
                // Convert from 0-1 to 0-100
                result.walkingDoubleSupportPct = value.map { $0 * 100 }
                dispatchGroup.leave()
            }
        }
        
        // Walking Asymmetry Percentage (%)
        if let asymmetryType = HKObjectType.quantityType(forIdentifier: .walkingAsymmetryPercentage) {
            dispatchGroup.enter()
            aggregateAverageQuantity(type: asymmetryType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.percent()) { value in
                // Convert from 0-1 to 0-100
                result.walkingAsymmetryPct = value.map { $0 * 100 }
                dispatchGroup.leave()
            }
        }
        
        // Apple Walking Steadiness (0-1 score)
        if let steadinessType = HKObjectType.quantityType(forIdentifier: .appleWalkingSteadiness) {
            dispatchGroup.enter()
            aggregateLatestQuantity(type: steadinessType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.percent()) { value in
                result.appleWalkingSteadiness = value
                dispatchGroup.leave()
            }
        }
        
        // Six Minute Walk Test Distance (m)
        if let sixMinuteType = HKObjectType.quantityType(forIdentifier: .sixMinuteWalkTestDistance) {
            dispatchGroup.enter()
            aggregateLatestQuantity(type: sixMinuteType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.meter()) { value in
                result.sixMinuteWalkDistanceM = value
                dispatchGroup.leave()
            }
        }
        
        // Stair Ascent Speed (m/s)
        if let stairAscentType = HKObjectType.quantityType(forIdentifier: .stairAscentSpeed) {
            dispatchGroup.enter()
            aggregateAverageQuantity(type: stairAscentType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.meter().unitDivided(by: HKUnit.second())) { value in
                result.stairAscentSpeedMs = value
                dispatchGroup.leave()
            }
        }
        
        // Stair Descent Speed (m/s)
        if let stairDescentType = HKObjectType.quantityType(forIdentifier: .stairDescentSpeed) {
            dispatchGroup.enter()
            aggregateAverageQuantity(type: stairDescentType, dayStart: dayStart, dayEnd: dayEnd, unit: HKUnit.meter().unitDivided(by: HKUnit.second())) { value in
                result.stairDescentSpeedMs = value
                dispatchGroup.leave()
            }
        }
        
        dispatchGroup.notify(queue: .global(qos: .background)) {
            completion(result)
        }
    }
    
    /// Helper: Get average value for a quantity type over a day
    private func aggregateAverageQuantity(type: HKQuantityType, dayStart: Date, dayEnd: Date, unit: HKUnit, completion: @escaping (Double?) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { (query, statistics, error) in
            guard let avg = statistics?.averageQuantity(), error == nil else {
                completion(nil)
                return
            }
            completion(avg.doubleValue(for: unit))
        }
        
        healthStore.execute(query)
    }
    
    /// Helper: Get latest value for a quantity type over a day
    private func aggregateLatestQuantity(type: HKQuantityType, dayStart: Date, dayEnd: Date, unit: HKUnit, completion: @escaping (Double?) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { (query, samples, error) in
            guard let sample = samples?.first as? HKQuantitySample, error == nil else {
                completion(nil)
                return
            }
            completion(sample.quantity.doubleValue(for: unit))
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Backend Upload
    
    /// Upload normalized metrics to backend
    private func uploadMetricsToBackend(metrics: [NormalizedDailyMetrics], completion: @escaping (Bool, Error?) -> Void) {
        guard !metrics.isEmpty else {
            completion(true, nil)
            return
        }
        
        print("[Normalisation] Uploading \(metrics.count) days of normalized metrics to backend")
        
        // Get JWT token from secure storage
        guard let token = getJWTToken() else {
            completion(false, NSError(domain: "NormalisationService", code: 2, userInfo: [NSLocalizedDescriptionKey: "No authentication token found"]))
            return
        }
        
        // Upload each day's metrics
        let dispatchGroup = DispatchGroup()
        var uploadErrors: [Error] = []
        
        for dayMetrics in metrics {
            dispatchGroup.enter()
            uploadSingleDayMetrics(dayMetrics, token: token) { success, error in
                if !success, let error = error {
                    uploadErrors.append(error)
                }
                dispatchGroup.leave()
            }
        }
        
        dispatchGroup.notify(queue: .main) {
            if uploadErrors.isEmpty {
                print("[Normalisation] Successfully uploaded all metrics")
                completion(true, nil)
            } else {
                print("[Normalisation] Upload completed with \(uploadErrors.count) errors")
                completion(false, uploadErrors.first)
            }
        }
    }
    
    /// Upload a single day's metrics to backend
    private func uploadSingleDayMetrics(_ metrics: NormalizedDailyMetrics, token: String, completion: @escaping (Bool, Error?) -> Void) {
        let baseURL = getBackendURL()
        guard let url = URL(string: "\(baseURL)/api/healthkit/daily-metrics") else {
            completion(false, NSError(domain: "NormalisationService", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid backend URL"]))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let jsonData = try encoder.encode(metrics)
            request.httpBody = jsonData
            
            // Debug: Print what we're sending
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print("[Normalisation] Sending payload for \(metrics.localDate): \(jsonString.prefix(200))...")
            }
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("[Normalisation] Upload error for \(metrics.localDate): \(error.localizedDescription)")
                    completion(false, error)
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(false, NSError(domain: "NormalisationService", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid response"]))
                    return
                }
                
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    print("[Normalisation] Successfully uploaded metrics for \(metrics.localDate)")
                    completion(true, nil)
                } else {
                    var errorMsg = "Upload failed with status \(httpResponse.statusCode)"
                    if let data = data, let responseBody = String(data: data, encoding: .utf8) {
                        print("[Normalisation] Response body: \(responseBody)")
                        errorMsg += " - \(responseBody)"
                    }
                    print("[Normalisation] \(errorMsg) for \(metrics.localDate)")
                    completion(false, NSError(domain: "NormalisationService", code: 5, userInfo: [NSLocalizedDescriptionKey: errorMsg]))
                }
            }
            
            task.resume()
        } catch {
            print("[Normalisation] JSON encoding error: \(error.localizedDescription)")
            completion(false, error)
        }
    }
    
    /// Collect and upload raw sleep samples to backend for processing
    private func uploadSleepNights(for dayBoundaries: [(Date, Date, String)], completion: @escaping (Bool, Error?) -> Void) {
        guard let token = getJWTToken() else {
            print("[Sleep] No auth token for sleep upload")
            completion(false, NSError(domain: "NormalisationService", code: 2, userInfo: [NSLocalizedDescriptionKey: "No authentication token found"]))
            return
        }
        
        let dispatchGroup = DispatchGroup()
        var uploadErrors: [Error] = []
        var successCount = 0
        
        print("[Sleep] Collecting raw sleep samples for \(dayBoundaries.count) days")
        
        for (_, _, localDateStr) in dayBoundaries {
            dispatchGroup.enter()
            
            // Collect raw samples for this sleep date
            // NOTE: Using strong self capture (no [weak self]) because:
            // 1. No retain cycle - just an async callback that completes and releases
            // 2. DispatchGroup ensures the service stays alive until all queries finish
            self.collectRawSleepSamples(sleepDate: localDateStr) { samples in
                if !samples.isEmpty {
                    // Upload raw samples to backend for processing
                    self.uploadRawSleepSamples(samples: samples, sleepDate: localDateStr, token: token) { success, error in
                        if success {
                            successCount += 1
                        } else if let error = error {
                            uploadErrors.append(error)
                        }
                        dispatchGroup.leave()
                    }
                } else {
                    // No sleep data for this day - that's okay
                    print("[Sleep] No sleep samples for \(localDateStr)")
                    dispatchGroup.leave()
                }
            }
        }
        
        dispatchGroup.notify(queue: .main) {
            if uploadErrors.isEmpty {
                print("[Sleep] Successfully uploaded \(successCount) sleep nights")
                completion(true, nil)
            } else {
                print("[Sleep] Sleep upload completed with \(uploadErrors.count) errors, \(successCount) successes")
                // Don't fail the entire sync if only sleep fails
                completion(true, nil)
            }
        }
    }
    
    /// Collect raw sleep samples for a given sleep date (15:00 prev day → 15:00 current day)
    private func collectRawSleepSamples(sleepDate: String, completion: @escaping ([[String: Any]]) -> Void) {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = userTimezone
        
        guard let date = dateFormatter.date(from: sleepDate) else {
            print("[Sleep] Invalid sleep date: \(sleepDate)")
            completion([])
            return
        }
        
        // Define query window: 15:00 previous day → 15:00 current day
        guard let windowEnd = calendar.date(bySettingHour: 15, minute: 0, second: 0, of: date),
              let yesterday = calendar.date(byAdding: .day, value: -1, to: date),
              let windowStart = calendar.date(bySettingHour: 15, minute: 0, second: 0, of: yesterday) else {
            completion([])
            return
        }
        
        print("[Sleep] Querying samples for \(sleepDate), window: \(windowStart) to \(windowEnd)")
        
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate)
        let sortDescriptors = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        
        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: sortDescriptors) { (_, samples, error) in
            guard let samples = samples as? [HKCategorySample], error == nil else {
                print("[Sleep] Query error: \(error?.localizedDescription ?? "unknown")")
                completion([])
                return
            }
            
            print("[Sleep] Found \(samples.count) raw sleep samples for \(sleepDate)")
            
            // Convert to simple JSON-serializable format
            let iso8601 = ISO8601DateFormatter()
            iso8601.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            
            let rawSamples = samples.map { sample -> [String: Any] in
                let stageValue = sample.value
                var stage = "unspecified"
                
                if #available(iOS 16.0, *) {
                    switch HKCategoryValueSleepAnalysis(rawValue: stageValue) {
                    case .inBed:
                        stage = "inBed"
                    case .asleep:
                        stage = "asleep"
                    case .awake:
                        stage = "awake"
                    case .asleepCore:
                        stage = "core"
                    case .asleepDeep:
                        stage = "deep"
                    case .asleepREM:
                        stage = "rem"
                    case .asleepUnspecified:
                        stage = "unspecified"
                    default:
                        stage = "unspecified"
                    }
                } else {
                    // iOS 15 and earlier
                    switch HKCategoryValueSleepAnalysis(rawValue: stageValue) {
                    case .inBed:
                        stage = "inBed"
                    case .asleep:
                        stage = "asleep"
                    case .awake:
                        stage = "awake"
                    default:
                        stage = "unspecified"
                    }
                }
                
                return [
                    "start": iso8601.string(from: sample.startDate),
                    "end": iso8601.string(from: sample.endDate),
                    "stage": stage,
                    "source": sample.sourceRevision.source.bundleIdentifier ?? "unknown"
                ]
            }
            
            // CRITICAL: Dispatch to main queue to ensure completion handler is received
            DispatchQueue.main.async {
                completion(rawSamples)
            }
        }
        
        healthStore.execute(query)
    }
    
    /// Upload raw sleep samples to backend for processing
    private func uploadRawSleepSamples(samples: [[String: Any]], sleepDate: String, token: String, completion: @escaping (Bool, Error?) -> Void) {
        let baseURL = getBackendURL()
        guard let url = URL(string: "\(baseURL)/api/healthkit/sleep-samples") else {
            completion(false, NSError(domain: "NormalisationService", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid backend URL"]))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let payload: [String: Any] = [
            "samples": samples,
            "sleepDate": sleepDate,
            "timezone": userTimezone.identifier
        ]
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: payload)
            request.httpBody = jsonData
            
            print("[Sleep] Uploading \(samples.count) raw samples for \(sleepDate)")
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("[Sleep] Upload error for \(sleepDate): \(error.localizedDescription)")
                    completion(false, error)
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(false, NSError(domain: "NormalisationService", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid response"]))
                    return
                }
                
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    print("[Sleep] Successfully uploaded raw samples for \(sleepDate)")
                    completion(true, nil)
                } else {
                    var errorMsg = "HTTP \(httpResponse.statusCode)"
                    if let data = data, let responseBody = String(data: data, encoding: .utf8) {
                        print("[Sleep] Response: \(responseBody)")
                        errorMsg += " - \(responseBody)"
                    }
                    print("[Sleep] Upload failed for \(sleepDate): \(errorMsg)")
                    completion(false, NSError(domain: "NormalisationService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMsg]))
                }
            }
            
            task.resume()
        } catch {
            print("[Sleep] JSON encoding error: \(error.localizedDescription)")
            completion(false, error)
        }
    }
    
    // MARK: - Mindfulness Session Sync
    
    /// Sync mindfulness sessions to backend as raw samples
    func syncMindfulnessSessions(for dayBoundaries: [(Date, Date, String)], completion: @escaping (Bool, Error?) -> Void) {
        guard let token = getJWTToken() else {
            print("[Mindfulness] No auth token for mindfulness upload")
            completion(false, NSError(domain: "NormalisationService", code: 2, userInfo: [NSLocalizedDescriptionKey: "No authentication token found"]))
            return
        }
        
        let dispatchGroup = DispatchGroup()
        var allSamples: [[String: Any]] = []
        
        for (dayStart, dayEnd, _) in dayBoundaries {
            dispatchGroup.enter()
            collectMindfulnessSamples(dayStart: dayStart, dayEnd: dayEnd) { samples in
                allSamples.append(contentsOf: samples)
                dispatchGroup.leave()
            }
        }
        
        dispatchGroup.notify(queue: .main) {
            if allSamples.isEmpty {
                print("[Mindfulness] No mindfulness sessions found")
                completion(true, nil)
                return
            }
            
            self.uploadRawSamplesToBackend(samples: allSamples, token: token, dataTypeName: "Mindfulness") { success, error in
                completion(success, error)
            }
        }
    }
    
    /// Collect mindfulness session samples for a day
    private func collectMindfulnessSamples(dayStart: Date, dayEnd: Date, completion: @escaping ([[String: Any]]) -> Void) {
        guard let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
            completion([])
            return
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        let sortDescriptors = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        
        let query = HKSampleQuery(sampleType: mindfulType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: sortDescriptors) { (_, samples, error) in
            guard let samples = samples as? [HKCategorySample], error == nil else {
                print("[Mindfulness] Query error: \(error?.localizedDescription ?? "unknown")")
                DispatchQueue.main.async { completion([]) }
                return
            }
            
            print("[Mindfulness] Found \(samples.count) mindfulness sessions")
            
            let iso8601 = ISO8601DateFormatter()
            iso8601.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            
            let rawSamples = samples.map { sample -> [String: Any] in
                // Calculate duration in minutes
                let durationMinutes = sample.endDate.timeIntervalSince(sample.startDate) / 60.0
                
                return [
                    "dataType": "mindfulSession",
                    "value": durationMinutes,
                    "unit": "min",
                    "startDate": iso8601.string(from: sample.startDate),
                    "endDate": iso8601.string(from: sample.endDate),
                    "sourceName": sample.sourceRevision.source.name,
                    "sourceBundleId": sample.sourceRevision.source.bundleIdentifier ?? "unknown",
                    "uuid": sample.uuid.uuidString
                ]
            }
            
            DispatchQueue.main.async { completion(rawSamples) }
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Nutrition Data Sync
    
    /// Sync nutrition data to backend as raw samples
    func syncNutritionData(for dayBoundaries: [(Date, Date, String)], completion: @escaping (Bool, Error?) -> Void) {
        guard let token = getJWTToken() else {
            print("[Nutrition] No auth token for nutrition upload")
            completion(false, NSError(domain: "NormalisationService", code: 2, userInfo: [NSLocalizedDescriptionKey: "No authentication token found"]))
            return
        }
        
        let dispatchGroup = DispatchGroup()
        var allSamples: [[String: Any]] = []
        
        for (dayStart, dayEnd, _) in dayBoundaries {
            dispatchGroup.enter()
            collectNutritionSamples(dayStart: dayStart, dayEnd: dayEnd) { samples in
                allSamples.append(contentsOf: samples)
                dispatchGroup.leave()
            }
        }
        
        dispatchGroup.notify(queue: .main) {
            if allSamples.isEmpty {
                print("[Nutrition] No nutrition data found")
                completion(true, nil)
                return
            }
            
            self.uploadRawSamplesToBackend(samples: allSamples, token: token, dataTypeName: "Nutrition") { success, error in
                if success {
                    // Trigger aggregation for each day after successful upload
                    self.triggerNutritionAggregation(for: dayBoundaries, token: token) { aggSuccess, aggError in
                        if let aggError = aggError {
                            print("[Nutrition] ⚠️ Aggregation warning: \(aggError.localizedDescription)")
                        }
                        // Don't fail overall sync if aggregation fails - samples are already uploaded
                        completion(success, error)
                    }
                } else {
                    completion(success, error)
                }
            }
        }
    }
    
    /// Trigger nutrition aggregation on backend for each day
    private func triggerNutritionAggregation(for dayBoundaries: [(Date, Date, String)], token: String, completion: @escaping (Bool, Error?) -> Void) {
        let baseURL = getBackendURL()
        guard let url = URL(string: "\(baseURL)/api/nutrition/aggregate") else {
            completion(false, NSError(domain: "NormalisationService", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid backend URL"]))
            return
        }
        
        let dispatchGroup = DispatchGroup()
        var anyFailed = false
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        
        // Note: dayBoundaries tuple is (dayStart, dayEnd, localDateStr) - 3rd element is the date string, not timezone
        // We need to send the actual timezone identifier
        let timezoneIdentifier = userTimezone.identifier
        
        for (dayStart, _, localDateStr) in dayBoundaries {
            dispatchGroup.enter()
            
            // Use the localDateStr from dayBoundaries (already formatted as yyyy-MM-dd)
            let body: [String: Any] = [
                "localDate": localDateStr,
                "timezone": timezoneIdentifier
            ]
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            
            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: body)
            } catch {
                print("[Nutrition] Failed to encode aggregation request")
                dispatchGroup.leave()
                continue
            }
            
            URLSession.shared.dataTask(with: request) { data, response, error in
                defer { dispatchGroup.leave() }
                
                if let error = error {
                    print("[Nutrition] ❌ Aggregation failed for \(localDate): \(error.localizedDescription)")
                    anyFailed = true
                    return
                }
                
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    print("[Nutrition] ✅ Aggregation triggered for \(localDate)")
                } else {
                    print("[Nutrition] ⚠️ Aggregation response not 200 for \(localDate)")
                    anyFailed = true
                }
            }.resume()
        }
        
        dispatchGroup.notify(queue: .main) {
            completion(!anyFailed, nil)
        }
    }
    
    /// Nutrition types to query from HealthKit
    private var nutritionTypes: [(HKQuantityTypeIdentifier, String, HKUnit)] {
        return [
            // Macronutrients
            (.dietaryEnergyConsumed, "dietaryEnergyConsumed", HKUnit.kilocalorie()),
            (.dietaryProtein, "dietaryProtein", HKUnit.gram()),
            (.dietaryCarbohydrates, "dietaryCarbohydrates", HKUnit.gram()),
            (.dietaryFatTotal, "dietaryFatTotal", HKUnit.gram()),
            (.dietaryFiber, "dietaryFiber", HKUnit.gram()),
            (.dietarySugar, "dietarySugar", HKUnit.gram()),
            // Fat types
            (.dietaryFatSaturated, "dietaryFatSaturated", HKUnit.gram()),
            (.dietaryFatMonounsaturated, "dietaryFatMonounsaturated", HKUnit.gram()),
            (.dietaryFatPolyunsaturated, "dietaryFatPolyunsaturated", HKUnit.gram()),
            (.dietaryCholesterol, "dietaryCholesterol", HKUnit.gramUnit(with: .milli)),
            // Minerals
            (.dietarySodium, "dietarySodium", HKUnit.gramUnit(with: .milli)),
            (.dietaryPotassium, "dietaryPotassium", HKUnit.gramUnit(with: .milli)),
            (.dietaryCalcium, "dietaryCalcium", HKUnit.gramUnit(with: .milli)),
            (.dietaryIron, "dietaryIron", HKUnit.gramUnit(with: .milli)),
            (.dietaryMagnesium, "dietaryMagnesium", HKUnit.gramUnit(with: .milli)),
            (.dietaryZinc, "dietaryZinc", HKUnit.gramUnit(with: .milli)),
            // Vitamins
            (.dietaryVitaminA, "dietaryVitaminA", HKUnit.gramUnit(with: .micro)),
            (.dietaryVitaminC, "dietaryVitaminC", HKUnit.gramUnit(with: .milli)),
            (.dietaryVitaminD, "dietaryVitaminD", HKUnit.gramUnit(with: .micro)),
            (.dietaryVitaminE, "dietaryVitaminE", HKUnit.gramUnit(with: .milli)),
            (.dietaryVitaminK, "dietaryVitaminK", HKUnit.gramUnit(with: .micro)),
            (.dietaryVitaminB6, "dietaryVitaminB6", HKUnit.gramUnit(with: .milli)),
            (.dietaryVitaminB12, "dietaryVitaminB12", HKUnit.gramUnit(with: .micro)),
            (.dietaryFolate, "dietaryFolate", HKUnit.gramUnit(with: .micro)),
            // Other
            (.dietaryCaffeine, "dietaryCaffeine", HKUnit.gramUnit(with: .milli)),
            (.dietaryWater, "dietaryWater", HKUnit.literUnit(with: .milli))
        ]
    }
    
    /// Collect nutrition samples for a day
    private func collectNutritionSamples(dayStart: Date, dayEnd: Date, completion: @escaping ([[String: Any]]) -> Void) {
        let dispatchGroup = DispatchGroup()
        var allSamples: [[String: Any]] = []
        var typesWithData: [String] = []
        var typesQueried = 0
        let lock = NSLock()
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let dateStr = dateFormatter.string(from: dayStart)
        
        print("[Nutrition] Querying \(nutritionTypes.count) nutrition types for \(dateStr)")
        
        // Check a sample nutrition type to see if we have authorization
        if let testType = HKObjectType.quantityType(forIdentifier: .dietaryProtein) {
            let testPredicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
            let testQuery = HKSampleQuery(sampleType: testType, predicate: testPredicate, limit: 1, sortDescriptors: nil) { (_, samples, error) in
                if let error = error {
                    print("[Nutrition] ❌ Authorization test failed: \(error.localizedDescription)")
                } else if samples?.isEmpty == true {
                    print("[Nutrition] ⚠️ Dietary Protein query returned 0 samples - check Health app permissions")
                } else {
                    print("[Nutrition] ✅ Authorization confirmed - found \(samples?.count ?? 0) sample(s)")
                }
            }
            self.healthStore.execute(testQuery)
        }
        
        for (typeId, typeName, unit) in nutritionTypes {
            guard let quantityType = HKObjectType.quantityType(forIdentifier: typeId) else {
                print("[Nutrition] ⚠️ Could not create quantity type for \(typeName)")
                continue
            }
            
            dispatchGroup.enter()
            typesQueried += 1
            
            let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
            let sortDescriptors = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            
            let query = HKSampleQuery(sampleType: quantityType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: sortDescriptors) { (_, samples, error) in
                defer { dispatchGroup.leave() }
                
                if let error = error {
                    print("[Nutrition] ❌ Error querying \(typeName): \(error.localizedDescription)")
                    return
                }
                
                guard let samples = samples as? [HKQuantitySample] else {
                    return
                }
                
                if samples.count > 0 {
                    lock.lock()
                    typesWithData.append("\(typeName):\(samples.count)")
                    lock.unlock()
                }
                
                let iso8601 = ISO8601DateFormatter()
                iso8601.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                
                let rawSamples = samples.map { sample -> [String: Any] in
                    return [
                        "dataType": typeName,
                        "value": sample.quantity.doubleValue(for: unit),
                        "unit": unit.unitString,
                        "startDate": iso8601.string(from: sample.startDate),
                        "endDate": iso8601.string(from: sample.endDate),
                        "sourceName": sample.sourceRevision.source.name,
                        "sourceBundleId": sample.sourceRevision.source.bundleIdentifier ?? "unknown",
                        "uuid": sample.uuid.uuidString
                    ]
                }
                
                lock.lock()
                allSamples.append(contentsOf: rawSamples)
                lock.unlock()
            }
            
            healthStore.execute(query)
        }
        
        dispatchGroup.notify(queue: .main) {
            print("[Nutrition] Queried \(typesQueried) types for \(dateStr)")
            if typesWithData.isEmpty {
                print("[Nutrition] ⚠️ No nutrition data found in Apple Health for \(dateStr)")
            } else {
                print("[Nutrition] ✅ Found data: \(typesWithData.joined(separator: ", "))")
            }
            print("[Nutrition] Total samples collected: \(allSamples.count)")
            completion(allSamples)
        }
    }
    
    /// Generic function to upload raw samples to /api/healthkit/samples endpoint
    private func uploadRawSamplesToBackend(samples: [[String: Any]], token: String, dataTypeName: String, completion: @escaping (Bool, Error?) -> Void) {
        let baseURL = getBackendURL()
        guard let url = URL(string: "\(baseURL)/api/healthkit/samples") else {
            completion(false, NSError(domain: "NormalisationService", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid backend URL"]))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let payload: [String: Any] = ["samples": samples]
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: payload)
            request.httpBody = jsonData
            
            print("[\(dataTypeName)] Uploading \(samples.count) samples to backend")
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("[\(dataTypeName)] Upload error: \(error.localizedDescription)")
                    completion(false, error)
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(false, NSError(domain: "NormalisationService", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid response"]))
                    return
                }
                
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    print("[\(dataTypeName)] Successfully uploaded \(samples.count) samples")
                    completion(true, nil)
                } else {
                    var errorMsg = "HTTP \(httpResponse.statusCode)"
                    if let data = data, let responseBody = String(data: data, encoding: .utf8) {
                        print("[\(dataTypeName)] Response: \(responseBody)")
                        errorMsg += " - \(responseBody)"
                    }
                    print("[\(dataTypeName)] Upload failed: \(errorMsg)")
                    completion(false, NSError(domain: "NormalisationService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMsg]))
                }
            }
            
            task.resume()
        } catch {
            print("[\(dataTypeName)] JSON encoding error: \(error.localizedDescription)")
            completion(false, error)
        }
    }
    
    /// Upload a single sleep night to backend
    private func uploadSleepNightToBackend(sleepNight: SleepNightData, token: String, completion: @escaping (Bool, Error?) -> Void) {
        let baseURL = getBackendURL()
        guard let url = URL(string: "\(baseURL)/api/sleep/nights") else {
            completion(false, NSError(domain: "NormalisationService", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid backend URL"]))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let jsonData = try encoder.encode(sleepNight)
            request.httpBody = jsonData
            
            print("[Normalisation] Uploading sleep night for \(sleepNight.sleepDate)")
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("[Normalisation] Sleep upload error for \(sleepNight.sleepDate): \(error.localizedDescription)")
                    completion(false, error)
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(false, NSError(domain: "NormalisationService", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid response"]))
                    return
                }
                
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    print("[Normalisation] Successfully uploaded sleep for \(sleepNight.sleepDate)")
                    completion(true, nil)
                } else {
                    let errorMsg = "HTTP \(httpResponse.statusCode)"
                    print("[Normalisation] Sleep upload failed for \(sleepNight.sleepDate): \(errorMsg)")
                    completion(false, NSError(domain: "NormalisationService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMsg]))
                }
            }
            
            task.resume()
        } catch {
            print("[Normalisation] Sleep encoding error: \(error.localizedDescription)")
            completion(false, error)
        }
    }
    
    // MARK: - Helpers
    
    private func getJWTToken() -> String? {
        // TODO: Retrieve JWT token from Capacitor Secure Storage
        // For now, return nil - will need to integrate with auth system
        return UserDefaults.standard.string(forKey: "jwt_token")
    }
    
    private func getBackendURL() -> String {
        // PROD: Production domain
        return "https://get-flo.com"
        // DEV: Uncomment this for local development
        // return "https://7de3d6a7-d19a-4ca9-b491-86cd4eba9a01-00-36fnrwc0flg0z.picard.replit.dev"
    }
    
    // MARK: - Sleep Night Processing (Inline to avoid Xcode config issues)
    
    /// Comprehensive sleep night data structure matching backend sleep_nights table
    private struct SleepNightData: Codable {
        let userId: String
        let sleepDate: String
        let timezone: String
        let nightStart: String?
        let finalWake: String?
        let sleepOnset: String?
        let timeInBedMin: Double?
        let totalSleepMin: Double?
        let sleepEfficiencyPct: Double?
        let sleepLatencyMin: Double?
        let wasoMin: Double?
        let numAwakenings: Int?
        let coreSleepMin: Double?
        let deepSleepMin: Double?
        let remSleepMin: Double?
        let unspecifiedSleepMin: Double?
        let awakeInBedMin: Double?
        let midSleepTimeLocal: Double?
        let fragmentationIndex: Double?
        let deepPct: Double?
        let remPct: Double?
        let corePct: Double?
        let bedtimeLocal: String?
        let waketimeLocal: String?
        let restingHrBpm: Double?
        let hrvMs: Double?
        let respiratoryRate: Double?
        let wristTemperature: Double?
        let oxygenSaturation: Double?
    }
    
    private struct SleepSegment {
        let start: Date
        let end: Date
        let value: HKCategoryValueSleepAnalysis
        let source: String?
        
        var duration: TimeInterval {
            return end.timeIntervalSince(start)
        }
        
        var durationMinutes: Double {
            return duration / 60.0
        }
    }
    
    // Merge overlapping time intervals to get accurate total duration
    private func mergeOverlappingIntervals(_ segments: [SleepSegment]) -> Double {
        guard !segments.isEmpty else { return 0.0 }
        
        // Sort by start time
        let sorted = segments.sorted { $0.start < $1.start }
        
        var merged: [(start: Date, end: Date)] = []
        var currentStart = sorted[0].start
        var currentEnd = sorted[0].end
        
        for segment in sorted.dropFirst() {
            if segment.start <= currentEnd {
                // Overlapping or adjacent - extend current interval
                currentEnd = max(currentEnd, segment.end)
            } else {
                // Non-overlapping - save current and start new
                merged.append((currentStart, currentEnd))
                currentStart = segment.start
                currentEnd = segment.end
            }
        }
        
        // Don't forget the last interval
        merged.append((currentStart, currentEnd))
        
        // Sum the merged intervals
        let totalSeconds = merged.reduce(0.0) { $0 + $1.end.timeIntervalSince($1.start) }
        return totalSeconds / 60.0 // Convert to minutes
    }
    
    private func processSleepNightData(
        sleepDate: String,
        timezone: TimeZone,
        userId: String,
        completion: @escaping (SleepNightData?) -> Void
    ) {
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        
        // iOS PRIVACY NOTE: For category types like sleep, authorizationStatus() always returns
        // .sharingDenied even when read permission is granted. We skip the auth check and just
        // attempt the query - if permission is denied, the query will return empty results.
        // This is documented iOS behavior for HKCategoryType authorization status.
        
        // Log detailed permission info for debugging
        let authStatus = healthStore.authorizationStatus(for: sleepType)
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = timezone
        
        guard let date = dateFormatter.date(from: sleepDate) else {
            print("[Sleep] Invalid date format: \(sleepDate)")
            completion(nil)
            return
        }
        
        // Create query window to capture overnight sleep
        // Sleep typically starts the evening BEFORE the sleep_date and ends on sleep_date morning
        // Query from previous day at 12:00 PM to current day at 6:00 PM to capture full night
        var calendar = Calendar.current
        calendar.timeZone = timezone
        
        // Previous day at noon (12:00 PM)
        guard let previousDay = calendar.date(byAdding: .day, value: -1, to: date),
              let windowStart = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: previousDay) else {
            print("[Sleep] Failed to create query start for \(sleepDate)")
            completion(nil)
            return
        }
        
        // Current day at 6:00 PM
        guard let windowEnd = calendar.date(bySettingHour: 18, minute: 0, second: 0, of: date) else {
            print("[Sleep] Failed to create query end for \(sleepDate)")
            completion(nil)
            return
        }
        
        print("[Sleep] Querying sleep for \(sleepDate): \(windowStart) to \(windowEnd) (timezone: \(timezone.identifier))")
        
        // Log query details for debugging
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = timezone
        print("[Sleep] 🔍 Query window: \(formatter.string(from: windowStart)) to \(formatter.string(from: windowEnd))")
        
        // Use empty options to capture ANY sleep that overlaps with this day
        // This includes sleep that starts before or ends after the window boundaries
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: [])
        
        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { (_, samples, error) in
            if let error = error {
                print("[Sleep] ❌ HealthKit query error for \(sleepDate): \(error.localizedDescription)")
                print("[Sleep] ❌ Error code: \(error._code), domain: \(error._domain)")
                completion(nil)
                return
            }
            
            guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                print("[Sleep] No sleep data found for \(sleepDate)")
                completion(nil)
                return
            }
            
            print("[Sleep] 🌙 Found \(samples.count) sleep samples for \(sleepDate)")
            
            var segments: [SleepSegment] = []
            for sample in samples {
                if let value = HKCategoryValueSleepAnalysis(rawValue: sample.value) {
                    segments.append(SleepSegment(
                        start: sample.startDate,
                        end: sample.endDate,
                        value: value,
                        source: sample.sourceRevision.source.bundleIdentifier
                    ))
                }
            }
            
            let sleepNight = self.buildSleepNight(segments: segments, sleepDate: sleepDate, timezone: timezone, userId: userId)
            completion(sleepNight)
        }
        
        healthStore.execute(query)
    }
    
    private func buildSleepNight(segments: [SleepSegment], sleepDate: String, timezone: TimeZone, userId: String) -> SleepNightData? {
        guard !segments.isEmpty else {
            print("[Sleep] No valid segments for \(sleepDate)")
            return nil
        }
        
        // Separate inBed samples from sleep stage samples
        let inBedSegments = segments.filter { $0.value == .inBed }
        let stageSegments = segments.filter { $0.value != .inBed }
        
        print("[Sleep] Building night for \(sleepDate): \(inBedSegments.count) inBed, \(stageSegments.count) stages")
        
        // Calculate night boundaries from all segments
        let allStarts = segments.map { $0.start }
        let allEnds = segments.map { $0.end }
        guard let nightStart = allStarts.min(), let finalWake = allEnds.max() else {
            print("[Sleep] Could not determine night boundaries for \(sleepDate)")
            return nil
        }
        
        
        // iOS 16+ sleep stages or fallback to generic asleep
        let asleepSegments: [SleepSegment]
        if #available(iOS 16.0, *) {
            asleepSegments = segments.filter { 
                $0.value == .asleepCore || $0.value == .asleepDeep || 
                $0.value == .asleepREM || $0.value == .asleepUnspecified || 
                $0.value == .asleep 
            }
        } else {
            asleepSegments = segments.filter { $0.value == .asleep }
        }
        
        let sleepOnset = asleepSegments.first?.start
        
        // Calculate total time in bed (merge overlapping intervals)
        // - If explicit .inBed samples exist, use those
        // - Otherwise, use all sleep-related samples (asleep stages + awake in bed)
        let timeInBedMin: Double
        if !inBedSegments.isEmpty {
            // Use explicit inBed samples
            timeInBedMin = mergeOverlappingIntervals(inBedSegments)
        } else {
            // Use all sleep session samples (all stages including awake)
            timeInBedMin = mergeOverlappingIntervals(stageSegments)
        }
        
        let totalSleepMin = mergeOverlappingIntervals(asleepSegments)
        
        print("[Sleep] \(sleepDate): \(Int(timeInBedMin))min in bed, \(Int(totalSleepMin))min asleep")
        
        guard totalSleepMin >= 180 else {
            print("[Sleep] Insufficient sleep for \(sleepDate): \(Int(totalSleepMin))min < 180min required")
            return nil
        }
        
        let iso8601 = ISO8601DateFormatter()
        iso8601.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        // Calculate stage durations (iOS 16+ only) - merge overlapping intervals
        var coreSleepMin: Double = 0
        var deepSleepMin: Double = 0
        var remSleepMin: Double = 0
        var unspecifiedSleepMin: Double = 0
        
        if #available(iOS 16.0, *) {
            coreSleepMin = mergeOverlappingIntervals(stageSegments.filter { $0.value == .asleepCore })
            deepSleepMin = mergeOverlappingIntervals(stageSegments.filter { $0.value == .asleepDeep })
            remSleepMin = mergeOverlappingIntervals(stageSegments.filter { $0.value == .asleepREM })
            unspecifiedSleepMin = mergeOverlappingIntervals(stageSegments.filter { $0.value == .asleepUnspecified || $0.value == .asleep })
        } else {
            unspecifiedSleepMin = totalSleepMin
        }
        
        let awakeInBedMin = mergeOverlappingIntervals(stageSegments.filter { $0.value == .awake })
        
        // Calculate percentages
        var deepPct: Double? = nil
        var remPct: Double? = nil
        var corePct: Double? = nil
        
        if #available(iOS 16.0, *), totalSleepMin > 0 {
            deepPct = (deepSleepMin / totalSleepMin) * 100.0
            remPct = (remSleepMin / totalSleepMin) * 100.0
            corePct = (coreSleepMin / totalSleepMin) * 100.0
        }
        
        // Format bedtime and wake time
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "h:mm a"
        timeFormatter.timeZone = timezone
        let bedtimeLocal = timeFormatter.string(from: nightStart).lowercased()
        let waketimeLocal = timeFormatter.string(from: finalWake).lowercased()
        
        return SleepNightData(
            userId: userId,
            sleepDate: sleepDate,
            timezone: timezone.identifier,
            nightStart: iso8601.string(from: nightStart),
            finalWake: iso8601.string(from: finalWake),
            sleepOnset: sleepOnset != nil ? iso8601.string(from: sleepOnset!) : nil,
            timeInBedMin: timeInBedMin,
            totalSleepMin: totalSleepMin,
            sleepEfficiencyPct: timeInBedMin > 0 ? min(100.0, (totalSleepMin / timeInBedMin) * 100.0) : nil,
            sleepLatencyMin: nil,
            wasoMin: nil,
            numAwakenings: nil,
            coreSleepMin: coreSleepMin > 0 ? coreSleepMin : nil,
            deepSleepMin: deepSleepMin > 0 ? deepSleepMin : nil,
            remSleepMin: remSleepMin > 0 ? remSleepMin : nil,
            unspecifiedSleepMin: unspecifiedSleepMin > 0 ? unspecifiedSleepMin : nil,
            awakeInBedMin: awakeInBedMin > 0 ? awakeInBedMin : nil,
            midSleepTimeLocal: nil,
            fragmentationIndex: nil,
            deepPct: deepPct,
            remPct: remPct,
            corePct: corePct,
            bedtimeLocal: bedtimeLocal,
            waketimeLocal: waketimeLocal,
            restingHrBpm: nil,
            hrvMs: nil,
            respiratoryRate: nil,
            wristTemperature: nil,
            oxygenSaturation: nil
        )
    }

    // MARK: - Workout Processing
    
    /// Workout data structure matching backend healthkit_workouts table
    private struct WorkoutData: Codable {
        let workoutType: String
        let startDate: String
        let endDate: String
        let duration: Double  // in minutes
        let totalDistance: Double?
        let totalDistanceUnit: String?
        let totalEnergyBurned: Double?
        let totalEnergyBurnedUnit: String?
        let averageHeartRate: Double?
        let maxHeartRate: Double?
        let minHeartRate: Double?
        let sourceName: String?
        let sourceBundleId: String?
        let deviceName: String?
        let deviceManufacturer: String?
        let deviceModel: String?
        let metadata: [String: String]?  // Changed from [String: Any]? to [String: String]?
        let uuid: String?
        
        // Custom encode for metadata field
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(workoutType, forKey: .workoutType)
            try container.encode(startDate, forKey: .startDate)
            try container.encode(endDate, forKey: .endDate)
            try container.encode(duration, forKey: .duration)
            try container.encodeIfPresent(totalDistance, forKey: .totalDistance)
            try container.encodeIfPresent(totalDistanceUnit, forKey: .totalDistanceUnit)
            try container.encodeIfPresent(totalEnergyBurned, forKey: .totalEnergyBurned)
            try container.encodeIfPresent(totalEnergyBurnedUnit, forKey: .totalEnergyBurnedUnit)
            try container.encodeIfPresent(averageHeartRate, forKey: .averageHeartRate)
            try container.encodeIfPresent(maxHeartRate, forKey: .maxHeartRate)
            try container.encodeIfPresent(minHeartRate, forKey: .minHeartRate)
            try container.encodeIfPresent(sourceName, forKey: .sourceName)
            try container.encodeIfPresent(sourceBundleId, forKey: .sourceBundleId)
            try container.encodeIfPresent(deviceName, forKey: .deviceName)
            try container.encodeIfPresent(deviceManufacturer, forKey: .deviceManufacturer)
            try container.encodeIfPresent(deviceModel, forKey: .deviceModel)
            if let metadata = metadata {
                let jsonData = try JSONSerialization.data(withJSONObject: metadata)
                try container.encode(jsonData, forKey: .metadata)
            }
            try container.encodeIfPresent(uuid, forKey: .uuid)
        }
        
        private enum CodingKeys: String, CodingKey {
            case workoutType, startDate, endDate, duration
            case totalDistance, totalDistanceUnit
            case totalEnergyBurned, totalEnergyBurnedUnit
            case averageHeartRate, maxHeartRate, minHeartRate
            case sourceName, sourceBundleId
            case deviceName, deviceManufacturer, deviceModel
            case metadata, uuid
        }
    }
    
    /// Sync workouts for the last N days
    func syncWorkouts(days: Int = 7, completion: @escaping (Bool, Error?) -> Void) {
        let endDate = Date()
        var dateComponents = DateComponents()
        dateComponents.day = -days
        guard let startDate = calendar.date(byAdding: dateComponents, to: endDate) else {
            completion(false, NSError(domain: "WorkoutSync", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid date range"]))
            return
        }
        
        print("[Workouts] Syncing last \(days) days of workouts")
        queryAndUploadWorkouts(from: startDate, to: endDate, completion: completion)
    }
    
    /// Query and upload workouts from HealthKit
    private func queryAndUploadWorkouts(from startDate: Date, to endDate: Date, completion: @escaping (Bool, Error?) -> Void) {
        let workoutType = HKObjectType.workoutType()
        
        // IMPORTANT: Do NOT check authorization status for workouts!
        // iOS privacy policy prevents accurate status reporting for workout data.
        // Per Apple documentation, authorizationStatus may return .notDetermined or .sharingDenied
        // even when permission is granted. Just attempt the query - if we have permission,
        // we'll get data; if not, we'll get an empty array.
        print("[Workouts] Querying workout data (skipping auth check due to iOS privacy policy)")
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        let query = HKSampleQuery(sampleType: workoutType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sortDescriptor]) { [weak self] (_, samples, error) in
            if let error = error {
                print("[Workouts] Query error: \(error.localizedDescription)")
                completion(false, error)
                return
            }
            
            guard let workouts = samples as? [HKWorkout], !workouts.isEmpty else {
                print("[Workouts] No workouts found in date range")
                completion(true, nil)
                return
            }
            
            print("[Workouts] Found \(workouts.count) workouts")
            
            // Convert workouts to our data structure
            let workoutDataArray = workouts.compactMap { self?.convertWorkoutToData($0) }
            
            // Upload to backend
            self?.uploadWorkoutsToBackend(workouts: workoutDataArray, completion: completion)
        }
        
        healthStore.execute(query)
    }
    
    /// Convert HKWorkout to WorkoutData structure
    private func convertWorkoutToData(_ workout: HKWorkout) -> WorkoutData {
        let iso8601 = ISO8601DateFormatter()
        iso8601.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        // Convert workout type to string
        let workoutTypeString = getWorkoutTypeString(workout.workoutActivityType)
        
        // Calculate heart rate stats if available (iOS 16.0+ only)
        var avgHR: Double? = nil
        var maxHR: Double? = nil
        var minHR: Double? = nil
        
        if #available(iOS 16.0, *) {
            if let heartRateStats = workout.statistics(for: HKQuantityType.quantityType(forIdentifier: .heartRate)!) {
                if let avgQuantity = heartRateStats.averageQuantity() {
                    avgHR = avgQuantity.doubleValue(for: HKUnit(from: "count/min"))
                }
                if let maxQuantity = heartRateStats.maximumQuantity() {
                    maxHR = maxQuantity.doubleValue(for: HKUnit(from: "count/min"))
                }
                if let minQuantity = heartRateStats.minimumQuantity() {
                    minHR = minQuantity.doubleValue(for: HKUnit(from: "count/min"))
                }
            }
        }
        
        // Get distance if available
        var distance: Double? = nil
        var distanceUnit = "meters"
        if let totalDistance = workout.totalDistance {
            distance = totalDistance.doubleValue(for: HKUnit.meter())
        }
        
        // Get energy burned if available
        var energyBurned: Double? = nil
        var energyUnit = "kcal"
        if let totalEnergy = workout.totalEnergyBurned {
            energyBurned = totalEnergy.doubleValue(for: HKUnit.kilocalorie())
        }
        
        // Build metadata - convert all values to strings for JSON serialization
        var metadata: [String: String] = [:]
        if let workoutMetadata = workout.metadata {
            // Convert metadata dictionary to string format
            for (key, value) in workoutMetadata {
                if let stringValue = value as? String {
                    metadata[key] = stringValue
                } else if let numberValue = value as? NSNumber {
                    metadata[key] = String(numberValue.doubleValue)
                } else if let dateValue = value as? Date {
                    metadata[key] = iso8601.string(from: dateValue)
                } else {
                    // Convert any other type to string
                    metadata[key] = String(describing: value)
                }
            }
        }
        
        return WorkoutData(
            workoutType: workoutTypeString,
            startDate: iso8601.string(from: workout.startDate),
            endDate: iso8601.string(from: workout.endDate),
            duration: workout.duration / 60.0, // Convert seconds to minutes
            totalDistance: distance,
            totalDistanceUnit: distanceUnit,
            totalEnergyBurned: energyBurned,
            totalEnergyBurnedUnit: energyUnit,
            averageHeartRate: avgHR,
            maxHeartRate: maxHR,
            minHeartRate: minHR,
            sourceName: workout.sourceRevision.source.name,
            sourceBundleId: workout.sourceRevision.source.bundleIdentifier,
            deviceName: workout.device?.name,
            deviceManufacturer: workout.device?.manufacturer,
            deviceModel: workout.device?.model,
            metadata: metadata.isEmpty ? nil : metadata,
            uuid: workout.uuid.uuidString
        )
    }
    
    /// Get string representation of workout type
    private func getWorkoutTypeString(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .cycling: return "cycling"
        case .walking: return "walking"
        case .swimming: return "swimming"
        case .yoga: return "yoga"
        case .functionalStrengthTraining: return "strength"
        case .traditionalStrengthTraining: return "strength"
        case .crossTraining: return "cross_training"
        case .elliptical: return "elliptical"
        case .rowing: return "rowing"
        case .stairClimbing: return "stair_climbing"
        case .hiking: return "hiking"
        case .dance: return "dance"
        case .pilates: return "pilates"
        case .boxing: return "boxing"
        case .martialArts: return "martial_arts"
        case .tennis: return "tennis"
        case .golf: return "golf"
        case .soccer: return "soccer"
        case .basketball: return "basketball"
        case .baseball: return "baseball"
        case .americanFootball: return "football"
        case .hockey: return "hockey"
        case .volleyball: return "volleyball"
        case .climbing: return "climbing"
        case .downhillSkiing: return "skiing"
        case .crossCountrySkiing: return "cross_country_skiing"
        case .snowboarding: return "snowboarding"
        case .surfingSports: return "surfing"
        case .paddleSports: return "paddling"
        case .sailing: return "sailing"
        case .badminton: return "badminton"
        case .tableTennis: return "table_tennis"
        case .jumpRope: return "jump_rope"
        case .coreTraining: return "core_training"
        case .highIntensityIntervalTraining: return "hiit"
        case .mixedCardio: return "cardio"
        case .other: return "other"
        default: return "unknown"
        }
    }
    
    /// Upload workouts to backend
    private func uploadWorkoutsToBackend(workouts: [WorkoutData], completion: @escaping (Bool, Error?) -> Void) {
        guard !workouts.isEmpty else {
            completion(true, nil)
            return
        }
        
        print("[Workouts] Uploading \(workouts.count) workouts to backend")
        
        // Get JWT token from secure storage
        guard let token = getJWTToken() else {
            completion(false, NSError(domain: "WorkoutSync", code: 3, userInfo: [NSLocalizedDescriptionKey: "No authentication token found"]))
            return
        }
        
        let baseURL = getBackendURL()
        guard let url = URL(string: "\(baseURL)/api/healthkit/workouts/sync") else {
            completion(false, NSError(domain: "WorkoutSync", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid backend URL"]))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        do {
            let encoder = JSONEncoder()
            let payload = ["workouts": workouts]
            let jsonData = try encoder.encode(payload)
            request.httpBody = jsonData
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("[Workouts] Upload error: \(error.localizedDescription)")
                    completion(false, error)
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(false, NSError(domain: "WorkoutSync", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid response"]))
                    return
                }
                
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    if let data = data, let responseStr = String(data: data, encoding: .utf8) {
                        print("[Workouts] Upload successful: \(responseStr)")
                    }
                    completion(true, nil)
                } else {
                    var errorMsg = "Upload failed with status \(httpResponse.statusCode)"
                    if let data = data, let responseBody = String(data: data, encoding: .utf8) {
                        print("[Workouts] Response body: \(responseBody)")
                        errorMsg += " - \(responseBody)"
                    }
                    print("[Workouts] \(errorMsg)")
                    completion(false, NSError(domain: "WorkoutSync", code: 6, userInfo: [NSLocalizedDescriptionKey: errorMsg]))
                }
            }
            
            task.resume()
        } catch {
            print("[Workouts] JSON encoding error: \(error.localizedDescription)")
            completion(false, error)
        }
    }
}
