import Foundation
import Capacitor
import WebKit

@objc(WebViewCachePlugin)
public class WebViewCachePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebViewCachePlugin"
    public let jsName = "WebViewCache"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearCache", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadFromOrigin", returnType: CAPPluginReturnPromise)
    ]
    
    @objc func clearCache(_ call: CAPPluginCall) {
        // Clear all WKWebView website data (cookies, cache, local storage, etc.)
        let websiteDataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
        let date = Date(timeIntervalSince1970: 0)
        
        WKWebsiteDataStore.default().removeData(
            ofTypes: websiteDataTypes,
            modifiedSince: date
        ) {
            print("✅ [WebViewCache] Successfully cleared all WKWebView cache and data")
            call.resolve([
                "success": true,
                "message": "WKWebView cache cleared"
            ])
        }
    }
    
    @objc func reloadFromOrigin(_ call: CAPPluginCall) {
        // Get the WKWebView instance and reload from origin (bypasses cache)
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("WebView not found")
                return
            }
            
            print("🔄 [WebViewCache] Reloading from origin (bypassing cache)...")
            webView.reloadFromOrigin()
            
            call.resolve([
                "success": true,
                "message": "Reloaded from origin"
            ])
        }
    }
}
