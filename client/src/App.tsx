import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useHealthKitAutoSync } from "@/hooks/useHealthKitAutoSync";
import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';
import { initializeNotifications } from "@/lib/notifications";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import MobileAuth from "@/pages/MobileAuth";
import ResetPassword from "@/pages/ResetPassword";
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

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const isNative = Capacitor.isNativePlatform();
  
  // Automatically sync HealthKit data in background on app launch
  useHealthKitAutoSync();

  // Initialize notifications on app start (native only)
  useEffect(() => {
    if (isNative && isAuthenticated) {
      initializeNotifications();
      // Also initialize Flōmentum notifications
      import('@/lib/flomentumNotifications').then(({ initializeFlomentumNotifications, getNotificationConfig }) => {
        const config = getNotificationConfig();
        initializeFlomentumNotifications(config);
      });
    }
  }, [isNative, isAuthenticated]);

  // Auto-clear cache on version update (native only)
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
        } else {
          console.log('[App] Version unchanged:', APP_VERSION);
        }
      } catch (error) {
        console.error('[App] ❌ Error checking/clearing cache on version update:', error);
      }
    }

    checkAndClearCacheOnUpdate();
  }, [isNative]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Mobile auth route - accessible for testing and native platforms */}
      <Route path="/mobile-auth" component={MobileAuth} />
      
      {/* Password reset route - accessible to all users */}
      <Route path="/reset-password" component={ResetPassword} />
      
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
