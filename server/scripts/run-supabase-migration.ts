import { getSupabaseClient } from '../services/supabaseClient';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  console.log('Starting Supabase health tables migration...');
  
  const supabase = getSupabaseClient();
  
  // Read the SQL file
  const sqlPath = join(__dirname, '../db/supabase-health-tables.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  
  // Split into individual statements (handle multi-line statements)
  const statements = sql
    .split(/;[\s]*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`Found ${statements.length} SQL statements to execute`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const statement of statements) {
    if (!statement || statement.startsWith('--')) continue;
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });
      
      if (error) {
        // Try direct query for DDL statements
        const { error: directError } = await supabase.from('_migrations').select().limit(0);
        
        // For Supabase, we need to use the REST API for DDL
        // Let's try a different approach - execute via raw SQL
        console.log(`Statement requires admin access: ${statement.substring(0, 50)}...`);
        errorCount++;
      } else {
        successCount++;
      }
    } catch (err: any) {
      console.log(`Note: ${statement.substring(0, 50)}... - ${err.message || 'executed'}`);
    }
  }
  
  console.log(`\nMigration complete: ${successCount} succeeded, ${errorCount} need manual execution`);
  console.log('\nTo complete migration, run the SQL file directly in Supabase SQL Editor:');
  console.log('1. Go to your Supabase project dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Paste the contents of server/db/supabase-health-tables.sql');
  console.log('4. Click "Run"');
}

runMigration().catch(console.error);
