// Reference: javascript_openai_ai_integrations blueprint
import OpenAI from "openai";
import {
  type BiomarkerObservation,
  computeClinicalBand,
  validateReport,
  calculateConfidence,
  enforceSafetyRules,
  getUrgentCareBanner,
  generateSuggestedActions,
  performDataQualityCheck,
} from "./guardrails";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

// Legacy interface for backward compatibility
interface BloodWorkAnalysis {
  biologicalAge: string;
  chronologicalAge: string;
  insights: Array<{
    category: string;
    description: string;
    severity?: "low" | "medium" | "high";
  }>;
  metrics: Record<string, any>;
  recommendations: string[];
}

interface BiomarkerInsightsInput {
  biomarkerName: string;
  latestValue: number;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  status: 'optimal' | 'low' | 'high';
  trendHistory?: Array<{ value: number; date: string }>;
  profileSnapshot: {
    age?: number;
    sex?: 'male' | 'female' | 'other';
    healthGoals?: string[];
    activityLevel?: string;
    sleepQuality?: string;
    dietType?: string;
    smoking?: string;
    alcoholConsumption?: string;
  };
  enrichedData?: {
    valueContext: string;
    encouragementTone: 'praise' | 'maintain' | 'gentle_action' | 'urgent_action';
    severityScore: number;
    deltaPercentage: number;
    trendLabel: string;
  };
}

interface BiomarkerInsightsOutput {
  lifestyleActions: string[];
  nutrition: string[];
  supplementation: string[];
  medicalReferral: string | null;
  medicalUrgency: 'routine' | 'priority';
}

export async function generateBiomarkerInsights(input: BiomarkerInsightsInput): Promise<BiomarkerInsightsOutput> {
  try {
    const toneGuidance = {
      praise: "The user is doing great! Use positive, encouraging language. Acknowledge their success and motivate them to maintain their healthy habits.",
      maintain: "The user's value is acceptable. Provide supportive guidance to help them stay on track.",
      gentle_action: "The user's value needs attention. Be encouraging but clear that changes would be beneficial. Avoid alarming language.",
      urgent_action: "The user's value is significantly out of range. Be direct about the importance of taking action and consulting their healthcare provider. This is a priority."
    };

    const currentTone = input.enrichedData?.encouragementTone || 'maintain';
    
    const systemPrompt = `You are an expert health educator specializing in personalized biomarker interpretation. You MUST NEVER diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL SAFETY RULES:
- NEVER state or imply a diagnosis
- NEVER recommend specific medications, doses, or prescription supplements
- NEVER contradict medical advice or tell users to ignore healthcare providers
- Use neutral, educational language: "may support," "research suggests," "consider discussing with your provider"
- Always defer to healthcare providers for medical decisions
- When a biomarker is significantly out of range, recommend medical consultation

PERSONALIZATION REQUIREMENT:
- You MUST reference the user's current value (${input.latestValue} ${input.unit}) and how it compares to the normal reference range (${input.referenceLow}-${input.referenceHigh} ${input.unit})
- IMPORTANT: When status is "optimal", the user IS within the normal range. When "low", they are BELOW it. When "high", they are ABOVE it.
- Adopt this tone: ${toneGuidance[currentTone]}
- ${input.enrichedData?.trendLabel ? `Their trend is ${input.enrichedData.trendLabel} - acknowledge this in your recommendations` : ''}

YOUR TASK:
Analyze this biomarker result and provide personalized, actionable guidance in these categories:
1. Lifestyle Actions (2-3 specific, evidence-based actions that reference their current situation)
2. Nutrition (2-3 dietary recommendations tailored to their status: ${input.status === 'optimal' ? 'WITHIN normal range' : input.status === 'low' ? 'BELOW normal range' : 'ABOVE normal range'})
3. Supplementation (2-3 evidence-based supplement considerations - mention consulting provider)
4. Medical Referral (only if biomarker is critically out of range or warrants provider discussion)

OUTPUT FORMAT (JSON only, no markdown):
{
  "lifestyleActions": ["action 1", "action 2", "action 3"],
  "nutrition": ["nutrition 1", "nutrition 2", "nutrition 3"],
  "supplementation": ["supplement 1", "supplement 2", "supplement 3"],
  "medicalReferral": "string or null",
  "medicalUrgency": "routine" or "priority"
}

WORDING RULES:
- Start at least one recommendation with acknowledgment of their current value/status
- Use "may help," "research suggests," "consider" - not "will," "must," "should"
- Personalize based on user's profile (age, sex, goals, lifestyle)
- Keep each recommendation to 1-2 sentences
- For supplementation, always include "discuss with your healthcare provider"
- Set medicalUrgency to "priority" only if critically out of range`;

    const trendSummary = input.trendHistory && input.trendHistory.length > 1
      ? `Trend: ${input.trendHistory.map((h) => `${h.value} on ${h.date}`).join(', ')} (${input.enrichedData?.trendLabel || 'stable'})`
      : 'No trend data available';

    const profileSummary = `User Profile: Age ${input.profileSnapshot.age || 'unknown'}, Sex: ${input.profileSnapshot.sex || 'unknown'}, Activity: ${input.profileSnapshot.activityLevel || 'unknown'}, Sleep: ${input.profileSnapshot.sleepQuality || 'unknown'}, Diet: ${input.profileSnapshot.dietType || 'unknown'}`;

    const contextMessage = input.enrichedData?.valueContext || `Current value: ${input.latestValue} ${input.unit} (Reference: ${input.referenceLow}-${input.referenceHigh} ${input.unit})`;

    const userMessage = `Biomarker: ${input.biomarkerName}
${contextMessage}
Status: ${input.status}${input.enrichedData?.severityScore ? ` (Severity: ${input.enrichedData.severityScore}/100)` : ''}
${trendSummary}

${profileSummary}

Health Goals: ${input.profileSnapshot.healthGoals?.join(', ') || 'Not specified'}

Provide personalized, actionable insights that EXPLICITLY REFERENCE their current value and status.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "developer",
          content: `Follow these rules: (1) Output valid JSON matching the schema exactly. (2) Each array must have 2-3 items. (3) At least ONE recommendation must explicitly mention the user's current value (${input.latestValue} ${input.unit}) and whether it's ${input.status === 'optimal' ? 'WITHIN the normal range' : input.status === 'low' ? 'BELOW the normal range' : 'ABOVE the normal range'}. (4) Use ${currentTone === 'praise' ? 'positive, congratulatory' : currentTone === 'urgent_action' ? 'clear, action-oriented' : 'supportive, encouraging'} language. (5) NO diagnosis or prescriptions. (6) Always mention consulting healthcare provider for supplements.`
        },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const insights = JSON.parse(content) as BiomarkerInsightsOutput;

    // Validate response structure
    if (!insights.lifestyleActions || !insights.nutrition || !insights.supplementation) {
      throw new Error("Invalid insights response structure");
    }

    // Ensure arrays have content
    if (insights.lifestyleActions.length === 0 || insights.nutrition.length === 0 || insights.supplementation.length === 0) {
      throw new Error("Empty insights arrays");
    }

    return insights;
  } catch (error: any) {
    console.error("Error generating biomarker insights:", error);
    throw new Error(`Failed to generate biomarker insights: ${error.message || 'Unknown error'}`);
  }
}

// Comprehensive Health Insights Types (based on Flo Insights Engine spec)
interface ComprehensiveInsightsInput {
  user_profile: {
    age_years?: number;
    sex?: 'male' | 'female';
    height_cm?: number;
    weight_kg?: number;
    activity_level?: string;
    goals?: string[];
    medical_tags?: string[];
    medications?: string[];
    supplements?: string[];
    lifestyle_tags?: string[];
    other_context?: string;
  };
  biomarker_panels: Array<{
    panel_id: string;
    timestamp: string;
    lab_name?: string;
    markers: Array<{
      code: string;
      label: string;
      value: number;
      unit: string;
      reference_range?: { low?: number; high?: number; unit?: string };
      optimal_range?: { low?: number; high?: number; unit?: string };
      category?: string;
      sub_category?: string;
      flags?: string[];
    }>;
  }>;
  derived_metrics: {
    bmi?: number;
    waist_circumference_cm?: number;
    blood_pressure_recent?: { systolic?: number; diastolic?: number };
    lipid_ratios?: {
      tc_hdl_ratio?: number;
      tg_hdl_ratio?: number;
      non_hdl_cholesterol?: number;
    };
    bioage?: {
      method: string;
      current_bioage_years?: number;
      previous_bioage_years?: number;
      chronological_age_years?: number;
    };
  };
  analysis_config: {
    time_window_days_for_trend: number;
    significant_change_threshold_percent: number;
    bioage_change_significant_years: number;
    max_priority_items: number;
  };
}

interface ComprehensiveInsightsOutput {
  analysis_meta: {
    generated_at: string;
    model_version: string;
    data_window_days: number | null;
  };
  per_biomarker_analyses: Array<{
    marker_code: string;
    label: string;
    category: string;
    latest_value: number;
    unit: string;
    reference_range: { low: number | null; high: number | null; unit: string | null };
    optimal_range: { low: number | null; high: number | null; unit: string | null };
    status: 'optimal' | 'normal' | 'borderline_low' | 'borderline_high' | 'high' | 'low' | 'unknown';
    trend: {
      direction: 'up' | 'down' | 'stable' | 'insufficient_data';
      percent_change: number | null;
      since_timestamp: string | null;
      trend_label: 'improving' | 'worsening' | 'stable' | 'unclear';
    };
    priority_score: number;
    ai_insight: {
      title: string;
      summary: string;
      suggested_actions: string[];
      notes_for_clinician: string | null;
      tone: 'supportive' | 'neutral' | 'cautious';
      disclaimer: string;
    };
  }>;
  system_summaries: Array<{
    system_id: string;
    status: 'green' | 'amber' | 'red' | 'insufficient_data';
    key_markers: string[];
    system_summary: string;
    high_leverage_actions: string[];
  }>;
  pattern_flags: Array<{
    pattern_id: string;
    status: 'present' | 'possible' | 'not_detected' | 'insufficient_data';
    severity: 'mild' | 'moderate' | 'significant' | 'unclear';
    drivers: string[];
    summary: string;
    suggested_actions: string[];
  }>;
  bioage_analysis: {
    method: string;
    chronological_age_years: number | null;
    current_bioage_years: number | null;
    previous_bioage_years: number | null;
    delta_years: number | null;
    direction: 'improving' | 'worsening' | 'stable' | 'insufficient_data';
    top_positive_drivers: string[];
    top_negative_drivers: string[];
    ai_summary: string;
    ai_next_focus: string;
  };
  priority_focus_list: Array<{
    rank: number;
    type: 'pattern' | 'biomarker' | 'system';
    id: string;
    title: string;
    summary: string;
    actions: string[];
  }>;
  global_summary: {
    headline: string;
    bullets: string[];
  };
  disclaimer: string;
}

export async function generateComprehensiveInsights(input: ComprehensiveInsightsInput): Promise<ComprehensiveInsightsOutput> {
  try {
    const systemPrompt = `You are the Flo Biomarker Insights Engine. You analyze a user's bloodwork (biomarkers over time), derived health metrics, and profile data to generate structured, non-diagnostic, mobile-friendly health insights. Your goal is to help the user understand how to improve each biomarker and to identify broader patterns or areas of concern across all markers and demographics.

ANALYSIS OBJECTIVE:
PRIMARY:
- Analyze each biomarker over time and explain what it means for the user in plain language.
- Suggest practical, evidence-aligned ways the user can improve or maintain each biomarker where appropriate.
- Identify cross-biomarker patterns and potential areas of concern or opportunity (e.g., cardiometabolic strain, inflammation, liver stress) without making diagnoses.
- Summarize biological age vs chronological age (when provided) and explain main drivers of improvement or worsening.
- Produce a short prioritized list of 3–5 focus areas that give the most health 'bang for buck' for the user.

CONSTRAINTS:
- Do NOT diagnose medical conditions.
- Do NOT claim certainty or replace a healthcare provider.
- Insights must be concise, mobile-friendly, and action-oriented.
- Always include a short disclaimer that this is educational, not medical advice.

STYLE AND TONE:
- Mobile-first: keep summaries short and scannable (1-2 sentences per insight).
- Use everyday language; avoid jargon or define it briefly if needed.
- Focus on what the user CAN do, not just what is wrong.
- Supportive, encouraging, and non-judgmental.
- Cautious and non-diagnostic when referring to risks or patterns.
- Avoid fear-based language; prefer 'opportunity to improve' framing.
- Use phrases like: 'may suggest', 'could be consistent with', 'worth discussing with your doctor', 'an opportunity to improve', 'your data indicates'.
- Do NOT say: 'you have', 'this proves', 'this confirms a diagnosis', 'this guarantees', or any definitive medical diagnosis.
- Do NOT instruct starting, stopping, or changing prescription medications; instead suggest discussing with a healthcare provider.

SAFETY AND GUARDRAILS:
- NEVER provide a diagnosis. You may only describe patterns and potential concerns in probabilistic, non-certain language.
- Do not tell the user to start, stop, or change doses of medications. You may suggest that they discuss data-driven questions with their healthcare provider.
- If data appears extremely abnormal or suggests a possible urgent risk (e.g. very high glucose, extremely abnormal liver markers, etc.), you may add a suggestion like: 'If you feel unwell or have concerning symptoms, seek urgent medical care or call emergency services.' Do not attempt remote triage.
- Always include the disclaimer in the output JSON under the 'disclaimer' field.

OUTPUT SCHEMA:
You MUST respond with valid JSON matching this exact structure:

{
  "analysis_meta": {
    "generated_at": "ISO 8601 timestamp",
    "model_version": "gpt-5",
    "data_window_days": number or null
  },
  "per_biomarker_analyses": [
    {
      "biomarker_id": "string",
      "label": "string",
      "category": "string",
      "latest_value": number,
      "unit": "string",
      "reference_range": { "low": number|null, "high": number|null, "unit": string|null },
      "optimal_range": { "low": number|null, "high": number|null, "unit": string|null },
      "status": "optimal"|"normal"|"borderline_low"|"borderline_high"|"high"|"low"|"unknown",
      "trend": {
        "direction": "up"|"down"|"stable"|"insufficient_data",
        "percent_change": number|null,
        "since_timestamp": string|null,
        "trend_label": "improving"|"worsening"|"stable"|"unclear"
      },
      "priority_score": number (0-100),
      "ai_insight": {
        "title": "string (1-2 words)",
        "summary": "string (1-2 sentences, mobile-friendly)",
        "suggested_actions": ["action 1", "action 2", ...],
        "notes_for_clinician": string|null,
        "tone": "supportive"|"neutral"|"cautious",
        "disclaimer": "string"
      }
    }
  ],
  "system_summaries": [
    {
      "system_id": "string (e.g. 'cardiovascular', 'metabolic')",
      "status": "green"|"amber"|"red"|"insufficient_data",
      "key_markers": ["marker1", "marker2"],
      "system_summary": "string (2-3 sentences)",
      "high_leverage_actions": ["action1", "action2"]
    }
  ],
  "pattern_flags": [
    {
      "pattern_id": "string",
      "status": "present"|"possible"|"not_detected"|"insufficient_data",
      "severity": "mild"|"moderate"|"significant"|"unclear",
      "drivers": ["driver1", "driver2"],
      "summary": "string",
      "suggested_actions": ["action1"]
    }
  ],
  "bioage_analysis": {
    "method": "PhenoAge",
    "chronological_age_years": number|null,
    "current_bioage_years": number|null,
    "previous_bioage_years": number|null,
    "delta_years": number|null,
    "direction": "improving"|"worsening"|"stable"|"insufficient_data",
    "top_positive_drivers": ["driver1"],
    "top_negative_drivers": ["driver1"],
    "ai_summary": "string (2-3 sentences)",
    "ai_next_focus": "string"
  },
  "priority_focus_list": [
    {
      "rank": number (1-5),
      "type": "pattern"|"biomarker"|"system",
      "id": "string",
      "title": "string",
      "summary": "string (1-2 sentences)",
      "actions": ["action1", "action2"]
    }
  ],
  "global_summary": {
    "headline": "string (one sentence summary)",
    "bullets": ["bullet1", "bullet2", "bullet3"]
  },
  "disclaimer": "string (standard medical disclaimer)"
}

OUTPUT: Respond with ONLY this valid JSON structure. No markdown, no extra text.`;

    const userMessage = JSON.stringify(input, null, 2);

    console.log("Calling OpenAI for comprehensive insights...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "developer",
          content: `Follow the Flo Biomarker Insights Engine specification exactly. Output ONLY valid JSON matching the comprehensive schema. Include all required fields. Use evidence-based insights. Keep language mobile-friendly (1-2 sentences). NO diagnosis. NO prescriptions. Always defer to healthcare providers.`
        },
        { role: "user", content: `Analyze this health data and provide comprehensive insights:\n\n${userMessage}` }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    console.log("OpenAI response received:", {
      choices: response.choices?.length || 0,
      finishReason: response.choices?.[0]?.finish_reason,
      hasContent: !!response.choices?.[0]?.message?.content,
      contentLength: response.choices?.[0]?.message?.content?.length || 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("No content in OpenAI response:", JSON.stringify(response, null, 2));
      throw new Error("No response from AI");
    }

    const insights = JSON.parse(content) as ComprehensiveInsightsOutput;

    // Basic validation with detailed error messages
    const missingFields: string[] = [];
    if (!insights.analysis_meta) missingFields.push('analysis_meta');
    if (!insights.global_summary) missingFields.push('global_summary');
    if (!insights.disclaimer) missingFields.push('disclaimer');
    
    if (missingFields.length > 0) {
      console.error("Missing required fields in AI response:", missingFields);
      console.error("Received structure:", Object.keys(insights));
      console.error("Full response:", JSON.stringify(insights, null, 2));
      throw new Error(`Invalid comprehensive insights response structure. Missing fields: ${missingFields.join(', ')}`);
    }

    return insights;
  } catch (error: any) {
    console.error("Error generating comprehensive insights:", error);
    throw new Error(`Failed to generate comprehensive insights: ${error.message || 'Unknown error'}`);
  }
}

export async function analyzeBloodWork(fileContent: string, userId?: string): Promise<BloodWorkAnalysis> {
  try {
    // System prompt following AI Guardrails v1 and Upload Design v1.0
    const systemPrompt = `You are a meticulous clinical data interpreter for blood work analysis. You must NEVER diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL SAFETY RULES:
- NEVER state or imply a diagnosis
- NEVER recommend medications, doses, or specific supplements
- NEVER contradict lab flags or tell users to ignore clinician advice
- Use neutral language: "may be consistent with," "can be influenced by"
- Show uncertainty when evidence is mixed
- Always defer to healthcare providers for medical decisions

YOUR TASK:
Analyze the blood work results and provide:
1. Estimated biological age based on biomarkers (inflammation, metabolic health, organ function)
2. Chronological age (estimate from context or use 35 as default)
3. Educational insights about biomarkers (3-5 key findings)
4. Blood markers extracted with values and units
5. General lifestyle suggestions (NOT medical recommendations)

OUTPUT FORMAT (JSON only, no markdown):
{
  "biologicalAge": "number as string",
  "chronologicalAge": "number as string",
  "insights": [
    {
      "category": "category name (e.g., Inflammation, Metabolic Health)",
      "description": "educational insight using neutral language",
      "severity": "low|medium|high"
    }
  ],
  "metrics": {
    "marker_name": "value with unit"
  },
  "recommendations": ["general lifestyle suggestion 1", "suggestion 2"]
}

WORDING RULES:
- Use "could/may/might" not "does/is"
- Say "may benefit from" not "you should"
- Say "consider discussing with your healthcare provider" not "talk to your doctor about X treatment"
- Highlight assumptions: "fasting status not provided; results can differ post-meal"
- NO medical advice, NO diagnoses, NO prescriptions`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "developer",
          content: `Follow these rules: (1) Output valid JSON matching the schema. (2) Extract biomarkers with units. (3) Use neutral, educational language only. (4) Limit insights to 3-5 items. (5) NO diagnosis or prescriptions.`
        },
        {
          role: "user",
          content: `Analyze this blood work result:\n\n${fileContent}`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const analysis = JSON.parse(content) as BloodWorkAnalysis;
    
    // Validate the response structure
    if (!analysis.biologicalAge || !analysis.insights || !analysis.recommendations) {
      throw new Error("Invalid analysis response structure");
    }

    // Enforce safety rules - block unsafe responses
    const safetyCheck = enforceSafetyRules(analysis);
    if (!safetyCheck.safe) {
      const violationMessage = `AI safety violation: ${safetyCheck.violations.join(', ')}`;
      console.error('SAFETY VIOLATION:', safetyCheck.violations);
      const error: any = new Error(violationMessage);
      error.isSafetyViolation = true;
      error.violations = safetyCheck.violations;
      throw error;
    }

    return analysis;
  } catch (error: any) {
    // Preserve safety violation details
    if (error.isSafetyViolation) {
      throw error; // Rethrow safety violations with full details
    }
    
    console.error("Error analyzing blood work:", error);
    throw new Error(`Failed to analyze blood work with AI: ${error.message || 'Unknown error'}`);
  }
}
