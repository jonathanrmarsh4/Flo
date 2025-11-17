import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export interface NotificationPreferences {
  userId: string;
  pushEnabled: boolean;
  flomentumDailyEnabled: boolean;
  flomentumWeeklyEnabled: boolean;
  labResultsEnabled: boolean;
  healthInsightsEnabled: boolean;
  notificationTime: string;
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  scoreThreshold: number | null;
}

export function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: ['/api/notifications/preferences'],
  });
}

export function useUpdateNotificationPreferences() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (preferences: Partial<NotificationPreferences>) => {
      return await apiRequest('PUT', '/api/notifications/preferences', preferences);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      toast({
        title: "Settings Updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update notification preferences",
        variant: "destructive",
      });
    },
  });
}

export function useSendTestNotification() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/notifications/test', {});
    },
    onSuccess: () => {
      toast({
        title: "Test Notification Sent",
        description: "Check your device for the test notification.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to send test notification",
        variant: "destructive",
      });
    },
  });
}
