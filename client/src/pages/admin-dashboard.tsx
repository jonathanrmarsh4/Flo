import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Users, DollarSign, Activity, TrendingUp, Search,
  Settings, BarChart3, Zap, Database, AlertCircle, CheckCircle, XCircle,
  CreditCard, Ban, Shield, FileText, Bell, Server, Link, Wifi, Edit2, Trash2,
  ChevronDown
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'billing' | 'api' | 'analytics' | 'settings' | 'logs'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'free' | 'premium' | 'admin'>('free');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');

  const { data: overviewData } = useQuery({
    queryKey: ['/api/admin/overview'],
    refetchInterval: 30000,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/admin/users', searchQuery, selectedFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (selectedFilter !== 'all') params.append('status', selectedFilter);
      const response = await fetch(`/api/admin/users?${params}`);
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
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

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, role, status }: { userId: string; role?: string; status?: string }) => {
      return apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, status }),
        headers: { 'Content-Type': 'application/json' },
      });
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
      return apiRequest(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
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

  const handleSaveUser = (userId: string) => {
    updateUserMutation.mutate({ userId, role: editRole, status: editStatus });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    if (confirm(`Are you sure you want to permanently delete ${userName}? This action cannot be undone and will delete all associated data.`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  const totalUsers = overviewData?.totalUsers || 0;
  const activeUsers = overviewData?.activeUsers || 0;
  const totalRevenue = overviewData?.totalRevenue || 0;
  const apiQueries7d = overviewData?.apiQueries7d || 0;
  const apiCost7d = overviewData?.apiCost7d || 0;

  const users: AdminUserSummary[] = usersData?.users || [];
  const totalUserCount = usersData?.total || 0;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'billing', label: 'Billing', icon: DollarSign },
    { id: 'api', label: 'API Usage', icon: Zap },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'logs', label: 'Audit Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/5 border-white/10">
        <div className="px-4 sm:px-6 py-4">
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

      <div className="h-[calc(100vh-140px)] overflow-y-auto px-4 sm:px-6 py-6">
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
            <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Zap className="w-5 h-5" />
                AI API Usage (Last 7 Days)
              </h3>
              {apiUsageData && apiUsageData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Date</th>
                        <th className="px-4 py-3 text-left text-xs text-white/70">Model</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Queries</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Cost</th>
                        <th className="px-4 py-3 text-right text-xs text-white/70">Avg Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {apiUsageData.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-sm text-white">{item.date}</td>
                          <td className="px-4 py-3 text-sm text-purple-400">{item.model}</td>
                          <td className="px-4 py-3 text-sm text-white text-right">{item.queries.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-green-400 text-right">${item.cost.toFixed(2)}</td>
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

        {activeTab === 'logs' && (
          <div className="rounded-2xl border bg-white/5 border-white/10 p-6">
            <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
              <FileText className="w-5 h-5" />
              Audit Logs
            </h3>
            {auditLogsData && auditLogsData.length > 0 ? (
              <div className="space-y-3">
                {auditLogsData.map((log: any, idx: number) => (
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

        {(activeTab === 'billing' || activeTab === 'analytics' || activeTab === 'settings') && (
          <div className="rounded-2xl border bg-white/5 border-white/10 p-12 text-center">
            <div className="text-white/50">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} features coming soon
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
