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
        
        // =====================================================
        // ACTIVITY & MOVEMENT
        // =====================================================
        if let steps = HKQuantityType.quantityType(forIdentifier: .stepCount) { types.insert(steps) }
        if let activeEnergy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(activeEnergy) }
        if let basalEnergy = HKQuantityType.quantityType(forIdentifier: .basalEnergyBurned) { types.insert(basalEnergy) }
        if let distance = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) { types.insert(distance) }
        if let flights = HKQuantityType.quantityType(forIdentifier: .flightsClimbed) { types.insert(flights) }
        if let exercise = HKQuantityType.quantityType(forIdentifier: .appleExerciseTime) { types.insert(exercise) }
        if let standTime = HKQuantityType.quantityType(forIdentifier: .appleStandTime) { types.insert(standTime) }
        if let moveMinutes = HKQuantityType.quantityType(forIdentifier: .appleMoveTime) { types.insert(moveMinutes) }
        
        // Mobility metrics (iOS 14+)
        if let walkingSpeed = HKQuantityType.quantityType(forIdentifier: .walkingSpeed) { types.insert(walkingSpeed) }
        if let walkingStepLength = HKQuantityType.quantityType(forIdentifier: .walkingStepLength) { types.insert(walkingStepLength) }
        if let walkingDoubleSupport = HKQuantityType.quantityType(forIdentifier: .walkingDoubleSupportPercentage) { types.insert(walkingDoubleSupport) }
        if let walkingAsymmetry = HKQuantityType.quantityType(forIdentifier: .walkingAsymmetryPercentage) { types.insert(walkingAsymmetry) }
        if let walkingSteadiness = HKQuantityType.quantityType(forIdentifier: .appleWalkingSteadiness) { types.insert(walkingSteadiness) }
        if let sixMinWalk = HKQuantityType.quantityType(forIdentifier: .sixMinuteWalkTestDistance) { types.insert(sixMinWalk) }
        if let stairAscent = HKQuantityType.quantityType(forIdentifier: .stairAscentSpeed) { types.insert(stairAscent) }
        if let stairDescent = HKQuantityType.quantityType(forIdentifier: .stairDescentSpeed) { types.insert(stairDescent) }
        
        // =====================================================
        // BODY MEASUREMENTS
        // =====================================================
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) { types.insert(weight) }
        if let height = HKQuantityType.quantityType(forIdentifier: .height) { types.insert(height) }
        if let bmi = HKQuantityType.quantityType(forIdentifier: .bodyMassIndex) { types.insert(bmi) }
        if let bodyFat = HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage) { types.insert(bodyFat) }
        if let leanMass = HKQuantityType.quantityType(forIdentifier: .leanBodyMass) { types.insert(leanMass) }
        if let waist = HKQuantityType.quantityType(forIdentifier: .waistCircumference) { types.insert(waist) }
        
        // =====================================================
        // HEART & CARDIOVASCULAR
        // =====================================================
        if let hr = HKQuantityType.quantityType(forIdentifier: .heartRate) { types.insert(hr) }
        if let restingHr = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) { types.insert(restingHr) }
        if let walkingHr = HKQuantityType.quantityType(forIdentifier: .walkingHeartRateAverage) { types.insert(walkingHr) }
        if let hrv = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { types.insert(hrv) }
        if let vo2Max = HKQuantityType.quantityType(forIdentifier: .vo2Max) { types.insert(vo2Max) }
        if let hrRecovery = HKQuantityType.quantityType(forIdentifier: .heartRateRecoveryOneMinute) { types.insert(hrRecovery) }
        if let atrialFib = HKQuantityType.quantityType(forIdentifier: .atrialFibrillationBurden) { types.insert(atrialFib) }
        
        // =====================================================
        // RESPIRATORY & VITALS
        // =====================================================
        if let respRate = HKQuantityType.quantityType(forIdentifier: .respiratoryRate) { types.insert(respRate) }
        if let spo2 = HKQuantityType.quantityType(forIdentifier: .oxygenSaturation) { types.insert(spo2) }
        if let bodyTemp = HKQuantityType.quantityType(forIdentifier: .bodyTemperature) { types.insert(bodyTemp) }
        if let bloodPressureSystolic = HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic) { types.insert(bloodPressureSystolic) }
        if let bloodPressureDiastolic = HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic) { types.insert(bloodPressureDiastolic) }
        if let bloodGlucose = HKQuantityType.quantityType(forIdentifier: .bloodGlucose) { types.insert(bloodGlucose) }
        if let wristTemp = HKQuantityType.quantityType(forIdentifier: .appleSleepingWristTemperature) { types.insert(wristTemp) }
        
        // Environmental
        if let audioExposure = HKQuantityType.quantityType(forIdentifier: .environmentalAudioExposure) { types.insert(audioExposure) }
        if let headphoneAudio = HKQuantityType.quantityType(forIdentifier: .headphoneAudioExposure) { types.insert(headphoneAudio) }
        
        // =====================================================
        // SLEEP (Category Types)
        // =====================================================
        if let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        
        // =====================================================
        // MINDFULNESS (Category Types)
        // =====================================================
        if let mindfulness = HKCategoryType.categoryType(forIdentifier: .mindfulSession) { types.insert(mindfulness) }
        
        // =====================================================
        // NUTRITION - ALL 38 TYPES
        // =====================================================
        // Macronutrients
        if let calories = HKQuantityType.quantityType(forIdentifier: .dietaryEnergyConsumed) { types.insert(calories) }
        if let protein = HKQuantityType.quantityType(forIdentifier: .dietaryProtein) { types.insert(protein) }
        if let carbs = HKQuantityType.quantityType(forIdentifier: .dietaryCarbohydrates) { types.insert(carbs) }
        if let fat = HKQuantityType.quantityType(forIdentifier: .dietaryFatTotal) { types.insert(fat) }
        if let fiber = HKQuantityType.quantityType(forIdentifier: .dietaryFiber) { types.insert(fiber) }
        if let sugar = HKQuantityType.quantityType(forIdentifier: .dietarySugar) { types.insert(sugar) }
        
        // Fat types
        if let satFat = HKQuantityType.quantityType(forIdentifier: .dietaryFatSaturated) { types.insert(satFat) }
        if let monoFat = HKQuantityType.quantityType(forIdentifier: .dietaryFatMonounsaturated) { types.insert(monoFat) }
        if let polyFat = HKQuantityType.quantityType(forIdentifier: .dietaryFatPolyunsaturated) { types.insert(polyFat) }
        if let cholesterol = HKQuantityType.quantityType(forIdentifier: .dietaryCholesterol) { types.insert(cholesterol) }
        
        // Minerals
        if let sodium = HKQuantityType.quantityType(forIdentifier: .dietarySodium) { types.insert(sodium) }
        if let potassium = HKQuantityType.quantityType(forIdentifier: .dietaryPotassium) { types.insert(potassium) }
        if let calcium = HKQuantityType.quantityType(forIdentifier: .dietaryCalcium) { types.insert(calcium) }
        if let iron = HKQuantityType.quantityType(forIdentifier: .dietaryIron) { types.insert(iron) }
        if let magnesium = HKQuantityType.quantityType(forIdentifier: .dietaryMagnesium) { types.insert(magnesium) }
        if let phosphorus = HKQuantityType.quantityType(forIdentifier: .dietaryPhosphorus) { types.insert(phosphorus) }
        if let zinc = HKQuantityType.quantityType(forIdentifier: .dietaryZinc) { types.insert(zinc) }
        if let copper = HKQuantityType.quantityType(forIdentifier: .dietaryCopper) { types.insert(copper) }
        if let manganese = HKQuantityType.quantityType(forIdentifier: .dietaryManganese) { types.insert(manganese) }
        if let selenium = HKQuantityType.quantityType(forIdentifier: .dietarySelenium) { types.insert(selenium) }
        if let chromium = HKQuantityType.quantityType(forIdentifier: .dietaryChromium) { types.insert(chromium) }
        if let molybdenum = HKQuantityType.quantityType(forIdentifier: .dietaryMolybdenum) { types.insert(molybdenum) }
        if let iodine = HKQuantityType.quantityType(forIdentifier: .dietaryIodine) { types.insert(iodine) }
        if let chloride = HKQuantityType.quantityType(forIdentifier: .dietaryChloride) { types.insert(chloride) }
        
        // Vitamins
        if let vitA = HKQuantityType.quantityType(forIdentifier: .dietaryVitaminA) { types.insert(vitA) }
        if let vitB6 = HKQuantityType.quantityType(forIdentifier: .dietaryVitaminB6) { types.insert(vitB6) }
        if let vitB12 = HKQuantityType.quantityType(forIdentifier: .dietaryVitaminB12) { types.insert(vitB12) }
        if let vitC = HKQuantityType.quantityType(forIdentifier: .dietaryVitaminC) { types.insert(vitC) }
        if let vitD = HKQuantityType.quantityType(forIdentifier: .dietaryVitaminD) { types.insert(vitD) }
        if let vitE = HKQuantityType.quantityType(forIdentifier: .dietaryVitaminE) { types.insert(vitE) }
        if let vitK = HKQuantityType.quantityType(forIdentifier: .dietaryVitaminK) { types.insert(vitK) }
        if let thiamin = HKQuantityType.quantityType(forIdentifier: .dietaryThiamin) { types.insert(thiamin) }
        if let riboflavin = HKQuantityType.quantityType(forIdentifier: .dietaryRiboflavin) { types.insert(riboflavin) }
        if let niacin = HKQuantityType.quantityType(forIdentifier: .dietaryNiacin) { types.insert(niacin) }
        if let folate = HKQuantityType.quantityType(forIdentifier: .dietaryFolate) { types.insert(folate) }
        if let biotin = HKQuantityType.quantityType(forIdentifier: .dietaryBiotin) { types.insert(biotin) }
        if let pantoAcid = HKQuantityType.quantityType(forIdentifier: .dietaryPantothenicAcid) { types.insert(pantoAcid) }
        
        // Other nutrition
        if let caffeine = HKQuantityType.quantityType(forIdentifier: .dietaryCaffeine) { types.insert(caffeine) }
        if let water = HKQuantityType.quantityType(forIdentifier: .dietaryWater) { types.insert(water) }
        
        // =====================================================
        // WORKOUTS
        // =====================================================
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
            
            // =====================================================
            // ACTIVITY METRICS
            // =====================================================
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
            if let standTime = try? await querySum(.appleStandTime, unit: .minute(), start: dayStart, end: dayEnd) {
                metrics["standTimeMinutes"] = standTime
            }
            
            // =====================================================
            // MOBILITY METRICS
            // =====================================================
            if let walkingSpeed = try? await queryAverage(.walkingSpeed, unit: HKUnit(from: "m/s"), start: dayStart, end: dayEnd) {
                metrics["walkingSpeedMs"] = walkingSpeed
            }
            if let walkingStepLength = try? await queryAverage(.walkingStepLength, unit: .meter(), start: dayStart, end: dayEnd) {
                metrics["walkingStepLengthM"] = walkingStepLength
            }
            if let doubleSupport = try? await queryAverage(.walkingDoubleSupportPercentage, unit: .percent(), start: dayStart, end: dayEnd) {
                metrics["walkingDoubleSupportPct"] = doubleSupport * 100
            }
            if let asymmetry = try? await queryAverage(.walkingAsymmetryPercentage, unit: .percent(), start: dayStart, end: dayEnd) {
                metrics["walkingAsymmetryPct"] = asymmetry * 100
            }
            if let steadiness = try? await queryMostRecent(.appleWalkingSteadiness, unit: .percent(), start: dayStart, end: dayEnd) {
                metrics["appleWalkingSteadiness"] = steadiness * 100
            }
            if let sixMinWalk = try? await querySum(.sixMinuteWalkTestDistance, unit: .meter(), start: dayStart, end: dayEnd) {
                metrics["sixMinuteWalkDistanceM"] = sixMinWalk
            }
            if let stairAscent = try? await queryAverage(.stairAscentSpeed, unit: HKUnit(from: "m/s"), start: dayStart, end: dayEnd) {
                metrics["stairAscentSpeedMs"] = stairAscent
            }
            if let stairDescent = try? await queryAverage(.stairDescentSpeed, unit: HKUnit(from: "m/s"), start: dayStart, end: dayEnd) {
                metrics["stairDescentSpeedMs"] = stairDescent
            }
            
            // =====================================================
            // BODY METRICS
            // =====================================================
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
            if let waist = try? await queryMostRecent(.waistCircumference, unit: .meterUnit(with: .centi), start: dayStart, end: dayEnd) {
                metrics["waistCircumferenceCm"] = waist
            }
            
            // =====================================================
            // HEART METRICS
            // =====================================================
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
            if let hrRecovery = try? await queryMostRecent(.heartRateRecoveryOneMinute, unit: HKUnit(from: "count/min"), start: dayStart, end: dayEnd) {
                metrics["heartRateRecoveryBpm"] = hrRecovery
            }
            
            // =====================================================
            // VITALS
            // =====================================================
            if let respRate = try? await queryAverage(.respiratoryRate, unit: HKUnit(from: "count/min"), start: dayStart, end: dayEnd) {
                metrics["respiratoryRate"] = respRate
            }
            if let spo2 = try? await queryAverage(.oxygenSaturation, unit: .percent(), start: dayStart, end: dayEnd) {
                metrics["oxygenSaturation"] = spo2 * 100
            }
            if let bodyTemp = try? await queryMostRecent(.bodyTemperature, unit: .degreeCelsius(), start: dayStart, end: dayEnd) {
                metrics["bodyTemperatureCelsius"] = bodyTemp
            }
            if let systolic = try? await queryMostRecent(.bloodPressureSystolic, unit: .millimeterOfMercury(), start: dayStart, end: dayEnd) {
                metrics["systolicBp"] = systolic
            }
            if let diastolic = try? await queryMostRecent(.bloodPressureDiastolic, unit: .millimeterOfMercury(), start: dayStart, end: dayEnd) {
                metrics["diastolicBp"] = diastolic
            }
            if let glucose = try? await queryAverage(.bloodGlucose, unit: HKUnit(from: "mg/dL"), start: dayStart, end: dayEnd) {
                metrics["bloodGlucoseMgDl"] = glucose
            }
            if let wristTemp = try? await queryMostRecent(.appleSleepingWristTemperature, unit: .degreeCelsius(), start: dayStart, end: dayEnd) {
                metrics["wristTemperature"] = wristTemp
            }
            
            // Environmental
            if let audioExposure = try? await queryAverage(.environmentalAudioExposure, unit: HKUnit.decibelAWeightedSoundPressureLevel(), start: dayStart, end: dayEnd) {
                metrics["environmentalAudioExposureDbA"] = audioExposure
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
            
            // Fetch wrist temperature for this sleep period if available
            if let start = nightStart, let end = finalWake {
                if let wristTemp = try? await queryAverage(.appleSleepingWristTemperature, unit: .degreeCelsius(), start: start, end: end) {
                    nightData["wristTemperature"] = wristTemp
                }
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
            
            // Macronutrients
            if let calories = try? await querySum(.dietaryEnergyConsumed, unit: .kilocalorie(), start: dayStart, end: dayEnd) {
                nutrition["energyKcal"] = calories
            }
            if let protein = try? await querySum(.dietaryProtein, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["proteinG"] = protein
            }
            if let carbs = try? await querySum(.dietaryCarbohydrates, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["carbohydratesG"] = carbs
            }
            if let fat = try? await querySum(.dietaryFatTotal, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["fatTotalG"] = fat
            }
            if let fiber = try? await querySum(.dietaryFiber, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["fiberG"] = fiber
            }
            if let sugar = try? await querySum(.dietarySugar, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["sugarG"] = sugar
            }
            
            // Fat breakdown
            if let satFat = try? await querySum(.dietaryFatSaturated, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["fatSaturatedG"] = satFat
            }
            if let monoFat = try? await querySum(.dietaryFatMonounsaturated, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["fatMonounsaturatedG"] = monoFat
            }
            if let polyFat = try? await querySum(.dietaryFatPolyunsaturated, unit: .gram(), start: dayStart, end: dayEnd) {
                nutrition["fatPolyunsaturatedG"] = polyFat
            }
            if let cholesterol = try? await querySum(.dietaryCholesterol, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["cholesterolMg"] = cholesterol
            }
            
            // Minerals
            if let sodium = try? await querySum(.dietarySodium, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["sodiumMg"] = sodium
            }
            if let potassium = try? await querySum(.dietaryPotassium, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["potassiumMg"] = potassium
            }
            if let calcium = try? await querySum(.dietaryCalcium, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["calciumMg"] = calcium
            }
            if let iron = try? await querySum(.dietaryIron, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["ironMg"] = iron
            }
            if let magnesium = try? await querySum(.dietaryMagnesium, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["magnesiumMg"] = magnesium
            }
            if let phosphorus = try? await querySum(.dietaryPhosphorus, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["phosphorusMg"] = phosphorus
            }
            if let zinc = try? await querySum(.dietaryZinc, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["zincMg"] = zinc
            }
            if let copper = try? await querySum(.dietaryCopper, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["copperMg"] = copper
            }
            if let manganese = try? await querySum(.dietaryManganese, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["manganeseMg"] = manganese
            }
            if let selenium = try? await querySum(.dietarySelenium, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["seleniumMcg"] = selenium
            }
            if let chromium = try? await querySum(.dietaryChromium, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["chromiumMcg"] = chromium
            }
            if let molybdenum = try? await querySum(.dietaryMolybdenum, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["molybdenumMcg"] = molybdenum
            }
            if let iodine = try? await querySum(.dietaryIodine, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["iodineMcg"] = iodine
            }
            if let chloride = try? await querySum(.dietaryChloride, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["chlorideMg"] = chloride
            }
            
            // Vitamins
            if let vitA = try? await querySum(.dietaryVitaminA, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["vitaminAMcg"] = vitA
            }
            if let vitB6 = try? await querySum(.dietaryVitaminB6, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["vitaminB6Mg"] = vitB6
            }
            if let vitB12 = try? await querySum(.dietaryVitaminB12, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["vitaminB12Mcg"] = vitB12
            }
            if let vitC = try? await querySum(.dietaryVitaminC, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["vitaminCMg"] = vitC
            }
            if let vitD = try? await querySum(.dietaryVitaminD, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["vitaminDMcg"] = vitD
            }
            if let vitE = try? await querySum(.dietaryVitaminE, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["vitaminEMg"] = vitE
            }
            if let vitK = try? await querySum(.dietaryVitaminK, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["vitaminKMcg"] = vitK
            }
            if let thiamin = try? await querySum(.dietaryThiamin, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["thiaminMg"] = thiamin
            }
            if let riboflavin = try? await querySum(.dietaryRiboflavin, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["riboflavinMg"] = riboflavin
            }
            if let niacin = try? await querySum(.dietaryNiacin, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["niacinMg"] = niacin
            }
            if let folate = try? await querySum(.dietaryFolate, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["folateMcg"] = folate
            }
            if let biotin = try? await querySum(.dietaryBiotin, unit: .gramUnit(with: .micro), start: dayStart, end: dayEnd) {
                nutrition["biotinMcg"] = biotin
            }
            if let pantoAcid = try? await querySum(.dietaryPantothenicAcid, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["pantothenicAcidMg"] = pantoAcid
            }
            
            // Other
            if let caffeine = try? await querySum(.dietaryCaffeine, unit: .gramUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["caffeineMg"] = caffeine
            }
            if let water = try? await querySum(.dietaryWater, unit: .literUnit(with: .milli), start: dayStart, end: dayEnd) {
                nutrition["waterMl"] = water
            }
            
            // Only add if there's any nutrition data
            if nutrition.keys.count > 2 {
                results.append(nutrition)
            }
            
            currentDate = calendar.date(byAdding: .day, value: 1, to: currentDate)!
        }
        
        return results
    }
    
    // MARK: - Mindfulness Sessions
    
    func fetchMindfulnessSessions(startDate: Date, endDate: Date) async throws -> [[String: Any]] {
        guard let mindfulnessType = HKCategoryType.categoryType(forIdentifier: .mindfulSession) else {
            return []
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        
        let samples = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKCategorySample], Error>) in
            let query = HKSampleQuery(sampleType: mindfulnessType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: samples as? [HKCategorySample] ?? [])
                }
            }
            healthStore.execute(query)
        }
        
        let utcFormatter = ISO8601DateFormatter()
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        
        return samples.map { sample in
            var data: [String: Any] = [:]
            data["startTime"] = utcFormatter.string(from: sample.startDate)
            data["endTime"] = utcFormatter.string(from: sample.endDate)
            data["sessionDate"] = dateFormatter.string(from: sample.startDate)
            data["durationMinutes"] = sample.endDate.timeIntervalSince(sample.startDate) / 60.0
            data["timezone"] = TimeZone.current.identifier
            data["sourceName"] = sample.sourceRevision.source.name
            data["sourceBundleId"] = sample.sourceRevision.source.bundleIdentifier
            data["healthkitUuid"] = sample.uuid.uuidString
            return data
        }
    }
    
    // MARK: - Raw Samples (for granular data like heart rate)
    
    func fetchRawSamples(startDate: Date, endDate: Date, maxSamplesPerType: Int = 5000) async throws -> [[String: Any]] {
        var results: [[String: Any]] = []
        let utcFormatter = ISO8601DateFormatter()
        
        // Sample types to fetch (high-frequency data useful for analytics)
        let sampleTypesConfig: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
            // Heart
            (.heartRate, "heart_rate", HKUnit(from: "count/min")),
            (.heartRateVariabilitySDNN, "hrv", .secondUnit(with: .milli)),
            
            // Vitals
            (.oxygenSaturation, "oxygen_saturation", .percent()),
            (.respiratoryRate, "respiratory_rate", HKUnit(from: "count/min")),
            (.bodyTemperature, "body_temperature", .degreeCelsius()),
            (.bloodPressureSystolic, "blood_pressure_systolic", .millimeterOfMercury()),
            (.bloodPressureDiastolic, "blood_pressure_diastolic", .millimeterOfMercury()),
            (.bloodGlucose, "blood_glucose", HKUnit(from: "mg/dL")),
            (.appleSleepingWristTemperature, "wrist_temperature", .degreeCelsius()),
            
            // Environmental
            (.environmentalAudioExposure, "environmental_audio_exposure", HKUnit.decibelAWeightedSoundPressureLevel()),
            (.headphoneAudioExposure, "headphone_audio_exposure", HKUnit.decibelAWeightedSoundPressureLevel()),
        ]
        
        for (identifier, dataType, unit) in sampleTypesConfig {
            guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { continue }
            
            let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
            let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            
            do {
                let samples = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[HKQuantitySample], Error>) in
                    let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: maxSamplesPerType, sortDescriptors: [sortDescriptor]) { _, samples, error in
                        if let error = error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume(returning: samples as? [HKQuantitySample] ?? [])
                        }
                    }
                    healthStore.execute(query)
                }
                
                for sample in samples {
                    var sampleData: [String: Any] = [:]
                    sampleData["dataType"] = dataType
                    sampleData["value"] = sample.quantity.doubleValue(for: unit)
                    sampleData["unit"] = unit.unitString
                    sampleData["startDate"] = utcFormatter.string(from: sample.startDate)
                    sampleData["endDate"] = utcFormatter.string(from: sample.endDate)
                    sampleData["sourceName"] = sample.sourceRevision.source.name
                    sampleData["sourceBundleId"] = sample.sourceRevision.source.bundleIdentifier
                    sampleData["healthkitUuid"] = sample.uuid.uuidString
                    results.append(sampleData)
                }
            } catch {
                print("Error fetching \(dataType): \(error)")
            }
        }
        
        return results
    }
    
    // MARK: - Query Helpers
    
    private func querySum(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            throw NSError(domain: "HealthKit", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid type"])
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let sum = statistics?.sumQuantity() {
                    continuation.resume(returning: sum.doubleValue(for: unit))
                } else {
                    continuation.resume(throwing: NSError(domain: "HealthKit", code: -2, userInfo: [NSLocalizedDescriptionKey: "No data"]))
                }
            }
            healthStore.execute(query)
        }
    }
    
    private func queryMostRecent(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            throw NSError(domain: "HealthKit", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid type"])
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let sample = samples?.first as? HKQuantitySample {
                    continuation.resume(returning: sample.quantity.doubleValue(for: unit))
                } else {
                    continuation.resume(throwing: NSError(domain: "HealthKit", code: -2, userInfo: [NSLocalizedDescriptionKey: "No data"]))
                }
            }
            healthStore.execute(query)
        }
    }
    
    private func queryAverage(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
            throw NSError(domain: "HealthKit", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid type"])
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, statistics, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let avg = statistics?.averageQuantity() {
                    continuation.resume(returning: avg.doubleValue(for: unit))
                } else {
                    continuation.resume(throwing: NSError(domain: "HealthKit", code: -2, userInfo: [NSLocalizedDescriptionKey: "No data"]))
                }
            }
            healthStore.execute(query)
        }
    }
}

// MARK: - Workout Type Names

extension HKWorkoutActivityType {
    var name: String {
        switch self {
        case .americanFootball: return "American Football"
        case .archery: return "Archery"
        case .australianFootball: return "Australian Football"
        case .badminton: return "Badminton"
        case .baseball: return "Baseball"
        case .basketball: return "Basketball"
        case .bowling: return "Bowling"
        case .boxing: return "Boxing"
        case .climbing: return "Climbing"
        case .cricket: return "Cricket"
        case .crossTraining: return "Cross Training"
        case .curling: return "Curling"
        case .cycling: return "Cycling"
        case .dance: return "Dance"
        case .elliptical: return "Elliptical"
        case .equestrianSports: return "Equestrian Sports"
        case .fencing: return "Fencing"
        case .fishing: return "Fishing"
        case .functionalStrengthTraining: return "Functional Strength Training"
        case .golf: return "Golf"
        case .gymnastics: return "Gymnastics"
        case .handball: return "Handball"
        case .hiking: return "Hiking"
        case .hockey: return "Hockey"
        case .hunting: return "Hunting"
        case .lacrosse: return "Lacrosse"
        case .martialArts: return "Martial Arts"
        case .mindAndBody: return "Mind and Body"
        case .paddleSports: return "Paddle Sports"
        case .play: return "Play"
        case .preparationAndRecovery: return "Preparation and Recovery"
        case .racquetball: return "Racquetball"
        case .rowing: return "Rowing"
        case .rugby: return "Rugby"
        case .running: return "Running"
        case .sailing: return "Sailing"
        case .skatingSports: return "Skating Sports"
        case .snowSports: return "Snow Sports"
        case .soccer: return "Soccer"
        case .softball: return "Softball"
        case .squash: return "Squash"
        case .stairClimbing: return "Stair Climbing"
        case .surfingSports: return "Surfing Sports"
        case .swimming: return "Swimming"
        case .tableTennis: return "Table Tennis"
        case .tennis: return "Tennis"
        case .trackAndField: return "Track and Field"
        case .traditionalStrengthTraining: return "Traditional Strength Training"
        case .volleyball: return "Volleyball"
        case .walking: return "Walking"
        case .waterFitness: return "Water Fitness"
        case .waterPolo: return "Water Polo"
        case .waterSports: return "Water Sports"
        case .wrestling: return "Wrestling"
        case .yoga: return "Yoga"
        case .barre: return "Barre"
        case .coreTraining: return "Core Training"
        case .crossCountrySkiing: return "Cross Country Skiing"
        case .downhillSkiing: return "Downhill Skiing"
        case .flexibility: return "Flexibility"
        case .highIntensityIntervalTraining: return "High Intensity Interval Training"
        case .jumpRope: return "Jump Rope"
        case .kickboxing: return "Kickboxing"
        case .pilates: return "Pilates"
        case .snowboarding: return "Snowboarding"
        case .stairs: return "Stairs"
        case .stepTraining: return "Step Training"
        case .wheelchairWalkPace: return "Wheelchair Walk Pace"
        case .wheelchairRunPace: return "Wheelchair Run Pace"
        case .taiChi: return "Tai Chi"
        case .mixedCardio: return "Mixed Cardio"
        case .handCycling: return "Hand Cycling"
        case .discSports: return "Disc Sports"
        case .fitnessGaming: return "Fitness Gaming"
        case .cardioDance: return "Cardio Dance"
        case .socialDance: return "Social Dance"
        case .pickleball: return "Pickleball"
        case .cooldown: return "Cooldown"
        case .swimBikeRun: return "Swim Bike Run"
        case .transition: return "Transition"
        case .underwaterDiving: return "Underwater Diving"
        default: return "Other"
        }
    }
}
