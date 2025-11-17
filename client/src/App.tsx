import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useHealthKitAutoSync } from "@/hooks/useHealthKitAutoSync";
import { pushNotificationService } from "@/services/pushNotifications";
import { Capacitor } from '@capacitor/core';
import { useEffect } from "react";
import { useLocation } from "wouter";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import MobileAuth from "@/pages/MobileAuth";
import Dashboard from "@/pages/dashboard-new";
import Labs from "@/pages/labs";
import Insights from "@/pages/insights";
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

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const isNative = Capacitor.isNativePlatform();
  const [, setLocation] = useLocation();
  
  // Automatically sync HealthKit data in background on app launch
  useHealthKitAutoSync();

  // Initialize push notifications when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user && isNative) {
      pushNotificationService.initialize(user.id).catch(error => {
        console.error('[App] Failed to initialize push notifications:', error);
      });
    }
  }, [isAuthenticated, user, isNative]);

  // Listen for notification navigation events
  useEffect(() => {
    const handleNotificationNav = (event: CustomEvent) => {
      const { screen, data } = event.detail;
      console.log('[App] Navigating from notification:', screen, data);
      
      // Map notification screens to routes
      const routeMap: Record<string, string> = {
        'dashboard': '/',
        'flomentum': '/flomentum',
        'labs': '/labs',
        'insights': '/insights',
        'profile': '/profile',
      };
      
      const route = routeMap[screen] || '/';
      setLocation(route);
    };

    window.addEventListener('notification-navigation', handleNotificationNav as EventListener);
    
    return () => {
      window.removeEventListener('notification-navigation', handleNotificationNav as EventListener);
    };
  }, [setLocation]);

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
          <Route path="/insights" component={Insights} />
          <Route path="/insights/:id" component={Insights} />
          <Route path="/report/:id" component={Report} />
          <Route path="/upload" component={UploadPage} />
          <Route path="/history" component={History} />
          <Route path="/results/:id" component={Results} />
          <Route path="/profile" component={Profile} />
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
