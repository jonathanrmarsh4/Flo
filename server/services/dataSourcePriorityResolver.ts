/**
 * Data Source Priority Resolver
 * 
 * Determines which data source to use when multiple sources provide the same metric.
 * Uses user preferences, metric-specific defaults, and data quality signals.
 */

import { db } from '../db';
import { userDataSourcePreferences, userIntegrations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { 
  DATA_SOURCES, 
  DataSource, 
  OURA_PREFERRED_METRICS, 
  HEALTHKIT_PREFERRED_METRICS,
  DATA_SOURCE_CAPABILITIES,
} from '@shared/dataSource';
import type { UserDataSourcePreferences } from '@shared/schema';

// Default priority order when no user preference is set
const DEFAULT_PRIORITY_ORDER: DataSource[] = ['oura', 'healthkit', 'dexcom', 'manual'];

// Cache for user preferences (TTL: 5 minutes)
const preferencesCache = new Map<string, { prefs: UserDataSourcePreferences | null; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get user's data source preferences (with caching)
 */
export async function getUserPreferences(userId: string): Promise<UserDataSourcePreferences | null> {
  const cached = preferencesCache.get(userId);
  if (cached && cached.expiry > Date.now()) {
    return cached.prefs;
  }
  
  const prefs = await db.query.userDataSourcePreferences.findFirst({
    where: eq(userDataSourcePreferences.userId, userId),
  });
  
  preferencesCache.set(userId, { prefs: prefs || null, expiry: Date.now() + CACHE_TTL_MS });
  return prefs || null;
}

/**
 * Get connected integrations for a user
 */
export async function getConnectedSources(userId: string): Promise<DataSource[]> {
  const integrations = await db.query.userIntegrations.findMany({
    where: eq(userIntegrations.userId, userId),
  });
  
  const connected: DataSource[] = ['healthkit']; // HealthKit is always available via iOS app
  
  for (const integration of integrations) {
    if (integration.status === 'connected' && integration.enabled) {
      connected.push(integration.provider as DataSource);
    }
  }
  
  return connected;
}

/**
 * Resolve which data source to use for a specific metric
 * 
 * @param userId - User ID
 * @param metricName - Name of the metric (e.g., 'hrv', 'sleep_duration', 'steps')
 * @param availableSources - Sources that have data for this metric on this day
 * @returns The preferred data source to use
 */
export async function resolveSourceForMetric(
  userId: string,
  metricName: string,
  availableSources: DataSource[]
): Promise<DataSource> {
  if (availableSources.length === 0) {
    throw new Error('No data sources available for metric');
  }
  
  if (availableSources.length === 1) {
    return availableSources[0];
  }
  
  const prefs = await getUserPreferences(userId);
  
  // 1. Check user's explicit preference for this metric
  if (prefs?.metricSources?.[metricName]) {
    const preferred = prefs.metricSources[metricName] as DataSource;
    if (availableSources.includes(preferred)) {
      return preferred;
    }
  }
  
  // 2. Check if user has auto-select enabled (use quality-based defaults)
  if (prefs?.autoSelectBestSource) {
    return getDefaultSourceForMetric(metricName, availableSources);
  }
  
  // 3. Use user's default source if available
  if (prefs?.defaultSource && availableSources.includes(prefs.defaultSource as DataSource)) {
    return prefs.defaultSource as DataSource;
  }
  
  // 4. Fall back to quality-based defaults
  return getDefaultSourceForMetric(metricName, availableSources);
}

/**
 * Get the default best source for a metric based on data quality
 */
function getDefaultSourceForMetric(
  metricName: string,
  availableSources: DataSource[]
): DataSource {
  // Dexcom is always preferred for glucose metrics
  if (metricName.includes('glucose') && availableSources.includes('dexcom')) {
    return 'dexcom';
  }
  
  // Oura preferred metrics
  if (OURA_PREFERRED_METRICS.includes(metricName) && availableSources.includes('oura')) {
    return 'oura';
  }
  
  // HealthKit preferred metrics
  if (HEALTHKIT_PREFERRED_METRICS.includes(metricName) && availableSources.includes('healthkit')) {
    return 'healthkit';
  }
  
  // Default priority order
  for (const source of DEFAULT_PRIORITY_ORDER) {
    if (availableSources.includes(source)) {
      return source;
    }
  }
  
  return availableSources[0];
}

/**
 * Resolve sources for multiple metrics at once
 */
export async function resolveSourcesForMetrics(
  userId: string,
  metricsWithSources: Record<string, DataSource[]>
): Promise<Record<string, DataSource>> {
  const prefs = await getUserPreferences(userId);
  const result: Record<string, DataSource> = {};
  
  for (const [metric, sources] of Object.entries(metricsWithSources)) {
    if (sources.length === 0) continue;
    
    if (sources.length === 1) {
      result[metric] = sources[0];
      continue;
    }
    
    // Check user preference
    if (prefs?.metricSources?.[metric]) {
      const preferred = prefs.metricSources[metric] as DataSource;
      if (sources.includes(preferred)) {
        result[metric] = preferred;
        continue;
      }
    }
    
    // Use default
    result[metric] = getDefaultSourceForMetric(metric, sources);
  }
  
  return result;
}

/**
 * Update user's preference for a specific metric
 */
export async function setMetricSourcePreference(
  userId: string,
  metricName: string,
  source: DataSource
): Promise<void> {
  const existing = await getUserPreferences(userId);
  
  const newMetricSources = {
    ...(existing?.metricSources || {}),
    [metricName]: source,
  };
  
  if (existing) {
    await db
      .update(userDataSourcePreferences)
      .set({ 
        metricSources: newMetricSources,
        updatedAt: new Date(),
      })
      .where(eq(userDataSourcePreferences.userId, userId));
  } else {
    await db.insert(userDataSourcePreferences).values({
      userId,
      metricSources: newMetricSources,
    });
  }
  
  // Invalidate cache
  preferencesCache.delete(userId);
}

/**
 * Update user's default source
 */
export async function setDefaultSource(
  userId: string,
  source: DataSource
): Promise<void> {
  const existing = await getUserPreferences(userId);
  
  if (existing) {
    await db
      .update(userDataSourcePreferences)
      .set({ 
        defaultSource: source,
        updatedAt: new Date(),
      })
      .where(eq(userDataSourcePreferences.userId, userId));
  } else {
    await db.insert(userDataSourcePreferences).values({
      userId,
      defaultSource: source,
    });
  }
  
  // Invalidate cache
  preferencesCache.delete(userId);
}

/**
 * Merge data from multiple sources for a single day
 * Uses priority resolver to pick best value for each field
 */
export async function mergeMultiSourceDayData<T extends Record<string, any>>(
  userId: string,
  dataBySource: Map<DataSource, T>,
  fieldToMetricMap: Record<keyof T, string>
): Promise<T & { sources: Record<string, DataSource> }> {
  const merged: Record<string, any> = {};
  const sources: Record<string, DataSource> = {};
  
  // Build available sources per metric
  const metricsWithSources: Record<string, DataSource[]> = {};
  
  for (const [field, metric] of Object.entries(fieldToMetricMap)) {
    metricsWithSources[metric] = [];
    const entries = Array.from(dataBySource.entries());
    for (const [source, data] of entries) {
      if (data[field] !== null && data[field] !== undefined) {
        metricsWithSources[metric].push(source);
      }
    }
  }
  
  // Resolve preferred sources
  const resolvedSources = await resolveSourcesForMetrics(userId, metricsWithSources);
  
  // Pick values from preferred sources
  for (const [field, metric] of Object.entries(fieldToMetricMap)) {
    const preferredSource = resolvedSources[metric];
    if (preferredSource && dataBySource.has(preferredSource)) {
      const sourceData = dataBySource.get(preferredSource)!;
      merged[field] = sourceData[field];
      sources[field] = preferredSource;
    } else {
      // Fall back to first available source with data
      const entries = Array.from(dataBySource.entries());
      for (const [source, data] of entries) {
        if (data[field] !== null && data[field] !== undefined) {
          merged[field] = data[field];
          sources[field] = source;
          break;
        }
      }
    }
  }
  
  return { ...merged, sources } as T & { sources: Record<string, DataSource> };
}

/**
 * Clear preferences cache (for testing or admin)
 */
export function clearPreferencesCache(): void {
  preferencesCache.clear();
}
