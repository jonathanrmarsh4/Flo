import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Profile, UpdateDemographics, UpdateHealthBaseline, UpdateGoals, UpdateAIPersonalization } from '@shared/schema';

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
