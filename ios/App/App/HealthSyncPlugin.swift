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
        
        print("🔄 [HealthSyncPlugin] Starting automatic readiness data sync for last \(days) days...")
        
        let normalizationService = HealthKitNormalisationService()
        normalizationService.syncLastNDays(days: days) { success, error in
            DispatchQueue.main.async {
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
