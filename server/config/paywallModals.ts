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
      'See more biomarkers with no cap',
      'Unlock Insights and Flō Oracle',
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
      'AI insights across your full panel',
      'Priority access to new features',
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
      'Simple, targeted recommendations',
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
      'Daily readiness guidance',
      'Sleep and recovery coaching',
      "Weekly summaries of what's working",
    ],
  },
  upgrade_on_locked_oracle_tile: {
    id: 'upgrade_on_locked_oracle_tile',
    title: 'Meet the Flō Oracle',
    body: 'Ask Flō anything about your labs, diagnostics, and wearable data—and get answers that actually know your history. Flō Oracle is your personal health copilot, available with Flō Premium.',
    primaryCtaLabel: 'Unlock Flō Oracle',
    secondaryCtaLabel: 'Keep browsing',
    icon: 'oracle',
    highlightedBenefits: [
      'Conversational AI that knows your data',
      'Questions answered in plain language',
      'Gets smarter as your history grows',
    ],
  },
  generic_premium_upsell: {
    id: 'generic_premium_upsell',
    title: 'Upgrade to Flō Premium',
    body: "You've discovered a Flō Premium feature. Upgrade to unlock unlimited labs, all biomarkers, Flōmentum, AI Insights, and the Flō Oracle.",
    primaryCtaLabel: 'Upgrade now',
    secondaryCtaLabel: 'Stay on Free',
    icon: 'premium',
    highlightedBenefits: [
      'Unlimited lab and diagnostic storage',
      'All biomarkers with deeper insights',
      'Flōmentum, Insights and Flō Oracle included',
    ],
  },
};
