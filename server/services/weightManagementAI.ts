/**
 * Weight Management AI Service
 * 
 * Calls Gemini with the Weight Management Analyst master prompt
 * and the user's aggregated health context to generate structured
 * weight management analysis and recommendations.
 */

import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../utils/logger';
import { trackGeminiUsage } from './aiUsageTracker';
import { buildWeightManagementContext, WeightContextJson } from './weightManagementContext';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('WeightManagementAI');

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      logger.warn('[WeightManagementAI] GOOGLE_AI_API_KEY not configured');
      return null;
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

export interface WeightAIAnalysis {
  headline: string;
  current_state: {
    goal: {
      target_weight_kg: number | null;
      target_date: string | null;
      goal_rate_kg_per_week: number | null;
    };
    trend: {
      weight_today_kg: number | null;
      trend_7d_kg: number | null;
      trend_28d_kg: number | null;
      rate_kg_per_week: number | null;
      is_plateau: boolean;
      plateau_reason_hypotheses: string[];
    };
    energy_balance_estimate: {
      estimated_TDEE_kcal: number | null;
      estimated_intake_kcal: number | null;
      estimated_deficit_kcal_per_day: number | null;
      confidence: 'low' | 'medium' | 'high';
      why: string;
    };
    metabolic_health_signals: {
      sleep_flag: 'good' | 'ok' | 'needs_work' | 'unknown';
      stress_flag: 'good' | 'ok' | 'needs_work' | 'unknown';
      cgm_flag: 'stable' | 'variable' | 'concerning_lows' | 'unknown';
    };
  };
  what_is_working: Array<{
    insight: string;
    evidence: string[];
    keep_doing: string;
  }>;
  what_is_blocking_progress: Array<{
    issue: string;
    evidence: string[];
    why_it_matters: string;
    most_likely_driver: string;
  }>;
  top_levers_next_7_days: Array<{
    lever: string;
    why_this: string;
    exact_target: string;
    how_to_do_it: string[];
    success_metric: string[];
    difficulty: 'easy' | 'medium' | 'hard';
  }>;
  cgm_coaching: {
    available: boolean;
    key_patterns: string[];
    next_meal_experiment: {
      hypothesis: string;
      protocol: string[];
      what_success_looks_like: string[];
    } | null;
  };
  forecast: {
    if_no_change: {
      four_week_weight_kg: number | null;
      reasoning: string;
    };
    if_apply_top_levers: {
      four_week_weight_kg: number | null;
      reasoning: string;
    };
    confidence: 'low' | 'medium' | 'high';
  };
  data_gaps: Array<{
    missing: string;
    why_it_matters: string;
    how_to_capture: string;
  }>;
  safety_notes: string[];
  tone_close: string;
}

const MASTER_PROMPT_PATH = path.join(
  process.cwd(),
  'attached_assets',
  'Pasted-You-are-Fl-s-Weight-Management-Analyst-a-precise-practi_1765771528894.txt'
);

let cachedMasterPrompt: string | null = null;

function getMasterPrompt(): string {
  if (cachedMasterPrompt) {
    return cachedMasterPrompt;
  }
  
  try {
    cachedMasterPrompt = fs.readFileSync(MASTER_PROMPT_PATH, 'utf-8');
    return cachedMasterPrompt;
  } catch (error) {
    logger.error('[WeightManagementAI] Failed to read master prompt file:', error);
    throw new Error('Weight Management AI prompt configuration not available');
  }
}

function buildPromptWithContext(contextJson: WeightContextJson): string {
  const masterPrompt = getMasterPrompt();
  const contextString = JSON.stringify(contextJson, null, 2);
  return masterPrompt.replace(/\{\{FLO_WEIGHT_CONTEXT_JSON\}\}/g, contextString);
}

function repairJson(jsonStr: string): string {
  let repaired = jsonStr;
  repaired = repaired.replace(/,\s*}/g, '}');
  repaired = repaired.replace(/,\s*]/g, ']');
  repaired = repaired.replace(/:\s*,/g, ': null,');
  repaired = repaired.replace(/:\s*}/g, ': null}');
  repaired = repaired.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  repaired = repaired.replace(/:\s*'([^']*)'/g, ': "$1"');
  repaired = repaired.replace(/\n/g, ' ');
  repaired = repaired.replace(/\t/g, ' ');
  repaired = repaired.replace(/[\x00-\x1F\x7F]/g, ' ');
  return repaired;
}

function parseAIResponse(responseText: string): WeightAIAnalysis {
  let jsonStr = responseText.trim();
  
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  
  if (jsonStr.startsWith('{') === false) {
    const startIdx = jsonStr.indexOf('{');
    if (startIdx !== -1) {
      jsonStr = jsonStr.substring(startIdx);
    }
  }
  
  const lastBrace = jsonStr.lastIndexOf('}');
  if (lastBrace !== -1 && lastBrace < jsonStr.length - 1) {
    jsonStr = jsonStr.substring(0, lastBrace + 1);
  }
  
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (firstError) {
    logger.warn('[WeightManagementAI] First parse failed, attempting repair...');
    try {
      const repairedJson = repairJson(jsonStr);
      parsed = JSON.parse(repairedJson);
      logger.info('[WeightManagementAI] JSON repair successful');
    } catch (repairError) {
      logger.error('[WeightManagementAI] JSON repair also failed:', repairError);
      logger.debug(`[WeightManagementAI] Raw response (first 1000 chars): ${jsonStr.substring(0, 1000)}`);
      throw new Error('Failed to parse AI analysis response');
    }
  }
  
  const analysis: WeightAIAnalysis = {
    headline: parsed.headline || 'Weight analysis in progress...',
      current_state: {
        goal: {
          target_weight_kg: parsed.current_state?.goal?.target_weight_kg ?? null,
          target_date: parsed.current_state?.goal?.target_date ?? null,
          goal_rate_kg_per_week: parsed.current_state?.goal?.goal_rate_kg_per_week ?? null,
        },
        trend: {
          weight_today_kg: parsed.current_state?.trend?.weight_today_kg ?? null,
          trend_7d_kg: parsed.current_state?.trend?.trend_7d_kg ?? null,
          trend_28d_kg: parsed.current_state?.trend?.trend_28d_kg ?? null,
          rate_kg_per_week: parsed.current_state?.trend?.rate_kg_per_week ?? null,
          is_plateau: parsed.current_state?.trend?.is_plateau ?? false,
          plateau_reason_hypotheses: parsed.current_state?.trend?.plateau_reason_hypotheses ?? [],
        },
        energy_balance_estimate: {
          estimated_TDEE_kcal: parsed.current_state?.energy_balance_estimate?.estimated_TDEE_kcal ?? null,
          estimated_intake_kcal: parsed.current_state?.energy_balance_estimate?.estimated_intake_kcal ?? null,
          estimated_deficit_kcal_per_day: parsed.current_state?.energy_balance_estimate?.estimated_deficit_kcal_per_day ?? null,
          confidence: parsed.current_state?.energy_balance_estimate?.confidence ?? 'low',
          why: parsed.current_state?.energy_balance_estimate?.why ?? '',
        },
        metabolic_health_signals: {
          sleep_flag: parsed.current_state?.metabolic_health_signals?.sleep_flag ?? 'unknown',
          stress_flag: parsed.current_state?.metabolic_health_signals?.stress_flag ?? 'unknown',
          cgm_flag: parsed.current_state?.metabolic_health_signals?.cgm_flag ?? 'unknown',
        },
      },
      what_is_working: Array.isArray(parsed.what_is_working) ? parsed.what_is_working.map((item: any) => ({
        insight: item.insight || '',
        evidence: Array.isArray(item.evidence) ? item.evidence : [],
        keep_doing: item.keep_doing || '',
      })) : [],
      what_is_blocking_progress: Array.isArray(parsed.what_is_blocking_progress) ? parsed.what_is_blocking_progress.map((item: any) => ({
        issue: item.issue || '',
        evidence: Array.isArray(item.evidence) ? item.evidence : [],
        why_it_matters: item.why_it_matters || '',
        most_likely_driver: item.most_likely_driver || '',
      })) : [],
      top_levers_next_7_days: Array.isArray(parsed.top_levers_next_7_days) ? parsed.top_levers_next_7_days.slice(0, 3).map((item: any) => ({
        lever: item.lever || '',
        why_this: item.why_this || '',
        exact_target: item.exact_target || '',
        how_to_do_it: Array.isArray(item.how_to_do_it) ? item.how_to_do_it : [],
        success_metric: Array.isArray(item.success_metric) ? item.success_metric : [],
        difficulty: item.difficulty || 'medium',
      })) : [],
      cgm_coaching: {
        available: parsed.cgm_coaching?.available ?? false,
        key_patterns: Array.isArray(parsed.cgm_coaching?.key_patterns) ? parsed.cgm_coaching.key_patterns : [],
        next_meal_experiment: parsed.cgm_coaching?.next_meal_experiment ? {
          hypothesis: parsed.cgm_coaching.next_meal_experiment.hypothesis || '',
          protocol: Array.isArray(parsed.cgm_coaching.next_meal_experiment.protocol) ? parsed.cgm_coaching.next_meal_experiment.protocol : [],
          what_success_looks_like: Array.isArray(parsed.cgm_coaching.next_meal_experiment.what_success_looks_like) ? parsed.cgm_coaching.next_meal_experiment.what_success_looks_like : [],
        } : null,
      },
      forecast: {
        if_no_change: {
          four_week_weight_kg: parsed.forecast?.if_no_change?.['4_week_weight_kg'] ?? parsed.forecast?.if_no_change?.four_week_weight_kg ?? null,
          reasoning: parsed.forecast?.if_no_change?.reasoning || '',
        },
        if_apply_top_levers: {
          four_week_weight_kg: parsed.forecast?.if_apply_top_levers?.['4_week_weight_kg'] ?? parsed.forecast?.if_apply_top_levers?.four_week_weight_kg ?? null,
          reasoning: parsed.forecast?.if_apply_top_levers?.reasoning || '',
        },
        confidence: parsed.forecast?.confidence ?? 'low',
      },
      data_gaps: Array.isArray(parsed.data_gaps) ? parsed.data_gaps.map((item: any) => ({
        missing: item.missing || '',
        why_it_matters: item.why_it_matters || '',
        how_to_capture: item.how_to_capture || '',
      })) : [],
      safety_notes: Array.isArray(parsed.safety_notes) ? parsed.safety_notes : [],
      tone_close: parsed.tone_close || '',
  };
  
  return analysis;
}

export async function generateWeightAnalysis(userId: string): Promise<WeightAIAnalysis> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('AI service not available');
  }
  
  logger.info(`[WeightManagementAI] Generating analysis for user ${userId}`);
  const startTime = Date.now();
  
  try {
    const context = await buildWeightManagementContext(userId);
    const fullPrompt = buildPromptWithContext(context);
    
    logger.debug(`[WeightManagementAI] Prompt length: ${fullPrompt.length} chars`);
    
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            headline: { type: 'string' },
            current_state: {
              type: 'object',
              required: ['goal', 'trend', 'energy_balance_estimate', 'metabolic_health_signals'],
              properties: {
                goal: {
                  type: 'object',
                  properties: {
                    target_weight_kg: { type: 'number', nullable: true },
                    target_date: { type: 'string', nullable: true },
                    goal_rate_kg_per_week: { type: 'number', nullable: true },
                  },
                },
                trend: {
                  type: 'object',
                  required: ['is_plateau', 'plateau_reason_hypotheses'],
                  properties: {
                    weight_today_kg: { type: 'number', nullable: true },
                    trend_7d_kg: { type: 'number', nullable: true },
                    trend_28d_kg: { type: 'number', nullable: true },
                    rate_kg_per_week: { type: 'number', nullable: true },
                    is_plateau: { type: 'boolean' },
                    plateau_reason_hypotheses: { type: 'array', items: { type: 'string' } },
                  },
                },
                energy_balance_estimate: {
                  type: 'object',
                  required: ['confidence', 'why'],
                  properties: {
                    estimated_TDEE_kcal: { type: 'number', nullable: true },
                    estimated_intake_kcal: { type: 'number', nullable: true },
                    estimated_deficit_kcal_per_day: { type: 'number', nullable: true },
                    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                    why: { type: 'string' },
                  },
                },
                metabolic_health_signals: {
                  type: 'object',
                  required: ['sleep_flag', 'stress_flag', 'cgm_flag'],
                  properties: {
                    sleep_flag: { type: 'string', enum: ['good', 'ok', 'needs_work', 'unknown'] },
                    stress_flag: { type: 'string', enum: ['good', 'ok', 'needs_work', 'unknown'] },
                    cgm_flag: { type: 'string', enum: ['stable', 'variable', 'concerning_lows', 'unknown'] },
                  },
                },
              },
            },
            what_is_working: {
              type: 'array',
              items: {
                type: 'object',
                required: ['insight', 'evidence', 'keep_doing'],
                properties: {
                  insight: { type: 'string' },
                  evidence: { type: 'array', items: { type: 'string' } },
                  keep_doing: { type: 'string' },
                },
              },
            },
            what_is_blocking_progress: {
              type: 'array',
              items: {
                type: 'object',
                required: ['issue', 'evidence', 'why_it_matters', 'most_likely_driver'],
                properties: {
                  issue: { type: 'string' },
                  evidence: { type: 'array', items: { type: 'string' } },
                  why_it_matters: { type: 'string' },
                  most_likely_driver: { type: 'string' },
                },
              },
            },
            top_levers_next_7_days: {
              type: 'array',
              items: {
                type: 'object',
                required: ['lever', 'why_this', 'exact_target', 'how_to_do_it', 'success_metric', 'difficulty'],
                properties: {
                  lever: { type: 'string' },
                  why_this: { type: 'string' },
                  exact_target: { type: 'string' },
                  how_to_do_it: { type: 'array', items: { type: 'string' } },
                  success_metric: { type: 'array', items: { type: 'string' } },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
              },
            },
            cgm_coaching: {
              type: 'object',
              required: ['available', 'key_patterns'],
              properties: {
                available: { type: 'boolean' },
                key_patterns: { type: 'array', items: { type: 'string' } },
                next_meal_experiment: {
                  type: 'object',
                  nullable: true,
                  required: ['hypothesis', 'protocol', 'what_success_looks_like'],
                  properties: {
                    hypothesis: { type: 'string' },
                    protocol: { type: 'array', items: { type: 'string' } },
                    what_success_looks_like: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
            forecast: {
              type: 'object',
              required: ['if_no_change', 'if_apply_top_levers', 'confidence'],
              properties: {
                if_no_change: {
                  type: 'object',
                  required: ['reasoning'],
                  properties: {
                    four_week_weight_kg: { type: 'number', nullable: true },
                    reasoning: { type: 'string' },
                  },
                },
                if_apply_top_levers: {
                  type: 'object',
                  required: ['reasoning'],
                  properties: {
                    four_week_weight_kg: { type: 'number', nullable: true },
                    reasoning: { type: 'string' },
                  },
                },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              },
            },
            data_gaps: {
              type: 'array',
              items: {
                type: 'object',
                required: ['missing', 'why_it_matters', 'how_to_capture'],
                properties: {
                  missing: { type: 'string' },
                  why_it_matters: { type: 'string' },
                  how_to_capture: { type: 'string' },
                },
              },
            },
            safety_notes: { type: 'array', items: { type: 'string' } },
            tone_close: { type: 'string' },
          },
          required: ['headline', 'current_state', 'what_is_working', 'what_is_blocking_progress', 'top_levers_next_7_days', 'cgm_coaching', 'forecast', 'data_gaps', 'safety_notes', 'tone_close'],
        },
      },
    });
    
    const latencyMs = Date.now() - startTime;
    const responseText = result.text || '';
    
    const usage = result.usageMetadata;
    if (usage) {
      await trackGeminiUsage(
        'weight_ai_analysis',
        'gemini-2.5-flash',
        {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
        {
          userId,
          latencyMs,
          status: responseText ? 'success' : 'error',
          metadata: {
            contextConfidence: context.confidence_inputs.overall_confidence,
            weightDataDays: context.confidence_inputs.weight_data_days,
          },
        }
      ).catch(err => logger.warn('[WeightManagementAI] Failed to track usage:', err));
    }
    
    const analysis = parseAIResponse(responseText);
    
    logger.info(`[WeightManagementAI] Analysis generated for user ${userId}`, {
      latencyMs,
      headlineLength: analysis.headline.length,
      leversCount: analysis.top_levers_next_7_days.length,
    });
    
    return analysis;
    
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.error(`[WeightManagementAI] Failed to generate analysis for user ${userId}:`, error);
    
    await trackGeminiUsage(
      'weight_ai_analysis',
      'gemini-2.5-flash',
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      { userId, latencyMs, status: 'error', metadata: { error: String(error) } }
    ).catch(() => {});
    
    throw error;
  }
}
