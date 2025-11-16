import Foundation
import Capacitor

@objc(ReadinessPlugin)
public class ReadinessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReadinessPlugin"
    public let jsName = "Readiness"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncReadinessData", returnType: CAPPluginReturnPromise)
    ]
    
    @objc func syncReadinessData(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 7
        
        print("🔄 [ReadinessPlugin] Starting readiness data sync for last \(days) days...")
        
        let normalizationService = HealthKitNormalisationService()
        normalizationService.syncLastNDays(days: days) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("❌ [ReadinessPlugin] Sync failed: \(error.localizedDescription)")
                    call.reject("Readiness sync failed: \(error.localizedDescription)", nil, error)
                } else if success {
                    print("✅ [ReadinessPlugin] Successfully synced \(days) days of readiness data!")
                    call.resolve([
                        "success": true,
                        "days": days,
                        "message": "Successfully synced \(days) days of readiness data"
                    ])
                } else {
                    print("⚠️ [ReadinessPlugin] Sync completed but returned false")
                    call.reject("Sync completed but returned unsuccessful status")
                }
            }
        }
    }
}
