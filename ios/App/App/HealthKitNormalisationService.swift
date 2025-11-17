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
                
                // After daily metrics, upload sleep nights
                self.uploadSleepNights(for: dayBoundaries, completion: completion)
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
    private func aggregateActiveEnergy(dayStart: Date, dayEnd: Date, completion: @escaping (Double?) -> Void) {
        let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: energyType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { (query, samples, error) in
            guard let samples = samples as? [HKQuantitySample], error == nil, !samples.isEmpty else {
                completion(nil)
                return
            }
            
            // Sum all active energy in kcal
            let totalKcal = samples.reduce(0.0) { sum, sample in
                return sum + sample.quantity.doubleValue(for: .kilocalorie())
            }
            
            completion(totalKcal)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Steps Normalization
    
    /// Normalize steps using HKStatisticsQuery to let HealthKit handle deduplication
    private func normalizeSteps(dayStart: Date, dayEnd: Date, completion: @escaping (Int?, StepsSourcesMetadata?) -> Void) {
        let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount)!
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)
        
        // Use HKStatisticsQuery with .separateBySource to get accurate per-source totals
        // This lets HealthKit handle intra-source deduplication automatically
        let query = HKStatisticsQuery(
            quantityType: stepsType,
            quantitySamplePredicate: predicate,
            options: [.cumulativeSum, .separateBySource]
        ) { (query, statistics, error) in
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
            var watchSources: [(bundleId: String, steps: Int)] = []
            var iphoneSources: [(bundleId: String, steps: Int)] = []
            var otherSources: [(bundleId: String, steps: Int)] = []
            var sourceIds: [String] = []
            
            for source in sources {
                let bundleId = source.bundleIdentifier
                sourceIds.append(bundleId)
                
                if let sum = statistics.sumQuantity(for: source) {
                    let steps = Int(sum.doubleValue(for: .count()))
                    
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
            
            let metadata = StepsSourcesMetadata(
                watchSteps: watchSteps > 0 ? watchSteps : nil,
                iphoneSteps: iphoneSteps > 0 ? iphoneSteps : nil,
                otherSteps: otherSteps > 0 ? otherSteps : nil,
                finalSteps: finalSteps,
                overlapsDetected: 0, // HKStatisticsQuery handles this internally
                gapsFilled: 0,
                priorityOrder: sourceOrder,
                sourceIdentifiers: sourceIds.sorted(),
                notes: "Using HKStatisticsQuery with .separateBySource for accurate deduplication"
            )
            
            completion(finalSteps, metadata)
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
    
    /// Process and upload sleep night data for multiple days
    private func uploadSleepNights(for dayBoundaries: [(Date, Date, String)], completion: @escaping (Bool, Error?) -> Void) {
        guard let token = getJWTToken() else {
            print("[Normalisation] No auth token for sleep upload")
            completion(false, NSError(domain: "NormalisationService", code: 2, userInfo: [NSLocalizedDescriptionKey: "No authentication token found"]))
            return
        }
        
        let dispatchGroup = DispatchGroup()
        var uploadErrors: [Error] = []
        var successCount = 0
        
        print("[Normalisation] Processing sleep nights for \(dayBoundaries.count) days")
        
        for (_, _, localDateStr) in dayBoundaries {
            dispatchGroup.enter()
            
            self.processSleepNightData(
                sleepDate: localDateStr,
                timezone: userTimezone,
                userId: ""
            ) { [weak self] sleepNightData in
                guard let self = self else {
                    dispatchGroup.leave()
                    return
                }
                
                if let sleepNight = sleepNightData {
                    // Upload sleep night to backend
                    self.uploadSleepNightToBackend(sleepNight: sleepNight, token: token) { success, error in
                        if success {
                            successCount += 1
                        } else if let error = error {
                            uploadErrors.append(error)
                        }
                        dispatchGroup.leave()
                    }
                } else {
                    // No sleep data for this day - that's okay
                    print("[Normalisation] No sleep data for \(localDateStr)")
                    dispatchGroup.leave()
                }
            }
        }
        
        dispatchGroup.notify(queue: .main) {
            if uploadErrors.isEmpty {
                print("[Normalisation] Successfully uploaded \(successCount) sleep nights")
                completion(true, nil)
            } else {
                print("[Normalisation] Sleep upload completed with \(uploadErrors.count) errors, \(successCount) successes")
                // Don't fail the entire sync if only sleep fails
                completion(true, nil)
            }
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
        
        // Create 24-hour window in user's local timezone
        // Query from midnight to midnight of the target day to capture all sleep
        var calendar = Calendar.current
        calendar.timeZone = timezone
        
        // Start of day (00:00 local time)
        let windowStart = calendar.startOfDay(for: date)
        
        // End of day (next midnight in local time)
        guard let windowEnd = calendar.date(byAdding: .day, value: 1, to: windowStart) else {
            print("[Sleep] Failed to create window for \(sleepDate)")
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
        
        // Debug bedtime calculation
        let debugFormatter = DateFormatter()
        debugFormatter.dateFormat = "h:mm:ss a"
        debugFormatter.timeZone = timezone
        print("[Sleep] 🕐 \(sleepDate) nightStart raw: \(debugFormatter.string(from: nightStart))")
        print("[Sleep] 🕐 \(sleepDate) First 3 segment starts: \(segments.prefix(3).map { debugFormatter.string(from: $0.start) })")
        
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
}
