import * as OneSignal from '@onesignal/node-onesignal';
import { logger } from '../logger';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
  logger.warn('OneSignal credentials not configured. Push notifications will not be available.');
}

const configuration = ONESIGNAL_REST_API_KEY 
  ? OneSignal.createConfiguration({
      restApiKey: ONESIGNAL_REST_API_KEY,
    })
  : null;

const client = configuration ? new OneSignal.DefaultApi(configuration) : null;

export interface NotificationTemplate {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface SendNotificationOptions {
  userIds?: string[];
  segments?: string[];
  template: NotificationTemplate;
  scheduleAt?: Date;
}

export class NotificationService {
  async sendNotification(options: SendNotificationOptions): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    if (!client || !ONESIGNAL_APP_ID) {
      logger.warn('OneSignal not configured, skipping notification');
      return { success: false, error: 'OneSignal not configured' };
    }

    try {
      const notification = new OneSignal.Notification();
      notification.app_id = ONESIGNAL_APP_ID;
      
      notification.headings = {
        en: options.template.title
      };
      
      notification.contents = {
        en: options.template.body
      };
      
      if (options.template.data) {
        notification.data = options.template.data;
      }
      
      if (options.userIds && options.userIds.length > 0) {
        notification.include_aliases = {
          external_id: options.userIds
        };
      } else if (options.segments && options.segments.length > 0) {
        notification.included_segments = options.segments;
      } else {
        notification.included_segments = ['Subscribed Users'];
      }
      
      if (options.scheduleAt) {
        notification.send_after = options.scheduleAt.toISOString();
      }
      
      const response = await client.createNotification(notification);
      logger.info('OneSignal notification sent:', { id: response.id });
      return { success: true, notificationId: response.id || undefined };
    } catch (error) {
      // Log error but don't throw - graceful degradation
      logger.error('Failed to send OneSignal notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async sendFlomentumDailyScore(
    userId: string, 
    score: number, 
    zone: string,
    userName?: string
  ) {
    return this.sendNotification({
      userIds: [userId],
      template: {
        title: `Your Flōmentum Score: ${score}`,
        body: `${userName ? `${userName}, y` : 'Y'}ou're in the ${zone} zone today. Check your detailed breakdown.`,
        data: {
          type: 'flomentum_daily',
          score,
          zone,
          screen: 'flomentum'
        }
      }
    });
  }

  async sendFlomentumWeeklySummary(
    userId: string,
    avgScore: number,
    trend: 'up' | 'down' | 'stable',
    userName?: string
  ) {
    const trendText = trend === 'up' ? 'trending up' : trend === 'down' ? 'trending down' : 'holding steady';
    return this.sendNotification({
      userIds: [userId],
      template: {
        title: 'Your Weekly Flōmentum Summary',
        body: `Average score: ${avgScore}, ${trendText}. Tap to see insights.`,
        data: {
          type: 'flomentum_weekly',
          avgScore,
          trend,
          screen: 'flomentum'
        }
      }
    });
  }

  async sendFlomentumMilestone(
    userId: string,
    milestone: string,
    userName?: string
  ) {
    return this.sendNotification({
      userIds: [userId],
      template: {
        title: 'Milestone Achieved',
        body: `${userName ? `${userName}, c` : 'C'}ongratulations! ${milestone}`,
        data: {
          type: 'flomentum_milestone',
          milestone,
          screen: 'flomentum'
        }
      }
    });
  }

  async sendHealthInsight(
    userId: string,
    title: string,
    message: string
  ) {
    return this.sendNotification({
      userIds: [userId],
      template: {
        title: `Health Insight: ${title}`,
        body: message,
        data: {
          type: 'health_insight',
          screen: 'dashboard'
        }
      }
    });
  }

  async sendLabResultsReady(
    userId: string,
    userName?: string
  ) {
    return this.sendNotification({
      userIds: [userId],
      template: {
        title: 'Your Lab Results Are Ready',
        body: `${userName ? `${userName}, y` : 'Y'}our latest blood work analysis is complete. Review your results now.`,
        data: {
          type: 'lab_results',
          screen: 'labs'
        }
      }
    });
  }
}
