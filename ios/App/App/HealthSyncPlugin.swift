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
        
        print("🔄 [HealthSyncPlugin] Starting automatic readiness data sync for last \(days) days...")
        
        // Store token in UserDefaults temporarily for normalization service to access
        if let token = token {
            UserDefaults.standard.set(token, forKey: "jwt_token")
            print("🔑 [HealthSyncPlugin] Auth token received and stored")
        }
        
        let normalizationService = HealthKitNormalisationService()
        normalizationService.syncLastNDays(days: days) { success, error in
            DispatchQueue.main.async {
                // Clear token from UserDefaults after sync
                UserDefaults.standard.removeObject(forKey: "jwt_token")
                
                if let error = error {
                    print("❌ [HealthSyncPlugin] Sync failed: \(error.localizedDescription)")
                    call.reject("Readiness sync failed: \(error.localizedDescription)", nil, error)
                } else if success {
                    print("✅ [HealthSyncPlugin] Successfully synced \(days) days of readiness data automatically!")
                    call.resolve([
                        "success": true,
                        "days": days,
                        "message": "Successfully synced \(days) days of readiness data"
                    ])
                } else {
                    print("⚠️ [HealthSyncPlugin] Sync completed but returned false")
                    call.reject("Sync completed but returned unsuccessful status")
                }
            }
        }
    }
}
