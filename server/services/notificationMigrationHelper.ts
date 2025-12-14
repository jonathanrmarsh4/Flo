/**
 * Notification Migration Helper
 * 
 * Helps migrate existing notification types to the new centralized service:
 * - Daily Brief (morning briefing)
 * - 3PM Survey
 * - Supplement/Experiment reminders
 * 
 * Migration strategy:
 * 1. Seed notification templates for each type
 * 2. Create user schedules based on existing preferences
 * 3. Run old and new systems in parallel for testing
 * 4. Disable old system once new is verified
 */

import { db } from '../db';
import { scheduledNotificationTemplates, userNotificationSchedules, users } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { centralizedNotificationService } from './centralizedNotificationService';
import { logger } from '../logger';
import { n1ExperimentService } from './n1ExperimentService';

// Default notification templates
const NOTIFICATION_TEMPLATES = [
  {
    type: 'daily_brief' as const,
    title: 'Your Morning Briefing is Ready',
    body: 'Good morning! Your personalized health insights are ready.',
    defaultLocalTime: '07:00',
    interruptionLevel: 'time-sensitive',
    metadata: { deeplink: '/briefing' },
  },
  {
    type: 'survey_3pm' as const,
    title: 'Quick Check-in',
    body: "How's your energy, clarity, and mood today?",
    defaultLocalTime: '15:00',
    interruptionLevel: 'active',
    metadata: { deeplink: '/survey' },
  },
  {
    type: 'supplement_reminder' as const,
    title: 'Experiment Check-in',
    body: "Don't forget to log today's supplement and how you're feeling.",
    defaultLocalTime: '20:00',
    interruptionLevel: 'active',
    metadata: { deeplink: '/experiments' },
  },
];

/**
 * Seed the notification templates table
 */
export async function seedNotificationTemplates(): Promise<void> {
  logger.info('[NotificationMigration] Seeding notification templates...');

  for (const template of NOTIFICATION_TEMPLATES) {
    try {
      await db
        .insert(scheduledNotificationTemplates)
        .values(template)
        .onConflictDoUpdate({
          target: [scheduledNotificationTemplates.type],
          set: {
            title: template.title,
            body: template.body,
            defaultLocalTime: template.defaultLocalTime,
            interruptionLevel: template.interruptionLevel,
            metadata: template.metadata,
            updatedAt: new Date(),
          },
        });
      logger.info(`[NotificationMigration] Seeded template: ${template.type}`);
    } catch (err) {
      logger.error(`[NotificationMigration] Error seeding template ${template.type}:`, err);
    }
  }

  logger.info('[NotificationMigration] Template seeding complete');
}

/**
 * Migrate existing users to use the new notification schedules
 * Uses their existing timezone preferences
 */
export async function migrateUserSchedules(): Promise<{ migrated: number; skipped: number; errors: number }> {
  logger.info('[NotificationMigration] Migrating user schedules...');

  const stats = { migrated: 0, skipped: 0, errors: 0 };

  // Get all active users with timezone set
  const activeUsers = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      reminderTimezone: users.reminderTimezone,
      reminderEnabled: users.reminderEnabled,
    })
    .from(users)
    .where(eq(users.status, 'active'));

  for (const user of activeUsers) {
    try {
      const timezone = user.timezone || user.reminderTimezone || 'America/Los_Angeles';
      
      // Skip if reminders disabled
      if (!user.reminderEnabled) {
        stats.skipped++;
        continue;
      }

      // Create schedules for each notification type
      await centralizedNotificationService.upsertUserSchedule(
        user.id,
        'daily_brief',
        '07:00',
        timezone,
        { isEnabled: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }
      );

      await centralizedNotificationService.upsertUserSchedule(
        user.id,
        'survey_3pm',
        '15:00',
        timezone,
        { isEnabled: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }
      );

      // Check for active experiments to determine if supplement reminder should be enabled
      let hasActiveExperiment = false;
      try {
        const activeExperiments = await n1ExperimentService.getActiveExperimentsWithProducts(user.id);
        hasActiveExperiment = activeExperiments.length > 0;
      } catch (err) {
        // If we can't check experiments, default to disabled
        logger.warn(`[NotificationMigration] Could not check experiments for user ${user.id}, disabling supplement reminder:`, err);
      }

      // Supplement reminder - only enabled for users with active experiments
      await centralizedNotificationService.upsertUserSchedule(
        user.id,
        'supplement_reminder',
        '20:00',
        timezone,
        { isEnabled: hasActiveExperiment, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }
      );

      if (hasActiveExperiment) {
        logger.info(`[NotificationMigration] Enabled supplement reminder for user ${user.id} (has active experiment)`);
      }

      stats.migrated++;
    } catch (err) {
      logger.error(`[NotificationMigration] Error migrating user ${user.id}:`, err);
      stats.errors++;
    }
  }

  logger.info(`[NotificationMigration] Migration complete: ${stats.migrated} migrated, ${stats.skipped} skipped, ${stats.errors} errors`);
  return stats;
}

/**
 * Run full migration (templates + user schedules)
 */
export async function runFullMigration(): Promise<void> {
  logger.info('[NotificationMigration] Starting full migration...');
  
  await seedNotificationTemplates();
  const stats = await migrateUserSchedules();
  
  logger.info('[NotificationMigration] Full migration complete', stats);
}
