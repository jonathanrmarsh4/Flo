import Foundation
import Capacitor

@objc public class PluginRetainer: NSObject {
    @objc public static func retainPlugins() {
        let _ = NSClassFromString("CapacitorMlkitBarcodeScanning.BarcodeScannerPlugin")
        print("✅ Plugin classes retained for linker")
    }
}
