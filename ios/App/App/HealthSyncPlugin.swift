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
                        self.performSync(days: days)
                    } else {
                        print("⚠️ [HealthSyncPlugin] HealthKit authorization timeout, syncing anyway...")
                        self.performSync(days: days)
                    }
                }
            } else {
                self.performSync(days: days)
            }
        }
    }
    
    private func performSync(days: Int) {
        let normalizationService = HealthKitNormalisationService()
        normalizationService.syncLastNDays(days: days) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Background sync failed: \(error.localizedDescription)")
            } else if success {
                print("✅ [HealthSyncPlugin] Successfully synced \(days) days in background!")
            } else {
                print("⚠️ [HealthSyncPlugin] Background sync completed but returned false")
            }
            
            // Clear token from UserDefaults AFTER sleep sync completes
            UserDefaults.standard.removeObject(forKey: "jwt_token")
        }
    }
    
    private func waitForHealthKitAuth(maxAttempts: Int, completion: @escaping (Bool) -> Void) {
        let healthStore = HKHealthStore()
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        
        var attempts = 0
        func checkAuth() {
            attempts += 1
            let status = healthStore.authorizationStatus(for: sleepType)
            
            if status == .sharingAuthorized {
                completion(true)
            } else if attempts >= maxAttempts {
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
