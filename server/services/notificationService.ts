import * as OneSignal from '@onesignal/node-onesignal';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
  console.warn('OneSignal credentials not configured. Push notifications will not be available.');
}

const configuration = ONESIGNAL_REST_API_KEY 
  ? OneSignal.createConfiguration({
      restApiKey: ONESIGNAL_REST_API_KEY,
    })
  : null;

const client = configuration ? new OneSignal.DefaultApi(configuration) : null;

export interface NotificationTemplate {
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface SendNotificationOptions {
  userIds?: string[];
  segments?: string[];
  template: NotificationTemplate;
  scheduleAt?: Date;
}

export async function sendNotification(options: SendNotificationOptions): Promise<string | null> {
  if (!client || !ONESIGNAL_APP_ID) {
    console.warn('OneSignal not configured, skipping notification');
    return null;
  }

  try {
    const notification = new OneSignal.Notification();
    notification.app_id = ONESIGNAL_APP_ID;
    
    notification.headings = {
      en: options.template.title
    };
    
    notification.contents = {
      en: options.template.message
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
    console.log('OneSignal notification sent:', response.id);
    return response.id || null;
  } catch (error) {
    console.error('Failed to send OneSignal notification:', error);
    throw error;
  }
}

export const NotificationTemplates = {
  flommentumDailyScore: (score: number, zone: string, userName?: string): NotificationTemplate => ({
    title: `Your Flōmentum Score: ${score}`,
    message: `${userName ? `${userName}, y` : 'Y'}ou're in the ${zone} zone today. Check your detailed breakdown!`,
    data: {
      type: 'flomentum_daily',
      score,
      zone,
      screen: 'flomentum'
    }
  }),
  
  flommentumWeeklySummary: (avgScore: number, trend: 'up' | 'down' | 'stable', userName?: string): NotificationTemplate => ({
    title: 'Your Weekly Flōmentum Summary',
    message: `Average score: ${avgScore}. Trend: ${trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️'} ${trend}. Tap to see insights.`,
    data: {
      type: 'flomentum_weekly',
      avgScore,
      trend,
      screen: 'flomentum'
    }
  }),
  
  flommentumMilestone: (milestone: string, userName?: string): NotificationTemplate => ({
    title: 'Milestone Achieved! 🎉',
    message: `${userName ? `${userName}, c` : 'C'}ongratulations! ${milestone}`,
    data: {
      type: 'flomentum_milestone',
      milestone,
      screen: 'flomentum'
    }
  }),
  
  healthInsight: (title: string, message: string): NotificationTemplate => ({
    title: `Health Insight: ${title}`,
    message,
    data: {
      type: 'health_insight',
      screen: 'dashboard'
    }
  }),
  
  labResultsReady: (userName?: string): NotificationTemplate => ({
    title: 'Your Lab Results Are Ready',
    message: `${userName ? `${userName}, y` : 'Y'}our latest blood work analysis is complete. Review your results now.`,
    data: {
      type: 'lab_results',
      screen: 'labs'
    }
  })
};

export async function sendFlommentumDailyNotification(
  userId: string, 
  score: number, 
  zone: string,
  userName?: string
): Promise<string | null> {
  return sendNotification({
    userIds: [userId],
    template: NotificationTemplates.flommentumDailyScore(score, zone, userName)
  });
}

export async function sendFlommentumWeeklySummary(
  userId: string,
  avgScore: number,
  trend: 'up' | 'down' | 'stable',
  userName?: string
): Promise<string | null> {
  return sendNotification({
    userIds: [userId],
    template: NotificationTemplates.flommentumWeeklySummary(avgScore, trend, userName)
  });
}
