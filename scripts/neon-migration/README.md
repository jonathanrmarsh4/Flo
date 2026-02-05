# Neon data migration (source → target)

Follow the plan in `.cursor/plans/neon_data_migration_*.plan.md`. Use these scripts with a short maintenance window.

## Env

Set (e.g. in `.env` or export before running):

- `SOURCE_DATABASE_URL` – current production (Replit Neon)
- `TARGET_DATABASE_URL` – new Neon project

Example (do not commit real URLs):

```bash
export SOURCE_DATABASE_URL="postgresql://...ep-long-dust-ah0lstg9.../neondb?sslmode=require"
export TARGET_DATABASE_URL="postgresql://...ep-wandering-sea-a7nxpdu8.../neondb?sslmode=require"
```

## 1. Pre-migration: schema check and row counts

Compares public schema (tables, columns) and row counts between source and target. Writes `schema-check-report.json`.

```bash
npm run neon:schema-check
# or: npx tsx scripts/neon-migration/schema-check.ts
```

## 2. Prepare target (if schema drift)

If the report shows tables or columns missing on target, apply DDL to target (migrations) so schema matches before copying data:

```bash
npm run neon:prep-target
```

This runs the project’s Drizzle migrations against `TARGET_DATABASE_URL` only (no data copy).

## 3. Data migration (maintenance window)

Put the app in maintenance mode, then:

**Option A – pg_dump / pg_restore (recommended)**

```bash
# Data-only dump from source
pg_dump "$SOURCE_DATABASE_URL" --data-only --no-owner --no-privileges -f neon-data-only.dump

# Load into target (truncate or ensure tables empty if re-running)
pg_restore --data-only --no-owner --no-privileges -d "$TARGET_DATABASE_URL" neon-data-only.dump
```

**Option B – Node script (table-by-table)**

If you prefer not to use `pg_dump`/`pg_restore`, use the table-by-table copy script:

```bash
npm run neon:migrate-data
```

## 4. Verify and cutover

Re-check row counts and key data, then point the app at target:

```bash
npm run neon:verify
```

Then:

1. **Cutover:** Set `DATABASE_URL` in `.env` (and deployment config) to the same value as `TARGET_DATABASE_URL`, then restart the server.
2. Test login/registration and critical flows.
3. Keep source read-only for a short rollback window.
