import { correlationEngine } from './server/services/clickhouseCorrelationEngine';
import { isClickHouseEnabled, clickhouse } from './server/services/clickhouseService';
import { getHealthId } from './server/services/supabaseHealthStorage';

const userId = '34226453';
const lookbackMonths = 6;

interface TestResult {
  stage: string;
  status: 'pass' | 'fail';
  message: string;
  data?: any;
  durationMs: number;
}

async function runTest(stage: string, testFn: () => Promise<{ pass: boolean; message: string; data?: any }>): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const result = await testFn();
    return {
      stage,
      status: result.pass ? 'pass' : 'fail',
      message: result.message,
      data: result.data,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      stage,
      status: 'fail',
      message: `Exception: ${error.message}`,
      durationMs: Date.now() - startTime,
    };
  }
}

async function main() {
  const testResults: TestResult[] = [];
  
  console.log('🧪 Starting Long-Horizon Correlation Engine Integration Test');
  console.log(`   User ID: ${userId}`);
  console.log(`   Lookback: ${lookbackMonths} months\n`);

  // Stage 1: ClickHouse connectivity
  testResults.push(await runTest('clickhouse_connectivity', async () => {
    if (!isClickHouseEnabled()) {
      return { pass: false, message: 'ClickHouse not configured' };
    }
    const result = await clickhouse.query<{ count: number }>('SELECT 1 as count', {});
    return { 
      pass: result.length === 1 && result[0].count === 1, 
      message: 'ClickHouse connection successful',
      data: { connected: true }
    };
  }));

  // Stage 2: Health ID resolution
  let healthId: string | null = null;
  testResults.push(await runTest('health_id_resolution', async () => {
    healthId = await getHealthId(userId);
    if (!healthId) {
      return { pass: false, message: 'Could not resolve health_id for user' };
    }
    return { 
      pass: true, 
      message: `Resolved health_id: ${healthId.substring(0, 8)}...`,
      data: { healthId: healthId.substring(0, 8) + '...' }
    };
  }));

  if (!healthId) {
    console.log('❌ Cannot proceed without health_id');
    process.exit(1);
  }

  // Stage 3: Check health_metrics data exists
  testResults.push(await runTest('health_metrics_data', async () => {
    const metrics = await clickhouse.query<{ count: number }>(`
      SELECT count() as count FROM flo_health.health_metrics 
      WHERE health_id = {healthId:String}
    `, { healthId });
    const count = metrics[0]?.count || 0;
    return { 
      pass: count > 0, 
      message: count > 0 ? `Found ${count} health metric records` : 'No health metrics found',
      data: { metricCount: count }
    };
  }));

  // Stage 4: Extract behavior events
  let behaviorEventCount = 0;
  testResults.push(await runTest('behavior_event_extraction', async () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - lookbackMonths);
    
    behaviorEventCount = await correlationEngine.extractBehaviorEvents(
      healthId!,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    
    return { 
      pass: true, 
      message: `Extracted ${behaviorEventCount} behavior events`,
      data: { behaviorEventCount }
    };
  }));

  // Stage 5: Build weekly cohorts
  testResults.push(await runTest('weekly_cohort_building', async () => {
    const cohortCount = await correlationEngine.buildWeeklyCohorts(healthId!, lookbackMonths);
    return { 
      pass: true, 
      message: `Built ${cohortCount} weekly cohort records`,
      data: { cohortCount }
    };
  }));

  // Stage 6: Build outcome rollups
  testResults.push(await runTest('outcome_rollup_building', async () => {
    const outcomeCount = await correlationEngine.buildWeeklyOutcomes(healthId!, lookbackMonths);
    return { 
      pass: true, 
      message: `Built ${outcomeCount} weekly outcome rollups`,
      data: { outcomeCount }
    };
  }));

  // Stage 7: Run correlation discovery
  let correlations: any[] = [];
  testResults.push(await runTest('correlation_discovery', async () => {
    correlations = await correlationEngine.discoverCorrelations(healthId!);
    return { 
      pass: true, 
      message: correlations.length > 0 
        ? `Discovered ${correlations.length} significant correlations`
        : 'No significant correlations found (may need more data)',
      data: { 
        correlationCount: correlations.length,
        correlations: correlations.slice(0, 3).map(c => ({
          behavior: c.behaviorType,
          outcome: c.outcomeType,
          effectPct: c.effectSizePct.toFixed(1) + '%',
          pValue: c.pValue.toFixed(4),
        }))
      }
    };
  }));

  // Stage 8: Verify deduplication
  testResults.push(await runTest('correlation_deduplication', async () => {
    const secondRun = await correlationEngine.discoverCorrelations(healthId!);
    return { 
      pass: secondRun.length <= correlations.length, 
      message: `Deduplication: second run found ${secondRun.length} (first: ${correlations.length})`,
      data: { firstRun: correlations.length, secondRun: secondRun.length }
    };
  }));

  // Stage 9: Get stored insights
  testResults.push(await runTest('long_term_insights_retrieval', async () => {
    const insights = await correlationEngine.getLongTermInsights(healthId!, 10);
    return { 
      pass: true, 
      message: `Retrieved ${insights.length} stored insights`,
      data: { insightCount: insights.length }
    };
  }));

  // Stage 10: Feedback question generation
  testResults.push(await runTest('feedback_question_generation', async () => {
    const q1 = await correlationEngine.generateFeedbackQuestion(
      healthId!,
      'pattern',
      [],
      ['illness_precursor'],
      { wrist_temperature_deviation: 0.5, respiratory_rate: 18 }
    );
    return { 
      pass: true, 
      message: q1 ? 'Generated feedback question' : 'Skipped (max pending or cooldown)',
      data: { generated: !!q1 }
    };
  }));

  // Stage 11: Get pending questions
  testResults.push(await runTest('pending_questions_retrieval', async () => {
    const questions = await correlationEngine.getPendingFeedbackQuestions(healthId!);
    return { 
      pass: questions.length <= 2, 
      message: `Found ${questions.length} pending questions (max 2 enforced)`,
      data: { pendingCount: questions.length }
    };
  }));

  // Stage 12: ClickHouse table counts
  testResults.push(await runTest('clickhouse_table_verification', async () => {
    const tables = ['behavior_events', 'weekly_behavior_cohorts', 'weekly_outcome_rollups', 'long_term_correlations', 'ai_feedback_questions'];
    const counts: Record<string, number> = {};
    
    for (const table of tables) {
      const result = await clickhouse.query<{ count: number }>(`
        SELECT count() as count FROM flo_health.${table}
        WHERE health_id = {healthId:String}
      `, { healthId: healthId! });
      counts[table] = result[0]?.count || 0;
    }
    
    return { 
      pass: true, 
      message: 'Table row counts retrieved',
      data: counts
    };
  }));

  // Print results
  console.log('\n📊 TEST RESULTS:');
  console.log('─'.repeat(80));
  
  for (const result of testResults) {
    const icon = result.status === 'pass' ? '✅' : '❌';
    console.log(`${icon} ${result.stage}: ${result.message} (${result.durationMs}ms)`);
    if (result.data) {
      console.log(`   Data: ${JSON.stringify(result.data)}`);
    }
  }
  
  const passCount = testResults.filter(t => t.status === 'pass').length;
  const failCount = testResults.filter(t => t.status === 'fail').length;
  const totalMs = testResults.reduce((sum, t) => sum + t.durationMs, 0);
  
  console.log('─'.repeat(80));
  console.log(`\n🏁 SUMMARY: ${passCount}/${testResults.length} tests passed in ${totalMs}ms`);
  
  if (failCount > 0) {
    console.log('⚠️  Some tests failed - review the output above');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
  }
}

main().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
