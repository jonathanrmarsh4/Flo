import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    // PERFORMANCE FIX: Cache auth data for instant app launch
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
    refetchOnMount: true, // Revalidate in background when stale
    refetchOnWindowFocus: false, // Don't refetch on focus
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
