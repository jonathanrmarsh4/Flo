/**
 * Biomarker Data Enrichment Utility
 * 
 * Computes status, severity score, delta %, and trend label for biomarkers
 * to provide context-rich data for AI insight generation.
 */

export interface BiomarkerMeasurementData {
  value: number;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  testDate: Date;
}

export interface BiomarkerTrendData {
  value: number;
  date: string;
}

export interface EnrichedBiomarkerData {
  status: 'low' | 'optimal' | 'high' | 'unknown';
  statusLabel: string;
  severityScore: number;
  deltaFromOptimal: number;
  deltaPercentage: number;
  trendLabel: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
  encouragementTone: 'praise' | 'maintain' | 'gentle_action' | 'urgent_action';
  valueContext: string;
}

/**
 * Determines biomarker status based on reference ranges
 */
function computeStatus(
  value: number,
  referenceLow: number | null,
  referenceHigh: number | null
): 'low' | 'optimal' | 'high' | 'unknown' {
  if (referenceLow === null || referenceHigh === null) {
    return 'unknown';
  }

  if (value < referenceLow) return 'low';
  if (value > referenceHigh) return 'high';
  return 'optimal';
}

/**
 * Computes severity score (0-100, where 100 is most severe)
 */
function computeSeverityScore(
  value: number,
  referenceLow: number | null,
  referenceHigh: number | null
): number {
  if (referenceLow === null || referenceHigh === null) {
    return 0;
  }

  const range = referenceHigh - referenceLow;
  if (range === 0) return 0;

  if (value < referenceLow) {
    const deviation = (referenceLow - value) / range;
    return Math.min(100, Math.round(deviation * 100));
  }

  if (value > referenceHigh) {
    const deviation = (value - referenceHigh) / range;
    return Math.min(100, Math.round(deviation * 100));
  }

  return 0;
}

/**
 * Computes delta from optimal midpoint
 */
function computeDeltaFromOptimal(
  value: number,
  referenceLow: number | null,
  referenceHigh: number | null
): { delta: number; percentage: number } {
  if (referenceLow === null || referenceHigh === null) {
    return { delta: 0, percentage: 0 };
  }

  const optimalMidpoint = (referenceLow + referenceHigh) / 2;
  const delta = value - optimalMidpoint;
  const range = referenceHigh - referenceLow;
  const percentage = range !== 0 ? (delta / range) * 100 : 0;

  return {
    delta: Math.round(delta * 100) / 100,
    percentage: Math.round(percentage * 10) / 10,
  };
}

/**
 * Analyzes trend from historical measurements
 */
function computeTrendLabel(
  currentValue: number,
  history: BiomarkerTrendData[],
  status: 'low' | 'optimal' | 'high' | 'unknown'
): 'improving' | 'stable' | 'worsening' | 'insufficient_data' {
  if (history.length < 2) {
    return 'insufficient_data';
  }

  const previousValue = history[history.length - 2].value;
  const change = currentValue - previousValue;
  const percentChange = Math.abs((change / previousValue) * 100);

  if (percentChange < 5) {
    return 'stable';
  }

  if (status === 'high') {
    return change < 0 ? 'improving' : 'worsening';
  } else if (status === 'low') {
    return change > 0 ? 'improving' : 'worsening';
  }

  return 'stable';
}

/**
 * Determines appropriate encouragement tone based on status and severity
 */
function computeEncouragementTone(
  status: 'low' | 'optimal' | 'high' | 'unknown',
  severityScore: number
): 'praise' | 'maintain' | 'gentle_action' | 'urgent_action' {
  if (status === 'optimal') {
    return 'praise';
  }

  if (status === 'unknown') {
    return 'maintain';
  }

  if (severityScore >= 50) {
    return 'urgent_action';
  } else if (severityScore >= 20) {
    return 'gentle_action';
  } else {
    return 'maintain';
  }
}

/**
 * Generates human-readable value context string
 */
function generateValueContext(
  value: number,
  unit: string,
  referenceLow: number | null,
  referenceHigh: number | null,
  status: 'low' | 'optimal' | 'high' | 'unknown',
  deltaPercentage: number
): string {
  if (referenceLow === null || referenceHigh === null) {
    return `Your current value is ${value} ${unit}.`;
  }

  const contexts = {
    optimal: `Your current value is ${value} ${unit}, which is in the optimal range (${referenceLow}-${referenceHigh} ${unit}). Great work!`,
    low: `Your current value is ${value} ${unit}, which is ${Math.abs(deltaPercentage).toFixed(1)}% below the optimal range (${referenceLow}-${referenceHigh} ${unit}).`,
    high: `Your current value is ${value} ${unit}, which is ${Math.abs(deltaPercentage).toFixed(1)}% above the optimal range (${referenceLow}-${referenceHigh} ${unit}).`,
    unknown: `Your current value is ${value} ${unit}.`,
  };

  return contexts[status];
}

/**
 * Main enrichment function
 */
export function enrichBiomarkerData(
  measurement: BiomarkerMeasurementData,
  history: BiomarkerTrendData[] = []
): EnrichedBiomarkerData {
  const status = computeStatus(
    measurement.value,
    measurement.referenceLow,
    measurement.referenceHigh
  );

  const statusLabels = {
    low: 'Below Reference Range',
    optimal: 'In Optimal Range',
    high: 'Above Reference Range',
    unknown: 'Unknown',
  };

  const severityScore = computeSeverityScore(
    measurement.value,
    measurement.referenceLow,
    measurement.referenceHigh
  );

  const { delta, percentage } = computeDeltaFromOptimal(
    measurement.value,
    measurement.referenceLow,
    measurement.referenceHigh
  );

  const trendLabel = computeTrendLabel(measurement.value, history, status);

  const encouragementTone = computeEncouragementTone(status, severityScore);

  const valueContext = generateValueContext(
    measurement.value,
    measurement.unit,
    measurement.referenceLow,
    measurement.referenceHigh,
    status,
    percentage
  );

  return {
    status,
    statusLabel: statusLabels[status],
    severityScore,
    deltaFromOptimal: delta,
    deltaPercentage: percentage,
    trendLabel,
    encouragementTone,
    valueContext,
  };
}
