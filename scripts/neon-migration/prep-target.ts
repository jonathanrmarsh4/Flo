/**
 * Apply project DDL (migrations) to TARGET_DATABASE_URL so schema matches source before data copy.
 * Requires TARGET_DATABASE_URL in env.
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// @ts-expect-error - ws in Node for serverless driver
neonConfig.webSocketConstructor = ws;

const TARGET_URL = process.env.TARGET_DATABASE_URL;
if (!TARGET_URL) {
  console.error("Set TARGET_DATABASE_URL");
  process.exit(1);
}

const MIGRATIONS_DIR = join(__dirname, "../../migrations");

function splitStatements(content: string): string[] {
  if (content.includes("statement-breakpoint")) {
    return content
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));
  }
  return content
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

async function main() {
  const pool = new Pool({ connectionString: TARGET_URL });
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();

  if (files.length === 0) {
    console.log("No migration .sql files in migrations/");
    await pool.end();
    return;
  }

  console.log("Applying migrations to TARGET:", files.join(", "));
  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file);
    const content = readFileSync(path, "utf-8");
    const statements = splitStatements(content);

    for (const stmt of statements) {
      const sql = stmt.endsWith(";") ? stmt : stmt + ";";
      try {
        await pool.query(sql);
        applied++;
      } catch (e: any) {
        if (e.code === "42P07" || e.message?.includes("already exists")) {
          skipped++;
          continue; // relation/enum already exists
        }
        if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
          skipped++;
          continue;
        }
        console.error("Error executing:", sql.slice(0, 80) + "...", e.message);
        throw e;
      }
    }
  }

  console.log("Done. Statements applied:", applied, "skipped (already exist):", skipped);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
