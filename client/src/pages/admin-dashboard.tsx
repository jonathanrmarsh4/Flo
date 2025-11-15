import { useState } from 'react';
import { useLocation } from 'wouter';
import { 
  Users, DollarSign, Activity, TrendingUp, Search, Filter,
  Settings, BarChart3, Zap, Database, AlertCircle, CheckCircle, XCircle,
  Mail, Phone, Calendar, CreditCard, Eye, Ban, UserCheck, Shield,
  FileText, Bell, Server, Link, Wifi,
  ChevronDown, X
} from 'lucide-react';

const MOCK_USERS = [
  {
    id: 'U001',
    name: 'Sarah Johnson',
    email: 'sarah.j@email.com',
    phone: '+1 (555) 123-4567',
    joined: '2024-01-15',
    lastActive: '2025-11-13',
    subscription: 'Premium',
    status: 'active',
    role: 'user',
    biomarkers: 47,
    aiQueries: 156,
    revenue: 299.88
  },
  {
    id: 'U002',
    name: 'Michael Chen',
    email: 'mchen@email.com',
    phone: '+1 (555) 234-5678',
    joined: '2024-03-22',
    lastActive: '2025-11-12',
    subscription: 'Basic',
    status: 'active',
    role: 'user',
    biomarkers: 23,
    aiQueries: 67,
    revenue: 119.88
  },
  {
    id: 'U003',
    name: 'Emily Rodriguez',
    email: 'emily.r@email.com',
    phone: '+1 (555) 345-6789',
    joined: '2024-06-10',
    lastActive: '2025-10-28',
    subscription: 'Free',
    status: 'inactive',
    role: 'user',
    biomarkers: 8,
    aiQueries: 12,
    revenue: 0
  },
  {
    id: 'U004',
    name: 'David Park',
    email: 'dpark@email.com',
    phone: '+1 (555) 456-7890',
    joined: '2024-08-05',
    lastActive: '2025-11-13',
    subscription: 'Premium',
    status: 'active',
    role: 'admin',
    biomarkers: 62,
    aiQueries: 234,
    revenue: 299.88
  },
  {
    id: 'U005',
    name: 'Lisa Thompson',
    email: 'lisa.t@email.com',
    phone: '+1 (555) 567-8901',
    joined: '2024-09-18',
    lastActive: '2025-11-11',
    subscription: 'Basic',
    status: 'suspended',
    role: 'user',
    biomarkers: 15,
    aiQueries: 34,
    revenue: 119.88
  },
];

const API_USAGE_DATA = [
  { date: '2025-11-13', queries: 1247, cost: 124.70, model: 'GPT-4', avgLatency: 1.2 },
  { date: '2025-11-12', queries: 1189, cost: 118.90, model: 'GPT-4', avgLatency: 1.3 },
  { date: '2025-11-11', queries: 1034, cost: 103.40, model: 'GPT-4', avgLatency: 1.1 },
  { date: '2025-11-10', queries: 876, cost: 87.60, model: 'GPT-4', avgLatency: 1.4 },
  { date: '2025-11-09', queries: 1312, cost: 131.20, model: 'GPT-4', avgLatency: 1.2 },
  { date: '2025-11-08', queries: 1456, cost: 145.60, model: 'GPT-4', avgLatency: 1.1 },
  { date: '2025-11-07', queries: 1523, cost: 152.30, model: 'GPT-4', avgLatency: 1.3 },
];

const SYSTEM_LOGS = [
  { time: '2025-11-13 14:32:15', event: 'User Registration', user: 'john.doe@email.com', status: 'success' },
  { time: '2025-11-13 14:28:42', event: 'Payment Processed', user: 'sarah.j@email.com', status: 'success' },
  { time: '2025-11-13 14:15:33', event: 'API Rate Limit', user: 'system', status: 'warning' },
  { time: '2025-11-13 13:57:21', event: 'Failed Login Attempt', user: 'unknown@email.com', status: 'error' },
  { time: '2025-11-13 13:42:18', event: 'Subscription Upgrade', user: 'mchen@email.com', status: 'success' },
  { time: '2025-11-13 13:28:55', event: 'Data Export', user: 'admin@flo.com', status: 'success' },
];

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'billing' | 'api' | 'analytics' | 'settings' | 'logs'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all');
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_USERS[0] | null>(null);

  const isDark = true;

  const totalUsers = MOCK_USERS.length;
  const activeUsers = MOCK_USERS.filter(u => u.status === 'active').length;
  const totalRevenue = MOCK_USERS.reduce((sum, u) => sum + u.revenue, 0);
  const totalApiCost = API_USAGE_DATA.reduce((sum, d) => sum + d.cost, 0);
  const totalApiQueries = API_USAGE_DATA.reduce((sum, d) => sum + d.queries, 0);
  const avgQueryCost = totalApiQueries > 0 ? totalApiCost / totalApiQueries : 0;

  const filteredUsers = MOCK_USERS.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === 'all' || user.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });

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
      {/* Header */}
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

        {/* Tab Navigation */}
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

      {/* Content */}
      <div className="h-[calc(100vh-140px)] overflow-y-auto px-4 sm:px-6 py-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="metric-total-users">
                <div className="flex items-center justify-between mb-4">
                  <Users className="w-8 h-8 text-cyan-400" />
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                    +12% this month
                  </span>
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
                  <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                    +15% MoM
                  </span>
                </div>
                <div className="text-3xl mb-1 text-white">
                  ${totalRevenue.toFixed(2)}
                </div>
                <div className="text-sm text-white/50">
                  Total Revenue
                </div>
                <div className="text-xs mt-2 text-white/40">
                  $35,890 projected Nov
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
                  {totalApiQueries.toLocaleString()}
                </div>
                <div className="text-sm text-white/50">
                  API Queries
                </div>
                <div className="text-xs mt-2 text-white/40">
                  ${avgQueryCost.toFixed(4)} avg cost
                </div>
              </div>

              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="metric-api-cost">
                <div className="flex items-center justify-between mb-4">
                  <Activity className="w-8 h-8 text-blue-400" />
                  <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400">
                    -$18.50
                  </span>
                </div>
                <div className="text-3xl mb-1 text-white">
                  ${totalApiCost.toFixed(2)}
                </div>
                <div className="text-sm text-white/50">
                  AI API Costs
                </div>
                <div className="text-xs mt-2 text-white/40">
                  Last 7 days
                </div>
              </div>
            </div>

            {/* System Integrations & Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* System Integrations */}
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
                        <span className="text-sm text-white">
                          PostgreSQL Database
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Connected</span>
                      </div>
                    </div>
                    <div className="text-xs text-white/50">
                      Last checked: 2 min ago • Response: 45ms
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-white">
                          OpenAI API (GPT-4)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Active</span>
                      </div>
                    </div>
                    <div className="text-xs text-white/50">
                      Last query: 5 sec ago • Avg latency: 1.2s
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-white">
                          Stripe Payments
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Operational</span>
                      </div>
                    </div>
                    <div className="text-xs text-white/50">
                      Webhook verified • Last payment: 3 min ago
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border bg-white/5 border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-white">
                          Auth Service
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-500">Healthy</span>
                      </div>
                    </div>
                    <div className="text-xs text-white/50">
                      Last login: 1 min ago • {activeUsers} active sessions
                    </div>
                  </div>
                </div>
              </div>

              {/* System Health */}
              <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="panel-system-health">
                <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                  <Server className="w-5 h-5" />
                  System Health
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">
                      API Uptime
                    </span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">
                        99.98%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">
                      Database Status
                    </span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">
                        Healthy
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">
                      Avg Response Time
                    </span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">
                        124ms
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">
                      Error Rate
                    </span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">
                        0.02%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">
                      Storage Used
                    </span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">
                        2.4 GB / 10 GB
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">
                      Active Connections
                    </span>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-white">
                        {activeUsers} / 100
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-2xl p-6 border bg-white/5 border-white/10" data-testid="panel-recent-activity">
              <h3 className="text-lg mb-4 flex items-center gap-2 text-white">
                <Bell className="w-5 h-5" />
                Recent Activity
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SYSTEM_LOGS.map((log, i) => (
                  <div key={i} className="flex items-start gap-3" data-testid={`activity-log-${i}`}>
                    {log.status === 'success' && <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />}
                    {log.status === 'warning' && <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5" />}
                    {log.status === 'error' && <XCircle className="w-4 h-4 text-red-500 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">
                        {log.event}
                      </div>
                      <div className="text-xs text-white/50 truncate">
                        {log.user} • {log.time.split(' ')[1]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Search and Filters */}
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
                {(['all', 'active', 'inactive', 'suspended'] as const).map((filter) => (
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

            {/* Users Table */}
            <div className="rounded-2xl border overflow-hidden bg-white/5 border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-white/10">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">User</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70 hidden md:table-cell">Contact</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">Subscription</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70 hidden lg:table-cell">Role</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">Status</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70 hidden xl:table-cell">Activity</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70 hidden xl:table-cell">Revenue</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs text-white/70">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-white/5" data-testid={`user-row-${user.id}`}>
                        <td className="px-4 sm:px-6 py-4">
                          <div>
                            <div className="text-sm text-white">{user.name}</div>
                            <div className="text-xs text-white/50 truncate max-w-[150px]">{user.email}</div>
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                          <div className="text-xs text-white/70">{user.phone}</div>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            user.subscription === 'Premium' ? 'bg-purple-500/20 text-purple-400' :
                            user.subscription === 'Basic' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {user.subscription}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 hidden lg:table-cell">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            user.role === 'admin' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/10 text-white/70'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            user.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            user.status === 'suspended' ? 'bg-red-500/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 hidden xl:table-cell">
                          <div className="text-xs text-white/70">{user.biomarkers} biomarkers</div>
                          <div className="text-xs text-white/50">{user.aiQueries} AI queries</div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 hidden xl:table-cell">
                          <div className="text-sm text-white">${user.revenue.toFixed(2)}</div>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="p-2 rounded-lg hover:bg-white/10 text-cyan-400"
                            data-testid={`button-view-user-${user.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-sm text-white/50" data-testid="text-user-count">
              Showing {filteredUsers.length} of {MOCK_USERS.length} users
            </div>
          </div>
        )}

        {/* Other Tabs - Placeholder */}
        {(activeTab === 'billing' || activeTab === 'api' || activeTab === 'analytics' || activeTab === 'logs' || activeTab === 'settings') && (
          <div className="rounded-2xl p-12 border bg-white/5 border-white/10 text-center">
            <div className="text-white/50 text-lg mb-2">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Tab
            </div>
            <div className="text-white/30 text-sm">
              Coming soon...
            </div>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="modal-user-details">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedUser(null)}
          />
          <div className="relative w-full max-w-2xl rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UserCheck className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-lg text-white">
                    User Details
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 rounded-xl transition-colors hover:bg-white/10 text-white/70"
                  data-testid="button-close-modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-white/50 mb-1">Name</div>
                    <div className="text-sm text-white">{selectedUser.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">User ID</div>
                    <div className="text-sm text-white">{selectedUser.id}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Email</div>
                    <div className="text-sm text-white">{selectedUser.email}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Phone</div>
                    <div className="text-sm text-white">{selectedUser.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Joined</div>
                    <div className="text-sm text-white">{selectedUser.joined}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Last Active</div>
                    <div className="text-sm text-white">{selectedUser.lastActive}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Subscription</div>
                    <div className="text-sm text-white">{selectedUser.subscription}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Status</div>
                    <div className="text-sm text-white capitalize">{selectedUser.status}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Role</div>
                    <div className="text-sm text-white capitalize">{selectedUser.role}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Biomarkers Uploaded</div>
                    <div className="text-sm text-white">{selectedUser.biomarkers}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">AI Queries</div>
                    <div className="text-sm text-white">{selectedUser.aiQueries}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Total Revenue</div>
                    <div className="text-sm text-white">${selectedUser.revenue.toFixed(2)}</div>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/10 flex gap-3">
                  <button className="flex-1 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm transition-colors">
                    Edit User
                  </button>
                  <button className="flex-1 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm transition-colors">
                    Suspend User
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
