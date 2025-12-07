import { resetHealthKitBackfillStatus, getHealthKitSyncStatus } from './server/services/supabaseHealthStorage';

const userId = '34226453';

async function resetAndVerify() {
  console.log('🔄 Resetting backfill status so iOS can perform historical sync...');
  await resetHealthKitBackfillStatus(userId);
  
  const status = await getHealthKitSyncStatus(userId);
  console.log('\n✅ Status reset:');
  console.log('   needsHistoricalSync:', status.needsHistoricalSync);
  console.log('\n   iOS will now sync ALL historical HealthKit data on next app launch.');
}

resetAndVerify().catch(console.error);
