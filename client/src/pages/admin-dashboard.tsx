import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Users, DollarSign, Activity, TrendingUp, Search,
  Settings, BarChart3, Zap, Database, AlertCircle, CheckCircle, XCircle,
  CreditCard, Ban, Shield, FileText, Bell, Server, Link, Wifi, Edit2, Trash2,
  ChevronDown, Heart, Sparkles, Wallet
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AdminNotificationConfig } from '@/components/admin/AdminNotificationConfig';
import { AdminReportModelSettings } from '@/components/admin/AdminReportModelSettings';

interface AdminUserSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'free' | 'premium' | 'admin';
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
  subscriptionStatus: 'free' | 'premium';
  measurementCount: number;
  aiQueryCount: number;
  lastUpload: string | null;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'billing' | 'api' | 'analytics' | 'settings' | 'logs' | 'healthkit' | 'systems' | 'notifications'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'free' | 'premium' | 'admin'>('free');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');

  const { data: overviewData } = useQuery({
    queryKey: ['/api/admin/overview'],
    refetchInterval: 30000,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: AdminUserSummary[]; total: number }>({
    queryKey: ['/api/admin/users', searchQuery, selectedFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (selectedFilter !== 'all') params.append('status', selectedFilter);
      const res = await apiRequest('GET', `/api/admin/users?${params}`);
      return await res.json();
    },
  });

  const { data: apiUsageData } = useQuery({
    queryKey: ['/api/admin/api-usage'],
    refetchInterval: 60000,
  });

  const { data: auditLogsData } = useQuery({
    queryKey: ['/api/admin/audit-logs'],
    refetchInterval: 30000,
  });

  const { data: healthKitStatsData } = useQuery({
    queryKey: ['/api/admin/healthkit/stats'],
    refetchInterval: 30000,
  });

  const { data: healthKitStatusData } = useQuery({
    queryKey: ['/api/admin/healthkit/status'],
    refetchInterval: 10000,
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, role, status }: { userId: string; role?: string; status?: string }) => {
      return await apiRequest('PATCH', `/api/admin/users/${userId}`, { role, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/overview'] });
      setEditingUser(null);
      toast({
        title: 'User updated',
        description: 'User details have been updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user',
        variant: 'destructive',
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('DELETE', `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/overview'] });
      toast({
        title: 'User deleted',
        description: 'User and all associated data have been permanently deleted',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user',
        variant: 'destructive',
      });
    },
  });

  const triggerInsightsMutation = useMutation({
    mutationFn: async () => {
      // Daily Insights Engine v2.0 - triggers generation check for all eligible users
      return await apiRequest('POST', '/api/daily-insights/trigger-check');
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Insights Generation Triggered',
        description: data.message || 'Scheduler check triggered. Check logs for results.',
      });
    },
    onError: (error: any) => {
      console.error('Insights generation error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to trigger insights generation',
        variant: 'destructive',
      });
    },
  });

  const forceGenerateMutation = useMutation({
    mutationFn: async () => {
      // Force generate insights for current admin user (bypasses time check)
      return await apiRequest('POST', '/api/daily-insights/generate');
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Insights Generated',
        description: `Generated ${data.insightsGenerated} insights in ${data.durationMs}ms`,
      });
    },
    onError: (error: any) => {
      console.error('Force generation error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate insights',
        variant: 'destructive',
      });
    },
  });

  const handleSaveUser = (userId: string) => {
    updateUserMutation.mutate({ userId, role: editRole, status: editStatus });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    if (confirm(`Are you sure you want to permanently delete ${userName}? This action cannot be undone and will delete all associated data.`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  const totalUsers = (overviewData as any)?.totalUsers || 0;
  const activeUsers = (overviewData as any)?.activeUsers || 0;
  const totalRevenue = (overviewData as any)?.totalRevenue || 0;
  const apiQueries7d = (overviewData as any)?.apiQueries7d || 0;
  const apiCost7d = (overviewData as any)?.apiCost7d || 0;

  const users: AdminUserSummary[] = usersData?.users || [];
  const totalUserCount = usersData?.total || 0;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'billing', label: 'Billing', icon: DollarSign },
    { id: 'api', label: 'API Usage', icon: Zap },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'healthkit', label: 'HealthKit', icon: Heart },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'systems', label: 'Systems', icon: Server },
    { id: 'logs', label: 'Audit Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/5 border-white/10 pt-[env(safe-area-inset-top)]">
        <div className="px-4 sm:px-6 pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-cyan-400" data-testid="icon-admin-shield" />
              <div>
                <h1 className="text-lg sm:text-xl text-white" data-testid="text-admin-title">
                  Admin Dashboard
                </h1>
                <p className="text-xs text-white/50" data-testid="text-admin-subtitle">
                  Flō by Nuvitae Labs - Administrative Control Panel
                </p>
              </div>
            </div>
            <button 
              onClick={() => setLocation('/')}
              className="px-3 sm:px-4 py-2 rounded-lg transition-colors hover:bg-white/10 text-white/70 text-sm"
              data-testid="button-close-admin"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg whitespace-nowrap transition-all text-sm ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white shadow-lg'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-140px)] overflow-y-auto overscroll-none px-4 sm:px-6 py-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="metric-total-users">
                <div className="flex items-center justify-between mb-4">
                  <Users className="w-8 h-8 text-cyan-400" />
                </div>
                <div className="text-3xl mb-1 text-white">
                  {totalUsers}
                </div>
                <div className="text-sm text-white/50">
                  Total Users
                </div>
                <div className="text-xs mt-2 text-white/40">
                  {activeUsers} active users
                </div>
              </div>

              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="metric-total-revenue">
                <div className="flex items-center justify-between mb-4">
                  <DollarSign className="w-8 h-8 text-green-400" />
                </div>
                <div className="text-3xl mb-1 text-white">
                  ${totalRevenue.toFixed(2)}
                </div>
                <div className="text-sm text-white/50">
                  Total Revenue
                </div>
              </div>

              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="metric-api-queries">
                <div className="flex items-center justify-between mb-4">
                  <Zap className="w-8 h-8 text-purple-400" />
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">
                    7 days
                  </span>
                </div>
                <div className="text-3xl mb-1 text-white">
                  {apiQueries7d.toLocaleString()}
                </div>
                <div className="text-sm text-white/50">
                  API Queries
                </div>
              </div>

              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="metric-api-cost">
                <div className="flex items-center justify-between mb-4">
                  <Activity className="w-8 h-8 text-blue-400" />
                </div>
                <div className="text-3xl mb-1 text-white">
                  ${apiCost7d.toFixed(2)}
                </div>
                <div className="text-sm text-white/50">
                  AI API Costs
                </div>
                <div className="text-xs mt-2 text-white/40">
                  Last 7 days
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="panel-integrations">
                <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                  <Link className="w-5 h-5" />
                  System Integrations
                </h3>
                <div className="space-y-3">
                  <div className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-white">PostgreSQL Database</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Connected</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-white">OpenAI API (GPT-4)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Active</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-white">Stripe Payments</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Operational</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-white">Auth Service</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Healthy</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="panel-system-health">
                <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                  <Server className="w-5 h-5" />
                  System Health
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">API Uptime</span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">99.98%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Database Status</span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">Healthy</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Active Connections</span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">{activeUsers} / 100</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  data-testid="input-search-users"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'active', 'suspended'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedFilter(filter)}
                    className={`px-4 py-2 rounded-xl transition-all text-sm capitalize ${
                      selectedFilter === filter
                        ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                    data-testid={`filter-${filter}`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {usersLoading ? (
              <div className="text-center py-12 text-white/50">Loading users...</div>
            ) : (
              <>
                <div className="rounded-2xl border overflow-hidden bg-white/5 border-white/10">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-white/10">
                        <tr>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">User</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">Subscription</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">Role</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">Status</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70 hidden lg:table-cell">Activity</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-white/5" data-testid={`user-row-${user.id}`}>
                            <td className="px-4 sm:px-6 py-4">
                              <div>
                                <div className="text-sm text-white">
                                  {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}
                                </div>
                                <div className="text-xs text-white/50 truncate max-w-[200px]">{user.email}</div>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                user.subscriptionStatus === 'premium' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {user.subscriptionStatus}
                              </span>
                            </td>
                            <td className="px-4 sm:px-6 py-4">
                              {editingUser === user.id ? (
                                <select
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value as any)}
                                  className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                                  data-testid={`select-role-${user.id}`}
                                >
                                  <option value="free">Free</option>
                                  <option value="premium">Premium</option>
                                  <option value="admin">Admin</option>
                                </select>
                              ) : (
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  user.role === 'admin' ? 'bg-cyan-500/20 text-cyan-400' : 
                                  user.role === 'premium' ? 'bg-purple-500/20 text-purple-400' :
                                  'bg-white/10 text-white/70'
                                }`}>
                                  {user.role}
                                </span>
                              )}
                            </td>
                            <td className="px-4 sm:px-6 py-4">
                              {editingUser === user.id ? (
                                <select
                                  value={editStatus}
                                  onChange={(e) => setEditStatus(e.target.value as any)}
                                  className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                                  data-testid={`select-status-${user.id}`}
                                >
                                  <option value="active">Active</option>
                                  <option value="suspended">Suspended</option>
                                </select>
                              ) : (
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  user.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {user.status}
                                </span>
                              )}
                            </td>
                            <td className="px-4 sm:px-6 py-4 hidden lg:table-cell">
                              <div className="text-xs text-white/70">{user.measurementCount} biomarkers</div>
                              <div className="text-xs text-white/50">{user.aiQueryCount} AI queries</div>
                            </td>
                            <td className="px-4 sm:px-6 py-4">
                              <div className="flex gap-2">
                                {editingUser === user.id ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveUser(user.id)}
                                      disabled={updateUserMutation.isPending}
                                      className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors disabled:opacity-50"
                                      data-testid={`button-save-user-${user.id}`}
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => setEditingUser(null)}
                                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
                                      data-testid={`button-cancel-edit-${user.id}`}
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingUser(user.id);
                                        setEditRole(user.role);
                                        setEditStatus(user.status);
                                      }}
                                      className="p-2 rounded-lg hover:bg-white/10 text-cyan-400 transition-colors"
                                      data-testid={`button-edit-user-${user.id}`}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteUser(user.id, user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email || 'this user')}
                                      disabled={deleteUserMutation.isPending}
                                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
                                      data-testid={`button-delete-user-${user.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="text-sm text-white/50" data-testid="text-user-count">
                  Showing {users.length} of {totalUserCount} users
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                <div className="text-xs text-white/50">Total Queries (7d)</div>
                <div className="text-2xl text-white mt-1">
                  {apiUsageData ? (apiUsageData as any).reduce((sum: number, item: any) => sum + item.queries, 0).toLocaleString() : '0'}
                </div>
              </div>
              <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                <div className="text-xs text-white/50">Total Cost (7d)</div>
                <div className="text-2xl text-white mt-1">
                  ${apiUsageData ? (apiUsageData as any).reduce((sum: number, item: any) => sum + item.cost, 0).toFixed(2) : '0.00'}
                </div>
              </div>
              <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                <div className="text-xs text-white/50">Providers Used</div>
                <div className="flex gap-2 mt-2">
                  {apiUsageData && (apiUsageData as any).some((item: any) => item.provider === 'openai') && (
                    <span className="px-2 py-1 rounded-md bg-green-500/20 text-green-300 text-xs">OpenAI</span>
                  )}
                  {apiUsageData && (apiUsageData as any).some((item: any) => item.provider === 'grok') && (
                    <span className="px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 text-xs">Grok (xAI)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Zap className="w-5 h-5" />
                AI API Usage (Last 7 Days)
              </h3>
              {apiUsageData && (apiUsageData as any).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Date</th>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Provider</th>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Model</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Queries</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Cost</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Avg Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {(apiUsageData as any).map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-sm text-white">{item.date}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-0.5 rounded-md text-xs ${
                              item.provider === 'openai' 
                                ? 'bg-green-500/20 text-green-300' 
                                : 'bg-blue-500/20 text-blue-300'
                            }`}>
                              {item.provider === 'openai' ? 'OpenAI' : 'Grok'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-purple-400">{item.model}</td>
                          <td className="px-4 py-3 text-sm text-white text-right">{item.queries.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-green-400 text-right">${item.cost.toFixed(4)}</td>
                          <td className="px-4 py-3 text-sm text-white/70 text-right">
                            {item.avgLatency ? `${item.avgLatency.toFixed(0)}ms` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-white/50">No AI API usage data available</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'healthkit' && (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Heart className="w-5 h-5" />
                HealthKit Overview
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                  <div className="text-xs text-white/50">Total Samples</div>
                  <div className="text-2xl text-white mt-1">
                    {healthKitStatsData ? (healthKitStatsData as any).totalSamples?.toLocaleString() || '0' : '0'}
                  </div>
                </div>
                <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                  <div className="text-xs text-white/50">Active Users</div>
                  <div className="text-2xl text-white mt-1">
                    {healthKitStatsData ? (healthKitStatsData as any).totalUsers?.toLocaleString() || '0' : '0'}
                  </div>
                </div>
                <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                  <div className="text-xs text-white/50">Last 24h Syncs</div>
                  <div className="text-2xl text-white mt-1">
                    {healthKitStatusData ? (healthKitStatusData as any).sampleCount24h?.toLocaleString() || '0' : '0'}
                  </div>
                </div>
              </div>

              <h4 className="text-sm text-white/70 mb-3">Samples by Data Type</h4>
              {healthKitStatsData && (healthKitStatsData as any).samplesByDataType?.length > 0 ? (
                <div className="space-y-2 mb-6">
                  {(healthKitStatsData as any).samplesByDataType.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border bg-white/5 border-white/10">
                      <span className="text-sm text-white">{item.dataType}</span>
                      <span className="text-sm text-purple-400">{item.count.toLocaleString()} samples</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-white/50 text-sm">No data types recorded yet</div>
              )}

              <h4 className="text-sm text-white/70 mb-3">Recent User Activity</h4>
              {healthKitStatsData && (healthKitStatsData as any).recentSamples?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs text-white/70">User ID</th>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Data Type</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Count</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Latest Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(healthKitStatsData as any).recentSamples.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-sm text-white font-mono text-xs">{item.userId.substring(0, 8)}...</td>
                          <td className="px-4 py-3 text-sm text-purple-400">{item.dataType}</td>
                          <td className="px-4 py-3 text-sm text-white text-right">{item.count}</td>
                          <td className="px-4 py-3 text-sm text-white/70 text-right text-xs">
                            {new Date(item.latestDate).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4 text-white/50 text-sm">No user activity yet</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'systems' && (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Server className="w-5 h-5" />
                Systems Integration
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border bg-white/5 border-white/10">
                  <div className="flex items-center gap-3">
                    <Heart className="w-5 h-5 text-pink-400" />
                    <div>
                      <div className="text-sm text-white">HealthKit API</div>
                      <div className="text-xs text-white/50">iOS Health Data Integration</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {healthKitStatusData ? (
                      <>
                        {(healthKitStatusData as any).status === 'operational' ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-400" data-testid="status-healthkit-operational" />
                            <span className="text-sm text-green-400">Operational</span>
                          </div>
                        ) : (healthKitStatusData as any).status === 'degraded' ? (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-400" data-testid="status-healthkit-degraded" />
                            <span className="text-sm text-yellow-400">Degraded</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-red-400" data-testid="status-healthkit-down" />
                            <span className="text-sm text-red-400">Down</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-white/50 animate-pulse" />
                        <span className="text-sm text-white/50">Checking...</span>
                      </div>
                    )}
                  </div>
                </div>

                {healthKitStatusData && (healthKitStatusData as any).lastSync && (
                  <div className="p-4 rounded-xl border bg-white/5 border-white/10">
                    <div className="text-xs text-white/50 mb-1">Last Sync</div>
                    <div className="text-sm text-white">
                      {new Date((healthKitStatusData as any).lastSync).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-purple-400" />
                AI Insights Generation
              </h3>
              
              <div className="space-y-4">
                <div className="p-4 rounded-xl border bg-white/5 border-white/10">
                  <div className="text-sm text-white mb-2">Proactive Insights Pipeline</div>
                  <div className="text-xs text-white/50 mb-4">
                    Manually trigger the insights generation process to analyze health data correlations and generate personalized insights for users. Requires at least 7 days of HealthKit data to generate initial insights. Insights improve over time with more data.
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => forceGenerateMutation.mutate()}
                      disabled={forceGenerateMutation.isPending}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-force-generate-insights"
                    >
                      {forceGenerateMutation.isPending ? (
                        <>
                          <Activity className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Generating...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          <span className="text-sm">Generate Now (For Me)</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => triggerInsightsMutation.mutate()}
                      disabled={triggerInsightsMutation.isPending}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-trigger-insights"
                    >
                      {triggerInsightsMutation.isPending ? (
                        <>
                          <Activity className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Checking...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span className="text-sm">Run Scheduler (All Users @ 6am)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="text-xs text-blue-400">
                      <strong>Daily Insights Engine v2.0:</strong> First button generates insights for YOU immediately (bypasses time check). Second button runs the scheduler for all users at exactly 06:00 local time. Analyzes 4 analytical layers to generate 0-5 personalized insights.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
            <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
              <FileText className="w-5 h-5" />
              Audit Logs
            </h3>
            {auditLogsData && (auditLogsData as any).length > 0 ? (
              <div className="space-y-3">
                {(auditLogsData as any).map((log: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-white">{log.action}</div>
                        <div className="text-xs text-white/50 mt-1">
                          Admin: {log.adminId} {log.targetUserId && `• Target: ${log.targetUserId}`}
                        </div>
                        <div className="text-xs text-white/40 mt-1">
                          {new Date(log.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-white/50">No audit logs available</div>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <AdminNotificationConfig />
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6">
            {/* Payment Method Tile */}
            <div className="backdrop-blur-xl rounded-3xl border p-6 bg-white/5 border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg text-white">
                  Payment Method
                </h2>
              </div>

              <div className="space-y-3">
                {/* Apple Pay Card */}
                <div 
                  className="p-4 rounded-2xl border bg-gradient-to-br from-white/5 to-white/[0.02] border-white/10"
                  style={{
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  }}
                  data-testid="payment-apple-pay"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Apple Pay Logo */}
                      <div 
                        className="w-12 h-12 rounded-xl bg-black flex items-center justify-center"
                        style={{
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                        }}
                      >
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                          <path d="M20.5 8.5c-.8 0-1.5-.3-2.1-.8-.5-.5-.9-1.3-.9-2.2 0-.1 0-.2.1-.2.1 0 .2 0 .2.1 1.1.4 2 1.5 2 2.8 0 .1 0 .2-.1.2-.1.1-.1.1-.2.1zm3.9 1.8c-1.2 0-2.1.6-2.8.6-.7 0-1.8-.6-3-.6-1.5 0-2.9.9-3.7 2.3-1.5 2.7-.4 6.6 1.1 8.8.7 1.1 1.6 2.3 2.7 2.3 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.9.7 1.2 0 1.9-1.1 2.6-2.2.8-1.3 1.1-2.5 1.1-2.6 0 0-2.2-.8-2.2-3.2 0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3.1-1.6l-.2-.6z" fill="white"/>
                          <text x="16" y="27" fill="white" fontSize="8" fontWeight="600" textAnchor="middle" fontFamily="system-ui, -apple-system">Pay</text>
                        </svg>
                      </div>
                      
                      <div>
                        <div className="font-medium text-white">
                          Apple Pay
                        </div>
                        <div className="text-sm text-white/50">
                          Visa •••• 4242
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      className="px-4 py-2 rounded-lg text-sm transition-all bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30"
                      data-testid="button-manage-payment"
                    >
                      Manage
                    </button>
                  </div>
                </div>

                {/* Add Payment Method Button */}
                <button 
                  className="w-full p-4 rounded-2xl border-2 border-dashed transition-all border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/5"
                  data-testid="button-add-payment"
                >
                  <div className="flex items-center justify-center gap-2">
                    <CreditCard className="w-4 h-4 text-white/50" />
                    <span className="text-sm text-white/70">
                      Add Payment Method
                    </span>
                  </div>
                </button>

                {/* Payment Info */}
                <div className="text-xs text-white/40 px-2">
                  <p>Payments are processed securely through Apple Pay. Your card information is never stored on our servers.</p>
                </div>
              </div>
            </div>

            {/* Subscription Overview */}
            <div className="backdrop-blur-xl rounded-3xl border p-6 bg-white/5 border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-green-400" />
                <h2 className="text-lg text-white">
                  Subscription Overview
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-2xl text-white mb-1">{totalUsers}</div>
                  <div className="text-sm text-white/50">Total Subscribers</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-2xl text-purple-400 mb-1">
                    {(overviewData as any)?.premiumUsers || 0}
                  </div>
                  <div className="text-sm text-white/50">Premium Users</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-2xl text-green-400 mb-1">${totalRevenue.toFixed(2)}</div>
                  <div className="text-sm text-white/50">Total Revenue</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="rounded-2xl border bg-white/5 border-white/10 p-12 text-center">
            <div className="text-white/50">
              Analytics features coming soon
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h3 className="text-lg text-white mb-4">
              System Settings
            </h3>

            <AdminReportModelSettings />
          </div>
        )}
      </div>
    </div>
  );
}
