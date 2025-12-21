/**
 * Goal Context Service
 * 
 * Fetches user goals (weight, nutrition, experiments) and calculates daily progress
 * for proactive, actionable insights like "You need 25g more protein for dinner"
 */

import { createLogger } from '../utils/logger';
import { getSupabaseClient } from './supabaseClient';
import { getHealthId } from './supabaseHealthStorage';
import * as healthRouter from './healthStorageRouter';
import { n1ExperimentService } from './n1ExperimentService';
import { format, subDays } from 'date-fns';

const logger = createLogger('GoalContextService');
const supabase = getSupabaseClient();

export interface WeightGoal {
  targetWeightKg: number | null;
  targetDate: string | null;
  goalType: 'LOSE' | 'GAIN' | 'MAINTAIN' | 'RECOMPOSITION' | null;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  progressPercent: number | null;
  remainingKg: number | null;
  daysRemaining: number | null;
  weeklyRateKg: number | null;
}

export interface NutritionTargets {
  calorieTarget: number | null;
  proteinTargetG: number | null;
  carbTargetG: number | null;
  fatTargetG: number | null;
  fiberTargetG: number | null;
}

export interface TodayNutrition {
  caloriesConsumed: number;
  proteinConsumedG: number;
  carbsConsumedG: number;
  fatConsumedG: number;
  fiberConsumedG: number;
  mealsLogged: number;
  lastMealTime: string | null;
}

export interface NutritionGap {
  metric: 'protein' | 'calories' | 'carbs' | 'fat' | 'fiber';
  targetValue: number;
  currentValue: number;
  gapValue: number;
  gapPercent: number;
  priority: 'high' | 'medium' | 'low';
  actionableMessage: string;
}

export interface ActiveExperiment {
  id: string;
  name: string;
  type: 'supplement' | 'intervention';
  supplementType: string | null;
  productName: string | null;
  primaryIntent: string;
  status: 'baseline' | 'active';
  dayNumber: number;
  totalDays: number;
  dosageInfo: string | null;
}

export interface GoalContext {
  weightGoal: WeightGoal;
  nutritionTargets: NutritionTargets;
  todayNutrition: TodayNutrition;
  nutritionGaps: NutritionGap[];
  activeExperiments: ActiveExperiment[];
  hasActiveGoals: boolean;
  goalSummary: string;
}

/**
 * Calculate nutrition targets based on weight goal and body composition
 * Uses Mifflin-St Jeor equation with actual user data
 */
function calculateNutritionTargets(
  weightGoal: WeightGoal,
  currentWeightKg: number | null,
  sex: string | null,
  activityLevel: string | null,
  heightCm: number | null,
  age: number | null
): NutritionTargets {
  const weight = currentWeightKg || 70;
  const height = heightCm || (sex?.toLowerCase() === 'male' ? 175 : 162);
  const userAge = age || 35;
  const isMale = sex?.toLowerCase() === 'male';
  
  // Mifflin-St Jeor equation: BMR = 10*weight + 6.25*height - 5*age + sex_factor
  let bmr = isMale
    ? 10 * weight + 6.25 * height - 5 * userAge + 5
    : 10 * weight + 6.25 * height - 5 * userAge - 161;
  
  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extremely_active: 1.9,
  };
  
  const multiplier = activityMultipliers[activityLevel || 'moderately_active'] || 1.55;
  let tdee = Math.round(bmr * multiplier);
  
  let calorieTarget = tdee;
  let proteinMultiplier = 1.6;
  
  if (weightGoal.goalType === 'LOSE') {
    calorieTarget = Math.round(tdee * 0.8);
    proteinMultiplier = 2.0;
  } else if (weightGoal.goalType === 'GAIN') {
    calorieTarget = Math.round(tdee * 1.15);
    proteinMultiplier = 1.8;
  } else if (weightGoal.goalType === 'RECOMPOSITION') {
    proteinMultiplier = 2.2;
  }
  
  const proteinTargetG = Math.round(weight * proteinMultiplier);
  const proteinCalories = proteinTargetG * 4;
  const fatCalories = Math.round(calorieTarget * 0.25);
  const fatTargetG = Math.round(fatCalories / 9);
  const carbCalories = calorieTarget - proteinCalories - fatCalories;
  const carbTargetG = Math.round(carbCalories / 4);
  const fiberTargetG = isMale ? 38 : 25;
  
  return {
    calorieTarget,
    proteinTargetG,
    carbTargetG,
    fatTargetG,
    fiberTargetG,
  };
}

/**
 * Generate actionable message for nutrition gap
 */
function generateGapMessage(
  metric: string,
  gapValue: number,
  goalType: string | null
): string {
  const absGap = Math.abs(gapValue);
  
  if (metric === 'protein') {
    if (absGap < 10) {
      return `You're almost there! Just ${absGap}g more protein to hit your target.`;
    } else if (absGap < 25) {
      return `Consider adding ${absGap}g protein at dinner (e.g., chicken breast, Greek yogurt, or eggs)${goalType === 'GAIN' ? ' to support your lean mass gain goal' : ''}.`;
    } else {
      return `You're ${absGap}g short on protein today. A protein shake or substantial protein source at dinner would help${goalType === 'GAIN' ? ' achieve your weight gain goal' : ''}.`;
    }
  }
  
  if (metric === 'calories') {
    if (goalType === 'GAIN' && gapValue > 0) {
      if (absGap < 200) {
        return `You're ${absGap} kcal under target. A small snack would help meet your weight gain goal.`;
      } else {
        return `You need ${absGap} more kcal today. Consider a nutrient-dense meal or snack to support your weight gain goal.`;
      }
    } else if (goalType === 'LOSE' && gapValue < 0) {
      return `Great progress! You're ${Math.abs(gapValue)} kcal under budget, supporting your weight loss goal.`;
    }
    return `You're ${absGap} kcal ${gapValue > 0 ? 'under' : 'over'} target for today.`;
  }
  
  if (metric === 'fiber') {
    return `You need ${absGap}g more fiber. Add vegetables, legumes, or whole grains to your next meal.`;
  }
  
  return `You're ${absGap}${metric === 'fat' || metric === 'carbs' ? 'g' : ''} ${gapValue > 0 ? 'under' : 'over'} your ${metric} target.`;
}

/**
 * Fetch today's nutrition from Supabase
 */
async function fetchTodayNutrition(userId: string): Promise<TodayNutrition> {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  try {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return {
        caloriesConsumed: 0,
        proteinConsumedG: 0,
        carbsConsumedG: 0,
        fatConsumedG: 0,
        fiberConsumedG: 0,
        mealsLogged: 0,
        lastMealTime: null,
      };
    }
    
    const { data: nutritionData, error } = await supabase
      .from('nutrition_daily_metrics')
      .select('*')
      .eq('health_id', healthId)
      .eq('local_date', today)
      .maybeSingle();
    
    if (error || !nutritionData) {
      logger.debug(`[GoalContext] No nutrition data for today (${today})`);
      return {
        caloriesConsumed: 0,
        proteinConsumedG: 0,
        carbsConsumedG: 0,
        fatConsumedG: 0,
        fiberConsumedG: 0,
        mealsLogged: 0,
        lastMealTime: null,
      };
    }
    
    return {
      caloriesConsumed: nutritionData.total_calories || 0,
      proteinConsumedG: nutritionData.total_protein_g || 0,
      carbsConsumedG: nutritionData.total_carbs_g || 0,
      fatConsumedG: nutritionData.total_fat_g || 0,
      fiberConsumedG: nutritionData.total_fiber_g || 0,
      mealsLogged: nutritionData.meal_count || 0,
      lastMealTime: nutritionData.last_meal_time || null,
    };
  } catch (err) {
    logger.error('[GoalContext] Error fetching today nutrition:', err);
    return {
      caloriesConsumed: 0,
      proteinConsumedG: 0,
      carbsConsumedG: 0,
      fatConsumedG: 0,
      fiberConsumedG: 0,
      mealsLogged: 0,
      lastMealTime: null,
    };
  }
}

/**
 * Calculate nutrition gaps with actionable priorities
 */
function calculateNutritionGaps(
  targets: NutritionTargets,
  consumed: TodayNutrition,
  goalType: string | null,
  hourOfDay: number
): NutritionGap[] {
  const gaps: NutritionGap[] = [];
  
  const timeProgress = Math.min(hourOfDay / 20, 1);
  
  if (targets.proteinTargetG && hourOfDay >= 12) {
    const expectedProtein = Math.round(targets.proteinTargetG * timeProgress);
    const proteinGap = targets.proteinTargetG - consumed.proteinConsumedG;
    const behindSchedule = consumed.proteinConsumedG < expectedProtein * 0.8;
    
    if (proteinGap > 10 && behindSchedule) {
      gaps.push({
        metric: 'protein',
        targetValue: targets.proteinTargetG,
        currentValue: consumed.proteinConsumedG,
        gapValue: proteinGap,
        gapPercent: Math.round((proteinGap / targets.proteinTargetG) * 100),
        priority: proteinGap > 40 ? 'high' : proteinGap > 20 ? 'medium' : 'low',
        actionableMessage: generateGapMessage('protein', proteinGap, goalType),
      });
    }
  }
  
  if (targets.calorieTarget && hourOfDay >= 14) {
    const expectedCalories = Math.round(targets.calorieTarget * timeProgress);
    const calorieGap = targets.calorieTarget - consumed.caloriesConsumed;
    
    if (goalType === 'GAIN' && consumed.caloriesConsumed < expectedCalories * 0.75) {
      gaps.push({
        metric: 'calories',
        targetValue: targets.calorieTarget,
        currentValue: consumed.caloriesConsumed,
        gapValue: calorieGap,
        gapPercent: Math.round((calorieGap / targets.calorieTarget) * 100),
        priority: calorieGap > 800 ? 'high' : calorieGap > 400 ? 'medium' : 'low',
        actionableMessage: generateGapMessage('calories', calorieGap, goalType),
      });
    }
  }
  
  if (targets.fiberTargetG && hourOfDay >= 17) {
    const fiberGap = targets.fiberTargetG - consumed.fiberConsumedG;
    if (fiberGap > 10) {
      gaps.push({
        metric: 'fiber',
        targetValue: targets.fiberTargetG,
        currentValue: consumed.fiberConsumedG,
        gapValue: fiberGap,
        gapPercent: Math.round((fiberGap / targets.fiberTargetG) * 100),
        priority: fiberGap > 20 ? 'medium' : 'low',
        actionableMessage: generateGapMessage('fiber', fiberGap, goalType),
      });
    }
  }
  
  return gaps.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Main function: Build complete goal context for a user
 */
export async function buildGoalContext(userId: string): Promise<GoalContext> {
  logger.info(`[GoalContext] Building goal context for user ${userId}`);
  
  const emptyContext: GoalContext = {
    weightGoal: {
      targetWeightKg: null,
      targetDate: null,
      goalType: null,
      startWeightKg: null,
      currentWeightKg: null,
      progressPercent: null,
      remainingKg: null,
      daysRemaining: null,
      weeklyRateKg: null,
    },
    nutritionTargets: {
      calorieTarget: null,
      proteinTargetG: null,
      carbTargetG: null,
      fatTargetG: null,
      fiberTargetG: null,
    },
    todayNutrition: {
      caloriesConsumed: 0,
      proteinConsumedG: 0,
      carbsConsumedG: 0,
      fatConsumedG: 0,
      fiberConsumedG: 0,
      mealsLogged: 0,
      lastMealTime: null,
    },
    nutritionGaps: [],
    activeExperiments: [],
    hasActiveGoals: false,
    goalSummary: 'No active goals set.',
  };
  
  try {
    const healthId = await getHealthId(userId);
    if (!healthId) {
      return emptyContext;
    }
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('ai_personalization, sex, activity_level, height_cm, birth_year')
      .eq('health_id', healthId)
      .maybeSingle();
    
    const aiPersonalization = profile?.ai_personalization as any || {};
    const weightGoalData = aiPersonalization?.weightGoal || {};
    
    // Calculate age from birth year
    let userAge: number | null = null;
    if (profile?.birth_year) {
      const currentYear = new Date().getFullYear();
      userAge = currentYear - profile.birth_year;
    }
    
    let currentWeightKg: number | null = null;
    try {
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, {
        startDate: subDays(new Date(), 30),
        limit: 30,
      });
      const weightMetric = recentMetrics.find((m: any) => m.weightKg);
      currentWeightKg = weightMetric?.weightKg || null;
    } catch (err) {
      logger.debug('[GoalContext] Could not fetch recent weight');
    }
    
    const weightGoal: WeightGoal = {
      targetWeightKg: weightGoalData.targetWeightKg || weightGoalData.target_weight_kg || null,
      targetDate: weightGoalData.targetDate || weightGoalData.target_date_local || null,
      goalType: weightGoalData.goalType || weightGoalData.goal_type || null,
      startWeightKg: weightGoalData.startWeightKg || weightGoalData.start_weight_kg || null,
      currentWeightKg,
      progressPercent: null,
      remainingKg: null,
      daysRemaining: null,
      weeklyRateKg: null,
    };
    
    if (weightGoal.targetWeightKg && weightGoal.startWeightKg && currentWeightKg) {
      const totalChange = Math.abs(weightGoal.targetWeightKg - weightGoal.startWeightKg);
      const currentChange = Math.abs(currentWeightKg - weightGoal.startWeightKg);
      weightGoal.progressPercent = totalChange > 0 ? Math.round((currentChange / totalChange) * 100) : 0;
      weightGoal.remainingKg = Math.abs(weightGoal.targetWeightKg - currentWeightKg);
    }
    
    if (weightGoal.targetDate) {
      const targetDate = new Date(weightGoal.targetDate);
      const today = new Date();
      const daysRemaining = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      weightGoal.daysRemaining = daysRemaining > 0 ? daysRemaining : 0;
      
      if (weightGoal.remainingKg && daysRemaining > 0) {
        weightGoal.weeklyRateKg = Math.round((weightGoal.remainingKg / daysRemaining) * 7 * 10) / 10;
      }
    }
    
    const nutritionTargets = calculateNutritionTargets(
      weightGoal,
      currentWeightKg,
      profile?.sex,
      profile?.activity_level,
      profile?.height_cm,
      userAge
    );
    
    const todayNutrition = await fetchTodayNutrition(userId);
    
    const hourOfDay = new Date().getHours();
    const nutritionGaps = calculateNutritionGaps(
      nutritionTargets,
      todayNutrition,
      weightGoal.goalType,
      hourOfDay
    );
    
    let activeExperiments: ActiveExperiment[] = [];
    try {
      const experiments = await n1ExperimentService.getUserExperiments(userId);
      const now = new Date();
      
      activeExperiments = experiments
        .filter(exp => exp.status === 'baseline' || exp.status === 'active')
        .map(exp => {
          const startDate = exp.experiment_start_date 
            ? new Date(exp.experiment_start_date) 
            : exp.created_at ? new Date(exp.created_at) : now;
          const dayNumber = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          return {
            id: exp.id,
            name: exp.product_name || exp.supplement_type_id || 'Unknown Experiment',
            type: 'supplement' as const,
            supplementType: exp.supplement_type_id || null,
            productName: exp.product_name || null,
            primaryIntent: exp.primary_intent || 'general_wellness',
            status: exp.status as 'baseline' | 'active',
            dayNumber,
            totalDays: exp.experiment_days || 30,
            dosageInfo: exp.dosage_amount && exp.dosage_unit 
              ? `${exp.dosage_amount} ${exp.dosage_unit}` 
              : null,
          };
        });
    } catch (err) {
      logger.debug('[GoalContext] Could not fetch experiments');
    }
    
    const hasActiveGoals = !!(weightGoal.targetWeightKg || activeExperiments.length > 0);
    
    const goalParts: string[] = [];
    if (weightGoal.goalType === 'GAIN') {
      goalParts.push(`Weight gain goal: ${weightGoal.targetWeightKg}kg by ${weightGoal.targetDate}`);
    } else if (weightGoal.goalType === 'LOSE') {
      goalParts.push(`Weight loss goal: ${weightGoal.targetWeightKg}kg by ${weightGoal.targetDate}`);
    } else if (weightGoal.goalType === 'RECOMPOSITION') {
      goalParts.push('Body recomposition goal (build muscle, reduce fat)');
    }
    
    for (const exp of activeExperiments) {
      goalParts.push(`${exp.name} experiment (${exp.status}, day ${exp.dayNumber}/${exp.totalDays}) for ${exp.primaryIntent}`);
    }
    
    const goalSummary = goalParts.length > 0 
      ? goalParts.join('; ') 
      : 'No active goals set.';
    
    logger.info(`[GoalContext] Built context - Goals: ${hasActiveGoals}, Gaps: ${nutritionGaps.length}, Experiments: ${activeExperiments.length}`);
    
    return {
      weightGoal,
      nutritionTargets,
      todayNutrition,
      nutritionGaps,
      activeExperiments,
      hasActiveGoals,
      goalSummary,
    };
  } catch (error) {
    logger.error('[GoalContext] Error building goal context:', error);
    return emptyContext;
  }
}

/**
 * Format goal context for AI prompt injection
 */
export function formatGoalContextForAI(context: GoalContext): string {
  if (!context.hasActiveGoals && context.nutritionGaps.length === 0) {
    return '';
  }
  
  const parts: string[] = [];
  
  if (context.weightGoal.goalType) {
    parts.push(`## Active Weight Goal
- Goal Type: ${context.weightGoal.goalType}
- Target: ${context.weightGoal.targetWeightKg}kg${context.weightGoal.targetDate ? ` by ${context.weightGoal.targetDate}` : ''}
- Current Weight: ${context.weightGoal.currentWeightKg || 'unknown'}kg
- Progress: ${context.weightGoal.progressPercent || 0}%
- Remaining: ${context.weightGoal.remainingKg || 0}kg
- Days Left: ${context.weightGoal.daysRemaining || 'unknown'}
- Required Weekly Rate: ${context.weightGoal.weeklyRateKg || 'unknown'}kg/week`);
  }
  
  if (context.nutritionTargets.calorieTarget) {
    parts.push(`## Daily Nutrition Targets (based on goal)
- Calories: ${context.nutritionTargets.calorieTarget} kcal
- Protein: ${context.nutritionTargets.proteinTargetG}g (${Math.round((context.nutritionTargets.proteinTargetG || 0) / (context.weightGoal.currentWeightKg || 70) * 10) / 10}g/kg)
- Carbs: ${context.nutritionTargets.carbTargetG}g
- Fat: ${context.nutritionTargets.fatTargetG}g
- Fiber: ${context.nutritionTargets.fiberTargetG}g`);
  }
  
  if (context.todayNutrition.mealsLogged > 0) {
    parts.push(`## Today's Intake (${context.todayNutrition.mealsLogged} meals logged)
- Calories: ${context.todayNutrition.caloriesConsumed} / ${context.nutritionTargets.calorieTarget || '?'} kcal
- Protein: ${context.todayNutrition.proteinConsumedG}g / ${context.nutritionTargets.proteinTargetG || '?'}g
- Carbs: ${context.todayNutrition.carbsConsumedG}g / ${context.nutritionTargets.carbTargetG || '?'}g
- Fat: ${context.todayNutrition.fatConsumedG}g / ${context.nutritionTargets.fatTargetG || '?'}g`);
  }
  
  if (context.nutritionGaps.length > 0) {
    const gapLines = context.nutritionGaps.map(gap => 
      `- ${gap.metric.toUpperCase()} (${gap.priority}): ${gap.actionableMessage}`
    );
    parts.push(`## Nutrition Gaps Detected
${gapLines.join('\n')}`);
  }
  
  if (context.activeExperiments.length > 0) {
    const expLines = context.activeExperiments.map(exp =>
      `- ${exp.name} (${exp.status}, day ${exp.dayNumber}/${exp.totalDays}): ${exp.primaryIntent}${exp.dosageInfo ? ` [${exp.dosageInfo}]` : ''}`
    );
    parts.push(`## Active N-of-1 Experiments
${expLines.join('\n')}
NOTE: When generating insights, consider how recommendations might affect these active experiments.`);
  }
  
  return parts.join('\n\n');
}
