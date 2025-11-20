import Foundation
import Capacitor
import HealthKit

@objc(HealthSyncPlugin)
public class HealthSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthSyncPlugin"
    public let jsName = "HealthSyncPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncReadinessData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWorkouts", returnType: CAPPluginReturnPromise)
    ]
    
    // Track active syncs to prevent premature token cleanup
    private var activeSyncCount = 0
    private let syncCountLock = NSLock()
    
    @objc func syncReadinessData(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 7
        let token = call.getString("token")
        let waitForAuth = call.getBool("waitForAuth") ?? false
        
        print("🔄 [HealthSyncPlugin] Queuing background sync for last \(days) days... (waitForAuth: \(waitForAuth))")
        
        // Request HealthKit authorization on first sync
        let healthStore = HKHealthStore()
        let readTypes: Set<HKObjectType> = [
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .appleExerciseTime)!,
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.workoutType(),  // Workout data type
            // Body composition types
            HKObjectType.quantityType(forIdentifier: .bodyMass)!,
            HKObjectType.quantityType(forIdentifier: .bodyFatPercentage)!,
            HKObjectType.quantityType(forIdentifier: .leanBodyMass)!,
            HKObjectType.quantityType(forIdentifier: .bodyMassIndex)!,
            HKObjectType.quantityType(forIdentifier: .waistCircumference)!
        ]
        
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Authorization request error: \(error.localizedDescription)")
            } else {
                print("🔓 [HealthSyncPlugin] Authorization requested, success: \(success)")
            }
        }
        
        // Store token in UserDefaults temporarily for normalization service to access
        if let token = token {
            UserDefaults.standard.set(token, forKey: "jwt_token")
            print("🔑 [HealthSyncPlugin] Auth token received and stored")
        }
        
        // Increment active sync counter
        syncCountLock.lock()
        activeSyncCount += 1
        let currentSyncId = activeSyncCount
        syncCountLock.unlock()
        print("📊 [HealthSyncPlugin] Active syncs: \(currentSyncId)")
        
        // PERFORMANCE FIX: Return immediately to unblock app launch
        // Run sync in background without blocking JS bridge
        call.resolve([
            "success": true,
            "days": days,
            "message": "Background sync started"
        ])
        
        // Dispatch sync work to background queue
        DispatchQueue.global(qos: .background).async {
            // If requested, wait for HealthKit auth to be ready (for sleep data)
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
        
        // Request HealthKit authorization for workouts
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
        
        // Store token in UserDefaults temporarily for normalization service to access
        if let token = token {
            UserDefaults.standard.set(token, forKey: "jwt_token")
            print("🔑 [HealthSyncPlugin] Auth token received and stored for workout sync")
        }
        
        // Return immediately to unblock JS
        call.resolve([
            "success": true,
            "days": days,
            "message": "Workout sync started"
        ])
        
        // Dispatch sync work to background queue
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
                
                // Clean up token
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
                
                // Also sync workouts after main sync completes
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
            
            // Decrement active sync counter
            self.syncCountLock.lock()
            self.activeSyncCount -= 1
            let remaining = self.activeSyncCount
            self.syncCountLock.unlock()
            
            print("📊 [HealthSyncPlugin] Sync #\(syncId) completed, \(remaining) active syncs remaining")
            
            // Only clear token when ALL syncs are complete
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
            
            // For category types (sleep), authorizationStatus always returns sharingDenied (1)
            // even when read permission is granted (iOS privacy feature).
            // We just wait for status to change from notDetermined (0) to anything else.
            if status != .notDetermined {
                print("✅ [HealthSyncPlugin] Auth status determined (status=\(status.rawValue)), proceeding with sync")
                completion(true)
            } else if attempts >= maxAttempts {
                print("⏱️ [HealthSyncPlugin] Auth wait timeout after \(maxAttempts) attempts")
                completion(false)
            } else {
                // Wait 500ms and try again
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) {
                    checkAuth()
                }
            }
        }
        
        checkAuth()
    }
}
