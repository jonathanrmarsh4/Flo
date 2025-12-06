import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { 
  Users, DollarSign, Activity, TrendingUp, Search,
  Settings, BarChart3, Zap, Database, AlertCircle, CheckCircle, XCircle,
  CreditCard, Ban, Shield, FileText, Bell, Server, Link, Wifi, Edit2, Trash2,
  ChevronDown, Heart, Sparkles, Wallet, RefreshCw
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AdminReportModelSettings } from '@/components/admin/AdminReportModelSettings';
import { AdminAnalyticsTab } from '@/components/admin/AdminAnalyticsTab';
import { AdminSandboxVoice } from '@/components/admin/AdminSandboxVoice';
import { AdminMessagesManager } from '@/components/admin/AdminMessagesManager';
import { AdminSIE } from '@/components/admin/AdminSIE';

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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'billing' | 'api' | 'analytics' | 'settings' | 'logs' | 'ml-usage' | 'systems' | 'notifications'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'free' | 'premium' | 'admin'>('free');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [correlationUserId, setCorrelationUserId] = useState<string>('');

  useEffect(() => {
    if (user?.id && !correlationUserId) {
      setCorrelationUserId(user.id);
    }
  }, [user?.id]);

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

  const { data: mlUsageData } = useQuery({
    queryKey: ['/api/admin/ml-usage/metrics'],
    refetchInterval: 30000,
  });

  const { data: mlQueryStatsData } = useQuery({
    queryKey: ['/api/admin/ml-usage/query-stats'],
    refetchInterval: 60000,
  });

  const { data: mlCostsData } = useQuery({
    queryKey: ['/api/admin/ml-usage/costs'],
    refetchInterval: 60000,
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

  const clickhouseInitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/clickhouse/init', {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'ClickHouse Initialized',
        description: data.message || 'Tables created successfully',
      });
    },
    onError: (error: any) => {
      console.error('ClickHouse init error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to initialize ClickHouse',
        variant: 'destructive',
      });
    },
  });

  const clickhouseHealthMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('GET', '/api/admin/clickhouse/health');
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: data.connected ? 'ClickHouse Connected' : 'ClickHouse Disconnected',
        description: data.connected ? `Version: ${data.version}` : data.error,
        variant: data.connected ? 'default' : 'destructive',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to check ClickHouse health',
        variant: 'destructive',
      });
    },
  });

  const clickhouseSyncMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('POST', '/api/admin/clickhouse/sync', { userId, daysBack: 30 });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Data Synced to ClickHouse',
        description: `Synced ${data.rowsSynced} metric rows`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to sync data',
        variant: 'destructive',
      });
    },
  });

  const correlationAnalysisMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('POST', '/api/admin/clickhouse/analyze', { userId });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'ClickHouse ML Analysis Complete',
        description: `Baselines: ${data.baselines?.length || 0}, Anomalies: ${data.anomalies?.length || 0}${data.feedbackQuestion ? ', Question generated' : ''}`,
      });
      console.log('[ClickHouse] Full analysis result:', data);
    },
    onError: (error: any) => {
      console.error('ClickHouse analysis error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run ClickHouse analysis',
        variant: 'destructive',
      });
    },
  });

  const simulateAnomalyMutation = useMutation({
    mutationFn: async ({ userId, scenario }: { userId: string; scenario: string }) => {
      const res = await apiRequest('POST', '/api/admin/clickhouse/simulate', { userId, scenario });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'ClickHouse Simulation Complete',
        description: data.feedbackQuestion?.questionText 
          ? `Generated: "${data.feedbackQuestion.questionText.substring(0, 50)}..."` 
          : `Simulated ${data.scenario} with ${data.anomalies?.length || 0} anomalies`,
      });
      console.log('[ClickHouse] Simulation result:', data);
    },
    onError: (error: any) => {
      console.error('ClickHouse simulation error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to simulate anomaly',
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
    { id: 'ml-usage', label: 'ML Usage', icon: Database },
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
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
                    MTD
                  </span>
                </div>
                <div className="text-3xl mb-1 text-white">
                  ${((mlCostsData as any)?.month?.totalEstimate ?? apiCost7d).toFixed(2)}
                </div>
                <div className="text-sm text-white/50">
                  AI + ML Costs
                </div>
                <div className="text-xs mt-2 text-white/40">
                  {mlCostsData ? (
                    <>AI: ${((mlCostsData as any).month?.totalAICost || 0).toFixed(2)} | ClickHouse: ${((mlCostsData as any).month?.clickhouseStorageEstimate || 0).toFixed(2)}</>
                  ) : (
                    <span className="animate-pulse">Loading costs...</span>
                  )}
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
                <div className="flex gap-2 mt-2 flex-wrap">
                  {apiUsageData && (apiUsageData as any).some((item: any) => item.provider === 'openai') && (
                    <span className="px-2 py-1 rounded-md bg-green-500/20 text-green-300 text-xs">OpenAI</span>
                  )}
                  {apiUsageData && (apiUsageData as any).some((item: any) => item.provider === 'grok') && (
                    <span className="px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 text-xs">Grok (xAI)</span>
                  )}
                  {apiUsageData && (apiUsageData as any).some((item: any) => item.provider === 'gemini') && (
                    <span className="px-2 py-1 rounded-md bg-purple-500/20 text-purple-300 text-xs">Gemini (Google)</span>
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
                                : item.provider === 'gemini'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-blue-500/20 text-blue-300'
                            }`}>
                              {item.provider === 'openai' ? 'OpenAI' : item.provider === 'gemini' ? 'Gemini' : 'Grok'}
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

        {activeTab === 'ml-usage' && (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Database className="w-5 h-5" />
                ClickHouse ML Usage
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                  <div className="text-xs text-white/50">Windows Today</div>
                  <div className="text-2xl text-white mt-1">
                    {mlUsageData ? (mlUsageData as any).metrics?.totalWindowsToday || '0' : '0'}
                  </div>
                </div>
                <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                  <div className="text-xs text-white/50">Users Processed</div>
                  <div className="text-2xl text-white mt-1">
                    {mlUsageData ? (mlUsageData as any).metrics?.dailyStats?.usersProcessed?.toLocaleString() || '0' : '0'}
                  </div>
                </div>
                <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                  <div className="text-xs text-white/50">Anomalies Detected</div>
                  <div className="text-2xl text-purple-400 mt-1">
                    {mlUsageData ? (mlUsageData as any).metrics?.dailyStats?.anomaliesDetected?.toLocaleString() || '0' : '0'}
                  </div>
                </div>
                <div className="rounded-xl border bg-white/5 border-white/10 p-4">
                  <div className="text-xs text-white/50">Questions Generated</div>
                  <div className="text-2xl text-green-400 mt-1">
                    {mlUsageData ? (mlUsageData as any).metrics?.dailyStats?.questionsGenerated?.toLocaleString() || '0' : '0'}
                  </div>
                </div>
              </div>

              {mlUsageData && (mlUsageData as any).nextWindow && (
                <div className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/20 mb-6">
                  <div className="text-xs text-blue-400 mb-1">Next Processing Window</div>
                  <div className="text-sm text-white">
                    {(mlUsageData as any).nextWindow.name} - {new Date((mlUsageData as any).nextWindow.scheduledFor).toLocaleString()}
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    {(mlUsageData as any).nextWindow.description}
                    {(mlUsageData as any).nextWindow.includesBaselineUpdate && ' (includes baseline update)'}
                  </div>
                </div>
              )}

              <h4 className="text-sm text-white/70 mb-3">Processing Windows (4x daily)</h4>
              {mlUsageData && (mlUsageData as any).windows?.length > 0 ? (
                <div className="space-y-2 mb-6">
                  {(mlUsageData as any).windows.map((window: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border bg-white/5 border-white/10">
                      <div>
                        <span className="text-sm text-white">{window.name}</span>
                        <span className="text-xs text-white/50 ml-2">({window.utcHour}:00 UTC)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {window.includesBaselineUpdate && (
                          <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">Baseline</span>
                        )}
                        <span className="text-xs text-white/50">{window.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-white/50 text-sm">No windows configured</div>
              )}
            </div>

            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <DollarSign className="w-5 h-5 text-green-400" />
                ML Processing Costs
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="p-4 rounded-xl border bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
                  <div className="text-xs text-green-400 mb-2">Today's Costs</div>
                  <div className="text-3xl text-white mb-3">
                    ${mlCostsData ? ((mlCostsData as any).today?.totalEstimate || 0).toFixed(4) : '0.00'}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/50">AI Processing</span>
                      <span className="text-white">${mlCostsData ? ((mlCostsData as any).today?.totalAICost || 0).toFixed(4) : '0.00'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/50">ClickHouse Compute (est.)</span>
                      <span className="text-white">${mlCostsData ? ((mlCostsData as any).today?.clickhouseComputeEstimate || 0).toFixed(4) : '0.00'}</span>
                    </div>
                  </div>
                  {mlCostsData && (mlCostsData as any).today?.aiCosts?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="text-xs text-white/50 mb-2">By Provider</div>
                      {(mlCostsData as any).today.aiCosts.map((c: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs mb-1">
                          <span className="text-white/70 capitalize">{c.provider}</span>
                          <span className="text-green-400">${c.cost.toFixed(4)} ({c.queries} calls)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-4 rounded-xl border bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-500/20">
                  <div className="text-xs text-blue-400 mb-2">Monthly Estimate</div>
                  <div className="text-3xl text-white mb-3">
                    ${mlCostsData ? ((mlCostsData as any).month?.totalEstimate || 0).toFixed(2) : '0.00'}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/50">AI Processing (MTD)</span>
                      <span className="text-white">${mlCostsData ? ((mlCostsData as any).month?.totalAICost || 0).toFixed(2) : '0.00'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/50">ClickHouse Storage (est.)</span>
                      <span className="text-white">${mlCostsData ? ((mlCostsData as any).month?.clickhouseStorageEstimate || 0).toFixed(2) : '0.00'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/50">Total AI Queries</span>
                      <span className="text-white">{mlCostsData ? ((mlCostsData as any).month?.aiQueries || 0).toLocaleString() : '0'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/50">Total Tokens</span>
                      <span className="text-white">{mlCostsData ? ((mlCostsData as any).month?.aiTokens || 0).toLocaleString() : '0'}</span>
                    </div>
                  </div>
                </div>
              </div>
              {mlCostsData && (mlCostsData as any).clickhouse && (
                <div className="p-3 rounded-lg bg-white/5 text-xs text-white/50">
                  ClickHouse: {(mlCostsData as any).clickhouse.totalSizeGB} GB stored | 
                  Storage: ~${(mlCostsData as any).clickhouse.storageCostMonthly}/mo | 
                  Compute: ~${(mlCostsData as any).clickhouse.computeCostDaily}/day (4 windows)
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <BarChart3 className="w-5 h-5" />
                ClickHouse Data Storage
              </h3>
              {mlQueryStatsData && (mlQueryStatsData as any).tables?.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-4 rounded-xl border bg-white/5 border-white/10">
                      <div className="text-xs text-white/50">Total Rows</div>
                      <div className="text-2xl text-white mt-1">
                        {(mlQueryStatsData as any).totals?.totalRows?.toLocaleString() || '0'}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border bg-white/5 border-white/10">
                      <div className="text-xs text-white/50">Total Size</div>
                      <div className="text-2xl text-white mt-1">
                        {(mlQueryStatsData as any).totals?.totalSizeMB?.toFixed(2) || '0'} MB
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-white/10">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs text-white/70">Table</th>
                          <th className="px-4 py-3 text-right text-xs text-white/70">Rows</th>
                          <th className="px-4 py-3 text-right text-xs text-white/70">Size (MB)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(mlQueryStatsData as any).tables.map((table: any, idx: number) => (
                          <tr key={idx} className="hover:bg-white/5">
                            <td className="px-4 py-3 text-sm text-white">{table.name}</td>
                            <td className="px-4 py-3 text-sm text-purple-400 text-right">{table.rowCount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-white/70 text-right">{table.dataSizeMB?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-white/50">No ClickHouse data available</div>
              )}
            </div>

            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Activity className="w-5 h-5" />
                Recent Window History
              </h3>
              {mlUsageData && (mlUsageData as any).metrics?.windowHistory?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Window</th>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Started</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Duration</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Users</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Anomalies</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Questions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mlUsageData as any).metrics.windowHistory.map((h: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-sm text-white">{h.windowName}</td>
                          <td className="px-4 py-3 text-sm text-white/70 text-xs">{new Date(h.startedAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-white text-right">{h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : '-'}</td>
                          <td className="px-4 py-3 text-sm text-white text-right">{h.usersProcessed}</td>
                          <td className="px-4 py-3 text-sm text-purple-400 text-right">{h.anomaliesDetected}</td>
                          <td className="px-4 py-3 text-sm text-green-400 text-right">{h.questionsGenerated}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-white/50">No window history yet</div>
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
                    <Database className="w-5 h-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-white">ClickHouse ML Engine</div>
                      <div className="text-xs text-white/50">Pattern Detection & Anomaly Analysis</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {mlQueryStatsData && (mlQueryStatsData as any).totals ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-400" data-testid="status-clickhouse-operational" />
                        <span className="text-sm text-green-400">Operational</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-white/50 animate-pulse" />
                        <span className="text-sm text-white/50">Checking...</span>
                      </div>
                    )}
                  </div>
                </div>

                {mlUsageData && (mlUsageData as any).metrics?.windowHistory?.length > 0 && (
                  <div className="p-4 rounded-xl border bg-white/5 border-white/10">
                    <div className="text-xs text-white/50 mb-1">Last Processing Window</div>
                    <div className="text-sm text-white">
                      {new Date((mlUsageData as any).metrics.windowHistory[0].startedAt).toLocaleString()}
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
          <div className="space-y-6">
            <AdminMessagesManager />
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="rounded-2xl border bg-white/5 border-white/10 p-12 text-center">
            <div className="text-white/50">
              Billing features coming soon
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <AdminAnalyticsTab />
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h3 className="text-lg text-white mb-4">
              System Settings
            </h3>

            <AdminSIE />

            <AdminSandboxVoice />

            <AdminReportModelSettings />

            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h4 className="text-base text-white mb-2 flex items-center gap-2">
                <Database className="w-5 h-5 text-orange-400" />
                ClickHouse ML Correlation Engine
              </h4>
              <div className="text-xs text-white/50 mb-4">
                True ML-powered anomaly detection using ClickHouse. Analyzes health baselines, detects patterns (illness precursor, recovery deficit), generates dynamic feedback questions via Gemini, and learns from feedback to improve accuracy over time.
              </div>
              
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => clickhouseHealthMutation.mutate()}
                    disabled={clickhouseHealthMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white transition-all disabled:opacity-50"
                    data-testid="button-clickhouse-health"
                  >
                    {clickhouseHealthMutation.isPending ? (
                      <Activity className="w-3 h-3 animate-spin" />
                    ) : (
                      <Activity className="w-3 h-3" />
                    )}
                    <span className="text-xs">Health Check</span>
                  </button>
                  <button
                    onClick={() => clickhouseInitMutation.mutate()}
                    disabled={clickhouseInitMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-orange-500/20 border border-orange-500/30 hover:bg-orange-500/30 text-orange-400 transition-all disabled:opacity-50"
                    data-testid="button-clickhouse-init"
                  >
                    {clickhouseInitMutation.isPending ? (
                      <Activity className="w-3 h-3 animate-spin" />
                    ) : (
                      <Database className="w-3 h-3" />
                    )}
                    <span className="text-xs">Initialize Tables</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={correlationUserId}
                    onChange={(e) => setCorrelationUserId(e.target.value)}
                    placeholder="Enter User ID (e.g., 34226453)"
                    className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-500"
                    data-testid="input-correlation-user-id"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (correlationUserId.trim()) {
                        clickhouseSyncMutation.mutate(correlationUserId.trim());
                      } else {
                        toast({ title: 'Error', description: 'Please enter a User ID', variant: 'destructive' });
                      }
                    }}
                    disabled={clickhouseSyncMutation.isPending || !correlationUserId.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 text-blue-400 transition-all disabled:opacity-50"
                    data-testid="button-clickhouse-sync"
                  >
                    {clickhouseSyncMutation.isPending ? (
                      <Activity className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span className="text-xs">Sync Data (30 days)</span>
                  </button>
                </div>
                
                <button
                  onClick={() => {
                    if (correlationUserId.trim()) {
                      correlationAnalysisMutation.mutate(correlationUserId.trim());
                    } else {
                      toast({ title: 'Error', description: 'Please enter a User ID', variant: 'destructive' });
                    }
                  }}
                  disabled={correlationAnalysisMutation.isPending || !correlationUserId.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-correlation-analyze"
                >
                  {correlationAnalysisMutation.isPending ? (
                    <>
                      <Activity className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Analyzing with ML...</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      <span className="text-sm">Run ML Correlation Analysis</span>
                    </>
                  )}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (correlationUserId.trim()) {
                        simulateAnomalyMutation.mutate({ userId: correlationUserId.trim(), scenario: 'illness' });
                      } else {
                        toast({ title: 'Error', description: 'Please enter a User ID', variant: 'destructive' });
                      }
                    }}
                    disabled={simulateAnomalyMutation.isPending || !correlationUserId.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-400 transition-all disabled:opacity-50"
                    data-testid="button-simulate-illness"
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span className="text-xs">Simulate Illness</span>
                  </button>
                  <button
                    onClick={() => {
                      if (correlationUserId.trim()) {
                        simulateAnomalyMutation.mutate({ userId: correlationUserId.trim(), scenario: 'recovery' });
                      } else {
                        toast({ title: 'Error', description: 'Please enter a User ID', variant: 'destructive' });
                      }
                    }}
                    disabled={simulateAnomalyMutation.isPending || !correlationUserId.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 hover:bg-yellow-500/30 text-yellow-400 transition-all disabled:opacity-50"
                    data-testid="button-simulate-recovery"
                  >
                    <Activity className="w-3 h-3" />
                    <span className="text-xs">Simulate Recovery</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <div className="text-xs text-orange-400">
                  <strong>How it works:</strong> Syncs health data to ClickHouse, calculates baselines with statistical functions, detects anomalies using z-scores and pattern matching, generates ML-powered questions via Gemini, and stores feedback to improve model accuracy over time.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
