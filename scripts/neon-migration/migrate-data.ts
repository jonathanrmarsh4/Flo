/**
 * Data-only migration: copy rows from source to target table-by-table.
 * Run during maintenance window. Requires SOURCE_DATABASE_URL and TARGET_DATABASE_URL.
 * Order: identity/core first (users, auth_providers, user_credentials, sessions), then rest.
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

const CORE_FIRST = [
  "users",
  "auth_providers",
  "user_credentials",
  "sessions",
  "profiles",
  "api_keys",
  "passkey_credentials",
  "billing_customers",
  "subscriptions",
  "payments",
  "device_tokens",
  "notification_triggers",
  "notification_logs",
  "notification_queue",
  "notification_delivery_log",
  "user_notification_schedules",
  "scheduled_notification_templates",
  "apns_configuration",
];

async function getTableList(pool: Pool): Promise<string[]> {
  const r = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return (r.rows as { table_name: string }[]).map((x) => x.table_name);
}

async function copyTable(
  source: Pool,
  target: Pool,
  table: string
): Promise<{ rows: number; error?: string }> {
  try {
    const rows = await source.query(`SELECT * FROM "${table}"`);
    if (rows.rows.length === 0) {
      return { rows: 0 };
    }
    const cols = Object.keys(rows.rows[0] as object);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    let inserted = 0;
    for (const row of rows.rows as Record<string, unknown>[]) {
      const values = cols.map((c) => row[c]);
      try {
        await target.query(insertSql, values);
        inserted++;
      } catch (e: any) {
        if (e.code === "23505") continue; // unique violation, skip
        throw e;
      }
    }
    return { rows: inserted };
  } catch (e: any) {
    return { rows: 0, error: e.message };
  }
}

async function main() {
  const source = new Pool({ connectionString: SOURCE_URL });
  const target = new Pool({ connectionString: TARGET_URL });

  try {
    const sourceTables = await getTableList(source);
    const targetTables = new Set(await getTableList(target));
    const toCopy = [...CORE_FIRST.filter((t) => sourceTables.includes(t))];
    for (const t of sourceTables) {
      if (!toCopy.includes(t)) toCopy.push(t);
    }

    console.log("Tables to copy:", toCopy.length);
    for (const table of toCopy) {
      if (!targetTables.has(table)) {
        console.log("  SKIP (missing on target):", table);
        continue;
      }
      const result = await copyTable(source, target, table);
      if (result.error) {
        console.log("  ERROR", table, result.error);
      } else {
        console.log("  OK", table, "rows:", result.rows);
      }
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
