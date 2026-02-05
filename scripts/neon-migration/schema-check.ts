/**
 * Pre-migration: compare source and target Neon DB schema and row counts.
 * Requires SOURCE_DATABASE_URL and TARGET_DATABASE_URL in env.
 * Writes schema-check-report.json and prints a summary.
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { writeFileSync } from "fs";
import { join } from "path";

// @ts-expect-error - ws in Node for serverless driver
neonConfig.webSocketConstructor = ws;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;

if (!SOURCE_URL) {
  console.error("Set SOURCE_DATABASE_URL or DATABASE_URL in .env (current production DB)");
  process.exit(1);
}
if (!TARGET_URL) {
  console.error("Set TARGET_DATABASE_URL in .env (your new Neon DB to migrate to)");
  process.exit(1);
}

type TableMeta = {
  table_name: string;
  columns: { column_name: string; data_type: string; is_nullable: string }[];
};

type RowCounts = Record<string, number>;

async function getTablesAndColumns(pool: Pool): Promise<TableMeta[]> {
  const tablesResult = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const tables = (tablesResult.rows as { table_name: string }[]).map(
    (r) => r.table_name
  );

  const result: TableMeta[] = [];
  for (const table of tables) {
    const colResult = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    result.push({
      table_name: table,
      columns: colResult.rows as TableMeta["columns"],
    });
  }
  return result;
}

async function getRowCounts(pool: Pool): Promise<RowCounts> {
  const tablesResult = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const tables = (tablesResult.rows as { table_name: string }[]).map(
    (r) => r.table_name
  );

  const counts: RowCounts = {};
  for (const table of tables) {
    try {
      const r = await pool.query(`SELECT count(*)::int AS c FROM "${table}"`);
      counts[table] = (r.rows[0] as { c: number }).c;
    } catch (e) {
      counts[table] = -1; // error
    }
  }
  return counts;
}

function compareColumns(
  source: TableMeta[],
  target: TableMeta[]
): {
  onlyInSource: string[];
  onlyInTarget: string[];
  columnDiffs: { table: string; onlyInSource: string[]; onlyInTarget: string[] }[];
} {
  const sourceMap = new Map(source.map((t) => [t.table_name, t]));
  const targetMap = new Map(target.map((t) => [t.table_name, t]));
  const onlyInSource = source.filter((t) => !targetMap.has(t.table_name)).map((t) => t.table_name);
  const onlyInTarget = target.filter((t) => !sourceMap.has(t.table_name)).map((t) => t.table_name);

  const columnDiffs: { table: string; onlyInSource: string[]; onlyInTarget: string[] }[] = [];
  for (const t of source) {
    if (onlyInTarget.includes(t.table_name)) continue;
    const targetTable = targetMap.get(t.table_name);
    if (!targetTable) continue;
    const srcCols = new Set(t.columns.map((c) => `${c.column_name}:${c.data_type}`));
    const tgtCols = new Set(targetTable.columns.map((c) => `${c.column_name}:${c.data_type}`));
    const onlyInSourceCols = t.columns.filter((c) => !tgtCols.has(`${c.column_name}:${c.data_type}`)).map((c) => c.column_name);
    const onlyInTargetCols = targetTable.columns.filter((c) => !srcCols.has(`${c.column_name}:${c.data_type}`)).map((c) => c.column_name);
    if (onlyInSourceCols.length || onlyInTargetCols.length) {
      columnDiffs.push({
        table: t.table_name,
        onlyInSource: onlyInSourceCols,
        onlyInTarget: onlyInTargetCols,
      });
    }
  }
  return { onlyInSource, onlyInTarget, columnDiffs };
}

async function main() {
  const sourcePool = new Pool({ connectionString: SOURCE_URL });
  const targetPool = new Pool({ connectionString: TARGET_URL });

  try {
    console.log("Fetching source schema and row counts...");
    const [sourceMeta, sourceCounts] = await Promise.all([
      getTablesAndColumns(sourcePool),
      getRowCounts(sourcePool),
    ]);

    console.log("Fetching target schema and row counts...");
    const [targetMeta, targetCounts] = await Promise.all([
      getTablesAndColumns(targetPool),
      getRowCounts(targetPool),
    ]);

    const { onlyInSource, onlyInTarget, columnDiffs } = compareColumns(
      sourceMeta,
      targetMeta
    );

    const keyTables = [
      "users",
      "subscriptions",
      "sessions",
      "device_tokens",
      "notification_triggers",
      "notification_logs",
      "notification_queue",
      "notification_delivery_log",
      "auth_providers",
      "user_credentials",
      "profiles",
    ];

    const rowCountDiffs: { table: string; source: number; target: number }[] = [];
    const allTables = new Set([
      ...Object.keys(sourceCounts),
      ...Object.keys(targetCounts),
    ]);
    for (const table of [...allTables].sort()) {
      const s = sourceCounts[table] ?? null;
      const t = targetCounts[table] ?? null;
      if (s !== t) rowCountDiffs.push({ table, source: s ?? -1, target: t ?? -1 });
    }

    const report = {
      timestamp: new Date().toISOString(),
      schema: {
        tablesOnlyInSource: onlyInSource,
        tablesOnlyInTarget: onlyInTarget,
        columnDiffs,
      },
      rowCounts: { source: sourceCounts, target: targetCounts },
      rowCountDiffs,
      keyTablesRowCounts: keyTables.map((table) => ({
        table,
        source: sourceCounts[table] ?? null,
        target: targetCounts[table] ?? null,
      })),
    };

    const reportPath = join(__dirname, "schema-check-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    console.log("\nReport written to:", reportPath);

    console.log("\n--- Schema ---");
    if (onlyInSource.length) console.log("Tables only in SOURCE:", onlyInSource.join(", "));
    if (onlyInTarget.length) console.log("Tables only in TARGET:", onlyInTarget.join(", "));
    if (columnDiffs.length) {
      console.log("Column differences:", columnDiffs.length, "tables");
      columnDiffs.forEach((d) =>
        console.log("  ", d.table, { onlyInSource: d.onlyInSource, onlyInTarget: d.onlyInTarget })
      );
    }
    if (!onlyInSource.length && !onlyInTarget.length && !columnDiffs.length) {
      console.log("Schema match: same tables and columns.");
    }

    console.log("\n--- Key table row counts ---");
    report.keyTablesRowCounts.forEach((k) =>
      console.log(`  ${k.table}: source=${k.source} target=${k.target}`)
    );
    console.log("\n--- Row count diffs (source vs target) ---");
    if (rowCountDiffs.length) {
      rowCountDiffs.slice(0, 30).forEach((d) =>
        console.log(`  ${d.table}: source=${d.source} target=${d.target}`)
      );
      if (rowCountDiffs.length > 30) console.log("  ... and", rowCountDiffs.length - 30, "more");
    } else {
      console.log("  (none; all tables have same count or only exist on one side)");
    }
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
