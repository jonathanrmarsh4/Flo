export type PaywallModalId = 
  | 'upgrade_on_lab_upload_limit'
  | 'upgrade_on_biomarker_display_limit'
  | 'upgrade_on_locked_insights_tile'
  | 'upgrade_on_locked_flomentum_tile'
  | 'upgrade_on_locked_oracle_tile'
  | 'upgrade_on_locked_why_insight'
  | 'upgrade_on_locked_food_logging'
  | 'upgrade_on_locked_biomarker_ai'
  | 'upgrade_on_locked_interventions'
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
  upgrade_on_locked_why_insight: {
    id: 'upgrade_on_locked_why_insight',
    title: 'Unlock AI Explanations',
    body: 'Get personalized AI explanations for why your scores are what they are, and what you can do to improve them. This feature is part of Flō Premium.',
    primaryCtaLabel: 'Unlock AI Insights',
    secondaryCtaLabel: 'Maybe later',
    icon: 'insights',
    highlightedBenefits: [
      'AI-powered explanations for every tile',
      'Personalized health coaching',
      'Voice conversations with Flō',
      'Daily AI-generated insights',
      'Smart recommendations based on your data',
    ],
  },
  upgrade_on_locked_food_logging: {
    id: 'upgrade_on_locked_food_logging',
    title: 'Unlock Food Logging',
    body: 'Log your meals with voice, photo, or text and see how nutrition affects your health. AI-powered food logging is part of Flō Premium.',
    primaryCtaLabel: 'Unlock Food Logging',
    secondaryCtaLabel: 'Not now',
    icon: 'insights',
    highlightedBenefits: [
      'Log meals with voice, photo, or text',
      'AI-powered nutrition analysis',
      'Track macros and calories',
      'See how food affects your glucose',
      'Personalized meal recommendations',
    ],
  },
  upgrade_on_locked_biomarker_ai: {
    id: 'upgrade_on_locked_biomarker_ai',
    title: 'Unlock Biomarker AI Insights',
    body: 'Get AI-powered explanations of what each biomarker means for your health, potential patterns, and personalized recommendations. This feature is part of Flō Premium.',
    primaryCtaLabel: 'Unlock AI Analysis',
    secondaryCtaLabel: 'View data only',
    icon: 'biomarkers',
    highlightedBenefits: [
      'AI explanations for every biomarker',
      'Pattern detection across your labs',
      'Personalized improvement suggestions',
      'Track changes over time',
      'Flō coaching for optimal ranges',
    ],
  },
  upgrade_on_locked_interventions: {
    id: 'upgrade_on_locked_interventions',
    title: 'Unlock Interventions',
    body: 'Access AI-generated health reports, supplement experiments, and personalized action plans designed for your unique health profile. This feature is part of Flō Premium.',
    primaryCtaLabel: 'Unlock Interventions',
    secondaryCtaLabel: 'Maybe later',
    icon: 'premium',
    highlightedBenefits: [
      'AI-generated health reports',
      'N-of-1 supplement experiments',
      'Personalized action plans',
      'Track intervention progress',
      'Evidence-based recommendations',
    ],
  },
};
