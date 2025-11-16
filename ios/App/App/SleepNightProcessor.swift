import Foundation
import HealthKit

/// Comprehensive sleep night processor following the Flo sleep framework spec
/// Implements: 15:00-15:00 window, 7 sleep stages, detailed metrics, source prioritization
public class SleepNightProcessor {
    private let healthStore = HKHealthStore()
    private let calendar = Calendar.current
    private let MIN_AWAKE_DURATION_MIN = 2.0 // Minimum awake duration to count as awakening
    
    public init() {}
    
    /// Process sleep night for a given date
    /// @param sleepDate The local calendar day (YYYY-MM-DD) of the final wake time
    /// @param timezone User's timezone
    /// @param userId User identifier
    /// @param completion Callback with sleep night data or nil if insufficient data
    public func processSleepNight(
        sleepDate: String,
        timezone: TimeZone,
        userId: String,
        completion: @escaping (SleepNightData?) -> Void
    ) {
        // Parse sleep date
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = timezone
        
        guard let date = dateFormatter.date(from: sleepDate) else {
            print("[SleepProcessor] Invalid sleep date: \(sleepDate)")
            completion(nil)
            return
        }
        
        // Define query window: 15:00 previous day → 15:00 current day
        guard let windowEnd = calendar.date(bySettingHour: 15, minute: 0, second: 0, of: date),
              let yesterday = calendar.date(byAdding: .day, value: -1, to: date),
              let windowStart = calendar.date(bySettingHour: 15, minute: 0, second: 0, of: yesterday) else {
            print("[SleepProcessor] Failed to create query window")
            completion(nil)
            return
        }
        
        print("[SleepProcessor] Processing sleep for \(sleepDate), window: \(windowStart) to \(windowEnd)")
        
        // Query HealthKit for sleep samples
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate)
        let sortDescriptors = [
            NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true),
            NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)
        ]
        
        let query = HKSampleQuery(
            sampleType: sleepType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: sortDescriptors
        ) { [weak self] (query, samples, error) in
            guard let self = self else { return }
            
            if let error = error {
                print("[SleepProcessor] Query error: \(error.localizedDescription)")
                completion(nil)
                return
            }
            
            guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                print("[SleepProcessor] No sleep samples found")
                completion(nil)
                return
            }
            
            print("[SleepProcessor] Found \(samples.count) sleep samples")
            
            // Convert to internal segments and prioritize sources
            let segments = self.convertAndPrioritizeSamples(samples)
            
            // Build timeline and calculate metrics
            let sleepNight = self.buildSleepNight(
                segments: segments,
                sleepDate: sleepDate,
                timezone: timezone,
                userId: userId
            )
            
            completion(sleepNight)
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Source Prioritization
    
    /// Convert HK samples to internal segments and apply source prioritization
    private func convertAndPrioritizeSamples(_ samples: [HKCategorySample]) -> [SleepSegment] {
        // Convert to segments
        var segments: [SleepSegment] = []
        for sample in samples {
            if let value = HKCategoryValueSleepAnalysis(rawValue: sample.value) {
                let sourceName = sample.sourceRevision.source.bundleIdentifier
                segments.append(SleepSegment(
                    start: sample.startDate,
                    end: sample.endDate,
                    value: value,
                    source: sourceName
                ))
            }
        }
        
        // Source priority: Apple first-party > other apps
        // For overlapping segments of same type, prefer Apple sources
        let appleSegments = segments.filter { $0.source?.hasPrefix("com.apple") == true }
        let otherSegments = segments.filter { $0.source?.hasPrefix("com.apple") != true }
        
        // Simple prioritization: use Apple segments if available, otherwise use all
        return appleSegments.isEmpty ? segments : appleSegments
    }
    
    // MARK: - Timeline Construction
    
    /// Build complete sleep night data from segments
    private func buildSleepNight(
        segments: [SleepSegment],
        sleepDate: String,
        timezone: TimeZone,
        userId: String
    ) -> SleepNightData? {
        // Separate inBed vs sleep stage segments
        let inBedSegments = segments.filter { $0.value == .inBed }
        let stageSegments = segments.filter { $0.value != .inBed }
        
        guard !inBedSegments.isEmpty || !stageSegments.isEmpty else {
            print("[SleepProcessor] No valid segments")
            return nil
        }
        
        // Calculate timestamps
        let nightStart = min(
            inBedSegments.map { $0.start }.min() ?? Date.distantFuture,
            stageSegments.map { $0.start }.min() ?? Date.distantFuture
        )
        
        let finalWake = max(
            inBedSegments.map { $0.end }.max() ?? Date.distantPast,
            stageSegments.map { $0.end }.max() ?? Date.distantPast
        )
        
        // Find sleep onset (first asleep segment)
        let asleepSegments = stageSegments.filter { isAsleepValue($0.value) }
        let sleepOnset = asleepSegments.first?.start
        
        // Calculate durations
        let timeInBedMin = inBedSegments.reduce(0.0) { $0 + $1.durationMinutes }
        let totalSleepMin = asleepSegments.reduce(0.0) { $0 + $1.durationMinutes }
        let coreSleepMin = stageSegments.filter { $0.value == .asleepCore }.reduce(0.0) { $0 + $1.durationMinutes }
        let deepSleepMin = stageSegments.filter { $0.value == .asleepDeep }.reduce(0.0) { $0 + $1.durationMinutes }
        let remSleepMin = stageSegments.filter { $0.value == .asleepREM }.reduce(0.0) { $0 + $1.durationMinutes }
        let unspecifiedSleepMin = stageSegments.filter { $0.value == .asleepUnspecified || $0.value == .asleep }.reduce(0.0) { $0 + $1.durationMinutes }
        
        // Awake segments
        let awakeSegments = stageSegments.filter { $0.value == .awake }
        let awakeInBedMin = awakeSegments.reduce(0.0) { $0 + $1.durationMinutes }
        
        // WASO (wake after sleep onset)
        var wasoMin: Double? = nil
        var numAwakenings: Int? = nil
        if let onset = sleepOnset {
            let wasoSegments = awakeSegments.filter { $0.start >= onset && $0.end <= finalWake }
            wasoMin = wasoSegments.reduce(0.0) { $0 + $1.durationMinutes }
            numAwakenings = wasoSegments.filter { $0.durationMinutes >= MIN_AWAKE_DURATION_MIN }.count
        }
        
        // Sleep efficiency
        let sleepEfficiencyPct = timeInBedMin > 0 ? min(100.0, (totalSleepMin / timeInBedMin) * 100.0) : nil
        
        // Sleep latency
        var sleepLatencyMin: Double? = nil
        if let firstInBed = inBedSegments.first?.start, let onset = sleepOnset {
            sleepLatencyMin = onset.timeIntervalSince(firstInBed) / 60.0
        }
        
        // Mid-sleep time (minutes since midnight in local timezone)
        var midSleepTimeLocal: Double? = nil
        if let onset = sleepOnset {
            let midSleep = Date(timeInterval: (finalWake.timeIntervalSince(onset) / 2.0), since: onset)
            var localCalendar = Calendar.current
            localCalendar.timeZone = timezone
            let components = localCalendar.dateComponents([.hour, .minute], from: midSleep)
            if let hour = components.hour, let minute = components.minute {
                midSleepTimeLocal = Double(hour * 60 + minute)
            }
        }
        
        // Fragmentation index
        let fragmentationIndex = totalSleepMin > 0 ? Double(numAwakenings ?? 0) / max(totalSleepMin / 60.0, 0.1) : nil
        
        // Stage percentages
        let deepPct = totalSleepMin > 0 ? (deepSleepMin / totalSleepMin) * 100.0 : nil
        let remPct = totalSleepMin > 0 ? (remSleepMin / totalSleepMin) * 100.0 : nil
        let corePct = totalSleepMin > 0 ? (coreSleepMin / totalSleepMin) * 100.0 : nil
        
        // Format bedtime/waketime
        let bedtimeLocal = formatLocalTime(nightStart, timezone: timezone)
        let waketimeLocal = formatLocalTime(finalWake, timezone: timezone)
        
        // Minimum 3 hours required
        guard totalSleepMin >= 180 else {
            print("[SleepProcessor] Insufficient sleep duration: \(totalSleepMin) min")
            return nil
        }
        
        // Create sleep night data
        return SleepNightData(
            userId: userId,
            sleepDate: sleepDate,
            timezone: timezone.identifier,
            nightStart: toISO8601UTC(nightStart),
            finalWake: toISO8601UTC(finalWake),
            sleepOnset: sleepOnset != nil ? toISO8601UTC(sleepOnset!) : nil,
            timeInBedMin: timeInBedMin,
            totalSleepMin: totalSleepMin,
            sleepEfficiencyPct: sleepEfficiencyPct,
            sleepLatencyMin: sleepLatencyMin,
            wasoMin: wasoMin,
            numAwakenings: numAwakenings,
            coreSleepMin: coreSleepMin,
            deepSleepMin: deepSleepMin,
            remSleepMin: remSleepMin,
            unspecifiedSleepMin: unspecifiedSleepMin,
            awakeInBedMin: awakeInBedMin,
            midSleepTimeLocal: midSleepTimeLocal,
            fragmentationIndex: fragmentationIndex,
            deepPct: deepPct,
            remPct: remPct,
            corePct: corePct,
            bedtimeLocal: bedtimeLocal,
            waketimeLocal: waketimeLocal,
            restingHrBpm: nil,  // TODO: Query vitals
            hrvMs: nil,
            respiratoryRate: nil,
            wristTemperature: nil,
            oxygenSaturation: nil
        )
    }
    
    // MARK: - Helpers
    
    private func isAsleepValue(_ value: HKCategoryValueSleepAnalysis) -> Bool {
        return value == .asleepCore || value == .asleepDeep || value == .asleepREM || 
               value == .asleepUnspecified || value == .asleep
    }
    
    private func toISO8601UTC(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
    
    private func formatLocalTime(_ date: Date, timezone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        formatter.timeZone = timezone
        formatter.amSymbol = "am"
        formatter.pmSymbol = "pm"
        return formatter.string(from: date)
    }
}
