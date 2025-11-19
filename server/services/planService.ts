import { PLANS, PlanId, Plan, PlanLimits, PlanFeatures } from '../config/plans';
import { db } from '../db';
import { users, subscriptions, billingCustomers } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../logger';

/**
 * Get user's current plan based on their role and subscription status
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      logger.warn(`[PlanService] User ${userId} not found, defaulting to FREE`);
      return PLANS.FREE;
    }

    // Map user role to plan (admins are automatically premium)
    const planId: PlanId = (user.role === 'premium' || user.role === 'admin') ? 'PREMIUM' : 'FREE';
    return PLANS[planId];
  } catch (error) {
    logger.error('[PlanService] Error getting user plan:', error);
    return PLANS.FREE; // Default to free on error
  }
}

/**
 * Check if user has access to a specific feature
 */
export async function hasFeatureAccess(
  userId: string,
  featureCheck: (features: PlanFeatures) => boolean
): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return featureCheck(plan.features);
}

/**
 * Check if user is within a specific limit
 */
export async function isWithinLimit(
  userId: string,
  limitCheck: (limits: PlanLimits) => number,
  currentUsage: number
): Promise<boolean> {
  const plan = await getUserPlan(userId);
  const maxAllowed = limitCheck(plan.limits);
  
  // -1 means unlimited
  if (maxAllowed === -1) {
    return true;
  }
  
  return currentUsage < maxAllowed;
}

/**
 * Get user's plan limits
 */
export async function getUserLimits(userId: string): Promise<PlanLimits> {
  const plan = await getUserPlan(userId);
  return plan.limits;
}

/**
 * Get user's plan features
 */
export async function getUserFeatures(userId: string): Promise<PlanFeatures> {
  const plan = await getUserPlan(userId);
  return plan.features;
}

/**
 * Check if user can upload more lab reports
 */
export async function canUploadMoreLabs(userId: string, currentLabCount: number): Promise<boolean> {
  return isWithinLimit(userId, (limits) => limits.maxLabReportsStored, currentLabCount);
}

/**
 * Check if user can view more biomarkers
 */
export async function canViewMoreBiomarkers(userId: string, currentBiomarkerCount: number): Promise<boolean> {
  return isWithinLimit(userId, (limits) => limits.maxVisibleBiomarkersPerUser, currentBiomarkerCount);
}

/**
 * Check if user can send Oracle messages
 */
export async function canSendOracleMessage(userId: string, todayMessageCount: number): Promise<boolean> {
  const hasAccess = await hasFeatureAccess(userId, (features) => features.oracle.allowOracleChat);
  if (!hasAccess) {
    return false;
  }
  
  return isWithinLimit(userId, (limits) => limits.maxDailyOracleMessages, todayMessageCount);
}

/**
 * Upgrade user to premium (call when subscription is successful)
 */
export async function upgradeUserToPremium(userId: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({ 
        role: 'premium',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    logger.info(`[PlanService] User ${userId} upgraded to PREMIUM`);
  } catch (error) {
    logger.error('[PlanService] Error upgrading user to premium:', error);
    throw error;
  }
}

/**
 * Downgrade user to free (call when subscription is cancelled)
 */
export async function downgradeUserToFree(userId: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({ 
        role: 'free',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    logger.info(`[PlanService] User ${userId} downgraded to FREE`);
  } catch (error) {
    logger.error('[PlanService] Error downgrading user to free:', error);
    throw error;
  }
}

/**
 * Get user's subscription status
 */
export async function getUserSubscriptionStatus(userId: string): Promise<{
  isPremium: boolean;
  hasActiveSubscription: boolean;
  subscription?: any;
}> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { isPremium: false, hasActiveSubscription: false };
    }

    // Check for active subscription
    const [customer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);

    if (!customer) {
      return { 
        isPremium: user.role === 'premium' || user.role === 'admin',
        hasActiveSubscription: false,
      };
    }

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return {
      isPremium: user.role === 'premium' || user.role === 'admin',
      hasActiveSubscription: subscription?.status === 'active',
      subscription,
    };
  } catch (error) {
    logger.error('[PlanService] Error getting subscription status:', error);
    return { isPremium: false, hasActiveSubscription: false };
  }
}
