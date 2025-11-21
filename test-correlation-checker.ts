/**
 * Test script for real-time correlation checker
 * 
 * Simulates user mentioning behaviors in Oracle chat and checks for correlations
 */

import { detectBehavior, checkBehaviorCorrelation } from './server/services/realtimeCorrelationChecker';

async function testCorrelationChecker() {
  console.log('=== Real-time Correlation Checker Test ===\n');

  // Test 1: Behavior detection
  console.log('Test 1: Behavior Detection');
  console.log('---------------------------');
  
  const testMessages = [
    "I had a glass of whiskey last night",
    "Just finished a sauna session",
    "Did an ice bath this morning",
    "Feeling really stressed today",
    "Had coffee at 3pm",
    "Hey how are you?", // Should NOT detect
  ];

  for (const msg of testMessages) {
    const detected = detectBehavior(msg);
    console.log(`Message: "${msg}"`);
    console.log(`Detected: ${detected || 'none'}\n`);
  }

  // Test 2: Correlation check (requires user with data)
  console.log('\nTest 2: Correlation Check');
  console.log('---------------------------');
  
  const userId = process.argv[2];
  
  if (!userId) {
    console.log('⚠️  Skipping correlation check - no userId provided');
    console.log('Usage: npx tsx test-correlation-checker.ts <userId>');
    console.log('\nDetection tests passed! ✅');
    return;
  }

  console.log(`Checking alcohol correlation for user: ${userId}\n`);

  try {
    const result = await checkBehaviorCorrelation(userId, 'alcohol', 'I had whiskey last night');
    
    console.log('Correlation Result:');
    console.log(`  Has Correlation: ${result.hasCorrelation}`);
    console.log(`  Sample Size: ${result.sampleSize} past events`);
    console.log(`  Insight: ${result.insight || 'No significant pattern detected'}`);
    
    if (result.hasCorrelation) {
      console.log('\n✅ Correlation found! This will be shown to user.');
    } else if (result.sampleSize > 0) {
      console.log('\n📊 Data logged, tracking for patterns.');
    } else {
      console.log('\n📝 First occurrence logged.');
    }

  } catch (error: any) {
    console.error('❌ Error checking correlation:', error.message);
  }
}

testCorrelationChecker();
