import { z } from 'zod';

// ==================== USER PROFILE TYPES ====================

export const BriefingPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  notification_morning_hour: z.number().min(4).max(12).default(7),
  preferred_tone: z.enum(['supportive', 'direct', 'analytical', 'motivational']).default('supportive'),
  show_weather: z.boolean().default(true),
  show_recommendations: z.boolean().default(true),
});

export const BehaviorPatternsSchema = z.object({
  caffeine_sensitivity: z.enum(['high', 'moderate', 'low']).optional(),
  alcohol_hrv_impact: z.enum(['significant', 'moderate', 'minimal']).optional(),
  night_owl: z.boolean().optional(),
  three_pm_slump: z.boolean().optional(),
  morning_workout_preference: z.boolean().optional(),
  sleep_debt_sensitive: z.boolean().optional(),
  stress_responsive: z.boolean().optional(),
});

export const ConstraintsSchema = z.object({
  injuries: z.array(z.string()).optional(),
  no_high_impact: z.boolean().optional(),
  doctor_flags: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  dietary_restrictions: z.array(z.string()).optional(),
});

export const EngagementPreferencesSchema = z.object({
  high_response_focus_areas: z.array(z.string()).default([]),
  low_response_focus_areas: z.array(z.string()).default([]),
  avg_feedback_score: z.number().nullable().default(null),
});

export type BriefingPreferences = z.infer<typeof BriefingPreferencesSchema>;
export type BehaviorPatterns = z.infer<typeof BehaviorPatternsSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type EngagementPreferences = z.infer<typeof EngagementPreferencesSchema>;

// ==================== DAILY INSIGHTS TYPES ====================

export interface BaselineMetrics {
  hrv_mean: number;
  hrv_std: number;
  rhr_mean: number;
  rhr_std: number;
  sleep_duration_mean: number;
  sleep_duration_std: number;
  deep_sleep_mean: number;
  steps_mean: number;
  active_energy_mean: number;
  weight_mean?: number;
}

export interface TodayMetrics {
  hrv: number | null;
  rhr: number | null;
  sleep_hours: number | null;
  deep_sleep_minutes: number | null;
  rem_sleep_minutes: number | null;
  sleep_efficiency: number | null;
  steps: number | null;
  active_energy: number | null;
  workout_minutes: number | null;
  weight?: number | null;
  readiness_score: number | null;
}

export interface MetricDeviation {
  metric: string;
  current_value: number;
  baseline_value: number;
  deviation_pct: number;
  z_score: number;
  direction: 'above' | 'below' | 'normal';
  severity: 'significant' | 'moderate' | 'mild' | 'normal';
}

export interface DailyUserInsight {
  health_id: string;
  event_date: string;
  context_type: 'morning_briefing';
  baselines: BaselineMetrics;
  today: TodayMetrics;
  deviations: MetricDeviation[];
  tags: string[];
  insight_candidates: string[];
  weather?: {
    temp_c: number;
    condition: string;
    humidity: number;
    feels_like_c: number;
  };
}

// ==================== AI REQUEST/RESPONSE TYPES ====================

export const AIRequestPayloadSchema = z.object({
  user_profile: z.object({
    name: z.string().optional(),
    goals: z.array(z.string()).optional(),
    preferences: BriefingPreferencesSchema,
    constraints: ConstraintsSchema.optional(),
    behavior_patterns: BehaviorPatternsSchema.optional(),
    engagement_preferences: EngagementPreferencesSchema.optional(),
  }),
  insight_packet: z.object({
    event_date: z.string(),
    readiness_score: z.number().nullable(),
    baselines: z.record(z.number()),
    today: z.record(z.number().nullable()),
    deviations: z.array(z.object({
      metric: z.string(),
      current_value: z.number(),
      baseline_value: z.number(),
      deviation_pct: z.number(),
      z_score: z.number(),
      direction: z.enum(['above', 'below', 'normal']),
      severity: z.enum(['significant', 'moderate', 'mild', 'normal']),
    })),
    tags: z.array(z.string()),
    insight_candidates: z.array(z.string()),
    weather: z.object({
      temp_c: z.number(),
      condition: z.string(),
      humidity: z.number(),
      feels_like_c: z.number(),
    }).optional(),
    recent_activity: z.object({
      type: z.string(),
      when: z.string(),
      duration_minutes: z.number().optional(),
    }).optional(),
    sleep_summary: z.object({
      total_hours: z.number(),
      deep_sleep_minutes: z.number(),
      quality: z.enum(['excellent', 'good', 'fair', 'poor']),
      hrv_avg: z.number().nullable(),
    }).optional(),
  }),
  meta: z.object({
    timestamp: z.string(),
    timezone: z.string(),
    recent_notifications_summary: z.string().optional(),
  }),
});

export const AIResponsePayloadSchema = z.object({
  primary_focus: z.string(),
  secondary_focus: z.string().optional(),
  recommended_actions: z.array(z.string()),
  push_text: z.string().max(200),
  briefing_content: z.object({
    greeting: z.string(),
    readiness_insight: z.string(),
    sleep_insight: z.string(),
    recommendation: z.string(),
    weather_note: z.string().optional(),
  }),
  debug_explanation: z.string().optional(),
});

export type AIRequestPayload = z.infer<typeof AIRequestPayloadSchema>;
export type AIResponsePayload = z.infer<typeof AIResponsePayloadSchema>;

// ==================== BRIEFING LOG TYPES ====================

export interface MorningBriefingLog {
  briefing_id: string;
  health_id: string;
  event_date: string;
  created_at: Date;
  ai_request_payload: AIRequestPayload;
  ai_response_payload: AIResponsePayload;
  push_text: string;
  primary_focus: string;
  secondary_focus?: string;
  recommended_actions: string[];
  push_status: 'pending' | 'sent' | 'failed' | 'delivered';
  push_sent_at?: Date;
  push_error?: string;
  opened_at?: Date;
  clicked_through: boolean;
  user_feedback?: 'thumbs_up' | 'thumbs_down' | null;
  feedback_comment?: string;
  feedback_at?: Date;
  trigger_source: 'sleep_end' | 'scheduled' | 'manual';
}

// ==================== BRIEFING DISPLAY TYPES (Frontend) ====================

export interface MorningBriefingData {
  briefing_id: string;
  event_date: string;
  readiness_score: number;
  sleep_data: {
    total_hours: number;
    deep_sleep_minutes: number;
    deep_sleep_quality: 'excellent' | 'good' | 'fair' | 'poor';
    hrv_avg: number | null;
  };
  recent_activity?: {
    type: string;
    when: string;
    impact: string;
  };
  recommendation: string;
  weather?: {
    temp_f: number;
    temp_c: number;
    condition: string;
    description: string;
    humidity: number;
    feels_like_f: number;
    feels_like_c: number;
  };
  greeting: string;
  readiness_insight: string;
  sleep_insight: string;
}

export function validateAIResponse(response: unknown): AIResponsePayload | null {
  try {
    return AIResponsePayloadSchema.parse(response);
  } catch (error) {
    console.error('[MorningBriefing] Invalid AI response:', error);
    return null;
  }
}

export function validateAIRequest(request: unknown): AIRequestPayload | null {
  try {
    return AIRequestPayloadSchema.parse(request);
  } catch (error) {
    console.error('[MorningBriefing] Invalid AI request:', error);
    return null;
  }
}
