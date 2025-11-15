import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Capacitor } from '@capacitor/core';
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
import AdminUsers from "@/pages/admin-users";
import AdminDashboard from "@/pages/admin-dashboard";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const isNative = Capacitor.isNativePlatform();

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
