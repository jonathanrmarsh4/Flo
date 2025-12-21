import { logger } from '../logger';
import { getSupabaseClient } from './supabaseClient';

/**
 * Active Life Events Service
 * Manages duration-based life events that affect ML sensitivity and notifications
 * 
 * Example flow:
 * 1. User says "I'm traveling without my smart water bottle"
 * 2. lifeEventParser extracts: type=travel, affected_metrics=[water_intake], duration=7 days
 * 3. This service stores it as an active life event
 * 4. When anomaly detection finds low water intake, it checks active events
 * 5. If travel event is active, suppress the notification or add context
 */

export interface ActiveLifeEvent {
  id: string;
  healthId: string;
  eventType: string;
  details: Record<string, any>;
  notes: string | null;
  happenedAt: Date;
  isActive: boolean;
  endsAt: Date | null;
  affectedMetrics: string[];
  suppressionAction: 'none' | 'suppress' | 'adjust_threshold' | 'context_only';
  thresholdMultiplier: number;
  userExplanation: string | null;
  source: 'chat' | 'check_in' | 'manual' | 'inferred';
}

export interface CheckInPrompt {
  id: string;
  healthId: string;
  triggerType: 'persistent_anomaly' | 'sudden_change' | 'pattern_break' | 'scheduled';
  triggerMetric: string;
  triggerDetails: Record<string, any>;
  anomalyDays: number;
  deviationPercent: number | null;
  baselineValue: number | null;
  currentValue: number | null;
  promptMessage: string;
  suggestedResponses: string[];
  status: 'pending' | 'sent' | 'answered' | 'dismissed' | 'expired';
  sentAt: Date | null;
  answeredAt: Date | null;
  responseText: string | null;
  resultingLifeEventId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

// Mapping of life event types to typically affected metrics
export const EVENT_TYPE_METRIC_MAPPING: Record<string, string[]> = {
  travel: ['water_intake', 'steps', 'active_energy', 'exercise_minutes', 'sleep_duration_min', 'deep_sleep_min'],
  illness: ['steps', 'active_energy', 'exercise_minutes', 'hrv_ms', 'resting_heart_rate_bpm', 'respiratory_rate_bpm', 'oxygen_saturation_pct'],
  stress: ['hrv_ms', 'resting_heart_rate_bpm', 'sleep_duration_min', 'deep_sleep_min', 'rem_sleep_min'],
  injury: ['steps', 'active_energy', 'exercise_minutes', 'workout_minutes'],
  rest_day: ['steps', 'active_energy', 'exercise_minutes', 'workout_minutes'],
  alcohol: ['hrv_ms', 'resting_heart_rate_bpm', 'deep_sleep_min', 'rem_sleep_min', 'sleep_quality'],
  equipment_unavailable: ['water_intake', 'steps'], // e.g., no smart water bottle, no phone for step tracking
  social_event: ['sleep_duration_min', 'bedtime'],
  caffeine: ['resting_heart_rate_bpm', 'hrv_ms', 'sleep_duration_min'],
  jet_lag: ['sleep_duration_min', 'deep_sleep_min', 'rem_sleep_min', 'bedtime', 'wake_time'],
  menstrual_cycle: ['body_temperature_deviation', 'hrv_ms', 'resting_heart_rate_bpm'],
  altitude: ['oxygen_saturation_pct', 'resting_heart_rate_bpm', 'hrv_ms'],
  fasting: ['water_intake', 'active_energy', 'blood_glucose'],
  medication_change: ['hrv_ms', 'resting_heart_rate_bpm', 'blood_pressure'],
};

// Default durations for life event types (in days)
export const EVENT_TYPE_DEFAULT_DURATION: Record<string, number> = {
  travel: 7,
  illness: 5,
  stress: 3,
  injury: 14,
  rest_day: 1,
  alcohol: 2,
  equipment_unavailable: 7,
  social_event: 1,
  caffeine: 1,
  jet_lag: 5,
  menstrual_cycle: 5,
  altitude: 7,
  fasting: 1,
  medication_change: 14,
};

class ActiveLifeEventsService {
  private supabase = getSupabaseClient();

  /**
   * Create a new active life event with duration and affected metrics
   */
  async createActiveLifeEvent(params: {
    healthId: string;
    eventType: string;
    details?: Record<string, any>;
    notes?: string;
    happenedAt?: Date;
    durationDays?: number;
    affectedMetrics?: string[];
    suppressionAction?: 'none' | 'suppress' | 'adjust_threshold' | 'context_only';
    thresholdMultiplier?: number;
    userExplanation?: string;
    source?: 'chat' | 'check_in' | 'manual' | 'inferred';
  }): Promise<ActiveLifeEvent | null> {
    try {
      const {
        healthId,
        eventType,
        details = {},
        notes,
        happenedAt = new Date(),
        durationDays,
        affectedMetrics,
        suppressionAction = 'context_only',
        thresholdMultiplier = 1.5,
        userExplanation,
        source = 'chat',
      } = params;

      // Calculate affected metrics from event type if not provided
      const metrics = affectedMetrics || EVENT_TYPE_METRIC_MAPPING[eventType] || [];
      
      // Calculate end date from duration
      const duration = durationDays || EVENT_TYPE_DEFAULT_DURATION[eventType] || 3;
      const endsAt = new Date(happenedAt.getTime() + duration * 24 * 60 * 60 * 1000);

      const { data, error } = await this.supabase
        .from('life_events')
        .insert({
          health_id: healthId,
          event_type: eventType,
          details,
          notes: notes || null,
          happened_at: happenedAt.toISOString(),
          is_active: true,
          ends_at: endsAt.toISOString(),
          affected_metrics: metrics,
          suppression_action: suppressionAction,
          threshold_multiplier: thresholdMultiplier,
          user_explanation: userExplanation || null,
          source,
        })
        .select()
        .single();

      if (error) {
        logger.error('[ActiveLifeEvents] Failed to create active life event:', error);
        return null;
      }

      logger.info('[ActiveLifeEvents] Created active life event', {
        healthId,
        eventType,
        affectedMetrics: metrics,
        endsAt: endsAt.toISOString(),
        suppressionAction,
      });

      return this.mapToActiveLifeEvent(data);
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error creating active life event:', error);
      return null;
    }
  }

  /**
   * Get all currently active life events for a user
   */
  async getActiveLifeEvents(healthId: string): Promise<ActiveLifeEvent[]> {
    try {
      // First, deactivate expired events
      await this.deactivateExpiredEvents(healthId);

      const { data, error } = await this.supabase
        .from('life_events')
        .select('*')
        .eq('health_id', healthId)
        .eq('is_active', true)
        .order('happened_at', { ascending: false });

      if (error) {
        logger.error('[ActiveLifeEvents] Failed to get active events:', error);
        return [];
      }

      return (data || []).map(this.mapToActiveLifeEvent);
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error getting active events:', error);
      return [];
    }
  }

  /**
   * Check if a specific metric should be suppressed based on active life events
   */
  async shouldSuppressMetric(healthId: string, metricType: string): Promise<{
    suppress: boolean;
    reason?: string;
    thresholdMultiplier?: number;
    activeEvent?: ActiveLifeEvent;
  }> {
    try {
      const activeEvents = await this.getActiveLifeEvents(healthId);

      for (const event of activeEvents) {
        if (event.affectedMetrics.includes(metricType)) {
          if (event.suppressionAction === 'suppress') {
            return {
              suppress: true,
              reason: event.userExplanation || `Active life event: ${event.eventType}`,
              activeEvent: event,
            };
          } else if (event.suppressionAction === 'adjust_threshold') {
            return {
              suppress: false,
              thresholdMultiplier: event.thresholdMultiplier,
              reason: event.userExplanation || `Threshold adjusted for: ${event.eventType}`,
              activeEvent: event,
            };
          } else if (event.suppressionAction === 'context_only') {
            return {
              suppress: false,
              reason: event.userExplanation || `Context: ${event.eventType}`,
              activeEvent: event,
            };
          }
        }
      }

      return { suppress: false };
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error checking suppression:', error);
      return { suppress: false };
    }
  }

  /**
   * Get context string for AI insight generation based on active life events
   */
  async getActiveContextForAI(healthId: string): Promise<string | null> {
    try {
      const activeEvents = await this.getActiveLifeEvents(healthId);
      
      if (activeEvents.length === 0) {
        return null;
      }

      const contextParts = activeEvents.map(event => {
        const duration = event.endsAt 
          ? `until ${event.endsAt.toLocaleDateString()}`
          : 'ongoing';
        
        let context = `- ${event.eventType.replace(/_/g, ' ')} (${duration})`;
        if (event.userExplanation) {
          context += `: "${event.userExplanation}"`;
        }
        if (event.affectedMetrics.length > 0) {
          context += ` [affects: ${event.affectedMetrics.join(', ')}]`;
        }
        return context;
      });

      return `ACTIVE LIFE EVENTS (consider these when interpreting anomalies):\n${contextParts.join('\n')}`;
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error getting AI context:', error);
      return null;
    }
  }

  /**
   * End an active life event manually
   */
  async endLifeEvent(eventId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('life_events')
        .update({ is_active: false, ends_at: new Date().toISOString() })
        .eq('id', eventId);

      if (error) {
        logger.error('[ActiveLifeEvents] Failed to end life event:', error);
        return false;
      }

      logger.info('[ActiveLifeEvents] Ended life event', { eventId });
      return true;
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error ending life event:', error);
      return false;
    }
  }

  /**
   * Deactivate expired life events
   */
  private async deactivateExpiredEvents(healthId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('life_events')
        .update({ is_active: false })
        .eq('health_id', healthId)
        .eq('is_active', true)
        .lt('ends_at', new Date().toISOString());

      if (error) {
        logger.error('[ActiveLifeEvents] Failed to deactivate expired events:', error);
      }
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error deactivating expired events:', error);
    }
  }

  /**
   * Create a check-in prompt for a persistent anomaly
   */
  async createCheckInPrompt(params: {
    healthId: string;
    triggerType: 'persistent_anomaly' | 'sudden_change' | 'pattern_break' | 'scheduled';
    triggerMetric: string;
    anomalyDays?: number;
    deviationPercent?: number;
    baselineValue?: number;
    currentValue?: number;
    triggerDetails?: Record<string, any>;
  }): Promise<CheckInPrompt | null> {
    try {
      const {
        healthId,
        triggerType,
        triggerMetric,
        anomalyDays = 1,
        deviationPercent,
        baselineValue,
        currentValue,
        triggerDetails = {},
      } = params;

      // Generate contextual prompt message
      const promptMessage = this.generateCheckInMessage(triggerType, triggerMetric, anomalyDays, deviationPercent);
      
      // Generate suggested responses based on metric type
      const suggestedResponses = this.generateSuggestedResponses(triggerMetric);

      const { data, error } = await this.supabase
        .from('check_in_prompts')
        .insert({
          health_id: healthId,
          trigger_type: triggerType,
          trigger_metric: triggerMetric,
          trigger_details: triggerDetails,
          anomaly_days: anomalyDays,
          deviation_percent: deviationPercent || null,
          baseline_value: baselineValue || null,
          current_value: currentValue || null,
          prompt_message: promptMessage,
          suggested_responses: suggestedResponses,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        logger.error('[ActiveLifeEvents] Failed to create check-in prompt:', error);
        return null;
      }

      logger.info('[ActiveLifeEvents] Created check-in prompt', {
        healthId,
        triggerType,
        triggerMetric,
        anomalyDays,
      });

      return this.mapToCheckInPrompt(data);
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error creating check-in prompt:', error);
      return null;
    }
  }

  /**
   * Get pending check-in prompts for a user
   */
  async getPendingCheckIns(healthId: string): Promise<CheckInPrompt[]> {
    try {
      const { data, error } = await this.supabase
        .from('check_in_prompts')
        .select('*')
        .eq('health_id', healthId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        logger.error('[ActiveLifeEvents] Failed to get pending check-ins:', error);
        return [];
      }

      return (data || []).map(this.mapToCheckInPrompt);
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error getting pending check-ins:', error);
      return [];
    }
  }

  /**
   * Mark a check-in as answered and optionally create a life event from it
   */
  async answerCheckIn(
    checkInId: string, 
    responseText: string, 
    createLifeEvent?: {
      eventType: string;
      affectedMetrics?: string[];
      durationDays?: number;
      suppressionAction?: 'none' | 'suppress' | 'adjust_threshold' | 'context_only';
    }
  ): Promise<boolean> {
    try {
      let resultingLifeEventId: string | null = null;

      // Get the check-in first to get healthId
      const { data: checkIn, error: fetchError } = await this.supabase
        .from('check_in_prompts')
        .select('*')
        .eq('id', checkInId)
        .single();

      if (fetchError || !checkIn) {
        logger.error('[ActiveLifeEvents] Check-in not found:', checkInId);
        return false;
      }

      // Create life event if requested
      if (createLifeEvent) {
        const lifeEvent = await this.createActiveLifeEvent({
          healthId: checkIn.health_id,
          eventType: createLifeEvent.eventType,
          affectedMetrics: createLifeEvent.affectedMetrics || [checkIn.trigger_metric],
          durationDays: createLifeEvent.durationDays,
          suppressionAction: createLifeEvent.suppressionAction || 'context_only',
          userExplanation: responseText,
          source: 'check_in',
        });

        if (lifeEvent) {
          resultingLifeEventId = lifeEvent.id;
        }
      }

      // Update the check-in
      const { error } = await this.supabase
        .from('check_in_prompts')
        .update({
          status: 'answered',
          answered_at: new Date().toISOString(),
          response_text: responseText,
          resulting_life_event_id: resultingLifeEventId,
        })
        .eq('id', checkInId);

      if (error) {
        logger.error('[ActiveLifeEvents] Failed to answer check-in:', error);
        return false;
      }

      logger.info('[ActiveLifeEvents] Answered check-in', {
        checkInId,
        createdLifeEvent: !!resultingLifeEventId,
      });

      return true;
    } catch (error: any) {
      logger.error('[ActiveLifeEvents] Error answering check-in:', error);
      return false;
    }
  }

  /**
   * Generate a human-friendly check-in message
   */
  private generateCheckInMessage(
    triggerType: string,
    metricType: string,
    anomalyDays: number,
    deviationPercent?: number
  ): string {
    const metricName = this.humanizeMetricName(metricType);
    const deviationText = deviationPercent 
      ? `(${Math.abs(deviationPercent).toFixed(0)}% ${deviationPercent < 0 ? 'lower' : 'higher'} than usual)` 
      : '';

    if (triggerType === 'persistent_anomaly') {
      if (anomalyDays === 1) {
        return `Your ${metricName} has been unusual today ${deviationText}. Is there anything going on that might explain this?`;
      } else {
        return `Your ${metricName} has been ${deviationPercent && deviationPercent < 0 ? 'lower' : 'different'} than normal for ${anomalyDays} days now ${deviationText}. Is there a reason for this?`;
      }
    } else if (triggerType === 'sudden_change') {
      return `I noticed a sudden change in your ${metricName} ${deviationText}. Did something happen?`;
    } else if (triggerType === 'pattern_break') {
      return `Your usual ${metricName} pattern seems different lately. Is everything okay?`;
    }

    return `I'd love to check in about your ${metricName}. Anything you'd like to share?`;
  }

  /**
   * Generate suggested quick responses based on metric type
   */
  private generateSuggestedResponses(metricType: string): string[] {
    const commonResponses = [
      "I've been traveling",
      "I'm not feeling well",
      "Just a busy week",
      "Equipment/device issue",
    ];

    const metricSpecific: Record<string, string[]> = {
      water_intake: [...commonResponses, "Forgot my water bottle", "Different climate"],
      steps: [...commonResponses, "Working from home", "Rest day", "Injury"],
      active_energy: [...commonResponses, "Taking a break", "Recovering from illness"],
      exercise_minutes: [...commonResponses, "Rest week", "Gym closed", "Injury"],
      hrv_ms: [...commonResponses, "Poor sleep", "Stressed", "Had alcohol"],
      sleep_duration_min: [...commonResponses, "Social events", "Time zone change", "Stress"],
      deep_sleep_min: [...commonResponses, "Had alcohol", "Ate late", "New environment"],
    };

    return metricSpecific[metricType] || commonResponses;
  }

  /**
   * Convert metric_type to human-readable name
   */
  private humanizeMetricName(metricType: string): string {
    const nameMap: Record<string, string> = {
      water_intake: 'water intake',
      steps: 'step count',
      active_energy: 'active calories',
      exercise_minutes: 'exercise time',
      hrv_ms: 'heart rate variability',
      resting_heart_rate_bpm: 'resting heart rate',
      sleep_duration_min: 'sleep duration',
      deep_sleep_min: 'deep sleep',
      rem_sleep_min: 'REM sleep',
      respiratory_rate_bpm: 'breathing rate',
      oxygen_saturation_pct: 'blood oxygen',
      body_temperature_deviation: 'body temperature',
    };

    return nameMap[metricType] || metricType.replace(/_/g, ' ');
  }

  private mapToActiveLifeEvent(data: any): ActiveLifeEvent {
    return {
      id: data.id,
      healthId: data.health_id,
      eventType: data.event_type,
      details: data.details || {},
      notes: data.notes,
      happenedAt: new Date(data.happened_at),
      isActive: data.is_active,
      endsAt: data.ends_at ? new Date(data.ends_at) : null,
      affectedMetrics: data.affected_metrics || [],
      suppressionAction: data.suppression_action || 'none',
      thresholdMultiplier: data.threshold_multiplier || 1.0,
      userExplanation: data.user_explanation,
      source: data.source || 'chat',
    };
  }

  private mapToCheckInPrompt(data: any): CheckInPrompt {
    return {
      id: data.id,
      healthId: data.health_id,
      triggerType: data.trigger_type,
      triggerMetric: data.trigger_metric,
      triggerDetails: data.trigger_details || {},
      anomalyDays: data.anomaly_days || 1,
      deviationPercent: data.deviation_percent,
      baselineValue: data.baseline_value,
      currentValue: data.current_value,
      promptMessage: data.prompt_message,
      suggestedResponses: data.suggested_responses || [],
      status: data.status,
      sentAt: data.sent_at ? new Date(data.sent_at) : null,
      answeredAt: data.answered_at ? new Date(data.answered_at) : null,
      responseText: data.response_text,
      resultingLifeEventId: data.resulting_life_event_id,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
    };
  }
}

export const activeLifeEventsService = new ActiveLifeEventsService();
