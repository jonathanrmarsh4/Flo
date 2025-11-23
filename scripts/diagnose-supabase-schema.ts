import { getSupabaseClient } from '../server/services/supabaseClient';

/**
 * Diagnostic script to check Supabase health_embeddings table schema
 * Run with: npx tsx scripts/diagnose-supabase-schema.ts
 */
async function diagnoseSchema() {
  console.log('🔍 Checking Supabase health_embeddings table schema...\n');

  try {
    const supabase = getSupabaseClient();

    // Test 1: Try to query the table structure via PostgREST
    console.log('📋 Test 1: Querying table to see what columns exist...');
    const { data, error } = await supabase
      .from('health_embeddings')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Query failed:', error.message);
      console.error('   Error code:', error.code);
      console.error('   Error details:', error.details);
      console.error('   Error hint:', error.hint);
      
      if (error.code === 'PGRST204') {
        console.log('\n⚠️  PGRST204 error detected - this means PostgREST cannot find expected columns.');
        console.log('   This could mean:');
        console.log('   1. The "content" column is missing from the table');
        console.log('   2. The PostgREST schema cache is stale');
        console.log('   3. The table schema doesn\'t match what the code expects');
      }
      
      return false;
    }

    console.log('✅ Query succeeded!');
    console.log('   Records found:', data?.length || 0);
    
    if (data && data.length > 0) {
      console.log('\n📊 Sample record structure:');
      const sampleRecord = data[0];
      const columns = Object.keys(sampleRecord);
      console.log('   Columns found:', columns.join(', '));
      
      // Check for expected columns
      const expectedColumns = ['id', 'user_id', 'content_type', 'content', 'metadata', 'embedding', 'created_at'];
      console.log('\n🔎 Column validation:');
      
      for (const col of expectedColumns) {
        const exists = columns.includes(col);
        console.log(`   ${exists ? '✅' : '❌'} ${col}`);
      }
      
      const missingColumns = expectedColumns.filter(col => !columns.includes(col));
      if (missingColumns.length > 0) {
        console.log('\n⚠️  Missing columns:', missingColumns.join(', '));
      } else {
        console.log('\n✅ All expected columns are present!');
      }
    } else {
      console.log('\n📝 Table is empty - cannot verify column structure from data.');
      console.log('   Attempting to insert a test record to verify schema...');
      
      // Test 2: Try to insert a test record with all expected columns
      const testUserId = 'test-user-id';
      const testInsert = await supabase
        .from('health_embeddings')
        .insert({
          user_id: testUserId,
          content_type: 'blood_work',
          content: 'Test content for schema validation',
          metadata: { test: true },
          embedding: new Array(1536).fill(0),
        })
        .select('id');

      if (testInsert.error) {
        console.error('\n❌ Test insert failed:', testInsert.error.message);
        console.error('   Error code:', testInsert.error.code);
        
        if (testInsert.error.code === 'PGRST204') {
          console.log('\n🚨 CONFIRMED: The "content" column is missing from health_embeddings table!');
          console.log('\n📝 Required fix:');
          console.log('   1. Log into Supabase dashboard');
          console.log('   2. Navigate to SQL Editor');
          console.log('   3. Execute: ALTER TABLE health_embeddings ADD COLUMN content TEXT NOT NULL DEFAULT \'\';');
          console.log('   4. Execute: ALTER TABLE health_embeddings ALTER COLUMN content DROP DEFAULT;');
          console.log('   5. Execute: NOTIFY pgrst, \'reload schema\';');
        }
        
        return false;
      }

      console.log('✅ Test insert succeeded! Schema is valid.');
      
      // Clean up test record
      await supabase
        .from('health_embeddings')
        .delete()
        .eq('user_id', testUserId);
      
      console.log('✅ Test record cleaned up.');
    }

    console.log('\n✅ Schema diagnosis complete!');
    return true;

  } catch (error: any) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error('   Stack trace:', error.stack);
    return false;
  }
}

// Run the diagnostic
diagnoseSchema()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
