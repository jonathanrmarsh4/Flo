import { useQuery } from '@tanstack/react-query';

export interface PlanFeatures {
  labs: {
    allowUnlimitedLabUploads: boolean;
    maxLabUploadsPerUser: number;
  };
  biomarkers: {
    allowUnlimitedBiomarkerDisplay: boolean;
    maxVisibleBiomarkersPerUser: number;
  };
  oracle: {
    allowOracleChat: boolean;
    allowUnlimitedOracleMessages: boolean;
    maxDailyOracleMessages: number;
  };
  insights: {
    allowAiGeneratedInsightCards: boolean;
  };
  flomentum: {
    allowFlomentumScoring: boolean;
  };
  general: {
    allowAiHealthReportGeneration: boolean;
    allowRagBasedInsights: boolean;
  };
  ai: {
    allowWhyExplanations: boolean;
    allowAiInsightsTile: boolean;
    allowAiPushNotifications: boolean;
    allowFoodLogging: boolean;
    allowBiomarkerAiDetails: boolean;
    allowInterventionsPage: boolean;
    allowFloChat: boolean;
  };
}

export interface PlanLimits {
  maxLabUploadsPerUser: number;
  maxVisibleBiomarkersPerUser: number;
  maxDailyOracleMessages: number;
}

export interface UserPlan {
  plan: {
    id: 'free' | 'premium';
    displayName: string;
    tier: number;
    limits: PlanLimits;
    features: PlanFeatures;
  };
  features: PlanFeatures;
  limits: PlanLimits;
}

export function usePlan() {
  return useQuery<UserPlan>({
    queryKey: ['/api/billing/plan'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

export interface PaywallModal {
  id: string;
  title: string;
  description: string;
  benefits: string[];
  ctaText: string;
  ctaAction: 'upgrade_to_premium' | 'contact_support';
}

export function usePaywallModals() {
  return useQuery<{ modals: PaywallModal[] }>({
    queryKey: ['/api/billing/paywall-modals'],
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export interface AvailablePlan {
  id: 'free' | 'premium';
  displayName: string;
  tier: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

export interface PricingInfo {
  monthly: {
    amount: number;
    currency: string;
    stripePriceId: string;
  };
  annual: {
    amount: number;
    currency: string;
    stripePriceId: string;
  };
}

export function useAvailablePlans() {
  return useQuery<{ plans: Record<string, AvailablePlan>; pricing: Record<string, PricingInfo> }>({
    queryKey: ['/api/billing/plans'],
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
