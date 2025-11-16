import Foundation
import HealthKit

enum HealthManagerError: LocalizedError {
    case healthDataUnavailable
    case invalidDataType(String)
    case invalidDate(String)
    case dataTypeUnavailable(String)
    case invalidDateRange
    case operationFailed(String)

    var errorDescription: String? {
        switch self {
        case .healthDataUnavailable:
            return "Health data is not available on this device."
        case let .invalidDataType(identifier):
            return "Unsupported health data type: \(identifier)."
        case let .invalidDate(dateString):
            return "Invalid ISO 8601 date value: \(dateString)."
        case let .dataTypeUnavailable(identifier):
            return "The health data type \(identifier) is not available on this device."
        case .invalidDateRange:
            return "endDate must be greater than or equal to startDate."
        case let .operationFailed(message):
            return message
        }
    }
}

enum HealthDataType: String, CaseIterable {
    case steps
    case distance
    case calories
    case heartRate
    case weight
    case heartRateVariability
    case restingHeartRate
    case bloodPressureSystolic
    case bloodPressureDiastolic
    case oxygenSaturation
    case respiratoryRate
    case height
    case bmi
    case bodyFatPercentage
    case leanBodyMass
    case basalEnergyBurned
    case flightsClimbed
    case bloodGlucose
    case bodyTemperature
    case vo2Max
    case walkingHeartRateAverage
    case waistCircumference
    case dietaryWater
    case appleExerciseTime
    case appleStandTime
    case sleepAnalysis

    func sampleType() throws -> HKSampleType {
        switch self {
        case .sleepAnalysis:
            guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
                throw HealthManagerError.dataTypeUnavailable(rawValue)
            }
            return type
        default:
            let identifier: HKQuantityTypeIdentifier
            switch self {
            case .steps:
                identifier = .stepCount
            case .distance:
                identifier = .distanceWalkingRunning
            case .calories:
                identifier = .activeEnergyBurned
            case .heartRate:
                identifier = .heartRate
            case .weight:
                identifier = .bodyMass
            case .heartRateVariability:
                identifier = .heartRateVariabilitySDNN
            case .restingHeartRate:
                identifier = .restingHeartRate
            case .bloodPressureSystolic:
                identifier = .bloodPressureSystolic
            case .bloodPressureDiastolic:
                identifier = .bloodPressureDiastolic
            case .oxygenSaturation:
                identifier = .oxygenSaturation
            case .respiratoryRate:
                identifier = .respiratoryRate
            case .height:
                identifier = .height
            case .bmi:
                identifier = .bodyMassIndex
            case .bodyFatPercentage:
                identifier = .bodyFatPercentage
            case .leanBodyMass:
                identifier = .leanBodyMass
            case .basalEnergyBurned:
                identifier = .basalEnergyBurned
            case .flightsClimbed:
                identifier = .flightsClimbed
            case .bloodGlucose:
                identifier = .bloodGlucose
            case .bodyTemperature:
                identifier = .bodyTemperature
            case .vo2Max:
                identifier = .vo2Max
            case .walkingHeartRateAverage:
                identifier = .walkingHeartRateAverage
            case .waistCircumference:
                identifier = .waistCircumference
            case .dietaryWater:
                identifier = .dietaryWater
            case .appleExerciseTime:
                identifier = .appleExerciseTime
            case .appleStandTime:
                identifier = .appleStandTime
            case .sleepAnalysis:
                fatalError("Should never reach here")
            }
            
            guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
                throw HealthManagerError.dataTypeUnavailable(rawValue)
            }
            return type
        }
    }

    var defaultUnit: HKUnit {
        switch self {
        case .steps:
            return HKUnit.count()
        case .distance:
            return HKUnit.meter()
        case .calories, .basalEnergyBurned:
            return HKUnit.kilocalorie()
        case .heartRate, .restingHeartRate, .walkingHeartRateAverage:
            return HKUnit.count().unitDivided(by: HKUnit.minute())
        case .weight, .leanBodyMass:
            return HKUnit.gramUnit(with: .kilo)
        case .heartRateVariability:
            return HKUnit.secondUnit(with: .milli)
        case .bloodPressureSystolic, .bloodPressureDiastolic:
            return HKUnit.millimeterOfMercury()
        case .oxygenSaturation, .bodyFatPercentage:
            return HKUnit.percent()
        case .respiratoryRate:
            return HKUnit.count().unitDivided(by: HKUnit.minute())
        case .height, .waistCircumference:
            return HKUnit.meter()
        case .bmi:
            return HKUnit.count()
        case .flightsClimbed:
            return HKUnit.count()
        case .bloodGlucose:
            return HKUnit.gramUnit(with: .milli).unitDivided(by: HKUnit.literUnit(with: .deci))
        case .bodyTemperature:
            return HKUnit.degreeCelsius()
        case .vo2Max:
            return HKUnit.literUnit(with: .milli).unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: HKUnit.minute()))
        case .dietaryWater:
            return HKUnit.literUnit(with: .milli)
        case .appleExerciseTime, .appleStandTime:
            return HKUnit.minute()
        case .sleepAnalysis:
            return HKUnit.count()
        }
    }

    var unitIdentifier: String {
        switch self {
        case .steps, .flightsClimbed, .bmi:
            return "count"
        case .distance, .height, .waistCircumference:
            return "meter"
        case .calories, .basalEnergyBurned:
            return "kilocalorie"
        case .heartRate, .restingHeartRate, .walkingHeartRateAverage, .respiratoryRate:
            return "bpm"
        case .weight, .leanBodyMass:
            return "kilogram"
        case .heartRateVariability:
            return "ms"
        case .bloodPressureSystolic, .bloodPressureDiastolic:
            return "mmHg"
        case .oxygenSaturation, .bodyFatPercentage:
            return "percent"
        case .bloodGlucose:
            return "mg/dL"
        case .bodyTemperature:
            return "degC"
        case .vo2Max:
            return "mL/kg/min"
        case .dietaryWater:
            return "mL"
        case .appleExerciseTime, .appleStandTime:
            return "min"
        case .sleepAnalysis:
            return "category"
        }
    }

    static func parseMany(_ identifiers: [String]) throws -> [HealthDataType] {
        try identifiers.map { identifier in
            guard let type = HealthDataType(rawValue: identifier) else {
                throw HealthManagerError.invalidDataType(identifier)
            }
            return type
        }
    }
}

struct AuthorizationStatusPayload {
    let readAuthorized: [HealthDataType]
    let readDenied: [HealthDataType]
    let writeAuthorized: [HealthDataType]
    let writeDenied: [HealthDataType]

    func toDictionary() -> [String: Any] {
        return [
            "readAuthorized": readAuthorized.map { $0.rawValue },
            "readDenied": readDenied.map { $0.rawValue },
            "writeAuthorized": writeAuthorized.map { $0.rawValue },
            "writeDenied": writeDenied.map { $0.rawValue }
        ]
    }
}

final class Health {
    private let healthStore = HKHealthStore()
    private let isoFormatter: ISO8601DateFormatter

    init() {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        isoFormatter = formatter
    }
    
    // Expose healthStore for BackgroundSyncManager
    func getHealthStore() -> HKHealthStore {
        return healthStore
    }

    func availabilityPayload() -> [String: Any] {
        let available = HKHealthStore.isHealthDataAvailable()
        if available {
            return [
                "available": true,
                "platform": "ios"
            ]
        }

        return [
            "available": false,
            "platform": "ios",
            "reason": "Health data is not available on this device."
        ]
    }

    func requestAuthorization(readIdentifiers: [String], writeIdentifiers: [String], completion: @escaping (Result<AuthorizationStatusPayload, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(HealthManagerError.healthDataUnavailable))
            return
        }

        do {
            let readTypes = try HealthDataType.parseMany(readIdentifiers)
            let writeTypes = try HealthDataType.parseMany(writeIdentifiers)

            let readObjectTypes = try objectTypes(for: readTypes)
            let writeSampleTypes = try sampleTypes(for: writeTypes)

            healthStore.requestAuthorization(toShare: writeSampleTypes, read: readObjectTypes) { [weak self] success, error in
                guard let self = self else { return }

                if let error = error {
                    completion(.failure(error))
                    return
                }

                if success {
                    self.evaluateAuthorizationStatus(readTypes: readTypes, writeTypes: writeTypes) { result in
                        completion(.success(result))
                    }
                } else {
                    completion(.failure(HealthManagerError.operationFailed("Authorization request was not granted.")))
                }
            }
        } catch {
            completion(.failure(error))
        }
    }

    func checkAuthorization(readIdentifiers: [String], writeIdentifiers: [String], completion: @escaping (Result<AuthorizationStatusPayload, Error>) -> Void) {
        do {
            let readTypes = try HealthDataType.parseMany(readIdentifiers)
            let writeTypes = try HealthDataType.parseMany(writeIdentifiers)

            evaluateAuthorizationStatus(readTypes: readTypes, writeTypes: writeTypes) { payload in
                completion(.success(payload))
            }
        } catch {
            completion(.failure(error))
        }
    }

    func readSamples(dataTypeIdentifier: String, startDateString: String?, endDateString: String?, limit: Int?, ascending: Bool, completion: @escaping (Result<[[String: Any]], Error>) -> Void) throws {
        let dataType = try parseDataType(identifier: dataTypeIdentifier)
        let sampleType = try dataType.sampleType()

        let startDate = try parseDate(startDateString, defaultValue: Date().addingTimeInterval(-86400))
        let endDate = try parseDate(endDateString, defaultValue: Date())

        guard endDate >= startDate else {
            throw HealthManagerError.invalidDateRange
        }

        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [])
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending)
        let queryLimit = limit ?? 100

        let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: queryLimit, sortDescriptors: [sortDescriptor]) { [weak self] _, samples, error in
            guard let self = self else { return }

            if let error = error {
                completion(.failure(error))
                return
            }

            guard let quantitySamples = samples as? [HKQuantitySample] else {
                completion(.success([]))
                return
            }

            let results = quantitySamples.map { sample -> [String: Any] in
                let value = sample.quantity.doubleValue(for: dataType.defaultUnit)
                var payload: [String: Any] = [
                    "dataType": dataType.rawValue,
                    "value": value,
                    "unit": dataType.unitIdentifier,
                    "startDate": self.isoFormatter.string(from: sample.startDate),
                    "endDate": self.isoFormatter.string(from: sample.endDate)
                ]

                let source = sample.sourceRevision.source
                payload["sourceName"] = source.name
                payload["sourceId"] = source.bundleIdentifier

                return payload
            }

            completion(.success(results))
        }

        healthStore.execute(query)
    }

    func readCategorySamples(dataTypeIdentifier: String, startDateString: String?, endDateString: String?, limit: Int?, ascending: Bool, completion: @escaping (Result<[[String: Any]], Error>) -> Void) throws {
        let dataType = try parseDataType(identifier: dataTypeIdentifier)
        
        // Ensure this is a category type (like sleep)
        guard dataType == .sleepAnalysis else {
            throw HealthManagerError.invalidDataType("Category samples only supported for sleepAnalysis")
        }
        
        let categoryType = try dataType.sampleType() as! HKCategoryType
        
        let startDate = try parseDate(startDateString, defaultValue: Date().addingTimeInterval(-86400))
        let endDate = try parseDate(endDateString, defaultValue: Date())
        
        guard endDate >= startDate else {
            throw HealthManagerError.invalidDateRange
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: [])
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending)
        let queryLimit = limit ?? 100
        
        let query = HKSampleQuery(sampleType: categoryType, predicate: predicate, limit: queryLimit, sortDescriptors: [sortDescriptor]) { [weak self] _, samples, error in
            guard let self = self else { return }
            
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let categorySamples = samples as? [HKCategorySample] else {
                completion(.success([]))
                return
            }
            
            let results = categorySamples.map { sample -> [String: Any] in
                var category = "unknown"
                if dataType == .sleepAnalysis {
                    if #available(iOS 16.0, *) {
                        switch sample.value {
                        case HKCategoryValueSleepAnalysis.inBed.rawValue:
                            category = "inBed"
                        case HKCategoryValueSleepAnalysis.asleep.rawValue:
                            category = "asleep"
                        case HKCategoryValueSleepAnalysis.awake.rawValue:
                            category = "awake"
                        case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
                            category = "core"
                        case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                            category = "deep"
                        case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                            category = "rem"
                        default:
                            category = "unknown"
                        }
                    } else {
                        switch sample.value {
                        case HKCategoryValueSleepAnalysis.inBed.rawValue:
                            category = "inBed"
                        case HKCategoryValueSleepAnalysis.asleep.rawValue:
                            category = "asleep"
                        case HKCategoryValueSleepAnalysis.awake.rawValue:
                            category = "awake"
                        default:
                            category = "unknown"
                        }
                    }
                }
                
                var payload: [String: Any] = [
                    "dataType": dataType.rawValue,
                    "value": sample.value,
                    "category": category,
                    "startDate": self.isoFormatter.string(from: sample.startDate),
                    "endDate": self.isoFormatter.string(from: sample.endDate)
                ]
                
                if let metadata = sample.metadata {
                    payload["metadata"] = metadata
                }
                
                payload["uuid"] = sample.uuid.uuidString
                
                return payload
            }
            
            completion(.success(results))
        }
        
        healthStore.execute(query)
    }

    func saveSample(dataTypeIdentifier: String, value: Double, unitIdentifier: String?, startDateString: String?, endDateString: String?, metadata: [String: String]?, completion: @escaping (Result<Void, Error>) -> Void) throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthManagerError.healthDataUnavailable
        }

        let dataType = try parseDataType(identifier: dataTypeIdentifier)
        let sampleType = try dataType.sampleType()
        
        guard let quantityType = sampleType as? HKQuantityType else {
            throw HealthManagerError.invalidDataType("Data type is not a quantity type")
        }

        let startDate = try parseDate(startDateString, defaultValue: Date())
        let endDate = try parseDate(endDateString, defaultValue: startDate)

        guard endDate >= startDate else {
            throw HealthManagerError.invalidDateRange
        }

        let unit = unit(for: unitIdentifier, dataType: dataType)
        let quantity = HKQuantity(unit: unit, doubleValue: value)

        var metadataDictionary: [String: Any]?
        if let metadata = metadata, !metadata.isEmpty {
            metadataDictionary = metadata.reduce(into: [String: Any]()) { result, entry in
                result[entry.key] = entry.value
            }
        }

        let sample = HKQuantitySample(type: quantityType, quantity: quantity, start: startDate, end: endDate, metadata: metadataDictionary)

        healthStore.save(sample) { success, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            if success {
                completion(.success(()))
            } else {
                completion(.failure(HealthManagerError.operationFailed("Failed to save the sample.")))
            }
        }
    }

    private func evaluateAuthorizationStatus(readTypes: [HealthDataType], writeTypes: [HealthDataType], completion: @escaping (AuthorizationStatusPayload) -> Void) {
        let writeStatus = writeAuthorizationStatus(for: writeTypes)

        readAuthorizationStatus(for: readTypes) { readAuthorized, readDenied in
            let payload = AuthorizationStatusPayload(
                readAuthorized: readAuthorized,
                readDenied: readDenied,
                writeAuthorized: writeStatus.authorized,
                writeDenied: writeStatus.denied
            )
            completion(payload)
        }
    }

    private func writeAuthorizationStatus(for types: [HealthDataType]) -> (authorized: [HealthDataType], denied: [HealthDataType]) {
        var authorized: [HealthDataType] = []
        var denied: [HealthDataType] = []

        for type in types {
            guard let sampleType = try? type.sampleType() else {
                denied.append(type)
                continue
            }

            switch healthStore.authorizationStatus(for: sampleType) {
            case .sharingAuthorized:
                authorized.append(type)
            case .sharingDenied, .notDetermined:
                denied.append(type)
            @unknown default:
                denied.append(type)
            }
        }

        return (authorized, denied)
    }

    private func readAuthorizationStatus(for types: [HealthDataType], completion: @escaping ([HealthDataType], [HealthDataType]) -> Void) {
        guard !types.isEmpty else {
            completion([], [])
            return
        }

        if #available(iOS 12.0, *) {
            let group = DispatchGroup()
            let lock = NSLock()
            var authorized: [HealthDataType] = []
            var denied: [HealthDataType] = []

            for type in types {
                guard let objectType = try? type.sampleType() else {
                    denied.append(type)
                    continue
                }

                group.enter()
                let readSet = Set<HKObjectType>([objectType])
                healthStore.getRequestStatusForAuthorization(toShare: Set<HKSampleType>(), read: readSet) { status, error in
                    defer { group.leave() }

                    if error != nil {
                        lock.lock(); denied.append(type); lock.unlock()
                        return
                    }

                    switch status {
                    case .unnecessary:
                        lock.lock(); authorized.append(type); lock.unlock()
                    case .shouldRequest, .unknown:
                        lock.lock(); denied.append(type); lock.unlock()
                    @unknown default:
                        lock.lock(); denied.append(type); lock.unlock()
                    }
                }
            }

            group.notify(queue: .main) {
                completion(authorized, denied)
            }
        } else {
            completion(types, [])
        }
    }

    private func parseDataType(identifier: String) throws -> HealthDataType {
        guard let type = HealthDataType(rawValue: identifier) else {
            throw HealthManagerError.invalidDataType(identifier)
        }
        return type
    }

    private func parseDate(_ string: String?, defaultValue: Date) throws -> Date {
        guard let value = string else {
            return defaultValue
        }

        if let date = isoFormatter.date(from: value) {
            return date
        }

        throw HealthManagerError.invalidDate(value)
    }

    private func unit(for identifier: String?, dataType: HealthDataType) -> HKUnit {
        guard let identifier = identifier else {
            return dataType.defaultUnit
        }

        switch identifier {
        case "count":
            return HKUnit.count()
        case "meter":
            return HKUnit.meter()
        case "kilocalorie":
            return HKUnit.kilocalorie()
        case "bpm":
            return HKUnit.count().unitDivided(by: HKUnit.minute())
        case "kilogram":
            return HKUnit.gramUnit(with: .kilo)
        default:
            return dataType.defaultUnit
        }
    }

    private func objectTypes(for dataTypes: [HealthDataType]) throws -> Set<HKObjectType> {
        var set = Set<HKObjectType>()
        for dataType in dataTypes {
            let type = try dataType.sampleType()
            set.insert(type)
        }
        return set
    }

    private func sampleTypes(for dataTypes: [HealthDataType]) throws -> Set<HKSampleType> {
        var set = Set<HKSampleType>()
        for dataType in dataTypes {
            let type = try dataType.sampleType() as HKSampleType
            set.insert(type)
        }
        return set
    }
}
