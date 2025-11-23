import { getSupabaseClient } from '../server/services/supabaseClient';

/**
 * Check what columns actually exist in health_embeddings table
 */
async function checkTable() {
  console.log('🔍 Checking actual Supabase table structure...\n');

  try {
    const supabase = getSupabaseClient();

    // Try a simple select to see what comes back
    console.log('📋 Attempting basic SELECT * query...');
    const { data, error, count } = await supabase
      .from('health_embeddings')
      .select('*', { count: 'exact' })
      .limit(0); // Don't return data, just check if query works

    if (error) {
      console.error('❌ SELECT failed:', error);
      return;
    }

    console.log('✅ SELECT succeeded!');
    console.log(`   Table exists with ${count} records`);

    // Now try selecting specific columns one by one to see which exist
    console.log('\n🔎 Testing individual columns:');
    
    const columnsToTest = [
      'id',
      'user_id',
      'content_type',
      'content',
      'metadata', 
      'embedding',
      'created_at'
    ];

    for (const col of columnsToTest) {
      const { error: colError } = await supabase
        .from('health_embeddings')
        .select(col)
        .limit(1);
      
      if (colError) {
        console.log(`   ❌ ${col}: ${colError.message}`);
      } else {
        console.log(`   ✅ ${col}`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ Unexpected error:', error.message);
  }
}

checkTable()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
