import { db } from '../db';
import { 
  profiles, 
  bloodWork, 
  diagnosticStudies, 
  userDailyMetrics,
  flomentumDaily,
  sleepNights
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import logger from '../logger';

interface UserHealthContext {
  age: number | null;
  sex: string;
  primaryGoals: string[];
  latestBloodPanel: {
    date: string | null;
    apob: string;
    glucose: string;
    hba1c: string;
    hscrp: string;
    testosterone: string;
    [key: string]: string | null;
  };
  latestCAC: {
    score: number | null;
    percentile: string | null;
    date: string | null;
  };
  latestDEXA: {
    visceralFat: number | null;
    leanMass: number | null;
    bodyFat: number | null;
    date: string | null;
  };
  wearableAvg7Days: {
    hrv: number | null;
    sleep: string | null;
    rhr: number | null;
    steps: number | null;
    activeKcal: number | null;
  };
  flomentumCurrent: {
    score: number | null;
    zone: string | null;
    dailyFocus: string | null;
  };
}

function calculateAge(dateOfBirth: Date | string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function formatBiomarkerValue(value: number | null, unit: string = ''): string {
  if (value === null || value === undefined) return 'not recorded';
  return `${value}${unit ? ' ' + unit : ''}`;
}

export async function buildUserHealthContext(userId: string): Promise<string> {
  try {
    logger.info(`[FloOracle] Building health context for user ${userId}`);

    const context: UserHealthContext = {
      age: null,
      sex: 'unknown',
      primaryGoals: [],
      latestBloodPanel: {
        date: null,
        apob: 'not recorded',
        glucose: 'not recorded',
        hba1c: 'not recorded',
        hscrp: 'not recorded',
        testosterone: 'not recorded',
      },
      latestCAC: {
        score: null,
        percentile: null,
        date: null,
      },
      latestDEXA: {
        visceralFat: null,
        leanMass: null,
        bodyFat: null,
        date: null,
      },
      wearableAvg7Days: {
        hrv: null,
        sleep: null,
        rhr: null,
        steps: null,
        activeKcal: null,
      },
      flomentumCurrent: {
        score: null,
        zone: null,
        dailyFocus: null,
      },
    };

    const [userProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (userProfile) {
      context.age = calculateAge(userProfile.dateOfBirth);
      context.sex = userProfile.sex || 'unknown';
      context.primaryGoals = userProfile.primaryGoals || [];
    }

    const latestBlood = await db
      .select()
      .from(bloodWork)
      .where(eq(bloodWork.userId, userId))
      .orderBy(desc(bloodWork.testDate))
      .limit(1);

    if (latestBlood.length > 0) {
      const blood = latestBlood[0];
      context.latestBloodPanel.date = blood.testDate || null;
      
      const biomarkers = blood.biomarkers as Record<string, any> || {};
      context.latestBloodPanel.apob = formatBiomarkerValue(biomarkers['ApoB']?.value, 'mg/dL');
      context.latestBloodPanel.glucose = formatBiomarkerValue(biomarkers['Glucose']?.value || biomarkers['Fasting Glucose']?.value, 'mg/dL');
      context.latestBloodPanel.hba1c = formatBiomarkerValue(biomarkers['HbA1c']?.value, '%');
      context.latestBloodPanel.hscrp = formatBiomarkerValue(biomarkers['hs-CRP']?.value || biomarkers['CRP']?.value, 'mg/L');
      context.latestBloodPanel.testosterone = formatBiomarkerValue(biomarkers['Testosterone']?.value, 'ng/dL');
    }

    const latestCAC = await db
      .select()
      .from(diagnosticStudies)
      .where(
        and(
          eq(diagnosticStudies.userId, userId),
          eq(diagnosticStudies.studyType, 'CAC')
        )
      )
      .orderBy(desc(diagnosticStudies.studyDate))
      .limit(1);

    if (latestCAC.length > 0) {
      const cac = latestCAC[0];
      const findings = cac.findingsJson as Record<string, any> || {};
      context.latestCAC.score = findings.cacScore ?? null;
      context.latestCAC.percentile = findings.percentile ?? null;
      context.latestCAC.date = cac.studyDate || null;
    }

    const latestDEXA = await db
      .select()
      .from(diagnosticStudies)
      .where(
        and(
          eq(diagnosticStudies.userId, userId),
          eq(diagnosticStudies.studyType, 'DEXA')
        )
      )
      .orderBy(desc(diagnosticStudies.studyDate))
      .limit(1);

    if (latestDEXA.length > 0) {
      const dexa = latestDEXA[0];
      const findings = dexa.findingsJson as Record<string, any> || {};
      context.latestDEXA.visceralFat = findings.visceralFatMass ?? null;
      context.latestDEXA.leanMass = findings.totalLeanMass ?? null;
      context.latestDEXA.bodyFat = findings.totalBodyFat ?? null;
      context.latestDEXA.date = dexa.studyDate || null;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const wearableData = await db
      .select({
        avgHrv: sql<number>`AVG(${userDailyMetrics.hrvMs})`,
        avgRhr: sql<number>`AVG(${userDailyMetrics.restingHrBpm})`,
        avgSteps: sql<number>`AVG(${userDailyMetrics.stepsRawSum})`,
        avgActiveKcal: sql<number>`AVG(${userDailyMetrics.activeEnergyKcal})`,
      })
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          gte(userDailyMetrics.localDate, sevenDaysAgoStr)
        )
      );

    if (wearableData.length > 0 && wearableData[0]) {
      context.wearableAvg7Days.hrv = wearableData[0].avgHrv ? Math.round(wearableData[0].avgHrv) : null;
      context.wearableAvg7Days.rhr = wearableData[0].avgRhr ? Math.round(wearableData[0].avgRhr) : null;
      context.wearableAvg7Days.steps = wearableData[0].avgSteps ? Math.round(wearableData[0].avgSteps) : null;
      context.wearableAvg7Days.activeKcal = wearableData[0].avgActiveKcal ? Math.round(wearableData[0].avgActiveKcal) : null;
    }

    const sleepData = await db
      .select({
        avgSleep: sql<number>`AVG(${sleepNights.totalSleepMin})`,
      })
      .from(sleepNights)
      .where(
        and(
          eq(sleepNights.userId, userId),
          gte(sleepNights.sleepDate, sevenDaysAgoStr)
        )
      );

    if (sleepData.length > 0 && sleepData[0]?.avgSleep) {
      const hours = Math.floor(sleepData[0].avgSleep / 60);
      const mins = Math.round(sleepData[0].avgSleep % 60);
      context.wearableAvg7Days.sleep = `${hours}h${mins}m`;
    }

    const [latestFlomentum] = await db
      .select()
      .from(flomentumDaily)
      .where(eq(flomentumDaily.userId, userId))
      .orderBy(desc(flomentumDaily.date))
      .limit(1);

    if (latestFlomentum) {
      context.flomentumCurrent.score = latestFlomentum.score;
      context.flomentumCurrent.zone = latestFlomentum.zone;
      const factors = latestFlomentum.dailyFocus as Record<string, any> || {};
      context.flomentumCurrent.dailyFocus = factors.focus || null;
    }

    const contextString = buildContextString(context);
    logger.info(`[FloOracle] Context built successfully (${contextString.length} chars)`);
    
    return contextString;
  } catch (error) {
    logger.error('[FloOracle] Failed to build user context:', error);
    return buildFallbackContext();
  }
}

function buildContextString(context: UserHealthContext): string {
  const lines: string[] = ['USER CONTEXT (never shared with user):'];
  
  lines.push(`Age: ${context.age ?? 'unknown'} | Sex: ${context.sex} | Primary goal: ${context.primaryGoals.join(', ') || 'general health'}`);
  
  if (context.latestBloodPanel.date) {
    lines.push(`Latest blood panel: ${context.latestBloodPanel.date}`);
    lines.push(`  • ApoB: ${context.latestBloodPanel.apob}`);
    lines.push(`  • Fasting glucose: ${context.latestBloodPanel.glucose}`);
    lines.push(`  • HbA1c: ${context.latestBloodPanel.hba1c}`);
    lines.push(`  • hs-CRP: ${context.latestBloodPanel.hscrp}`);
    lines.push(`  • Testosterone: ${context.latestBloodPanel.testosterone}`);
  } else {
    lines.push('Latest blood panel: No blood work uploaded yet');
  }
  
  if (context.latestCAC.score !== null) {
    const percentileText = context.latestCAC.percentile ? ` (${context.latestCAC.percentile} percentile)` : '';
    lines.push(`Latest CAC (${context.latestCAC.date || 'date unknown'}): ${context.latestCAC.score}${percentileText}`);
  }
  
  if (context.latestDEXA.visceralFat !== null) {
    lines.push(`Latest DEXA (${context.latestDEXA.date || 'date unknown'}): Visceral fat ${context.latestDEXA.visceralFat}g | Lean mass ${context.latestDEXA.leanMass ?? 'unknown'}kg | Body fat ${context.latestDEXA.bodyFat ?? 'unknown'}%`);
  }
  
  const wearable = context.wearableAvg7Days;
  if (wearable.hrv || wearable.sleep || wearable.rhr) {
    const parts: string[] = [];
    if (wearable.hrv) parts.push(`HRV ${wearable.hrv} ms`);
    if (wearable.sleep) parts.push(`Sleep ${wearable.sleep}`);
    if (wearable.rhr) parts.push(`RHR ${wearable.rhr} bpm`);
    if (wearable.steps) parts.push(`Steps ${wearable.steps}`);
    if (wearable.activeKcal) parts.push(`Active kcal ${wearable.activeKcal}`);
    lines.push(`7-day wearable avg: ${parts.join(', ')}`);
  }
  
  if (context.flomentumCurrent.score !== null) {
    lines.push(`Flōmentum score: ${context.flomentumCurrent.score}/100 (${context.flomentumCurrent.zone || 'calculating'}) | Daily focus: ${context.flomentumCurrent.dailyFocus || 'building baseline'}`);
  }
  
  return lines.join('\n');
}

function buildFallbackContext(): string {
  return `USER CONTEXT (never shared with user):
No health data available yet. User has not uploaded blood work, diagnostic studies, or synced wearable data.
Encourage them to upload their first blood panel or sync their HealthKit data to get started.`;
}
