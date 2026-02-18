/**
 * ClickHouse Service - STUB
 *
 * ClickHouse has been removed from the Flō stack. All ML analytics now run via
 * Supabase + AI (Gemini / OpenAI). This stub preserves the import surface so that
 * services that still reference this module compile and run without errors.
 * All operations are silent no-ops.
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('ClickHouseStub');

// Stub client that satisfies callers that type-check the returned object
export const clickhouse = {
  isEnabled: () => false,
  healthCheck: async () => ({ healthy: false, message: 'ClickHouse not configured' }),
  initialize: async () => false,
  query: async <T = unknown>(_sql: string, _params?: Record<string, unknown>): Promise<T[]> => {
    logger.debug('[ClickHouseStub] query() called – returning empty array');
    return [];
  },
  insert: async (_table: string, _rows: unknown[]): Promise<void> => {
    logger.debug('[ClickHouseStub] insert() called – no-op');
  },
  command: async (_sql: string, _params?: Record<string, unknown>): Promise<void> => {
    logger.debug('[ClickHouseStub] command() called – no-op');
  },
};

// Named exports used by various services
export function getClickHouseClient(): null {
  return null;
}

export function isClickHouseEnabled(): boolean {
  return false;
}

export async function initializeClickHouse(): Promise<boolean> {
  return false;
}

// Aliases used by subjectiveSurveyService
export const insert = clickhouse.insert.bind(clickhouse);
export const query = clickhouse.query.bind(clickhouse);
