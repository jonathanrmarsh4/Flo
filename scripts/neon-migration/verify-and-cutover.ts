/**
 * Post-migration: re-run row counts for parity check, then print cutover steps.
 * Requires SOURCE_DATABASE_URL and TARGET_DATABASE_URL (and optionally DATABASE_URL to suggest update).
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";

// @ts-expect-error - ws in Node for serverless driver
neonConfig.webSocketConstructor = ws;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;

if (!SOURCE_URL || !TARGET_URL) {
  console.error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL");
  process.exit(1);
}

const KEY_TABLES = [
  "users",
  "subscriptions",
  "sessions",
  "device_tokens",
  "notification_triggers",
  "notification_logs",
  "auth_providers",
  "user_credentials",
  "profiles",
];

async function getRowCount(pool: Pool, table: string): Promise<number> {
  try {
    const r = await pool.query(`SELECT count(*)::int AS c FROM "${table}"`);
    return (r.rows[0] as { c: number }).c;
  } catch {
    return -1;
  }
}

async function main() {
  const source = new Pool({ connectionString: SOURCE_URL });
  const target = new Pool({ connectionString: TARGET_URL });

  try {
    console.log("Row count verification (source vs target):\n");
    let allMatch = true;
    for (const table of KEY_TABLES) {
      const [src, tgt] = await Promise.all([
        getRowCount(source, table),
        getRowCount(target, table),
      ]);
      const match = src === tgt ? "OK" : "MISMATCH";
      if (src !== tgt) allMatch = false;
      console.log(`  ${table}: source=${src} target=${tgt} ${match}`);
    }
    console.log("");
    if (allMatch) {
      console.log("Parity OK. Proceed with cutover:\n");
      console.log("1. Update DATABASE_URL in .env (and deployment config) to your TARGET_DATABASE_URL.");
      console.log("2. Restart the server and test login/registration and critical flows.");
      console.log("3. Keep the source DB read-only for a short rollback window.");
    } else {
      console.log("Some counts differ. Review before cutover.");
    }
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
