import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminGlassPanel } from "./AdminGlassPanel";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Skeleton } from "./ui/skeleton";
import { Search, ChevronLeft, ChevronRight, Crown, Activity, Calendar, AlertCircle, Users as UsersIcon, Clock, Check, X } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AdminUserSummary } from "@shared/schema";

interface UsersResponse {
  users: AdminUserSummary[];
  total: number;
}

export function AdminUsersTab() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (roleFilter !== 'all') params.append('role', roleFilter);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    params.append('limit', limit.toString());
    params.append('offset', (page * limit).toString());
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  };

  const { data, isLoading, error, refetch } = useQuery<UsersResponse>({
    queryKey: ['/api/admin/users', search, roleFilter, statusFilter, page],
    queryFn: async () => {
      return await apiRequest('GET', `/api/admin/users${buildQueryString()}`) as any;
    },
    staleTime: 2 * 60 * 1000,
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, role, status }: { userId: string; role?: string; status?: string }) => {
      return await apiRequest('PATCH', '/api/admin/users/' + userId, { role, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/admin/users');
        },
      });
    },
  });

  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('POST', `/api/admin/users/${userId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/admin/users');
        },
      });
    },
  });

  const rejectUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('POST', `/api/admin/users/${userId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/admin/users');
        },
      });
    },
  });

  const handleRoleChange = (userId: string, role: string) => {
    updateUserMutation.mutate({ userId, role });
  };

  const handleStatusChange = (userId: string, status: string) => {
    updateUserMutation.mutate({ userId, status });
  };

  const handleApprove = (userId: string) => {
    approveUserMutation.mutate(userId);
  };

  const handleReject = (userId: string) => {
    rejectUserMutation.mutate(userId);
  };

  const pendingCount = data?.users.filter(u => u.status === 'pending_approval').length || 0;

  const totalPages = Math.ceil((data?.total || 0) / limit);

  return (
    <AdminGlassPanel>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">User Management</h3>
        
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
            <Input
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/50"
              data-testid="input-search-users"
            />
          </div>
          <Select value={roleFilter} onValueChange={(value) => { setRoleFilter(value); setPage(0); }}>
            <SelectTrigger className="w-full md:w-40 bg-white/5 border-white/10 text-white" data-testid="select-role-filter">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="apple_test">Apple Test</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(0); }}>
            <SelectTrigger className="w-full md:w-48 bg-white/5 border-white/10 text-white" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Alert className="mb-6 bg-red-500/10 border-red-500/50" data-testid="alert-error">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-white/90">
            Failed to load users. <button onClick={() => refetch()} className="text-red-400 hover:text-red-300 underline" data-testid="button-retry">Try again</button>
          </AlertDescription>
        </Alert>
      )}

      {/* Skeleton Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border border-white/10 rounded-lg" data-testid={`skeleton-row-${i}`}>
              <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3 bg-white/10" />
                <Skeleton className="h-3 w-1/4 bg-white/10" />
              </div>
              <Skeleton className="h-6 w-20 bg-white/10" />
              <Skeleton className="h-6 w-20 bg-white/10" />
            </div>
          ))}
        </div>
      ) : !data || data.users.length === 0 ? (
        <div className="text-center py-12 space-y-4" data-testid="empty-state">
          <UsersIcon className="w-12 h-12 mx-auto text-white/30" />
          <div className="text-white/70">
            <p className="text-lg font-medium mb-2">No users found</p>
            <p className="text-sm text-white/50">
              {search || roleFilter !== 'all' || statusFilter !== 'all' 
                ? 'Try adjusting your filters' 
                : 'No users have registered yet'}
            </p>
          </div>
          {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setRoleFilter('all');
                setStatusFilter('all');
                setPage(0);
              }}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              data-testid="button-clear-filters"
            >
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-white/70">Name</TableHead>
                  <TableHead className="text-white/70">Email</TableHead>
                  <TableHead className="text-white/70">Plan</TableHead>
                  <TableHead className="text-white/70">Activity</TableHead>
                  <TableHead className="text-white/70">Role</TableHead>
                  <TableHead className="text-white/70">Status</TableHead>
                  <TableHead className="text-white/70">Joined</TableHead>
                  <TableHead className="text-white/70">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.users.map((user) => (
                  <TableRow key={user.id} className="border-white/10 hover:bg-white/5" data-testid={`user-row-${user.id}`}>
                    <TableCell className="text-white">
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}` 
                        : user.email.split('@')[0]
                      }
                    </TableCell>
                    <TableCell className="text-white/70 text-sm">{user.email}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={user.subscriptionStatus === 'premium' ? 'default' : 'secondary'} 
                        className={user.subscriptionStatus === 'premium' ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white' : ''}
                        data-testid={`badge-plan-${user.id}`}
                      >
                        {user.subscriptionStatus === 'premium' ? (
                          <><Crown className="w-3 h-3 mr-1 inline" />Premium</>
                        ) : (
                          'Free'
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs text-white/70">
                          <Activity className="w-3 h-3" />
                          <span>{user.measurementCount} tests</span>
                        </div>
                        {user.lastUpload && (
                          <div className="flex items-center gap-1.5 text-xs text-white/50">
                            <Calendar className="w-3 h-3" />
                            <span>Last: {new Date(user.lastUpload).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={user.role} 
                        onValueChange={(value) => handleRoleChange(user.id, value)}
                        disabled={updateUserMutation.isPending}
                      >
                        <SelectTrigger className="w-32 h-8 bg-white/5 border-white/10 text-white text-xs" data-testid={`select-role-${user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="apple_test">Apple Test</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {user.status === 'pending_approval' ? (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <Clock className="w-3 h-3 mr-1" />
                          Pending
                        </Badge>
                      ) : (
                        <Select 
                          value={user.status} 
                          onValueChange={(value) => handleStatusChange(user.id, value)}
                          disabled={updateUserMutation.isPending}
                        >
                          <SelectTrigger className="w-32 h-8 bg-white/5 border-white/10 text-white text-xs" data-testid={`select-status-${user.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-white/70 text-sm">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {user.status === 'pending_approval' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleApprove(user.id)}
                            disabled={approveUserMutation.isPending || rejectUserMutation.isPending}
                            className="h-8 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                            data-testid={`button-approve-${user.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleReject(user.id)}
                            disabled={approveUserMutation.isPending || rejectUserMutation.isPending}
                            className="h-8 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-400"
                            data-testid={`button-reject-${user.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-white/40 text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-white/10">
            <div className="text-sm text-white/70">
              Showing {page * limit + 1}-{Math.min((page + 1) * limit, data?.total || 0)} of {data?.total || 0} users
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-white/70">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                data-testid="button-next-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </AdminGlassPanel>
  );
}
