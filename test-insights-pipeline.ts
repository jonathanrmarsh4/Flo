/**
 * Test script to verify insights generation pipeline
 */
import { generateInsightCards } from './server/services/correlationEngine';
import { syncBloodWorkEmbeddings, syncHealthKitEmbeddings } from './server/services/embeddingService';
import { generateDailyReminder } from './server/services/dailyReminderService';
import { db } from './server/db';
import { bloodWorkRecords, analysisResults, userDailyMetrics } from '@shared/schema';
import { eq, desc, gte, and } from 'drizzle-orm';

async function testInsightsPipeline() {
  const testUserId = '34226453'; // User with 52 blood work records
  
  console.log(`\n=== Testing Insights Pipeline for User ${testUserId} ===\n`);
  
  try {
    // Step 1: Sync embeddings
    console.log('Step 1/3: Syncing embeddings...');
    
    // Get blood work data with analysis
    const bloodWorkRaw = await db
      .select()
      .from(bloodWorkRecords)
      .leftJoin(analysisResults, eq(bloodWorkRecords.id, analysisResults.recordId))
      .where(eq(bloodWorkRecords.userId, testUserId))
      .orderBy(desc(bloodWorkRecords.uploadedAt))
      .limit(10);

    const bloodWorkData = bloodWorkRaw.map(row => ({
      ...row.bloodWorkRecords,
      analysis: row.analysisResults,
    }));

    // Get recent HealthKit metrics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const healthKitData = await db
      .select()
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, testUserId),
          gte(userDailyMetrics.utcDayStart, thirtyDaysAgo)
        )
      )
      .orderBy(desc(userDailyMetrics.localDate));

    let embeddingCount = 0;
    if (bloodWorkData.length > 0) {
      console.log(`  - Processing ${bloodWorkData.length} blood work records...`);
      embeddingCount += await syncBloodWorkEmbeddings(testUserId, bloodWorkData as any);
    }
    if (healthKitData.length > 0) {
      console.log(`  - Processing ${healthKitData.length} HealthKit metrics...`);
      embeddingCount += await syncHealthKitEmbeddings(testUserId, healthKitData);
    }

    console.log(`✓ Synced ${embeddingCount} embeddings\n`);

    // Step 2: Generate insights
    console.log('Step 2/3: Generating insight cards...');
    const insights = await generateInsightCards(testUserId);
    console.log(`✓ Generated ${insights.length} insight cards\n`);

    if (insights.length > 0) {
      console.log('Sample insights:');
      insights.slice(0, 3).forEach((insight, i) => {
        console.log(`  ${i + 1}. ${insight.title}`);
        console.log(`     ${insight.description?.substring(0, 100)}...`);
      });
      console.log();
    }

    // Step 3: Generate daily reminder
    console.log('Step 3/3: Generating daily reminder notification...');
    const reminderResult = await generateDailyReminder(testUserId, '10:00', 'America/Los_Angeles');
    
    if (reminderResult.success) {
      console.log(`✓ Generated daily reminder notification`);
      console.log(`  Preview: ${reminderResult.reminderText?.substring(0, 150)}...`);
    } else {
      console.log(`✗ Failed to generate reminder: ${reminderResult.error}`);
    }

    console.log('\n=== Test Complete ===\n');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testInsightsPipeline();
