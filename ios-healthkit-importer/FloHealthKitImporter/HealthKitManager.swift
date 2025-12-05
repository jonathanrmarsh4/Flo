import Foundation
import HealthKit

enum AuthorizationStatus: String {
    case notDetermined = "Not Determined"
    case authorized = "Authorized"
    case denied = "Denied"
    case unavailable = "HealthKit Unavailable"
}

@MainActor
class HealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()
    
    @Published var authStatus: AuthorizationStatus = .notDetermined
    @Published var availableTypes: Set<String> = []
    
    init() {
        checkAuthorizationStatus()
    }
    
    private func checkAuthorizationStatus() {
        guard HKHealthStore.isHealthDataAvailable() else {
            authStatus = .unavailable
            return
        }
        
        Task {
            await requestAuthorization()
        }
    }
    
    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            authStatus = .unavailable
            return
        }
        
        let typesToRead = getAllHealthTypes()
        
        do {
            try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
            authStatus = .authorized
            updateAvailableTypes()
        } catch {
            print("HealthKit auth error: \(error)")
            authStatus = .denied
        }
    }
    
    private func updateAvailableTypes() {
        var available = Set<String>()
        for type in getAllHealthTypes() {
            if let quantityType = type as? HKQuantityType {
                available.insert(quantityType.identifier)
            } else if let categoryType = type as? HKCategoryType {
                available.insert(categoryType.identifier)
            }
        }
        availableTypes = available
    }
    
    private func getAllHealthTypes() -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        
        // Activity
        if let steps = HKQuantityType.quantityType(forIdentifier: .stepCount) { types.insert(steps) }
        if let activeEnergy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(activeEnergy) }
        if let basalEnergy = HKQuantityType.quantityType(forIdentifier: .basalEnergyBurned) { types.insert(basalEnergy) }
        if let distance = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) { types.insert(distance) }
        if let flights = HKQuantityType.quantityType(forIdentifier: .flightsClimbed) { types.insert(flights) }
        if let exercise = HKQuantityType.quantityType(forIdentifier: .appleExerciseTime) { types.insert(exercise) }
        if let standTime = HKQuantityType.quantityType(forIdentifier: .appleStandTime) { types.insert(standTime) }
        
        // Body Measurements
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) { types.insert(weight) }
        if let height = HKQuantityType.quantityType(forIdentifier: .height) { types.insert(height) }
        if let bmi = HKQuantityType.quantityType(forIdentifier: .bodyMassIndex) { types.insert(bmi) }
        if let bodyFat = HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage) { types.insert(bodyFat) }
        if let leanMass = HKQuantityType.quantityType(forIdentifier: .leanBodyMass) { types.insert(leanMass) }
        if let waist = HKQuantityType.quantityType(forIdentifier: .waistCircumference) { types.insert(waist) }
        
        // Heart
        if let hr = HKQuantityType.quantityType(forIdentifier: .heartRate) { types.insert(hr) }
        if let restingHr = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) { types.insert(restingHr) }
        if let walkingHr = HKQuantityType.quantityType(forIdentifier: .walkingHeartRateAverage) { types.insert(walkingHr) }
        if let hrv = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { types.insert(hrv) }
        if let vo2Max = HKQuantityType.quantityType(forIdentifier: .vo2Max) { types.insert(vo2Max) }
        
        // Vitals
        if let respRate = HKQuantityType.quantityType(forIdentifier: .respiratoryRate) { types.insert(respRate) }
        if let spo2 = HKQuantityType.quantityType(forIdentifier: .oxygenSaturation) { types.insert(spo2) }
        if let bodyTemp = HKQuantityType.quantityType(forIdentifier: .bodyTemperature) { types.insert(bodyTemp) }
        if let bloodPressureSystolic = HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic) { types.insert(bloodPressureSystolic) }
        if let bloodPressureDiastolic = HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic) { types.insert(bloodPressureDiastolic) }
        if let bloodGlucose = HKQuantityType.quantityType(forIdentifier: .bloodGlucose) { types.insert(bloodGlucose) }
        
        // Sleep
        if let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        
        // Nutrition
        if let calories = HKQuantityType.quantityType(forIdentifier: .dietaryEnergyConsumed) { types.insert(calories) }
        if let protein = HKQuantityType.quantityType(forIdentifier: .dietaryProtein) { types.insert(protein) }
        if let carbs = HKQuantityType.quantityType(forIdentifier: .dietaryCarbohydrates) { types.insert(carbs) }
        if let fat = HKQuantityType.quantityType(forIdentifier: .dietaryFatTotal) { types.insert(fat) }
        if let fiber = HKQuantityType.quantityType(forIdentifier: .dietaryFiber) { types.insert(fiber) }
        if let sugar = HKQuantityType.quantityType(forIdentifier: .dietarySugar) { types.insert(sugar) }
        if let sodium = HKQuantityType.quantityType(forIdentifier: .dietarySodium) { types.insert(sodium) }
        if let water = HKQuantityType.quantityType(forIdentifier: .dietaryWater) { types.insert(water) }
        if let caffeine = HKQuantityType.quantityType(forIdentifier: .dietaryCaffeine) { types.insert(caffeine) }
        if let cholesterol = HKQuantityType.quantityType(forIdentifier: .dietaryCholesterol) { types.insert(cholesterol) }
        
        // Workouts
        types.insert(HKWorkoutType.workoutType())
        
        return types
    }
    
    // MARK: - Data Fetching
    
    func fetchDailyMetrics(startDate: Date, endDate: Date) async throws -> [[String: Any]] {
        var results: [[String: Any]] = []
        
        let calendar = Calendar.current
        var currentDate = startDate
        
        while currentDate <= endDate {
            let dayStart = calendar.startOfDay(for: currentDate)
            let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!
            
            var metrics: [String: Any] = [:]
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            metrics["localDate"] = dateFormatter.string(from: dayStart)
            metrics["timezone"] = TimeZone.current.identifier
            
            let utcFormatter = ISO8601DateFormatter()
            metrics["utcDayStart"] = utcFormatter.string(from: dayStart)
            metrics["utcDayEnd"] = utcFormatter.string(from: dayEnd)
            
            // Activity metrics
            if let steps = try? await querySum(.stepCount, unit: .count(), start: dayStart, end: dayEnd) {
                metrics["stepCount"] = Int(steps)
                metrics["stepsRawSum"] = Int(steps)
            }
            if let activeEnergy = try? await querySum(.activeEnergyBurned, unit: .kilocalorie(), start: dayStart, end: dayEnd) {
                metrics["activeEnergyKcal"] = activeEnergy
            }
            if let basalEnergy = try? await querySum(.basalEnergyBurned, unit: .kilocalorie(), start: dayStart, end: dayEnd) {
                metrics["basalEnergyKcal"] = basalEnergy
            }
            if let distance = try? await querySum(.distanceWalkingRunning, unit: .meter(), start: dayStart, end: dayEnd) {
                metrics["distanceMeters"] = distance
            }
            if let flights = try? await querySum(.flightsClimbed, unit: .count(), start: dayStart, end: dayEnd) {
                metrics["flightsClimbed"] = Int(flights)
            }
            if let exercise = try? await querySum(.appleExerciseTime, unit: .minute(), start: dayStart, end: dayEnd) {
                metrics["exerciseMinutes"] = exercise
            }
            
            // Body metrics (most recent)
            if let weight = try? await queryMostRecent(.bodyMass, unit: .gramUnit(with: .kilo), start: dayStart, end: dayEnd) {
                metrics["weightKg"] = weight
            }
            if let height = try? await queryMostRecent(.height, unit: .meterUnit(with: .centi), start: dayStart, end: dayEnd) {
                metrics["heightCm"] = height
            }
            if let bmi = try? await queryMostRecent(.bodyMassIndex, unit: .count(), start: dayStart, end: dayEnd) {
                metrics["bmi"] = bmi
            }
            if let bodyFat = try? await queryMostRecent(.bodyFatPercentage, unit: .percent(), start: dayStart, end: dayEnd) {
                metrics["bodyFatPercent"] = bodyFat * 100
            }
            if let leanMass = try? await queryMostRecent(.leanBodyMass, unit: .gramUnit(with: .kilo), start: dayStart, end: dayEnd) {
                metrics["leanBodyMassKg"] = leanMass
            }
            
            // Heart metrics
            if let restingHr = try? await queryMostRecent(.restingHeartRate, unit: HKUnit(from: "count/min"), start: dayStart, end: dayEnd) {
                metrics["restingHrBpm"] = restingHr
            }
            if let walkingHr = try? await queryMostRecent(.walkingHeartRateAverage, unit: HKUnit(from: "count/min"), start: dayStart, end: dayEnd) {
                metrics["walkingHeartRateAvg"] = walkingHr
            }
            if let hrv = try? await queryMostRecent(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), start: dayStart, end: dayEnd) {
                metrics["hrvMs"] = hrv
            }
            if let vo2Max = try? await queryMostRecent(.vo2Max, unit: HKUnit(from: "ml/kg*min"), start: dayStart, end: dayEnd) {
                metrics["vo2Max"] = vo2Max
            }
            
            // Vitals
            if let respRate = try? await queryAverage(.respiratoryRate, unit: HKUnit(from: "count/min"), start: dayStart, end: dayEnd) {
                metrics["respiratoryRate"] = respRate
            }
            if let spo2 = try? await queryAverage(.oxygenSaturation, unit: .percent(), start: dayStart, end: dayEnd) {
                metrics["oxygenSaturation"] = spo2 * 100
            }
            if let bodyTemp = try? await queryMostRecent(.bodyTemperature, unit: .degreeCelsius(), start: dayStart, end: dayEnd) {
                metrics["bodyTemperatureCelsius"] = bodyTemp
            }
            
            // Blood pressure (most recent)
            if let systolic = try? await queryMostRecent(.bloodPressureSystolic, unit: .millimeterOfMercury(), start: dayStart, end: dayEnd) {
                metrics["systolicBp"] = systolic
            }
            if let diastolic = try? await queryMostRecent(.bloodPressureDiastolic, unit: .millimeterOfMercury(), start: dayStart, end: dayEnd) {
                metrics["diastolicBp"] = diastolic
            }
            if let glucose = try? await queryAverage(.bloodGlucose, unit: HKUnit(from: "mg/dL"), start: dayStart, end: dayEnd) {
                metrics["bloodGlucoseMgDl"] = glucose
            }
            
            // Water
            if let water = try? await querySum(.dietaryWater, unit: .literUnit(with: .milli), start: dayStart, end: dayEnd) {
                metrics["dietaryWaterMl"] = water
            }
            
            results.append(metrics)
            currentDate = calendar.date(byAdding: .day, value: 1, to: currentDate)!
        }
        
        return results
    }
    
    func fetchSleepData(startDate: Date, endDate: Date) async throws -> [[String: Any]] {
        guard let sleepType = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
            return []
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        
        let samples = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKCategorySample], Error>) in
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples as? [HKCategorySample] ?? [])
                }
            }
            healthStore.execute(query)
        }
        
        // Group by sleep date (date of wake-up)
        var sleepNightsByDate: [String: [HKCategorySample]] = [:]
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        
        for sample in samples {
            let sleepDate = dateFormatter.string(from: sample.endDate)
            if sleepNightsByDate[sleepDate] == nil {
                sleepNightsByDate[sleepDate] = []
            }
            sleepNightsByDate[sleepDate]?.append(sample)
        }
        
        // Process each night
        var results: [[String: Any]] = []
        
        for (sleepDate, daySamples) in sleepNightsByDate {
            var nightData: [String: Any] = [:]
            nightData["sleepDate"] = sleepDate
            nightData["timezone"] = TimeZone.current.identifier
            
            // Calculate sleep metrics
            var totalInBedMin = 0.0
            var totalAsleepMin = 0.0
            var coreMin = 0.0
            var deepMin = 0.0
            var remMin = 0.0
            var awakeMin = 0.0
            var unspecifiedMin = 0.0
            var nightStart: Date? = nil
            var finalWake: Date? = nil
            var numAwakenings = 0
            
            for sample in daySamples {
                let durationMin = sample.endDate.timeIntervalSince(sample.startDate) / 60.0
                
                if nightStart == nil || sample.startDate < nightStart! {
                    nightStart = sample.startDate
                }
                if finalWake == nil || sample.endDate > finalWake! {
                    finalWake = sample.endDate
                }
                
                switch sample.value {
                case HKCategoryValueSleepAnalysis.inBed.rawValue:
                    totalInBedMin += durationMin
                case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                    totalAsleepMin += durationMin
                    unspecifiedMin += durationMin
                case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
                    totalAsleepMin += durationMin
                    coreMin += durationMin
                case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                    totalAsleepMin += durationMin
                    deepMin += durationMin
                case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                    totalAsleepMin += durationMin
                    remMin += durationMin
                case HKCategoryValueSleepAnalysis.awake.rawValue:
                    awakeMin += durationMin
                    numAwakenings += 1
                default:
                    break
                }
            }
            
            let utcFormatter = ISO8601DateFormatter()
            
            if let start = nightStart {
                nightData["nightStart"] = utcFormatter.string(from: start)
            }
            if let wake = finalWake {
                nightData["finalWake"] = utcFormatter.string(from: wake)
            }
            
            nightData["timeInBedMin"] = totalInBedMin > 0 ? totalInBedMin : (totalAsleepMin + awakeMin)
            nightData["totalSleepMin"] = totalAsleepMin
            nightData["coreSleepMin"] = coreMin
            nightData["deepSleepMin"] = deepMin
            nightData["remSleepMin"] = remMin
            nightData["unspecifiedSleepMin"] = unspecifiedMin
            nightData["awakeInBedMin"] = awakeMin
            nightData["numAwakenings"] = numAwakenings
            
            let timeInBed = nightData["timeInBedMin"] as? Double ?? 0
            if timeInBed > 0 {
                nightData["sleepEfficiencyPct"] = (totalAsleepMin / timeInBed) * 100
            }
            
            if totalAsleepMin > 0 {
                nightData["deepPct"] = (deepMin / totalAsleepMin) * 100
                nightData["remPct"] = (remMin / totalAsleepMin) * 100
                nightData["corePct"] = (coreMin / totalAsleepMin) * 100
            }
            
            results.append(nightData)
        }
        
        return results
    }
    
    func fetchWorkouts(startDate: Date, endDate: Date) async throws -> [[String: Any]] {
        let workoutType = HKWorkoutType.workoutType()
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        
        let workouts = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKWorkout], Error>) in
            let query = HKSampleQuery(sampleType: workoutType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples as? [HKWorkout] ?? [])
                }
            }
            healthStore.execute(query)
        }
        
        let utcFormatter = ISO8601DateFormatter()
        
        return workouts.map { workout in
            var data: [String: Any] = [:]
            data["workoutType"] = workout.workoutActivityType.name
            data["startDate"] = utcFormatter.string(from: workout.startDate)
            data["endDate"] = utcFormatter.string(from: workout.endDate)
            data["durationMinutes"] = workout.duration / 60.0
            
            if let totalEnergy = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) {
                data["totalEnergyKcal"] = totalEnergy
            }
            if let distance = workout.totalDistance?.doubleValue(for: .meter()) {
                data["distanceMeters"] = distance
            }
            
            data["sourceName"] = workout.sourceRevision.source.name
            data["sourceBundleId"] = workout.sourceRevision.source.bundleIdentifier
            data["healthkitUuid"] = workout.uuid.uuidString
            
            return data
        }
    }
    
    func fetchNutrition(startDate: Date, endDate: Date) async throws -> [[String: Any]] {
        var results: [[String: Any]] = []
        
        let calendar = Calendar.current
        var currentDate = startDate
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        
        while currentDate <= endDate {
            let dayStart = calendar.startOfDay(for: currentDate)
            let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!
            
            var nutrition: [String: Any] = [:]
            nutrition["date"] = dateFormatter.string(from: dayStart)
            nutrition["timezone"] = TimeZone.current.identifier
            
            if let calories = try? await querySum(.dietaryEnergyConsumed, unit: .kilocalorie(), start: dayStart, end: dayEnd) {
                nutrition["caloriesKcal"] = calories
            }
            if let protein = try? await querySum(.dietaryProtein, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["proteinG"] = protein
            }
            if let carbs = try? await querySum(.dietaryCarbohydrates, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["carbsG"] = carbs
            }
            if let fat = try? await querySum(.dietaryFatTotal, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["fatG"] = fat
            }
            if let fiber = try? await querySum(.dietaryFiber, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["fiberG"] = fiber
            }
            if let sugar = try? await querySum(.dietarySugar, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["sugarG"] = sugar
            }
            if let sodium = try? await querySum(.dietarySodium, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["sodiumMg"] = sodium
            }
            if let water = try? await querySum(.dietaryWater, unit: .literUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["waterMl"] = water
            }
            if let caffeine = try? await querySum(.dietaryCaffeine, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["caffeineMg"] = caffeine
            }
            if let cholesterol = try? await querySum(.dietaryCholesterol, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["cholesterolMg"] = cholesterol
            }
            
            // Only add if there's any nutrition data
            if nutrition.keys.count > 2 {
                results.append(nutrition)
            }
            
            currentDate = calendar.date(byAdding: .day, value: 1, to: currentDate)!
        }
        
        return results
    }
    
    // MARK: - Query Helpers
    
    private func querySum(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            throw HealthKitError.typeNotAvailable
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let sum = statistics?.sumQuantity()?.doubleValue(for: unit) {
                    continuation.resume(returning: sum)
                } else {
                    continuation.resume(throwing: HealthKitError.noData)
                }
            }
            healthStore.execute(query)
        }
    }
    
    private func queryMostRecent(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            throw HealthKitError.typeNotAvailable
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let sample = samples?.first as? HKQuantitySample {
                    continuation.resume(returning: sample.quantity.doubleValue(for: unit))
                } else {
                    continuation.resume(throwing: HealthKitError.noData)
                }
            }
            healthStore.execute(query)
        }
    }
    
    private func queryAverage(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            throw HealthKitError.typeNotAvailable
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, statistics, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let avg = statistics?.averageQuantity()?.doubleValue(for: unit) {
                    continuation.resume(returning: avg)
                } else {
                    continuation.resume(throwing: HealthKitError.noData)
                }
            }
            healthStore.execute(query)
        }
    }
}

enum HealthKitError: Error {
    case typeNotAvailable
    case noData
}

// MARK: - Workout Activity Type Extension

extension HKWorkoutActivityType {
    var name: String {
        switch self {
        case .running: return "running"
        case .walking: return "walking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .yoga: return "yoga"
        case .functionalStrengthTraining: return "strength_training"
        case .traditionalStrengthTraining: return "strength_training"
        case .coreTraining: return "core_training"
        case .highIntensityIntervalTraining: return "hiit"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .stairClimbing: return "stair_climbing"
        case .hiking: return "hiking"
        case .pilates: return "pilates"
        case .dance: return "dance"
        case .cooldown: return "cooldown"
        case .flexibility: return "flexibility"
        case .mindAndBody: return "mind_and_body"
        case .mixedCardio: return "mixed_cardio"
        case .other: return "other"
        default: return "other"
        }
    }
}
