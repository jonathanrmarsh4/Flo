import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { 
  canUploadMoreLabs,
  canViewMoreBiomarkers,
  canSendOracleMessage,
  hasFeatureAccess,
  getUserPlan,
} from '../services/planService';
import { db } from '../db';
import { biomarkerTestSessions, biomarkerMeasurements } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Middleware to check if user can upload lab reports
 */
export async function canUploadLab(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get current lab count
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(biomarkerTestSessions)
      .where(eq(biomarkerTestSessions.userId, userId));

    const currentLabCount = Number(result?.count || 0);

    const canUpload = await canUploadMoreLabs(userId, currentLabCount);
    
    if (!canUpload) {
      return res.status(403).json({
        error: 'Lab upload limit reached',
        paywallModal: 'upgrade_on_lab_upload_limit',
        currentCount: currentLabCount,
      });
    }

    next();
  } catch (error: any) {
    logger.error('[PlanEnforcement] canUploadLab error:', error);
    res.status(500).json({ error: 'Failed to check plan limits' });
  }
}

/**
 * Middleware to check if user can access Oracle chat
 */
export async function canAccessOracle(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hasAccess = await hasFeatureAccess(
      userId,
      (features) => features.oracle.allowOracleChat
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Oracle chat not available on your plan',
        paywallModal: 'upgrade_on_locked_oracle_tile',
      });
    }

    next();
  } catch (error: any) {
    logger.error('[PlanEnforcement] canAccessOracle error:', error);
    res.status(500).json({ error: 'Failed to check plan limits' });
  }
}

/**
 * Middleware to check daily Oracle message limit
 * Note: Message counting needs to be implemented if daily limits are enforced
 * For now, we just check feature access
 */
export async function canSendOracleMsg(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has Oracle access
    const hasAccess = await hasFeatureAccess(
      userId,
      (features) => features.oracle.allowOracleChat
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Oracle chat not available on your plan',
        paywallModal: 'upgrade_on_locked_oracle_tile',
      });
    }

    // TODO: Implement message counting if daily limits are enforced
    // For now, premium users have access with high limits

    next();
  } catch (error: any) {
    logger.error('[PlanEnforcement] canSendOracleMsg error:', error);
    res.status(500).json({ error: 'Failed to check plan limits' });
  }
}

/**
 * Middleware to check if user can access Insights
 */
export async function canAccessInsights(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hasAccess = await hasFeatureAccess(
      userId,
      (features) => features.insights.allowAiGeneratedInsightCards
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Insights not available on your plan',
        paywallModal: 'upgrade_on_locked_insights_tile',
      });
    }

    next();
  } catch (error: any) {
    logger.error('[PlanEnforcement] canAccessInsights error:', error);
    res.status(500).json({ error: 'Failed to check plan limits' });
  }
}

/**
 * Middleware to check if user can access Flomentum
 */
export async function canAccessFlomentum(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hasAccess = await hasFeatureAccess(
      userId,
      (features) => features.flomentum.allowFlomentumScoring
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Flōmentum not available on your plan',
        paywallModal: 'upgrade_on_locked_flomentum_tile',
      });
    }

    next();
  } catch (error: any) {
    logger.error('[PlanEnforcement] canAccessFlomentum error:', error);
    res.status(500).json({ error: 'Failed to check plan limits' });
  }
}

/**
 * Helper to filter biomarkers based on plan limits
 * Use this in GET endpoints that return biomarker lists
 */
export async function filterBiomarkersByPlan(
  userId: string,
  biomarkersList: any[]
): Promise<{ filtered: any[]; totalCount: number; isLimited: boolean; paywallModal?: string }> {
  const plan = await getUserPlan(userId);
  const maxVisible = plan.limits.maxVisibleBiomarkersPerUser;
  const totalCount = biomarkersList.length;

  // -1 means unlimited
  if (maxVisible === -1 || totalCount <= maxVisible) {
    return {
      filtered: biomarkersList,
      totalCount,
      isLimited: false,
    };
  }

  // Limit biomarkers
  return {
    filtered: biomarkersList.slice(0, maxVisible),
    totalCount,
    isLimited: true,
    paywallModal: 'upgrade_on_biomarker_display_limit',
  };
}
