import Foundation
import Capacitor

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
        
        print("🔄 [HealthSyncPlugin] Queuing background sync for last \(days) days...")
        
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
    }
}
