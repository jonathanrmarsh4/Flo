import { getClickHouseClient } from './server/services/clickhouseService';

async function check() {
  const userId = '095f8978-a3ad-4fe1-af39-1bba9b6e8d78';
  const client = getClickHouseClient();
  
  // Check daily_weight_features (intermediate table from Job 010)
  console.log('=== daily_weight_features ===');
  const result = await client.query({
    query: `
      SELECT
        toString(local_date_key) as local_date_key,
        weight_daily_kg,
        weight_daily_source
      FROM flo_ml.daily_weight_features
      WHERE user_id = {userId:String}
      ORDER BY local_date_key DESC
      LIMIT 10
    `,
    query_params: { userId },
    format: 'JSONEachRow',
  });
  const data = await result.json();
  console.log(JSON.stringify(data, null, 2));
  
  // Check raw_weight_events for recent dates
  console.log('\n=== raw_weight_events (last 30 days) ===');
  const rawResult = await client.query({
    query: `
      SELECT
        toString(local_date_key) as local_date_key,
        weight_kg,
        source_type
      FROM flo_ml.raw_weight_events
      WHERE user_id = {userId:String}
        AND local_date_key >= today() - 30
      ORDER BY local_date_key DESC
      LIMIT 10
    `,
    query_params: { userId },
    format: 'JSONEachRow',
  });
  const rawData = await rawResult.json();
  console.log(JSON.stringify(rawData, null, 2));
  
  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
