/**
 * ClickHouse Health Sync - STUB
 *
 * ClickHouse has been removed from the Flō stack.
 * All sync functions are silent no-ops so callers continue to compile and run.
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('ClickHouseHealthSyncStub');

export async function syncRecoverySessionToClickHouse(
  _healthId: string,
  _session: Record<string, unknown>
): Promise<void> {
  logger.debug('[ClickHouseHealthSyncStub] syncRecoverySessionToClickHouse() – no-op');
}

export async function syncSleepMetricsToClickHouse(
  _healthId: string,
  _metrics: Record<string, unknown>
): Promise<void> {
  logger.debug('[ClickHouseHealthSyncStub] syncSleepMetricsToClickHouse() – no-op');
}

export async function syncOuraSpO2ToClickHouse(
  _healthId: string,
  _data: Record<string, unknown>
): Promise<void> {
  logger.debug('[ClickHouseHealthSyncStub] syncOuraSpO2ToClickHouse() – no-op');
}
