/**
 * Flō Oracle Data Tools - On-demand data retrieval for AI conversations
 * 
 * This module provides function calling tools that allow the AI to fetch
 * detailed data when users ask specific questions about trends, patterns,
 * or historical data.
 */

import { logger } from '../logger';
import { Type, type FunctionDeclaration } from '@google/genai';
import {
  getNutritionDailyMetrics,
  getProfile,
  getDailyMetrics,
  getHealthkitWorkouts,
  getSleepNights,
  getBiomarkerSessions,
  getMeasurementsBySession,
  getDiagnosticsStudies,
  getLifeEvents,
} from './healthStorageRouter';

// ==================== TOOL DECLARATIONS ====================
// These are the function schemas that Gemini understands

export const dataToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_nutrition_trend',
    description: 'Get detailed nutrition data (calories, protein, carbs, fat, fiber, sugar, etc.) for a specific date range. Use when user asks about their diet, eating habits, macro trends, or specific nutritional questions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description: 'Number of days to look back (default 30, max 365)',
        },
        metric: {
          type: Type.STRING,
          description: 'Specific metric to focus on: calories, protein, carbs, fat, fiber, sugar, sodium, cholesterol, caffeine, or all',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_body_composition_history',
    description: 'Get body composition data over time including weight, body fat percentage, lean mass, and BMI. Includes DEXA scan results if available. Use when user asks about weight trends, body fat changes, or muscle gain/loss.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description: 'Number of days to look back (default 90, max 365)',
        },
        includeDexa: {
          type: Type.BOOLEAN,
          description: 'Include DEXA scan results if available (default true)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_workout_summary',
    description: 'Get workout and exercise data including workout types, duration, calories burned, and frequency. Use when user asks about their exercise habits, training patterns, or workout history.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description: 'Number of days to look back (default 30, max 365)',
        },
        workoutType: {
          type: Type.STRING,
          description: 'Filter by workout type: running, walking, cycling, strength, swimming, yoga, hiit, or all',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_sleep_analysis',
    description: 'Get detailed sleep data including duration, quality, sleep stages (deep, REM, light), and trends. Use when user asks about their sleep patterns, sleep quality, or rest habits.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description: 'Number of days to look back (default 30, max 90)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_biomarker_history',
    description: 'Get blood work and biomarker data over time. Includes test results, reference ranges, and trends. Use when user asks about specific biomarkers, blood work trends, or lab results.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        biomarker: {
          type: Type.STRING,
          description: 'Specific biomarker to look up (e.g., glucose, cholesterol, vitamin_d, hemoglobin, creatinine) or "all" for overview',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of test sessions to include (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_vitals_trend',
    description: 'Get vital signs data including heart rate, HRV, blood pressure, respiratory rate, and SpO2 over time. Use when user asks about their heart health, cardiovascular metrics, or vital sign trends.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description: 'Number of days to look back (default 30, max 90)',
        },
        metric: {
          type: Type.STRING,
          description: 'Specific vital to focus on: heart_rate, hrv, blood_pressure, respiratory_rate, spo2, or all',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_life_events',
    description: 'Get logged life events including supplements, medications, symptoms, activities, and health behaviors. Use when user asks about their logged activities, supplement history, or behavioral patterns.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description: 'Number of days to look back (default 30, max 365)',
        },
        eventType: {
          type: Type.STRING,
          description: 'Filter by event type: supplement, medication, symptom, meal, exercise, recovery, sleep, stress, or all',
        },
      },
      required: [],
    },
  },
  {
    name: 'correlate_metrics',
    description: 'Analyze correlation between two health metrics over time. Use when user asks how one metric affects another (e.g., "how does my protein intake affect my body weight" or "does sleep impact my HRV").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        metric1: {
          type: Type.STRING,
          description: 'First metric: protein, calories, sleep_duration, steps, weight, body_fat, hrv, resting_hr',
        },
        metric2: {
          type: Type.STRING,
          description: 'Second metric to correlate with the first',
        },
        days: {
          type: Type.INTEGER,
          description: 'Number of days to analyze (default 90, max 365)',
        },
      },
      required: ['metric1', 'metric2'],
    },
  },
];


// ==================== TOOL EXECUTION ====================
// These functions fetch the actual data

export interface ToolResult {
  success: boolean;
  data?: any;
  summary?: string;
  error?: string;
}

export async function executeDataTool(
  toolName: string,
  args: Record<string, any>,
  userId: string
): Promise<ToolResult> {
  logger.info(`[DataTools] Executing tool: ${toolName}`, { userId, args });

  try {
    switch (toolName) {
      case 'get_nutrition_trend':
        return await executeNutritionTrend(userId, args);
      case 'get_body_composition_history':
        return await executeBodyCompositionHistory(userId, args);
      case 'get_workout_summary':
        return await executeWorkoutSummary(userId, args);
      case 'get_sleep_analysis':
        return await executeSleepAnalysis(userId, args);
      case 'get_biomarker_history':
        return await executeBiomarkerHistory(userId, args);
      case 'get_vitals_trend':
        return await executeVitalsTrend(userId, args);
      case 'get_life_events':
        return await executeLifeEvents(userId, args);
      case 'correlate_metrics':
        return await executeCorrelateMetrics(userId, args);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    logger.error(`[DataTools] Tool execution failed: ${toolName}`, { error: error.message });
    return { success: false, error: error.message };
  }
}


// ==================== TOOL IMPLEMENTATIONS ====================

async function executeNutritionTrend(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const days = Math.min(args.days || 30, 365);
  const metric = args.metric || 'all';
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const records = await getNutritionDailyMetrics(userId, { startDate, limit: days });
  
  if (!records || records.length === 0) {
    return {
      success: true,
      data: null,
      summary: `No nutrition data found for the past ${days} days.`,
    };
  }
  
  // Calculate stats
  const stats = calculateNutritionStats(records, metric);
  
  // Build trend data (weekly averages)
  const weeklyTrends = calculateWeeklyAverages(records, [
    'energyKcal', 'proteinG', 'carbohydratesG', 'fatTotalG', 'fiberG', 'sugarG'
  ]);
  
  return {
    success: true,
    data: {
      daysWithData: records.length,
      dateRange: {
        start: records[records.length - 1]?.localDate,
        end: records[0]?.localDate,
      },
      averages: stats.averages,
      totals: stats.totals,
      weeklyTrends,
      recentDays: records.slice(0, 7).map(r => ({
        date: r.localDate,
        calories: r.energyKcal,
        protein: r.proteinG,
        carbs: r.carbohydratesG,
        fat: r.fatTotalG,
      })),
    },
    summary: formatNutritionSummary(stats, records.length, days),
  };
}

async function executeBodyCompositionHistory(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const days = Math.min(args.days || 90, 365);
  const includeDexa = args.includeDexa !== false;
  
  // Get profile for current weight/body fat
  const profile = await getProfile(userId) as any;
  
  // Get daily metrics for historical weight data
  const dailyMetrics = await getDailyMetrics(userId, days);
  
  // Get DEXA scans if requested
  let dexaScans: any[] = [];
  if (includeDexa) {
    const diagnostics = await getDiagnosticsStudies(userId, 'dexa');
    dexaScans = diagnostics || [];
  }
  
  // Extract weight history from daily metrics
  const weightHistory = dailyMetrics
    .filter((m: any) => m.weightKg)
    .map((m: any) => ({
      date: m.localDate,
      weightKg: m.weightKg,
      bodyFatPct: m.bodyFatPct,
    }));
  
  // Calculate trends
  const weightTrend = calculateTrend(weightHistory.map((w: any) => w.weightKg));
  const bodyFatTrend = calculateTrend(weightHistory.filter((w: any) => w.bodyFatPct).map((w: any) => w.bodyFatPct));
  
  // Normalize profile fields (different db schemas use different names)
  const profileWeight = profile?.weightKg || profile?.weight;
  const profileHeight = profile?.heightCm || profile?.height;
  const profileBodyFat = profile?.bodyFatPct || profile?.body_fat_pct;
  
  return {
    success: true,
    data: {
      current: {
        weight: profileWeight,
        bodyFatPct: profileBodyFat,
        heightCm: profileHeight,
      },
      history: weightHistory.slice(0, 30),
      dexaScans: dexaScans.slice(0, 5),
      trends: {
        weight: weightTrend,
        bodyFat: bodyFatTrend,
      },
    },
    summary: formatBodyCompositionSummary({ weightKg: profileWeight, bodyFatPct: profileBodyFat }, weightHistory, weightTrend, dexaScans),
  };
}

async function executeWorkoutSummary(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const days = Math.min(args.days || 30, 365);
  const workoutType = args.workoutType || 'all';
  
  const workouts = await getHealthkitWorkouts(userId, 500);
  
  if (!workouts || workouts.length === 0) {
    return {
      success: true,
      data: null,
      summary: 'No workout data found.',
    };
  }
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  let filteredWorkouts = workouts.filter((w: any) => {
    const workoutDate = new Date(w.startDate || w.localDate);
    return workoutDate >= cutoffDate;
  });
  
  // Filter by type if specified
  if (workoutType !== 'all') {
    filteredWorkouts = filteredWorkouts.filter((w: any) => 
      w.workoutType?.toLowerCase().includes(workoutType.toLowerCase())
    );
  }
  
  // Calculate stats
  const totalWorkouts = filteredWorkouts.length;
  const totalDuration = filteredWorkouts.reduce((sum: number, w: any) => sum + (w.durationMinutes || 0), 0);
  const totalCalories = filteredWorkouts.reduce((sum: number, w: any) => sum + (w.energyBurned || 0), 0);
  
  // Group by type
  const byType: Record<string, number> = {};
  filteredWorkouts.forEach((w: any) => {
    const type = w.workoutType || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });
  
  // Weekly frequency
  const weeksInRange = Math.ceil(days / 7);
  const avgPerWeek = (totalWorkouts / weeksInRange).toFixed(1);
  
  return {
    success: true,
    data: {
      totalWorkouts,
      totalDurationMinutes: Math.round(totalDuration),
      totalCaloriesBurned: Math.round(totalCalories),
      avgPerWeek: parseFloat(avgPerWeek),
      byType,
      recentWorkouts: filteredWorkouts.slice(0, 10).map((w: any) => ({
        date: w.localDate || w.startDate,
        type: w.workoutType,
        duration: w.durationMinutes,
        calories: w.energyBurned,
      })),
    },
    summary: formatWorkoutSummary(totalWorkouts, totalDuration, totalCalories, byType, days),
  };
}

async function executeSleepAnalysis(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const days = Math.min(args.days || 30, 90);
  
  const sleepNights = await getSleepNights(userId, days);
  
  if (!sleepNights || sleepNights.length === 0) {
    return {
      success: true,
      data: null,
      summary: `No sleep data found for the past ${days} days.`,
    };
  }
  
  // Calculate averages
  const avgDuration = sleepNights.reduce((sum: number, s: any) => sum + (s.totalSleepMinutes || 0), 0) / sleepNights.length;
  const avgDeep = sleepNights.reduce((sum: number, s: any) => sum + (s.deepSleepMinutes || 0), 0) / sleepNights.length;
  const avgRem = sleepNights.reduce((sum: number, s: any) => sum + (s.remSleepMinutes || 0), 0) / sleepNights.length;
  const avgEfficiency = sleepNights.filter((s: any) => s.sleepEfficiency).reduce((sum: number, s: any) => sum + s.sleepEfficiency, 0) / 
    sleepNights.filter((s: any) => s.sleepEfficiency).length;
  
  // Calculate trend
  const durationTrend = calculateTrend(sleepNights.map((s: any) => s.totalSleepMinutes || 0));
  
  return {
    success: true,
    data: {
      nightsTracked: sleepNights.length,
      averages: {
        totalSleepHours: (avgDuration / 60).toFixed(1),
        deepSleepMinutes: Math.round(avgDeep),
        remSleepMinutes: Math.round(avgRem),
        efficiency: avgEfficiency ? avgEfficiency.toFixed(0) + '%' : null,
      },
      trend: durationTrend,
      recentNights: sleepNights.slice(0, 7).map((s: any) => ({
        date: s.sleepDate,
        totalHours: ((s.totalSleepMinutes || 0) / 60).toFixed(1),
        deep: s.deepSleepMinutes,
        rem: s.remSleepMinutes,
      })),
    },
    summary: formatSleepSummary(avgDuration, avgDeep, avgRem, sleepNights.length, durationTrend),
  };
}

async function executeBiomarkerHistory(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const biomarker = args.biomarker || 'all';
  const limit = Math.min(args.limit || 10, 50);
  
  const sessions = await getBiomarkerSessions(userId, limit);
  
  if (!sessions || sessions.length === 0) {
    return {
      success: true,
      data: null,
      summary: 'No blood work data found.',
    };
  }
  
  // Get measurements for each session
  const sessionsWithMeasurements = await Promise.all(
    sessions.map(async (session: any) => {
      const measurements = await getMeasurementsBySession(session.id);
      return { ...session, measurements };
    })
  );
  
  // If specific biomarker requested, filter and track across sessions
  if (biomarker !== 'all') {
    const biomarkerHistory: any[] = [];
    sessionsWithMeasurements.forEach((session: any) => {
      const match = session.measurements?.find((m: any) => 
        m.biomarkerId?.toLowerCase().includes(biomarker.toLowerCase()) ||
        m.name?.toLowerCase().includes(biomarker.toLowerCase())
      );
      if (match) {
        biomarkerHistory.push({
          date: session.testDate,
          value: match.value,
          unit: match.unit,
          referenceRange: match.referenceRange,
          status: match.status,
        });
      }
    });
    
    return {
      success: true,
      data: {
        biomarker,
        history: biomarkerHistory,
        trend: biomarkerHistory.length >= 2 ? 
          calculateTrend(biomarkerHistory.map(h => h.value)) : null,
      },
      summary: formatBiomarkerSummary(biomarker, biomarkerHistory),
    };
  }
  
  // Return overview of all sessions
  return {
    success: true,
    data: {
      totalSessions: sessions.length,
      sessions: sessionsWithMeasurements.slice(0, 5).map((s: any) => ({
        date: s.testDate,
        source: s.source,
        measurementCount: s.measurements?.length || 0,
        keyMarkers: s.measurements?.slice(0, 10).map((m: any) => ({
          name: m.biomarkerId || m.name,
          value: m.value,
          unit: m.unit,
          status: m.status,
        })),
      })),
    },
    summary: formatBiomarkerOverview(sessions),
  };
}

async function executeVitalsTrend(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const days = Math.min(args.days || 30, 90);
  const metric = args.metric || 'all';
  
  const dailyMetrics = await getDailyMetrics(userId, days);
  
  if (!dailyMetrics || dailyMetrics.length === 0) {
    return {
      success: true,
      data: null,
      summary: `No vital signs data found for the past ${days} days.`,
    };
  }
  
  // Calculate averages
  const avgHr = calculateAvg(dailyMetrics, 'restingHr');
  const avgHrv = calculateAvg(dailyMetrics, 'hrvMs');
  const avgSpo2 = calculateAvg(dailyMetrics, 'oxygenSaturationPct');
  const avgRespRate = calculateAvg(dailyMetrics, 'respiratoryRate');
  
  // Calculate trends
  const hrTrend = calculateTrend(dailyMetrics.map((d: any) => d.restingHr).filter(Boolean));
  const hrvTrend = calculateTrend(dailyMetrics.map((d: any) => d.hrvMs).filter(Boolean));
  
  return {
    success: true,
    data: {
      daysWithData: dailyMetrics.length,
      averages: {
        restingHr: avgHr ? Math.round(avgHr) : null,
        hrvMs: avgHrv ? Math.round(avgHrv) : null,
        spo2Pct: avgSpo2 ? avgSpo2.toFixed(1) : null,
        respiratoryRate: avgRespRate ? avgRespRate.toFixed(1) : null,
      },
      trends: {
        hr: hrTrend,
        hrv: hrvTrend,
      },
      recentDays: dailyMetrics.slice(0, 7).map((d: any) => ({
        date: d.localDate,
        restingHr: d.restingHr,
        hrv: d.hrvMs,
        spo2: d.oxygenSaturationPct,
      })),
    },
    summary: formatVitalsSummary(avgHr, avgHrv, avgSpo2, hrTrend, hrvTrend, dailyMetrics.length),
  };
}

async function executeLifeEvents(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const days = Math.min(args.days || 30, 365);
  const eventType = args.eventType || 'all';
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  let events = await getLifeEvents(userId, { startDate, limit: 500 }) as any[];
  
  if (!events || events.length === 0) {
    return {
      success: true,
      data: null,
      summary: `No life events logged in the past ${days} days.`,
    };
  }
  
  // Filter by type if specified
  if (eventType !== 'all') {
    events = events.filter((e: any) => 
      e.eventType?.toLowerCase().includes(eventType.toLowerCase())
    );
  }
  
  // Group by type
  const byType: Record<string, number> = {};
  events.forEach((e: any) => {
    const type = e.eventType || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });
  
  return {
    success: true,
    data: {
      totalEvents: events.length,
      byType,
      recentEvents: events.slice(0, 20).map((e: any) => ({
        date: e.createdAt,
        type: e.eventType,
        details: e.details,
        notes: e.notes?.substring(0, 100),
      })),
    },
    summary: formatLifeEventsSummary(events.length, byType, days),
  };
}

async function executeCorrelateMetrics(userId: string, args: Record<string, any>): Promise<ToolResult> {
  const { metric1, metric2 } = args;
  const days = Math.min(args.days || 90, 365);
  
  // Fetch relevant data based on metrics requested
  const dailyMetrics = await getDailyMetrics(userId, days);
  const nutritionData = await getNutritionDailyMetrics(userId, { limit: days });
  const sleepData = await getSleepNights(userId, days);
  
  // Build aligned dataset
  const data1 = extractMetricSeries(metric1, dailyMetrics, nutritionData, sleepData);
  const data2 = extractMetricSeries(metric2, dailyMetrics, nutritionData, sleepData);
  
  if (!data1 || !data2 || data1.length < 7 || data2.length < 7) {
    return {
      success: true,
      data: null,
      summary: `Not enough data to correlate ${metric1} and ${metric2}. Need at least 7 days of data for both metrics.`,
    };
  }
  
  // Calculate correlation (simplified Pearson)
  const correlation = calculateCorrelation(data1, data2);
  
  // Interpret correlation strength
  let interpretation = '';
  const absCorr = Math.abs(correlation);
  if (absCorr < 0.2) interpretation = 'no significant relationship';
  else if (absCorr < 0.4) interpretation = 'weak relationship';
  else if (absCorr < 0.6) interpretation = 'moderate relationship';
  else if (absCorr < 0.8) interpretation = 'strong relationship';
  else interpretation = 'very strong relationship';
  
  const direction = correlation > 0 ? 'positive' : 'negative';
  
  return {
    success: true,
    data: {
      metric1,
      metric2,
      correlation: correlation.toFixed(3),
      strength: interpretation,
      direction,
      dataPoints: Math.min(data1.length, data2.length),
    },
    summary: `Analysis of ${metric1} vs ${metric2}: Found ${interpretation} (correlation: ${correlation.toFixed(2)}). ${
      correlation > 0.3 
        ? `As ${metric1} increases, ${metric2} tends to increase.`
        : correlation < -0.3 
        ? `As ${metric1} increases, ${metric2} tends to decrease.`
        : 'No clear pattern between these metrics.'
    }`,
  };
}


// ==================== HELPER FUNCTIONS ====================

function calculateNutritionStats(records: any[], metric: string) {
  const fields = ['energyKcal', 'proteinG', 'carbohydratesG', 'fatTotalG', 'fiberG', 'sugarG', 'sodiumMg', 'cholesterolMg', 'caffeineMg'];
  
  const averages: Record<string, number | null> = {};
  const totals: Record<string, number> = {};
  
  fields.forEach(field => {
    const values = records.map(r => r[field]).filter((v): v is number => v != null);
    averages[field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    totals[field] = values.reduce((a, b) => a + b, 0);
  });
  
  return { averages, totals };
}

function calculateWeeklyAverages(records: any[], fields: string[]): Record<string, number[]> {
  const weeklyData: Record<string, number[]> = {};
  fields.forEach(f => weeklyData[f] = []);
  
  // Group by week
  const weeks: any[][] = [];
  for (let i = 0; i < records.length; i += 7) {
    weeks.push(records.slice(i, i + 7));
  }
  
  weeks.forEach(week => {
    fields.forEach(field => {
      const values = week.map(r => r[field]).filter((v): v is number => v != null);
      if (values.length > 0) {
        weeklyData[field].push(values.reduce((a, b) => a + b, 0) / values.length);
      }
    });
  });
  
  return weeklyData;
}

function calculateTrend(values: number[]): { direction: string; changePercent: number | null } {
  if (!values || values.length < 2) {
    return { direction: 'insufficient_data', changePercent: null };
  }
  
  const validValues = values.filter(v => v != null && !isNaN(v));
  if (validValues.length < 2) {
    return { direction: 'insufficient_data', changePercent: null };
  }
  
  const first = validValues[validValues.length - 1]; // oldest
  const last = validValues[0]; // newest
  
  if (first === 0) {
    return { direction: last > 0 ? 'increasing' : 'stable', changePercent: null };
  }
  
  const changePercent = ((last - first) / first) * 100;
  
  let direction = 'stable';
  if (changePercent > 5) direction = 'increasing';
  else if (changePercent < -5) direction = 'decreasing';
  
  return { direction, changePercent: Math.round(changePercent * 10) / 10 };
}

function calculateAvg(data: any[], field: string): number | null {
  const values = data.map(d => d[field]).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function extractMetricSeries(metric: string, dailyMetrics: any[], nutritionData: any[], sleepData: any[]): number[] {
  const metricMap: Record<string, { source: string; field: string }> = {
    weight: { source: 'daily', field: 'weightKg' },
    body_fat: { source: 'daily', field: 'bodyFatPct' },
    steps: { source: 'daily', field: 'steps' },
    resting_hr: { source: 'daily', field: 'restingHr' },
    hrv: { source: 'daily', field: 'hrvMs' },
    calories: { source: 'nutrition', field: 'energyKcal' },
    protein: { source: 'nutrition', field: 'proteinG' },
    carbs: { source: 'nutrition', field: 'carbohydratesG' },
    fat: { source: 'nutrition', field: 'fatTotalG' },
    sleep_duration: { source: 'sleep', field: 'totalSleepMinutes' },
  };
  
  const config = metricMap[metric.toLowerCase()];
  if (!config) return [];
  
  let source: any[] = [];
  if (config.source === 'daily') source = dailyMetrics;
  else if (config.source === 'nutrition') source = nutritionData;
  else if (config.source === 'sleep') source = sleepData;
  
  return source.map(d => d[config.field]).filter((v): v is number => v != null);
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  if (denomX === 0 || denomY === 0) return 0;
  return numerator / Math.sqrt(denomX * denomY);
}


// ==================== FORMATTING FUNCTIONS ====================

function formatNutritionSummary(stats: any, daysWithData: number, daysRequested: number): string {
  const cal = stats.averages.energyKcal?.toFixed(0) || 'N/A';
  const pro = stats.averages.proteinG?.toFixed(0) || 'N/A';
  const carb = stats.averages.carbohydratesG?.toFixed(0) || 'N/A';
  const fat = stats.averages.fatTotalG?.toFixed(0) || 'N/A';
  
  return `Nutrition data for ${daysWithData} days (of ${daysRequested} requested): Average daily intake - Calories: ${cal} kcal, Protein: ${pro}g, Carbs: ${carb}g, Fat: ${fat}g`;
}

function formatBodyCompositionSummary(profile: any, history: any[], trend: any, dexaScans: any[]): string {
  const weight = profile?.weightKg ? `${profile.weightKg.toFixed(1)} kg` : 'not recorded';
  const bf = profile?.bodyFatPct ? `${profile.bodyFatPct.toFixed(1)}%` : 'not recorded';
  const trendStr = trend.direction !== 'insufficient_data' 
    ? `Weight trend: ${trend.direction} (${trend.changePercent > 0 ? '+' : ''}${trend.changePercent}%)`
    : '';
  const dexaStr = dexaScans.length > 0 ? ` | ${dexaScans.length} DEXA scan(s) on file` : '';
  
  return `Current: Weight ${weight}, Body fat ${bf}. ${trendStr}${dexaStr}. ${history.length} weight measurements recorded.`;
}

function formatWorkoutSummary(total: number, duration: number, calories: number, byType: Record<string, number>, days: number): string {
  const avgPerWeek = (total / (days / 7)).toFixed(1);
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t}: ${c}`).join(', ');
  
  return `${total} workouts in ${days} days (~${avgPerWeek}/week). Total: ${Math.round(duration)} min, ${Math.round(calories)} cal. Top types: ${topTypes}`;
}

function formatSleepSummary(avgDuration: number, avgDeep: number, avgRem: number, nights: number, trend: any): string {
  const hours = (avgDuration / 60).toFixed(1);
  const trendStr = trend.direction !== 'insufficient_data' ? ` Sleep trend: ${trend.direction}.` : '';
  
  return `${nights} nights tracked. Average: ${hours} hours total, ${Math.round(avgDeep)} min deep, ${Math.round(avgRem)} min REM.${trendStr}`;
}

function formatBiomarkerSummary(biomarker: string, history: any[]): string {
  if (history.length === 0) return `No data found for ${biomarker}.`;
  
  const latest = history[0];
  const oldest = history[history.length - 1];
  
  let change = '';
  if (history.length >= 2) {
    const diff = latest.value - oldest.value;
    change = ` Change: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} ${latest.unit} over ${history.length} tests.`;
  }
  
  return `${biomarker}: Latest value ${latest.value} ${latest.unit} (${latest.status || 'no status'}). ${history.length} measurement(s).${change}`;
}

function formatBiomarkerOverview(sessions: any[]): string {
  const latest = sessions[0];
  return `${sessions.length} blood work session(s). Most recent: ${latest?.testDate || 'unknown date'} from ${latest?.source || 'unknown source'}.`;
}

function formatVitalsSummary(hr: number | null, hrv: number | null, spo2: number | null, hrTrend: any, hrvTrend: any, days: number): string {
  const parts: string[] = [];
  if (hr) parts.push(`Resting HR: ${Math.round(hr)} bpm`);
  if (hrv) parts.push(`HRV: ${Math.round(hrv)} ms`);
  if (spo2) parts.push(`SpO2: ${spo2.toFixed(1)}%`);
  
  let trends = '';
  if (hrTrend.direction !== 'insufficient_data') {
    trends = ` HR trend: ${hrTrend.direction}`;
    if (hrvTrend.direction !== 'insufficient_data') {
      trends += `, HRV trend: ${hrvTrend.direction}`;
    }
    trends += '.';
  }
  
  return `${days}-day averages: ${parts.join(', ')}.${trends}`;
}

function formatLifeEventsSummary(total: number, byType: Record<string, number>, days: number): string {
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, c]) => `${t}: ${c}`).join(', ');
  return `${total} life events logged in ${days} days. Breakdown: ${topTypes}`;
}
