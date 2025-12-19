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
                    // Note: BarcodeScannerBridge removed - using @capacitor-mlkit/barcode-scanning instead
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
                    // Note: BarcodeScannerBridge removed - using @capacitor-mlkit/barcode-scanning instead
                    print("✅ HealthSyncPlugin registered manually")
                    print("✅ WebViewCachePlugin registered manually")
                    print("✅ NativeMicrophonePlugin registered manually")
                }
            }
        }
        
        return true
    }
    
    /// Pre-warm the iOS keyboard system to prevent first-input freeze
    /// iOS initializes keyboard caches on first use which can cause delays when combined with WKWebView
    /// Note: Aggressive pre-warming can interfere with WebView keyboard - keep it minimal
    private func preWarmKeyboard() {
        // Single quick pre-warm at launch - just enough to initialize keyboard caches
        // without interfering with WebView's own keyboard session management
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            let hiddenField = UITextField(frame: CGRect(x: -1000, y: -1000, width: 100, height: 44))
            hiddenField.autocorrectionType = .no
            hiddenField.autocapitalizationType = .none
            hiddenField.spellCheckingType = .no
            
            if let window = self.window {
                window.addSubview(hiddenField)
                
                // Brief focus to trigger keyboard cache initialization
                hiddenField.becomeFirstResponder()
                
                // Quick resign - don't hold the keyboard session
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
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
        
        // CRITICAL: Disable find interaction to prevent RTIInputSystemClient session invalidation
        // This is a cause of keyboard delays on iOS 16+
        if #available(iOS 16.0, *) {
            webView.isFindInteractionEnabled = false
            print("✅ Find interaction disabled")
        }
        
        // CRITICAL: Disable UITextInteraction on subviews to prevent session conflicts (iOS 17+)
        disableTextInteractions(on: webView)
        
        // CRITICAL: Add keyboard notification handler to reset scroll position
        // Prevents gesture stalls when keyboard hides
        setupKeyboardNotifications(for: webView)
        
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
    
    /// Disable UITextInteraction on WKWebView subviews to prevent RTI session conflicts (iOS 17+)
    /// This addresses the "perform input operation requires a valid sessionID" error
    private func disableTextInteractions(on webView: WKWebView) {
        if #available(iOS 17.0, *) {
            // Iterate through scrollView subviews to find and disable text interactions
            for subview in webView.scrollView.subviews {
                for interaction in subview.interactions {
                    if String(describing: type(of: interaction)).contains("UITextInteraction") {
                        subview.removeInteraction(interaction)
                        print("✅ UITextInteraction removed from WKWebView subview")
                    }
                }
            }
            
            // Also check the webView itself
            for interaction in webView.interactions {
                if String(describing: type(of: interaction)).contains("UITextInteraction") {
                    webView.removeInteraction(interaction)
                    print("✅ UITextInteraction removed from WKWebView")
                }
            }
        }
    }
    
    /// Setup keyboard notification handlers to prevent scroll position issues
    /// Resets contentOffset when keyboard hides to prevent gesture stalls
    private func setupKeyboardNotifications(for webView: WKWebView) {
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { [weak webView] _ in
            // Reset scroll position when keyboard hides to prevent gesture stalls
            webView?.scrollView.contentOffset = .zero
        }
        
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillShowNotification,
            object: nil,
            queue: .main
        ) { [weak webView] notification in
            // Ensure webView is responsive when keyboard appears
            guard let webView = webView else { return }
            
            // Force layout update to prevent constraint conflicts
            webView.setNeedsLayout()
            webView.layoutIfNeeded()
        }
        
        print("✅ Keyboard notification handlers configured")
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
    
    // MARK: - Push Notification Delegate Methods
    // These MUST be implemented for APNs to work with Capacitor
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Convert token to hex string for logging
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("✅ [APNs] Device token received from Apple: \(tokenString.prefix(20))...")
        print("✅ [APNs] Token length: \(tokenString.count) characters")
        
        // Forward to Capacitor PushNotifications plugin via NotificationCenter
        // The plugin listens for this notification to receive the device token
        NotificationCenter.default.post(name: Notification.Name.capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("❌ [APNs] Failed to register for remote notifications!")
        print("❌ [APNs] Error: \(error.localizedDescription)")
        print("❌ [APNs] Full error: \(error)")
        
        // Forward to Capacitor PushNotifications plugin via NotificationCenter
        NotificationCenter.default.post(name: Notification.Name.capacitorDidFailToRegisterForRemoteNotifications, object: error)
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
