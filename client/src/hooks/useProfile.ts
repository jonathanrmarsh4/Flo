import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Profile, UpdateDemographics, UpdateHealthBaseline, UpdateGoals, UpdateAIPersonalization, UpdateReminderPreferences, UpdateBodyFatCalibration, UpdateName, User } from '@shared/schema';

export function useProfile() {
  return useQuery<Profile | null>({
    queryKey: ['/api/profile'],
  });
}

export function useUpdateDemographics() {
  return useMutation({
    mutationFn: async (data: UpdateDemographics) => {
      const response = await apiRequest('PATCH', '/api/profile/demographics', data);
      return response.json() as Promise<Profile>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/biomarkers'] }); // Invalidate biomarker insights (age/sex affects insights)
    },
  });
}

export function useUpdateHealthBaseline() {
  return useMutation({
    mutationFn: async (data: UpdateHealthBaseline) => {
      const response = await apiRequest('PATCH', '/api/profile/baseline', data);
      return response.json() as Promise<Profile>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/biomarkers'] }); // Invalidate biomarker insights (health context affects insights)
    },
  });
}

export function useUpdateGoals() {
  return useMutation({
    mutationFn: async (data: UpdateGoals) => {
      const response = await apiRequest('PATCH', '/api/profile/goals', data);
      return response.json() as Promise<Profile>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/biomarkers'] }); // Invalidate biomarker insights (goals affect insights)
    },
  });
}

export function useUpdateAIPersonalization() {
  return useMutation({
    mutationFn: async (data: UpdateAIPersonalization) => {
      const response = await apiRequest('PATCH', '/api/profile/personalization', data);
      return response.json() as Promise<Profile>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/biomarkers'] }); // Invalidate biomarker insights (medical context affects insights)
    },
  });
}

export function useUpdateReminderPreferences() {
  return useMutation({
    mutationFn: async (data: UpdateReminderPreferences) => {
      const response = await apiRequest('PATCH', '/api/profile/reminder-preferences', data);
      return response.json() as Promise<User>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
  });
}

export function useBodyFatCalibration() {
  return useQuery<{ bodyFatCorrectionPct: number }>({
    queryKey: ['/api/profile/body-fat-calibration'],
  });
}

export function useUpdateBodyFatCalibration() {
  return useMutation({
    mutationFn: async (data: UpdateBodyFatCalibration) => {
      const response = await apiRequest('PATCH', '/api/profile/body-fat-calibration', data);
      return response.json() as Promise<{ success: boolean; bodyFatCorrectionPct: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile/body-fat-calibration'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weight/tile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weight/overview'] });
    },
  });
}

export function useUpdateName() {
  return useMutation({
    mutationFn: async (data: UpdateName) => {
      const response = await apiRequest('PATCH', '/api/profile/name', data);
      return response.json() as Promise<User>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
  });
}
