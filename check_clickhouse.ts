import { getClickHouseClient, isClickHouseEnabled } from './server/services/clickhouseService';

async function checkUserData() {
  const userId = '095f8978-a3ad-4fe1-af39-1bba9b6e8d78';
  
  if (!isClickHouseEnabled()) {
    console.log('ClickHouse is NOT enabled!');
    return;
  }
  
  const client = getClickHouseClient();
  if (!client) {
    console.log('ClickHouse client not available!');
    return;
  }
  
  console.log('=== Checking ClickHouse data for user:', userId, '===\n');
  
  // Check raw_weight_events
  try {
    const weightResult = await client.query({
      query: `SELECT count() as cnt, min(timestamp_utc) as min_date, max(timestamp_utc) as max_date FROM flo_ml.raw_weight_events WHERE user_id = '${userId}'`,
      format: 'JSONEachRow',
    });
    const weightData = await weightResult.json();
    console.log('raw_weight_events:', JSON.stringify(weightData, null, 2));
  } catch (e: any) {
    console.log('raw_weight_events error:', e.message);
  }
  
  // Check daily_features
  try {
    const featuresResult = await client.query({
      query: `SELECT count() as cnt, min(local_date_key) as min_date, max(local_date_key) as max_date FROM flo_ml.daily_features WHERE user_id = '${userId}'`,
      format: 'JSONEachRow',
    });
    const featuresData = await featuresResult.json();
    console.log('daily_features:', JSON.stringify(featuresData, null, 2));
  } catch (e: any) {
    console.log('daily_features error:', e.message);
  }
  
  // Check forecast_drivers
  try {
    const driversResult = await client.query({
      query: `SELECT count() as cnt FROM flo_ml.forecast_drivers WHERE user_id = '${userId}'`,
      format: 'JSONEachRow',
    });
    const driversData = await driversResult.json();
    console.log('forecast_drivers:', JSON.stringify(driversData, null, 2));
  } catch (e: any) {
    console.log('forecast_drivers error:', e.message);
  }
  
  // Check simulator_results
  try {
    const simResult = await client.query({
      query: `SELECT count() as cnt FROM flo_ml.simulator_results WHERE user_id = '${userId}'`,
      format: 'JSONEachRow',
    });
    const simData = await simResult.json();
    console.log('simulator_results:', JSON.stringify(simData, null, 2));
  } catch (e: any) {
    console.log('simulator_results error:', e.message);
  }
  
  process.exit(0);
}

checkUserData().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
