import Foundation
import Capacitor
import HealthKit

@objc(HealthSyncPlugin)
public class HealthSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthSyncPlugin"
    public let jsName = "HealthSyncPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncReadinessData", returnType: CAPPluginReturnPromise)
    ]
    
    // Track active syncs to prevent premature token cleanup
    private var activeSyncCount = 0
    private let syncCountLock = NSLock()
    
    @objc func syncReadinessData(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 7
        let token = call.getString("token")
        let waitForAuth = call.getBool("waitForAuth") ?? false
        
        print("🔄 [HealthSyncPlugin] Queuing background sync for last \(days) days... (waitForAuth: \(waitForAuth))")
        
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
    
    private func performSync(days: Int, syncId: Int) {
        let normalizationService = HealthKitNormalisationService()
        normalizationService.syncLastNDays(days: days) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Background sync failed: \(error.localizedDescription)")
            } else if success {
                print("✅ [HealthSyncPlugin] Successfully synced \(days) days in background!")
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
