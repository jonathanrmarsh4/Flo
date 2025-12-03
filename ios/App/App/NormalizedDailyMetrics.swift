import Foundation

/// Normalized daily health metrics ready for backend ingestion
/// Represents a single day's aggregated health data in user's local timezone
public struct NormalizedDailyMetrics: Codable {
    /// Date in local timezone (YYYY-MM-DD format)
    let localDate: String
    
    /// User's timezone identifier (e.g., "America/Los_Angeles")
    let timezone: String
    
    /// UTC timestamp for start of local day (00:00 in user's timezone)
    let utcDayStart: String
    
    /// UTC timestamp for end of local day (23:59:59 in user's timezone)
    let utcDayEnd: String
    
    // MARK: - Daily Readiness Metrics
    
    /// Total sleep duration in hours (sleep ending on this morning)
    /// Aggregated from "sleep in bed" samples in 18:00 yesterday → 12:00 today window
    let sleepHours: Double?
    
    /// Morning resting heart rate in BPM (lowest HR during sleep)
    /// Taken from sleep window before waking
    let restingHrBpm: Double?
    
    /// Heart Rate Variability in milliseconds (SDNN)
    /// Average HRV during sleep window
    let hrvMs: Double?
    
    /// Active energy burned in kcal (calories from movement/exercise)
    /// Sum of all active energy samples for the full day (00:00 → 23:59)
    let activeEnergyKcal: Double?
    
    // MARK: - Body Composition Metrics
    
    /// Body weight in kg (most recent sample of the day)
    let weightKg: Double?
    
    /// Height in cm (most recent sample of the day)
    let heightCm: Double?
    
    /// Body Mass Index (kg/m²)
    /// Can be calculated or sourced from HealthKit
    let bmi: Double?
    
    /// Body fat percentage (0-100)
    let bodyFatPercent: Double?
    
    /// Lean body mass in kg
    let leanBodyMassKg: Double?
    
    /// Waist circumference in cm
    let waistCircumferenceCm: Double?
    
    // MARK: - Activity Metrics
    
    /// Total step count for the day (deduplicated, prioritized)
    /// Apple Watch > iPhone > Other apps, with gap-filling and overlap detection
    let stepCount: Int?
    
    /// Walking + running distance in meters
    let distanceMeters: Double?
    
    /// Flights of stairs climbed
    let flightsClimbed: Int?
    
    /// Exercise time in minutes (moderate to vigorous activity)
    let exerciseMinutes: Double?
    
    /// Stand hours (hours with at least 1 minute of standing)
    let standHours: Int?
    
    // MARK: - Cardiometabolic Metrics
    
    /// Average heart rate in BPM (daytime samples)
    let avgHeartRateBpm: Double?
    
    /// Systolic blood pressure in mmHg (most recent sample)
    let systolicBp: Double?
    
    /// Diastolic blood pressure in mmHg (most recent sample)
    let diastolicBp: Double?
    
    /// Blood glucose in mg/dL (average of samples)
    let bloodGlucoseMgDl: Double?
    
    /// VO2 max in mL/kg/min (most recent sample)
    let vo2Max: Double?
    
    /// Walking average heart rate in BPM (average during walking activities)
    var walkingHeartRateAvg: Double? = nil
    
    // MARK: - Vital Signs Metrics
    
    /// Blood oxygen saturation percentage (0-100)
    /// Average of SpO2 samples for the day
    var oxygenSaturation: Double? = nil
    
    /// Respiratory rate in breaths per minute
    /// Average of respiratory rate samples for the day
    var respiratoryRate: Double? = nil
    
    /// Body temperature in Celsius
    /// Most recent temperature sample of the day
    var bodyTemperatureCelsius: Double? = nil
    
    // MARK: - Energy Metrics
    
    /// Basal (resting) energy burned in kcal
    /// Sum of basal energy samples for the full day
    var basalEnergyKcal: Double? = nil
    
    // MARK: - Hydration Metrics
    
    /// Dietary water intake in milliliters
    /// Sum of all water intake samples for the day
    var dietaryWaterMl: Double? = nil
    
    // MARK: - Metadata
    
    /// Steps sources metadata (for debugging/transparency)
    var stepsSourcesMetadata: StepsSourcesMetadata? = nil
    
    /// Additional notes or flags (e.g., "calibrating", "partial_data")
    var notes: String? = nil
    
    enum CodingKeys: String, CodingKey {
        // Backend validation expects camelCase for these core fields
        case localDate
        case timezone
        case utcDayStart
        case utcDayEnd
        // But health metrics map to snake_case DB columns
        case sleepHours = "sleepHours"
        case restingHrBpm = "restingHrBpm"
        case hrvMs = "hrvMs"
        case activeEnergyKcal = "activeEnergyKcal"
        case weightKg = "weightKg"
        case heightCm = "heightCm"
        case bmi
        case bodyFatPercent = "bodyFatPercent"
        case leanBodyMassKg = "leanBodyMassKg"
        case waistCircumferenceCm = "waistCircumferenceCm"
        case stepCount = "stepsNormalized"
        case distanceMeters = "distanceMeters"
        case flightsClimbed = "flightsClimbed"
        case exerciseMinutes = "exerciseMinutes"
        case standHours = "standHours"
        case avgHeartRateBpm = "avgHeartRateBpm"
        case systolicBp = "systolicBp"
        case diastolicBp = "diastolicBp"
        case bloodGlucoseMgDl = "bloodGlucoseMgDl"
        case vo2Max = "vo2Max"
        case walkingHeartRateAvg = "walkingHeartRateAvg"
        case oxygenSaturation = "oxygenSaturation"
        case respiratoryRate = "respiratoryRate"
        case bodyTemperatureCelsius = "bodyTemperatureCelsius"
        case basalEnergyKcal = "basalEnergyKcal"
        case dietaryWaterMl = "dietaryWaterMl"
        case stepsSourcesMetadata = "stepsSourcesMetadata"
        case notes
    }
}
