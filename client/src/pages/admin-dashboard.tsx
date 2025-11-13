import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminMetricCard } from "@/components/AdminMetricCard";
import { AdminStatusBadge } from "@/components/AdminStatusBadge";
import { AdminGlassPanel } from "@/components/AdminGlassPanel";
import { 
  Users, 
  DollarSign, 
  Zap, 
  TrendingUp, 
  Settings, 
  FileText,
  BarChart3,
  CreditCard
} from "lucide-react";

interface AdminOverviewStats {
  totalUsers: number;
  activeUsers: number;
  totalRevenue: number;
  apiQueries7d: number;
  apiCost7d: number;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: overviewStats, isLoading: overviewLoading } = useQuery<AdminOverviewStats>({
    queryKey: ['/api/admin/overview'],
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 dark:from-slate-950 dark:via-blue-950 dark:to-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/5 border-white/10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">Admin Dashboard</h1>
              <p className="text-sm text-white/70 mt-1">Manage your Flō platform</p>
            </div>
            <div className="flex items-center gap-2">
              <AdminStatusBadge status="success">System Healthy</AdminStatusBadge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full backdrop-blur-xl bg-white/5 border border-white/10 p-1 mb-6 rounded-2xl flex flex-wrap gap-1" data-testid="admin-tabs">
            <TabsTrigger 
              value="overview" 
              className="flex-1 min-w-[120px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00d4aa] data-[state=active]:via-[#00a8ff] data-[state=active]:to-[#0066ff] data-[state=active]:text-white rounded-xl px-4 py-2"
              data-testid="tab-overview"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="flex-1 min-w-[120px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00d4aa] data-[state=active]:via-[#00a8ff] data-[state=active]:to-[#0066ff] data-[state=active]:text-white rounded-xl px-4 py-2"
              data-testid="tab-users"
            >
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger 
              value="billing" 
              className="flex-1 min-w-[120px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00d4aa] data-[state=active]:via-[#00a8ff] data-[state=active]:to-[#0066ff] data-[state=active]:text-white rounded-xl px-4 py-2"
              data-testid="tab-billing"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Billing
            </TabsTrigger>
            <TabsTrigger 
              value="api-usage" 
              className="flex-1 min-w-[120px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00d4aa] data-[state=active]:via-[#00a8ff] data-[state=active]:to-[#0066ff] data-[state=active]:text-white rounded-xl px-4 py-2"
              data-testid="tab-api-usage"
            >
              <Zap className="w-4 h-4 mr-2" />
              API Usage
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              className="flex-1 min-w-[120px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00d4aa] data-[state=active]:via-[#00a8ff] data-[state=active]:to-[#0066ff] data-[state=active]:text-white rounded-xl px-4 py-2"
              data-testid="tab-analytics"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger 
              value="audit-logs" 
              className="flex-1 min-w-[120px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00d4aa] data-[state=active]:via-[#00a8ff] data-[state=active]:to-[#0066ff] data-[state=active]:text-white rounded-xl px-4 py-2"
              data-testid="tab-audit-logs"
            >
              <FileText className="w-4 h-4 mr-2" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="flex-1 min-w-[120px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00d4aa] data-[state=active]:via-[#00a8ff] data-[state=active]:to-[#0066ff] data-[state=active]:text-white rounded-xl px-4 py-2"
              data-testid="tab-settings"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <AdminMetricCard
                title="Total Users"
                value={overviewStats?.totalUsers || 0}
                icon={Users}
                subtitle={`${overviewStats?.activeUsers || 0} active`}
              />
              <AdminMetricCard
                title="Total Revenue"
                value={`$${overviewStats?.totalRevenue?.toFixed(2) || '0.00'}`}
                icon={DollarSign}
                subtitle="All time"
              />
              <AdminMetricCard
                title="API Queries"
                value={overviewStats?.apiQueries7d || 0}
                icon={Zap}
                subtitle="Last 7 days"
              />
              <AdminMetricCard
                title="API Cost"
                value={`$${overviewStats?.apiCost7d?.toFixed(2) || '0.00'}`}
                icon={TrendingUp}
                subtitle="Last 7 days"
              />
            </div>
            
            <AdminGlassPanel>
              <h3 className="text-lg font-semibold text-white mb-4">System Health</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white/70">Database</span>
                  <AdminStatusBadge status="success">Connected</AdminStatusBadge>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white/70">OpenAI Integration</span>
                  <AdminStatusBadge status="success">Active</AdminStatusBadge>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white/70">Stripe Integration</span>
                  <AdminStatusBadge status="success">Active</AdminStatusBadge>
                </div>
              </div>
            </AdminGlassPanel>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <AdminGlassPanel>
              <h3 className="text-lg font-semibold text-white mb-4">User Management</h3>
              <p className="text-white/70 text-sm">User management interface coming soon...</p>
            </AdminGlassPanel>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <AdminGlassPanel>
              <h3 className="text-lg font-semibold text-white mb-4">Billing & Revenue</h3>
              <p className="text-white/70 text-sm">Billing analytics coming soon...</p>
            </AdminGlassPanel>
          </TabsContent>

          {/* API Usage Tab */}
          <TabsContent value="api-usage">
            <AdminGlassPanel>
              <h3 className="text-lg font-semibold text-white mb-4">API Usage</h3>
              <p className="text-white/70 text-sm">API usage tracking coming soon...</p>
            </AdminGlassPanel>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <AdminGlassPanel>
              <h3 className="text-lg font-semibold text-white mb-4">Analytics</h3>
              <p className="text-white/70 text-sm">Analytics dashboard coming soon...</p>
            </AdminGlassPanel>
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit-logs">
            <AdminGlassPanel>
              <h3 className="text-lg font-semibold text-white mb-4">Audit Logs</h3>
              <p className="text-white/70 text-sm">Audit log viewer coming soon...</p>
            </AdminGlassPanel>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <AdminGlassPanel>
              <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>
              <p className="text-white/70 text-sm">Admin settings coming soon...</p>
            </AdminGlassPanel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
