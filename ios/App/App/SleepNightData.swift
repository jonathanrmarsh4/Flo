import Foundation
import HealthKit

/// Comprehensive sleep night data structure matching backend sleep_nights table
public struct SleepNightData: Codable {
    let userId: String
    let sleepDate: String  // YYYY-MM-DD (local calendar day of final wake)
    let timezone: String   // IANA timezone
    
    // Timestamps (ISO8601 UTC)
    let nightStart: String?
    let finalWake: String?
    let sleepOnset: String?
    
    // Duration metrics (minutes)
    let timeInBedMin: Double?
    let totalSleepMin: Double?
    let sleepEfficiencyPct: Double?
    let sleepLatencyMin: Double?
    let wasoMin: Double?
    let numAwakenings: Int?
    
    // Sleep stage durations (minutes)
    let coreSleepMin: Double?
    let deepSleepMin: Double?
    let remSleepMin: Double?
    let unspecifiedSleepMin: Double?
    let awakeInBedMin: Double?
    
    // Derived metrics
    let midSleepTimeLocal: Double?  // Minutes since midnight
    let fragmentationIndex: Double?
    let deepPct: Double?
    let remPct: Double?
    let corePct: Double?
    
    // Formatted times
    let bedtimeLocal: String?
    let waketimeLocal: String?
    
    // Optional vitals during sleep
    let restingHrBpm: Double?
    let hrvMs: Double?
    let respiratoryRate: Double?
    let wristTemperature: Double?
    let oxygenSaturation: Double?
}

/// Internal structure for sleep segment processing
struct SleepSegment {
    let start: Date
    let end: Date
    let value: Int  // HKCategoryValueSleepAnalysis raw value
    let source: String?
    
    var duration: TimeInterval {
        return end.timeIntervalSince(start)
    }
    
    var durationMinutes: Double {
        return duration / 60.0
    }
}
