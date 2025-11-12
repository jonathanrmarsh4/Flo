import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Insights from "@/pages/insights";
import Report from "@/pages/report";
import UploadPage from "@/pages/upload";
import History from "@/pages/history";
import Results from "@/pages/results";
import Profile from "@/pages/profile";
import AdminUsers from "@/pages/admin-users";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/insights" component={Insights} />
          <Route path="/insights/:id" component={Insights} />
          <Route path="/report/:id" component={Report} />
          <Route path="/upload" component={UploadPage} />
          <Route path="/history" component={History} />
          <Route path="/results/:id" component={Results} />
          <Route path="/profile" component={Profile} />
          <Route path="/admin/users" component={AdminUsers} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
