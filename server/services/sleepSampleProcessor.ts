import { logger } from "../logger";

// Sleep stage types (matching iOS HKCategoryValueSleepAnalysis)
type SleepStage = 'inBed' | 'asleep' | 'awake' | 'core' | 'deep' | 'rem' | 'unspecified';

interface RawSleepSample {
  start: string; // ISO 8601 UTC
  end: string; // ISO 8601 UTC
  stage: SleepStage;
  source: string;
}

interface SleepSegment {
  start: Date;
  end: Date;
  stage: SleepStage;
  source: string;
  durationMinutes: number;
}

interface SleepNightResult {
  sleepDate: string; // YYYY-MM-DD
  timezone: string;
  nightStart: Date;
  finalWake: Date;
  sleepOnset: Date | null;
  timeInBedMin: number;
  totalSleepMin: number;
  sleepEfficiencyPct: number | null;
  sleepLatencyMin: number | null;
  wasoMin: number | null;
  numAwakenings: number | null;
  coreSleepMin: number;
  deepSleepMin: number;
  remSleepMin: number;
  unspecifiedSleepMin: number;
  awakeInBedMin: number;
  midSleepTimeLocal: number | null;
  fragmentationIndex: number | null;
  deepPct: number | null;
  remPct: number | null;
  corePct: number | null;
  bedtimeLocal: string;
  waketimeLocal: string;
}

const MIN_AWAKE_DURATION_MIN = 2.0;
const MIN_SLEEP_DURATION_MIN = 180; // 3 hours

/**
 * Process raw sleep samples into comprehensive sleep night metrics
 * Replicates iOS SleepNightProcessor logic on the backend
 */
export async function processSleepSamples(
  samples: RawSleepSample[],
  sleepDate: string,
  timezone: string
): Promise<SleepNightResult | null> {
  try {
    if (!samples || samples.length === 0) {
      logger.info('[SleepProcessor] No samples provided');
      return null;
    }

    // Convert raw samples to segments
    const segments: SleepSegment[] = samples.map(sample => ({
      start: new Date(sample.start),
      end: new Date(sample.end),
      stage: sample.stage,
      source: sample.source,
      durationMinutes: (new Date(sample.end).getTime() - new Date(sample.start).getTime()) / 60000
    }));

    // Prioritize Apple sources
    const prioritizedSegments = prioritizeSources(segments);

    // Build sleep night metrics
    return buildSleepNight(prioritizedSegments, sleepDate, timezone);
  } catch (error) {
    logger.error('[SleepProcessor] Error processing sleep samples', { error });
    return null;
  }
}

/**
 * Prioritize Apple first-party sources over third-party apps
 * IMPORTANT: Include all valid segments to prevent data loss for third-party devices (e.g., Oura)
 */
function prioritizeSources(segments: SleepSegment[]): SleepSegment[] {
  // Always return all segments - HealthKit provides deduplicated samples
  // Users with third-party devices (Oura, Whoop) need their data preserved
  return segments;
}

/**
 * Build complete sleep night metrics from segments
 */
function buildSleepNight(
  segments: SleepSegment[],
  sleepDate: string,
  timezone: string
): SleepNightResult | null {
  // Separate inBed vs sleep stage segments
  const inBedSegments = segments.filter(s => s.stage === 'inBed');
  const stageSegments = segments.filter(s => s.stage !== 'inBed');

  if (inBedSegments.length === 0 && stageSegments.length === 0) {
    logger.info('[SleepProcessor] No valid segments');
    return null;
  }

  // Calculate timestamps
  const allStarts = [...inBedSegments, ...stageSegments].map(s => s.start);
  const allEnds = [...inBedSegments, ...stageSegments].map(s => s.end);
  const nightStart = new Date(Math.min(...allStarts.map(d => d.getTime())));
  const finalWake = new Date(Math.max(...allEnds.map(d => d.getTime())));

  // Find sleep onset (first asleep segment)
  const asleepStages: SleepStage[] = ['asleep', 'core', 'deep', 'rem', 'unspecified'];
  const asleepSegments = stageSegments.filter(s => asleepStages.includes(s.stage));
  const sleepOnset = asleepSegments.length > 0 ? asleepSegments[0].start : null;

  // Calculate durations
  const timeInBedMin = sumDuration(inBedSegments);
  const totalSleepMin = sumDuration(asleepSegments);
  const coreSleepMin = sumDuration(stageSegments.filter(s => s.stage === 'core'));
  const deepSleepMin = sumDuration(stageSegments.filter(s => s.stage === 'deep'));
  const remSleepMin = sumDuration(stageSegments.filter(s => s.stage === 'rem'));
  const unspecifiedSleepMin = sumDuration(stageSegments.filter(s => s.stage === 'unspecified' || s.stage === 'asleep'));

  // Awake segments
  const awakeSegments = stageSegments.filter(s => s.stage === 'awake');
  const awakeInBedMin = sumDuration(awakeSegments);

  // WASO (wake after sleep onset)
  let wasoMin: number | null = null;
  let numAwakenings: number | null = null;
  if (sleepOnset) {
    const wasoSegments = awakeSegments.filter(
      s => s.start >= sleepOnset && s.end <= finalWake
    );
    wasoMin = sumDuration(wasoSegments);
    numAwakenings = wasoSegments.filter(s => s.durationMinutes >= MIN_AWAKE_DURATION_MIN).length;
  }

  // Sleep efficiency
  const sleepEfficiencyPct = timeInBedMin > 0 ? Math.min(100.0, (totalSleepMin / timeInBedMin) * 100.0) : null;

  // Sleep latency
  let sleepLatencyMin: number | null = null;
  if (inBedSegments.length > 0 && sleepOnset) {
    const firstInBed = inBedSegments[0].start;
    sleepLatencyMin = (sleepOnset.getTime() - firstInBed.getTime()) / 60000;
  }

  // Mid-sleep time (minutes since midnight in local timezone)
  let midSleepTimeLocal: number | null = null;
  if (sleepOnset) {
    const midSleep = new Date(sleepOnset.getTime() + ((finalWake.getTime() - sleepOnset.getTime()) / 2));
    const localMidSleep = new Date(midSleep.toLocaleString('en-US', { timeZone: timezone }));
    midSleepTimeLocal = localMidSleep.getHours() * 60 + localMidSleep.getMinutes();
  }

  // Fragmentation index
  const fragmentationIndex = totalSleepMin > 0 ? (numAwakenings || 0) / Math.max(totalSleepMin / 60.0, 0.1) : null;

  // Stage percentages
  const deepPct = totalSleepMin > 0 ? (deepSleepMin / totalSleepMin) * 100.0 : null;
  const remPct = totalSleepMin > 0 ? (remSleepMin / totalSleepMin) * 100.0 : null;
  const corePct = totalSleepMin > 0 ? (coreSleepMin / totalSleepMin) * 100.0 : null;

  // Format bedtime/waketime in local timezone
  const bedtimeLocal = formatLocalTime(nightStart, timezone);
  const waketimeLocal = formatLocalTime(finalWake, timezone);

  // Minimum 3 hours required
  if (totalSleepMin < MIN_SLEEP_DURATION_MIN) {
    logger.info('[SleepProcessor] Insufficient sleep duration', { totalSleepMin });
    return null;
  }

  return {
    sleepDate,
    timezone,
    nightStart,
    finalWake,
    sleepOnset,
    timeInBedMin,
    totalSleepMin,
    sleepEfficiencyPct,
    sleepLatencyMin,
    wasoMin,
    numAwakenings,
    coreSleepMin,
    deepSleepMin,
    remSleepMin,
    unspecifiedSleepMin,
    awakeInBedMin,
    midSleepTimeLocal,
    fragmentationIndex,
    deepPct,
    remPct,
    corePct,
    bedtimeLocal,
    waketimeLocal
  };
}

/**
 * Sum durations of segments
 */
function sumDuration(segments: SleepSegment[]): number {
  return segments.reduce((sum, seg) => sum + seg.durationMinutes, 0);
}

/**
 * Format time in local timezone (e.g., "10:47 pm")
 */
function formatLocalTime(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase();
}
