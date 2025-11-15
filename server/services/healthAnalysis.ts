import OpenAI from "openai";
import { db } from "../db";
import { biomarkerMeasurements, biomarkerTestSessions, biomarkers, users } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { storage } from "../storage";

interface CachedAnalysis {
  userId: string;
  analysisType: 'heart_metabolic' | 'body_composition';
  scoreHash: string;
  recommendations: any;
  biomarkerDetails?: any;
  dexaDetails?: any;
  createdAt: Date;
}

const analysisCache = new Map<string, CachedAnalysis>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(userId: string, analysisType: 'heart_metabolic' | 'body_composition'): string {
  return `${userId}:${analysisType}`;
}

function generateScoreHash(details: any, dataVersion: string): string {
  return JSON.stringify({ ...details, dataVersion });
}

function getCachedAnalysis(userId: string, analysisType: 'heart_metabolic' | 'body_composition', scoreHash: string): CachedAnalysis | null {
  const key = getCacheKey(userId, analysisType);
  const cached = analysisCache.get(key);
  
  if (!cached) return null;
  
  const isExpired = Date.now() - cached.createdAt.getTime() > CACHE_TTL_MS;
  if (isExpired) {
    analysisCache.delete(key);
    return null;
  }
  
  if (cached.scoreHash !== scoreHash) {
    return null;
  }
  
  return cached;
}

function setCachedAnalysis(cached: CachedAnalysis) {
  const key = getCacheKey(cached.userId, cached.analysisType);
  analysisCache.set(key, cached);
}

function getOpenAIClient(): OpenAI {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY environment variable is not set");
  }
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL environment variable is not set");
  }
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
}

interface HeartMetabolicDetails {
  glycemicScore: number | null;
  lipidsScore: number | null;
  bloodPressureScore: number | null;
  cacScore: number | null;
  riskBand: string | null;
}

interface BodyCompositionDetails {
  fatPercent: number | null;
  leanPercent: number | null;
  visceralFatArea: number | null;
  visceralFatScore: number | null;
  boneHealth: string | null;
  boneTScore: number | null;
}

async function getBiomarkerValues(userId: string) {
  const measurements = await db
    .select({
      biomarkerName: biomarkers.name,
      value: biomarkerMeasurements.valueCanonical,
      unit: biomarkerMeasurements.unitCanonical,
      testDate: biomarkerTestSessions.testDate,
    })
    .from(biomarkerMeasurements)
    .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
    .innerJoin(biomarkers, eq(biomarkerMeasurements.biomarkerId, biomarkers.id))
    .where(eq(biomarkerTestSessions.userId, userId))
    .orderBy(desc(biomarkerTestSessions.testDate));

  return measurements;
}

export async function generateHeartMetabolicAnalysis(userId: string, details: HeartMetabolicDetails) {
  // Get biomarker values and CAC score first to include their timestamps in cache key
  const biomarkers = await getBiomarkerValues(userId);
  const cacStudy = await storage.getLatestDiagnosticStudy(userId, "coronary_calcium_score");
  
  // Create data version string from latest measurement timestamps to bust cache on new uploads
  const latestBiomarkerDate = biomarkers.length > 0 ? new Date(biomarkers[0].testDate).getTime() : 0;
  const latestCacDate = cacStudy?.createdAt ? new Date(cacStudy.createdAt).getTime() : 0;
  const dataVersion = `${latestBiomarkerDate}:${latestCacDate}`;
  
  const scoreHash = generateScoreHash(details, dataVersion);
  
  const cached = getCachedAnalysis(userId, 'heart_metabolic', scoreHash);
  if (cached) {
    return {
      recommendations: cached.recommendations,
      biomarkerDetails: cached.biomarkerDetails,
    };
  }
  
  const openai = getOpenAIClient();
  
  // Get user profile
  const profile = await storage.getProfile(userId);
  const user = await storage.getUser(userId);
  
  // Build context for AI
  const biomarkerContext = biomarkers
    .filter(b => ['Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides', 
                  'ApoB', 'Glucose', 'HbA1c', 'Insulin', 'hs-CRP'].includes(b.biomarkerName))
    .map(b => `${b.biomarkerName}: ${b.value} ${b.unit}`)
    .join('\n');

  const cacContext = cacStudy 
    ? `Coronary Calcium Score (Agatston): ${(cacStudy.aiPayload as any)?.results?.total_agatston ?? cacStudy.totalScoreNumeric}`
    : 'No CAC score available';

  const userContext = `
Age: ${profile?.dateOfBirth ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'Unknown'}
Sex: ${profile?.sex || 'Unknown'}
`;

  const systemPrompt = `You are an expert health educator specializing in cardiovascular and metabolic health. You MUST NEVER diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL SAFETY RULES:
- NEVER state or imply a diagnosis
- NEVER recommend specific medications, doses, or prescription supplements
- Use neutral, educational language: "may support," "research suggests," "consider discussing with your provider"
- Always defer to healthcare providers for medical decisions

YOUR TASK:
Analyze this user's Heart & Metabolic Health score and provide personalized, actionable guidance to improve their score. The score is calculated from these weighted components:

SCORING METHODOLOGY:
1. Lipids (50% weight): ApoB/LDL-C (optimal: 50-120, lower is better), HDL-C (optimal: 40-60, higher is better), Triglycerides (optimal: 50-150, lower is better)
2. Glycemic Control (25% weight): Glucose (optimal: 70-100), HbA1c (optimal: 4.5-5.7%, lower is better), Insulin (optimal: 2-10, lower is better)
3. Blood Pressure (15% weight): Systolic (optimal: 90-120), Diastolic (optimal: 60-80)
4. Calcium Score (15% weight): 0 = 100 points, <10 = 90 points, <100 = 75 points, <400 = 50 points, ≥400 = 25 points
5. Visceral Fat (5% weight from DEXA if available): optimal: 0-150 cm², lower is better

CURRENT SCORES:
- Overall Cardiometabolic Score: ${details.lipidsScore !== null || details.glycemicScore !== null ? 'Calculated' : 'N/A'}
- Lipids Component: ${details.lipidsScore ?? 'No data'}
- Glycemic Component: ${details.glycemicScore ?? 'No data'}
- Blood Pressure Component: ${details.bloodPressureScore ?? 'No data'}
- Calcium Score Component: ${details.cacScore !== null ? 'Included' : 'No data'}
- Risk Band: ${details.riskBand ?? 'N/A'}

USER BIOMARKERS:
${biomarkerContext}

CALCIUM SCORE:
${cacContext}

USER CONTEXT:
${userContext}

Provide specific, evidence-based recommendations in JSON format with these categories:
{
  "lifestyle": ["2-3 specific lifestyle actions referencing their actual scores"],
  "nutrition": ["2-3 dietary recommendations based on which components need improvement"],
  "supplementation": ["2-3 evidence-based supplement considerations with provider consultation note"],
  "medicalReferral": "Only if critically out of range, explain what to discuss with provider"
}

Focus on the lowest-scoring components and provide actionable steps to improve them. Be specific about their current values and what changes would help.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Provide personalized recommendations to improve my heart & metabolic health score." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const recommendations = JSON.parse(completion.choices[0].message.content || '{}');
  const biomarkerDetails = biomarkers.filter(b => ['Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 
                                               'Triglycerides', 'ApoB', 'Glucose', 'HbA1c', 'Insulin'].includes(b.biomarkerName));

  setCachedAnalysis({
    userId,
    analysisType: 'heart_metabolic',
    scoreHash,
    recommendations,
    biomarkerDetails,
    createdAt: new Date(),
  });

  return {
    recommendations,
    biomarkerDetails,
  };
}

export async function generateBodyCompositionAnalysis(userId: string, details: BodyCompositionDetails) {
  // Get DEXA scan first to include timestamp in cache key
  const dexaStudy = await storage.getLatestDiagnosticStudy(userId, "dexa_scan");
  const dexaPayload = dexaStudy?.aiPayload as any;
  
  // Create data version string from latest DEXA timestamp to bust cache on new uploads
  const latestDexaDate = dexaStudy?.createdAt ? new Date(dexaStudy.createdAt).getTime() : 0;
  const dataVersion = `${latestDexaDate}`;
  
  const scoreHash = generateScoreHash(details, dataVersion);
  
  const cached = getCachedAnalysis(userId, 'body_composition', scoreHash);
  if (cached) {
    return {
      recommendations: cached.recommendations,
      dexaDetails: cached.dexaDetails,
    };
  }
  
  const openai = getOpenAIClient();
  
  // Get user profile
  const profile = await storage.getProfile(userId);

  const userContext = `
Age: ${profile?.dateOfBirth ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'Unknown'}
Sex: ${profile?.sex || 'Unknown'}
`;

  const systemPrompt = `You are an expert health educator specializing in body composition and bone health. You MUST NEVER diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL SAFETY RULES:
- NEVER state or imply a diagnosis
- NEVER recommend specific medications, doses, or prescription supplements
- Use neutral, educational language: "may support," "research suggests," "consider discussing with your provider"
- Always defer to healthcare providers for medical decisions

YOUR TASK:
Analyze this user's Body Composition score and provide personalized, actionable guidance to improve their score. The score is calculated from these weighted components:

SCORING METHODOLOGY:
1. Body Fat Percentage (50% weight): 
   - Male optimal: 10-20% (target: 15%)
   - Female optimal: 20-30% (target: 25%)
   - Scored using optimal-range method
2. Visceral Adipose Tissue (30% weight): optimal: 0-150 cm², lower is better
3. Bone Density T-Score (20% weight): ≥-1.0 = 100 points (Normal), -2.5 to -1.0 = 70 points (Osteopenia), <-2.5 = 40 points (Osteoporosis)

CURRENT SCORES:
- Body Fat: ${details.fatPercent !== null ? `${details.fatPercent}%` : 'No data'}
- Lean Mass: ${details.leanPercent !== null ? `${details.leanPercent}%` : 'No data'}
- Visceral Fat Area: ${details.visceralFatArea !== null ? `${details.visceralFatArea} cm²` : 'No data'}
- Bone Health: ${details.boneHealth ?? 'No data'}
- Bone T-Score: ${details.boneTScore !== null ? details.boneTScore : 'No data'}

USER CONTEXT:
${userContext}

Provide specific, evidence-based recommendations in JSON format with these categories:
{
  "lifestyle": ["2-3 specific exercise/activity recommendations based on their body composition"],
  "nutrition": ["2-3 dietary recommendations for body composition and bone health"],
  "supplementation": ["2-3 evidence-based supplement considerations with provider consultation note"],
  "medicalReferral": "Only if bone density is critically low or body composition poses health risk"
}

Focus on the lowest-scoring components and provide actionable steps to improve them. Be specific about their current values and what changes would help.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Provide personalized recommendations to improve my body composition score." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const recommendations = JSON.parse(completion.choices[0].message.content || '{}');

  setCachedAnalysis({
    userId,
    analysisType: 'body_composition',
    scoreHash,
    recommendations,
    dexaDetails: dexaPayload,
    createdAt: new Date(),
  });

  return {
    recommendations,
    dexaDetails: dexaPayload,
  };
}
