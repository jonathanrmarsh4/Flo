import { getSupabaseClient } from '../server/services/supabaseClient';

const supabase = getSupabaseClient();
const healthId = '29d2a63e-44a2-472c-a825-89be5a07cbeb'; // Jonathan

async function checkData() {
  // Get the last 30 days of active_energy_kcal data
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  console.log('\n=== Active Energy Data for Jonathan (last 30 days) ===\n');
  
  const { data, error } = await supabase
    .from('user_daily_metrics')
    .select('local_date, active_energy_kcal, steps_raw_sum, steps_normalized')
    .eq('health_id', healthId)
    .gte('local_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('local_date', { ascending: false });
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Date | ActiveEnergy | StepsRaw | StepsNorm');
  console.log('-----|--------------|----------|----------');
  
  const energies: number[] = [];
  data?.forEach(row => {
    if (row.active_energy_kcal !== null) {
      energies.push(row.active_energy_kcal);
    }
    console.log(`${row.local_date} | ${row.active_energy_kcal?.toFixed(1) || 'null'} | ${row.steps_raw_sum || 'null'} | ${row.steps_normalized || 'null'}`);
  });
  
  // Calculate average
  if (energies.length > 0) {
    const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
    console.log(`\nAverage active energy (last ${energies.length} days): ${avg.toFixed(1)} kcal`);
  }
  
  process.exit(0);
}

checkData();
