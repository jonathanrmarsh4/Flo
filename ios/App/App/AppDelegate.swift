import UIKit
import Capacitor
import WebKit
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        // Note: AVAudioSession is NOT configured on launch - it's configured on-demand 
        // by NativeMicrophonePlugin when voice chat starts, to avoid affecting other audio features.
        
        // CRITICAL: Pre-warm the keyboard system on first launch to prevent 15s freeze
        // This triggers iOS to initialize keyboard caches before user interaction
        preWarmKeyboard()
        
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
    
    /// Pre-warm the iOS keyboard system to prevent first-input freeze
    /// iOS initializes keyboard caches on first use which can cause 15s delays when combined with WKWebView
    private func preWarmKeyboard() {
        DispatchQueue.main.async {
            // Create a hidden text field to trigger keyboard initialization
            let hiddenField = UITextField(frame: CGRect(x: -1000, y: -1000, width: 100, height: 44))
            hiddenField.autocorrectionType = .no
            hiddenField.autocapitalizationType = .none
            hiddenField.spellCheckingType = .no
            
            if let window = self.window {
                window.addSubview(hiddenField)
                
                // Briefly become first responder to initialize keyboard system
                hiddenField.becomeFirstResponder()
                
                // Immediately resign and remove
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    hiddenField.resignFirstResponder()
                    hiddenField.removeFromSuperview()
                    print("✅ Keyboard pre-warmed for first-run optimization")
                }
            }
        }
    }
    
    // Configure WKWebView to disable bounce, set dark background, and enable media permissions
    private func configureWebView(_ bridgeVC: CAPBridgeViewController) {
        guard let webView = bridgeVC.webView else { return }
        
        // Disable rubber band bounce
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        
        // CRITICAL: Fix keyboard focus deadlock that causes 15s freezes
        // Set interactive keyboard dismiss mode to prevent gesture gate timeout
        webView.scrollView.keyboardDismissMode = .interactive
        
        // Disable link preview to prevent gesture conflicts with keyboard
        webView.allowsLinkPreview = false
        
        // CRITICAL: Disable long press gesture recognizer to prevent keyboard conflicts
        // This is a known iOS WKWebView bug (Apple Forums thread 719620)
        disableLongPressGesture(on: webView)
        
        // Set dark background to match app theme (#0f172a = slate-900)
        let darkBackground = UIColor(red: 15/255.0, green: 23/255.0, blue: 42/255.0, alpha: 1.0)
        webView.scrollView.backgroundColor = darkBackground
        webView.isOpaque = false
        webView.backgroundColor = darkBackground
        
        // Enable inline media playback (required for getUserMedia)
        webView.configuration.allowsInlineMediaPlayback = true
        if #available(iOS 15.4, *) {
            webView.configuration.preferences.isElementFullscreenEnabled = true
        }
        
        // CRITICAL: Inject JS to disable SharedWorker (iOS 16.1+ bug that causes WKWebView freezes)
        let disableSharedWorkerScript = WKUserScript(
            source: "delete window.SharedWorker;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        webView.configuration.userContentController.addUserScript(disableSharedWorkerScript)
        print("✅ SharedWorker disabled to prevent WKWebView freeze")
        
        // Set UI delegate for media capture permissions and focus handling (iOS 15+)
        if #available(iOS 15.0, *) {
            webView.uiDelegate = WebViewUIDelegate.shared
            print("✅ WKUIDelegate configured for media capture permissions")
        }
        
        // Set navigation delegate to handle process termination
        webView.navigationDelegate = WebViewNavigationDelegate.shared
        
        // CRITICAL: Remove input accessory view after WebView content loads
        // This must be delayed to ensure WKContentView exists
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.removeInputAccessoryView(from: webView)
        }
        
        print("✅ WebView keyboard handling configured")
    }
    
    /// Disable long press gesture recognizer to prevent keyboard conflicts
    private func disableLongPressGesture(on webView: WKWebView) {
        if let longPressGesture = webView.gestureRecognizers?.first(where: { $0 is UILongPressGestureRecognizer }) {
            longPressGesture.isEnabled = false
            print("✅ Long press gesture disabled to prevent keyboard freeze")
        }
    }
    
    /// Remove the WKWebView keyboard accessory bar to prevent constraint conflicts
    /// The keyboard toolbar has zero-width buttons that cause layout issues on first use
    private func removeInputAccessoryView(from webView: WKWebView) {
        // Use runtime method to disable the input accessory view
        // This prevents the "UIButtonBarButton width == 0" constraint conflicts
        guard let target = webView.scrollView.subviews.first(where: {
            String(describing: type(of: $0)).hasPrefix("WKContent")
        }), let superclass = target.superclass else {
            print("⚠️ Could not find WKContentView to remove input accessory")
            return
        }
        
        let noInputAccessoryViewClassName = "\(superclass)_NoInputAccessoryView"
        var newClass: AnyClass? = NSClassFromString(noInputAccessoryViewClassName)
        
        if newClass == nil,
           let targetClass = object_getClass(target),
           let classNameCString = noInputAccessoryViewClassName.cString(using: .ascii) {
            newClass = objc_allocateClassPair(targetClass, classNameCString, 0)
            if let newClass = newClass {
                objc_registerClassPair(newClass)
            }
        }
        
        guard let noInputAccessoryClass = newClass,
              let originalMethod = class_getInstanceMethod(
                InputAccessoryHackHelper.self,
                #selector(getter: InputAccessoryHackHelper.inputAccessoryView)
              ) else {
            return
        }
        
        class_addMethod(
            noInputAccessoryClass.self,
            #selector(getter: InputAccessoryHackHelper.inputAccessoryView),
            method_getImplementation(originalMethod),
            method_getTypeEncoding(originalMethod)
        )
        
        object_setClass(target, noInputAccessoryClass)
        print("✅ WKWebView input accessory bar removed to prevent constraint conflicts")
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

// MARK: - WKNavigationDelegate for Process Termination Recovery
// Handles WKWebView content process crashes/freezes
class WebViewNavigationDelegate: NSObject, WKNavigationDelegate {
    static let shared = WebViewNavigationDelegate()
    
    private override init() {
        super.init()
    }
    
    // Called when WKWebView web content process terminates (freeze/crash recovery)
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        print("⚠️ WKWebView content process terminated - reloading")
        webView.reload()
    }
    
    // Called when navigation fails - can help recover from keyboard-related freezes
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("⚠️ WKWebView navigation failed: \(error.localizedDescription)")
    }
}

// MARK: - Input Accessory View Helper
// Helper class for removing WKWebView keyboard accessory bar
@objc fileprivate final class InputAccessoryHackHelper: NSObject {
    @objc var inputAccessoryView: AnyObject? {
        return nil
    }
}
