# SQL Migration Scripts

This directory contains one-time SQL migration and fix scripts.

## Scripts

- `fix-supabase-schema.sql` - Schema fixes for Supabase
- `fix-supabase-schema-complete.sql` - Complete schema fix
- `fix-source-id-nullable.sql` - Fix for nullable source_id columns
- `fix-supabase-column-names.sql` - Fix column naming issues
- `create-supabase-match-function.sql` - Create match function
- `create-supabase-match-function-fixed.sql` - Fixed version of match function
- `setup-user-insights-embeddings.sql` - Setup embeddings for user insights

## Status

These migrations may have already been applied. Review database state before re-running.

## Archive Policy

Consider archiving or removing migrations that have been applied to all environments.



