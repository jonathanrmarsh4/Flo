type SurveyEventCallback = () => void;

/**
 * Buffered survey event emitter that handles cold-start scenarios.
 * If triggerOpen3PMSurvey is called before DashboardScreen subscribes,
 * the pending trigger is stored and delivered once a subscriber connects.
 */
class SurveyEventEmitter {
  private listeners: SurveyEventCallback[] = [];
  private pendingTrigger = false;
  private pendingTriggerTimestamp: number | null = null;
  
  // Pending triggers expire after 30 seconds to avoid stale modal opens
  private readonly PENDING_EXPIRY_MS = 30000;

  subscribe(callback: SurveyEventCallback): () => void {
    console.log('[SurveyEvents] New subscriber added');
    this.listeners.push(callback);
    
    // Check if there's a pending trigger waiting to be delivered
    if (this.pendingTrigger && this.pendingTriggerTimestamp) {
      const elapsed = Date.now() - this.pendingTriggerTimestamp;
      if (elapsed < this.PENDING_EXPIRY_MS) {
        console.log('[SurveyEvents] Delivering pending trigger to new subscriber (waited', elapsed, 'ms)');
        this.pendingTrigger = false;
        this.pendingTriggerTimestamp = null;
        // Small delay to ensure component is fully mounted
        setTimeout(() => callback(), 100);
      } else {
        console.log('[SurveyEvents] Pending trigger expired (waited', elapsed, 'ms)');
        this.pendingTrigger = false;
        this.pendingTriggerTimestamp = null;
      }
    }
    
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
      console.log('[SurveyEvents] Subscriber removed, remaining:', this.listeners.length);
    };
  }

  emit(): void {
    console.log('[SurveyEvents] Emitting open3PMSurvey event to', this.listeners.length, 'listeners');
    
    if (this.listeners.length === 0) {
      // No subscribers yet (cold start) - buffer the trigger
      console.log('[SurveyEvents] No subscribers yet - buffering trigger for delivery on subscribe');
      this.pendingTrigger = true;
      this.pendingTriggerTimestamp = Date.now();
      return;
    }
    
    this.listeners.forEach(cb => cb());
  }
  
  // Clear any pending trigger (e.g., when survey is completed)
  clearPending(): void {
    this.pendingTrigger = false;
    this.pendingTriggerTimestamp = null;
  }
}

export const surveyEvents = new SurveyEventEmitter();

export function triggerOpen3PMSurvey(): void {
  console.log('[SurveyEvents] triggerOpen3PMSurvey called');
  surveyEvents.emit();
}
