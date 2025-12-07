import { getSupabaseClient } from './server/services/supabaseClient';
import { getHealthId } from './server/services/supabaseHealthStorage';

const supabase = getSupabaseClient();
const userId = '34226453';

async function checkSupabaseData() {
  console.log('📊 Checking Supabase HealthKit Data...\n');

  const healthId = await getHealthId(userId);
  console.log('✅ Health ID:', healthId);

  // Check healthkit_samples table
  const { data: sampleMin } = await supabase
    .from('healthkit_samples')
    .select('start_date')
    .eq('health_id', healthId)
    .order('start_date', { ascending: true })
    .limit(1);
  
  const { data: sampleMax } = await supabase
    .from('healthkit_samples')
    .select('start_date')
    .eq('health_id', healthId)
    .order('start_date', { ascending: false })
    .limit(1);

  const { count: sampleCount } = await supabase
    .from('healthkit_samples')
    .select('*', { count: 'exact', head: true })
    .eq('health_id', healthId);

  console.log('\n📊 healthkit_samples table:');
  console.log('   Total records:', sampleCount?.toLocaleString() || 0);
  console.log('   Earliest:', sampleMin?.[0]?.start_date || 'N/A');
  console.log('   Latest:', sampleMax?.[0]?.start_date || 'N/A');

  // Check health_daily_metrics table
  const { data: metricsMin } = await supabase
    .from('health_daily_metrics')
    .select('local_date')
    .eq('health_id', healthId)
    .order('local_date', { ascending: true })
    .limit(1);

  const { data: metricsMax } = await supabase
    .from('health_daily_metrics')
    .select('local_date')
    .eq('health_id', healthId)
    .order('local_date', { ascending: false })
    .limit(1);

  const { count: metricsCount } = await supabase
    .from('health_daily_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('health_id', healthId);

  console.log('\n📊 health_daily_metrics table:');
  console.log('   Total records:', metricsCount?.toLocaleString() || 0);
  console.log('   Earliest:', metricsMin?.[0]?.local_date || 'N/A');
  console.log('   Latest:', metricsMax?.[0]?.local_date || 'N/A');

  // Check healthkit_workouts table
  const { data: workoutsMin } = await supabase
    .from('healthkit_workouts')
    .select('start_date')
    .eq('health_id', healthId)
    .order('start_date', { ascending: true })
    .limit(1);

  const { data: workoutsMax } = await supabase
    .from('healthkit_workouts')
    .select('start_date')
    .eq('health_id', healthId)
    .order('start_date', { ascending: false })
    .limit(1);

  const { count: workoutsCount } = await supabase
    .from('healthkit_workouts')
    .select('*', { count: 'exact', head: true })
    .eq('health_id', healthId);

  console.log('\n📊 healthkit_workouts table:');
  console.log('   Total records:', workoutsCount?.toLocaleString() || 0);
  console.log('   Earliest:', workoutsMin?.[0]?.start_date || 'N/A');
  console.log('   Latest:', workoutsMax?.[0]?.start_date || 'N/A');

  // Check sleep_nights table
  const { data: sleepMin } = await supabase
    .from('sleep_nights')
    .select('date')
    .eq('health_id', healthId)
    .order('date', { ascending: true })
    .limit(1);

  const { data: sleepMax } = await supabase
    .from('sleep_nights')
    .select('date')
    .eq('health_id', healthId)
    .order('date', { ascending: false })
    .limit(1);

  const { count: sleepCount } = await supabase
    .from('sleep_nights')
    .select('*', { count: 'exact', head: true })
    .eq('health_id', healthId);

  console.log('\n📊 sleep_nights table:');
  console.log('   Total records:', sleepCount?.toLocaleString() || 0);
  console.log('   Earliest:', sleepMin?.[0]?.date || 'N/A');
  console.log('   Latest:', sleepMax?.[0]?.date || 'N/A');
}

checkSupabaseData().catch(console.error);
