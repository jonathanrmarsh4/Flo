import Foundation
import HealthKit

/// Manages background HealthKit synchronization using HKObserverQuery
/// Stores deltas in UserDefaults and provides a drain method for foreground uploads
class BackgroundSyncManager {
    
    // MARK: - Properties
    
    private let healthStore: HKHealthStore
    private var observers: [HKObserverQuery] = []
    private let userDefaults = UserDefaults.standard
    
    // UserDefaults keys
    private let anchorPrefix = "healthkit.background.anchor"
    private let queuePrefix = "healthkit.background.queue"
    private let enabledKey = "healthkit.background.enabled"
    
    // Data types to observe (start with 3 high-value metrics)
    private let observedTypes: [HealthDataType] = [.steps, .heartRate, .sleepAnalysis]
    
    // MARK: - Initialization
    
    init(healthStore: HKHealthStore) {
        self.healthStore = healthStore
    }
    
    // MARK: - Public Methods
    
    /// Check if background sync is enabled
    func isEnabled() -> Bool {
        return userDefaults.bool(forKey: enabledKey)
    }
    
    /// Enable or disable background sync
    func setEnabled(_ enabled: Bool) {
        userDefaults.set(enabled, forKey: enabledKey)
        
        if enabled {
            registerObservers()
        } else {
            stopObservers()
        }
    }
    
    /// Register HKObserverQuery for each observed data type
    func registerObservers() {
        guard isEnabled() else { return }
        
        // Stop existing observers first
        stopObservers()
        
        for dataType in observedTypes {
            do {
                let sampleType = try dataType.sampleType()
                
                // Enable background delivery (hourly frequency for battery efficiency)
                healthStore.enableBackgroundDelivery(for: sampleType, frequency: .hourly) { success, error in
                    if let error = error {
                        print("[BackgroundSync] Failed to enable background delivery for \(dataType.rawValue): \(error.localizedDescription)")
                    }
                }
                
                // Create observer query
                let query = HKObserverQuery(sampleType: sampleType, predicate: nil) { [weak self] query, completionHandler, error in
                    if let error = error {
                        print("[BackgroundSync] Observer error for \(dataType.rawValue): \(error.localizedDescription)")
                        completionHandler()
                        return
                    }
                    
                    // New data available - fetch deltas
                    self?.fetchDeltaData(for: dataType, completionHandler: completionHandler)
                }
                
                healthStore.execute(query)
                observers.append(query)
                
                print("[BackgroundSync] Registered observer for \(dataType.rawValue)")
                
            } catch {
                print("[BackgroundSync] Failed to register observer for \(dataType.rawValue): \(error.localizedDescription)")
            }
        }
    }
    
    /// Stop all observer queries
    func stopObservers() {
        for query in observers {
            healthStore.stop(query)
        }
        observers.removeAll()
        
        // Disable background delivery
        for dataType in observedTypes {
            do {
                let sampleType = try dataType.sampleType()
                healthStore.disableBackgroundDelivery(for: sampleType) { success, error in
                    if let error = error {
                        print("[BackgroundSync] Failed to disable background delivery: \(error.localizedDescription)")
                    }
                }
            } catch {
                print("[BackgroundSync] Error disabling background delivery: \(error.localizedDescription)")
            }
        }
    }
    
    /// Drain the background queue and return all pending samples
    /// Returns: Dictionary with dataType as key and array of sample dictionaries as value
    func drainQueue() -> [String: [[String: Any]]] {
        var result: [String: [[String: Any]]] = [:]
        
        for dataType in observedTypes {
            let queueKey = "\(queuePrefix).\(dataType.rawValue)"
            
            if let queueData = userDefaults.data(forKey: queueKey),
               let samples = try? JSONSerialization.jsonObject(with: queueData) as? [[String: Any]] {
                result[dataType.rawValue] = samples
                
                // Clear the queue after draining
                userDefaults.removeObject(forKey: queueKey)
            }
        }
        
        userDefaults.synchronize()
        return result
    }
    
    /// Get queue statistics (for debugging/UI)
    func getQueueStats() -> [String: Int] {
        var stats: [String: Int] = [:]
        
        for dataType in observedTypes {
            let queueKey = "\(queuePrefix).\(dataType.rawValue)"
            
            if let queueData = userDefaults.data(forKey: queueKey),
               let samples = try? JSONSerialization.jsonObject(with: queueData) as? [[String: Any]] {
                stats[dataType.rawValue] = samples.count
            } else {
                stats[dataType.rawValue] = 0
            }
        }
        
        return stats
    }
    
    // MARK: - Private Methods
    
    /// Fetch delta data using HKAnchoredObjectQuery
    private func fetchDeltaData(for dataType: HealthDataType, completionHandler: @escaping () -> Void) {
        do {
            let sampleType = try dataType.sampleType()
            let anchorKey = "\(anchorPrefix).\(dataType.rawValue)"
            
            // Load saved anchor (nil if first time)
            var anchor: HKQueryAnchor? = nil
            if let anchorData = userDefaults.data(forKey: anchorKey) {
                anchor = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: anchorData)
            }
            
            // Create anchored query with limit to prevent huge batches
            let query = HKAnchoredObjectQuery(
                type: sampleType,
                predicate: nil,
                anchor: anchor,
                limit: 500
            ) { [weak self] query, newSamples, deletedSamples, newAnchor, error in
                guard let self = self else {
                    completionHandler()
                    return
                }
                
                if let error = error {
                    print("[BackgroundSync] Anchored query error for \(dataType.rawValue): \(error.localizedDescription)")
                    completionHandler()
                    return
                }
                
                // Process new samples
                if let samples = newSamples, !samples.isEmpty {
                    let serialized = self.serializeSamples(samples, dataType: dataType)
                    self.appendToQueue(serialized, for: dataType)
                    
                    print("[BackgroundSync] Queued \(samples.count) samples for \(dataType.rawValue)")
                }
                
                // Save new anchor
                if let newAnchor = newAnchor {
                    if let anchorData = try? NSKeyedArchiver.archivedData(withRootObject: newAnchor, requiringSecureCoding: true) {
                        self.userDefaults.set(anchorData, forKey: anchorKey)
                        self.userDefaults.synchronize()
                    }
                }
                
                completionHandler()
            }
            
            healthStore.execute(query)
            
        } catch {
            print("[BackgroundSync] Failed to fetch delta data for \(dataType.rawValue): \(error.localizedDescription)")
            completionHandler()
        }
    }
    
    /// Serialize HKSample objects to dictionaries
    private func serializeSamples(_ samples: [HKSample], dataType: HealthDataType) -> [[String: Any]] {
        return samples.compactMap { sample in
            var dict: [String: Any] = [
                "uuid": sample.uuid.uuidString,
                "startDate": ISO8601DateFormatter().string(from: sample.startDate),
                "endDate": ISO8601DateFormatter().string(from: sample.endDate),
                "dataType": dataType.rawValue
            ]
            
            // Add value for quantity samples
            if let quantitySample = sample as? HKQuantitySample {
                let unit = preferredUnit(for: dataType)
                dict["value"] = quantitySample.quantity.doubleValue(for: unit)
                dict["unit"] = unit.unitString
            }
            
            // Add category value for category samples
            if let categorySample = sample as? HKCategorySample {
                dict["value"] = categorySample.value
            }
            
            // Add source information
            dict["sourceName"] = sample.sourceRevision.source.name
            dict["sourceBundleIdentifier"] = sample.sourceRevision.source.bundleIdentifier
            
            // Add device information if available
            if let device = sample.device {
                dict["deviceName"] = device.name ?? "Unknown"
                dict["deviceManufacturer"] = device.manufacturer ?? "Unknown"
                dict["deviceModel"] = device.model ?? "Unknown"
            }
            
            return dict
        }
    }
    
    /// Get preferred unit for a data type
    private func preferredUnit(for dataType: HealthDataType) -> HKUnit {
        switch dataType {
        case .steps:
            return HKUnit.count()
        case .heartRate:
            return HKUnit.count().unitDivided(by: HKUnit.minute())
        case .weight:
            return HKUnit.gramUnit(with: .kilo)
        default:
            return HKUnit.count()
        }
    }
    
    /// Append samples to the queue in UserDefaults
    private func appendToQueue(_ samples: [[String: Any]], for dataType: HealthDataType) {
        let queueKey = "\(queuePrefix).\(dataType.rawValue)"
        
        // Load existing queue
        var existingQueue: [[String: Any]] = []
        if let queueData = userDefaults.data(forKey: queueKey),
           let existing = try? JSONSerialization.jsonObject(with: queueData) as? [[String: Any]] {
            existingQueue = existing
        }
        
        // Append new samples
        existingQueue.append(contentsOf: samples)
        
        // Limit queue size to prevent excessive memory usage (keep last 1000 samples per type)
        if existingQueue.count > 1000 {
            existingQueue = Array(existingQueue.suffix(1000))
        }
        
        // Save back to UserDefaults
        if let queueData = try? JSONSerialization.data(withJSONObject: existingQueue) {
            userDefaults.set(queueData, forKey: queueKey)
            userDefaults.synchronize()
        }
    }
}
