import { Router, Request, Response } from "express";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { logger } from "../logger";
import {
  createRecoverySession,
  getRecoverySessions,
  getRecoverySessionsByType,
  getRecoverySessionsByDate,
  getRecoverySessionById,
  deleteRecoverySession,
  getRecoveryStats,
  getHealthId,
  type RecoverySession,
} from "../services/supabaseHealthStorage";
import {
  calculateSaunaSession,
  calculateIceBathSession,
  normalizeTemperatureToCelsius,
} from "../services/recoveryCalculator";
import { syncRecoverySessionToClickHouse } from "../services/clickhouseHealthSync";
import * as healthRouter from "../services/healthStorageRouter";

const router = Router();

// ==================== VALIDATION SCHEMAS ====================

const createSaunaSessionSchema = z.object({
  duration: z.number().min(1).max(120),
  temperature: z.number().optional().nullable(),
  temperatureUnit: z.enum(['F', 'C']).optional().nullable(),
  timing: z.enum(['post-workout', 'separate']).optional().nullable(),
  feeling: z.number().min(1).max(5).optional().nullable(),
  timestamp: z.string().optional(), // ISO date string
  timezone: z.string().optional(),
});

const createIceBathSessionSchema = z.object({
  durationMinutes: z.number().min(0).max(60),
  durationSeconds: z.number().min(0).max(59),
  temperature: z.number().optional().nullable(),
  temperatureUnit: z.enum(['F', 'C']).optional().nullable(),
  feeling: z.number().min(1).max(5).optional().nullable(),
  timestamp: z.string().optional(), // ISO date string
  timezone: z.string().optional(),
});

// ==================== HELPER FUNCTIONS ====================

function getUserTimezone(req: Request): string {
  return (req.body?.timezone as string) || (req.query?.timezone as string) || 'America/Los_Angeles';
}

function getLocalDate(timestamp: string | undefined, timezone: string): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  return date.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
}

// ==================== ROUTES ====================

/**
 * POST /api/recovery/sauna
 * Log a sauna session
 */
router.post('/sauna', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = createSaunaSessionSchema.safeParse(req.body);
    if (!validation.success) {
      const error = fromError(validation.error);
      return res.status(400).json({ error: error.message });
    }

    const { duration, temperature, temperatureUnit, timing, feeling, timestamp, timezone } = validation.data;
    const userTimezone = timezone || getUserTimezone(req);
    const sessionDate = getLocalDate(timestamp, userTimezone);

    // Get user's weight for calorie calculation
    let userWeightKg: number | null = null;
    try {
      const profile = await healthRouter.getProfile(user.id);
      if (profile?.weight) {
        userWeightKg = profile.weight_unit === 'lb' 
          ? profile.weight * 0.453592 
          : profile.weight;
      }
    } catch (e) {
      logger.debug('[Recovery] Could not fetch user weight, using default');
    }

    // Calculate recovery metrics
    const tempCelsius = normalizeTemperatureToCelsius(temperature, temperatureUnit);
    const calculations = calculateSaunaSession({
      durationMinutes: duration,
      temperatureCelsius: tempCelsius,
      userWeightKg,
    });

    // Create session record
    const session = await createRecoverySession(user.id, {
      session_type: 'sauna',
      session_date: sessionDate,
      timezone: userTimezone,
      duration_minutes: duration,
      duration_seconds: null,
      temperature: temperature ?? null,
      temperature_unit: temperatureUnit ?? null,
      timing: timing ?? 'separate',
      feeling: feeling ?? null,
      calories_burned: calculations.caloriesBurned,
      recovery_score: calculations.recoveryScore,
      benefit_tags: calculations.benefitTags,
      source: 'manual',
    });

    logger.info(`[Recovery] Created sauna session for user ${user.id}`, {
      duration,
      calories: calculations.caloriesBurned,
      recoveryScore: calculations.recoveryScore,
    });

    // Sync to ClickHouse for ML analytics (fire and forget)
    try {
      const healthId = await getHealthId(user.id);
      syncRecoverySessionToClickHouse(healthId, {
        sessionType: 'sauna',
        sessionDate: sessionDate,
        durationMinutes: duration,
        temperatureCelsius: tempCelsius ?? undefined,
        caloriesBurned: calculations.caloriesBurned,
        recoveryScore: calculations.recoveryScore,
        feeling: feeling ?? undefined,
      }).catch(err => logger.debug('[Recovery] ClickHouse sync error:', err));
    } catch (e) {
      logger.debug('[Recovery] Failed to get healthId for ClickHouse sync');
    }

    res.json({
      success: true,
      session,
      calculations,
    });
  } catch (error) {
    logger.error('[Recovery] Error creating sauna session:', error);
    res.status(500).json({ error: 'Failed to create sauna session' });
  }
});

/**
 * POST /api/recovery/icebath
 * Log an ice bath session
 */
router.post('/icebath', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = createIceBathSessionSchema.safeParse(req.body);
    if (!validation.success) {
      const error = fromError(validation.error);
      return res.status(400).json({ error: error.message });
    }

    const { durationMinutes, durationSeconds, temperature, temperatureUnit, feeling, timestamp, timezone } = validation.data;
    const userTimezone = timezone || getUserTimezone(req);
    const sessionDate = getLocalDate(timestamp, userTimezone);

    // Get user's weight for calorie calculation
    let userWeightKg: number | null = null;
    try {
      const profile = await healthRouter.getProfile(user.id);
      if (profile?.weight) {
        userWeightKg = profile.weight_unit === 'lb' 
          ? profile.weight * 0.453592 
          : profile.weight;
      }
    } catch (e) {
      logger.debug('[Recovery] Could not fetch user weight, using default');
    }

    // Calculate recovery metrics
    const calculations = calculateIceBathSession({
      durationMinutes,
      durationSeconds,
      userWeightKg,
    });

    // Create session record
    const session = await createRecoverySession(user.id, {
      session_type: 'icebath',
      session_date: sessionDate,
      timezone: userTimezone,
      duration_minutes: durationMinutes,
      duration_seconds: durationSeconds,
      temperature: temperature ?? null,
      temperature_unit: temperatureUnit ?? null,
      timing: null, // Not applicable for ice bath
      feeling: feeling ?? null,
      calories_burned: calculations.caloriesBurned,
      recovery_score: calculations.recoveryScore,
      benefit_tags: calculations.benefitTags,
      source: 'manual',
    });

    logger.info(`[Recovery] Created ice bath session for user ${user.id}`, {
      duration: `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`,
      calories: calculations.caloriesBurned,
      recoveryScore: calculations.recoveryScore,
    });

    // Sync to ClickHouse for ML analytics (fire and forget)
    try {
      const healthId = await getHealthId(user.id);
      syncRecoverySessionToClickHouse(healthId, {
        sessionType: 'icebath',
        sessionDate: sessionDate,
        durationMinutes: durationMinutes,
        durationSeconds: durationSeconds,
        caloriesBurned: calculations.caloriesBurned,
        recoveryScore: calculations.recoveryScore,
        feeling: feeling ?? undefined,
      }).catch(err => logger.debug('[Recovery] ClickHouse sync error:', err));
    } catch (e) {
      logger.debug('[Recovery] Failed to get healthId for ClickHouse sync');
    }

    res.json({
      success: true,
      session,
      calculations,
    });
  } catch (error) {
    logger.error('[Recovery] Error creating ice bath session:', error);
    res.status(500).json({ error: 'Failed to create ice bath session' });
  }
});

/**
 * GET /api/recovery/sessions
 * Get all recovery sessions for a user
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days as string) || 30;
    const type = req.query.type as 'sauna' | 'icebath' | undefined;

    let sessions: RecoverySession[];
    if (type) {
      sessions = await getRecoverySessionsByType(user.id, type, days);
    } else {
      sessions = await getRecoverySessions(user.id, days);
    }

    res.json({ sessions });
  } catch (error) {
    logger.error('[Recovery] Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch recovery sessions' });
  }
});

/**
 * GET /api/recovery/sessions/:date
 * Get recovery sessions for a specific date
 */
router.get('/sessions/:date', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const sessions = await getRecoverySessionsByDate(user.id, date);
    res.json({ sessions });
  } catch (error) {
    logger.error('[Recovery] Error fetching sessions by date:', error);
    res.status(500).json({ error: 'Failed to fetch recovery sessions' });
  }
});

/**
 * GET /api/recovery/stats
 * Get aggregated recovery statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days as string) || 30;
    const stats = await getRecoveryStats(user.id, days);

    res.json({ stats });
  } catch (error) {
    logger.error('[Recovery] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch recovery stats' });
  }
});

/**
 * DELETE /api/recovery/sessions/:id
 * Delete a recovery session
 */
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    
    // Verify session exists and belongs to user
    const session = await getRecoverySessionById(user.id, id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const deleted = await deleteRecoverySession(user.id, id);
    if (!deleted) {
      return res.status(500).json({ error: 'Failed to delete session' });
    }

    logger.info(`[Recovery] Deleted session ${id} for user ${user.id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[Recovery] Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete recovery session' });
  }
});

export default router;
