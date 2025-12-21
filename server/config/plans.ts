export type PlanId = 'FREE' | 'PREMIUM';

export interface PlanLimits {
  maxLabReportsStored: number; // -1 = unlimited
  maxVisibleBiomarkersPerUser: number; // -1 = unlimited
  maxDiagnosticReportsStored: number; // -1 = unlimited
  maxDailyOracleMessages: number; // -1 = unlimited
  maxDailyBiomarkerAiInsightClicks: number; // -1 = unlimited
  healthKitHistoryDaysShown: number; // -1 = unlimited
}

export interface PlanFeatures {
  billing: {
    isPaidPlan: boolean;
    showsUpgradeNudges: boolean;
  };
  bloodwork: {
    canUploadLabs: boolean;
    canViewLabHistory: boolean;
    parseAllBiomarkersIngested: boolean;
    displayBiomarkersCappedByPlan: boolean;
    maxVisibleBiomarkersPerUser: number;
    showBiomarkerAiInsights: 'per_biomarker_only' | 'per_biomarker_and_multi_marker';
    showMultiBiomarkerInsights: boolean;
    showInsightsTile: boolean;
    showInsightsPage: boolean;
  };
  diagnostics: {
    featureStatus: 'beta';
    canUploadDiagnostics: boolean;
    maxDiagnosticReportsStored: number;
    showDiagnosticsTile: boolean;
    showDiagnosticsSummary: boolean;
    showAdvancedDiagnosticsInsights: boolean;
    allowOracleDiagnosticsContext: boolean;
  };
  healthKit: {
    canConnectHealthKit: boolean;
    ingestAllSupportedMetrics: boolean;
    useSubsetForReadinessAndSleep: boolean;
    showReadinessTile: boolean;
    showFloSleepIndexTile: boolean;
    showAdditionalHealthTiles: boolean;
    maxHistoryDaysShown: number;
  };
  insights: {
    showInsightsTile: boolean;
    showInsightsPage: boolean;
    allowAiGeneratedInsightCards: boolean;
    allowPeriodicInsightRefresh: boolean;
  };
  flomentum: {
    showFlomentumTile: boolean;
    allowFlomentumScoring: boolean;
    allowDailyCoachingPrompts: boolean;
  };
  oracle: {
    showOracleTileLocked: boolean;
    allowOracleChat: boolean;
    allowTileDeepLinksToOracle: boolean;
  };
  ui: {
    showLockedTiles: boolean;
    lockedTiles: string[];
    showPremiumBadges: boolean;
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

export interface Plan {
  id: PlanId;
  label: string;
  description: string;
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<PlanId, Plan> = {
  FREE: {
    id: 'FREE',
    label: 'Flō Free',
    description: 'Full tracking features including unlimited lab uploads. Upgrade for AI-powered insights.',
    limits: {
      maxLabReportsStored: -1, // Unlimited lab uploads for free
      maxVisibleBiomarkersPerUser: -1, // Unlimited biomarker display for free
      maxDiagnosticReportsStored: -1, // Unlimited diagnostics for free
      maxDailyOracleMessages: 0, // No AI chat for free
      maxDailyBiomarkerAiInsightClicks: 0, // No AI biomarker insights for free
      healthKitHistoryDaysShown: -1, // Unlimited history for free
    },
    features: {
      billing: {
        isPaidPlan: false,
        showsUpgradeNudges: true,
      },
      bloodwork: {
        canUploadLabs: true,
        canViewLabHistory: true,
        parseAllBiomarkersIngested: true,
        displayBiomarkersCappedByPlan: false, // No cap for free
        maxVisibleBiomarkersPerUser: -1, // Unlimited
        showBiomarkerAiInsights: 'per_biomarker_only', // Basic data only, AI explanations locked
        showMultiBiomarkerInsights: false, // AI feature - premium only
        showInsightsTile: false, // AI feature - premium only
        showInsightsPage: false, // AI feature - premium only
      },
      diagnostics: {
        featureStatus: 'beta',
        canUploadDiagnostics: true, // Free users can upload
        maxDiagnosticReportsStored: -1, // Unlimited for free
        showDiagnosticsTile: true, // Free users see data
        showDiagnosticsSummary: true, // Free users see basic summary
        showAdvancedDiagnosticsInsights: false, // AI feature - premium only
        allowOracleDiagnosticsContext: false, // AI feature - premium only
      },
      healthKit: {
        canConnectHealthKit: true,
        ingestAllSupportedMetrics: true,
        useSubsetForReadinessAndSleep: false, // Full access for free
        showReadinessTile: true,
        showFloSleepIndexTile: true,
        showAdditionalHealthTiles: true, // All tiles visible for free
        maxHistoryDaysShown: -1, // Unlimited history
      },
      insights: {
        showInsightsTile: false, // AI feature - premium only
        showInsightsPage: false, // AI feature - premium only
        allowAiGeneratedInsightCards: false, // AI feature - premium only
        allowPeriodicInsightRefresh: false, // AI feature - premium only
      },
      flomentum: {
        showFlomentumTile: true, // Data visible for free
        allowFlomentumScoring: true, // Basic scoring available
        allowDailyCoachingPrompts: false, // AI feature - premium only
      },
      oracle: {
        showOracleTileLocked: true, // Show locked state
        allowOracleChat: false, // AI feature - premium only
        allowTileDeepLinksToOracle: false, // AI feature - premium only
      },
      ui: {
        showLockedTiles: true,
        lockedTiles: ['INSIGHTS', 'ORACLE'], // Only AI features locked
        showPremiumBadges: true,
      },
      ai: {
        allowWhyExplanations: false, // AI feature - premium only
        allowAiInsightsTile: false, // AI feature - premium only
        allowAiPushNotifications: false, // AI feature - premium only
        allowFoodLogging: false, // AI feature - premium only
        allowBiomarkerAiDetails: false, // AI feature - premium only
        allowInterventionsPage: false, // AI feature - premium only
        allowFloChat: false, // AI feature - premium only
      },
    },
  },
  PREMIUM: {
    id: 'PREMIUM',
    label: 'Flō Premium',
    description: 'Unlimited labs, deeper insights, Flomentum, and Flō Oracle.',
    limits: {
      maxLabReportsStored: -1,
      maxVisibleBiomarkersPerUser: -1,
      maxDiagnosticReportsStored: -1,
      maxDailyOracleMessages: 200,
      maxDailyBiomarkerAiInsightClicks: -1,
      healthKitHistoryDaysShown: -1,
    },
    features: {
      billing: {
        isPaidPlan: true,
        showsUpgradeNudges: false,
      },
      bloodwork: {
        canUploadLabs: true,
        canViewLabHistory: true,
        parseAllBiomarkersIngested: true,
        displayBiomarkersCappedByPlan: false,
        maxVisibleBiomarkersPerUser: -1,
        showBiomarkerAiInsights: 'per_biomarker_and_multi_marker',
        showMultiBiomarkerInsights: true,
        showInsightsTile: true,
        showInsightsPage: true,
      },
      diagnostics: {
        featureStatus: 'beta',
        canUploadDiagnostics: true,
        maxDiagnosticReportsStored: -1,
        showDiagnosticsTile: true,
        showDiagnosticsSummary: true,
        showAdvancedDiagnosticsInsights: true,
        allowOracleDiagnosticsContext: true,
      },
      healthKit: {
        canConnectHealthKit: true,
        ingestAllSupportedMetrics: true,
        useSubsetForReadinessAndSleep: false,
        showReadinessTile: true,
        showFloSleepIndexTile: true,
        showAdditionalHealthTiles: true,
        maxHistoryDaysShown: -1,
      },
      insights: {
        showInsightsTile: true,
        showInsightsPage: true,
        allowAiGeneratedInsightCards: true,
        allowPeriodicInsightRefresh: true,
      },
      flomentum: {
        showFlomentumTile: true,
        allowFlomentumScoring: true,
        allowDailyCoachingPrompts: true,
      },
      oracle: {
        showOracleTileLocked: false,
        allowOracleChat: true,
        allowTileDeepLinksToOracle: true,
      },
      ui: {
        showLockedTiles: false,
        lockedTiles: [],
        showPremiumBadges: true,
      },
      ai: {
        allowWhyExplanations: true,
        allowAiInsightsTile: true,
        allowAiPushNotifications: true,
        allowFoodLogging: true,
        allowBiomarkerAiDetails: true,
        allowInterventionsPage: true,
        allowFloChat: true,
      },
    },
  },
};

// Pricing configuration (Stripe Price IDs - set these in .env or Stripe Dashboard)
export const PRICING = {
  PREMIUM_MONTHLY: {
    priceId: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_premium_monthly',
    amount: 999, // $9.99 in cents
    currency: 'usd',
    interval: 'month' as const,
  },
  PREMIUM_YEARLY: {
    priceId: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || 'price_premium_yearly',
    amount: 11000, // $110 in cents
    currency: 'usd',
    interval: 'year' as const,
  },
};
