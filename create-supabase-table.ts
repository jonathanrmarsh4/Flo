import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTable() {
  try {
    console.log('Creating daily_reminders table in Supabase...');
    
    const sql = fs.readFileSync('server/db/supabase-daily-reminders-table.sql', 'utf-8');
    
    // Split the SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/**'));
    
    console.log(`Executing ${statements.length} SQL statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.includes('CREATE TABLE') || statement.includes('CREATE INDEX') || 
          statement.includes('CREATE POLICY') || statement.includes('ALTER') ||
          statement.includes('COMMENT')) {
        console.log(`[${i + 1}/${statements.length}] Executing: ${statement.substring(0, 50)}...`);
        
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          console.error(`Error on statement ${i + 1}:`, error);
          // Continue anyway - some errors are expected (e.g., table already exists)
        }
      }
    }
    
    // Verify table was created
    console.log('\nVerifying table creation...');
    const { data, error } = await supabase
      .from('daily_reminders')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Table verification failed:', error);
      console.log('\nTrying direct SQL approach...');
      
      // Try using the SQL directly through the client
      const { data: result, error: sqlError } = await (supabase as any)
        .rpc('query', { query_text: 'SELECT COUNT(*) FROM public.daily_reminders' });
      
      if (sqlError) {
        console.error('Direct SQL also failed. Manual setup required.');
        console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
        console.log('==================================================');
        console.log(sql);
        console.log('==================================================');
        process.exit(1);
      } else {
        console.log('✅ Table exists and is accessible!');
      }
    } else {
      console.log('✅ Table created successfully!');
      console.log(`Current record count: ${data?.length || 0}`);
    }
    
  } catch (error: any) {
    console.error('Failed to create table:', error.message);
    console.log('\nPlease run the SQL script manually in Supabase SQL Editor:');
    console.log('File: server/db/supabase-daily-reminders-table.sql');
    process.exit(1);
  }
}

createTable();
