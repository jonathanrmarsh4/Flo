// N-of-1 Supplement Experiment Configuration Matrix
// Defines supported supplement types with their tracking metrics, baselines, and success criteria
// Based on scientific literature for expected effects and onset times

export interface SupplementObjectiveMetric {
  metric: string;
  source: string;
  healthkitType?: string;
  clickhouseMetric?: string;
  baselineDuration: number;
  expectedOnset: number;
  successCriteria: string;
  minimumEffect: number;
}

export interface SupplementSubjectiveMetric {
  metric: string;
  scale: string;
  dailyCheckIn: boolean;
  baselineDuration: number;
  expectedOnset: number;
  successCriteria: string;
  minimumEffect: number;
}

export interface SupplementTypeConfig {
  id: string;
  name: string;
  category: 'sleep' | 'energy' | 'cognitive' | 'recovery' | 'metabolic' | 'mood' | 'performance';
  protocolType: 'acute' | 'chronic';
  protocolDescription: string;
  primaryIntents: string[];
  objectiveMetrics: SupplementObjectiveMetric[];
  subjectiveMetrics: SupplementSubjectiveMetric[];
  recommendedDuration: number;
  contextualNoiseFilters: string[];
  washoutPeriod: number;
  relevantBloodMarkers?: string[];
}

export interface PrimaryIntent {
  id: string;
  label: string;
  description: string;
  icon: string;
  relatedSupplements: string[];
}

// Primary intents for the wizard
export const PRIMARY_INTENTS: PrimaryIntent[] = [
  {
    id: 'sleep_recovery',
    label: 'Deep Sleep & Recovery',
    description: 'Improve sleep quality, deep sleep duration, and overnight recovery',
    icon: '🌙',
    relatedSupplements: ['magnesium', 'melatonin', 'glycine', 'ashwagandha', 'gaba', 'l-theanine'],
  },
  {
    id: 'energy_vitality',
    label: 'Energy & Vitality',
    description: 'Boost daily energy levels, reduce fatigue, and improve endurance',
    icon: '⚡',
    relatedSupplements: ['vitamin-d3', 'iron', 'coq10', 'rhodiola', 'nmn', 'creatine', 'vitamin-b12'],
  },
  {
    id: 'stress_mood',
    label: 'Stress & Mood',
    description: 'Reduce stress, anxiety, and improve overall mood balance',
    icon: '🧘',
    relatedSupplements: ['ashwagandha', 'l-theanine', 'rhodiola', 'gaba', 'omega-3'],
  },
  {
    id: 'cognitive',
    label: 'Focus & Mental Clarity',
    description: 'Enhance focus, memory, and cognitive performance',
    icon: '🧠',
    relatedSupplements: ['alpha-gpc', 'lions-mane', 'bacopa', 'l-theanine', 'creatine', 'omega-3'],
  },
  {
    id: 'metabolic',
    label: 'Metabolic Health',
    description: 'Support blood sugar control, weight management, and metabolic function',
    icon: '🔥',
    relatedSupplements: ['berberine', 'fiber', 'probiotics', 'vitamin-d3'],
  },
  {
    id: 'recovery_inflammation',
    label: 'Recovery & Inflammation',
    description: 'Reduce inflammation, joint pain, and support post-exercise recovery',
    icon: '💪',
    relatedSupplements: ['omega-3', 'curcumin', 'zinc', 'collagen', 'glucosamine', 'vitamin-c'],
  },
];

// Configuration matrix for 20 common supplements
export const SUPPLEMENT_CONFIGURATIONS: Record<string, SupplementTypeConfig> = {
  'magnesium': {
    id: 'magnesium',
    name: 'Magnesium (Glycinate/Citrate)',
    category: 'sleep',
    protocolType: 'acute',
    protocolDescription: 'Fast-acting, typically noticeable within 1-3 days',
    primaryIntents: ['Improve Sleep Quality', 'Reduce Stress', 'Enhance Recovery'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+5-10% increase from baseline',
        minimumEffect: 5,
      },
      {
        metric: 'Deep Sleep %',
        source: 'Apple HealthKit',
        healthkitType: 'HKCategoryValueSleepAnalysisAsleepDeep',
        clickhouseMetric: 'deep_sleep_pct',
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+3-5% increase from baseline',
        minimumEffect: 3,
      },
      {
        metric: 'Sleep Duration',
        source: 'Apple HealthKit',
        healthkitType: 'HKCategoryValueSleepAnalysisAsleep',
        clickhouseMetric: 'sleep_duration_min',
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+15-30min increase',
        minimumEffect: 5,
      },
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 7,
        expectedOnset: 5,
        successCriteria: '-2-4 bpm decrease',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Sleep Quality',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Stress Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 4,
        successCriteria: '-1-2 point decrease',
        minimumEffect: 12,
      },
    ],
    recommendedDuration: 30,
    contextualNoiseFilters: [
      'Nights with alcohol consumption',
      'Days with >2hr timezone shift',
      'Nights with <6hr sleep opportunity',
    ],
    washoutPeriod: 3,
    relevantBloodMarkers: ['Serum Magnesium'],
  },

  'vitamin-d3': {
    id: 'vitamin-d3',
    name: 'Vitamin D3',
    category: 'metabolic',
    protocolType: 'chronic',
    protocolDescription: 'Slow-building, requires 4-8 weeks for noticeable effects',
    primaryIntents: ['Boost Immunity', 'Improve Mood', 'Enhance Bone Health'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+3-7% increase',
        minimumEffect: 3,
      },
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '-1-3 bpm',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Mood',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 60,
    contextualNoiseFilters: [
      'Track sun exposure (confounding variable)',
      'Monitor seasonal changes',
      'Note concurrent vitamin supplementation',
    ],
    washoutPeriod: 14,
    relevantBloodMarkers: ['25-OH Vitamin D'],
  },

  'omega-3': {
    id: 'omega-3',
    name: 'Omega-3 Fish Oil',
    category: 'recovery',
    protocolType: 'chronic',
    protocolDescription: 'Long-term, requires 4-8 weeks for measurable changes',
    primaryIntents: ['Reduce Inflammation', 'Support Heart Health', 'Enhance Recovery'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 28,
        successCriteria: '+4-8% increase',
        minimumEffect: 4,
      },
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '-2-4 bpm',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Joint Pain',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 28,
        successCriteria: '-1.5-2.5 point decrease',
        minimumEffect: 15,
      },
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 35,
        successCriteria: '+0.8-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 60,
    contextualNoiseFilters: [
      'Track fish consumption (dietary omega-3)',
      'Monitor training intensity changes',
      'Note concurrent anti-inflammatory supplements',
    ],
    washoutPeriod: 14,
    relevantBloodMarkers: ['Omega-3 Index', 'HS-CRP'],
  },

  'l-theanine': {
    id: 'l-theanine',
    name: 'L-Theanine',
    category: 'cognitive',
    protocolType: 'acute',
    protocolDescription: 'Fast-acting, effects within 30-60 minutes',
    primaryIntents: ['Improve Focus', 'Reduce Anxiety', 'Enhance Calmness'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+3-6% increase',
        minimumEffect: 3,
      },
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '-1-3 bpm',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Focus',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Anxiety',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '-1.5-2.5 point decrease',
        minimumEffect: 15,
      },
      {
        metric: 'Calmness',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+1.5-2 point increase',
        minimumEffect: 15,
      },
    ],
    recommendedDuration: 21,
    contextualNoiseFilters: [
      'Track caffeine intake (synergistic effect)',
      'Note timing relative to stressful events',
      'Monitor sleep quality (affects baseline anxiety)',
    ],
    washoutPeriod: 2,
  },

  'ashwagandha': {
    id: 'ashwagandha',
    name: 'Ashwagandha (KSM-66)',
    category: 'mood',
    protocolType: 'chronic',
    protocolDescription: 'Requires 2-4 weeks for noticeable effects',
    primaryIntents: ['Reduce Stress', 'Improve Sleep', 'Lower Cortisol'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '+5-10% increase',
        minimumEffect: 5,
      },
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '-2-5 bpm',
        minimumEffect: 2,
      },
      {
        metric: 'Sleep Duration',
        source: 'Apple HealthKit',
        healthkitType: 'HKCategoryValueSleepAnalysisAsleep',
        clickhouseMetric: 'sleep_duration_min',
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '+10-25min',
        minimumEffect: 5,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Stress Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '-2-3 point decrease',
        minimumEffect: 20,
      },
      {
        metric: 'Anxiety',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 10,
        successCriteria: '-1.5-2.5 point decrease',
        minimumEffect: 15,
      },
      {
        metric: 'Sleep Quality',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 45,
    contextualNoiseFilters: [
      'Track major life stressors',
      'Monitor work schedule changes',
      'Note meditation/breathing practice',
    ],
    washoutPeriod: 7,
    relevantBloodMarkers: ['Cortisol', 'Thyroid Panel'],
  },

  'creatine': {
    id: 'creatine',
    name: 'Creatine Monohydrate',
    category: 'performance',
    protocolType: 'chronic',
    protocolDescription: 'Requires loading phase, full saturation in 2-4 weeks',
    primaryIntents: ['Increase Strength', 'Enhance Muscle Mass', 'Improve Cognitive Function'],
    objectiveMetrics: [
      {
        metric: 'Weight',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierBodyMass',
        clickhouseMetric: 'weight_kg',
        baselineDuration: 7,
        expectedOnset: 7,
        successCriteria: '+1-3 lbs (water retention + muscle)',
        minimumEffect: 2,
      },
      {
        metric: 'Active Energy',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        clickhouseMetric: 'active_energy',
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+5-10% increase in workout capacity',
        minimumEffect: 5,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 10,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+0.8-1.5 point increase',
        minimumEffect: 8,
      },
    ],
    recommendedDuration: 45,
    contextualNoiseFilters: [
      'Track resistance training frequency',
      'Monitor protein intake',
      'Note hydration levels (affects weight)',
    ],
    washoutPeriod: 14,
    relevantBloodMarkers: ['Creatinine', 'BUN'],
  },

  'melatonin': {
    id: 'melatonin',
    name: 'Melatonin',
    category: 'sleep',
    protocolType: 'acute',
    protocolDescription: 'Immediate effects, take 30-60 minutes before bed',
    primaryIntents: ['Improve Sleep Onset', 'Regulate Sleep Schedule', 'Reduce Jet Lag'],
    objectiveMetrics: [
      {
        metric: 'Sleep Onset Latency',
        source: 'Apple HealthKit',
        clickhouseMetric: 'sleep_onset_latency',
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '-10-20 minutes decrease',
        minimumEffect: 15,
      },
      {
        metric: 'Sleep Duration',
        source: 'Apple HealthKit',
        healthkitType: 'HKCategoryValueSleepAnalysisAsleep',
        clickhouseMetric: 'sleep_duration_min',
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+15-30min increase',
        minimumEffect: 5,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Sleep Quality',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Morning Alertness',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 21,
    contextualNoiseFilters: [
      'Track screen time before bed',
      'Note travel/timezone changes',
      'Monitor caffeine timing',
    ],
    washoutPeriod: 2,
  },

  'coq10': {
    id: 'coq10',
    name: 'CoQ10 (Ubiquinol)',
    category: 'energy',
    protocolType: 'chronic',
    protocolDescription: 'Slow-building, requires 3-4 weeks for noticeable effects',
    primaryIntents: ['Boost Energy', 'Support Heart Health', 'Reduce Fatigue'],
    objectiveMetrics: [
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '-2-4 bpm',
        minimumEffect: 2,
      },
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 28,
        successCriteria: '+4-7% increase',
        minimumEffect: 4,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 60,
    contextualNoiseFilters: [
      'Monitor statin use (depletes CoQ10)',
      'Track exercise intensity',
      'Note concurrent antioxidant supplements',
    ],
    washoutPeriod: 10,
    relevantBloodMarkers: ['Lipid Panel', 'CoQ10 levels'],
  },

  'curcumin': {
    id: 'curcumin',
    name: 'Curcumin (Turmeric)',
    category: 'recovery',
    protocolType: 'chronic',
    protocolDescription: 'Daily use, effects noticeable in 2-3 weeks',
    primaryIntents: ['Reduce Inflammation', 'Decrease Joint Pain', 'Enhance Recovery'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+3-6% increase',
        minimumEffect: 3,
      },
      {
        metric: 'Active Energy',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        clickhouseMetric: 'active_energy',
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: 'Maintained or increased (pain often limits movement)',
        minimumEffect: 0,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Joint Pain',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '-1.5-3 point decrease',
        minimumEffect: 20,
      },
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Muscle Soreness',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 10,
        successCriteria: '-1-2 point decrease',
        minimumEffect: 12,
      },
    ],
    recommendedDuration: 45,
    contextualNoiseFilters: [
      'Track training volume and intensity',
      'Note NSAIDs or other anti-inflammatories',
      'Monitor injury status',
    ],
    washoutPeriod: 7,
    relevantBloodMarkers: ['ESR', 'CRP'],
  },

  'berberine': {
    id: 'berberine',
    name: 'Berberine',
    category: 'metabolic',
    protocolType: 'chronic',
    protocolDescription: 'Daily with meals, effects in 1-2 weeks',
    primaryIntents: ['Improve Blood Sugar', 'Support Metabolic Health', 'Reduce Glucose Spikes'],
    objectiveMetrics: [
      {
        metric: 'Average Glucose',
        source: 'Dexcom CGM',
        clickhouseMetric: 'average_glucose',
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '-5-10 mg/dL reduction',
        minimumEffect: 5,
      },
      {
        metric: 'Glucose Variability',
        source: 'Dexcom CGM',
        clickhouseMetric: 'glucose_variability',
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '-10-20% reduction',
        minimumEffect: 10,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 10,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
      {
        metric: 'Appetite Control',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: 'Better regulation',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 60,
    contextualNoiseFilters: [
      'Track carbohydrate intake consistency',
      'Monitor meal timing',
      'Note exercise timing relative to meals',
      'Exclude days with unusual stress or illness',
    ],
    washoutPeriod: 7,
    relevantBloodMarkers: ['HbA1c', 'Fasting Glucose', 'Lipids'],
  },

  'rhodiola': {
    id: 'rhodiola',
    name: 'Rhodiola Rosea',
    category: 'energy',
    protocolType: 'acute',
    protocolDescription: 'Fast-acting adaptogen, effects in 2-5 days',
    primaryIntents: ['Boost Energy', 'Reduce Fatigue', 'Enhance Mental Performance'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+4-8% increase',
        minimumEffect: 4,
      },
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 7,
        expectedOnset: 5,
        successCriteria: '-1-3 bpm',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Focus',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
      {
        metric: 'Stress Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 5,
        successCriteria: '-1-1.5 point decrease',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 30,
    contextualNoiseFilters: [
      'Track sleep quality (affects energy baseline)',
      'Monitor caffeine intake',
      'Note physical training load',
    ],
    washoutPeriod: 3,
  },

  'nmn': {
    id: 'nmn',
    name: 'NMN (Nicotinamide Mononucleotide)',
    category: 'energy',
    protocolType: 'chronic',
    protocolDescription: 'NAD+ precursor, effects in 1-2 weeks',
    primaryIntents: ['Boost NAD+ Levels', 'Enhance Energy', 'Support Longevity'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+5-10% increase',
        minimumEffect: 5,
      },
      {
        metric: 'VO2 Max',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierVO2Max',
        clickhouseMetric: 'vo2_max',
        baselineDuration: 14,
        expectedOnset: 28,
        successCriteria: '+2-5% increase',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 10,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 60,
    contextualNoiseFilters: [
      'Monitor sleep quality (affects energy)',
      'Track exercise consistency',
      'Note concurrent NAD+ boosters',
    ],
    washoutPeriod: 10,
  },

  'alpha-gpc': {
    id: 'alpha-gpc',
    name: 'Alpha-GPC',
    category: 'cognitive',
    protocolType: 'acute',
    protocolDescription: 'Fast-acting nootropic, effects within 1-2 hours',
    primaryIntents: ['Enhance Focus', 'Improve Memory', 'Support Cognitive Performance'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+3-5% increase',
        minimumEffect: 3,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Focus',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+1.5-2 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Alertness',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
    ],
    recommendedDuration: 30,
    contextualNoiseFilters: [
      'Track caffeine intake',
      'Monitor sleep quality',
      'Note mentally demanding tasks',
    ],
    washoutPeriod: 3,
  },

  'lions-mane': {
    id: 'lions-mane',
    name: "Lion's Mane",
    category: 'cognitive',
    protocolType: 'chronic',
    protocolDescription: 'Nootropic mushroom, requires 2-4 weeks for effects',
    primaryIntents: ['Enhance Cognitive Function', 'Support Nerve Health', 'Improve Focus'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+3-6% increase',
        minimumEffect: 3,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Focus',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
      {
        metric: 'Memory',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 60,
    contextualNoiseFilters: [
      'Track sleep quality',
      'Note stress levels',
      'Monitor other nootropic use',
    ],
    washoutPeriod: 7,
    relevantBloodMarkers: ['BDNF', 'Cortisol'],
  },

  'probiotics': {
    id: 'probiotics',
    name: 'Probiotics (Lactobacillus/Bifido)',
    category: 'metabolic',
    protocolType: 'chronic',
    protocolDescription: 'Daily use, effects in 2-4 weeks',
    primaryIntents: ['Support Gut Health', 'Reduce Inflammation', 'Improve Digestion'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+3-5% increase (inflammation proxy)',
        minimumEffect: 3,
      },
      {
        metric: 'Sleep Efficiency',
        source: 'Apple HealthKit',
        clickhouseMetric: 'sleep_efficiency',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+2-5% increase',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Digestion',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Bloating',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '-1-2 point decrease',
        minimumEffect: 12,
      },
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+0.8-1.5 point increase',
        minimumEffect: 8,
      },
    ],
    recommendedDuration: 45,
    contextualNoiseFilters: [
      'Track antibiotic use',
      'Monitor fiber intake',
      'Note dietary changes',
    ],
    washoutPeriod: 7,
    relevantBloodMarkers: ['HS-CRP'],
  },

  'zinc': {
    id: 'zinc',
    name: 'Zinc (Picolinate)',
    category: 'recovery',
    protocolType: 'acute',
    protocolDescription: 'Acute immune support or chronic hormonal support',
    primaryIntents: ['Boost Immunity', 'Support Hormonal Health', 'Enhance Recovery'],
    objectiveMetrics: [
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 7,
        expectedOnset: 7,
        successCriteria: 'Stable (spikes indicate fighting infection)',
        minimumEffect: 0,
      },
      {
        metric: 'Sleep Efficiency',
        source: 'Apple HealthKit',
        clickhouseMetric: 'sleep_efficiency',
        baselineDuration: 7,
        expectedOnset: 7,
        successCriteria: '+2-4% increase',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 7,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
      {
        metric: 'Sleep Quality',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 5,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 30,
    contextualNoiseFilters: [
      'Track illness symptoms',
      'Monitor copper intake (zinc depletes copper)',
      'Note iron supplementation timing',
    ],
    washoutPeriod: 5,
    relevantBloodMarkers: ['Plasma Zinc', 'Testosterone (Men)'],
  },

  'vitamin-b12': {
    id: 'vitamin-b12',
    name: 'Vitamin B12 (Methylcobalamin)',
    category: 'energy',
    protocolType: 'chronic',
    protocolDescription: 'Daily, effects in 1-2 weeks',
    primaryIntents: ['Boost Energy', 'Support Nervous System', 'Reduce Fatigue'],
    objectiveMetrics: [
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: 'Stabilization (anemia causes elevated HR)',
        minimumEffect: 0,
      },
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+3-6% increase',
        minimumEffect: 3,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 7,
        successCriteria: '+1.5-2 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Mental Clarity',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 14,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 45,
    contextualNoiseFilters: [
      'Track dietary B12 intake',
      'Note vegan/vegetarian diet',
      'Monitor alcohol consumption',
    ],
    washoutPeriod: 7,
    relevantBloodMarkers: ['Serum B12', 'Homocysteine'],
  },

  'iron': {
    id: 'iron',
    name: 'Iron (Bisglycinate)',
    category: 'energy',
    protocolType: 'chronic',
    protocolDescription: 'Slow-acting, requires 4-8 weeks for significant effects',
    primaryIntents: ['Reduce Fatigue', 'Improve Endurance', 'Support Oxygen Transport'],
    objectiveMetrics: [
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 14,
        expectedOnset: 28,
        successCriteria: '-2-5 bpm (anemia causes elevated HR)',
        minimumEffect: 2,
      },
      {
        metric: 'VO2 Max',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierVO2Max',
        clickhouseMetric: 'vo2_max',
        baselineDuration: 14,
        expectedOnset: 42,
        successCriteria: '+2-5% increase',
        minimumEffect: 2,
      },
      {
        metric: 'Active Energy',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        clickhouseMetric: 'active_energy',
        baselineDuration: 14,
        expectedOnset: 28,
        successCriteria: '+5-10% increase in capacity',
        minimumEffect: 5,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Energy Level',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 21,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 14,
        expectedOnset: 28,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
    ],
    recommendedDuration: 60,
    contextualNoiseFilters: [
      'Take with vitamin C (enhances absorption)',
      'Avoid with calcium (blocks absorption)',
      'Track menstrual cycle (for women)',
    ],
    washoutPeriod: 14,
    relevantBloodMarkers: ['Ferritin', 'Hemoglobin', 'Serum Iron'],
  },

  'gaba': {
    id: 'gaba',
    name: 'GABA',
    category: 'mood',
    protocolType: 'acute',
    protocolDescription: 'Fast-acting relaxation, effects within 30-60 minutes',
    primaryIntents: ['Reduce Anxiety', 'Improve Sleep', 'Promote Relaxation'],
    objectiveMetrics: [
      {
        metric: 'HRV',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        clickhouseMetric: 'hrv',
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+3-6% increase',
        minimumEffect: 3,
      },
      {
        metric: 'Resting Heart Rate',
        source: 'Apple HealthKit',
        healthkitType: 'HKQuantityTypeIdentifierRestingHeartRate',
        clickhouseMetric: 'resting_heart_rate',
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '-2-4 bpm',
        minimumEffect: 2,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Anxiety',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '-1.5-2.5 point decrease',
        minimumEffect: 15,
      },
      {
        metric: 'Calmness',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 1,
        successCriteria: '+1.5-2.5 point increase',
        minimumEffect: 15,
      },
      {
        metric: 'Sleep Quality',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 21,
    contextualNoiseFilters: [
      'Note timing relative to stressors',
      'Track caffeine consumption',
      'Monitor concurrent anxiolytics',
    ],
    washoutPeriod: 2,
  },

  'glycine': {
    id: 'glycine',
    name: 'Glycine',
    category: 'sleep',
    protocolType: 'acute',
    protocolDescription: 'Take before bed, effects within 1-2 days',
    primaryIntents: ['Improve Sleep Quality', 'Enhance Recovery', 'Promote Relaxation'],
    objectiveMetrics: [
      {
        metric: 'Deep Sleep %',
        source: 'Apple HealthKit',
        healthkitType: 'HKCategoryValueSleepAnalysisAsleepDeep',
        clickhouseMetric: 'deep_sleep_pct',
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+3-5% increase',
        minimumEffect: 3,
      },
      {
        metric: 'Sleep Duration',
        source: 'Apple HealthKit',
        healthkitType: 'HKCategoryValueSleepAnalysisAsleep',
        clickhouseMetric: 'sleep_duration_min',
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+10-20min increase',
        minimumEffect: 3,
      },
    ],
    subjectiveMetrics: [
      {
        metric: 'Sleep Quality',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 2,
        successCriteria: '+1-2 point increase',
        minimumEffect: 12,
      },
      {
        metric: 'Morning Alertness',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
      {
        metric: 'Recovery',
        scale: '0-10',
        dailyCheckIn: true,
        baselineDuration: 7,
        expectedOnset: 3,
        successCriteria: '+1-1.5 point increase',
        minimumEffect: 10,
      },
    ],
    recommendedDuration: 21,
    contextualNoiseFilters: [
      'Track evening routine consistency',
      'Monitor caffeine timing',
      'Note bedroom temperature',
    ],
    washoutPeriod: 2,
  },
};

// Helper function to get all supplement type IDs
export function getSupplementTypeIds(): string[] {
  return Object.keys(SUPPLEMENT_CONFIGURATIONS);
}

// Helper function to get supplements by intent
export function getSupplementsByIntent(intentId: string): SupplementTypeConfig[] {
  const intent = PRIMARY_INTENTS.find(i => i.id === intentId);
  if (!intent) return [];
  
  return intent.relatedSupplements
    .map(id => SUPPLEMENT_CONFIGURATIONS[id])
    .filter((config): config is SupplementTypeConfig => config !== undefined);
}

// Helper function to get supplement by ID
export function getSupplementConfig(id: string): SupplementTypeConfig | undefined {
  return SUPPLEMENT_CONFIGURATIONS[id];
}

// Effect size thresholds for verdict calculation
export const EFFECT_SIZE_THRESHOLDS = {
  STRONG_SUCCESS: 0.8,
  MODERATE_BENEFIT: 0.2,
  NO_EFFECT: 0.2,
} as const;

// Verdict calculation helper
export function calculateVerdict(effectSize: number): 'strong_success' | 'moderate_benefit' | 'no_effect' | 'negative_effect' {
  if (effectSize >= EFFECT_SIZE_THRESHOLDS.STRONG_SUCCESS) {
    return 'strong_success';
  } else if (effectSize >= EFFECT_SIZE_THRESHOLDS.MODERATE_BENEFIT) {
    return 'moderate_benefit';
  } else if (effectSize >= 0) {
    return 'no_effect';
  } else {
    return 'negative_effect';
  }
}

// Get display message for verdict
export function getVerdictMessage(verdict: string, supplementName: string, primaryMetric?: string): string {
  const metricText = primaryMetric ? ` in your ${primaryMetric}` : '';
  
  switch (verdict) {
    case 'strong_success':
      return `Strong evidence: ${supplementName} showed significant improvement${metricText}. Keep taking it.`;
    case 'moderate_benefit':
      return `Possible benefit: We see a positive trend${metricText}, but the effect is minor. Consider continuing for longer.`;
    case 'no_effect':
      return `Save your money: ${supplementName} made no measurable difference${metricText}. Consider trying a different supplement or higher dosage.`;
    case 'negative_effect':
      return `Not recommended: ${supplementName} appears to have a negative effect${metricText}. Consider discontinuing.`;
    default:
      return `Experiment complete. Review your detailed results.`;
  }
}

// ==================== EXPERIMENT COMPATIBILITY MATRIX ====================
// Defines which experiment intents can run concurrently
// This prevents users from running conflicting experiments that would invalidate results

export interface IntentCompatibility {
  intentId: string;
  label: string;
  canAddIntents: string[];
  cannotAddIntents: string[];
  conflictReason: string;
}

// Compatibility matrix based on overlapping metrics and biological systems
// When an experiment is active, certain other experiments would share metrics or confound results
export const EXPERIMENT_COMPATIBILITY_MATRIX: IntentCompatibility[] = [
  {
    intentId: 'sleep_recovery',
    label: 'Sleep & Recovery',
    canAddIntents: ['recovery_inflammation', 'metabolic'],
    cannotAddIntents: ['stress_mood', 'energy_vitality', 'cognitive'],
    conflictReason: 'Sleep experiments track HRV, RHR, and deep sleep - metrics shared with stress, energy, and cognitive experiments',
  },
  {
    intentId: 'energy_vitality',
    label: 'Energy & Vitality',
    canAddIntents: ['recovery_inflammation', 'metabolic'],
    cannotAddIntents: ['cognitive', 'stress_mood', 'sleep_recovery'],
    conflictReason: 'Energy experiments track HRV, activity, and fatigue - metrics shared with brain, stress, and sleep experiments',
  },
  {
    intentId: 'stress_mood',
    label: 'Stress & Mood',
    canAddIntents: ['recovery_inflammation', 'metabolic'],
    cannotAddIntents: ['sleep_recovery', 'cognitive', 'energy_vitality'],
    conflictReason: 'Stress/mood experiments track HRV, sleep quality, and subjective wellbeing - overlaps with sleep, cognitive, and energy',
  },
  {
    intentId: 'cognitive',
    label: 'Brain & Focus',
    canAddIntents: ['recovery_inflammation', 'metabolic'],
    cannotAddIntents: ['energy_vitality', 'stress_mood', 'sleep_recovery'],
    conflictReason: 'Cognitive experiments track focus, mental clarity, and HRV - overlaps with energy, stress, and sleep experiments',
  },
  {
    intentId: 'recovery_inflammation',
    label: 'Joints & Recovery',
    canAddIntents: ['sleep_recovery', 'stress_mood', 'cognitive'],
    cannotAddIntents: [],
    conflictReason: 'Joint/inflammation experiments are mostly compatible as they track distinct physical markers',
  },
  {
    intentId: 'metabolic',
    label: 'Gut Health & Metabolic',
    canAddIntents: ['sleep_recovery', 'cognitive', 'energy_vitality', 'stress_mood', 'recovery_inflammation'],
    cannotAddIntents: [],
    conflictReason: 'Gut health experiments track distinct digestive metrics and are generally safe to combine',
  },
];

// Helper function to get compatibility for an intent
export function getIntentCompatibility(intentId: string): IntentCompatibility | undefined {
  return EXPERIMENT_COMPATIBILITY_MATRIX.find(c => c.intentId === intentId);
}

// Check if two intents are compatible
export function areIntentsCompatible(activeIntentId: string, newIntentId: string): boolean {
  if (activeIntentId === newIntentId) return false; // Can't run same intent twice
  
  const activeCompatibility = getIntentCompatibility(activeIntentId);
  if (!activeCompatibility) return true; // Unknown intent, allow by default
  
  // Check if new intent is in the blocked list
  return !activeCompatibility.cannotAddIntents.includes(newIntentId);
}

// Get all blocked intents given a list of active experiment intents
export function getBlockedIntents(activeIntentIds: string[]): { intentId: string; reason: string }[] {
  const blocked: Map<string, string> = new Map();
  
  for (const activeId of activeIntentIds) {
    const compatibility = getIntentCompatibility(activeId);
    if (!compatibility) continue;
    
    // Block the same intent (can't run duplicate experiments)
    if (!blocked.has(activeId)) {
      blocked.set(activeId, `You already have an active ${compatibility.label} experiment`);
    }
    
    // Block conflicting intents
    for (const conflictId of compatibility.cannotAddIntents) {
      if (!blocked.has(conflictId)) {
        const conflictLabel = EXPERIMENT_COMPATIBILITY_MATRIX.find(c => c.intentId === conflictId)?.label || conflictId;
        blocked.set(conflictId, `Conflicts with your active ${compatibility.label} experiment - ${compatibility.conflictReason}`);
      }
    }
  }
  
  return Array.from(blocked.entries()).map(([intentId, reason]) => ({ intentId, reason }));
}

// Get allowed intents given a list of active experiment intents
export function getAllowedIntents(activeIntentIds: string[]): string[] {
  const blocked = new Set(getBlockedIntents(activeIntentIds).map(b => b.intentId));
  return PRIMARY_INTENTS.map(i => i.id).filter(id => !blocked.has(id));
}
