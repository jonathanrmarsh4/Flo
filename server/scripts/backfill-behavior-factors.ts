import { behaviorAttributionEngine } from '../services/behaviorAttributionEngine';
import { getSupabaseClient } from '../services/supabaseClient';
import { logger } from '../utils/logger';

async function backfillBehaviorFactors(healthId: string, daysBack: number = 90) {
  logger.info(`[Backfill] Starting behavior factors backfill for ${healthId}, last ${daysBack} days`);

  const supabase = getSupabaseClient();
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  let totalFactors = 0;
  let daysProcessed = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const localDate = d.toISOString().split('T')[0];
    
    try {
      const factorCount = await behaviorAttributionEngine.syncDailyBehaviorFactors(healthId, localDate);
      totalFactors += factorCount;
      daysProcessed++;
      
      if (daysProcessed % 10 === 0) {
        logger.info(`[Backfill] Progress: ${daysProcessed}/${daysBack} days, ${totalFactors} factors synced`);
      }
    } catch (error) {
      logger.error(`[Backfill] Error syncing ${localDate}:`, error as Error);
    }
  }

  logger.info(`[Backfill] Completed: ${daysProcessed} days processed, ${totalFactors} total factors synced`);
  return { daysProcessed, totalFactors };
}

async function backfillAllUsers(daysBack: number = 90) {
  const supabase = getSupabaseClient();
  
  const { data: users } = await supabase
    .from('profiles')
    .select('health_id')
    .not('health_id', 'is', null);

  if (!users || users.length === 0) {
    logger.warn('[Backfill] No users found with health_id');
    return;
  }

  logger.info(`[Backfill] Found ${users.length} users to backfill`);

  for (const user of users) {
    if (user.health_id) {
      await backfillBehaviorFactors(user.health_id, daysBack);
    }
  }

  logger.info('[Backfill] All users processed');
}

export { backfillBehaviorFactors, backfillAllUsers };

// ES module entry point
const healthId = process.argv[2];
const daysBack = parseInt(process.argv[3] || '90', 10);

if (!healthId) {
  console.log('Usage: npx tsx server/scripts/backfill-behavior-factors.ts <health_id> [days_back]');
  console.log('  Or use "all" to backfill all users');
  process.exit(1);
}

(healthId === 'all' ? backfillAllUsers(daysBack) : backfillBehaviorFactors(healthId, daysBack))
  .then(() => {
    console.log('Backfill complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
