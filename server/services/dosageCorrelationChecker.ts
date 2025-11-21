import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

/**
 * Dosage-Aware Correlation Checker
 * 
 * Analyzes correlations grouped by dosage amounts
 * Shows dose-response relationships (e.g., 0.2ml TRT → HRV +12%, 0.3ml → HRV +8%)
 */

export interface DosageCorrelationResult {
  hasDosageData: boolean;
  dosageInsights: string[];
  overallInsight: string | null;
}

interface DosageGroup {
  dosageAmount: number;
  dosageUnit: string;
  events: Date[];
  dosageLabel: string;
}

/**
 * Check for dose-response correlations
 * Groups events by dosage and compares health metric changes across doses
 */
export async function checkDosageCorrelations(
  userId: string,
  behaviorType: string
): Promise<DosageCorrelationResult> {
  try {
    logger.info(`[DosageCorrelation] Checking dosage correlations for ${behaviorType}`);

    // Query past events with dosage information
    const pastEvents = await db.execute(sql`
      SELECT 
        happened_at::date as event_date,
        details->'dosage'->>'amount' as dosage_amount,
        details->'dosage'->>'unit' as dosage_unit
      FROM life_events
      WHERE user_id = ${userId}
        AND event_type = 'behavior'
        AND event_data->>'behavior' = ${behaviorType}
        AND details->'dosage' IS NOT NULL
        AND happened_at >= NOW() - INTERVAL '90 days'
      ORDER BY happened_at DESC
      LIMIT 20
    `);

    if (!pastEvents.rows || pastEvents.rows.length === 0) {
      logger.info('[DosageCorrelation] No events with dosage data found');
      return {
        hasDosageData: false,
        dosageInsights: [],
        overallInsight: null,
      };
    }

    // Group events by dosage amount
    const dosageGroups = new Map<string, DosageGroup>();
    
    for (const row of pastEvents.rows) {
      const event: any = row;
      if (!event.dosage_amount || !event.dosage_unit) continue;
      
      const amount = parseFloat(event.dosage_amount);
      const unit = event.dosage_unit;
      const key = `${amount}${unit}`;
      
      if (!dosageGroups.has(key)) {
        dosageGroups.set(key, {
          dosageAmount: amount,
          dosageUnit: unit,
          events: [],
          dosageLabel: `${amount}${unit}`,
        });
      }
      
      dosageGroups.get(key)!.events.push(new Date(event.event_date));
    }

    logger.info(`[DosageCorrelation] Found ${dosageGroups.size} unique dosage groups`);

    // Need at least 2 different dosages to compare
    if (dosageGroups.size < 2) {
      logger.info('[DosageCorrelation] Insufficient dosage variety for dose-response analysis');
      return {
        hasDosageData: true,
        dosageInsights: [],
        overallInsight: null,
      };
    }

    // Calculate correlations for each dosage group
    const dosageInsights: string[] = [];
    
    for (const [dosageKey, group] of Array.from(dosageGroups.entries())) {
      // Need at least 2 events per dosage to be meaningful
      if (group.events.length < 2) continue;
      
      // Get day-after metrics for this dosage group
      const dayAfterDates = group.events.map((d: Date) => {
        const dayAfter = new Date(d);
        dayAfter.setDate(dayAfter.getDate() + 1);
        return dayAfter.toISOString().split('T')[0];
      });
      
      const metrics = await db.execute(sql`
        SELECT 
          date,
          hrv_ms,
          resting_hr_bpm,
          sleep_hours
        FROM user_daily_metrics
        WHERE user_id = ${userId}
          AND date = ANY(${dayAfterDates}::date[])
      `);
      
      if (!metrics.rows || metrics.rows.length === 0) continue;
      
      // Calculate average metrics for this dosage
      let hrvSum = 0, hrvCount = 0;
      let rhrSum = 0, rhrCount = 0;
      let sleepSum = 0, sleepCount = 0;
      
      for (const metricRow of metrics.rows) {
        const m: any = metricRow;
        if (m.hrv_ms !== null) {
          hrvSum += parseFloat(String(m.hrv_ms));
          hrvCount++;
        }
        if (m.resting_hr_bpm !== null) {
          rhrSum += parseFloat(String(m.resting_hr_bpm));
          rhrCount++;
        }
        if (m.sleep_hours !== null) {
          sleepSum += parseFloat(String(m.sleep_hours));
          sleepCount++;
        }
      }
      
      // Store averages for this dosage group
      dosageGroups.set(dosageKey, {
        ...group,
        avgHrv: hrvCount > 0 ? hrvSum / hrvCount : null,
        avgRhr: rhrCount > 0 ? rhrSum / rhrCount : null,
        avgSleep: sleepCount > 0 ? sleepSum / sleepCount : null,
      } as any);
    }

    // Compare dosages and generate insights
    const sortedDosages = Array.from(dosageGroups.values())
      .filter((g: any) => g.avgHrv !== null || g.avgRhr !== null || g.avgSleep !== null)
      .sort((a, b) => a.dosageAmount - b.dosageAmount);
    
    if (sortedDosages.length >= 2) {
      // Compare lowest vs highest dosage
      const lowDose: any = sortedDosages[0];
      const highDose: any = sortedDosages[sortedDosages.length - 1];
      
      if (lowDose.avgHrv && highDose.avgHrv) {
        const hrvDiffNum = ((highDose.avgHrv - lowDose.avgHrv) / lowDose.avgHrv * 100);
        const hrvDiff = hrvDiffNum.toFixed(0);
        dosageInsights.push(
          `${lowDose.dosageLabel}: HRV avg ${lowDose.avgHrv.toFixed(0)}ms vs ${highDose.dosageLabel}: ${highDose.avgHrv.toFixed(0)}ms (${hrvDiffNum > 0 ? '+' : ''}${hrvDiff}%)`
        );
      }
      
      if (lowDose.avgRhr && highDose.avgRhr) {
        const rhrDiffNum = ((highDose.avgRhr - lowDose.avgRhr) / lowDose.avgRhr * 100);
        const rhrDiff = rhrDiffNum.toFixed(0);
        dosageInsights.push(
          `${lowDose.dosageLabel}: RHR avg ${lowDose.avgRhr.toFixed(0)}bpm vs ${highDose.dosageLabel}: ${highDose.avgRhr.toFixed(0)}bpm (${rhrDiffNum > 0 ? '+' : ''}${rhrDiff}%)`
        );
      }
      
      if (lowDose.avgSleep && highDose.avgSleep) {
        const sleepDiffNum = ((highDose.avgSleep - lowDose.avgSleep) / lowDose.avgSleep * 100);
        const sleepDiff = sleepDiffNum.toFixed(0);
        dosageInsights.push(
          `${lowDose.dosageLabel}: Sleep avg ${lowDose.avgSleep.toFixed(1)}h vs ${highDose.dosageLabel}: ${highDose.avgSleep.toFixed(1)}h (${sleepDiffNum > 0 ? '+' : ''}${sleepDiff}%)`
        );
      }
    }

    if (dosageInsights.length > 0) {
      const overallInsight = `Dose-response pattern detected for ${behaviorType}: ${dosageInsights.join(', ')}. Based on ${pastEvents.rows.length} logged events.`;
      
      logger.info(`[DosageCorrelation] Found ${dosageInsights.length} dosage insights`);
      
      return {
        hasDosageData: true,
        dosageInsights,
        overallInsight,
      };
    }

    return {
      hasDosageData: true,
      dosageInsights: [],
      overallInsight: null,
    };
  } catch (error: any) {
    logger.error('[DosageCorrelation] Error checking dosage correlations:', error);
    return {
      hasDosageData: false,
      dosageInsights: [],
      overallInsight: null,
    };
  }
}
