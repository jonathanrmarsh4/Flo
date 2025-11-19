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
    description: 'Great starting point to track key labs and readiness.',
    limits: {
      maxLabReportsStored: 3,
      maxVisibleBiomarkersPerUser: 35,
      maxDiagnosticReportsStored: 2,
      maxDailyOracleMessages: 0,
      maxDailyBiomarkerAiInsightClicks: 50,
      healthKitHistoryDaysShown: 14,
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
        displayBiomarkersCappedByPlan: true,
        maxVisibleBiomarkersPerUser: 35,
        showBiomarkerAiInsights: 'per_biomarker_only',
        showMultiBiomarkerInsights: false,
        showInsightsTile: false,
        showInsightsPage: false,
      },
      diagnostics: {
        featureStatus: 'beta',
        canUploadDiagnostics: true,
        maxDiagnosticReportsStored: 2,
        showDiagnosticsTile: true,
        showDiagnosticsSummary: true,
        showAdvancedDiagnosticsInsights: false,
        allowOracleDiagnosticsContext: false,
      },
      healthKit: {
        canConnectHealthKit: true,
        ingestAllSupportedMetrics: true,
        useSubsetForReadinessAndSleep: true,
        showReadinessTile: true,
        showFloSleepIndexTile: true,
        showAdditionalHealthTiles: false,
        maxHistoryDaysShown: 14,
      },
      insights: {
        showInsightsTile: false,
        showInsightsPage: false,
        allowAiGeneratedInsightCards: false,
        allowPeriodicInsightRefresh: false,
      },
      flomentum: {
        showFlomentumTile: false,
        allowFlomentumScoring: false,
        allowDailyCoachingPrompts: false,
      },
      oracle: {
        showOracleTileLocked: true,
        allowOracleChat: false,
        allowTileDeepLinksToOracle: false,
      },
      ui: {
        showLockedTiles: true,
        lockedTiles: ['INSIGHTS', 'FLOMENTUM', 'ORACLE'],
        showPremiumBadges: true,
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
    },
  },
};

// Pricing configuration (Stripe Price IDs - set these in .env or Stripe Dashboard)
export const PRICING = {
  PREMIUM_MONTHLY: {
    priceId: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_premium_monthly',
    amount: 2999, // $29.99 in cents
    currency: 'usd',
    interval: 'month' as const,
  },
  PREMIUM_YEARLY: {
    priceId: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || 'price_premium_yearly',
    amount: 29999, // $299.99 in cents
    currency: 'usd',
    interval: 'year' as const,
  },
};
