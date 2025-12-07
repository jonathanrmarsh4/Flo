import { getHealthKitSyncStatus, markHealthKitBackfillComplete, resetHealthKitBackfillStatus } from './server/services/supabaseHealthStorage';

const userId = '34226453';

async function testBackfillEndpoints() {
  console.log('🧪 Testing HealthKit Backfill Endpoints...\n');

  // Test 1: Get initial sync status
  console.log('1️⃣ Getting initial sync status...');
  const status1 = await getHealthKitSyncStatus(userId);
  console.log('   backfillComplete:', status1.backfillComplete);
  console.log('   backfillDate:', status1.backfillDate);
  console.log('   needsHistoricalSync:', status1.needsHistoricalSync);

  // Test 2: Mark backfill as complete
  console.log('\n2️⃣ Marking backfill as complete...');
  await markHealthKitBackfillComplete(userId);
  console.log('   ✅ Marked complete');

  // Test 3: Verify the status changed
  console.log('\n3️⃣ Verifying status changed...');
  const status2 = await getHealthKitSyncStatus(userId);
  console.log('   backfillComplete:', status2.backfillComplete);
  console.log('   backfillDate:', status2.backfillDate);
  console.log('   needsHistoricalSync:', status2.needsHistoricalSync);

  // Verify it's correct
  if (status2.backfillComplete && !status2.needsHistoricalSync) {
    console.log('\n✅ All tests passed!');
  } else {
    console.log('\n❌ Test failed - status not updated correctly');
  }

  // Reset for next test (optional)
  // console.log('\n4️⃣ Resetting status for next test...');
  // await resetHealthKitBackfillStatus(userId);
}

testBackfillEndpoints().catch(console.error);
