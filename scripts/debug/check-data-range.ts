import { isClickHouseEnabled, clickhouse } from './server/services/clickhouseService';

async function checkDateRange() {
  if (!isClickHouseEnabled()) {
    console.log('ClickHouse not enabled');
    return;
  }

  const healthId = '29d2a63e-44a2-472c-a825-89be5a07cbeb';

  // Check date range of health_metrics
  const metricsRange = await clickhouse.query<{ min_date: string; max_date: string; total: number }>(
    `SELECT 
      min(local_date) as min_date,
      max(local_date) as max_date,
      count() as total
    FROM flo_health.health_metrics
    WHERE health_id = {healthId:String}`,
    { healthId }
  );
  
  console.log('📊 Health Metrics Date Range:');
  console.log('   Earliest:', metricsRange[0]?.min_date);
  console.log('   Latest:', metricsRange[0]?.max_date);
  console.log('   Total records:', metricsRange[0]?.total);

  // Check date range of behavior_events
  const behaviorRange = await clickhouse.query<{ min_date: string; max_date: string; total: number }>(
    `SELECT 
      min(toDate(event_time)) as min_date,
      max(toDate(event_time)) as max_date,
      count() as total
    FROM flo_health.behavior_events
    WHERE health_id = {healthId:String}`,
    { healthId }
  );
  
  console.log('\n📊 Behavior Events Date Range:');
  console.log('   Earliest:', behaviorRange[0]?.min_date);
  console.log('   Latest:', behaviorRange[0]?.max_date);
  console.log('   Total records:', behaviorRange[0]?.total);

  // Check weekly cohorts
  const cohortRange = await clickhouse.query<{ min_week: string; max_week: string; total: number }>(
    `SELECT 
      min(week_start) as min_week,
      max(week_start) as max_week,
      count() as total
    FROM flo_health.weekly_behavior_cohorts
    WHERE health_id = {healthId:String}`,
    { healthId }
  );
  
  console.log('\n📊 Weekly Behavior Cohorts:');
  console.log('   Earliest week:', cohortRange[0]?.min_week);
  console.log('   Latest week:', cohortRange[0]?.max_week);
  console.log('   Total weeks:', cohortRange[0]?.total);

  // Check weekly outcomes
  const outcomeRange = await clickhouse.query<{ min_week: string; max_week: string; total: number }>(
    `SELECT 
      min(week_start) as min_week,
      max(week_start) as max_week,
      count() as total
    FROM flo_health.weekly_outcome_rollups
    WHERE health_id = {healthId:String}`,
    { healthId }
  );
  
  console.log('\n📊 Weekly Outcome Rollups:');
  console.log('   Earliest week:', outcomeRange[0]?.min_week);
  console.log('   Latest week:', outcomeRange[0]?.max_week);
  console.log('   Total weeks:', outcomeRange[0]?.total);

  // Check months with data
  const monthlyBreakdown = await clickhouse.query<{ month: string; count: number }>(
    `SELECT 
      toStartOfMonth(local_date) as month,
      count() as count
    FROM flo_health.health_metrics
    WHERE health_id = {healthId:String}
    GROUP BY month
    ORDER BY month DESC
    LIMIT 30`,
    { healthId }
  );
  
  console.log('\n📊 Monthly Data Breakdown (last 30 months):');
  for (const m of monthlyBreakdown) {
    console.log('   ' + m.month + ': ' + m.count.toLocaleString() + ' records');
  }
}

checkDateRange().catch(console.error);
