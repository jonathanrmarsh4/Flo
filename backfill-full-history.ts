import { clickhouseBaselineEngine } from './server/services/clickhouseBaselineEngine';
import { getHealthId } from './server/services/supabaseHealthStorage';

const userId = '34226453';

async function backfillFullHistory() {
  console.log('🔄 Starting FULL HISTORY backfill for user', userId);
  console.log('   This will sync all HealthKit data from Supabase to ClickHouse...\n');

  try {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      console.log('❌ Could not find health_id for user');
      return;
    }
    console.log('✅ Found health_id:', healthId.substring(0, 8) + '...');

    console.log('\n📥 Starting full history sync (this may take a few minutes)...');
    const startTime = Date.now();
    
    const result = await clickhouseBaselineEngine.syncUserDataFromSupabase(healthId, {
      fullHistory: true,
      daysToSync: 365 * 3, // 3 years
    });

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n✅ BACKFILL COMPLETE in', durationSec, 'seconds');
    console.log('   Total records synced:', result.total);
    console.log('   Breakdown:');
    console.log('     - Health metrics:', result.healthMetrics || 0);
    console.log('     - Nutrition:', result.nutrition || 0);
    console.log('     - Biomarkers:', result.biomarkers || 0);
    console.log('     - Life events:', result.lifeEvents || 0);
    console.log('     - Environmental:', result.environmental || 0);
    console.log('     - Body composition:', result.bodyComposition || 0);

  } catch (error: any) {
    console.error('❌ Backfill failed:', error.message);
  }
}

backfillFullHistory();
