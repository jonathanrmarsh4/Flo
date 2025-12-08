import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Shield, User, Users, MapPin, Smartphone, Database, Link2, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User as UserType } from "@shared/schema";

interface UserProfileMetrics {
  datapoints: number;
  location: { city?: string; country?: string; latitude?: number; longitude?: number } | null;
  device: { name?: string; manufacturer?: string; model?: string } | null;
  integrations: string[];
}

function UserProfileModal({ userId, userName, isOpen, onClose }: { 
  userId: string; 
  userName: string;
  isOpen: boolean; 
  onClose: () => void;
}) {
  const { data: metrics, isLoading } = useQuery<UserProfileMetrics>({
    queryKey: ['/api/admin/users', userId, 'profile-metrics'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/profile-metrics`);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    enabled: isOpen,
  });

  const formatLocation = (loc: UserProfileMetrics['location']) => {
    if (!loc) return 'No location data';
    if (loc.city) return loc.city;
    if (loc.latitude && loc.longitude) {
      return `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`;
    }
    return 'Unknown';
  };

  const formatDevice = (dev: UserProfileMetrics['device']) => {
    if (!dev) return 'No device data';
    const parts = [dev.manufacturer, dev.model].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : dev.name || 'Unknown';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {userName}'s Profile Metrics
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : metrics ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Database className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <p className="font-medium">Datapoints</p>
                <p className="text-sm text-muted-foreground">
                  {metrics.datapoints.toLocaleString()} total data points
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-blue-500/20">
                <MapPin className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Location</p>
                <p className="text-sm text-muted-foreground">
                  {formatLocation(metrics.location)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-green-500/20">
                <Smartphone className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="font-medium">Device</p>
                <p className="text-sm text-muted-foreground">
                  {formatDevice(metrics.device)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-cyan-500/20">
                <Link2 className="w-4 h-4 text-cyan-500" />
              </div>
              <div>
                <p className="font-medium">Integrations</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {metrics.integrations.length > 0 ? (
                    metrics.integrations.map(int => (
                      <Badge key={int} variant="secondary" className="text-xs">
                        {int}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No integrations connected</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Failed to load metrics</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/users", searchQuery, roleFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      if (roleFilter && roleFilter !== "all") params.append("role", roleFilter);
      if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
      
      const response = await fetch(`/api/admin/users?${params}`);
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json() as Promise<{ users: UserType[]; total: number }>;
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { role?: string; status?: string } }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}`, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const updated = variables.data.role ? "role" : "status";
      toast({
        title: `User ${updated} updated`,
        description: `User ${updated} has been successfully updated`,
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "default";
      case "premium":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-cyan-500" />
          <h1 className="text-3xl font-semibold">User Management</h1>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-users"
            />
          </div>
          
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-role-filter">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-4 h-4 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-9 w-[120px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-9 w-[120px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-28 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : data?.users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="rounded-full bg-muted p-4">
                        <Users className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold">No users found</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          {searchQuery || roleFilter || statusFilter
                            ? "Try adjusting your search filters to find what you're looking for."
                            : "No users have been registered yet. Users will appear here once they sign up."}
                        </p>
                      </div>
                      {(searchQuery || roleFilter || statusFilter) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchQuery("");
                            setRoleFilter("");
                            setStatusFilter("");
                          }}
                          data-testid="button-clear-filters"
                        >
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.users.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>{user.firstName} {user.lastName}</span>
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(role) =>
                          updateUserMutation.mutate({ userId: user.id, data: { role } })
                        }
                        disabled={updateUserMutation.isPending}
                      >
                        <SelectTrigger className="w-[120px]" data-testid={`select-role-${user.id}`}>
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
                        onValueChange={(status) =>
                          updateUserMutation.mutate({ userId: user.id, data: { status } })
                        }
                        disabled={updateUserMutation.isPending}
                      >
                        <SelectTrigger className="w-[120px]" data-testid={`select-status-${user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt!).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedUser({ 
                            id: user.id, 
                            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User'
                          })}
                          data-testid={`button-view-profile-${user.id}`}
                        >
                          Profile
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`button-view-billing-${user.id}`}
                        >
                          Billing
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {data && data.total > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {data.users.length} of {data.total} users
          </div>
        )}
      </div>

      {selectedUser && (
        <UserProfileModal
          userId={selectedUser.id}
          userName={selectedUser.name}
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
