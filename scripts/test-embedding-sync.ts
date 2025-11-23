import { storeEmbedding } from '../server/services/embeddingService';
import { logger } from '../server/logger';

/**
 * Test that embedding sync works without PGRST204 errors
 * Run with: npx tsx scripts/test-embedding-sync.ts
 */
async function testEmbeddingSync() {
  console.log('🧪 Testing embedding sync with sample data...\n');

  try {
    // Test 1: Store a blood work embedding
    console.log('📝 Test 1: Storing blood work embedding...');
    const bloodWorkId = await storeEmbedding({
      userId: 'test-user-' + Date.now(),
      contentType: 'blood_work',
      content: 'Blood work from 2025-11-20: Total Cholesterol 180 mg/dL, HDL 55 mg/dL, LDL 105 mg/dL, Triglycerides 100 mg/dL. All values in optimal range.',
      metadata: {
        testDate: '2025-11-20',
        biomarkerCount: 4,
        test: true,
      },
    });
    console.log('✅ Blood work embedding stored:', bloodWorkId);

    // Test 2: Store a HealthKit daily embedding
    console.log('\n📝 Test 2: Storing HealthKit daily embedding...');
    const healthKitId = await storeEmbedding({
      userId: 'test-user-' + Date.now(),
      contentType: 'healthkit_daily',
      content: 'Daily metrics for 2025-11-20: Steps 8,500, Sleep 7.2 hours, HRV 45ms, Resting HR 58 bpm, Exercise 30 minutes',
      metadata: {
        date: '2025-11-20',
        steps: 8500,
        sleepHours: 7.2,
        hrv: 45,
        restingHr: 58,
        exerciseMinutes: 30,
        test: true,
      },
    });
    console.log('✅ HealthKit embedding stored:', healthKitId);

    // Test 3: Store an insight card embedding
    console.log('\n📝 Test 3: Storing insight card embedding...');
    const insightId = await storeEmbedding({
      userId: 'test-user-' + Date.now(),
      contentType: 'insight_card',
      content: 'Higher step counts correlate with better sleep quality. On days with 10k+ steps, sleep duration increases by 25 minutes on average.',
      metadata: {
        healthArea: 'activity_sleep',
        confidence: 0.85,
        test: true,
      },
    });
    console.log('✅ Insight card embedding stored:', insightId);

    console.log('\n🎉 All embedding tests passed! No PGRST204 errors.');
    console.log('✅ Embedding sync is working correctly.');
    
    return true;

  } catch (error: any) {
    console.error('\n❌ Embedding test failed:', error.message);
    
    if (error.message.includes('PGRST204')) {
      console.error('\n🚨 PGRST204 error still occurring!');
      console.error('   The schema fix may not have been applied correctly.');
      console.error('   Please verify all SQL statements were executed in Supabase.');
    }
    
    return false;
  }
}

// Run the test
testEmbeddingSync()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
