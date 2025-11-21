/**
 * Standalone test script for daily reminder generation
 * Run with: npx tsx test-reminder-generation.ts
 */

import { generateDailyReminder } from './server/services/dailyReminderService';
import { logger } from './server/logger';

async function testReminderGeneration() {
  const testUserId = 'test_user_001';
  const reminderTime = '08:15';
  const reminderTimezone = 'UTC';

  logger.info('==========================================');
  logger.info('DAILY REMINDER END-TO-END TEST');
  logger.info('==========================================');
  logger.info(`Test User ID: ${testUserId}`);
  logger.info(`Reminder Time: ${reminderTime}`);
  logger.info(`Reminder Timezone: ${reminderTimezone}`);
  logger.info('==========================================\n');

  try {
    const result = await generateDailyReminder(testUserId, reminderTime, reminderTimezone);

    if (result.success) {
      logger.info('\n✅ REMINDER GENERATED SUCCESSFULLY');
      logger.info('==========================================');
      logger.info('Generated Reminder Text:');
      logger.info(result.reminder);
      logger.info('==========================================');
      logger.info('\nNext Steps:');
      logger.info('1. Check Supabase daily_reminders table for the new record');
      logger.info('2. Verify schedule_at_ms is calculated correctly');
      logger.info('3. Test client Realtime listener receives the notification');
      logger.info('4. Verify local notification is scheduled on device');
    } else {
      logger.error('\n❌ REMINDER GENERATION FAILED');
      logger.error('==========================================');
      logger.error(`Error: ${result.error}`);
      logger.error('==========================================');
    }
  } catch (error: any) {
    logger.error('\n💥 EXCEPTION DURING TEST');
    logger.error('==========================================');
    logger.error(error.message);
    logger.error(error.stack);
    logger.error('==========================================');
  }

  process.exit(0);
}

testReminderGeneration();
