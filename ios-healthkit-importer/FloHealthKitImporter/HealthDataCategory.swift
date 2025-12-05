import SwiftUI
import HealthKit

enum HealthDataCategory: String, CaseIterable {
    case activity = "Activity"
    case body = "Body Measurements"
    case heart = "Heart"
    case vitals = "Vitals"
    case sleep = "Sleep"
    case nutrition = "Nutrition"
    case workouts = "Workouts"
    
    var name: String { rawValue }
    
    var icon: String {
        switch self {
        case .activity: return "figure.walk"
        case .body: return "person.fill"
        case .heart: return "heart.fill"
        case .vitals: return "waveform.path.ecg"
        case .sleep: return "bed.double.fill"
        case .nutrition: return "fork.knife"
        case .workouts: return "figure.run"
        }
    }
    
    var color: Color {
        switch self {
        case .activity: return .green
        case .body: return .blue
        case .heart: return .red
        case .vitals: return .purple
        case .sleep: return .indigo
        case .nutrition: return .orange
        case .workouts: return .pink
        }
    }
    
    var dataTypes: [HealthDataType] {
        switch self {
        case .activity:
            return [
                HealthDataType(identifier: HKQuantityTypeIdentifier.stepCount.rawValue, displayName: "Steps"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.activeEnergyBurned.rawValue, displayName: "Active Energy"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.basalEnergyBurned.rawValue, displayName: "Basal Energy"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue, displayName: "Distance"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.flightsClimbed.rawValue, displayName: "Flights Climbed"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.appleExerciseTime.rawValue, displayName: "Exercise Time"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.appleStandTime.rawValue, displayName: "Stand Time"),
            ]
        case .body:
            return [
                HealthDataType(identifier: HKQuantityTypeIdentifier.bodyMass.rawValue, displayName: "Weight"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.height.rawValue, displayName: "Height"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.bodyMassIndex.rawValue, displayName: "BMI"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.bodyFatPercentage.rawValue, displayName: "Body Fat %"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.leanBodyMass.rawValue, displayName: "Lean Body Mass"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.waistCircumference.rawValue, displayName: "Waist Circumference"),
            ]
        case .heart:
            return [
                HealthDataType(identifier: HKQuantityTypeIdentifier.heartRate.rawValue, displayName: "Heart Rate"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.restingHeartRate.rawValue, displayName: "Resting Heart Rate"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.walkingHeartRateAverage.rawValue, displayName: "Walking Heart Rate"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.heartRateVariabilitySDNN.rawValue, displayName: "HRV (SDNN)"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.vo2Max.rawValue, displayName: "VO2 Max"),
            ]
        case .vitals:
            return [
                HealthDataType(identifier: HKQuantityTypeIdentifier.respiratoryRate.rawValue, displayName: "Respiratory Rate"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.oxygenSaturation.rawValue, displayName: "Blood Oxygen"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.bodyTemperature.rawValue, displayName: "Body Temperature"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.bloodPressureSystolic.rawValue, displayName: "Systolic BP"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.bloodPressureDiastolic.rawValue, displayName: "Diastolic BP"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.bloodGlucose.rawValue, displayName: "Blood Glucose"),
            ]
        case .sleep:
            return [
                HealthDataType(identifier: HKCategoryTypeIdentifier.sleepAnalysis.rawValue, displayName: "Sleep Analysis"),
            ]
        case .nutrition:
            return [
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryEnergyConsumed.rawValue, displayName: "Calories"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryProtein.rawValue, displayName: "Protein"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryCarbohydrates.rawValue, displayName: "Carbs"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryFatTotal.rawValue, displayName: "Fat"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryFiber.rawValue, displayName: "Fiber"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietarySugar.rawValue, displayName: "Sugar"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietarySodium.rawValue, displayName: "Sodium"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryWater.rawValue, displayName: "Water"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryCaffeine.rawValue, displayName: "Caffeine"),
                HealthDataType(identifier: HKQuantityTypeIdentifier.dietaryCholesterol.rawValue, displayName: "Cholesterol"),
            ]
        case .workouts:
            return [
                HealthDataType(identifier: "HKWorkoutTypeIdentifier", displayName: "Workouts"),
            ]
        }
    }
}

struct HealthDataType {
    let identifier: String
    let displayName: String
}
