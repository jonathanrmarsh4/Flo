import * as cron from 'node-cron';
import { createLogger } from '../utils/logger';
import { 
  getPendingFollowUpsToEvaluate, 
  updateFollowUpRequest,
  getActiveLifeContext,
} from './healthStorageRouter';
import { evaluateAndStoreFindings, AnalysisResult } from './followUpAnalysisEngine';
import { db } from '../db';
import { users, deviceTokens } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { apnsService } from './apnsService';

const logger = createLogger('FollowUpScheduler');

let schedulerStarted = false;
let schedulerTask: cron.ScheduledTask | null = null;

export interface FollowUpNotification {
  userId: string;
  requestId: string;
  intentSummary: string;
  analysis: AnalysisResult;
  deviceToken?: string;
}

async function getUserIdByHealthId(healthId: string): Promise<string | null> {
  try {
    const [user] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.healthId, healthId));
    return user?.id || null;
  } catch (error) {
    logger.error('[FollowUpScheduler] Failed to lookup user by health_id', { healthId, error });
    return null;
  }
}

async function processFollowUps(): Promise<FollowUpNotification[]> {
  const startTime = Date.now();
  const notifications: FollowUpNotification[] = [];
  
  try {
    const pendingRequests = await getPendingFollowUpsToEvaluate();
    
    if (pendingRequests.length === 0) {
      logger.debug('[FollowUpScheduler] No pending follow-ups ready for evaluation');
      return [];
    }
    
    logger.info('[FollowUpScheduler] Processing pending follow-ups', {
      count: pendingRequests.length,
    });
    
    for (const request of pendingRequests) {
      const userId = await getUserIdByHealthId(request.health_id);
      
      if (!userId) {
        logger.warn('[FollowUpScheduler] Could not find user for health_id', {
          healthId: request.health_id,
          requestId: request.id,
        });
        continue;
      }
      
      try {
        await updateFollowUpRequest(request.id!, {
          status: 'processing',
        });
        
        const analysis = await evaluateAndStoreFindings(request, userId);
        
        if (analysis) {
          const activeTokens = await db.select({ deviceToken: deviceTokens.deviceToken })
            .from(deviceTokens)
            .where(and(
              eq(deviceTokens.userId, userId),
              eq(deviceTokens.isActive, true)
            ));
          
          notifications.push({
            userId,
            requestId: request.id!,
            intentSummary: request.intent_summary,
            analysis,
            deviceToken: activeTokens[0]?.deviceToken || undefined,
          });
          
          logger.info('[FollowUpScheduler] Follow-up evaluated successfully', {
            requestId: request.id,
            userId,
            trend: analysis.trend,
          });
        }
      } catch (error: any) {
        logger.error('[FollowUpScheduler] Failed to process follow-up', {
          requestId: request.id,
          userId,
          error: error.message,
        });
        
        await updateFollowUpRequest(request.id!, {
          status: 'failed',
        });
      }
    }
    
    logger.info('[FollowUpScheduler] Processing cycle complete', {
      processed: pendingRequests.length,
      notifications: notifications.length,
      duration: Date.now() - startTime,
    });
    
    return notifications;
  } catch (error: any) {
    logger.error('[FollowUpScheduler] Processing cycle failed', {
      error: error.message,
      duration: Date.now() - startTime,
    });
    return [];
  }
}

async function sendFollowUpNotification(notification: FollowUpNotification): Promise<boolean> {
  if (!notification.deviceToken) {
    logger.debug('[FollowUpScheduler] No device token for user, skipping push', {
      userId: notification.userId,
      requestId: notification.requestId,
    });
    return false;
  }
  
  try {
    const title = 'Flō Check-in Ready';
    const body = notification.analysis.summary.substring(0, 150);
    const data = {
      type: 'follow_up_result',
      requestId: notification.requestId,
      trend: notification.analysis.trend,
    };
    
    const result = await apnsService.sendNotification(notification.deviceToken, {
      title,
      body,
      data,
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Push notification failed');
    }
    
    await updateFollowUpRequest(notification.requestId, {
      notification_sent: true,
      notification_sent_at: new Date(),
    });
    
    logger.info('[FollowUpScheduler] Push notification sent', {
      userId: notification.userId,
      requestId: notification.requestId,
      trend: notification.analysis.trend,
    });
    
    return true;
  } catch (error: any) {
    logger.error('[FollowUpScheduler] Failed to send push notification', {
      userId: notification.userId,
      requestId: notification.requestId,
      error: error.message,
    });
    return false;
  }
}

export async function runFollowUpCheck(): Promise<{ 
  processed: number; 
  notified: number;
}> {
  const notifications = await processFollowUps();
  
  let notified = 0;
  for (const notification of notifications) {
    const sent = await sendFollowUpNotification(notification);
    if (sent) notified++;
  }
  
  return {
    processed: notifications.length,
    notified,
  };
}

export function startFollowUpScheduler(): void {
  if (schedulerStarted) {
    logger.warn('[FollowUpScheduler] Scheduler already started');
    return;
  }
  
  const enabled = process.env.ENABLE_FOLLOW_UP_SCHEDULER === 'true';
  if (!enabled) {
    logger.info('[FollowUpScheduler] Scheduler disabled (ENABLE_FOLLOW_UP_SCHEDULER != true)');
    return;
  }
  
  schedulerTask = cron.schedule('*/30 * * * *', async () => {
    logger.info('[FollowUpScheduler] Running scheduled follow-up check');
    const result = await runFollowUpCheck();
    logger.info('[FollowUpScheduler] Scheduled check complete', result);
  });
  
  schedulerStarted = true;
  logger.info('[FollowUpScheduler] Follow-up scheduler started (runs every 30 minutes)');
  
  setTimeout(async () => {
    logger.info('[FollowUpScheduler] Running initial follow-up check');
    const result = await runFollowUpCheck();
    logger.info('[FollowUpScheduler] Initial check complete', result);
  }, 15000);
}

export function stopFollowUpScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    schedulerStarted = false;
    logger.info('[FollowUpScheduler] Scheduler stopped');
  }
}

export function isSchedulerRunning(): boolean {
  return schedulerStarted;
}
