import { getClickHouseClient } from './server/services/clickhouseService';

async function checkDrivers() {
  const userId = '095f8978-a3ad-4fe1-af39-1bba9b6e8d78';
  const client = getClickHouseClient();
  
  // Check latest forecast_drivers - no FINAL for MergeTree
  console.log('=== Latest forecast_drivers ===');
  const driversResult = await client.query({
    query: `
      SELECT
        rank,
        driver_id,
        title,
        subtitle,
        confidence_level,
        toString(generated_at_utc) as generated_at_utc
      FROM flo_ml.forecast_drivers
      WHERE user_id = {userId:String}
      ORDER BY generated_at_utc DESC, rank ASC
      LIMIT 10
    `,
    query_params: { userId },
    format: 'JSONEachRow',
  });
  const drivers = await driversResult.json();
  console.log(JSON.stringify(drivers, null, 2));
  
  // Check latest simulator_results  
  console.log('\n=== Latest simulator_results ===');
  const simResult = await client.query({
    query: `
      SELECT
        lever_id,
        lever_title,
        effort,
        toString(generated_at_utc) as generated_at_utc
      FROM flo_ml.simulator_results
      WHERE user_id = {userId:String}
      ORDER BY generated_at_utc DESC
      LIMIT 10
    `,
    query_params: { userId },
    format: 'JSONEachRow',
  });
  const simData = await simResult.json();
  console.log(JSON.stringify(simData, null, 2));
  
  // Check what daily_features shows for weight
  console.log('\n=== daily_features with weight ===');
  const featuresResult = await client.query({
    query: `
      SELECT
        toString(local_date_key) as local_date_key,
        weight_kg,
        weight_trend_kg,
        body_fat_pct,
        lean_mass_kg,
        data_quality_weighins_per_week_14d,
        data_quality_staleness_days
      FROM flo_ml.daily_features
      WHERE user_id = {userId:String}
      ORDER BY local_date_key DESC
      LIMIT 10
    `,
    query_params: { userId },
    format: 'JSONEachRow',
  });
  const features = await featuresResult.json();
  console.log(JSON.stringify(features, null, 2));
  
  process.exit(0);
}

checkDrivers().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
