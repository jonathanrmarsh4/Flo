#!/usr/bin/env bash
# Data-only migration using pg_dump/pg_restore. Run during maintenance window.
# Requires SOURCE_DATABASE_URL and TARGET_DATABASE_URL (or set in .env and source it).
set -e
if [ -z "$SOURCE_DATABASE_URL" ] || [ -z "$TARGET_DATABASE_URL" ]; then
  echo "Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL"
  exit 1
fi
DUMP_FILE="${1:-neon-data-only.dump}"
echo "Dumping data from source to $DUMP_FILE ..."
pg_dump "$SOURCE_DATABASE_URL" --data-only --no-owner --no-privileges -f "$DUMP_FILE"
echo "Restoring data to target from $DUMP_FILE ..."
pg_restore --data-only --no-owner --no-privileges -d "$TARGET_DATABASE_URL" "$DUMP_FILE" || true
echo "Done. Run npm run neon:verify to check parity."
