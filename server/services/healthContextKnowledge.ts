/**
 * Health Context Knowledge Base
 * 
 * Maps health metrics to their physiological significance, potential causes,
 * health implications, and whether deviations are concerning or positive.
 * 
 * This knowledge is used to enrich ML anomaly alerts with educational context
 * so users understand WHY a deviation matters, not just WHAT changed.
 */

export interface MetricHealthContext {
  displayName: string;
  description: string;
  normalSignificance: string;
  
  // Context for when metric goes ABOVE baseline
  aboveBaseline: {
    classification: 'positive' | 'concerning' | 'neutral' | 'context_dependent';
    potentialCauses: string[];
    healthImplications: string[];
    conditionsToConsider: string[];
    actionableAdvice: string;
  };
  
  // Context for when metric goes BELOW baseline
  belowBaseline: {
    classification: 'positive' | 'concerning' | 'neutral' | 'context_dependent';
    potentialCauses: string[];
    healthImplications: string[];
    conditionsToConsider: string[];
    actionableAdvice: string;
  };
}

export const METRIC_HEALTH_CONTEXTS: Record<string, MetricHealthContext> = {
  // ============================================================================
  // TEMPERATURE METRICS
  // ============================================================================
  wrist_temperature_deviation: {
    displayName: 'Body Temperature',
    description: 'Overnight wrist temperature deviation from your personal baseline',
    normalSignificance: 'Body temperature follows a circadian rhythm and reflects metabolic activity, immune function, and hormonal cycles.',
    
    aboveBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Early immune response (fighting off infection)',
        'Hormonal fluctuation (ovulation in women)',
        'Intense exercise in the previous day',
        'Hot sleeping environment',
        'Alcohol consumption before bed',
        'Stress or anxiety',
      ],
      healthImplications: [
        'Your immune system may be activated',
        'Could indicate the early stages of an illness 24-48 hours before symptoms appear',
        'May reflect increased metabolic activity',
      ],
      conditionsToConsider: [
        'Viral or bacterial infection (cold, flu)',
        'Inflammatory response',
        'Overtraining syndrome',
        'Hormonal cycle changes',
      ],
      actionableAdvice: 'Monitor for other symptoms. Consider prioritizing rest and hydration if you feel off.',
    },
    
    belowBaseline: {
      classification: 'neutral',
      potentialCauses: [
        'Cold sleeping environment',
        'Reduced metabolic activity',
        'Recovery from illness',
        'Hormonal changes',
      ],
      healthImplications: [
        'Generally less concerning than elevated temperature',
        'Could indicate good recovery if coming down from illness',
      ],
      conditionsToConsider: [
        'Hypothyroidism (if persistent)',
        'Anemia (if accompanied by fatigue)',
      ],
      actionableAdvice: 'Usually not a concern. Monitor if this persists alongside fatigue or other symptoms.',
    },
  },

  // ============================================================================
  // HEART RATE METRICS
  // ============================================================================
  resting_heart_rate_bpm: {
    displayName: 'Resting Heart Rate',
    description: 'Your heart rate when completely at rest, typically measured overnight',
    normalSignificance: 'A lower resting heart rate generally indicates better cardiovascular fitness and more efficient heart function.',
    
    aboveBaseline: {
      classification: 'concerning',
      potentialCauses: [
        'Physical or emotional stress',
        'Poor sleep quality',
        'Dehydration',
        'Caffeine or stimulant intake',
        'Alcohol consumption',
        'Illness or infection',
        'Overtraining without adequate recovery',
      ],
      healthImplications: [
        'Your body is working harder than usual at rest',
        'Could indicate your nervous system is in a heightened state',
        'May suggest incomplete recovery from exercise or stress',
      ],
      conditionsToConsider: [
        'Autonomic nervous system imbalance',
        'Early signs of illness',
        'Chronic stress or anxiety',
        'Overtraining syndrome',
        'Dehydration',
      ],
      actionableAdvice: 'Prioritize rest and hydration. If elevated for several days, consider reducing exercise intensity.',
    },
    
    belowBaseline: {
      classification: 'positive',
      potentialCauses: [
        'Improved cardiovascular fitness',
        'Good recovery from exercise',
        'Relaxation and quality sleep',
        'Optimal hydration',
      ],
      healthImplications: [
        'Your heart is becoming more efficient',
        'Suggests good recovery and low stress',
        'Often a sign of improving fitness',
      ],
      conditionsToConsider: [
        'Athletic bradycardia (healthy in fit individuals)',
        'Note: Very low RHR with dizziness should be checked',
      ],
      actionableAdvice: 'This is generally positive! Keep up your current healthy habits.',
    },
  },

  hrv_ms: {
    displayName: 'Heart Rate Variability',
    description: 'The variation in time between heartbeats, measured in milliseconds',
    normalSignificance: 'Higher HRV generally indicates better stress resilience, recovery capacity, and overall nervous system balance.',
    
    aboveBaseline: {
      classification: 'positive',
      potentialCauses: [
        'Quality sleep and full recovery',
        'Reduced stress levels',
        'Consistent exercise with adequate rest',
        'Good nutrition and hydration',
        'Relaxation practices (meditation, breathing)',
      ],
      healthImplications: [
        'Your nervous system is well-balanced',
        'Indicates good parasympathetic (rest/recover) activity',
        'Suggests your body is ready for physical or mental challenges',
      ],
      conditionsToConsider: [
        'Optimal autonomic nervous system function',
        'Good stress resilience',
      ],
      actionableAdvice: 'Excellent! Your body is well-recovered. This is a great day for challenging activities.',
    },
    
    belowBaseline: {
      classification: 'concerning',
      potentialCauses: [
        'Accumulated stress (physical or mental)',
        'Poor sleep quality',
        'Alcohol consumption',
        'Illness or fighting infection',
        'Overtraining without recovery',
        'Dehydration',
        'Late-night eating',
      ],
      healthImplications: [
        'Your nervous system may be in a stress-dominant state',
        'Suggests incomplete recovery',
        'Could indicate your body is dealing with a stressor',
      ],
      conditionsToConsider: [
        'Chronic stress or burnout',
        'Sleep disorders',
        'Early signs of illness',
        'Overreaching in training',
        'Autonomic imbalance',
      ],
      actionableAdvice: 'Consider prioritizing rest today. Light activity like walking is fine, but avoid intense workouts.',
    },
  },

  // ============================================================================
  // RESPIRATORY METRICS
  // ============================================================================
  respiratory_rate_bpm: {
    displayName: 'Breathing Rate',
    description: 'The number of breaths per minute during sleep',
    normalSignificance: 'Breathing rate reflects metabolic demand, stress levels, and respiratory health.',
    
    aboveBaseline: {
      classification: 'concerning',
      potentialCauses: [
        'Respiratory infection (cold, flu, COVID)',
        'Allergies or nasal congestion',
        'Sleep apnea episodes',
        'Anxiety or stress',
        'Intense exercise previous day',
        'Hot sleeping environment',
      ],
      healthImplications: [
        'Your body may be working harder to get oxygen',
        'Often one of the earliest signs of respiratory illness',
        'Could indicate increased metabolic demand',
      ],
      conditionsToConsider: [
        'Respiratory infections',
        'Allergies or asthma',
        'Sleep apnea',
        'Fever or illness',
        'Anxiety disorders',
      ],
      actionableAdvice: 'Monitor for respiratory symptoms. If accompanied by fever or cough, consider rest and medical evaluation.',
    },
    
    belowBaseline: {
      classification: 'positive',
      potentialCauses: [
        'Deep, restful sleep',
        'Good respiratory health',
        'Relaxed state',
        'Optimal recovery',
      ],
      healthImplications: [
        'Suggests calm, restorative sleep',
        'Your body is in a relaxed state',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'This is generally a positive sign of restful sleep.',
    },
  },

  // ============================================================================
  // SLEEP METRICS
  // ============================================================================
  sleep_duration_min: {
    displayName: 'Sleep Duration',
    description: 'Total time spent sleeping',
    normalSignificance: 'Adequate sleep (7-9 hours for adults) is essential for recovery, cognitive function, and immune health.',
    
    aboveBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Recovery from sleep debt',
        'Fighting off illness',
        'Increased physical training load',
        'Depression or low mood',
        'Seasonal changes',
      ],
      healthImplications: [
        'Your body may be catching up on needed rest',
        'Could indicate your body needs extra recovery time',
        'May be protective during illness',
      ],
      conditionsToConsider: [
        'Sleep debt recovery',
        'Depression (if persistent)',
        'Chronic fatigue syndrome',
        'Hypothyroidism',
      ],
      actionableAdvice: 'Extra sleep is often your body\'s way of healing. Honor it, but monitor if it persists.',
    },
    
    belowBaseline: {
      classification: 'concerning',
      potentialCauses: [
        'Stress or anxiety',
        'Late-night activities',
        'Caffeine or stimulants',
        'Screen time before bed',
        'Environmental disruptions',
        'Alcohol consumption',
      ],
      healthImplications: [
        'Reduced recovery time for body and brain',
        'May impact cognitive function and mood',
        'Can weaken immune function if chronic',
      ],
      conditionsToConsider: [
        'Insomnia',
        'Sleep anxiety',
        'Circadian rhythm disruption',
        'Stress-related sleep issues',
      ],
      actionableAdvice: 'Prioritize getting to bed earlier tonight. Avoid caffeine after noon and screens before bed.',
    },
  },

  deep_sleep_min: {
    displayName: 'Deep Sleep',
    description: 'Time spent in slow-wave deep sleep stages',
    normalSignificance: 'Deep sleep is critical for physical recovery, immune function, and memory consolidation.',
    
    aboveBaseline: {
      classification: 'positive',
      potentialCauses: [
        'Quality sleep environment',
        'Physical exercise earlier in day',
        'Good sleep timing consistency',
        'Optimal nutrition',
      ],
      healthImplications: [
        'Excellent for physical recovery and tissue repair',
        'Supports immune function',
        'Indicates quality sleep architecture',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Great sign! Your body is getting quality restorative sleep.',
    },
    
    belowBaseline: {
      classification: 'concerning',
      potentialCauses: [
        'Alcohol consumption',
        'Late-night eating',
        'Inconsistent sleep schedule',
        'Stress or anxiety',
        'Hot sleeping environment',
        'Exercise too close to bedtime',
      ],
      healthImplications: [
        'Reduced physical recovery',
        'May affect immune function',
        'Could impact hormone regulation',
      ],
      conditionsToConsider: [
        'Sleep apnea',
        'Alcohol-related sleep disruption',
        'Age-related changes',
        'Chronic stress',
      ],
      actionableAdvice: 'Avoid alcohol, late meals, and exercise within 3 hours of bedtime.',
    },
  },

  // Percentage variant of deep sleep
  deep_sleep_pct: {
    displayName: 'Deep Sleep Percentage',
    description: 'Proportion of total sleep time spent in slow-wave deep sleep',
    normalSignificance: 'The percentage of deep sleep indicates overall sleep quality - healthy adults typically get 13-23% deep sleep.',
    
    aboveBaseline: {
      classification: 'positive',
      potentialCauses: [
        'Quality sleep environment',
        'Physical exercise earlier in day',
        'Good sleep timing consistency',
        'Optimal nutrition and hydration',
        'Avoiding alcohol',
      ],
      healthImplications: [
        'Excellent for physical recovery and tissue repair',
        'Supports immune function and healing',
        'Indicates quality sleep architecture',
        'Optimizes growth hormone release',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Great sign! Your body is getting quality restorative sleep. Keep doing what you\'re doing!',
    },
    
    belowBaseline: {
      classification: 'concerning',
      potentialCauses: [
        'Alcohol consumption',
        'Late-night eating',
        'Inconsistent sleep schedule',
        'Stress or anxiety',
        'Hot sleeping environment',
        'Exercise too close to bedtime',
        'Caffeine in the afternoon',
      ],
      healthImplications: [
        'Reduced physical recovery and tissue repair',
        'May affect immune function',
        'Could impact hormone regulation and metabolism',
        'Less time for memory consolidation',
      ],
      conditionsToConsider: [
        'Sleep apnea',
        'Alcohol-related sleep disruption',
        'Age-related changes (deep sleep naturally decreases with age)',
        'Chronic stress',
        'Sleep fragmentation',
      ],
      actionableAdvice: 'Avoid alcohol, late meals, and exercise within 3 hours of bedtime. Keep your bedroom cool (65-68°F).',
    },
  },

  // Skin temperature metrics
  skin_temp_deviation_c: {
    displayName: 'Skin Temperature',
    description: 'Deviation of skin temperature from your personal baseline',
    normalSignificance: 'Skin temperature reflects your body\'s thermoregulation and can indicate immune activity, hormonal changes, or metabolic state.',
    
    aboveBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Immune response or early illness',
        'Hormonal fluctuations (menstrual cycle)',
        'Increased metabolic rate',
        'Environmental temperature changes',
        'Intense exercise or recovery',
        'Ovulation phase',
      ],
      healthImplications: [
        'May indicate your immune system is actively fighting something',
        'Could reflect hormonal changes throughout the cycle',
        'Often precedes symptom onset by 1-3 days during illness',
        'May indicate increased metabolic activity',
      ],
      conditionsToConsider: [
        'Early-stage illness or infection',
        'Hormonal changes (check cycle phase)',
        'Inflammatory response',
        'Thyroid changes (if persistent)',
      ],
      actionableAdvice: 'Monitor how you feel. If elevated for 2+ days with fatigue, consider extra rest and hydration.',
    },
    
    belowBaseline: {
      classification: 'neutral',
      potentialCauses: [
        'Cold environment',
        'Reduced activity level',
        'Recovery from illness',
        'Normal daily variation',
        'Follicular phase (post-menstruation)',
      ],
      healthImplications: [
        'Often reflects recovery after illness or immune activity',
        'May indicate lower metabolic state',
        'Could be normal variation with environment or activity',
      ],
      conditionsToConsider: [
        'Check if recovering from recent illness',
        'Consider environmental factors',
        'Hypothyroidism (only if persistently low with other symptoms)',
      ],
      actionableAdvice: 'Usually nothing to worry about. If you\'ve been ill, this often signals recovery.',
    },
  },

  skin_temp_trend_deviation_c: {
    displayName: 'Skin Temperature Trend',
    description: 'Trend direction of skin temperature over recent nights',
    normalSignificance: 'Temperature trends can signal emerging illness, hormonal patterns, or recovery status before you feel symptoms.',
    
    aboveBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Early illness developing',
        'Hormonal cycle changes',
        'Increased stress',
        'Recovery from intense training',
        'Environmental heat',
      ],
      healthImplications: [
        'Rising temperature trend often precedes illness by 1-3 days',
        'May indicate your immune system is ramping up',
        'Can reflect hormonal shifts in menstrual cycle',
      ],
      conditionsToConsider: [
        'Developing infection or illness',
        'Hormonal changes',
        'Overtraining (if combined with other recovery signs)',
      ],
      actionableAdvice: 'Pay attention to how you feel. Consider extra rest, hydration, and vitamin C if trend continues.',
    },
    
    belowBaseline: {
      classification: 'positive',
      potentialCauses: [
        'Recovery from illness',
        'Good recovery from training',
        'Hormonal cycle (follicular phase)',
        'Well-regulated thermoregulation',
      ],
      healthImplications: [
        'Often indicates good recovery status',
        'May signal resolved inflammation or infection',
        'Suggests well-regulated metabolism',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Good sign! Your body appears well-regulated. Keep up your current routine.',
    },
  },

  rem_sleep_min: {
    displayName: 'REM Sleep',
    description: 'Time spent in rapid eye movement sleep',
    normalSignificance: 'REM sleep is essential for cognitive function, emotional processing, and memory consolidation.',
    
    aboveBaseline: {
      classification: 'positive',
      potentialCauses: [
        'Good sleep quality',
        'Sufficient total sleep',
        'Consistent sleep schedule',
        'Reduced alcohol consumption',
      ],
      healthImplications: [
        'Supports learning and memory',
        'Helps with emotional regulation',
        'Indicates healthy sleep architecture',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Excellent for cognitive function and emotional health!',
    },
    
    belowBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Alcohol consumption',
        'Sleep deprivation (REM rebound)',
        'Certain medications',
        'Disrupted sleep',
        'Waking early',
      ],
      healthImplications: [
        'May affect memory consolidation',
        'Could impact emotional processing',
      ],
      conditionsToConsider: [
        'Alcohol-induced REM suppression',
        'Sleep apnea',
        'Medication effects',
      ],
      actionableAdvice: 'REM sleep occurs more in later sleep cycles. Getting more total sleep often helps.',
    },
  },

  // ============================================================================
  // ACTIVITY METRICS
  // ============================================================================
  steps: {
    displayName: 'Steps',
    description: 'Total daily step count',
    normalSignificance: 'Daily movement supports cardiovascular health, metabolic function, and mental wellbeing.',
    
    aboveBaseline: {
      classification: 'positive',
      potentialCauses: [
        'More active day than usual',
        'Walking meetings or commute',
        'Recreational activity',
        'Travel or exploration',
      ],
      healthImplications: [
        'Supports cardiovascular health',
        'Helps regulate blood sugar',
        'Positive for mental health',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Great job staying active! Ensure adequate hydration and recovery sleep.',
    },
    
    belowBaseline: {
      classification: 'neutral',
      potentialCauses: [
        'Sedentary work day',
        'Rest day from exercise',
        'Weather or circumstances',
        'Recovery day',
      ],
      healthImplications: [
        'Occasional low-activity days are normal',
        'Chronic low activity can affect metabolism and mood',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Try to get some movement in, even a short walk helps!',
    },
  },

  active_energy_kcal: {
    displayName: 'Active Energy',
    description: 'Calories burned through activity beyond resting metabolism',
    normalSignificance: 'Active energy expenditure reflects physical activity levels and metabolic health.',
    
    aboveBaseline: {
      classification: 'positive',
      potentialCauses: [
        'More intense or longer exercise',
        'Higher overall activity level',
        'Active recreation or sports',
      ],
      healthImplications: [
        'Supports weight management',
        'Improves cardiovascular fitness',
        'Helps regulate blood sugar',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Nice work! Ensure proper nutrition and recovery to support this activity level.',
    },
    
    belowBaseline: {
      classification: 'neutral',
      potentialCauses: [
        'Rest or recovery day',
        'Sedentary circumstances',
        'Scheduled deload week',
        'Weather or external factors',
      ],
      healthImplications: [
        'Occasional lower activity is fine',
        'Important to balance rest and activity',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Rest days are important for recovery. Just be mindful if this becomes a pattern.',
    },
  },

  // ============================================================================
  // BODY COMPOSITION METRICS
  // ============================================================================
  body_fat_percent: {
    displayName: 'Body Fat Percentage',
    description: 'Percentage of body mass composed of fat tissue',
    normalSignificance: 'Body fat percentage affects metabolic health, hormone production, and overall health risks.',
    
    aboveBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Caloric surplus',
        'Reduced physical activity',
        'Hormonal changes',
        'Measurement timing (hydration, meals)',
        'Normal fluctuation',
      ],
      healthImplications: [
        'Small fluctuations are normal',
        'Sustained increases may affect metabolic health',
      ],
      conditionsToConsider: [
        'Consider if this is part of a trend vs. daily fluctuation',
      ],
      actionableAdvice: 'Daily fluctuations are normal. Focus on weekly/monthly trends rather than daily readings.',
    },
    
    belowBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Fat loss from caloric deficit',
        'Increased physical activity',
        'Measurement timing',
        'Normal fluctuation',
      ],
      healthImplications: [
        'If intentional, indicates progress toward body composition goals',
        'Very low body fat can affect hormone production',
      ],
      conditionsToConsider: [
        'Ensure adequate nutrition if actively losing fat',
      ],
      actionableAdvice: 'If this aligns with your goals, great progress! Ensure adequate protein intake.',
    },
  },

  weight_kg: {
    displayName: 'Body Weight',
    description: 'Total body mass in kilograms',
    normalSignificance: 'Weight fluctuates daily based on hydration, meals, and other factors.',
    
    aboveBaseline: {
      classification: 'neutral',
      potentialCauses: [
        'Water retention',
        'Higher sodium intake',
        'Muscle gain from training',
        'Meal timing',
        'Menstrual cycle',
      ],
      healthImplications: [
        'Daily fluctuations of 1-2kg are completely normal',
        'Weekly averages are more meaningful than daily readings',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Focus on weekly trends. Weigh at the same time daily for consistency.',
    },
    
    belowBaseline: {
      classification: 'neutral',
      potentialCauses: [
        'Lower water retention',
        'Morning weigh-in timing',
        'Active day previously',
        'Intentional weight management',
      ],
      healthImplications: [
        'Daily fluctuations are normal',
        'Rapid unintentional weight loss should be monitored',
      ],
      conditionsToConsider: [],
      actionableAdvice: 'Normal variation. Unintentional rapid weight loss should be discussed with a doctor.',
    },
  },

  // ============================================================================
  // BLOOD GLUCOSE
  // ============================================================================
  avg_glucose_mg_dl: {
    displayName: 'Blood Glucose',
    description: 'Average blood glucose levels from continuous monitoring',
    normalSignificance: 'Blood glucose regulation affects energy, cognitive function, and long-term metabolic health.',
    
    aboveBaseline: {
      classification: 'concerning',
      potentialCauses: [
        'High carbohydrate meal',
        'Poor sleep',
        'Stress response',
        'Reduced physical activity',
        'Dawn phenomenon',
        'Illness or infection',
      ],
      healthImplications: [
        'May affect energy levels and cognitive function',
        'Chronically elevated glucose affects metabolic health',
        'Could indicate insulin sensitivity changes',
      ],
      conditionsToConsider: [
        'Insulin resistance',
        'Pre-diabetes',
        'Stress-induced glucose elevation',
        'Dietary factors',
      ],
      actionableAdvice: 'A short walk after meals helps. Consider meal composition and stress management.',
    },
    
    belowBaseline: {
      classification: 'context_dependent',
      potentialCauses: [
        'Good glucose control',
        'Physical activity',
        'Low carbohydrate intake',
        'Fasting state',
      ],
      healthImplications: [
        'May indicate good metabolic health and insulin sensitivity',
        'Very low glucose can cause symptoms (shakiness, confusion)',
      ],
      conditionsToConsider: [
        'Hypoglycemia if symptomatic',
      ],
      actionableAdvice: 'If you feel fine, this is often a positive sign of good metabolic health.',
    },
  },
};

/**
 * Get health context for a specific metric and direction
 */
export function getMetricHealthContext(
  metricType: string,
  direction: 'above' | 'below'
): {
  displayName: string;
  description: string;
  classification: 'positive' | 'concerning' | 'neutral' | 'context_dependent';
  potentialCauses: string[];
  healthImplications: string[];
  conditionsToConsider: string[];
  actionableAdvice: string;
} | null {
  const context = METRIC_HEALTH_CONTEXTS[metricType];
  if (!context) {
    return null;
  }

  const directionContext = direction === 'above' 
    ? context.aboveBaseline 
    : context.belowBaseline;

  return {
    displayName: context.displayName,
    description: context.description,
    classification: directionContext.classification,
    potentialCauses: directionContext.potentialCauses,
    healthImplications: directionContext.healthImplications,
    conditionsToConsider: directionContext.conditionsToConsider,
    actionableAdvice: directionContext.actionableAdvice,
  };
}

/**
 * Get classification label for display
 */
export function getClassificationLabel(
  classification: 'positive' | 'concerning' | 'neutral' | 'context_dependent'
): { label: string; emoji: string; color: string } {
  switch (classification) {
    case 'positive':
      return { label: 'Positive Sign', emoji: '✅', color: 'green' };
    case 'concerning':
      return { label: 'Worth Monitoring', emoji: '⚠️', color: 'amber' };
    case 'neutral':
      return { label: 'Normal Variation', emoji: 'ℹ️', color: 'blue' };
    case 'context_dependent':
      return { label: 'Context Matters', emoji: '🔍', color: 'purple' };
  }
}
