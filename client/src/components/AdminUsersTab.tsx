import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminGlassPanel } from "./AdminGlassPanel";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "free" | "premium" | "admin";
  status: "active" | "suspended";
  createdAt: string;
}

interface UsersResponse {
  users: User[];
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

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: [`/api/admin/users${buildQueryString()}`],
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

  const handleRoleChange = (userId: string, role: string) => {
    updateUserMutation.mutate({ userId, role });
  };

  const handleStatusChange = (userId: string, status: string) => {
    updateUserMutation.mutate({ userId, status });
  };

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
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(0); }}>
            <SelectTrigger className="w-full md:w-40 bg-white/5 border-white/10 text-white" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      {isLoading ? (
        <div className="text-white/70 text-sm text-center py-8">Loading users...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-white/70">Name</TableHead>
                  <TableHead className="text-white/70">Email</TableHead>
                  <TableHead className="text-white/70">Role</TableHead>
                  <TableHead className="text-white/70">Status</TableHead>
                  <TableHead className="text-white/70">Joined</TableHead>
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
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-white/70 text-sm">
                      {new Date(user.createdAt).toLocaleDateString()}
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
