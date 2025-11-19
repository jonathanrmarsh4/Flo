import { db } from '../db';
import { diagnosticsStudies, diagnosticMetrics, healthDailyMetrics } from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { logger } from '../logger';

export interface BodyCompositionSnapshot {
  // Current/most accurate values
  weightKg: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  bmi: number | null;
  waistCircumferenceCm: number | null;
  vatAreaCm2: number | null; // VAT area from DEXA (if available)
  
  // Metadata about data sources
  weightSource: 'dexa' | 'healthkit' | null;
  bodyFatSource: 'dexa' | 'healthkit' | null;
  leanMassSource: 'dexa' | 'healthkit' | null;
  vatSource: 'dexa' | null;
  
  // Timestamps
  dexaScanDate: string | null; // ISO date of most recent DEXA
  healthKitDataDate: string | null; // Most recent HealthKit date
}

export interface BodyCompositionTrend {
  date: string; // YYYY-MM-DD
  weightKg: number | null;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  bmi: number | null;
}

export interface BodyCompositionData {
  snapshot: BodyCompositionSnapshot;
  trend: BodyCompositionTrend[]; // Last 90 days of HealthKit data
  explanation: string; // Human-readable explanation for AI context
}

export class BodyCompositionService {
  /**
   * Get unified body composition data with DEXA priority and HealthKit trends
   */
  static async getBodyComposition(userId: string): Promise<BodyCompositionData> {
    try {
      logger.info('Fetching body composition data', { userId });

      // Fetch most recent DEXA scan with body composition metrics
      const dexaData = await this.getMostRecentDexaBodyComp(userId);
      
      // Fetch HealthKit body composition (recent + trend)
      const healthKitData = await this.getHealthKitBodyComp(userId);
      
      // Build snapshot with DEXA priority
      const snapshot = this.buildSnapshot(dexaData, healthKitData);
      
      // Generate explanation for AI
      const explanation = this.buildExplanation(snapshot, healthKitData.trend);
      
      return {
        snapshot,
        trend: healthKitData.trend,
        explanation,
      };
    } catch (error) {
      logger.error('Error fetching body composition', error, { userId });
      throw error;
    }
  }

  /**
   * Fetch most recent DEXA scan body composition data
   */
  private static async getMostRecentDexaBodyComp(userId: string) {
    const dexaScan = await db
      .select()
      .from(diagnosticsStudies)
      .where(
        and(
          eq(diagnosticsStudies.userId, userId),
          eq(diagnosticsStudies.type, 'dexa_scan')
        )
      )
      .orderBy(desc(diagnosticsStudies.studyDate))
      .limit(1);

    if (!dexaScan.length) {
      return null;
    }

    const study = dexaScan[0];

    // First, try to get metrics from diagnostic_metrics table
    const metrics = await db
      .select()
      .from(diagnosticMetrics)
      .where(eq(diagnosticMetrics.studyId, study.id));

    const bodyFatMetric = metrics.find(m => m.code === 'body_fat_pct');
    const leanMassMetric = metrics.find(m => m.code === 'lean_body_mass_kg');
    const vatMetric = metrics.find(m => m.code === 'vat_area_cm2');
    const weightMetric = metrics.find(m => m.code === 'weight_kg');

    // If no metrics found in diagnostic_metrics, try extracting from ai_payload
    let bodyFatPct = bodyFatMetric?.valueNumeric ?? null;
    let leanMassKg = leanMassMetric?.valueNumeric ?? null;
    let vatAreaCm2 = vatMetric?.valueNumeric ?? null;
    let weightKg = weightMetric?.valueNumeric ?? null;

    // Check ai_payload for body composition data if not found in metrics
    if (study.aiPayload && typeof study.aiPayload === 'object') {
      const payload = study.aiPayload as any;
      const bodyComp = payload.body_composition;
      
      if (bodyComp) {
        // Use ai_payload data as fallback
        bodyFatPct = bodyFatPct ?? bodyComp.fat_percent_total ?? null;
        leanMassKg = leanMassKg ?? bodyComp.lean_mass_kg ?? null;
        vatAreaCm2 = vatAreaCm2 ?? bodyComp.vat_area_cm2 ?? null;
        
        // Calculate weight from fat_mass_kg + lean_mass_kg if available
        if (!weightKg && bodyComp.fat_mass_kg !== null && bodyComp.lean_mass_kg !== null) {
          weightKg = bodyComp.fat_mass_kg + bodyComp.lean_mass_kg;
        }
      }
    }

    return {
      scanDate: study.studyDate.toISOString(),
      weightKg,
      bodyFatPct,
      leanMassKg,
      vatAreaCm2,
    };
  }

  /**
   * Fetch HealthKit body composition data (recent + 90-day trend)
   */
  private static async getHealthKitBodyComp(userId: string) {
    // Get last 90 days of HealthKit data
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

    const data = await db
      .select()
      .from(healthDailyMetrics)
      .where(
        and(
          eq(healthDailyMetrics.userId, userId),
          gte(healthDailyMetrics.date, ninetyDaysAgoStr)
        )
      )
      .orderBy(desc(healthDailyMetrics.date));

    const mostRecent = data[0] || null;

    const trend: BodyCompositionTrend[] = data.map(d => ({
      date: d.date,
      weightKg: d.weightKg,
      bodyFatPct: d.bodyFatPct,
      leanMassKg: d.leanMassKg,
      bmi: d.bmi,
    }));

    return {
      mostRecent: mostRecent ? {
        date: mostRecent.date,
        weightKg: mostRecent.weightKg,
        bodyFatPct: mostRecent.bodyFatPct,
        leanMassKg: mostRecent.leanMassKg,
        bmi: mostRecent.bmi,
        waistCircumferenceCm: mostRecent.waistCircumferenceCm,
      } : null,
      trend,
    };
  }

  /**
   * Build snapshot with DEXA priority
   */
  private static buildSnapshot(
    dexaData: Awaited<ReturnType<typeof this.getMostRecentDexaBodyComp>>,
    healthKitData: Awaited<ReturnType<typeof this.getHealthKitBodyComp>>
  ): BodyCompositionSnapshot {
    const hk = healthKitData.mostRecent;
    
    return {
      // DEXA takes priority for body composition metrics
      weightKg: dexaData?.weightKg ?? hk?.weightKg ?? null,
      bodyFatPct: dexaData?.bodyFatPct ?? hk?.bodyFatPct ?? null,
      leanMassKg: dexaData?.leanMassKg ?? hk?.leanMassKg ?? null,
      vatAreaCm2: dexaData?.vatAreaCm2 ?? null, // DEXA only
      
      // BMI and waist from HealthKit (DEXA doesn't typically measure these)
      bmi: hk?.bmi ?? null,
      waistCircumferenceCm: hk?.waistCircumferenceCm ?? null,
      
      // Source tracking (explicit null/undefined checks to handle zero values)
      weightSource: (dexaData?.weightKg !== null && dexaData?.weightKg !== undefined) ? 'dexa' : 
                    ((hk?.weightKg !== null && hk?.weightKg !== undefined) ? 'healthkit' : null),
      bodyFatSource: (dexaData?.bodyFatPct !== null && dexaData?.bodyFatPct !== undefined) ? 'dexa' : 
                     ((hk?.bodyFatPct !== null && hk?.bodyFatPct !== undefined) ? 'healthkit' : null),
      leanMassSource: (dexaData?.leanMassKg !== null && dexaData?.leanMassKg !== undefined) ? 'dexa' : 
                      ((hk?.leanMassKg !== null && hk?.leanMassKg !== undefined) ? 'healthkit' : null),
      vatSource: (dexaData?.vatAreaCm2 !== null && dexaData?.vatAreaCm2 !== undefined) ? 'dexa' : null,
      
      // Timestamps
      dexaScanDate: dexaData?.scanDate ?? null,
      healthKitDataDate: hk?.date ?? null,
    };
  }

  /**
   * Build explanation for AI context
   */
  private static buildExplanation(
    snapshot: BodyCompositionSnapshot,
    trend: BodyCompositionTrend[]
  ): string {
    const parts: string[] = [];

    // Explain current values and their sources
    if (snapshot.dexaScanDate) {
      parts.push(
        `Most recent DEXA scan: ${new Date(snapshot.dexaScanDate).toLocaleDateString()}. ` +
        `DEXA scans are the most accurate method for measuring body composition but represent a single point in time.`
      );
      
      if (snapshot.bodyFatSource === 'dexa') {
        parts.push(`Current body fat % (${snapshot.bodyFatPct?.toFixed(1)}%) is from DEXA (highly accurate).`);
      }
      if (snapshot.leanMassSource === 'dexa') {
        parts.push(`Current lean mass (${snapshot.leanMassKg?.toFixed(1)} kg) is from DEXA (highly accurate).`);
      }
      if (snapshot.vatAreaCm2 !== null && snapshot.vatAreaCm2 !== undefined) {
        parts.push(`Visceral adipose tissue area: ${snapshot.vatAreaCm2.toFixed(1)} cm² (DEXA).`);
      }
    }

    if (snapshot.healthKitDataDate) {
      parts.push(
        `Most recent HealthKit data: ${snapshot.healthKitDataDate}. ` +
        `HealthKit measurements are less accurate than DEXA but provide valuable longitudinal trends, especially for weight tracking.`
      );
      
      if (snapshot.weightSource === 'healthkit') {
        parts.push(`Current weight (${snapshot.weightKg?.toFixed(1)} kg) is from HealthKit.`);
      }
      if (snapshot.bodyFatSource === 'healthkit') {
        parts.push(`Current body fat % (${snapshot.bodyFatPct?.toFixed(1)}%) is from HealthKit (less accurate than DEXA).`);
      }
    }

    // Explain trend data availability
    const daysWithData = trend.filter(d => 
      d.weightKg !== null || d.bodyFatPct !== null || d.leanMassKg !== null
    ).length;
    
    if (daysWithData > 0) {
      parts.push(
        `HealthKit trend data available for ${daysWithData} days over the last 90 days, ` +
        `useful for identifying changes in weight and body composition over time.`
      );
    }

    return parts.join(' ');
  }
}
