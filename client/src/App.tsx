import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useHealthKitAutoSync } from "@/hooks/useHealthKitAutoSync";
import { useTimezoneAutoSync } from "@/hooks/useTimezoneAutoSync";
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useEffect, useState, useRef } from 'react';
import { initializeNotifications } from "@/lib/notifications";
import { initializeStripeNative } from "@/lib/stripe-native";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import MobileAuth from "@/pages/MobileAuth";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import Dashboard from "@/pages/dashboard-new";
import Labs from "@/pages/labs";
import InsightsScreen from "@/pages/InsightsScreen";
import ActionsScreen from "@/pages/ActionsScreen";
import Report from "@/pages/report";
import UploadPage from "@/pages/upload";
import History from "@/pages/history";
import Results from "@/pages/results";
import Profile from "@/pages/profile";
import DiagnosticsPage from "@/pages/diagnostics";
import HealthKitPage from "@/pages/healthkit";
import FlomentumScreen from "@/pages/FlomentumScreen";
import AdminUsers from "@/pages/admin-users";
import AdminDashboard from "@/pages/admin-dashboard";
import BillingPage from "@/pages/billing";
import ShortcutsPage from "@/pages/shortcuts";

const ONBOARDING_COMPLETED_KEY = 'flo_onboarding_completed';

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const isNative = Capacitor.isNativePlatform();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [, setLocation] = useLocation();
  
  // Check if user needs to see onboarding
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      // Check localStorage for this specific user
      const onboardingKey = `${ONBOARDING_COMPLETED_KEY}_${user.id}`;
      const completed = localStorage.getItem(onboardingKey);
      
      if (!completed) {
        setShowOnboarding(true);
      }
      setOnboardingChecked(true);
    } else if (!isAuthenticated) {
      setShowOnboarding(false);
      setOnboardingChecked(true);
    }
  }, [isAuthenticated, user?.id]);

  const handleOnboardingComplete = () => {
    if (user?.id) {
      const onboardingKey = `${ONBOARDING_COMPLETED_KEY}_${user.id}`;
      localStorage.setItem(onboardingKey, 'true');
    }
    setShowOnboarding(false);
    // Navigate to root to ensure valid route after onboarding
    setLocation('/');
  };

  const handleOnboardingSkip = () => {
    if (user?.id) {
      const onboardingKey = `${ONBOARDING_COMPLETED_KEY}_${user.id}`;
      localStorage.setItem(onboardingKey, 'skipped');
    }
    setShowOnboarding(false);
    // Navigate to root to ensure valid route after onboarding
    setLocation('/');
  };
  
  // Automatically sync HealthKit data in background on app launch
  useHealthKitAutoSync();
  
  // Automatically sync device timezone for accurate insights scheduling
  useTimezoneAutoSync(user?.id);

  // Track which launch URLs we've already processed to prevent re-navigation
  // This is stored in a ref to persist across renders without triggering re-renders
  const processedLaunchUrlRef = useRef<string | null>(null);

  // Handle deep links from Universal Links (native only)
  useEffect(() => {
    if (!isNative) return;

    // Handle URLs when app is opened via Universal Link
    const handleDeepLink = (event: { url: string }, isLaunchUrl = false) => {
      console.log('[App] Deep link received:', event.url, isLaunchUrl ? '(launch URL)' : '(appUrlOpen)');
      
      // For launch URLs, check if we've already processed this exact URL
      // This prevents the bug where navigating away from /reset-password 
      // causes re-navigation back to the same expired token URL
      if (isLaunchUrl && processedLaunchUrlRef.current === event.url) {
        console.log('[App] Skipping already-processed launch URL');
        return;
      }
      
      try {
        const url = new URL(event.url);
        const path = url.pathname;
        const search = url.search;
        
        console.log('[App] Navigating to:', path + search);
        
        // Mark this launch URL as processed BEFORE navigating
        if (isLaunchUrl) {
          processedLaunchUrlRef.current = event.url;
        }
        
        // Navigate to the path (wouter will handle hash routing)
        setLocation(path + search);
      } catch (error) {
        console.error('[App] Error parsing deep link:', error);
      }
    };

    // Listen for app URL open events (when app is already running)
    // These are always fresh intents so we process them without checking
    CapacitorApp.addListener('appUrlOpen', (event) => handleDeepLink(event, false));

    // Check if app was launched with a URL (cold start)
    // This URL persists across navigations, so we track if we've already handled it
    CapacitorApp.getLaunchUrl().then((result) => {
      if (result?.url) {
        console.log('[App] Launched with URL:', result.url);
        handleDeepLink({ url: result.url }, true);
      }
    });

    return () => {
      CapacitorApp.removeAllListeners();
    };
  }, [isNative, setLocation]);

  // Initialize notifications on app start (native only)
  // Deferred to avoid blocking first interaction
  useEffect(() => {
    if (isNative && isAuthenticated) {
      // Defer initialization to after first paint to prevent UI freeze
      const scheduleInit = (callback: () => void) => {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(callback, { timeout: 5000 });
        } else {
          setTimeout(callback, 3000);
        }
      };
      
      scheduleInit(() => {
        initializeNotifications();
        // Also initialize Flōmentum notifications
        import('@/lib/flomentumNotifications').then(({ initializeFlomentumNotifications, getNotificationConfig }) => {
          const config = getNotificationConfig();
          initializeFlomentumNotifications(config);
        });
      });
    }
  }, [isNative, isAuthenticated]);

  // Initialize Stripe native plugin for Apple Pay (native only)
  // Deferred to avoid blocking first interaction
  useEffect(() => {
    if (isNative) {
      // Defer Stripe init to after first paint
      const timer = setTimeout(() => {
        initializeStripeNative().then(success => {
          if (success) {
            console.log('[App] Stripe native plugin initialized');
          }
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isNative]);

  // Auto-clear cache on version update (native only)
  // Deferred to avoid blocking first interaction
  useEffect(() => {
    if (!isNative) return;

    const APP_VERSION = '1.0.1'; // Bump this to trigger cache clear
    const VERSION_KEY = 'app_version';

    async function checkAndClearCacheOnUpdate() {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const WebViewCache = (await import('@/plugins/webviewCache')).default;

        // Get stored version
        const { value: storedVersion } = await Preferences.get({ key: VERSION_KEY });

        if (storedVersion && storedVersion !== APP_VERSION) {
          console.log(`[App] Version changed from ${storedVersion} to ${APP_VERSION} - clearing cache...`);
          
          // Clear WKWebView cache
          const result = await WebViewCache.clearCache();
          console.log('[App] Cache cleared:', result);

          // Update stored version
          await Preferences.set({ key: VERSION_KEY, value: APP_VERSION });
          console.log('[App] ✅ Version updated and cache cleared successfully');
        } else if (!storedVersion) {
          // First launch - just store the version
          await Preferences.set({ key: VERSION_KEY, value: APP_VERSION });
          console.log('[App] ✅ First launch - version stored:', APP_VERSION);
        }
      } catch (error) {
        console.error('[App] ❌ Error checking/clearing cache on version update:', error);
      }
    }

    // Defer version check to after first paint
    const timer = setTimeout(checkAndClearCacheOnUpdate, 3000);
    return () => clearTimeout(timer);
  }, [isNative]);

  if (isLoading || !onboardingChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show onboarding for authenticated users who haven't completed it
  if (isAuthenticated && showOnboarding) {
    return (
      <OnboardingScreen
        isDark={true}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    );
  }

  return (
    <Switch>
      {/* Mobile auth route - accessible for testing and native platforms */}
      <Route path="/mobile-auth" component={MobileAuth} />
      
      {/* Password reset route - accessible to all users */}
      <Route path="/reset-password" component={ResetPassword} />
      
      {/* Email verification route - accessible to all users */}
      <Route path="/verify-email" component={VerifyEmail} />
      
      {isLoading || !isAuthenticated ? (
        isNative ? (
          <Route path="/" component={MobileAuth} />
        ) : (
          <Route path="/" component={Landing} />
        )
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/labs" component={Labs} />
          <Route path="/insights" component={InsightsScreen} />
          <Route path="/actions" component={ActionsScreen} />
          <Route path="/report/:id" component={Report} />
          <Route path="/upload" component={UploadPage} />
          <Route path="/history" component={History} />
          <Route path="/results/:id" component={Results} />
          <Route path="/profile" component={Profile} />
          <Route path="/billing" component={BillingPage} />
          <Route path="/shortcuts" component={ShortcutsPage} />
          <Route path="/diagnostics" component={DiagnosticsPage} />
          <Route path="/healthkit" component={HealthKitPage} />
          <Route path="/flomentum" component={FlomentumScreen} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin-dashboard" component={AdminDashboard} />
          <Route path="/admin/users" component={AdminUsers} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Use hash-based routing for native apps (Capacitor)
  const isNative = Capacitor.isNativePlatform();
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {isNative ? (
          <WouterRouter hook={useHashLocation}>
            <Router />
          </WouterRouter>
        ) : (
          <Router />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
