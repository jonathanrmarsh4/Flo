export type PaywallModalId = 
  | 'upgrade_on_lab_upload_limit'
  | 'upgrade_on_biomarker_display_limit'
  | 'upgrade_on_locked_insights_tile'
  | 'upgrade_on_locked_flomentum_tile'
  | 'upgrade_on_locked_oracle_tile'
  | 'generic_premium_upsell';

export interface PaywallModal {
  id: PaywallModalId;
  title: string;
  body: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  icon: 'labs' | 'biomarkers' | 'insights' | 'flomentum' | 'oracle' | 'premium';
  highlightedBenefits: string[];
}

export const PAYWALL_MODALS: Record<PaywallModalId, PaywallModal> = {
  upgrade_on_lab_upload_limit: {
    id: 'upgrade_on_lab_upload_limit',
    title: 'Reached your lab limit on Flō Free',
    body: "You've stored the maximum of 3 lab reports on Flō Free. Upgrade to Flō Premium to keep all your past and future labs in one place and unlock deeper AI insights across your history.",
    primaryCtaLabel: 'Upgrade to Flō Premium',
    secondaryCtaLabel: 'Maybe later',
    icon: 'labs',
    highlightedBenefits: [
      'Unlimited lab report storage',
      'Full biomarker tracking with no limits',
      'Flō — human-level health coaching',
      'Daily personalized insights',
      'Voice conversations with your health data',
    ],
  },
  upgrade_on_biomarker_display_limit: {
    id: 'upgrade_on_biomarker_display_limit',
    title: "You've hit the biomarker view limit",
    body: 'Flō parsed more biomarkers from your report, but Flō Free only shows up to 35. Upgrade to Flō Premium to unlock all biomarkers, plus smarter AI insights across your full panel.',
    primaryCtaLabel: 'Unlock all biomarkers',
    secondaryCtaLabel: 'Stay on Free',
    icon: 'biomarkers',
    highlightedBenefits: [
      'View every biomarker in your labs',
      'AI pattern detection across all data',
      'Flō — human-level health coaching',
      'Personalized action plans',
      'Smart daily health reminders',
    ],
  },
  upgrade_on_locked_insights_tile: {
    id: 'upgrade_on_locked_insights_tile',
    title: 'Unlock AI Insights',
    body: "Flō can continuously scan your labs and wearable data to surface the patterns that matter most—without you needing to think about it. This feature is part of Flō Premium.",
    primaryCtaLabel: 'Unlock Insights',
    secondaryCtaLabel: 'Not now',
    icon: 'insights',
    highlightedBenefits: [
      'AI-generated insights across all data',
      'Updated as new labs and data arrive',
      'Flō — human-level health coaching',
      'Unlimited voice conversations',
      'Flōmentum daily readiness scores',
    ],
  },
  upgrade_on_locked_flomentum_tile: {
    id: 'upgrade_on_locked_flomentum_tile',
    title: 'Unlock Flōmentum',
    body: 'Flōmentum turns your readiness, sleep, and activity into a simple daily plan—when to push, when to recover, and what to focus on today. Available with Flō Premium.',
    primaryCtaLabel: 'Unlock Flōmentum',
    secondaryCtaLabel: 'Maybe later',
    icon: 'flomentum',
    highlightedBenefits: [
      'Daily readiness and recovery guidance',
      'Sleep quality analysis',
      'Flō — human-level health coaching',
      'Personalized action plans',
      'Unlimited lab storage',
      'Voice conversations with your health data',
    ],
  },
  upgrade_on_locked_oracle_tile: {
    id: 'upgrade_on_locked_oracle_tile',
    title: 'Talk to Flō',
    body: 'Ask Flō anything about your labs, diagnostics, and wearable data—and get answers that actually know your history. Flō is your personal health coach, available with Flō Premium.',
    primaryCtaLabel: 'Unlock Flō',
    secondaryCtaLabel: 'Keep browsing',
    icon: 'oracle',
    highlightedBenefits: [
      'Flō — human-level health coaching',
      'Voice conversations with your health data',
      'Remembers your history and goals',
      'Daily personalized insights',
      'Flōmentum readiness scores',
      'Unlimited lab storage',
    ],
  },
  generic_premium_upsell: {
    id: 'generic_premium_upsell',
    title: 'Upgrade to Flō Premium',
    body: "Unlock the full power of Flō—your AI health coach that knows your labs, wearables, and goals.",
    primaryCtaLabel: 'Upgrade now',
    secondaryCtaLabel: 'Stay on Free',
    icon: 'premium',
    highlightedBenefits: [
      'Flō — human-level health coaching',
      'Unlimited lab and diagnostic storage',
      'Voice conversations with your data',
      'Daily personalized insights',
      'Flōmentum readiness scores',
      'Personalized action plans',
    ],
  },
};
