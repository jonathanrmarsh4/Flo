import Foundation
import Capacitor
import HealthKit

@objc(HealthSyncPlugin)
public class HealthSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthSyncPlugin"
    public let jsName = "HealthSyncPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncReadinessData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise)
    ]
    
    private var activeSyncCount = 0
    private let syncCountLock = NSLock()
    
    private func buildAllHealthKitTypes() -> Set<HKObjectType> {
        var types: Set<HKObjectType> = []
        var unavailableTypes: [String] = []
        
        for dataType in FloHealthDataType.allCases {
            do {
                let sampleType = try dataType.sampleType()
                types.insert(sampleType)
            } catch {
                unavailableTypes.append(dataType.rawValue)
            }
        }
        
        types.insert(HKObjectType.workoutType())
        
        if !unavailableTypes.isEmpty {
            print("⚠️ [HealthSyncPlugin] Some HealthKit types unavailable on this device: \(unavailableTypes.joined(separator: ", "))")
        }
        
        print("✅ [HealthSyncPlugin] Requesting authorization for \(types.count) HealthKit data types")
        return types
    }
    
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        print("🔐 [HealthSyncPlugin] requestAuthorization called")
        
        guard HKHealthStore.isHealthDataAvailable() else {
            print("❌ [HealthSyncPlugin] HealthKit not available")
            call.reject("HealthKit is not available on this device")
            return
        }
        
        let healthStore = HKHealthStore()
        let readTypes = buildAllHealthKitTypes()
        
        print("🔐 [HealthSyncPlugin] Requesting authorization for \(readTypes.count) types...")
        
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("❌ [HealthSyncPlugin] Authorization error: \(error.localizedDescription)")
                    call.reject(error.localizedDescription)
                    return
                }
                
                print("✅ [HealthSyncPlugin] Authorization completed, success: \(success)")
                
                var readAuthorized: [String] = []
                var readDenied: [String] = []
                
                for dataType in FloHealthDataType.allCases {
                    if let sampleType = try? dataType.sampleType() {
                        let status = healthStore.authorizationStatus(for: sampleType)
                        switch status {
                        case .sharingAuthorized:
                            readAuthorized.append(dataType.rawValue)
                        default:
                            readDenied.append(dataType.rawValue)
                        }
                    }
                }
                
                print("✅ [HealthSyncPlugin] Auth result - authorized: \(readAuthorized.count), denied: \(readDenied.count)")
                
                call.resolve([
                    "success": success,
                    "readAuthorized": readAuthorized,
                    "readDenied": readDenied,
                    "writeAuthorized": [],
                    "writeDenied": []
                ])
            }
        }
    }
    
    @objc func syncReadinessData(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 7
        let token = call.getString("token")
        let waitForAuth = call.getBool("waitForAuth") ?? false
        
        print("🔄 [HealthSyncPlugin] Queuing background sync for last \(days) days... (waitForAuth: \(waitForAuth))")
        
        let healthStore = HKHealthStore()
        let readTypes = buildAllHealthKitTypes()
        
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Authorization request error: \(error.localizedDescription)")
            } else {
                print("🔓 [HealthSyncPlugin] Authorization requested for \(readTypes.count) types, success: \(success)")
            }
        }
        
        if let token = token {
            UserDefaults.standard.set(token, forKey: "jwt_token")
            print("🔑 [HealthSyncPlugin] Auth token received and stored")
        }
        
        syncCountLock.lock()
        activeSyncCount += 1
        let currentSyncId = activeSyncCount
        syncCountLock.unlock()
        print("📊 [HealthSyncPlugin] Active syncs: \(currentSyncId)")
        
        call.resolve([
            "success": true,
            "days": days,
            "message": "Background sync started"
        ])
        
        DispatchQueue.global(qos: .background).async {
            if waitForAuth {
                print("⏳ [HealthSyncPlugin] Waiting for HealthKit authorization...")
                self.waitForHealthKitAuth(maxAttempts: 20) { ready in
                    if ready {
                        print("✅ [HealthSyncPlugin] HealthKit authorization ready, starting sync...")
                        self.performSync(days: days, syncId: currentSyncId)
                    } else {
                        print("⚠️ [HealthSyncPlugin] HealthKit authorization timeout, syncing anyway...")
                        self.performSync(days: days, syncId: currentSyncId)
                    }
                }
            } else {
                self.performSync(days: days, syncId: currentSyncId)
            }
        }
    }
    
    @objc func syncWorkouts(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 7
        let token = call.getString("token")
        
        print("💪 [HealthSyncPlugin] Queuing workout sync for last \(days) days...")
        
        let healthStore = HKHealthStore()
        let readTypes: Set<HKObjectType> = [
            HKObjectType.workoutType()
        ]
        
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Workout authorization request error: \(error.localizedDescription)")
            } else {
                print("🔓 [HealthSyncPlugin] Workout authorization requested, success: \(success)")
            }
        }
        
        if let token = token {
            UserDefaults.standard.set(token, forKey: "jwt_token")
            print("🔑 [HealthSyncPlugin] Auth token received and stored for workout sync")
        }
        
        call.resolve([
            "success": true,
            "days": days,
            "message": "Workout sync started"
        ])
        
        DispatchQueue.global(qos: .background).async {
            let normalizationService = HealthKitNormalisationService()
            normalizationService.syncWorkouts(days: days) { success, error in
                if let error = error {
                    print("❌ [HealthSyncPlugin] Workout sync failed: \(error.localizedDescription)")
                } else if success {
                    print("✅ [HealthSyncPlugin] Successfully synced \(days) days of workouts!")
                } else {
                    print("⚠️ [HealthSyncPlugin] Workout sync completed but returned false")
                }
                
                UserDefaults.standard.removeObject(forKey: "jwt_token")
                print("🧹 [HealthSyncPlugin] Workout sync complete, auth token cleared")
            }
        }
    }
    
    private func performSync(days: Int, syncId: Int) {
        let normalizationService = HealthKitNormalisationService()
        normalizationService.syncLastNDays(days: days) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Background sync failed: \(error.localizedDescription)")
            } else if success {
                print("✅ [HealthSyncPlugin] Successfully synced \(days) days in background!")
                
                normalizationService.syncWorkouts(days: days) { workoutSuccess, workoutError in
                    if let workoutError = workoutError {
                        print("⚠️ [HealthSyncPlugin] Workout sync error: \(workoutError.localizedDescription)")
                    } else if workoutSuccess {
                        print("💪 [HealthSyncPlugin] Also synced workouts successfully!")
                    }
                }
            } else {
                print("⚠️ [HealthSyncPlugin] Background sync completed but returned false")
            }
            
            self.syncCountLock.lock()
            self.activeSyncCount -= 1
            let remaining = self.activeSyncCount
            self.syncCountLock.unlock()
            
            print("📊 [HealthSyncPlugin] Sync #\(syncId) completed, \(remaining) active syncs remaining")
            
            if remaining == 0 {
                print("🧹 [HealthSyncPlugin] All syncs complete, clearing auth token")
                UserDefaults.standard.removeObject(forKey: "jwt_token")
            }
        }
    }
    
    private func waitForHealthKitAuth(maxAttempts: Int, completion: @escaping (Bool) -> Void) {
        let healthStore = HKHealthStore()
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        
        var attempts = 0
        func checkAuth() {
            attempts += 1
            let status = healthStore.authorizationStatus(for: sleepType)
            
            print("🔍 [HealthSyncPlugin] Auth check attempt \(attempts)/\(maxAttempts): status = \(status.rawValue)")
            
            if status != .notDetermined {
                print("✅ [HealthSyncPlugin] Auth status determined (status=\(status.rawValue)), proceeding with sync")
                completion(true)
            } else if attempts >= maxAttempts {
                print("⏱️ [HealthSyncPlugin] Auth wait timeout after \(maxAttempts) attempts")
                completion(false)
            } else {
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) {
                    checkAuth()
                }
            }
        }
        
        checkAuth()
    }
}
