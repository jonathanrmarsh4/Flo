import { clickhouse, initializeClickHouse, isClickHouseEnabled } from '../server/services/clickhouseService';

const healthId = '29d2a63e-44a2-472c-a825-89be5a07cbeb'; // Jonathan

async function checkClickHouse() {
  if (!isClickHouseEnabled()) {
    console.log('ClickHouse is not enabled');
    process.exit(1);
  }
  
  await initializeClickHouse();
  
  console.log('\n=== ClickHouse Active Energy by Local Date ===\n');
  
  // Get unique values per local_date
  const query = `
    SELECT 
      local_date,
      metric_type,
      max(value) as max_value,
      min(value) as min_value,
      count() as entry_count
    FROM flo_health.health_metrics
    WHERE health_id = {healthId:String}
      AND metric_type = 'active_energy'
      AND recorded_at >= now() - INTERVAL 30 DAY
    GROUP BY local_date, metric_type
    ORDER BY local_date DESC
    LIMIT 15
  `;
  
  const rows = await clickhouse.query<{
    local_date: string;
    metric_type: string;
    max_value: number;
    min_value: number;
    entry_count: number;
  }>(query, { healthId });
  
  console.log('Date | Max Value | Min Value | Entry Count');
  console.log('-----|-----------|-----------|------------');
  rows.forEach(row => {
    console.log(`${row.local_date} | ${row.max_value?.toFixed(1)} | ${row.min_value?.toFixed(1)} | ${row.entry_count}`);
  });
  
  // Check what source the data comes from
  console.log('\n=== Sources of active_energy data ===\n');
  const sourceQuery = `
    SELECT 
      source,
      count() as count,
      avg(value) as avg_value
    FROM flo_health.health_metrics
    WHERE health_id = {healthId:String}
      AND metric_type = 'active_energy'
    GROUP BY source
  `;
  
  const sources = await clickhouse.query<{
    source: string;
    count: number;
    avg_value: number;
  }>(sourceQuery, { healthId });
  
  sources.forEach(row => {
    console.log(`Source: ${row.source}, count=${row.count}, avg=${row.avg_value?.toFixed(1)}`);
  });
  
  process.exit(0);
}

checkClickHouse();
