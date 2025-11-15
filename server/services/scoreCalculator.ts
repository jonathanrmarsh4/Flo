import { db } from "../db";
import { biomarkerMeasurements, biomarkerTestSessions, biomarkers, diagnosticsStudies } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface DashboardScores {
  floScore: number | null;
  cardiometabolic: number | null;
  bodyComposition: number | null;
  readiness: number | null;
  inflammation: number | null;
  lastUpdated: Date | null;
}

export interface BiomarkerValues {
  [biomarkerName: string]: {
    value: number;
    testDate: Date;
  };
}

async function getLatestBiomarkerValues(userId: string): Promise<BiomarkerValues> {
  const measurements = await db
    .select({
      biomarkerName: biomarkers.name,
      valueCanonical: biomarkerMeasurements.valueCanonical,
      testDate: biomarkerTestSessions.testDate,
    })
    .from(biomarkerMeasurements)
    .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
    .innerJoin(biomarkers, eq(biomarkerMeasurements.biomarkerId, biomarkers.id))
    .where(eq(biomarkerTestSessions.userId, userId))
    .orderBy(desc(biomarkerTestSessions.testDate));

  const latestByBiomarker: BiomarkerValues = {};
  
  for (const measurement of measurements) {
    const name = measurement.biomarkerName;
    if (!latestByBiomarker[name] && measurement.valueCanonical !== null) {
      latestByBiomarker[name] = {
        value: measurement.valueCanonical,
        testDate: measurement.testDate,
      };
    }
  }
  
  return latestByBiomarker;
}

async function getLatestDiagnosticData(userId: string) {
  const [cacResult] = await db
    .select()
    .from(diagnosticsStudies)
    .where(
      and(
        eq(diagnosticsStudies.userId, userId),
        eq(diagnosticsStudies.type, "coronary_calcium_score")
      )
    )
    .orderBy(desc(diagnosticsStudies.studyDate))
    .limit(1);

  const [dexaResult] = await db
    .select()
    .from(diagnosticsStudies)
    .where(
      and(
        eq(diagnosticsStudies.userId, userId),
        eq(diagnosticsStudies.type, "dexa_scan")
      )
    )
    .orderBy(desc(diagnosticsStudies.studyDate))
    .limit(1);

  return { cac: cacResult, dexa: dexaResult };
}

function mapValueToScore(value: number, optimalRange: [number, number], direction: 'higher-better' | 'lower-better' | 'optimal-range'): number {
  if (direction === 'higher-better') {
    const [min, max] = optimalRange;
    if (value >= max) return 100;
    if (value <= min) return 0;
    return Math.round(((value - min) / (max - min)) * 100);
  } else if (direction === 'lower-better') {
    const [min, max] = optimalRange;
    if (value <= min) return 100;
    if (value >= max) return 0;
    return Math.round((1 - (value - min) / (max - min)) * 100);
  } else {
    const [min, max] = optimalRange;
    const mid = (min + max) / 2;
    const range = max - min;
    const distance = Math.abs(value - mid);
    const score = Math.max(0, 100 - (distance / (range / 2)) * 100);
    return Math.round(score);
  }
}

function calculateCardiometabolicScore(biomarkers: BiomarkerValues, cac: any | null, visceral_fat_area_cm2: number | null, bloodPressure: { systolic: number; diastolic: number } | null): number | null {
  const components: number[] = [];
  const weights: number[] = [];

  const apoBValue = biomarkers['APOB']?.value ?? biomarkers['LDL_C']?.value;
  if (apoBValue !== undefined) {
    const apoBScore = mapValueToScore(apoBValue, [50, 120], 'lower-better');
    components.push(apoBScore);
    weights.push(0.5);
  }

  if (biomarkers['HDL_C']?.value !== undefined) {
    const hdlScore = mapValueToScore(biomarkers['HDL_C'].value, [40, 60], 'higher-better');
    components.push(hdlScore);
    weights.push(0.2);
  }

  if (biomarkers['TRIGLYCERIDES']?.value !== undefined) {
    const trigScore = mapValueToScore(biomarkers['TRIGLYCERIDES'].value, [50, 150], 'lower-better');
    components.push(trigScore);
    weights.push(0.2);
  }

  const glucoseValue = biomarkers['GLUCOSE']?.value;
  const hba1cValue = biomarkers['HBA1C']?.value;
  const insulinValue = biomarkers['INSULIN']?.value;

  if (glucoseValue !== undefined || hba1cValue !== undefined || insulinValue !== undefined) {
    const glycemicComponents: number[] = [];
    const glycemicWeights: number[] = [];

    if (glucoseValue !== undefined) {
      glycemicComponents.push(mapValueToScore(glucoseValue, [70, 100], 'optimal-range'));
      glycemicWeights.push(0.4);
    }
    if (hba1cValue !== undefined) {
      glycemicComponents.push(mapValueToScore(hba1cValue, [4.5, 5.7], 'lower-better'));
      glycemicWeights.push(0.4);
    }
    if (insulinValue !== undefined) {
      glycemicComponents.push(mapValueToScore(insulinValue, [2, 10], 'lower-better'));
      glycemicWeights.push(0.2);
    }

    const glycemicScore = glycemicComponents.reduce((sum, score, i) => sum + score * glycemicWeights[i], 0) /
      glycemicWeights.reduce((sum, w) => sum + w, 0);
    components.push(glycemicScore);
    weights.push(0.25);
  }

  if (bloodPressure) {
    const systolicScore = mapValueToScore(bloodPressure.systolic, [90, 120], 'optimal-range');
    const diastolicScore = mapValueToScore(bloodPressure.diastolic, [60, 80], 'optimal-range');
    const bpScore = (systolicScore + diastolicScore) / 2;
    components.push(bpScore);
    weights.push(0.15);
  }

  if (cac && cac.totalScoreNumeric !== null) {
    const cacScore = cac.totalScoreNumeric === 0 ? 100 :
      cac.totalScoreNumeric < 10 ? 90 :
      cac.totalScoreNumeric < 100 ? 75 :
      cac.totalScoreNumeric < 400 ? 50 : 25;
    components.push(cacScore);
    weights.push(0.15);
  }

  if (visceral_fat_area_cm2 !== null) {
    const visceralScore = mapValueToScore(visceral_fat_area_cm2, [0, 150], 'lower-better');
    components.push(visceralScore);
    weights.push(0.05);
  }

  if (components.length === 0) return null;

  const weightedSum = components.reduce((sum, score, i) => sum + score * weights[i], 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  return Math.round(weightedSum / totalWeight);
}

function calculateBodyCompositionScore(dexaData: any | null): number | null {
  if (!dexaData || !dexaData.aiPayload) return null;

  const payload = dexaData.aiPayload;
  const components: number[] = [];
  const weights: number[] = [];

  if (payload.body_fat_percent !== undefined && payload.body_fat_percent !== null) {
    const targetBodyFat = payload.sex === 'Male' ? 15 : 25;
    const bodyFatScore = mapValueToScore(payload.body_fat_percent, [targetBodyFat - 5, targetBodyFat + 5], 'optimal-range');
    components.push(bodyFatScore);
    weights.push(0.5);
  }

  if (payload.visceral_adipose_tissue_area_cm2 !== undefined && payload.visceral_adipose_tissue_area_cm2 !== null) {
    const visceralScore = mapValueToScore(payload.visceral_adipose_tissue_area_cm2, [0, 150], 'lower-better');
    components.push(visceralScore);
    weights.push(0.3);
  }

  const worstTScore = payload.worst_t_score ?? payload.spine_t_score ?? payload.hip_t_score;
  if (worstTScore !== undefined && worstTScore !== null) {
    const boneScore = worstTScore >= -1 ? 100 :
      worstTScore >= -2.5 ? 70 : 40;
    components.push(boneScore);
    weights.push(0.2);
  }

  if (components.length === 0) return null;

  const weightedSum = components.reduce((sum, score, i) => sum + score * weights[i], 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  return Math.round(weightedSum / totalWeight);
}

function calculateInflammationScore(biomarkers: BiomarkerValues): number | null {
  const components: number[] = [];
  const weights: number[] = [];

  if (biomarkers['HS_CRP']?.value !== undefined) {
    const crpScore = mapValueToScore(biomarkers['HS_CRP'].value, [0, 3], 'lower-better');
    components.push(crpScore);
    weights.push(1.0);
  }

  if (components.length === 0) return null;

  const weightedSum = components.reduce((sum, score, i) => sum + score * weights[i], 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  return Math.round(weightedSum / totalWeight);
}

export async function calculateDashboardScores(userId: string): Promise<DashboardScores> {
  const biomarkers = await getLatestBiomarkerValues(userId);
  const { cac, dexa } = await getLatestDiagnosticData(userId);

  const visceral_fat_area = (dexa?.aiPayload as any)?.visceral_adipose_tissue_area_cm2 ?? null;

  const cardiometabolic = calculateCardiometabolicScore(biomarkers, cac, visceral_fat_area, null);
  const bodyComposition = calculateBodyCompositionScore(dexa);
  const inflammation = calculateInflammationScore(biomarkers);
  const readiness = null;

  const availableScores = [cardiometabolic, bodyComposition, readiness, inflammation].filter(s => s !== null) as number[];
  const availableWeights: number[] = [];
  
  if (cardiometabolic !== null) availableWeights.push(0.4);
  if (bodyComposition !== null) availableWeights.push(0.25);
  if (readiness !== null) availableWeights.push(0.2);
  if (inflammation !== null) availableWeights.push(0.15);

  const floScore = availableScores.length > 0
    ? Math.round(
        availableScores.reduce((sum, score, i) => sum + score * availableWeights[i], 0) /
        availableWeights.reduce((sum, w) => sum + w, 0)
      )
    : null;

  const lastUpdated = dexa?.studyDate ?? cac?.studyDate ?? 
    (Object.values(biomarkers)[0]?.testDate) ?? null;

  return {
    floScore,
    cardiometabolic,
    bodyComposition,
    readiness,
    inflammation,
    lastUpdated,
  };
}
