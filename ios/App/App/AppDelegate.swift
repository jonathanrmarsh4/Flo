import UIKit
import Capacitor
import WebKit
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        
        // Configure AVAudioSession for voice chat (microphone + speaker)
        configureAudioSession()
        
        // Disable WKWebView rubber band bounce to prevent white strip during overscroll
        // This must run after the window is set up, so we dispatch it to the next run loop
        DispatchQueue.main.async {
            if let window = self.window {
                // Try UINavigationController first (common Capacitor setup)
                if let nav = window.rootViewController as? UINavigationController,
                   let bridgeVC = nav.viewControllers.first as? CAPBridgeViewController {
                    self.configureWebView(bridgeVC)
                    // Register custom plugins
                    bridgeVC.bridge?.registerPluginInstance(HealthSyncPlugin())
                    bridgeVC.bridge?.registerPluginInstance(WebViewCachePlugin())
                    bridgeVC.bridge?.registerPluginInstance(NativeMicrophonePlugin())
                    print("✅ HealthSyncPlugin registered manually")
                    print("✅ WebViewCachePlugin registered manually")
                    print("✅ NativeMicrophonePlugin registered manually")
                }
                // Fallback: direct CAPBridgeViewController
                else if let bridgeVC = window.rootViewController as? CAPBridgeViewController {
                    self.configureWebView(bridgeVC)
                    // Register custom plugins
                    bridgeVC.bridge?.registerPluginInstance(HealthSyncPlugin())
                    bridgeVC.bridge?.registerPluginInstance(WebViewCachePlugin())
                    bridgeVC.bridge?.registerPluginInstance(NativeMicrophonePlugin())
                    print("✅ HealthSyncPlugin registered manually")
                    print("✅ WebViewCachePlugin registered manually")
                    print("✅ NativeMicrophonePlugin registered manually")
                }
            }
        }
        
        return true
    }
    
    // Configure AVAudioSession for voice chat functionality
    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            // Use playAndRecord for microphone + speaker, voiceChat mode optimizes for voice
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
            try session.setActive(true)
            print("✅ AVAudioSession configured for voice chat")
        } catch {
            print("❌ Failed to configure AVAudioSession: \(error)")
        }
    }
    
    // Configure WKWebView to disable bounce, set dark background, and enable media permissions
    private func configureWebView(_ bridgeVC: CAPBridgeViewController) {
        guard let webView = bridgeVC.webView else { return }
        
        // Disable rubber band bounce
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        
        // Set dark background to match app theme (#0f172a = slate-900)
        let darkBackground = UIColor(red: 15/255.0, green: 23/255.0, blue: 42/255.0, alpha: 1.0)
        webView.scrollView.backgroundColor = darkBackground
        webView.isOpaque = false
        webView.backgroundColor = darkBackground
        
        // Enable inline media playback (required for getUserMedia)
        webView.configuration.allowsInlineMediaPlayback = true
        if #available(iOS 14.5, *) {
            webView.configuration.preferences.isElementFullscreenEnabled = true
        }
        
        // Set UI delegate for media capture permissions (iOS 15+)
        if #available(iOS 15.0, *) {
            webView.uiDelegate = WebViewUIDelegate.shared
            print("✅ WKUIDelegate configured for media capture permissions")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - WKUIDelegate for Media Capture Permissions
// Auto-grants microphone/camera permissions for getUserMedia on iOS 15+
@available(iOS 15.0, *)
class WebViewUIDelegate: NSObject, WKUIDelegate {
    static let shared = WebViewUIDelegate()
    
    private override init() {
        super.init()
    }
    
    // Auto-grant microphone and camera permissions for the app's WebView
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        
        // Grant permission for both microphone and camera requests
        // This prevents the repeated permission dialogs and ensures getUserMedia works
        print("🎤 Media capture permission requested - type: \(type)")
        
        switch type {
        case .microphone:
            print("✅ Granting microphone permission")
            decisionHandler(.grant)
        case .camera:
            print("✅ Granting camera permission")
            decisionHandler(.grant)
        case .cameraAndMicrophone:
            print("✅ Granting camera + microphone permission")
            decisionHandler(.grant)
        @unknown default:
            print("⚠️ Unknown media type, granting permission")
            decisionHandler(.grant)
        }
    }
}
