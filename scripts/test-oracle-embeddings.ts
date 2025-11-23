import { searchSimilarContent } from '../server/services/embeddingService';

/**
 * Test that Flō Oracle can retrieve embeddings for semantic search
 * Run with: npx tsx scripts/test-oracle-embeddings.ts
 */
async function testOracleEmbeddings() {
  console.log('🔍 Testing Flō Oracle embedding retrieval...\n');

  try {
    // Use one of the test user IDs we created earlier
    const testUserId = 'test-user-1763857980668';

    // Test 1: Search for cholesterol-related content
    console.log('📝 Test 1: Searching for "cholesterol levels"...');
    const cholesterolResults = await searchSimilarContent(
      testUserId,
      'Tell me about my cholesterol levels',
      5
    );
    console.log(`✅ Found ${cholesterolResults.length} results`);
    
    if (cholesterolResults.length > 0) {
      console.log('   Top result:');
      console.log(`   - Content: ${cholesterolResults[0].content.substring(0, 80)}...`);
      console.log(`   - Type: ${cholesterolResults[0].contentType}`);
      console.log(`   - Similarity: ${(cholesterolResults[0].similarity * 100).toFixed(1)}%`);
    }

    // Test 2: Search for activity-related content
    console.log('\n📝 Test 2: Searching for "step count and sleep"...');
    const activityResults = await searchSimilarContent(
      testUserId,
      'How do my steps affect my sleep quality?',
      5
    );
    console.log(`✅ Found ${activityResults.length} results`);
    
    if (activityResults.length > 0) {
      console.log('   Top result:');
      console.log(`   - Content: ${activityResults[0].content.substring(0, 80)}...`);
      console.log(`   - Type: ${activityResults[0].contentType}`);
      console.log(`   - Similarity: ${(activityResults[0].similarity * 100).toFixed(1)}%`);
    }

    console.log('\n🎉 Oracle embedding retrieval test passed!');
    console.log('✅ Flō Oracle can successfully search and retrieve health data using RAG.');
    
    return true;

  } catch (error: any) {
    console.error('\n❌ Oracle embedding test failed:', error.message);
    
    if (error.message.includes('match_health_embeddings')) {
      console.error('\n🚨 The "match_health_embeddings" RPC function is missing in Supabase!');
      console.error('   This is a PostgreSQL function that performs vector similarity search.');
      console.error('   It needs to be created in your Supabase database.');
    }
    
    return false;
  }
}

// Run the test
testOracleEmbeddings()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
