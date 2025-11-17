import { db } from "../db";
import { eq, and, or, isNull } from "drizzle-orm";
import { notificationTriggers, notificationLogs, biomarkers, type InsertNotificationLog } from "@shared/schema";
import { logger } from "../logger";

/**
 * Notification Trigger Service
 * Handles automated notifications when biomarkers fall outside reference ranges
 * Integrates with admin-configured notification triggers
 */

interface BiomarkerResult {
  biomarkerId?: string;
  biomarkerName: string;
  value: number;
  unit: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

interface NotificationContext {
  userId: string;
  bloodWorkId: string;
  biomarkerResults: BiomarkerResult[];
}

/**
 * Check if a biomarker value is outside its reference range
 */
function isOutOfRange(result: BiomarkerResult): boolean {
  if (!result.referenceMin && !result.referenceMax) {
    return false;
  }

  if (result.referenceMin !== null && result.referenceMin !== undefined && result.value < result.referenceMin) {
    return true;
  }

  if (result.referenceMax !== null && result.referenceMax !== undefined && result.value > result.referenceMax) {
    return true;
  }

  return false;
}

/**
 * Check if a biomarker value is in the critical range
 */
function isCritical(result: BiomarkerResult): boolean {
  if (result.criticalLow !== null && result.criticalLow !== undefined && result.value < result.criticalLow) {
    return true;
  }

  if (result.criticalHigh !== null && result.criticalHigh !== undefined && result.value > result.criticalHigh) {
    return true;
  }

  return false;
}

/**
 * Create a notification log entry
 */
async function logNotification(
  userId: string,
  triggerId: string,
  title: string,
  body: string,
  contextData: any
): Promise<void> {
  try {
    await db.insert(notificationLogs).values({
      userId,
      triggerId,
      title,
      body,
      status: 'pending', // Will be updated to 'sent' when mobile app confirms receipt
      contextData,
    });

    logger.info(`[Notification] Logged notification for user ${userId}: ${title}`);
  } catch (error) {
    logger.error('[Notification] Failed to log notification:', error);
  }
}

/**
 * Process biomarker results and trigger notifications
 * Called after blood work is uploaded and normalized
 */
export async function processBiomarkerNotifications(context: NotificationContext): Promise<void> {
  try {
    logger.info(`[Notification] Processing notifications for user ${context.userId}, ${context.biomarkerResults.length} biomarkers`);

    // Get all active notification triggers
    const triggers = await db
      .select()
      .from(notificationTriggers)
      .where(eq(notificationTriggers.isActive, true));

    if (triggers.length === 0) {
      logger.debug('[Notification] No active triggers configured');
      return;
    }

    // Check each biomarker result against triggers
    for (const result of context.biomarkerResults) {
      const isOOR = isOutOfRange(result);
      const isCrit = isCritical(result);

      if (!isOOR && !isCrit) {
        continue; // Biomarker is in normal range
      }

      // Find matching triggers for this biomarker
      const matchingTriggers = triggers.filter((trigger) => {
        // Check trigger type
        if (trigger.triggerType === 'biomarker_critical' && !isCrit) {
          return false;
        }

        if (trigger.triggerType === 'biomarker_out_of_range' && !isOOR) {
          return false;
        }

        // Check if trigger is for specific biomarker or all biomarkers
        if (trigger.biomarkerId && trigger.biomarkerId !== result.biomarkerId) {
          return false;
        }

        return true;
      });

      // Send notifications for each matching trigger
      for (const trigger of matchingTriggers) {
        const title = interpolateTemplate(trigger.title, result);
        const body = interpolateTemplate(trigger.body, result);

        await logNotification(
          context.userId,
          trigger.id,
          title,
          body,
          {
            bloodWorkId: context.biomarkerResults,
            biomarkerId: result.biomarkerId,
            biomarkerName: result.biomarkerName,
            value: result.value,
            unit: result.unit,
            referenceMin: result.referenceMin,
            referenceMax: result.referenceMax,
            isOutOfRange: isOOR,
            isCritical: isCrit,
          }
        );

        logger.info(
          `[Notification] Triggered '${trigger.triggerType}' for ${result.biomarkerName}: ${title}`
        );
      }
    }
  } catch (error) {
    logger.error('[Notification] Error processing biomarker notifications:', error);
    // Don't throw - we don't want to fail blood work upload if notifications fail
  }
}

/**
 * Interpolate variables in notification templates
 * Supports: {{biomarkerName}}, {{value}}, {{unit}}
 */
function interpolateTemplate(template: string, result: BiomarkerResult): string {
  return template
    .replace(/\{\{biomarkerName\}\}/g, result.biomarkerName)
    .replace(/\{\{value\}\}/g, result.value.toString())
    .replace(/\{\{unit\}\}/g, result.unit);
}

/**
 * Get pending notifications for a user (for mobile app to display)
 */
export async function getPendingNotifications(userId: string): Promise<any[]> {
  try {
    const notifications = await db
      .select()
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.userId, userId),
          eq(notificationLogs.status, 'pending')
        )
      )
      .orderBy(notificationLogs.createdAt)
      .limit(50);

    return notifications;
  } catch (error) {
    logger.error('[Notification] Error fetching pending notifications:', error);
    return [];
  }
}

/**
 * Mark notification as sent
 */
export async function markNotificationSent(notificationId: string): Promise<void> {
  try {
    await db
      .update(notificationLogs)
      .set({
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(notificationLogs.id, notificationId));

    logger.debug(`[Notification] Marked notification ${notificationId} as sent`);
  } catch (error) {
    logger.error('[Notification] Error marking notification as sent:', error);
  }
}
